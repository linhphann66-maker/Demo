# Phase 3 validation — 2026-10-28

Implemented in `/workspace/Demo`, branch `work`, original HEAD `e6908e55f2fd65f1d70b70455361ef6f00580cc9`. The previously uncommitted Phase 2 implementation was audited and archived before editing (`work/phase3-baseline/source-before-phase3.tar.gz`, 64 source hashes, original Git status). No original source files were deleted. No commit, push or deployment was performed. The separate existing Site checkout was not modified.

## Executed checks

| Check                                                                         | Result                                                                             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Phase 2 baseline unit suite                                                   | 67 passed before Phase 3 changes                                                   |
| Phase 2 baseline API suite                                                    | 25 passed before Phase 3 changes                                                   |
| `npm run typecheck`                                                           | Passed                                                                             |
| `npm run lint`                                                                | Passed, no errors                                                                  |
| `npm test`                                                                    | 99 passed, 9 files                                                                 |
| `.venv/bin/pytest apps/api/tests -q`                                          | 48 passed; one existing AnyIO/Starlette deprecation warning                        |
| `npm run build`                                                               | Passed, production Vite output; Pixi chunk size warning remains                    |
| `npx playwright test --reporter=line`                                         | 27 passed: 8 Phase 3 + 19 Phase 1/2 browser regressions                            |
| Production preview browser smoke (port 4173)                                  | HTTP 200; Idle advanced to frame 19, one canvas, zero page errors                  |
| Actual browser-generated project through Python TestClient PUT/GET/ZIP export | HTTP 200; schema 3, five clips, 48 tracks, 164 keys, six events preserved exactly  |
| Actual spritesheet PNG pixel check                                            | Multiple distinct frame pixel hashes, nonempty artwork and transparent corners     |
| Screenshot inspection                                                         | Flame Knight skeletal playback/crossfade UI and exported Attack spritesheet viewed |
| CPU/render/resource probe                                                     | 60 layers, 164 keys, 120 measured samples; results below                           |

The first new E2E run found a genuine clip duplication defect: structuredClone could not clone an Immer draft. JSON-value cloning now works through the existing command boundary, with unit and browser regression coverage. A mesh test fixture initially lacked weights for its other vertices; the fixture was corrected to bind all vertices rather than weakening validation. Subsequent tests passed. Two intermediate development runs each recorded 26 passes: one static PNG download wait timed out and one spritesheet pixel inspection lost its browser execution context. Vite logs identified the cause: documentation writes during the runs triggered full page reloads at the matching timestamps. The focused static PNG rerun passed in 7.1 seconds. Documentation editing was stopped before the final full run. These interrupted runs are retained here rather than hidden.

## Coverage

Unit coverage: key creation/upsert/deletion/movement/duplication/copy/paste; validation of types/targets/IDs/timestamps/easing/discrete channels; numeric/stepped/Bezier/shortest/direct rotation evaluation; stable base-state scrubbing; scaled FK; visibility/opacity/attachment switching; IK target and FK/IK blend evaluation; scaled IK with both bend directions; sparse mesh offsets before skinning without source mutation; loop/once timing; multiple-loop/skip/start/restart event crossing; compatible numeric/discrete crossfade and constrained-joint blend; bounded caches; spritesheet sample planning and size caps; editable preset creation; JSON/ZIP and v0/v1/v2 loading; Auto Key versus temporary preview; command undo/redo; single-RAF ownership through 20 repeated play/pause cycles and disposal. Existing rig/mesh/document/export safety tests remain.

Phase 3 browser coverage: open five real Flame Knight clips; play/pause; pixel-different poses and deterministic same-time scrubbing; add a bone Auto Key without changing source pose; drag/copy/paste/undo/redo keys; explicit recording of a temporary pose; duration retiming/FPS/clip create/rename/duplicate/search/delete; actual DOM event dispatch and silent seek; edit/save/reload event payload; animated IK XY/blend; editable mesh offsets without changing source geometry; onion/mixer preview and timeline shortcuts; save/reload clip data; actual animated transparent spritesheet ZIP/metadata.

Phase 1/2 browser regressions: layer manipulation/history/order/visibility/hierarchy/persistence; canvas dragging/pan/zoom; image import, unsafe input rejection and static PNG/portable ZIP; desktop UI/translation/unavailable AI; 60-layer fixture; renderer lifecycle; auto rig/child FK/rest/pose/IK; mesh vertex drag/topology/weights/reset; weapon replacement preserving rig/socket/unrelated meshes; rig serialization; invalid mesh import; manual bone and unrigged mesh editing; owned mesh/index buffer disposal. Tests needing an unrigged project explicitly import `createDemo({rigged:false})`; new Phase 3 demos intentionally start rigged.

## Measured performance and resources

