import { zipSync, strToU8 } from "fflate";
import type { ProjectDocument } from "../../document-core/src";
import type { VFXEffect } from "../../vfx-core/src";
import { effectAssets } from "../../vfx-core/src/validation";
import type { VFXScene } from "../../vfx-core/src/scene";
export function editableVFXPackage(doc: ProjectDocument, effect: VFXEffect) {
  const ids = new Set(effectAssets(effect));
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of doc.assetReferences)
      if (ids.has(a.id))
        for (const id of a.dependencies)
          if (!ids.has(id)) {
            ids.add(id);
            changed = true;
          }
  }
  const assets = doc.assetReferences.filter((a) => ids.has(a.id));
  return {
    format: "a2dstudio-vfx",
    version: 1,
    effect,
    assets,
    events: doc.animationEvents.filter(
      (e) =>
        e.id === effect.trigger?.startEventId ||
        e.id === effect.trigger?.stopEventId,
    ),
    clip:
      doc.animationClips.find((c) => c.id === effect.trigger?.clipId) ?? null,
  };
}
export function editableVFXZip(doc: ProjectDocument, effect: VFXEffect) {
  return zipSync(
    { "effect.json": strToU8(JSON.stringify(editableVFXPackage(doc, effect))) },
    { level: 6 },
  );
}
export function vfxPoints(frame: VFXScene) {
  const result: { x: number; y: number }[] = [];
  for (const style of frame.styles) {
    const points: { x: number; y: number }[] = [];
    for (const p of frame.particles.filter((p) =>
      p.id.startsWith(style.effectId + ":"),
    )) {
      const r = p.size * 0.72;
      points.push({ x: p.x - r, y: p.y - r }, { x: p.x + r, y: p.y + r });
    }
    for (const t of frame.trails.filter((t) => t.effectId === style.effectId))
      for (const p of t.rows)
        points.push({ x: p.x, y: p.y }, { x: p.bx, y: p.by });
    for (const f of frame.flipbooks.filter(
      (f) => f.effectId === style.effectId,
    ))
      for (const x of [-0.5, 0.5])
        for (const y of [-0.5, 0.5]) {
          const px = x * f.rect.w * f.scaleX,
            py = y * f.rect.h * f.scaleY;
          points.push({
            x: f.x + Math.cos(f.rotation) * px - Math.sin(f.rotation) * py,
            y: f.y + Math.sin(f.rotation) * px + Math.cos(f.rotation) * py,
          });
        }
    const transform = style.filters.find(
      (f) => f.enabled && f.type === "TransformModifier",
    );
    let pad = style.filters.some((f) => f.enabled && f.type === "GlowEffect")
      ? 64
      : 0;
    if (style.filters.some((f) => f.enabled && f.type === "Distortion"))
      pad += 32;
    if (transform) {
      const anchor = frame.particles.find((p) =>
          p.id.startsWith(style.effectId + ":"),
        ) ??
          frame.trails.find((t) => t.effectId === style.effectId)?.rows[0] ?? {
            x: 0,
            y: 0,
          },
        r = (transform.rotation * Math.PI) / 180;
      for (const p of points) {
        const x = (p.x - anchor.x) * transform.scale,
          y = (p.y - anchor.y) * transform.scale;
        p.x =
          anchor.x + transform.position.x + Math.cos(r) * x - Math.sin(r) * y;
        p.y =
          anchor.y + transform.position.y + Math.sin(r) * x + Math.cos(r) * y;
      }
      pad *= transform.scale;
    }
    for (const p of points)
      result.push(
        { x: p.x - pad, y: p.y - pad },
        { x: p.x + pad, y: p.y + pad },
      );
  }
  return result;
}
