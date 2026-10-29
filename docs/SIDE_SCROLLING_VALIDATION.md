# Side-scrolling validation — 2026-10-28

Existing repository `/workspace/Demo`, branch work. GitHub HEAD remains e6908e55f2fd65f1d70b70455361ef6f00580cc9. Before changes, the 87 source files and uncommitted Phase 1–3 work were archived in ignored `work/side-baseline/source.tar.gz` with hashes and Git status. No original source files were deleted. Site publication is authorized separately in AGENTS.md; GitHub commits/pushes remain unauthorized.

## Working implementation

- Real separately authored 3/4 right-facing Flame Knight: white hair/front and back, right-angled face, black armor, red cape, near/far limbs and flaming sword.
- Two complete editable view sets: 14 original front layers/23 bones/five original clips and 31 side layers/25 bones/five new clips. Total 45 textures/layers, 48 bones, ten clips, ten joint records. The default visible library shows the active view's five clips.
- Horizontal root mirroring and independent world translation, canonical pointer/IK/vertex coordinates, rigid texture exceptions and explicit left texture support. No vertical direction or 3D imitation.
- Continuous alpha meshes spanning elbows/knees with smooth bone weights; genuinely authored upper/lower overlap textures; rigid sprite segments and armor/socket; editable procedural overlap/underlap assets.
- Actual pose sweep using alpha coverage and deformed triangle UVs, edge stretch/folds/self-intersections/weights/overlap diagnostics; persisted reports and visual locations/suggestions.
- Real repair operations, mesh density edits, source/pivot/vertex/weight editing, undo/redo and v4 persistence. Switching cloth/armor rendering mode preserves source mesh and animation records.
- Side Idle/Walk/Run/Attack/Hurt clips: planted IK stance targets with editable foot counter-rotation, opposite arm swing, cape/hair motion, forward sword action and six events.
- Strong v4 frontend/API validation and old-version migration; AI prompt/segmentation/inpainting contracts remain explicitly unavailable without a real provider.

## Checks

The final expanded browser suite passed all 36 tests in 4.5 minutes, including view-scoped regeneration and auto-rig regression cases.

- Baseline before edits: 99 unit tests; existing Phase 3 E2E and API evidence preserved.
- `npm run typecheck`: passed after implementation.
- `npm run lint`: passed.
- `npm test`: 114 tests passed, eleven files.
- `.venv/bin/pytest apps/api/tests -q`: 66 tests passed, one existing AnyIO/Starlette deprecation warning.
- `npm run build`: passed; existing Pixi chunk size warning remains.
- New focused browser suite: six initial workflows passed after correcting test image extraction to use an explicit 800×800 frame. A mirrored mouse/IK workflow and two view-scoping workflows are included in the final full suite.
- Actual browser-generated v4 document through Python TestClient PUT/GET/ZIP: HTTP 200; parts, joints, settings, view sets, meshes, weights and animations preserved exactly.
- `npm run test:e2e`: all 36 old/new browser tests passed (4.5 minutes); evidence in `work/side-final-e2e.log`. The isolated scrub rerun also passed; earlier failed runs remain archived.

## Pixel evidence

The isolated actual Pixi/WebGL test hides unrelated art so a torso or near limb cannot conceal a gap. It renders both elbows and both knees in all three deformation modes at four representative angles each: **48 cases, 19,200 pixel samples, zero transparent core pixels (alpha <16)** in the first passing focused run. Elbow angles -120/-90/-45/30; knee angles 0/45/90/120; representative parent rotations included. Coverage disk radius is 60% of the source joint radius. The final full run regenerates `work/side-pixel-sweep.json`.

The editor's separate sampled mask sweep checks 638 core samples at six elbow/five knee angles. Initial results: zero uncovered samples; 32 geometric warnings (folded/collapsed triangles, stretching or self-intersections at strong bends). These warnings are retained rather than hidden behind the completion patches. Pixel coverage verifies no holes in the tested core, not perfect material deformation at arbitrary angles.

A rendered-image reflection test compares the actual right image with the reflected left image and verifies an asymmetric rigid marker keeps its orientation. Source bones/mesh/IK/keys stay identical. Sprite export checks multiple distinct frame pixel hashes and six Attack event records. Foot-plant unit tests evaluate actual IK poses at stance timestamps and verify ankle ground Y and rest foot orientation.

Screenshots/artifacts: `work/screenshots/side-front-reference.png`, `side-right.png`, `side-left.png`, `side-attack.png`, `work/side-spritesheet.png`, `side-frames.json`, `side-pixel-sweep.json`, `side-real-project.json`, `side-api-roundtrip.json`, `side-unit.log`, `side-api.log`, `side-build.log`, `side-all-e2e.log`. Original Phase 1–3 reports remain historical. All visual verification uses Chromium software WebGL; no native GPU, Safari, Firefox, touch/mobile or long-duration GPU profiling is claimed.

## Files

New: `apps/web/src/CharacterPanel.tsx`, `sideDemo.ts`; `apps/api/character_models.py`, `tests/test_character.py`; `packages/document-core/src/character-schema.ts`, `character.ts`; `packages/rig-core/src/side-template.ts`; `packages/animation-core/src/side-presets.ts`; `packages/mesh-core/src/joint-completion.ts`, `joint-validation.ts`, `joint-fixture.ts`, `joints.test.ts`; `tests/side-scrolling.spec.ts`; the three `docs/SIDE_SCROLLING_*.md` reports.

Modified: existing document/rig/animation/editor/render/export integration files, App/Viewport/RigPanels/AnimationStudio/demo/styles, API main/models, AI contracts, schema migration expectations and explicit legacy test fixture setup, Vite's watch exclusions for docs/backend/tests, root/web package versions and lockfile, README and relevant format/architecture/provider docs. A final hash-based file comparison is written to `work/side-file-changes.json`.

## Try it and limits

`npm ci && npm run dev`, open localhost:5173. On a new project use **Nhân vật / Khớp**, compare Front and Side 3/4, Face Left/Right, run validation, select Near Elbow, change deformation mode or repair, then use the existing mesh/weight inspector. Select Walk/Attack in Hoạt ảnh; scrub and edit keys; save/reload or export a project/spritesheet.

An older saved front project stays unchanged until **Tạo bản side procedural · giữ bản gốc** is explicitly selected. This adds the supplied side demo; it does not infer a new side image of arbitrary uploaded art. Imported joint registration requires real opaque source coverage around adjacent bones. Repair can require source painting, pivot placement, weight/vertex editing or different segment artwork.

Limitations: Full Side art, real AI generation/segmentation/inpainting, arbitrary-speed/terrain contact solving, production gait retargeting and physics are unimplemented. Rigid mirror exceptions require consistent texture dimensions/pivot alignment; independent left rigs are not synthesized. Severe LBS bends can pinch/fold even where alpha completion hides gaps. Non-loop spritesheets include a terminal zero-duration endpoint as documented in Phase 3. GIF/MP4 and engine importers remain unsupported.

Next: improve the art-aware silhouette/texture metrics beyond a core disk, add corrective joint shapes or more advanced skinning for folds, author full-side assets if needed, and connect genuine provider adapters only with provenance, editable region output and review. Keep Phase 4 VFX separate.
