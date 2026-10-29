# Project format v4

Portable `.a2dstudio` remains a ZIP containing only UTF-8 `project.json`. `schemaVersion=4` retains every Phase 1 field and adds `rigSettings.mode` (`rest` or `pose`) and `ikTargets`. Animation clips, tracks and events are typed editable records; VFX has a versioned particle-stack extension described below; job collections remain empty. UUIDs uniquely identify entities, including vertices and weight records. `hierarchy` continues to mirror layer parent references.

## Editable rig records

- `skeletons`: id, name, provenance (`procedural` or `user-created`), nullable template identifier.
- `bones`: id, skeletonId, parentId, name, rest `{x,y,rotation,scaleX?,scaleY?}`, additive pose `{x,y,rotation,scaleX?,scaleY?}` (scale defaults to 1 and multiplies rest scale), visual length and constraints `{minRotation,maxRotation}`. Coordinates are local to the parent; rotations are degrees. Bone hierarchy must be acyclic and confined to one skeleton. Length is positive; pose rotation is constrained to [-180,180] and its configured range.
- `attachments`: id, layerId, boneId. One rigid attachment per layer. Source layer geometry stays independent; pose delta is evaluated from bone rest/current transforms.
- `equipmentSlots`: id, name, boneId. Humanoid auto rig creates Weapon Socket.
- `ikTargets`: id, rootBoneId, midBoneId, endBoneId, world x/y, bend (-1/+1), enabled, optional blend in [0,1] (default 1). Exactly three consecutive joints with two nonzero rest/current offsets. One chain per effector. Targets never encode opaque animation; solving writes normal pose offsets.

## Editable mesh records

`meshes` contain id, layerId, sourceAssetId, vertices, triangles, boneIds, bindMatrix and alphaMask. Only one mesh per layer; sourceAssetId must match that layer's artwork. `vertices` contain stable id, editable texture-local x/y, and source u/v in [0,1]. `triangles` are integer indices into vertices, grouped by three. Duplicate/out-of-range indices, duplicate faces, zero-area UV/geometry and inverted rest triangles are rejected. `bindMatrix` is the nonsingular source layer world transform recorded at creation for initial weight estimation; canonical bone rest matrices define inverse bind during evaluation. `alphaMask` contains binary width×height samples for future safe topology edits.

`vertexWeights` contain id, meshId, vertexId and 1–4 distinct `{boneId,weight}` influences with strictly positive weights totaling 1 within 1e-5. Every vertex of a bound mesh requires a weight record; referenced bones must be declared in that mesh's boneIds and belong to the same skeleton. Empty boneIds means an unskinned editable mesh. Manual weight changes normalize the other influences. Bone deletion removes its influences and normalizes/falls back to a remaining bound bone.

Pose skinning can still fold otherwise valid geometry at extreme bends; `deformationWarnings` evaluates this for the inspector. No pose repair is silently applied. Reset Mesh returns current vertices to their u/v source positions and keeps topology/weights. Alpha regeneration is an explicit remove/create operation or a source replacement for that layer.

## Migration and persistence

`parseDocument` migrates schemaVersion 0 → 1 → 2 → 3 → 4; the Python API accepts the same legacy input. Phase 1 projects gain empty animation arrays, empty ikTargets and rest mode, preserving source images, transforms, ordering and metadata. Future versions reject explicitly; there is no lossy downgrade. The browser keeps the existing `a2dstudio.project.v1` storage key specifically to recover existing saves; the contained document version is now 4. Older Phase 1/2/3 builds cannot open v4 projects.

Skeleton mode, all rest/pose transforms, target coordinates, source bindings, vertices, triangles, UVs, masks and weights persist through browser Save, ZIP and local API. Editor tool/selection/overlay state and undo snapshots remain session-local. Revision audit records remain capped at 100 entries, command history at 80.

## Limits and import safety

Phase 1 limits remain: 20 MiB JSON/ZIP, 24 MiB decoded images total, 8 MiB per image, 4096 px/side, 1000 layers, 128 source assets. Rig limits: 16 skeletons, 256 bones, 128 meshes, 512 vertices/mesh, 16384 vertices/weight records total, 6000 triangle indices/mesh, 4 influences/vertex, 128 IK targets. Alpha masks allow at most 128×128 in the format; current generation uses at most 64×64.

ZIP archives must contain exactly project.json, no traversal paths, no encryption, and expansion ratio ≤200. Raster import validates magic bytes/dimensions before decoding; SVG imports and scripts remain prohibited. Unknown fields, malformed references, cycles, invalid UV/triangle/weight data and nonfinite values fail before replacing the current project. No imported code executes.

