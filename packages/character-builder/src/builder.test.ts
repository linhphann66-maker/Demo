import { describe, it, expect } from "vitest";
import {
  foreground,
  components,
  classify,
  recommend,
  filterCandidates,
  type Raster,
} from "./detect";
import {
  assemble,
  emptyBuild,
  rigAssembly,
  axisOf,
  addBuilderAnimations,
} from "./assembly";
import { worldAnchor, ensureAssembly, setAnchor } from "./layout";
import { fixture } from "../../document-core/src/fixture";
import {
  primarySlots,
  parseDocument,
  serialize,
  type CharacterBuild,
  type PartCandidate,
  type Asset,
} from "../../document-core/src";
import { packageProject, unpackProject } from "../../exporters/src";
import { boneMatrices } from "../../rig-core/src";
import { evaluateClip } from "../../animation-core/src";
import { useEditor } from "../../editor-core/src/store";
import { candidateWorldPoint, applyClassification } from "./model-results";
import { modelResultSchema } from "./provider";
import { applyGeminiAnalysis } from "./gemini";
import { type AIAnalysis } from "../../ai-contracts/src/gemini";
import {
  builderBackup,
  saveBuilderProject,
  restoreBuilderProject,
} from "../../editor-core/src/builder-backup";
const uuid = () => crypto.randomUUID();
function raster(w = 32, h = 32, opaque = false): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  if (opaque) data.fill(255);
  return { width: w, height: h, data };
}
function paint(
  r: Raster,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba = [30, 40, 50, 255],
) {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) r.data.set(rgba, (j * r.width + i) * 4);
}
function draft() {
  const base = fixture(),
    assets: Asset[] = [],
    candidates: PartCandidate[] = [];
  for (const [i, slot] of primarySlots.entries()) {
    const source: Asset = {
        ...base.assetReferences[0],
        id: uuid(),
        name: slot,
        width: 32,
        height: 80,
        provenance: "user-created",
      },
      preview = {
        ...source,
        id: uuid(),
        dependencies: [source.id],
        kind: "derived" as const,
      };
    assets.push(source, preview);
    candidates.push({
      id: uuid(),
      sourceAssetId: source.id,
      previewAssetId: preview.id,
      label: slot,
      confidence: 0.95,
      bbox: { x: 0, y: 0, width: 32, height: 80 },
      mask: { width: 4, height: 8, data: new Array(32).fill(255) },
      orientation: "unknown",
      warnings: [],
      method: "filename",
      rejected: false,
      material: i < 2 ? "rigid" : "soft",
    });
  }
  const b: CharacterBuild = {
    id: uuid(),
    version: 2,
    mode: "layers",
    sourceAssetIds: assets
      .filter((a) => !a.dependencies.length)
      .map((a) => a.id),
    candidates,
    selection: recommend(candidates),
    layerMappings: [],
    method: "procedural",
    provider: null,
    warnings: [],
    approved: false,
  };
  return emptyBuild(base, assets, b, "Builder test");
}
describe("bounded procedural detection", () => {
  it("persists semantic Gemini suggestions and gates uncertain anatomical limbs before rigging", () => {
    const d = draft(),
      b = d.characterBuild!,
      original = JSON.stringify(d.assetReferences);
    const result: AIAnalysis = {
      viewpoint: "side_3_4",
      facing: "right",
      assignments: b.candidates.map((c, i) => ({
        candidateId: c.id,
        slot: primarySlots[i],
        confidence: 0.95,
        lateralityCertain: i !== 3,
        depth: i === 3 ? "far" : "unknown",
        warnings: [],
      })),
      ambiguousCandidateIds: [],
      missingSlots: [],
      renderOrder: b.candidates.map((c) => c.id).reverse(),
      anchors: [
        {
          candidateId: b.candidates[2].id,
          name: "neck_anchor",
          x: 0.52,
          y: 0.04,
        },
      ],
      warnings: [],
    };
    applyGeminiAnalysis(d, result, "gemini-3.8-flash", uuid());
    expect(JSON.stringify(d.assetReferences)).toBe(original);
    expect(b.aiReview?.needsReviewCandidateIds).toEqual([b.candidates[3].id]);
    const assembled = assemble(d);
    expect(() => rigAssembly(structuredClone(assembled))).toThrow(/xác nhận/);
    assembled.characterBuild!.aiReview!.needsReviewCandidateIds = [];
    const rigged = rigAssembly(assembled);
    expect(rigged.bones).toHaveLength(22);
    const restored = unpackProject(packageProject(rigged));
    expect(restored.characterBuild?.aiReview).toEqual(
      rigged.characterBuild?.aiReview,
    );
    expect(
      restored.characterBuild?.assembly?.anchors[0].points.neck_anchor,
    ).toEqual({ x: 0.52, y: 0.04 });
  });
  it("restores a pre-builder project without stale optional provenance and keeps undoable source data", () => {
    const old = fixture(),
      next = draft(),
      map = new Map<string, string>(),
      storage = {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
          map.set(key, value);
        },
      };
    useEditor.getState().open(old);
    saveBuilderProject(next, old, storage);
    expect(builderBackup(storage)?.projectId).toBe(old.projectId);
    expect(restoreBuilderProject(storage)).toBe(true);
    expect(useEditor.getState().error).toBe(null);
    expect(useEditor.getState().document?.characterBuild).toBeUndefined();
    expect(useEditor.getState().document?.projectId).toBe(old.projectId);
    useEditor.getState().undo();
    expect(useEditor.getState().document?.characterBuild?.id).toBe(
      next.characterBuild?.id,
    );
    useEditor.getState().redo();
    expect(useEditor.getState().document?.characterBuild).toBeUndefined();
  });
  it("preserves every original transparent-edge alpha value", () => {
    const r = raster();
    paint(r, 5, 5, 10, 10, [255, 255, 255, 128]);
    const result = foreground(r);
    expect(result.opaque).toBe(false);
    expect(result.alpha[5 * 32 + 5]).toBe(128);
    expect(result.alpha[0]).toBe(0);
  });
  it("removes border-connected white while retaining enclosed white clothing", () => {
    const r = raster(32, 32, true);
    paint(r, 6, 6, 20, 20);
    paint(r, 9, 9, 14, 14, [255, 255, 255, 255]);
    const result = foreground(r);
    expect(result.alpha[0]).toBe(0);
    expect(result.alpha[16 * 32 + 16]).toBe(255);
    expect(result.warnings.join()).toMatch(/restore/);
  });
  it("warns about nonuniform opaque backgrounds", () => {
    const r = raster(32, 32, true);
    paint(r, 31, 31, 1, 1, [0, 0, 0, 255]);
    expect(foreground(r).warnings.join()).toMatch(/không đồng nhất/);
  });
  it("detects isolated components and ignores isolated single-pixel noise", () => {
    const r = raster();
    paint(r, 2, 2, 5, 8);
    paint(r, 20, 15, 7, 10);
    paint(r, 31, 0, 1, 1);
    expect(components(r, "sheet").components).toHaveLength(2);
  });
  it("groups a small adjacent detached highlight with the main anatomical component", () => {
    const r = raster(64, 64);
    paint(r, 10, 10, 20, 30);
    paint(r, 31, 15, 2, 2);
    expect(components(r, "sheet").components).toHaveLength(1);
  });
  it("never resegments an independent PNG even with disconnected islands", () => {
    const r = raster();
    paint(r, 2, 2, 5, 5);
    paint(r, 25, 25, 4, 4);
    expect(components(r, "layers").components).toHaveLength(1);
    expect(components(r, "sheet").components).toHaveLength(2);
  });
  it("rejects malformed and oversized decoded rasters", () => {
    expect(() => foreground(raster(1025, 1025))).toThrow();
    expect(() =>
      foreground({ width: 10, height: 10, data: new Uint8ClampedArray(2) }),
    ).toThrow();
  });
  it.each([
    ["head_base.png", "head"],
    ["Tay trái.png", "left_arm"],
    ["near_leg.webp", "right_leg"],
    ["Tóc.jpg", "hair"],
  ])(
    "classifies named layer %s without claiming a model",
    (filename, label) => {
      const r = classify(
        { bbox: { x: 0, y: 0, width: 30, height: 80 }, filename },
        { width: 100, height: 100 },
        0,
        1,
      );
      expect(r.label).toBe(label);
      expect(r.method).toBe("filename");
      expect(r.warnings.join()).toMatch(/chưa/);
    },
  );
  it("marks geometric classification uncertain", () => {
    const r = classify(
      { bbox: { x: 0, y: 0, width: 100, height: 100 }, filename: "sheet.png" },
      { width: 500, height: 500 },
      0,
      8,
    );
    expect(r.confidence).toBeLessThan(0.8);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
describe("editable assembly, stable references and semantic retargeting", () => {
  it("can preview six real selected parts without inventing absent slots, but cannot rig the incomplete assembly", () => {
    const doc = draft();
    doc.characterBuild!.selection.hair = null;
    const partial = assemble(doc, { allowPartial: true });
    expect(partial.layers).toHaveLength(6);
    expect(partial.characterBuild!.layerMappings).toHaveLength(6);
    expect(
      partial.characterBuild!.layerMappings.some((m) => m.slot === "hair"),
    ).toBe(false);
    expect(() => parseDocument(partial)).not.toThrow();
    expect(() => rigAssembly(partial)).toThrow(/7 phần/);
    expect(partial.bones).toHaveLength(0);
  });
  it("does not create an empty assembly preview when every slot is unassigned", () => {
    const doc = draft();
    for (const slot of primarySlots) doc.characterBuild!.selection[slot] = null;
    expect(() => assemble(doc, { allowPartial: true })).toThrow(/ít nhất/);
    expect(doc.layers).toHaveLength(0);
  });

  it("chooses only one compatible variant per slot and ignores rejected candidates", () => {
    const d = draft(),
      b = d.characterBuild!,
      head = { ...b.candidates[0], id: uuid(), confidence: 1 };
    b.candidates.push(head);
    expect(recommend(b.candidates).head).toBe(head.id);
    head.rejected = true;
    expect(recommend(b.candidates).head).toBe(b.candidates[0].id);
    expect(Object.values(recommend(b.candidates)).filter(Boolean)).toHaveLength(
      7,
    );
  });
  it("assembles eight ordinary layers in far-to-near order and preserves source bytes", () => {
    const d = draft(),
      before = d.assetReferences.map((a) => a.data),
      result = assemble(d);
    expect(result.layers).toHaveLength(7);
    expect(result.characterBuild!.layerMappings.map((m) => m.slot)).toEqual([
      "left_arm",
      "left_leg",
      "right_leg",
      "torso",
      "head",
      "hair",
      "right_arm",
    ]);
    expect(result.assetReferences.map((a) => a.data)).toEqual(before);
    expect(result.characterSettings.characterView).toBe("side_3_4");
  });
  it("refuses assembly with a missing slot and refuses overwriting an existing rig", () => {
    const d = draft();
    d.characterBuild!.selection.hair = null;
    expect(() => assemble(d)).toThrow();
    const rig = rigAssembly(assemble(draft()));
    expect(() => rigAssembly(rig)).toThrow(/tồn tại/);
    expect(() => assemble(rig)).toThrow(/ghi đè/);
  });
  it("creates a valid proportion-aware hierarchy, attachments and four IK chains", () => {
    const d = rigAssembly(assemble(draft()));
    expect(d.bones).toHaveLength(22);
    expect(d.attachments).toHaveLength(7);
    expect(d.ikTargets).toHaveLength(4);
    expect(
      d.bones.every((b) => Number.isFinite(b.rest.x) && b.length > 0),
    ).toBe(true);
    expect(() => parseDocument(d)).not.toThrow();
    const hand = d.bones.find((b) => b.name === "Near Hand")!,
      socket = d.bones.find((b) => b.name === "Weapon Socket")!;
    expect(socket).toBeUndefined();
    expect(hand).toBeDefined();
  });
  it("PCA estimates an internal joint axis without cutting a limb texture", () => {
    const d = draft(),
      b = d.characterBuild!,
      c = b.candidates[4],
      a = d.assetReferences.find((a) => a.id === c.previewAssetId)!;
    const axis = axisOf(c, a);
    expect(axis.end.y).toBeGreaterThan(axis.start.y);
    expect(Math.abs(axis.end.x - axis.start.x)).toBeLessThan(1);
    expect(axis.length).toBeGreaterThan(40);
  });
  it("generates five editable clips on fresh IDs and repeated generation is idempotent", () => {
    const d = addBuilderAnimations(rigAssembly(assemble(draft())));
    expect(d.animationClips.map((c) => c.name)).toEqual([
      "Idle",
      "Walk",
      "Run",
      "Attack",
      "Hurt",
    ]);
    expect(d.keyframeTracks.length).toBeGreaterThan(20);
    const before = serialize(d);
    expect(serialize(addBuilderAnimations(d))).toBe(before);
    const walk = d.animationClips.find((c) => c.name === "Walk")!;
    expect(() => evaluateClip(d, walk.id, 0.25)).not.toThrow();
    const t = d.keyframeTracks.find(
      (t) => t.clipId === walk.id && t.type === "ik.y",
    )!;
    const target = d.ikTargets.find((k) => k.id === t.targetId)!,
      foot = boneMatrices(d, "rest").get(target.endBoneId)!;
    expect(Math.abs((t.keyframes[0].value as number) - foot.ty)).toBeLessThan(
      60,
    );
  });
  it("roundtrips original sources, decisions, masks, rig and clips in the portable archive", () => {
    const d = addBuilderAnimations(rigAssembly(assemble(draft())));
    expect(unpackProject(packageProject(d))).toEqual(d);
    expect(parseDocument(JSON.parse(serialize(d)))).toEqual(d);
    expect(parseDocument(fixture()).characterBuild).toBeUndefined();
  });
  it.each([
    "bad-source",
    "bounds",
    "duplicate-slot",
    "bad-mask",
    "bad-mapping",
    "approved-incomplete",
  ])("rejects corrupt build %s", (issue) => {
    const d = assemble(draft()),
      b = d.characterBuild!;
    if (issue === "bad-source") b.candidates[0].sourceAssetId = uuid();
    if (issue === "bounds") b.candidates[0].bbox.width = 4096;
    if (issue === "duplicate-slot") b.selection.hair = b.selection.head;
    if (issue === "bad-mask") b.candidates[0].mask.data = [];
    if (issue === "bad-mapping") b.layerMappings[0].layerId = uuid();
    if (issue === "approved-incomplete") {
      b.approved = true;
      b.selection.hair = null;
    }
    expect(() => parseDocument(d)).toThrow();
  });
  it("keeps builder provenance coherent through normal editor delete, undo and redo", () => {
    const d = assemble(draft()),
      id = d.layers[0].id;
    useEditor.getState().open(d, true);
    useEditor.getState().removeLayer(id);
    expect(
      useEditor.getState().document!.characterBuild!.layerMappings,
    ).toHaveLength(6);
    useEditor.getState().undo();
    expect(useEditor.getState().document!.layers.some((l) => l.id === id)).toBe(
      true,
    );
    expect(
      useEditor.getState().document!.characterBuild!.layerMappings,
    ).toHaveLength(7);
    useEditor.getState().redo();
    expect(useEditor.getState().document!.layers.some((l) => l.id === id)).toBe(
      false,
    );
  });
  it("applies approved model classification by candidate ID and resolves local landmarks", () => {
    const d = assemble(draft()),
      b = d.characterBuild!,
      c = b.candidates[0],
      result = modelResultSchema.parse({
        providerId: "test-contract",
        model: "mock",
        parts: [],
        classifications: [
          {
            candidateId: c.id,
            label: "head",
            confidence: 0.9,
            orientation: "right",
            warnings: [],
          },
        ],
        image: null,
        landmarks: [],
        assembly: [],
      });
    applyClassification(b, result, uuid());
    expect(c.provider!.approved).toBe(true);
    expect(b.method).toBe("provider");
    const p = candidateWorldPoint(d, c.id, { x: 16, y: 40 });
    expect(Number.isFinite(p.x)).toBe(true);
    expect(() => candidateWorldPoint(d, uuid(), { x: 0, y: 0 })).toThrow();
  });
});

describe("seven-slot anchored builder", () => {
  it("exposes exactly seven canonical slots and rejects new face data", () => {
    expect(primarySlots).toEqual([
      "head",
      "hair",
      "torso",
      "left_arm",
      "right_arm",
      "left_leg",
      "right_leg",
    ]);
    const d = draft();
    (d.characterBuild!.candidates[0] as { label: string }).label = "face";
    expect(() => parseDocument(d)).toThrow();
  });
  it("migrates an eight-slot file while preserving the old face artwork and source document", () => {
    const d = assemble(draft()),
      old = JSON.parse(JSON.stringify(d)),
      b = old.characterBuild,
      head = b.candidates[0],
      asset = old.assetReferences.find(
        (a: Asset) => a.id === head.previewAssetId,
      ),
      face = { ...head, id: uuid(), previewAssetId: uuid(), label: "face" };
    old.assetReferences.push({ ...asset, id: face.previewAssetId });
    const layer = {
      ...old.layers.find((l: { assetId: string }) => l.assetId === asset.id),
      id: uuid(),
      assetId: face.previewAssetId,
    };
    old.layers.push(layer);
    old.hierarchy.push({ layerId: layer.id, parentId: null });
    b.version = 1;
    delete b.assembly;
    b.candidates.push(face);
    b.selection.face = face.id;
    b.layerMappings.push({
      slot: "face",
      candidateId: face.id,
      layerId: layer.id,
    });
    const before = JSON.stringify(old),
      loaded = parseDocument(old);
    expect(loaded.characterBuild!.version).toBe(2);
    expect(Object.keys(loaded.characterBuild!.selection)).not.toContain("face");
    expect(loaded.characterBuild!.legacyFaceLayerIds).toEqual([layer.id]);
    expect(loaded.layers).toEqual(old.layers);
    expect(loaded.assetReferences).toEqual(old.assetReferences);
    expect(JSON.stringify(old)).toBe(before);
    expect(parseDocument(JSON.parse(serialize(loaded)))).toEqual(loaded);
  });
  it("keeps the strongest three candidates per slot and suppresses near duplicates without losing source records", () => {
    const d = draft(),
      head = d.characterBuild!.candidates[0],
      variants = Array.from({ length: 6 }, (_, i) => ({
        ...structuredClone(head),
        id: uuid(),
        confidence: 0.9 - i * 0.02,
        appearance: new Array(256).fill(0xf000 | (i * 3)),
      }));
    variants[1].appearance = [...variants[0].appearance];
    filterCandidates(variants);
    expect(variants).toHaveLength(6);
    expect(variants[1].rejected).toBe(true);
    expect(
      variants.filter((c) => !c.rejected && c.label === "head"),
    ).toHaveLength(3);
    expect(variants.some((c) => c.label === "unknown")).toBe(true);
  });
  it("filters isolated tiny noise while grouping a small nearby fragment", () => {
    const r = raster(120, 120);
    paint(r, 15, 15, 45, 70);
    paint(r, 61, 25, 2, 2);
    for (let n = 0; n < 7; n++) paint(r, 90, n * 10, 2, 2);
    const result = components(r, "sheet");
    expect(result.components).toHaveLength(1);
    expect(result.components[0].width).toBeGreaterThan(45);
  });
  it("does not guess arms or legs from one ambiguous narrow region", () => {
    const r = classify(
      {
        bbox: { x: 150, y: 200, width: 30, height: 100 },
        filename: "sheet.png",
      },
      { width: 500, height: 500 },
      0,
      7,
      [{ x: 150, y: 200, width: 30, height: 100 }],
    );
    expect(r.label).toBe("unknown");
    expect(r.confidence).toBeLessThan(0.5);
  });
  it("normalizes extreme part dimensions and keeps each pair of limb lengths consistent", () => {
    const d = draft(),
      b = d.characterBuild!;
    for (const slot of ["head", "right_arm", "right_leg"] as const) {
      const c = b.candidates.find((c) => c.id === b.selection[slot])!,
        a = d.assetReferences.find((a) => a.id === c.previewAssetId)!;
      a.width *= 5;
      a.height *= 5;
    }
    const out = assemble(d),
      layer = (slot: (typeof primarySlots)[number]) =>
        out.layers.find(
          (l) => l.id === b.layerMappings.find((m) => m.slot === slot)!.layerId,
        )!,
      length = (slot: (typeof primarySlots)[number]) => {
        const c = b.candidates.find((c) => c.id === b.selection[slot])!,
          a = out.assetReferences.find((a) => a.id === c.previewAssetId)!;
        return axisOf(c, a).length * layer(slot).scaleX;
      };
    expect(length("left_arm") / length("right_arm")).toBeCloseTo(1, 4);
    expect(length("left_leg") / length("right_leg")).toBeCloseTo(1, 1);
    expect(out.characterBuild!.assembly!.warnings.length).toBeGreaterThan(0);
    expect(out.characterBuild!.assembly!.scales.head).toBeLessThan(1);
  });
  it("uses torso anchor coincidences for neck, shoulders and hips and attaches hair to the scalp", () => {
    const d = assemble(draft());
    for (const [part, from, to] of [
      ["head", "neck_base", "neck_anchor"],
      ["left_arm", "shoulder_joint", "left_shoulder_anchor"],
      ["right_arm", "shoulder_joint", "right_shoulder_anchor"],
      ["left_leg", "hip_joint", "left_hip_anchor"],
      ["right_leg", "hip_joint", "right_hip_anchor"],
    ] as const) {
      const a = worldAnchor(d, part, from),
        b = worldAnchor(d, "torso", to);
      expect(a.x).toBeCloseTo(b.x, 7);
      expect(a.y).toBeCloseTo(b.y, 7);
    }
    const hair = worldAnchor(d, "hair", "scalp_anchor"),
      head = worldAnchor(d, "head", "scalp_anchor");
    expect(hair.x).toBeCloseTo(head.x, 7);
    expect(hair.y).toBeCloseTo(head.y, 7);
  });
  it("persists custom anchor and normalization settings and restores original pixel scales", () => {
    const d = draft(),
      id = d.characterBuild!.selection.torso!;
    setAnchor(d, id, "neck_anchor", { x: 0.7, y: 0.1 });
    let out = assemble(d);
    expect(worldAnchor(out, "head", "neck_base")).toEqual(
      worldAnchor(out, "torso", "neck_anchor"),
    );
    expect(unpackProject(packageProject(out))).toEqual(out);
    out = structuredClone(out);
    ensureAssembly(out).normalized = false;
    out = assemble(out);
    expect(out.layers.every((l) => l.scaleX === 1 && l.scaleY === 1)).toBe(
      true,
    );
    expect(out.characterBuild!.assembly!.anchors[0].points.neck_anchor).toEqual(
      { x: 0.7, y: 0.1 },
    );
  });
  it("rejects unsupported anchor references and duplicate optional accessories", () => {
    const d = draft();
    ensureAssembly(d).anchors.push({
      candidateId: uuid(),
      points: { neck_anchor: { x: 0.5, y: 0 } },
    });
    expect(() => parseDocument(d)).toThrow();
    const e = draft();
    e.characterBuild!.optionalAttachments = [
      {
        kind: "sword",
        candidateId: e.characterBuild!.selection.head!,
        layerId: null,
      },
    ];
    expect(() => parseDocument(e)).toThrow();
  });
  it("keeps optional cloak and sword outside seven-slot mapping, binds them to conditional bones", () => {
    const d = draft(),
      b = d.characterBuild!;
    for (const kind of ["cloak", "sword"] as const) {
      const c = {
        ...structuredClone(b.candidates[0]),
        id: uuid(),
        label: "unknown" as const,
      };
      b.candidates.push(c);
      (b.optionalAttachments ??= []).push({
        kind,
        candidateId: c.id,
        layerId: null,
      });
    }
    const out = rigAssembly(assemble(d));
    expect(out.characterBuild!.layerMappings).toHaveLength(7);
    expect(out.bones).toHaveLength(25);
    for (const a of out.characterBuild!.optionalAttachments!) {
      const bone = out.bones.find(
        (b) => b.name === (a.kind === "cloak" ? "Cape Base" : "Weapon Socket"),
      )!;
      expect(
        out.attachments.some(
          (x) => x.layerId === a.layerId && x.boneId === bone.id,
        ),
      ).toBe(true);
    }
  });
});

it("rejects malformed legacy builder entries through schema validation", () => {
  const d = JSON.parse(JSON.stringify(draft()));
  d.characterBuild.version = 1;
  d.characterBuild.layerMappings = [null];
  try {
    parseDocument(d);
    throw Error("Expected rejection");
  } catch (e) {
    expect((e as { issues?: unknown }).issues).toBeDefined();
  }
});
