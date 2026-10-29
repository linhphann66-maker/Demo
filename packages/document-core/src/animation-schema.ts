import { z } from "zod";
const id = z.string().uuid(),
  n = z.number().finite(),
  coordinate = n.min(-10000).max(10000);
export const channels = [
  "bone.x",
  "bone.y",
  "bone.rotation",
  "bone.scaleX",
  "bone.scaleY",
  "layer.x",
  "layer.y",
  "layer.rotation",
  "layer.scaleX",
  "layer.scaleY",
  "layer.opacity",
  "layer.visible",
  "mesh.deform",
  "ik.x",
  "ik.y",
  "ik.blend",
  "attachment.bone",
] as const;
export const channelSchema = z.enum(channels);
export const handlesSchema = z
  .object({
    x1: n.min(0).max(1),
    y1: n.min(0).max(1),
    x2: n.min(0).max(1),
    y2: n.min(0).max(1),
  })
  .strict();
export const offsetsSchema = z
  .record(
    id,
    z.object({ x: n.min(-4096).max(4096), y: n.min(-4096).max(4096) }).strict(),
  )
  .superRefine((v, ctx) => {
    if (Object.keys(v).length > 512)
      ctx.addIssue({
        code: "custom",
        message: "Deformation vượt 512 vertices",
      });
  });
export const animationValueSchema = z.union([
  n,
  z.boolean(),
  id,
  z.null(),
  offsetsSchema,
]);
export const keyframeSchema = z
  .object({
    id,
    time: n.min(0).max(120),
    value: animationValueSchema,
    interpolation: z.enum(["linear", "stepped", "bezier"]),
    handles: handlesSchema.optional(),
  })
  .strict();
export const trackSchema = z
  .object({
    id,
    clipId: id,
    targetId: id,
    type: channelSchema,
    enabled: z.boolean(),
    rotationMode: z.enum(["shortest", "direct"]),
    keyframes: z.array(keyframeSchema).max(4096),
  })
  .strict();
const boneState = z
  .object({
    boneId: id,
    x: coordinate,
    y: coordinate,
    rotation: n.min(-36000).max(36000),
    scaleX: n.min(0.05).max(10),
    scaleY: n.min(0.05).max(10),
  })
  .strict();
const layerState = z
  .object({
    layerId: id,
    x: coordinate,
    y: coordinate,
    rotation: n.min(-36000).max(36000),
    scaleX: n.min(0.01).max(20),
    scaleY: n.min(0.01).max(20),
    opacity: n.min(0).max(1),
    visible: z.boolean(),
  })
  .strict();
export const clipSchema = z
  .object({
    id,
    name: z.string().min(1).max(100),
    duration: n.min(1 / 120).max(120),
    fps: z.number().int().min(1).max(120),
    loopMode: z.enum(["loop", "once"]),
    range: z.object({ start: n.min(0), end: n.positive().max(120) }).strict(),
    trackIds: z.array(id).max(4096),
    eventIds: z.array(id).max(1024),
    baseState: z
      .object({
        bonePoses: z.array(boneState).max(256),
        layerStates: z.array(layerState).max(1000),
        ikStates: z
          .array(
            z
              .object({
                targetId: id,
                x: coordinate,
                y: coordinate,
                blend: n.min(0).max(1),
                enabled: z.boolean(),
              })
              .strict(),
          )
          .max(128),
        attachmentStates: z
          .array(z.object({ layerId: id, boneId: id.nullable() }).strict())
          .max(1000),
      })
      .strict(),
    metadata: z
      .object({
        origin: z.enum(["user-created", "procedural"]),
        description: z.string().max(2000),
        tags: z.array(z.string().max(80)).max(20),
      })
      .strict(),
  })
  .strict();
export const eventPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("marker"), value: z.string().max(500) }).strict(),
  z.object({ type: z.literal("number"), value: n }).strict(),
  z
    .object({
      type: z.literal("vfx"),
      action: z.enum(["start", "stop", "burst"]),
      effectName: z.string().min(1).max(100),
      socketId: id.optional(),
    })
    .strict(),
]);
export const eventSchema = z
  .object({
    id,
    clipId: id,
    name: z.string().min(1).max(100),
    time: n.min(0).max(120),
    enabled: z.boolean(),
    payload: eventPayloadSchema.nullable(),
  })
  .strict();
export type AnimationChannel = z.infer<typeof channelSchema>;
export type AnimationClip = z.infer<typeof clipSchema>;
export type AnimationTrack = z.infer<typeof trackSchema>;
export type Keyframe = z.infer<typeof keyframeSchema>;
export type AnimationValue = z.infer<typeof animationValueSchema>;
export type MeshOffsets = z.infer<typeof offsetsSchema>;
export type AnimationEvent = z.infer<typeof eventSchema>;
export type EasingHandles = z.infer<typeof handlesSchema>;
export const isDiscrete = (type: AnimationChannel) =>
  type === "layer.visible" || type === "attachment.bone";
