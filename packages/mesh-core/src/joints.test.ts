import { it, expect } from "vitest";
import { jointFixture } from "./joint-fixture";
import { validateJoints } from "./joint-validation";
import { smoothJointWeights, prepareJointEdit } from "./joint-completion";
import { uid, fixture } from "../../document-core/src/fixture";
import {
  parseDocument,
  worldMatrix,
  characterMatrix,
  layerDisplayed,
  renderMesh,
} from "../../document-core/src";
import { boneMatrices, skinVertices } from "../../rig-core/src";
import { sideTemplate } from "../../rig-core/src/side-template";
import { createSideReferenceClips } from "../../animation-core/src/side-presets";
import { evaluateClip } from "../../animation-core/src/evaluation";
import { packageProject, unpackProject } from "../../exporters/src";
import { useEditor } from "../../editor-core/src/store";
it("mirrors around the root without changing canonical bones, IK, source vertices or keys", () => {
  const d = jointFixture();
  d.characterVariants = [
    {
      id: uid(320),
      name: "Side",
      view: "side_3_4",
      reference: false,
      rootBoneId: uid(101),
      layerIds: d.layers.map((l) => l.id),
      boneIds: d.bones.map((b) => b.id),
      clipIds: [],
    },
  ];
  d.characterSettings.characterView = "side_3_4";
  const before = JSON.stringify([
      d.bones,
      d.ikTargets,
      d.meshes,
      d.keyframeTracks,
    ]),
    matrices = boneMatrices(d),
    vertices = skinVertices(d, d.meshes[0]);
  d.characterSettings.facing = "left";
  d.characterSettings.worldPosition.x = 25;
  expect(characterMatrix(d)).toEqual({
    a: -1,
    b: 0,
    c: 0,
    d: 1,
    tx: 25,
    ty: 0,
  });
  expect(boneMatrices(d)).toEqual(matrices);
  expect(skinVertices(d, d.meshes[0])).toEqual(vertices);
  expect(
    JSON.stringify([d.bones, d.ikTargets, d.meshes, d.keyframeTracks]),
  ).toBe(before);
});
it("applies real local pivots and leaves legacy transforms unchanged", () => {
  const d = fixture(),
    l = d.layers[0];
  l.x = 10;
  l.y = 20;
  l.rotation = 90;
  l.pivotX = 2;
  l.pivotY = 3;
  const m = worldMatrix(d, l);
  expect(m.tx).toBeCloseTo(13);
  expect(m.ty).toBeCloseTo(18);
  delete l.pivotX;
  delete l.pivotY;
  expect(worldMatrix(d, l).tx).toBe(10);
});
it("serializes semantic alpha, completion textures, modes, weights and validation results", () => {
  const d = jointFixture();
  smoothJointWeights(d, d.characterJoints[0]);
  d.jointValidation = validateJoints(d);
  expect(d.jointValidation.uncoveredSamples).toBe(0);
  expect(unpackProject(packageProject(d))).toEqual(parseDocument(d));
});
it("detects exposed pixels when real alpha support is removed", () => {
  const d = jointFixture();
  d.characterParts.forEach((p) => (p.alphaMask.data = [0]));
  const r = validateJoints(d);
  expect(r.uncoveredSamples).toBeGreaterThan(0);
  expect(
    r.issues.some((i) => i.kind === "visible_gap" && i.severity === "error"),
  ).toBe(true);
  expect(r.issues[0].suggestions).toContain("expand_underlap");
});
it("detects invalid weights, stretched/flipped triangles and configured joint limits", () => {
  const d = jointFixture();
  smoothJointWeights(d, d.characterJoints[0]);
  d.meshes[0].vertices[1].x = 20;
  d.vertexWeights[0].influences[0].weight = 0.2;
  d.bones[1].constraints.maxRotation = 90;
  const r = validateJoints(d, [180]);
  expect(r.issues.some((i) => i.kind === "invalid_weights")).toBe(true);
  expect(r.issues.some((i) => i.kind === "rotation_limit")).toBe(true);
  expect(
    r.issues.some((i) => i.kind === "stretch" || i.kind === "invalid_triangle"),
  ).toBe(true);
});
it("changes actual displayed geometry by per-joint mode and supports undo/redo", () => {
  const d = jointFixture();
  useEditor.getState().open(d);
  expect(layerDisplayed(d, uid(3))).toBe(true);
  useEditor.getState().command("Overlap mode", (d) => {
    d.characterJoints[0].mode = "overlap_only";
  });
  expect(layerDisplayed(useEditor.getState().document!, uid(3))).toBe(false);
  useEditor.getState().undo();
  expect(layerDisplayed(useEditor.getState().document!, uid(3))).toBe(true);
  useEditor.getState().redo();
  expect(useEditor.getState().document!.characterJoints[0].mode).toBe(
    "overlap_only",
  );
});
it("rejects missing semantic refs, invalid alpha, unknown views and corrupt mirror exceptions", () => {
  for (const kind of ["source", "alpha", "view", "mirror", "joint"]) {
    const d = jointFixture();
    if (kind === "source") d.characterParts[0].sourceAssetId = uid(999);
    if (kind === "alpha") d.characterParts[0].alphaMask.data = [];
    if (kind === "view") d.characterSettings.characterView = "up" as never;
    if (kind === "mirror") d.characterParts[0].mirrorPolicy = "keep_texture";
    if (kind === "joint") d.characterJoints[0].lowerBoneId = uid(103);
    expect(() => parseDocument(d)).toThrow();
  }
});
it("loads all old versions as front view and preserves the existing artwork and animation collections", () => {
  for (const version of [0, 1, 2, 3]) {
    const old = { ...fixture(), schemaVersion: version };
    const d = parseDocument(old);
    expect(d.characterSettings.characterView).toBe("front");
    expect(d.schemaVersion).toBe(4);
    expect(d.assetReferences).toEqual(old.assetReferences);
    expect(d.animationClips).toEqual(old.animationClips);
  }
});
it("plants side-walk stance feet at the same ground plane with editable IK tracks", () => {
  const d = fixture();
  sideTemplate(d);
  createSideReferenceClips(d);
  const c = d.animationClips.find((c) => c.name === "Walk")!;
  const foot = d.bones.find((b) => b.name === "Near Foot")!,
    rest = boneMatrices(d, "rest").get(foot.id)!;
  for (const t of [0, 0.125, 0.25, 0.375, 0.5]) {
    const pose = evaluateClip(d, c.id, t, false),
      m = boneMatrices(pose).get(foot.id)!;
    expect(m.ty).toBeCloseTo(630, 1);
    expect(Math.atan2(m.b, m.a)).toBeCloseTo(Math.atan2(rest.b, rest.a), 1);
  }
  expect(d.keyframeTracks.some((t) => t.type === "ik.x")).toBe(true);
  expect(d.animationEvents).toHaveLength(6);
  expect(() => parseDocument(d)).not.toThrow();
});

it("keeps editable mesh, weights and deformation keys when temporarily rendering a rigid part", async () => {
  const d = jointFixture();
  smoothJointWeights(d, d.characterJoints[0]);
  d.characterJoints[0].kind = "cape";
  d.characterJoints[0].layerIds = [uid(3)];
  for (const part of d.characterParts.slice(1)) {
    part.jointId = null;
    part.role = "body";
  }
  d.characterParts[0].role = "body";
  const before = JSON.stringify([d.meshes, d.vertexWeights, d.keyframeTracks]);
  const rigid = await prepareJointEdit(d, d.characterJoints[0].id, {
    mode: "rigid_segment",
  });
  expect(
    JSON.stringify([rigid.meshes, rigid.vertexWeights, rigid.keyframeTracks]),
  ).toBe(before);
  expect(renderMesh(rigid, uid(3))).toBeUndefined();
  const mesh = await prepareJointEdit(rigid, d.characterJoints[0].id, {
    mode: "continuous_mesh",
  });
  expect(renderMesh(mesh, uid(3))?.id).toBe(d.meshes[0].id);
});
