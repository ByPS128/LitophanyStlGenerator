from copy import deepcopy
from io import BytesIO
import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
import pytest

from flat import FlatState, axes, border, compose, fit_placement, plate_settings, BRIDGE
from layers import LayerStore


def png(color):
    stream=BytesIO();Image.new('RGBA',(12,8),color).save(stream,format='PNG');return stream.getvalue()


def setup_state(tmp_path):
    state=FlatState(tmp_path)
    state.plate=plate_settings(dict(width=30,height=20,border_mm=2.3,print_mode='Resin',resin_resolution=1,smoothing='None'))
    return state


def add(state,color):
    layer=state.store.add(png(color),'image.png');state.place_new(layer);return layer


@pytest.mark.parametrize('angle',[-180,-91,-45,0,33,90,180])
def test_rotated_layer_is_entirely_inside_border(angle):
    p=plate_settings(dict(width=150,height=100,border_mm=7))
    placement=fit_placement(dict(x_mm=500,y_mm=-500,width_mm=200,height_mm=160,angle_deg=angle,strength=1),p)
    radians=math.radians(angle);c,s=math.cos(radians),math.sin(radians)
    for x in [-placement['width_mm']/2,placement['width_mm']/2]:
        for y in [-placement['height_mm']/2,placement['height_mm']/2]:
            assert abs(placement['x_mm']+c*x-s*y)<=68+1e-8
            assert abs(placement['y_mm']+s*x+c*y)<=43+1e-8


def test_alpha_and_order_on_flat_surface(tmp_path):
    state=setup_state(tmp_path)
    black=add(state,(0,0,0,255));white=add(state,(255,255,255,128))
    x=np.array([15.]);y=np.array([10.])
    result=compose(state.store,[black,white],state.plate,x,y)
    assert result[0,0]==128
    assert compose(state.store,[white,black],state.plate,x,y)[0,0]==0
    white['placement']['strength']=0
    assert compose(state.store,[black,white],state.plate,x,y)[0,0]==0
    transparent=add(state,(255,255,255,0))
    assert compose(state.store,[black,transparent],state.plate,x,y)[0,0]==0
    assert compose(state.store,[],state.plate,x,y)[0,0]==255


def test_grid_contains_exact_border_coordinates():
    p=plate_settings(dict(width=30,height=20,border_mm=2.3))
    for preview in [False,True]:
        x,y=axes(p,preview)
        assert 2.3 in x and 27.7 in x and 2.3 in y and 17.7 in y


@pytest.mark.parametrize('invalid',[{'border_mm':50},{'width':float('nan')},{'min_mm':4,'max_mm':3},
                                  {'window':4},{'smoothing':'unknown'},{'width':1000,'height':1000}])
def test_reject_invalid_or_excessive_plate(invalid):
    with pytest.raises(ValueError):plate_settings(invalid)


def decode_stl(raw):
    count=int.from_bytes(raw[80:84],'little')
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attribute','<u2')])
    records=np.frombuffer(raw,dtype=dtype,count=count,offset=84)
    return records['vertices'].astype(float),records['normal']


def assert_closed_oriented(triangles):
    vertices,indices=np.unique(triangles.reshape(-1,3),axis=0,return_inverse=True)
    faces=indices.reshape(-1,3)
    directed=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
    undirected=np.sort(directed,axis=1)
    _,counts=np.unique(undirected,axis=0,return_counts=True)
    assert np.all(counts==2)
    forward=np.unique(directed,axis=0)
    assert len(forward)==len(directed) # each edge appears once in each direction
    volume=np.sum(np.einsum('ij,ij->i',triangles[:,0],np.cross(triangles[:,1],triangles[:,2])))/6
    assert volume>0
    return volume


