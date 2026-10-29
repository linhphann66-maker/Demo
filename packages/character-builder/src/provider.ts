import { z } from "zod";
import { candidateSchema } from "../../document-core/src/builder-schema";
const id = z.string().uuid(),
  text = z.string().max(300);
export const builderCapabilities = [
  "classification",
  "segmentation",
  "background_removal",
  "inpainting",
  "landmarks",
  "assembly",
] as const;
export type BuilderCapability = (typeof builderCapabilities)[number];
export const modelPartSchema = z
  .object({
    sourceAssetId: id,
    bbox: candidateSchema.shape.bbox,
    mask: candidateSchema.shape.mask,
    label: candidateSchema.shape.label,
    confidence: candidateSchema.shape.confidence,
    orientation: candidateSchema.shape.orientation,
    warnings: z.array(text).max(16),
  })
  .strict();
export const modelResultSchema = z
  .object({
    providerId: z.string().min(1).max(100),
    model: z.string().min(1).max(100),
    parts: z.array(modelPartSchema).max(64),
    classifications: z
      .array(
        z
          .object({
            candidateId: id,
            label: candidateSchema.shape.label,
            confidence: candidateSchema.shape.confidence,
            orientation: candidateSchema.shape.orientation,
            warnings: z.array(text).max(16),
          })
          .strict(),
      )
      .max(64),
    image: z
      .object({
        id,
        name: z.string().max(100),
        width: z.number().int().min(1).max(4096),
        height: z.number().int().min(1).max(4096),
        data: z
          .string()
          .max(12_000_000)
          .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
      })
      .strict()
      .nullable(),
    landmarks: z
      .array(
        z
          .object({
            sourceAssetId: id,
            name: z.string().max(100),
            x: z.number().finite().min(0).max(4096),
            y: z.number().finite().min(0).max(4096),
            confidence: z.number().finite().min(0).max(1),
          })
          .strict(),
      )
      .max(64),
    assembly: z
      .array(
        z
          .object({
            candidateId: id,
            slot: z.enum([
              "head",
              "hair",
              "torso",
              "left_arm",
              "right_arm",
              "left_leg",
              "right_leg",
            ]),
            x: z.number().finite().min(-10000).max(10000),
            y: z.number().finite().min(-10000).max(10000),
            rotation: z.number().finite().min(-3600).max(3600),
            scale: z.number().finite().min(0.01).max(20),
          })
          .strict(),
      )
      .max(7),
  })
  .strict();
export type BuilderModelResult = z.infer<typeof modelResultSchema>;
export type BuilderProviderStatus = {
  configured: boolean;
  ready: boolean;
  capabilities: BuilderCapability[];
  providerId: string | null;
  model: string | null;
  reason: string | null;
};
