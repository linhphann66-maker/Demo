import type { VFXEffect, VFXAttachment } from "./schema";
export function effectIds(e: VFXEffect) {
  return [
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
  ].map((n) => n.id);
}
export function effectAttachments(e: VFXEffect): VFXAttachment[] {
  return [
    ...e.nodes.map((n) => n.attachment),
    ...(e.trails ?? []).flatMap((n) => [n.base, n.tip]),
    ...(e.flipbooks ?? []).map((n) => n.attachment),
  ];
}
export function effectAssets(e: VFXEffect) {
  return [
    ...e.nodes.map((n) => n.textureId),
    ...(e.trails ?? []).map((n) => n.textureId),
    ...(e.flipbooks ?? []).map((n) => n.assetId),
  ].filter((n): n is string => !!n);
}
export function validateEffectReferences(
  e: VFXEffect,
  p: {
    bones: { id: string }[];
    assetReferences: { id: string; width: number; height: number }[];
    animationClips: { id: string }[];
    animationEvents: { id: string; clipId: string; time: number }[];
  },
  fail: (s: string) => void,
) {
  for (const a of effectAttachments(e))
    if (a.boneId && !p.bones.some((b) => b.id === a.boneId))
      fail("Missing VFX bone");
  for (const id of effectAssets(e))
    if (!p.assetReferences.some((a) => a.id === id))
      fail("Missing VFX texture");
  for (const f of e.flipbooks ?? []) {
    const a = p.assetReferences.find((a) => a.id === f.assetId);
    if (a)
      for (const r of f.frames)
        if (r.x + r.w > a.width || r.y + r.h > a.height)
          fail("Flipbook frame exceeds texture");
    if (f.frameOffset >= f.frames.length) fail("Invalid flipbook offset");
  }
  const tr = e.trigger;
  if (tr) {
    if (tr.clipId && !p.animationClips.some((c) => c.id === tr.clipId))
      fail("Missing VFX clip");
    for (const id of [tr.startEventId, tr.stopEventId])
      if (
        id &&
        !p.animationEvents.some((ev) => ev.id === id && ev.clipId === tr.clipId)
      )
        fail("Missing or incompatible VFX event");
    const start = p.animationEvents.find((ev) => ev.id === tr.startEventId),
      stop = p.animationEvents.find((ev) => ev.id === tr.stopEventId);
    if (start && stop && stop.time < start.time)
      fail("VFX stop precedes start");
  }
}
