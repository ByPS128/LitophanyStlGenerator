from http.client import HTTPConnection
import json

import numpy as np
import pytest
import vtk
from vtk.util.numpy_support import vtk_to_numpy

from sample import SampleSelection, cut_sample, check_closed
from test_geometry import engine, placement
from test_server import server


def selection(engine, **kwargs):
    return SampleSelection.read(dict(anchor=[1, 0, 0], angle_deg=0,
                                    left=-30, right=30, bottom=-25, top=25, **kwargs), engine.radius)


@pytest.mark.parametrize('anchor,angle', [([1, 0, 0], 0), ([0, 0, 1], 17), ([1, -2, .3], -51)])
@pytest.mark.parametrize('method', ['inside', 'outside'])
def test_sample_closed_and_stands_on_plane_preserving_surface(engine, tmp_path, anchor, angle, method):
    p = placement(anchor=anchor, angle_deg=angle, strength=1)
    result = engine.calculate(np.ones((16, 16, 2)), p, method)
    s = SampleSelection.read(dict(anchor=anchor, angle_deg=angle, left=-30, right=30, bottom=-25, top=25), engine.radius)
    before = result.points.copy()
    sample = cut_sample(engine, result, s)
    np.testing.assert_array_equal(result.points, before)
    check_closed(sample.points, sample.faces)
    assert sample.points[:, 2].min() == 0
    assert np.any(np.all(sample.points[sample.faces, 2] == 0, axis=1))
    np.testing.assert_allclose(np.ptp(sample.points, axis=0)[[0, 2]], [60, 50], atol=1e-5)
    right, up, front = s.frame()
    local = (before-engine.center)@np.column_stack([right, -front, up])
    keep = (abs(local[:, 0]) < 29) & (abs(local[:, 2]) < 24) & (local[:, 1] < 0)
    # Rigid translation cancels in pairwise distances. All uncut interior vertices survive.
    from scipy.spatial import cKDTree
    mapped = sample.points.copy()
    # Absolute Y centering recovered from the original deepest point (uncut near the anchor).
    local[:, 0] -= (s.left+s.right)/2
    local[:, 1] -= local[:, 1].min()-mapped[:, 1].min()
    local[:, 2] -= s.bottom
    assert cKDTree(mapped).query(local[keep])[0].max() < 1e-5
    path = tmp_path/'sample.stl'
    sample.write(path)
    reader = vtk.vtkSTLReader(); reader.SetFileName(str(path)); reader.Update()
    mesh = reader.GetOutput()
    check_closed(vtk_to_numpy(mesh.GetPoints().GetData()),
                 vtk_to_numpy(mesh.GetPolys().GetConnectivityArray()).reshape(-1, 3))


@pytest.mark.parametrize('change', [dict(left=30), dict(top=float('nan')), dict(anchor=[0,0,0]),
                                   dict(left=-90, top=90), dict(anchor=[1.7e308]*3)])
def test_invalid_selection(engine, change):
    data = dict(anchor=[1,0,0], angle_deg=0, left=-30, right=30, bottom=-25, top=25)
    with pytest.raises(ValueError):
        SampleSelection.read({**data, **change}, engine.radius)


def test_sample_http_revision_and_archive(server, engine, monkeypatch):
    import server as module
    from layers import LayerStore
    monkeypatch.setattr(module, 'Engine', lambda path: engine)
    state = server.state
    state.engine, state.source_bytes = engine, b'fixture'
    def post(path, data):
        connection = HTTPConnection('127.0.0.1', server.server_port)
        connection.request('POST', path, json.dumps(data))
        response = connection.getresponse(); body = response.read(); connection.close()
        return response.status, body
    s = selection(engine).json()
    assert post('/api/sample-prepare', {'selection': s})[0] == 400
    composition = dict(layers=[], min_mm=.7, max_mm=3)
    code, body = post('/api/apply', composition)
    assert code == 200
    token = json.loads(body)['result_id']
    code, body = post('/api/sample-prepare', dict(selection=s, result_id=token))
    assert code == 200, body
    sample_id = json.loads(body)['sample_id']
    assert post('/api/sample-export', dict(result_id=token, sample_id='old'))[0] == 400
    assert post('/api/sample-export', dict(result_id=token, sample_id=sample_id))[0] == 200
    code, archive = post('/api/project-save', {**composition, 'sample_selection':s})
    assert code == 200
    assert LayerStore.read(archive)[2]['sample_selection'] == s
    code, body = post('/api/apply', composition)
    new_token = json.loads(body)['result_id']
    assert new_token != token
    assert post('/api/sample-export', dict(result_id=new_token, sample_id=sample_id))[0] == 400
    post('/api/layers', composition)
    assert post('/api/sample-export', dict(result_id=token, sample_id=sample_id))[0] == 400
    connection = HTTPConnection('127.0.0.1', server.server_port)
    connection.request('POST','/api/project-open',archive)
    response=connection.getresponse(); body=response.read(); connection.close()
    assert response.status == 200, body
    assert json.loads(body)['sample_selection'] == s
