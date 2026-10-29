import { useState } from "react";
import { create } from "zustand";
import { useEditor } from "../../../packages/editor-core/src/store";
import { useAnimation } from "../../../packages/editor-core/src/animation-state";
import {
  clipInView,
  boneInView,
  layerInView,
  activeVariant,
  worldMatrix,
  type CharacterJoint,
  type ProjectDocument,
} from "../../../packages/document-core/src";
import {
  prepareJointEdit,
  registerPart,
  createJointCompletion,
  smoothJointWeights,
} from "../../../packages/mesh-core/src/joint-completion";
import { validateJoints } from "../../../packages/mesh-core/src/joint-validation";
import {
  generateMesh,
  putMesh,
  addVertex,
  maskAt,
} from "../../../packages/mesh-core/src";
import {
  boneMatrices,
  inverse,
  transform,
  setBoneRotation,
  bindLayer,
} from "../../../packages/rig-core/src";
import { clonePose } from "../../../packages/animation-core/src/evaluation";
import { createSideDemo } from "./sideDemo";
export const useJointOverlay = create<{ joints: boolean; depth: boolean }>(
  () => ({ joints: false, depth: false }),
);
export function CharacterPanel({ en }: { en: boolean }) {
  const s = useEditor(),
    doc = s.document!,
    settings = doc.characterSettings,
    overlay = useJointOverlay(),
    [id, setId] = useState(""),
    [busy, setBusy] = useState(false),
    [layerId, setLayerId] = useState(""),
    [lowerId, setLowerId] = useState(""),
    [kind, setKind] = useState<"elbow" | "knee">("elbow");
  const joints = doc.characterJoints.filter((j) =>
      boneInView(doc, j.lowerBoneId),
    ),
    joint =
      joints.find((j) => j.id === id) ??
      joints.find((j) => j.name === "Near Elbow") ??
      joints[0],
    part = doc.characterParts.find((p) => p.layerId === s.selectedId),
    layer = doc.layers.find((l) => l.id === part?.layerId);
  const main = doc.characterParts.find(
      (p) => p.jointId === joint?.id && p.role === "continuous",
    ),
    segmented = doc.characterParts.some(
      (p) => p.jointId === joint?.id && p.role === "upper",
    ),
    canBend = joint && ["elbow", "knee"].includes(joint.kind);
  const command = (label: string, fn: (d: ProjectDocument) => void) =>
    s.command(label, fn);
  const planned = async (
    label: string,
    fn: (d: ProjectDocument) => Promise<ProjectDocument>,
  ) => {
    const original = useEditor.getState().document!;
    setBusy(true);
    try {
      const next = await fn(original);
      if (useEditor.getState().document !== original)
        throw Error("Dự án đã thay đổi, hãy thử lại");
      command(label, (d) => Object.assign(d, next));
    } catch (e) {
      s.setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const view = (characterView: "side_3_4" | "front") => {
    command("Đổi góc hiển thị", (d) => {
      d.characterSettings.characterView = characterView;
    });
    useAnimation.getState().reset();
    s.select(null);
  };
  const editJoint = (
    patch: Parameters<typeof prepareJointEdit>[2],
    repair = false,
  ) =>
    joint &&
    planned(repair ? "Sửa khớp procedural" : "Chỉnh vùng khớp", (d) =>
      prepareJointEdit(d, joint.id, patch, repair),
    );
  const check = () => {
    setBusy(true);
    useAnimation.getState().pause();
    setTimeout(() => {
      try {
        const source = useEditor.getState().document!;
        const report = validateJoints(source);
        report.sourceRevision = source.metadata.revision + 1;
        command("Joint bend sweep", (d) => {
          d.jointValidation = report;
        });
        useJointOverlay.setState({ joints: true });
      } catch (e) {
        s.setError(String(e));
      } finally {
        setBusy(false);
      }
    }, 0);
  };
  const number = (
    label: string,
    value: number,
    change: (n: number) => void,
    min = -10000,
    max = 10000,
  ) => (
    <label key={label} className="rig-number">
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={Number(value.toFixed(3))}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (
            e.target.value !== "" &&
            Number.isFinite(n) &&
            n >= min &&
            n <= max
          )
            change(n);
        }}
      />
    </label>
  );
  return (
    <div className="character-panel">
      <div className="rig-explainer">
        <strong>
          {en ? "Side-scrolling character" : "Nhân vật đi cảnh ngang"}
        </strong>
        <p>
          3/4 nhìn phải · near/far · procedural demo. Không có AI provider.
          Mirror chỉ đổi hiển thị; rig, mesh và keyframe giữ hệ tọa độ gốc.
        </p>
      </div>
      <section className="property-section">
        <div className="section-label">Character Direction</div>
        <div className="character-buttons">
          <button
            aria-label="Side 3/4 view"
            aria-pressed={settings.characterView === "side_3_4"}
            disabled={!doc.characterVariants.some((v) => v.view === "side_3_4")}
            title="Dùng bộ artwork 3/4 đã vẽ riêng; không xoay 3D ảnh chính diện"
            onClick={() => view("side_3_4")}
          >
            Side 3/4
          </button>
          <button disabled title="Full Side cần bộ artwork riêng; chưa hỗ trợ">
            Full Side
          </button>
          <button
            aria-label="Front reference view"
            aria-pressed={settings.characterView === "front"}
            onClick={() => view("front")}
          >
            Front
          </button>
        </div>
        {!doc.characterVariants.length && (
          <button
            className="secondary-btn"
            disabled={busy}
            onClick={() =>
              void planned("Thêm Flame Knight side demo", (d) =>
                createSideDemo(structuredClone(d)),
              )
            }
          >
            Tạo bản side procedural · giữ bản gốc
          </button>
        )}
        <div className="character-buttons">
          {(["left", "right"] as const).map((f) => (
            <button
              key={f}
              aria-label={f === "left" ? "Face Left" : "Face Right"}
              aria-pressed={settings.facing === f}
              title={
                f === "left"
                  ? "Lật ngang quanh Root; không đổi tọa độ mesh/IK"
                  : "Hiển thị nhân vật gốc nhìn phải"
              }
              onClick={() =>
                command("Đổi hướng nhìn", (d) => {
                  d.characterSettings.facing = f;
                })
              }
            >
              {f === "left" ? "← Face Left" : "Face Right →"}
            </button>
          ))}
        </div>
        <label
          className="animation-check"
          title="Lật artwork khi hướng nhìn khác hướng gốc; không đổi animation"
        >
          <input
            type="checkbox"
            aria-label="Mirror Preview"
            checked={settings.mirrorForOppositeDirection}
            onChange={(e) =>
              command("Mirror preview", (d) => {
                d.characterSettings.mirrorForOppositeDirection =
                  e.target.checked;
              })
            }
          />
          Mirror Preview
        </label>
        {number("World position X", settings.worldPosition.x, (x) =>
          command("Di chuyển trong thế giới", (d) => {
            d.characterSettings.worldPosition.x = x;
          }),
        )}
        <p className="rig-hint">
          World X độc lập với chuyển động xương trong clip. Không tạo hướng
          lên/xuống.
        </p>
      </section>
      <section className="property-section">
        <div className="section-label">Joint Completion</div>
        <label
          className="animation-check"
          title="Vòng xanh: khớp; vòng vàng: vùng underlap"
        >
          <input
            type="checkbox"
            aria-label="Show Joint Overlay"
            checked={overlay.joints}
            onChange={(e) =>
              useJointOverlay.setState({ joints: e.target.checked })
            }
          />
          Show Joint Overlay
        </label>
        <label
          className="animation-check"
          title="Cam = near, xanh = far, tím = thân; thứ tự render không đổi khi mirror"
        >
          <input
            type="checkbox"
            aria-label="Show Near/Far Layers"
            checked={overlay.depth}
            onChange={(e) =>
              useJointOverlay.setState({ depth: e.target.checked })
            }
          />
          Show Near/Far Layers
        </label>
        <select
          className="rig-select"
          aria-label="Selected joint"
          value={joint?.id ?? ""}
          onChange={(e) => {
            setId(e.target.value);
            s.selectBone(
              doc.characterJoints.find((j) => j.id === e.target.value)!
                .lowerBoneId,
            );
          }}
        >
          <option value="" disabled>
            Chọn khớp…
          </option>
          {joints.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
        {joint && (
          <>
            <label className="rig-number">
              Joint Deformation Mode
              <select
                aria-label="Joint Deformation Mode"
                value={joint.mode}
                disabled={busy || joint.kind === "weapon"}
                title="Mesh liên tục qua khớp; overlap dùng segment có texture phủ chồng; rigid dành cho giáp/kiếm"
                onChange={(e) =>
                  void editJoint({
                    mode: e.target.value as CharacterJoint["mode"],
                  })
                }
              >
                {["continuous_mesh", "overlap_only", "rigid_segment"].map(
                  (m) => (
                    <option
                      key={m}
                      value={m}
                      disabled={
                        !!canBend && !segmented && m !== "continuous_mesh"
                      }
                    >
                      {m}
                    </option>
                  ),
                )}
              </select>
            </label>
            {canBend && (
              <>
                <div className="rig-grid">
                  {number(
                    "Overlap Size",
                    joint.overlapSize,
                    (n) => void editJoint({ overlapSize: n }),
                    0,
                    48,
                  )}
                  {number(
                    "Underlap Size",
                    joint.underlapSize,
                    (n) => void editJoint({ underlapSize: n }),
                    0,
                    48,
                  )}
                </div>
                <p className="rig-hint">
                  Kích thước mở rộng tính bằng pixel quanh lõi khớp. Patch được
                  lấy màu vùng alpha lân cận, lưu như texture/layer chỉnh sửa
                  được.
                </p>
                <div className="character-buttons">
                  <button
                    disabled={busy}
                    aria-label="Auto Repair"
                    title="Tăng overlap +4px, underlap +6px và smooth weights; không bảo đảm mọi ảnh nhập ngoài"
                    onClick={() => void editJoint({}, true)}
                  >
                    Auto Repair
                  </button>
                  <button
                    disabled={busy || !main}
                    onClick={() => {
                      if (main) {
                        s.select(main.layerId);
                        s.setTool("mesh");
                      }
                    }}
                  >
                    Sửa vertex / weights
                  </button>
                </div>
                <button
                  className="secondary-btn"
                  disabled={busy || !main}
                  aria-label="Increase joint mesh density"
                  onClick={() => {
                    if (!main) return;
                    command("Tăng mật độ mesh khớp", (d) => {
                      const mesh = d.meshes.find(
                        (m) => m.layerId === main.layerId,
                      )!;
                      const j = d.characterJoints.find(
                        (j) => j.id === joint.id,
                      )!;
                      const p = boneMatrices(d, "rest").get(j.lowerBoneId)!,
                        l = d.layers.find((l) => l.id === mesh.layerId)!,
                        local = transform(inverse(worldMatrix(d, l)), {
                          x: p.tx,
                          y: p.ty,
                        }),
                        a = d.assetReferences.find((a) => a.id === l.assetId)!;
                      for (const [x, y] of [
                        [0, 0],
                        [-5, 0],
                        [5, 0],
                        [0, -5],
                        [0, 5],
                      ]) {
                        const u = (local.x + x) / a.width,
                          v = (local.y + y) / a.height;
                        if (
                          mesh.vertices.length < 512 &&
                          maskAt(mesh.alphaMask, u, v) &&
                          !mesh.vertices.some(
                            (p) => Math.hypot(p.u - u, p.v - v) < 0.004,
                          )
                        )
                          addVertex(d, mesh.id, u, v);
                      }
                      smoothJointWeights(d, j);
                      d.jointValidation = null;
                    });
                  }}
                >
                  Tăng mesh density vùng khớp
                </button>
                {main && (
                  <div className="joint-textures">
                    {(["overlap", "underlap"] as const).map((role) => {
                      const p = doc.characterParts.find(
                          (p) => p.jointId === joint.id && p.role === role,
                        ),
                        a = doc.assetReferences.find(
                          (a) => a.id === p?.sourceAssetId,
                        );
                      return a && p ? (
                        <button
                          key={role}
                          title="Chọn layer để thay ảnh, di chuyển, đổi opacity hoặc chỉnh attachment"
                          onClick={() => s.select(p.layerId)}
                        >
                          <img src={a.data} alt={role} />
                          <span>{role} · procedural</span>
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
        <button
          className="secondary-btn"
          aria-label="Run Joint Validation"
          disabled={
            busy || !joints.some((j) => ["elbow", "knee"].includes(j.kind))
          }
          onClick={check}
        >
          {busy ? "Đang xử lý…" : "Run Joint Validation"}
        </button>
        <p className="rig-hint">
          Sweep alpha của khuỷu/gối ở nhiều góc; kiểm tra kéo giãn, tam giác, tự
          cắt và weights. Đây là kiểm tra có lấy mẫu, không phải bảo đảm kín mọi
          ảnh.
        </p>
        {doc.jointValidation && (
          <div
            className="joint-report"
            role="status"
            aria-label="Joint validation report"
          >
            <strong>
              {doc.jointValidation.uncoveredSamples === 0
                ? "Không hở lõi khớp trong sweep"
                : "Phát hiện vùng bị hở"}
            </strong>
            <p>
              {doc.jointValidation.samples} mẫu ·{" "}
              {doc.jointValidation.uncoveredSamples} hở ·{" "}
              {doc.jointValidation.issues.length} cảnh báo{" "}
              {doc.jointValidation.sourceRevision !== doc.metadata.revision
                ? "· cần chạy lại sau chỉnh sửa"
                : ""}
            </p>
            {doc.jointValidation.issues.slice(0, 32).map((issue) => (
              <button
                key={issue.id}
                onClick={() => {
                  const j = doc.characterJoints.find(
                    (j) => j.id === issue.jointId,
                  )!;
                  const preview = clonePose(doc);
                  for (const b of preview.bones)
                    b.pose = { x: 0, y: 0, rotation: 0 };
                  for (const t of preview.ikTargets) t.enabled = false;
                  setBoneRotation(
                    preview.bones.find((b) => b.id === j.upperBoneId)!,
                    j.kind === "elbow" ? -18 : -8,
                  );
                  setBoneRotation(
                    preview.bones.find((b) => b.id === j.lowerBoneId)!,
                    issue.angle,
                  );
                  const clip = doc.animationClips.find((c) =>
                    clipInView(doc, c.id),
                  );
                  s.selectBone(j.lowerBoneId);
                  if (clip)
                    useAnimation.setState({
                      enabled: true,
                      activeClipId: clip.id,
                      playing: false,
                      override: preview,
                      time: 0,
                      displayTime: 0,
                    });
                }}
              >
                <b>
                  {
                    doc.characterJoints.find((j) => j.id === issue.jointId)
                      ?.name
                  }{" "}
                  · {issue.angle}° · {issue.kind}
                </b>
                <span>{issue.message}</span>
                <small>{issue.suggestions.join(" · ")}</small>
              </button>
            ))}
          </div>
        )}
      </section>
      {part && layer && (
        <section className="property-section">
          <div className="section-label">
            {part.semantic} · {part.depth}
          </div>
          <p className="rig-hint">
            Source alpha {part.alphaMask.width}×{part.alphaMask.height}; pivot
            dùng trong transform. Giữ vị trí source khi đổi pivot; đường xoay sẽ
            thay đổi.
          </p>
          <div className="rig-grid">
            {(["X", "Y"] as const).map((axis) =>
              number(
                "Part pivot " + axis,
                axis === "X" ? (layer.pivotX ?? 0) : (layer.pivotY ?? 0),
                (n) =>
                  command("Đổi pivot layer", (d) => {
                    const l = d.layers.find((l) => l.id === layer.id)!,
                      dx = axis === "X" ? n - (l.pivotX ?? 0) : 0,
                      dy = axis === "Y" ? n - (l.pivotY ?? 0) : 0,
                      r = (l.rotation * Math.PI) / 180,
                      x =
                        Math.cos(r) * l.scaleX * dx -
                        Math.sin(r) * l.scaleY * dy,
                      y =
                        Math.sin(r) * l.scaleX * dx +
                        Math.cos(r) * l.scaleY * dy;
                    l.x += x;
                    l.y += y;
                    if (axis === "X") l.pivotX = n;
                    else l.pivotY = n;
                    for (const c of d.animationClips) {
                      const b = c.baseState.layerStates.find(
                        (p) => p.layerId === l.id,
                      );
                      if (b) {
                        b.x += x;
                        b.y += y;
                      }
                    }
                  }),
                -4096,
                4096,
              ),
            )}
          </div>
          <select
            className="rig-select"
            aria-label="Part mirror policy"
            value={part.mirrorPolicy}
            disabled={!!part.meshId}
            onChange={(e) =>
              command("Mirror exception", (d) => {
                d.characterParts.find((p) => p.id === part.id)!.mirrorPolicy = e
                  .target.value as "mirror" | "keep_texture";
              })
            }
          >
            <option value="mirror">Mirror cả texture</option>
            <option value="keep_texture">
              Giữ chiều texture (text/phụ kiện cứng)
            </option>
            {part.mirrorPolicy === "directional" && (
              <option value="directional">Artwork trái riêng</option>
            )}
          </select>
          {!part.meshId && (
            <select
              className="rig-select"
              aria-label="Left directional texture"
              value={part.leftAssetId ?? ""}
              onChange={(e) =>
                command("Directional artwork", (d) => {
                  const p = d.characterParts.find((p) => p.id === part.id)!;
                  p.leftAssetId = e.target.value || null;
                  p.mirrorPolicy = e.target.value ? "directional" : "mirror";
                })
              }
            >
              <option value="">Dùng mirror (không có ảnh trái riêng)</option>
              {doc.assetReferences
                .filter(
                  (a) =>
                    a.width ===
                      doc.assetReferences.find(
                        (a) => a.id === part.sourceAssetId,
                      )!.width &&
                    a.height ===
                      doc.assetReferences.find(
                        (a) => a.id === part.sourceAssetId,
                      )!.height,
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          )}
        </section>
      )}
      <details className="property-section">
        <summary>Gắn khớp cho layer nhập ngoài</summary>
        <p className="rig-hint">
          Chọn một layer nguyên vẹn bắc qua khớp và xương lower có parent. Không
          tự cắt ảnh theo hình chữ nhật. Ảnh phải có alpha đặc quanh vị trí
          khớp.
        </p>
        <select
          className="rig-select"
          aria-label="Joint source layer"
          value={layerId}
          onChange={(e) => setLayerId(e.target.value)}
        >
          <option value="">Layer…</option>
          {doc.layers
            .filter(
              (l) =>
                layerInView(doc, l.id) &&
                !doc.characterParts.some(
                  (p) => p.layerId === l.id && p.jointId,
                ),
            )
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
        <select
          className="rig-select"
          aria-label="Joint lower bone"
          value={lowerId}
          onChange={(e) => setLowerId(e.target.value)}
        >
          <option value="">Lower bone…</option>
          {doc.bones
            .filter((b) => b.parentId && boneInView(doc, b.id))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
        <select
          className="rig-select"
          aria-label="Joint anatomy"
          value={kind}
          onChange={(e) => setKind(e.target.value as "elbow" | "knee")}
        >
          <option value="elbow">Elbow</option>
          <option value="knee">Knee</option>
        </select>
        <button
          className="secondary-btn"
          disabled={busy || !layerId || !lowerId}
          onClick={() =>
            void planned("Tạo joint completion procedural", async (source) => {
              const d = structuredClone(source),
                lower = d.bones.find((b) => b.id === lowerId)!,
                j: CharacterJoint = {
                  id: crypto.randomUUID(),
                  name: lower.name + " joint",
                  kind,
                  upperBoneId: lower.parentId!,
                  lowerBoneId: lower.id,
                  layerIds: [layerId],
                  mode: "continuous_mesh",
                  overlapSize: 8,
                  underlapSize: 10,
                  radius: 18,
                  completion: "procedural_neighbor_fill_v1",
                };
              d.characterJoints.push(j);
              let p = d.characterParts.find((p) => p.layerId === layerId);
              if (!p) p = await registerPart(d, layerId, kind, "center");
              p.jointId = j.id;
              p.role = "continuous";
              bindLayer(d, layerId, j.upperBoneId);
              if (!d.meshes.some((m) => m.layerId === layerId))
                putMesh(d, await generateMesh(d, layerId));
              smoothJointWeights(d, j);
              await createJointCompletion(d, j);
              const v = activeVariant(d);
              if (v)
                for (const id of j.layerIds)
                  if (!v.layerIds.includes(id)) v.layerIds.push(id);
              return d;
            })
          }
        >
          Tạo continuous joint + underlap
        </button>
      </details>
    </div>
  );
}
