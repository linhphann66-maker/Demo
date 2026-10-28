import { useEffect, useRef, useState } from "react";
import {
  Move,
  MousePointer2,
  Grid2X2,
  Scan,
  Minus,
  Plus,
  Hand,
  Image as ImageIcon,
} from "lucide-react";
import { SceneRenderer, inversePoint } from "../../../packages/render-core/src";
import { worldMatrix } from "../../../packages/document-core/src";
import { useEditor } from "../../../packages/editor-core/src/store";
export function Viewport({ en }: { en: boolean }) {
  const doc = useEditor((s) => s.document)!;
  const selected = useEditor((s) => s.selectedId);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [grid, setGrid] = useState(true);
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [view, setView] = useState({ zoom: 0.7, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    pan: boolean;
  } | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const fit = () => {
    if (!host.current) return;
    const { width, height } = host.current.getBoundingClientRect();
    const zoom = Math.min((width - 100) / 800, (height - 60) / 700, 1.5);
    setView({
      zoom,
      x: (width - 800 * zoom) / 2,
      y: (height - 740 * zoom) / 2,
    });
  };
  useEffect(() => {
    const renderer = new SceneRenderer();
    scene.current = renderer;
    let alive = true;
    renderer
      .init(host.current!)
      .then(() => {
        if (alive) {
          setReady(true);
          fit();
        }
      })
      .catch((e) =>
        useEditor.getState().setError(`WebGL không khả dụng: ${String(e)}`),
      );
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ width: r.width, height: r.height });
      renderer.render();
    });
    ro.observe(host.current!);
    return () => {
      alive = false;
      ro.disconnect();
      renderer.destroy();
    };
  }, []);
  useEffect(() => {
    if (ready)
      scene.current
        ?.setDocument(doc)
        .then(() => scene.current?.select(selected))
        .catch((e) => useEditor.getState().setError(String(e)));
  }, [doc, selected, ready]);
  useEffect(() => {
    scene.current?.setView(view.zoom, view.x, view.y);
    scene.current?.select(selected);
  }, [view, selected, ready, size]);
  const zoom = (factor: number) =>
    setView((v) => {
      const z = Math.max(0.15, Math.min(3, v.zoom * factor));
      return {
        zoom: z,
        x: size.width / 2 - ((size.width / 2 - v.x) * z) / v.zoom,
        y: size.height / 2 - ((size.height / 2 - v.y) * z) / v.zoom,
      };
    });
  return (
    <section className="viewport">
      <div className="viewport-heading">
        <span>
          <span className="live-dot" /> {en ? "Scene" : "Khung cảnh"}{" "}
          <span className="muted">/</span> <strong>{doc.metadata.name}</strong>
        </span>
        <span className="viewport-tag">
          {en ? "FRONT · NEUTRAL" : "CHÍNH DIỆN · TƯ THẾ NGHỈ"}
        </span>
      </div>
      <div
        ref={host}
        data-testid="viewport"
        className={`canvas-host ${grid ? "grid-bg" : ""} ${tool === "pan" ? "pan-cursor" : ""}`}
        style={{
          backgroundSize: `${32 * view.zoom}px ${32 * view.zoom}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          const v = viewRef.current;
          const x = (e.clientX - r.left - v.x) / v.zoom,
            y = (e.clientY - r.top - v.y) / v.zoom;
          const pan = tool === "pan" || e.button === 1;
          const id = pan ? null : (scene.current?.hit(x, y) ?? null);
          if (!pan) useEditor.getState().select(id);
          const layer = doc.layers.find((l) => l.id === id);
          drag.current = {
            id,
            startX: e.clientX,
            startY: e.clientY,
            x: pan ? v.x : (layer?.x ?? 0),
            y: pan ? v.y : (layer?.y ?? 0),
            dx: 0,
            dy: 0,
            pan,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.startX,
            dy = e.clientY - d.startY;
          if (d.pan) {
            setView((v) => ({ ...v, x: d.x + dx, y: d.y + dy }));
            return;
          }
          if (d.id) {
            const l = doc.layers.find((l) => l.id === d.id)!;
            let delta = {
              x: dx / viewRef.current.zoom,
              y: dy / viewRef.current.zoom,
            };
            if (l.parentId) {
              const p = doc.layers.find(
                (candidate) => candidate.id === l.parentId,
              )!;
              const m = worldMatrix(doc, p);
              const origin = inversePoint(m, 0, 0),
                end = inversePoint(m, delta.x, delta.y);
              delta = { x: end.x - origin.x, y: end.y - origin.y };
            }
            d.dx = delta.x;
            d.dy = delta.y;
            scene.current?.nodes
              .get(d.id)
              ?.position.set(d.x + d.dx, d.y + d.dy);
            scene.current?.selection.clear();
            scene.current?.render();
          }
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d?.id && (Math.abs(d.dx) > 0.1 || Math.abs(d.dy) > 0.1))
            useEditor.getState().updateLayer(d.id, {
              x: Math.round(d.x + d.dx),
              y: Math.round(d.y + d.dy),
            });
          else scene.current?.select(selected);
        }}
        onPointerCancel={() => {
          drag.current = null;
          scene.current
            ?.setDocument(doc)
            .then(() => scene.current?.select(selected));
        }}
        onWheel={(e) => {
          zoom(e.deltaY > 0 ? 0.9 : 1.1);
        }}
      >
        {!ready && (
          <div className="canvas-loading">
            {en ? "Preparing WebGL renderer…" : "Đang khởi tạo WebGL…"}
          </div>
        )}
        <div className="artboard-label">
          {doc.metadata.name.toUpperCase()}{" "}
          <span>01 / {en ? "CHARACTER" : "NHÂN VẬT"}</span>
        </div>
        <div
          className="origin-cross"
          style={{
            left: view.x + 400 * view.zoom,
            top: view.y + 665 * view.zoom,
          }}
        >
          +
        </div>
      </div>
      <div className="canvas-toolbar">
        <div className="tool-group">
          <button
            aria-label={en ? "Select tool" : "Công cụ chọn"}
            className={tool === "select" ? "active" : ""}
            onClick={() => setTool("select")}
          >
            <MousePointer2 size={17} />
          </button>
          <button
            aria-label={en ? "Pan tool" : "Công cụ di chuyển khung nhìn"}
            className={tool === "pan" ? "active" : ""}
            onClick={() => setTool("pan")}
          >
            <Hand size={17} />
          </button>
        </div>
        <div className="tool-group">
          <button
            aria-label={en ? "Toggle grid" : "Bật tắt lưới"}
            className={grid ? "active-subtle" : ""}
            onClick={() => setGrid(!grid)}
          >
            <Grid2X2 size={17} />
          </button>
          <button
            aria-label={en ? "Fit to view" : "Vừa khung nhìn"}
            onClick={fit}
          >
            <Scan size={17} />
          </button>
        </div>
        <div className="zoom-control">
          <button aria-label="Zoom out" onClick={() => zoom(0.8)}>
            <Minus size={14} />
          </button>
          <span>{Math.round(view.zoom * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="viewport-foot">
        <span>
          <Move size={12} />
          {en
            ? "Drag to move · Scroll to zoom"
            : "Kéo để di chuyển · Cuộn để thu phóng"}
        </span>
        <span>
          <ImageIcon size={12} />
          800 × 800 <span className="muted">px</span>
        </span>
      </div>
    </section>
  );
}
