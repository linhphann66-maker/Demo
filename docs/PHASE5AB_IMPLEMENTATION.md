# Phase 5A–5B — editable Character Builder (0.5.0)

This continues the existing editor, document, rig/mesh, animation and VFX packages. It does not replace Phase 1–4. **The working default is local procedural detection/assembly, not AI semantic understanding.** Real model gateways are optional and no actual model is configured in the validation environment or hosted static Site.

## Working workflow

1. Open **Tự động tạo nhân vật** in the top toolbar. Choose A (one pre-separated sheet) or B (independent PNG/JPG/WebP layers), upload, then use the primary button.
2. Browser Worker detects alpha components or removes a solid background by border-connected flood fill. Disconnected small islands can group with a larger nearby component. B preserves each image as one candidate. It does not indiscriminately erase all white pixels.
3. Exactly eight primary slots are recommended: head base, face, hair, torso, left/right arm, left/right leg. Filename/layout/shape guesses have explicit confidence and warnings. Alternate heads/hair/body stay as candidates, with only one selected per slot. Unsupported layouts can require manual labels/selection/merge/split/mask correction.
4. If all slots are present, the button assembles, rigs, meshes, creates five editable clips and runs a joint sweep. If not, it stops at review. Geometry/layout heuristics do not verify anatomical compatibility or synthesize a side view.
5. Review candidate masks (eraser/paint/restore and source preview), slot labels/variants, material and facing; move/rotate/scale/pivot/order layers in Assembly. Edit bone/rest/pose and IK X/Y in Rig. Mesh/Weight/Bone tools remain available in the existing editor after finishing.
6. Review the sampled joint report and generated fill regions. Per-joint mode, overlap/underlap and explicit procedural repair are editable/undoable. Strong bends can retain inversion/stretch warnings.
7. Confirm right-facing artwork and review, then **Lưu & mở trong Animation / VFX Studio**. A candidate explicitly labeled left-facing blocks finish. The draft becomes a new editable project document in the same app only after approval. Source editor document is backed up under `a2dstudio.builder.previous`; a restore button and downloads of both projects are available. If browser quota fails, the old editor document remains open and a portable download is offered.

A source image must already depict a suitable side/three-quarter-right part. The builder does not rotate front-view illustrations into side-view anatomy. No missing user reference image was downloaded or embedded; the integration fixture is original procedural CC0 artwork.

## Module boundaries

- `character-builder/detect.ts`: bounded RGBA masks, flood fill, connected components, detached-island grouping, heuristic labels and one-per-slot selection.
- `images.ts`: validated browser image decode, cancellable Worker orchestration, crop/alpha PNG extraction, explicit manual merge/split. Original source bytes remain embedded and untouched. Alpha uses minimum source/mask coverage rather than multiplying original alpha twice.
- `assembly.ts`: ordinary layer records, side coordinate template, PCA limb axis/pivot estimates, actual part-proportion landmarks, existing side-template hierarchy and attachments, alpha-derived meshes, weights, procedural covers, sampled sweeps and semantic clip retargeting.
- `model-results.ts` / `provider.ts`: typed/validated external outputs, explicit candidate IDs, generated variants and provenance. Source/mask and generated texture remain separate assets.
- `CharacterBuilder.tsx`: guided Radix dialog, independent draft history (12 snapshots), commands recorded in revision history, validation before each commit, cancellation and final approval. The original editor command history/document remain untouched while previewing. Once opened, existing editor commands provide ordinary undo/redo; deletion prunes only invalid builder mappings and clears approval.
- `BuilderPreview.tsx`: one temporary existing SceneRenderer for the isolated draft preview, properly destroyed on close. No alternate animation/VFX implementation.
- `builder_provider.py`: optional server-only gateway and bounded jobs. `builder_models.py` mirrors persisted data in FastAPI. The only compatibility changes outside this feature are optional builder records, pruning deleted mappings, and the hip joint kind plus optional validation-kind selection; old sweep defaults remain elbow/knee.

## Rig, deformation and integration

A generated rig has 25 stable-ID bones, four two-link IK targets and a weapon socket. Near/far labels map semantically to new IDs; the old Flame Knight IDs are never assumed. Rest/local transforms follow actual assembled part transforms. A full arm or leg texture spans its internal joint; its mesh blends upper/lower influences. It is not falsely split into two independently articulating rigid sprites.

Soft limbs, hair and torso use the existing alpha-derived bounded Delaunay mesh pipeline, UVs, safe topology and normalized weights. Rigid parts remain single-piece attachments; rigid material warns that internal bones do not magically bend one sprite. Source mask/texture, pivot, mesh and weights remain editable. Continuous mesh, overlap/underlap and rigid preview modes reuse the existing joint renderer. Soft imported limbs also retain two separately editable procedural alpha regions extending across the estimated internal joint, attached to upper/lower bones; these are alternatives to the untouched full-limb mesh. They prevent a mode switch from hiding the source limb. Neighbour-fill covers supply extra coverage, without claiming occluded anatomical reconstruction. Overlap-size edits regenerate these masks. Shoulder/hip cover textures sample neighboring pixels; elbow/knee completion uses the existing editable procedural patch system. These are color/coverage repairs, **not AI reconstruction**.

Sweep angles are 0/20/45/70/90/120 degrees (negative elbow bend). CPU mask/triangle tests identify coverage, stretching, inversion and likely seams. They are sampled diagnostics, not a guarantee for arbitrary imported anatomy. Real Pixi pixel sweeps are also run on the supplied integration fixture. Repairs are explicit and do not delete original artwork.