type AnimationDocument = {
  animationClips: AnimationClip[];
  keyframeTracks: AnimationTrack[];
  animationEvents: AnimationEvent[];
  bones: { id: string }[];
  layers: { id: string }[];
  meshes: { id: string; vertices: { id: string }[] }[];
  ikTargets: {
    id: string;
    rootBoneId: string;
    midBoneId: string;
    endBoneId: string;
  }[];
  equipmentSlots: { id: string }[];
};
export function validateAnimations(
  p: AnimationDocument,
  fail: (s: string) => void,
) {
  const clips = new Map(p.animationClips.map((c) => [c.id, c])),
    bones = new Set(p.bones.map((b) => b.id)),
    layers = new Set(p.layers.map((l) => l.id)),
    meshes = new Map(p.meshes.map((m) => [m.id, m])),
    iks = new Set(p.ikTargets.map((t) => t.id)),
    slots = new Set(p.equipmentSlots.map((s) => s.id));
  let keyCount = 0;
  const targets = new Set<string>();
  for (const c of p.animationClips) {
    if (c.range.start >= c.range.end || c.range.end > c.duration + 1e-8)
      fail("Playback range không hợp lệ");
    const trackIds = p.keyframeTracks
        .filter((t) => t.clipId === c.id)
        .map((t) => t.id),
      eventIds = p.animationEvents
        .filter((e) => e.clipId === c.id)
        .map((e) => e.id);
    if (
      new Set(c.trackIds).size !== c.trackIds.length ||
      new Set(c.eventIds).size !== c.eventIds.length ||
      c.trackIds.length !== trackIds.length ||
      c.eventIds.length !== eventIds.length ||
      c.trackIds.some((id) => !trackIds.includes(id)) ||
      c.eventIds.some((id) => !eventIds.includes(id))
    )
      fail("Clip references không đồng bộ");
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    if (
      !unique(c.baseState.bonePoses.map((b) => b.boneId)) ||
      !unique(c.baseState.layerStates.map((l) => l.layerId)) ||
      !unique(c.baseState.ikStates.map((t) => t.targetId)) ||
      !unique(c.baseState.attachmentStates.map((a) => a.layerId))
    )
      fail("Base state bị trùng");
    if (
      c.baseState.bonePoses.some((b) => !bones.has(b.boneId)) ||
      c.baseState.layerStates.some((l) => !layers.has(l.layerId)) ||
      c.baseState.ikStates.some((t) => !iks.has(t.targetId)) ||
      c.baseState.attachmentStates.some(
        (a) =>
          !layers.has(a.layerId) || (a.boneId !== null && !bones.has(a.boneId)),
      )
    )
      fail("Base state tham chiếu đối tượng không tồn tại");
  }
  for (const t of p.keyframeTracks) {
    const clip = clips.get(t.clipId);
    if (!clip) {
      fail("Track thiếu clip");
      continue;
    }
    const identity = t.clipId + ":" + t.targetId + ":" + t.type;
    if (targets.has(identity)) fail("Track cùng property bị trùng");
    targets.add(identity);
    const category = t.type.split(".")[0];
    if (
      (category === "bone" && !bones.has(t.targetId)) ||
      ((category === "layer" || category === "attachment") &&
        !layers.has(t.targetId)) ||
      (category === "mesh" && !meshes.has(t.targetId)) ||
      (category === "ik" && !iks.has(t.targetId))
    )
      fail("Animation target không tồn tại");
    keyCount += t.keyframes.length;
    let previous = -1;
    for (const k of t.keyframes) {
      if (k.time <= previous + 1e-8 || k.time > clip.duration + 1e-8)
        fail("Keyframe time bị trùng, sai thứ tự hoặc vượt duration");
      previous = k.time;
      if (isDiscrete(t.type) && k.interpolation !== "stepped")
        fail("Track rời rạc cần stepped interpolation");
      if (t.type === "layer.visible") {
        if (typeof k.value !== "boolean") fail("Visibility cần boolean");
      } else if (t.type === "attachment.bone") {
        if (
          k.value !== null &&
          (typeof k.value !== "string" || !bones.has(k.value))
        )
          fail("Attachment key tham chiếu xương không tồn tại");
      } else if (t.type === "mesh.deform") {
        if (!k.value || typeof k.value !== "object") {
          fail("Mesh deformation cần offsets theo vertex UUID");
          continue;
        }
        const vertices = new Set(
          meshes.get(t.targetId)?.vertices.map((v) => v.id) ?? [],
        );
        if (Object.keys(k.value).some((id) => !vertices.has(id)))
          fail("Deformation vertex không tồn tại");
      } else {
        const value = k.value;
        if (typeof value !== "number" || !Number.isFinite(value)) {
          fail("Track số cần finite number");
          continue;
        }
        let min = -10000,
          max = 10000;
        if (t.type.endsWith(".rotation")) {
          min = -36000;
          max = 36000;
        }
        if (t.type.includes("scale")) {
          min = t.type.startsWith("bone") ? 0.05 : 0.01;
          max = t.type.startsWith("bone") ? 10 : 20;
        }
        if (t.type === "layer.opacity" || t.type === "ik.blend") {
          min = 0;
          max = 1;
        }
        if (value < min || value > max)
          fail("Keyframe value vượt giới hạn property");
      }
    }
  }
  if (keyCount > 20000) fail("Dự án vượt 20000 keyframes");
  for (const e of p.animationEvents) {
    const c = clips.get(e.clipId);
    if (!c || e.time > c.duration + 1e-8) fail("Event ngoài clip duration");
    if (
      e.payload?.type === "vfx" &&
      e.payload.socketId &&
      !slots.has(e.payload.socketId)
    )
      fail("Event socket không tồn tại");
    if (
      e.name === "sword_trail_start" &&
      e.payload &&
      (e.payload.type !== "vfx" || e.payload.action !== "start")
    )
      fail("sword_trail_start cần payload VFX start");
    if (
      e.name === "sword_trail_end" &&
      e.payload &&
      (e.payload.type !== "vfx" || e.payload.action !== "stop")
    )
      fail("sword_trail_end cần payload VFX stop");
  }
}
