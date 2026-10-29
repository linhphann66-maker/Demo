# Side-scrolling character and joint completion

This change extends the existing Phase 1–3 editor. It does not implement Phase 4 VFX or connect a real AI provider. All new reference artwork and hidden-region completion are explicitly procedural.

## Data and compatibility

Schema v4 adds characterSettings, characterVariants, characterParts, characterJoints and an optional jointValidation report. Old v0–v3 projects migrate to Front/right/horizontal defaults without changing their source art, rigs or animation tracks. New projects default to side_3_4/right with horizontal mirroring and vertical facing disabled.

The new Flame Knight document contains two complete editable view sets. The original front view retains its 14 source layers, original skeleton/meshes and five clips with their original stable IDs and names. The new side view has separately authored anatomical art, a near/far rig and five ordinary editable side clips. Switching views filters the renderer/library/hierarchy; it does not regenerate, overwrite or rotate the old character in 3D. Clip names may repeat between views; the library, export and reusable presets use view membership and stable IDs. New layers/bones, pose reset and recording scope to the active view. A front-only project can still be auto-rigged after adding the side reference. Use **Nhân vật / Khớp → Tạo bản side procedural** to explicitly add the side demo to an old front-only project. This is a demo addition, not an AI conversion of arbitrary imported art.

Each semantic part references the canonical layer, source texture and actual sampled alpha mask; records near/far/center depth, role, parent bone, render order, mesh and attachment references, completion texture references and mirror policy. The canonical layer supplies position/rotation/scale and optional local pivotX/Y; the existing mesh supplies editable vertices/UV/indices/weights. There is no competing copy of the transform/rig. Changing a layer's pivot preserves its source placement and changes subsequent local rotation behavior. Repositioning an actual anatomical hinge still uses the Rest Pose bone editor.

Direction and actor worldPosition are outside local animation and rig coordinates. Right displays the original; Left applies an x reflection around the active view's canonical root. No bones, IK targets, UVs, weights or keys are rewritten by mirroring. Near/far draw order stays unchanged. Pointer hit/drag coordinates are transformed back to canonical space, including mirrored IK targets and mesh vertices. World X is a separate editor field, not an animation key or baked root motion.

Rigid parts support mirror, keep_texture (text/asymmetric content) or an explicit same-size left texture. Meshes retain canonical texture coordinates and currently require mirror; independent left rigs/retargeting are not implemented. Full Side is visibly unsupported until separate artwork exists. No up/down animations are generated.

## Joint strategies and completion

The supplied four limbs are authored from anatomical paths, not rectangular crops of a flattened image. Each has a source spanning its elbow or knee, separately authored upper/lower variants with rounded texture coverage beyond the joint, and editable overlap/underlap patch layers. Hidden segments are retained in the document and selected by joint mode at render time, so clip base visibility cannot erase a later mode change.

- continuous_mesh: one alpha-triangulated source crosses the joint. Smooth weights blend upper/lower bones around a band scaled to limb radius; leg tips also use the foot bone. The editable underlap covers the hidden hinge region.
- overlap_only: separately authored rounded upper/lower textures follow their own rigid bones, with generated overlap and underlap layers hiding the boundary.
- rigid_segment: upper/lower sprites use exact bone rest/pose deltas with authored rounded coverage. Shoulder armor and the sword default to rigid attachments. Hair and cape default to editable weighted meshes.

Completion samples opaque neighbouring source colours around the actual rest-space joint and creates a bounded shaded circular underlap or elliptical overlap. It is `procedural_neighbor_fill_v1`, with explicit procedural asset provenance and source dependency, never labelled AI. Source pixels remain intact. Generated textures remain ordinary separately selectable layers: move, change opacity/attachment, replace the source image, or edit the limb mesh/weights. Overlap/Underlap Size are extra coverage pixels around the core; they change generated texture coverage, not a decorative outline.

**Auto Repair** increases overlap by 4 px, underlap by 6 px (bounded to 48) and recomputes smooth joint weights. It does not promise to solve arbitrary silhouettes. A separate density control adds alpha-valid vertices near the hinge and retriangulates. Vertex/weight editing and Reset Mesh remain the existing tools. Pivot repositioning is explicit. All operations use existing history; async plans refuse to overwrite newer source edits.

For imported artwork, the panel can register an intact layer spanning two adjacent bones, generate a mesh, weights and sampled completion. It refuses completion where no opaque neighbourhood exists. Overlap/rigid variants are unavailable until genuine authored segment textures exist; it does not fake segmentation by slicing a rectangle.

## Animation and game movement

Idle, Walk, Run, Attack and Hurt remain editable clips. Walk/Run use ordinary XY/blend IK tracks for stance and swing, plus editable foot counter-rotation keys. Stance targets remain on the ground while moving backward in local space; an external game's forward world motion offsets that local motion. This limits foot sliding at the authored stride speed; no terrain/contact controller or arbitrary-speed gait correction is claimed. Run has a stronger forward torso lean, quicker cadence and larger cape/hair/arm movement.

Attack keys the visible sword arm and weapon socket with wind-up, slash, follow-through and recovery. Six typed event markers remain editable. Hurt recoils backward. No animation is a video or pre-rendered substitute. Existing Auto Key, timeline, interpolation, IK/FK blend, onion skins and crossfade remain. Incompatible front/side views switch directly rather than blending different view rigs. Animation evaluation and spritesheet export resolve the owning view, including the editable original reference clips.

## Joint validation

Run Joint Validation samples the actual stored alpha through deformed mesh triangle UVs or inverse rigid transforms. It sweeps elbows at -120/-90/-60/-30/0/30 degrees and knees at 0/30/60/90/120, with a representative parent rotation. Tests use stable base geometry and disable live IK so solving cannot undo the requested bend. Joint limits are respected and out-of-range requests are reported.

Reports persist sample counts, uncovered samples, joint IDs, angle, canonical problem position, severity and repair suggestions. Coverage checks an expected opaque core disk, not every pixel of every possible silhouette. It also checks collapsed/flipped triangles, excessive edge stretching, proper edge self-intersections near the joint, missing/invalid weights and overlap outside the expected zone. Intentional near/far occlusion is not mislabelled as an unexpected body collision. Yellow/red diagnostics appear in Joint Overlay. Clicking a report item previews that sampled pose without writing animation keys. Source revision marks reports stale after later edits.

A zero core-gap count is not a claim that every imported image is seamless. LBS at strong bends can pinch/fold triangles; the validator retains those warnings even when completion covers the core. Source rest mesh topology remains strictly validated. Manual source painting, vertex/weight/pivot edits or different deformation modes can be needed. Real provider-driven segmentation/completion, full-side artwork, physics, runtime terrain IK and automatic artistic repainting remain unimplemented.

## AI contracts

`sideCharacterPrompt` and `SideCharacterSpec` request a side-scrolling 2D game character, mild 3/4 right view, full body, neutral pose, clean silhouette, consistent anatomy and separated near/far limbs. Segmentation/inpainting contracts require preserving original pixels and occluded regions, editable alpha/texture references and overlap/underlap metadata with provider provenance. The API publishes the contract, validates requests and returns 503 for actual segmentation/inpainting because no provider exists. Procedural completion runs separately in the editor. No provider-driven generation is marked complete.
