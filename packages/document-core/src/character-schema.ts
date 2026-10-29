import { z } from "zod";
import type { ProjectDocument } from "./index";
const id = z.string().uuid(),
  n = z.number().finite(),
  coordinate = n.min(-10000).max(10000);
export const characterSettingsSchema = z
  .object({
    characterView: z.enum(["side_3_4", "front"]),
    defaultFacing: z.enum(["right", "left"]),
    facing: z.enum(["right", "left"]),
    movementMode: z.literal("horizontal"),
    mirrorForOppositeDirection: z.boolean(),
    enableVerticalFacing: z.literal(false),
    worldPosition: z.object({ x: coordinate, y: coordinate }).strict(),
  })
  .strict();
export const legacyCharacterSettings = () => ({
  characterView: "front" as const,
  defaultFacing: "right" as const,
  facing: "right" as const,
  movementMode: "horizontal" as const,
  mirrorForOppositeDirection: true,
  enableVerticalFacing: false as const,
  worldPosition: { x: 0, y: 0 },
});
export const characterVariantSchema = z
  .object({
    id,
    name: z.string().min(1).max(100),
    view: z.enum(["side_3_4", "front"]),
    rootBoneId: id.nullable(),
    layerIds: z.array(id).max(1000),
    boneIds: z.array(id).max(256),
    clipIds: z.array(id).max(64),
    reference: z.boolean(),
  })
  .strict();
export const alphaSchema = z
  .object({
    width: z.number().int().min(1).max(128),
    height: z.number().int().min(1).max(128),
    data: z.array(z.number().int().min(0).max(1)).max(16384),
  })
  .strict()
  .refine(
    (v) => v.data.length === v.width * v.height,
    "Alpha mask size mismatch",
  );
export const partSchema = z
  .object({
    id,
    layerId: id,
    sourceAssetId: id,
    semantic: z.string().min(1).max(80),
    depth: z.enum(["near", "far", "center"]),
    alphaMask: alphaSchema,
    parentBoneId: id.nullable(),
    meshId: id.nullable(),
    attachmentId: id.nullable(),
    renderOrder: z.number().int().min(0).max(1000),
    jointId: id.nullable(),
    role: z.enum([
      "body",
      "continuous",
      "upper",
      "lower",
      "underlap",
      "overlap",
      "armor",
      "weapon",
    ]),
    overlapAssetId: id.nullable(),
    underlapAssetId: id.nullable(),
    mirrorPolicy: z.enum(["mirror", "keep_texture", "directional"]),
    leftAssetId: id.nullable(),
  })
  .strict();
export const deformationModeSchema = z.enum([
  "continuous_mesh",
  "overlap_only",
  "rigid_segment",
]);
export const jointSchema = z
  .object({
    id,
    name: z.string().min(1).max(100),
    kind: z.enum(["elbow", "knee", "shoulder", "hip", "cape", "hair", "weapon"]),
    upperBoneId: id,
    lowerBoneId: id,
    layerIds: z.array(id).min(1).max(16),
    mode: deformationModeSchema,
    overlapSize: n.min(0).max(48),
    underlapSize: n.min(0).max(48),
    radius: n.min(1).max(48),
    completion: z.enum(["procedural_neighbor_fill_v1", "user_authored"]),
  })
  .strict();
export const jointIssueSchema = z
  .object({
    id,
    jointId: id,
    kind: z.enum([
      "visible_gap",
      "exposed_alpha",
      "stretch",
      "invalid_triangle",
      "self_intersection",
      "broken_overlap",
      "unexpected_overlap",
      "invalid_weights",
      "rotation_limit",
    ]),
    severity: z.enum(["warning", "error"]),
    angle: n.min(-180).max(180),
    position: z.object({ x: coordinate, y: coordinate }).strict(),
    message: z.string().max(300),
    suggestions: z
      .array(
        z.enum([
          "increase_overlap",
          "adjust_pivot",
          "expand_underlap",
          "smooth_weights",
          "increase_density",
        ]),
      )
      .max(5),
  })
  .strict();
export const jointReportSchema = z
  .object({
    id,
    createdAt: z.string().datetime(),
    sourceRevision: z.number().int().nonnegative(),
    testedAngles: z.array(n.min(-180).max(180)).min(1).max(32),
    samples: z.number().int().min(0).max(1000000),
    uncoveredSamples: z.number().int().min(0).max(1000000),
    issues: z.array(jointIssueSchema).max(2048),
    jointIds: z.array(id).max(128),
  })
  .strict();
