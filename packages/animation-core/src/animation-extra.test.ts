import { it, expect } from "vitest";
import { rigFixture } from "../../rig-core/src/fixture";
import { uid } from "../../document-core/src/fixture";
import { parseDocument } from "../../document-core/src";
import { meshFromMask, putMesh, setVertexWeight } from "../../mesh-core/src";
import { solveTwoBone, skinVertices, identity } from "../../rig-core/src";
import { sheetPlan } from "../../exporters/src/animation";
import {
  createClip,
  setKeyframe,
  evaluateClip,
  createReferenceClips,
  mixPoses,
} from "./index";
it("interpolates sparse mesh-local offsets before skinning without modifying source vertices", () => {
  const d = rigFixture();
  const mesh = meshFromMask(
    d.layers[0].id,
    d.assetReferences[0],
    { width: 4, height: 4, data: Array(16).fill(1) },
    identity(),
  );
  putMesh(d, mesh);
  mesh.boneIds = [uid(101)];
  const v = mesh.vertices[0];
  for (const vertex of mesh.vertices)
    setVertexWeight(d, mesh.id, vertex.id, uid(101), 1);
  const c = createClip(d);
  setKeyframe(d, c.id, mesh.id, "mesh.deform", 0, {});
  setKeyframe(d, c.id, mesh.id, "mesh.deform", 2, { [v.id]: { x: 20, y: 8 } });
  setKeyframe(d, c.id, uid(101), "bone.rotation", 0, 90);
  const before = JSON.stringify(d),
    pose = evaluateClip(d, c.id, 1, false);
  expect(pose.meshes[0].vertices[0].x).toBe(v.x + 10);
  expect(pose.meshes[0].vertices[0].y).toBe(v.y + 4);
  const skin = skinVertices(pose, pose.meshes[0])[0];
  expect(skin.x).toBeCloseTo(-(v.y + 4));
  expect(skin.y).toBeCloseTo(v.x + 10);
  expect(JSON.stringify(d)).toBe(before);
  expect(() => parseDocument(d)).not.toThrow();
});
it("solves scaled two-bone chains in inherited local coordinates", () => {
  for (const bend of [-1, 1] as const) {
    const d = rigFixture();
    d.bones[0].pose.scaleX = 1.3;
    d.bones[0].pose.scaleY = 0.8;
    d.ikTargets[0].bend = bend;
    const result = solveTwoBone(d, uid(110), { x: 130, y: 60 });
    expect(result.error).toBeLessThan(0.02);
    expect(d.bones[1].pose.rotation * bend).toBeGreaterThan(0);
  }
});
it("creates five editable reference clips only against available named bones", () => {
  const d = rigFixture();
  d.bones[0].name = "Hip";
  d.bones[1].name = "Chest";
  d.bones[2].name = "Head";
  createReferenceClips(d);
  expect(d.animationClips.map((c) => c.name)).toEqual([
    "Idle",
    "Walk",
    "Run",
    "Attack",
    "Hurt",
  ]);
  expect(
    d.keyframeTracks.every((t) => d.bones.some((b) => b.id === t.targetId)),
  ).toBe(true);
  expect(d.animationEvents.map((e) => e.name)).toEqual([
    "attack_start",
    "sword_trail_start",
    "hit_window_start",
    "hit_window_end",
    "sword_trail_end",
    "attack_end",
  ]);
  expect(() => parseDocument(d)).not.toThrow();
  createReferenceClips(d);
  expect(d.animationClips).toHaveLength(5);
});
it("plans actual time samples, loop endpoints and bounded spritesheet sizes", () => {
  const d = rigFixture(),
    c = createClip(d, "Sheet", 0.8);
  const options = { fps: 10, frameWidth: 128, frameHeight: 128 };
  expect(sheetPlan(d, c.id, options).times).toEqual([
    0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7,
  ]);
  c.loopMode = "once";
  expect(sheetPlan(d, c.id, options).times.at(-1)).toBe(0.8);
  expect(() => sheetPlan(d, c.id, { ...options, fps: 0 })).toThrow();
  c.duration = 120;
  expect(() => sheetPlan(d, c.id, { ...options, fps: 60 })).toThrow(/512/);
  expect(() =>
    sheetPlan(d, c.id, {
      ...options,
      fps: 4,
      frameWidth: 2048,
      frameHeight: 2048,
    }),
  ).toThrow(/8192/);
});
it("respects narrow joint constraints while crossfading shortest-path angles", () => {
  const d = rigFixture(),
    a = structuredClone(d),
    b = structuredClone(d);
  d.bones[0].constraints = { minRotation: -170, maxRotation: 170 };
  a.bones[0].pose.rotation = 170;
  b.bones[0].pose.rotation = -170;
  expect(mixPoses(d, a, b, 0.5).bones[0].pose.rotation).toBeCloseTo(0);
});
