import {
  boneInView,
  clipInView,
  layerInView,
} from "../../document-core/src/character";
import type {
  ProjectDocument,
  AnimationChannel,
  AnimationValue,
  MeshOffsets,
} from "../../document-core/src";
import { createClip, setKeyframe, addEvent } from "./commands";
export const referenceNames = [
  "Idle",
  "Walk",
  "Run",
  "Attack",
  "Hurt",
] as const;
export function createReferenceClips(doc: ProjectDocument) {
  if (!doc.bones.length) throw Error("Cần tạo rig trước khi thêm hoạt ảnh mẫu");
  const bones = new Map(
    doc.bones.filter((b) => boneInView(doc, b.id)).map((b) => [b.name, b]),
  );
  if (!bones.has("Hip") && !bones.has("Chest"))
    throw Error(
      "Preset cần tên xương humanoid như Hip/Chest; hãy đổi tên rig hoặc tạo clip thủ công",
    );
  const result: string[] = [];
  for (const name of referenceNames) {
    const existing = doc.animationClips.find(
      (c) => clipInView(doc, c.id) && c.name === name,
    );
    if (existing) {
      result.push(existing.id);
      continue;
    }
    const duration = { Idle: 2, Walk: 1, Run: 0.6, Attack: 0.8, Hurt: 0.5 }[
      name
    ];
    const clip = createClip(doc, name, duration, 24);
    clip.loopMode = name === "Attack" || name === "Hurt" ? "once" : "loop";
    clip.metadata = {
      origin: "procedural",
      description:
        "Editable procedural motion adapted to the actual simplified Flame Knight rig; no AI, video or missing geometry.",
      tags: ["flame-knight", "procedural", name.toLowerCase()],
    };
    for (const pose of clip.baseState.bonePoses)
      Object.assign(pose, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const track = (
      boneName: string,
      type: AnimationChannel,
      values: number[],
      fractions?: number[],
    ) => {
      const bone = bones.get(boneName);
      if (!bone) return;
      values.forEach((value, i) => {
        const key = setKeyframe(
          doc,
          clip.id,
          bone.id,
          type,
          duration * (fractions?.[i] ?? i / (values.length - 1)),
          value,
          "bezier",
        );
        key.handles = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
      });
    };
    const capeMesh = doc.meshes.find(
      (m) =>
        layerInView(doc, m.layerId) &&
        (doc.layers.find((l) => l.id === m.layerId)?.name === "Áo choàng đỏ" ||
          doc.assetReferences.find((a) => a.id === m.sourceAssetId)?.name ===
            "Crimson cape"),
    );
    const cape = (amp: number) => {
      if (!capeMesh) return;
      const offsets: MeshOffsets = {};
      for (const v of capeMesh.vertices)
        offsets[v.id] = {
          x: amp * v.v * v.v * Math.sin(v.u * Math.PI),
          y: amp * 0.12 * v.v,
        };
      const values: AnimationValue[] = [{}, offsets, {}];
      values.forEach((v, i) =>
        setKeyframe(
          doc,
          clip.id,
          capeMesh.id,
          "mesh.deform",
          (duration * i) / 2,
          v,
          "bezier",
        ),
      );
    };
    if (name === "Idle") {
      track("Hip", "bone.y", [0, -2.5, 0]);
      track("Chest", "bone.scaleY", [1, 1.012, 1]);
      track("Left Shoulder", "bone.rotation", [-1, 1, -1]);
      track("Right Shoulder", "bone.rotation", [1, -1, 1]);
      track("Head", "bone.rotation", [-0.5, 0.5, -0.5]);
      track("Cape", "bone.rotation", [0, 2, 0]);
      track("Hair", "bone.rotation", [-1, 1, -1]);
      cape(2);
    }
    if (name === "Walk" || name === "Run") {
      const run = name === "Run";
      for (const [side, sign] of [
        ["Left", 1],
        ["Right", -1],
      ] as const) {
        const a = run ? 32 : 18;
        track(side + " Thigh", "bone.rotation", [
          -a * sign,
          a * sign,
          -a * sign,
        ]);
        track(
          side + " Shin",
          "bone.rotation",
          side === "Left"
            ? [run ? 10 : 5, run ? 45 : 25, run ? 10 : 5]
            : [run ? 45 : 25, run ? 10 : 5, run ? 45 : 25],
        );
        track(side + " Upper Arm", "bone.rotation", [
          (run ? 30 : 14) * sign,
          -(run ? 30 : 14) * sign,
          (run ? 30 : 14) * sign,
        ]);
        track(side + " Forearm", "bone.rotation", [
          0,
          (run ? 15 : 6) * sign,
          0,
        ]);
      }
      track("Hip", "bone.y", [0, run ? -8 : -4, 0, run ? -8 : -4, 0]);
      track("Chest", "bone.rotation", [
        run ? 8 : 1,
        run ? 11 : -1,
        run ? 8 : 1,
      ]);
      track("Cape", "bone.rotation", [run ? 8 : 3, run ? -8 : -3, run ? 8 : 3]);
      track("Hair", "bone.rotation", [-2, 2, -2]);
      cape(run ? 10 : 5);
    }
    if (name === "Attack") {
      track(
        "Right Upper Arm",
        "bone.rotation",
        [0, -95, 50, 30, 0],
        [0, 0.25, 0.475, 0.6875, 1],
      );
      track(
        "Right Forearm",
        "bone.rotation",
        [0, -45, 25, 12, 0],
        [0, 0.25, 0.475, 0.6875, 1],
      );
      track("Right Shoulder", "bone.rotation", [0, -8, -5, 0]);
      track("Chest", "bone.rotation", [0, -8, 9, 4, 0]);
      track("Hip", "bone.x", [0, -3, 5, 2, 0]);
      track("Cape", "bone.rotation", [0, -8, 9, 0]);
      cape(9);
      const times = [0, 0.18, 0.3, 0.43, 0.58, 0.8],
        names = [
          "attack_start",
          "sword_trail_start",
          "hit_window_start",
          "hit_window_end",
          "sword_trail_end",
          "attack_end",
        ];
      names.forEach((eventName, i) => {
        const e = addEvent(doc, clip.id, times[i], eventName);
        if (eventName.startsWith("sword_trail"))
          e.payload = {
            type: "vfx",
            action: eventName.endsWith("start") ? "start" : "stop",
            effectName: "sword-trail",
            ...(doc.equipmentSlots.find((s) => boneInView(doc, s.boneId))
              ? {
                  socketId: doc.equipmentSlots.find((s) =>
                    boneInView(doc, s.boneId),
                  )!.id,
                }
              : {}),
          };
        else e.payload = { type: "marker", value: eventName };
      });
    }
    if (name === "Hurt") {
      track("Chest", "bone.rotation", [0, -12, 6, 0], [0, 0.24, 0.6, 1]);
      track("Head", "bone.rotation", [0, 12, -3, 0], [0, 0.24, 0.6, 1]);
      track("Hip", "bone.x", [0, -7, 2, 0], [0, 0.24, 0.6, 1]);
      track("Left Upper Arm", "bone.rotation", [0, -15, 5, 0]);
      track("Right Upper Arm", "bone.rotation", [0, 15, -5, 0]);
      track("Cape", "bone.rotation", [0, -7, 4, 0]);
      cape(6);
    }
    result.push(clip.id);
  }
  return result;
}
