import {
  type Asset,
  type ProjectDocument,
} from "../../../packages/document-core/src";
import { type AnalyzeRequest } from "../../../packages/ai-contracts/src/gemini";
const plain = (a: Asset) => ({
  id: a.id,
  name: a.name,
  width: a.width,
  height: a.height,
  data: a.data,
});
export async function geminiInput(
  doc: ProjectDocument,
): Promise<AnalyzeRequest> {
  const build = doc.characterBuild!;
  // Rejected duplicates/variants remain recoverable; Gemini may choose a better alternative.
  const candidates = build.candidates.slice(0, 48);
  if (build.candidates.length > 48)
    throw Error(
      "Có hơn 48 ứng viên. Gộp/bỏ nhiễu trong chế độ nâng cao trước.",
    );
  if (!candidates.length) throw Error("Chưa có ảnh part để gửi Gemini");
  const overview = document.createElement("canvas"),
    columns = Math.min(6, candidates.length),
    cell = 176;
  overview.width = columns * cell;
  overview.height = Math.ceil(candidates.length / columns) * (cell + 24);
  const ctx = overview.getContext("2d")!;
  ctx.fillStyle = "#dddddd";
  ctx.fillRect(0, 0, overview.width, overview.height);
  const crops: AnalyzeRequest["candidates"] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i],
      a = doc.assetReferences.find((a) => a.id === c.previewAssetId)!;
    const img = new Image();
    img.src = a.data;
    await img.decode();
    const scale = Math.min(1, 256 / Math.max(a.width, a.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(a.width * scale));
    canvas.height = Math.max(1, Math.round(a.height * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const x = (i % columns) * cell,
      y = Math.floor(i / columns) * (cell + 24),
      s = Math.min((cell - 12) / a.width, (cell - 12) / a.height);
    ctx.drawImage(
      img,
      x + (cell - a.width * s) / 2,
      y + 8,
      a.width * s,
      a.height * s,
    );
    ctx.fillStyle = "#111";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(String(i + 1), x + 8, y + cell + 18);
    crops.push({
      id: c.id,
      sourceAssetId: c.sourceAssetId,
      bbox: c.bbox,
      image: {
        id: c.previewAssetId,
        name: "Candidate " + (i + 1),
        width: canvas.width,
        height: canvas.height,
        data: canvas.toDataURL("image/png"),
      },
    });
  }
  return {
    images: doc.assetReferences
      .filter((a) => build.sourceAssetIds.includes(a.id))
      .map(plain),
    overview: {
      id: build.id,
      name: "Numbered candidate overview",
      width: overview.width,
      height: overview.height,
      data: overview.toDataURL("image/png"),
    },
    candidates: crops,
    consent: true,
  };
}
