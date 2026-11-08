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
