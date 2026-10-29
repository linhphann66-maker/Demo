import type {
  AISettings,
  AIJob,
  AnalyzeRequest,
} from "../../../packages/ai-contracts/src/gemini";
let csrf: string | null = null;
export class AIRequestError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function aiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (init.method && init.method !== "GET" && !csrf) await aiSettings();
  const r = await fetch("/api/ai" + path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...init.headers,
    },
  });
  const value = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && value?.code === "session_expired") csrf = null;
    throw new AIRequestError(
      value?.code ?? "server_error",
      typeof value?.detail === "string"
        ? value.detail
        : "Backend AI chưa kết nối hoặc phản hồi không hợp lệ.",
    );
  }
  if (value?.csrfToken) csrf = value.csrfToken;
  return value;
}
export async function aiSettings(): Promise<AISettings> {
  return aiRequest("/settings");
}
const pause = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const end = () => {
        clearTimeout(t);
        reject(new DOMException("Đã hủy", "AbortError"));
      },
      t = setTimeout(() => {
        signal.removeEventListener("abort", end);
        resolve();
      }, 500);
    signal.addEventListener("abort", end, { once: true });
    if (signal.aborted) end();
  });
export async function analyzeWithGemini(
  body: AnalyzeRequest,
  signal: AbortSignal,
  progress: (n: number, text: string) => void,
) {
  let id: string | undefined;
  let running: Promise<unknown> | undefined;
  try {
    let job = await aiRequest<AIJob>("/character/analyze", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    });
    id = job.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw Error("AI job ID không hợp lệ");
    // Worker starts execution inside an active HTTP request, not a fragile waitUntil background task.
    // FastAPI has already queued its bounded worker and returns immediately from this endpoint.
    if (job.state === "queued")
      running = aiRequest<AIJob>("/jobs/" + id + "/run", {
        method: "POST",
        signal,
      }).catch(() => null);
    const deadline = Date.now() + 85000;
    while (true) {
      progress(
        job.progress,
        job.state === "queued"
          ? "Đang chờ Gemini"
          : "Gemini đang phân tích các phần",
      );
      if (job.state === "succeeded" && job.result)
        return { ...job.result, jobId: id };
      if (job.state === "failed" || job.state === "cancelled")
        throw new AIRequestError(
          job.errorCode ?? "job_failed",
          job.error ?? "Job đã hủy",
        );
      if (Date.now() > deadline)
        throw new AIRequestError(
          "timeout",
          "Gemini quá thời gian chờ. Có thể thử lại thủ công.",
        );
      await pause(signal);
      job = await aiRequest<AIJob>("/jobs/" + id, { signal });
    }
  } catch (error) {
    if (id)
      void aiRequest("/jobs/" + id + "/cancel", { method: "POST" }).catch(
        () => {},
      );
    throw error;
  } finally {
    void running;
  }
}
