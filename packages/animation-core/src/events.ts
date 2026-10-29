import type {
  ProjectDocument,
  AnimationClip,
  AnimationEvent,
} from "../../document-core/src";
export type FiredEvent = {
  event: AnimationEvent;
  clipId: string;
  cycle: number;
  absoluteTime: number;
};
/** Intervals are (from,to]. Manual seeking never calls this function. */
export function crossedEvents(
  doc: ProjectDocument,
  clip: AnimationClip,
  from: number,
  to: number,
  includeStart = false,
): FiredEvent[] {
  if (to < from || !Number.isFinite(to) || !Number.isFinite(from)) return [];
  const start = clip.range.start,
    end = clip.range.end,
    period = end - start;
  const events = doc.animationEvents.filter(
    (e) =>
      e.clipId === clip.id &&
      e.enabled &&
      e.time >= start - 1e-8 &&
      e.time <= end + 1e-8,
  );
  const result: FiredEvent[] = [];
  for (const event of events) {
    const offset = event.time - start;
    if (includeStart && Math.abs(offset) < 1e-8 && from === 0)
      result.push({ event, clipId: clip.id, cycle: 0, absoluteTime: 0 });
    const first =
        clip.loopMode === "loop"
          ? Math.max(0, Math.floor((from - offset) / period) + 1)
          : 0,
      last =
        clip.loopMode === "loop"
          ? Math.floor((to - offset + 1e-9) / period)
          : 0;
    for (let cycle = first; cycle <= last; cycle++) {
      const at = cycle * period + offset;
      if (
        at > from + 1e-9 &&
        at <= to + 1e-9 &&
        (clip.loopMode === "loop" || at <= period + 1e-9)
      ) {
        result.push({ event, clipId: clip.id, cycle, absoluteTime: at });
        if (result.length > 4096)
          throw Error(
            "Event catch-up vượt giới hạn 4096; hãy khởi động lại playback",
          );
      }
    }
  }
  return result.sort(
    (a, b) =>
      a.absoluteTime - b.absoluteTime ||
      b.event.time - a.event.time ||
      a.event.id.localeCompare(b.event.id),
  );
}
export function playbackTime(clip: AnimationClip, elapsed: number) {
  const span = clip.range.end - clip.range.start;
  if (clip.loopMode === "loop")
    return clip.range.start + (((elapsed % span) + span) % span);
  return Math.min(clip.range.end, clip.range.start + Math.max(0, elapsed));
}
export class PlaybackClock {
  elapsed = 0;
  last: number | null = null;
  start(elapsed = 0) {
    this.elapsed = elapsed;
    this.last = null;
  }
  tick(timestampMs: number, speed = 1) {
    const delta =
      this.last === null
        ? 0
        : Math.max(0, (timestampMs - this.last) / 1000) * speed;
    this.last = timestampMs;
    const previous = this.elapsed;
    this.elapsed += delta;
    return { previous, current: this.elapsed, delta };
  }
  pause() {
    this.last = null;
  }
}
