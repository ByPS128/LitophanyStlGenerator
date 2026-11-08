"""Bounded downloads from public HTTP(S), with pinned DNS resolution."""
import http.client
import ipaddress
import socket
import ssl
import time
from pathlib import PurePosixPath
from urllib.parse import urlsplit, urljoin, unquote

MAX_BYTES = 24 * 1024**2


def public_target(url):
    if not isinstance(url, str) or len(url) > 8192 or any(ord(c) < 32 for c in url):
        raise ValueError('Zadej platnou veřejnou URL obrázku.')
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username is not None or parsed.password is not None:
        raise ValueError('Použij veřejnou HTTP nebo HTTPS adresu bez přihlašovacích údajů.')
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('Načítání obrázků z místní nebo neveřejné sítě není podporováno.')
    return parsed, port, addresses[0][4][0]


def download_image(url):
    deadline = time.monotonic() + 25
    for _ in range(6):
        parsed, port, address = public_target(url)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError('Stahování obrázku překročilo časový limit.')
        connection = http.client.HTTPConnection(parsed.hostname, port, timeout=min(10, remaining))
        try:
            connection.sock = socket.create_connection((address, port), timeout=min(10, remaining))
            if parsed.scheme == 'https':
                connection.sock = ssl.create_default_context().wrap_socket(connection.sock, server_hostname=parsed.hostname)
            target = parsed.path or '/'
            if parsed.query:
                target += '?' + parsed.query
            connection.request('GET', target, headers={'User-Agent': 'Luna-Lithophane/1', 'Accept': 'image/*', 'Accept-Encoding': 'identity'})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location:
                    raise ValueError('Server neposlal cílovou adresu přesměrování.')
                url = urljoin(url, location)
                continue
            if response.status != 200:
                raise ValueError(f'Obrázek nelze stáhnout (HTTP {response.status}). Použij přímý odkaz na soubor.')
            size = response.getheader('Content-Length')
            if size is not None and (int(size) < 0 or int(size) > MAX_BYTES):
                raise ValueError('Obrázek smí mít nejvýše 24 MB.')
            chunks, total = [], 0
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise ValueError('Stahování obrázku překročilo časový limit.')
                if connection.sock:
                    connection.sock.settimeout(min(10, remaining))
                chunk = response.read1(min(65536, MAX_BYTES + 1 - total))
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError('Obrázek smí mít nejvýše 24 MB.')
                if not chunk:
                    break
                chunks.append(chunk)
            name = PurePosixPath(unquote(parsed.path)).name[:250] or 'obrázek.png'
            return b''.join(chunks), name
        except UnicodeError as error:
            raise ValueError('Použij URL se správně zakódovanými znaky v cestě a názvu serveru.') from error
        except http.client.HTTPException as error:
            raise ValueError('Server nedokončil přenos obrázku.') from error
        finally:
            connection.close()
    raise ValueError('Adresa obrázku obsahuje příliš mnoho přesměrování.')
