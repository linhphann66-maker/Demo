import {buildSchema,validateBuild,migrateBuild} from './builder-schema';
export * from './builder-schema';
import {effectIds,validateEffectReferences} from '../../vfx-core/src/validation';
import { effectSchema } from '../../vfx-core/src/schema';
import {
  characterSettingsSchema,
  characterVariantSchema,
  partSchema,
  jointSchema,
  jointReportSchema,
  validateCharacter,
  legacyCharacterSettings,
} from "./character-schema";
export type {
  CharacterPart,
  CharacterJoint,
  JointIssue,
  JointReport,
  DeformationMode,
} from "./character-schema";
export * from "./character";
import {
  clipSchema,
  trackSchema,
  eventSchema,
  validateAnimations,
} from "./animation-schema";
export type {
  AnimationClip,
  AnimationTrack,
  Keyframe,
  AnimationValue,
  AnimationChannel,
  AnimationEvent,
  MeshOffsets,
  EasingHandles,
} from "./animation-schema";
import {
  skeletonSchema,
  boneSchema,
  meshSchema,
  weightSchema,
  attachmentSchema,
  slotSchema,
  ikSchema,
  validateRig,
} from "./rig-schema";
export type {
  Bone,
  Skeleton,
  EditableMesh,
  Vertex,
  VertexWeight,
  IKTarget,
} from "./rig-schema";
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
    pivotX: finite.min(-4096).max(4096).optional(),
    pivotY: finite.min(-4096).max(4096).optional(),
  })
  .strict();
export const projectSchema = z
  .object({
    schemaVersion: z.literal(4),
    characterBuild:buildSchema.optional(),
    projectId: id,
    characterSettings: characterSettingsSchema,
    characterVariants: z.array(characterVariantSchema).max(2),
    characterParts: z.array(partSchema).max(1000),
    characterJoints: z.array(jointSchema).max(128),
    jointValidation: jointReportSchema.nullable(),
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
    skeletons: z.array(skeletonSchema).max(16),
    bones: z.array(boneSchema).max(256),
    meshes: z.array(meshSchema).max(128),
    vertexWeights: z.array(weightSchema).max(16384),
    equipmentSlots: z.array(slotSchema).max(128),
    attachments: z.array(attachmentSchema).max(1000),
    ikTargets: z.array(ikSchema).max(128),
    rigSettings: z.object({ mode: z.enum(["rest", "pose"]) }).strict(),
    animationClips: z.array(clipSchema).max(64),
    keyframeTracks: z.array(trackSchema).max(4096),
    animationEvents: z.array(eventSchema).max(8192),
    vfxGraphs: z.array(effectSchema).max(32),
    vfxPresets:z.array(effectSchema).max(64).optional(),
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
      ...p.characterVariants.map((v) => v.id),
      ...p.characterParts.map((v) => v.id),
      ...p.characterJoints.map((v) => v.id),
      ...(p.jointValidation
        ? [p.jointValidation.id, ...p.jointValidation.issues.map((i) => i.id)]
        : []),
      ...p.animationClips.map((c) => c.id),
      ...p.keyframeTracks.flatMap((t) => [
        t.id,
        ...t.keyframes.map((k) => k.id),
      ]),
      ...p.animationEvents.map((e) => e.id),
      ...[
        ...p.skeletons,
        ...p.bones,
        ...p.meshes,
        ...p.vertexWeights,
        ...p.attachments,
        ...p.equipmentSlots,
        ...p.ikTargets,
        ...p.meshes.flatMap((m) => m.vertices),
      ].map((a) => a.id),
    ];
    if (new Set(all).size !== all.length)
      fail("ID bị trùng / Duplicate entity ID");
    const effects=[...p.vfxGraphs,...(p.vfxPresets??[])];
    if(effects.reduce((sum,e)=>sum+(e.tracks??[]).reduce((n,t)=>n+t.keys.length,0),0)>20000)fail("VFX exceeds 20000 parameter keys");
    const vfxIds=effects.flatMap(effectIds);
    if(new Set([...all,...vfxIds]).size!==all.length+vfxIds.length) fail('Duplicate VFX ID');
    for(const e of effects)validateEffectReferences(e,p,fail);
    validateBuild(p,fail);
    if(p.characterBuild){const ids=[p.characterBuild.id,...p.characterBuild.candidates.map(c=>c.id)];if(new Set([...all,...vfxIds,...ids]).size!==all.length+vfxIds.length+ids.length)fail("Duplicate builder entity ID");}
    validateRig(p, fail);
    validateAnimations(p, fail);
    validateCharacter(p, fail);
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
  if (raw.schemaVersion === 1) {
    raw.schemaVersion = 2;
    raw.ikTargets = [];
    raw.rigSettings = { mode: "rest" };
  }
  if (raw.schemaVersion === 2) raw.schemaVersion = 3;
  if (raw.schemaVersion === 3) {
    raw.schemaVersion = 4;
    raw.characterSettings = legacyCharacterSettings();
    raw.characterVariants = [];
    raw.characterParts = [];
    raw.characterJoints = [];
    raw.jointValidation = null;
  }
  if (raw.schemaVersion !== 4)
    throw Error("Phiên bản dự án chưa được hỗ trợ / Unsupported version");
  if(raw.characterBuild)raw.characterBuild=migrateBuild(raw.characterBuild);
  return projectSchema.parse(raw);
}
export function serialize(doc: ProjectDocument) {
  return JSON.stringify(parseDocument(doc));
}
export function syncHierarchy(doc: ProjectDocument) {
  const hierarchy = doc.layers.map((l) => ({
    layerId: l.id,
    parentId: l.parentId,
  }));
  if (
    hierarchy.length !== doc.hierarchy.length ||
    hierarchy.some(
      (h, i) =>
        h.layerId !== doc.hierarchy[i]?.layerId ||
        h.parentId !== doc.hierarchy[i]?.parentId,
    )
  )
    doc.hierarchy = hierarchy;
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
    c: -Math.sin(r) * layer.scaleY || 0,
    d: Math.cos(r) * layer.scaleY,
    tx: layer.x,
    ty: layer.y,
  };
  m.tx -= m.a * (layer.pivotX ?? 0) + m.c * (layer.pivotY ?? 0);
  m.ty -= m.b * (layer.pivotX ?? 0) + m.d * (layer.pivotY ?? 0);
  const parent = doc.layers.find((l) => l.id === layer.parentId);
  return parent ? multiply(worldMatrix(doc, parent), m) : m;
}
