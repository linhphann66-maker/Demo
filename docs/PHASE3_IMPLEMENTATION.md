# Phase 3 — Animation Studio

Implemented incrementally in the existing editor and document/rig/mesh/history pipeline. No repository recreation or replacement editor. The uncommitted Phase 2 baseline is archived under ignored `work/phase3-baseline/`; it remains part of this working tree. No commit, push or site publication occurs in this phase.

## Try it

Run `npm ci`, then `npm run dev`; open http://localhost:5173. New Flame Knight projects contain the existing 23-bone procedural rig, five skinned meshes, four hand/foot IK chains and five editable clips. Existing browser saves/imported projects remain unchanged. For an older Flame Knight project, open **Hoạt ảnh → 5 mẫu** to explicitly create the rig (if absent) and reference clips. Custom rigs need matching humanoid names for these presets; arbitrary rigs can use manual clips and tracks.

1. Open **Hoạt ảnh**, select **Idle**, then Play/Pause. Scrub with the ruler/playhead or current-frame input; zoom and scroll the timeline.
2. Move to another frame, open **Bộ xương**, select a bone. With **Auto Key**, change position/rotation/scale or drag the joint: editable keys are committed through undo/redo. IK rings record target coordinates and blend instead of baking solver angles.
3. With Auto Key off, edits show **POSE TẠM**. They are preview-only, cleared on seeking/clip changes, and are not saved. **Ghi pose** records the selected bone (all bones if none selected). Rest Pose disables animation preview and edits the canonical rig.
4. Click a key to edit time/value/interpolation/Bezier handles at right. Ctrl/Cmd or Shift-click selects several. Drag moves keys; use duplicate, copy/paste, delete and snap. Bone groups include ancestor groups; collapsing hides descendant tracks.
5. Use **Track + key** for any supported channel. Select a mesh layer, Mesh Tool and a vertex to pose its deformation, or edit sparse vertex offsets in a `mesh.deform` key. **Reset deformation** records zero offsets with Auto Key, otherwise previews zero offsets until a mesh key is explicitly added.
6. Select **Attack** to edit its six event markers. Events can be dragged, renamed, disabled, duplicated or deleted, with typed payloads. The small log reports actual dispatched events.
7. Enable Onion Skin (up to three previous and three next frames). While playing, select another clip to crossfade; transition duration is configurable. The preview button auditions Idle → Walk → Run → Idle.
8. Save and reload, or export/import the editable `.a2dstudio` ZIP. All clips/tracks/keys/handles/events/IK/deformation data persist. Playback/selection/temporary poses/history are session state.
9. **Xuất dự án** offers animation metadata JSON and an actual transparent spritesheet ZIP (`spritesheet.png`, `frames.json`), with independent output FPS and frame dimensions. GIF/MP4 are explicitly unsupported.

Timeline shortcuts require timeline focus: Space Play/Pause; Delete/Backspace remove selected keys; Ctrl/Cmd+C/V copy/paste; Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z redo; Home start; Ctrl/Cmd+A all clip keys. Inputs keep native text shortcuts. Playhead also supports Left/Right frame steps. Project save and global history retain existing shortcuts.

## Model and evaluation

Schema v3 uses seconds internally; displayed frames are `time * fps`. Clips contain stable IDs, name, duration, FPS, loop mode, playback range, references, metadata and captured base state. Tracks contain stable IDs, target/channel, enabled flag, rotation mode and sorted keyframes. Keys contain stable IDs, seconds, typed values, interpolation and optional cubic Bezier handles. Events are separate editable timeline records.

Supported channels: bone x/y/rotation/scaleX/scaleY; layer x/y/rotation/scaleX/scaleY/opacity/visible; mesh.deform; IK x/y/blend; attachment.bone. Visibility/attachment are stepped. Numeric/offset tracks support linear, stepped and cubic Bezier. Bezier time is inverted deterministically; sparse missing vertex offsets mean zero. Rotation defaults to shortest path, with explicit direct/multiple-turn mode for unconstrained joints. Joint limits take precedence for constrained joints.

Each evaluation starts from canonical source geometry and the clip's captured layer/bone/attachment/IK base state, never the last rendered pose. Missing channels keep base values. Before/after a track's keys, its first/last value is held. A bounded 32-entry pose cache invalidates when the immutable source document changes.

