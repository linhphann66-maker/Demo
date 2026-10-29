import { it, expect } from "vitest";
import { rigFixture } from "../../rig-core/src/fixture";
import { uid } from "../../document-core/src/fixture";
import { sideTemplate } from "../../rig-core/src/side-template";
import { createReferenceClips } from "../../animation-core/src/presets";
import { createSideReferenceClips } from "../../animation-core/src/side-presets";
import { deleteClip } from "../../animation-core/src/commands";
import { useEditor } from "./store";
import { useAnimation } from "./animation-state";
import { selectAnimation } from "./animation-playback";
import { parseDocument } from "../../document-core/src";
function dual() {
  const d = rigFixture();
  ["Root", "Hip", "Chest"].forEach((n, i) => (d.bones[i].name = n));
  createReferenceClips(d);
  const frontBones = d.bones.map((b) => b.id),
    frontClips = d.animationClips.map((c) => c.id);
  const side = sideTemplate(d);
  d.characterSettings.characterView = "side_3_4";
  d.characterVariants = [
    {
      id: uid(700),
      name: "Original",
      view: "front",
      reference: true,
      rootBoneId: frontBones[0],
      boneIds: frontBones,
      layerIds: [uid(3)],
      clipIds: frontClips,
    },
    {
      id: uid(701),
      name: "Side",
      view: "side_3_4",
      reference: false,
      rootBoneId: side.get("Root")!.id,
      boneIds: [...side.values()].map((b) => b.id),
      layerIds: [],
      clipIds: [],
    },
  ];
  createSideReferenceClips(d);
  return d;
}
it("presets are idempotent per view and regenerate only a missing clip without touching its reference", () => {
  const d = dual(),
    front = d.characterVariants[0],
    side = d.characterVariants[1],
    frontBefore = JSON.stringify(
      d.animationClips.filter((c) => front.clipIds.includes(c.id)),
    );
  createSideReferenceClips(d);
  expect(d.animationClips).toHaveLength(10);
  const idle = d.animationClips.find(
    (c) => side.clipIds.includes(c.id) && c.name === "Idle",
  )!;
  deleteClip(d, idle.id);
  createSideReferenceClips(d);
  expect(d.animationClips).toHaveLength(10);
  expect(
    JSON.stringify(
      d.animationClips.filter((c) => front.clipIds.includes(c.id)),
    ),
  ).toBe(frontBefore);
  d.characterSettings.characterView = "front";
  deleteClip(
    d,
    d.animationClips.find(
      (c) => front.clipIds.includes(c.id) && c.name === "Idle",
    )!.id,
  );
  createReferenceClips(d);
  expect(d.animationClips).toHaveLength(10);
  expect(
    d.keyframeTracks
      .filter(
        (t) => front.clipIds.includes(t.clipId) && t.type.startsWith("bone."),
      )
      .every((t) => front.boneIds.includes(t.targetId)),
  ).toBe(true);
  expect(() => parseDocument(d)).not.toThrow();
});
it("deleting an active side clip stays in the side view even when a front clip has the same name", () => {
  const d = dual();
  useEditor.getState().open(d);
  const id = d.characterVariants[1].clipIds[0];
  selectAnimation(id);
  useEditor.getState().deleteAnimation(id);
  const current = useEditor.getState().document!;
  expect(current.characterVariants[1].clipIds).toContain(
    useAnimation.getState().activeClipId,
  );
  expect(current.characterSettings.characterView).toBe("side_3_4");
});
it("new layer and bone commands enroll in the active view without altering reference membership", () => {
  const d = dual();
  useEditor.getState().open(d);
  const before = structuredClone(d.characterVariants[0]);
  useEditor.getState().command("Add layer", (d) => {
    d.layers.push({ ...d.layers[0], id: uid(702), name: "Side extra" });
  });
  useEditor.getState().addBone();
  const current = useEditor.getState().document!;
  expect(current.characterVariants[0]).toEqual(before);
  expect(current.characterVariants[1].layerIds).toContain(uid(702));
  const added = current.bones.find(
    (b) => !d.bones.some((old) => old.id === b.id),
  )!;
  expect(current.characterVariants[1].boneIds).toContain(added.id);
  expect(added.skeletonId).toBe(
    current.bones.find((b) => b.id === current.characterVariants[1].rootBoneId)!
      .skeletonId,
  );
});
it("resetting the active view preserves the original reference pose", () => {
  const d = dual();
  d.bones[0].pose.rotation = 25;
  const sideRoot = d.bones.find(
    (b) => b.id === d.characterVariants[1].rootBoneId,
  )!;
  sideRoot.pose.rotation = 15;
  useEditor.getState().open(d);
  useEditor.getState().resetPose();
  const current = useEditor.getState().document!;
  expect(current.bones[0].pose.rotation).toBe(25);
  expect(current.bones.find((b) => b.id === sideRoot.id)!.pose.rotation).toBe(
    0,
  );
  expect(() => parseDocument(current)).not.toThrow();
});
