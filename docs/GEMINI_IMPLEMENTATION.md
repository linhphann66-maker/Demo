# Gemini integration — audit and progress

## Audit, 2026-10-29 (before behavior changes)

- Existing React/Vite/Pixi editor and FastAPI project API are retained. Project schema v4, characterBuild v2 already have exactly seven slots. Normalization and alpha-based anchor assembly exist and passed their regression suite.
- Baseline: 178 unit tests and 134 API tests passed. Working tree contains previous Phase 1–5 work; no GitHub commit/reset is performed.
- Detection uses connected components, filename aliases, paired-row geometry and conservative confidence thresholds. Unnamed/ambiguous parts remain unknown. This can yield 3/7 selections; there is no semantic model connected by default. Anatomical left/right cannot be inferred reliably from sheet position.
- Fragment filtering and three-candidate limits can reject useful candidates before semantic review. Gemini input must include recoverable extracted candidates, stable IDs, original coordinates, numbered overview, and real images; it must never be presented as pixel segmentation.
- Scale/position errors can follow wrong slot assignments or approximate alpha/PCA anchors. Existing non-destructive uniform torso-relative normalization and editable normalized anchors are reused, not replaced with model-invented transforms.
- Backup is created only on the final save/open action, but Restore is enabled earlier and unconditionally reads browser storage. This explains `Chưa có backup Builder`. Cancellation already edits an isolated draft; backup/restore needs an explicit lifecycle and coherent editor history.
- FastAPI has no account authentication or per-user credential store. Existing optional model gateway uses server environment configuration and global jobs, not BYOK. New AI endpoints must use independent server-issued sessions, CSRF protection, owner-scoped jobs, encrypted memory and safe errors; client-supplied user IDs are never trusted.
- Existing Site is a static Vite bundle. Python cannot run in its Cloudflare Worker runtime. The deployment needs a same-origin server adapter, with equivalent contracts, before browser key configuration can work. Official Python SDK is used in FastAPI; a server-only official JavaScript SDK adapter is appropriate on Workers. Browser SDK/API-key calls are forbidden.
- No Gemini credential is configured in this execution environment. All automated provider calls will be mocked. Real model access/capabilities are discovered with the user's key, with no silent model substitution or invented success.

## Checklist

- [x] Audit and baseline
- [x] Secure session BYOK and model discovery/probes
- [x] Gemini seven-part analysis and review
- [x] Backup lifecycle regression fix
- [x] Same-origin hosted backend (packaged; publication recorded below)
- [x] Final browser regression (publication result retained in `work/gemini/deployment.json` after deployment)
- [ ] Full joint-repair approval workflow (separate from initial connection/analysis slice)

Official API references: https://googleapis.github.io/python-genai/ and https://ai.google.dev/gemini-api/docs/structured-output . No real provider usage is implied by mock tests.

## Working slice

The main toolbar and Builder open Vietnamese AI Settings. Users enter a key, inspect actual account-visible model IDs, run a tiny image/structured-JSON probe, save or delete the key, and explicitly consent before sending character images. Defaults are `gemini-3.8-flash` and `gemini-nano-banana-2.1`; IDs are never silently replaced. Model-list membership and proven capabilities are separate. Image generation/editing remain **unverified and unavailable** in this slice.

An unsaved connection test has separate pending metadata: testing a second key/model cannot change the active credential or authoring provider. Only Save commits a matching tested result. No decrypted key is returned, and Save clears the password field.

FastAPI uses official `google-genai==2.34.0`, Pydantic schemas, validated Pillow decoding, and a bounded background executor. Sites runs the same-origin `apps/worker` backend using official server-only `@google/genai@2.32.0`, with the checked-in Pydantic response JSON Schema and independent strict Zod reference validation. The React editor, Pixi renderer, layers, rigs, meshes, clips, VFX and file format remain in their existing packages. No Gemini SDK or key is included in browser modules.

Builder sends original sources, a numbered candidate overview, cropped transparent candidate images, stable candidate/source UUIDs and original bounding boxes. Duplicate/rejected variants remain recoverable and may be reviewed by Gemini; more than 48 candidates requires review first. The model cannot invent IDs, reuse a selected candidate or invent a mandatory slot. The classifier does **not** generate segmentation masks. Extracted masks are still the existing procedural alpha/border-background masks.

