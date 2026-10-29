import {emptyScene} from '../../../packages/vfx-core/src/scene';
import {multiply,type Matrix} from '../../../packages/document-core/src';
import {boneMatrices} from '../../../packages/rig-core/src';
import {findVFXAttachment} from '../../../packages/editor-core/src/vfx-actions';
import type {VFXGizmo} from '../../../packages/vfx-core/src/scene';
import { useVFXSession } from '../../../packages/editor-core/src/vfx-state';
import { ProjectVFX } from '../../../packages/vfx-core/src/project';
import { useJointOverlay } from "./CharacterPanel";
import { characterMatrix } from "../../../packages/document-core/src/character";
import { useAnimation } from "../../../packages/editor-core/src/animation-state";
import {
  getPreviewDocument,
  onionPoses,
} from "../../../packages/editor-core/src/animation-preview";
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
  Bone,
  Network,
  Paintbrush,
} from "lucide-react";
import { SceneRenderer } from "../../../packages/render-core/src";
import { type ProjectDocument } from "../../../packages/document-core/src";
import {
  evaluatedLayerMatrices,
  inverse,
  transform,
  solveTwoBone,
} from "../../../packages/rig-core/src";
import { moveJoint } from "../../../packages/editor-core/src/rig-actions";
import { moveVertexWorld } from "../../../packages/mesh-core/src";
import type { OverlayHit } from "../../../packages/render-core/src";
import { RigToolbar } from "./RigPanels";
import { useEditor } from "../../../packages/editor-core/src/store";
export function Viewport({ en }: { en: boolean }) {
  const doc = useEditor((s) => s.document)!;
  const jointOverlay = useJointOverlay();
  const selected = useEditor((s) => s.selectedId);
  const editTool = useEditor((s) => s.tool),
    boneId = useEditor((s) => s.selectedBoneId),
    vertexId = useEditor((s) => s.selectedVertexId),
    showBones = useEditor((s) => s.showBones),
    showMesh = useEditor((s) => s.showMesh);

  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneRenderer | null>(null);
  const vfx = useRef(new ProjectVFX());
  const [ready, setReady] = useState(false);
  const [grid, setGrid] = useState(true);
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [view, setView] = useState({ zoom: 0.7, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const vfxDrag=useRef<{original:ProjectDocument;preview:ProjectDocument;handle:VFXGizmo;startX:number;startY:number;initial:{x:number;y:number};inverse:Matrix;moved:boolean}|null>(null);
  const drag = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    pan: boolean;
    original: ProjectDocument;
    preview?: ProjectDocument;
    hit?: OverlayHit | null;
    moved: boolean;
  } | null>(null);
  const refreshPreview = () => {
    const base = useEditor.getState().document;
    if (!base) return;
    const renderer = scene.current;
    if (!renderer?.ready) return;
    const preview=getPreviewDocument(base);
    renderer.updatePose(preview, false);
    const animation=useAnimation.getState();
    const quality=useVFXSession.getState().quality;
    renderer.particles.showGizmos=useVFXSession.getState().gizmos;
    renderer.particles.updateFrame(useVFXSession.getState().active?vfx.current.frame(base, animation.enabled?animation.activeClipId:null, animation.enabled?animation.time:0,quality,preview):emptyScene(),renderer.textures,animation.time,quality);
    renderer.updateOnions(
      onionPoses(base),
      useAnimation.getState().onion.opacity,
      false,
    );
    renderer.select(useEditor.getState().selectedId, false);
    renderer.render();
    if(renderer.particles.errors.length)useVFXSession.setState({warnings:renderer.particles.errors.splice(0)});
  };
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
      vfx.current.clear();
      renderer.destroy();
    };
  }, []);
  useEffect(() => {
    if (ready)
      scene.current
        ?.setDocument(doc)
        .then(refreshPreview)
        .catch((e) => useEditor.getState().setError(String(e)));
  }, [doc, ready]);
  useEffect(()=>{const canvas=scene.current?.ready?scene.current.app.canvas:null;if(!canvas)return;const lost=(event:Event)=>{event.preventDefault();useAnimation.getState().pause();useVFXSession.setState({warnings:['WebGL bị gián đoạn. Preview đã tạm dừng; chờ khôi phục hoặc tải lại trang.']});};canvas.addEventListener('webglcontextlost',lost);return ()=>canvas.removeEventListener('webglcontextlost',lost);},[ready]);
  useEffect(()=>useVFXSession.subscribe(()=>refreshPreview()),[ready]);
  useEffect(() => {
    if (!ready) return;
    return useAnimation.subscribe((state, previous) => {
      if (
        state.activeClipId !== previous.activeClipId ||
        state.time !== previous.time ||
        state.override !== previous.override ||
        state.enabled !== previous.enabled ||
        state.transition !== previous.transition ||
        state.onion !== previous.onion ||
        state.editVersion !== previous.editVersion
      )
        refreshPreview();
    });
  }, [ready]);
  useEffect(() => {
    scene.current?.setView(view.zoom, view.x, view.y);
    scene.current?.select(selected);
  }, [view, selected, ready, size]);
  useEffect(() => {
    scene.current?.setOverlay({
      showBones,
      showMesh,
      showJoints: jointOverlay.joints,
      showDepth: jointOverlay.depth,
      boneId,
      vertexId,
      layerId: selected,
      tool: editTool,
      weightBoneId:
        editTool === "weight"
          ? doc.meshes
              .find((m) => m.layerId === selected)
              ?.boneIds.includes(boneId ?? "")
            ? boneId
            : doc.meshes.find((m) => m.layerId === selected)?.boneIds[0]
          : null,
    });
  }, [
    showBones,
    showMesh,
    boneId,
    vertexId,
    selected,
    editTool,
    ready,
    doc,
    jointOverlay,
  ]);
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
      <RigToolbar en={en} />
      <div className="viewport-heading">
        <span>
          <span className="live-dot" /> {en ? "Scene" : "Khung cảnh"}{" "}
          <span className="muted">/</span> <strong>{doc.metadata.name}</strong>
        </span>
        <span className="viewport-tag">
          {doc.characterSettings.characterView === "side_3_4"
            ? `SIDE 3/4 · ${doc.characterSettings.facing.toUpperCase()}`
            : en
              ? "FRONT · LEGACY REFERENCE"
              : "CHÍNH DIỆN · THAM CHIẾU"}
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
          if(useVFXSession.getState().active&&useVFXSession.getState().gizmos&&e.button===0&&tool!=='pan'){
            const animation=useAnimation.getState(),pose=getPreviewDocument(doc),point={x:(e.clientX-r.left-v.x)/v.zoom,y:(e.clientY-r.top-v.y)/v.zoom};
            const handles=vfx.current.frame(doc,animation.enabled?animation.activeClipId:null,animation.enabled?animation.time:0,useVFXSession.getState().quality,pose).gizmos;
            const handle=[...handles].sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y)).find(h=>Math.hypot(h.x-point.x,h.y-point.y)<12/v.zoom);
            if(handle){const a=findVFXAttachment(doc,handle);if(a){const actor=characterMatrix(pose),bone=handle.boneId?boneMatrices(pose).get(handle.boneId):undefined,parent=bone?multiply(actor,bone):actor;vfxDrag.current={original:doc,preview:{...doc,vfxGraphs:structuredClone(doc.vfxGraphs)},handle,startX:e.clientX,startY:e.clientY,initial:{...(a.followPosition===false?(a.fixedPosition??{x:0,y:0}):a.offset)},inverse:inverse(parent),moved:false};return;}}
          }
          const local = transform(
            inverse(characterMatrix(getPreviewDocument(doc))),
            {
              x: (e.clientX - r.left - v.x) / v.zoom,
              y: (e.clientY - r.top - v.y) / v.zoom,
            },
          );
          const { x, y } = local;
          const pan = tool === "pan" || e.button === 1;
          const hit = pan ? null : scene.current?.hitOverlay(x, y);
          let id = pan || hit ? null : (scene.current?.hit(x, y) ?? null);
          if (hit?.kind === "vertex") useEditor.getState().selectVertex(hit.id);
          else if (hit?.kind === "ik") {
            const target = doc.ikTargets.find((t) => t.id === hit.id)!;
            useEditor.getState().selectBone(target.endBoneId);
          } else if (hit) useEditor.getState().selectBone(hit.id);
          else if (!pan) {
            useEditor.getState().select(id);
            if (editTool === "bone") id = null;
          }
          const editing = getPreviewDocument(doc);
          const layer = editing.layers.find((l) => l.id === id);
          drag.current = {
            id,
            startX: e.clientX,
            startY: e.clientY,
            x: pan ? v.x : (layer?.x ?? 0),
            y: pan ? v.y : (layer?.y ?? 0),
            dx: 0,
            dy: 0,
            pan,
            original: editing,
            hit,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const active=vfxDrag.current;
          if(active){const dx=(e.clientX-active.startX)/viewRef.current.zoom,dy=(e.clientY-active.startY)/viewRef.current.zoom,a=findVFXAttachment(active.preview,active.handle);if(!a)return;active.moved=Math.abs(dx)+Math.abs(dy)>.1;const x=a.followPosition===false?dx:active.inverse.a*dx+active.inverse.c*dy,y=a.followPosition===false?dy:active.inverse.b*dx+active.inverse.d*dy,target=a.followPosition===false?(a.fixedPosition??={x:0,y:0}):a.offset;target.x=Math.max(-10000,Math.min(10000,active.initial.x+x));target.y=Math.max(-10000,Math.min(10000,active.initial.y+y));const animation=useAnimation.getState(),quality=useVFXSession.getState().quality,renderer=scene.current;if(renderer){renderer.particles.updateFrame(vfx.current.frame(active.preview,animation.enabled?animation.activeClipId:null,animation.enabled?animation.time:0,quality,getPreviewDocument(active.original)),renderer.textures,animation.time,quality);renderer.render();}return;}

          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.startX,
            dy = e.clientY - d.startY;
          d.moved = Math.hypot(dx, dy) > 1;
          if (d.pan) {
            setView((v) => ({ ...v, x: d.x + dx, y: d.y + dy }));
            return;
          }
          if (!d.moved) return;
          const bounds = e.currentTarget.getBoundingClientRect(),
            v = viewRef.current;
          const point = transform(inverse(characterMatrix(d.original)), {
            x: (e.clientX - bounds.left - v.x) / v.zoom,
            y: (e.clientY - bounds.top - v.y) / v.zoom,
          });
          const preview = structuredClone(d.original);
          try {
            if (d.hit) {
              if (d.hit.kind === "ik") solveTwoBone(preview, d.hit.id, point);
              else if (d.hit.kind === "vertex")
                moveVertexWorld(preview, d.hit.meshId!, d.hit.id, point);
              else moveJoint(preview, d.hit.id, point, d.hit.kind === "tip");
            } else if (d.id) {
              const original = d.original.layers.find((l) => l.id === d.id)!;
              const origin = evaluatedLayerMatrices(preview).get(d.id)!;
              const l = preview.layers.find((l) => l.id === d.id)!;
              l.x += 1;
              const xMatrix = evaluatedLayerMatrices(preview).get(d.id)!;
              l.x -= 1;
              l.y += 1;
              const yMatrix = evaluatedLayerMatrices(preview).get(d.id)!;
              l.y -= 1;
              const basis = {
                a: xMatrix.tx - origin.tx,
                b: xMatrix.ty - origin.ty,
                c: yMatrix.tx - origin.tx,
                d: yMatrix.ty - origin.ty,
                tx: 0,
                ty: 0,
              };
              const delta = transform(inverse(basis), {
                x: (dx / v.zoom) * characterMatrix(d.original).a,
                y: dy / v.zoom,
              });
              l.x = Math.round(original.x + delta.x);
              l.y = Math.round(original.y + delta.y);
            } else return;
            d.preview = preview;
            scene.current?.updatePose(preview);
            scene.current?.select(selected);
          } catch (error) {
            useEditor.getState().setError(String(error));
          }
        }}
        onPointerUp={() => {
          const active=vfxDrag.current;if(active){vfxDrag.current=null;if(active.moved&&useEditor.getState().document===active.original){const result=findVFXAttachment(active.preview,active.handle)!;useEditor.getState().command('Kéo VFX attachment',d=>{const a=findVFXAttachment(d,active.handle);if(a){a.offset={...result.offset};if(result.fixedPosition)a.fixedPosition={...result.fixedPosition};}});}else refreshPreview();return;}

          const d = drag.current;
          drag.current = null;
          if (d?.preview && d.moved) {
            useEditor
              .getState()
              .commitPreview(
                d.hit?.kind === "ik"
                  ? "Kéo IK"
                  : d.hit?.kind === "vertex"
                    ? "Kéo vertex"
                    : d.hit
                      ? "Kéo khớp"
                      : "Di chuyển lớp",
                d.original,
                d.preview,
                d.hit?.kind === "ik"
                  ? "ik"
                  : d.hit?.kind === "vertex"
                    ? "mesh"
                    : d.hit
                      ? "bone"
                      : "layer",
              );
          }
          refreshPreview();
        }}
        onPointerCancel={() => {
          if(vfxDrag.current){vfxDrag.current=null;refreshPreview();return;}
          drag.current = null;
          refreshPreview();
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
            className={
              tool === "select" && editTool === "select" ? "active" : ""
            }
            onClick={() => {
              setTool("select");
              useEditor.getState().setTool("select");
            }}
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
        <div className="tool-group rig-tool-group">
          {(
            [
              { id: "bone", label: "Bone Tool", Icon: Bone },
              { id: "mesh", label: "Mesh Tool", Icon: Network },
              { id: "weight", label: "Weight Tool", Icon: Paintbrush },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              aria-label={label}
              title={label}
              className={editTool === id && tool !== "pan" ? "active" : ""}
              onClick={() => {
                setTool("select");
                useEditor.getState().setTool(id);
              }}
            >
              <Icon size={16} />
            </button>
          ))}
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
