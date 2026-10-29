import { beforeEach, describe, it, expect, vi } from "vitest";
import { rigFixture } from "../../rig-core/src/fixture";
import { uid } from "../../document-core/src/fixture";
import {
  meshFromMask,
  putMesh,
  autoWeights,
  setVertexWeight,
} from "../../mesh-core/src";
import { useEditor, STORAGE_KEY } from "./store";
beforeEach(() => {
  useEditor.getState().open(rigFixture());
});
describe("Phase 2 command boundary", () => {
  it("undoes and redoes bone editing and IK as single commands", () => {
    const s = useEditor.getState();
    s.setRigMode("pose");
    s.updateBone(uid(101), { pose: { x: 0, y: 0, rotation: 30 } });
    expect(useEditor.getState().document!.bones[0].pose.rotation).toBe(30);
    s.undo();
    expect(useEditor.getState().document!.bones[0].pose.rotation).toBe(0);
    s.redo();
    s.solveIK(uid(110), 100, 80);
    const solved = useEditor.getState().document!;
    expect(solved.ikTargets[0].enabled).toBe(true);
    s.undo();
    expect(useEditor.getState().document!.ikTargets[0].enabled).toBe(false);
    s.redo();
    expect(useEditor.getState().document).toEqual(solved);
  });
  it("rejects a cyclic bone edit without changing history or document", () => {
    const s = useEditor.getState(),
      before = s.document;
    s.updateBone(uid(101), { parentId: uid(103) });
    expect(useEditor.getState().document).toBe(before);
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().error).toMatch(/vòng/);
  });
  it("undo restores deleted bone, attachments and IK references", () => {
    const s = useEditor.getState();
    s.bindLayer(uid(3), uid(102));
    const original = useEditor.getState().document;
    s.removeBone(uid(102));
    expect(useEditor.getState().document!.attachments).toHaveLength(0);
    s.undo();
    expect(useEditor.getState().document).toEqual(original);
  });
  it("groups vertex and weight edits, rejects malformed mesh atomically", () => {
    const d = rigFixture();
    Object.assign(d.assetReferences[0], { width: 100, height: 100 });
    const m = meshFromMask(
      uid(3),
      d.assetReferences[0],
      { width: 8, height: 8, data: Array(64).fill(1) },
      { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    );
    putMesh(d, m);
    autoWeights(d, m, [uid(101), uid(102)]);
    useEditor.getState().open(d);
    const s = useEditor.getState(),
      v = m.vertices[0];
    s.command("weight", (doc) =>
      setVertexWeight(doc, m.id, v.id, uid(101), 0.25),
    );
    expect(
      useEditor.getState().document!.vertexWeights[0].influences[0].weight,
    ).toBe(0.25);
    s.undo();
    expect(useEditor.getState().document).toEqual(d);
    s.redo();
    const before = useEditor.getState().document,
      past = useEditor.getState().past.length;
    s.command("invalid triangle", (doc) => {
      doc.meshes[0].triangles[0] = 10000;
    });
    expect(useEditor.getState().document).toBe(before);
    expect(useEditor.getState().past).toHaveLength(past);
  });
  it("removes a layer’s mesh, weights and attachment without damaging rig", () => {
    const d = rigFixture();
    Object.assign(d.assetReferences[0], { width: 100, height: 100 });
    const m = meshFromMask(
      uid(3),
      d.assetReferences[0],
      { width: 8, height: 8, data: Array(64).fill(1) },
      { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    );
    putMesh(d, m);
    autoWeights(d, m, [uid(101)]);
    useEditor.getState().open(d);
    useEditor.getState().bindLayer(uid(3), uid(101));
    useEditor.getState().removeLayer(uid(3));
    const after = useEditor.getState().document!;
    expect(after.meshes).toHaveLength(0);
    expect(after.vertexWeights).toHaveLength(0);
    expect(after.attachments).toHaveLength(0);
    expect(after.bones).toHaveLength(3);
    useEditor.getState().undo();
    expect(useEditor.getState().document!.meshes).toHaveLength(1);
  });
  it("migrates a Phase 1 local save without discarding transforms or metadata", () => {
    const d = rigFixture();
    d.bones = [];
    d.skeletons = [];
    d.ikTargets = [];
    const legacy: Record<string, unknown> = { ...d, schemaVersion: 1 };
    delete legacy.rigSettings;
    delete legacy.ikTargets;
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === STORAGE_KEY ? JSON.stringify(legacy) : null,
      setItem: () => {},
    });
    expect(useEditor.getState().restore()).toBe(true);
    expect(useEditor.getState().document!.schemaVersion).toBe(4);
    expect(useEditor.getState().document!.layers).toEqual(d.layers);
    expect(useEditor.getState().document!.metadata).toEqual(d.metadata);
    vi.unstubAllGlobals();
  });
});