Order: base state → sampled bone/layer/attachment/mesh/IK properties → IK solver with FK/IK rotation blend → parent-first world matrices → rigid attachments and linear blend skinning → Pixi transforms and existing vertex-buffer updates. Deformation offsets are **texture-local design pixels before skeletal skinning**. UVs, topology, masks, source vertices and source images remain unchanged. Extreme poses/deformations may fold triangles; Phase 2 warnings remain available, without silently changing authored keys.

Targets are independent world-space points, never references to driven bones. The validated skeleton is acyclic. Two-link chains run deterministically by hierarchy depth then ID; overlapping user-created chains can affect one another in that order. The normal unscaled chain uses analytic IK; inherited scale uses bounded iterative solving. Unreachable/constrained targets can retain residual error, which is exposed by the existing rig inspector.

## Playback, events and mixing

A single requestAnimationFrame owner uses measured elapsed seconds and playback speed (0.25/0.5/1/1.5/2). Pause cancels RAF; document hiding pauses without catch-up. Stop resets to range start; Restart includes start events again. Runtime seeking is silent and pauses. Source editing pauses playback and invalidates temporary previews. UI time/property text updates at approximately 10 Hz; viewport and playhead update directly rather than rerendering React on every frame.

Event intervals are `(previous,current]`. Initial playback/restart includes enabled events exactly at range start once. Forward skips emit every crossed event. Loops emit end events before next-loop start events, including multiple crossed cycles. Manual seek, onion rendering and export do not dispatch events. Non-looping playback stops at range end. A safety cap of 4096 dispatches per tick pauses pathological catch-up rather than dropping events silently. Consumers receive `window` CustomEvents named `a2dstudio:animation-event`, with event/clipId/cycle/absoluteTime data; the editor retains only the last 50 log entries.

Payloads are discriminated marker text, number, or reserved VFX `{action,effectName,socketId?}`. Attack contains attack_start, sword_trail_start, hit_window_start, hit_window_end, sword_trail_end, attack_end. No VFX simulation or paid AI is invoked.

Crossfade evaluates two clips from the same canonical source, then blends compatible numeric pose/layer/deformation properties and IK targets. Visibility and attachment switch at 50%; source layer order is retained. Only the destination clip dispatches events during a transition. This is a preview mixer, not baked source art or a multi-layer animation state machine.

## Rendering and export

Source textures, triangle/UV buffers and static topology are reused during playback; only transforms, opacity/visibility and existing position arrays change. Source edits keep the existing reconciliation path. Onion overlays share source textures and pool at most six own mesh-buffer hierarchies; disabling removes them. Renderer destruction releases geometry/textures and clears references.

Spritesheet frames evaluate the real clip independently. Bounds union all sampled visible sprite/mesh geometry, then use a common fit with padding; moving weapons/capes outside the rest artboard stay inside exported frames. Transparent PNG and JSON frame rectangles/timestamps/durations/events/loop mode are included. Output supports 1–60 FPS and 64–2048 px/frame, at most 512 frames, 8192 px/axis and 64M pixels; excessive requests fail visibly. Loop samples omit the repeated endpoint; non-loop samples include the final pose as a zero-duration terminal frame. Frame metadata durations sum to the canonical clip duration; consumers using only a fixed grid/FPS must account for this terminal sample. Metadata JSON is the studio's editable interchange contract, not a Unity/Spine importer.

## Limits and next work

Desktop/WebGL editor, no mobile/touch/Firefox/Safari validation. The reference art is simplified front-facing cutout artwork: Walk/Run demonstrate editable skeletal movement rather than a production side-view gait. Sword flame remains static source artwork. No physical cloth/hair, contact solving, curve graph editor, retargeting, additive animation layers, VFX, paid AI, GIF or video encoder. Large images and snapshot history can consume browser memory; Save is bounded browser storage, independent of the optional API. Clip duration 1/120–120 seconds; FPS 1–120; 64 clips, 4096 tracks, 20000 keys/project, 8192 events. Clipboard is internal to this editor session.

Phase 4 should consume the typed animation events to drive real editable particle emitters attached to canonical bone sockets, with deterministic preview/export and resource tests. Keep VFX records separate from source art and animation keys; extend schema migration and validation before adding new effects. No Phase 4 implementation is included here.
