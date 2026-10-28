# Phase checklist

Phase 0 and 1 are the only implementation scope. Verification status is recorded in VALIDATION.md after commands actually run.

## Phase 0

- [x] Inspect repository (empty tracked working tree; existing Git history preserved)
- [x] Monorepo boundaries, frontend/API/test configuration
- [x] Canonical versioned document and AI provider contracts
- [x] Product, architecture, project format and roadmap docs

## Phase 1

- [x] Responsive editor and functional Pixi renderer verified
- [x] Image import, hierarchy, transforms, ordering, visibility verified
- [x] Pan/zoom/fit, properties, command undo/redo verified
- [x] Save/reload, ZIP round trip and PNG export verified
- [x] Separable procedural Flame Knight demo verified
- [x] API health, tests, typecheck, lint, build verified

## Next phases — not implemented

2. Editable humanoid rig, transforms, two-bone IK, triangulation and skinning.
3. Editable tracks, five reference clips, interpolation and timeline events.
4. Parameterized particle emitters, attachment and timing.
5. Real configurable providers, verified preview/approval pipeline.
6. Auth, database/workers, collaboration, production hardening, engine exporters.
