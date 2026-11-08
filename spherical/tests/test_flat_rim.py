from copy import deepcopy
from io import BytesIO
import numpy as np
from PIL import Image
import pytest

from flat import FlatState, BRIDGE, axes, compose, fit_placement, plate_settings
from layers import LayerStore
from test_flat import decode_stl, assert_closed_oriented


def test_legacy_projects_keep_old_high_rim_but_new_projects_start_thin():
    assert plate_settings({})['border_height_mm']==.6
    legacy=plate_settings({'width':100,'height':80,'max_mm':4.2})
    assert legacy['border_height_mm']==4.2
    assert legacy['allow_overflow'] is False


def test_overflow_preserves_transform_and_crops_image_before_smoothing(tmp_path):
    state=FlatState(tmp_path)
    p=plate_settings(dict(width=30,height=20,allow_overflow=True,border_mm=2,border_height_mm=.4))
    placement=dict(x_mm=10,y_mm=0,width_mm=100,height_mm=100,angle_deg=45,strength=1)
    assert fit_placement(placement,p)==placement
    stream=BytesIO();Image.new('RGBA',(8,8),(0,0,0,255)).save(stream,format='PNG')
    layer=state.store.add(stream.getvalue(),'black.png');layer['placement']=placement
    x,y=axes(p);gray=compose(state.store,[layer],p,x,y)
    protected=(x[None,:]<=2)|(x[None,:]>=28)|(y[:,None]<=2)|(y[:,None]>=18)
    assert np.all(gray[protected]==255)
    assert np.all(gray[~protected]==0)
    data={'kind':'flat','plate':p,'layers':[layer]}
    restored,_,manifest=LayerStore.read(state.store.save(None,data))
    parsed=state.parse(manifest,restored)
    assert parsed['plate']['allow_overflow'] is True
    assert parsed['plate']['border_height_mm']==.4
    assert parsed['layers'][0]['placement']==placement
    assert fit_placement(placement,{**p,'allow_overflow':False})['width_mm']<100


@pytest.mark.parametrize('value',[0,-1,float('nan'),21])
def test_reject_invalid_rim_height(value):
    with pytest.raises(ValueError):plate_settings({'border_height_mm':value})


@pytest.mark.skipif(not BRIDGE.is_file(),reason='Build .NET adapter first.')
@pytest.mark.parametrize('rim_height',[.3,5.0])
@pytest.mark.parametrize('smoothing',['None','GaussianBlur','MedianFilter','BilateralFilter'])
def test_real_stl_keeps_independent_rim_height_and_outer_dimensions(tmp_path,rim_height,smoothing):
    state=FlatState(tmp_path)
    p=plate_settings(dict(width=30,height=20,print_mode='Resin',resin_resolution=1,border_mm=2.3,
                         border_height_mm=rim_height,allow_overflow=True,smoothing=smoothing))
    stream=BytesIO();Image.new('RGBA',(8,8),(0,0,0,255)).save(stream,format='PNG')
    layer=state.store.add(stream.getvalue(),'black.png')
    layer['placement']=dict(x_mm=0,y_mm=0,width_mm=100,height_mm=100,angle_deg=45,strength=1)
    data=dict(plate=p,layers=[layer])
    preview=state.preview(deepcopy(data))
    px=np.array(preview['x']);py=np.array(preview['y']);ph=np.array(preview['heights']).reshape(len(py),len(px))
    protected=(px[None,:]<=2.30001)|(px[None,:]>=27.69999)|(py[:,None]<=2.30001)|(py[:,None]>=17.69999)
    np.testing.assert_allclose(ph[protected],rim_height)
    state.calculate(data)
    w,h=np.frombuffer(state.heights,dtype='<i4',count=2)
    values=np.frombuffer(state.heights,dtype='<f4',offset=8);x=values[:w];y=values[w:w+h];height=values[w+h:].reshape(h,w)
    protected=(x[None,:]<=2.30001)|(x[None,:]>=27.69999)|(y[:,None]<=2.30001)|(y[:,None]>=17.69999)
    np.testing.assert_allclose(height[protected],rim_height)
    assert height[~protected].min()>=p['min_mm']-1e-6
    assert height[~protected].max()<=p['max_mm']+1e-6
    assert height[h//2,w//2]>p['min_mm']
    triangles,_=decode_stl(state.result)
    np.testing.assert_allclose(triangles.min(axis=(0,1)),[0,0,0])
    np.testing.assert_allclose(triangles.max(axis=(0,1))[:2],[30,20])
    assert_closed_oriented(triangles)
