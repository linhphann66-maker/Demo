import {ProjectVFX} from '../../vfx-core/src/project';
import {vfxPoints} from './vfx';
import {
  characterMatrix,
  layerDisplayed,
  renderMesh,
} from "../../document-core/src/character";
import { Rectangle } from "pixi.js";
import { zipSync, strToU8 } from "fflate";
import type { ProjectDocument } from "../../document-core/src";
import { evaluateClip } from "../../animation-core/src";
import { createSkinContext, skinVertices, transform } from "../../rig-core/src";
import { SceneRenderer } from "../../render-core/src";
export type Bounds = { x: number; y: number; width: number; height: number };
export function compositionBounds(doc: ProjectDocument): Bounds {
  const ctx = createSkinContext(doc);
  const points: { x: number; y: number }[] = [];
  const byId = new Map(doc.layers.map((l) => [l.id, l]));
  for (const layer of doc.layers) {
    let ancestor = layer;
    let visible = layerDisplayed(doc, layer.id) && layer.opacity > 0;
    while (ancestor.parentId) {
      ancestor = byId.get(ancestor.parentId)!;
      visible = visible && ancestor.visible && ancestor.opacity > 0;
    }
    if (!visible) continue;
    const mesh = renderMesh(doc, layer.id);
    if (mesh) points.push(...skinVertices(doc, mesh, ctx));
    else {
      const asset = doc.assetReferences.find((a) => a.id === layer.assetId)!;
      const m = ctx.layers.get(layer.id)!;
      for (const [x, y] of [
        [0, 0],
        [asset.width, 0],
        [asset.width, asset.height],
        [0, asset.height],
      ])
        points.push(transform(m, { x, y }));
    }
  }
  if (!points.length) return { x: 0, y: 0, width: 1, height: 1 };
  const displayed = points.map((p) => transform(characterMatrix(doc), p));
  const x = Math.min(...displayed.map((p) => p.x)),
    y = Math.min(...displayed.map((p) => p.y)),
    right = Math.max(...displayed.map((p) => p.x)),
    bottom = Math.max(...displayed.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}
export function animationMetadata(doc: ProjectDocument, clipId: string) {
  const clip = doc.animationClips.find((c) => c.id === clipId);
  if (!clip) throw Error("Hãy chọn animation để xuất");
  return {
    format: "a2dstudio-animation",
    version: 1,
    projectId: doc.projectId,
    timeUnit: "seconds",
    direction: doc.characterSettings,
    clip,
    tracks: doc.keyframeTracks.filter((t) => t.clipId === clip.id),
    events: doc.animationEvents.filter((e) => e.clipId === clip.id),
    boneIds: doc.bones.map((b) => b.id),
    meshIds: doc.meshes.map((m) => m.id),
  };
}
export type SheetOptions = {
  quality?:"low"|"medium"|"high";
  vfxOnly?:boolean;
  includeVFX?:boolean;
  duration?:number;
  effectIds?:string[];
  fps: number;
  frameWidth: number;
  frameHeight: number;
  maxFrames?: number;
};
export function sheetPlan(
  doc: ProjectDocument,
  clipId: string,
  options: SheetOptions,
) {
  const clip = doc.animationClips.find((c) => c.id === clipId);
  if (!clip) throw Error("Hãy chọn animation");
  const { fps, frameWidth, frameHeight } = options;
  if (
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 60 ||
    ![frameWidth, frameHeight].every(
      (n) => Number.isInteger(n) && n >= 64 && n <= 2048,
    )
  )
    throw Error("FPS xuất cần 1–60, kích thước frame 64–2048 px");
  const duration=options.duration??clip.duration;
  if(!Number.isFinite(duration)||duration<=0||duration>120)throw Error("Invalid export duration");
  const loopMode=options.vfxOnly?doc.vfxGraphs.find(e=>options.effectIds?.includes(e.id))?.loopMode??clip.loopMode:clip.loopMode;
  const count =
    Math.ceil(duration * fps) + (loopMode === "once" ? 1 : 0);
  if (count > Math.min(options.maxFrames ?? 512, 512))
    throw Error("Spritesheet vượt 512 frames; giảm FPS hoặc duration");
  const columns = Math.min(
      Math.floor(8192 / frameWidth),
      Math.ceil(Math.sqrt((count * frameHeight) / frameWidth)),
    ),
    rows = Math.ceil(count / columns);
  if (
    rows * frameHeight > 8192 ||
    columns * frameWidth * rows * frameHeight > 64 * 1024 * 1024
  )
    throw Error("Spritesheet quá lớn: tối đa 8192 px mỗi chiều và 64M pixels");
  return {
    clip,
    duration,
    loopMode,
    count,
    columns,
    rows,
    times: Array.from({ length: count }, (_, i) =>
      Math.min(i / fps, duration),
    ),
  };
}
export async function exportSpritesheet(
  doc: ProjectDocument,
  clipId: string,
  options: SheetOptions,
  onProgress?: (progress: number) => void,
) {
  const plan = sheetPlan(doc, clipId, options),
    { frameWidth, frameHeight, fps } = options;
  const source=options.effectIds?{...doc,vfxGraphs:doc.vfxGraphs.filter(e=>options.effectIds!.includes(e.id))}:doc;
  const vfx=new ProjectVFX();
  const frameVFX=(time:number)=>options.includeVFX===false?null:vfx.frame(source,clipId,time,options.quality??"medium");
  let union: Bounds | null = null;
  for (const time of plan.times) {
    const frame=frameVFX(time);const points=frame?vfxPoints(frame):[];
    if(!options.vfxOnly){const c=compositionBounds(evaluateClip(doc,clipId,time,false));points.push({x:c.x,y:c.y},{x:c.x+c.width,y:c.y+c.height});}
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=points.length?Math.min(...xs):0,top=points.length?Math.min(...ys):0;
    const b={x:left,y:top,width:points.length?Math.max(1,Math.max(...xs)-left):1,height:points.length?Math.max(1,Math.max(...ys)-top):1};
    if (!union) union = b;
    else {
      const right = Math.max(union.x + union.width, b.x + b.width),
        bottom = Math.max(union.y + union.height, b.y + b.height);
      union = {
        x: Math.min(union.x, b.x),
        y: Math.min(union.y, b.y),
        width: 0,
        height: 0,
      };
      union.width = right - union.x;
      union.height = bottom - union.y;
    }
  }
  const bounds = union!;
  const padding = 8,
    scale = Math.min(
      (frameWidth - 2 * padding) / bounds.width,
      (frameHeight - 2 * padding) / bounds.height,
    ),
    x = (frameWidth - bounds.width * scale) / 2 - bounds.x * scale,
    y = (frameHeight - bounds.height * scale) / 2 - bounds.y * scale;
  const scene = new SceneRenderer(),
    host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-9999px;width:${frameWidth}px;height:${frameHeight}px`;
  document.body.append(host);
  const output = document.createElement("canvas");
  output.width = plan.columns * frameWidth;
  output.height = plan.rows * frameHeight;
  const ctx = output.getContext("2d")!;
  const frames: {
    index: number;
    time: number;
    duration: number;
    rect: { x: number; y: number; w: number; h: number };
  }[] = [];
  try {
    await scene.init(host);
    await scene.setDocument(doc);
    scene.world.visible=!options.vfxOnly;
    scene.setView(scale, x, y);
    for (let i = 0; i < plan.count; i++) {
      scene.updatePose(evaluateClip(doc, clipId, plan.times[i], false),false);
      const effects=frameVFX(plan.times[i]);if(effects)scene.particles.updateFrame(effects,scene.textures,plan.times[i],options.quality??"medium");
      scene.render();
      const frame = await scene.app.renderer.extract.canvas({
        target: scene.app.stage,
        frame: new Rectangle(0, 0, frameWidth, frameHeight),
        resolution: 1,
      });
      const left = (i % plan.columns) * frameWidth,
        top = Math.floor(i / plan.columns) * frameHeight;
      ctx.drawImage(frame as HTMLCanvasElement, left, top);
      frames.push({
        index: i,
        time: plan.times[i],
        duration:
          i < plan.count - 1
            ? plan.times[i + 1] - plan.times[i]
            : Math.max(0, plan.duration - plan.times[i]),
        rect: { x: left, y: top, w: frameWidth, h: frameHeight },
      });
      onProgress?.((i + 1) / plan.count);
      if (i % 8 === 7)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const png = await new Promise<Blob>((resolve, reject) =>
      output.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error("Không xuất được PNG"))),
        "image/png",
      ),
    );
    const metadata = {
      format: "a2dstudio-spritesheet",
      version: 1,
      clipId: plan.clip.id,
      name: plan.clip.name,
      duration: plan.duration,
      includesVFX:options.includeVFX!==false,
      vfxOnly:!!options.vfxOnly,
      fps,
      loopMode: plan.loopMode,
      quality:options.quality??"medium",
      direction: doc.characterSettings,
      frameWidth,
      frameHeight,
      columns: plan.columns,
      rows: plan.rows,
      sourceBounds: bounds,
      scale,
      translation: { x, y },
      frames,
      events: doc.animationEvents.filter((e) => e.clipId === clipId),
    };
    return { png, metadata };
  } finally {
    vfx.clear();
    scene.destroy();
    host.remove();
    output.width = 1;
    output.height = 1;
  }
}
export async function spritesheetPackage(
  result: Awaited<ReturnType<typeof exportSpritesheet>>,
) {
  return zipSync(
    {
      "spritesheet.png": new Uint8Array(await result.png.arrayBuffer()),
      "frames.json": strToU8(JSON.stringify(result.metadata, null, 2)),
    },
    { level: 6 },
  );
}
