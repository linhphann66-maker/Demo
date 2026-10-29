# Phase 2 verification · 2026-10-28

Repository: `/workspace/Demo`, existing `work` branch, starting HEAD `e6908e55f2fd65f1d70b70455361ef6f00580cc9`. Working tree was clean before implementation. All Phase 2 changes are local, uncommitted and unpushed. The existing Sites deployment was not changed.

## Executed checks

| Command/check                                                                          | Actual result                                                                                  |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Repository status/history/file inventory and Phase 0–1 documentation/source inspection | Completed before edits; no unrelated application source present                                |
| `npm install --no-audit --no-fund`                                                     | Installed 2 workspace links for rig-core/mesh-core; no new third-party library                 |
| `npm run typecheck`                                                                    | Passed                                                                                         |
| `npm run lint`                                                                         | Passed                                                                                         |
| `npm test`                                                                             | 67 passed, 6 test files, 0 failures, 1.60 s                                                    |
| `.venv/bin/pytest apps/api/tests -q`                                                   | 25 passed, 0 failures, 0.37 s                                                                  |
| `npm run build`                                                                        | Production build passed, final 4.43 s                                                          |
| `npm run test:e2e`                                                                     | 19 passed (9 Phase 1 + 10 Phase 2), 0 failures, 1.3 min                                        |
| `node work/phase2-final-probe.mjs`                                                     | Real browser rig: 23 bones, 5 meshes, 1055 vertices/weight records, 4 IK chains, 0 page errors |
| Actual browser-generated Flame Knight document → FastAPI PUT/GET → ZIP export          | Passed; bones, meshes, weights, attachments, slots, IK and mode preserved exactly              |
| API health via TestClient                                                              | status ok, version 0.2.0, storage local, AI not-configured                                     |
| `git diff --check`                                                                     | Passed before final handoff                                                                    |

Build retains the existing large Pixi bundle warning (508.88 kB, 146.37 kB gzip); not a build failure. API tests emit one Starlette/AnyIO deprecation warning. Playwright emits environment color warnings.

Production preview smoke also passed: HTTP 200, 23 bones, 5 meshes, 1055 vertices/weight records, 4 IK chains, zero page errors, and visible 35° arm posing in the built application. Measured auto-rig wall time was 947 ms in this production smoke (893 ms in the earlier development probe).

## Verified behaviors

Document/unit tests cover inherited FK transforms; source artwork staying in place during rest edits; layer/socket pose attachment; rest/pose parent preservation and cycle rejection; positive chain lengths and rotation constraints; reachable/unreachable IK targets with both bend signs; all 23 procedural bones and proportional scaling; alpha triangulation and hole sample rejection; vertex topology safety; UV/index/weight validation (including negative/fractional indices); linear blend skinning; manual normalization; mesh reset; fold detection; portable round trips; command rollback, undo/redo, deletion cleanup and legacy browser save migration.

API tests retain all six Phase 1 checks and add complete v2 rig/mesh persistence and archive verification; Phase 1 migration; 17 malformed rig/mesh cases for cycles, missing references, IK adjacency/zero links, triangle indices/UV/folds/degeneracy, invalid/duplicate/missing weights, source binding, masks, singular matrices, UUID collisions and joint limits. Invalid records return sanitized 422 responses.

Browser tests retain all nine Phase 1 workflows and exercise the actual editor for auto rig, bone CRUD/reparenting, 35° arm FK with changed PNG composition, inherited hand displacement, reset pose restoring the original PNG, hand/foot IK dragging with <0.05 px target error, rest-joint dragging without PNG drift, visible cape vertex deformation, manual weight editing with normalized sum, vertex addition/deletion/reset, weapon source replacement preserving unrelated rig/meshes/weights/socket, save/reload and portable reimport, invalid mesh import rollback, and manual alpha mesh generation without any skeleton. A renderer lifetime test checks owned vertex/index buffer destruction and an idle ticker.

Screenshots saved and inspected: `work/screenshots/phase2-rig.png`, `phase2-cape.png`, `phase2-pose.png`. The existing desktop regression covers 1280×720, 1440×960 and 1920×1080 without horizontal overflow.

## Measurements and limits

- Measured procedural rig generation through the real UI: 893 ms wall clock on this managed machine, including browser/test overhead. One sample, not a latency guarantee.
- Phase 1 60-layer reload plus edit regression: 1000 ms in the final full run. No native GPU FPS guarantee.
- Chromium uses software WebGL. No Firefox/Safari/mobile testing or long-duration VRAM profiling was performed. Buffer cleanup tests prove the owned buffers are destroyed, not that every possible browser/driver leak is impossible.
- Alpha mesh is a sampled approximation; exact contour constraints, very thin features and complex hole/disjoint topology need further work.
- LBS can fold at extreme poses; detection/warnings and reset are implemented, not automatic corrective deformers.
- Weight Tool edits individual vertex influences; no paint brush is claimed.
- Auto Rig is proportion-based and demo-name-based, not AI landmark estimation.
- Rest editing rebinds current landmarks. Existing animation rebasing is not included; animation itself belongs to Phase 3.
- Browser Save and the optional local Python API remain separate persistence choices. No authentication, cloud database or workers were added.

## Changed files

The exact file manifest below is generated from Git status; temporary files, dependencies and build outputs are ignored.

- `README.md` (modified)
- `apps/api/main.py` (modified)
- `apps/web/package.json` (modified)
- `apps/web/src/App.tsx` (modified)
- `apps/web/src/Viewport.tsx` (modified)
- `apps/web/src/demo.ts` (modified)
- `apps/web/src/styles.css` (modified)
- `docs/AI_PROVIDER_CONTRACTS.md` (modified)
- `docs/ARCHITECTURE.md` (modified)
- `docs/FILE_MANIFEST.md` (modified)
- `docs/PRODUCT_SPEC.md` (modified)
- `docs/PROJECT_FORMAT.md` (modified)
- `docs/ROADMAP.md` (modified)
- `docs/VALIDATION.md` (modified)
- `package-lock.json` (modified)
- `package.json` (modified)
- `packages/document-core/src/document.test.ts` (modified)
- `packages/document-core/src/fixture.ts` (modified)
- `packages/document-core/src/index.ts` (modified)
- `packages/editor-core/src/store.ts` (modified)
- `packages/render-core/src/index.ts` (modified)
- `tests/editor.spec.ts` (modified)
- `apps/api/rig_models.py` (new)
- `apps/api/tests/test_rig.py` (new)
- `apps/web/src/RigPanels.tsx` (new)
- `docs/PHASE2_IMPLEMENTATION.md` (new)
- `docs/PHASE2_VALIDATION.md` (new)
- `packages/document-core/src/rig-schema.ts` (new)
- `packages/editor-core/src/rig-actions.ts` (new)
- `packages/editor-core/src/rig-store.test.ts` (new)
- `packages/mesh-core/package.json` (new)
- `packages/mesh-core/src/index.ts` (new)
- `packages/mesh-core/src/mesh.test.ts` (new)
- `packages/rig-core/package.json` (new)
- `packages/rig-core/src/fixture.ts` (new)
- `packages/rig-core/src/index.ts` (new)
- `packages/rig-core/src/rig.test.ts` (new)
- `packages/rig-core/src/template.ts` (new)
- `tests/rig.spec.ts` (new)
