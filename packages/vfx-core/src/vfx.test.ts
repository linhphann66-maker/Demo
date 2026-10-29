import { describe, it, expect, vi } from "vitest";
import {
  createParticleEffect,
  evaluateParticles,
  duplicateEffect,
  effectSchema,
} from "./index";
import { fixture } from "../../document-core/src/fixture";
import { parseDocument, serialize } from "../../document-core/src";
import { packageProject, unpackProject } from "../../exporters/src";
import { useEditor } from "../../editor-core/src/store";
const matrix = (x = 0) => ({ a: 1, b: 0, c: 0, d: 1, tx: x, ty: 0 });
function setup() {
  const e = createParticleEffect();
  e.loopMode = "once";
  e.duration = 2;
  e.intensity = 1;
  const n = e.nodes[0];
  Object.assign(n, { rate: 20, burst: 0, lifetime: 1, speed: 0, drag: 0 });
  n.acceleration = { x: 0, y: 0 };
  n.shape = "point";
  n.position = { x: 0, y: 0 };
  return e;
}
describe("deterministic VFX foundation", () => {
  it("reproduces seeks and changes random distributions only with seed", () => {
    const e = setup();
    e.nodes[0].speed = 10;
    const a = evaluateParticles(e, 0.5, undefined, "high");
    expect(a).toEqual(evaluateParticles(e, 0.5, undefined, "high"));
    evaluateParticles(e, 1);
    expect(a).toEqual(evaluateParticles(e, 0.5, undefined, "high"));
    e.seed++;
    expect(a).not.toEqual(evaluateParticles(e, 0.5, undefined, "high"));
  });
  it("emits on a 120Hz birth grid, honors rate, burst and expiration", () => {
    const e = setup();
    expect(evaluateParticles(e, 0.5, undefined, "high")).toHaveLength(10);
    e.nodes[0].burst = 5;
    expect(evaluateParticles(e, 0, undefined, "high")).toHaveLength(5);
    expect(evaluateParticles(e, 4, undefined, "high")).toHaveLength(0);
  });
  it("rejects births at capacity without resurrecting dropped particles", () => {
    const e = setup();
    e.nodes[0].burst = 20;
    e.nodes[0].maxParticles = 2;
    const before = evaluateParticles(e, 0.1, undefined, "high");
    expect(before).toHaveLength(2);
    expect(
      before.every((p) => p.id.endsWith(":0") || p.id.endsWith(":1")),
    ).toBe(true);
    const after = evaluateParticles(e, 1.05, undefined, "high");
    expect(after.every((p) => !p.id.endsWith(":2"))).toBe(true);
    expect(after.length).toBeLessThanOrEqual(2);
  });
  it("distinguishes historical world births from current local transforms", () => {
    const e = setup();
    const sampler = (_: string | null, t: number) => matrix(t * 100);
    const local = evaluateParticles(e, 0.5, sampler, "high");
    e.nodes[0].space = "world";
    const world = evaluateParticles(e, 0.5, sampler, "high");
    expect(local[0].x).toBe(50);
    expect(world[0].x).toBe(5);
  });
  it("mirrors positions and directions without mutating canonical effect", () => {
    const e = setup();
    e.nodes[0].speed = 60;
    e.nodes[0].spread = 0;
    e.nodes[0].rotation = 0;
    const original = structuredClone(e);
    const right = evaluateParticles(e, 0.5, () => matrix(), "high");
    const left = evaluateParticles(
      e,
      0.5,
      () => ({ ...matrix(), a: -1 }),
      "high",
    );
    left.forEach((p, i) => expect(p.x).toBeCloseTo(-right[i].x, 9));
    expect(e).toEqual(original);
  });
  it("restarts loop state and supports visibility without accumulated births", () => {
    const e = setup();
    e.loopMode = "loop";
    expect(evaluateParticles(e, 0.5)).toEqual(evaluateParticles(e, 2.5));
    e.enabled = false;
    expect(evaluateParticles(e, 0.5)).toEqual([]);
  });
  it("keeps attachments at global animation time when the effect loops", () => {
    const e = setup();
    e.loopMode = "loop";
    const sample = (_: string | null, t: number) => matrix(t * 100);
    expect(evaluateParticles(e, 2.5, sample, "high")[0].x).toBe(250);
    e.nodes[0].space = "world";
    expect(evaluateParticles(e, 2.5, sample, "high")[0].x).toBeCloseTo(205, 8);
  });
  it("bounds global count and transient quality leaves authoring unchanged", () => {
    const e = setup();
    e.nodes[0].rate = 500;
    e.nodes[0].lifetime = 10;
    const original = structuredClone(e);
    expect(evaluateParticles(e, 1, undefined, "low").length).toBeLessThan(
      evaluateParticles(e, 1, undefined, "high").length,
    );
    expect(evaluateParticles(e, 1).length).toBeLessThanOrEqual(1024);
    expect(e).toEqual(original);
  });
  it("validates ranges, unknown nodes, particle budgets and missing references", () => {
    const e = setup();
    expect(effectSchema.safeParse({ ...e, intensity: Infinity }).success).toBe(
      false,
    );
    expect(
      effectSchema.safeParse({
        ...e,
        nodes: [{ ...e.nodes[0], type: "TrailRenderer" }],
      }).success,
    ).toBe(false);
    const d = fixture();
    d.vfxGraphs = [e];
    e.nodes[0].attachment.boneId = crypto.randomUUID();
    expect(() => parseDocument(d)).toThrow();
  });
  it("roundtrips through editable project ZIP and old projects remain loadable", () => {
    const d = fixture();
    d.vfxGraphs = [setup()];
    expect(unpackProject(packageProject(d)).vfxGraphs).toEqual(d.vfxGraphs);
    expect(parseDocument(JSON.parse(serialize(fixture()))).vfxGraphs).toEqual(
      [],
    );
  });
  it("duplicates stable IDs independently and participates in undo/redo", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    const e = setup(),
      copy = duplicateEffect(e);
    expect(copy.id).not.toBe(e.id);
    expect(copy.nodes[0].id).not.toBe(e.nodes[0].id);
    copy.nodes[0].color = "#ffffff";
    expect(e.nodes[0].color).not.toBe(copy.nodes[0].color);
    useEditor.getState().open(fixture());
    useEditor.getState().command("add effect", (d) => {
      d.vfxGraphs.push(e);
    });
    expect(useEditor.getState().document!.vfxGraphs).toHaveLength(1);
    useEditor.getState().undo();
    expect(useEditor.getState().document!.vfxGraphs).toHaveLength(0);
    useEditor.getState().redo();
    expect(useEditor.getState().document!.vfxGraphs).toEqual([e]);
    vi.unstubAllGlobals();
  });
});
