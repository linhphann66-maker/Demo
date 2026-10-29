import {
  attachmentSchema,
  keySchema,
  filterChannels,
  parameterLimits,
  triggerSchema,
  trailSchema,
  flipbookSchema,
  filterSchema,
  vfxTrackSchema,
} from "./extended-schema";
export * from "./extended-schema";
import { z } from "zod";
const number = z.number().finite();
const point = z
  .object({
    x: number.min(-10000).max(10000),
    y: number.min(-10000).max(10000),
  })
  .strict();
export const emitterSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["ParticleEmitter", "SpriteEmitter"]),
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    position: point,
    rotation: number.min(-3600).max(3600),
    rate: number.min(0).max(500),
    burst: z.number().int().min(0).max(512),
    maxParticles: z.number().int().min(1).max(1024),
    lifetime: number.min(0.05).max(10),
    speed: number.min(0).max(1000),
    spread: number.min(0).max(360),
    acceleration: point,
    gravity:z.number().finite().min(-2000).max(2000).optional(),
    drag: number.min(0).max(20),
    size: number.min(0.1).max(100),
    endScale: number.min(0).max(5),
    angularVelocity: number.min(-3600).max(3600),
    color: z.string().regex(/^#[\da-fA-F]{6}$/),
    endColor: z.string().regex(/^#[\da-fA-F]{6}$/),
    opacity: number.min(0).max(1),
    shape: z.enum(["point", "circle", "ring", "rectangle", "line", "cone"]),
    radius: number.min(0).max(500),
    blendMode: z.enum(["normal", "add", "screen"]),
    space: z.enum(["local", "world"]),
    attachment: attachmentSchema,
    orbitVelocity: z.number().finite().min(-720).max(720).optional(),
    lifetimeVariation: z.number().finite().min(0).max(0.9).optional(),
    velocityVariation: z.number().finite().min(0).max(1).optional(),
    sizeVariation: z.number().finite().min(0).max(0.9).optional(),
    scaleOverLife: z.array(keySchema).min(2).max(32).optional(),
    opacityOverLife: z.array(keySchema).min(2).max(32).optional(),
    colorOverLife: z.array(keySchema).min(2).max(32).optional(),
    textureId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const effectSchema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    duration: number.min(0.05).max(30),
    loopMode: z.enum(["once", "loop"]),
    seed: z.number().int().min(0).max(4294967295),
    intensity: number.min(0).max(4),
    nodes: z.array(emitterSchema).min(1).max(8),
    trigger: triggerSchema.optional(),
    trails: z.array(trailSchema).max(8).optional(),
    flipbooks: z.array(flipbookSchema).max(8).optional(),
    filters: z.array(filterSchema).max(8).optional(),
    tracks: z.array(vfxTrackSchema).max(128).optional(),
    metadata: z
      .object({
        provenance: z.enum(["procedural", "user-created"]),
        description: z.string().max(1000),
      })
      .strict(),
  })
  .strict()
  .superRefine((e, ctx) => {
    const records = [
      e,
      ...e.nodes,
      ...e.nodes.flatMap((n) => [
        ...(n.scaleOverLife ?? []),
        ...(n.opacityOverLife ?? []),
        ...(n.colorOverLife ?? []),
      ]),
      ...(e.trails ?? []),
      ...(e.flipbooks ?? []),
      ...(e.filters ?? []),
      ...(e.tracks ?? []),
      ...(e.tracks ?? []).flatMap((t) => t.keys),
    ];
    if (new Set(records.map((n) => n.id)).size !== records.length)
      ctx.addIssue({ code: "custom", message: "Duplicate emitter ID" });
    const targets = new Map<string, Set<string>>([
      [e.id, new Set(["intensity"])],
      ...e.nodes.map(
        (n) =>
          [
            n.id,
            new Set([
              "rate",
              "speed",
              "color",
              "opacity",
              "scale",
              "rotation",
              "x",
              "y",
            ]),
          ] as [string, Set<string>],
      ),
      ...(e.trails ?? []).map(
        (n) =>
          [n.id, new Set(["width", "color", "opacity"])] as [
            string,
            Set<string>,
          ],
      ),
      ...(e.filters ?? []).map(
        (n) => [n.id, new Set(filterChannels(n.type))] as [string, Set<string>],
      ),
      ...(e.flipbooks ?? []).map(
        (n) =>
          [n.id, new Set(["opacity", "scale", "rotation"])] as [
            string,
            Set<string>,
          ],
      ),
    ]);
    for (const node of e.nodes) {
      if (node.type === "SpriteEmitter" && !node.textureId)
        ctx.addIssue({
          code: "custom",
          message: "SpriteEmitter requires texture",
        });
      for (const [channel, keys] of [
        ["scale", node.scaleOverLife],
        ["opacity", node.opacityOverLife],
        ["color", node.colorOverLife],
      ] as const)
        if (keys)
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (
              k.time > 1 ||
              (i > 0 && k.time <= keys[i - 1].time) ||
              (channel === "color"
                ? typeof k.value !== "string"
                : typeof k.value !== "number" ||
                  k.value < 0 ||
                  k.value > (channel === "opacity" ? 1 : 5))
            )
              ctx.addIssue({
                code: "custom",
                message: "Invalid normalized lifetime curve",
              });
          }
    }
    if (
      new Set((e.filters ?? []).map((f) => f.type)).size !==
      (e.filters ?? []).length
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate filter type in effect stack",
      });
    const seen = new Set<string>();
    for (const t of e.tracks ?? []) {
      const label = t.targetId + ":" + t.channel;
      if (!targets.get(t.targetId)?.has(t.channel) || seen.has(label))
        ctx.addIssue({
          code: "custom",
          message: "Invalid or duplicate parameter track",
        });
      seen.add(label);
      for (let i = 0; i < t.keys.length; i++) {
        const k = t.keys[i];
        const [min, max] = parameterLimits(
          t.channel,
          e.nodes.some((n) => n.id === t.targetId) ? "emitter" : "other",
        );
        if (typeof k.value === "number" && (k.value < min || k.value > max))
          ctx.addIssue({
            code: "custom",
            message: "Parameter key out of range",
          });
        if (
          k.time > e.duration ||
          (i > 0 && k.time <= t.keys[i - 1].time) ||
          (t.channel === "color"
            ? typeof k.value !== "string"
            : typeof k.value !== "number")
        )
          ctx.addIssue({
            code: "custom",
            message: "Invalid parameter keyframe",
          });
      }
    }
    if (e.nodes.reduce((n, e) => n + e.maxParticles, 0) > 2048)
      ctx.addIssue({
        code: "custom",
        message: "Effect particle budget exceeds 2048",
      });
  });
export type VFXEffect = z.infer<typeof effectSchema>;
export type Emitter = z.infer<typeof emitterSchema>;
