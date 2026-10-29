# Phase 1 verification report · 2026-10-28

Historical Phase 1 evidence. Current results are in `PHASE3_VALIDATION.md`; Phase 2 results remain in `PHASE2_VALIDATION.md`.

Executed in `/workspace/Demo`. No commits or pushes. Original HEAD `3437b36` retained. Existing working tree was empty apart from `.git`; no pre-existing application source was overwritten.

| Check actually executed                                                       | Result                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `npm install --no-audit --no-fund`                                            | Success; dependencies pinned in package.json and npm lockfile |
| `npm install --save-dev prettier@3.6.2 --no-audit --no-fund`                  | Success; workspace symlinks installed                         |
| `python -m venv .venv`, `.venv/bin/pip install -r apps/api/requirements.txt`  | Success                                                       |
| `npx playwright install chromium`                                             | Chromium 141 installed                                        |
| `npm run format` and final targeted Prettier                                  | Success                                                       |
| `npm run typecheck`                                                           | Passed                                                        |
| `npm run lint`                                                                | Passed, no lint errors                                        |
| `npm test`                                                                    | **22 tests passed**, 3 files, 0 failures                      |
| `.venv/bin/pytest apps/api/tests -q`                                          | **6 tests passed**, 0 failures, 0.35 s                        |
| `npm run test:e2e`                                                            | **9 tests passed**, 0 failures, 34.6 s final run              |
| `npm run build`                                                               | Passed, final 7.91 s                                          |
| `uvicorn apps.api.main:app --host 127.0.0.1 --port 8000` + curl `/api/health` | HTTP 200, status ok, storage local, AI not-configured         |
| Vite development HTTP request                                                 | HTTP 200                                                      |
| `vite preview --host 127.0.0.1 --port 4173` + `node work/capture.mjs`         | Production HTTP 200, 14 layers, one canvas, zero page errors  |
| `npm ls --depth=0`                                                            | All declared versions/workspaces resolved                     |

## Coverage actually exercised

Unit: portable serialization round trip, v0 migration/future-version rejection, UUID uniqueness, missing references, hierarchy and asset cycles, numeric/schema safety, parent transforms, dependency invalidation, unsafe ZIP paths/extra files/bombs/encryption, raster dimensions before decode, undo/redo, ordering/visibility, save/reload, quota errors, invalid command rollback, deletion/parenting.

API: health, honest unavailable AI, atomic save/load, asset lookup, project ZIP export, listing, ID conflict, UUID path validation, unknown fields, malformed image rejection, sanitized validation errors, streamed body size enforcement.

Browser: real WebGL canvas, 14 separated character layers, property edits, undo/redo, browser save/reload, visibility/order and ZIP reimport, mouse dragging, pan/zoom, PNG export and raster import, SVG rejection, VI/EN switch, honest AI panel, 60-layer fixture, image transparency and changed composition after layer visibility edits, renderer cleanup and stopped ticker, parent deletion preserving child node, parent-coordinate dragging and reload persistence.

Screenshots: `work/screenshots/editor-vi.png` (production build, Vietnamese) and `editor-en.png` (test workspace, English). Manually inspected through the image viewer. Desktop viewports exercised: 1280×720, 1440×960, 1920×1080. No horizontal document overflow at these sizes.

Latest measured 60-layer reload plus property edit: **1421 ms** (wall clock including browser interactions and test assertions), fixture preparation 3.2 ms. This is a Chromium software WebGL run on the managed machine, not a desktop GPU benchmark or FPS guarantee. Render ticker remains stopped at rest. Resource test verifies map cleanup after renderer destruction; no long-duration GPU memory profiling was performed.

## Remaining warnings and limits

- Vite reports a 506.23 kB Pixi chunk (145.52 kB gzip); build succeeds. Additional renderer bundle splitting is a later optimization.
- API tests report a Starlette/AnyIO deprecation warning, not a failure.
- Chromium tests emit NO_COLOR/FORCE_COLOR environment warnings, not failures.
- No native GPU hardware timing, Firefox/Safari, touch/mobile or long-duration stress coverage.
- Browser Save uses localStorage; the optional Python project API is independently verified and is not automatically synchronized from the UI.
- API has no authentication and is intended for local development. Redis/PostgreSQL, real AI, rigging/meshes, animation/VFX simulation and engine exporters are outside Phase 1.
- Public deployment was intentionally not attempted: the brief forbids commits/pushes without permission, and the requested deliverable uses a Python backend. No publication approval was requested because the local implementation is complete.

## Phase 5A–5B continuation

Current executed builder and Phase 1–4 regression results, actual model availability, joint pixel sweeps, limitations, screenshots and publication evidence: [PHASE5AB_VALIDATION.md](PHASE5AB_VALIDATION.md). Implementation scope and manual steps: [PHASE5AB_IMPLEMENTATION.md](PHASE5AB_IMPLEMENTATION.md).
