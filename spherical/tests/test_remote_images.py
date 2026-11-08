from io import BytesIO
import socket
import pytest
import remote_images as remote


@pytest.mark.parametrize('url', ['file:///c:/secret', 'https://user:pass@example.com/a.png', None, 'http://example.com/\n'])
def test_invalid_urls(url):
    with pytest.raises(ValueError):
        remote.public_target(url)


@pytest.mark.parametrize('address', ['127.0.0.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1'])
def test_private_addresses(monkeypatch, address):
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *a, **kw: [(2,1,6,'',(address,80))])
    with pytest.raises(ValueError, match='neveřejné'):
        remote.public_target('http://example.com/a.png')


def transport(monkeypatch, replies):
    calls = []
    monkeypatch.setattr(socket, 'getaddrinfo', lambda host,*a,**kw: [(2,1,6,'',('127.0.0.1' if host=='localhost' else '8.8.8.8',80))])
    class Socket:
        def settimeout(self, value): pass
    monkeypatch.setattr(socket, 'create_connection', lambda target,**kw: calls.append(target) or Socket())
    class Response(BytesIO):
        def __init__(self, status, headers, raw):
            super().__init__(raw)
            self.status, self.headers = status, headers
        def getheader(self, key): return self.headers.get(key)
    class Connection:
        def __init__(self, *a, **kw): pass
        def request(self, *a, **kw): pass
        def getresponse(self): return Response(*replies.pop(0))
        def close(self): pass
    monkeypatch.setattr(remote.http.client, 'HTTPConnection', Connection)
    return calls


def test_download_pins_address_and_follows_relative_redirect(monkeypatch):
    calls = transport(monkeypatch, [(302,{'Location':'/dragon.png'},b''),(200,{},b'picture')])
    assert remote.download_image('http://example.com/start') == (b'picture','dragon.png')
    assert calls == [('8.8.8.8',80)]*2


def test_redirect_cannot_reach_private_network(monkeypatch):
    calls = transport(monkeypatch, [(302,{'Location':'http://localhost/secret'},b'')])
    with pytest.raises(ValueError, match='neveřejné'):
        remote.download_image('http://example.com/start')
    assert len(calls) == 1


@pytest.mark.parametrize('headers', [{}, {'Content-Length':'999'}])
def test_size_limit_even_without_content_length(monkeypatch, headers):
    transport(monkeypatch, [(200,headers,b'too big')])
    monkeypatch.setattr(remote, 'MAX_BYTES', 3)
    with pytest.raises(ValueError, match='24 MB'):
        remote.download_image('http://example.com/large.png')
