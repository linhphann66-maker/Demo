# Phase 2 implementation and manual test guide

Implemented in the existing repository `/workspace/Demo`, on `work`, starting from `e6908e55f2fd65f1d70b70455361ef6f00580cc9`. Git was clean at the start. No Phase 2 commits, pushes, source synchronization to Sites or deployment are performed. The previously deployed Site remains the Phase 1 version.

## What runs

- Real editable skeletons: UUID records, add/delete/rename, rest and pose position/rotation, length, parent hierarchy, local/world FK and constraints.
- Joint/endpoint overlays in PixiJS, direct dragging, rest binding and posing on the same canonical document. Pointer drags commit once and support undo/redo.
- Procedural humanoid template: Root, Hip, Spine, Chest, Neck, Head; Left/Right Shoulder, Upper Arm, Forearm, Hand, Thigh, Shin, Foot; Hair, Cape, Weapon Socket (23 total). Template locations scale to visible artwork bounds. This is not AI or semantic landmark detection.
- Auto Rig attaches all 14 demo layers, creates four two-bone IK chains and a named weapon socket. It creates five alpha meshes for cape, arms and legs, with editable weights. Existing rigs are never silently overwritten.
- Analytic two-bone IK for hand/foot handles, bend direction, target coordinates, unreachable-target clamping and rotation limits. The inspector shows target error when constraints prevent an exact solve. FK rotation moves descendants and attached artwork.
- Meshes sampled from raster alpha, bounded Delaunay triangulation, holes filtered at triangle samples, editable vertices and topology, UVs, source binding and normalized bone weights. Actual texture meshes use Pixi MeshGeometry; no flattened image is the source of truth.
- Manual weight adjustment redistributes other weights to maintain a sum of one; up to four influences per vertex. Weight Tool shows selected-bone influence colors. It is a per-vertex editing tool, not a paint brush.
- CPU linear blend skinning feeds Pixi vertex buffers. Invalid rest triangle edits reject atomically; folded/collapsed posed triangles display a warning. Reset Mesh restores vertex source positions while preserving current topology and weights. Remove/recreate regenerates alpha topology.
- Source image replacement preserves skeletons, IK, attachments and sockets. Only the replaced layer's own mesh is regenerated if it has one; all other meshes and weights are retained.
- Browser Save, portable ZIP import/export and transparent PNG operate on v2 data and posed/skinned composition. Legacy Phase 1 projects migrate without discarding layer metadata or transforms. Python API validates and stores the same v2 records.

## Try it locally

```bash
cd /workspace/Demo
npm ci
npm run dev
```

Open http://localhost:5173 on a desktop browser with WebGL. No paid API or provider setup is needed.

1. Click **Auto Rig**. Open **Bộ xương** in the left panel. Confirm 23 editable bones. Auto Rig is one undoable command.
2. Stay in **Rest Pose**. Select Head, then drag its origin circle. The bind joint moves while source artwork stays in place. Drag an endpoint to adjust rest direction/length. Bone inspector fields edit local coordinates; pose fields are offsets from rest.
3. Switch to **Pose Mode**. Select Left Upper Arm and change **Bone rotation** to 35°. Descendants and the arm mesh move. Drag a cyan wrist/ankle ring to solve IK. Select Hand/Foot to edit target X/Y and bend. **Reset Pose** clears all pose offsets and active targets.
4. Select **Lớp → Áo choàng đỏ**, then **Mesh Tool**. Select a visible cape vertex (avoid points hidden behind armor), drag slightly or edit Vertex X/Y. Add a vertex inside a nearby source triangle; select it in the vertex list to delete it. Folded rest edits roll back with an error.
5. Choose **Weight Tool**, select a vertex and a bound bone, edit **Bone weight** in [0,1]. The other influences normalize. Changing the list under Mesh bones recalculates all weights for that mesh; the UI explains this.
6. For a layer without mesh, select it and use **Mesh Tool → Tạo mesh từ alpha**. Mesh creation also works with no skeleton; bind bones later to enable deformation.
7. Return to the select tool, select Lưỡi kiếm and use **Thay ảnh nguồn**. The weapon socket and arm rig remain intact. Imported PNG/JPEG/WebP restrictions from Phase 1 still apply.
8. Save, reload, export an `.a2dstudio`, and reimport it. Rig, pose, IK targets, mesh vertices, triangles, UVs and weights remain editable. PNG exports contain the posed character without editor overlays.

Optional API commands remain in README.md. Phase 2 still uses browser Save; API storage is an independently usable local adapter, not automatic synchronization.

## Deliberate limits

- Alpha geometry is a 64×64 sampled approximation with at most 512 vertices/mesh, 128 meshes and 16384 vertices/project. It is not constrained polygon triangulation with exact contour preservation. Very thin details, narrow holes and disjoint regions may need manual correction; transparent/tiny images can fail with an explicit error.
- Auto Rig uses proportions and demo layer names. Imported artwork with different anatomy requires manual landmarks, attachments and weights. It does not infer semantics or repair missing body parts.
- IK solves two rigid links analytically, not full-body IK or physics. It does not stretch links to reach impossible targets. Independent chains are manipulated one at a time. Editing rest/FK disables active target indicators; solved angles remain ordinary editable pose offsets.
- Rest edits change canonical bind landmarks and rebind against them; no shape-preserving rest-pose rebasing of an existing animation is implemented. Deleting a bone detaches its rigid layers and normalizes remaining mesh weights, so their appearance can change; undo restores it.
- Mesh skinning is linear blend skinning, so extreme bends can collapse/fold. The UI reports this and offers Reset Pose; no dual quaternion, corrective deformation or automatic mesh repair is claimed.
- No weight paint brush, animation recording, timeline playback, VFX simulation, AI provider, database/workers, collaborative editing or engine export was added. Those remain future phases.
- This is desktop-first and tested in Chromium software WebGL. No native GPU FPS or long-duration GPU memory guarantee is made.

## Next: Phase 3

Build editable animation clips/tracks against stable bone UUIDs, keyframe insertion/deletion, linear/eased interpolation, timeline scrubbing/playback, event markers and the five planned Idle/Walk/Run/Attack/Hurt clips. Evaluate animation into transient pose data through rig-core; never overwrite rest transforms. Add tests for seeking, loop boundaries, event dispatch, undo and portable animation round trips. Keep the render loop idle unless playback is active.