@pytest.mark.skipif(not BRIDGE.is_file(),reason='Build FlatLithophaneBridge -c Release before integration tests.')
@pytest.mark.parametrize('smoothing',['None','GaussianBlur','MedianFilter','BilateralFilter'])
def test_real_dotnet_dimensions_border_thickness_and_closed_mesh(tmp_path,smoothing):
    state=setup_state(tmp_path);state.plate['smoothing']=smoothing
    layer=add(state,(255,255,255,255))
    result=state.calculate(dict(plate=state.plate,layers=state.store.layers))
    assert result['result_id']==state.result_id
    triangles,normals=decode_stl(state.result)
    assert np.isfinite(triangles).all() and np.isfinite(normals).all()
    np.testing.assert_allclose(triangles.min(axis=(0,1)),[0,0,0])
    np.testing.assert_allclose(triangles.max(axis=(0,1)),[30,20,3.6],rtol=1e-6)
    assert_closed_oriented(triangles)
    grid=np.frombuffer(state.heights,dtype='<i4',count=2);w,h=grid
    values=np.frombuffer(state.heights,dtype='<f4',offset=8);x=values[:w];y=values[w:w+h];height=values[w+h:].reshape(h,w)
    protected=(x[None,:]<=2.30001)|(x[None,:]>=27.69999)|(y[:,None]<=2.30001)|(y[:,None]>=17.69999)
    np.testing.assert_allclose(height[protected],3.6)
    np.testing.assert_allclose(height[~protected],.6,atol=1e-6)
    assert height.min()>=.6-1e-6 and height.max()<=3.6+1e-6
    # Exact matching revision survives a save/preview; a layer edit invalidates it.
    payload=deepcopy(dict(plate=state.plate,layers=state.store.layers))
    state.accept(payload);assert state.result_id==result['result_id']
    payload['layers'][0]['placement']['strength']=.5
    state.accept(payload);assert state.result_id is None


@pytest.mark.skipif(not BRIDGE.is_file(),reason='Build .NET adapter first.')
def test_blank_unframed_plate_has_expected_solid_volume(tmp_path):
    state=setup_state(tmp_path);state.plate['border_enabled']=False
    state.calculate(dict(plate=state.plate,layers=[]))
    triangles,_=decode_stl(state.result)
    assert assert_closed_oriented(triangles)==pytest.approx(30*20*.6,rel=1e-6)


def test_flat_project_retains_sources_and_image_settings(tmp_path):
    state=setup_state(tmp_path);layer=add(state,(0,0,0,100));layer['image_settings']['gamma']=1.7
    data=dict(kind='flat',plate=state.plate,layers=state.store.layers,scene={'brightness':1,'kelvin':3000,'attenuation':.78})
    raw=state.store.save(b'',data)
    restored,source,manifest=LayerStore.read(raw)
    assert source==b'' and manifest['kind']=='flat'
    assert restored.images[layer['image_id']]['raw']==png((0,0,0,100))
    assert state.parse(manifest,restored)['layers'][0]['image_settings']['gamma']==1.7


@pytest.mark.skipif(not BRIDGE.is_file(),reason='Build .NET adapter first.')
def test_original_console_generator_still_runs(tmp_path):
    root=Path(__file__).resolve().parents[2]
    original=root/'LithophaneStlGenerator/bin/Release/net8.0/LithophaneStlGenerator.dll'
    source=tmp_path/'input.png';source.write_bytes(png((128,128,128,255)))
    template=json.loads((root/'LithophaneStlGenerator/Templates/fdm-0.4mm-BilateralFilter-ContinuousSurface.json').read_text())
    template.update(finalWidthMM=20,finalHeightMM=10,smoothingAlgorithm='None')
    template['fdmSettings']['nozzleDiameterMM']=1
    path=tmp_path/'template.json';path.write_text(json.dumps(template))
    output=tmp_path/'original';output.mkdir()
    completed=subprocess.run(['dotnet',str(original),str(source),str(path),str(output)],capture_output=True,timeout=30)
    assert completed.returncode==0,completed.stderr
    assert list(output.glob('*.stl'))
