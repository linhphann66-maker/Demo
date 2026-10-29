import type {
  ProjectDocument,
  AnimationClip,
  AnimationTrack,
  AnimationChannel,
  AnimationValue,
  Keyframe,
  AnimationEvent,
} from "../../document-core/src";
import { isDiscrete } from "../../document-core/src/animation-schema";
/** JSON document values can also be cloned while wrapped in an Immer draft. */
function cloneEditable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export function captureBase(doc: ProjectDocument): AnimationClip["baseState"] {
  return {
    bonePoses: doc.bones.map((b) => ({
      boneId: b.id,
      ...b.pose,
      scaleX: b.pose.scaleX ?? 1,
      scaleY: b.pose.scaleY ?? 1,
    })),
    layerStates: doc.layers.map((l) => ({
      layerId: l.id,
      x: l.x,
      y: l.y,
      rotation: l.rotation,
      scaleX: l.scaleX,
      scaleY: l.scaleY,
      opacity: l.opacity,
      visible: l.visible,
    })),
    ikStates: doc.ikTargets.map((t) => ({
      targetId: t.id,
      x: t.x,
      y: t.y,
      blend: t.blend ?? 1,
      enabled: false,
    })),
    attachmentStates: doc.layers.map((l) => ({
      layerId: l.id,
      boneId: doc.attachments.find((a) => a.layerId === l.id)?.boneId ?? null,
    })),
  };
}
export function createClip(
  doc: ProjectDocument,
  name = "Animation",
  duration = 2,
  fps = 24,
) {
  const clip: AnimationClip = {
    id: crypto.randomUUID(),
    name,
    duration,
    fps,
    loopMode: "loop",
    range: { start: 0, end: duration },
    trackIds: [],
    eventIds: [],
    baseState: captureBase(doc),
    metadata: { origin: "user-created", description: "", tags: [] },
  };
  doc.animationClips.push(clip);
  doc.characterVariants
    .find((v) => v.view === doc.characterSettings.characterView)
    ?.clipIds.push(clip.id);
  return clip;
}
export function ensureTrack(
  doc: ProjectDocument,
  clipId: string,
  targetId: string,
  type: AnimationChannel,
) {
  const existing = doc.keyframeTracks.find(
    (t) => t.clipId === clipId && t.targetId === targetId && t.type === type,
  );
  if (existing) return existing;
  const clip = doc.animationClips.find((c) => c.id === clipId);
  if (!clip) throw Error("Không tìm thấy clip");
  const track: AnimationTrack = {
    id: crypto.randomUUID(),
    clipId,
    targetId,
    type,
    enabled: true,
    rotationMode: "shortest",
    keyframes: [],
  };
  doc.keyframeTracks.push(track);
  clip.trackIds.push(track.id);
  return track;
}
export function setKeyframe(
  doc: ProjectDocument,
  clipId: string,
  targetId: string,
  type: AnimationChannel,
  time: number,
  value: AnimationValue,
  interpolation: Keyframe["interpolation"] = "linear",
) {
  const clip = doc.animationClips.find((c) => c.id === clipId)!;
  if (!clip || time < 0 || time > clip.duration + 1e-8)
    throw Error("Keyframe ngoài duration");
  const track = ensureTrack(doc, clipId, targetId, type);
  const existing = track.keyframes.find((k) => Math.abs(k.time - time) < 1e-7);
  const key: Keyframe = {
    id: existing?.id ?? crypto.randomUUID(),
    time,
    value,
    interpolation: isDiscrete(type) ? "stepped" : interpolation,
  };
  if (existing) Object.assign(existing, key);
  else track.keyframes.push(key);
  track.keyframes.sort((a, b) => a.time - b.time);
  return key;
}
export function deleteKeys(doc: ProjectDocument, ids: string[]) {
  const selected = new Set(ids);
  for (const track of doc.keyframeTracks)
    track.keyframes = track.keyframes.filter((k) => !selected.has(k.id));
}
export function moveKeys(
  doc: ProjectDocument,
  ids: string[],
  delta: number,
  duplicate = false,
) {
  const selected = new Set(ids);
  const result: string[] = [];
  for (const t of doc.keyframeTracks) {
    const clip = doc.animationClips.find((c) => c.id === t.clipId)!;
    const keys = t.keyframes.filter((k) => selected.has(k.id));
    for (const k of keys) {
      const time = k.time + delta;
      if (time < -1e-8 || time > clip.duration + 1e-8)
        throw Error("Di chuyển keyframe vượt duration");
      if (
        t.keyframes.some(
          (other) =>
            other.id !== k.id &&
            (!selected.has(other.id) || duplicate) &&
            Math.abs(other.time - time) < 1e-7,
        )
      )
        throw Error("Hai keyframe không thể ở cùng thời điểm trên một track");
    }
    if (duplicate) {
      for (const k of keys) {
        const copy = {
          ...k,
          id: crypto.randomUUID(),
          time: Math.max(0, Math.min(clip.duration, k.time + delta)),
        };
        t.keyframes.push(copy);
        result.push(copy.id);
      }
    } else
      for (const k of keys) {
        k.time = Math.max(0, Math.min(clip.duration, k.time + delta));
        result.push(k.id);
      }
    t.keyframes.sort((a, b) => a.time - b.time);
  }
  return result;
}
export type CopiedKey = {
  type: AnimationChannel;
  targetId: string;
  relativeTime: number;
  value: AnimationValue;
  interpolation: Keyframe["interpolation"];
  handles?: Keyframe["handles"];
  rotationMode: AnimationTrack["rotationMode"];
};
export function copyKeys(doc: ProjectDocument, ids: string[]): CopiedKey[] {
  const selected = new Set(ids),
    chosen = doc.keyframeTracks.flatMap((t) =>
      t.keyframes.filter((k) => selected.has(k.id)).map((k) => ({ t, k })),
    );
  const origin = Math.min(...chosen.map((x) => x.k.time));
  return chosen.map(({ t, k }) => ({
    type: t.type,
    targetId: t.targetId,
    relativeTime: k.time - origin,
    value: cloneEditable(k.value),
    interpolation: k.interpolation,
    handles: k.handles ? { ...k.handles } : undefined,
    rotationMode: t.rotationMode,
  }));
}
export function pasteKeys(
  doc: ProjectDocument,
  clipId: string,
  time: number,
  copied: CopiedKey[],
) {
  const ids: string[] = [];
  for (const k of copied) {
    const key = setKeyframe(
      doc,
      clipId,
      k.targetId,
      k.type,
      time + k.relativeTime,
      cloneEditable(k.value),
      k.interpolation,
    );
    if (k.handles) key.handles = { ...k.handles };
    ensureTrack(doc, clipId, k.targetId, k.type).rotationMode = k.rotationMode;
    ids.push(key.id);
  }
  return ids;
}
export function resizeClip(doc: ProjectDocument, id: string, duration: number) {
  const c = doc.animationClips.find((c) => c.id === id)!;
  if (duration < 1 / 120 || duration > 120)
    throw Error("Duration cần từ 1/120 đến 120 giây");
  const ratio = duration / c.duration;
  for (const t of doc.keyframeTracks.filter((t) => t.clipId === id))
    for (const k of t.keyframes) k.time *= ratio;
  for (const e of doc.animationEvents.filter((e) => e.clipId === id))
    e.time *= ratio;
  c.range = { start: c.range.start * ratio, end: c.range.end * ratio };
  c.duration = duration;
}
export function addEvent(
  doc: ProjectDocument,
  clipId: string,
  time: number,
  name = "event",
): AnimationEvent {
  const clip = doc.animationClips.find((c) => c.id === clipId)!;
  const event: AnimationEvent = {
    id: crypto.randomUUID(),
    clipId,
    time,
    name,
    enabled: true,
    payload: null,
  };
  doc.animationEvents.push(event);
  clip.eventIds.push(event.id);
  return event;
}
export function deleteEvent(doc: ProjectDocument, id: string) {
  doc.animationEvents = doc.animationEvents.filter((e) => e.id !== id);
  for (const c of doc.animationClips)
    c.eventIds = c.eventIds.filter((e) => e !== id);
}
export function duplicateClip(doc: ProjectDocument, id: string) {
  const original = doc.animationClips.find((c) => c.id === id)!;
  const copy: AnimationClip = cloneEditable(original);
  copy.id = crypto.randomUUID();
  copy.name = original.name + " Copy";
  copy.trackIds = [];
  copy.eventIds = [];
  doc.animationClips.push(copy);
  doc.characterVariants
    .find((v) => v.clipIds.includes(id))
    ?.clipIds.push(copy.id);
  for (const t of [...doc.keyframeTracks].filter((t) => t.clipId === id)) {
    const track: AnimationTrack = {
      ...cloneEditable(t),
      id: crypto.randomUUID(),
      clipId: copy.id,
      keyframes: t.keyframes.map((k) => ({
        ...cloneEditable(k),
        id: crypto.randomUUID(),
      })),
    };
    doc.keyframeTracks.push(track);
    copy.trackIds.push(track.id);
  }
  for (const e of [...doc.animationEvents].filter((e) => e.clipId === id)) {
    const event = {
      ...cloneEditable(e),
      id: crypto.randomUUID(),
      clipId: copy.id,
    };
    doc.animationEvents.push(event);
    copy.eventIds.push(event.id);
  }
  return copy;
}
export function deleteClip(doc: ProjectDocument, id: string) {
  for (const v of doc.characterVariants)
    v.clipIds = v.clipIds.filter((c) => c !== id);
  doc.animationClips = doc.animationClips.filter((c) => c.id !== id);
  doc.keyframeTracks = doc.keyframeTracks.filter((t) => t.clipId !== id);
  doc.animationEvents = doc.animationEvents.filter((e) => e.clipId !== id);
}
/** Structural edits remove only references whose targets were deleted/replaced. */
export function pruneAnimationReferences(doc: ProjectDocument) {
  const bones = new Set(doc.bones.map((b) => b.id)),
    layers = new Set(doc.layers.map((l) => l.id)),
    meshes = new Map(doc.meshes.map((m) => [m.id, m])),
    iks = new Set(doc.ikTargets.map((i) => i.id)),
    slots = new Set(doc.equipmentSlots.map((s) => s.id));
  doc.keyframeTracks = doc.keyframeTracks.filter((t) => {
    const category = t.type.split(".")[0];
    return category === "bone"
      ? bones.has(t.targetId)
      : category === "mesh"
        ? meshes.has(t.targetId)
        : category === "ik"
          ? iks.has(t.targetId)
          : layers.has(t.targetId);
  });
  for (const t of doc.keyframeTracks) {
    if (t.type === "attachment.bone")
      for (const k of t.keyframes)
        if (typeof k.value === "string" && !bones.has(k.value)) k.value = null;
    if (t.type === "mesh.deform") {
      const ids = new Set(meshes.get(t.targetId)!.vertices.map((v) => v.id));
      for (const k of t.keyframes)
        if (k.value && typeof k.value === "object")
          for (const id of Object.keys(k.value))
            if (!ids.has(id)) delete k.value[id];
    }
  }
  for (const c of doc.animationClips) {
    c.baseState.bonePoses = c.baseState.bonePoses.filter((b) =>
      bones.has(b.boneId),
    );
    c.baseState.layerStates = c.baseState.layerStates.filter((l) =>
      layers.has(l.layerId),
    );
    c.baseState.ikStates = c.baseState.ikStates.filter((t) =>
      iks.has(t.targetId),
    );
    c.baseState.attachmentStates = c.baseState.attachmentStates
      .filter((a) => layers.has(a.layerId))
      .map((a) => ({
        ...a,
        boneId: a.boneId && bones.has(a.boneId) ? a.boneId : null,
      }));
    c.trackIds = doc.keyframeTracks
      .filter((t) => t.clipId === c.id)
      .map((t) => t.id);
    c.eventIds = doc.animationEvents
      .filter((e) => e.clipId === c.id)
      .map((e) => e.id);
  }
  for (const e of doc.animationEvents)
    if (
      e.payload?.type === "vfx" &&
      e.payload.socketId &&
      !slots.has(e.payload.socketId)
    )
      delete e.payload.socketId;
}
