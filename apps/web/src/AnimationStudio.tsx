import {
  clipInView,
  boneInView,
  layerInView,
} from "../../../packages/document-core/src/character";
import { useState, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  RotateCcw,
  Plus,
  Copy,
  Trash2,
  Search,
  Clapperboard,
  Diamond,
  Download,
  ArrowRight,
} from "lucide-react";
import { useEditor } from "../../../packages/editor-core/src/store";
import { useAnimation } from "../../../packages/editor-core/src/animation-state";
import {
  selectAnimation,
  togglePlayback,
  restartAnimation,
  seekAnimation,
  frameStep,
  startMixPreview,
} from "../../../packages/editor-core/src/animation-playback";
import { getPreviewDocument } from "../../../packages/editor-core/src/animation-preview";
import {
  setKeyframe,
  ensureTrack,
  resizeClip,
  deleteKeys,
  deleteEvent,
  addEvent,
} from "../../../packages/animation-core/src";
import {
  channels,
  isDiscrete,
  eventPayloadSchema,
} from "../../../packages/document-core/src/animation-schema";
import type {
  AnimationChannel,
  AnimationValue,
  AnimationTrack,
  ProjectDocument,
} from "../../../packages/document-core/src";
import {
  animationMetadata,
  exportSpritesheet,
  spritesheetPackage,
  download,
} from "../../../packages/exporters/src";
export function valueForTrack(
  base: ProjectDocument,
  preview: ProjectDocument,
  type: AnimationChannel,
  targetId: string,
): AnimationValue {
  const [category, property] = type.split(".");
  if (category === "bone") {
    const pose = preview.bones.find((b) => b.id === targetId)!.pose;
    return (
      (pose as unknown as Record<string, number>)[property] ??
      (property.startsWith("scale") ? 1 : 0)
    );
  }
  if (category === "layer")
    return (
      preview.layers.find((l) => l.id === targetId)! as unknown as Record<
        string,
        number | boolean
      >
    )[property];
  if (category === "ik") {
    const t = preview.ikTargets.find((t) => t.id === targetId)!;
    return property === "blend"
      ? t.enabled
        ? (t.blend ?? 1)
        : 0
      : property === "x"
        ? t.x
        : t.y;
  }
  if (category === "attachment")
    return (
      preview.attachments.find((a) => a.layerId === targetId)?.boneId ?? null
    );
  const mesh = preview.meshes.find((m) => m.id === targetId)!,
    source = base.meshes.find((m) => m.id === targetId)!;
  return Object.fromEntries(
    mesh.vertices.map((v) => {
      const origin = source.vertices.find((p) => p.id === v.id)!;
      return [v.id, { x: v.x - origin.x, y: v.y - origin.y }];
    }),
  );
}
export function ClipSettings({ en }: { en: boolean }) {
  const source = useEditor((s) => s.document)!,
    id = useAnimation((s) => s.activeClipId);
  const clip = source.animationClips.find((c) => c.id === id);
  if (!clip) return null;
  const edit = (recipe: (d: ProjectDocument) => void) =>
    useEditor.getState().command("Animation settings", recipe);
  return (
    <section className="property-section animation-settings">
      <div className="property-heading">
        {en ? "Animation settings" : "Thiết lập hoạt ảnh"}
      </div>
      <label className="field-label">
        {en ? "Name" : "Tên clip"}
        <input
          aria-label="Animation name"
          value={clip.name}
          maxLength={100}
          onChange={(e) => {
            if (e.target.value.trim())
              edit((d) => {
                d.animationClips.find((c) => c.id === clip.id)!.name =
                  e.target.value;
              });
          }}
        />
      </label>
      <div className="numeric-grid">
        <label className="rig-number">
          FPS
          <input
            aria-label="Animation FPS"
            type="number"
            min={1}
            max={120}
            value={clip.fps}
            onChange={(e) => {
              const fps = Number(e.target.value);
              if (Number.isInteger(fps) && fps >= 1 && fps <= 120)
                edit((d) => {
                  d.animationClips.find((c) => c.id === clip.id)!.fps = fps;
                });
            }}
          />
        </label>
        <label className="rig-number">
          {en ? "Duration (s)" : "Độ dài (s)"}
          <input
            aria-label="Animation duration"
            type="number"
            min={0.01}
            max={120}
            step={0.1}
            value={clip.duration}
            onChange={(e) => {
              const duration = Number(e.target.value);
              if (duration >= 1 / 120 && duration <= 120) {
                edit((d) => resizeClip(d, clip.id, duration));
                seekAnimation(Math.min(useAnimation.getState().time, duration));
              }
            }}
          />
        </label>
      </div>
      <p className="rig-hint">
        {en
          ? "Duration edits retime all keys, events and range proportionally. FPS changes preserve seconds."
          : "Đổi độ dài sẽ giãn toàn bộ key, event và range. Đổi FPS giữ nguyên thời gian giây."}
      </p>
      <label className="animation-check">
        <input
          aria-label="Animation loop"
          type="checkbox"
          checked={clip.loopMode === "loop"}
          onChange={(e) =>
            edit((d) => {
              d.animationClips.find((c) => c.id === clip.id)!.loopMode = e
                .target.checked
                ? "loop"
                : "once";
            })
          }
        />
        {en ? "Loop" : "Lặp lại"}
      </label>
      <div className="numeric-grid">
        <label className="rig-number">
          Range start
          <input
            aria-label="Playback range start"
            type="number"
            min={0}
            max={clip.range.end}
            step={1 / clip.fps}
            value={clip.range.start}
            onChange={(e) => {
              const start = Number(e.target.value);
              if (start >= 0 && start < clip.range.end) {
                edit((d) => {
                  d.animationClips.find((c) => c.id === clip.id)!.range.start =
                    start;
                });
                seekAnimation(start);
              }
            }}
          />
        </label>
        <label className="rig-number">
          Range end
          <input
            aria-label="Playback range end"
            type="number"
            min={clip.range.start}
            max={clip.duration}
            step={1 / clip.fps}
            value={clip.range.end}
            onChange={(e) => {
              const end = Number(e.target.value);
              if (end > clip.range.start && end <= clip.duration)
                edit((d) => {
                  d.animationClips.find((c) => c.id === clip.id)!.range.end =
                    end;
                });
            }}
          />
        </label>
      </div>
    </section>
  );
}
export function AnimationLibrary({ en }: { en: boolean }) {
  const s = useEditor(),
    doc = s.document!,
    activeId = useAnimation((r) => r.activeClipId);
  const [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="animation-library">
      <div className="rig-explainer">
        <strong>{en ? "Animation Studio" : "Xưởng hoạt ảnh"}</strong>
        <p>
          {en
            ? "Select a clip → seek → pose a bone → record a key → play. Auto Key records edits; temporary poses are never saved silently."
            : "Chọn clip → tua thời gian → chỉnh xương → ghi key → phát. Auto Key ghi chỉnh sửa; pose tạm không tự ghi vào dự án."}
        </p>
      </div>
      <div className="search">
        <Search size={13} />
        <input
          aria-label="Search animations"
          placeholder={en ? "Search clips…" : "Tìm hoạt ảnh…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="animation-library-actions">
        <button
          className="secondary-btn"
          aria-label="Create animation"
          onClick={() => s.createAnimation()}
        >
          <Plus size={12} />
          {en ? "New clip" : "Clip mới"}
        </button>
        <button
          className="secondary-btn"
          disabled={
            busy ||
            ["Idle", "Walk", "Run", "Attack", "Hurt"].every((n) =>
              doc.animationClips.some(
                (c) => clipInView(doc, c.id) && c.name === n,
              ),
            )
          }
          onClick={() => {
            setBusy(true);
            void s.addReferenceAnimations().finally(() => setBusy(false));
          }}
        >
          {busy ? "…" : en ? "5 presets" : "5 mẫu"}
        </button>
      </div>
      <div className="animation-clips">
        {doc.animationClips
          .filter(
            (c) =>
              clipInView(doc, c.id) &&
              c.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((c) => (
            <div
              className={`animation-clip-row ${activeId === c.id ? "active" : ""}`}
              key={c.id}
            >
              <button
                aria-label={"Select animation " + c.name}
                onClick={() => selectAnimation(c.id)}
              >
                <Clapperboard size={14} />
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {c.duration.toFixed(2)}s · {c.fps} FPS ·{" "}
                    {c.loopMode === "loop" ? "↻" : "→"}
                  </small>
                </span>
                <small>{c.metadata.origin === "procedural" ? "P" : "U"}</small>
              </button>
              <button
                aria-label={"Duplicate animation " + c.name}
                onClick={() => s.duplicateAnimation(c.id)}
              >
                <Copy size={12} />
              </button>
              <button
                aria-label={"Delete animation " + c.name}
                onClick={() => s.deleteAnimation(c.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
      </div>
      {!doc.animationClips.length && (
        <p className="rig-hint empty-animation">
          {en
            ? "Create a clip or choose 5 procedural Flame Knight presets. Old projects are never overwritten."
            : "Tạo clip mới hoặc thêm 5 mẫu Flame Knight procedural. Dự án cũ không bị ghi đè."}
        </p>
      )}
      <div className="animation-library-settings">
        <p className="rig-hint">
          {en
            ? "Select a clip to edit its settings in the right inspector. Select another during playback to crossfade."
            : "Chọn clip để chỉnh thiết lập ở bên phải. Chọn clip khác khi đang phát để crossfade."}
        </p>
      </div>
    </div>
  );
}
export function MixControls({ en }: { en: boolean }) {
  const doc = useEditor((s) => s.document)!,
    duration = useAnimation((s) => s.transitionDuration),
    transition = useAnimation((s) => s.transition),
    has = ["Idle", "Walk", "Run"].every((n) =>
      doc.animationClips.some((c) => clipInView(doc, c.id) && c.name === n),
    );
  return (
    <section className="property-section">
      <div className="property-heading">Animation Mixer</div>
      <label className="rig-number">
        {en ? "Crossfade (s)" : "Chuyển cảnh (s)"}
        <input
          aria-label="Crossfade duration"
          type="number"
          min={0}
          max={2}
          step={0.05}
          value={duration}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 0 && n <= 2)
              useAnimation.setState({ transitionDuration: n });
          }}
        />
      </label>
      <button
        className="secondary-btn wide"
        disabled={!has}
        onClick={startMixPreview}
      >
        Idle <ArrowRight size={10} /> Walk <ArrowRight size={10} /> Run{" "}
        <ArrowRight size={10} /> Idle
      </button>
      <p className="rig-hint">
        {transition
          ? en
            ? "Crossfading…"
            : "Đang trộn pose…"
          : en
            ? "Selecting another clip during playback crossfades. Discrete values switch at 50%."
            : "Chọn clip khác khi đang phát để crossfade. Thuộc tính rời rạc đổi tại 50%."}
      </p>
    </section>
  );
}
export function Transport({ en }: { en: boolean }) {
  const doc = useEditor((s) => s.document)!,
    id = useAnimation((s) => s.activeClipId),
    playing = useAnimation((s) => s.playing),
    time = useAnimation((s) => s.displayTime),
    speed = useAnimation((s) => s.speed),
    autoKey = useAnimation((s) => s.autoKey),
    override = useAnimation((s) => !!s.override),
    enabled = useAnimation((s) => s.enabled);
  const clip = doc.animationClips.find((c) => c.id === id);
  return (
    <div className="animation-transport">
      <div className="transport-buttons">
        <button
          aria-label="Seek animation start"
          disabled={!clip}
          onClick={() => seekAnimation(clip!.range.start)}
          title="Home"
        >
          <SkipBack size={14} />
        </button>
        <button
          aria-label="Previous animation frame"
          disabled={!clip}
          onClick={() => frameStep(-1)}
        >
          ‹
        </button>
        <button
          className="play-btn"
          aria-label={playing ? "Pause animation" : "Play animation"}
          disabled={!clip}
          onClick={togglePlayback}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          aria-label="Stop animation"
          disabled={!clip}
          onClick={() => restartAnimation(false)}
        >
          <Square size={12} />
        </button>
        <button
          aria-label="Restart animation"
          disabled={!clip}
          onClick={() => restartAnimation(true)}
        >
          <RotateCcw size={13} />
        </button>
        <button
          aria-label="Next animation frame"
          disabled={!clip}
          onClick={() => frameStep(1)}
        >
          ›
        </button>
        <button
          aria-label="Seek animation end"
          disabled={!clip}
          onClick={() => seekAnimation(clip!.range.end)}
        >
          <SkipForward size={14} />
        </button>
      </div>
      <label className="transport-frame">
        F{" "}
        <input
          aria-label="Current animation frame"
          disabled={!clip}
          type="number"
          min={0}
          max={clip ? Math.ceil(clip.duration * clip.fps) : 0}
          value={clip ? Math.floor(time * clip.fps + 1e-7) : 0}
          onChange={(e) =>
            seekAnimation(Number(e.target.value) / (clip?.fps ?? 24))
          }
        />
      </label>
      <span className="transport-time">
        {time.toFixed(2)} / {clip?.duration.toFixed(2) ?? "0.00"} s
      </span>
      <select
        aria-label="Playback speed"
        value={speed}
        onChange={(e) =>
          useAnimation.setState({ speed: Number(e.target.value) })
        }
      >
        {[0.25, 0.5, 1, 1.5, 2].map((s) => (
          <option value={s} key={s}>
            {s}×
          </option>
        ))}
      </select>
      <button
        className={`auto-key ${autoKey ? "enabled" : ""}`}
        aria-label="Auto Key"
        aria-pressed={autoKey}
        disabled={!clip}
        onClick={() => useAnimation.setState({ autoKey: !autoKey })}
      >
        <Diamond size={11} /> Auto Key
      </button>
      <button
        className="record-pose"
        aria-label="Record pose keyframe"
        disabled={!clip || !enabled}
        onClick={() => useEditor.getState().recordPose()}
        title={
          en
            ? "Record selected bone, or all bones if none selected"
            : "Ghi xương đang chọn; nếu chưa chọn sẽ ghi toàn bộ xương"
        }
      >
        <Plus size={12} />
        {en ? "Pose key" : "Ghi pose"}
      </button>
      {override && (
        <span className="temporary-pose">{en ? "TEMP POSE" : "POSE TẠM"}</span>
      )}
    </div>
  );
}
export function TrackBuilder({ en }: { en: boolean }) {
  const doc = useEditor((s) => s.document)!,
    clipId = useAnimation((s) => s.activeClipId),
    selectedTrack = useAnimation((s) => s.selectedTrackId);
  const [type, setType] = useState<AnimationChannel>("bone.rotation"),
    [target, setTarget] = useState("");
  const category = type.split(".")[0];
  const choices =
    category === "bone"
      ? doc.bones
          .filter((b) => boneInView(doc, b.id))
          .map((b) => ({ id: b.id, name: b.name }))
      : category === "mesh"
        ? doc.meshes
            .filter((m) => layerInView(doc, m.layerId))
            .map((m) => ({
              id: m.id,
              name: doc.layers.find((l) => l.id === m.layerId)?.name ?? "Mesh",
            }))
        : category === "ik"
          ? doc.ikTargets
              .filter((t) => boneInView(doc, t.rootBoneId))
              .map((t) => ({
                id: t.id,
                name: doc.bones.find((b) => b.id === t.endBoneId)?.name ?? "IK",
              }))
          : doc.layers
              .filter((l) => layerInView(doc, l.id))
              .map((l) => ({ id: l.id, name: l.name }));
  const current = choices.some((c) => c.id === target)
    ? target
    : choices[0]?.id;
  return (
    <div className="track-builder">
      <select
        aria-label="Animation track type"
        value={type}
        onChange={(e) => setType(e.target.value as AnimationChannel)}
      >
        {channels.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        aria-label="Animation track target"
        value={current ?? ""}
        onChange={(e) => setTarget(e.target.value)}
      >
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        disabled={!clipId || !current}
        aria-label="Add track keyframe"
        onClick={() => {
          const time = useAnimation.getState().time,
            preview = getPreviewDocument(doc);
          useEditor.getState().command("Thêm track/keyframe", (d) => {
            const k = setKeyframe(
              d,
              clipId!,
              current!,
              type,
              time,
              valueForTrack(doc, preview, type, current!),
            );
            const t = ensureTrack(d, clipId!, current!, type);
            useAnimation.setState({
              selectedTrackId: t.id,
              selectedKeys: [k.id],
              selectedEventId: null,
            });
          });
        }}
      >
        <Plus size={12} />
        {en ? "Track + key" : "Track + key"}
      </button>
      {selectedTrack && (
        <button
          aria-label="Delete selected track"
          onClick={() =>
            useEditor.getState().command("Xóa track", (d) => {
              d.keyframeTracks = d.keyframeTracks.filter(
                (t) => t.id !== selectedTrack,
              );
            })
          }
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
export function OnionControls({ en }: { en: boolean }) {
  const onion = useAnimation((s) => s.onion);
  const update = (patch: Partial<typeof onion>) =>
    useAnimation.setState({ onion: { ...onion, ...patch } });
  return (
    <div className="onion-controls">
      <label>
        <input
          type="checkbox"
          aria-label="Onion skin"
          checked={onion.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />{" "}
        Onion Skin
      </label>
      {onion.enabled && (
        <>
          <label>
            {en ? "Prev" : "Trước"}
            <input
              aria-label="Onion previous frames"
              type="number"
              min={0}
              max={3}
              value={onion.previous}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 0 && n <= 3 && Number.isInteger(n))
                  update({ previous: n });
              }}
            />
          </label>
          <label>
            {en ? "Next" : "Sau"}
            <input
              aria-label="Onion next frames"
              type="number"
              min={0}
              max={3}
              value={onion.next}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 0 && n <= 3 && Number.isInteger(n))
                  update({ next: n });
              }}
            />
          </label>
          <input
            aria-label="Onion opacity"
            type="range"
            min={0.05}
            max={0.5}
            step={0.01}
            value={onion.opacity}
            onChange={(e) => update({ opacity: Number(e.target.value) })}
          />
        </>
      )}
    </div>
  );
}
export function AnimationInspector({ en }: { en: boolean }) {
  const doc = useEditor((s) => s.document)!,
    ids = useAnimation((s) => s.selectedKeys),
    eventId = useAnimation((s) => s.selectedEventId),
    active = useAnimation((s) => s.activeClipId);
  const track = doc.keyframeTracks.find((t) =>
      t.keyframes.some((k) => ids.includes(k.id)),
    ),
    key = track?.keyframes.find((k) => ids.includes(k.id)),
    event = doc.animationEvents.find((e) => e.id === eventId);
  const clip = doc.animationClips.find(
    (c) => c.id === (track?.clipId ?? event?.clipId ?? active),
  );
  const [vertexId, setVertex] = useState(""),
    [payload, setPayload] = useState("");
  useEffect(
    () => setPayload(JSON.stringify(event?.payload ?? null, null, 2)),
    [event?.id, event?.payload],
  );
  const edit = (label: string, recipe: (d: ProjectDocument) => void) =>
    useEditor.getState().command(label, recipe);
  if (event && clip)
    return (
      <div className="inspector-scroll">
        <div className="rig-selected">
          <Clapperboard size={18} />
          <strong>{en ? "Animation event" : "Sự kiện hoạt ảnh"}</strong>
        </div>
        <section className="property-section">
          <label className="field-label">
            {en ? "Name" : "Tên"}
            <input
              aria-label="Event name"
              value={event.name}
              onChange={(e) => {
                if (e.target.value.trim())
                  edit("Tên event", (d) => {
                    d.animationEvents.find((v) => v.id === event.id)!.name =
                      e.target.value;
                  });
              }}
            />
          </label>
          <label className="rig-number">
            {en ? "Time (s)" : "Thời điểm (s)"}
            <input
              aria-label="Event time"
              type="number"
              min={0}
              max={clip.duration}
              step={1 / clip.fps}
              value={event.time}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 0 && n <= clip.duration)
                  edit("Thời điểm event", (d) => {
                    d.animationEvents.find((v) => v.id === event.id)!.time = n;
                  });
              }}
            />
          </label>
          <label className="animation-check">
            <input
              aria-label="Event enabled"
              type="checkbox"
              checked={event.enabled}
              onChange={(e) =>
                edit("Bật/tắt event", (d) => {
                  d.animationEvents.find((v) => v.id === event.id)!.enabled =
                    e.target.checked;
                })
              }
            />
            {en ? "Enabled" : "Được phát"}
          </label>
          <label className="field-label">
            Typed payload JSON
            <textarea
              aria-label="Event payload"
              maxLength={8192}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
            />
          </label>
          <button
            className="secondary-btn wide"
            onClick={() => {
              try {
                const value = JSON.parse(payload);
                const valid =
                  value === null ? null : eventPayloadSchema.parse(value);
                edit("Event payload", (d) => {
                  d.animationEvents.find((v) => v.id === event.id)!.payload =
                    valid;
                });
              } catch (e) {
                useEditor
                  .getState()
                  .setError("Payload không hợp lệ: " + String(e));
              }
            }}
          >
            {en ? "Apply payload" : "Áp dụng payload"}
          </button>
          <div className="order-buttons">
            <button
              className="secondary-btn"
              aria-label="Duplicate event"
              onClick={() =>
                edit("Nhân đôi event", (d) => {
                  const copy = addEvent(
                    d,
                    event.clipId,
                    Math.min(clip.duration, event.time + 1 / clip.fps),
                    event.name,
                  );
                  copy.payload = structuredClone(event.payload);
                  copy.enabled = event.enabled;
                })
              }
            >
              <Copy size={12} />
            </button>
            <button
              className="secondary-btn"
              aria-label="Delete event"
              onClick={() => {
                edit("Xóa event", (d) => deleteEvent(d, event.id));
                useAnimation.setState({ selectedEventId: null });
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
          <p className="rig-hint">
            {en
              ? "Seeking is silent. Events dispatch only during forward playback. VFX payloads are reserved data; no VFX is simulated."
              : "Tua tay không phát event. Event chỉ phát khi playback tiến qua mốc. Payload VFX là dữ liệu dành cho Phase 4, chưa mô phỏng VFX."}
          </p>
        </section>
      </div>
    );
  if (!track || !key || !clip)
    return (
      <div className="inspector-scroll">
        <ClipSettings en={en} />
        <MixControls en={en} />
        <div className="rig-explainer">
          <strong>{en ? "Make your first key" : "Tạo key đầu tiên"}</strong>
          <p>
            {en
              ? "Select a bone, move the playhead, pose it and choose Pose key. Enable Auto Key to record edits automatically."
              : "Chọn xương, dời playhead, chỉnh pose rồi chọn Ghi pose. Bật Auto Key để tự ghi thay đổi."}
          </p>
        </div>
      </div>
    );
  const change = (
    recipe: (k: NonNullable<typeof key>, t: AnimationTrack) => void,
  ) =>
    edit("Chỉnh keyframe", (d) => {
      const t = d.keyframeTracks.find((t) => t.id === track.id)!;
      const k = t.keyframes.find((k) => k.id === key.id)!;
      recipe(k, t);
      t.keyframes.sort((a, b) => a.time - b.time);
    });
  const mesh =
    track.type === "mesh.deform"
      ? doc.meshes.find((m) => m.id === track.targetId)
      : undefined;
  const vertex =
    mesh?.vertices.find((v) => v.id === vertexId) ?? mesh?.vertices[0];
  const offsets = key.value && typeof key.value === "object" ? key.value : null;
  return (
    <div className="inspector-scroll key-inspector">
      <div className="rig-selected">
        <Diamond size={17} />
        <div>
          <strong>
            {ids.length} {en ? "keyframe(s)" : "keyframe"}
          </strong>
          <span>{track.type}</span>
        </div>
      </div>
      <section className="property-section">
        <label className="rig-number">
          Frame
          <input
            aria-label="Keyframe frame"
            type="number"
            min={0}
            max={clip.duration * clip.fps}
            step={1}
            value={Number((key.time * clip.fps).toFixed(4))}
            onChange={(e) => {
              const n = Number(e.target.value) / clip.fps;
              if (n >= 0 && n <= clip.duration)
                change((k) => {
                  k.time = n;
                });
            }}
          />
        </label>
        <p className="rig-hint">
          {key.time.toFixed(4)} s · {clip.fps} FPS
        </p>
        {typeof key.value === "number" && (
          <label className="rig-number">
            {en ? "Value" : "Giá trị"}
            <input
              aria-label="Keyframe value"
              type="number"
              step={0.1}
              value={Number(key.value.toFixed(5))}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(value))
                  change((k) => {
                    k.value = value;
                  });
              }}
            />
          </label>
        )}
        {typeof key.value === "boolean" && (
          <label className="animation-check">
            <input
              aria-label="Keyframe visibility"
              type="checkbox"
              checked={key.value}
              onChange={(e) =>
                change((k) => {
                  k.value = e.target.checked;
                })
              }
            />
            Visible
          </label>
        )}
        {track.type === "attachment.bone" && (
          <select
            className="rig-select"
            aria-label="Keyframe attachment"
            value={typeof key.value === "string" ? key.value : ""}
            onChange={(e) =>
              change((k) => {
                k.value = e.target.value || null;
              })
            }
          >
            <option value="">Unbound</option>
            {doc.bones
              .filter((b) => boneInView(doc, b.id))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        )}
        {mesh && vertex && offsets && (
          <>
            <select
              className="rig-select"
              aria-label="Deformation vertex"
              value={vertex.id}
              onChange={(e) => setVertex(e.target.value)}
            >
              {mesh.vertices.map((v, i) => (
                <option value={v.id} key={v.id}>
                  Vertex #{i}
                </option>
              ))}
            </select>
            {(["x", "y"] as const).map((axis) => (
              <label className="rig-number" key={axis}>
                Offset {axis.toUpperCase()}
                <input
                  aria-label={"Deformation offset " + axis.toUpperCase()}
                  type="number"
                  min={-4096}
                  max={4096}
                  step={0.5}
                  value={offsets[vertex.id]?.[axis] ?? 0}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isFinite(value))
                      change((k) => {
                        if (k.value && typeof k.value === "object")
                          k.value[vertex.id] = {
                            ...(k.value[vertex.id] ?? { x: 0, y: 0 }),
                            [axis]: value,
                          };
                      });
                  }}
                />
              </label>
            ))}
            <button
              className="secondary-btn wide"
              onClick={() =>
                change((k) => {
                  k.value = {};
                })
              }
            >
              {en ? "Reset deformation key" : "Đặt lại deformation key"}
            </button>
          </>
        )}
        <label className="field-label">
          Interpolation
          <select
            aria-label="Keyframe interpolation"
            value={key.interpolation}
            onChange={(e) =>
              change((k) => {
                k.interpolation = e.target.value as typeof key.interpolation;
              })
            }
          >
            {(isDiscrete(track.type)
              ? ["stepped"]
              : ["linear", "stepped", "bezier"]
            ).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {key.interpolation === "bezier" && (
          <div className="easing-fields">
            {(["x1", "y1", "x2", "y2"] as const).map((name) => (
              <label className="rig-number" key={name}>
                {name}
                <input
                  aria-label={"Easing " + name}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={
                    (key.handles ?? { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 })[
                      name
                    ]
                  }
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 0 && n <= 1)
                      change((k) => {
                        k.handles = {
                          ...(k.handles ?? {
                            x1: 0.25,
                            y1: 0.1,
                            x2: 0.25,
                            y2: 1,
                          }),
                          [name]: n,
                        };
                      });
                  }}
                />
              </label>
            ))}
          </div>
        )}
        {track.type.endsWith(".rotation") && (
          <label className="field-label">
            {en ? "Rotation path" : "Đường xoay"}
            <select
              aria-label="Rotation path"
              value={track.rotationMode}
              onChange={(e) =>
                change((_, t) => {
                  t.rotationMode = e.target.value as "shortest" | "direct";
                })
              }
            >
              <option value="shortest">Shortest path</option>
              <option value="direct">Direct · multi-turn</option>
            </select>
          </label>
        )}
        <label className="animation-check">
          <input
            type="checkbox"
            aria-label="Track enabled"
            checked={track.enabled}
            onChange={(e) =>
              change((_, t) => {
                t.enabled = e.target.checked;
              })
            }
          />
          {en ? "Track enabled" : "Bật track"}
        </label>
        <button
          className="secondary-btn wide"
          aria-label="Delete selected keyframes"
          onClick={() => {
            edit("Xóa keyframe", (d) => deleteKeys(d, ids));
            useAnimation.setState({ selectedKeys: [] });
          }}
        >
          <Trash2 size={12} />
          {en ? "Delete selected keys" : "Xóa key đã chọn"}
        </button>
      </section>
      <ClipSettings en={en} />
    </div>
  );
}
export function AnimationExport({ en }: { en: boolean }) {
  const doc = useEditor((s) => s.document)!,
    active = useAnimation((s) => s.activeClipId);
  const [clipId, setClip] = useState(
      active ?? doc.animationClips.find((c) => clipInView(doc, c.id))?.id ?? "",
    ),
    [fps, setFps] = useState(12),
    [width, setWidth] = useState(256),
    [height, setHeight] = useState(256),
    [progress, setProgress] = useState<number | null>(null);
  const id = doc.animationClips.some((c) => c.id === clipId)
    ? clipId
    : doc.animationClips.find((c) => clipInView(doc, c.id))?.id;
  return (
    <div className="animation-export">
      <strong>{en ? "Animation export" : "Xuất hoạt ảnh"}</strong>
      <select
        className="rig-select"
        aria-label="Export animation"
        value={id ?? ""}
        onChange={(e) => setClip(e.target.value)}
      >
        {doc.animationClips
          .filter((c) => clipInView(doc, c.id))
          .map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      <div className="export-grid">
        {[
          { name: "Export FPS", value: fps, set: setFps, min: 1, max: 60 },
          {
            name: "Frame width",
            value: width,
            set: setWidth,
            min: 64,
            max: 2048,
          },
          {
            name: "Frame height",
            value: height,
            set: setHeight,
            min: 64,
            max: 2048,
          },
        ].map((f) => (
          <label key={f.name}>
            {f.name}
            <input
              aria-label={f.name}
              type="number"
              min={f.min}
              max={f.max}
              value={f.value}
              onChange={(e) => f.set(Number(e.target.value))}
            />
          </label>
        ))}
      </div>
      <div className="order-buttons">
        <button
          className="secondary-btn"
          disabled={!id || progress !== null}
          aria-label="Export animation JSON"
          onClick={() => {
            try {
              download(
                JSON.stringify(animationMetadata(doc, id!), null, 2),
                doc.animationClips.find((c) => c.id === id)!.name +
                  ".animation.json",
                "application/json",
              );
            } catch (e) {
              useEditor.getState().setError(String(e));
            }
          }}
        >
          <Download size={13} />
          Animation JSON
        </button>
        <button
          className="secondary-btn"
          disabled={!id || progress !== null}
          aria-label="Export animated spritesheet"
          onClick={() => {
            setProgress(0);
            void exportSpritesheet(
              doc,
              id!,
              { fps, frameWidth: width, frameHeight: height },
              setProgress,
            )
              .then(spritesheetPackage)
              .then((bytes) =>
                download(
                  bytes as BlobPart,
                  doc.animationClips.find((c) => c.id === id)!.name +
                    ".spritesheet.zip",
                  "application/zip",
                ),
              )
              .catch((e) => useEditor.getState().setError(String(e)))
              .finally(() => setProgress(null));
          }}
        >
          <Download size={13} />
          Spritesheet ZIP
        </button>
      </div>
      <p className="subtle-note">
        {progress !== null
          ? `${Math.round(progress * 100)}% · ${en ? "Rendering actual frames…" : "Đang render từng frame…"}`
          : en
            ? "ZIP contains transparent PNG + frames.json. Bounds fit every sampled pose. GIF/MP4 are unsupported."
            : "ZIP gồm PNG trong suốt + frames.json. Bounds bao trọn các pose lấy mẫu. Chưa hỗ trợ GIF/MP4."}
      </p>
    </div>
  );
}