## Animation records (v3)

See `PHASE3_IMPLEMENTATION.md` for evaluation order and event semantics. `animationClips` contain id/name/duration/fps/loopMode/range/trackIds/eventIds/baseState/metadata. The base state captures bone pose and layer transform/opacity/visibility, IK target/blend/enabled, and per-layer nullable bone bindings. It does not copy image data or topology. Seconds are canonical; changing FPS never retimes keys. Explicit duration editing proportionally retimes keys, events and playback range.

`keyframeTracks` contain id/clipId/targetId/type/enabled/rotationMode/keyframes. Channels: bone.x/y/rotation/scaleX/scaleY, layer.x/y/rotation/scaleX/scaleY/opacity/visible, mesh.deform, ik.x/y/blend, attachment.bone. Rotation is shortest-path or direct; unconstrained direct keys allow intentional multiple turns. Source bone poses retain Phase 2 joint limits. Evaluated transient poses can represent multi-turn angles and deformed/folded triangles without rewriting source geometry.

Keys contain id/time/value/interpolation and optional handles {x1,y1,x2,y2}, all handle components [0,1]. Values are channel-specific finite numbers, boolean visibility, nullable bone UUID for attachment, or sparse vertex UUID → {x,y} mesh-local offsets. Discrete channels require stepped interpolation. Offsets are applied before skinning. Missing vertices mean zero offset, never removal. Keys must be sorted, unique in time within a track and within clip duration; UUIDs/references/types/ranges are validated before commands or imports replace the document.

`animationEvents`: id/clipId/name/time/enabled/payload. Payload is null or typed marker/number/vfx. Reserved sword trail names require compatible typed VFX actions when a payload exists. VFX socketId must reference a declared equipment socket. Events reference their clip and live within its duration.

Additional limits: 64 clips, 4096 tracks, 4096 keys/track, 20000 keys/project, 8192 events; duration 1/120–120 seconds and FPS 1–120. Imports validate clip track/event reference lists, base-state targets and mesh vertex offset references. Phase 1/2 empty animation collections migrate without changing artwork or generating presets. Stable IDs, easing and editable records survive browser Save, ZIP and API JSON. Playback state, onion skins, selection, temporary poses and clipboard are not persisted.

## Side-scrolling records (v4)

`characterSettings` stores characterView (side_3_4 or front), defaultFacing/facing (left/right), horizontal movementMode, mirrorForOppositeDirection, false enableVerticalFacing and worldPosition. Old v0–v3 input gains front/right defaults and empty semantic/view/joint collections. New reference projects explicitly opt into side_3_4/right. No source file is rewritten until Save/export.

`characterVariants` stores stable id, name, view, reference flag, nullable parentless rootBoneId, layerIds/boneIds/clipIds. At most two unique views; an entity cannot belong to both view sets. Existing front art, rigs, meshes and clip IDs/names are preserved. Clip names may repeat across views; IDs are canonical and the UI scopes editing/export/presets to the active view.

`characterParts` joins an existing layer to its sourceAssetId, sampled binary alphaMask (max128×128), semantic region, near/far/center depth, parentBoneId, renderOrder, meshId, attachmentId, jointId, role, overlapAssetId/underlapAssetId, mirrorPolicy and optional leftAssetId. Transform and pivot are canonical layer data; mesh/weights are the existing editable records. Optional layer pivotX/Y default to zero on legacy data and participate in worldMatrix. Source images and real overlap/underlap PNGs remain embedded editable assets with provenance/dependencies.

`characterJoints` stores id/name/kind, adjacent upper/lower bones for elbow/knee, participating layerIds, continuous_mesh/overlap_only/rigid_segment mode, radius1–48, overlap/underlap extra pixels0–48 and completion provenance. Continuous mode requires actual mesh data; overlap mode requires authored upper/lower records; weapons require a rigid socket. Changing rigid preview retains mesh topology/weights/keys. Layer array order remains the render authority, reflected into part renderOrder. Root reflection/world translation are renderer presentation, never destructive vertex/bone rewriting.

`jointValidation` is null or a stable-ID report containing createdAt, sourceRevision, testedAngles, sample/uncovered counts, jointIds and bounded issues (kind/severity/angle/canonical position/message/suggestions). Max128 joints, 1000 parts, 2048 report issues, 32 tested angles. Reports are sampled diagnostics, not a guarantee for every imported silhouette. Revision changes mark stale results. Missing/deleted entities prune only dependent records through the existing command boundary; unknown/new invalid references still reject at import/API validation.

