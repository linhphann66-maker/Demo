import type {
  ProjectDocument,
  AnimationChannel,
  AnimationValue,
} from "../../document-core/src";
import { setKeyframe, clonePose } from "../../animation-core/src";
import { useAnimation } from "./animation-state";
import { getPreviewDocument } from "./animation-preview";
export type EditDomain = "bone" | "layer" | "mesh" | "ik" | "all";
const changed = (a: unknown, b: unknown) =>
  JSON.stringify(a) !== JSON.stringify(b);
export function recordChanges(
  source: ProjectDocument,
  before: ProjectDocument,
  after: ProjectDocument,
  clipId: string,
  time: number,
  domain: EditDomain = "all",
  force = false,
) {
  const key = (id: string, type: AnimationChannel, value: AnimationValue) =>
    setKeyframe(source, clipId, id, type, time, value);
  if (domain === "bone" || domain === "all")
    for (const b of after.bones) {
      const old = before.bones.find((v) => v.id === b.id)!;
      for (const property of [
        "x",
        "y",
        "rotation",
        "scaleX",
        "scaleY",
      ] as const) {
        const value = b.pose[property] ?? 1,
          previous = old.pose[property] ?? 1;
        if (force || value !== previous)
          key(b.id, ("bone." + property) as AnimationChannel, value);
      }
    }
  if (domain === "layer" || domain === "all")
    for (const l of after.layers) {
      const old = before.layers.find((v) => v.id === l.id)!;
      for (const property of [
        "x",
        "y",
        "rotation",
        "scaleX",
        "scaleY",
        "opacity",
        "visible",
      ] as const)
        if (force || l[property] !== old[property])
          key(l.id, ("layer." + property) as AnimationChannel, l[property]);
    }
  if (domain === "ik" || domain === "all" || domain === "bone")
    for (const target of after.ikTargets) {
      const old = before.ikTargets.find((t) => t.id === target.id)!;
      if (domain !== "bone")
        for (const property of ["x", "y"] as const)
          if (force || target[property] !== old[property])
            key(
              target.id,
              ("ik." + property) as AnimationChannel,
              target[property],
            );
      const blend = target.enabled ? (target.blend ?? 1) : 0,
        previous = old.enabled ? (old.blend ?? 1) : 0;
      if (force || blend !== previous) key(target.id, "ik.blend", blend);
    }
  if (domain === "mesh" || domain === "all")
    for (const m of after.meshes) {
      const old = before.meshes.find((v) => v.id === m.id);
      if (
        !old ||
        (!force &&
          !changed(
            old.vertices.map((v) => [v.x, v.y]),
            m.vertices.map((v) => [v.x, v.y]),
          ))
      )
        continue;
      const base = source.meshes.find((v) => v.id === m.id)!;
      const offsets: Record<string, { x: number; y: number }> = {};
      for (const v of m.vertices) {
        const origin = base.vertices.find((b) => b.id === v.id)!;
        const x = v.x - origin.x,
          y = v.y - origin.y;
        if (Math.abs(x) > 1e-9 || Math.abs(y) > 1e-9) offsets[v.id] = { x, y };
      }
      key(m.id, "mesh.deform", offsets);
    }
}
export function editPreview(
  base: ProjectDocument,
  recipe: (d: ProjectDocument) => void,
) {
  const before = getPreviewDocument(base),
    after = clonePose(before);
  recipe(after);
  return { before, after };
}
export function setTemporaryPose(doc: ProjectDocument) {
  const s = useAnimation.getState();
  useAnimation.setState({
    override: doc,
    playing: false,
    displayTime: s.time,
    editVersion: s.editVersion + 1,
  });
}
