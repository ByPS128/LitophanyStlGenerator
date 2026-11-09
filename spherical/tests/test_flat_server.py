from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from io import BytesIO
import json
from threading import Thread
import zipfile

from PIL import Image
import pytest

from flat import FlatState, BRIDGE, plate_settings
from server import Handler, State


@pytest.fixture
def server():
    state=State();state.flat=FlatState(state.workspace.name)
    state.flat.plate=plate_settings(dict(width=20,height=10,border_mm=1,print_mode='Resin',resin_resolution=1,smoothing='None'))
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.state=state
    thread=Thread(target=server.serve_forever,daemon=True);thread.start()
    yield server
    server.shutdown();server.server_close();thread.join();state.pool.shutdown();state.workspace.cleanup()


def call(server,route,data=None,raw=None,headers=None):
    connection=HTTPConnection('127.0.0.1',server.server_port)
    body=raw if raw is not None else json.dumps(data).encode() if data is not None else None
    connection.request('POST' if body is not None else 'GET','/api/flat/'+route,body=body,headers=headers or {})
    response=connection.getresponse();result=response.status,dict(response.getheaders()),response.read();connection.close();return result


@pytest.mark.skipif(not BRIDGE.is_file(),reason='Build .NET adapter before HTTP integration tests.')
def test_flat_http_save_export_and_restore_contract(server):
    info=json.loads(call(server,'info')[2]);payload={'plate':info['plate'],'layers':info['layers']}
    # Before calculation the archive must truthfully report the missing result.
    status,headers,raw=call(server,'save',payload)
    assert status==200 and headers['X-Luna-Result-Included']=='false'
    with zipfile.ZipFile(BytesIO(raw)) as archive:
        assert 'result.stl' not in archive.namelist() and 'source.stl' not in archive.namelist()
    assert call(server,'export',{'result_id':'missing'})[0]==400
    image=BytesIO();Image.new('RGBA',(8,8),(100,100,100,255)).save(image,format='PNG')
    info=json.loads(call(server,'image',raw=image.getvalue(),headers={'X-File-Name':'test.png'})[2])
    payload={'plate':info['plate'],'layers':info['layers']}
    preview=json.loads(call(server,'preview',payload)[2]);assert len(preview['heights'])==len(preview['x'])*len(preview['y'])
    calculated=json.loads(call(server,'calculate',payload)[2]);token=calculated['result_id']
    exported=call(server,'export',{'result_id':token})[2]
    status,headers,raw=call(server,'save',{**payload,'result_id':token,'scene':{'brightness':2,'kelvin':4000,'attenuation':.5}})
    assert status==200 and headers['X-Luna-Result-Included']=='true'
    with zipfile.ZipFile(BytesIO(raw)) as archive:
        assert archive.read('result.stl')==exported
        manifest=json.loads(archive.read('project.json'))
        assert manifest['kind']=='flat' and manifest['scene']['brightness']==2
        assert archive.read(manifest['images'][info['layers'][0]['image_id']]['path'])==image.getvalue()
    # Changing a layer prevents a stale result from being silently bundled.
    payload['layers'][0]['placement']['strength']=.5
    _,headers,_=call(server,'save',{**payload,'result_id':token})
    assert headers['X-Luna-Result-Included']=='false'
    status,_,restored=call(server,'open',raw=raw)
    assert status==200
    assert json.loads(restored)['layers'][0]['placement']['strength']==1
    assert call(server,'export',{'result_id':token})[0]==400
    # Restoring a flat project does not touch the spherical state.
    assert server.state.engine is None


def test_flat_rejects_cross_origin_writes(server):
    assert call(server,'new',{},headers={'Origin':'https://example.com'})[0]==403
