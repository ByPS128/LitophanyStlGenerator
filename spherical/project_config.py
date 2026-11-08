"""New-project defaults; paths are relative to the configuration file."""
import json
from pathlib import Path

DEFAULT_CONFIG = Path(__file__).with_name('config.json')


def defaults(path=DEFAULT_CONFIG):
    path = Path(path).resolve()
    data = json.loads(path.read_text(encoding='utf-8'))
    result = {}
    for key in ('default_stl', 'demo_image'):
        value = data.get(key)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f'V konfiguraci chybí cesta {key}.')
        result[key] = (path.parent / value).resolve()
    return result
