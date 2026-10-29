import type { ProjectDocument } from "../../document-core/src";
import { boneInView, clipInView } from "../../document-core/src/character";
import { createParticleEffect, duplicateEffect } from "./index";
import type { VFXEffect, Trail, VFXAttachment } from "./schema";
import { effectAttachments } from "./validation";
export const presetNames = [
  "Sword Fire",
  "Fire Slash",
  "Impact Burst",
  "Magic Aura",
  "Footstep Dust",
] as const;
export function defaultAttachment(
  boneId: string | null,
  x = 0,
  y = 0,
): VFXAttachment {
  return {
    boneId,
    offset: { x, y },
    rotation: 0,
    scale: 1,
    followRotation: true,
    followScale: true,
    followPosition: true,
  };
}
export function createTrail(boneId: string | null, length = 100): Trail {
  return {
    id: crypto.randomUUID(),
    type: "TrailRenderer",
    name: "Sword ribbon",
    enabled: true,
    base: defaultAttachment(boneId),
    tip: defaultAttachment(boneId, length, 0),
    width: length,
    lifetime: 0.22,
    sampleRate: 90,
    segmentLimit: 64,
    color: "#fff477",
    endColor: "#f44316",
    opacity: 0.85,
    taper: 0.9,
    smoothing: true,
    blendMode: "add",
    textureId: null,
  };
}
export function makePreset(
  name: (typeof presetNames)[number],
  doc: ProjectDocument,
  clipId?: string | null,
): VFXEffect {
  const bones = doc.bones.filter((b) => boneInView(doc, b.id)),
    bone = (pattern: RegExp) => bones.find((b) => pattern.test(b.name));
  const weapon = bone(/weapon.*socket/i),
    root = bone(/^root$/i),
    foot = bone(/near foot|left foot/i),
    e = createParticleEffect(weapon?.id ?? null),
    n = e.nodes[0];
  e.name = name + " · procedural";
  e.metadata.description = "Editable procedural reference preset: " + name;
  if (name === "Sword Fire") {
    n.attachment.offset.x = (weapon?.length ?? 110) * 0.5;
    n.radius = (weapon?.length ?? 110) * 0.4;
    n.rotation = 180;
    n.shape = "line";
    e.filters = [
      {
        id: crypto.randomUUID(),
        type: "GlowEffect",
        enabled: true,
        intensity: 3,
        color: "#ffaa33",
        opacity: 1,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: 1,
      },
    ];
    const sparks = structuredClone(n);
    sparks.id = crypto.randomUUID();
    sparks.name = "Heat sparks";
    sparks.size = 3;
    sparks.rate = 20;
    sparks.speed = 150;
    sparks.lifetime = 0.35;
    sparks.color = "#ffffcc";
    e.nodes.push(sparks);
  }
  if (name === "Fire Slash") {
    n.enabled = false;
    e.loopMode = "once";
    e.duration = 1;
    e.trails = [createTrail(weapon?.id ?? null, weapon?.length ?? 100)];
  }
  if (name === "Impact Burst") {
    e.duration = 0.4;
    e.loopMode = "once";
    Object.assign(n, {
      rate: 0,
      burst: 75,
      space: "world",
      shape: "point",
      speed: 240,
      spread: 360,
      lifetime: 0.4,
      size: 7,
      endScale: 0.05,
    });
    n.attachment.offset.x = weapon?.length ?? 100;
  }
  if (name === "Magic Aura") {
    n.attachment = defaultAttachment(root?.id ?? null, 0, -80);
    Object.assign(n, {
      rate: 35,
      burst: 10,
      shape: "ring",
      radius: 65,
      rotation: -90,
      speed: 25,
      spread: 160,
      size: 5,
      lifetime: 1.8,
      color: "#8b60ff",
      endColor: "#55ddff",
    });
    n.orbitVelocity = 25;
    n.acceleration = { x: 0, y: -10 };
    e.filters = [
      {
        id: crypto.randomUUID(),
        type: "GlowEffect",
        enabled: true,
        intensity: 2,
        color: "#aa88ff",
        opacity: 1,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: 1,
      },
    ];
  }
  if (name === "Footstep Dust") {
    n.attachment = defaultAttachment(foot?.id ?? root?.id ?? null);
    e.loopMode = "once";
    e.duration = 0.5;
    Object.assign(n, {
      rate: 0,
      burst: 24,
      space: "world",
      speed: 45,
      spread: 140,
      rotation: -90,
      lifetime: 0.45,
      size: 8,
      blendMode: "normal",
      color: "#ab9c88",
      endColor: "#655c53",
    });
    n.acceleration = { x: 0, y: 40 };
  }
  const clip =
    doc.animationClips.find(
      (c) =>
        c.id === clipId &&
        doc.animationEvents.some(
          (e) => e.clipId === c.id && e.name === "sword_trail_start",
        ),
    ) ??
    doc.animationClips.find(
      (c) =>
        clipInView(doc, c.id) &&
        c.name === (name === "Footstep Dust" ? "Walk" : "Attack"),
    );
  if (clip && ["Fire Slash", "Impact Burst"].includes(name)) {
    const start = doc.animationEvents.find(
        (ev) =>
          ev.clipId === clip.id &&
          ev.name ===
            (name === "Fire Slash" ? "sword_trail_start" : "hit_window_start"),
      ),
      stop = doc.animationEvents.find(
        (ev) =>
          ev.clipId === clip.id &&
          ev.name ===
            (name === "Fire Slash" ? "sword_trail_end" : "hit_window_end"),
      );
    if (start)
      e.trigger = {
        clipId: clip.id,
        startEventId: start.id,
        stopEventId: stop?.id ?? null,
        delay: 0,
        mode: name === "Impact Burst" ? "burst" : "continuous",
      };
  }
  return e;
}
export function asPreset(effect: VFXEffect) {
  const copy = duplicateEffect(effect);
  copy.name = effect.name;
  delete copy.trigger;
  for (const a of effectAttachments(copy)) a.boneId = null;
  return copy;
}
export function instantiatePreset(preset: VFXEffect, boneId: string | null) {
  const copy = duplicateEffect(preset);
  copy.name = preset.name;
  for (const a of effectAttachments(copy)) a.boneId = boneId;
  return copy;
}
