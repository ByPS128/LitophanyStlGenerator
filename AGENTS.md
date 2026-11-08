# Project guidance

Read `README.md`, `spherical/README.md` for the area being changed, and
`docs/decisions.md` for delivered architecture decisions.

- The .NET 8 console application owns flat lithophanes. `spherical/` owns the
  Python/VTK geometry engine and TypeScript/Three.js local editor.
- Keep source models, user images, generated STL/render outputs and virtual
  environments out of Git. Do not modify files in `LithophaneStlGenerator/Sources`.
- Preserve unedited vertex coordinates exactly. Alpha zero and strength zero
  must be no-ops, including source thickness outside configured bounds.
- Do not claim that sampled wall checks prove global printability. Keep the
  fast optical approximation distinct from verified mesh/export state.
- Run `python -m pytest spherical/tests -q` with the project environment and
  `npm test` / `npm run build` in `spherical/web` after relevant changes.
- The local HTTP service must bind to loopback and reject cross-origin writes.
- Document limitations of the optional Blender path until actually tested.
