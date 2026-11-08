"""Edits inner vertices only; verifies the actual resulting triangles before export."""
from dataclasses import dataclass
from pathlib import Path
import struct

import numpy as np
import vtk

from geometry import Moon, RaySampler, blend, compose_tones, polydata


@dataclass
class Result:
    points: np.ndarray
    thickness: np.ndarray
    stats: dict


class Engine(Moon):
    def __init__(self, filename, atlas_width=320):
        super().__init__(filename, atlas_width)
        relative = self.points.astype(float) - self.center
        self.radii = np.linalg.norm(relative, axis=1)
        self.directions = relative / self.radii[:, None]
        self.inner_r, self.outer_r = self.rays.radii(self.directions)
        self.wall = self.outer_r - self.inner_r
        self.shell = self.shell_weight(self.inner_r, self.outer_r)
        self.editable = np.zeros(len(self.points), dtype=bool)
        self.editable[self.interior] = True
        self.editable &= (self.shell >= 0.999) & (np.abs(self.inner_r - self.radii) < 0.0002)
        self.wall_display = np.nan_to_num(self.wall, nan=self.maximum).astype(np.float32)
        self.original = Result(self.points, self.wall_display, {})

    def constrain(self, points, changed, probe, placement):
        """Project sampled wall constraints onto editable inverse vertex radii.

        Uncovered vertices have zero capacity, so the solver cannot spread the
        edit into transparent areas. Infeasible constraints fail validation.
        """
        face_ids = np.full(len(probe), -1, dtype=np.int64)
        inner, outer = self.rays.radii(probe, face_ids)
        keep = (face_ids >= 0) & np.isfinite(inner) & (self.shell_weight(inner, outer) >= .999)
        ids = self.faces[face_ids[keep]]
        inner, outer = inner[keep], outer[keep]
        hit = self.center + probe[keep] * inner[:, None]
        a, b, c = np.moveaxis(self.points[ids].astype(float), 1, 0)
        u, v, w = b-a, c-a, hit-a
        uu = np.einsum('ij,ij->i', u, u)
        uv = np.einsum('ij,ij->i', u, v)
        vv = np.einsum('ij,ij->i', v, v)
        wu = np.einsum('ij,ij->i', w, u)
        wv = np.einsum('ij,ij->i', w, v)
        denominator = uu*vv-uv*uv
        valid = (denominator > 1e-18) & np.any(changed[ids], axis=1)
        second = (wu[valid]*vv[valid]-wv[valid]*uv[valid])/denominator[valid]
        third = (wv[valid]*uu[valid]-wu[valid]*uv[valid])/denominator[valid]
        weights = np.clip(np.column_stack([1-second-third, second, third]), 0, 1)
        weights /= weights.sum(axis=1, keepdims=True)
        ids, inner, outer = ids[valid], inner[valid], outer[valid]
        scale = np.ones(len(points))
        scale[changed] = self.radii[changed] / np.linalg.norm(points[changed]-self.center, axis=1)
        low, high = np.ones_like(scale), np.ones_like(scale)
        low[changed] = self.radii[changed] / (self.outer_r[changed]-placement.min_mm)
        high[changed] = self.radii[changed] / (self.outer_r[changed]-placement.max_mm)
        scale = np.clip(scale, low, high)
        margin = min(.005, (placement.max_mm-placement.min_mm)*.05)
        lower = inner/(outer-placement.min_mm-margin)
        upper = inner/(outer-placement.max_mm+margin)
        for _ in range(80):
            factors = scale[ids]
            denominator = np.einsum('ij,ij->i', weights, factors)
            increase, decrease = np.zeros_like(scale), np.zeros_like(scale)
            for mask, capacity, need, target in (
                (denominator<lower, high, lower-denominator, increase),
                (denominator>upper, low, denominator-upper, decrease),
            ):
                vertices = ids[mask]
                room = np.abs(capacity[vertices]-factors[mask])
                available = np.einsum('ij,ij->i', weights[mask], room)
                fraction = np.clip(need[mask]/np.maximum(available,1e-12),0,1)
                np.maximum.at(target, vertices, room*fraction[:,None])
            delta = increase-decrease
            if not len(delta) or np.max(np.abs(delta))<1e-10:
                break
            scale = np.clip(scale+delta,low,high)
        points[changed] = self.center + self.directions[changed]*(self.radii[changed]/scale[changed])[:,None]
        return points

    def calculate(self, motif, placement):
        return self.calculate_layers([(motif, placement)], placement)

    def calculate_layers(self, layers, placement):
        tone = compose_tones(self.directions, self.radius, layers)
        changed = self.editable & (tone[:, 1] > 1e-8)
        ids = np.flatnonzero(changed)
        points = self.points.copy()
        if len(ids):
            after = blend(self.wall[ids], tone[ids], placement)
            new_r = self.radii[ids] - (after - self.wall[ids])
            if np.any(new_r <= 0):
                raise ValueError("Úprava by protlačila stěnu středem koule.")
            points[ids] = self.center + self.directions[ids] * new_r[:, None]

        faces_changed = np.any(changed[self.faces], axis=1)
        before_tri = self.points[self.faces[faces_changed]].astype(float)
        centroids = before_tri.mean(axis=1)-self.center
        centroids /= np.maximum(np.linalg.norm(centroids,axis=1,keepdims=True),1e-12)
        probe = np.concatenate([self.directions,self._atlas_rays[0],centroids])
        centroid_inner, centroid_outer = self.rays.radii(centroids)
        source_inner = np.concatenate([self.inner_r,self._atlas_rays[1],centroid_inner])
        source_outer = np.concatenate([self.outer_r,self._atlas_rays[2],centroid_outer])
        if len(ids):
            points = self.constrain(points,changed,probe,placement)
        # Exact array identity outside editable alpha, including external craters.
        assert np.array_equal(points[~changed], self.points[~changed])
        after_tri = points[self.faces[faces_changed]].astype(float)
        old_normal = np.cross(before_tri[:, 1] - before_tri[:, 0], before_tri[:, 2] - before_tri[:, 0])
        new_normal = np.cross(after_tri[:, 1] - after_tri[:, 0], after_tri[:, 2] - after_tri[:, 0])
        # A relief slope can legitimately rotate its normal by over 90 degrees.
        # The signed radial orientation, rather than the old/new normal dot
        # product, detects an actual fold of this star-shaped inner surface.
        old_sign = np.einsum('ij,ij->i', old_normal, before_tri.mean(axis=1) - self.center)
        new_sign = np.einsum('ij,ij->i', new_normal, after_tri.mean(axis=1) - self.center)
        if np.any(old_sign * new_sign <= 0) or np.any(np.linalg.norm(new_normal, axis=1) < 1e-10):
            raise ValueError("Úprava obrací nebo zplošťuje trojúhelníky. Sniž sílu motivu nebo rozsah tloušťky.")

        rays = RaySampler(polydata(points, self.faces), self.center, self.radius * 1.3)
        # Validate actual triangles, not the target texture. Include all original
        # vertex directions, atlas rays, and centroids of modified inner triangles.
        inner, outer = rays.radii(probe)
        measured = outer - inner
        coverage = compose_tones(probe, self.radius, layers)[:, 1]
        # Limits concern the spherical body only; the mounting collar is fixed.
        # Body membership belongs to the source. Reclassifying it after a thick
        # edit could silently exclude the very samples we need to validate.
        body = self.shell_weight(source_inner, source_outer) >= 0.999
        affected = (coverage > 1e-8) & body
        # Compare missing intersections against the source before calling them
        # new defects: source vertex-aligned rays may already be ambiguous.
        ambiguous = (coverage > 1e-8) & ~np.isfinite(measured)
        invalid = ambiguous.copy()
        if ambiguous.any():
            invalid[ambiguous] = np.isfinite(source_inner[ambiguous])
        outside = affected & ((measured < placement.min_mm - 0.015) |
                              (measured > placement.max_mm + 0.015))
        old_outside = (coverage <= 1e-8) & body & ((measured < placement.min_mm - 0.015) |
                                                (measured > placement.max_mm + 0.015))
        samples = measured[affected]
        stats = {
            'edited_vertices': int(np.count_nonzero(np.any(points != self.points, axis=1))),
            'samples': int(affected.sum()), 'outside': int(outside.sum()),
            'invalid': int(invalid.sum()), 'untouched_outside': int(old_outside.sum()),
            'source_ambiguous': int(ambiguous.sum()-invalid.sum()),
            'min_mm': float(samples.min()) if len(samples) else None,
            'max_mm': float(samples.max()) if len(samples) else None,
            'exportable': not bool(outside.any() or invalid.any()),
            'repairs': self.repairs,
        }
        return Result(points, np.nan_to_num(measured[:len(points)], nan=self.maximum).astype(np.float32), stats)

    def binary(self, result=None):
        result = result or self.original
        return b''.join([
            struct.pack('<II', len(self.points), len(self.faces)),
            np.asarray(result.points - self.center, dtype='<f4').tobytes(),
            np.asarray(self.faces, dtype='<u4').tobytes(),
            np.asarray(result.thickness, dtype='<f4').tobytes(),
            np.asarray(self.shell, dtype='<f4').tobytes(),
        ])

    def write(self, destination: Path, result: Result):
        if not result.stats.get('exportable'):
            raise ValueError("Export blokován: ověřené vzorky upravené stěny jsou mimo meze nebo neplatné.")
        writer = vtk.vtkSTLWriter()
        writer.SetInputData(polydata(result.points, self.faces))
        writer.SetFileTypeToBinary()
        writer.SetFileName(str(destination))
        if writer.Write() != 1:
            raise OSError("Zápis STL selhal.")
