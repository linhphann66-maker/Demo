import type { ProjectDocument } from "../../document-core/src";
import { PoseCache, mixPoses } from "../../animation-core/src";
import { useAnimation } from "./animation-state";
export const poseCache = new PoseCache();
export function getPreviewDocument(base: ProjectDocument) {
  const state = useAnimation.getState();
  if (
    !state.enabled ||
    !state.activeClipId ||
    !base.animationClips.some((c) => c.id === state.activeClipId)
  )
    return base;
  if (state.override) return state.override;
  const current = poseCache.get(base, state.activeClipId, state.time, false);
  if (state.transition) {
    const previous = poseCache.get(
      base,
      state.transition.fromId,
      state.transition.fromTime,
    );
    return mixPoses(
      base,
      previous,
      current,
      Math.min(
        1,
        state.transition.elapsed / Math.max(0.001, state.transition.duration),
      ),
    );
  }
  return current;
}
export function onionPoses(base: ProjectDocument) {
  const state = useAnimation.getState(),
    clip = base.animationClips.find((c) => c.id === state.activeClipId);
  if (!state.enabled || !state.onion.enabled || !clip) return [];
  const result: { doc: ProjectDocument; tint: number }[] = [];
  for (const [count, sign, tint] of [
    [state.onion.previous, -1, 0xc799f2],
    [state.onion.next, 1, 0x72d7cf],
  ])
    for (let i = 1; i <= count; i++) {
      const time =
        Math.round(state.time * clip.fps) / clip.fps + (sign * i) / clip.fps;
      if (clip.loopMode === "once" && (time < 0 || time > clip.duration))
        continue;
      result.push({ doc: poseCache.get(base, clip.id, time), tint });
    }
  return result;
}
