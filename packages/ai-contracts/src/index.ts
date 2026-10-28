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
