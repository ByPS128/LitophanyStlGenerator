"""Loopback-only editor. Run with python spherical/server.py --demo."""
from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
import mimetypes
from pathlib import Path
import shutil
import subprocess
import tempfile
from threading import Lock
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import uuid
import webbrowser
import zipfile

import numpy as np
from PIL import Image
from engine import Engine
from layers import LayerStore

ROOT = Path(__file__).resolve().parent
SOURCES = ROOT.parent / 'LithophaneStlGenerator' / 'Sources'


def find_blender():
    path = shutil.which('blender')
    if path:
        return path
    candidates = sorted(Path('C:/Program Files/Blender Foundation').glob('Blender */blender.exe'))
    return str(candidates[-1]) if candidates else None


def scene_settings(data, radius):
    result = {}
    for key, default, low, high in [('brightness', 1, 0, 5), ('kelvin', 3000, 2200, 7500),
                                    ('attenuation', .78, .05, 5)]:
        value = float(data.get(key, default))
        if not np.isfinite(value) or not low <= value <= high:
            raise ValueError(f'Neplatná hodnota {key}.')
        result[key] = value
    for key, default in [('light', [0, 0, 0]), ('camera', [radius * 2.5, -radius * 2.5, radius * .8])]:
        vector = np.asarray(data.get(key, default), dtype=float)
        if vector.shape != (3,) or not np.isfinite(vector).all():
            raise ValueError(f'Neplatná poloha {key}.')
        if key == 'light' and np.linalg.norm(vector) > radius * .8:
            raise ValueError('LED musí zůstat uvnitř koule, nejvýše 80 % poloměru od středu.')
        if key == 'camera' and not radius * 1.05 < np.linalg.norm(vector) < radius * 50:
            raise ValueError('Kamera musí být mimo kouli.')
        result[key] = vector.tolist()
    return result


