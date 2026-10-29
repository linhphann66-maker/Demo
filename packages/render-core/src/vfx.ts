import {
  Container,
  Sprite,
  Texture,
  CanvasSource,
  Rectangle,
  Graphics,
  BlurFilter,
  Filter,
  GlProgram,
  UniformGroup,
} from "pixi.js";
import type { Particle } from "../../vfx-core/src";
import { emptyScene, type VFXScene } from "../../vfx-core/src/scene";
const vertex = `in vec2 aPosition;out vec2 vTextureCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0.0,1.0);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);}`;
const fragment = `in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;uniform vec4 uInputClamp;uniform float uDistortion;uniform float uDissolve;uniform float uTime;void main(){vec2 uv=vTextureCoord;uv.x+=sin(uv.y*45.0+uTime*5.0)*uDistortion*.001;vec4 c=texture(uTexture,clamp(uv,uInputClamp.xy,uInputClamp.zw));vec2 grid=floor(uv*256.0);float noise=fract(sin(dot(grid,vec2(12.9898,78.233)))*43758.5453);c*=step(uDissolve,noise);finalColor=c;}`;
type Group = {
  ribbons: Map<string, { main: Graphics; halo: Graphics }>;
  haloFlips: Sprite[];
  root: Container;
  content: Container;
  halo: Container;
  pool: Sprite[];
  haloPool: Sprite[];
  flips: Sprite[];
  ribbon: Graphics;
  blur: BlurFilter;
  shader: Filter | null;
  uniforms: UniformGroup | null;
};
/** One shared Pixi app, pooled GPU batch sprites, bounded geometry and scoped filters. */
export class ParticleView {
  root = new Container();
  private dot: Texture | null = null;
  overlay = new Graphics();
  private groups = new Map<string, Group>();
  private frameTextures = new Map<string, Texture>();
  errors: string[] = [];
  showGizmos = false;
  private texture(
    id: string | null | undefined,
    textures: Map<string, { texture: Texture }>,
  ) {
    if (id) return textures.get(id)?.texture ?? Texture.WHITE;
    if (!this.dot) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
      const ctx = canvas.getContext("2d")!,
        gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.3, "rgba(255,255,255,.9)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 32, 32);
      this.dot = new Texture({
        source: new CanvasSource({ resource: canvas }),
      });
    }
    return this.dot;
  }
  private group(id: string): Group {
    let g = this.groups.get(id);
    if (g) return g;
    const root = new Container(),
      content = new Container(),
      halo = new Container(),
      ribbon = new Graphics(),
      blur = new BlurFilter({ strength: 2, quality: 2 });
    halo.filters = [blur];
    halo.blendMode = "add";
    root.addChild(halo, content);
    content.addChild(ribbon);
    this.root.addChild(root);
    let shader: Filter | null = null,
      uniforms: UniformGroup | null = null;
    try {
      uniforms = new UniformGroup({
        uDistortion: { value: 0, type: "f32" },
        uDissolve: { value: 0, type: "f32" },
        uTime: { value: 0, type: "f32" },
      });
      shader = new Filter({
        glProgram: GlProgram.from({
          vertex,
          fragment,
          name: "vfx-distortion-dissolve",
        }),
        resources: { vfxUniforms: uniforms },
      });
    } catch (err) {
      this.errors.push("Shader không hỗ trợ: " + String(err));
    }
    g = {
      ribbons: new Map(),
      haloFlips: [],
      root,
      content,
      halo,
      pool: [],
      haloPool: [],
      flips: [],
      ribbon,
      blur,
      shader,
      uniforms,
    };
    this.groups.set(id, g);
    return g;
  }
  update(particles: Particle[]) {
    const frame = emptyScene();
    frame.particles = particles;
    this.updateFrame(frame, new Map());
  }
  updateFrame(
    frame: VFXScene,
    textures: Map<string, { texture: Texture }>,
    time = 0,
    quality: "low" | "medium" | "high" = "medium",
  ) {
    time = frame.time ?? time;
    const ids = new Set([
      ...frame.styles.map((s) => s.effectId),
      ...frame.particles.map((p) => p.id.split(":")[0]),
      ...frame.trails.map((t) => t.effectId),
      ...frame.flipbooks.map((f) => f.effectId),
      ...frame.styles.map((s) => s.effectId),
    ]);
    for (const [id, g] of this.groups)
      if (!ids.has(id)) {
        this.disposeGroup(g);
        this.groups.delete(id);
      }
    for (const id of ids) {
      const g = this.group(id);
      this.root.addChild(g.root);
      const particles = frame.particles
          .filter((p) => p.id.startsWith(id + ":"))
          .slice(0, 4096),
        style = frame.styles.find((s) => s.effectId === id),
        glow =
          quality === "low"
            ? 0
            : Math.min(
                12,
                style?.filters.find((f) => f.enabled && f.type === "GlowEffect")
                  ?.intensity ?? 0,
              );
      while (g.pool.length < particles.length) {
        const s = new Sprite(Texture.WHITE);
        s.anchor.set(0.5);
        g.pool.push(s);
        g.content.addChild(s);
      }
      while (glow > 0 && g.haloPool.length < particles.length) {
        const s = new Sprite(Texture.WHITE);
        s.anchor.set(0.5);
        g.haloPool.push(s);
        g.halo.addChild(s);
      }
      for (const [pool, isHalo] of [
        [g.pool, false],
        [g.haloPool, true],
      ] as const)
        pool.forEach((s, i) => {
          s.visible = i < particles.length && (!isHalo || glow > 0);
          if (!s.visible) return;
          const p = particles[i];
          s.texture = this.texture(p.textureId, textures);
          s.position.set(p.x, p.y);
          const extent=Math.max(s.texture.width,s.texture.height),size=p.size*(isHalo?2:1);
          s.width=size*s.texture.width/extent;s.height=size*s.texture.height/extent;
          s.rotation = p.rotation;
          s.scale.y = Math.abs(s.scale.y) * (p.flipY ? -1 : 1);
          s.tint = p.color;
          s.alpha = p.alpha * (isHalo ? Math.min(1, glow / 5) : 1);
          s.blendMode = isHalo ? "add" : p.blendMode;
        });
      const glowConfig = style?.filters.find(
        (f) => f.enabled && f.type === "GlowEffect",
      );
      g.halo.tint = glowConfig
        ? parseInt(glowConfig.color.slice(1), 16)
        : 0xffffff;
      g.halo.alpha = glowConfig?.opacity ?? 1;
      g.blur.strength = glow;
      g.blur.quality = quality === "high" ? 4 : 2;
      g.halo.visible = glow > 0;
      const trails = frame.trails.filter((t) => t.effectId === id),
        trailIds = new Set(trails.map((t) => t.id));
      for (const [key, view] of g.ribbons)
        if (!trailIds.has(key)) {
          view.main.destroy({ context: true });
          view.halo.destroy({ context: true });
          g.ribbons.delete(key);
        }
      for (const tr of trails) {
        let view = g.ribbons.get(tr.id);
        if (!view) {
          view = { main: new Graphics(), halo: new Graphics() };
          g.content.addChildAt(view.main, 0);
          g.halo.addChild(view.halo);
          g.ribbons.set(tr.id, view);
        }
        for (const [graphic, isHalo] of [
          [view.main, false],
          [view.halo, true],
        ] as const) {
          graphic.clear();
          graphic.blendMode = isHalo ? "add" : tr.blendMode;
          if (isHalo && glow === 0) continue;
          for (let i = 1; i < tr.rows.length; i++) {
            const a = tr.rows[i - 1],
              b = tr.rows[i];
            graphic.poly([a.x, a.y, a.bx, a.by, b.bx, b.by, b.x, b.y]).fill({
              color: b.color,
              alpha:
                ((a.alpha + b.alpha) / 2) *
                (isHalo ? Math.min(1, glow / 5) : 1),
              ...(tr.textureId
                ? { texture: this.texture(tr.textureId, textures) }
                : {}),
            });
          }
        }
      }
      const flips = frame.flipbooks.filter((f) => f.effectId === id);
      while (g.flips.length < flips.length) {
        const s = new Sprite(Texture.WHITE);
        s.anchor.set(0.5);
        g.flips.push(s);
        g.content.addChild(s);
      }
      g.flips.forEach((s, i) => {
        s.visible = i < flips.length;
        if (!s.visible) return;
        const f = flips[i],
          base = this.texture(f.assetId, textures),
          key = f.assetId + ":" + base.uid + ":" + JSON.stringify(f.rect);
        let texture = this.frameTextures.get(key);
        if (!texture) {
          texture = new Texture({
            source: base.source,
            frame: new Rectangle(f.rect.x, f.rect.y, f.rect.w, f.rect.h),
          });
          this.frameTextures.set(key, texture);
        }
        s.texture = texture;
        s.position.set(f.x, f.y);
        s.rotation = f.rotation;
        s.scale.set(f.scaleX, f.scaleY);
        s.alpha = f.alpha;
        s.blendMode = f.blendMode;
      });
      while (glow > 0 && g.haloFlips.length < flips.length) {
        const sprite = new Sprite(Texture.WHITE);
        sprite.anchor.set(0.5);
        g.haloFlips.push(sprite);
        g.halo.addChild(sprite);
      }
      g.haloFlips.forEach((sprite, i) => {
        const source = g.flips[i];
        sprite.visible = glow > 0 && !!source?.visible;
        if (!sprite.visible) return;
        sprite.texture = source.texture;
        sprite.position.copyFrom(source.position);
        sprite.rotation = source.rotation;
        sprite.scale.set(source.scale.x * 1.5, source.scale.y * 1.5);
        sprite.alpha = source.alpha * Math.min(1, glow / 5);
        sprite.blendMode = "add";
      });
      g.root.alpha = 1;
      g.root.tint = 0xffffff;
      g.root.position.set(0);
      g.root.pivot.set(0);
      g.root.scale.set(1);
      g.root.rotation = 0;
      let distortion = 0,
        dissolve = 0;
      for (const f of style?.filters ?? []) {
        if (!f.enabled) continue;
        if (f.type === "ColorModifier") {
          const c = parseInt(f.color.slice(1), 16),
            strength = Math.min(1, f.intensity / 2);
          g.root.tint = [16, 8, 0].reduce(
            (n, s) =>
              n | (Math.round(255 + (((c >> s) & 255) - 255) * strength) << s),
            0,
          );
          g.root.alpha *= 1 - (1 - f.opacity) * strength;
        }
        if (f.type === "TransformModifier") {
          const p = particles[0] ??
            frame.trails.find((t) => t.effectId === id)?.rows[0] ?? {
              x: 0,
              y: 0,
            };
          g.root.pivot.set(p.x, p.y);
          g.root.position.set(p.x + f.position.x, p.y + f.position.y);
          g.root.rotation = (f.rotation * Math.PI) / 180;
          g.root.scale.set(f.scale);
          g.root.alpha *= f.opacity;
        }
        if (f.type === "Distortion") distortion = f.intensity;
        if (f.type === "Dissolve") dissolve = f.intensity / 20;
      }
      if (g.uniforms) {
        g.uniforms.uniforms.uDistortion = distortion;
        g.uniforms.uniforms.uDissolve = dissolve;
        g.uniforms.uniforms.uTime = time;
      }
      g.root.filters =
        quality !== "low" && (distortion || dissolve) && g.shader
          ? [g.shader]
          : [];
    }
    let surplus = this.allocated - 8704;
    if (surplus > 0)
      for (const group of this.groups.values())
        for (const pool of [
          group.pool,
          group.haloPool,
          group.flips,
          group.haloFlips,
        ])
          while (surplus > 0 && pool.length && !pool[pool.length - 1].visible) {
            pool.pop()!.destroy();
            surplus--;
          }
    // Rect textures share sources; retain at most 1024 descriptors, never destroy sources here.
    if (this.frameTextures.size > 1024) {
      for (const [key, t] of this.frameTextures) {
        if (
          ![...this.groups.values()].some((g) =>
            g.flips.some((s) => s.visible && s.texture === t),
          )
        ) {
          t.destroy(false);
          this.frameTextures.delete(key);
          if (this.frameTextures.size <= 1024) break;
        }
      }
    }
    this.overlay.clear();
    if (this.showGizmos)
      for (const p of frame.gizmos) {
        this.overlay
          .circle(p.x, p.y, Math.max(5, p.radius))
          .stroke({ color: 0xbba0ff, width: 1, alpha: 0.6 });
        this.overlay
          .moveTo(p.x, p.y)
          .lineTo(p.x + Math.cos(p.angle) * 30, p.y + Math.sin(p.angle) * 30)
          .stroke({ color: 0xffcc66, width: 2 });
      }
    this.root.addChild(this.overlay);
  }
  private disposeGroup(g: Group) {
    g.root.destroy({ children: true, context: true });
    g.blur.destroy();
    g.shader?.destroy();
  }
  destroy() {
    for (const g of this.groups.values()) this.disposeGroup(g);
    this.groups.clear();
    for (const t of this.frameTextures.values()) t.destroy(false);
    this.frameTextures.clear();
    this.dot?.destroy(true);
    this.dot = null;
    this.overlay.destroy();
    this.root.destroy();
  }
  disableFilters(reason: string) {
    this.errors.push(reason);
    for (const g of this.groups.values()) {
      g.root.filters = [];
      g.halo.filters = [];
      g.halo.visible = false;
      g.shader?.destroy();
      g.shader = null;
    }
  }
  get hasFilters() {
    return [...this.groups.values()].some(
      (g) => g.root.filters?.length || g.halo.visible,
    );
  }
  get allocated() {
    return [...this.groups.values()].reduce(
      (n, g) =>
        n +
        g.pool.length +
        g.haloPool.length +
        g.flips.length +
        g.haloFlips.length,
      0,
    );
  }
}
