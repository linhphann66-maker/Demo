import type { VFXEffect, Trail, VFXAttachment } from "./schema";
import type { AttachmentSampler, Transform, Particle } from "./index";
export type RibbonRow = {
  x: number;
  y: number;
  bx: number;
  by: number;
  alpha: number;
  color: number;
};
export type Ribbon = {
  id: string;
  effectId: string;
  rows: RibbonRow[];
  blendMode: Trail["blendMode"];
  textureId: string | null;
};
export type FlipFrame = {
  id: string;
  effectId: string;
  assetId: string;
  rect: { x: number; y: number; w: number; h: number };
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  blendMode: Trail["blendMode"];
};
export type VFXGizmo = {
  effectId: string;
  targetId: string;
  kind: "emitter" | "base" | "tip" | "flipbook";
  boneId: string | null;
  x: number;
  y: number;
  radius: number;
  angle: number;
};
export type VFXScene = {
  time?: number;
  particles: Particle[];
  trails: Ribbon[];
  flipbooks: FlipFrame[];
  styles: { effectId: string; filters: NonNullable<VFXEffect["filters"]> }[];
  gizmos: VFXGizmo[];
};
export const emptyScene = (): VFXScene => ({
  particles: [],
  trails: [],
  flipbooks: [],
  styles: [],
  gizmos: [],
});
export function attachmentMatrix(
  a: VFXAttachment,
  time: number,
  sample: AttachmentSampler,
): Transform {
  const m = sample(a.boneId, time),
    r = (a.rotation * Math.PI) / 180,
    angle = (a.followRotation ? Math.atan2(m.b, m.a) : 0) + r,
    sign = m.a * m.d - m.b * m.c < 0 ? -1 : 1;
  const sx = a.scale * (a.followScale ? Math.hypot(m.a, m.b) : 1),
    sy = a.scale * (a.followScale ? Math.hypot(m.c, m.d) : 1) * sign;
  return {
    a: Math.cos(angle) * sx,
    b: Math.sin(angle) * sx,
    c: -Math.sin(angle) * sy,
    d: Math.cos(angle) * sy,
    tx:
      a.followPosition === false
        ? (a.fixedPosition?.x ?? 0)
        : m.a * a.offset.x + m.c * a.offset.y + m.tx,
    ty:
      a.followPosition === false
        ? (a.fixedPosition?.y ?? 0)
        : m.b * a.offset.x + m.d * a.offset.y + m.ty,
  };
}
export function evaluateTrail(
  e: VFXEffect,
  trail: Trail,
  time: number,
  stop: number,
  sample: AttachmentSampler,
): Ribbon {
  const rows: RibbonRow[] = [],
    end = Math.min(time, stop, e.duration),
    start = Math.max(0, time - trail.lifetime),
    step = 1 / trail.sampleRate;
  const times: number[] = [];
  for (let i = Math.ceil(start / step); i * step <= end + 1e-8; i++)
    times.push(i * step);
  if (
    end >= start &&
    (times.length === 0 || end - times[times.length - 1] > 1e-6)
  )
    times.push(end);
  for (const t of times.slice(-trail.segmentLimit)) {
    const b = attachmentMatrix(trail.base, t, sample),
      p = attachmentMatrix(trail.tip, t, sample),
      dx = b.tx - p.tx,
      dy = b.ty - p.ty,
      len = Math.hypot(dx, dy) || 1,
      age = (time - t) / trail.lifetime;
    const fade = Math.pow(Math.max(0, 1 - age), trail.fadePower ?? 1),
      w = (trail.width * Math.hypot(p.a, p.b) * (1 - trail.taper * age)) / len;
    const a = parseInt(trail.color.slice(1), 16),
      z = parseInt(trail.endColor.slice(1), 16),
      color = [16, 8, 0].reduce(
        (v, s) =>
          v |
          (Math.round(
            ((a >> s) & 255) * fade + ((z >> s) & 255) * (1 - fade),
          ) <<
            s),
        0,
      );
    rows.push({
      x: p.tx,
      y: p.ty,
      bx: p.tx + dx * w,
      by: p.ty + dy * w,
      alpha: fade * trail.opacity,
      color,
    });
  }
  if (trail.smoothing && rows.length > 2) {
    const smooth = rows.map((r, i) => {
      if (!i || i === rows.length - 1) return r;
      const a = rows[i - 1],
        b = rows[i + 1];
      return {
        ...r,
        x: (a.x + 2 * r.x + b.x) / 4,
        y: (a.y + 2 * r.y + b.y) / 4,
        bx: (a.bx + 2 * r.bx + b.bx) / 4,
        by: (a.by + 2 * r.by + b.by) / 4,
      };
    });
    return {
      id: trail.id,
      effectId: e.id,
      rows: smooth,
      blendMode: trail.blendMode,
      textureId: trail.textureId,
    };
  }
  return {
    id: trail.id,
    effectId: e.id,
    rows,
    blendMode: trail.blendMode,
    textureId: trail.textureId,
  };
}
