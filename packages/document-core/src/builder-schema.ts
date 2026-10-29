import { z } from "zod";
export const primarySlots = [
  "head",
  "hair",
  "torso",
  "left_arm",
  "right_arm",
  "left_leg",
  "right_leg",
] as const;
export const slotSchema = z.enum(primarySlots);
const id = z.string().uuid();

export const anchorNames = [
  "neck_anchor",
  "left_shoulder_anchor",
  "right_shoulder_anchor",
  "left_hip_anchor",
  "right_hip_anchor",
  "cloak_anchor",
  "weapon_anchor",
  "neck_base",
  "scalp_anchor",
  "shoulder_joint",
  "hip_joint",
] as const;
const point = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();
export const assemblySettingsSchema = z
  .object({
    normalized: z.boolean(),
    scales: z.record(slotSchema, z.number().finite().min(0.01).max(20)),
    anchors: z
      .array(
        z
          .object({
            candidateId: id,
            points: z.record(z.enum(anchorNames), point),
          })
          .strict(),
      )
      .max(64),
    warnings: z.array(z.string().max(300)).max(32),
  })
  .strict();
export type AssemblySettings = z.infer<typeof assemblySettingsSchema>;
export type AnchorName = (typeof anchorNames)[number];
export const candidateSchema = z
  .object({
    id,
    sourceAssetId: id,
    previewAssetId: id,
    label: z.enum([...primarySlots, "unknown"]),
    confidence: z.number().finite().min(0).max(1),
    bbox: z
      .object({
        x: z.number().int().min(0).max(4095),
        y: z.number().int().min(0).max(4095),
        width: z.number().int().min(1).max(4096),
        height: z.number().int().min(1).max(4096),
      })
      .strict(),
    mask: z
      .object({
        width: z.number().int().min(1).max(128),
        height: z.number().int().min(1).max(128),
        data: z.array(z.number().int().min(0).max(255)).max(16384),
      })
      .strict()
      .refine(
        (m) => m.data.length === m.width * m.height,
        "Invalid candidate mask",
      ),
    orientation: z.enum(["right", "left", "unknown"]),
    warnings: z.array(z.string().max(300)).max(32),
    method: z.enum([
      "alpha_components",
      "solid_background",
      "filename",
      "manual",
      "provider",
    ]),
    rejected: z.boolean(),
    provider: z
      .object({
        id: z.string().max(100),
        model: z.string().max(100),
        jobId: id,
        approved: z.boolean(),
      })
      .strict()
      .optional(),
    material: z.enum(["soft", "rigid"]),
    appearance: z
      .array(z.number().int().min(0).max(65535))
      .length(256)
      .optional(),
  })
  .strict();
export const buildSchema = z
  .object({
    version: z.literal(2),
    id,
    mode: z.enum(["sheet", "layers", "complete"]),
    sourceAssetIds: z.array(id).min(1).max(64),
    candidates: z.array(candidateSchema).max(64),
    selection: z
      .object({
        head: id.nullable(),
        hair: id.nullable(),
        torso: id.nullable(),
        left_arm: id.nullable(),
        right_arm: id.nullable(),
        left_leg: id.nullable(),
        right_leg: id.nullable(),
      })
      .strict(),
    layerMappings: z
      .array(
        z.object({ slot: slotSchema, candidateId: id, layerId: id }).strict(),
      )
      .max(7),
    method: z.enum(["procedural", "provider", "manual"]),
    provider: z
      .object({ id: z.string().max(100), model: z.string().max(100) })
      .strict()
      .nullable(),
    warnings: z.array(z.string().max(300)).max(100),
    approved: z.boolean(),
    assembly: assemblySettingsSchema.optional(),
    optionalAttachments: z
      .array(
        z
          .object({
            kind: z.enum(["cloak", "sword"]),
            candidateId: id,
            layerId: id.nullable(),
          })
          .strict(),
      )
      .max(2)
      .optional(),
    legacyFaceLayerIds: z.array(id).max(16).optional(),
    aiReview: z.object({
      model:z.string().max(100),jobId:id,at:z.string().datetime(),
      viewpoint:z.enum(['side_3_4','side','front','unknown']),facing:z.enum(['right','left','unknown']),
      renderOrder:z.array(id).max(48),needsReviewCandidateIds:z.array(id).max(48),
      assignments:z.array(z.object({candidateId:id,slot:slotSchema,confidence:z.number().finite().min(0).max(1),lateralityCertain:z.boolean(),depth:z.enum(['near','far','unknown'])}).strict()).max(7),
    }).strict().optional(),
  })
  .strict();
