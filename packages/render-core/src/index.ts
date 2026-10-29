import {ProjectVFX} from '../../vfx-core/src/project';
import type {VFXScene} from '../../vfx-core/src/scene';
import { ParticleView } from './vfx';
// Pixi's official CSP-safe uniform/shader adapters avoid new Function/eval.
import "pixi.js/unsafe-eval";
import {
  characterMatrix,
  layerDisplayed,
  boneInView,
  renderMesh,
} from "../../document-core/src/character";
import {
  createSkinContext,
  type SkinContext,
  boneMatrices,
  skinVertices,
  inverse,
  transform,
  type Point,
} from "../../rig-core/src";
export type OverlayOptions = {
  showBones: boolean;
  showMesh: boolean;
  boneId: string | null;
  vertexId: string | null;
  layerId: string | null;
  weightBoneId?: string | null;
  tool?: string;
  showJoints?: boolean;
  showDepth?: boolean;
};
export type OverlayHit = {
  kind: "joint" | "tip" | "ik" | "vertex";
  id: string;
  meshId?: string;
};
import {
  Application,
  Container,
  Sprite,
  Texture,
  Graphics,
  Rectangle,
  Mesh,
  MeshGeometry,
  Matrix as PixiMatrix,
} from "pixi.js";
import {
  multiply,
  type ProjectDocument,
  type Matrix,
} from "../../document-core/src";
export function inversePoint(m: Matrix, x: number, y: number) {
  const det = m.a * m.d - m.b * m.c;
  return {
    x: (m.d * (x - m.tx) - m.c * (y - m.ty)) / det,
    y: (-m.b * (x - m.tx) + m.a * (y - m.ty)) / det,
  };
}
export class SceneRenderer {
  app = new Application();
  camera = new Container();
  particles = new ParticleView();
  world = new Container();
  selection = new Graphics();
  onions = new Container();
  ghosts: { root: Container; nodes: Map<string, Container> }[] = [];
  context: SkinContext | null = null;
  clearOnions() {
    for (const ghost of this.ghosts) {
      for (const node of ghost.nodes.values())
        if (node.children[0] instanceof Mesh)
          (node.children[0] as Mesh).geometry.destroy(true);
      ghost.root.destroy({ children: true });
    }
    this.ghosts = [];
  }
  updateOnions(
    poses: { doc: ProjectDocument; tint: number }[],
    opacity: number,
    render = true,
  ) {
    if (!this.ready || this.disposed) return;
    const bounded = poses.slice(0, 6);
    if (!bounded.length) {
      this.clearOnions();
      if (render) this.render();
      return;
    }
    while (this.ghosts.length > bounded.length) {
      const g = this.ghosts.pop()!;
      for (const node of g.nodes.values())
        if (node.children[0] instanceof Mesh)
          (node.children[0] as Mesh).geometry.destroy(true);
      g.root.destroy({ children: true });
    }
    while (this.ghosts.length < bounded.length) {
      const root = new Container(),
        nodes = new Map<string, Container>();
      this.onions.addChild(root);
      for (const [id, source] of this.nodes) {
        const node = new Container(),
          art = source.children[0];
        if (art instanceof Mesh)
          node.addChild(
            new Mesh({
              geometry: new MeshGeometry({
                positions: art.geometry.positions.slice(),
                uvs: art.geometry.uvs.slice(),
                indices: art.geometry.indices.slice(),
              }),
              texture: art.texture,
            }),
          );
        else node.addChild(new Sprite((art as Sprite).texture));
        nodes.set(id, node);
        root.addChild(node);
      }
      this.ghosts.push({ root, nodes });
    }
    bounded.forEach(({ doc, tint }, index) => {
      const g = this.ghosts[index];
      const ctx = createSkinContext(doc);
      for (const l of doc.layers) {
        const node = g.nodes.get(l.id);
        if (!node) continue;
        const parent = l.parentId ? g.nodes.get(l.parentId)! : g.root;
        if (node.parent !== parent) parent.addChild(node);
        const m = l.parentId
          ? multiply(
              inverse(ctx.layers.get(l.parentId)!),
              ctx.layers.get(l.id)!,
            )
          : ctx.layers.get(l.id)!;
        node.setFromMatrix(new PixiMatrix(m.a, m.b, m.c, m.d, m.tx, m.ty));
        node.visible = layerDisplayed(doc, l.id);
        node.alpha = l.opacity;
        const art = node.children[0] as Sprite | Mesh;
        art.tint = tint;
        if (art instanceof Sprite) this.applySpriteDirection(art, doc, l.id);
        const mesh = renderMesh(doc, l.id);
        if (mesh && art instanceof Mesh)
          this.writePositions(
            art,
            skinVertices(doc, mesh, ctx),
            inverse(ctx.layers.get(l.id)!),
          );
      }
      g.root.alpha = opacity;
    });
    if (render) this.render();
  }
  writePositions(art: Mesh, points: Point[], local: Matrix) {
    const positions = art.geometry.positions;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      positions[i * 2] = local.a * p.x + local.c * p.y + local.tx;
      positions[i * 2 + 1] = local.b * p.x + local.d * p.y + local.ty;
    }
    art.geometry.getBuffer("aPosition").update();
  }
  applySpriteDirection(art: Sprite, doc: ProjectDocument, layerId: string) {
    const layer = doc.layers.find((l) => l.id === layerId)!,
      part = doc.characterParts.find((p) => p.layerId === layerId),
      mirrored = characterMatrix(doc).a < 0;
    const counter = mirrored && !!part && part.mirrorPolicy !== "mirror";
    art.scale.x = counter ? -1 : 1;
    art.position.x = counter
      ? doc.assetReferences.find((a) => a.id === layer.assetId)!.width
      : 0;
    const asset =
      mirrored && part?.mirrorPolicy === "directional"
        ? part.leftAssetId
        : layer.assetId;
    if (asset && this.textures.has(asset))
      art.texture = this.textures.get(asset)!.texture;
  }
  applyCharacter(doc: ProjectDocument) {
    const m = characterMatrix(doc);
    this.world.setFromMatrix(new PixiMatrix(m.a, m.b, m.c, m.d, m.tx, m.ty));
    for (const l of doc.layers) {
      const art = this.nodes.get(l.id)?.children[0];
      if (art instanceof Sprite) this.applySpriteDirection(art, doc, l.id);
    }
  }
  extractFrame(width = 800, height = 800) {
    return this.app.renderer.extract.canvas({
      target: this.app.stage,
      frame: new Rectangle(0, 0, width, height),
      resolution: 1,
    });
  }
  updatePose(doc: ProjectDocument, render = true) {
    if (!this.ready || this.disposed || !this.nodes.size) return;
    this.doc = doc;
    this.applyCharacter(doc);
    const context = createSkinContext(doc);
    this.context = context;
    this.matrices = context.layers;
    for (const l of doc.layers) {
      const node = this.nodes.get(l.id);
      if (!node) continue;
      const m = l.parentId
        ? multiply(
            inverse(this.matrices.get(l.parentId)!),
            this.matrices.get(l.id)!,
          )
        : this.matrices.get(l.id)!;
      node.setFromMatrix(new PixiMatrix(m.a, m.b, m.c, m.d, m.tx, m.ty));
      node.alpha = l.opacity;
      node.visible = layerDisplayed(doc, l.id);
      const mesh = renderMesh(doc, l.id),
        art = node.children[0];
      if (mesh && art instanceof Mesh)
        this.writePositions(
          art,
          skinVertices(doc, mesh, context),
          inverse(this.matrices.get(l.id)!),
        );
    }
    this.drawOverlay();
    if (render) this.render();
  }

  overlay = new Graphics();
  options: OverlayOptions = {
    showBones: false,
    showMesh: false,
    boneId: null,
    vertexId: null,
    layerId: null,
  };
  matrices = new Map<string, Matrix>();
  setOverlay(options: OverlayOptions) {
    this.options = options;
    if (!this.ready || this.disposed) return;
    this.drawOverlay();
    this.render();
  }
  disposeArtwork(node: Container) {
    const art = node.children[0];
    if (art instanceof Mesh) art.geometry.destroy(true);
    art?.destroy();
  }

  nodes = new Map<string, Container>();
  textures = new Map<string, { data: string; texture: Texture }>();
  ready = false;
  disposed = false;
  loadVersion = 0;
  doc: ProjectDocument | null = null;
  async init(host: HTMLElement) {
    await this.app.init({
      backgroundAlpha: 0,
      preference: "webgl",
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: host,
      autoStart: false,
    });
    if (this.disposed) {
      this.app.destroy(
        { removeView: true, releaseGlobalResources: false },
        { children: true, context: true },
      );
      return;
    }
    host.append(this.app.canvas);
    this.app.stage.addChild(this.camera);
    this.camera.addChild(this.world, this.particles.root);
    this.world.addChildAt(this.onions, 0);
    this.world.addChild(this.selection, this.overlay);
    this.ready = true;
  }
  async setDocument(doc: ProjectDocument) {
    if (!this.ready || this.disposed) return;
    const version = ++this.loadVersion;
    for (const a of doc.assetReferences) {
      if (this.textures.get(a.id)?.data === a.data) continue;
      const image = new Image();
      image.src = a.data;
      await image.decode();
      if (this.disposed || version !== this.loadVersion) return;
      const texture = Texture.from(image);
      this.textures.get(a.id)?.texture.destroy(true);
      this.textures.set(a.id, { data: a.data, texture });
    }
    if (this.disposed || version !== this.loadVersion) return;
    this.clearOnions();
    this.doc = doc;
    this.applyCharacter(doc);
    this.context = createSkinContext(doc);
    for (const node of this.nodes.values()) this.world.addChild(node);
    for (const id of [...this.nodes.keys()])
      if (!doc.layers.some((l) => l.id === id)) {
        this.disposeArtwork(this.nodes.get(id)!);
        this.nodes.get(id)!.destroy({ children: true });
        this.nodes.delete(id);
      }
    for (const l of doc.layers) {
      let node = this.nodes.get(l.id);
      if (!node) {
        node = new Container();
        node.addChild(new Sprite(this.textures.get(l.assetId)!.texture));
        this.nodes.set(l.id, node);
      }
      const mesh = renderMesh(doc, l.id);
      let artwork = node.children[0];
      if (mesh) {
        if (!(artwork instanceof Mesh)) {
          this.disposeArtwork(node);
          artwork = new Mesh({
            geometry: new MeshGeometry({
              positions: new Float32Array(mesh.vertices.length * 2),
              uvs: new Float32Array(mesh.vertices.flatMap((v) => [v.u, v.v])),
              indices: new Uint32Array(mesh.triangles),
            }),
            texture: this.textures.get(l.assetId)!.texture,
          });
          node.addChildAt(artwork, 0);
        }
        const rendered = artwork as Mesh;
        const local = inverse(this.context!.layers.get(l.id)!);
        rendered.geometry.uvs = new Float32Array(
          mesh.vertices.flatMap((v) => [v.u, v.v]),
        );
        rendered.geometry.positions = new Float32Array(
          skinVertices(doc, mesh, this.context!).flatMap((p) => {
            const q = transform(local, p);
            return [q.x, q.y];
          }),
        );
        rendered.geometry.indices = new Uint32Array(mesh.triangles);
        rendered.texture = this.textures.get(l.assetId)!.texture;
      } else {
        if (!(artwork instanceof Sprite)) {
          this.disposeArtwork(node);
          artwork = new Sprite(this.textures.get(l.assetId)!.texture);
          node.addChildAt(artwork, 0);
        }
        (artwork as Sprite).texture = this.textures.get(l.assetId)!.texture;
      }
      node.alpha = l.opacity;
      node.visible = layerDisplayed(doc, l.id);
    }
    this.matrices = this.context!.layers;
    for (const l of doc.layers) {
      const node = this.nodes.get(l.id)!;
      const parent = l.parentId ? this.nodes.get(l.parentId)! : this.world;
      parent.addChild(node);
      const m = l.parentId
        ? multiply(
            inverse(this.matrices.get(l.parentId)!),
            this.matrices.get(l.id)!,
          )
        : this.matrices.get(l.id)!;
      node.setFromMatrix(new PixiMatrix(m.a, m.b, m.c, m.d, m.tx, m.ty));
    }
    this.applyCharacter(doc);
    this.world.addChild(this.selection, this.overlay);
    this.drawOverlay();
    for (const [id, t] of this.textures)
      if (!doc.assetReferences.some((a) => a.id === id)) {
        t.texture.destroy(true);
        this.textures.delete(id);
      }
    this.render();
  }
  setView(zoom: number, x: number, y: number) {
    if (this.disposed) return;
    this.camera.scale.set(zoom);
    this.camera.position.set(x, y);
    this.drawOverlay();
    this.render();
  }
  select(id: string | null, render = true) {
    if (!this.ready || this.disposed) return;
    this.selection.clear();
    if (id && this.doc) {
      const l = this.doc.layers.find((l) => l.id === id);
      const a = this.doc.assetReferences.find((a) => a.id === l?.assetId);
      if (l && a && layerDisplayed(this.doc, l.id)) {
        const m = this.matrices.get(l.id)!;
        const points = [
          [0, 0],
          [a.width, 0],
          [a.width, a.height],
          [0, a.height],
        ].map(([x, y]) => ({
          x: m.a * x + m.c * y + m.tx,
          y: m.b * x + m.d * y + m.ty,
        }));
        this.selection
          .poly(points.flatMap((p) => [p.x, p.y]))
          .stroke({ color: 0xb49aff, width: 1 / this.camera.scale.x });
        for (const p of points)
          this.selection
            .rect(
              p.x - 3 / this.camera.scale.x,
              p.y - 3 / this.camera.scale.x,
              6 / this.camera.scale.x,
              6 / this.camera.scale.x,
            )
            .fill(0xb49aff);
      }
    }
    if (render) this.render();
  }
  hit(x: number, y: number) {
    if (!this.doc) return null;
    for (const l of [...this.doc.layers].reverse()) {
      let p = l;
      let visible = layerDisplayed(this.doc, l.id);
      while (p.parentId) {
        p = this.doc.layers.find((n) => n.id === p.parentId)!;
        visible = visible && p.visible;
      }
      if (!visible || l.locked) continue;
      const mesh = renderMesh(this.doc, l.id);
      if (mesh) {
        const points = skinVertices(this.doc, mesh, this.context ?? undefined);
        for (let i = 0; i < mesh.triangles.length; i += 3) {
          const [a, b, c] = mesh.triangles
            .slice(i, i + 3)
            .map((id) => points[id]);
          const p = { x, y };
          const side = (a: Point, b: Point, c: Point) =>
            (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
          const signs = [side(a, b, p), side(b, c, p), side(c, a, p)];
          if (signs.every((s) => s >= 0) || signs.every((s) => s <= 0))
            return l.id;
        }
        continue;
      }
      const a = this.doc.assetReferences.find((a) => a.id === l.assetId)!;
      const q = inversePoint(this.matrices.get(l.id)!, x, y);
      if (q.x >= 0 && q.y >= 0 && q.x <= a.width && q.y <= a.height)
        return l.id;
    }
    return null;
  }
  drawOverlay() {
    if (!this.ready || this.disposed) return;
    this.overlay.clear();
    const doc = this.doc;
    if (!doc) return;
    const scale = this.camera.scale.x || 1,
      stroke = 1 / scale;
    if (this.options.showMesh) {
      for (const mesh of doc.meshes) {
        if (mesh.layerId !== this.options.layerId) continue;
        const points = skinVertices(doc, mesh, this.context ?? undefined);
        for (let i = 0; i < mesh.triangles.length; i += 3) {
          const tri = mesh.triangles.slice(i, i + 3).map((id) => points[id]);
          const cross =
            (tri[1].x - tri[0].x) * (tri[2].y - tri[0].y) -
            (tri[1].y - tri[0].y) * (tri[2].x - tri[0].x);
          this.overlay.poly(tri.flatMap((p) => [p.x, p.y])).stroke({
            color: cross <= 0 ? 0xff5b73 : 0x72d6d2,
            width: stroke,
            alpha: 0.6,
          });
        }
        const weights = new Map(
          doc.vertexWeights
            .filter((w) => w.meshId === mesh.id)
            .map((w) => [w.vertexId, w]),
        );
        points.forEach((p, i) => {
          const v = mesh.vertices[i];
          const weight = this.options.weightBoneId
            ? (weights
                .get(v.id)
                ?.influences.find((w) => w.boneId === this.options.weightBoneId)
                ?.weight ?? 0)
            : null;
          const color =
            weight === null
              ? 0x9de4dc
              : (Math.round(weight * 255) << 16) |
                (Math.round((1 - weight) * 180) << 8) |
                100;
          this.overlay
            .circle(
              p.x,
              p.y,
              (v.id === this.options.vertexId ? 5 : 2.4) / scale,
            )
            .fill(v.id === this.options.vertexId ? 0xffe19b : color);
        });
      }
    }
    if (this.options.showDepth) {
      for (const part of doc.characterParts) {
        if (!layerDisplayed(doc, part.layerId)) continue;
        const m = this.matrices.get(part.layerId);
        if (!m) continue;
        this.overlay
          .circle(m.tx, m.ty, 5 / scale)
          .fill(
            part.depth === "near"
              ? 0xffc47d
              : part.depth === "far"
                ? 0x74caec
                : 0xb29ce8,
          );
      }
    }
    if (this.options.showJoints) {
      const matrices = boneMatrices(doc);
      for (const joint of doc.characterJoints) {
        if (!boneInView(doc, joint.lowerBoneId)) continue;
        const m = matrices.get(joint.lowerBoneId)!;
        this.overlay
          .circle(m.tx, m.ty, joint.radius)
          .stroke({ color: 0x71e3d3, width: 1.5 / scale, alpha: 0.8 });
        this.overlay
          .circle(m.tx, m.ty, joint.radius * 0.6 + joint.underlapSize)
          .stroke({ color: 0xeab77c, width: 1 / scale, alpha: 0.45 });
      }
      for (const issue of doc.jointValidation?.issues ?? []) {
        const joint = doc.characterJoints.find((j) => j.id === issue.jointId);
        if (joint && boneInView(doc, joint.lowerBoneId))
          this.overlay
            .circle(issue.position.x, issue.position.y, 6 / scale)
            .stroke({
              color: issue.severity === "error" ? 0xff6178 : 0xffc47d,
              width: 2 / scale,
            });
      }
    }
    if (this.options.showBones) {
      const matrices = boneMatrices(doc);
      for (const b of doc.bones.filter((b) => boneInView(doc, b.id))) {
        const m = matrices.get(b.id)!,
          a = transform(m, { x: 0, y: 0 }),
          end = transform(m, { x: b.length, y: 0 });
        const selected = b.id === this.options.boneId;
        this.overlay
          .moveTo(a.x, a.y)
          .lineTo(end.x, end.y)
          .stroke({ color: 0x111722, width: 5 / scale, alpha: 0.9 });
        this.overlay
          .moveTo(a.x, a.y)
          .lineTo(end.x, end.y)
          .stroke({
            color: selected ? 0xffce78 : 0xb7a4ff,
            width: (selected ? 3 : 2) / scale,
            alpha: 0.95,
          });
        this.overlay
          .circle(a.x, a.y, 4 / scale)
          .fill(selected ? 0xffce78 : 0xd5c5ff)
          .stroke({ color: 0x242136, width: stroke });
        this.overlay
          .rect(end.x - 2.5 / scale, end.y - 2.5 / scale, 5 / scale, 5 / scale)
          .fill(selected ? 0xffce78 : 0xb7a4ff);
      }
      if (doc.rigSettings.mode === "pose")
        for (const t of doc.ikTargets.filter((t) =>
          boneInView(doc, t.rootBoneId),
        )) {
          const p = transform(matrices.get(t.endBoneId)!, { x: 0, y: 0 });
          this.overlay
            .circle(p.x, p.y, 8 / scale)
            .stroke({ color: 0x71e3d3, width: 2 / scale });
          if (t.enabled) {
            this.overlay
              .moveTo(p.x, p.y)
              .lineTo(t.x, t.y)
              .stroke({ color: 0x71e3d3, width: stroke, alpha: 0.6 });
            this.overlay
              .moveTo(t.x - 6 / scale, t.y)
              .lineTo(t.x + 6 / scale, t.y)
              .moveTo(t.x, t.y - 6 / scale)
              .lineTo(t.x, t.y + 6 / scale)
              .stroke({ color: 0x71e3d3, width: 2 / scale });
          }
        }
    }
  }
  hitOverlay(x: number, y: number): OverlayHit | null {
    const doc = this.doc;
    if (!doc) return null;
    const radius = 10 / (this.camera.scale.x || 1);
    const near = (p: Point) => Math.hypot(p.x - x, p.y - y) < radius;
    if (this.options.tool === "mesh" || this.options.tool === "weight") {
      const mesh = doc.meshes.find((m) => m.layerId === this.options.layerId);
      if (
        mesh &&
        this.options.showMesh &&
        !doc.layers.find((l) => l.id === mesh.layerId)?.locked
      ) {
        const points = skinVertices(doc, mesh, this.context ?? undefined);
        let nearest = -1,
          distance = radius;
        points.forEach((p, i) => {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < distance) {
            distance = d;
            nearest = i;
          }
        });
        if (nearest >= 0)
          return {
            kind: "vertex",
            id: mesh.vertices[nearest].id,
            meshId: mesh.id,
          };
      }
    }
    if (this.options.tool !== "bone" || !this.options.showBones) return null;
    const matrices = boneMatrices(doc);
    if (doc.rigSettings.mode === "pose")
      for (const t of doc.ikTargets.filter((t) =>
        boneInView(doc, t.rootBoneId),
      )) {
        if (
          (t.enabled && near(t)) ||
          near(transform(matrices.get(t.endBoneId)!, { x: 0, y: 0 }))
        )
          return { kind: "ik", id: t.id };
      }
    const bones = doc.bones
      .filter((b) => boneInView(doc, b.id))
      .sort((a, b) =>
        a.id === this.options.boneId
          ? -1
          : b.id === this.options.boneId
            ? 1
            : 0,
      );
    for (const b of bones)
      if (near(transform(matrices.get(b.id)!, { x: 0, y: 0 })))
        return { kind: "joint", id: b.id };
    for (const b of bones) {
      const m = matrices.get(b.id)!;
      if (near(transform(m, { x: b.length, y: 0 })))
        return { kind: "tip", id: b.id };
    }
    for (const b of bones) {
      const q = transform(inverse(matrices.get(b.id)!), { x, y });
      if (q.x >= 0 && q.x <= b.length && Math.abs(q.y) < radius * 0.6)
        return { kind: "tip", id: b.id };
    }
    return null;
  }
  render() {
    if (this.ready && !this.disposed) {
      try {this.app.render();} catch(error){if(!this.particles.hasFilters)throw error;this.particles.disableFilters('VFX filter fallback: '+String(error));this.app.render();}
    }
  }
  destroy() {
    // Other editor/export renderers share Pixi pools: release only this application's resources.
    this.clearOnions();
    this.disposed = true;
    this.loadVersion++;
    if (this.ready) {
      this.particles.destroy();
      for (const node of this.nodes.values())
        if (node.children[0] instanceof Mesh)
          (node.children[0] as Mesh).geometry.destroy(true);
      this.app.destroy(
        { removeView: true, releaseGlobalResources: false },
        { children: true, context: true },
      );
      for (const t of this.textures.values()) t.texture.destroy(true);
      this.textures.clear();
    }
    this.nodes.clear();
    this.matrices.clear();
    this.context = null;
    this.doc = null;
    this.ready = false;
  }
}
export async function exportPng(doc: ProjectDocument,effects?:VFXScene,quality:"low"|"medium"|"high"="medium") {
  const scene = new SceneRenderer();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;width:800px;height:800px;left:-9999px";
  document.body.append(host);
  try {
    await scene.init(host);
    await scene.setDocument(doc);
    scene.setView(1, 0, 0);
    scene.select(null);
    scene.particles.updateFrame(effects??new ProjectVFX().frame(doc,null,0,quality),scene.textures,0,quality);scene.render();
    const canvas = await scene.app.renderer.extract.canvas({
      target: scene.app.stage,
      frame: new Rectangle(0, 0, 800, 800),
      resolution: 1,
    });
    const blob = await new Promise<Blob>((resolve, reject) =>
      (canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(Error("PNG export failed"))),
        "image/png",
      ),
    );
    return blob;
  } finally {
    scene.destroy();
    host.remove();
  }
}
