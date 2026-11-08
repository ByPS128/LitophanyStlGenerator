"""Planar layer composition and file-based access to the original .NET generator."""
from copy import deepcopy
from io import BytesIO
import json
import math
from pathlib import Path
import subprocess
import uuid

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
from image_edit import settings as image_settings
from layers import LayerStore
from project_config import defaults
from remote_images import download_image

BRIDGE = Path(__file__).resolve().parents[1]/'FlatLithophaneBridge/bin/Release/net8.0/FlatLithophaneBridge.dll'
DEFAULTS = dict(width=150, height=100, min_mm=.6, max_mm=3.6, border_enabled=True, border_mm=5, border_height_mm=.6, allow_overflow=False,
                print_mode='FDM', nozzle_mm=.4, pixel_ratio=.8, resin_resolution=3,
                smoothing='BilateralFilter', resample='Bicubic', sigma=2, threshold=.5,
                window=3, spatial=1, range=1)


def number(value, low, high, name):
    if isinstance(value, bool):
        raise ValueError(f'Neplatná hodnota {name}.')
    result = float(value)
    if not math.isfinite(result) or not low <= result <= high:
        raise ValueError(f'{name}: povolený rozsah {low}–{high}.')
    return result


def plate_settings(data):
    p = {key:data.get(key, value) for key,value in DEFAULTS.items()}
    # Archives from before adjustable rims used the plate maximum for rim height.
    if data and 'border_height_mm' not in data:
        p['border_height_mm']=data.get('max_mm',DEFAULTS['max_mm'])
    for key,lo,hi in [('width',10,1000),('height',10,1000),('min_mm',.1,10),('max_mm',.2,20),
                      ('border_mm',0,499),('border_height_mm',.1,20),('nozzle_mm',.1,2),('pixel_ratio',.5,1),('resin_resolution',1,20),
                      ('sigma',.1,10),('threshold',.1,2),('window',3,15),('spatial',.1,5),('range',.1,5)]:
        p[key] = number(p[key],lo,hi,key)
    for key in ('width','height','resin_resolution','window'):
        if p[key] != int(p[key]):
            raise ValueError(f'{key} musí být celé číslo.')
        p[key] = int(p[key])
    if p['window']%2 != 1 or p['min_mm'] >= p['max_mm']:
        raise ValueError('Neplatné meze tloušťky nebo sudé okno mediánu.')
    if type(p['border_enabled']) is not bool or type(p['allow_overflow']) is not bool:
        raise ValueError('Zapnutí okraje musí být ano/ne.')
    if p['border_enabled'] and 2*p['border_mm'] >= min(p['width'],p['height'])-1:
        raise ValueError('Okraj musí ponechat alespoň 1 mm obrazové plochy.')
    for key,allowed in [('print_mode',('FDM','Resin')),('smoothing',('None','GaussianBlur','MedianFilter','BilateralFilter')),
                        ('resample',('Bicubic','Bilinear'))]:
        if p[key] not in allowed:
            raise ValueError(f'Nepodporované nastavení {key}.')
    resolution = max(1,min(50,round(1/(p['nozzle_mm']*p['pixel_ratio'])))) if p['print_mode']=='FDM' else p['resin_resolution']
    if (p['width']*resolution+3)*(p['height']*resolution+3)>600_000:
        raise ValueError('Příliš jemná síť: sniž rozměry nebo rozlišení (nejvýše 600 000 vzorků).')
    return p


def border(p):
    return p['border_mm'] if p['border_enabled'] else 0


