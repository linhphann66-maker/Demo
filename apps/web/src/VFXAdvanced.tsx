import {
  addEvent,
  deleteEvent,
} from "../../../packages/animation-core/src/commands";
import { eventPayloadSchema } from "../../../packages/document-core/src/animation-schema";
import { useShallow } from "zustand/react/shallow";
import { addFootstepDust } from "../../../packages/vfx-core/src/footsteps";
import { selectAnimation } from "../../../packages/editor-core/src/animation-playback";
import { useState, useRef } from "react";
import { useEditor } from "../../../packages/editor-core/src/store";
import { useAnimation } from "../../../packages/editor-core/src/animation-state";
import {
  vfxClipboard,
  useVFXSession,
} from "../../../packages/editor-core/src/vfx-state";
import { seekAnimation } from "../../../packages/editor-core/src/animation-playback";
import { boneInView, clipInView } from "../../../packages/document-core/src";
import {
  type VFXEffect,
  type VFXAttachment,
  type VFXTrack,
  type VFXKey,
  channels,
  frameSchema,
  filterChannels,
} from "../../../packages/vfx-core/src/schema";
import { putParameterKey } from "../../../packages/vfx-core/src/parameters";
import {
  presetNames,
  makePreset,
  asPreset,
  instantiatePreset,
  createTrail,
  defaultAttachment,
} from "../../../packages/vfx-core/src/presets";
import { duplicateEffect } from "../../../packages/vfx-core/src";
import { importRaster } from "../../../packages/exporters/src";
import {
  download,
  exportSpritesheet,
  spritesheetPackage,
  editableVFXPackage,
} from "../../../packages/exporters/src";
export function VFXLibrary({ select }: { select: (id: string) => void }) {
  const s = useEditor(),
    doc = s.document!,
    animation = useAnimation(
      useShallow((s) => ({
        activeClipId: s.activeClipId,
        time: s.playing ? s.displayTime : s.time,
      })),
    ),
    [query, setQuery] = useState("");
  return (
    <div style={{ margin: "10px 0" }}>
      <h4>Preset procedural</h4>
      {presetNames
        .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
        .map((name) => (
          <button
            key={name}
            className="secondary-btn wide"
            disabled={doc.vfxGraphs.length >= 32}
            onClick={() => {
              if (
                name === "Footstep Dust" &&
                doc.animationClips.some(
                  (c) => clipInView(doc, c.id) && /^(Walk|Run)$/.test(c.name),
                )
              ) {
                let ids: string[] = [];
                s.command("Footstep dust từ tiếp đất", (d) => {
                  ids = addFootstepDust(d);
                });
                if (ids[0]) {
                  select(ids[0]);
                  const clip = doc.animationClips.find(
                    (c) => clipInView(doc, c.id) && c.name === "Walk",
                  );
                  if (clip) selectAnimation(clip.id);
                }
                return;
              }
              const e = makePreset(name, doc, animation.activeClipId);
              s.command("Thêm preset " + name, (d) => {
                d.vfxGraphs.push(e);
              });
              select(e.id);
              if (e.trigger?.clipId) selectAnimation(e.trigger.clipId);
              else if (!animation.activeClipId) {
                const clip =
                  doc.animationClips.find(
                    (c) => clipInView(doc, c.id) && c.name === "Idle",
                  ) ?? doc.animationClips.find((c) => clipInView(doc, c.id));
                if (clip) selectAnimation(clip.id);
              }
            }}
          >
            {name}
          </button>
        ))}
      <button
        className="secondary-btn wide"
        disabled={doc.vfxGraphs.length >= 32}
        onClick={() =>
          s.command("Footstep dust từ foot contact", (d) => {
            addFootstepDust(d);
          })
        }
      >
        Tạo dust tại tiếp đất Walk/Run
      </button>
      <label>
        Tìm preset
        <input
          aria-label="Search VFX presets"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {(doc.vfxPresets ?? [])
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .map((p) => (
          <div key={p.id}>
            <input
              aria-label="Preset name"
              value={p.name}
              maxLength={100}
              onChange={(e) => {
                if (e.target.value.trim())
                  s.command("Đổi tên preset", (d) => {
                    d.vfxPresets!.find((n) => n.id === p.id)!.name =
                      e.target.value;
                  });
              }}
            />
            <button
              disabled={doc.vfxGraphs.length >= 32}
              onClick={() => {
                const bone = doc.bones.find(
                  (b) =>
                    boneInView(doc, b.id) && /weapon.*socket/i.test(b.name),
                );
                const next = instantiatePreset(p, bone?.id ?? null);
                s.command("Dùng preset", (d) => {
                  d.vfxGraphs.push(next);
                });
                select(next.id);
              }}
            >
              Dùng bản riêng
            </button>
            <button
              disabled={(doc.vfxPresets?.length ?? 0) >= 64}
              onClick={() =>
                s.command("Nhân đôi preset", (d) => {
                  d.vfxPresets!.push(duplicateEffect(p));
                })
              }
            >
              Nhân đôi preset
            </button>
            <button
              onClick={() =>
                s.command("Xóa preset", (d) => {
                  d.vfxPresets = d.vfxPresets!.filter((n) => n.id !== p.id);
                })
              }
            >
              Xóa preset
            </button>
            <button
              onClick={() =>
                download(
                  JSON.stringify(editableVFXPackage(doc, p), null, 2),
                  "preset.vfx.json",
                  "application/json",
                )
              }
            >
              Xuất preset JSON
            </button>
          </div>
        ))}
    </div>
  );
}
export function VFXAdvanced({
  effect,
  edit,
}: {
  effect: VFXEffect;
  edit: (label: string, fn: (e: VFXEffect) => void) => void;
}) {
  const s = useEditor(),
    doc = s.document!,
    animation = useAnimation(
      useShallow((s) => ({
        activeClipId: s.activeClipId,
        time: s.playing ? s.displayTime : s.time,
      })),
    ),
    session = useVFXSession();
  const [target, setTarget] = useState(effect.id),
    [channel, setChannel] = useState<VFXTrack["channel"]>("intensity"),
    [value, setValue] = useState("1"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [fps, setFps] = useState(12),
    [dimensions, setDimensions] = useState(256),
    [frameHeight, setFrameHeight] = useState(256),
    [duration, setDuration] = useState(effect.duration),
    [showAllEvents, setShowAllEvents] = useState(false);
  const effectId = effect.id;
  const clipboard = vfxClipboard;
  const file = useRef<HTMLInputElement>(null),
    metadata = useRef<HTMLInputElement>(null);
  const bones = doc.bones.filter((b) => boneInView(doc, b.id));
  const number = (
    label: string,
    v: number,
    fn: (n: number) => void,
    min = -10000,
    max = 10000,
    step = 0.1,
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        value={v}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber))
            fn(Math.max(min, Math.min(max, e.target.valueAsNumber)));
        }}
      />
    </label>
  );
  const attachment = (
    a: VFXAttachment,
    change: (fn: (a: VFXAttachment) => void) => void,
    label: string,
  ) => (
    <fieldset>
      <legend>{label}</legend>
      <label>
        Xương
        <select
          aria-label={label + " bone"}
          value={a.boneId ?? ""}
          onChange={(e) =>
            change((a) => {
              a.boneId = e.target.value || null;
            })
          }
        >
          <option value="">Character Root</option>
          {bones.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {(["x", "y"] as const).map((axis) =>
        number(label + " " + axis, a.offset[axis], (v) =>
          change((a) => {
            a.offset[axis] = v;
          }),
        ),
      )}
      {number(
        label + " rotation",
        a.rotation,
        (v) =>
          change((a) => {
            a.rotation = v;
          }),
        -3600,
        3600,
      )}
      {number(
        label + " scale",
        a.scale,
        (v) =>
          change((a) => {
            a.scale = v;
          }),
        0.01,
        20,
      )}
      {(["followPosition", "followRotation", "followScale"] as const).map(
        (key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={a[key] !== false}
              onChange={(e) =>
                change((a) => {
                  a[key] = e.target.checked;
                })
              }
            />
            {key}
          </label>
        ),
      )}
      {a.followPosition === false &&
        (["x", "y"] as const).map((axis) =>
          number(label + " fixed " + axis, a.fixedPosition?.[axis] ?? 0, (v) =>
            change((a) => {
              a.fixedPosition ??= { x: 0, y: 0 };
              a.fixedPosition[axis] = v;
            }),
          ),
        )}
    </fieldset>
  );
  const currentTrigger = effect.trigger,
    events = doc.animationEvents.filter(
      (e) => e.clipId === (currentTrigger?.clipId ?? animation.activeClipId),
    );
  const targets = [
    { id: effect.id, name: "Effect", channels: ["intensity"] },
    ...effect.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      channels: [
        "rate",
        "speed",
        "color",
        "opacity",
        "scale",
        "rotation",
        "x",
        "y",
      ],
    })),
    ...(effect.trails ?? []).map((n) => ({
      id: n.id,
      name: n.name,
      channels: ["width", "color", "opacity"],
    })),
    ...(effect.filters ?? []).map((n) => ({
      id: n.id,
      name: n.type,
      channels: filterChannels(n.type),
    })),
    ...(effect.flipbooks ?? []).map((n) => ({
      id: n.id,
      name: n.name,
      channels: ["opacity", "scale", "rotation"],
    })),
  ];
  const activeTarget = targets.find((t) => t.id === target) ?? targets[0],
    activeChannel = activeTarget.channels.includes(channel)
      ? channel
      : (activeTarget.channels[0] as VFXTrack["channel"]);
  const startTime =
    (doc.animationEvents.find((ev) => ev.id === effect.trigger?.startEventId)
      ?.time ?? 0) + (effect.trigger?.delay ?? 0);
  const now = effect.trigger
    ? Math.min(effect.duration, Math.max(0, animation.time - startTime))
    : effect.loopMode === "loop"
      ? animation.time % effect.duration
      : Math.min(effect.duration, animation.time);
  const track = effect.tracks?.find(
    (t) => t.targetId === activeTarget.id && t.channel === activeChannel,
  );
  const mutateTrack = (fn: (t: VFXTrack) => void) =>
    edit("Chỉnh VFX keyframes", (e) => {
      const t = e.tracks?.find((t) => t.id === track?.id);
      if (t) fn(t);
    });
  const exportSheet = async (vfxOnly: boolean) => {
    if (!animation.activeClipId) return;
    setBusy(true);
    setError("");
    try {
      const result = await exportSpritesheet(doc, animation.activeClipId, {
        fps,
        frameWidth: dimensions,
        frameHeight,
        quality: session.quality,
        duration,
        effectIds: vfxOnly ? [effect.id] : undefined,
        vfxOnly,
      });
      download(
        new Uint8Array(await spritesheetPackage(result)),
        vfxOnly ? "vfx-spritesheet.zip" : "character-vfx.zip",
        "application/zip",
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-testid="vfx-advanced">
      <label>
        Chất lượng preview
        <select
          aria-label="VFX quality"
          value={session.quality}
          onChange={(e) =>
            useVFXSession.setState({
              quality: e.target.value as "low" | "medium" | "high",
            })
          }
        >
          {["low", "medium", "high"].map((q) => (
            <option key={q}>{q}</option>
          ))}
        </select>
      </label>
      <label>
        <input
          aria-label="VFX gizmos"
          type="checkbox"
          checked={session.gizmos}
          onChange={(e) => useVFXSession.setState({ gizmos: e.target.checked })}
        />
        Hiện vùng phát và hướng particle
      </label>
      <button
        className="secondary-btn wide"
        disabled={(doc.vfxPresets?.length ?? 0) >= 64}
        onClick={() =>
          s.command("Lưu VFX thành preset", (d) => {
            d.vfxPresets ??= [];
            d.vfxPresets.push(asPreset(effect));
          })
        }
      >
        Lưu thành preset riêng
      </button>
      <button
        className="secondary-btn wide"
        onClick={() =>
          download(
            JSON.stringify(editableVFXPackage(doc, effect), null, 2),
            "effect-with-textures.json",
            "application/json",
          )
        }
      >
        Xuất effect + texture + events JSON
      </button>
      <details open>
        <summary>Event trigger · cùng timeline Phase 3</summary>
        <label>
          <input
            aria-label="VFX event trigger"
            type="checkbox"
            checked={!!currentTrigger}
            onChange={(e) =>
              edit("VFX trigger", (v) => {
                if (e.target.checked)
                  v.trigger = {
                    clipId: animation.activeClipId,
                    startEventId: null,
                    stopEventId: null,
                    delay: 0,
                    mode: "continuous",
                  };
                else delete v.trigger;
              })
            }
          />
          Gắn vào animation/event
        </label>
        {currentTrigger && (
          <>
            <label>
              Animation
              <select
                value={currentTrigger.clipId ?? ""}
                onChange={(e) =>
                  edit("Trigger clip", (v) => {
                    v.trigger!.clipId = e.target.value || null;
                    v.trigger!.startEventId = null;
                    v.trigger!.stopEventId = null;
                  })
                }
              >
                <option value="">Bất kỳ clip</option>
                {doc.animationClips
                  .filter((c) => clipInView(doc, c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            {(["startEventId", "stopEventId"] as const).map((key) => (
              <label key={key}>
                {key === "startEventId"
                  ? "Bắt đầu tại event"
                  : "Dừng phát tại event"}
                <select
                  aria-label={"VFX " + key}
                  value={currentTrigger[key] ?? ""}
                  onChange={(e) =>
                    edit("Trigger event", (v) => {
                      v.trigger![key] = e.target.value || null;
                    })
                  }
                >
                  <option value="">
                    {key === "startEventId" ? "Đầu clip" : "Hết duration"}
                  </option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} · {ev.time.toFixed(3)}s
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {number(
              "Trigger delay",
              currentTrigger.delay,
              (n) =>
                edit("Trigger delay", (v) => {
                  v.trigger!.delay = n;
                }),
              0,
              30,
            )}
            <select
              aria-label="VFX emission mode"
              value={currentTrigger.mode}
              onChange={(e) =>
                edit("Trigger mode", (v) => {
                  v.trigger!.mode = e.target.value as "continuous" | "burst";
                })
              }
            >
              <option value="continuous">Phát liên tục đến stop</option>
              <option value="burst">Burst tại start</option>
            </select>
          </>
        )}
        <button
          disabled={!animation.activeClipId}
          onClick={() =>
            s.command("Thêm VFX animation event", (d) => {
              if (animation.activeClipId)
                addEvent(
                  d,
                  animation.activeClipId,
                  animation.time,
                  "vfx_event",
                );
            })
          }
        >
          + Event tại playhead
        </button>
        <button onClick={() => setShowAllEvents(!showAllEvents)}>
          Chỉnh mốc event
        </button>
        {showAllEvents &&
          events.map((ev) => (
            <div key={ev.id}>
              <input
                aria-label="VFX event name"
                value={ev.name}
                onChange={(e) => {
                  if (e.target.value.trim())
                    s.command("Tên event", (d) => {
                      d.animationEvents.find((n) => n.id === ev.id)!.name =
                        e.target.value;
                    });
                }}
              />
              <label>
                <input
                  type="checkbox"
                  checked={ev.enabled}
                  onChange={(e) =>
                    s.command("Bật tắt event", (d) => {
                      d.animationEvents.find((n) => n.id === ev.id)!.enabled =
                        e.target.checked;
                    })
                  }
                />
                Event enabled
              </label>
              <button
                onClick={() =>
                  s.command("Nhân đôi event", (d) => {
                    const copy = addEvent(
                      d,
                      ev.clipId,
                      ev.time,
                      (ev.name + "_copy").slice(0, 64),
                    );
                    copy.payload = structuredClone(ev.payload);
                  })
                }
              >
                Nhân đôi event
              </button>
              <button
                onClick={() =>
                  s.command("Xóa event", (d) => deleteEvent(d, ev.id))
                }
              >
                Xóa event
              </button>
              <label>
                Typed payload JSON
                <textarea
                  aria-label="VFX event payload"
                  key={ev.id + JSON.stringify(ev.payload)}
                  defaultValue={JSON.stringify(ev.payload)}
                  onBlur={(e) => {
                    try {
                      const value = eventPayloadSchema.parse(
                        JSON.parse(e.target.value),
                      );
                      s.command("Event payload", (d) => {
                        d.animationEvents.find((n) => n.id === ev.id)!.payload =
                          value;
                      });
                    } catch (error) {
                      setError(String(error));
                    }
                  }}
                />
              </label>
              {number(
                ev.name + " time",
                ev.time,
                (n) =>
                  s.command("Di chuyển event", (d) => {
                    d.animationEvents.find((e) => e.id === ev.id)!.time = n;
                  }),
                0,
                doc.animationClips.find((c) => c.id === ev.clipId)!.duration,
                0.01,
              )}
            </div>
          ))}
        <p className="rig-hint">
          Mốc event là dữ liệu thật trong timeline; thay thời điểm sẽ cập nhật
          VFX. Seek không phát thêm burst trùng.
        </p>
      </details>
      <details open>
        <summary>Sword Trail · marker base/tip</summary>
        <button
          disabled={(effect.trails?.length ?? 0) >= 8}
          onClick={() =>
            edit("Thêm sword trail", (e) => {
              e.trails ??= [];
              const bone = bones.find((b) => /weapon.*socket/i.test(b.name));
              e.trails.push(createTrail(bone?.id ?? null, bone?.length ?? 100));
            })
          }
        >
          + Trail theo vũ khí
        </button>
        {(effect.trails ?? []).map((tr, i) => {
          const update = (fn: (t: typeof tr) => void) =>
            edit("Chỉnh trail", (e) => fn(e.trails![i]));
          return (
            <fieldset key={tr.id}>
              <legend>{tr.name}</legend>
              <label>
                <input
                  type="checkbox"
                  checked={tr.enabled}
                  onChange={(e) =>
                    update((t) => {
                      t.enabled = e.target.checked;
                    })
                  }
                />
                Bật trail
              </label>
              <input
                value={tr.name}
                aria-label="Trail name"
                maxLength={100}
                onChange={(e) => {
                  if (e.target.value.trim())
                    update((t) => {
                      t.name = e.target.value;
                    });
                }}
              />
              {attachment(
                tr.base,
                (fn) => update((t) => fn(t.base)),
                "Weapon base",
              )}
              {attachment(
                tr.tip,
                (fn) => update((t) => fn(t.tip)),
                "Weapon tip",
              )}
              {number(
                "Trail width",
                tr.width,
                (n) =>
                  update((t) => {
                    t.width = n;
                  }),
                0.1,
                500,
              )}
              {number(
                "Trail lifetime",
                tr.lifetime,
                (n) =>
                  update((t) => {
                    t.lifetime = n;
                  }),
                0.01,
                5,
              )}
              {number(
                "Trail sampling",
                tr.sampleRate,
                (n) =>
                  update((t) => {
                    t.sampleRate = n;
                  }),
                1,
                120,
                1,
              )}
              {number(
                "Trail segments",
                tr.segmentLimit,
                (n) =>
                  update((t) => {
                    t.segmentLimit = n;
                  }),
                2,
                256,
                1,
              )}
              {number(
                "Trail fade curve",
                tr.fadePower ?? 1,
                (n) =>
                  update((t) => {
                    t.fadePower = n;
                  }),
                0.1,
                4,
                0.1,
              )}
              {number(
                "Trail opacity",
                tr.opacity,
                (n) =>
                  update((t) => {
                    t.opacity = n;
                  }),
                0,
                1,
              )}
              {number(
                "Trail taper",
                tr.taper,
                (n) =>
                  update((t) => {
                    t.taper = n;
                  }),
                0,
                1,
              )}
              {(["color", "endColor"] as const).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="color"
                    value={tr[k]}
                    onChange={(e) =>
                      update((t) => {
                        t[k] = e.target.value;
                      })
                    }
                  />
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={tr.smoothing}
                  onChange={(e) =>
                    update((t) => {
                      t.smoothing = e.target.checked;
                    })
                  }
                />
                Làm mượt
              </label>
              <select
                value={tr.blendMode}
                onChange={(e) =>
                  update((t) => {
                    t.blendMode = e.target.value as typeof tr.blendMode;
                  })
                }
              >
                {["add", "normal", "screen"].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
              <label>
                Texture
                <select
                  value={tr.textureId ?? ""}
                  onChange={(e) =>
                    update((t) => {
                      t.textureId = e.target.value || null;
                    })
                  }
                >
                  <option value="">Màu procedural</option>
                  {doc.assetReferences.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() =>
                  edit("Xóa trail", (e) => {
                    e.trails = e.trails!.filter((t) => t.id !== tr.id);
                    e.tracks = e.tracks?.filter((t) => t.targetId !== tr.id);
                  })
                }
              >
                Xóa trail
              </button>
            </fieldset>
          );
        })}
      </details>
      <details>
        <summary>Filter / shader · scoped VFX</summary>
        {(
          [
            "GlowEffect",
            "ColorModifier",
            "TransformModifier",
            "Distortion",
            "Dissolve",
          ] as const
        ).map((type) => (
          <button
            key={type}
            disabled={
              (effect.filters?.length ?? 0) >= 8 ||
              effect.filters?.some((f) => f.type === type)
            }
            onClick={() =>
              edit("Thêm " + type, (e) => {
                e.filters ??= [];
                e.filters.push({
                  id: crypto.randomUUID(),
                  type,
                  enabled: true,
                  intensity: 2,
                  color: "#ffffff",
                  opacity: 1,
                  position: { x: 0, y: 0 },
                  rotation: 0,
                  scale: 1,
                });
              })
            }
          >
            + {type}
          </button>
        ))}
        {(effect.filters ?? []).map((f, i) => {
          const change = (fn: (n: typeof f) => void) =>
            edit("Chỉnh filter", (e) => fn(e.filters![i]));
          return (
            <fieldset key={f.id}>
              <legend>{f.type}</legend>
              <label>
                <input
                  type="checkbox"
                  checked={f.enabled}
                  onChange={(e) =>
                    change((f) => {
                      f.enabled = e.target.checked;
                    })
                  }
                />
                Bật
              </label>
              {f.type !== "TransformModifier" &&
                number(
                  "Filter intensity",
                  f.intensity,
                  (n) =>
                    change((f) => {
                      f.intensity = n;
                    }),
                  0,
                  20,
                )}
              {(f.type === "ColorModifier" || f.type === "GlowEffect") && (
                <>
                  <input
                    type="color"
                    value={f.color}
                    onChange={(e) =>
                      change((f) => {
                        f.color = e.target.value;
                      })
                    }
                  />
                  {number(
                    "Filter opacity",
                    f.opacity,
                    (n) =>
                      change((f) => {
                        f.opacity = n;
                      }),
                    0,
                    1,
                  )}
                </>
              )}
              {f.type === "TransformModifier" && (
                <>
                  {(["x", "y"] as const).map((a) =>
                    number("Filter " + a, f.position[a], (n) =>
                      change((f) => {
                        f.position[a] = n;
                      }),
                    ),
                  )}
                  {number(
                    "Filter rotation",
                    f.rotation,
                    (n) =>
                      change((f) => {
                        f.rotation = n;
                      }),
                    -3600,
                    3600,
                  )}
                  {number(
                    "Filter scale",
                    f.scale,
                    (n) =>
                      change((f) => {
                        f.scale = n;
                      }),
                    0.01,
                    20,
                  )}
                  {number(
                    "Transform opacity",
                    f.opacity,
                    (n) =>
                      change((f) => {
                        f.opacity = n;
                      }),
                    0,
                    1,
                  )}
                </>
              )}
              <button
                onClick={() =>
                  edit("Xóa filter", (e) => {
                    e.filters = e.filters!.filter((n) => n.id !== f.id);
                    e.tracks = e.tracks?.filter((t) => t.targetId !== f.id);
                  })
                }
              >
                Xóa filter
              </button>
            </fieldset>
          );
        })}
        <p>
          Distortion/dissolve dùng GLSL WebGL. Low tắt filter nặng. Lỗi shader
          được báo và chuyển về hình không filter.
        </p>
      </details>
      <details>
        <summary>Flipbook · spritesheet gốc và frame metadata</summary>
        <button
          disabled={(effect.flipbooks?.length ?? 0) >= 8}
          onClick={() => file.current?.click()}
        >
          Nhập ảnh spritesheet
        </button>
        <input
          hidden
          ref={file}
          aria-label="VFX spritesheet image"
          type="file"
          accept="image/png,image/webp,image/jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const before = doc;
            void importRaster(f)
              .then((asset) => {
                if (useEditor.getState().document !== before)
                  throw Error("Dự án đã thay đổi; thử lại");
                s.command("Nhập flipbook", (d) => {
                  d.assetReferences.push(asset);
                  const effect = d.vfxGraphs.find((n) => n.id === effectId);
                  if (effect) {
                    effect.flipbooks ??= [];
                    effect.flipbooks.push({
                      id: crypto.randomUUID(),
                      type: "FlipbookAnimation",
                      name: asset.name,
                      enabled: true,
                      assetId: asset.id,
                      frames: [{ x: 0, y: 0, w: asset.width, h: asset.height }],
                      fps: 24,
                      loop: true,
                      frameOffset: 0,
                      opacity: 1,
                      scale: 1,
                      rotation: 0,
                      attachment: defaultAttachment(
                        bones.find((b) => /weapon.*socket/i.test(b.name))?.id ??
                          null,
                      ),
                      blendMode: "add",
                    });
                  }
                });
              })
              .catch((err) => setError(String(err)));
          }}
        />
        {(effect.flipbooks ?? []).map((f, i) => {
          const update = (fn: (v: typeof f) => void) =>
            edit("Chỉnh flipbook", (e) => fn(e.flipbooks![i]));
          return (
            <fieldset key={f.id}>
              <legend>{f.name}</legend>
              <label>
                <input
                  type="checkbox"
                  checked={f.enabled}
                  onChange={(e) =>
                    update((f) => {
                      f.enabled = e.target.checked;
                    })
                  }
                />
                Bật flipbook
              </label>
              <p>{f.frames.length} frame · texture gốc giữ nguyên</p>
              <button
                onClick={() => {
                  metadata.current?.setAttribute("data-index", String(i));
                  metadata.current?.click();
                }}
              >
                Nhập frame metadata JSON
              </button>
              {number(
                "Flipbook FPS",
                f.fps,
                (n) =>
                  update((f) => {
                    f.fps = n;
                  }),
                1,
                120,
              )}
              {number(
                "Flipbook frame offset",
                f.frameOffset,
                (n) =>
                  update((f) => {
                    f.frameOffset = n;
                  }),
                0,
                f.frames.length - 1,
                1,
              )}
              <label>
                <input
                  type="checkbox"
                  checked={f.loop}
                  onChange={(e) =>
                    update((f) => {
                      f.loop = e.target.checked;
                    })
                  }
                />
                Lặp
              </label>
              {number(
                "Flipbook opacity",
                f.opacity,
                (n) =>
                  update((f) => {
                    f.opacity = n;
                  }),
                0,
                1,
              )}
              {number(
                "Flipbook scale",
                f.scale,
                (n) =>
                  update((f) => {
                    f.scale = n;
                  }),
                0.01,
                20,
              )}
              {number(
                "Flipbook rotation",
                f.rotation,
                (n) =>
                  update((f) => {
                    f.rotation = n;
                  }),
                -3600,
                3600,
              )}
              {attachment(
                f.attachment,
                (fn) => update((f) => fn(f.attachment)),
                "Flipbook attachment",
              )}
              <button
                onClick={() =>
                  edit("Xóa flipbook", (e) => {
                    e.flipbooks = e.flipbooks!.filter((n) => n.id !== f.id);
                    e.tracks = e.tracks?.filter((t) => t.targetId !== f.id);
                  })
                }
              >
                Xóa flipbook
              </button>
            </fieldset>
          );
        })}
        <input
          hidden
          ref={metadata}
          aria-label="VFX frame metadata"
          type="file"
          accept=".json"
          onChange={(e) => {
            const f = e.target.files?.[0],
              i = Number(e.target.getAttribute("data-index"));
            e.target.value = "";
            if (!f) return;
            void (async () => {
              try {
                if (f.size > 200000) throw Error("Metadata vượt 200KB");
                const raw = JSON.parse(await f.text());
                const values = Array.isArray(raw)
                  ? raw
                  : Array.isArray(raw.frames)
                    ? raw.frames
                    : Object.values(raw.frames ?? {});
                if (!values.length || values.length > 512)
                  throw Error("Cần 1–512 frames");
                const frames = values.map((n: unknown) => {
                  const r = n as {
                    frame?: unknown;
                    rotated?: boolean;
                    trimmed?: boolean;
                  };
                  if (r.rotated || r.trimmed)
                    throw Error(
                      "Atlas xoay/cắt frame chưa hỗ trợ; xuất frame nguyên không xoay",
                    );
                  const v = (r.frame ?? r) as {
                    x: number;
                    y: number;
                    w: number;
                    h: number;
                  };
                  return frameSchema.parse({ x: v.x, y: v.y, w: v.w, h: v.h });
                });
                edit("Nhập metadata flipbook", (e) => {
                  e.flipbooks![i].sourceMetadata = JSON.stringify(raw);
                  e.flipbooks![i].frames = frames;
                  e.flipbooks![i].frameOffset = 0;
                });
              } catch (err) {
                setError(String(err));
              }
            })();
          }}
        />
        <p>
          JSON: mảng {"{x,y,w,h}"} hoặc TexturePacker frames. Không đồng nghĩa
          particle chỉnh sửa được.
        </p>
      </details>
      <details open>
        <summary>Timeline tham số · giây / cùng playhead</summary>
        <label>
          Đối tượng
          <select
            aria-label="VFX track target"
            value={activeTarget.id}
            onChange={(e) => setTarget(e.target.value)}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Thuộc tính
          <select
            aria-label="VFX track channel"
            value={activeChannel}
            onChange={(e) => setChannel(e.target.value as VFXTrack["channel"])}
          >
            {channels
              .filter((c) => activeTarget.channels.includes(c))
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
        </label>
        <label>
          Giá trị
          <input
            aria-label="VFX key value"
            type={activeChannel === "color" ? "color" : "number"}
            value={
              activeChannel === "color" && value[0] !== "#" ? "#ff6600" : value
            }
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button
          aria-label="Add VFX key"
          onClick={() =>
            edit("Thêm VFX key", (e) =>
              putParameterKey(
                e,
                activeTarget.id,
                activeChannel,
                now,
                activeChannel === "color"
                  ? value[0] === "#"
                    ? value
                    : "#ff6600"
                  : Number(value),
              ),
            )
          }
        >
          + Key tại {now.toFixed(3)}s
        </button>
        <div
          className="vfx-ruler"
          style={{
            position: "relative",
            height: 32,
            background: "#24222f",
            margin: "12px 0",
          }}
          onClick={(event) => {
            const r = event.currentTarget.getBoundingClientRect();
            seekAnimation(
              ((event.clientX - r.left) / r.width) * effect.duration +
                (doc.animationEvents.find(
                  (e) => e.id === effect.trigger?.startEventId,
                )?.time ?? 0),
            );
          }}
        >
          {track?.keys.map((k) => (
            <span
              key={k.id}
              title={`${k.time}s · ${k.value}`}
              style={{
                position: "absolute",
                left: (k.time / effect.duration) * 100 + "%",
                color: "#c3a4ff",
              }}
            >
              ◆
            </span>
          ))}
          <span
            style={{
              position: "absolute",
              left: (now / effect.duration) * 100 + "%",
              height: 32,
              borderLeft: "2px solid #ffbd68",
              pointerEvents: "none",
            }}
          />
        </div>
        {track?.keys.map((k) => (
          <fieldset key={k.id}>
            <legend>Key {k.time.toFixed(3)}s</legend>
            {number(
              "VFX key time",
              k.time,
              (n) =>
                mutateTrack((t) => {
                  t.keys.find((n) => n.id === k.id)!.time = n;
                  t.keys.sort((a, b) => a.time - b.time);
                }),
              0,
              effect.duration,
              0.01,
            )}
            <label>
              Value
              <input
                aria-label="Edit VFX key value"
                type={typeof k.value === "string" ? "color" : "number"}
                value={k.value}
                onChange={(e) =>
                  mutateTrack((t) => {
                    t.keys.find((n) => n.id === k.id)!.value =
                      typeof k.value === "string"
                        ? e.target.value
                        : Number(e.target.value);
                  })
                }
              />
            </label>
            <select
              aria-label="VFX interpolation"
              value={k.interpolation}
              onChange={(e) =>
                mutateTrack((t) => {
                  const key = t.keys.find((n) => n.id === k.id)!;
                  key.interpolation = e.target.value as VFXKey["interpolation"];
                  if (key.interpolation === "bezier")
                    key.handles ??= { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
                })
              }
            >
              {["linear", "stepped", "bezier"].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            {k.interpolation === "bezier" &&
              (["x1", "y1", "x2", "y2"] as const).map((h) =>
                number(
                  "Easing " + h,
                  k.handles?.[h] ?? 0.5,
                  (n) =>
                    mutateTrack((t) => {
                      const key = t.keys.find((n) => n.id === k.id)!;
                      key.handles ??= { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
                      key.handles[h] = n;
                    }),
                  0,
                  1,
                  0.05,
                ),
              )}
            <button
              onClick={() => {
                clipboard.current = {
                  channel: activeChannel,
                  keys: [structuredClone(k)],
                };
              }}
            >
              Copy key
            </button>
            <button
              onClick={() =>
                mutateTrack((t) => {
                  t.keys = t.keys.filter((n) => n.id !== k.id);
                })
              }
            >
              Delete key
            </button>
          </fieldset>
        ))}
        <button
          disabled={!track?.keys.length}
          onClick={() => {
            clipboard.current = {
              channel: activeChannel,
              keys: structuredClone(track!.keys),
            };
          }}
        >
          Copy track keys
        </button>
        <button
          onClick={() => {
            const copied = clipboard.current;
            if (!copied) {
              setError("Copy key trước khi paste");
              return;
            }
            if (copied.channel !== activeChannel) {
              setError("Chọn cùng loại thuộc tính để paste");
              return;
            }
            edit("Paste VFX keys", (e) => {
              const origin = copied.keys[0].time;
              for (const k of copied.keys) {
                const time = now + k.time - origin;
                if (time <= e.duration) {
                  putParameterKey(
                    e,
                    activeTarget.id,
                    activeChannel,
                    time,
                    k.value,
                  );
                  const key = e
                    .tracks!.find(
                      (t) =>
                        t.targetId === activeTarget.id &&
                        t.channel === activeChannel,
                    )!
                    .keys.find((n) => Math.abs(n.time - time) < 1e-7)!;
                  key.interpolation = k.interpolation;
                  if (k.handles) key.handles = structuredClone(k.handles);
                }
              }
            });
          }}
        >
          Paste tại playhead
        </button>
      </details>
      <details>
        <summary>Xuất VFX / nhân vật + VFX</summary>
        {number("Export VFX FPS", fps, (n) => setFps(Math.round(n)), 1, 60, 1)}
        {number(
          "Export frame size",
          dimensions,
          (n) => setDimensions(Math.round(n)),
          64,
          2048,
          1,
        )}
        {number(
          "Export frame height",
          frameHeight,
          (n) => setFrameHeight(Math.round(n)),
          64,
          2048,
          1,
        )}
        {number("Export VFX duration", duration, setDuration, 0.05, 30)}
        <button
          disabled={busy || !animation.activeClipId}
          onClick={() => void exportSheet(true)}
        >
          Xuất VFX spritesheet PNG + JSON
        </button>
        <button
          disabled={busy || !animation.activeClipId}
          onClick={() => void exportSheet(false)}
        >
          Xuất nhân vật + VFX
        </button>
        {busy && <p>Đang render các frame thật…</p>}
        <p>
          PNG nền trong suốt, JSON frame metadata. GIF/MP4 và engine importer
          chưa hỗ trợ.
        </p>
      </details>
      {session.warnings.map((w, i) => (
        <p role="alert" key={i}>
          {w}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