class State:
    def __init__(self):
        self.lock = Lock()
        self.engine = None
        self.motif = None
        self.image_name = None
        self.name = None
        self.result = None
        self.result_id = None
        self.placement = None
        self.store = LayerStore()
        self.source_bytes = None
        self.restored_scene = None
        self.restored_limits = None
        self.workspace = tempfile.TemporaryDirectory(prefix='luna-')
        self.pool = ThreadPoolExecutor(max_workers=1)
        self.render_future = None
        self.render_id = None

    def open(self, path, name):
        engine = Engine(path)
        self.engine, self.name = engine, name
        self.source_bytes = Path(path).read_bytes()
        self.store = LayerStore()
        self.motif = self.image_name = None
        self.restored_scene = self.restored_limits = None
        self.invalidate()

    def invalidate(self):
        self.result = self.result_id = None

    def info(self):
        model = self.engine.info(self.name) if self.engine else None
        if model:
            # Include all measured body vertices, not only the atlas percentiles.
            body = self.engine.wall[self.engine.shell >= .999]
            model['min_mm'] = max(.1, float(np.floor(body.min() * 20) / 20))
            model['max_mm'] = float(np.ceil(body.max() * 20) / 20)
        if model and self.restored_limits:
            model.update(self.restored_limits)
        return {'model': model, 'image': self.image_name, 'layers': self.store.layers,
                'restored_scene': self.restored_scene,
                'image_size': list(self.motif.shape[:2][::-1]) if self.motif is not None else None,
                'blender': bool(find_blender())}

    def require_result(self, token):
        if self.result is None or token != self.result_id:
            raise ValueError('Nejdřív přepočítej a ověř aktuální model.')
        if not self.result.stats['exportable']:
            raise ValueError('Export blokován: upravená stěna neprošla kontrolou. Uprav meze nebo sílu motivu.')

    def bundle(self, data, directory):
        self.require_result(data.get('result_id'))
        scene = scene_settings(data.get('scene', {}), self.engine.radius)
        scene.update({'center': self.engine.center.tolist(), 'radius': self.engine.radius,
                      'composition': self.placement, 'validation': self.result.stats})
        self.engine.write(directory / 'moon.stl', self.result)
        (directory / 'scene.json').write_text(json.dumps(scene, ensure_ascii=False, indent=2), encoding='utf-8')
        shutil.copyfile(ROOT / 'render_blender.py', directory / 'render_blender.py')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    @property
    def state(self):
        return self.server.state

    def local(self):
        host = f'127.0.0.1:{self.server.server_port}'
        if self.headers.get('Host') != host or self.headers.get('Origin', f'http://{host}') != f'http://{host}':
            # Consume bounded rejected POST bodies before closing the socket;
            # Windows otherwise resets the connection before the 403 arrives.
            try:
                length = int(self.headers.get('Content-Length', 0))
            except ValueError:
                length = 0
            if 0 < length <= 32768:
                self.rfile.read(length)
            self.send_error(403)
            return False
        return True

    def reply(self, body, content_type='application/json', status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def json(self, data, status=200):
        self.reply(json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8'), status=status)

    def body(self, limit):
        length = int(self.headers.get('Content-Length', 0))
        if not 0 < length <= limit:
            raise ValueError('Vstup je prázdný nebo překračuje limit velikosti.')
        return self.rfile.read(length)

    def do_GET(self):
        if not self.local():
            return
        try:
            with self.state.lock:
                self.get()
        except (ValueError, OSError, TypeError, KeyError) as error:
            self.json({'error': str(error)}, 400)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def get(self):
        state = self.state
        if self.path.startswith('/api/source/'):
            image_id=self.path.removeprefix('/api/source/')
            if image_id not in state.store.images:
                raise ValueError('Zdroj obrázku nebyl nalezen.')
            return self.reply(state.store.processed(image_id,None)['original_png'],'image/png')
        if self.path == '/api/info':
            return self.json(state.info())
        if self.path in ('/api/mesh', '/api/verified'):
            if state.engine is None:
                raise ValueError('Nejdřív načti STL.')
            if self.path.endswith('verified') and state.result is None:
                raise ValueError('Chybí přepočítaný model.')
            return self.reply(state.engine.binary(state.result if self.path.endswith('verified') else None), 'application/octet-stream')
        if self.path == '/api/motif.png':
            if state.motif is None:
                raise ValueError('Nejdřív načti motiv.')
            channels = np.zeros((*state.motif.shape[:2], 4), dtype=np.uint8)
            channels[..., :2] = np.rint(state.motif * 255).astype(np.uint8)
            channels[..., 3] = 255
            stream = BytesIO()
            Image.fromarray(channels).save(stream, format='PNG')
            return self.reply(stream.getvalue(), 'image/png')
        if self.path == '/api/render-status':
            future = state.render_future
            if future is None:
                return self.json({'status': 'idle'})
            if not future.done():
                return self.json({'status': 'running'})
            error = future.exception()
            return self.json({'status': 'failed' if error else 'complete', 'error': str(error) if error else None})
        if self.path == '/api/render.png':
            if not state.render_future or not state.render_future.done() or state.render_future.exception():
                raise ValueError('Finální obrázek ještě není připravený.')
            return self.reply(state.render_future.result().read_bytes(), 'image/png')
        path = (ROOT / 'web' / 'dist' / ('index.html' if self.path == '/' else self.path.lstrip('/'))).resolve()
        if not path.is_relative_to((ROOT / 'web' / 'dist').resolve()) or not path.is_file():
            return self.send_error(404)
        return self.reply(path.read_bytes(), mimetypes.guess_type(path)[0] or 'application/octet-stream')

    def do_POST(self):
        if not self.local():
            return
        try:
            with self.state.lock:
                self.post()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except (ValueError, OSError, TypeError, KeyError, OverflowError, json.JSONDecodeError, zipfile.BadZipFile) as error:
            self.json({'error': str(error)}, 400)

    def post(self):
        state = self.state
        if self.path == '/api/demo':
            state.open(SOURCES / 'moon-globe-mk2.stl', 'moon-globe-mk2.stl')
            layer=state.store.add((SOURCES/'dragon.png').read_bytes(),'dragon.png',state.engine.radius)
            state.motif = state.store.images[layer['image_id']]['motif']
            state.image_name = 'dragon.png'
            return self.json(state.info())
        if self.path == '/api/stl':
            path = Path(state.workspace.name) / 'input.stl'
            path.write_bytes(self.body(200 * 1024**2))
            from urllib.parse import unquote
            state.open(path, unquote(self.headers.get('X-File-Name', 'moon.stl')))
            return self.json(state.info())
        if self.path == '/api/motif':
            from urllib.parse import unquote
            name=unquote(self.headers.get('X-File-Name','motiv.png'))
            layer=state.store.add(self.body(24*1024**2),name,state.engine.radius if state.engine else 100)
            state.motif, state.image_name = state.store.images[layer['image_id']]['motif'], name
            state.invalidate()
            return self.json(state.info())
        if self.path == '/api/project-open':
            store,model,data=LayerStore.read(self.body(300*1024**2))
            path=Path(state.workspace.name)/'project.stl'
            path.write_bytes(model)
            engine=Engine(path)
            _,_,clean=store.parse(data,engine.radius)
            restored_scene=scene_settings(data.get('scene',{}),engine.radius)
            store.layers=clean
            state.engine,state.store,state.source_bytes=engine,store,model
            state.name=str(data.get('model_name','moon.stl'))[:250]
            state.restored_scene=restored_scene
            state.restored_limits={'min_mm':data['min_mm'],'max_mm':data['max_mm']}
            state.invalidate()
            return self.json(state.info())
        data = json.loads(self.body(1024 * 1024))
        if state.engine is None:
            raise ValueError('Nejdřív načti STL.')
        if self.path == '/api/image-preview':
            image_id=data['image_id']
            if image_id not in state.store.images:
                raise ValueError('Zdroj obrázku nebyl nalezen.')
            processed=state.store.processed(image_id,data.get('image_settings'))
            return self.json({'png':base64.b64encode(processed['png']).decode('ascii'),
                              'histogram':processed['histogram']})
        if self.path == '/api/layers':
            _,_,clean=state.store.parse(data,state.engine.radius)
            state.store.layers=clean
            state.invalidate()
            return self.json(state.info())
        if self.path == '/api/preview-layers':
            parsed,_,clean=state.store.parse(data,state.engine.radius)
            state.store.layers=clean
            state.invalidate()
            return self.reply(state.store.preview(parsed,state.engine.radius),'image/png')
        if self.path == '/api/project-save':
            _,_,clean=state.store.parse(data,state.engine.radius)
            saved_scene=scene_settings(data.get('scene',{}),state.engine.radius)
            payload=dict(layers=clean,min_mm=data['min_mm'],max_mm=data['max_mm'],
                         model_name=state.name,scene=saved_scene)
            current=dict(layers=clean,min_mm=data['min_mm'],max_mm=data['max_mm'])
            result_bytes=None
            if state.result and state.result_id==data.get('result_id') and state.result.stats['exportable'] and current==state.placement:
                output=Path(state.workspace.name)/'project-result.stl'
                state.engine.write(output,state.result)
                result_bytes=output.read_bytes()
                payload['validation']=state.result.stats
            return self.reply(state.store.save(state.source_bytes,payload,result_bytes),'application/zip')
        if self.path == '/api/apply':
            parsed,placement,clean=state.store.parse(data,state.engine.radius)
            result = state.engine.calculate_layers(parsed, placement)
            state.result, state.result_id = result, uuid.uuid4().hex
            state.store.layers=clean
            state.placement = dict(layers=clean,min_mm=placement.min_mm,max_mm=placement.max_mm)
            return self.json({'result_id': state.result_id, **result.stats})
        if self.path == '/api/export':
            state.require_result(data.get('result_id'))
            output = Path(state.workspace.name) / 'export.stl'
            state.engine.write(output, state.result)
            return self.reply(output.read_bytes(), 'model/stl')
        if self.path in ('/api/bundle', '/api/render'):
            blender = find_blender()
            if self.path.endswith('render') and not blender:
                raise ValueError('Blender není nainstalovaný. Stáhni balíček scény a spusť jej na počítači s Blenderem.')
            if self.path.endswith('render') and state.render_future and not state.render_future.done():
                raise ValueError('Vykreslování už probíhá.')
            directory = Path(state.workspace.name) / uuid.uuid4().hex
            directory.mkdir()
            state.bundle(data, directory)
            if self.path.endswith('bundle'):
                stream = BytesIO()
                with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
                    for path in directory.iterdir():
                        archive.write(path, path.name)
                return self.reply(stream.getvalue(), 'application/zip')
            def render():
                with (directory / 'render.log').open('w', encoding='utf-8') as log:
                    completed = subprocess.run([blender, '--background', '--python', str(directory / 'render_blender.py'),
                                                '--', str(directory / 'scene.json')], stdout=log, stderr=subprocess.STDOUT,
                                               timeout=1800, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                if completed.returncode or not (directory / 'render.png').exists():
                    raise ValueError('Blender nedokončil vykreslení: ' + (directory / 'render.log').read_text(encoding='utf-8')[-1500:])
                return directory / 'render.png'
            state.render_future = state.pool.submit(render)
            return self.json({'status': 'running'})
        return self.send_error(404)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--demo', action='store_true')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if not (ROOT / 'web/dist/index.html').exists():
        parser.error('Nejdřív sestav rozhraní: cd spherical/web; npm install; npm run build')
    state = State()
    if args.demo:
        print('Načítám Měsíc a měřím tloušťku…', flush=True)
        state.open(SOURCES / 'moon-globe-mk2.stl', 'moon-globe-mk2.stl')
        layer=state.store.add((SOURCES/'dragon.png').read_bytes(),'dragon.png',state.engine.radius)
        state.motif, state.image_name = state.store.images[layer['image_id']]['motif'], 'dragon.png'
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    server.state = state
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'Luna: {url}', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        state.pool.shutdown(wait=True)
        state.workspace.cleanup()


if __name__ == '__main__':
    main()
