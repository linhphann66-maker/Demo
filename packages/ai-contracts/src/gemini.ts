import { z } from "zod";
import {
  primarySlots,
  candidateSchema,
} from "../../document-core/src/builder-schema";
export const VISION_MODEL = "gemini-3.8-flash";
export const IMAGE_MODEL = "gemini-nano-banana-2.1";
export const modelId = z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/);
export const aiKeySchema = z
  .object({
    apiKey: z.string().min(16).max(256).nullable().optional(),
    visionModel: modelId.default(VISION_MODEL),
    imageModel: modelId.default(IMAGE_MODEL),
    persist: z.boolean().default(false),
  })
  .strict();
export const aiImageSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
    data: z
      .string()
      .max(12_000_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
  })
  .strict();
export const analyzeRequestSchema = z
  .object({
    images: z.array(aiImageSchema).min(1).max(16),
    overview: aiImageSchema,
    candidates: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            sourceAssetId: z.string().uuid(),
            bbox: candidateSchema.shape.bbox,
            image: aiImageSchema,
          })
          .strict(),
      )
      .min(1)
      .max(48),
    consent: z.literal(true),
  })
  .strict()
  .superRefine((r, ctx) => {
    const ids = new Set(r.candidates.map((c) => c.id)),
      sources = new Map(r.images.map((i) => [i.id, i]));
    if (ids.size !== r.candidates.length || sources.size !== r.images.length)
      ctx.addIssue({ code: "custom", message: "ID bị trùng" });
    for (const c of r.candidates) {
      const a = sources.get(c.sourceAssetId);
      if (
        !a ||
        c.bbox.x + c.bbox.width > a.width ||
        c.bbox.y + c.bbox.height > a.height
      )
        ctx.addIssue({ code: "custom", message: "Candidate ngoài ảnh nguồn" });
    }
    const all = [...r.images, r.overview, ...r.candidates.map((c) => c.image)];
    if (
      all.reduce((n, i) => n + i.width * i.height, 0) > 40 * 1024 * 1024 ||
      all.reduce((n, i) => n + (i.data.split(",")[1].length * 3) / 4, 0) >
        12 * 1024 * 1024
    )
      ctx.addIssue({ code: "custom", message: "Tổng ảnh vượt giới hạn" });
  });
export const analysisSchema = z
  .object({
    viewpoint: z.enum(["side_3_4", "side", "front", "unknown"]),
    facing: z.enum(["right", "left", "unknown"]),
    assignments: z
      .array(
        z
          .object({
            candidateId: z.string().uuid(),
            slot: z.enum(primarySlots),
            confidence: z.number().finite().min(0).max(1),
            lateralityCertain: z.boolean(),
            depth: z.enum(["near", "far", "unknown"]),
            warnings: z.array(z.string().max(300)).max(8),
          })
          .strict(),
      )
      .max(7),
    ambiguousCandidateIds: z.array(z.string().uuid()).max(48),
    missingSlots: z.array(z.enum(primarySlots)).max(7),
    renderOrder: z.array(z.string().uuid()).max(48),
    anchors: z
      .array(
        z
          .object({
            candidateId: z.string().uuid(),
            name: z.enum([
              "neck_anchor",
              "left_shoulder_anchor",
              "right_shoulder_anchor",
              "left_hip_anchor",
              "right_hip_anchor",
              "neck_base",
              "scalp_anchor",
              "shoulder_joint",
              "hip_joint",
            ]),
            x: z.number().finite().min(0).max(1),
            y: z.number().finite().min(0).max(1),
          })
          .strict(),
      )
      .max(64),
    warnings: z.array(z.string().max(300)).max(16),
  })
  .strict();
export type AIAnalysis = z.infer<typeof analysisSchema>;
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export function validateAIAnalysis(
  value: unknown,
  request: AnalyzeRequest,
): AIAnalysis {
  const result = analysisSchema.parse(value),
    known = new Set(request.candidates.map((c) => c.id));
  const ids = result.assignments.map((a) => a.candidateId),
    slots = result.assignments.map((a) => a.slot);
  const refs = [
    ...ids,
    ...result.ambiguousCandidateIds,
    ...result.renderOrder,
    ...result.anchors.map((a) => a.candidateId),
  ];
  if (
    new Set(ids).size !== ids.length ||
    new Set(slots).size !== slots.length ||
    new Set(result.renderOrder).size !== result.renderOrder.length ||
    refs.some((id) => !known.has(id))
  )
    throw Error("Model trả tham chiếu trùng hoặc không tồn tại");
  const missing = primarySlots.filter((s) => !slots.includes(s));
  if (
    result.missingSlots.length !== missing.length ||
    missing.some((s) => !result.missingSlots.includes(s)) ||
    new Set(result.missingSlots).size !== result.missingSlots.length
  )
    throw Error("Model trả part thiếu không khớp");
  return result;
}
export type AICapabilities = {
  imageUnderstanding: boolean;
  structuredOutput: boolean;
  imageEditing: boolean;
  imageGeneration: boolean;
};
export type AIModel = { id: string; displayName: string; methods: string[] };
export type AISettings = {
  configured: boolean;
  csrfToken: string;
  visionModel: string;
  imageModel: string;
  persistenceSupported: boolean;
  storageMode: "temporary-session";
  expiresAt: number;
  status: string;
  models: AIModel[];
  modelAvailability: { vision: boolean; image: boolean };
  capabilities: AICapabilities;
  usage: {
    operation: string;
    model: string;
    at: number;
    inputTokens: number;
    outputTokens: number;
    cached: boolean;
  }[];
  reason?: string;
};
export type AIJob = {
  id: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  result: null | { analysis: AIAnalysis; model: string; cached: boolean };
  error: string | null;
  errorCode?: string;
};
