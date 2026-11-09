"""Radial thickness editing for a hollow, approximately spherical STL."""
from __future__ import annotations

from dataclasses import dataclass
from math import dist
from pathlib import Path

import numpy as np
import vtk
from PIL import Image, ImageOps
from scipy.ndimage import map_coordinates
from scipy.optimize import least_squares
from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray, vtk_to_numpy


@dataclass(frozen=True)
class Placement:
    anchor: np.ndarray
    width_mm: float
    height_mm: float
    angle_deg: float
    strength: float
    min_mm: float
    max_mm: float

    @classmethod
    def read(cls, data, radius):
        anchor = np.asarray(data["anchor"], dtype=float)
        values = [
            float(data[key]) for key in
            ("width_mm", "height_mm", "angle_deg", "strength", "min_mm", "max_mm")
        ]
        width, height, _, strength, minimum, maximum = values
        if anchor.shape != (3,) or not np.isfinite(anchor).all() or not np.isfinite(values).all():
            raise ValueError("Parametry motivu musí být konečná čísla.")
        length = np.linalg.norm(anchor)
        if length < 1e-8 or not (0 < width <= np.pi * radius and 0 < height <= np.pi * radius):
            raise ValueError("Zkontroluj kotvu a rozměry motivu. Maximum je půlobvod koule.")
        if not (0 <= strength <= 1 and 0 < minimum < maximum < radius / 4):
            raise ValueError("Zkontroluj sílu motivu a minimální a maximální tloušťku.")
        return cls(anchor / length, *values)


