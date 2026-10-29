# AI 2D Asset Studio · Phase 0–5A/B

Editable 2D character studio with Vietnamese default UI and English option. No external AI credentials required. The Flame Knight sample now defaults to **Side 3/4 Right**, with a complete editable front-view reference retained. Both views use procedural raster assets, not AI output. Built with React/TypeScript/Vite, PixiJS v8, Zustand/Immer, Tailwind v4, Radix Dialog, Zod and a Python FastAPI API.

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

Playwright starts/reuses Vite, tests Chromium/WebGL through software rendering, and writes screenshots to `work/screenshots/`. Software rendering numbers are not real GPU frame-rate claims. See `docs/PHASE3_VALIDATION.md` for current results (older phase reports are retained) and `docs/FILE_MANIFEST.md` for files. `npm run format` formats source and docs.

## Phase 2: skeleton, mesh and procedural auto rig

New demos are already rigged. For a legacy unrigged project, click **Auto Rig** above the canvas. Open **Bộ xương** and use **Rest Pose / Pose Mode**. The demo has 23 editable bones, four IK chains, a weapon socket and five skinned alpha meshes. Drag joints/endpoints for rest/FK and cyan hand/foot rings for IK. Select a layer and use Mesh Tool or Weight Tool to edit its geometry and normalized influences. No AI provider is used.

Full instructions, behavior and limits: `docs/PHASE2_IMPLEMENTATION.md`. Verification: `docs/PHASE2_VALIDATION.md`. Schema v4 reads Phase 1/2/3 projects. Older editor builds cannot read v4 projects. Publication uses the existing test Site and preserves its URL and audience.

## Phase 3: Animation Studio

Open **Hoạt ảnh → Idle** to play, pause and scrub the five real editable Flame Knight clips. Enable Auto Key, choose a bone/IK target/mesh vertex and change its pose to record keys. Auto Key off creates an explicitly temporary preview; use Ghi pose or Track + key to persist it. Timeline supports hierarchy groups, key editing/movement/selection/copy/paste/undo, easing, FPS/duration/range, events and configurable zoom. Select clips during playback to crossfade, or enable Onion Skin to compare frames. Export real transparent animation spritesheets and metadata from Xuất dự án.

Detailed workflow, event semantics, deformation coordinate space, limits and Phase 4 recommendation: `docs/PHASE3_IMPLEMENTATION.md`. Verified tests/build/performance and file list: `docs/PHASE3_VALIDATION.md`. Progress: `docs/PHASE3_PROGRESS.md`.

## Side-scrolling and joint completion (v0.3.1)

New projects have 31 side layers, a 25-bone near/far rig and five editable side clips, plus the original 14-layer/23-bone front reference. Open **Nhân vật / Khớp** for Front/Side 3/4, Face Left/Right, independent World X and joint controls. Mirroring preserves canonical rigs, meshes, IK and keys. Full Side artwork remains unsupported.

Elbows/knees support continuous mesh, genuinely authored overlapping segments and rigid sprites. Procedural neighbour-colour completion supplies separately editable overlap/underlap textures. **Run Joint Validation** performs real alpha/geometry sweeps; Auto Repair, local mesh density, pivot, vertex and weight controls support manual correction. Strong bends can still fold LBS triangles, so warnings are retained. Imported artwork is not promised automatically seamless.

Old projects remain front-facing until **Tạo bản side procedural · giữ bản gốc** explicitly adds the supplied Flame Knight side demo. This is not AI conversion of arbitrary artwork. Both views retain independent clip, layer and bone editing. Source mesh/animation data survives rigid-mode preview changes.

Workflow/limits: `docs/SIDE_SCROLLING_IMPLEMENTATION.md`. Results/file list/screenshots: `docs/SIDE_SCROLLING_VALIDATION.md`. Progress: `docs/SIDE_SCROLLING_PROGRESS.md`. AI generation/segmentation/inpainting contracts exist, but no real provider is connected.

