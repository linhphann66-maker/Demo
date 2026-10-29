import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Copy,
  Clipboard,
  Trash2,
  ChevronDown,
  ChevronRight,
  Clapperboard,
} from "lucide-react";
import { useEditor } from "../../../packages/editor-core/src/store";
import { useAnimation } from "../../../packages/editor-core/src/animation-state";
import {
  seekAnimation,
  togglePlayback,
} from "../../../packages/editor-core/src/animation-playback";
import { getPreviewDocument } from "../../../packages/editor-core/src/animation-preview";
import {
  copyKeys,
  pasteKeys,
  moveKeys,
  deleteKeys,
  addEvent,
  setKeyframe,
} from "../../../packages/animation-core/src";
import type { AnimationTrack } from "../../../packages/document-core/src";
import {
  Transport,
  TrackBuilder,
  OnionControls,
  valueForTrack,
} from "./AnimationStudio";
const LABEL = 164;
function EventLog() {
  const events = useAnimation((s) => s.eventLog);
  return (
    <span
      className="event-log"
      aria-live="polite"
      title="Real animation-event dispatch; VFX simulation is not implemented"
    >
      {events.length
        ? events
            .slice(-3)
            .map((e) => e.event.name)
            .join(" · ")
        : "EVENTS · —"}
    </span>
  );
}
export function Timeline({ en }: { en: boolean }) {
  const doc = useEditor((s) => s.document)!,
    active = useAnimation((s) => s.activeClipId),
    selected = useAnimation((s) => s.selectedKeys),
    selectedTrack = useAnimation((s) => s.selectedTrackId),
    selectedEvent = useAnimation((s) => s.selectedEventId),
    snap = useAnimation((s) => s.snap),
    enabled = useAnimation((s) => s.enabled);
  const clip = doc.animationClips.find((c) => c.id === active);
  const [pps, setPps] = useState(240),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [delta, setDelta] = useState(0);
  const root = useRef<HTMLElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    playhead = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: "key" | "event" | "seek";
    start: number;
    ids: string[];
    eventId?: string;
    time: number;
    delta: number;
  } | null>(null);
  const tracks = doc.keyframeTracks.filter((t) => t.clipId === clip?.id),
    events = doc.animationEvents.filter((e) => e.clipId === clip?.id);
  const boneOrder = new Map<string, number>();
  const depth = (id: string): number => {
    const b = doc.bones.find((b) => b.id === id);
    return b?.parentId ? 1 + depth(b.parentId) : 0;
  };
  const visit = (id: string | null) => {
    for (const b of doc.bones.filter((b) => b.parentId === id)) {
      boneOrder.set(b.id, boneOrder.size);
      visit(b.id);
    }
  };
  visit(null);
  const label = (t: AnimationTrack) =>
    doc.bones.find((b) => b.id === t.targetId)?.name ??
    doc.layers.find((l) => l.id === t.targetId)?.name ??
    doc.layers.find(
      (l) => l.id === doc.meshes.find((m) => m.id === t.targetId)?.layerId,
    )?.name ??
    doc.bones.find(
      (b) => b.id === doc.ikTargets.find((i) => i.id === t.targetId)?.endBoneId,
    )?.name ??
    t.type;
  const groupIds = new Set(
    tracks.map((t) => t.type.split(".")[0] + ":" + t.targetId),
  );
  for (const track of tracks.filter((t) => t.type.startsWith("bone."))) {
    let parent = doc.bones.find((b) => b.id === track.targetId)?.parentId;
    while (parent) {
      groupIds.add("bone:" + parent);
      parent = doc.bones.find((b) => b.id === parent)?.parentId;
    }
  }
  const groups = [...groupIds]
    .map((id) => {
      const [category, target] = id.split(":");
      return {
        id,
        target,
        category,
        tracks: tracks.filter(
          (t) => t.type.startsWith(category + ".") && t.targetId === target,
        ),
      };
    })
    .sort(
      (a, b) =>
        (a.category === "bone" ? (boneOrder.get(a.target) ?? 999) : 1000) -
        (b.category === "bone" ? (boneOrder.get(b.target) ?? 999) : 1000),
    );
  const visibleGroups = groups.filter((g) => {
    if (g.category !== "bone") return true;
    let parent = doc.bones.find((b) => b.id === g.target)?.parentId;
    while (parent) {
      if (collapsed.has("bone:" + parent)) return false;
      parent = doc.bones.find((b) => b.id === parent)?.parentId;
    }
    return true;
  });
  const width = Math.max(440, (clip?.duration ?? 2) * pps + 20);
  const timeAt = (clientX: number) => {
    const bounds = scroll.current!.getBoundingClientRect();
    const raw =
      (clientX - bounds.left + scroll.current!.scrollLeft - LABEL) / pps;
    const at = snap && clip ? Math.round(raw * clip.fps) / clip.fps : raw;
    return Math.max(0, Math.min(clip?.duration ?? 0, at));
  };
  const focus = () => root.current?.focus({ preventScroll: true });
  const applyCopy = () =>
    useAnimation.setState({ clipboard: copyKeys(doc, selected) });
  const applyPaste = () => {
    if (!clip) return;
    let ids: string[] = [];
    useEditor.getState().command("Dán keyframes", (d) => {
      ids = pasteKeys(
        d,
        clip.id,
        useAnimation.getState().time,
        useAnimation.getState().clipboard,
      );
    });
    useAnimation.setState({ selectedKeys: ids });
  };
  const remove = () => {
    useEditor
      .getState()
      .command("Xóa keyframes", (d) => deleteKeys(d, selected));
    useAnimation.setState({ selectedKeys: [] });
  };
  useEffect(() => {
    const draw = () => {
      if (playhead.current) {
        const time = useAnimation.getState().time;
        playhead.current.style.transform = `translateX(${time * pps}px)`;
        playhead.current.setAttribute("aria-valuenow", String(time));
      }
    };
    draw();
    return useAnimation.subscribe((s, p) => {
      if (s.time !== p.time) draw();
    });
  }, [pps, clip?.id]);
  return (
    <section
      ref={root}
      tabIndex={0}
      className="timeline animation-timeline"
      aria-label="Animation timeline"
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.matches("input,textarea,select") || target.isContentEditable)
          return;
        const key = e.key.toLowerCase(),
          mod = e.ctrlKey || e.metaKey;
        if (key === " ") {
          e.preventDefault();
          e.stopPropagation();
          togglePlayback();
        } else if (key === "home") {
          e.preventDefault();
          e.stopPropagation();
          if (clip) seekAnimation(clip.range.start);
        } else if (key === "delete" || key === "backspace") {
          e.preventDefault();
          e.stopPropagation();
          remove();
        } else if (mod && key === "c") {
          e.preventDefault();
          e.stopPropagation();
          applyCopy();
        } else if (mod && key === "v") {
          e.preventDefault();
          e.stopPropagation();
          applyPaste();
        } else if (mod && key === "a") {
          e.preventDefault();
          e.stopPropagation();
          useAnimation.setState({
            selectedKeys: tracks.flatMap((t) => t.keyframes.map((k) => k.id)),
          });
        } else if (mod && key === "z") {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) useEditor.getState().redo();
          else useEditor.getState().undo();
        }
      }}
    >
      <div className="animation-timeline-header">
        <span>
          <Clapperboard size={13} />
          {clip?.name ?? (en ? "Choose an animation" : "Chọn hoạt ảnh")}
        </span>
        <OnionControls en={en} />
        <label className="snap-toggle">
          <input
            aria-label="Keyframe snapping"
            type="checkbox"
            checked={snap}
            onChange={(e) => useAnimation.setState({ snap: e.target.checked })}
          />
          Snap
        </label>
        <label className="timeline-zoom">
          Zoom
          <input
            aria-label="Timeline zoom"
            type="range"
            min={60}
            max={800}
            value={pps}
            onChange={(e) => setPps(Number(e.target.value))}
          />
        </label>
      </div>
      <Transport en={en} />
      <div className="timeline-editbar">
        <button
          aria-label="Add keyframe"
          disabled={!clip}
          onClick={() => {
            const t = tracks.find((t) => t.id === selectedTrack);
            if (t) {
              const preview = getPreviewDocument(doc);
              useEditor.getState().command("Thêm keyframe", (d) => {
                const k = setKeyframe(
                  d,
                  clip!.id,
                  t.targetId,
                  t.type,
                  useAnimation.getState().time,
                  valueForTrack(doc, preview, t.type, t.targetId),
                );
                useAnimation.setState({ selectedKeys: [k.id] });
              });
            } else useEditor.getState().recordPose();
          }}
        >
          <Plus size={11} />
          {en ? "Key" : "Key"}
        </button>
        <button
          aria-label="Duplicate keyframes"
          disabled={!selected.length || !clip}
          onClick={() => {
            let ids: string[] = [];
            useEditor.getState().command("Nhân đôi keyframes", (d) => {
              ids = moveKeys(d, selected, 1 / clip!.fps, true);
            });
            useAnimation.setState({ selectedKeys: ids });
          }}
        >
          <Copy size={11} />
        </button>
        <button
          aria-label="Copy keyframes"
          disabled={!selected.length}
          onClick={applyCopy}
        >
          <Copy size={11} />
        </button>
        <button
          aria-label="Paste keyframes"
          disabled={!clip}
          onClick={applyPaste}
        >
          <Clipboard size={11} />
        </button>
        <button
          aria-label="Remove keyframes"
          disabled={!selected.length}
          onClick={remove}
        >
          <Trash2 size={11} />
        </button>
        <button
          aria-label="Add animation event"
          disabled={!clip}
          onClick={() =>
            useEditor.getState().command("Thêm event", (d) => {
              const e = addEvent(d, clip!.id, useAnimation.getState().time);
              useAnimation.setState({
                selectedEventId: e.id,
                selectedKeys: [],
              });
            })
          }
        >
          + Event
        </button>
        <button onClick={() => setCollapsed(new Set())}>
          {en ? "Expand" : "Mở"}
        </button>
        <button onClick={() => setCollapsed(new Set(groups.map((g) => g.id)))}>
          {en ? "Collapse" : "Gọn"}
        </button>
        <EventLog />
      </div>
      <TrackBuilder en={en} />
      <div
        className="timeline-scroll"
        ref={scroll}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (d.kind === "seek") {
            seekAnimation(timeAt(e.clientX));
            return;
          }
          const raw = (e.clientX - d.start) / pps;
          const amount =
            snap && clip ? Math.round(raw * clip.fps) / clip.fps : raw;
          d.delta = amount;
          setDelta(amount);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          setDelta(0);
          if (!d || d.kind === "seek" || Math.abs(d.delta) < 1e-9) return;
          if (d.kind === "key")
            useEditor.getState().command("Di chuyển keyframes", (doc) => {
              moveKeys(doc, d.ids, d.delta);
            });
          else
            useEditor.getState().command("Di chuyển event", (doc) => {
              const e = doc.animationEvents.find((e) => e.id === d.eventId)!;
              e.time = Math.max(0, Math.min(clip!.duration, d.time + d.delta));
            });
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDelta(0);
        }}
      >
        <div className="timeline-content" style={{ width: LABEL + width }}>
          <div className="tl-ruler">
            <div className="tl-label">
              {clip
                ? `${clip.fps} FPS · ${tracks.reduce((n, t) => n + t.keyframes.length, 0)} keys`
                : en
                  ? "No clip"
                  : "Chưa có clip"}
            </div>
            <div
              className="tl-axis"
              data-testid="timeline-ruler"
              style={{ width }}
              onPointerDown={(e) => {
                if (!clip) return;
                focus();
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  kind: "seek",
                  start: e.clientX,
                  ids: [],
                  time: 0,
                  delta: 0,
                };
                seekAnimation(timeAt(e.clientX));
              }}
            >
              {Array.from(
                { length: clip ? Math.ceil(clip.duration * clip.fps) + 1 : 0 },
                (_, i) => i,
              )
                .filter(
                  (i) =>
                    i %
                      Math.max(1, Math.ceil(30 / (pps / (clip?.fps ?? 24)))) ===
                    0,
                )
                .map((frame) => (
                  <span
                    key={frame}
                    style={{ left: (frame / (clip?.fps ?? 24)) * pps }}
                  >
                    {frame}f
                  </span>
                ))}
            </div>
          </div>
          <div className="tl-event-row">
            <div className="tl-label">EVENTS</div>
            <div className="tl-axis" style={{ width }}>
              {events.map((e) => (
                <button
                  key={e.id}
                  className={`event-marker ${selectedEvent === e.id ? "selected" : ""} ${!e.enabled ? "muted" : ""}`}
                  aria-label={"Animation event " + e.name}
                  title={`${e.name} · ${e.time.toFixed(3)}s`}
                  style={{
                    left:
                      (e.time +
                        (drag.current?.kind === "event" &&
                        drag.current.eventId === e.id
                          ? delta
                          : 0)) *
                      pps,
                  }}
                  onPointerDown={(pointer) => {
                    pointer.stopPropagation();
                    focus();
                    pointer.currentTarget.setPointerCapture(pointer.pointerId);
                    useAnimation.setState({
                      selectedEventId: e.id,
                      selectedKeys: [],
                    });
                    drag.current = {
                      kind: "event",
                      start: pointer.clientX,
                      ids: [],
                      eventId: e.id,
                      time: e.time,
                      delta: 0,
                    };
                  }}
                >
                  ◆
                </button>
              ))}
            </div>
          </div>
          {!clip && (
            <div className="timeline-guidance">
              {en
                ? "Open Animation Studio in the left panel to select or create a clip."
                : "Mở Hoạt ảnh ở thanh bên để chọn hoặc tạo clip."}
            </div>
          )}
          {visibleGroups.map((group) => (
            <div className="tl-group" key={group.id}>
              <div className="tl-group-row">
                <button
                  className="tl-label"
                  aria-expanded={!collapsed.has(group.id)}
                  style={{
                    paddingLeft:
                      group.category === "bone"
                        ? 9 + depth(group.target) * 7
                        : 9,
                  }}
                  onClick={() =>
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })
                  }
                >
                  {collapsed.has(group.id) ? (
                    <ChevronRight size={10} />
                  ) : (
                    <ChevronDown size={10} />
                  )}
                  <span>
                    {group.category === "bone"
                      ? doc.bones.find((b) => b.id === group.target)?.name
                      : label(group.tracks[0])}
                  </span>
                  <small>{group.tracks.length}</small>
                </button>
                <div className="tl-axis" style={{ width }} />
              </div>
              {!collapsed.has(group.id) &&
                group.tracks.map((t) => (
                  <div
                    className={`tl-track-row ${selectedTrack === t.id ? "active" : ""}`}
                    key={t.id}
                  >
                    <button
                      className="tl-label"
                      onClick={() => {
                        focus();
                        useAnimation.setState({
                          selectedTrackId: t.id,
                          selectedKeys: [],
                          selectedEventId: null,
                        });
                      }}
                      title={t.type}
                    >
                      {t.type}
                    </button>
                    <div
                      className="tl-axis tl-key-area"
                      style={{
                        width,
                        backgroundSize: `${(pps / (clip?.fps ?? 24)) * Math.max(1, Math.ceil(12 / (pps / (clip?.fps ?? 24))))}px 100%`,
                      }}
                      onPointerDown={(e) => {
                        focus();
                        seekAnimation(timeAt(e.clientX));
                      }}
                    >
                      {t.keyframes.map((k) => (
                        <button
                          key={k.id}
                          data-testid={"key-" + k.id}
                          aria-label={`Keyframe ${t.type} frame ${(k.time * (clip?.fps ?? 24)).toFixed(2)}`}
                          title={`${t.type} · ${k.time.toFixed(4)}s`}
                          className={`key-marker ${selected.includes(k.id) ? "selected" : ""} ${!t.enabled ? "muted" : ""}`}
                          style={{
                            left:
                              (k.time +
                                (selected.includes(k.id) &&
                                drag.current?.kind === "key"
                                  ? delta
                                  : 0)) *
                              pps,
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            focus();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            let ids = selected.includes(k.id)
                              ? selected
                              : [k.id];
                            if (e.shiftKey || e.ctrlKey || e.metaKey)
                              ids = selected.includes(k.id)
                                ? selected.filter((id) => id !== k.id)
                                : [...selected, k.id];
                            useAnimation.setState({
                              selectedKeys: ids,
                              selectedTrackId: t.id,
                              selectedEventId: null,
                            });
                            drag.current = {
                              kind: "key",
                              start: e.clientX,
                              ids,
                              time: k.time,
                              delta: 0,
                            };
                          }}
                        >
                          ◆
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ))}
          {clip && (
            <div
              ref={playhead}
              className={`tl-playhead ${!enabled ? "inactive" : ""}`}
              style={{ left: LABEL }}
              role="slider"
              tabIndex={0}
              aria-label="Animation playhead"
              aria-valuemin={0}
              aria-valuemax={clip.duration}
              aria-valuenow={useAnimation.getState().time}
              onPointerDown={(e) => {
                focus();
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  kind: "seek",
                  start: e.clientX,
                  ids: [],
                  time: 0,
                  delta: 0,
                };
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  seekAnimation(
                    useAnimation.getState().time +
                      (e.key === "ArrowLeft" ? -1 : 1) / clip.fps,
                  );
                }
              }}
            >
              <span />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
