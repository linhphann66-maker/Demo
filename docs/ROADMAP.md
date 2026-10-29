# Phase checklist

Phase 0–1 were implemented and verified previously; the current task adds Phase 3 in the same repository. Detailed Phase 2 evidence is recorded in PHASE2_VALIDATION.md after commands actually run. No push or deployment is part of this task.

## Phase 0–1 — retained

- [x] Document model, provider contracts, workspace and architecture docs
- [x] Pixi viewport, 14-layer procedural sample and image import
- [x] Selection, transforms, hierarchy, visibility, order and properties
- [x] Command undo/redo, pan/zoom/fit
- [x] Browser save/reload, portable ZIP and transparent PNG
- [x] Local FastAPI project/asset/export API

## Phase 2 — verification checklist

- [x] Bone CRUD, parent hierarchy, FK, rest/pose and joint dragging
- [x] 23-bone procedural humanoid template, attachments and weapon socket
- [x] Two-bone hand/foot IK, bend direction and joint constraints
- [x] Alpha mesh creation, vertex edits/add/delete/reset and overlays
- [x] Editable normalized weights and actual linear blend skinning
- [x] Source image replacement preserves unrelated rig and meshes
- [x] v2 browser/ZIP/API persistence and legacy migration
- [x] Phase 1 regression tests, Phase 2 automated workflows, typecheck and build

## Phase 3 — Animation Studio

- [x] Typed editable clips/keys/events, v3 migrations and deterministic evaluation
- [x] Bone/layer/mesh/IK/attachment tracks and easing
- [x] Timeline hierarchy, selection, key editing, clipboard and undo/redo
- [x] Auto Key, temporary preview, real five-clip Flame Knight playback
- [x] Events, persistence, crossfade and bounded onion skin
- [x] Actual transparent spritesheet PNG and metadata export
- [x] Unit/API/E2E checks and measured resource/performance evidence (PHASE3_VALIDATION.md)

## Next phases — not implemented

4. Procedural particle emitters, attachments and timing.
5. Real configurable AI providers and verified preview/approval pipeline.
6. Auth, database/workers, collaboration, production hardening and engine exporters.

## Current continuation: Phase 4 and 5A–5B

Phase 4 is implemented and validated as recorded in PHASE4_PROGRESS.md / PHASE4_VALIDATION.md; the earlier "next phases" list is historical. Phase 5A–5B now has a working procedural sheet/layer → review → editable assembly → rig → mesh → joint validation → save workflow with animation/VFX integration. PHASE5AB_PROGRESS.md tracks completion honestly. Real model deployment/evaluation is still pending; HTTPS provider adapters alone do not complete semantic segmentation/inpainting. Phase 5C should use validated commands and approval rather than replacing editable source data.
