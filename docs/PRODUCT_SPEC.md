# AI 2D Asset Studio

Phase 0–1 implementation. AI automates work; users keep editing control. The canonical document, never a flattened image, is the source of truth. Vietnamese is the default, English is selectable.

Phase 1 delivers a desktop editor, a deterministic separated procedural Flame Knight (Battle Mage, white hair, black armor, red cape and flaming sword), image import, layer selection and dragging, visibility, ordering, parenting, property edits, pan/zoom/fit, undo/redo, local save/reload, validated ZIP project import/export, and transparent PNG export. Source artwork is labelled procedural or user-created. No AI credentials required.

Rigging, meshes, animation playback, semantic segmentation, manual masks and VFX simulation are not Phase 1 features. Their panels state their phase explicitly. Five planned animation names are metadata only. No fabricated progress, AI outputs or provider calls.

Acceptance: strict build, document and editing unit tests, API tests and browser workflows for persistence, import/export and direct manipulation. Performance is measured, never guaranteed.

## Phase 2 scope

Editable skeletons, procedural humanoid auto rig, local/world FK, two-bone IK, rest/pose separation, layer/socket binding, sampled alpha meshes, per-vertex weights and actual linear blend skinning are now the requested implementation scope. They share the Phase 1 document and command history. Animation playback, semantic segmentation, manual masks and VFX remain outside this phase. See PHASE2_IMPLEMENTATION.md and PHASE2_VALIDATION.md for verified behavior and limitations.

## Current Phase 3 scope

The historical Phase 1/2 scope above is retained for context. Animation Studio now provides real editable clips/tracks/keys/events; deterministic bone/layer/mesh/IK/attachment evaluation; interactive timeline and undo/redo; measured-time playback; five procedural Flame Knight clips; Auto Key and explicit temporary pose editing; crossfade; onion skin; complete v3 persistence; and actual transparent spritesheet export. Phase 4 VFX and Phase 5 real AI remain absent. Full workflow and limits: PHASE3_IMPLEMENTATION.md. Completion evidence: PHASE3_VALIDATION.md.
