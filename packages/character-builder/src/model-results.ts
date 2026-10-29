import {
  type Asset,
  type CharacterBuild,
  type PartCandidate,
  type ProjectDocument,
  worldMatrix,
} from "../../document-core/src";
import type { BuilderModelResult } from "./provider";
import { extractCandidate, bitmap } from "./images";
import { recommend } from "./detect";
export async function providerDetection(
  sources: Asset[],
  result: BuilderModelResult,
  jobId: string,
) {
  const candidates: PartCandidate[] = [],
    assets = [...sources];
  for (const part of result.parts) {
    const source = sources.find((a) => a.id === part.sourceAssetId);
    if (
      !source ||
      part.bbox.x + part.bbox.width > source.width ||
      part.bbox.y + part.bbox.height > source.height
    )
      throw Error("Model part nằm ngoài nguồn");
    const candidate: PartCandidate = {
      ...part,
      id: crypto.randomUUID(),
      previewAssetId: crypto.randomUUID(),
      method: "provider",
      rejected: false,
      material: "soft",
      provider: {
        id: result.providerId,
        model: result.model,
        jobId,
        approved: false,
      },
    };
    candidates.push(candidate);
    assets.push(await extractCandidate(source, candidate));
  }
  return { assets, candidates, selection: recommend(candidates) };
}
export async function generatedVariant(
  doc: ProjectDocument,
  candidate: PartCandidate,
  result: BuilderModelResult,
  jobId: string,
) {
  if (!result.image) throw Error("Model không trả ảnh");
  const old = doc.assetReferences.find(
      (a) => a.id === candidate.previewAssetId,
    )!,
    image = result.image;
  if (image.width !== old.width || image.height !== old.height)
    throw Error("Provider đổi kích thước texture; không áp dụng");
  const source: Asset = {
      ...image,
      id: crypto.randomUUID(),
      name: (candidate.label + " · provider " + result.model).slice(0, 100),
      kind: "derived",
      provenance: "ai-generated",
      dependencies: [old.id],
    },
    img = await bitmap(source),
    canvas = document.createElement("canvas");
  canvas.width = Math.min(128, img.width);
  canvas.height = Math.min(128, img.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const part: PartCandidate = {
    ...structuredClone(candidate),
    id: crypto.randomUUID(),
    previewAssetId: crypto.randomUUID(),
    sourceAssetId: source.id,
    bbox: { x: 0, y: 0, width: source.width, height: source.height },
    mask: {
      width: canvas.width,
      height: canvas.height,
      data: Array.from({ length: canvas.width * canvas.height }, (_, i) =>
        pixels[i * 4 + 3] > 0 ? 255 : 0,
      ),
    },
    method: "provider",
    warnings: [
      "Texture từ provider " +
        result.model +
        " đã được người dùng chấp thuận; nguồn cũ vẫn giữ.",
    ],
    provider: {
      id: result.providerId,
      model: result.model,
      jobId,
      approved: true,
    },
  };
  return { source, part, preview: await extractCandidate(source, part) };
}
export function applyClassification(
  build: CharacterBuild,
  result: BuilderModelResult,
  jobId: string,
) {
  for (const choice of result.classifications) {
    const candidate = build.candidates.find((c) => c.id === choice.candidateId);
    if (!candidate) throw Error("Classification reference invalid");
    Object.assign(candidate, {
      label: choice.label,
      confidence: choice.confidence,
      orientation: choice.orientation,
      warnings: choice.warnings,
      method: "provider",
      provider: {
        id: result.providerId,
        model: result.model,
        jobId,
        approved: true,
      },
    });
  }
  build.selection = recommend(build.candidates);
  build.provider = { id: result.providerId, model: result.model };
  build.method = "provider";
}
export function candidateWorldPoint(
  doc: ProjectDocument,
  candidateId: string,
  point: { x: number; y: number },
) {
  const mapping = doc.characterBuild!.layerMappings.find(
      (m) => m.candidateId === candidateId,
    ),
    layer = doc.layers.find((l) => l.id === mapping?.layerId);
  if (!layer) throw Error("Cần Assembly trước");
  const m = worldMatrix(doc, layer);
  return {
    x: m.a * point.x + m.c * point.y + m.tx,
    y: m.b * point.x + m.d * point.y + m.ty,
  };
}
