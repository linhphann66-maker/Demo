import type { Asset } from "../../document-core/src";
import type { PartCandidate } from "../../document-core/src/builder-schema";
import {
  classify,
  recommend,
  filterCandidates,
  type Detection,
} from "./detect";
export async function bitmap(asset: Asset) {
  const image = new Image();
  image.src = asset.data;
  await image.decode();
  return image;
}
export async function extractCandidate(
  source: Asset,
  c: PartCandidate,
): Promise<Asset> {
  const image = await bitmap(source),
    ratio = Math.min(1, 1024 / Math.max(c.bbox.width, c.bbox.height)),
    width = Math.max(1, Math.round(c.bbox.width * ratio)),
    height = Math.max(1, Math.round(c.bbox.height * ratio)),
    canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    image,
    c.bbox.x,
    c.bbox.y,
    c.bbox.width,
    c.bbox.height,
    0,
    0,
    width,
    height,
  );
  const mask = document.createElement("canvas");
  mask.width = c.mask.width;
  mask.height = c.mask.height;
  const m = mask.getContext("2d")!,
    pixels = m.createImageData(mask.width, mask.height);
  for (let i = 0; i < c.mask.data.length; i++) {
    pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255;
    pixels.data[i * 4 + 3] = c.mask.data[i];
  }
  m.putImageData(pixels, 0, 0);
  const expanded = document.createElement("canvas");
  expanded.width = width;
  expanded.height = height;
  const expandedContext = expanded.getContext("2d")!;
  expandedContext.drawImage(mask, 0, 0, width, height);
  const alpha = expandedContext.getImageData(0, 0, width, height).data,
    outputPixels = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < width * height; i++)
    outputPixels.data[i * 4 + 3] = Math.min(
      outputPixels.data[i * 4 + 3],
      alpha[i * 4 + 3],
    );
  ctx.putImageData(outputPixels, 0, 0);
  return {
    id: c.previewAssetId,
    name: (c.label + " · extracted").slice(0, 100),
    kind: "derived",
    provenance:
      source.provenance === "ai-generated" ? "ai-generated" : "user-created",
    dependencies: [source.id],
    width,
    height,
    data: canvas.toDataURL("image/png"),
  };
}
export async function detectAssets(
  sources: Asset[],
  mode: "sheet" | "layers",
  tolerance: number,
  signal: AbortSignal,
  progress: (n: number, label: string) => void,
) {
  const candidates: PartCandidate[] = [],
    assets: Asset[] = [...sources];
  for (let s = 0; s < sources.length; s++) {
    if (signal.aborted) throw new DOMException("Đã hủy", "AbortError");
    const source = sources[s],
      image = await bitmap(source),
      scale = Math.min(1, 1024 / Math.max(source.width, source.height)),
      width = Math.max(1, Math.round(source.width * scale)),
      height = Math.max(1, Math.round(source.height * scale)),
      canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    if (signal.aborted) throw new DOMException("Đã hủy", "AbortError");
    const worker = new Worker(
      new URL("../../../apps/web/src/builder-worker.ts", import.meta.url),
      { type: "module" },
    );
    const result = await new Promise<Detection>((resolve, reject) => {
      const abort = () => {
        worker.terminate();
        reject(new DOMException("Đã hủy", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = (event) => {
        signal.removeEventListener("abort", abort);
        worker.terminate();
        reject(Error(event.message));
      };
      worker.onmessage = (event) => {
        if (event.data.progress !== undefined)
          progress(
            (s + event.data.progress * 0.6) / sources.length,
            "Đang phân tích alpha/nền",
          );
        if (event.data.error) {
          signal.removeEventListener("abort", abort);
          worker.terminate();
          reject(Error(event.data.error));
        }
        if (event.data.result) {
          signal.removeEventListener("abort", abort);
          worker.terminate();
          resolve(event.data.result);
        }
      };
      worker.postMessage(
        { width, height, buffer: rgba.buffer, mode, tolerance },
        [rgba.buffer],
      );
    });
    if (result.components.length + candidates.length > 64)
      throw Error("Tối đa 64 ứng viên; hãy giảm nhiễu hoặc chia sheet.");
    for (let i = 0; i < result.components.length; i++) {
      if (signal.aborted) throw new DOMException("Đã hủy", "AbortError");
      const component = result.components[i],
        bbox = {
          x: Math.floor(component.x / scale),
          y: Math.floor(component.y / scale),
          width: Math.min(
            source.width - Math.floor(component.x / scale),
            Math.ceil(component.width / scale),
          ),
          height: Math.min(
            source.height - Math.floor(component.y / scale),
            Math.ceil(component.height / scale),
          ),
        };
      const w = Math.min(128, component.width),
        h = Math.min(128, component.height),
        member = new Set(component.pixels),
        data: number[] = [];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const sx =
              component.x +
              Math.min(
                component.width - 1,
                Math.floor(((x + 0.5) * component.width) / w),
              ),
            sy =
              component.y +
              Math.min(
                component.height - 1,
                Math.floor(((y + 0.5) * component.height) / h),
              ),
            p = sy * width + sx;
          data.push(
            member.has(p)
              ? result.method === "alpha_components"
                ? 255
                : result.mask[p]
              : 0,
          );
        }
      const suggestion = classify(
        { bbox, filename: mode === "layers" ? source.name : "sprite-sheet" },
        source,
        i,
        result.components.length,
        result.components.map((p) => ({
          x: Math.floor(p.x / scale),
          y: Math.floor(p.y / scale),
          width: Math.ceil(p.width / scale),
          height: Math.ceil(p.height / scale),
        })),
      );
      const candidate: PartCandidate = {
        id: crypto.randomUUID(),
        sourceAssetId: source.id,
        previewAssetId: crypto.randomUUID(),
        ...suggestion,
        bbox,
        mask: { width: w, height: h, data },
        orientation: "unknown",
        warnings: [...result.warnings, ...suggestion.warnings].slice(0, 32),
        rejected: false,
        material: "soft",
      };
      candidates.push(candidate);
      const preview = await extractCandidate(source, candidate);
      assets.push(preview);
      const signatureCanvas = document.createElement("canvas");
      signatureCanvas.width = signatureCanvas.height = 16;
      const sc = signatureCanvas.getContext("2d")!;
      sc.drawImage(await bitmap(preview), 0, 0, 16, 16);
      const sp = sc.getImageData(0, 0, 16, 16).data;
      candidate.appearance = Array.from(
        { length: 256 },
        (_, i) =>
          (sp[i * 4] >> 4) |
          ((sp[i * 4 + 1] >> 4) << 4) |
          ((sp[i * 4 + 2] >> 4) << 8) |
          ((sp[i * 4 + 3] >> 4) << 12),
      );
      progress(
        (s + 0.6 + (0.4 * (i + 1)) / result.components.length) / sources.length,
        "Đã trích PNG alpha " + candidates.length,
      );
    }
  }
  if (!candidates.length)
    throw Error(
      "Không tìm thấy vùng foreground đủ lớn. Hãy kiểm tra nền hoặc ngưỡng.",
    );
  filterCandidates(candidates);
  return { assets, candidates, selection: recommend(candidates) };
}
export function combineCandidates(
  list: PartCandidate[],
  source: Asset,
): PartCandidate {
  if (list.length < 2 || list.some((c) => c.sourceAssetId !== source.id))
    throw Error("Chọn ít nhất 2 ứng viên cùng ảnh nguồn");
  const x = Math.min(...list.map((c) => c.bbox.x)),
    y = Math.min(...list.map((c) => c.bbox.y)),
    right = Math.max(...list.map((c) => c.bbox.x + c.bbox.width)),
    bottom = Math.max(...list.map((c) => c.bbox.y + c.bbox.height)),
    width = Math.min(128, right - x),
    height = Math.min(128, bottom - y),
    data: number[] = [];
  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      const sx = x + ((px + 0.5) * (right - x)) / width,
        sy = y + ((py + 0.5) * (bottom - y)) / height;
      let alpha = 0;
      for (const c of list) {
        const u = (sx - c.bbox.x) / c.bbox.width,
          v = (sy - c.bbox.y) / c.bbox.height;
        if (u >= 0 && u < 1 && v >= 0 && v < 1)
          alpha = Math.max(
            alpha,
            c.mask.data[
              Math.floor(v * c.mask.height) * c.mask.width +
                Math.floor(u * c.mask.width)
            ],
          );
      }
      data.push(alpha);
    }
  return {
    ...structuredClone(list[0]),
    id: crypto.randomUUID(),
    previewAssetId: crypto.randomUUID(),
    bbox: { x, y, width: right - x, height: bottom - y },
    mask: { width, height, data },
    method: "manual",
    confidence: 1,
    warnings: ["Mask được gộp thủ công; hãy kiểm tra nhãn."],
  };
}
export function splitCandidate(
  c: PartCandidate,
  vertical = true,
): PartCandidate[] {
  if ((vertical ? c.mask.width : c.mask.height) < 2)
    throw Error("Mask quá nhỏ để chia");
  return [0, 1].map((side) => {
    const full = vertical ? c.mask.width : c.mask.height,
      cut = Math.floor(full / 2),
      start = side ? cut : 0,
      size = side ? full - cut : cut,
      w = vertical ? size : c.mask.width,
      h = vertical ? c.mask.height : size,
      data: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        data.push(
          c.mask.data[
            (y + (vertical ? 0 : start)) * c.mask.width +
              x +
              (vertical ? start : 0)
          ],
        );
    const bbox = { ...c.bbox };
    if (vertical) {
      const mid = Math.floor((c.bbox.width * cut) / full);
      bbox.x += side ? mid : 0;
      bbox.width = side ? c.bbox.width - mid : mid;
    } else {
      const mid = Math.floor((c.bbox.height * cut) / full);
      bbox.y += side ? mid : 0;
      bbox.height = side ? c.bbox.height - mid : mid;
    }
    return {
      ...structuredClone(c),
      id: crypto.randomUUID(),
      previewAssetId: crypto.randomUUID(),
      bbox,
      mask: { width: w, height: h, data },
      label: "unknown",
      confidence: 1,
      method: "manual",
      warnings: [
        "Đã chia mask thủ công; không phải tách khớp giải phẫu tự động.",
      ],
    };
  });
}
