import { parameterValue } from "./parameters";
import { attachmentMatrix } from "./scene";
export * from "./schema";
import type { VFXEffect, Emitter } from "./schema";
export type Transform = {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
};
export type Particle = {
  id: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  color: number;
  alpha: number;
  blendMode: Emitter["blendMode"];
  textureId?: string | null;
  flipY?: boolean;
};
export type AttachmentSampler = (
  boneId: string | null,
  time: number,
) => Transform;
const identity: Transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function tint(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16),
    y = parseInt(b.slice(1), 16);
  return [16, 8, 0].reduce(
    (v, s) =>
      v | (Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t) << s),
    0,
  );
}
function apply(m: Transform, x: number, y: number) {
  return { x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty };
}
function attachment(e: Emitter, time: number, sample: AttachmentSampler) {
  return attachmentMatrix(e.attachment, time, sample);
}
/** Absolute fixed-grid evaluation: no mutable state, browser deltas or hidden event dispatch.
 * Loop boundaries restart particles. World births sample historical attachments, local particles use the current attachment.
 * Work is bounded by duration, rate, node count and a global live-particle cap. */
export function evaluateParticles(
  effect: VFXEffect,
  time: number,
  sample: AttachmentSampler = () => identity,
  quality: "low" | "medium" | "high" = "medium",
  parameters?: (time: number) => VFXEffect,
): Particle[] {
  if (!effect.enabled || !Number.isFinite(time) || time < 0) return [];
  const t =
      effect.loopMode === "loop"
        ? time % effect.duration
        : Math.min(time, effect.duration + 20),
    emitting = Math.min(t, effect.duration),
    density = quality === "low" ? 0.35 : quality === "medium" ? 0.65 : 1;
  const result: Particle[] = [];
  const cycleOffset = effect.loopMode === "loop" ? time - t : 0;
  const sampleAt: AttachmentSampler = (id, seconds) =>
    sample(id, seconds + cycleOffset);
  effect.nodes.forEach((sourceEmitter, index) => {
    let e = sourceEmitter;
    if (!e.enabled) return;
    const random = rng(effect.seed ^ Math.imul(index + 1, 2654435761)),
      rate = e.rate * effect.intensity * density,
      burst = Math.floor(e.burst * effect.intensity * density),
      count = burst + Math.floor(emitting * rate),
      current = attachment(e, t, sampleAt);
    let live = 0;
    const admitted: number[] = [];
    const births: number[] = [];
    if (parameters && effect.tracks?.length) {
      const initial = parameters(0);
      for (
        let k = 0;
        k <
        Math.floor(initial.nodes[index].burst * initial.intensity * density);
        k++
      )
        births.push(0);
      let accumulator = 0;
      for (let tick = 1; tick <= Math.floor(emitting * 120 + 1e-8); tick++) {
        const p = parameters((tick - 0.5) / 120);
        accumulator += (p.nodes[index].rate * p.intensity * density) / 120;
        while (accumulator >= 1) {
          births.push(tick / 120);
          accumulator--;
        }
      }
    }
    for (
      let i = 0;
      i < (births.length || (parameters && effect.tracks?.length ? 0 : count));
      i++
    ) {
      const birth = births.length
        ? births[i]
        : i < burst
          ? 0
          : Math.ceil(((i - burst + 1) / rate) * 120) / 120;
      if (parameters && effect.tracks?.length)
        e = parameters(birth).nodes[index];
      const angle =
          ((e.rotation + (random() - 0.5) * e.spread) * Math.PI) / 180,
        speed =
          e.speed *
          (1 -
            (e.velocityVariation ?? 0.25) +
            random() * (e.velocityVariation ?? 0.25) * 2),
        u = random(),
        v = random();
      const lifeVariation = e.lifetimeVariation ?? 0,
        sizeVariation = e.sizeVariation ?? 0,
        particleLifetime =
          e.lifetime * (1 - lifeVariation + u * lifeVariation * 2),
        initialSize = e.size * (1 - sizeVariation + v * sizeVariation * 2);
      let x = e.position.x,
        y = e.position.y;
      if (e.shape === "circle" || e.shape === "ring") {
        const a = u * Math.PI * 2,
          r = e.radius * (e.shape === "ring" ? 1 : Math.sqrt(v));
        x += Math.cos(a) * r;
        y += Math.sin(a) * r;
      }
      if (e.shape === "rectangle") {
        x += (u - 0.5) * e.radius * 2;
        y += (v - 0.5) * e.radius * 2;
      }
      if (e.shape === "line") x += (u - 0.5) * e.radius * 2;
      if (e.shape === "cone") {
        x += Math.cos(angle) * u * e.radius;
        y += Math.sin(angle) * u * e.radius;
      }
      while (admitted.length && admitted[0] <= birth) admitted.shift();
      if (admitted.length >= e.maxParticles) continue;
      admitted.push(birth + particleLifetime);
      admitted.sort((a, b) => a - b);
      const age = t - birth;
      if (
        age < 0 ||
        age >= particleLifetime ||
        live >= e.maxParticles ||
        result.length >= 4096
      )
        continue;
      let vx = Math.cos(angle) * speed,
        vy = Math.sin(angle) * speed,
        ax = e.acceleration.x,
        ay = e.acceleration.y;
      const m = e.space === "world" ? attachment(e, birth, sampleAt) : current;
      if (e.space === "world") {
        const p = apply(m, x, y);
        x = p.x;
        y = p.y;
        const a = m.a * vx + m.c * vy;
        vy = m.b * vx + m.d * vy;
        vx = a;
        const b = m.a * ax + m.c * ay;
        ay = m.b * ax + m.d * ay;
        ax = b;
      }
      ay+=e.gravity??0;
      // Closed-form drag integration gives the exact fixed-step linear-system solution,
      // including the fractional final step, without accumulating scrub errors.
      const decay = Math.exp(-e.drag * age),
        f = e.drag > 1e-8 ? (1 - decay) / e.drag : age,
        g = e.drag > 1e-8 ? (age - f) / e.drag : (age * age) / 2;
      x += vx * f + ax * g;
      y += vy * f + ay * g;
      if (e.orbitVelocity) {
        const center =
            e.space === "world"
              ? apply(m, e.position.x, e.position.y)
              : e.position,
          angle =
            ((e.orbitVelocity * Math.PI) / 180) *
            age *
            (e.space === "world" && m.a * m.d - m.b * m.c < 0 ? -1 : 1),
          dx = x - center.x,
          dy = y - center.y;
        x = center.x + Math.cos(angle) * dx - Math.sin(angle) * dy;
        y = center.y + Math.sin(angle) * dx + Math.cos(angle) * dy;
      }
      const p = e.space === "local" ? apply(m, x, y) : { x, y },
        life = age / particleLifetime;
      result.push({
        id: `${effect.id}:${e.id}:${i}`,
        x: p.x,
        y: p.y,
        size:
          initialSize *
          Number(
            e.scaleOverLife
              ? parameterValue(e.scaleOverLife, life)
              : 1 + (e.endScale - 1) * life,
          ) *
          Math.hypot(m.a, m.b),
        rotation:
          ((e.rotation + age * e.angularVelocity) * Math.PI) / 180 +
          Math.atan2(m.b, m.a),
        flipY: m.a * m.d - m.b * m.c < 0,
        color: e.colorOverLife
          ? parseInt(String(parameterValue(e.colorOverLife, life)).slice(1), 16)
          : tint(e.color, e.endColor, life),
        alpha:
          e.opacity *
          Number(
            e.opacityOverLife
              ? parameterValue(e.opacityOverLife, life)
              : 1 - life,
          ),
        blendMode: e.blendMode,
        textureId: e.textureId,
      });
      live++;
    }
  });
  return result;
}
export function createParticleEffect(boneId: string | null = null): VFXEffect {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: "Lửa kiếm · procedural",
    enabled: true,
    duration: 2,
    loopMode: "loop",
    seed: 42,
    intensity: 1,
    metadata: {
      provenance: "procedural",
      description: "Particle procedural chỉnh sửa được; không phải AI.",
    },
    nodes: [
      {
        id: crypto.randomUUID(),
        type: "ParticleEmitter",
        name: "Lửa",
        enabled: true,
        position: { x: 0, y: 0 },
        rotation: -90,
        rate: 90,
        burst: 8,
        maxParticles: 256,
        lifetime: 0.65,
        speed: 65,
        spread: 55,
        acceleration: { x: 0, y: -35 },
        drag: 1,
        size: 9,
        endScale: 0.05,
        angularVelocity: 90,
        color: "#ff6600",
        endColor: "#ffff77",
        opacity: 0.9,
        shape: "line",
        radius: 18,
        blendMode: "add",
        space: "local",
        attachment: {
          boneId,
          offset: { x: 0, y: 0 },
          rotation: 0,
          scale: 1,
          followRotation: true,
          followScale: true,
        },
      },
    ],
  };
}
export function duplicateEffect(e: VFXEffect): VFXEffect {
  const copy = structuredClone(e),
    map = new Map<string, string>();
  const entities = [
    copy,
    ...copy.nodes,
    ...copy.nodes.flatMap((n) => [
      ...(n.scaleOverLife ?? []),
      ...(n.opacityOverLife ?? []),
      ...(n.colorOverLife ?? []),
    ]),
    ...(copy.trails ?? []),
    ...(copy.flipbooks ?? []),
    ...(copy.filters ?? []),
    ...(copy.tracks ?? []),
    ...(copy.tracks ?? []).flatMap((t) => t.keys),
  ];
  for (const n of entities) {
    const next = crypto.randomUUID();
    map.set(n.id, next);
    n.id = next;
  }
  for (const t of copy.tracks ?? [])
    t.targetId = map.get(t.targetId) ?? t.targetId;
  copy.name = (e.name + " copy").slice(0, 100);
  return copy;
}

export * from "./parameters";
export * from "./presets";
export * from "./scene";
export * from "./validation";
export * from "./project";
