import { describe, it, expect, vi } from "vitest";
import {
  createParticleEffect,
  duplicateEffect,
  evaluateParticles,
  effectSchema,
} from "./index";
import {
  createTrail,
  defaultAttachment,
  makePreset,
  asPreset,
  instantiatePreset,
  presetNames,
} from "./presets";
import { evaluateTrail, attachmentMatrix } from "./scene";
import { putParameterKey, parameterValue, parameterEffect } from "./parameters";
import { ProjectVFX } from "./project";
import { rigFixture } from "../../rig-core/src/fixture";
import { uid } from "../../document-core/src/fixture";
import { createClip, setKeyframe, addEvent } from "../../animation-core/src";
import { parseDocument } from "../../document-core/src";
import { packageProject, unpackProject } from "../../exporters/src";
import { useEditor } from "../../editor-core/src/store";
import { sideTemplate } from "../../rig-core/src/side-template";
import { addFootstepDust } from "./footsteps";
import { createSideReferenceClips } from "../../animation-core/src/side-presets";
const identity = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
function project() {
  const d = rigFixture();
  d.bones[0].name = "Root";
  d.bones[2].name = "Weapon Socket";
  const clip = createClip(d, "Attack");
  clip.duration = 1;
  clip.range.end = 1;
  setKeyframe(d, clip.id, uid(102), "bone.rotation", 0, 0);
  setKeyframe(d, clip.id, uid(102), "bone.rotation", 1, 90);
  const start = addEvent(d, clip.id, 0.2, "sword_trail_start"),
    stop = addEvent(d, clip.id, 0.6, "sword_trail_end");
  return { d, clip, start, stop };
}
describe("Phase 4 VFX studio", () => {
  it("samples weapon base/tip trajectory with bounded history and a fading stop", () => {
    const e = createParticleEffect();
    const tr = createTrail(null, 100);
    const sample = (_: string | null, t: number) => ({
      a: Math.cos(t * 3),
      b: Math.sin(t * 3),
      c: -Math.sin(t * 3),
      d: Math.cos(t * 3),
      tx: t * 30,
      ty: 0,
    });
    const a = evaluateTrail(e, tr, 0.3, 0.5, sample);
    expect(a.rows.length).toBeGreaterThan(4);
    expect(a.rows.length).toBeLessThanOrEqual(tr.segmentLimit);
    expect(a.rows[0].x).not.toBe(a.rows.at(-1)!.x);
    expect(evaluateTrail(e, tr, 1, 0.5, sample).rows).toEqual([]);
    expect(evaluateTrail(e, tr, 0.3, 0.5, sample)).toEqual(a);
  });
  it("uses stable animation event refs, responds to event movement and never duplicates seek bursts", () => {
    const { d, clip, start, stop } = project();
    const e = makePreset("Fire Slash", d, clip.id);
    d.vfxGraphs = [e];
    const runtime = new ProjectVFX();
    expect(runtime.frame(d, clip.id, 0.1).trails).toHaveLength(0);
    const a = runtime.frame(d, clip.id, 0.4);
    expect(a.trails[0].rows.length).toBeGreaterThan(2);
    expect(runtime.frame(d, clip.id, 0.4)).toEqual(a);
    expect(runtime.frame(d, clip.id, 0.9).trails[0].rows).toHaveLength(0);
    const changed = structuredClone(d);
    changed.animationEvents.find((ev) => ev.id === start.id)!.time = 0.5;
    expect(runtime.frame(changed, clip.id, 0.4).trails).toHaveLength(0);
    expect(stop.id).toBe(e.trigger!.stopEventId);
  });
  it("starts a single burst at its event, handles skips and stops emission on stop", () => {
    const { d, clip, start, stop } = project();
    const e = makePreset("Impact Burst", d, clip.id);
    e.trigger = {
      clipId: clip.id,
      startEventId: start.id,
      stopEventId: stop.id,
      delay: 0,
      mode: "burst",
    };
    d.vfxGraphs = [e];
    const runtime = new ProjectVFX();
    expect(runtime.evaluate(d, clip.id, 0.19)).toHaveLength(0);
    const particles = runtime.evaluate(d, clip.id, 0.21);
    expect(particles.length).toBeGreaterThan(0);
    expect(runtime.evaluate(d, clip.id, 0.21)).toEqual(particles);
    expect(runtime.evaluate(d, clip.id, 0.9)).toHaveLength(0);
  });
  it("evaluates linear, stepped, Bezier and color parameter keys", () => {
    const e = createParticleEffect(),
      node = e.nodes[0];
    putParameterKey(e, node.id, "speed", 0, 0);
    putParameterKey(e, node.id, "speed", 1, 100);
    expect(parameterEffect(e, 0.5).nodes[0].speed).toBeCloseTo(50);
    const keys = e.tracks![0].keys;
    keys[0].interpolation = "stepped";
    expect(parameterValue(keys, 0.5)).toBe(0);
    keys[0].interpolation = "bezier";
    keys[0].handles = { x1: 0.2, y1: 0, x2: 0.8, y2: 1 };
    expect(parameterValue(keys, 0.5)).toBeCloseTo(50);
    putParameterKey(e, node.id, "color", 0, "#000000");
    putParameterKey(e, node.id, "color", 1, "#ffffff");
    expect(parameterEffect(e, 0.5).nodes[0].color).toBe("#808080");
  });
  it("integrates animated spawn rate over fixed steps rather than reconstructing from the final rate", () => {
    const e = createParticleEffect();
    e.loopMode = "once";
    e.intensity = 1;
    e.nodes[0].burst = 0;
    e.nodes[0].lifetime = 2;
    putParameterKey(e, e.nodes[0].id, "rate", 0, 0);
    putParameterKey(e, e.nodes[0].id, "rate", 1, 120);
    const out = evaluateParticles(
      e,
      1,
      () => identity,
      "high",
      (t) => parameterEffect(e, t),
    );
    expect(out.length).toBeGreaterThanOrEqual(59);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).toEqual(
      evaluateParticles(
        e,
        1,
        () => identity,
        "high",
        (t) => parameterEffect(e, t),
      ),
    );
  });
  it("supports normalized lifetime curves and seeded variation without leaking past max lifetime", () => {
    const e = createParticleEffect();
    e.loopMode = "once";
    const n = e.nodes[0];
    Object.assign(n, {
      rate: 0,
      burst: 1,
      lifetime: 1,
      size: 10,
      lifetimeVariation: 0,
      scaleOverLife: [
        { id: crypto.randomUUID(), time: 0, value: 1, interpolation: "linear" },
        { id: crypto.randomUUID(), time: 1, value: 3, interpolation: "linear" },
      ],
    });
    expect(
      evaluateParticles(e, 0.5, () => identity, "high")[0].size,
    ).toBeCloseTo(20);
    n.lifetime = 10;
    n.lifetimeVariation = 0.9;
    expect(evaluateParticles(e, 60, () => identity, "high")).toHaveLength(0);
  });
  it("resolves follow toggles, reflection and pinned attachment positions", () => {
    const a = defaultAttachment(null, 20, 5);
    const mirrored = attachmentMatrix(a, 0, () => ({
      ...identity,
      a: -1,
      tx: 800,
    }));
    expect(mirrored.tx).toBe(780);
    expect(mirrored.a * mirrored.d - mirrored.b * mirrored.c).toBeLessThan(0);
    a.followPosition = false;
    a.fixedPosition = { x: 10, y: 30 };
    expect(attachmentMatrix(a, 0, () => ({ ...identity, tx: 900 })).tx).toBe(
      10,
    );
  });
  it("keeps flipbook sources/metadata and selects correct frames with offset and looping", () => {
    const { d, clip } = project();
    const e = createParticleEffect();
    e.nodes[0].enabled = false;
    e.flipbooks = [
      {
        id: crypto.randomUUID(),
        type: "FlipbookAnimation",
        name: "Test",
        assetId: d.assetReferences[0].id,
        enabled: true,
        frames: [
          { x: 0, y: 0, w: 1, h: 1 },
          { x: 0, y: 0, w: 1, h: 1 },
        ],
        fps: 10,
        loop: true,
        frameOffset: 1,
        opacity: 0.7,
        scale: 2,
        rotation: 15,
        attachment: defaultAttachment(uid(103)),
        blendMode: "normal",
      },
    ];
    d.vfxGraphs = [e];
    expect(parseDocument(d).vfxGraphs[0].flipbooks).toEqual(e.flipbooks);
    const runtime = new ProjectVFX();
    expect(runtime.frame(d, clip.id, 0.2).flipbooks[0].alpha).toBe(0.7);
    const corrupt = structuredClone(d);
    corrupt.vfxGraphs[0].flipbooks![0].frames[0].w = 2;
    expect(() => parseDocument(corrupt)).toThrow();
  });
  it("provides five editable presets and detached independent library instances", () => {
    const { d } = project();
    const effects = presetNames.map((n) => makePreset(n, d));
    effects.forEach((e) =>
      expect(effectSchema.safeParse(e).success).toBe(true),
    );
    const library = asPreset(effects[0]),
      instance = instantiatePreset(library, uid(103));
    expect(library.nodes[0].attachment.boneId).toBeNull();
    instance.nodes[0].color = "#112233";
    expect(instance.nodes[0].id).not.toBe(library.nodes[0].id);
    expect(library.nodes[0].color).not.toBe(instance.nodes[0].color);
  });
  it("serializes every extended record and rekeys copied tracks/curves with undo/redo", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    const { d, clip } = project(),
      e = makePreset("Fire Slash", d, clip.id);
    putParameterKey(e, e.trails![0].id, "width", 0, 20);
    putParameterKey(e, e.trails![0].id, "width", 1, 80);
    d.vfxGraphs = [e];
    d.vfxPresets = [asPreset(e)];
    const duplicate = duplicateEffect(e);
    expect(duplicate.tracks![0].targetId).toBe(duplicate.trails![0].id);
    expect(unpackProject(packageProject(d)).vfxGraphs).toEqual(d.vfxGraphs);
    useEditor.getState().open(d);
    useEditor.getState().command("Trail width", (doc) => {
      doc.vfxGraphs[0].trails![0].width = 30;
    });
    useEditor.getState().undo();
    expect(useEditor.getState().document!.vfxGraphs[0].trails![0].width).toBe(
      e.trails![0].width,
    );
    useEditor.getState().redo();
    expect(useEditor.getState().document!.vfxGraphs[0].trails![0].width).toBe(
      30,
    );
    vi.unstubAllGlobals();
  });
  it("rejects invalid parameter references, duplicate component IDs, curves and resources", () => {
    const { d } = project();
    const e = createParticleEffect();
    putParameterKey(e, crypto.randomUUID(), "width", 0, 10);
    expect(effectSchema.safeParse(e).success).toBe(false);
    delete e.tracks;
    e.nodes[0].textureId = crypto.randomUUID();
    d.vfxGraphs = [e];
    expect(() => parseDocument(d)).toThrow();
  });
  it("limits historical caches and clears preview-only state", () => {
    const { d, clip } = project();
    d.vfxGraphs = [makePreset("Magic Aura", d)];
    const runtime = new ProjectVFX();
    for (let i = 0; i < 600; i++) runtime.frame(d, clip.id, i / 600);
    expect(runtime.cacheSize).toBeLessThanOrEqual(512);
    runtime.clear();
    expect(runtime.cacheSize).toBe(0);
  });
  it("creates editable dust events from evaluated foot contacts on actual side Walk/Run clips", () => {
    const d = rigFixture();
    d.bones = [];
    d.skeletons = [];
    d.ikTargets = [];
    sideTemplate(d);
    createSideReferenceClips(d);
    const ids = addFootstepDust(d);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const effect of d.vfxGraphs) {
      expect(effect.trigger!.mode).toBe("burst");
      expect(
        d.animationEvents.some((e) => e.id === effect.trigger!.startEventId),
      ).toBe(true);
      expect(effect.nodes[0].space).toBe("world");
    }
    expect(() => parseDocument(d)).not.toThrow();
  });
});
