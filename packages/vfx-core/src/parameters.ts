import { cubicEase } from "../../animation-core/src/evaluation";
import { type VFXEffect, type VFXKey, type VFXTrack } from "./schema";
export function parameterValue(
  keys: VFXKey[],
  time: number,
): number | string | undefined {
  if (!keys.length) return undefined;
  if (time <= keys[0].time) return keys[0].value;
  let lo = 0,
    hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(0, lo - 1);
  const a = keys[i],
    b = keys[i + 1];
  if (!b || a.interpolation === "stepped") return a.value;
  let t = (time - a.time) / (b.time - a.time);
  if (a.interpolation === "bezier") t = cubicEase(t, a.handles);
  if (typeof a.value === "number" && typeof b.value === "number")
    return a.value + (b.value - a.value) * t;
  const x = parseInt(String(a.value).slice(1), 16),
    y = parseInt(String(b.value).slice(1), 16);
  return (
    "#" +
    [16, 8, 0]
      .map((s) =>
        Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
const clamp = (n: unknown, min: number, max: number) =>
  Math.max(min, Math.min(max, Number(n)));
export function parameterEffect(source: VFXEffect, time: number): VFXEffect {
  const e: VFXEffect = {
    ...source,
    nodes: source.nodes.map((n) => ({
      ...n,
      position: { ...n.position },
      acceleration: { ...n.acceleration },
    })),
    trails: source.trails?.map((n) => ({ ...n })),
    filters: source.filters?.map((n) => ({
      ...n,
      position: { ...n.position },
    })),
    flipbooks: source.flipbooks?.map((n) => ({ ...n })),
  };
  for (const t of e.tracks ?? []) {
    const v = parameterValue(t.keys, time);
    if (v === undefined) continue;
    if (t.targetId === e.id) {
      if (t.channel === "intensity") e.intensity = clamp(v, 0, 4);
      continue;
    }
    const emitter = e.nodes.find((n) => n.id === t.targetId),
      trail = e.trails?.find((n) => n.id === t.targetId),
      filter = e.filters?.find((n) => n.id === t.targetId),
      flip = e.flipbooks?.find((n) => n.id === t.targetId);
    if (emitter) {
      switch (t.channel) {
        case "rate":
          emitter.rate = clamp(v, 0, 500);
          break;
        case "speed":
          emitter.speed = clamp(v, 0, 1000);
          break;
        case "color":
          emitter.color = String(v);
          break;
        case "opacity":
          emitter.opacity = clamp(v, 0, 1);
          break;
        case "scale":
          emitter.size = clamp(v, 0.1, 100);
          break;
        case "rotation":
          emitter.rotation = clamp(v, -3600, 3600);
          break;
        case "x":
          emitter.position.x = clamp(v, -10000, 10000);
          break;
        case "y":
          emitter.position.y = clamp(v, -10000, 10000);
      }
    }
    if (trail) {
      if (t.channel === "width") trail.width = clamp(v, 0.1, 500);
      if (t.channel === "color") trail.color = String(v);
      if (t.channel === "opacity") trail.opacity = clamp(v, 0, 1);
    }
    if (filter) {
      if (t.channel === "glow") filter.intensity = clamp(v, 0, 20);
      if (t.channel === "color") filter.color = String(v);
      if (t.channel === "opacity") filter.opacity = clamp(v, 0, 1);
      if (t.channel === "scale") filter.scale = clamp(v, 0.01, 20);
      if (t.channel === "rotation") filter.rotation = clamp(v, -3600, 3600);
      if (t.channel === "x" || t.channel === "y")
        filter.position[t.channel] = clamp(v, -10000, 10000);
    }
    if (flip) {
      if (t.channel === "opacity") flip.opacity = clamp(v, 0, 1);
      if (t.channel === "scale") flip.scale = clamp(v, 0.01, 20);
      if (t.channel === "rotation") flip.rotation = clamp(v, -3600, 3600);
    }
  }
  return e;
}
export function putParameterKey(
  e: VFXEffect,
  targetId: string,
  channel: VFXTrack["channel"],
  time: number,
  value: number | string,
) {
  e.tracks ??= [];
  let t = e.tracks.find(
    (t) => t.targetId === targetId && t.channel === channel,
  );
  if (!t) {
    t = { id: crypto.randomUUID(), targetId, channel, keys: [] };
    e.tracks.push(t);
  }
  const existing = t.keys.find((k) => Math.abs(k.time - time) < 1e-7);
  if (existing) existing.value = value;
  else
    t.keys.push({
      id: crypto.randomUUID(),
      time: Math.max(0, Math.min(e.duration, time)),
      value,
      interpolation: "linear",
    });
  t.keys.sort((a, b) => a.time - b.time);
}
