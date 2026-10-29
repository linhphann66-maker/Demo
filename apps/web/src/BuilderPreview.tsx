import { useEffect, useRef, useState } from "react";
import { SceneRenderer } from "../../../packages/render-core/src";
import {
  worldMatrix,
  type ProjectDocument,
} from "../../../packages/document-core/src";
export function BuilderPreview({
  doc,
  bones,
  selected,
}: {
  doc: ProjectDocument | null;
  bones: boolean;
  selected: string | null;
}) {
  const host = useRef<HTMLDivElement>(null),
    renderer = useRef<SceneRenderer | null>(null),
    latest = useRef({ doc, bones, selected });
  latest.current = { doc, bones, selected };
  const [guide, setGuide] = useState({ z: 1, x: 0, y: 0, width: 800 });
  const update = async () => {
    const r = renderer.current,
      p = latest.current;
    if (!r?.ready || !p.doc) return;
    await r.setDocument(p.doc);
    if (!r.ready) return;
    const box = host.current!.getBoundingClientRect();
    let minX = 0,
      minY = 0,
      maxX = 800,
      maxY = 720;
    for (const layer of p.doc.layers) {
      const a = p.doc.assetReferences.find((a) => a.id === layer.assetId)!;
      const m = worldMatrix(p.doc, layer);
      for (const [x, y] of [
        [0, 0],
        [a.width, 0],
        [0, a.height],
        [a.width, a.height],
      ]) {
        const wx = m.a * x + m.c * y + m.tx,
          wy = m.b * x + m.d * y + m.ty;
        minX = Math.min(minX, wx - 12);
        minY = Math.min(minY, wy - 12);
        maxX = Math.max(maxX, wx + 12);
        maxY = Math.max(maxY, wy + 12);
      }
    }
    const z = Math.min(box.width / (maxX - minX), box.height / (maxY - minY)),
      x = (box.width - (maxX - minX) * z) / 2 - minX * z,
      y = -minY * z;
    r.setView(z, x, y);
    setGuide({ z, x, y, width: box.width });
    r.setOverlay({
      showBones: p.bones,
      showMesh: false,
      boneId: null,
      vertexId: null,
      layerId: p.selected,
      showJoints: p.bones,
    });
    r.select(p.selected);
  };
  useEffect(() => {
    const r = new SceneRenderer();
    renderer.current = r;
    void r
      .init(host.current!)
      .then(update)
      .catch((e) => console.error(e));
    const observer = new ResizeObserver(() => {
      void update().catch(() => {});
    });
    observer.observe(host.current!);
    return () => {
      observer.disconnect();
      r.destroy();
    };
  }, []);
  useEffect(() => {
    void update().catch((e) => console.error(e));
  }, [doc, bones, selected]);
  return (
    <div
      ref={host}
      data-testid="builder-preview"
      style={{
        height: 430,
        width: "100%",
        background:
          "repeating-conic-gradient(#292630 0% 25%,#211f29 0% 50%) 0 / 20px 20px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <svg
        aria-label="Ground line and center guide"
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        <line
          x1={8}
          x2={guide.width - 8}
          y1={650 * guide.z + guide.y}
          y2={650 * guide.z + guide.y}
          stroke="#8aaf92"
          strokeDasharray="5 4"
        />
        <line
          x1={guide.x + 400 * guide.z}
          x2={guide.x + 400 * guide.z}
          y1={8}
          y2={650 * guide.z + guide.y}
          stroke="#baa8d0"
          opacity={0.45}
          strokeDasharray="4 6"
        />
        <text
          x={10}
          y={650 * guide.z + guide.y + 16}
          fill="#b8ccbd"
          fontSize={11}
        >
          Mặt đất
        </text>
      </svg>
    </div>
  );
}
