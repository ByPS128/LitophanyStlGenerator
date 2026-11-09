from copy import deepcopy
from io import BytesIO
import json
from types import SimpleNamespace

from PIL import Image
import pytest

from layers import LayerStore
from project_config import defaults, write_runtime_descriptor
import server


def picture(color='red'):
    stream = BytesIO()
    Image.new('RGBA', (8, 4), color).save(stream, format='PNG')
    return stream.getvalue()


def test_runtime_link_tracks_the_started_port_and_replaces_old_value(tmp_path):
    write_runtime_descriptor(tmp_path, 8767)
    path=tmp_path/'runtime.json'
    assert json.loads(path.read_text())['flat_editor_url']=='http://127.0.0.1:8767/flat.html'
    write_runtime_descriptor(tmp_path, 9001)
    assert json.loads(path.read_text())['flat_editor_url']=='http://127.0.0.1:9001/flat.html'
    assert not (tmp_path/'runtime.json.tmp').exists()


def test_config_paths_are_relative_to_config(tmp_path):
    path = tmp_path / 'config.json'
    path.write_text(json.dumps({'default_stl':'models/moon.stl', 'demo_image':'images/other.png'}))
    assert defaults(path) == {'default_stl':tmp_path/'models/moon.stl', 'demo_image':tmp_path/'images/other.png'}


def test_replace_preserves_metadata_and_duplicate_source():
    store = LayerStore()
    layer = store.add(picture(), 'dragon.png')
    layer['image_settings']['gamma'] = 1.7
    duplicate = deepcopy(layer)
    duplicate['id'] = 'duplicate'
    store.layers.append(duplicate)
    before = deepcopy(layer)
    store.replace(layer['id'], picture('blue'), 'new.png')
    assert {**layer, 'image_id':before['image_id']} == before
    assert duplicate['image_id'] == before['image_id'] != layer['image_id']
    assert store.images[duplicate['image_id']]['raw'] == picture()
    assert store.images[layer['image_id']]['raw'] == picture('blue')
    count = len(store.images)
    with pytest.raises(OSError):
        store.replace(layer['id'], b'not an image', 'broken.png')
    assert len(store.images) == count
    with pytest.raises(ValueError):
        store.replace('missing', picture(), 'new.png')


def test_new_model_has_exactly_one_configured_layer_and_failure_is_atomic(tmp_path, monkeypatch):
    demo = tmp_path/'different.png'
    demo.write_bytes(picture())
    model = tmp_path/'moon.stl'
    model.write_bytes(b'model')
    monkeypatch.setattr(server, 'defaults', lambda: {'demo_image':demo})
    monkeypatch.setattr(server, 'Engine', lambda path: SimpleNamespace(radius=100))
    state = server.State()
    try:
        state.open(model, 'moon.stl')
        assert len(state.store.layers) == 1
        assert state.store.layers[0]['name'] == 'different.png'
        state.open(model, 'moon.stl')
        assert len(state.store.layers) == 1
        previous = state.store
        demo.write_bytes(b'broken')
        with pytest.raises(OSError):
            state.open(model, 'moon.stl')
        assert state.store is previous
    finally:
        state.pool.shutdown()
        state.workspace.cleanup()


def test_empty_saved_project_does_not_gain_demo():
    store = LayerStore()
    raw = store.save(b'model', {'layers':[], 'min_mm':.7, 'max_mm':3})
    restored, _, _ = LayerStore.read(raw)
    assert restored.layers == []
    assert restored.images == {}