Rigid texture exceptions preserve texture orientation or use an explicit same-size left asset. Mesh-bearing parts retain canonical UVs and require mirror. Full-side/vertical views and non-editable baked animation replacements are not part of v4. Full semantics and limitations: SIDE_SCROLLING_IMPLEMENTATION.md.

## Phase 4 VFX extension (0.4.0)

`vfxGraphs` stores bounded version-1 structured effects; optional `vfxPresets` stores independent reusable definitions. Earlier empty arrays and particle-only records remain valid without silently generating effects. New fields are optional for old files. Strict older application builds cannot read the extended records and must not resave them.

An effect contains id/name/enabled/duration/loopMode/seed/intensity/nodes/metadata plus optional trigger/trails/flipbooks/filters/tracks. Emitters support ParticleEmitter or textured SpriteEmitter, optional seeded variations/gravity/orbit, source texture IDs and normalized lifetime curves. Trails contain stable base/tip attachment markers, recent-history sampling limits, width/gradient/opacity/fade/taper/smoothing/texture/blend. Flipbooks retain original image references, rects/FPS/loop/offset/transforms and raw imported metadata. Filters are a fixed validated stack with at most one instance/type. Arbitrary imported shaders or meaningless connections reject.

VFX attachments reference an existing bone or the character origin, local offset/rotation/scale, follow flags and optional pinned position. Trigger fields reference an existing clip and compatible start/stop event IDs plus delay/mode. Parameter tracks reference effect/component UUIDs, validated channels and unique sorted stable-ID keys, seconds, values, interpolation and optional Bezier handles. Lifetime curve keys use normalized 0–1 time. UUID uniqueness includes effects/presets/components/keys/curves; assets and bone/event targets are validated by both client and Python API.

Limits and deterministic evaluation/export semantics are documented in PHASE4_IMPLEMENTATION.md. Runtime particles, caches, selection, quality, gizmos, clipboard and preview-stop flags are not persisted. Portable effect JSON embeds validated referenced textures and preserves source data; it is not an engine-specific runtime format.

## Phase 5A–5B optional builder extension (0.5.0)

Schema 4 accepts an optional `characterBuild` version-1 object. Its absence preserves old Phase 1–4 files without auto-generating any assets or builder data. Strict older builds reject unknown new data; use this release to reopen builder projects. Records contain stable ID, import mode, original/derived source IDs, up to 64 candidates with source/preview UUIDs, native-source bbox, sampled alpha mask (max 128² bytes), confidence/label/orientation/method/warnings/material and optional provider/model/job approval provenance. Exactly eight nullable primary selections reference candidate IDs; layerMappings reference ordinary selected candidates and layer IDs. Approved builds require eight unique selections/mappings. Missing image dependencies, out-of-bounds masks, duplicate/global IDs and invalid mappings reject. Layer source replacement can preserve builder provenance without forcing the layer to use its original preview image forever; layer deletion prunes only its mapping and clears approval.

Sources, extracted alpha PNGs, procedural completion textures, ordinary layers/pivots/attachments, skeleton, meshes, weights, animation tracks and joint reports remain in their existing collections. Hip is an additional joint kind. `characterBuild` is metadata/provenance, not an alternate renderer or flattened image. Source data never changes when masking/assembling; generated AI textures, if a real gateway returns an approved result, become separate variants. Masks/decisions/geometry survive browser, ZIP and API persistence. Runtime jobs, selection, cancellation objects and Builder undo snapshots do not serialize; the existing revision audit does. Limits and coordinate spaces: PHASE5AB_IMPLEMENTATION.md.

Version 0.5.1 also permits explicit partial assembly previews using ordinary layers and fewer than eight mappings while `characterBuild.approved=false`. Missing candidates are not filled by duplicate images or fabricated assets. The rig generator requires all eight selected/mapped parts; approved builds retain the same eight-slot invariant. No schema migration/version change is required.

## Seven-part Builder continuation

The current Builder uses seven primary parts, a head including facial artwork, version-2 builder metadata, simplified review and deterministic normalization/anchor-based assembly. Earlier eight-slot descriptions are historical. Compatibility, implementation, limitations and current verification: [BUILDER_7_SLOTS.md](BUILDER_7_SLOTS.md). No push/publication is performed for this continuation.
# Gemini continuation

Optional `characterBuild.aiReview` stores validated model/job/time provenance, anatomical review flags, confidence, near/far metadata and rendering order. Anchors/scales remain in existing assembly records; all source/derived assets remain editable. No API key or credential/session token is serialized. Existing schema-v4/build-v2 projects without AI review remain loadable. See [GEMINI_IMPLEMENTATION.md](GEMINI_IMPLEMENTATION.md).
