import { describe, it, expect } from "vitest";
import { rigFixture } from "../../rig-core/src/fixture";
import { uid } from "../../document-core/src/fixture";
import { parseDocument, type EditableMesh } from "../../document-core/src";
import {
  skinVertices,
  deformationWarnings,
  removeBone,
} from "../../rig-core/src";
import {
  meshFromMask,
  triangulate,
  autoWeights,
  putMesh,
  setVertexWeight,
  addVertex,
  removeVertex,
  resetMesh,
  moveVertexWorld,
} from "./index";
import { packageProject, unpackProject } from "../../exporters/src";
export function meshFixture() {
  const doc = rigFixture();
  Object.assign(doc.assetReferences[0], { width: 100, height: 100 });
  const mesh: EditableMesh = {
    id: uid(200),
    layerId: uid(3),
    sourceAssetId: uid(2),
    vertices: [
      { id: uid(201), x: 0, y: 0, u: 0, v: 0 },
      { id: uid(202), x: 100, y: 0, u: 1, v: 0 },
      { id: uid(203), x: 100, y: 100, u: 1, v: 1 },
      { id: uid(204), x: 0, y: 100, u: 0, v: 1 },
    ],
    triangles: [0, 1, 2, 0, 2, 3],
    boneIds: [],
    bindMatrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    alphaMask: { width: 4, height: 4, data: Array(16).fill(1) },
  };
  putMesh(doc, mesh);
  return { doc, mesh };
}
describe("alpha geometry and topology", () => {
  it("builds a triangulated alpha mesh with holes excluded at triangle samples", () => {
    const { doc } = meshFixture();
    const mask = {
      width: 16,
      height: 16,
      data: Array.from({ length: 256 }, (_, i) => {
        const x = i % 16,
          y = Math.floor(i / 16);
        return x >= 5 && x <= 10 && y >= 5 && y <= 10 ? 0 : 1;
      }),
    };
    const m = meshFromMask(uid(3), doc.assetReferences[0], mask, {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      tx: 0,
      ty: 0,
    });
    expect(m.vertices.length).toBeGreaterThan(20);
    for (let i = 0; i < m.triangles.length; i += 3) {
      const tri = m.triangles.slice(i, i + 3).map((j) => m.vertices[j]);
      const u = tri.reduce((s, v) => s + v.u, 0) / 3,
        v = tri.reduce((s, v) => s + v.v, 0) / 3;
      expect(
        mask.data[
          Math.min(15, Math.floor(v * 16)) * 16 +
            Math.min(15, Math.floor(u * 16))
        ],
      ).toBe(1);
    }
  });
  it("rejects empty and undersized alpha regions", () => {
    const { doc } = meshFixture();
    expect(() =>
      meshFromMask(
        uid(3),
        doc.assetReferences[0],
        { width: 4, height: 4, data: Array(16).fill(0) },
        { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      ),
    ).toThrow();
  });
  it("adds and deletes a vertex with valid indices, UVs and weights", () => {
    const { doc, mesh } = meshFixture();
    autoWeights(doc, mesh, [uid(101), uid(102)]);
    const id = addVertex(doc, mesh.id, 0.4, 0.6);
    expect(mesh.vertices).toHaveLength(5);
    expect(() => parseDocument(doc)).not.toThrow();
    removeVertex(doc, mesh.id, id);
    expect(mesh.vertices).toHaveLength(4);
    expect(() => parseDocument(doc)).not.toThrow();
  });
  it("rejects duplicate, out of alpha and excessive deletion", () => {
    const { doc, mesh } = meshFixture();
    expect(() => addVertex(doc, mesh.id, 0, 0)).toThrow();
    expect(() => addVertex(doc, mesh.id, 2, 2)).toThrow();
    removeVertex(doc, mesh.id, uid(204));
    expect(() => removeVertex(doc, mesh.id, uid(203))).toThrow();
  });
  it("uses original UV topology for retriangulation after deformation", () => {
    const { mesh } = meshFixture();
    mesh.vertices[2].x += 10;
    expect(triangulate(mesh.vertices, mesh.alphaMask).length).toBe(6);
  });
  it("restores source positions without flattening or replacing texture", () => {
    const { doc, mesh } = meshFixture();
    mesh.vertices[2].x = 120;
    resetMesh(doc, mesh.id);
    expect(mesh.vertices[2].x).toBe(100);
    expect(doc.assetReferences).toHaveLength(1);
  });
});
describe("linear blend skinning and weight edits", () => {
  it("preserves rest composition and rotates weighted vertices with a bone", () => {
    const { doc, mesh } = meshFixture();
    autoWeights(doc, mesh, [uid(101)]);
    expect(skinVertices(doc, mesh)[1]).toEqual({ x: 100, y: 0 });
    doc.rigSettings.mode = "pose";
    doc.bones[0].pose.rotation = 90;
    const p = skinVertices(doc, mesh)[1];
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(100);
    expect(deformationWarnings(doc, mesh)).toBe(0);
  });
  it("normalizes manually changed influence weights", () => {
    const { doc, mesh } = meshFixture();
    autoWeights(doc, mesh, [uid(101), uid(102)]);
    setVertexWeight(doc, mesh.id, uid(201), uid(101), 0.25);
    const record = doc.vertexWeights.find((w) => w.vertexId === uid(201))!;
    expect(record.influences.find((i) => i.boneId === uid(101))!.weight).toBe(
      0.25,
    );
    expect(record.influences.reduce((s, i) => s + i.weight, 0)).toBeCloseTo(1);
    expect(() => parseDocument(doc)).not.toThrow();
  });
  it("reweights safely when a bone is removed", () => {
    const { doc, mesh } = meshFixture();
    autoWeights(doc, mesh, [uid(101), uid(102)]);
    removeBone(doc, uid(102));
    expect(mesh.boneIds).toEqual([uid(101)]);
    expect(doc.vertexWeights.every((w) => w.influences[0].weight === 1)).toBe(
      true,
    );
    expect(() => parseDocument(doc)).not.toThrow();
  });
  it("moves a skinned vertex to a requested world point", () => {
    const { doc, mesh } = meshFixture();
    autoWeights(doc, mesh, [uid(101)]);
    doc.rigSettings.mode = "pose";
    doc.bones[0].pose.rotation = 30;
    moveVertexWorld(doc, mesh.id, uid(202), { x: 90, y: 60 });
    const p = skinVertices(doc, mesh)[1];
    expect(p.x).toBeCloseTo(90);
    expect(p.y).toBeCloseTo(60);
  });
  it("round trips every mesh and weight field in a portable project", () => {
    const { doc, mesh } = meshFixture();
    autoWeights(doc, mesh, [uid(101), uid(102)]);
    doc.bones[1].pose.rotation = 20;
    expect(unpackProject(packageProject(doc))).toEqual(doc);
  });
  it("reports folded skinning triangles rather than claiming valid deformation", () => {
    const { doc, mesh } = meshFixture();
    autoWeights(doc, mesh, [uid(101), uid(102)]);
    doc.rigSettings.mode = "pose";
    for (const w of doc.vertexWeights)
      w.influences = [
        { boneId: w.vertexId === uid(203) ? uid(102) : uid(101), weight: 1 },
      ];
    doc.bones[1].pose.rotation = -170;
    expect(deformationWarnings(doc, mesh)).toBeGreaterThan(0);
  });
});
describe("mesh schema rejection", () => {
  it("reports negative and fractional indices as schema errors, not property access crashes", () => {
    for (const index of [-1, 1.5]) {
      const { doc, mesh } = meshFixture();
      mesh.triangles[0] = index;
      try {
        parseDocument(doc);
        throw Error("accepted invalid");
      } catch (error) {
        expect(error).toHaveProperty("name", "ZodError");
      }
    }
  });
  for (const [name, mutate] of [
    [
      "out of range index",
      (m: EditableMesh) => {
        m.triangles[0] = 900;
      },
    ],
    [
      "duplicate index",
      (m: EditableMesh) => {
        m.triangles[0] = 1;
      },
    ],
    [
      "malformed triple",
      (m: EditableMesh) => {
        m.triangles.push(0);
      },
    ],
    [
      "bad UV",
      (m: EditableMesh) => {
        m.vertices[0].u = -1;
      },
    ],
    [
      "degenerate triangle",
      (m: EditableMesh) => {
        m.vertices[1].x = 0;
      },
    ],
    [
      "flipped triangle",
      (m: EditableMesh) => {
        m.vertices[2].x = -10;
      },
    ],
    [
      "bad mask",
      (m: EditableMesh) => {
        m.alphaMask.data = [];
      },
    ],
    [
      "singular bind",
      (m: EditableMesh) => {
        m.bindMatrix.a = 0;
      },
    ],
  ] as const)
    it("rejects " + name, () => {
      const { doc, mesh } = meshFixture();
      mutate(mesh);
      expect(() => parseDocument(doc)).toThrow();
    });
  it("rejects missing weights and non-normalized weights", () => {
    const { doc, mesh } = meshFixture();
    autoWeights(doc, mesh, [uid(101)]);
    doc.vertexWeights[0].influences[0].weight = 0.5;
    expect(() => parseDocument(doc)).toThrow();
    doc.vertexWeights.shift();
    expect(() => parseDocument(doc)).toThrow();
  });
});