## Architecture and scope

`apps/web` provides the editor. `apps/api` supplies validated local disk persistence and an extensible local job executor. Shared packages separate document, renderer, editing, AI contracts and exporters. Animation evaluation and commands live in animation-core; VFX remains a future-phase boundary.

Completed scope: Phase 0 foundation, Phase 1 editor, Phase 2 skeleton/FK/IK/alpha meshes/skinning and Phase 3 editable animation tracks, playback, five clips, events, IK/deformation animation, crossfade, onion skin and spritesheet export. Real AI, VFX simulation, remote database/workers, authentication, collaboration and engine-specific exporters remain later phases. The sword flame is a static procedural sample. GIF and MP4 exports are explicitly unsupported.

Known limits: desktop-first layout requires 1000px width, no touch/mobile editing target; picking uses texture rectangles rather than alpha contours; no advanced masks/cutout tools; one 800×800 artboard; snapshot history can use more RAM with large images; no durable auth or multi-user API. Source texture edits invalidate only explicitly registered derived dependencies; none are generated in Phase 1. No server or provider secrets are bundled.

Documentation: `docs/PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `PROJECT_FORMAT.md`, `AI_PROVIDER_CONTRACTS.md`. Recommended next work is Phase 4: real editable VFX driven by animation events and bone sockets.

The user has authorized updating the existing test Site after successful builds and relevant validation. Follow AGENTS.md and the Sites workflow. GitHub commits/pushes remain separately controlled.

## Phase 4 — editable VFX Studio 0.4.0

Particles, motion-based sword ribbons, event triggers, parameter/lifetime curves, scoped filters, flipbooks, five procedural presets and local/world bone attachments integrate into the existing animation clock. VFX-only or character+VFX PNG spritesheets and editable resource JSON can be exported. Original projects remain compatible; no AI provider is fabricated. See [implementation and manual workflow](docs/PHASE4_IMPLEMENTATION.md), [progress](docs/PHASE4_PROGRESS.md), and [executed validation](docs/PHASE4_VALIDATION.md).

## Phase 5A–5B: Character Builder (0.5.0)

Click **Tự động tạo nhân vật**, choose a pre-separated sheet or independent layers, upload and use the primary button. Review exactly eight slots, masks and variants, then the assembled layers, rig, meshes and joint warnings. Confirm the right-facing source and result before opening the new editable project. The current project is backed up; both drafts can be downloaded as `.a2dstudio`. Animation templates use semantic roles; existing VFX sockets work on the generated rig.

A/B detection and assembly run locally using explicit procedural/filename/geometry heuristics. No actual AI model is configured. Full-image segmentation and anatomical inpainting require an owner-configured real HTTPS model gateway and remain unavailable otherwise. Provider contracts, setup, limits, approval/cancellation semantics and known deformation limitations: [Phase 5A/B implementation](docs/PHASE5AB_IMPLEMENTATION.md). Actual checks and screenshots: [validation](docs/PHASE5AB_VALIDATION.md). [Progress](docs/PHASE5AB_PROGRESS.md) distinguishes working A/B features from unconfigured model deployment.

## Seven-part Builder continuation

The current Builder uses seven primary parts, a head including facial artwork, version-2 builder metadata, simplified review and deterministic normalization/anchor-based assembly. Earlier eight-slot descriptions are historical. Compatibility, implementation, limitations and current verification: [BUILDER_7_SLOTS.md](docs/BUILDER_7_SLOTS.md). No push/publication is performed for this continuation.
# Gemini connection and Builder

The first secure Gemini slice adds website AI Settings, temporary encrypted server-side BYOK and seven-part semantic classification. Long-lived key storage and AI joint-image repair are still incomplete. Setup, security boundaries, files, tests and manual verification: [docs/GEMINI_IMPLEMENTATION.md](docs/GEMINI_IMPLEMENTATION.md).
