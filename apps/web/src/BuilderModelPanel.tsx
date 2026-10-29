import { useState } from "react";
import { requestBuilderModel } from "./builder-provider";
import type {
  BuilderProviderStatus,
  BuilderCapability,
  BuilderModelResult,
} from "../../../packages/character-builder/src/provider";
import type { Asset, PartCandidate } from "../../../packages/document-core/src";
const titles: Record<BuilderCapability, string> = {
  classification: "AI gợi ý nhãn",
  segmentation: "AI segmentation",
  background_removal: "AI tách nền",
  inpainting: "AI hoàn thiện texture",
  landmarks: "AI landmark",
  assembly: "AI kế hoạch lắp ráp",
};
export function BuilderModelPanel({
  status,
  consent,
  setConsent,
  images,
  candidates,
  selected,
  busy,
  run,
  apply,
  revision,
}: {
  status: BuilderProviderStatus;
  consent: boolean;
  setConsent: (v: boolean) => void;
  images: Asset[];
  candidates: PartCandidate[];
  selected: PartCandidate | undefined;
  busy: boolean;
  run: (
    task: (
      signal: AbortSignal,
      update: (p: number, label: string) => void,
    ) => Promise<void>,
  ) => Promise<void>;
  revision: number;
  apply: (
    cap: BuilderCapability,
    result: BuilderModelResult,
    jobId: string,
    candidateId: string | undefined,
    revision: number,
  ) => Promise<void>;
}) {
  const [pending, setPending] = useState<{
      cap: BuilderCapability;
      result: BuilderModelResult;
      jobId: string;
      candidateId?: string;
      revision: number;
    } | null>(null),
    [retry, setRetry] = useState<{
      cap: BuilderCapability;
      jobId: string;
      revision: number;
    } | null>(null);
  const request = (cap: BuilderCapability, retryId?: string) =>
    void run(async (signal, update) => {
      setPending(null);
      const imageOp = [
        "inpainting",
        "background_removal",
        "landmarks",
      ].includes(cap);
      const source =
        imageOp && selected
          ? images.find((a) => a.id === selected.previewAssetId)
          : undefined;
      const inputs = source
          ? [source]
          : images
              .filter((a) => candidates.some((c) => c.sourceAssetId === a.id))
              .slice(0, 16),
        parts =
          source && selected
            ? [
                {
                  ...selected,
                  sourceAssetId: source.id,
                  bbox: {
                    x: 0,
                    y: 0,
                    width: source.width,
                    height: source.height,
                  },
                },
              ]
            : candidates.filter((c) =>
                inputs.some((a) => a.id === c.sourceAssetId),
              );
      try {
        const response = await requestBuilderModel(
          cap,
          inputs,
          parts,
          consent,
          signal,
          update,
          retryId,
        );
        if (signal.aborted) return;
        setPending({
          cap,
          result: response.result,
          jobId: response.jobId,
          candidateId: selected?.id,
          revision,
        });
        setRetry(null);
      } catch (error) {
        const match = String(error).match(/job ([\da-f-]{36})/i);
        if (match) setRetry({ cap, jobId: match[1], revision });
        throw error;
      }
    });
  return (
    <details>
      <summary>
        Provider thật ·{" "}
        {status.ready
          ? status.providerId + " / " + status.model
          : "chưa khả dụng"}
      </summary>
      <p>
        {status.reason ??
          "Kết quả model phải được duyệt; không tự ghi đè artwork."}
      </p>
      <label>
        <input
          aria-label="Builder provider consent"
          type="checkbox"
          checked={consent}
          disabled={!status.ready || busy}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Đồng ý gửi ảnh tới provider đã cấu hình trên server
      </label>
      {(Object.keys(titles) as BuilderCapability[]).map((cap) => (
        <button
          key={cap}
          disabled={
            busy ||
            !consent ||
            !status.ready ||
            !status.capabilities.includes(cap) ||
            !candidates.length ||
            (["inpainting", "background_removal", "landmarks"].includes(cap) &&
              !selected)
          }
          onClick={() => request(cap)}
        >
          {titles[cap]}
        </button>
      ))}
      {retry && (
        <button
          disabled={busy || !consent || retry.revision !== revision}
          onClick={() => request(retry.cap, retry.jobId)}
        >
          Thử lại job lỗi (tối đa 1 lần)
        </button>
      )}
      {pending && (
        <section>
          <p>
            Đã nhận kết quả thực từ {pending.result.providerId} /{" "}
            {pending.result.model}. Hãy xem trước rồi áp dụng.
          </p>
          {pending.result.image && (
            <img
              alt="Provider output awaiting approval"
              src={pending.result.image.data}
              style={{ maxWidth: 240, maxHeight: 240, objectFit: "contain" }}
            />
          )}
          <pre
            style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}
          >
            {JSON.stringify(
              {
                parts: pending.result.parts.length,
                classifications: pending.result.classifications,
                landmarks: pending.result.landmarks,
                assembly: pending.result.assembly,
              },
              null,
              2,
            )}
          </pre>
          <button
            disabled={busy}
            onClick={() =>
              void run(async (signal, update) => {
                if (signal.aborted) return;
                await apply(
                  pending.cap,
                  pending.result,
                  pending.jobId,
                  pending.candidateId,
                  pending.revision,
                );
                if (signal.aborted) return;
                setPending(null);
                update(1, "Đã áp dụng kết quả được duyệt; có thể Undo.");
              })
            }
          >
            Chấp thuận kết quả model
          </button>
          <button disabled={busy} onClick={() => setPending(null)}>
            Bỏ kết quả · giữ nguồn
          </button>
        </section>
      )}
    </details>
  );
}