def fit_placement(data, p):
    result = {key:number(data[key],lo,hi,key) for key,lo,hi in
              [('x_mm',-10000,10000),('y_mm',-10000,10000),('width_mm',.1,10000),
               ('height_mm',.1,10000),('angle_deg',-180,180),('strength',0,1)]}
    if p['allow_overflow']:
        return result
    angle = math.radians(result['angle_deg'])
    c,s = abs(math.cos(angle)),abs(math.sin(angle))
    w,h = result['width_mm'],result['height_mm']
    available_x,available_y = p['width']-2*border(p),p['height']-2*border(p)
    scale=min(1,available_x/(c*w+s*h),available_y/(s*w+c*h))
    w,h=w*scale,h*scale
    half_x,half_y=(c*w+s*h)/2,(s*w+c*h)/2
    result.update(width_mm=w,height_mm=h,
                  x_mm=float(np.clip(result['x_mm'],-available_x/2+half_x,available_x/2-half_x)),
                  y_mm=float(np.clip(result['y_mm'],-available_y/2+half_y,available_y/2-half_y)))
    return result


def axes(p, preview=False):
    resolution = max(1,min(50,round(1/(p['nozzle_mm']*p['pixel_ratio'])))) if p['print_mode']=='FDM' else p['resin_resolution']
    if preview:
        resolution=min(resolution,260/max(p['width'],p['height']))
    def axis(extent):
        values=np.linspace(0,extent,max(2,round(extent*resolution)+1))
        if border(p)>0:
            values=np.append(values,[border(p),extent-border(p)])
        return np.unique(np.round(values,8))
    return axis(p['width']),axis(p['height'])


def compose(store, layers, p, x, y):
    xx,yy=np.meshgrid(x-p['width']/2,p['height']/2-y)
    darkness=np.zeros(xx.shape)
    for layer in layers:
        if not layer['enabled']:
            continue
        placement=layer['placement']
        image=store.processed(layer['image_id'],layer['image_settings'])['tone']
        radians=math.radians(placement['angle_deg']);c,s=math.cos(radians),math.sin(radians)
        dx,dy=xx-placement['x_mm'],yy-placement['y_mm']
        u=(c*dx+s*dy)/placement['width_mm']+.5
        v=.5-(-s*dx+c*dy)/placement['height_mm']
        inside=(u>=0)&(u<=1)&(v>=0)&(v<=1)
        coordinates=[v*(image.shape[0]-1),u*(image.shape[1]-1)]
        tone=map_coordinates(image[...,0],coordinates,order=1,mode='nearest')*inside*placement['strength']
        alpha=map_coordinates(image[...,1],coordinates,order=1,mode='nearest')*inside*placement['strength']
        darkness=darkness*(1-alpha)+tone
    # Clip before filtering as well as protecting the final rim after filtering.
    b=border(p)
    if b>0:
        darkness[(x[None,:]<=b)|(x[None,:]>=p['width']-b)|(y[:,None]<=b)|(y[:,None]>=p['height']-b)]=0
    # Quantize once: preview and .NET consume the identical luminance values.
    gray=np.rint((1-np.clip(darkness,0,1))*255).astype(np.uint8)
    return gray


def lighting(data):
    result = {'brightness':number(data.get('brightness',1),0,5,'jas'),
              'kelvin':number(data.get('kelvin',3000),2200,7500,'teplota'),
              'attenuation':number(data.get('attenuation',.78),.05,5,'útlum')}
    for key in ('camera','target'):
        if key in data:
            if not isinstance(data[key],list) or len(data[key])!=3:
                raise ValueError('Neplatná poloha kamery.')
            result[key]=[number(v,-100000,100000,key) for v in data[key]]
    if 'camera' in result and np.linalg.norm(np.array(result['camera'])-np.array(result.get('target',[0,0,0])))<1:
        raise ValueError('Kamera musí být mimo svůj cílový bod.')
    mode=number(data.get('mode',1),0,2,'režim náhledu')
    if mode!=int(mode):
        raise ValueError('Neplatný režim náhledu.')
    result['mode']=int(mode)
    return result


