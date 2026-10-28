import { z } from "zod";
export const id = z.string().uuid();
const finite = z.number().finite();
export const assetSchema = z
  .object({
    id,
    name: z.string().min(1).max(100),
    provenance: z.enum([
      "procedural",
      "user-created",
      "ai-generated",
      "template-based",
    ]),
    kind: z.enum(["source", "derived"]),
    dependencies: z.array(id).max(128),
    data: z
      .string()
      .max(12_000_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
  })
  .strict();
export const layerSchema = z
  .object({
    id,
    assetId: id,
    parentId: id.nullable(),
    name: z.string().min(1).max(100),
    visible: z.boolean(),
    locked: z.boolean(),
    opacity: finite.min(0).max(1),
    x: finite.min(-10000).max(10000),
    y: finite.min(-10000).max(10000),
    rotation: finite.min(-3600).max(3600),
    scaleX: finite.min(0.01).max(20),
    scaleY: finite.min(0.01).max(20),
  })
  .strict();
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: id,
    metadata: z
      .object({
        name: z.string().min(1).max(100),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
        revision: z.number().int().nonnegative(),
      })
      .strict(),
    characterDefinitions: z
      .array(
        z
          .object({
            id,
            name: z.string(),
            class: z.string(),
            style: z.string(),
            description: z.string(),
            plannedAnimations: z.array(z.string()),
            autoRig: z.boolean(),
            autoMesh: z.boolean(),
            autoVfx: z.boolean(),
          })
          .strict(),
      )
      .max(10),
    assetReferences: z.array(assetSchema).max(128),
    layers: z.array(layerSchema).max(1000),
    hierarchy: z
      .array(z.object({ layerId: id, parentId: id.nullable() }).strict())
      .max(1000),
    skeletons: z.array(z.never()),
    bones: z.array(z.never()),
    meshes: z.array(z.never()),
    vertexWeights: z.array(z.never()),
    equipmentSlots: z.array(z.never()),
    attachments: z.array(z.never()),
    animationClips: z.array(z.never()),
    keyframeTracks: z.array(z.never()),
    animationEvents: z.array(z.never()),
    vfxGraphs: z.array(z.never()),
    aiJobReferences: z.array(z.never()),
    revisionHistory: z
      .array(
        z
          .object({ id, at: z.string().datetime(), label: z.string().max(120) })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine((p, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const all = [
      p.projectId,
      ...p.characterDefinitions.map((a) => a.id),
      ...p.assetReferences.map((a) => a.id),
      ...p.layers.map((a) => a.id),
      ...p.revisionHistory.map((a) => a.id),
    ];
    if (new Set(all).size !== all.length)
      fail("ID bị trùng / Duplicate entity ID");
    const assets = new Map(p.assetReferences.map((a) => [a.id, a]));
    const layers = new Map(p.layers.map((a) => [a.id, a]));
    if (
      p.assetReferences.reduce(
        (n, a) => n + Math.ceil((a.data.split(",")[1].length * 3) / 4),
        0,
      ) >
      24 * 1024 * 1024
    )
      fail("Tổng ảnh vượt 24 MiB");
    for (const a of p.assetReferences) {
      if (a.dependencies.some((d) => !assets.has(d)))
        fail("Asset dependency missing");
      const seen = new Set([a.id]);
      const frontier = [...a.dependencies];
      while (frontier.length) {
        const n = frontier.pop()!;
        if (seen.has(n)) {
          if (n === a.id) fail("Asset dependency cycle");
          continue;
        }
        seen.add(n);
        frontier.push(...(assets.get(n)?.dependencies ?? []));
      }
    }
    for (const l of p.layers) {
      if (!assets.has(l.assetId)) fail("Layer asset missing");
      const seen = new Set([l.id]);
      let parent = l.parentId;
      while (parent) {
        if (seen.has(parent)) {
          fail("Hierarchy cycle");
          break;
        }
        seen.add(parent);
        const node = layers.get(parent);
        if (!node) {
          fail("Parent missing");
          break;
        }
        parent = node.parentId;
      }
    }
    if (
      p.hierarchy.length !== p.layers.length ||
      new Set(p.hierarchy.map((h) => h.layerId)).size !== p.layers.length ||
      p.hierarchy.some(
        (h) =>
          !layers.has(h.layerId) ||
          layers.get(h.layerId)?.parentId !== h.parentId,
      )
    )
      fail("Hierarchy inconsistent");
  });
export type ProjectDocument = z.infer<typeof projectSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type Asset = z.infer<typeof assetSchema>;
export function parseDocument(input: unknown): ProjectDocument {
  if (!input || typeof input !== "object") throw Error("Dự án không hợp lệ");
  const raw = { ...input } as Record<string, unknown>;
  if (raw.schemaVersion === 0) {
    raw.schemaVersion = 1;
  }
  if (raw.schemaVersion !== 1)
    throw Error("Phiên bản dự án chưa được hỗ trợ / Unsupported version");
  return projectSchema.parse(raw);
}
export function serialize(doc: ProjectDocument) {
  return JSON.stringify(parseDocument(doc));
}
export function syncHierarchy(doc: ProjectDocument) {
  doc.hierarchy = doc.layers.map((l) => ({
    layerId: l.id,
    parentId: l.parentId,
  }));
}
export function invalidatedAssets(doc: ProjectDocument, changedId: string) {
  const invalid = new Set<string>();
  let added = true;
  while (added) {
    added = false;
    for (const a of doc.assetReferences)
      if (
        !invalid.has(a.id) &&
        a.dependencies.some((d) => d === changedId || invalid.has(d))
      ) {
        invalid.add(a.id);
        added = true;
      }
  }
  return [...invalid];
}
export type Matrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
};
export function multiply(p: Matrix, q: Matrix): Matrix {
  return {
    a: p.a * q.a + p.c * q.b,
    b: p.b * q.a + p.d * q.b,
    c: p.a * q.c + p.c * q.d,
    d: p.b * q.c + p.d * q.d,
    tx: p.a * q.tx + p.c * q.ty + p.tx,
    ty: p.b * q.tx + p.d * q.ty + p.ty,
  };
}
export function worldMatrix(doc: ProjectDocument, layer: Layer): Matrix {
  const r = (layer.rotation * Math.PI) / 180;
  const m = {
    a: Math.cos(r) * layer.scaleX,
    b: Math.sin(r) * layer.scaleX,
    c: -Math.sin(r) * layer.scaleY,
    d: Math.cos(r) * layer.scaleY,
    tx: layer.x,
    ty: layer.y,
  };
  const parent = doc.layers.find((l) => l.id === layer.parentId);
  return parent ? multiply(worldMatrix(doc, parent), m) : m;
}
