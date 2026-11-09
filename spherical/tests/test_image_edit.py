from io import BytesIO
import numpy as np
from PIL import Image
import pytest
from image_edit import process, settings
from layers import LayerStore
import zipfile


def source(pixels):
    stream=BytesIO();Image.fromarray(np.array([pixels],dtype=np.uint8),'RGBA').save(stream,format='PNG');return stream.getvalue()


def test_grayscale_methods_are_distinct_and_keep_alpha():
    raw=source([[255,0,0,128]])
    weighted=process(raw,{'method':'luminance'})
    average=process(raw,{'method':'average'})
    red=process(raw,{'method':'red'})
    assert weighted['tone'][0,0,0]>average['tone'][0,0,0]>red['tone'][0,0,0]
    assert weighted['tone'][0,0,1]==pytest.approx(128/255)


def test_background_color_removal_preserves_original_transparency():
    raw=source([[255,255,255,255],[0,0,0,128],[255,255,255,0]])
    result=process(raw,dict(background_enabled=True,background_color=[255,255,255],tolerance=.01,feather=0))
    np.testing.assert_allclose(result['tone'][0,:,1],[0,128/255,0])


def test_soft_background_edge_has_partial_alpha():
    result=process(source([[128,128,128,255]]),dict(background_enabled=True,background_color=[0,0,0],tolerance=.25,feather=.5))
    assert .45<result['tone'][0,0,1]<.55


def test_saved_png_is_exact_geometry_input():
    result=process(source([[70,90,140,200],[255,255,255,255]]),dict(contrast=1.7,gamma=1.4,invert=True))
    pixels=np.asarray(Image.open(BytesIO(result['png'])),dtype=float)/255
    np.testing.assert_allclose(result['tone'][...,0],(1-pixels[...,0])*pixels[...,3],atol=1e-7)
    np.testing.assert_allclose(result['tone'][...,1],pixels[...,3],atol=1e-7)
    assert sum(result['histogram'])==pytest.approx(pixels[...,3].sum())


def test_levels_and_gamma_change_midtone_without_touching_source():
    raw=source([[128,128,128,255]])
    original=bytes(raw)
    normal=process(raw);brighter=process(raw,{'gamma':2})
    assert brighter['tone'][0,0,0]<normal['tone'][0,0,0]
    assert raw==original


@pytest.mark.parametrize('config',[dict(black=.8,white=.2),dict(gamma=0),dict(contrast=float('nan')),dict(method='unknown')])
def test_invalid_adjustments_rejected(config):
    with pytest.raises(ValueError):settings(config)


def test_project_contains_original_processed_and_current_result():
    raw=source([[70,90,140,200]])
    store=LayerStore();layer=store.add(raw,'source.png');layer['image_settings']['invert']=True
    payload=dict(layers=store.layers,min_mm=.7,max_mm=3)
    archive_bytes=store.save(b'original STL',payload,b'verified STL')
    with zipfile.ZipFile(BytesIO(archive_bytes)) as archive:
        assert archive.read(f'sources/{layer["image_id"]}.png')==raw
        assert archive.read('result.stl')==b'verified STL'
        assert archive.read('processed/layer-0001.png')==store.processed(layer['image_id'],layer['image_settings'])['png']
    restored,model,manifest=LayerStore.read(archive_bytes)
    assert model==b'original STL'
    assert manifest['result_stl']=='result.stl'
    assert restored.layers[0]['image_settings']['invert']