class FlatState:
    def __init__(self, workspace):
        self.workspace=Path(workspace)/'flat'
        self.workspace.mkdir(exist_ok=True)
        self.store=LayerStore()
        self.plate=plate_settings({})
        self.scene=lighting({})
        self.result_id=None
        self.result=None
        self.revision=None

    def info(self):
        return dict(kind='flat',plate=self.plate,layers=self.store.layers,scene=self.scene,
                    bridge_available=BRIDGE.is_file())

    def new(self):
        demo=defaults()['demo_image']
        store=LayerStore()
        if demo.is_file():
            store.add(demo.read_bytes(),demo.name)
        self.store=store
        self.plate=plate_settings({})
        self.scene=lighting({})
        for layer in self.store.layers:
            self.place_new(layer)
        self.invalidate()

    def place_new(self,layer):
        image=self.store.images[layer['image_id']]['motif']
        layer['placement']=fit_placement(dict(x_mm=0,y_mm=0,width_mm=self.plate['width']-2*border(self.plate),
              height_mm=(self.plate['width']-2*border(self.plate))*image.shape[0]/image.shape[1],angle_deg=0,strength=1),self.plate)

    def invalidate(self):
        self.result_id=self.result=self.revision=None

    def parse(self,data,store=None):
        store=store or self.store
        p=plate_settings(data['plate'])
        if not isinstance(data['layers'],list):
            raise ValueError('Vrstvy musí být seznam.')
        clean=[];seen=set()
        for layer in data['layers']:
            if not isinstance(layer,dict) or not isinstance(layer.get('id'),str) or not layer['id'] or layer['id'] in seen:
                raise ValueError('Neplatné nebo duplicitní ID vrstvy.')
            seen.add(layer['id'])
            if layer.get('image_id') not in store.images or not isinstance(layer.get('name'),str) or len(layer['name'])>250 or type(layer.get('enabled')) is not bool:
                raise ValueError('Vrstva má neplatný zdroj, název nebo viditelnost.')
            clean.append(dict(id=layer['id'],image_id=layer['image_id'],name=layer['name'],enabled=layer['enabled'],
                              placement=fit_placement(layer['placement'],p),image_settings=image_settings(layer.get('image_settings'))))
        return dict(plate=p,layers=clean)

    def accept(self,data):
        composition=self.parse(data)
        if composition != self.revision:
            self.invalidate()
        self.plate,self.store.layers=composition['plate'],composition['layers']
        return composition

    def preview(self,data):
        self.accept(data)
        x,y=axes(self.plate,True)
        gray=compose(self.store,self.store.layers,self.plate,x,y)
        heights=self.plate['min_mm']+(1-gray/255)*(self.plate['max_mm']-self.plate['min_mm'])
        b=border(self.plate)
        if b>0:
            protected=(x[None,:]<=b)|(x[None,:]>=self.plate['width']-b)|(y[:,None]<=b)|(y[:,None]>=self.plate['height']-b)
            heights[protected]=self.plate['border_height_mm']
        return {**self.info(),'x':x.tolist(),'y':y.tolist(),'heights':heights.ravel().tolist()}

    def calculate(self,data):
        composition=self.accept(data)
        if not BRIDGE.is_file():
            raise ValueError('Chybí .NET adaptér. Spusť Start-Luna.ps1 nebo dotnet build FlatLithophaneBridge -c Release.')
        p=self.plate;x,y=axes(p)
        gray=compose(self.store,self.store.layers,p,x,y)
        directory=self.workspace/uuid.uuid4().hex
        directory.mkdir()
        image=directory/'composite.png'
        Image.fromarray(gray).save(image)
        request=dict(Image=str(image),Width=p['width'],Height=p['height'],Minimum=p['min_mm'],Maximum=p['max_mm'],
                     Border=border(p),BorderHeight=p['border_height_mm'],X=x.tolist(),Y=y.tolist(),Smoothing=p['smoothing'],Resample=p['resample'],
                     Sigma=p['sigma'],Threshold=p['threshold'],Window=p['window'],Spatial=p['spatial'],Range=p['range'])
        path=directory/'request.json'
        path.write_text(json.dumps(request),encoding='utf-8')
        try:
            completed=subprocess.run(['dotnet',str(BRIDGE),str(path),str(directory)],capture_output=True,timeout=180,
                                     creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        except subprocess.TimeoutExpired as error:
            raise ValueError('Výpočet .NET překročil tři minuty; sniž rozlišení.') from error
        if completed.returncode:
            raise ValueError('Výpočet .NET selhal: '+completed.stderr.decode('utf-8',errors='replace')[-1500:])
        result=(directory/'result.stl').read_bytes()
        # The adapter owns topology; reject damaged output before assigning a new verified revision.
        triangles=int.from_bytes(result[80:84],'little')
        if not triangles or len(result)!=84+50*triangles:
            raise ValueError('Výpočet nevrátil úplné STL.')
        self.result,self.result_id,self.revision=result,uuid.uuid4().hex,deepcopy(composition)
        self.heights=(directory/'heights.bin').read_bytes()
        return dict(result_id=self.result_id,triangles=triangles,samples=len(x)*len(y),width=p['width'],height=p['height'])


def handle(handler):
    """Return True after serving a flat endpoint. Runs under the existing local-only lock."""
    if not handler.path.startswith('/api/flat/'):
        return False
    if not hasattr(handler.state,'flat'):
        handler.state.flat=FlatState(handler.state.workspace.name)
        handler.state.flat.new()
    state=handler.state.flat
    route=handler.path.removeprefix('/api/flat/')
    if handler.command=='GET':
        if route=='info':
            handler.json(state.info())
        elif route.startswith('source/'):
            handler.reply(state.store.processed(route.removeprefix('source/'),None)['original_png'],'image/png')
        else:
            handler.send_error(404)
        return True
    if route=='image':
        from urllib.parse import unquote
        raw=handler.body(24*1024**2)
        name=unquote(handler.headers.get('X-File-Name','image.png'))[:250]
        target=handler.headers.get('X-Layer-Id')
        layer=state.store.replace(target,raw,name) if target else state.store.add(raw,name)
        if not target:
            state.place_new(layer)
        state.invalidate()
        handler.json({**state.info(),'selected_layer_id':layer['id']})
        return True
    if route=='open':
        store,_,data=LayerStore.read(handler.body(300*1024**2))
        if data.get('kind')!='flat':
            raise ValueError('Tento projekt patří do editoru Měsíce, nikoli ploché litofánie.')
        clean=state.parse(data,store)
        scene=lighting(data.get('scene',{}))
        state.store,state.plate,state.scene=store,clean['plate'],scene
        state.store.layers=clean['layers'];state.invalidate()
        handler.json(state.info())
        return True
    data=json.loads(handler.body(2*1024**2))
    if route=='new':
        state.new();handler.json(state.info())
    elif route=='sync':
        state.accept(data);handler.json(state.info())
    elif route=='preview':
        handler.json(state.preview(data))
    elif route=='image-preview':
        handler.reply(state.store.processed(data['image_id'],data.get('image_settings'))['png'],'image/png')
    elif route=='url':
        raw,name=download_image(data.get('url'))
        target=data.get('layer_id')
        layer=state.store.replace(target,raw,name) if target else state.store.add(raw,name)
        if not target:
            state.place_new(layer)
        state.invalidate();handler.json({**state.info(),'selected_layer_id':layer['id']})
    elif route=='calculate':
        handler.json(state.calculate(data))
    elif route=='heights':
        if not state.result or data.get('result_id')!=state.result_id:
            raise ValueError('Nejdřív přepočítej aktuální model v .NET.')
        handler.reply(state.heights,'application/octet-stream')
    elif route=='export':
        if not state.result or data.get('result_id')!=state.result_id:
            raise ValueError('Nejdřív přepočítej aktuální model v .NET.')
        handler.reply(state.result,'model/stl')
    elif route=='save':
        composition=state.accept(data)
        state.scene=lighting(data.get('scene',{}))
        included=state.result is not None and data.get('result_id')==state.result_id and composition==state.revision
        payload=dict(kind='flat',**composition,scene=state.scene)
        handler.reply(state.store.save(None,payload,state.result if included else None),'application/zip',
                      headers={'X-Luna-Result-Included':'true' if included else 'false'})
    else:
        handler.send_error(404)
    return True
