"""Closed rectangular coupons cut from the verified shell, without remeshing it.

The rectangle is measured in a tangent frame (chord mm, not arc length).
Four parallel-to-view planes cut its sides; a fifth excludes the back hemisphere.
Rigid rotation puts the bottom cut on Z=0. No pedestal or wall edits are added.
"""
from dataclasses import dataclass
import struct
from math import hypot

import numpy as np
import vtk
from vtk.util.numpy_support import vtk_to_numpy

from geometry import polydata


@dataclass(frozen=True)
class SampleSelection:
    anchor: np.ndarray
    angle_deg: float
    left: float
    right: float
    bottom: float
    top: float

    @classmethod
    def read(cls, data, radius):
        if not isinstance(data, dict):
            raise ValueError('Nejdřív vyznač zkušební výřez.')
        anchor = np.asarray(data.get('anchor'), dtype=float)
        values = np.array([data.get(k) for k in ('angle_deg', 'left', 'right', 'bottom', 'top')], dtype=float)
        if anchor.shape != (3,) or not np.isfinite(anchor).all() or not np.isfinite(values).all():
            raise ValueError('Výřez musí mít konečnou kotvu, natočení a rozměry.')
        length = hypot(*anchor)
        angle, left, right, bottom, top = values
        if not np.isfinite(length) or length < 1e-8 or right-left < 1 or top-bottom < 1:
            raise ValueError('Výřez musí být široký i vysoký alespoň 1 mm.')
        if max(left*left, right*right)+max(bottom*bottom, top*top) >= (.98*radius)**2:
            raise ValueError('Výřez přesahuje viditelnou polokouli. Zmenši jej nebo otoč pohled a vyber oblast znovu.')
        return cls(anchor/length, *values)

    def json(self):
        return dict(anchor=self.anchor.tolist(), **{k: float(getattr(self, k)) for k in
                    ('angle_deg', 'left', 'right', 'bottom', 'top')})

    def frame(self):
        east = np.cross([0., 0., 1.], self.anchor)
        length = np.linalg.norm(east)
        east = east/length if length > 1e-8 else np.array([0., 1., 0.])
        north = np.cross(self.anchor, east)
        c, s = np.cos(np.deg2rad(self.angle_deg)), np.sin(np.deg2rad(self.angle_deg))
        return c*east+s*north, -s*east+c*north, self.anchor


def check_closed(points, faces):
    if not len(faces) or not np.isfinite(points).all():
        raise ValueError('Ve výřezu není platná geometrie. Vyber jinou oblast.')
    start, end = faces.ravel(), np.roll(faces, -1, axis=1).ravel()
    keys = np.minimum(start, end)*len(points)+np.maximum(start, end)
    _, groups, counts = np.unique(keys, return_inverse=True, return_counts=True)
    direction = np.bincount(groups, weights=np.where(start < end, 1, -1))
    if np.any(counts != 2) or np.any(direction) or np.any(start == end):
        raise ValueError('Řez se nepodařilo bezpečně uzavřít. Posuň okraj výřezu a zkus to znovu.')
    cross = np.cross(points[faces[:, 1]]-points[faces[:, 0]], points[faces[:, 2]]-points[faces[:, 0]])
    if np.any(np.linalg.norm(cross, axis=1) < 1e-12):
        raise ValueError('Řez obsahuje degenerovaný trojúhelník. Mírně posuň okraj výřezu.')


@dataclass
class Sample:
    points: np.ndarray
    faces: np.ndarray
    stats: dict

    def binary(self):
        # Same transport as Engine.binary; preview uses an unlit solid material.
        return b''.join([struct.pack('<II', len(self.points), len(self.faces)),
                        np.asarray(self.points, dtype='<f4').tobytes(),
                        np.asarray(self.faces, dtype='<u4').tobytes(),
                        np.zeros(len(self.points)*2, dtype='<f4').tobytes()])

    def write(self, path):
        # Validate the actual float32 coordinates that STL can represent.
        check_closed(self.points.astype(np.float32).astype(float), self.faces)
        writer = vtk.vtkSTLWriter()
        writer.SetInputData(polydata(self.points, self.faces))
        writer.SetFileTypeToBinary()
        writer.SetFileName(str(path))
        if writer.Write() != 1:
            raise OSError('Zápis výřezu STL selhal.')


def cut_sample(engine, result, selection):
    if not result.stats.get('exportable'):
        raise ValueError('Nejdřív přepočítej a ověř aktuální model.')
    right, up, front = selection.frame()
    # Keep source coordinates until after clipping; all interior triangles survive intact.
    planes = vtk.vtkPlaneCollection()
    for normal, offset in [(right, selection.left), (-right, -selection.right),
                           (up, selection.bottom), (-up, -selection.top), (front, 0)]:
        plane = vtk.vtkPlane()
        plane.SetNormal(*normal)
        plane.SetOrigin(*(engine.center+normal*offset))
        planes.AddItem(plane)
    clip = vtk.vtkClipClosedSurface()
    clip.SetInputData(polydata(result.points.astype(float), engine.faces))
    clip.SetClippingPlanes(planes)
    clip.SetTolerance(1e-7)
    clip.GenerateFacesOn()
    clip.Update()
    triangles = vtk.vtkTriangleFilter()
    triangles.SetInputConnection(clip.GetOutputPort())
    triangles.Update()
    output = triangles.GetOutput()
    if output.GetNumberOfCells() == 0:
        raise ValueError('Výřez neprotíná skořepinu. Vyber jinou oblast.')
    points = vtk_to_numpy(output.GetPoints().GetData()).copy()
    faces = vtk_to_numpy(output.GetPolys().GetConnectivityArray()).reshape(-1, 3).copy()
    # Remove unused original points left by VTK, without merging or smoothing vertices.
    used, inverse = np.unique(faces, return_inverse=True)
    points, faces = points[used], inverse.reshape(-1, 3).astype(np.int64)
    check_closed(points, faces)
    relative = points-engine.center
    points = np.column_stack([relative@right, -relative@front, relative@up-selection.bottom])
    tolerance = 1e-5
    base = np.abs(points[:, 2]) < tolerance
    if not np.any(np.all(base[faces], axis=1)) or points[:, 2].min() < -tolerance:
        raise ValueError('Spodní řez nevytvořil stojnou plochu. Posuň dolní okraj výřezu výš do skořepiny.')
    points[base, 2] = 0.
    points[:, :2] -= (points[:, :2].min(axis=0)+points[:, :2].max(axis=0))/2
    check_closed(points, faces)
    connectivity = vtk.vtkPolyDataConnectivityFilter()
    connectivity.SetInputData(polydata(points, faces))
    connectivity.SetExtractionModeToAllRegions()
    connectivity.Update()
    if connectivity.GetNumberOfExtractedRegions() != 1:
        raise ValueError('Výřez tvoří více oddělených dílů. Vyber souvislou oblast skořepiny.')
    stats = dict(dimensions_mm=np.ptp(points, axis=0).tolist(), triangles=len(faces),
                 warning='Rovná stojná plocha nezaručuje stabilitu ani tisk bez podpor. Zkontroluj převisy a přilnavost v tiskovém programu.')
    return Sample(points, faces, stats)
