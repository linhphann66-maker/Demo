# Auto Character Builder — seven-part side-view workflow

This revision operates inside the existing Phase 1–4 editor. It changes the builder pipeline and provenance extension, not the renderer, animation evaluator, VFX engine or source artwork model. Implementation and classification are local procedural operations; no configured AI model is implied.

## Working flow

Upload → Detect/Extract → **Review 7 parts** → Normalize → Assemble → Rig → Mesh/Joint → Finish.

Canonical primary slots are exactly `head`, `hair`, `torso`, `left_arm`, `right_arm`, `left_leg`, `right_leg`. The head input includes facial artwork; hair is a separate image. There is no face primary slot or classification label. Cloak and sword are optional accessories outside this set.

Detection stops at Review instead of silently rigging unconfirmed guesses. Each slot displays its selected image, a candidate selector, **Sửa mask** and **Bỏ chọn**. Controls include **Tự gán lại**, **Chuẩn hóa kích cỡ**, **Khôi phục scale gốc**, **Lắp thử**, **Đặt lại anchor**, and an advanced-mode toggle. Missing parts are named and focus their selectors. Partial previews remain possible, but rig/finish require all seven selected/mapped parts. All actions modify an isolated validated draft with undo/redo; the open editor project stays unchanged until approval.

Technical labels/confidence, raw candidate grids, merge/split, material/orientation overrides, anchors and providers live in advanced mode. The basic review does not expose alpha component methods, near/far labels or raw unknown-source diagnostics. Unclassified choices use a readable “cần duyệt” label. Mask editing scrolls into view on small screens and retains eraser/restore/source preview.

## Detection and candidate quality

Transparent inputs preserve alpha; opaque solid backgrounds use border-connected removal, preserving enclosed white details. Small adjacent pieces group with the nearest plausible larger component. After grouping, isolated areas smaller than max(6 detection pixels, 0.3% of the largest area) are suppressed. Original uploaded images remain embedded.

Named independent PNGs use explicit semantic aliases. Sheet suggestions use deterministic layout/shape evidence; a narrow region without a plausible paired row remains unclassified, as do unnamed single images without enough context. No classifier claims semantic model certainty. Whole-character images still require a configured segmentation provider.

Extracted images retain a 16×16 quantized RGBA signature. Very similar appearances/aspect ratios within compatible labels are suppressed as duplicates; intentionally labeled left/right limbs are preserved. Each primary label keeps up to three ranked candidates; excess variants move to a separate review queue above the seven slot cards. A slot selector displays at most three plausible choices; uncertain images are not inserted into every slot dropdown. Explicitly assigning a queued image records a manual label decision. Suppressed candidates and original source data remain available to advanced users. Similarity is heuristic and can require manual correction.

## Proportions and anchored layout

`layout.ts` measures each candidate's actual sampled alpha bounds and principal limb axis. Default normalized layout uses a 150-unit torso, head height at most 135 and width at most 1.22× torso width, hair fitted to the head, arms of approximately 168 units and per-leg scales solved against the common ground at y=650. Uniform scaling preserves texture aspect ratio. Scale factors are bounded by existing document limits (0.01–20); extreme inputs produce warnings. Original-scale mode restores scale=1, grounds the longest leg and warns when source proportions require normalization. Camera framing includes oversized source bounds without changing saved authoring scales.

Torso is the geometric root at the character centerline x=400. Its anchors are `neck_anchor`, left/right shoulder anchors, left/right hip anchors, and optional cloak/weapon anchors. Head has `neck_base` and `scalp_anchor`; hair has `scalp_anchor`; limbs have `shoulder_joint` or `hip_joint`. Assembly solves exact source-anchor/world-anchor coincidences: head→neck, hair→head scalp, arms→shoulders and legs→hips. This replaces independent per-part target placements. Source layers remain ordinary editable records; skeleton parenting supplies transform inheritance after rigging. Manual layer transforms are explicit user overrides; rebuilding via anchors re-establishes the template connections.

Anchor defaults come from alpha bounds/axis geometry and fixed anatomical proportions, not a learned landmark model. Advanced mode edits normalized 0–1 source coordinates, and reset restores inferred defaults. The overlay ground line and center guide are preview-only SVG UI and never enter exported character textures. Actual source/mesh geometry remains unchanged.

## Rig and mesh

A complete seven-part character produces 22 bones: root/hip/spine/chest/neck/head, near/far arm and leg chains, and hair bones. Existing semantic bone names remain compatible with animation templates. No cloak or weapon bones are authored for absent artwork. Explicit optional cloak/sword candidates create the corresponding extra bones and ordinary attachments; with both the rig has 25 bones. Cloak receives a mesh bound to its two bones, sword uses a rigid socket attachment. Accessories can be selected in advanced mode and named accessory PNGs can be recognized without creating extra primary slots.

