"""Non-destructive image adjustments shared by previews, projects and STL edits."""
from io import BytesIO
import numpy as np
from PIL import Image, ImageOps

DEFAULTS = dict(method='luminance',brightness=0.,contrast=1.,gamma=1.,black=0.,white=1.,invert=False,
                background_enabled=False,background_color=[0,0,0],tolerance=.08,feather=.05)


def settings(data=None):
    data={**DEFAULTS,**(data or {})}
    if data['method'] not in ('luminance','average','lightness','red','green','blue'):
        raise ValueError('Neznámá metoda převodu do šedi.')
    result={'method':data['method']}
    for key,low,high in [('brightness',-1,1),('contrast',.1,3),('gamma',.2,3),
                         ('black',0,.99),('white',.01,1),('tolerance',0,1),('feather',0,1)]:
        value=float(data[key])
        if not np.isfinite(value) or not low<=value<=high:
            raise ValueError(f'Neplatná úprava obrázku: {key}.')
        result[key]=value
    if result['black']>=result['white']:
        raise ValueError('Černý bod musí být menší než bílý bod.')
    for key in ['invert','background_enabled']:
        if not isinstance(data[key],bool):
            raise ValueError(f'Neplatný přepínač {key}.')
        result[key]=data[key]
    color=np.asarray(data['background_color'],dtype=float)
    if color.shape!=(3,) or not np.isfinite(color).all() or np.any((color<0)|(color>255)):
        raise ValueError('Neplatná barva pozadí.')
    result['background_color']=color.tolist()
    return result


def process(raw,data=None):
    config=settings(data)
    with Image.open(BytesIO(raw)) as source:
        image=ImageOps.exif_transpose(source).convert('RGBA')
        image.thumbnail((1600,1600),Image.Resampling.LANCZOS)
        rgba=np.asarray(image,dtype=np.float32)/255.
    rgb,alpha=rgba[...,:3],rgba[...,3].copy()
    method=config['method']
    if method=='luminance':
        gray=rgb@np.array([.2126,.7152,.0722],dtype=np.float32)
    elif method=='average':
        gray=rgb.mean(axis=-1)
    elif method=='lightness':
        gray=(rgb.max(axis=-1)+rgb.min(axis=-1))*.5
    else:
        gray=rgb[...,'rgb'.index({'red':'r','green':'g','blue':'b'}[method])]
    gray=np.clip((gray-config['black'])/(config['white']-config['black']),0,1)
    gray=np.clip((gray-.5)*config['contrast']+.5+config['brightness'],0,1)**(1/config['gamma'])
    if config['invert']:
        gray=1-gray
    if config['background_enabled']:
        distance=np.linalg.norm(rgb-np.asarray(config['background_color'])/255,axis=-1)/np.sqrt(3)
        if config['feather']>0:
            amount=np.clip((distance-config['tolerance'])/config['feather'],0,1)
            alpha*=amount*amount*(3-2*amount)
        else:
            alpha*=distance>config['tolerance']
    output=np.empty_like(rgba,dtype=np.uint8)
    output[...,:3]=np.rint(gray[...,None]*255).astype(np.uint8)
    output[...,3]=np.rint(alpha*255).astype(np.uint8)
    # Derive geometry from exactly the same quantized PNG that is saved.
    darkness=1-output[...,0].astype(np.float32)/255
    final_alpha=output[...,3].astype(np.float32)/255
    tone=np.stack([darkness*final_alpha,final_alpha],axis=-1)
    stream=BytesIO();Image.fromarray(output).save(stream,format='PNG')
    histogram=np.bincount(output[...,0].ravel(),weights=final_alpha.ravel(),minlength=256)
    original=BytesIO();image.save(original,format='PNG')
    return dict(png=stream.getvalue(),tone=tone,settings=config,histogram=histogram.tolist(),original_png=original.getvalue())
