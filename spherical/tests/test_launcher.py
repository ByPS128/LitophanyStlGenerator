"""Run the real Windows lifecycle script in an isolated checkout, never the user's instance."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
from urllib.request import urlopen

import pytest

ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.skipif(sys.platform != 'win32', reason='Windows CMD/PowerShell launcher')


def test_start_reuses_instance_stop_checks_identity_and_preserves_other_server(tmp_path):
    root = tmp_path/'checkout with spaces'
    root.mkdir()
    (root/'spherical').mkdir()
    shutil.copy(ROOT/'Manage-Luna.ps1', root/'Manage-Luna.ps1')
    shutil.copy(ROOT/'Start-Luna.cmd', root/'Start-Luna.cmd')
    (root/'Start-Luna.ps1').write_text('param([switch]$Install,[switch]$PrepareOnly)\n', encoding='utf-8')
    (root/'spherical'/'server.py').write_text(
        'import argparse\nfrom http.server import HTTPServer, BaseHTTPRequestHandler\n'
        'p=argparse.ArgumentParser(); p.add_argument("--port",type=int); args,_=p.parse_known_args()\n'
        'class H(BaseHTTPRequestHandler):\n'
        ' def do_GET(self):\n'
        '  self.send_response(200); self.end_headers(); self.wfile.write(b"Luna fixture")\n'
        'HTTPServer(("127.0.0.1",args.port),H).serve_forever()\n', encoding='utf-8')
    subprocess.run([sys.executable, '-m', 'venv', '--without-pip', str(root/'.venv')], check=True)
    state_path = root/'temp'/'luna-process.json'

    def run(args):
        # Files avoid inherited pipe handles keeping communicate() open on Windows.
        with (root/'command.log').open('wb') as output:
            result = subprocess.run(args, stdout=output, stderr=output, timeout=45)
        result.stderr = (root/'command.log').read_bytes()
        return result

    def command(action, *args):
        return run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                    str(root/'Manage-Luna.ps1'), '-Action', action, *args])

    # Occupy the requested port: launcher must choose another and leave this socket alone.
    with socket.socket() as unrelated:
        unrelated.bind(('127.0.0.1', 0))
        unrelated.listen()
        port = unrelated.getsockname()[1]
        if port > 65515:
            pytest.skip('Ephemeral port outside launcher range')
        record = None
        try:
            first = command('Start', '-Empty', '-NoBrowser', '-Port', str(port))
            assert first.returncode == 0, first.stderr
            record = json.loads(state_path.read_text(encoding='utf-8-sig'))
            assert record['port'] != port
            with urlopen(f"http://127.0.0.1:{record['port']}/", timeout=3) as response:
                assert response.read() == b'Luna fixture'
            repeated = run([os.environ['COMSPEC'], '/c', 'call', str(root/'Start-Luna.cmd'), '-NoBrowser'])
            assert repeated.returncode == 0, repeated.stderr
            assert json.loads(state_path.read_text(encoding='utf-8-sig')) == record
            state_path.write_text(json.dumps({**record, 'created_ticks': '1'}), encoding='utf-8')
            rejected = command('Stop')
            assert rejected.returncode != 0
            with urlopen(f"http://127.0.0.1:{record['port']}/", timeout=3) as response:
                assert response.status == 200
        finally:
            if record:
                state_path.write_text(json.dumps(record), encoding='utf-8')
                stopped = command('Stop')
                assert stopped.returncode == 0, stopped.stderr
        assert not state_path.exists()
        assert command('Stop').returncode == 0
        assert unrelated.getsockname()[1] == port
        with socket.socket() as check:
            assert check.connect_ex(('127.0.0.1', record['port'])) != 0
