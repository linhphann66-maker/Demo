export type Capability =
  | "character"
  | "costume"
  | "weapon"
  | "segmentation"
  | "inpainting"
  | "landmarks"
  | "rig-plan"
  | "mesh-suggestion"
  | "motion-plan"
  | "vfx-config"
  | "edit-command"
  | "quality-check";
export type JobStatus =
  | "REQUEST"
  | "VALIDATE"
  | "PLAN"
  | "EXECUTE"
  | "VERIFY"
  | "PREVIEW"
  | "APPROVAL"
  | "COMMIT"
  | "FAILED"
  | "CANCELLED";
export interface AIRequest {
  id: string;
  capability: Capability;
  prompt: string;
  targetIds: string[];
  baseRevision: number;
  parameters: Record<string, unknown>;
}
export interface AIPlan {
  request: AIRequest;
  steps: string[];
  providerId: string;
}
export interface AIOutput {
  patch: unknown;
  inputReferences: string[];
  outputReferences: string[];
  provenance: { provider: string; model: string; seed?: number };
  findings: string[];
}
export interface AIJob {
  id: string;
  status: JobStatus;
  progress: number;
  request: AIRequest;
  output?: AIOutput;
  error?: { code: string; message: string; retryable: boolean };
  createdAt: string;
  updatedAt: string;
  cancellable: boolean;
}
export interface AIProvider {
  id: string;
  capabilities: Capability[];
  availability(): Promise<{ ready: boolean; reason?: string }>;
  plan(request: AIRequest, signal: AbortSignal): Promise<AIPlan>;
  execute(plan: AIPlan, signal: AbortSignal): Promise<AIOutput>;
}
export class ProviderRegistry {
  private providers = new Map<string, AIProvider>();
  register(p: AIProvider) {
    if (this.providers.has(p.id)) throw Error("Duplicate provider");
    this.providers.set(p.id, p);
  }
  forCapability(c: Capability) {
    return [...this.providers.values()].filter((p) =>
      p.capabilities.includes(c),
    );
  }
}
export const registry = new ProviderRegistry();

/** Provider-independent side-scroller contract. No provider execution is implied. */
export interface SideCharacterSpec {
  characterView: "side_3_4";
  facing: "right";
  movementMode: "horizontal";
  fullBody: true;
  neutralPose: true;
  separateNearFarLimbs: true;
  preserveOccludedRegions: true;
  perspective: "mild";
}
export const sideCharacterSpec: SideCharacterSpec = {
  characterView: "side_3_4",
  facing: "right",
  movementMode: "horizontal",
  fullBody: true,
  neutralPose: true,
  separateNearFarLimbs: true,
  preserveOccludedRegions: true,
  perspective: "mild",
};
export function sideCharacterPrompt(identity: string) {
  return `${identity}. Side-scrolling 2D game character, 3/4 side view facing right, full body, neutral pose. Separated near/far arms and legs, front/back hair, consistent anatomy, clean silhouette, rig-friendly proportions. Preserve occluded joint/body regions and authored overlap/underlap. Mild perspective only. No front-facing symmetrical stance, no up/down views, no 3D rotation. Deliver editable source textures, alpha masks, anatomical region metadata and completion provenance.`;
}
export interface AnatomicalEditRequest {
  projectId: string;
  sourceAssetId: string;
  baseRevision: number;
  anatomy:
    | "near_arm"
    | "far_arm"
    | "near_leg"
    | "far_leg"
    | "hair_front"
    | "hair_back"
    | "torso"
    | "cape"
    | "armor"
    | "weapon";
  preserveSourcePixels: true;
  preserveOccludedRegions: true;
  overlapPixels: number;
  underlapPixels: number;
  generation: SideCharacterSpec;
}
export interface AnatomicalRegionOutput {
  region: AnatomicalEditRequest["anatomy"];
  sourceAssetId: string;
  alphaMaskReference: string;
  visibleRegionReference: string;
  occludedRegionReference: string;
  overlapTextureReference: string;
  underlapTextureReference: string;
  pivot: { x: number; y: number };
  boneReferences: string[];
  provenance: { provider: string; model: string; seed?: number };
  editablePatch: unknown;
  reviewFindings: string[];
}
export * from './vfx';
