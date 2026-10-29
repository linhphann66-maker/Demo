import type {
  ProjectDocument,
  AnimationClip,
  AnimationTrack,
  AnimationValue,
  Keyframe,
  MeshOffsets,
  EasingHandles,
  Bone,
} from "../../document-core/src";
import { solveTwoBone, clamp, wrap } from "../../rig-core/src";
export const interpolateNumber = (a: number, b: number, t: number) =>
  a + (b - a) * t;
export function angularDelta(a: number, b: number) {
  return wrap(b - a);
}
export function cubicEase(
  t: number,
  h: EasingHandles = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cubic = (u: number, a: number, b: number) =>
    3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 28; i++) {
    const u = (lo + hi) / 2;
    if (cubic(u, h.x1, h.x2) < t) lo = u;
    else hi = u;
  }
  return cubic((lo + hi) / 2, h.y1, h.y2);
}
export function clipTime(clip: AnimationClip, time: number, wrapLoop = true) {
  if (!Number.isFinite(time)) return 0;
  if (clip.loopMode === "loop" && wrapLoop) {
    const mod = ((time % clip.duration) + clip.duration) % clip.duration;
    return Math.abs(mod) < 1e-10 ? 0 : mod;
  }
  return clamp(time, 0, clip.duration);
}
export function blendValue(
  a: AnimationValue,
  b: AnimationValue,
  t: number,
  angular = false,
  direct = false,
): AnimationValue {
  if (typeof a === "number" && typeof b === "number")
    return a + (angular && !direct ? angularDelta(a, b) : b - a) * t;
  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object"
  ) {
    const result: MeshOffsets = {};
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const p = a[id] ?? { x: 0, y: 0 },
        q = b[id] ?? { x: 0, y: 0 };
      result[id] = {
        x: interpolateNumber(p.x, q.x, t),
        y: interpolateNumber(p.y, q.y, t),
      };
    }
    return result;
  }
  return t < 0.5 ? a : b;
}
export function evaluateTrack(
  track: AnimationTrack,
  time: number,
): AnimationValue | undefined {
  const keys = track.keyframes;
  if (!track.enabled || !keys.length) return undefined;
  if (time <= keys[0].time) return keys[0].value;
  if (time >= keys.at(-1)!.time) return keys.at(-1)!.value;
  let lo = 0,
    hi = keys.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].time <= time) lo = mid;
    else hi = mid;
  }
  const a = keys[lo],
    b = keys[hi];
  if (a.interpolation === "stepped") return a.value;
  let weight = clamp((time - a.time) / (b.time - a.time), 0, 1);
  if (a.interpolation === "bezier") weight = cubicEase(weight, a.handles);
  return blendValue(
    a.value,
    b.value,
    weight,
    track.type.endsWith(".rotation"),
    track.rotationMode === "direct",
  );
}
/** Structural sharing: source images, topology, weights and animation records are never mutated. */
export function clonePose(base: ProjectDocument): ProjectDocument {
  return {
    ...base,
    characterSettings: {
      ...base.characterSettings,
      worldPosition: { ...base.characterSettings.worldPosition },
    },
    rigSettings: { mode: "pose" },
    bones: base.bones.map((b) => ({ ...b, pose: { ...b.pose } })),
    layers: base.layers.map((l) => ({ ...l })),
    ikTargets: base.ikTargets.map((t) => ({ ...t })),
    attachments: base.attachments.map((a) => ({ ...a })),
    meshes: base.meshes.map((m) => ({
      ...m,
      vertices: m.vertices.map((v) => ({ ...v })),
    })),
  };
}
export function poseBase(base: ProjectDocument, clip: AnimationClip) {
  const doc = clonePose(base);
  const bones = new Map(doc.bones.map((b) => [b.id, b])),
    layers = new Map(doc.layers.map((l) => [l.id, l])),
    iks = new Map(doc.ikTargets.map((t) => [t.id, t]));
  for (const b of doc.bones)
    b.pose = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  for (const p of clip.baseState.bonePoses) {
    const b = bones.get(p.boneId);
    if (b)
      b.pose = {
        x: p.x,
        y: p.y,
        rotation: p.rotation,
        scaleX: p.scaleX,
        scaleY: p.scaleY,
      };
  }
  for (const p of clip.baseState.layerStates) {
    const l = layers.get(p.layerId);
    if (l) {
      Object.assign(l, {
        x: p.x,
        y: p.y,
        rotation: p.rotation,
        scaleX: p.scaleX,
        scaleY: p.scaleY,
        opacity: p.opacity,
        visible: p.visible,
      });
    }
  }
  for (const p of clip.baseState.ikStates) {
    const t = iks.get(p.targetId);
    if (t) {
      Object.assign(t, { x: p.x, y: p.y, blend: p.blend, enabled: p.enabled });
    }
  }
  for (const p of clip.baseState.attachmentStates) {
    doc.attachments = doc.attachments.filter((a) => a.layerId !== p.layerId);
    if (p.boneId)
      doc.attachments.push({
        id:
          base.attachments.find((a) => a.layerId === p.layerId)?.id ??
          p.layerId,
        layerId: p.layerId,
        boneId: p.boneId,
      });
  }
  return doc;
}
export function applyIK(doc: ProjectDocument) {
  const depth = (b: Bone): number =>
    b.parentId ? 1 + depth(doc.bones.find((p) => p.id === b.parentId)!) : 0;
  const targets = [...doc.ikTargets].sort(
    (a, b) =>
      depth(doc.bones.find((x) => x.id === a.rootBoneId)!) -
        depth(doc.bones.find((x) => x.id === b.rootBoneId)!) ||
      a.id.localeCompare(b.id),
  );
  for (const t of targets) {
    const weight = t.blend ?? 1;
    if (!t.enabled || weight <= 0) continue;
    const root = doc.bones.find((b) => b.id === t.rootBoneId)!,
      mid = doc.bones.find((b) => b.id === t.midBoneId)!;
    const r = root.pose.rotation,
      m = mid.pose.rotation;
    solveTwoBone(doc, t.id, { x: t.x, y: t.y });
    root.pose.rotation = r + angularDelta(r, root.pose.rotation) * weight;
    mid.pose.rotation = m + angularDelta(m, mid.pose.rotation) * weight;
  }
}
export function evaluateClip(
  base: ProjectDocument,
  clipId: string,
  time: number,
  wrapLoop = true,
) {
  const clip = base.animationClips.find((c) => c.id === clipId);
  if (!clip) return clonePose(base);
  const at = clipTime(clip, time, wrapLoop),
    doc = poseBase(base, clip);
  const owner = base.characterVariants.find((v) => v.clipIds.includes(clipId));
  if (owner) doc.characterSettings.characterView = owner.view;
  const bones = new Map(doc.bones.map((b) => [b.id, b])),
    layers = new Map(doc.layers.map((l) => [l.id, l])),
    meshes = new Map(doc.meshes.map((m) => [m.id, m])),
    targets = new Map(doc.ikTargets.map((t) => [t.id, t]));
  for (const track of base.keyframeTracks) {
    if (track.clipId !== clip.id) continue;
    const value = evaluateTrack(track, at);
    if (value === undefined) continue;
    const [category, property] = track.type.split(".");
    if (category === "bone") {
      const b = bones.get(track.targetId);
      if (!b || typeof value !== "number") continue;
      let n = value;
      if (
        property === "rotation" &&
        (b.constraints.minRotation > -180 || b.constraints.maxRotation < 180)
      )
        n = clamp(
          wrap(n),
          b.constraints.minRotation,
          b.constraints.maxRotation,
        );
      Object.assign(b.pose, { [property]: n });
    } else if (category === "layer") {
      const l = layers.get(track.targetId);
      if (l) Object.assign(l, { [property]: value });
    } else if (category === "ik") {
      const target = targets.get(track.targetId);
      if (target) {
        Object.assign(target, { [property]: value });
        target.enabled = true;
      }
    } else if (category === "attachment") {
      doc.attachments = doc.attachments.filter(
        (a) => a.layerId !== track.targetId,
      );
      if (typeof value === "string")
        doc.attachments.push({
          id: track.id,
          layerId: track.targetId,
          boneId: value,
        });
    } else if (category === "mesh" && value && typeof value === "object") {
      const mesh = meshes.get(track.targetId);
      if (mesh)
        for (const vertex of mesh.vertices) {
          const offset = value[vertex.id];
          if (offset) {
            vertex.x += offset.x;
            vertex.y += offset.y;
          }
        }
    }
  }
  applyIK(doc);
  return doc;
}
export function mixPoses(
  base: ProjectDocument,
  a: ProjectDocument,
  b: ProjectDocument,
  weight: number,
) {
  const t = clamp(weight, 0, 1),
    out = clonePose(base);
  const mapBonesA = new Map(a.bones.map((v) => [v.id, v])),
    mapBonesB = new Map(b.bones.map((v) => [v.id, v]));
  for (const bone of out.bones) {
    const x = mapBonesA.get(bone.id)!.pose,
      y = mapBonesB.get(bone.id)!.pose;
    bone.pose = {
      x: interpolateNumber(x.x, y.x, t),
      y: interpolateNumber(x.y, y.y, t),
      rotation:
        bone.constraints.minRotation > -180 ||
        bone.constraints.maxRotation < 180
          ? clamp(
              interpolateNumber(x.rotation, y.rotation, t),
              bone.constraints.minRotation,
              bone.constraints.maxRotation,
            )
          : x.rotation + angularDelta(x.rotation, y.rotation) * t,
      scaleX: interpolateNumber(x.scaleX ?? 1, y.scaleX ?? 1, t),
      scaleY: interpolateNumber(x.scaleY ?? 1, y.scaleY ?? 1, t),
    };
  }
  const layerA = new Map(a.layers.map((v) => [v.id, v])),
    layerB = new Map(b.layers.map((v) => [v.id, v]));
  for (const l of out.layers) {
    const x = layerA.get(l.id)!,
      y = layerB.get(l.id)!;
    for (const key of ["x", "y", "scaleX", "scaleY", "opacity"] as const)
      l[key] = interpolateNumber(x[key], y[key], t);
    l.rotation = x.rotation + angularDelta(x.rotation, y.rotation) * t;
    l.visible = t < 0.5 ? x.visible : y.visible;
  }
  const meshA = new Map(a.meshes.map((v) => [v.id, v])),
    meshB = new Map(b.meshes.map((v) => [v.id, v]));
  for (const m of out.meshes) {
    const va = new Map(meshA.get(m.id)!.vertices.map((v) => [v.id, v])),
      vb = new Map(meshB.get(m.id)!.vertices.map((v) => [v.id, v]));
    for (const v of m.vertices) {
      const x = va.get(v.id)!,
        y = vb.get(v.id)!;
      v.x = interpolateNumber(x.x, y.x, t);
      v.y = interpolateNumber(x.y, y.y, t);
    }
  }
  out.attachments = (t < 0.5 ? a : b).attachments.map((v) => ({ ...v }));
  const ikA = new Map(a.ikTargets.map((v) => [v.id, v])),
    ikB = new Map(b.ikTargets.map((v) => [v.id, v]));
  for (const target of out.ikTargets) {
    const x = ikA.get(target.id)!,
      y = ikB.get(target.id)!;
    target.x = interpolateNumber(x.x, y.x, t);
    target.y = interpolateNumber(x.y, y.y, t);
    target.blend = interpolateNumber(x.blend ?? 1, y.blend ?? 1, t);
    target.enabled = t < 0.5 ? x.enabled : y.enabled;
  }
  return out;
}
export class AnimationMixer {
  evaluate(
    base: ProjectDocument,
    fromId: string,
    fromTime: number,
    toId: string,
    toTime: number,
    weight: number,
  ) {
    return mixPoses(
      base,
      evaluateClip(base, fromId, fromTime),
      evaluateClip(base, toId, toTime),
      weight,
    );
  }
}
export class PoseCache {
  private base: ProjectDocument | null = null;
  private entries = new Map<string, ProjectDocument>();
  get(base: ProjectDocument, clipId: string, time: number, wrap = true) {
    if (this.base !== base) {
      this.entries.clear();
      this.base = base;
    }
    const key = clipId + ":" + time + ":" + wrap;
    const hit = this.entries.get(key);
    if (hit) return hit;
    const value = evaluateClip(base, clipId, time, wrap);
    this.entries.set(key, value);
    if (this.entries.size > 32)
      this.entries.delete(this.entries.keys().next().value!);
    return value;
  }
  clear() {
    this.entries.clear();
    this.base = null;
  }
  get size() {
    return this.entries.size;
  }
}
export function keyframeAt(
  track: AnimationTrack,
  time: number,
): Keyframe | undefined {
  return track.keyframes.find((k) => Math.abs(k.time - time) < 1e-7);
}
