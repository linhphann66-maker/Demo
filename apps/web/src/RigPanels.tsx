import { boneInView } from "../../../packages/document-core/src/character";
import { useEditingDocument } from "./useEditingDocument";
import { useAnimation } from "../../../packages/editor-core/src/animation-state";
import { useState, useRef } from "react";
import {
  Bone,
  Plus,
  Trash2,
  WandSparkles,
  RotateCcw,
  Eye,
  EyeOff,
  Network,
  Upload,
  ChevronRight,
  Link2,
} from "lucide-react";
import { useEditor } from "../../../packages/editor-core/src/store";
import {
  generateMesh,
  putMesh,
  autoWeights,
  resetMesh,
  addVertex,
  removeVertex,
  setVertexWeight,
} from "../../../packages/mesh-core/src";
import {
  boneMatrices,
  transform,
  deformationWarnings,
  solveTwoBone,
} from "../../../packages/rig-core/src";
import { importRaster } from "../../../packages/exporters/src";
import type { Bone as BoneRecord } from "../../../packages/document-core/src";
function Field({
  label,
  value,
  onChange,
  min = -10000,
  max = 10000,
  step = 0.1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="rig-number">
      <span>{label}</span>
      <input
        aria-label={label}
        disabled={disabled}
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(value.toFixed(4))}
        onChange={(e) => {
          if (e.target.value !== "") {
            const value = Number(e.target.value);
            if (Number.isFinite(value) && value >= min && value <= max)
              onChange(value);
          }
        }}
      />
    </label>
  );
}
export function RigToolbar({ en }: { en: boolean }) {
  const s = useEditor();
  const doc = useEditingDocument();
  const [busy, setBusy] = useState(false);
  return (
    <div className="rig-toolbar">
      <button
        className="auto-rig-btn"
        aria-label="Auto Rig"
        disabled={
          busy ||
          doc.bones.some((b) => boneInView(doc, b.id)) ||
          doc.characterSettings.characterView === "side_3_4"
        }
        title={
          en
            ? "Procedural humanoid template · not AI"
            : "Template humanoid thủ tục · không phải AI"
        }
        onClick={() => {
          setBusy(true);
          void s.autoRig().finally(() => setBusy(false));
        }}
      >
        <WandSparkles size={14} />
        {busy ? (en ? "Building rig…" : "Đang tạo rig…") : "Auto Rig"}
        <small>PROCEDURAL</small>
      </button>
      <div className="pose-switch">
        <button
          className={doc.rigSettings.mode === "rest" ? "chosen" : ""}
          aria-pressed={doc.rigSettings.mode === "rest"}
          onClick={() => s.setRigMode("rest")}
        >
          Rest Pose
        </button>
        <button
          className={doc.rigSettings.mode === "pose" ? "chosen" : ""}
          aria-pressed={doc.rigSettings.mode === "pose"}
          onClick={() => s.setRigMode("pose")}
        >
          Pose Mode
        </button>
      </div>
      <button
        aria-label="Reset Pose"
        title="Reset Pose"
        onClick={s.resetPose}
        disabled={!doc.bones.some((b) => boneInView(doc, b.id))}
      >
        <RotateCcw size={14} />
      </button>
      <button
        aria-label={en ? "Show/Hide Bones" : "Hiện/ẩn xương"}
        title={en ? "Show/Hide Bones" : "Hiện/ẩn xương"}
        aria-pressed={s.showBones}
        onClick={s.toggleBones}
      >
        <Bone size={14} />
        {s.showBones ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      <button
        aria-label={en ? "Show/Hide Mesh" : "Hiện/ẩn mesh"}
        title={en ? "Show/Hide Mesh" : "Hiện/ẩn mesh"}
        aria-pressed={s.showMesh}
        onClick={s.toggleMesh}
      >
        <Network size={14} />
        {s.showMesh ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
    </div>
  );
}
export function SkeletonHierarchy({ en }: { en: boolean }) {
  const s = useEditor();
  const doc = s.document!;
  const depth = (b: BoneRecord): number =>
    b.parentId ? 1 + depth(doc.bones.find((p) => p.id === b.parentId)!) : 0;
  const ordered: BoneRecord[] = [];
  const visit = (parentId: string | null) => {
    for (const b of doc.bones.filter(
      (b) => b.parentId === parentId && boneInView(doc, b.id),
    )) {
      ordered.push(b);
      visit(b.id);
    }
  };
  visit(null);
  return (
    <div className="skeleton-panel">
      <div className="rig-explainer">
        <strong>{en ? "A rig you can edit" : "Bộ xương bạn kiểm soát"}</strong>
        <p>
          {en
            ? "Rest Pose places joints. Pose Mode moves the character. Cyan rings are IK handles."
            : "Rest Pose đặt khớp. Pose Mode chuyển động nhân vật. Vòng xanh là tay nắm IK."}
        </p>
      </div>
      <div className="skeleton-actions">
        <button className="secondary-btn" onClick={s.addBone}>
          <Plus size={13} />
          {en ? "Add bone" : "Thêm xương"}
        </button>
        <span>
          {ordered.length} {en ? "bones" : "xương"}
        </span>
      </div>
      {!ordered.length && (
        <p className="rig-hint">
          {en
            ? "Use Auto Rig above the canvas, or add your first bone."
            : "Chọn Auto Rig phía trên canvas hoặc thêm xương đầu tiên."}
        </p>
      )}
      <div className="bone-list" aria-label="Skeleton hierarchy">
        {ordered.map((b) => (
          <button
            key={b.id}
            data-testid={"bone-" + b.name}
            className={`bone-row ${s.selectedBoneId === b.id ? "selected" : ""}`}
            style={{ paddingLeft: 12 + depth(b) * 10 }}
            onClick={() => s.selectBone(b.id)}
          >
            <Bone size={12} />
            <span>{b.name}</span>
            {doc.ikTargets.some((t) => t.endBoneId === b.id) && (
              <small>IK</small>
            )}
            {doc.equipmentSlots.some((t) => t.boneId === b.id) && (
              <small>SOCKET</small>
            )}
          </button>
        ))}
      </div>
      <p className="rig-hint">
        {en
          ? "Auto Rig is a deterministic template, not an AI result. Adjust its landmarks to your artwork."
          : "Auto Rig là template xác định, không phải kết quả AI. Hãy chỉnh khớp cho khớp ảnh của bạn."}
      </p>
    </div>
  );
}
export function BoneInspector({ en }: { en: boolean }) {
  const s = useEditor(),
    doc = useEditingDocument();
  const bone = doc.bones.find((b) => b.id === s.selectedBoneId);
  if (!bone)
    return (
      <div className="empty-inspector">
        <Bone size={28} />
        <h3>{en ? "Choose a bone" : "Chọn một xương"}</h3>
        <p>
          {en
            ? "Select a joint on the canvas or open the skeleton hierarchy."
            : "Chọn khớp trên canvas hoặc mở danh sách bộ xương."}
        </p>
        <button className="secondary-btn" onClick={s.addBone}>
          {en ? "Add bone" : "Thêm xương"}
        </button>
      </div>
    );
  const mid = doc.bones.find((b) => b.id === bone.parentId);
  const canIK =
    !!mid?.parentId &&
    Math.hypot(bone.rest.x, bone.rest.y) > 1e-5 &&
    Math.hypot(mid.rest.x, mid.rest.y) > 1e-5 &&
    Math.hypot(bone.rest.x + bone.pose.x, bone.rest.y + bone.pose.y) > 1e-5 &&
    Math.hypot(mid.rest.x + mid.pose.x, mid.rest.y + mid.pose.y) > 1e-5;
  const mode = doc.rigSettings.mode;
  const data = mode === "rest" ? bone.rest : bone.pose;
  const update = (
    key: "x" | "y" | "rotation" | "scaleX" | "scaleY",
    value: number,
  ) =>
    s.updateBone(bone.id, {
      [mode === "rest" ? "rest" : "pose"]: { ...data, [key]: value },
    });
  const target = doc.ikTargets.find((t) => t.endBoneId === bone.id);
  const matrices = boneMatrices(doc);
  const world = transform(matrices.get(bone.id)!, { x: 0, y: 0 });
  const error = target?.enabled
    ? Math.hypot(world.x - target.x, world.y - target.y)
    : 0;
  return (
    <div className="inspector-scroll rig-inspector">
      <div className="rig-selected">
        <Bone size={19} />
        <div>
          <strong>{bone.name}</strong>
          <span>{mode === "rest" ? "REST · BIND POSE" : "POSE · FK / IK"}</span>
        </div>
      </div>
      <section className="property-section">
        <label className="field-label">
          {en ? "Bone name" : "Tên xương"}
          <input
            aria-label="Bone name"
            value={bone.name}
            maxLength={100}
            onChange={(e) => {
              if (e.target.value.trim())
                s.updateBone(bone.id, { name: e.target.value });
            }}
          />
        </label>
        <div className="numeric-grid">
          <Field
            label="Bone X"
            value={data.x}
            onChange={(v) => update("x", v)}
          />
          <Field
            label="Bone Y"
            value={data.y}
            onChange={(v) => update("y", v)}
          />
        </div>
        <Field
          label="Bone rotation"
          value={data.rotation}
          min={mode === "rest" ? -3600 : bone.constraints.minRotation}
          max={mode === "rest" ? 3600 : bone.constraints.maxRotation}
          onChange={(v) => update("rotation", v)}
        />
        <div className="numeric-grid">
          <Field
            label="Bone Scale X"
            min={0.05}
            max={10}
            value={data.scaleX ?? 1}
            onChange={(v) => update("scaleX", v)}
          />
          <Field
            label="Bone Scale Y"
            min={0.05}
            max={10}
            value={data.scaleY ?? 1}
            onChange={(v) => update("scaleY", v)}
          />
        </div>
        {useEditor
          .getState()
          .document?.keyframeTracks.some(
            (t) =>
              t.clipId === useAnimation.getState().activeClipId &&
              t.targetId === bone.id,
          ) && (
          <p className="rig-hint animated-property">
            ◆{" "}
            {en
              ? "Animated properties · use Auto Key or Pose key"
              : "Thuộc tính có key · dùng Auto Key hoặc Ghi pose"}
          </p>
        )}
        <Field
          label="Bone length"
          value={bone.length}
          min={1}
          max={5000}
          onChange={(length) => s.updateBone(bone.id, { length })}
        />
        <p className="rig-hint">
          {mode === "rest"
            ? en
              ? "Rest edits reposition the bind joints without moving artwork."
              : "Chỉnh rest để đặt khớp; ảnh gốc giữ nguyên vị trí."
            : en
              ? "Pose values are offsets from rest. Drag the tip for FK, or cyan hands/feet for IK."
              : "Pose là độ lệch so với rest. Kéo đầu xương để xoay FK, kéo vòng xanh tay/chân để IK."}
        </p>
        <label className="field-label">
          {en ? "Bone parent" : "Xương cha"}
          <select
            aria-label="Bone parent"
            value={bone.parentId ?? ""}
            onChange={(e) =>
              s.updateBone(bone.id, { parentId: e.target.value || null })
            }
          >
            <option value="">Root</option>
            {doc.bones
              .filter(
                (b) => b.id !== bone.id && b.skeletonId === bone.skeletonId,
              )
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
        <p className="rig-hint">
          {en
            ? "Reparenting preserves world placement and removes incompatible IK chains."
            : "Đổi cha giữ vị trí thế giới và bỏ chuỗi IK không còn hợp lệ."}
        </p>
      </section>
      <section className="property-section">
        <div className="property-heading">
          {en ? "Joint rotation limits (pose)" : "Giới hạn góc khớp (pose)"}
        </div>
        <div className="numeric-grid">
          <Field
            label="Min rotation"
            min={-180}
            max={180}
            value={bone.constraints.minRotation}
            onChange={(value) =>
              s.updateBone(bone.id, {
                constraints: { ...bone.constraints, minRotation: value },
              })
            }
          />
          <Field
            label="Max rotation"
            min={-180}
            max={180}
            value={bone.constraints.maxRotation}
            onChange={(value) =>
              s.updateBone(bone.id, {
                constraints: { ...bone.constraints, maxRotation: value },
              })
            }
          />
        </div>
        <p className="rig-hint">
          World: {world.x.toFixed(1)}, {world.y.toFixed(1)}
        </p>
      </section>
      <section className="property-section">
        <div className="property-heading">Two-bone IK</div>
        {target ? (
          <>
            <div className="numeric-grid">
              <Field
                label="IK target X"
                value={target.enabled ? target.x : world.x}
                onChange={(x) =>
                  s.solveIK(target.id, x, target.enabled ? target.y : world.y)
                }
              />
              <Field
                label="IK target Y"
                value={target.enabled ? target.y : world.y}
                onChange={(y) =>
                  s.solveIK(target.id, target.enabled ? target.x : world.x, y)
                }
              />
            </div>
            <Field
              label="IK Blend"
              min={0}
              max={1}
              step={0.05}
              value={target.blend ?? 1}
              disabled={!useAnimation.getState().enabled}
              onChange={(value) =>
                s.editMotion(
                  "IK blend",
                  (d) => {
                    const t = d.ikTargets.find((t) => t.id === target.id)!;
                    t.blend = value;
                    t.enabled = true;
                  },
                  "ik",
                )
              }
            />
            <label className="field-label">
              {en ? "Bend direction" : "Hướng gập"}
              <select
                aria-label="IK bend"
                value={target.bend}
                onChange={(e) =>
                  s.command("IK bend", (d) => {
                    d.ikTargets.find((t) => t.id === target.id)!.bend = Number(
                      e.target.value,
                    ) as -1 | 1;
                    if (target.enabled)
                      solveTwoBone(d, target.id, { x: target.x, y: target.y });
                  })
                }
              >
                <option value="1">+</option>
                <option value="-1">−</option>
              </select>
            </label>
            <p className={error > 1 ? "rig-warning" : "rig-hint"}>
              {en ? "Target error" : "Sai lệch đích"}: {error.toFixed(2)} px.{" "}
              {en
                ? "Unreachable targets clamp to chain length and joint limits."
                : "Đích ngoài tầm bị giới hạn theo độ dài và góc khớp."}
            </p>
          </>
        ) : (
          <button
            className="secondary-btn wide"
            disabled={!canIK}
            onClick={() =>
              s.command("Tạo chuỗi IK", (d) => {
                const mid = d.bones.find((b) => b.id === bone.parentId)!;
                d.ikTargets.push({
                  id: crypto.randomUUID(),
                  rootBoneId: mid.parentId!,
                  midBoneId: mid.id,
                  endBoneId: bone.id,
                  ...world,
                  bend: 1,
                  enabled: false,
                });
              })
            }
          >
            {en ? "Use this joint as IK effector" : "Dùng khớp này làm đích IK"}
          </button>
        )}
      </section>
      <section className="property-section">
        <div className="property-heading">
          {en ? "Attached layers" : "Layer đã gắn"}
        </div>
        {doc.attachments
          .filter((a) => a.boneId === bone.id)
          .map((a) => (
            <button
              className="rig-attached-link"
              key={a.id}
              onClick={() => {
                s.select(a.layerId);
                s.setTool("select");
              }}
            >
              <Link2 size={12} />
              {doc.layers.find((l) => l.id === a.layerId)?.name}
              <ChevronRight size={12} />
            </button>
          ))}
        <div className="order-buttons">
          <button className="secondary-btn" onClick={s.addBone}>
            <Plus size={13} />
            {en ? "Child bone" : "Xương con"}
          </button>
          <button
            className="secondary-btn"
            onClick={() => s.removeBone(bone.id)}
          >
            <Trash2 size={13} />
            {en ? "Delete" : "Xóa"}
          </button>
        </div>
      </section>
    </div>
  );
}
export function LayerRigProperties({ en }: { en: boolean }) {
  const s = useEditor(),
    doc = s.document!;
  const layer = doc.layers.find((l) => l.id === s.selectedId)!;
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (!layer) return null;
  const binding = doc.attachments.find((a) => a.layerId === layer.id);
  return (
    <section className="property-section">
      <div className="property-heading">
        <span>
          <Bone size={13} />
          {en ? "Bone attachment" : "Gắn vào xương"}
        </span>
      </div>
      <select
        className="rig-select"
        aria-label="Layer bone"
        disabled={layer.locked}
        value={binding?.boneId ?? ""}
        onChange={(e) => s.bindLayer(layer.id, e.target.value || null)}
      >
        <option value="">{en ? "Not attached" : "Chưa gắn"}</option>
        {doc.bones
          .filter((b) => boneInView(doc, b.id))
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
      </select>
      <p className="rig-hint">
        {en
          ? "Rigid layers follow this bone. Weighted meshes use their own bone influences."
          : "Layer cứng đi theo xương này. Mesh có weights dùng các ảnh hưởng riêng."}
      </p>
      <button
        className="secondary-btn wide"
        disabled={layer.locked || busy}
        onClick={() => file.current?.click()}
      >
        <Upload size={13} />
        {busy
          ? en
            ? "Replacing…"
            : "Đang thay…"
          : en
            ? "Replace source image"
            : "Thay ảnh nguồn"}
      </button>
      <input
        ref={file}
        aria-label="Replace layer image"
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            setBusy(true);
            void importRaster(f)
              .then((a) => s.replaceAsset(layer.id, a))
              .catch((e) => s.setError(String(e)))
              .finally(() => setBusy(false));
          }
        }}
      />
      <p className="rig-hint">
        {en
          ? "Preserves rig and socket. Only this layer’s mesh is rebuilt, if present."
          : "Giữ rig và socket. Chỉ tạo lại mesh của layer này nếu có."}
      </p>
    </section>
  );
}
export function MeshInspector({ en }: { en: boolean }) {
  const s = useEditor(),
    doc = useEditingDocument();
  const layer = doc.layers.find((l) => l.id === s.selectedId);
  const mesh = doc.meshes.find((m) => m.layerId === layer?.id);
  const [busy, setBusy] = useState(false);
  if (!layer)
    return (
      <div className="empty-inspector">
        <Network size={28} />
        <h3>{en ? "Choose a layer" : "Chọn layer trước"}</h3>
        <p>
          {en
            ? "Select artwork in Layers, then use Mesh Tool."
            : "Chọn ảnh trong danh sách Lớp, rồi dùng Mesh Tool."}
        </p>
      </div>
    );
  const vertex = mesh?.vertices.find((v) => v.id === s.selectedVertexId);
  const weightBone = mesh?.boneIds.includes(s.selectedBoneId ?? "")
    ? s.selectedBoneId
    : mesh?.boneIds[0];
  const weights = doc.vertexWeights.find(
    (w) => w.meshId === mesh?.id && w.vertexId === vertex?.id,
  );
  const warning = mesh ? deformationWarnings(doc, mesh) : 0;
  return (
    <div className="inspector-scroll rig-inspector">
      <div className="rig-selected">
        <Network size={19} />
        <div>
          <strong>{layer.name}</strong>
          <span>
            {s.tool === "weight"
              ? "WEIGHT TOOL · NORMALIZED"
              : "EDITABLE ALPHA MESH"}
          </span>
        </div>
      </div>
      <section className="property-section">
        <button
          className="secondary-btn wide"
          disabled={busy || layer.locked || !!mesh}
          onClick={() => {
            const original = doc;
            setBusy(true);
            void generateMesh(doc, layer.id)
              .then((m) => {
                if (useEditor.getState().document !== original)
                  throw Error("Dự án đã thay đổi. Hãy tạo mesh lại.");
                s.command("Tạo mesh từ alpha", (d) => {
                  putMesh(d, m);
                  const attachment = d.attachments.find(
                    (a) => a.layerId === layer.id,
                  );
                  if (attachment)
                    autoWeights(d, d.meshes.find((x) => x.id === m.id)!, [
                      attachment.boneId,
                    ]);
                });
              })
              .catch((e) => s.setError(String(e)))
              .finally(() => setBusy(false));
          }}
        >
          <Network size={13} />
          {busy
            ? en
              ? "Building…"
              : "Đang tạo…"
            : en
              ? "Create mesh from alpha"
              : "Tạo mesh từ alpha"}
        </button>
        <p className="rig-hint">
          {en
            ? "Sampled alpha at up to 64×64. Thin details may need denser artwork or manual correction."
            : "Alpha lấy mẫu tối đa 64×64. Chi tiết mảnh có thể cần ảnh rõ hơn hoặc chỉnh thủ công."}
        </p>
        {mesh && (
          <>
            <div className="mesh-stats">
              <span>{mesh.vertices.length} vertices</span>
              <span>{mesh.triangles.length / 3} triangles</span>
            </div>
            <div className="order-buttons">
              <button
                className="secondary-btn"
                disabled={layer.locked}
                onClick={() =>
                  useAnimation.getState().enabled
                    ? s.editMotion(
                        "Reset deformation",
                        (d) => {
                          const m = d.meshes.find((m) => m.id === mesh.id)!,
                            base = useEditor
                              .getState()
                              .document!.meshes.find((m) => m.id === mesh.id)!;
                          for (const v of m.vertices) {
                            const p = base.vertices.find((p) => p.id === v.id)!;
                            v.x = p.x;
                            v.y = p.y;
                          }
                        },
                        "mesh",
                      )
                    : s.command("Reset mesh", (d) => resetMesh(d, mesh.id))
                }
              >
                {en ? "Reset mesh" : "Đặt lại mesh"}
              </button>
              <button
                className="secondary-btn"
                disabled={layer.locked}
                onClick={() =>
                  s.command("Xóa mesh", (d) => {
                    d.meshes = d.meshes.filter((m) => m.id !== mesh.id);
                    d.vertexWeights = d.vertexWeights.filter(
                      (w) => w.meshId !== mesh.id,
                    );
                  })
                }
              >
                {en ? "Remove mesh" : "Xóa mesh"}
              </button>
            </div>
            <p className={warning ? "rig-warning" : "rig-ok"}>
              {warning
                ? `${warning} ${en ? "folded/collapsed triangles. Reduce pose or adjust weights." : "tam giác lật/suy biến. Giảm góc pose hoặc chỉnh weights."}`
                : en
                  ? "No folded triangles detected."
                  : "Không phát hiện tam giác lật."}
            </p>
          </>
        )}
      </section>
      {mesh && (
        <>
          <section className="property-section">
            <div className="property-heading">
              {en
                ? "Vertices · select a dot on canvas"
                : "Vertices · chọn chấm trên canvas"}
            </div>
            <select
              className="rig-select"
              aria-label="Mesh vertex"
              value={vertex?.id ?? ""}
              onChange={(e) => s.selectVertex(e.target.value || null)}
            >
              <option value="">{en ? "Choose vertex" : "Chọn vertex"}</option>
              {mesh.vertices.map((v, i) => (
                <option value={v.id} key={v.id}>
                  #{i} · {v.x.toFixed(1)}, {v.y.toFixed(1)}
                </option>
              ))}
            </select>
            {vertex && (
              <>
                <fieldset disabled={layer.locked}>
                  <div className="numeric-grid">
                    <Field
                      label="Vertex X"
                      value={vertex.x}
                      onChange={(x) =>
                        s.editMotion(
                          "Vertex X",
                          (d) => {
                            d.meshes
                              .find((m) => m.id === mesh.id)!
                              .vertices.find((v) => v.id === vertex.id)!.x = x;
                          },
                          "mesh",
                        )
                      }
                    />
                    <Field
                      label="Vertex Y"
                      value={vertex.y}
                      onChange={(y) =>
                        s.editMotion(
                          "Vertex Y",
                          (d) => {
                            d.meshes
                              .find((m) => m.id === mesh.id)!
                              .vertices.find((v) => v.id === vertex.id)!.y = y;
                          },
                          "mesh",
                        )
                      }
                    />
                  </div>
                </fieldset>
                <p className="rig-hint">
                  UV {vertex.u.toFixed(4)}, {vertex.v.toFixed(4)}
                </p>
              </>
            )}
            <div className="order-buttons">
              <button
                className="secondary-btn"
                aria-label="Add vertex"
                disabled={layer.locked || mesh.vertices.length >= 512}
                onClick={() =>
                  s.command("Thêm vertex", (d) => {
                    const m = d.meshes.find((m) => m.id === mesh.id)!;
                    const chosen = vertex
                      ? m.triangles.findIndex(
                          (i) => m.vertices[i].id === vertex.id,
                        )
                      : -1;
                    const offset = chosen < 0 ? 0 : Math.floor(chosen / 3) * 3;
                    const tri = m.triangles
                      .slice(offset, offset + 3)
                      .map((i) => m.vertices[i]);
                    addVertex(
                      d,
                      m.id,
                      tri.reduce((a, v) => a + v.u, 0) / 3,
                      tri.reduce((a, v) => a + v.v, 0) / 3,
                    );
                  })
                }
              >
                <Plus size={12} />
                {en ? "Add vertex" : "Thêm điểm"}
              </button>
              <button
                className="secondary-btn"
                aria-label="Delete vertex"
                disabled={!vertex || layer.locked || mesh.vertices.length <= 3}
                onClick={() => {
                  s.command("Xóa vertex", (d) =>
                    removeVertex(d, mesh.id, vertex!.id),
                  );
                  s.selectVertex(null);
                }}
              >
                <Trash2 size={12} />
                {en ? "Delete" : "Xóa"}
              </button>
            </div>
            <p className="rig-hint">
              {en
                ? "Adding splits a nearby source triangle. Invalid or inverted edits roll back safely."
                : "Thêm điểm trong tam giác nguồn gần nhất. Chỉnh sửa gây lật/suy biến sẽ bị từ chối."}
            </p>
          </section>
          <section className="property-section">
            <div className="property-heading">
              {en ? "Mesh bones" : "Xương ảnh hưởng mesh"}
            </div>
            <p className="rig-hint">
              {en
                ? "Changing this list recalculates all mesh weights. Up to 4 influences per vertex."
                : "Đổi danh sách sẽ tính lại toàn bộ weights mesh. Tối đa 4 ảnh hưởng mỗi vertex."}
            </p>
            <div className="mesh-bones">
              {doc.bones
                .filter((b) => boneInView(doc, b.id))
                .map((b) => (
                  <label key={b.id}>
                    <input
                      type="checkbox"
                      aria-label={"Bind " + b.name}
                      checked={mesh.boneIds.includes(b.id)}
                      disabled={layer.locked}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        s.command("Gắn xương mesh", (d) => {
                          const m = d.meshes.find((x) => x.id === mesh.id)!;
                          autoWeights(
                            d,
                            m,
                            checked
                              ? [...m.boneIds, b.id]
                              : m.boneIds.filter((id) => id !== b.id),
                          );
                        });
                      }}
                    />
                    {b.name}
                  </label>
                ))}
            </div>
            {!doc.bones.length && (
              <p className="rig-hint">
                {en
                  ? "Create a rig to enable skinning."
                  : "Tạo bộ xương để dùng skinning."}
              </p>
            )}
          </section>
          <section className="property-section">
            <div className="property-heading">
              {en ? "Manual bone weights" : "Trọng số thủ công"}
            </div>
            <select
              className="rig-select"
              aria-label="Weight bone"
              value={weightBone ?? ""}
              onChange={(e) =>
                useEditor.setState({ selectedBoneId: e.target.value })
              }
            >
              <option value="" disabled>
                {en ? "Choose bone" : "Chọn xương"}
              </option>
              {mesh.boneIds.map((id) => (
                <option value={id} key={id}>
                  {doc.bones.find((b) => b.id === id)?.name}
                </option>
              ))}
            </select>
            {vertex && weightBone ? (
              <>
                <Field
                  label="Bone weight"
                  disabled={layer.locked}
                  min={0}
                  max={1}
                  step={0.05}
                  value={
                    weights?.influences.find((i) => i.boneId === weightBone)
                      ?.weight ?? 0
                  }
                  onChange={(value) => {
                    if (!layer.locked)
                      s.command("Bone weight", (d) =>
                        setVertexWeight(
                          d,
                          mesh.id,
                          vertex.id,
                          weightBone!,
                          value,
                        ),
                      );
                  }}
                />
                {weights?.influences.map((i) => (
                  <div className="weight-row" key={i.boneId}>
                    <span>
                      {doc.bones.find((b) => b.id === i.boneId)?.name}
                    </span>
                    <strong>{(i.weight * 100).toFixed(1)}%</strong>
                  </div>
                ))}
                <p className="rig-hint">
                  Σ weights ={" "}
                  {weights?.influences
                    .reduce((s, i) => s + i.weight, 0)
                    .toFixed(4)}
                </p>
              </>
            ) : (
              <p className="rig-hint">
                {en
                  ? "Bind bones and select a vertex to edit its weights. Weight Tool colors show the selected bone’s influence."
                  : "Gắn xương rồi chọn vertex để chỉnh weights. Weight Tool tô màu theo ảnh hưởng xương đang chọn."}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
