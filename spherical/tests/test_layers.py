from copy import deepcopy
from io import BytesIO
import numpy as np
from PIL import Image
import pytest

from geometry import Placement, blend, compose_tones
from layers import LayerStore


def config(strength=1):
    return Placement.read(dict(anchor=[1,0,0],width_mm=100,height_mm=100,angle_deg=0,
                               strength=strength,min_mm=.7,max_mm=3),100)


def png(color=(255,255,255,255)):
    stream=BytesIO()
    Image.new('RGBA',(8,8),color).save(stream,format='PNG')
    return stream.getvalue()


def test_zero_layers_preserve_source():
    source=np.array([.1,2,5])
    tone=compose_tones(np.array([[1,0,0]]*3),100,[])
    np.testing.assert_array_equal(blend(source,tone,config()),source)


def test_opaque_top_layer_wins_and_order_matters():
    black=np.ones((8,8,2))
    white=black.copy();white[...,0]=0
    directions=np.array([[1.,0,0]])
    result=compose_tones(directions,100,[(black,config()),(white,config())])
    reverse=compose_tones(directions,100,[(white,config()),(black,config())])
    np.testing.assert_allclose(blend(np.array([2.]),result,config()),[.7])
    np.testing.assert_allclose(blend(np.array([2.]),reverse,config()),[3.])


def test_transparent_top_preserves_lower_layer():
    black=np.ones((8,8,2))
    result=compose_tones(np.array([[1.,0,0]]),100,[(black,config()),(np.zeros((8,8,2)),config())])
    np.testing.assert_array_equal(result,[[1.,1.]])


def test_partial_overlap_uses_premultiplied_alpha():
    black=np.ones((8,8,2));white=black.copy();white[...,0]=0
    result=compose_tones(np.array([[1.,0,0]]),100,[(black,config(.5)),(white,config(.5))])
    np.testing.assert_allclose(result,[[.25,.75]])


def test_portable_project_round_trip_keeps_order_sources_and_metadata():
    store=LayerStore()
    first=store.add(png(),'první.png')
    second=store.add(png((0,0,0,128)),'druhý.png')
    duplicate=deepcopy(first);duplicate['id']='duplicate';duplicate['name']='třetí drak';duplicate['enabled']=False
    duplicate['placement']['anchor']=[0,1,0]
    store.layers.append(duplicate)
    data=dict(layers=store.layers,min_mm=.7,max_mm=3,scene={},model_name='moon.stl')
    raw=store.save(b'local STL bytes',data)
    restored,stl,manifest=LayerStore.read(raw)
    assert stl==b'local STL bytes'
    assert manifest['layers']==data['layers']
    assert len(restored.images)==2
    assert restored.images[first['image_id']]['raw']==store.images[first['image_id']]['raw']
    parsed,_,clean=restored.parse(manifest,100)
    assert len(parsed)==2
    assert clean[-1]['name']=='třetí drak'


def test_unknown_source_and_duplicate_layer_ids_rejected():
    store=LayerStore();layer=store.add(png(),'one')
    data=dict(layers=[layer,layer],min_mm=.7,max_mm=3)
    with pytest.raises(ValueError,match='duplicitní'):
        store.parse(data,100)
    missing=deepcopy(layer);missing['image_id']='missing'
    with pytest.raises(ValueError,match='zdrojový'):
        store.parse(dict(data,layers=[missing]),100)


def test_preview_closes_longitude_seam():
    store=LayerStore();store.add(png(),'one')
    parsed,_,_=store.parse(dict(layers=store.layers,min_mm=.7,max_mm=3),100)
    image=np.asarray(Image.open(BytesIO(store.preview(parsed,100,width=64))))
    np.testing.assert_array_equal(image[:,0],image[:,-1])
