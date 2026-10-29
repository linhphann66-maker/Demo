import {
  modelResultSchema,
  type BuilderCapability,
  type BuilderProviderStatus,
} from "../../../packages/character-builder/src/provider";
import type { Asset, PartCandidate } from "../../../packages/document-core/src";
const base = (import.meta.env.VITE_BUILDER_API_URL ?? "").replace(/\/$/, "");
export async function builderProviderStatus(): Promise<BuilderProviderStatus> {
  try {
    const c = new AbortController(),
      timer = setTimeout(() => c.abort(), 6000);
    try {
      const r = await fetch(base + "/api/builder/providers", {
        signal: c.signal,
      });
      if (!r.ok) throw Error("API unavailable");
      const status = await r.json();
      if (
        !status ||
        !Array.isArray(status.capabilities) ||
        typeof status.ready !== "boolean"
      )
        throw Error("API response invalid");
      return status;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return {
      configured: false,
      ready: false,
      capabilities: [],
      providerId: null,
      model: null,
      reason:
        "API/model provider chưa kết nối. A/B procedural vẫn hoạt động cục bộ.",
    };
  }
}
const pause = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("Đã hủy", "AbortError"));
      },
      timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 600);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
export async function requestBuilderModel(
  capability: BuilderCapability,
  images: Asset[],
  candidates: PartCandidate[],
  consent: boolean,
  signal: AbortSignal,
  progress: (n: number, label: string) => void,
  retryId?: string,
) {
  if (!consent) throw Error("Cần đồng ý gửi ảnh tới provider đã cấu hình");
  const controller = new AbortController(),
    cancel = () => controller.abort(),
    timeout = setTimeout(cancel, 80000);
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) controller.abort();
  let jobId: string | undefined;
  try {
    const payload = {
      capability,
      images: images.map(({ id, name, width, height, data }) => ({
        id,
        name,
        width,
        height,
        data,
      })),
      candidateIds: candidates.map((c) => c.id),
      parts: candidates.map(
        ({
          id: candidateId,
          sourceAssetId,
          bbox,
          mask,
          label,
          confidence,
          orientation,
          warnings,
        }) => ({
          candidateId,
          sourceAssetId,
          bbox,
          mask,
          label,
          confidence,
          orientation,
          warnings: warnings.slice(0, 16),
        }),
      ),
      consent,
    };
    const response = await fetch(
      base +
        (retryId
          ? "/api/builder/jobs/" + retryId + "/retry"
          : "/api/builder/jobs"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw Error(
        typeof detail?.detail === "string"
          ? detail.detail
          : "Không tạo được model job (HTTP " + response.status + ")",
      );
    }
    let job = await response.json();
    jobId = job.id;
    if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId))
      throw Error("Job ID không hợp lệ");
    while (true) {
      if (controller.signal.aborted)
        throw new DOMException("Đã hủy/timeout", "AbortError");
      progress(Number(job.progress) || 0, "Model job: " + job.state);
      if (job.state === "succeeded")
        return { result: modelResultSchema.parse(job.result), jobId };
      if (job.state === "failed" || job.state === "cancelled")
        throw Error((job.error ?? "Model job failed") + " · job " + jobId);
      await pause(controller.signal);
      const status = await fetch(base + "/api/builder/jobs/" + jobId, {
        signal: controller.signal,
      });
      if (!status.ok) throw Error("Không đọc được job " + jobId);
      job = await status.json();
    }
  } catch (error) {
    if (jobId && controller.signal.aborted)
      void fetch(base + "/api/builder/jobs/" + jobId + "/cancel", {
        method: "POST",
      }).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}
