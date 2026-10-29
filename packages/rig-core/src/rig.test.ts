import { describe, it, expect } from "vitest";
import { rigFixture } from "./fixture";
import { fixture, uid } from "../../document-core/src/fixture";
import { parseDocument, syncHierarchy } from "../../document-core/src";
import {
  boneMatrices,
  transform,
  solveTwoBone,
  bindLayer,
  evaluatedLayerMatrices,
  resetPose,
  removeBone,
  reparentBone,
} from "./index";
import { humanoidTemplate } from "./template";
import { editBone, moveJoint } from "../../editor-core/src/rig-actions";
import { packageProject, unpackProject } from "../../exporters/src";
describe("FK, rest and attachment", () => {
  it("propagates parent rotation to child world origin", () => {
    const d = rigFixture();
    d.rigSettings.mode = "pose";
    d.bones[0].pose.rotation = 90;
    const m = boneMatrices(d).get(uid(103))!;
    expect(m.tx).toBeCloseTo(0);
    expect(m.ty).toBeCloseTo(200);
  });
  it("does not move artwork while editing rest landmarks", () => {
    const d = rigFixture();
    bindLayer(d, uid(3), uid(102));
    d.bones[0].rest.rotation = 80;
    d.bones[0].rest.x = 50;
    expect(evaluatedLayerMatrices(d).get(uid(3))!.tx).toBeCloseTo(0);
    expect(evaluatedLayerMatrices(d).get(uid(3))!.a).toBeCloseTo(1);
  });
  it("moves attached weapon with parent chain, then resets exactly", () => {
    const d = rigFixture();
    d.layers[0].x = 200;
    bindLayer(d, uid(3), uid(103));
    d.rigSettings.mode = "pose";
    d.bones[0].pose.rotation = 90;
    const m = evaluatedLayerMatrices(d).get(uid(3))!;
    expect(m.tx).toBeCloseTo(0);
    expect(m.ty).toBeCloseTo(200);
    resetPose(d);
    expect(evaluatedLayerMatrices(d).get(uid(3))!.tx).toBeCloseTo(200);
  });
  it("honors parented layer transform inheritance", () => {
    const d = rigFixture();
    d.layers.push({ ...d.layers[0], id: uid(4), parentId: uid(3), x: 20 });
    bindLayer(d, uid(3), uid(101));
    d.rigSettings.mode = "pose";
    d.bones[0].pose.rotation = 90;
    syncHierarchy(d);
    const m = evaluatedLayerMatrices(d).get(uid(4))!;
    expect(m.tx).toBeCloseTo(0);
    expect(m.ty).toBeCloseTo(20);
  });
  it("moves joints in parent coordinates and changes FK tips", () => {
    const d = rigFixture();
    d.bones[0].rest.rotation = 90;
    moveJoint(d, uid(102), { x: 20, y: 80 });
    expect(d.bones[1].rest.x).toBeCloseTo(80);
    expect(d.bones[1].rest.y).toBeCloseTo(-20);
    moveJoint(d, uid(101), { x: 0, y: 150 }, true);
    expect(d.bones[0].length).toBeCloseTo(150);
  });
  it("changes child joint position with parent length", () => {
    const d = rigFixture();
    editBone(d, uid(101), { length: 150 });
    expect(d.bones[1].rest.x).toBe(150);
  });
  it("reparents while preserving rest and pose world transforms", () => {
    const d = rigFixture();
    d.rigSettings.mode = "pose";
    d.bones[0].pose.rotation = 30;
    d.bones[1].pose.rotation = 20;
    const before = boneMatrices(d).get(uid(103))!;
    reparentBone(d, uid(103), uid(101));
    const after = boneMatrices(d).get(uid(103))!;
    expect(after.tx).toBeCloseTo(before.tx);
    expect(after.ty).toBeCloseTo(before.ty);
    expect(after.a).toBeCloseTo(before.a);
    expect(d.ikTargets).toHaveLength(0);
  });
  it("rejects cycles atomically at the command boundary", () => {
    const d = rigFixture();
    expect(() => reparentBone(d, uid(101), uid(103))).toThrow(/vòng/);
  });
  it("deletes parent while preserving child rest world and removing invalid IK", () => {
    const d = rigFixture();
    bindLayer(d, uid(3), uid(102));
    const before = boneMatrices(d, "rest").get(uid(103))!;
    removeBone(d, uid(102));
    const after = boneMatrices(d, "rest").get(uid(103))!;
    expect(after.tx).toBeCloseTo(before.tx);
    expect(d.attachments).toHaveLength(0);
    expect(d.ikTargets).toHaveLength(0);
    expect(() => parseDocument(d)).not.toThrow();
  });
  it("saves complete rig and pose in portable project", () => {
    const d = rigFixture();
    solveTwoBone(d, uid(110), { x: 120, y: 80 });
    bindLayer(d, uid(3), uid(103));
    expect(unpackProject(packageProject(d))).toEqual(d);
  });
});
describe("two-bone IK", () => {
  it("rejects zero length IK links in the saved document", () => {
    const d = rigFixture();
    d.bones[1].rest.x = 0;
    expect(() => parseDocument(d)).toThrow(/độ dài/);
  });
  it("reaches a valid target without stretching links", () => {
    const d = rigFixture();
    const result = solveTwoBone(d, uid(110), { x: 120, y: 80 });
    expect(result.error).toBeLessThan(1e-6);
    const m = boneMatrices(d);
    const a = transform(m.get(uid(101))!, { x: 0, y: 0 }),
      b = transform(m.get(uid(102))!, { x: 0, y: 0 }),
      c = transform(m.get(uid(103))!, { x: 0, y: 0 });
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(100);
    expect(Math.hypot(c.x - b.x, c.y - b.y)).toBeCloseTo(100);
  });
  it("clamps unreachable targets and reports actual error", () => {
    const d = rigFixture();
    const r = solveTwoBone(d, uid(110), { x: 500, y: 0 });
    expect(r.error).toBeCloseTo(300, 2);
    expect(r.actual.x).toBeCloseTo(200, 2);
  });
  it("supports both bend directions and singular targets", () => {
    for (const bend of [-1, 1] as const) {
      const d = rigFixture();
      d.ikTargets[0].bend = bend;
      expect(solveTwoBone(d, uid(110), { x: 100, y: 40 }).error).toBeLessThan(
        1e-6,
      );
      expect(solveTwoBone(d, uid(110), { x: 0, y: 0 }).error).toBeLessThan(
        0.01,
      );
      expect(() => parseDocument(d)).not.toThrow();
    }
  });
  it("applies editable joint constraints", () => {
    const d = rigFixture();
    d.bones[0].constraints = { minRotation: -10, maxRotation: 10 };
    d.bones[1].constraints = { minRotation: -20, maxRotation: 20 };
    const r = solveTwoBone(d, uid(110), { x: -100, y: 40 });
    expect(d.bones[0].pose.rotation).toBeGreaterThanOrEqual(-10);
    expect(d.bones[0].pose.rotation).toBeLessThanOrEqual(10);
    expect(Math.abs(d.bones[1].pose.rotation)).toBeLessThanOrEqual(20);
    expect(r.error).toBeGreaterThan(1);
  });
});
describe("procedural humanoid", () => {
  it("creates all 23 named bones, 4 IK chains, weapon socket and no AI provenance", () => {
    const d = fixture();
    Object.assign(d.assetReferences[0], {
      width: 350,
      height: 540,
      name: "Sword blade",
    });
    humanoidTemplate(d);
    expect(d.bones).toHaveLength(23);
    for (const name of [
      "Root",
      "Hip",
      "Spine",
      "Chest",
      "Neck",
      "Head",
      "Hair",
      "Cape",
      "Weapon Socket",
      "Left Upper Arm",
      "Right Forearm",
      "Left Hand",
      "Right Foot",
    ])
      expect(d.bones.some((b) => b.name === name)).toBe(true);
    expect(d.ikTargets).toHaveLength(4);
    expect(d.equipmentSlots[0].name).toBe("Weapon Socket");
    expect(d.skeletons[0].provenance).toBe("procedural");
    expect(d.attachments[0].boneId).toBe(d.equipmentSlots[0].boneId);
    expect(() => parseDocument(d)).not.toThrow();
    expect(() => humanoidTemplate(d)).toThrow(/đã có/);
  });
  it("scales landmarks with character dimensions", () => {
    const first = fixture(),
      second = fixture();
    Object.assign(first.assetReferences[0], { width: 100, height: 200 });
    Object.assign(second.assetReferences[0], { width: 200, height: 400 });
    humanoidTemplate(first);
    humanoidTemplate(second);
    const f = boneMatrices(first).get(
        first.bones.find((b) => b.name === "Head")!.id,
      )!,
      s = boneMatrices(second).get(
        second.bones.find((b) => b.name === "Head")!.id,
      )!;
    expect(s.tx).toBeCloseTo(2 * f.tx);
    expect(s.ty).toBeCloseTo(2 * f.ty);
  });
});