export type CharacterPart = z.infer<typeof partSchema>;
export type CharacterJoint = z.infer<typeof jointSchema>;
export type JointReport = z.infer<typeof jointReportSchema>;
export type JointIssue = z.infer<typeof jointIssueSchema>;
export type DeformationMode = z.infer<typeof deformationModeSchema>;
export function validateCharacter(
  p: ProjectDocument,
  fail: (m: string) => void,
) {
  const bones = new Map(p.bones.map((b) => [b.id, b])),
    layers = new Map(p.layers.map((l) => [l.id, l])),
    assets = new Map(p.assetReferences.map((a) => [a.id, a])),
    joints = new Map(p.characterJoints.map((j) => [j.id, j]));
  const unique = (a: string[]) => new Set(a).size === a.length;
  if (!unique(p.characterParts.map((p) => p.layerId)))
    fail("One semantic part per layer");
  if (!unique(p.characterVariants.map((v) => v.view)))
    fail("Duplicate character view");
  for (const key of ["layerIds", "boneIds", "clipIds"] as const)
    if (!unique(p.characterVariants.flatMap((v) => v[key])))
      fail("Entity belongs to multiple character views");
  for (const v of p.characterVariants) {
    if (
      v.layerIds.some((id) => !layers.has(id)) ||
      v.boneIds.some((id) => !bones.has(id)) ||
      v.clipIds.some((id) => !p.animationClips.some((c) => c.id === id)) ||
      !unique(v.layerIds) ||
      !unique(v.boneIds) ||
      !unique(v.clipIds)
    )
      fail("Invalid view references");
    if (
      v.rootBoneId &&
      (!v.boneIds.includes(v.rootBoneId) ||
        bones.get(v.rootBoneId)?.parentId !== null)
    )
      fail("View root must be a root bone");
  }
  if (
    p.characterVariants.length &&
    !p.characterVariants.some(
      (v) => v.view === p.characterSettings.characterView,
    )
  )
    fail("View has no artwork; do not synthesize a side view by rotation");
  for (const part of p.characterParts) {
    const l = layers.get(part.layerId),
      mesh = p.meshes.find((m) => m.id === part.meshId);
    if (
      !l ||
      l.assetId !== part.sourceAssetId ||
      !assets.has(part.sourceAssetId)
    )
      fail("Part source reference invalid");
    if (part.parentBoneId && !bones.has(part.parentBoneId))
      fail("Part parent bone invalid");
    if (part.meshId && (!mesh || mesh.layerId !== part.layerId))
      fail("Part mesh reference invalid");
    if (
      part.attachmentId &&
      !p.attachments.some(
        (a) => a.id === part.attachmentId && a.layerId === part.layerId,
      )
    )
      fail("Part attachment invalid");
    if (
      part.jointId &&
      (!joints.has(part.jointId) ||
        !joints.get(part.jointId)!.layerIds.includes(part.layerId))
    )
      fail("Part joint reference invalid");
    for (const ref of [
      part.overlapAssetId,
      part.underlapAssetId,
      part.leftAssetId,
    ])
      if (ref && !assets.has(ref)) fail("Part texture reference invalid");
    if (part.mirrorPolicy !== "mirror" && part.meshId)
      fail(
        "Mirror exceptions require a rigid sprite; deformable texture coordinates must remain canonical",
      );
    if (part.mirrorPolicy === "directional" && !part.leftAssetId)
      fail("Directional sprite needs an explicit left-facing texture");
    if (part.leftAssetId && l) {
      const a = assets.get(part.leftAssetId),
        b = assets.get(l.assetId);
      if (a && b && (a.width !== b.width || a.height !== b.height))
        fail("Directional textures must have matching dimensions");
    }
  }
  for (const j of p.characterJoints) {
    const bending = j.kind === "elbow" || j.kind === "knee";
    if (j.kind === "weapon" && j.mode !== "rigid_segment")
      fail("Weapon socket requires rigid attachment");
    if (
      j.mode === "continuous_mesh" &&
      !p.meshes.some((m) => j.layerIds.includes(m.layerId))
    )
      fail("Continuous joint requires real mesh data");
    if (
      j.mode === "overlap_only" &&
      (!bending ||
        !["upper", "lower"].every((role) =>
          p.characterParts.some(
            (part) => part.jointId === j.id && part.role === role,
          ),
        ))
    )
      fail("Overlap mode requires genuinely authored upper/lower textures");

    if (
      !bones.has(j.upperBoneId) ||
      !bones.has(j.lowerBoneId) ||
      j.layerIds.some((id) => !layers.has(id)) ||
      !unique(j.layerIds)
    )
      fail("Joint references invalid");
    if (
      ["elbow", "knee"].includes(j.kind) &&
      bones.get(j.lowerBoneId)?.parentId !== j.upperBoneId
    )
      fail("Joint bones must be adjacent");
  }
  if (
    p.jointValidation &&
    p.jointValidation.jointIds.some((id) => !joints.has(id))
  )
    fail("Validation references removed joints");
  if (p.jointValidation?.issues.some((i) => !joints.has(i.jointId)))
    fail("Validation issue references removed joint");
}
