import { boneInView, clipInView } from "../../document-core/src/character";
import type {
  ProjectDocument,
  AnimationChannel,
  AnimationValue,
} from "../../document-core/src";
import { createClip, setKeyframe, addEvent } from "./commands";
import { clonePose } from "./evaluation";
import { solveTwoBone } from "../../rig-core/src";
export function createSideReferenceClips(doc: ProjectDocument) {
  const bones = new Map(
    doc.bones.filter((b) => boneInView(doc, b.id)).map((b) => [b.name, b]),
  );
  if (!bones.has("Near Forearm"))
    throw Error("Side presets need a near/far rig");
  for (const name of ["Idle", "Walk", "Run", "Attack", "Hurt"]) {
    if (
      doc.animationClips.some((c) => clipInView(doc, c.id) && c.name === name)
    )
      continue;
    const duration = { Idle: 2, Walk: 1, Run: 0.6, Attack: 0.8, Hurt: 0.5 }[
        name
      ]!,
      clip = createClip(doc, name, duration, 24);
    clip.loopMode = ["Attack", "Hurt"].includes(name) ? "once" : "loop";
    clip.metadata = {
      origin: "procedural",
      description:
        "Editable side-scrolling motion; canonical right-facing near/far rig. Not AI.",
      tags: ["side_scrolling", "right", "procedural"],
    };
    const key = (
      bone: string,
      channel: AnimationChannel,
      t: number,
      value: AnimationValue,
    ) => {
      const b = bones.get(bone);
      if (b) setKeyframe(doc, clip.id, b.id, channel, t * duration, value);
    };
    const curve = (bone: string, channel: AnimationChannel, values: number[]) =>
      values.forEach((v, i) => key(bone, channel, i / (values.length - 1), v));
    const swing = (bone: string, amplitude: number, phase = 0, base = 0) =>
      curve(
        bone,
        "bone.rotation",
        Array.from(
          { length: 9 },
          (_, i) => base + amplitude * Math.sin((i / 8 + phase) * Math.PI * 2),
        ),
      );
    if (name === "Idle") {
      curve("Hip", "bone.y", [0, 1.5, 0]);
      curve("Chest", "bone.scaleY", [1, 1.012, 1]);
      swing("Near Shoulder", 1.2);
      swing("Far Shoulder", 0.8, 0.2);
      swing("Head", 1.4, 0.1);
      swing("Cape Base", 2.2, 0.2);
      swing("Cape Tip", 3.5, 0.35);
      swing("Hair Back", 1.8, 0.3);
      swing("Weapon Socket", 1.4, 0.25);
    }
    if (name === "Walk" || name === "Run") {
      const run = name === "Run",
        stride = run ? 100 : 60,
        stance = run ? 0.45 : 0.6;
      for (let i = 0; i <= 32; i++) {
        const t = i / 32,
          hipY = (run ? 18 : 8) + (run ? 5 : 3) * Math.cos(t * 4 * Math.PI);
        key("Hip", "bone.y", t, hipY);
        key("Spine", "bone.rotation", t, run ? 12 : 3);
        const posed = clonePose(doc);
        posed.bones.find((b) => b.id === bones.get("Hip")!.id)!.pose.y = hipY;
        for (const [side, offset, baseX] of [
          ["Near", 0, 419],
          ["Far", 0.5, 360],
        ] as const) {
          const phase = (t + offset) % 1,
            plant = phase < stance,
            u = plant ? phase / stance : (phase - stance) / (1 - stance);
          const x =
              baseX +
              (plant
                ? stride / 2 - stride * u
                : -stride / 2 + stride * (0.5 - 0.5 * Math.cos(Math.PI * u))),
            y = 630 - (plant ? 0 : (run ? 53 : 30) * Math.sin(Math.PI * u));
          const target = doc.ikTargets.find(
            (k) => k.endBoneId === bones.get(side + " Foot")!.id,
          )!;
          for (const [channel, value] of [
            ["ik.x", x],
            ["ik.y", y],
          ] as const)
            setKeyframe(doc, clip.id, target.id, channel, t * duration, value);
          if (i === 0) setKeyframe(doc, clip.id, target.id, "ik.blend", 0, 1);
          solveTwoBone(posed, target.id, { x, y });
          const thigh = posed.bones.find((b) => b.name === side + " Thigh")!,
            shin = posed.bones.find((b) => b.name === side + " Shin")!;
          key(
            side + " Foot",
            "bone.rotation",
            t,
            -thigh.pose.rotation - shin.pose.rotation,
          );
        }
      }
      swing("Near Upper Arm", run ? 33 : 19, 0.5, run ? -12 : 0);
      swing("Far Upper Arm", run ? 29 : 17, 0, run ? -8 : 0);
      swing("Near Forearm", run ? 18 : 9, 0.3, run ? -45 : -15);
      swing("Far Forearm", run ? 15 : 8, 0.8, run ? -40 : -12);
      swing("Cape Base", run ? 9 : 4, 0.6, run ? 12 : 3);
      swing("Cape Tip", run ? 13 : 6, 0.8, run ? 15 : 4);
      swing("Hair Back", run ? 7 : 3, 0.7);
      swing("Head", run ? 2 : 1, 0.1, run ? -4 : 0);
    }
    if (name === "Attack") {
      const upper = [0, -35, -80, -70, -25, 0],
        lower = [0, -105, -100, -20, -10, 0],
        aim = [0, -45, -65, 95, 110, 0];
      curve("Near Upper Arm", "bone.rotation", upper);
      curve("Near Forearm", "bone.rotation", lower);
      curve(
        "Weapon Socket",
        "bone.rotation",
        aim.map((a, i) => a - upper[i] - lower[i]),
      );
      curve("Chest", "bone.rotation", [0, -8, -6, 18, 10, 0]);
      curve("Far Upper Arm", "bone.rotation", [0, 15, 20, 40, 20, 0]);
      curve("Cape Base", "bone.rotation", [0, -6, 0, 16, 8, 0]);
      curve("Hip", "bone.x", [0, -8, 0, 16, 8, 0]);
      const socket = doc.equipmentSlots.find(
        (s) => s.name === "Weapon Socket",
      )?.id;
      for (const [event, time] of [
        ["attack_start", 0],
        ["sword_trail_start", 0.25],
        ["hit_window_start", 0.43],
        ["hit_window_end", 0.64],
        ["sword_trail_end", 0.78],
        ["attack_end", 1],
      ] as const) {
        const e = addEvent(doc, clip.id, time * duration, event);
        if (event.startsWith("sword_trail") && socket)
          e.payload = {
            type: "vfx",
            action: event.endsWith("start") ? "start" : "stop",
            effectName: "sword_trail",
            socketId: socket,
          };
      }
    }
    if (name === "Hurt") {
      curve("Hip", "bone.x", [0, -16, -9, 0]);
      curve("Spine", "bone.rotation", [0, -13, -7, 0]);
      curve("Head", "bone.rotation", [0, -10, 6, 0]);
      curve("Near Upper Arm", "bone.rotation", [0, 24, 13, 0]);
      curve("Near Forearm", "bone.rotation", [0, -40, -16, 0]);
      curve("Weapon Socket", "bone.rotation", [0, -15, -6, 0]);
      curve("Cape Base", "bone.rotation", [0, 12, 6, 0]);
    }
    const cape = doc.characterParts.find((p) => p.semantic === "cape"),
      mesh = doc.meshes.find((m) => m.id === cape?.meshId);
    if (mesh) {
      const amplitude = { Idle: 2, Walk: 6, Run: 12, Attack: 8, Hurt: 6 }[
        name
      ]!;
      for (let i = 0; i <= 4; i++) {
        const offsets = Object.fromEntries(
          mesh.vertices
            .filter((v) => v.v > 0.45)
            .map((v) => [
              v.id,
              {
                x: Math.sin((i / 4) * Math.PI * 2) * amplitude * v.v,
                y: Math.sin((i / 4) * Math.PI * 2) * amplitude * 0.15 * v.v,
              },
            ]),
        );
        setKeyframe(
          doc,
          clip.id,
          mesh.id,
          "mesh.deform",
          (duration * i) / 4,
          offsets,
        );
      }
    }
  }
}
