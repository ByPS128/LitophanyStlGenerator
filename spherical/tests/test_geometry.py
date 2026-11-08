from io import BytesIO
import numpy as np
import pytest
from PIL import Image
import vtk
from vtk.util.numpy_support import vtk_to_numpy

from engine import Engine
from geometry import Placement, blend, load_motif, motif_at, polydata
from server import scene_settings


def placement(**kwargs):
    data = dict(anchor=[1., 0., 0.], width_mm=80., height_mm=80., angle_deg=0.,
                strength=.65, min_mm=.7, max_mm=3.0)
    data.update(kwargs)
    return Placement.read(data, 100)


def test_transparent_pixels_preserve_out_of_bounds_wall():
    before = np.array([.2, 2., 5.])
    np.testing.assert_array_equal(blend(before, np.zeros((3, 2)), placement()), before)


def test_black_white_and_gray_map_to_target_thickness():
    samples = np.array([[1, 1], [0, 1], [.5, 1]])
    np.testing.assert_allclose(blend(np.ones(3)*2, samples, placement()), [3, .7, 1.85])


def test_partial_alpha_blends_original_wall():
    np.testing.assert_allclose(blend(np.array([2.]), np.array([[0., .5]]), placement()), [1.35])


def test_hidden_rgb_is_irrelevant():
    image = Image.fromarray(np.array([[[255, 255, 255, 0], [0, 0, 0, 0]]], dtype=np.uint8))
    stream = BytesIO()
    image.save(stream, format='PNG')
    stream.seek(0)
    np.testing.assert_array_equal(load_motif(stream), np.zeros((1, 2, 2)))


def test_projection_anchor_and_antipode():
    samples = motif_at(np.array([[1., 0, 0], [-1., 0, 0], [0., 1, 0]]), 100,
                       np.ones((8, 8, 2)), placement(strength=1))
    np.testing.assert_array_equal(samples, [[1, 1], [0, 0], [0, 0]])


def test_zero_strength_is_noop():
    sample = motif_at(np.array([[1., 0, 0]]), 100, np.ones((8, 8, 2)), placement(strength=0))
    np.testing.assert_array_equal(blend(np.array([5.]), sample, placement()), [5.])


@pytest.mark.parametrize('data', [dict(anchor=[0, 0, 0]), dict(width_mm=-1), dict(strength=2),
                                  dict(min_mm=3,max_mm=2), dict(angle_deg=float('nan'))])
def test_bad_placement_rejected(data):
    with pytest.raises(ValueError):
        placement(**data)


@pytest.fixture(scope='module')
def engine(tmp_path_factory):
    sphere = vtk.vtkSphereSource()
    sphere.SetRadius(100)
    sphere.SetThetaResolution(48)
    sphere.SetPhiResolution(32)
    sphere.Update()
    mesh = sphere.GetOutput()
    outer = vtk_to_numpy(mesh.GetPoints().GetData()).copy()
    faces = vtk_to_numpy(mesh.GetPolys().GetConnectivityArray()).reshape(-1, 3).copy()
    points = np.concatenate([outer, outer*.98])
    faces = np.concatenate([faces, faces[:, ::-1]+len(outer)])
    path = tmp_path_factory.mktemp('shell')/'shell.stl'
    writer = vtk.vtkSTLWriter()
    writer.SetFileName(str(path))
    writer.SetInputData(polydata(points, faces))
    assert writer.Write() == 1
    return Engine(path, atlas_width=48)


def test_noop_keeps_every_vertex(engine):
    result = engine.calculate(np.ones((8,8,2)), placement(strength=0,min_mm=.1,max_mm=.5))
    np.testing.assert_array_equal(result.points, engine.points)
    assert result.stats['edited_vertices'] == 0
    assert result.stats['exportable']


def test_outer_surface_and_uncovered_vertices_are_exact(engine, tmp_path):
    motif = np.ones((16,16,2))
    p = placement(strength=.35)
    result = engine.calculate(motif, p)
    coverage = motif_at(engine.directions, engine.radius, motif, p)[:,1]
    np.testing.assert_array_equal(result.points[engine.exterior], engine.points[engine.exterior])
    np.testing.assert_array_equal(result.points[coverage==0], engine.points[coverage==0])
    assert result.stats['edited_vertices'] > 0
    assert result.stats['exportable']
    output = tmp_path/'result.stl'
    engine.write(output, result)
    assert output.stat().st_size == 84+len(engine.faces)*50


def test_limit_failure_blocks_export(engine, tmp_path):
    # Sparse triangles cannot enforce a very narrow interval across a feathered boundary.
    p = placement(min_mm=.5, max_mm=.55, strength=1)
    result = engine.calculate(np.ones((8,8,2)), p)
    assert not result.stats['exportable']
    with pytest.raises(ValueError, match='Export blokován'):
        engine.write(tmp_path/'invalid.stl', result)
    assert not (tmp_path/'invalid.stl').exists()


def test_scene_rejects_external_light():
    with pytest.raises(ValueError):
        scene_settings({'light':[200,0,0]}, 100)


def test_scene_rejects_nonfinite_brightness():
    with pytest.raises(ValueError):
        scene_settings({'brightness':float('nan')}, 100)