export type PartSlot = z.infer<typeof slotSchema>;
export type PartCandidate = z.infer<typeof candidateSchema>;
export type CharacterBuild = z.infer<typeof buildSchema>;
export function validateBuild(
  p: {
    characterBuild?: CharacterBuild;
    assetReferences: {
      id: string;
      width: number;
      height: number;
      dependencies: string[];
    }[];
    layers: { id: string; assetId: string }[];
  },
  fail: (s: string) => void,
) {
  const b = p.characterBuild;
  if (!b) return;
  const assets = new Map(p.assetReferences.map((a) => [a.id, a]));
  if(b.aiReview){
    const r=b.aiReview;
    if([...r.renderOrder,...r.needsReviewCandidateIds,...r.assignments.map(a=>a.candidateId)].some(id=>!b.candidates.some(c=>c.id===id)))fail('Missing AI review candidate');
    if(new Set(r.assignments.map(a=>a.candidateId)).size!==r.assignments.length||new Set(r.assignments.map(a=>a.slot)).size!==r.assignments.length)fail('Duplicate AI assignment');
  }
  const ids = [b.id, ...b.candidates.map((c) => c.id)];
  if (new Set(ids).size !== ids.length) fail("Duplicate builder IDs");
  for (const source of b.sourceAssetIds)
    if (!assets.has(source)) fail("Missing builder source");
  for (const c of b.candidates) {
    const source = assets.get(c.sourceAssetId),
      preview = assets.get(c.previewAssetId);
    if (!source || !b.sourceAssetIds.includes(c.sourceAssetId) || !preview)
      fail("Missing candidate images");
    if (
      source &&
      (c.bbox.x + c.bbox.width > source.width ||
        c.bbox.y + c.bbox.height > source.height)
    )
      fail("Candidate exceeds source image");
    if (preview && !preview.dependencies.includes(c.sourceAssetId))
      fail("Candidate source dependency missing");
  }
  for (const entry of b.assembly?.anchors ?? [])
    if (!b.candidates.some((c) => c.id === entry.candidateId))
      fail("Missing anchor candidate");
  if (
    new Set(b.assembly?.anchors.map((a) => a.candidateId) ?? []).size !==
    (b.assembly?.anchors.length ?? 0)
  )
    fail("Duplicate anchor candidate");
  const optional = b.optionalAttachments ?? [];
  if (
    new Set(optional.map((a) => a.kind)).size !== optional.length ||
    new Set(optional.map((a) => a.candidateId)).size !== optional.length
  )
    fail("Duplicate optional attachment");
  for (const a of optional)
    if (
      !b.candidates.some((c) => c.id === a.candidateId && !c.rejected) ||
      Object.values(b.selection).includes(a.candidateId) ||
      (a.layerId && !p.layers.some((l) => l.id === a.layerId))
    )
      fail("Invalid optional attachment");
  for (const layerId of b.legacyFaceLayerIds ?? [])
    if (!p.layers.some((l) => l.id === layerId))
      fail("Missing legacy detail layer");
  if (
    b.approved &&
    (b.layerMappings.length !== primarySlots.length ||
      Object.values(b.selection).some((id) => !id))
  )
    fail("Approved builder must have all 7 slots");
  const selected = Object.values(b.selection).filter((x): x is string => !!x);
  if (new Set(selected).size !== selected.length)
    fail("Duplicate primary selection; duplicate the candidate explicitly");
  for (const id of selected)
    if (!b.candidates.some((c) => c.id === id && !c.rejected))
      fail("Invalid selected candidate");
  if (
    new Set(b.layerMappings.map((m) => m.slot)).size !== b.layerMappings.length
  )
    fail("Duplicate builder slot");
  for (const m of b.layerMappings) {
    const c = b.candidates.find((c) => c.id === m.candidateId),
      layer = p.layers.find((l) => l.id === m.layerId);
    if (!c || !layer || b.selection[m.slot] !== c.id)
      fail("Invalid assembled mapping");
  }
}

/** Upgrade provenance only: old rendered layers/assets/meshes are not rewritten. */
export function migrateBuild(input: unknown): unknown {
  if (
    !input ||
    typeof input !== "object" ||
    (input as { version?: number }).version !== 1
  )
    return input;
  const raw = input as Record<string, unknown>;
  if (
    !raw.selection ||
    typeof raw.selection !== "object" ||
    Array.isArray(raw.selection) ||
    !Array.isArray(raw.layerMappings) ||
    raw.layerMappings.some(
      (m) => !m || typeof m !== "object" || !("layerId" in m),
    ) ||
    !Array.isArray(raw.candidates) ||
    raw.candidates.some(
      (c) => !c || typeof c !== "object" || !Array.isArray(c.warnings),
    )
  )
    return input;
  const b = structuredClone(input) as Record<string, unknown>;
  const selection = b.selection as Record<string, unknown>;
  if (selection && typeof selection === "object") delete selection.face;
  if (Array.isArray(b.layerMappings)) {
    b.legacyFaceLayerIds = b.layerMappings
      .filter((m: Record<string, unknown>) => m.slot === "face")
      .map((m: Record<string, unknown>) => m.layerId);
    b.layerMappings = b.layerMappings.filter(
      (m: Record<string, unknown>) => m.slot !== "face",
    );
  }
  if (Array.isArray(b.candidates))
    b.candidates = b.candidates.map((c: Record<string, unknown>) =>
      c.label === "face"
        ? {
            ...c,
            label: "unknown",
            warnings: [
              ...((c.warnings as string[]) ?? []),
              "Chi tiết đầu từ dự án cũ; giữ ảnh nguồn, không dùng làm slot chính.",
            ].slice(0, 32),
          }
        : c,
    );
  b.version = 2;
  return b;
}
