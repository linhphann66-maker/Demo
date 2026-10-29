import { useEffect, useRef, useState } from "react";
import type { Asset, PartCandidate } from "../../../packages/document-core/src";
export function BuilderMaskEditor({
  source,
  candidate,
  onChange,
  disabled,
}: {
  source: Asset;
  candidate: PartCandidate;
  onChange: (mask: PartCandidate["mask"]) => void;
  disabled: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null),
    mask = useRef({ ...candidate.mask, data: [...candidate.mask.data] }),
    drawing = useRef(false),
    original = useRef<Uint8ClampedArray | null>(null);
  const [tool, setTool] = useState<"paint" | "erase" | "restore">("erase"),
    [size, setSize] = useState(5),
    [before, setBefore] = useState(false);
  const draw = () => {
    const c = canvas.current,
      img = image.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(
      img,
      candidate.bbox.x,
      candidate.bbox.y,
      candidate.bbox.width,
      candidate.bbox.height,
      0,
      0,
      c.width,
      c.height,
    );
    if (!before) {
      const m = document.createElement("canvas");
      m.width = mask.current.width;
      m.height = mask.current.height;
      const mc = m.getContext("2d")!,
        rgba = mc.createImageData(m.width, m.height);
      mask.current.data.forEach((a, i) => {
        rgba.data[i * 4 + 3] = a;
      });
      mc.putImageData(rgba, 0, 0);
      const expanded = document.createElement("canvas");
      expanded.width = c.width;
      expanded.height = c.height;
      const ec = expanded.getContext("2d")!;
      ec.drawImage(m, 0, 0, c.width, c.height);
      const a = ec.getImageData(0, 0, c.width, c.height).data,
        pixels = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < c.width * c.height; i++)
        pixels.data[i * 4 + 3] = Math.min(pixels.data[i * 4 + 3], a[i * 4 + 3]);
      ctx.putImageData(pixels, 0, 0);
    }
  };
  useEffect(() => {
    mask.current = { ...candidate.mask, data: [...candidate.mask.data] };
    const img = new Image();
    img.src = source.data;
    let alive = true;
    void img.decode().then(() => {
      if (!alive) return;
      image.current = img;
      const c = document.createElement("canvas");
      c.width = mask.current.width;
      c.height = mask.current.height;
      const x = c.getContext("2d")!;
      x.drawImage(
        img,
        candidate.bbox.x,
        candidate.bbox.y,
        candidate.bbox.width,
        candidate.bbox.height,
        0,
        0,
        c.width,
        c.height,
      );
      original.current = x.getImageData(0, 0, c.width, c.height).data;
      draw();
    });
    return () => {
      alive = false;
    };
  }, [candidate, source]);
  useEffect(draw, [before]);
  const paint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled || before) return;
    const rect = e.currentTarget.getBoundingClientRect(),
      m = mask.current,
      px = ((e.clientX - rect.left) / rect.width) * m.width,
      py = ((e.clientY - rect.top) / rect.height) * m.height;
    for (
      let y = Math.max(0, Math.floor(py - size));
      y < Math.min(m.height, py + size);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(px - size));
        x < Math.min(m.width, px + size);
        x++
      )
        if (Math.hypot(x - px, y - py) <= size) {
          const i = y * m.width + x;
          m.data[i] =
            tool === "erase"
              ? 0
              : tool === "paint"
                ? 255
                : (original.current?.[i * 4 + 3] ?? 255);
        }
    draw();
  };
  const ratio = candidate.bbox.width / candidate.bbox.height,
    w = ratio > 1 ? 256 : Math.max(16, Math.round(256 * ratio)),
    h = ratio > 1 ? Math.max(16, Math.round(256 / ratio)) : 256;
  return (
    <div className="builder-mask-editor">
      <p>Mask theo ảnh nguồn. Trắng bên trong không bị xóa tự động.</p>
      <label>
        <input
          type="checkbox"
          checked={before}
          onChange={(e) => setBefore(e.target.checked)}
        />
        Trước / ảnh gốc
      </label>
      <select
        aria-label="Mask brush"
        value={tool}
        onChange={(e) => setTool(e.target.value as typeof tool)}
      >
        <option value="erase">Eraser · xóa alpha</option>
        <option value="paint">Paint · thêm alpha</option>
        <option value="restore">Restore · khôi phục alpha gốc</option>
      </select>
      <label>
        Cỡ cọ
        <input
          type="range"
          min={1}
          max={20}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
        />
      </label>
      <canvas
        aria-label="Candidate alpha mask"
        ref={canvas}
        width={w}
        height={h}
        style={{
          maxWidth: "100%",
          background:
            "repeating-conic-gradient(#555 0% 25%,#333 0% 50%) 0 / 12px 12px",
          touchAction: "none",
        }}
        onPointerDown={(e) => {
          if (disabled || before) return;
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          paint(e);
        }}
        onPointerMove={paint}
        onPointerUp={() => {
          if (drawing.current) {
            drawing.current = false;
            onChange({ ...mask.current, data: [...mask.current.data] });
          }
        }}
        onPointerCancel={() => {
          drawing.current = false;
          mask.current = { ...candidate.mask, data: [...candidate.mask.data] };
          draw();
        }}
      />
    </div>
  );
}
