import {
  type ProjectDocument,
  multiply,
  characterMatrix,
  boneInView,
} from "../../document-core/src";
import { boneMatrices } from "../../rig-core/src";
import { evaluateClip } from "../../animation-core/src/evaluation";
import { evaluateParticles, type Particle, type Transform } from "./index";
import { parameterEffect } from "./parameters";
import {
  emptyScene,
  attachmentMatrix,
  evaluateTrail,
  type VFXScene,
} from "./scene";
export class ProjectVFX {
  private base: ProjectDocument | null = null;
  private cache = new Map<string, Map<string, Transform>>();
  frame(
    base: ProjectDocument,
    clipId: string | null,
    time: number,
    quality: "low" | "medium" | "high" = "medium",
    currentPose?: ProjectDocument,
  ): VFXScene {
    if (this.base !== base) {
      this.clear();
      this.base = base;
    }
    const frame = emptyScene();
    if (!Number.isFinite(time) || time < 0) return frame;
    const clip = base.animationClips.find((c) => c.id === clipId),
      clipTime = clip?.loopMode === "loop" ? time % clip.duration : time;
    const viewDoc =
      currentPose ??
      (clipId ? evaluateClip(base, clipId, clipTime, false) : base);
    frame.time = clipTime;
    const sample = (boneId: string | null, t: number) => {
      const key = `${clipId}:${t}`;
      let poses = this.cache.get(key);
      const override = currentPose && Math.abs(t - clipTime) < 1e-7;
      if (!poses || override) {
        const doc = override
            ? currentPose!
            : clipId
              ? evaluateClip(base, clipId, t, false)
              : base,
          actor = characterMatrix(doc);
        poses = new Map(
          [...boneMatrices(doc)].map(([id, m]) => [id, multiply(actor, m)]),
        );
        poses.set("", actor);
        if (!override) this.cache.set(key, poses);
        if (this.cache.size > 512)
          this.cache.delete(this.cache.keys().next().value!);
      }
      return poses.get(boneId ?? "") ?? poses.get("")!;
    };
    for (const source of base.vfxGraphs) {
      if (!source.enabled) continue;
      const binding = source.trigger;
      if (binding?.clipId && binding.clipId !== clipId) continue;
      const startEvent = binding?.startEventId
        ? base.animationEvents.find(
            (e) => e.id === binding.startEventId && e.enabled,
          )
        : null;
      if (binding?.startEventId && !startEvent) continue;
      const start = (startEvent?.time ?? 0) + (binding?.delay ?? 0),
        elapsed = clipTime - start;
      if (elapsed < 0) continue;
      const stopEvent = binding?.stopEventId
        ? base.animationEvents.find(
            (e) => e.id === binding.stopEventId && e.enabled,
          )
        : null;
      const stop = Math.max(
        0,
        Math.min(
          source.duration,
          (stopEvent?.time ?? start + source.duration) - start,
        ),
      );
      const localTime = binding
        ? elapsed
        : source.loopMode === "loop"
          ? elapsed % source.duration
          : elapsed;
      const origin = binding
        ? start
        : source.loopMode === "loop"
          ? clipTime - localTime
          : 0;
      const at = (id: string | null, t: number) => sample(id, t + origin);
      const e = parameterEffect(source, localTime);
      e.nodes = e.nodes.filter(
        (n) => !n.attachment.boneId || boneInView(viewDoc, n.attachment.boneId),
      );
      if (binding) {
        e.loopMode = "once";
        e.duration = Math.max(0.000001, stop);
        if (binding.mode === "burst") e.nodes.forEach((n) => (n.rate = 0));
      }
      frame.particles.push(
        ...evaluateParticles(e, localTime, at, quality, (t) =>
          parameterEffect(e, t),
        ).slice(0, 4096 - frame.particles.length),
      );
      frame.styles.push({ effectId: e.id, filters: e.filters ?? [] });
      for (const n of e.nodes) {
        const m = attachmentMatrix(n.attachment, localTime, at);
        frame.gizmos.push({
          effectId: e.id,
          targetId: n.id,
          kind: "emitter",
          boneId: n.attachment.boneId,
          x: m.a * n.position.x + m.c * n.position.y + m.tx,
          y: m.b * n.position.x + m.d * n.position.y + m.ty,
          radius: n.radius,
          angle: Math.atan2(m.b, m.a) + (n.rotation * Math.PI) / 180,
        });
      }
      for (const tr of e.trails ?? [])
        if (
          tr.enabled &&
          (!tr.tip.boneId || boneInView(viewDoc, tr.tip.boneId))
        ) {
          frame.trails.push(evaluateTrail(e, tr, localTime, stop, at));
          for (const kind of ["base", "tip"] as const) {
            const a = tr[kind],
              m = attachmentMatrix(a, localTime, at);
            frame.gizmos.push({
              effectId: e.id,
              targetId: tr.id,
              kind,
              boneId: a.boneId,
              x: m.tx,
              y: m.ty,
              radius: 3,
              angle: Math.atan2(m.b, m.a),
            });
          }
        }
      for (const flip of e.flipbooks ?? []) {
        if (!flip.enabled || localTime > stop) continue;
        let index = Math.floor(localTime * flip.fps) + flip.frameOffset;
        if (flip.loop) index %= flip.frames.length;
        else index = Math.min(index, flip.frames.length - 1);
        const m = attachmentMatrix(flip.attachment, localTime, at);
        frame.gizmos.push({
          effectId: e.id,
          targetId: flip.id,
          kind: "flipbook",
          boneId: flip.attachment.boneId,
          x: m.tx,
          y: m.ty,
          radius: 4,
          angle: Math.atan2(m.b, m.a),
        });
        frame.flipbooks.push({
          id: flip.id,
          effectId: e.id,
          assetId: flip.assetId,
          rect: flip.frames[index],
          x: m.tx,
          y: m.ty,
          rotation: Math.atan2(m.b, m.a) + (flip.rotation * Math.PI) / 180,
          scaleX: Math.hypot(m.a, m.b) * flip.scale,
          scaleY:
            Math.hypot(m.c, m.d) *
            flip.scale *
            (m.a * m.d - m.b * m.c < 0 ? -1 : 1),
          alpha: flip.opacity,
          blendMode: flip.blendMode,
        });
      }
    }
    return frame;
  }
  evaluate(
    base: ProjectDocument,
    clipId: string | null,
    time: number,
    quality: "low" | "medium" | "high" = "medium",
  ): Particle[] {
    return this.frame(base, clipId, time, quality).particles;
  }
  clear() {
    this.cache.clear();
    this.base = null;
  }
  get cacheSize() {
    return this.cache.size;
  }
}
