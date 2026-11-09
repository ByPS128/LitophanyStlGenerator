from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from threading import Thread

import pytest
from server import Handler, State


@pytest.fixture
def server():
    state = State()
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.state = state
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()
    state.pool.shutdown()
    state.workspace.cleanup()
    thread.join()


def test_local_api_info(server):
    connection = HTTPConnection('127.0.0.1', server.server_port)
    connection.request('GET','/api/info')
    response = connection.getresponse()
    assert response.status == 200
    assert json.loads(response.read())['model'] is None
    connection.close()


def test_cross_origin_rejected(server):
    connection = HTTPConnection('127.0.0.1', server.server_port)
    connection.request('POST','/api/demo',body='{}',headers={'Origin':'https://example.com'})
    response = connection.getresponse()
    assert response.status == 403
    response.read()
    connection.close()


def test_export_requires_verified_revision():
    state = State()
    try:
        with pytest.raises(ValueError, match='ověř'):
            state.require_result('stale')
    finally:
        state.pool.shutdown()
        state.workspace.cleanup()


def test_image_import_replace_and_empty_archive_over_http(server, monkeypatch):
    from copy import deepcopy
    from io import BytesIO
    from types import SimpleNamespace
    from PIL import Image
    import numpy as np
    from layers import LayerStore
    import server as module

    state = server.state
    state.engine = SimpleNamespace(radius=100, wall=np.array([1.]), shell=np.array([1.]), info=lambda name: {'name':name})
    state.source_bytes = b'model bytes'
    image = BytesIO()
    Image.new('RGBA',(8,8),'white').save(image,format='PNG')
    raw = image.getvalue()
    monkeypatch.setattr(module,'download_image',lambda url: (raw,'remote.png'))
    def post(path, data, headers=None):
        connection = HTTPConnection('127.0.0.1',server.server_port)
        connection.request('POST',path,body=data,headers=headers or {})
        response=connection.getresponse()
        body=response.read()
        connection.close()
        assert response.status==200,body
        return body
    first=json.loads(post('/api/motif',raw,{'X-File-Name':'first.png'}))['layers'][0]
    duplicate=deepcopy(first)
    duplicate['id']='duplicate'
    composition={'layers':[first,duplicate],'min_mm':.7,'max_mm':3}
    post('/api/layers',json.dumps(composition))
    replaced=json.loads(post('/api/motif-url',json.dumps({'url':'https://example.com/image.png','layer_id':first['id']})))
    assert replaced['selected_layer_id']==first['id']
    assert len(replaced['layers'])==2
    assert replaced['layers'][0]['image_id']!=first['image_id']
    assert replaced['layers'][1]['image_id']==first['image_id']
    assert replaced['layers'][0]['placement']==replaced['layers'][1]['placement']
    post('/api/motif',raw,{'X-Layer-Id':first['id'],'X-File-Name':'replacement.png'})
    composition['layers']=[]
    archive=post('/api/project-save',json.dumps(composition))
    restored, model, _=LayerStore.read(archive)
    assert restored.layers==[] and model==b'model bytes'
