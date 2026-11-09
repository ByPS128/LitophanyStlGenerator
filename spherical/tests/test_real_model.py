"""Optional regression test: user-owned Sources are never committed."""
from pathlib import Path
import numpy as np
import pytest
from engine import Engine
from geometry import Placement, load_motif, motif_at

SOURCES = Path(__file__).resolve().parents[2]/'LithophaneStlGenerator'/'Sources'


@pytest.mark.skipif(not (SOURCES/'moon-globe-mk2.stl').exists() or not (SOURCES/'dragon.png').exists(),
                    reason='Local user-owned model and motif are not available')
@pytest.mark.parametrize("method", ["inside", "outside"])
def test_supplied_moon_dragon(tmp_path, method):
    engine = Engine(SOURCES/'moon-globe-mk2.stl')
    motif = load_motif(SOURCES/'dragon.png')
    body = engine.wall[engine.shell>=.999]
    p = Placement.read(dict(anchor=[1,-1,.2],width_mm=102,height_mm=68,angle_deg=0,strength=.65,
                            min_mm=max(.1,float(np.floor(body.min()*20)/20)),
                            max_mm=float(np.ceil(body.max()*20)/20)),engine.radius)
    result = engine.calculate(motif,p,method)
    assert result.stats['exportable'], result.stats
    assert result.stats['outside'] == result.stats['invalid'] == 0
    assert result.stats['edited_vertices'] > 100
    fixed = engine.exterior if method == "inside" else engine.interior
    np.testing.assert_array_equal(result.points[fixed],engine.points[fixed])
    outside = motif_at(engine.directions,engine.radius,motif,p)[:,1] == 0
    np.testing.assert_array_equal(result.points[outside],engine.points[outside])
    output = tmp_path/'moon-dragon.stl'
    engine.write(output,result)
    assert output.stat().st_size == 84+50*len(engine.faces)