Exactly seven editable cards show model confidence. Uncertain anatomical laterality requires explicit confirmation; the rig function also checks this guard. Manual candidate reassignment can correct a known wrong AI label, including switching to an image previously assigned elsewhere. Optional cloak/sword assets remain outside the seven slots. Accepted anchors feed the existing torso-relative uniform-scale assembly and editable anchor controls; back-to-front model order is persisted. The existing rig/mesh pipeline and five clips remain semantic-role based.

`characterBuild.aiReview` is optional, backward compatible and mirrored in Python: model/job/time, viewpoint/facing, confidence, anatomical uncertainty, near/far metadata, render order and outstanding review IDs survive `.a2dstudio` save/load. Anchor positions and non-destructive transforms use the existing assembly records. Keys never enter ProjectDocument.

Backup Restore is disabled for absent/corrupt snapshots. A complete validated source backup is written before applying a built project. Restore replaces optional fields as well as required fields, avoiding dangling Builder IDs; its history entry supports undo/redo. Closing an unfinished wizard keeps the active project. Browser quota/storage failures are reported and source data remains exportable.

## Security and limits

- **Temporary-session mode only.** No database credential vault or cross-session key persistence is claimed. The future-session checkbox is explicitly unavailable. AES-256-GCM encrypts keys in bounded server RAM using a nonpersisted process/isolate key and session/account-associated data. Sessions expire after one hour; server restart, redeploy or a different Worker isolate can end a session sooner. Reenter the key through Settings when needed.
- Hosted identity comes from Sites dispatch, not a client-selected user ID. A session also belongs to that authenticated owner. FastAPI, which has no account authentication, uses only an unguessable server-issued session cookie and intentionally ignores user-ID headers for authorization. Do not expose the standalone Worker outside the trusted Sites identity boundary.
- HttpOnly, SameSite=Strict cookies; Secure on production HTTPS; same-origin/Fetch Metadata checks; CSRF token required for mutations; no permissive CORS. AI JSON responses use `Cache-Control: no-store`; provider exceptions and validation errors never echo credentials or image data.
- No keys in localStorage, sessionStorage, IndexedDB, project files, URLs, source, environment files, analytics or logs. Plaintext exists only transiently during HTTPS input/provider requests. Old credentials are not silently reused after a key change.
- Ten expensive operations/minute per session on local FastAPI; per authenticated account **within a Worker isolate** on Sites. One active analysis per owner/session, two active jobs per process/isolate, bounded 128 sessions and 16 job records/session. These in-memory limits are not a distributed global monetary cap.
- Client timeout 85s; SDK timeout 65s and one attempt (no automatic retry). Worker queued jobs expire after 90s. Cancellation discards pending results and aborts supported Worker requests; Google may still charge for operations already accepted. Python keeps capacity reserved until its provider call actually ends.
- Per-session classification cache: 15 minutes, eight results; isolated from other owners. Request contents/model determine the cache key. Usage records contain returned token counts (last 50 entries), not a live spending ledger or price estimate.
- Upload limits remain 16 images, 8 MiB source bytes, 4096 px/corner. AI input max 48 candidates and 40 megapixels. FastAPI accepts up to 12 MiB total inline image bytes; Sites limits total inline image bytes to **7 MiB** and HTTP request bytes to 10 MiB to respect its 128-MB runtime. Large images require smaller inputs. Worker verifies raster signature/MIME/dimensions; browser/Python perform full decoded-image validation.
- Production CSP keeps scripts/connects same-origin. The official `pixi.js/unsafe-eval` adapter actually supplies **eval-free** shader/uniform implementations; it permits rendering without allowing `unsafe-eval`. Existing Google Fonts domains are explicitly allowed. No external AI request is made by the browser.

## Deliberately incomplete

This is the requested **first secure connection + seven-part analysis workflow**, not completion of all master-prompt acceptance criteria.

- No real key is configured in the execution environment, so neither default model was called with real credentials and no recognition-accuracy claim is made. Automated Google responses are mocks.
- `POST /api/ai/joint/repair` explicitly returns 501. The complete paid image-editing flow, controlled-mask patch extraction, before/after approval, retry/reject, patch weights and pose-sweep acceptance remain to be implemented together. Existing procedural joint completion still works. No decorative AI repair button or successful AI texture is fabricated.
- Complete-illustration segmentation still requires the existing separate real segmentation gateway. Gemini classification is not pixel-accurate segmentation or inpainting.
- Long-lived encrypted database BYOK, durable/distributed jobs and quotas, AI rig planning, new style-specific proportion presets, direct anchor-point drag gizmos and AI animation/VFX planning remain follow-up work. Existing numeric anchor editing, rig controls, procedural normalization and Phase 3–4 editors remain usable.
- Chromium mobile viewport is tested; physical iPhone Safari has not been run here.