Environment: managed Linux container, Node 24.19.0, Chromium 141 using ANGLE SwiftShader software WebGL. A browser script created 60 layers with shared 14 source textures, the actual five-mesh rig and 164 authored keys. Walk was evaluated/rendered for 130 iterations, discarding ten warmups, followed by 30 RAF samples. These are local script measurements, not a guarantee for desktop GPUs.

- Evaluate pose + update scene + submit render: **median 1.1 ms, p95 7.6 ms**, 120 samples.
- Observed software RAF median interval: **16.7 ms**, 29 intervals. This measures browser callback cadence, not GPU-completed frame timing.
- Existing texture and mesh-position array identities remained unchanged across playback updates.
- Ten six-overlay enable/disable cycles peaked at **six** onion hierarchies and returned to zero.
- Before destruction: 60 nodes, 14 textures, zero ghosts. After destruction: **zero nodes, textures and ghosts**, no page errors.
- The actual timeline uses 164 editable keys in the default demo, with tested drag/copy/paste/history. No continuous idle ticker; repeated playback is covered by a bounded RAF unit test.

Ignored evidence: `work/phase3-performance.mjs`, `phase3-performance.json`, `phase3-real-project.json`, `phase3-api-roundtrip.json`, `phase3-final-e2e.log`, `phase3-build.log`, `phase3-production-smoke.json`, `phase3-file-changes.json`, `phase3-spritesheet.png`, `phase3-frames.json`, `work/screenshots/phase3-idle.png` and `phase3-mixer.png`. No long-duration GPU memory profiling or native hardware benchmark was performed.

## Files changed relative to the preserved Phase 2 baseline

New files:

- `apps/api/animation_models.py`, `apps/api/tests/test_animation.py`
- `apps/web/src/AnimationStudio.tsx`, `Timeline.tsx`, `useEditingDocument.ts`
- `packages/animation-core/src/commands.ts`, `evaluation.ts`, `events.ts`, `presets.ts`, `animation.test.ts`, `animation-extra.test.ts`
- `packages/document-core/src/animation-schema.ts`
- `packages/editor-core/src/animation-edit.ts`, `animation-playback.ts`, `animation-preview.ts`, `animation-state.ts`, `animation-store.test.ts`
- `packages/exporters/src/animation.ts`
- `tests/animation.spec.ts`
- `docs/PHASE3_IMPLEMENTATION.md`, `PHASE3_PROGRESS.md`, `PHASE3_VALIDATION.md`

Modified files:

- Root `README.md`, `package.json`, `package-lock.json`, `eslint.config.js`; `apps/web/package.json`
- `apps/api/main.py`, `rig_models.py`, `tests/test_rig.py`
- `apps/web/src/App.tsx`, `Viewport.tsx`, `RigPanels.tsx`, `demo.ts`, `styles.css`
- `packages/animation-core/src/index.ts`
- `packages/document-core/src/index.ts`, `rig-schema.ts`, `fixture.ts`, `document.test.ts`
- `packages/editor-core/src/store.ts`, `rig-store.test.ts`
- `packages/rig-core/src/index.ts`, `packages/render-core/src/index.ts`, `packages/exporters/src/index.ts`
- `tests/rig.spec.ts`
- `docs/ARCHITECTURE.md`, `FILE_MANIFEST.md`, `PRODUCT_SPEC.md`, `PROJECT_FORMAT.md`, `ROADMAP.md`, `VALIDATION.md`

Git status also lists the pre-existing uncommitted Phase 2 changes. The hash-based baseline comparison distinguishes those from work performed in this phase; Phase 2 implementation/validation reports and the mesh-core implementation are retained unchanged.

## Manual verification and remaining limits

Follow the nine-step workflow in `PHASE3_IMPLEMENTATION.md`: select Idle; play/pause/scrub; Auto Key a bone; drag a cyan IK ring; key a cape vertex; edit Attack events; preview crossfade/onion; save/reload or ZIP round-trip; export a spritesheet and inspect the PNG and frame metadata. `npm run dev` serves localhost:5173. The optional Python API remains independent of browser Save.

All requested Phase 3 vertical slices A–G are implemented and tested within the documented limits. GIF/MP4 and engine-specific importers are unsupported, as shown in the UI. Reference art remains simplified front-facing procedural cutout art, with a static sword flame; no physics, production gait authoring, VFX or real AI is implied. Custom overlapping IK chains use deterministic ordered solving and can interfere; unreachable/constrained/scaled targets can retain residual error. Extreme deformation can fold valid rest triangles. Spritesheets are bounded in size and metadata-aware consumers must handle the final zero-duration endpoint sample of non-looping clips.

No Safari/Firefox/mobile/touch validation, long-duration GPU leak test, physical cloth/contact solver, animation graph editor or additive mixer. The existing hosted Site still has its previous deployment. Next recommendation: Phase 4 real editable VFX emitters driven by reserved typed events and bone sockets, with deterministic evaluation, export and resource tests.
