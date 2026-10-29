import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useEditor } from "../../../packages/editor-core/src/store";
import { useAnimation } from "../../../packages/editor-core/src/animation-state";
import {
  useVFXSession,
  vfxClipboard,
} from "../../../packages/editor-core/src/vfx-state";
import {
  seekAnimation,
  togglePlayback,
} from "../../../packages/editor-core/src/animation-playback";
import { putParameterKey } from "../../../packages/vfx-core/src/parameters";
import { Transport } from "./AnimationStudio";
export function VFXTimeline() {
  const editor = useEditor(),
    doc = editor.document!,
    a = useAnimation(
      useShallow((s) => ({
        clipId: s.activeClipId,
        time: s.playing ? s.displayTime : s.time,
      })),
    ),
    selectedEffectId = useVFXSession((s) => s.selectedEffectId),
    effect =
      doc.vfxGraphs.find((e) => e.id === selectedEffectId) ?? doc.vfxGraphs[0],
    clip = doc.animationClips.find((c) => c.id === a.clipId),
    duration = clip?.duration ?? effect?.duration ?? 2;
  const [selected, setSelected] = useState<{
    trackId: string;
    keyId: string;
  } | null>(null);
  const start =
    (doc.animationEvents.find((e) => e.id === effect?.trigger?.startEventId)
      ?.time ?? 0) + (effect?.trigger?.delay ?? 0);
  return (
    <section
      className="vfx-bottom-timeline"
      tabIndex={0}
      aria-label="VFX timeline"
      style={{
        height: 260,
        overflow: "auto",
        borderTop: "1px solid #37313f",
        padding: 10,
        flexShrink: 0,
        background: "#1d1927",
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input,textarea,select")) return;
        if (e.code === "Space") {
          e.preventDefault();
          togglePlayback();
        }
        if (e.key === "Home") {
          e.preventDefault();
          seekAnimation(0);
        }
        const track = effect?.tracks?.find((t) => t.id === selected?.trackId),
          key = track?.keys.find((k) => k.id === selected?.keyId);
        if (
          (e.metaKey || e.ctrlKey) &&
          e.key.toLowerCase() === "c" &&
          track &&
          key
        ) {
          e.preventDefault();
          vfxClipboard.current = {
            channel: track.channel,
            keys: [structuredClone(key)],
          };
        }
        if (
          (e.metaKey || e.ctrlKey) &&
          e.key.toLowerCase() === "v" &&
          effect &&
          track &&
          vfxClipboard.current?.channel === track.channel
        ) {
          e.preventDefault();
          const copy = vfxClipboard.current;
          editor.command("Paste VFX key", (d) => {
            const fx = d.vfxGraphs.find((e) => e.id === effect.id)!;
            putParameterKey(
              fx,
              track.targetId,
              track.channel,
              Math.max(0, Math.min(fx.duration, a.time - start)),
              copy.keys[0].value,
            );
          });
        }
        if (e.key === "Delete" && effect && track && key) {
          e.preventDefault();
          editor.command("Delete VFX key", (d) => {
            const t = d.vfxGraphs
              .find((e) => e.id === effect.id)!
              .tracks!.find((t) => t.id === track.id)!;
            t.keys = t.keys.filter((k) => k.id !== key.id);
          });
        }
      }}
    >
      <strong>VFX Timeline · {effect?.name ?? "Chọn hoặc tạo hiệu ứng"}</strong>
      <Transport en={false} />
      <input
        disabled={!clip}
        aria-label="VFX timeline seek"
        type="range"
        min={0}
        max={duration}
        step={1 / (clip?.fps ?? 24)}
        value={Math.min(duration, a.time)}
        style={{ width: "100%" }}
        onChange={(e) => seekAnimation(Number(e.target.value))}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "#a79bb6",
        }}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i}>{((duration * i) / 4).toFixed(2)}s</span>
        ))}
      </div>
      <div style={{ height: 26, position: "relative", marginLeft: 130 }}>
        {doc.animationEvents
          .filter((e) => e.clipId === a.clipId)
          .map((ev) => (
            <button
              key={ev.id}
              title={ev.name + " · " + ev.time + "s"}
              aria-label={"Seek VFX event " + ev.name}
              style={{
                position: "absolute",
                left: (ev.time / duration) * 100 + "%",
                color: "#ffbd66",
              }}
              onClick={() => seekAnimation(ev.time)}
            >
              ◆
            </button>
          ))}
      </div>
      {effect?.tracks?.map((track) => (
        <div
          key={track.id}
          style={{
            display: "flex",
            height: 28,
            borderTop: "1px solid #35303e",
          }}
        >
          <span style={{ width: 130, fontSize: 11 }}>
            {track.channel} · {track.keys.length} key
          </span>
          <div style={{ flex: 1, position: "relative" }}>
            {track.keys.map((k) => (
              <button
                key={k.id}
                title={`${k.time.toFixed(3)}s: ${k.value}`}
                aria-label={"VFX timeline key " + k.id}
                draggable
                onDragEnd={(e) => {
                  const rect =
                    e.currentTarget.parentElement!.getBoundingClientRect();
                  const time = Math.max(
                    0,
                    Math.min(
                      effect.duration,
                      ((e.clientX - rect.left) / rect.width) * duration - start,
                    ),
                  );
                  editor.command("Move VFX key", (d) => {
                    const t = d.vfxGraphs
                      .find((n) => n.id === effect.id)!
                      .tracks!.find((n) => n.id === track.id)!;
                    t.keys.find((n) => n.id === k.id)!.time =
                      Math.round(time * (clip?.fps ?? 24)) / (clip?.fps ?? 24);
                    t.keys.sort((a, b) => a.time - b.time);
                  });
                }}
                onClick={() => {
                  setSelected({ trackId: track.id, keyId: k.id });
                  seekAnimation(start + k.time);
                }}
                style={{
                  position: "absolute",
                  left: ((start + k.time) / duration) * 100 + "%",
                  color: selected?.keyId === k.id ? "#fff" : "#bf9af4",
                }}
              >
                ◆
              </button>
            ))}
          </div>
        </div>
      ))}
      {!effect?.tracks?.length && (
        <p style={{ fontSize: 12, color: "#aa98b8" }}>
          Chọn thuộc tính trong Inspector → thêm key tại playhead. Event dùng
          chung với timeline hoạt ảnh.
        </p>
      )}
    </section>
  );
}
