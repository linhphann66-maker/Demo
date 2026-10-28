import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Layers,
  FolderOpen,
  Bone,
  Shirt,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Undo2,
  Redo2,
  Upload,
  Download,
  Save,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Search,
  X,
  Settings2,
  SlidersHorizontal,
  Move,
  RotateCw,
  Trash2,
  Check,
  Info,
  Box,
  Flame,
  MousePointer2,
  FileJson,
  Image as ImageIcon,
} from "lucide-react";
import { useEditor } from "../../../packages/editor-core/src/store";
import { createDemo, demoColors } from "./demo";
import {
  importRaster,
  packageProject,
  unpackProject,
  download,
  validateProjectImages,
} from "../../../packages/exporters/src";
import { exportPng } from "../../../packages/render-core/src";
import type { Layer } from "../../../packages/document-core/src";
import { Viewport } from "./Viewport";
function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-btn" aria-label="Close">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            AI 2D Asset Studio
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Numeric({
  label,
  value,
  onChange,
  unit,
  min = -10000,
  max = 10000,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="numeric">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={unit === "°" ? 1 : 0.1}
        onChange={(e) => {
          if (e.target.value !== "") {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
          }
        }}
      />
      {unit && <small>{unit}</small>}
    </label>
  );
}
export function App() {
  const s = useEditor();
  const doc = s.document;
  const [en, setEn] = useState(false);
  const t = (vi: string, english: string) => (en ? english : vi);
  const [tab, setTab] = useState<"layers" | "assets">("layers");
  const [mode, setMode] = useState<"editor" | "ai">("editor");
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const imageInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  const notify = (text: string) => setToast(text);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (!useEditor.getState().restore()) {
      const error = useEditor.getState().error;
      createDemo()
        .then((d) => {
          useEditor.getState().open(d);
          useEditor.getState().select(d.layers[3].id);
          if (error) useEditor.getState().setError(error);
        })
        .catch((e) => useEditor.getState().setError(String(e)));
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = en ? "en" : "vi";
  }, [en]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.matches("input,textarea,select") || el.isContentEditable) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "s") {
          e.preventDefault();
          if (useEditor.getState().save())
            notify(en ? "Saved locally" : "Đã lưu trên trình duyệt");
        }
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) useEditor.getState().redo();
          else useEditor.getState().undo();
        }
        if (e.key === "y") {
          e.preventDefault();
          useEditor.getState().redo();
        }
      }
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", leave);
    };
  }, [en]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      s.setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const layer = doc?.layers.find((l) => l.id === s.selectedId);
  const asset = doc?.assetReferences.find((a) => a.id === layer?.assetId);
  const update = (patch: Partial<Layer>) => {
    if (layer && !layer.locked) s.updateLayer(layer.id, patch);
  };
  if (!doc)
    return (
      <main className="boot">
        <div className="brand-mark">
          <Layers />
        </div>
        <h1>AI 2D Asset Studio</h1>
        <p>{s.error ?? "Đang mở không gian sáng tạo…"}</p>
      </main>
    );
  const layers = [...doc.layers]
    .reverse()
    .filter((l) => l.name.toLowerCase().includes(query.toLowerCase()));
  const depth = (l: Layer): number =>
    l.parentId ? 1 + depth(doc.layers.find((p) => p.id === l.parentId)!) : 0;
  return (
    <div className="studio">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setProjectOpen(true);
          }}
        >
          <span className="brand-mark">
            <Layers size={20} />
          </span>
          <span>
            asset<span className="brand-light">studio</span>
            <small>AI 2D WORKSPACE</small>
          </span>
        </a>
        <div className="header-divider" />
        <button className="project-name" onClick={() => setProjectOpen(true)}>
          {" "}
          <FolderOpen size={15} />
          <span>{doc.metadata.name}</span>
          <ChevronDown size={13} />
        </button>
        <span className="phase-pill">PHASE 01</span>
        <div className="header-right">
          <button
            className="text-btn language"
            onClick={() => setEn(!en)}
            title={t("Chuyển sang English", "Chuyển sang Tiếng Việt")}
          >
            {en ? "EN" : "VI"}
            <ChevronDown size={12} />
          </button>
          <button
            className="icon-btn"
            aria-label={t("Trợ giúp", "Help")}
            onClick={() => setHelp(true)}
          >
            <Info size={17} />
          </button>
          <span className="avatar">N</span>
        </div>
      </header>
      <div className="actionbar">
        <div className="breadcrumb">
          <span className="tiny-square" />
          <span>{t("Dự án", "Projects")}</span>
          <ChevronRight size={12} />
          <strong>{doc.metadata.name}</strong>
          <span
            className={`save-dot ${s.dirty ? "unsaved" : ""}`}
            title={s.dirty ? t("Chưa lưu", "Unsaved") : t("Đã lưu", "Saved")}
          />
        </div>
        <div className="mode-switch">
          <button
            className={mode === "editor" ? "chosen" : ""}
            onClick={() => setMode("editor")}
          >
            <MousePointer2 size={14} />
            {t("Trình biên tập", "Editor Mode")}
          </button>
          <button
            className={mode === "ai" ? "chosen" : ""}
            onClick={() => setMode("ai")}
          >
            <Sparkles size={14} />
            {t("Trợ lý AI", "AI Mode")}
          </button>
        </div>
        <div className="action-buttons">
          <button
            className="icon-btn"
            aria-label={t("Hoàn tác", "Undo")}
            disabled={!s.past.length}
            onClick={s.undo}
            title="Ctrl Z"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-btn"
            aria-label={t("Làm lại", "Redo")}
            disabled={!s.future.length}
            onClick={s.redo}
          >
            <Redo2 size={16} />
          </button>
          <span className="separator" />
          <button
            className="text-btn"
            onClick={() => projectInput.current?.click()}
          >
            <Upload size={15} />
            {t("Nhập", "Import")}
          </button>
          <button
            className="text-btn"
            onClick={() => {
              if (s.save())
                notify(t("Đã lưu trên trình duyệt", "Saved in this browser"));
            }}
          >
            <Save size={15} />
            {t("Lưu", "Save")}
          </button>
          <button className="primary-btn" onClick={() => setExportOpen(true)}>
            <Download size={15} />
            {t("Xuất dự án", "Export")}
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
      <main className="workspace">
        <aside className="left-panel">
          <div className="panel-tabs">
            <button
              className={tab === "layers" ? "active" : ""}
              onClick={() => setTab("layers")}
            >
              <Layers size={15} />
              {t("Lớp", "Layers")}
            </button>
            <button
              className={tab === "assets" ? "active" : ""}
              onClick={() => setTab("assets")}
            >
              <Box size={15} />
              {t("Tài nguyên", "Assets")}
            </button>
          </div>
          <div className="search">
            <Search size={14} />
            <input
              aria-label={t("Tìm kiếm lớp", "Search layers")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Tìm kiếm…", "Search…")}
            />
            <kbd>⌕</kbd>
          </div>
          <div className="section-title">
            <span>
              {tab === "layers"
                ? t("CẤU TRÚC NHÂN VẬT", "CHARACTER STRUCTURE")
                : t("THƯ VIỆN DỰ ÁN", "PROJECT LIBRARY")}
            </span>
            <button
              className="icon-btn"
              onClick={() => imageInput.current?.click()}
              aria-label={t("Thêm ảnh", "Add image")}
            >
              <Plus size={15} />
            </button>
          </div>
          {tab === "layers" ? (
            <div className="layer-tree">
              <div className="tree-root">
                <ChevronDown size={13} />
                <span className="root-icon">
                  <Box size={14} />
                </span>
                <strong>{doc.metadata.name}</strong>
                <span>{doc.layers.length}</span>
              </div>
              <div
                className="layer-list"
                role="list"
                aria-label={t("Danh sách lớp", "Layer list")}
              >
                {layers.map((l) => {
                  const a = doc.assetReferences.find(
                    (a) => a.id === l.assetId,
                  )!;
                  const color =
                    demoColors[doc.assetReferences.indexOf(a)] ?? "#8895ab";
                  return (
                    <div
                      key={l.id}
                      role="listitem"
                      className={`layer-row ${l.id === s.selectedId ? "selected" : ""} ${!l.visible ? "hidden-layer" : ""}`}
                      style={{ paddingLeft: 16 + depth(l) * 12 }}
                    >
                      <button
                        className="layer-main"
                        onClick={() => s.select(l.id)}
                        data-testid={`layer-${l.id}`}
                      >
                        <span
                          className="layer-thumb"
                          style={{
                            background: color + "22",
                            borderColor: color + "44",
                          }}
                        >
                          <img src={a.data} alt="" />
                        </span>
                        <span>{l.name}</span>
                      </button>
                      <button
                        className="layer-utility"
                        aria-label={`${l.visible ? t("Ẩn", "Hide") : t("Hiện", "Show")} ${l.name}`}
                        onClick={() =>
                          s.updateLayer(l.id, { visible: !l.visible })
                        }
                      >
                        {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      <button
                        className="layer-utility lock-control"
                        aria-label={`${l.locked ? t("Mở khóa", "Unlock") : t("Khóa", "Lock")} ${l.name}`}
                        onClick={() =>
                          s.updateLayer(l.id, { locked: !l.locked })
                        }
                      >
                        {l.locked ? <Lock size={12} /> : <Unlock size={12} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="asset-library">
              {doc.assetReferences
                .filter((a) =>
                  a.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((a) => (
                  <button
                    className="asset-card"
                    key={a.id}
                    onClick={() => {
                      const existing = doc.layers.find(
                        (l) => l.assetId === a.id,
                      );
                      if (existing) s.select(existing.id);
                      else {
                        const id = crypto.randomUUID();
                        s.command("Tái sử dụng tài nguyên", (d) => {
                          d.layers.push({
                            id,
                            assetId: a.id,
                            parentId: null,
                            name: a.name,
                            visible: true,
                            locked: false,
                            opacity: 1,
                            x: 400 - a.width / 2,
                            y: 400 - a.height / 2,
                            rotation: 0,
                            scaleX: 1,
                            scaleY: 1,
                          });
                        });
                        s.select(id);
                      }
                      setTab("layers");
                    }}
                  >
                    <img src={a.data} alt="" />
                    <span>{a.name}</span>
                    <small>
                      {a.provenance === "procedural"
                        ? t("Thủ tục", "Procedural")
                        : a.provenance}
                    </small>
                  </button>
                ))}
            </div>
          )}
          <div className="left-bottom">
            <button
              className="import-asset"
              onClick={() => imageInput.current?.click()}
            >
              <Plus size={15} />
              {t("Thêm tài nguyên", "Add an asset")}
              <span>PNG, JPG, WEBP</span>
            </button>
            <div className="future-row">
              <span>
                <Bone size={14} />
                {t("Bộ xương", "Skeleton")}
              </span>
              <small>PHASE 02</small>
            </div>
            <div className="future-row">
              <span>
                <Shirt size={14} />
                {t("Trang bị", "Equipment")}
              </span>
              <small>PHASE 02</small>
            </div>
            <div className="future-row">
              <span>
                <Sparkles size={14} />
                VFX
              </span>
              <small>PHASE 04</small>
            </div>
            <div className="sample-note">
              <span className="sample-dot" />
              {t("Nhân vật mẫu cục bộ", "Local sample character")}
              <Info size={12} />
            </div>
          </div>
        </aside>
        <div className="center-column">
          <Viewport en={en} />
          <section className="timeline">
            <div className="timeline-head">
              <span>
                <SlidersHorizontal size={14} />
                {t("Hoạt ảnh", "Animation")}
              </span>
              <span className="soon-badge">
                {t("SẮP CÓ · PHASE 03", "PLANNED · PHASE 03")}
              </span>
              <span className="timeline-meta">
                24 FPS <span>·</span> 00:00:00
              </span>
            </div>
            <div className="timeline-body">
              <div className="clip-list">
                <span>{t("HOẠT ẢNH DỰ KIẾN", "PLANNED CLIPS")}</span>
                <div>
                  {["Idle", "Walk", "Run", "Attack", "Hurt"].map((name, i) => (
                    <span
                      className={`clip ${i === 0 ? "clip-current" : ""}`}
                      key={name}
                    >
                      <span className="clip-dot" />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="timeline-preview">
                <div className="ruler">
                  {[
                    "00f",
                    "06f",
                    "12f",
                    "18f",
                    "24f",
                    "30f",
                    "36f",
                    "42f",
                    "48f",
                  ].map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </div>
                <div className="timeline-empty">
                  <Lock size={14} />
                  {t(
                    "Keyframe & phát hoạt ảnh sẽ được triển khai ở Phase 03.",
                    "Keyframes & playback will be available in Phase 03.",
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
        <aside className="right-panel">
          <div className="inspector-title">
            <span>
              <Settings2 size={15} />
              {mode === "ai"
                ? t("Trợ lý sáng tạo", "Creative assistant")
                : t("Thuộc tính", "Inspector")}
            </span>
            <span className="panel-chip">
              {mode === "ai"
                ? "AI"
                : layer
                  ? t("Lớp", "Layer")
                  : t("Dự án", "Project")}
            </span>
          </div>
          {mode === "ai" ? (
            <div className="ai-panel">
              <div className="ai-symbol">
                <Sparkles size={25} />
              </div>
              <span className="eyebrow">AI WORKSPACE</span>
              <h2>
                {t(
                  "Ý tưởng của bạn.\nQuyền kiểm soát của bạn.",
                  "Your ideas.\nYour creative control.",
                )}
              </h2>
              <p>
                {t(
                  "Trợ lý sẽ tạo các thay đổi có thể chỉnh sửa, để bạn xem trước và phê duyệt.",
                  "The assistant will create editable changes for you to preview and approve.",
                )}
              </p>
              <div className="provider-notice">
                <Info size={16} />
                <div>
                  <strong>
                    {t(
                      "Chưa kết nối nhà cung cấp AI",
                      "No AI provider connected",
                    )}
                  </strong>
                  <p>
                    {t(
                      "Tích hợp AI thuộc Phase 05. Trình biên tập hoạt động hoàn toàn cục bộ.",
                      "AI integration is planned for Phase 05. The editor works entirely locally.",
                    )}
                  </p>
                </div>
              </div>
              <div className="ai-steps">
                {[
                  "01  REQUEST → VALIDATE",
                  "02  PLAN → EXECUTE → VERIFY",
                  "03  PREVIEW → APPROVAL → COMMIT",
                ].map((x) => (
                  <div key={x}>{x}</div>
                ))}
              </div>
              <button
                className="secondary-btn"
                onClick={() => setMode("editor")}
              >
                <ArrowLeft size={14} />
                {t("Quay lại biên tập", "Back to editor")}
              </button>
            </div>
          ) : layer ? (
            <>
              <div className="selected-object">
                <div className="object-preview">
                  <img src={asset?.data} alt="" />
                </div>
                <div>
                  <strong>{layer.name}</strong>
                  <small>
                    <span className="small-dot" />
                    {t("Lớp hình ảnh", "Image layer")}
                  </small>
                </div>
              </div>
              <div className="inspector-scroll">
                <section className="property-section">
                  <div className="property-heading">
                    <span>
                      <Move size={13} />
                      {t("Biến đổi", "Transform")}
                    </span>
                    <button
                      className="icon-btn"
                      aria-label={t("Đặt lại biến đổi", "Reset transform")}
                      disabled={layer.locked}
                      onClick={() =>
                        update({
                          x: 0,
                          y: 0,
                          rotation: 0,
                          scaleX: 1,
                          scaleY: 1,
                        })
                      }
                    >
                      <RotateCw size={12} />
                    </button>
                  </div>
                  <fieldset disabled={layer.locked}>
                    <div className="numeric-grid">
                      <Numeric
                        label="X"
                        value={layer.x}
                        onChange={(x) => update({ x })}
                        unit="px"
                      />
                      <Numeric
                        label="Y"
                        value={layer.y}
                        onChange={(y) => update({ y })}
                        unit="px"
                      />
                    </div>
                    <div className="mini-label">
                      {t("Kích thước gốc", "Source dimensions")}
                    </div>
                    <div className="numeric-grid">
                      <div className="readonly-value">
                        W <span>{asset?.width}</span>
                        <small>px</small>
                      </div>
                      <div className="readonly-value">
                        H <span>{asset?.height}</span>
                        <small>px</small>
                      </div>
                    </div>
                    <div className="mini-label">{t("Tỉ lệ", "Scale")}</div>
                    <div className="numeric-grid">
                      <Numeric
                        label="Scale X"
                        value={layer.scaleX * 100}
                        min={1}
                        max={2000}
                        onChange={(x) => update({ scaleX: x / 100 })}
                        unit="%"
                      />
                      <Numeric
                        label="Scale Y"
                        value={layer.scaleY * 100}
                        min={1}
                        max={2000}
                        onChange={(y) => update({ scaleY: y / 100 })}
                        unit="%"
                      />
                    </div>
                    <div className="rotation-field">
                      <RotateCw size={13} />
                      <Numeric
                        label={t("Góc xoay", "Rotation")}
                        value={layer.rotation}
                        min={-3600}
                        max={3600}
                        onChange={(rotation) => update({ rotation })}
                        unit="°"
                      />
                    </div>
                  </fieldset>
                </section>
                <section className="property-section">
                  <div className="property-heading">
                    <span>
                      <Layers size={13} />
                      {t("Hiển thị", "Appearance")}
                    </span>
                  </div>
                  <div className="opacity-label">
                    <span>{t("Độ mờ", "Opacity")}</span>
                    <strong>{Math.round(layer.opacity * 100)}%</strong>
                  </div>
                  <input
                    className="range"
                    aria-label={t("Độ mờ", "Opacity")}
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(layer.opacity * 100)}
                    disabled={layer.locked}
                    onChange={(e) =>
                      update({ opacity: Number(e.target.value) / 100 })
                    }
                  />
                  <div className="toggle-row">
                    <span>{t("Hiển thị lớp", "Layer visibility")}</span>
                    <button
                      role="switch"
                      aria-checked={layer.visible}
                      aria-label={t("Hiển thị lớp", "Layer visibility")}
                      className={`switch ${layer.visible ? "on" : ""}`}
                      onClick={() =>
                        s.updateLayer(layer.id, { visible: !layer.visible })
                      }
                    >
                      <span />
                    </button>
                  </div>
                  <div className="toggle-row">
                    <span>{t("Khóa chỉnh sửa", "Lock editing")}</span>
                    <button
                      role="switch"
                      aria-checked={layer.locked}
                      aria-label={t("Khóa chỉnh sửa", "Lock editing")}
                      className={`switch ${layer.locked ? "on" : ""}`}
                      onClick={() =>
                        s.updateLayer(layer.id, { locked: !layer.locked })
                      }
                    >
                      <span />
                    </button>
                  </div>
                </section>
                <section className="property-section">
                  <div className="property-heading">
                    <span>
                      <FolderOpen size={13} />
                      {t("Cấu trúc lớp", "Layer structure")}
                    </span>
                  </div>
                  <label className="field-label">
                    {t("Tên lớp", "Layer name")}
                    <input
                      aria-label={t("Tên lớp", "Layer name")}
                      value={layer.name}
                      disabled={layer.locked}
                      maxLength={100}
                      onChange={(e) => {
                        if (e.target.value.trim())
                          update({ name: e.target.value });
                      }}
                    />
                  </label>
                  <label className="field-label">
                    {t("Lớp cha · tọa độ cục bộ", "Parent · local coordinates")}
                    <select
                      value={layer.parentId ?? ""}
                      disabled={layer.locked}
                      aria-label={t("Lớp cha", "Parent layer")}
                      onChange={(e) =>
                        update({ parentId: e.target.value || null })
                      }
                    >
                      <option value="">{t("Gốc dự án", "Project root")}</option>
                      {doc.layers
                        .filter((l) => l.id !== layer.id)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="order-buttons">
                    <button
                      className="secondary-btn"
                      disabled={
                        layer.locked || doc.layers.at(-1)?.id === layer.id
                      }
                      onClick={() => s.moveOrder(layer.id, 1)}
                      aria-label={t("Đưa lên", "Move up")}
                    >
                      <ArrowUp size={14} />
                      {t("Đưa lên", "Forward")}
                    </button>
                    <button
                      className="secondary-btn"
                      disabled={layer.locked || doc.layers[0]?.id === layer.id}
                      onClick={() => s.moveOrder(layer.id, -1)}
                      aria-label={t("Đưa xuống", "Move down")}
                    >
                      <ArrowDown size={14} />
                      {t("Đưa xuống", "Backward")}
                    </button>
                  </div>
                </section>
                <section className="property-section source-section">
                  <span className="eyebrow">
                    {t("NGUỒN TÀI NGUYÊN", "ASSET PROVENANCE")}
                  </span>
                  <div>
                    <span className="source-badge">
                      {asset?.provenance === "procedural"
                        ? t("Thủ tục · mẫu cục bộ", "Procedural · local sample")
                        : asset?.provenance}
                    </span>
                  </div>
                  <p>
                    {t(
                      "Ảnh nguồn độc lập. Mọi thay đổi đều có thể hoàn tác.",
                      "Independent source artwork. All edits can be undone.",
                    )}
                  </p>
                  <button
                    className="danger-text"
                    disabled={layer.locked}
                    onClick={() => s.removeLayer(layer.id)}
                  >
                    <Trash2 size={13} />
                    {t("Xóa lớp", "Delete layer")}
                  </button>
                </section>
              </div>
            </>
          ) : (
            <div className="empty-inspector">
              <MousePointer2 size={28} />
              <h3>{t("Chọn một lớp", "Select a layer")}</h3>
              <p>
                {t(
                  "Chọn trực tiếp trên khung vẽ hoặc trong danh sách để chỉnh sửa.",
                  "Select on the canvas or in the layer list to edit.",
                )}
              </p>
              <button
                className="secondary-btn"
                onClick={() => setProjectOpen(true)}
              >
                {t("Thông tin dự án", "Project details")}
              </button>
            </div>
          )}
          <div className="inspector-footer">
            <span className="small-dot" />
            {t("Mọi lớp đều có thể chỉnh sửa", "Every layer stays editable")}
          </div>
        </aside>
      </main>
      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          {t("Không gian cục bộ", "Local workspace")}
          <span className="status-divider" />
          {s.dirty
            ? t("Có thay đổi chưa lưu", "Unsaved changes")
            : t("Đã lưu trên trình duyệt", "Saved in browser")}
        </span>
        <span>
          {doc.layers.length} {t("lớp", "layers")}
          <span className="status-divider" />
          {doc.assetReferences.length} {t("tài nguyên", "assets")}
          <span className="status-divider" />
          WebGL · PixiJS 8<span className="status-divider" />
          v0.1.0
        </span>
      </footer>
      <input
        ref={imageInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            void run(async () => {
              const a = await importRaster(f);
              const id = crypto.randomUUID();
              s.command("Nhập ảnh", (d) => {
                d.assetReferences.push(a);
                d.layers.push({
                  id,
                  assetId: a.id,
                  parentId: null,
                  name: a.name,
                  visible: true,
                  locked: false,
                  opacity: 1,
                  x: 400 - a.width / 2,
                  y: 400 - a.height / 2,
                  rotation: 0,
                  scaleX: 1,
                  scaleY: 1,
                });
              });
              s.select(id);
              notify(t("Đã nhập ảnh", "Image imported"));
            });
        }}
      />
      <input
        ref={projectInput}
        hidden
        type="file"
        accept=".a2dstudio"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            void run(async () => {
              if (f.size > 20 * 1024 * 1024) throw Error("Tệp vượt 20 MiB");
              const d = unpackProject(new Uint8Array(await f.arrayBuffer()));
              await validateProjectImages(d);
              if (
                useEditor.getState().dirty &&
                !window.confirm(
                  t(
                    "Thay thế dự án hiện tại? Các thay đổi chưa lưu sẽ mất.",
                    "Replace current project? Unsaved edits will be lost.",
                  ),
                )
              )
                return;
              s.open(d);
              notify(
                t(
                  "Đã mở dự án. Nhấn Lưu để giữ trên trình duyệt.",
                  "Project opened. Save to keep it in this browser.",
                ),
              );
            });
        }}
      />
      <Modal
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={t("Xuất tác phẩm của bạn", "Export your creation")}
      >
        <p className="modal-intro">
          {t(
            "Giữ nguyên cấu trúc chỉnh sửa hoặc xuất hình ảnh trong suốt.",
            "Keep your editable structure or export a transparent image.",
          )}
        </p>
        <button
          className="export-option"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const bytes = packageProject(doc);
              download(
                bytes as BlobPart,
                doc.metadata.name + ".a2dstudio",
                "application/zip",
              );
              notify(t("Đã xuất dự án", "Project exported"));
              setExportOpen(false);
            })
          }
        >
          <span className="export-icon">
            <FileJson />
          </span>
          <span>
            <strong>{t("Dự án có thể chỉnh sửa", "Editable project")}</strong>
            <small>
              .a2dstudio ·{" "}
              {t(
                "Tất cả lớp, ảnh và thuộc tính",
                "All layers, artwork and properties",
              )}
            </small>
          </span>
          <Download size={18} />
        </button>
        <button
          className="export-option"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const blob = await exportPng(doc);
              download(blob, doc.metadata.name + ".png", "image/png");
              notify(t("Đã xuất PNG 800 × 800", "PNG exported at 800 × 800"));
              setExportOpen(false);
            })
          }
        >
          <span className="export-icon orange">
            <ImageIcon />
          </span>
          <span>
            <strong>{t("Ảnh PNG trong suốt", "Transparent PNG")}</strong>
            <small>
              800 × 800 px ·{" "}
              {t(
                "Khung vẽ hiện tại, không gồm lưới",
                "Current artboard, without the grid",
              )}
            </small>
          </span>
          <Download size={18} />
        </button>
        <p className="subtle-note">
          {t(
            "Nội dung ngoài khung 800 × 800 sẽ bị cắt trong PNG. Spritesheet và engine export thuộc các giai đoạn sau.",
            "PNG clips content outside the 800 × 800 artboard. Spritesheet and engine exports are planned for later phases.",
          )}
        </p>
      </Modal>
      <Modal
        open={projectOpen}
        onOpenChange={setProjectOpen}
        title={t("Thông tin dự án", "Project details")}
      >
        <div className="project-info-art">
          <Flame size={30} />
          <div>
            <h2>{doc.metadata.name}</h2>
            <span>Battle Mage · 2D Anime</span>
          </div>
          <span className="phase-pill">LOCAL SAMPLE</span>
        </div>
        <label className="field-label">
          {t("Tên dự án", "Project name")}
          <input
            aria-label={t("Tên dự án", "Project name")}
            value={doc.metadata.name}
            maxLength={100}
            onChange={(e) => {
              if (e.target.value.trim())
                s.command("Tên dự án", (d) => {
                  d.metadata.name = e.target.value;
                });
            }}
          />
        </label>
        <p className="modal-intro">
          {t(
            "Tóc trắng, giáp đen, áo choàng đỏ và kiếm lửa. Nhân vật mẫu thủ tục gồm các lớp độc lập; không phải sản phẩm AI.",
            "White hair, black armor, red cape and a flaming sword. A procedural sample with separate layers; not AI-generated.",
          )}
        </p>
        <div className="project-stats">
          <div>
            <strong>{doc.layers.length}</strong>
            <span>{t("Lớp chỉnh sửa", "Editable layers")}</span>
          </div>
          <div>
            <strong>v{doc.schemaVersion}</strong>
            <span>{t("Định dạng", "Schema")}</span>
          </div>
          <div>
            <strong>{doc.metadata.revision}</strong>
            <span>{t("Phiên bản sửa", "Revision")}</span>
          </div>
        </div>
        <div className="provider-notice">
          <Info size={17} />
          <p>
            {t(
              "Auto rig, mesh và VFX đã được ghi nhận là tùy chọn dự kiến; chưa được thực thi trong Phase 01.",
              "Auto rig, mesh and VFX are recorded preferences; not executed in Phase 01.",
            )}
          </p>
        </div>
        <button
          className="secondary-btn wide"
          onClick={() => {
            if (
              s.dirty &&
              !window.confirm(
                t(
                  "Mở lại mẫu và bỏ các thay đổi chưa lưu?",
                  "Reset to sample and discard unsaved edits?",
                ),
              )
            )
              return;
            void run(async () => {
              s.open(await createDemo());
              setProjectOpen(false);
            });
          }}
        >
          {t("Mở lại nhân vật mẫu", "Reset to demo character")}
        </button>
      </Modal>
      <Modal
        open={help}
        onOpenChange={setHelp}
        title={t("Không gian sáng tạo của bạn", "Your creative workspace")}
      >
        <p className="modal-intro">
          {t(
            "Chọn lớp → chỉnh sửa → lưu hoặc xuất. Không cần tài khoản AI.",
            "Select a layer → edit → save or export. No AI account needed.",
          )}
        </p>
        <div className="help-row">
          <span>Ctrl / ⌘ + S</span>
          <span>{t("Lưu vào trình duyệt", "Save in browser")}</span>
        </div>
        <div className="help-row">
          <span>Ctrl / ⌘ + Z</span>
          <span>{t("Hoàn tác", "Undo")}</span>
        </div>
        <div className="help-row">
          <span>Ctrl + Y / ⌘ + ⇧ + Z</span>
          <span>{t("Làm lại", "Redo")}</span>
        </div>
        <div className="help-row">
          <span>{t("Kéo chuột", "Drag")}</span>
          <span>{t("Di chuyển lớp", "Move layer")}</span>
        </div>
        <div className="help-row">
          <span>{t("Cuộn chuột", "Scroll")}</span>
          <span>{t("Thu phóng", "Zoom")}</span>
        </div>
        <p className="subtle-note">
          {t(
            "Lưu giữ dữ liệu trên trình duyệt này. Xuất .a2dstudio để tạo bản sao di động. Nhập ảnh PNG, JPEG hoặc WebP tối đa 8 MiB, 4096 px.",
            "Save keeps data in this browser. Export .a2dstudio for a portable backup. Import PNG, JPEG or WebP up to 8 MiB and 4096 px.",
          )}
        </p>
      </Modal>
      {busy && (
        <div className="busy-indicator" role="status">
          {t("Đang xử lý tệp…", "Processing file…")}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {s.error && (
        <div className="error-banner" role="alert">
          <Info size={18} />
          <span>{s.error}</span>
          <button
            className="icon-btn"
            aria-label={t("Đóng lỗi", "Dismiss error")}
            onClick={() => s.setError(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