Idle, Walk, Run, Attack and Hurt are ordinary tracks authored using the existing procedural side presets; foot IK is retargeted to the new limb lengths/rest targets. Attack events remain editable. They are starting templates, not bespoke motion-capture or guaranteed foot-contact animation for all artwork. VFX uses the canonical rig/socket model unchanged. No sword or cape artwork is invented for an eight-part import that lacks it; a socket can still host an effect or later weapon asset.

## Provider setup and exact availability

The application integrates a **real HTTP gateway adapter**, not a bundled pretrained model or a fabricated response. No semantic/segmentation/inpainting/landmark model is configured or exercised as a real model in this environment. Contract tests use explicitly labeled mocks only. Mode C stays blocked when segmentation is unavailable; A/B remain local and work without API or credentials.

Server configuration (never browser secrets):

- `A2DSTUDIO_BUILDER_PROVIDER_URL`: HTTPS model gateway base URL.
- `A2DSTUDIO_BUILDER_PROVIDER_TOKEN`: optional server-only bearer token.
- `A2DSTUDIO_BUILDER_ALLOW_LOCAL=1`: explicit opt-in for HTTP localhost development gateways.
- Optional public `VITE_BUILDER_API_URL`: hosted browser API origin, **not a token**. By default Vite proxies `/api` to loopback FastAPI; the static Site has no Python server attached.

Gateway protocol:

- `GET /capabilities` returns `{ready, providerId, model, capabilities}`. Supported capability strings: `classification`, `segmentation`, `background_removal`, `inpainting`, `landmarks`, `assembly`.
- `POST /process` receives the validated `ModelRequest` from FastAPI OpenAPI: capability, embedded source images, stable candidateIds and parts with candidateId/source/mask/bbox/label/confidence/orientation/warnings, and explicit consent.
- The response follows `ModelResult`: providerId/model, parts, classifications, optional PNG RGBA image, landmarks and assembly placements. See `builder_provider.py`, `provider.ts` and `/docs` for exact bounds. Part bbox/mask and landmark coordinates are input-image local; assembly is canonical project coordinates. Image operations use the selected extracted candidate PNG and must return the same dimensions. Landmark names must match the semantic bone names shown by the rig.

Browser calls `/api/builder/providers`, creates a job with POST `/api/builder/jobs`, polls GET `/api/builder/jobs/{id}`, and can POST `/cancel` or `/retry`. Two worker threads, eight queued/running executor entries including cancelled jobs awaiting cleanup, sixteen retained statuses, 60-second gateway timeout, 80-second browser deadline, explicit one-time retry, no late-result application. Cancelling discards output and frees capacity when underlying work exits; it does not promise remote provider compute has physically stopped. Process-local jobs are not durable across server restart.

Results require preview/approval before applying; stale-draft results reject. Generated texture variants retain old source/candidate records and `ai-generated` provenance. Mask-only segmentation/classification does not falsely mark original user pixels AI-generated. Use the API on loopback for development; production hosting of model jobs requires authenticated backend/CORS/rate limits and owner-configured gateways. The static Site deployment alone does not configure a provider.

## Limits and security

16 uploaded files, 8 MiB combined, 4096 pixels per side, 32 MP aggregate; MIME, header and actual decode must agree. Detection raster is at most 1024 per side, candidate masks at most 128 per side, extracted PNGs at most 1024 per side, 64 candidates/derived sources. These bounds can lose tiny details and must be reviewed. Original source resolution/bytes are preserved. The project retains existing 20 MiB JSON/ZIP limits, exact `project.json` archive path and compression/resource protections. Standard browser storage quota can be lower than the portable file limit.

No SVG/script imports or arbitrary code/shader execution, no user-defined gateway URL from untrusted requests, no browser provider secrets. Upstream HTTP/validation errors are sanitized. Requested output types/references/bounds, generated alpha PNG, IDs, masks, slots and mapped layers validate before application/persistence. Imported data cannot bypass ordinary rig/mesh/document validators.

## Remaining work / Phase 5C

Configure and evaluate actual licensed semantic segmentation, landmarks and inpainting gateways against real sheets; model quality/latency/cost and remote cancellation are unverified. Add learned compatibility scoring/orientation estimation, freehand component selection beyond manual merge/split/mask painting, richer anatomical landmark editing and per-import animation tuning. Improve weight optimization and severe-bend fold handling; do not remove existing warning evidence. A production AI job service needs auth, persistent queue/storage, rate limits and provider-specific deployment. Phase 5C should operate through these validated document operations with preview/approval and reproducible provenance.

## 0.5.1 — assembly navigation correction

The Assembly tab and Next action now execute actual assembly when the draft is still at the parts stage. An unapproved partial preview can contain only the selected slots (for example six), preserving source assets and leaving absent slots empty. A persistent Vietnamese banner names every missing slot and focuses its selector. Rig/mesh progression requires all eight selected and mapped parts; final approval still requires the complete rig/mesh. No missing artwork is fabricated.

Manually changing a candidate label explicitly selects it for that primary slot, replacing a prior variant for that slot; the old candidate remains available. Cards indicate which variant is in use. Undo or mask edits that remove assembled layers return to Review instead of leaving an empty preview open. Mobile Builder uses one scrolling content region, visible readiness/actions and dynamic viewport height. The original desktop editor layout is retained.
