import { describe, it, expect } from "vitest";
import { fixture, uid } from "./fixture";
import {
  parseDocument,
  serialize,
  syncHierarchy,
  worldMatrix,
  invalidatedAssets,
} from "./index";
import { packageProject, unpackProject } from "../../exporters/src";
import { zipSync, strToU8 } from "fflate";
describe("document integrity", () => {
  it("round trips all editable fields through portable archive", () => {
    const d = fixture();
    d.layers[0].x = 18;
    d.layers[0].rotation = 31;
    expect(unpackProject(packageProject(d))).toEqual(d);
    expect(parseDocument(JSON.parse(serialize(d)))).toEqual(d);
  });
  it("migrates v0 and rejects future versions", () => {
    expect(
      parseDocument({ ...fixture(), schemaVersion: 0 }).schemaVersion,
    ).toBe(1);
    expect(() => parseDocument({ ...fixture(), schemaVersion: 2 })).toThrow();
  });
  it("rejects duplicate UUIDs, missing assets and unknown fields", () => {
    const d = fixture();
    d.layers[0].id = d.projectId;
    expect(() => parseDocument(d)).toThrow();
    const e = fixture();
    e.layers[0].assetId = uid(90);
    expect(() => parseDocument(e)).toThrow();
    expect(() => parseDocument({ ...fixture(), script: "alert(1)" })).toThrow();
  });
  it("rejects cyclic hierarchies and mismatched hierarchy records", () => {
    const d = fixture();
    d.layers[0].parentId = d.layers[0].id;
    syncHierarchy(d);
    expect(() => parseDocument(d)).toThrow();
    const e = fixture();
    e.hierarchy = [];
    expect(() => parseDocument(e)).toThrow();
  });
  it("rejects nonfinite transforms, invalid opacity and empty names", () => {
    for (const patch of [
      { x: Infinity },
      { opacity: 1.1 },
      { name: "" },
      { scaleX: 0 },
    ]) {
      const d = fixture();
      Object.assign(d.layers[0], patch);
      expect(() => parseDocument(d)).toThrow();
    }
  });
  it("propagates parent translation, scale and rotation", () => {
    const d = fixture();
    d.layers.push({
      ...d.layers[0],
      id: uid(4),
      parentId: uid(3),
      x: 10,
      y: 5,
    });
    Object.assign(d.layers[0], {
      x: 100,
      y: 20,
      rotation: 90,
      scaleX: 2,
      scaleY: 2,
    });
    syncHierarchy(d);
    const m = worldMatrix(d, d.layers[1]);
    expect(m.tx).toBeCloseTo(90);
    expect(m.ty).toBeCloseTo(40);
  });
  it("invalidates only explicit transitive dependents", () => {
    const d = fixture();
    d.assetReferences.push(
      {
        ...d.assetReferences[0],
        id: uid(5),
        kind: "derived",
        dependencies: [uid(2)],
      },
      {
        ...d.assetReferences[0],
        id: uid(6),
        kind: "derived",
        dependencies: [uid(5)],
      },
      { ...d.assetReferences[0], id: uid(7), dependencies: [] },
    );
    expect(invalidatedAssets(d, uid(2))).toEqual([uid(5), uid(6)]);
  });
  it("rejects asset dependency cycles", () => {
    const d = fixture();
    d.assetReferences[0].dependencies = [uid(2)];
    expect(() => parseDocument(d)).toThrow();
  });
  it("rejects unsafe texture URLs and oversized collections", () => {
    const d = fixture();
    d.assetReferences[0].data = "https://evil.invalid/payload.svg";
    expect(() => parseDocument(d)).toThrow();
    const e = fixture();
    e.layers = Array(1001).fill(e.layers[0]);
    expect(() => parseDocument(e)).toThrow();
  });
});
describe("archive safety", () => {
  it("rejects traversal, extra files, missing project and malformed zip", () => {
    for (const archive of [
      zipSync({ "../project.json": strToU8("{}") }),
      zipSync({ "project.json": strToU8("{}"), "script.js": strToU8("x") }),
      zipSync({}),
      new Uint8Array([1, 2, 3]),
    ])
      expect(() => unpackProject(archive)).toThrow();
  });
  it("rejects zip bombs before decompression", () => {
    const bytes = zipSync({ "project.json": new Uint8Array(2_000_000) });
    expect(() => unpackProject(bytes)).toThrow(/an toàn/);
  });
});
