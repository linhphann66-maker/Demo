import { clipInView } from "../../document-core/src/character";
import { useAnimation } from "./animation-state";
import { useEditor } from "./store";
import { crossedEvents, playbackTime } from "../../animation-core/src";
export function selectAnimation(id: string) {
  const state = useAnimation.getState(),
    doc = useEditor.getState().document,
    clip = doc?.animationClips.find((c) => c.id === id);
  if (!clip) return;
  const variant = doc?.characterVariants.find((v) => v.clipIds.includes(id));
  if (variant && variant.view !== doc?.characterSettings.characterView) {
    useEditor.getState().command("Đổi view theo clip", (d) => {
      d.characterSettings.characterView = variant.view;
    });
  }
  useEditor.getState().select(null);
  const transition =
    (!variant || variant.view === doc?.characterSettings.characterView) &&
    state.enabled &&
    state.playing &&
    state.activeClipId &&
    state.activeClipId !== id &&
    state.transitionDuration > 0
      ? {
          fromId: state.activeClipId,
          fromTime: state.time,
          elapsed: 0,
          duration: state.transitionDuration,
        }
      : null;
  useAnimation.setState({
    enabled: true,
    activeClipId: id,
    time: clip.range.start,
    displayTime: clip.range.start,
    elapsed: 0,
    override: null,
    selectedKeys: [],
    selectedTrackId: null,
    selectedEventId: null,
    startEvents: true,
    audition: [],
    auditionElapsed: 0,
    transition,
    editVersion: state.editVersion + 1,
  });
}
export function seekAnimation(time: number) {
  const state = useAnimation.getState(),
    clip = useEditor
      .getState()
      .document?.animationClips.find((c) => c.id === state.activeClipId);
  if (!clip) return;
  const at = Math.max(clip.range.start, Math.min(clip.range.end, time));
  state.seek(at);
  useAnimation.setState({ elapsed: at - clip.range.start, audition: [] });
}
export function restartAnimation(play = true) {
  const state = useAnimation.getState(),
    clip = useEditor
      .getState()
      .document?.animationClips.find((c) => c.id === state.activeClipId);
  if (!clip) return;
  useAnimation.setState({
    enabled: true,
    time: clip.range.start,
    displayTime: clip.range.start,
    elapsed: 0,
    playing: play,
    override: null,
    startEvents: true,
    audition: [],
    auditionElapsed: 0,
    eventLog: [],
    transition: null,
    editVersion: state.editVersion + 1,
  });
}
export function togglePlayback() {
  const state = useAnimation.getState(),
    clip = useEditor
      .getState()
      .document?.animationClips.find((c) => c.id === state.activeClipId);
  if (!clip) return;
  if (state.playing) {
    state.pause();
    return;
  }
  if (state.time >= clip.range.end - 1e-8) {
    restartAnimation(true);
    return;
  }
  useAnimation.setState({ enabled: true, playing: true, override: null });
}
export function frameStep(direction: number) {
  const state = useAnimation.getState(),
    clip = useEditor
      .getState()
      .document?.animationClips.find((c) => c.id === state.activeClipId);
  if (clip) seekAnimation(state.time + direction / clip.fps);
}
export function startMixPreview() {
  const doc = useEditor.getState().document;
  if (!doc) return;
  const names = ["Idle", "Walk", "Run", "Idle"];
  const ids = names.map(
    (name) =>
      doc.animationClips.find(
        (c) =>
          clipInView(doc, c.id) &&
          (c.name === name || c.name === "Front · " + name),
      )?.id,
  );
  if (ids.some((id) => !id)) return;
  selectAnimation(ids[0]!);
  useAnimation.setState({
    playing: true,
    audition: ids.slice(1) as string[],
    auditionElapsed: 0,
  });
}
export function tickAnimation(delta: number) {
  const state = useAnimation.getState(),
    doc = useEditor.getState().document,
    clip = doc?.animationClips.find((c) => c.id === state.activeClipId);
  if (!doc || !clip || !state.playing) return;
  const previous = state.elapsed,
    current = previous + Math.max(0, delta) * state.speed;
  let fired;
  try {
    fired = crossedEvents(doc, clip, previous, current, state.startEvents);
  } catch (e) {
    state.pause();
    useEditor.getState().setError(String(e));
    return;
  }
  const time = playbackTime(clip, current);
  const transition = state.transition
    ? {
        ...state.transition,
        fromTime: state.transition.fromTime + delta * state.speed,
        elapsed: state.transition.elapsed + delta,
      }
    : null;
  const auditionElapsed = state.auditionElapsed + delta * state.speed;
  const ended = clip.loopMode === "once" && time >= clip.range.end;
  useAnimation.setState({
    time,
    elapsed: current,
    startEvents: false,
    transition:
      transition && transition.elapsed < transition.duration
        ? transition
        : null,
    eventLog: [...state.eventLog, ...fired].slice(-50),
    playing: !ended,
    displayTime:
      Math.abs(time - state.displayTime) > 0.08 || ended
        ? time
        : state.displayTime,
    auditionElapsed,
    ...(ended ? { editVersion: state.editVersion + 1 } : {}),
  });
  for (const event of fired)
    if (typeof window !== "undefined")
      window.dispatchEvent(
        new CustomEvent("a2dstudio:animation-event", { detail: event }),
      );
  if (state.audition.length && auditionElapsed >= 2) {
    const [next, ...rest] = state.audition;
    selectAnimation(next);
    useAnimation.setState({
      audition: rest,
      auditionElapsed: 0,
      playing: true,
    });
  }
}
/** Exactly one RAF owner. Visibility changes pause without a catch-up jump. */
export function installPlaybackLoop() {
  let frame = 0,
    last: number | null = null,
    disposed = false;
  const draw = (now: number) => {
    frame = 0;
    if (disposed || !useAnimation.getState().playing) {
      last = null;
      return;
    }
    const delta = last === null ? 0 : Math.max(0, (now - last) / 1000);
    last = now;
    tickAnimation(delta);
    if (useAnimation.getState().playing) frame = requestAnimationFrame(draw);
    else last = null;
  };
  const unsubscribe = useAnimation.subscribe((state, previous) => {
    if (state.playing && !previous.playing && !frame) {
      last = null;
      frame = requestAnimationFrame(draw);
    }
    if (!state.playing && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      last = null;
    }
  });
  if (useAnimation.getState().playing) frame = requestAnimationFrame(draw);
  const hide = () => {
    if (document.hidden) useAnimation.getState().pause();
  };
  document.addEventListener("visibilitychange", hide);
  return () => {
    disposed = true;
    unsubscribe();
    if (frame) cancelAnimationFrame(frame);
    document.removeEventListener("visibilitychange", hide);
  };
}
