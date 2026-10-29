import { importRaster } from "../../../packages/exporters/src";
import { useShallow } from "zustand/react/shallow";
import { useVFXSession } from "../../../packages/editor-core/src/vfx-state";
import { importVFXFile } from "./vfx-import";
import { VFXLifeCurves } from "./VFXLifeCurves";
import { VFXAdvanced, VFXLibrary } from "./VFXAdvanced";
import {
  togglePlayback,
  restartAnimation,
  selectAnimation,
} from "../../../packages/editor-core/src/animation-playback";
import { useState, useRef } from "react";
import { useEditor } from "../../../packages/editor-core/src/store";
import { useAnimation } from "../../../packages/editor-core/src/animation-state";
import { boneInView, clipInView } from "../../../packages/document-core/src";
import {
  createParticleEffect,
  duplicateEffect,
  type VFXEffect,
  type Emitter,
} from "../../../packages/vfx-core/src";
export function VFXStudio() {
  const s = useEditor(),
    doc = s.document!,
    a = useAnimation(
      useShallow((s) => ({ activeClipId: s.activeClipId, playing: s.playing })),
    );
  const selection = useVFXSession((s) => s.selectedEffectId);
  const select = (id: string) =>
    useVFXSession.setState({ selectedEffectId: id });
  const effect =
    doc.vfxGraphs.find((e) => e.id === selection) ?? doc.vfxGraphs[0];
  const previewActive = useVFXSession((s) => s.active);
  const [error, setError] = useState("");
  const edit = (label: string, fn: (e: VFXEffect) => void) => {
    if (effect)
      s.command(label, (d) => {
        const e = d.vfxGraphs.find((e) => e.id === effect.id);
        if (e) fn(e);
      });
  };
  const textureInput = useRef<HTMLInputElement>(null);
  const [nodeIndex, setNodeIndex] = useState(0);
  const ni = Math.min(nodeIndex, (effect?.nodes.length ?? 1) - 1);
  const node = effect?.nodes[ni];
  const num = (
    label: string,
    value: number,
    min: number,
    max: number,
    change: (v: number) => void,
    step = 0.1,
  ) => (
    <label style={{ display: "grid", gap: 4, margin: "10px 0" }}>
      {label}
      <input
        title={label + " · Chỉnh để xem kết quả; Ctrl+Z để hoàn tác."}
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber))
            change(Math.max(min, Math.min(max, e.target.valueAsNumber)));
        }}
      />
    </label>
  );
  const change = (key: keyof Emitter, v: unknown) =>
    edit("Chỉnh particle", (e) => {
      Object.assign(e.nodes[ni], { [key]: v });
    });
  const exportJSON = () => {
    if (!effect) return;
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(effect, null, 2)], {
          type: "application/json",
        }),
      ),
      link = document.createElement("a");
    link.href = url;
    link.download = "effect.vfx.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div
      className="inspector-scroll"
      style={{ padding: 14 }}
      data-testid="vfx-studio"
    >
      <h3>VFX Studio</h3>
      {!previewActive && (
        <p>Preview VFX đang dừng. Bấm Phát cùng hoạt ảnh để xem lại.</p>
      )}

      <select
        aria-label="VFX preview animation"
        value={a.activeClipId ?? ""}
        onChange={(e) => selectAnimation(e.target.value)}
      >
        <option value="" disabled>
          Chọn hoạt ảnh để preview
        </option>
        {doc.animationClips
          .filter((c) => clipInView(doc, c.id))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
        <button
          className="secondary-btn"
          disabled={!a.activeClipId}
          onClick={() => {
            useVFXSession.setState({ active: true });
            togglePlayback();
          }}
        >
          {a.playing ? "Tạm dừng VFX" : "Phát cùng hoạt ảnh"}
        </button>
        <button
          className="secondary-btn"
          disabled={!a.activeClipId}
          onClick={() => {
            useVFXSession.setState({ active: true });
            restartAnimation(false);
          }}
        >
          Về đầu
        </button>
        <button
          className="secondary-btn"
          onClick={() => {
            useAnimation.getState().pause();
            useVFXSession.setState({ active: false });
          }}
        >
          Dừng preview VFX
        </button>
      </div>
      <p className="rig-hint">
        VFX procedural chỉnh sửa được. Chọn preset → chọn xương → tua timeline
        hoặc bấm Play. Không phải AI.
      </p>
      <label className="secondary-btn wide" style={{ marginTop: 10 }}>
        Nhập effect JSON
        <input
          aria-label="Import VFX JSON"
          type="file"
          accept=".json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void (async () => {
              try {
                const before = useEditor.getState().document!;
                const bone = before.bones.find(
                  (b) =>
                    boneInView(before, b.id) && /weapon.*socket/i.test(b.name),
                );
                const prepared = await importVFXFile(
                  f,
                  before,
                  s.selectedBoneId ?? bone?.id ?? null,
                );
                if (useEditor.getState().document !== before)
                  throw Error("Dự án đã thay đổi; thử lại");
                const next = prepared.effect;
                if (before.vfxGraphs.length >= 32)
                  throw Error("Tối đa 32 effects");
                s.command("Nhập effect + nguồn", (d) => {
                  d.assetReferences.push(...prepared.assets);
                  d.vfxGraphs.push(next);
                });
                select(next.id);
                setError(prepared.message);
              } catch (err) {
                setError(String(err));
              }
            })();
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {effect && node ? (
        <>
          <p className="rig-hint">
            ◆ Thuộc tính có key:{" "}
            {(effect.tracks ?? [])
              .filter((t) => t.targetId === node.id)
              .map((t) => t.channel)
              .join(", ") || "chưa có"}
          </p>
          {effect.nodes.every((n) => !n.enabled) && !!effect.trails?.length && (
            <VFXAdvanced key={effect.id} effect={effect} edit={edit} />
          )}
          <label>
            Emitter
            <select
              aria-label="VFX emitter"
              value={ni}
              onChange={(e) => setNodeIndex(Number(e.target.value))}
            >
              {effect.nodes.map((n, i) => (
                <option key={n.id} value={i}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={
              effect.nodes.length >= 8 ||
              effect.nodes.reduce((n, e) => n + e.maxParticles, 0) > 1792
            }
            onClick={() =>
              edit("Thêm emitter", (e) => {
                e.nodes.push(
                  createParticleEffect(node.attachment.boneId).nodes[0],
                );
                setNodeIndex(e.nodes.length - 1);
              })
            }
          >
            + Emitter
          </button>
          <button
            disabled={effect.nodes.length <= 1}
            onClick={() => {
              edit("Xóa emitter", (e) => {
                const id=e.nodes[ni].id;e.nodes.splice(ni,1);e.tracks=e.tracks?.filter(t=>t.targetId!==id);
              });
              setNodeIndex(0);
            }}
          >
            Xóa emitter
          </button>
          <label>
            Tên emitter
            <input
              aria-label="VFX emitter name"
              value={node.name}
              maxLength={100}
              onChange={(e) => {
                if (e.target.value.trim()) change("name", e.target.value);
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={node.enabled}
              onChange={(e) => change("enabled", e.target.checked)}
            />{" "}
            Bật emitter
          </label>
          <label>
            Tên hiệu ứng
            <input
              aria-label="VFX name"
              maxLength={100}
              value={effect.name}
              onChange={(e) => {
                if (e.target.value.trim())
                  edit("Đổi tên VFX", (v) => {
                    v.name = e.target.value;
                  });
              }}
            />
          </label>
          <label>
            <input
              aria-label="VFX visible"
              type="checkbox"
              checked={effect.enabled}
              onChange={(e) =>
                edit("Ẩn hiện VFX", (v) => {
                  v.enabled = e.target.checked;
                })
              }
            />{" "}
            Hiển thị hiệu ứng
          </label>
          <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
            <button
              onClick={() => {
                const e = duplicateEffect(effect);
                s.command("Nhân đôi VFX", (d) => {
                  d.vfxGraphs.push(e);
                });
                select(e.id);
              }}
              disabled={doc.vfxGraphs.length >= 32}
            >
              Nhân đôi
            </button>
            <button
              onClick={() =>
                s.command("Xóa VFX", (d) => {
                  d.vfxGraphs = d.vfxGraphs.filter((e) => e.id !== effect.id);
                })
              }
            >
              Xóa
            </button>
            <button onClick={exportJSON}>Xuất JSON</button>
          </div>
          {num("Cường độ VFX", effect.intensity, 0, 4, (v) =>
            edit("Cường độ VFX", (e) => {
              e.intensity = v;
            }),
          )}
          <input
            aria-label="VFX intensity slider"
            type="range"
            min={0}
            max={4}
            step={0.05}
            value={effect.intensity}
            onChange={(e) =>
              edit("VFX intensity", (v) => {
                v.intensity = Number(e.target.value);
              })
            }
          />
          {num("Thời lượng VFX", effect.duration, 0.05, 30, (v) =>
            edit("Thời lượng VFX", (e) => {
              const old = e.duration;
              e.duration = v;
              for (const track of e.tracks ?? [])
                for (const key of track.keys) key.time = (key.time * v) / old;
            }),
          )}
          {num(
            "Random seed",
            effect.seed,
            0,
            4294967295,
            (v) =>
              edit("Seed VFX", (e) => {
                e.seed = v;
              }),
            1,
          )}
          <label>
            <input
              type="checkbox"
              checked={effect.loopMode === "loop"}
              onChange={(e) =>
                edit("Lặp VFX", (v) => {
                  v.loopMode = e.target.checked ? "loop" : "once";
                })
              }
            />{" "}
            Lặp hiệu ứng (reset tại đầu vòng)
          </label>
          <label style={{ display: "grid", marginTop: 12 }}>
            Gắn vào xương
            <select
              aria-label="VFX bone"
              value={node.attachment.boneId ?? ""}
              onChange={(e) =>
                edit("Gắn VFX vào xương", (v) => {
                  v.nodes[ni].attachment.boneId = e.target.value || null;
                })
              }
            >
              <option value="">Gốc tọa độ nhân vật</option>
              {doc.bones
                .filter((b) => boneInView(doc, b.id))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
          {(["x", "y"] as const).map((axis) =>
            num(
              "Offset " + axis,
              node.attachment.offset[axis],
              -10000,
              10000,
              (v) =>
                edit("Offset VFX", (e) => {
                  e.nodes[ni].attachment.offset[axis] = v;
                }),
              1,
            ),
          )}
          <label>
            Không gian
            <select
              aria-label="VFX space"
              value={node.space}
              onChange={(e) => change("space", e.target.value)}
            >
              <option value="local">Local · hạt theo xương</option>
              <option value="world">World · hạt cũ ở lại</option>
            </select>
          </label>
          <label>
            Màu đầu
            <input
              aria-label="VFX color"
              type="color"
              value={node.color}
              onChange={(e) => change("color", e.target.value)}
            />
          </label>
          <label>
            Màu cuối
            <input
              aria-label="VFX end color"
              type="color"
              value={node.endColor}
              onChange={(e) => change("endColor", e.target.value)}
            />
          </label>
          {!(
            effect.nodes.every((n) => !n.enabled) && !!effect.trails?.length
          ) && <VFXAdvanced key={effect.id} effect={effect} edit={edit} />}
          {num(
            "Số hạt mỗi giây",
            node.rate,
            0,
            500,
            (v) => change("rate", v),
            1,
          )}
          {num(
            "Burst đầu đoạn",
            node.burst,
            0,
            512,
            (v) => change("burst", v),
            1,
          )}
          {num("Tuổi thọ hạt", node.lifetime, 0.05, 10, (v) =>
            change("lifetime", v),
          )}
          {num(
            "Vận tốc hạt",
            node.speed,
            0,
            1000,
            (v) => change("speed", v),
            1,
          )}
          {num(
            "Hướng phát (độ)",
            node.rotation,
            -3600,
            3600,
            (v) => change("rotation", v),
            1,
          )}
          {num("Góc tỏa", node.spread, 0, 360, (v) => change("spread", v), 1)}
          {num("Kích thước hạt", node.size, 0.1, 100, (v) => change("size", v))}
          <VFXLifeCurves node={node} index={ni} edit={edit} />
          <details>
            <summary>Nâng cao</summary>
            <label>
              Loại emitter
              <select
                value={node.type}
                onChange={(e) => change("type", e.target.value)}
              >
                <option>ParticleEmitter</option>
                <option disabled={!node.textureId}>SpriteEmitter</option>
              </select>
            </label>
            {num("Gravity",node.gravity??0,-2000,2000,v=>change("gravity",v))}
            {num("Orbit velocity", node.orbitVelocity ?? 0, -720, 720, (v) =>
              change("orbitVelocity", v),
            )}
            {num(
              "Velocity variation",
              node.velocityVariation ?? 0.25,
              0,
              1,
              (v) => change("velocityVariation", v),
            )}
            {num(
              "Lifetime variation",
              node.lifetimeVariation ?? 0,
              0,
              0.9,
              (v) => change("lifetimeVariation", v),
            )}
            {num("Size variation", node.sizeVariation ?? 0, 0, 0.9, (v) =>
              change("sizeVariation", v),
            )}
            <button onClick={() => textureInput.current?.click()}>
              Nhập texture particle
            </button>
            <input
              hidden
              ref={textureInput}
              type="file"
              aria-label="VFX particle texture file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const before = doc,
                  id = node.id,
                  effectId = effect.id;
                void importRaster(f)
                  .then((asset) => {
                    if (useEditor.getState().document !== before)
                      throw Error("Dự án đã thay đổi; thử lại");
                    s.command("Nhập sprite particle texture", (d) => {
                      d.assetReferences.push(asset);
                      const n = d.vfxGraphs
                        .find((e) => e.id === effectId)!
                        .nodes.find((n) => n.id === id)!;
                      n.textureId = asset.id;
                      n.type = "SpriteEmitter";
                    });
                  })
                  .catch((error) => setError(String(error)));
              }}
            />
            <label>
              Texture particle
              <select
                aria-label="VFX texture"
                value={node.textureId ?? ""}
                onChange={(e) =>
                  edit("Particle texture", (v) => {
                    v.nodes[ni].textureId = e.target.value || null;
                    if (!e.target.value) v.nodes[ni].type = "ParticleEmitter";
                  })
                }
              >
                <option value="">Procedural trắng</option>
                {doc.assetReferences.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={node.attachment.followPosition !== false}
                onChange={(e) =>
                  edit("Follow position", (v) => {
                    v.nodes[ni].attachment.followPosition = e.target.checked;
                  })
                }
              />
              Theo vị trí xương
            </label>

            {(["x", "y"] as const).map((axis) =>
              num(
                "Emitter " + axis,
                node.position[axis],
                -10000,
                10000,
                (v) =>
                  edit("Vị trí emitter", (e) => {
                    e.nodes[ni].position[axis] = v;
                  }),
                1,
              ),
            )}
            {num(
              "Attachment rotation",
              node.attachment.rotation,
              -3600,
              3600,
              (v) =>
                edit("Xoay attachment", (e) => {
                  e.nodes[ni].attachment.rotation = v;
                }),
              1,
            )}
            {num("Attachment scale", node.attachment.scale, 0.01, 20, (v) =>
              edit("Scale attachment", (e) => {
                e.nodes[ni].attachment.scale = v;
              }),
            )}
            <label>
              <input
                type="checkbox"
                checked={node.attachment.followRotation}
                onChange={(e) =>
                  edit("Follow rotation", (v) => {
                    v.nodes[ni].attachment.followRotation = e.target.checked;
                  })
                }
              />{" "}
              Theo góc xương
            </label>
            <label>
              <input
                type="checkbox"
                checked={node.attachment.followScale}
                onChange={(e) =>
                  edit("Follow scale", (v) => {
                    v.nodes[ni].attachment.followScale = e.target.checked;
                  })
                }
              />{" "}
              Theo scale xương
            </label>
            {num(
              "Angular velocity",
              node.angularVelocity,
              -3600,
              3600,
              (v) => change("angularVelocity", v),
              1,
            )}
            {num(
              "Giới hạn hạt",
              node.maxParticles,
              1,
              1024,
              (v) =>
                change(
                  "maxParticles",
                  Math.min(
                    v,
                    2048 -
                      effect.nodes.reduce(
                        (sum, n, i) => sum + (i === ni ? 0 : n.maxParticles),
                        0,
                      ),
                  ),
                ),
              1,
            )}
            {num("Drag", node.drag, 0, 20, (v) => change("drag", v))}
            {num("Scale cuối vòng đời", node.endScale, 0, 5, (v) =>
              change("endScale", v),
            )}
            {num(
              "Opacity",
              node.opacity,
              0,
              1,
              (v) => change("opacity", v),
              0.05,
            )}
            {(["x", "y"] as const).map((axis) =>
              num(
                "Gia tốc " + axis,
                node.acceleration[axis],
                -10000,
                10000,
                (v) =>
                  edit("Gia tốc VFX", (e) => {
                    e.nodes[ni].acceleration[axis] = v;
                  }),
                1,
              ),
            )}
            <label>
              Hình phát
              <select
                aria-label="VFX shape"
                value={node.shape}
                onChange={(e) => change("shape", e.target.value)}
              >
                {["point", "circle", "ring", "rectangle", "line", "cone"].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
            </label>
            {num(
              "Bán kính vùng phát",
              node.radius,
              0,
              500,
              (v) => change("radius", v),
              1,
            )}
            <label>
              Blend
              <select
                aria-label="VFX blend"
                value={node.blendMode}
                onChange={(e) => change("blendMode", e.target.value)}
              >
                {["normal", "add", "screen"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <button
              className="secondary-btn wide"
              onClick={() =>
                edit("Reset emitter", (e) => {
                  const original = createParticleEffect(node.attachment.boneId)
                    .nodes[0];
                  e.nodes[ni] = { ...original, id: node.id };
                })
              }
            >
              Reset emitter
            </button>
          </details>
          <hr />
          <p className="rig-hint">
            Dùng cùng timeline hoạt ảnh, đơn vị giây. Đổi animation giữ nguyên
            effect. Event, trail, flipbook và shader có trong các mục mở rộng.
            Xem ở thời điểm lớn hơn 0 để thấy phát hạt liên tục.
          </p>
        </>
      ) : (
        <p className="rig-hint">
          Chưa có hiệu ứng. Tạo particle lửa để bắt đầu; có thể hoàn tác bằng
          Ctrl+Z.
        </p>
      )}
    </div>
  );
}

export function VFXSidebar() {
  const s = useEditor(),
    doc = s.document!,
    selected = useVFXSession((v) => v.selectedEffectId),
    select = (id: string) => useVFXSession.setState({ selectedEffectId: id });
  const add = () => {
    if (doc.vfxGraphs.length >= 32) return;
    const bone = doc.bones.find(
        (b) => boneInView(doc, b.id) && /weapon.*socket/i.test(b.name),
      ),
      e = createParticleEffect(bone?.id ?? null);
    if (!bone) e.nodes[0].attachment.offset = { x: 400, y: 400 };
    s.command("Thêm particle VFX", (d) => {
      d.vfxGraphs.push(e);
    });
    select(e.id);
  };
  return (
    <div
      className="vfx-sidebar"
      style={{ padding: 12, overflowY: "auto", minHeight: 0 }}
    >
      <h3>VFX Studio</h3>
      <p className="rig-hint">
        Chọn preset → chọn animation → Play. Hiệu ứng là dữ liệu procedural có
        thể sửa.
      </p>
      <button
        className="secondary-btn wide"
        onClick={add}
        disabled={doc.vfxGraphs.length >= 32}
      >
        + Tạo particle lửa
      </button>
      {!doc.animationClips.some((c) => clipInView(doc, c.id)) && (
        <button onClick={() => s.createAnimation()}>
          Tạo animation preview
        </button>
      )}
      <h4>Hiệu ứng trong dự án</h4>
      {doc.vfxGraphs.map((e) => (
        <div key={e.id} style={{ display: "flex", gap: 4, margin: "5px 0" }}>
          <input
            type="checkbox"
            aria-label={"Show effect " + e.name}
            checked={e.enabled}
            onChange={(ev) =>
              s.command("Ẩn hiện VFX", (d) => {
                d.vfxGraphs.find((n) => n.id === e.id)!.enabled =
                  ev.target.checked;
              })
            }
          />
          <button
            className="secondary-btn"
            onClick={() => select(e.id)}
            style={{ color: selected === e.id ? "#d5b9ff" : undefined }}
          >
            {e.name}
          </button>
        </div>
      ))}
      <VFXLibrary select={select} />
    </div>
  );
}
