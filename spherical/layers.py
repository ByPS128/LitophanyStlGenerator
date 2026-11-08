"""Layer metadata, source images and portable project archives."""
from io import BytesIO
import json
from pathlib import Path
import uuid
import zipfile

import numpy as np
from PIL import Image
from geometry import Placement, compose_tones
from image_edit import process, settings as image_settings


class LayerStore:
    def __init__(self):
        self.images = {}
        self.layers = []
        self.cache = {}

    def add(self, raw, name, radius=100):
        # Retain the exact source bytes. Only the derived image is resampled.
        processed=process(raw)
        motif=processed['tone']
        with Image.open(BytesIO(raw)) as image:
            extension={"JPEG":".jpg","PNG":".png","WEBP":".webp"}.get(image.format,'.image')
        image_id = uuid.uuid4().hex
        self.images[image_id] = {'raw':raw,'motif':motif,'name':name,'extension':extension}
        layer = dict(id=uuid.uuid4().hex,name=name,image_id=image_id,enabled=True,image_settings=processed['settings'],
                     placement=dict(anchor=[1,-1,.2],width_mm=round(radius),
                                    height_mm=round(radius*motif.shape[0]/motif.shape[1]),angle_deg=0,strength=.65))
        self.layers.append(layer)
        return layer

    def processed(self,image_id,config):
        config=image_settings(config)
        key=(image_id,json.dumps(config,sort_keys=True))
        if key not in self.cache:
            if len(self.cache)>=12:
                self.cache.pop(next(iter(self.cache)))
            self.cache[key]=process(self.images[image_id]['raw'],config)
        return self.cache[key]

    def replace(self, layer_id, raw, name):
        layer = next((item for item in self.layers if item['id'] == layer_id), None)
        if layer is None:
            raise ValueError('Vybraná vrstva již neexistuje.')
        # Validate independently before touching this store. Duplicates keep their source.
        replacement = LayerStore()
        added = replacement.add(raw, name)
        self.images.update(replacement.images)
        layer['image_id'] = added['image_id']
        return layer

    def parse(self, data, radius):
        minimum, maximum = float(data['min_mm']), float(data['max_mm'])
        common = Placement.read(dict(anchor=[1,0,0],width_mm=radius,height_mm=radius,angle_deg=0,
                                     strength=0,min_mm=minimum,max_mm=maximum),radius)
        layers = data.get('layers',[])
        if not isinstance(layers,list):
            raise ValueError('Vrstvy musí být seznam.')
        seen, parsed, clean = set(), [], []
        for layer in layers:
            if not isinstance(layer,dict) or not isinstance(layer.get('id'),str) or layer['id'] in seen:
                raise ValueError('Vrstva má neplatné nebo duplicitní ID.')
            seen.add(layer['id'])
            if layer.get('image_id') not in self.images:
                raise ValueError('Chybí zdrojový obrázek vrstvy. Otevři celý projekt nebo přidej PNG.')
            if not isinstance(layer.get('enabled'),bool) or not isinstance(layer.get('name'),str) or len(layer['name'])>250:
                raise ValueError('Neplatný název nebo viditelnost vrstvy.')
            p = Placement.read({**layer['placement'],'min_mm':minimum,'max_mm':maximum},radius)
            config=image_settings(layer.get('image_settings'))
            metadata = dict(id=layer['id'],name=layer['name'],image_id=layer['image_id'],enabled=layer['enabled'],
                            image_settings=config,placement=dict(anchor=p.anchor.tolist(),width_mm=p.width_mm,height_mm=p.height_mm,
                                           angle_deg=p.angle_deg,strength=p.strength))
            clean.append(metadata)
            if layer['enabled']:
                parsed.append((self.processed(layer['image_id'],config)['tone'],p))
        return parsed, common, clean

    def preview(self, layers, radius, width=1024):
        latitude = np.linspace(-np.pi/2,np.pi/2,width//2+1)
        longitude = np.linspace(-np.pi,np.pi,width,endpoint=False)
        longitude,latitude=np.meshgrid(longitude,latitude)
        directions=np.stack([np.cos(latitude)*np.cos(longitude),np.cos(latitude)*np.sin(longitude),np.sin(latitude)],axis=-1)
        tone=compose_tones(directions.reshape(-1,3),radius,layers).reshape(*latitude.shape,2)
        rgba=np.zeros((*latitude.shape,4),dtype=np.uint8)
        rgba[...,:2]=np.rint(np.clip(tone,0,1)*255).astype(np.uint8)
        rgba[...,3]=255
        # One repeated column gives continuous interpolation across the meridian.
        rgba=np.concatenate([rgba,rgba[:,:1]],axis=1)
        output=BytesIO()
        Image.fromarray(rgba).save(output,format='PNG',compress_level=1)
        return output.getvalue()

    def save(self, model_bytes, data, result_bytes=None):
        referenced={layer['image_id'] for layer in data['layers']}
        output=BytesIO()
        with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
            manifest={'version':2,**data,'images':{},'processed_images':{},'result_stl':None}
            archive.writestr('source.stl',model_bytes)
            for image_id in referenced:
                image=self.images[image_id]
                path=f'sources/{image_id}{image.get("extension",".image")}'
                archive.writestr(path,image['raw'])
                manifest['images'][image_id]={'path':path,'name':image['name']}
            for index,layer in enumerate(data['layers']):
                path=f'processed/layer-{index+1:04d}.png'
                archive.writestr(path,self.processed(layer['image_id'],layer.get('image_settings'))['png'])
                manifest['processed_images'][layer['id']]=path
            if result_bytes is not None:
                archive.writestr('result.stl',result_bytes)
                manifest['result_stl']='result.stl'
            archive.writestr('project.json',json.dumps(manifest,ensure_ascii=False))
        return output.getvalue()

    @classmethod
    def read(cls, raw):
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            files=archive.infolist()
            if sum(f.file_size for f in files)>400*1024**2 or len(files)>2000:
                raise ValueError('Projekt je příliš velký.')
            names=[f.filename for f in files]
            if len(names)!=len(set(names)):
                raise ValueError('Projekt obsahuje duplicitní soubory.')
            manifest_info=archive.getinfo('project.json')
            if manifest_info.file_size>1024**2:
                raise ValueError('Metadata projektu jsou příliš velká.')
            manifest=json.loads(archive.read('project.json'))
            if not isinstance(manifest,dict) or not isinstance(manifest.get('layers'),list):
                raise ValueError('Neplatná metadata projektu.')
            if manifest.get('version') not in (1,2):
                raise ValueError('Nepodporovaná verze projektu.')
            model=archive.read('source.stl')
            if len(model)>200*1024**2:
                raise ValueError('Model v projektu je příliš velký.')
            store=cls()
            for layer in manifest['layers']:
                if not isinstance(layer,dict):
                    raise ValueError('Neplatná metadata vrstvy.')
                image_id=layer['image_id']
                if not isinstance(image_id,str) or len(image_id)!=32 or any(c not in '0123456789abcdef' for c in image_id):
                    raise ValueError('Neplatný odkaz na obrázek.')
                if image_id not in store.images:
                    path=f'images/{image_id}.png' if manifest['version']==1 else manifest['images'][image_id]['path']
                    if not isinstance(path,str) or not path.startswith(('sources/','images/')):
                        raise ValueError('Neplatná cesta zdrojového obrázku.')
                    image=archive.read(path)
                    store.images[image_id]={'raw':image,'motif':process(image)['tone'],'name':layer['name'],'extension':Path(path).suffix}
            store.layers=manifest['layers']
        return store,model,manifest
