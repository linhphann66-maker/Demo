import {
  type ProjectDocument,
  type Bone,
  worldMatrix,
} from "../../document-core/src";
import { boneMatrices, transform, inverse, degrees, bindLayer } from "./index";
/** Normalized humanoid landmarks in the Flame Knight artwork's bounds. No AI estimation. */
export function humanoidTemplate(doc: ProjectDocument) {
  if (doc.bones.length)
    throw Error("Dự án đã có rig. Hãy chỉnh rig hiện tại thay vì ghi đè.");
  const corners = doc.layers
    .filter((l) => l.visible)
    .flatMap((l) => {
      const a = doc.assetReferences.find((a) => a.id === l.assetId)!;
      const m = worldMatrix(doc, l);
      return [
        transform(m, { x: 0, y: 0 }),
        transform(m, { x: a.width, y: 0 }),
        transform(m, { x: 0, y: a.height }),
        transform(m, { x: a.width, y: a.height }),
      ];
    });
  if (!corners.length) throw Error("Cần ít nhất một layer hiển thị để tạo rig");
  const left = Math.min(...corners.map((p) => p.x)),
    right = Math.max(...corners.map((p) => p.x)),
    top = Math.min(...corners.map((p) => p.y)),
    bottom = Math.max(...corners.map((p) => p.y));
  const w = right - left,
    h = bottom - top;
  if (w < 10 || h < 10) throw Error("Nhân vật quá nhỏ để rig");
  // The sample has a weapon extending right; the torso axis is 44% of the full bounds.
  const axis = left + w * 0.44;
  const xy = (x: number, y: number) => ({ x: axis + x * w, y: top + y * h });
  const skeletonId = crypto.randomUUID();
  doc.skeletons.push({
    id: skeletonId,
    name: "Humanoid · procedural",
    provenance: "procedural",
    template: "humanoid-v1",
  });
  const byName = new Map<string, Bone>();
  const add = (
    name: string,
    parent: string | null,
    x: number,
    y: number,
    endX: number,
    endY: number,
  ) => {
    const start = xy(x, y),
      end = xy(endX, endY);
    const rotation = degrees(Math.atan2(end.y - start.y, end.x - start.x));
    const parentBone = parent ? byName.get(parent)! : null;
    const parentMatrix = parentBone
      ? boneMatrices(doc, "rest").get(parentBone.id)!
      : null;
    const local = parentMatrix
      ? transform(inverse(parentMatrix), start)
      : start;
    const parentAngle = parentMatrix
      ? degrees(Math.atan2(parentMatrix.b, parentMatrix.a))
      : 0;
    const bone: Bone = {
      id: crypto.randomUUID(),
      skeletonId,
      parentId: parentBone?.id ?? null,
      name,
      rest: { ...local, rotation: rotation - parentAngle },
      pose: { x: 0, y: 0, rotation: 0 },
      length: Math.max(1, Math.hypot(end.x - start.x, end.y - start.y)),
      constraints: { minRotation: -180, maxRotation: 180 },
    };
    doc.bones.push(bone);
    byName.set(name, bone);
    return bone;
  };
  add("Root", null, 0, 1, 0, 0.7);
  add("Hip", "Root", 0, 0.59, 0, 0.5);
  add("Spine", "Hip", 0, 0.59, 0, 0.44);
  add("Chest", "Spine", 0, 0.44, 0, 0.29);
  add("Neck", "Chest", 0, 0.29, 0, 0.24);
  add("Head", "Neck", 0, 0.24, 0, 0.1);
  for (const [side, sign] of [
    ["Left", -1],
    ["Right", 1],
  ] as const) {
    add(side + " Shoulder", "Chest", 0, 0.3, sign * 0.235, 0.33);
    add(
      side + " Upper Arm",
      side + " Shoulder",
      sign * 0.235,
      0.33,
      sign * 0.26,
      0.5,
    );
    add(
      side + " Forearm",
      side + " Upper Arm",
      sign * 0.26,
      0.5,
      sign * 0.265,
      0.65,
    );
    add(
      side + " Hand",
      side + " Forearm",
      sign * 0.265,
      0.65,
      sign * 0.265,
      0.69,
    );
    add(side + " Thigh", "Hip", sign * 0.12, 0.59, sign * 0.13, 0.78);
    add(side + " Shin", side + " Thigh", sign * 0.13, 0.78, sign * 0.14, 0.96);
    add(side + " Foot", side + " Shin", sign * 0.14, 0.96, sign * 0.23, 0.98);
  }
  add("Hair", "Head", 0, 0.09, 0, 0.23);
  add("Cape", "Chest", 0, 0.31, 0, 0.88);
  add("Weapon Socket", "Right Hand", 0.44, 0.72, 0.44, 0.65);
  for (const side of ["Left", "Right"])
    for (const limb of ["arm", "leg"]) {
      const root = byName.get(
          side + (limb === "arm" ? " Upper Arm" : " Thigh"),
        )!,
        mid = byName.get(side + (limb === "arm" ? " Forearm" : " Shin"))!,
        end = byName.get(side + (limb === "arm" ? " Hand" : " Foot"))!;
      const p = transform(boneMatrices(doc, "rest").get(end.id)!, {
        x: 0,
        y: 0,
      });
      doc.ikTargets.push({
        id: crypto.randomUUID(),
        rootBoneId: root.id,
        midBoneId: mid.id,
        endBoneId: end.id,
        ...p,
        bend: side === "Left" ? 1 : -1,
        enabled: false,
      });
    }
  doc.equipmentSlots.push({
    id: crypto.randomUUID(),
    name: "Weapon Socket",
    boneId: byName.get("Weapon Socket")!.id,
  });
  const mappings: Record<string, string> = {
    "Crimson cape": "Cape",
    "Left leg": "Left Thigh",
    "Right leg": "Right Thigh",
    "Chest armor": "Chest",
    "Left arm": "Left Upper Arm",
    "Right arm": "Right Upper Arm",
    "Left pauldron": "Left Shoulder",
    "Right pauldron": "Right Shoulder",
    "Neck scarf": "Neck",
    Face: "Head",
    "White hair": "Hair",
    "Sword blade": "Weapon Socket",
    "Sword hilt": "Weapon Socket",
    "Sword flame · static sample": "Weapon Socket",
  };
  for (const l of doc.layers) {
    const a = doc.assetReferences.find((a) => a.id === l.assetId)!;
    const boneName = mappings[a.name];
    if (boneName) bindLayer(doc, l.id, byName.get(boneName)!.id);
  }
  doc.rigSettings.mode = "rest";
  return byName;
}