## Commands and manual verification

Local: `.venv/bin/pip install -r apps/api/requirements.txt`, then `.venv/bin/uvicorn main:app --app-dir apps/api --host 127.0.0.1 --port 8000` and `npm run dev`. Vite proxies `/api` to FastAPI. Production: `npm run build:site` builds the existing editor and packages a Sites Worker containing its assets. Preserve the existing Site ID and private audience; publish the pushed source and matching Worker artifact. No backend environment key is needed for temporary-session BYOK.

1. Open **Cài đặt AI** on the deployed Site. Enter your own key (do not paste it into chat), select models actually visible to that key, click **Kiểm tra kết nối**, then **Lưu API Key**. The real connection probe may incur Google usage.
2. Open **Tự động tạo nhân vật**, upload a separated sheet or independent PNGs, consent to sending images, then choose **Tự động tạo nhân vật bằng Gemini**.
3. Review seven cards. Confirm flagged anatomical sides or change the candidate; use mask editing as needed. Normalize and **Lắp thử**; advanced mode still exposes anchors and transforms.
4. Generate the rig and meshes, inspect joints, finish and save. Reload; inspect clips and VFX attachments. Reopen Builder and restore the previous project; undo/redo should retain both complete documents.
5. Delete the key in Settings. Starting another analysis must request configuration. The saved project must contain no API key.

Project-owned CC0 fixtures under `tests/fixtures` are used, including seven independently editable sprite parts. No inaccessible user reference image is embedded.

Evidence: `work/gemini/changed-files.json`, `unit.log`, `api.log`, `typecheck.log`, `lint.log`, `build.log`, `e2e-final.log`, `worker-smoke-final.log`. Screenshots: `settings-mobile.png`, `gemini-assembled.png`, `hosted-worker-settings.png` in that directory. The built Worker smoke test rendered the actual canvas and opened the real Settings backend with zero browser errors; the loopback QA identity is confined to an ignored test script and never packaged.

## Actual validation

- Baseline: 178 unit / 134 API tests.
- Final TypeScript check and lint (including Worker): passed.
- Unit: **193 passed**, 16 files. Includes encrypted-session isolation, model availability, unsaved test isolation, reference rejection, rate limits, abandoned-job cleanup, seven-part AI review/rig gating and backup history. Async cryptography starts inside a Worker request, never during module initialization.
- API: **161 passed**, including the browser-produced AI character project roundtrip. All Google operations are mocks. Existing AnyIO/Starlette deprecation warning remains.
- Full browser suite: **53 passed in 8.0 minutes**. Covers Phase 1–4 regressions, seven-part import/normalization/masks, AI Settings mobile, mocked Gemini seven-part analysis, uncertain-limb confirmation, rig/mesh, persistence and backup restoration. Initial development runs identified stale dropdown expectations, source-change reloads, and unsynchronized captures; the stable full run passed after correcting review selectors and ignoring server/build files during Vite QA.
- Targeted final Gemini browser check: **2 passed**, also producing `work/gemini/ai-character.json` for the actual API roundtrip test.
- Production `npm run build:site`: passed, including TypeScript, Vite editor and the server-only Worker bundle. Existing >500 kB chunk warning remains. Actual built-Worker smoke: canvas + AI Settings with **zero browser errors** after the CSP-safe Pixi fix.
- Real-browser 60-layer regression recorded **36 ms** fixture preparation and approximately **1.5 s** reload + edit in the first run; these are environment measurements, not a fixed FPS guarantee. Worker bundle is approximately 2.3 MB uncompressed and embeds the existing editor assets. Quotas/memory limits are bounded as above; no real model latency or API cost was measured.
- A real browser-produced `.a2dstudio`-compatible AI character JSON is also checked through FastAPI save/load. No real Gemini credential or generated repair texture is claimed.

Application source changed in 40 files; the exact task-scoped inventory is `work/gemini/changed-files.json`. Main additions: `apps/api/gemini_{api,models,provider}.py`, `apps/web/src/{AISettings,ai-client,gemini-input}`, `apps/worker`, `packages/ai-contracts/src/gemini*`, `packages/character-builder/src/gemini.ts`, `packages/editor-core/src/builder-backup*`, `tests/gemini.spec.ts`, `scripts/build-hosted.mjs`. Existing Builder/schema/layout/render modules receive bounded integration changes; `.openai/hosting.json` now declares the same Site as a Worker. GitHub HEAD remains unchanged; only the separately authorized Sites source repository is published.
