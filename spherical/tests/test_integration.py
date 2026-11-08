"""Both integration methods must preserve the opposite wall and archive revision."""
from http.client import HTTPConnection
import json

import numpy as np
import pytest

from geometry import motif_at
from layers import LayerStore
from test_geometry import engine, placement
from test_server import server


@pytest.mark.parametrize('method', ['inside', 'outside'])
@pytest.mark.parametrize('darkness', [0., 1.])
def test_selected_surface_moves_and_other_surface_is_exact(engine, method, darkness):
    p = placement(strength=1)
    motif = np.ones((16, 16, 2))
    motif[..., 0] = darkness
    result = engine.calculate(motif, p, method)
    covered = motif_at(engine.directions, engine.radius, motif, p)[:, 1] > 0
    editable = engine.editable if method == 'inside' else engine.editable_outer
    np.testing.assert_array_equal(result.points[~(covered & editable)], engine.points[~(covered & editable)])
    assert result.stats['edited_vertices'] > 0
    assert result.stats['exportable'], result.stats
    assert result.stats['min_mm'] >= p.min_mm - .015
    assert result.stats['max_mm'] <= p.max_mm + .015
    delta = np.linalg.norm(result.points-engine.center, axis=1)-engine.radii
    moving = np.abs(delta) > 1e-4
    expected = (1 if method == 'outside' else -1) * (1 if darkness else -1)
    assert np.all(delta[moving] * expected > 0)


@pytest.mark.parametrize('method', ['inside', 'outside'])
@pytest.mark.parametrize('empty', ['alpha', 'strength', 'layers'])
def test_noop_preserves_out_of_bounds_source(engine, method, empty):
    p = placement(strength=0 if empty == 'strength' else 1, min_mm=.1, max_mm=.5)
    motif = np.zeros((8, 8, 2)) if empty == 'alpha' else np.ones((8, 8, 2))
    result = engine.calculate_layers([] if empty == 'layers' else [(motif, p)], p, method)
    np.testing.assert_array_equal(result.points, engine.points)
    assert result.stats['exportable']


def test_unknown_method_rejected(engine):
    with pytest.raises(ValueError, match='metoda integrace'):
        engine.calculate_layers([], placement(), 'sideways')


def test_front_infeasible_limits_block_export(engine, tmp_path):
    result = engine.calculate(np.ones((8, 8, 2)), placement(min_mm=.5, max_mm=.55), 'outside')
    assert not result.stats['exportable']
    with pytest.raises(ValueError, match='Export blokován'):
        engine.write(tmp_path/'invalid.stl', result)


def test_http_method_roundtrip_and_result_revision(server, engine, monkeypatch):
    import server as module
    state = server.state
    state.engine, state.source_bytes = engine, b'fixture source'
    monkeypatch.setattr(module, 'Engine', lambda path: engine)

    def post(path, data, status=200):
        connection = HTTPConnection('127.0.0.1', server.server_port)
        connection.request('POST', path, body=data if isinstance(data, bytes) else json.dumps(data))
        response = connection.getresponse()
        body, included = response.read(), response.getheader('X-Luna-Result-Included')
        connection.close()
        assert response.status == status, body
        return body, included

    composition = {'layers': [], 'min_mm': .7, 'max_mm': 3, 'integration_method': 'outside'}
    raw, _ = post('/api/apply', composition)
    token = json.loads(raw)['result_id']
    raw, included = post('/api/project-save', {**composition, 'result_id': token})
    assert included == 'true'
    _, _, manifest = LayerStore.read(raw)
    assert manifest['integration_method'] == 'outside'
    restored, _ = post('/api/project-open', raw)
    assert json.loads(restored)['integration_method'] == 'outside'
    raw, _ = post('/api/apply', composition)
    token = json.loads(raw)['result_id']
    _, included = post('/api/project-save', {**composition, 'integration_method': 'inside', 'result_id': token})
    assert included == 'false'
    post('/api/preview-layers', {**composition, 'integration_method': 'sideways'}, 400)
    assert state.integration_method == 'outside'
    # Old archives with no method always restore the existing inside behavior.
    legacy = state.store.save(state.source_bytes, {'layers': [], 'min_mm': .7, 'max_mm': 3})
    restored, _ = post('/api/project-open', legacy)
    assert json.loads(restored)['integration_method'] == 'inside'
    raw, _ = post('/api/apply', composition)
    token = json.loads(raw)['result_id']
    post('/api/preview-layers', {**composition, 'integration_method': 'inside'})
    post('/api/export', {'result_id': token}, 400)