def load_motif(source):
    with Image.open(source) as image:
        rgba = ImageOps.exif_transpose(image).convert("RGBA")
        rgba.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        pixels = np.asarray(rgba, dtype=np.float32) / 255.0
    luminance = pixels[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    # Premultiply before interpolation: hidden RGB must not bleed across alpha edges.
    alpha = pixels[..., 3]
    return np.stack([(1.0 - luminance) * alpha, alpha], axis=-1)


def motif_at(directions, radius, motif, placement):
    """Inverse azimuthal equidistant projection centered on the selected point."""
    if motif is None or placement.strength == 0:
        return np.zeros((*directions.shape[:-1], 2))
    anchor = placement.anchor
    east = np.cross([0., 0., 1.], anchor)
    length = np.linalg.norm(east)
    east = east / length if length > 1e-8 else np.array([0., 1., 0.])
    north = np.cross(anchor, east)
    cosine = np.clip(np.einsum("...i,i->...", directions, anchor), -1.0, 1.0)
    theta = np.arccos(cosine)
    sine = np.sin(theta)
    stretch = radius * np.divide(theta, sine, out=np.ones_like(theta), where=sine > 1e-8)
    x = (np.einsum("...i,i->...", directions, east)) * stretch
    y = (np.einsum("...i,i->...", directions, north)) * stretch
    angle = np.deg2rad(placement.angle_deg)
    c, s = np.cos(angle), np.sin(angle)
    u = 0.5 + (c * x + s * y) / placement.width_mm
    v = 0.5 + (s * x - c * y) / placement.height_mm
    sample = np.stack([map_coordinates(motif[..., channel],
                        [v * (motif.shape[0] - 1), u * (motif.shape[1] - 1)],
                        order=1, mode="constant", cval=0.0, prefilter=False)
                       for channel in range(2)], axis=-1)
    edge = np.clip(np.minimum.reduce([u, v, 1 - u, 1 - v]) / 0.025, 0, 1)
    return sample * (edge * edge * (3 - 2 * edge) * (cosine > -0.999999)
                     * placement.strength)[..., None]


def blend(thickness, tone, placement):
    premultiplied_darkness, alpha = tone[..., 0], tone[..., 1]
    target = placement.min_mm * alpha + (placement.max_mm - placement.min_mm) * premultiplied_darkness
    result = thickness * (1 - alpha) + target
    # Bounds apply only inside the motif. Alpha=0 and strength=0 are exact no-ops.
    return np.where(alpha > 0, np.clip(result, placement.min_mm, placement.max_mm), thickness)


def compose_tones(directions, radius, layers):
    """Ordered premultiplied-alpha composition; the last layer is on top.

    All layers share the final manufacturing thickness bounds. Compositing
    normalized darkness first keeps clipping independent of layer grouping.
    """
    result = np.zeros((*directions.shape[:-1], 2))
    for motif, placement in layers:
        tone = motif_at(directions, radius, motif, placement)
        result = result * (1 - tone[..., 1, None]) + tone
    return result


def polydata(points, faces):
    cells = vtk.vtkCellArray()
    offsets = np.arange(0, 3 * (len(faces) + 1), 3, dtype=np.int64)
    cells.SetData(numpy_to_vtkIdTypeArray(offsets, deep=True),
                  numpy_to_vtkIdTypeArray(np.ascontiguousarray(faces.ravel()), deep=True))
    vertices = vtk.vtkPoints()
    vertices.SetData(numpy_to_vtk(np.ascontiguousarray(points), deep=True))
    mesh = vtk.vtkPolyData()
    mesh.SetPoints(vertices)
    mesh.SetPolys(cells)
    return mesh


def close_triangle_holes(points, faces, radius):
    """Close only small three-edge defects, using the original boundary vertices."""
    start = faces.ravel()
    end = np.roll(faces, -1, axis=1).ravel()
    n_points = len(points)
    keys = np.minimum(start, end) * n_points + np.maximum(start, end)
    _, groups, counts = np.unique(keys, return_inverse=True, return_counts=True)
    directions = np.bincount(groups, weights=np.where(start < end, 1, -1))
    if np.any(counts > 2) or np.any(directions[counts == 2]):
        raise ValueError("STL má nespojené nebo nekonzistentně orientované stěny.")
    is_boundary = counts[groups] == 1
    edges = list(zip(start[is_boundary], end[is_boundary]))
    following = dict(edges)
    if len(following) != len(edges) or len(set(following.values())) != len(edges):
        raise ValueError("Okraj STL nelze bezpečně uzavřít.")
    repairs = []
    while following:
        a = next(iter(following))
        b = following.pop(a)
        c = following.pop(b, None)
        if c is None or following.pop(c, None) != a:
            raise ValueError("STL má otevřený okraj. Skořepina musí mít spojenou vnitřní a vnější stěnu.")
        hole = points[[a, b, c]]
        if np.linalg.norm(hole - np.roll(hole, 1, axis=0), axis=1).max() > min(2.0, 0.025 * radius):
            raise ValueError("STL obsahuje otevřenou plochu větší než drobná vada jednoho trojúhelníku.")
        repairs.append([a, c, b])
    if repairs:
        faces = np.vstack([faces, repairs])
    return faces, len(repairs)


def fit_sphere(points):
    low, high = points.min(axis=0).astype(float), points.max(axis=0).astype(float)
    midpoint = (low + high) / 2
    scale = float((high - low).max() / 2)
    if scale <= 0 or not np.isfinite(scale):
        raise ValueError("STL nemá platné rozměry.")
    indices = np.linspace(0, len(points) - 1, min(len(points), 12000), dtype=int)
    normalized = (points[indices] - midpoint) / scale
    fit = least_squares(
        lambda params: np.linalg.norm(normalized - params[:3], axis=1) - params[3],
        [0., 0., 0., 1.], loss="soft_l1", f_scale=0.012,
    )
    deviations = np.abs(fit.fun)
    if not fit.success or np.quantile(deviations, 0.90) > 0.075:
        raise ValueError("Vrcholům STL se nepodařilo přizpůsobit přibližně kulovou skořepinu.")
    return midpoint + fit.x[:3] * scale, float(fit.x[3] * scale)


class RaySampler:
    def __init__(self, mesh, center, far):
        self.center = center
        self.origin = tuple(center)
        self.far = far
        self.locator = vtk.vtkStaticCellLocator()
        self.locator.SetDataSet(mesh)
        self.locator.BuildLocator()

    def radii(self, directions, inner_faces=None, outer_faces=None):
        inner = np.full(len(directions), np.nan)
        outer = np.full_like(inner, np.nan)
        endpoints = (self.center + self.far * directions).tolist()
        points = vtk.vtkPoints()
        points.SetDataTypeToDouble()
        cells = vtk.vtkIdList()
        cell = vtk.vtkGenericCell()
        for i, end in enumerate(endpoints):
            self.locator.IntersectWithLine(self.origin, end, 1e-7, points, cells, cell)
            if not points.GetNumberOfPoints():
                continue
            hits = []
            first_cell = -1
            ordered = sorted((dist(self.origin, points.GetPoint(j)), cells.GetId(j))
                             for j in range(points.GetNumberOfPoints()))
            for r, cell_id in ordered:
                if not hits or r - hits[-1] > 1e-5:
                    if not hits:
                        first_cell = cell_id
                    hits.append(r)
            outer[i] = hits[-1]
            if len(hits) == 2:
                inner[i] = hits[0]
                if inner_faces is not None:
                    inner_faces[i] = first_cell
                if outer_faces is not None:
                    outer_faces[i] = ordered[-1][1]
        return inner, outer

    def pick(self, start, end):
        distance, sub_id = vtk.reference(0.), vtk.reference(0)
        position, pcoords = [0., 0., 0.], [0., 0., 0.]
        if not self.locator.IntersectWithLine(start, end, 1e-7, distance, position, pcoords, sub_id):
            return None
        direction = np.asarray(position) - self.center
        return direction / np.linalg.norm(direction)


class Moon:
    def __init__(self, filename, atlas_width=640):
        reader = vtk.vtkSTLReader()
        reader.SetFileName(str(filename))
        reader.Update()
        mesh = reader.GetOutput()
        if mesh.GetNumberOfPolys() < 16:
            raise ValueError("Soubor neobsahuje čitelnou STL skořepinu.")
        self.points = vtk_to_numpy(mesh.GetPoints().GetData()).copy()
        faces = vtk_to_numpy(mesh.GetPolys().GetConnectivityArray()).reshape(-1, 3).copy()
        if not np.isfinite(self.points).all():
            raise ValueError("STL obsahuje neplatné souřadnice.")
        self.center, radius = fit_sphere(self.points)
        faces, self.repairs = close_triangle_holes(self.points, faces, radius)

        triangles = self.points[faces] - self.center
        a, b, c = np.moveaxis(triangles, 1, 0)
        normal = np.cross(b - a, c - a)
        area = np.linalg.norm(normal, axis=1)
        if np.any(area < 1e-10):
            raise ValueError("STL obsahuje degenerované trojúhelníky.")
        orientation = np.sign(np.einsum("ij,ij->", a, normal))
        if orientation == 0:
            raise ValueError("STL nemá platný objem.")
        self.faces = faces if orientation > 0 else faces[:, ::-1].copy()
        radial = (a + b + c) / 3
        cosine = orientation * np.einsum("ij,ij->i", normal, radial)
        cosine /= area * np.linalg.norm(radial, axis=1)
        # Shared vertices at a rim or a radial fold are held fixed.
        exterior = np.zeros(len(self.points), dtype=bool)
        exterior[self.faces[cosine >= -0.08].ravel()] = True
        self.interior = np.flatnonzero(~exterior)
        self.exterior = np.flatnonzero(exterior)
        # Only vertices whose incident triangles all face outward can move.
        fixed_outer = np.zeros(len(self.points), dtype=bool)
        fixed_outer[self.faces[cosine <= 0.08].ravel()] = True
        self.outward = np.flatnonzero(~fixed_outer)
        far = np.linalg.norm(self.points - self.center, axis=1).max() * 1.15
        self.rays = RaySampler(polydata(self.points, self.faces), self.center, far)

        latitude = np.linspace(-np.pi / 2, np.pi / 2, atlas_width // 2 + 1)
        azimuth = np.linspace(-np.pi, np.pi, atlas_width, endpoint=False)
        azimuth, latitude = np.meshgrid(azimuth, latitude)
        directions = np.stack([np.cos(latitude) * np.cos(azimuth),
                               np.cos(latitude) * np.sin(azimuth), np.sin(latitude)], axis=-1)
        directions = directions.reshape(-1, 3)
        inner_faces = np.full(len(directions), -1, dtype=np.int64)
        inner, outer = self.rays.radii(directions, inner_faces)
        good = np.isfinite(inner)
        if np.mean(good) < 0.75 or len(self.interior) < 8:
            raise ValueError("Paprsky většinou neprotínají dutou kouli se dvěma stěnami.")
        self.radius = float(np.median(outer[good]))
        self.shape = latitude.shape
        self.outer = outer.reshape(self.shape)
        self.thickness = (outer - inner).reshape(self.shape)
        self.weight = self.shell_weight(inner, outer).reshape(self.shape)
        measure = self.thickness[self.weight >= 0.999]
        if len(measure) < 8:
            raise ValueError("Nepodařilo se rozlišit svítící část skořepiny.")
        q01, q99 = np.quantile(measure, [0.01, 0.99])
        self.minimum = float(max(0.1, np.floor(q01 * 10) / 10))
        self.maximum = float(max(self.minimum + 0.1, np.ceil(q99 * 10) / 10))
        self._atlas_rays = (directions, inner, outer, inner_faces)

    def shell_weight(self, inner, outer):
        # Radius thresholds exclude the fixture and fade onto the spherical body.
        distance = np.minimum(inner / self.radius - 0.955, outer / self.radius - 0.973)
        return np.nan_to_num(np.clip(distance / 0.013, 0, 1), nan=0.0)

    def info(self, name):
        sample = self.thickness[self.weight >= 0.999]
        return {
            "name": name, "radius": self.radius, "center": self.center.tolist(),
            "triangles": len(self.faces), "repairs": self.repairs,
            "min_mm": self.minimum, "max_mm": self.maximum,
            "source_min": float(sample.min()), "source_max": float(sample.max()),
        }
