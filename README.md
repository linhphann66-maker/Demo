# AI 2D Asset Studio · Phase 0–1

Editable 2D character studio with Vietnamese default UI and English option. No external AI credentials required. The local Flame Knight sample uses **14 separate procedural raster assets**, not AI output. Built with React/TypeScript/Vite, PixiJS v8, Zustand/Immer, Tailwind v4, Radix Dialog, Zod and a Python FastAPI API.

## Run locally

Prerequisites: Node.js 22+ (tested 24.19.0), npm (tested 11.9.0), Python 3.12, desktop browser with WebGL. From the repository root:

```bash
npm ci
npm run dev
```

Open **http://localhost:5173**. The editor works without the API. To start the optional local project API in a second terminal:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r apps/api/requirements.txt
uvicorn apps.api.main:app --host 127.0.0.1 --port 8000
```

On Windows activate using `.venv\Scripts\activate`. API health: **http://localhost:8000/api/health**. API documentation: **http://localhost:8000/docs**. Vite proxies `/api` to port 8000. Use `A2DSTUDIO_DATA_DIR` to select a local storage directory; otherwise files go to ignored `apps/api/data/`. Start the API on loopback only: it is a local development adapter with no authentication.

## Use the editor

- Select a layer in the left panel or directly on the canvas. Drag it to move. Edit position, scale, rotation, opacity, name, visibility or parent in the inspector.
- Eye and lock controls appear beside layers. Forward/backward adjusts draw order. Children use local coordinates; reparenting changes world placement. Cyclic parents are rejected atomically.
- Scroll to zoom; use the hand tool or middle mouse to pan. Fit and grid controls are below the canvas.
- **Save / Ctrl or Cmd + S** stores the full project in this browser. Reload restores saved transforms, order, metadata and source images. Unsaved edits trigger a browser leave warning.
- **Export → editable project** downloads a portable ZIP-based `.a2dstudio` file; Import reopens it. **Export → transparent PNG** renders the current 800×800 artboard without UI/grid/selection. Outside-artboard content is clipped.
- Add PNG/JPEG/WebP artwork via the left plus control. Maximum 8 MiB/image and 4096 pixels/side. SVG and scripts are refused. Full editable project: max 20 MiB; see format doc for safety limits.
- Ctrl/Cmd+Z undoes. Ctrl+Y or Cmd+Shift+Z redoes. Undo history is session-local and capped at 80 commands; the document's revision audit persists.

The Python API exposes `GET /api/projects`, `PUT/GET /api/projects/{uuid}`, `GET /api/projects/{uuid}/assets/{uuid}`, and `GET /api/projects/{uuid}/export`. Send canonical JSON to PUT. The browser's Save uses browser storage, not the optional API; this distinction is deliberate and visible in the interface. AI capabilities report unavailable and job requests return 503 rather than fake progress.

## Verify

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
.venv/bin/pytest apps/api/tests -q
```

Playwright starts/reuses Vite, tests Chromium/WebGL through software rendering, and writes screenshots to `work/screenshots/`. Software rendering numbers are not real GPU frame-rate claims. See `docs/VALIDATION.md` for actual results and `docs/FILE_MANIFEST.md` for files. `npm run format` formats source and docs.

## Architecture and scope

`apps/web` provides the editor. `apps/api` supplies validated local disk persistence and an extensible local job executor. Shared packages separate document, renderer, editing, AI contracts and exporters. Animation/VFX packages are explicit future-phase boundaries.

Completed scope: Phase 0 foundation and Phase 1 editor. Rigging, mesh deformation, IK, keyframe playback, procedural particle simulation, real AI, remote database/workers, authentication, collaboration, spritesheets and engine-specific exports remain later phases. The sword's flame is clearly labelled a static procedural sample. Five animation names are planned metadata, not working clips. No phase 2+ control pretends to be active.

Known limits: desktop-first layout requires 1000px width, no touch/mobile editing target; picking uses texture rectangles rather than alpha contours; no advanced masks/cutout tools; one 800×800 artboard; snapshot history can use more RAM with large images; no durable auth or multi-user API. Source texture edits invalidate only explicitly registered derived dependencies; none are generated in Phase 1. No server or provider secrets are bundled.

Documentation: `docs/PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `PROJECT_FORMAT.md`, `AI_PROVIDER_CONTRACTS.md`. Recommended next work is Phase 2: an editable humanoid rig and simple mesh/skinning vertical slice.

The initial implementation was kept local. GitHub synchronization was subsequently authorized by the user; public application hosting is not configured.
