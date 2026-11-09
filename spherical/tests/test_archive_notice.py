from http.client import HTTPConnection
from io import BytesIO
import json
from types import SimpleNamespace
import zipfile

from test_server import server  # shared HTTP fixture


def test_moon_archive_reports_actual_stl_inclusion(server):
    state=server.state
    state.engine=SimpleNamespace(radius=100,write=lambda path,result:path.write_bytes(b'verified STL'))
    state.source_bytes=b'original STL'
    state.result=SimpleNamespace(stats={'exportable':True})
    state.result_id='verified-revision'
    state.placement={'layers':[],'min_mm':.7,'max_mm':3,'integration_method':'inside'}
    for token,included in [('verified-revision',True),('outdated',False)]:
        connection=HTTPConnection('127.0.0.1',server.server_port)
        connection.request('POST','/api/project-save',body=json.dumps({**state.placement,'result_id':token}))
        response=connection.getresponse();raw=response.read()
        assert response.status==200
        assert response.getheader('X-Luna-Result-Included')==str(included).lower()
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            assert ('result.stl' in archive.namelist())==included
            assert json.loads(archive.read('project.json'))['result_stl']==('result.stl' if included else None)
        connection.close()
