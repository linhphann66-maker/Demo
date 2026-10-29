import { z } from "zod";
const n = z.number().finite(),
  id = z.string().uuid(),
  color = z.string().regex(/^#[\da-fA-F]{6}$/);
export const pointSchema = z
  .object({ x: n.min(-10000).max(10000), y: n.min(-10000).max(10000) })
  .strict();
export const attachmentSchema = z
  .object({
    boneId: id.nullable(),
    offset: pointSchema,
    rotation: n.min(-3600).max(3600),
    scale: n.min(0.01).max(20),
    followRotation: z.boolean(),
    followScale: z.boolean(),
    followPosition: z.boolean().optional(),
    fixedPosition: pointSchema.optional(),
  })
  .strict();
export const triggerSchema = z
  .object({
    clipId: id.nullable(),
    startEventId: id.nullable(),
    stopEventId: id.nullable(),
    delay: n.min(0).max(30),
    mode: z.enum(["continuous", "burst"]),
  })
  .strict();
export const trailSchema = z
  .object({
    id,
    type: z.literal("TrailRenderer"),
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    base: attachmentSchema,
    tip: attachmentSchema,
    fadePower: n.min(0.1).max(4).optional(),
    width: n.min(0.1).max(500),
    lifetime: n.min(0.01).max(5),
    sampleRate: n.int().min(1).max(120),
    segmentLimit: n.int().min(2).max(256),
    color,
    endColor: color,
    opacity: n.min(0).max(1),
    taper: n.min(0).max(1),
    smoothing: z.boolean(),
    blendMode: z.enum(["normal", "add", "screen"]),
    textureId: id.nullable(),
  })
  .strict();
export const frameSchema = z
  .object({
    x: n.int().min(0).max(4095),
    y: n.int().min(0).max(4095),
    w: n.int().min(1).max(4096),
    h: n.int().min(1).max(4096),
  })
  .strict();
export const flipbookSchema = z
  .object({
    id,
    type: z.literal("FlipbookAnimation"),
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    sourceMetadata: z.string().max(200000).optional(),
    assetId: id,
    frames: z.array(frameSchema).min(1).max(512),
    fps: n.min(1).max(120),
    loop: z.boolean(),
    frameOffset: n.int().min(0).max(511),
    opacity: n.min(0).max(1),
    scale: n.min(0.01).max(20),
    rotation: n.min(-3600).max(3600),
    attachment: attachmentSchema,
    blendMode: z.enum(["normal", "add", "screen"]),
  })
  .strict();
export const filterSchema = z
  .object({
    id,
    type: z.enum([
      "GlowEffect",
      "ColorModifier",
      "TransformModifier",
      "Distortion",
      "Dissolve",
    ]),
    enabled: z.boolean(),
    intensity: n.min(0).max(20),
    color,
    opacity: n.min(0).max(1),
    position: pointSchema,
    rotation: n.min(-3600).max(3600),
    scale: n.min(0.01).max(20),
  })
  .strict();
export const channels = [
  "rate",
  "speed",
  "intensity",
  "color",
  "opacity",
  "scale",
  "rotation",
  "glow",
  "width",
  "x",
  "y",
] as const;
export const keySchema = z
  .object({
    id,
    time: n.min(0).max(30),
    value: z.union([n.min(-10000).max(10000), color]),
    interpolation: z.enum(["linear", "stepped", "bezier"]),
    handles: z
      .object({
        x1: n.min(0).max(1),
        y1: n.min(0).max(1),
        x2: n.min(0).max(1),
        y2: n.min(0).max(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export const vfxTrackSchema = z
  .object({
    id,
    targetId: id,
    channel: z.enum(channels),
    keys: z.array(keySchema).max(2048),
  })
  .strict();
export type VFXAttachment = z.infer<typeof attachmentSchema>;
export type Trail = z.infer<typeof trailSchema>;
export type Flipbook = z.infer<typeof flipbookSchema>;
export type VFXTrack = z.infer<typeof vfxTrackSchema>;
export type VFXKey = z.infer<typeof keySchema>;

export function filterChannels(type: string): string[] {
  switch (type) {
    case "GlowEffect":
      return ["glow", "color", "opacity"];
    case "ColorModifier":
      return ["glow", "color", "opacity"];
    case "TransformModifier":
      return ["x", "y", "rotation", "scale", "opacity"];
    default:
      return ["glow"];
  }
}

export function parameterLimits(
  channel: string,
  kind: string,
): [number, number] {
  switch (channel) {
    case "rate":
      return [0, 500];
    case "speed":
      return [0, 1000];
    case "intensity":
      return [0, 4];
    case "opacity":
      return [0, 1];
    case "scale":
      return kind === "emitter" ? [0.1, 100] : [0.01, 20];
    case "rotation":
      return [-3600, 3600];
    case "glow":
      return [0, 20];
    case "width":
      return [0.1, 500];
    default:
      return [-10000, 10000];
  }
}