Arms, legs and hair receive editable alpha-derived meshes and normalized weights; the torso/head default to rigid attachment. Existing elbow/knee underlap, overlapping alternatives, procedural completion and validation remain available. The supplied fixture reports 0/1,392 uncovered CPU core samples while retaining 12 geometry warnings; strong-bend folding/texture coverage of arbitrary user imports is not guaranteed. The only shared animation compatibility change removes the unconditional weapon-socket assumption from procedural Attack event payloads when the character has no sword.

## Persistence and compatibility

The outer project schema remains v4; optional `characterBuild` is now **version 2**. It stores seven selections/mappings, candidate/source/mask decisions, normalization mode and computed scale factors, per-candidate anchor overrides, optional accessory assignments, and existing layer/rig/mesh records.

Loading builder v1 removes the old face selection/mapping from primary data, relabels its candidate as unclassified and records the old face layer ID as a legacy detail. **Existing layers, source pixels, rig, animation and VFX data are preserved**, so an old project renders as before. Migration does not pretend a new composite head image was generated. For a newly rebuilt character, provide a head including its face; old separate facial artwork remains individually editable in the legacy project. Saving uses the new builder extension; older application builds cannot read v2 builder records.

Client and Python validate references, masks, optional accessory uniqueness, scale ranges, anchor coordinates and seven-part approval requirements. Deleted layers prune only dependent builder mappings/legacy references. PNG/JSON/portable `.a2dstudio` remain editable; no flattening or hidden paid provider call is involved.

## Validation and changed files

Executed logs and screenshots: `work/builder-seven/`. The regression fixture is original CC0 procedural art with seven connected parts and optional accessory PNGs; it is not the user's inaccessible reference image.

- Unit: 178 passing cases, including migration, exactly seven labels, candidate suppression, extreme proportions, anchor coincidences, settings archive persistence, partial rig guards and optional attachments.
- API: 134 passing cases, including new strict seven-part/anchor checks and non-destructive v1 migration.
- TypeScript/lint/production build: passed. Vite retains a bundle-size warning; no dependency added.
- Browser: **50/50 E2E passed** across the whole editor (6.7 minutes). After the last Builder-only refinements, **6/6 Builder E2E passed again**, including an explicit review queue for unclassified images, a deliberately oversized arm, actual alpha-derived foot/ground coordinates, optional accessories, anchor persistence and mobile mask undo. The mobile mask assertions compare alpha behavior rather than PNG encoder byte identity.

Main changed files: `document-core/src/builder-schema.ts`, its parsing entrypoint, `character-builder/src/{detect,images,layout,assembly,provider,index,builder.test}.ts`, `editor-core/src/store.ts`, `animation-core/src/side-presets.ts`, `apps/web/src/{CharacterBuilder,BuilderReview,BuilderPreview,BuilderMaskEditor}.tsx`, scoped CSS, `apps/api/{builder_models,builder_provider}.py`, API/browser tests and project-owned fixtures. Detailed baseline-relative paths are in the QA artifact `work/builder-seven/changed-files.json`.

## Manual check

1. `npm ci && npm run dev`; open localhost:5173 → **Tự động tạo nhân vật**.
2. Import `tests/fixtures/builder-adventurer.png` or seven named part PNGs. Confirm exactly seven cards and head including its face.
3. Swap/unselect a candidate, correct a mask and undo. Confirm missing-part guidance. Try automatic reassignment and advanced candidate review.
4. Normalize and assemble. Confirm head/neck, scalp/hair, shoulders and hips match; feet meet the ground. Restore original scale and normalize again. In advanced mode edit an anchor, then reset or undo.
5. Create rig, pose a limb, generate mesh/validate. Add the optional cloak/sword PNGs to a fresh import and confirm accessories attach without changing the seven-slot count.
6. Approve/save, reload and export/import. Open Animation/VFX studios and verify compatible clips/attachments.

No commit/push or Site publication is performed for this request, following the latest instruction. Remaining limitations are heuristic classification/anchor inference, imperfect source anatomy and severe-bend deformation; real model segmentation/inpainting remains unconfigured.


Screenshots: [seven-part review](../work/builder-seven/review-seven.png), [anchored assembled preview](../work/builder-seven/assembled-seven.png), [mobile review](../work/builder-seven/mobile-seven.png). Final build retains the normal Vite >500 kB chunk warning; API tests retain the existing AnyIO deprecation warning. Browser provider-availability checks intentionally ran without FastAPI/model service and reported unavailable rather than fabricated output. The final invalid-legacy-input guards were checked by client/API negative tests.

Changing candidates, normalization or anchors rebuilds only the draft's derived assembly/rig/mesh/clips as needed; undo restores previous draft states. Source images and the originally open editor document remain preserved. Source bounding-box/axis inference does not understand anatomy: imported artwork must already be a suitable right-facing head/body/limb set. Imported scale mode can retain unequal limb lengths; normalized mode resolves the tested pair lengths/ground contact. Legacy separate facial pixels remain a legacy layer and are not silently painted into a new head.

Final queue placement was additionally checked by its own browser case (1/1 passed). All source stays local and editable; GitHub HEAD is unchanged and the existing Site was not updated for this request.
