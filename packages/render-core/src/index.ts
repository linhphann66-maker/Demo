import {
  Application,
  Container,
  Sprite,
  Texture,
  Graphics,
  Rectangle,
} from "pixi.js";
import {
  worldMatrix,
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
  world = new Container();
  selection = new Graphics();
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
      this.app.destroy(true, { children: true });
      return;
    }
    host.append(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.selection);
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
    this.doc = doc;
    for (const node of this.nodes.values()) this.world.addChild(node);
    for (const id of [...this.nodes.keys()])
      if (!doc.layers.some((l) => l.id === id)) {
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
      const sprite = node.children[0] as Sprite;
      sprite.texture = this.textures.get(l.assetId)!.texture;
      node.position.set(l.x, l.y);
      node.scale.set(l.scaleX, l.scaleY);
      node.rotation = (l.rotation * Math.PI) / 180;
      node.alpha = l.opacity;
      node.visible = l.visible;
    }
    for (const l of doc.layers) {
      const node = this.nodes.get(l.id)!;
      const parent = l.parentId ? this.nodes.get(l.parentId)! : this.world;
      parent.addChild(node);
    }
    this.world.addChild(this.selection);
    for (const [id, t] of this.textures)
      if (!doc.assetReferences.some((a) => a.id === id)) {
        t.texture.destroy(true);
        this.textures.delete(id);
      }
    this.render();
  }
  setView(zoom: number, x: number, y: number) {
    this.world.scale.set(zoom);
    this.world.position.set(x, y);
    this.render();
  }
  select(id: string | null) {
    this.selection.clear();
    if (id && this.doc) {
      const l = this.doc.layers.find((l) => l.id === id);
      const a = this.doc.assetReferences.find((a) => a.id === l?.assetId);
      if (l && a && l.visible) {
        const m = worldMatrix(this.doc, l);
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
          .stroke({ color: 0xb49aff, width: 1 / this.world.scale.x });
        for (const p of points)
          this.selection
            .rect(
              p.x - 3 / this.world.scale.x,
              p.y - 3 / this.world.scale.x,
              6 / this.world.scale.x,
              6 / this.world.scale.x,
            )
            .fill(0xb49aff);
      }
    }
    this.render();
  }
  hit(x: number, y: number) {
    if (!this.doc) return null;
    for (const l of [...this.doc.layers].reverse()) {
      let p = l;
      let visible = l.visible;
      while (p.parentId) {
        p = this.doc.layers.find((n) => n.id === p.parentId)!;
        visible = visible && p.visible;
      }
      if (!visible || l.locked) continue;
      const a = this.doc.assetReferences.find((a) => a.id === l.assetId)!;
      const q = inversePoint(worldMatrix(this.doc, l), x, y);
      if (q.x >= 0 && q.y >= 0 && q.x <= a.width && q.y <= a.height)
        return l.id;
    }
    return null;
  }
  render() {
    if (this.ready && !this.disposed) this.app.render();
  }
  destroy() {
    this.disposed = true;
    this.loadVersion++;
    if (this.ready) {
      this.app.destroy(true, { children: true });
      for (const t of this.textures.values()) t.texture.destroy(true);
      this.textures.clear();
    }
    this.ready = false;
  }
}
export async function exportPng(doc: ProjectDocument) {
  const scene = new SceneRenderer();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;width:800px;height:800px;left:-9999px";
  document.body.append(host);
  try {
    await scene.init(host);
    await scene.setDocument(doc);
    scene.setView(1, 0, 0);
    scene.select(null);
    const canvas = await scene.app.renderer.extract.canvas({
      target: scene.world,
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
