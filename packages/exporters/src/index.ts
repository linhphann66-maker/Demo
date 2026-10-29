import { rasterDimensions } from "./raster-header";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  parseDocument,
  serialize,
  type ProjectDocument,
  type Asset,
} from "../../document-core/src";
const MAX = 20 * 1024 * 1024;
function inspectZip(bytes: Uint8Array) {
  if (bytes.length < 22) throw Error("Gói ZIP không hợp lệ");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      v.getUint32(i, true) === 0x06054b50 &&
      i + 22 + v.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  if (
    end < 0 ||
    v.getUint16(end + 4, true) !== 0 ||
    v.getUint16(end + 6, true) !== 0 ||
    v.getUint16(end + 8, true) !== 1 ||
    v.getUint16(end + 10, true) !== 1
  )
    throw Error("Gói phải chứa duy nhất project.json");
  const central = v.getUint32(end + 16, true);
  if (
    central + 46 > end ||
    v.getUint32(central, true) !== 0x02014b50 ||
    v.getUint32(central + 42, true) !== 0 ||
    v.getUint32(0, true) !== 0x04034b50
  )
    throw Error("Cấu trúc ZIP không hợp lệ");
  if ((v.getUint16(6, true) | v.getUint16(central + 8, true)) & 1)
    throw Error("Không hỗ trợ ZIP được mã hóa");
}

export function packageProject(doc: ProjectDocument) {
  const bytes = strToU8(serialize(doc));
  if (bytes.length > MAX) throw Error("Dự án vượt 20 MiB");
  return zipSync({ "project.json": bytes }, { level: 6 });
}
export function unpackProject(bytes: Uint8Array): ProjectDocument {
  if (bytes.length > MAX) throw Error("Tệp vượt 20 MiB");
  inspectZip(bytes);
  let count = 0;
  const archive = unzipSync(bytes, {
    filter: (f) => {
      count++;
      if (
        count > 256 ||
        f.name !== "project.json" ||
        f.originalSize > MAX ||
        f.originalSize / Math.max(1, f.size) > 200
      )
        throw Error("Gói dự án không an toàn hoặc vượt giới hạn");
      return true;
    },
  });
  if (count !== 1 || !archive["project.json"])
    throw Error("Gói phải chứa duy nhất project.json");
  return parseDocument(JSON.parse(strFromU8(archive["project.json"])));
}
export function download(data: BlobPart, name: string, type: string) {
  const u = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export async function validateRaster(
  data: string,
  expected?: { width: number; height: number },
) {
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(data))
    throw Error("Chỉ hỗ trợ PNG, JPEG hoặc WebP; SVG không được phép");
  const raw = atob(data.split(",")[1]);
  if (raw.length > 8 * 1024 * 1024) throw Error("Ảnh vượt 8 MiB");
  const png = raw.startsWith("\x89PNG\r\n\x1a\n");
  const jpeg = raw.startsWith("\xff\xd8\xff");
  const webp = raw.startsWith("RIFF") && raw.slice(8, 12) === "WEBP";
  if (
    !(
      (data.startsWith("data:image/png;") && png) ||
      (data.startsWith("data:image/jpeg;") && jpeg) ||
      (data.startsWith("data:image/webp;") && webp)
    )
  )
    throw Error("Định dạng ảnh không khớp nội dung");
  rasterDimensions(raw);
  const image = new Image();
  image.src = data;
  await image.decode();
  if (
    image.width > 4096 ||
    image.height > 4096 ||
    !image.width ||
    !image.height
  )
    throw Error("Ảnh phải có kích thước từ 1 đến 4096 px");
  if (
    expected &&
    (expected.width !== image.width || expected.height !== image.height)
  )
    throw Error("Kích thước ảnh không khớp metadata");
  return { width: image.width, height: image.height };
}
export async function validateProjectImages(doc: ProjectDocument) {
  for (const asset of doc.assetReferences)
    await validateRaster(asset.data, asset);
}
export async function importRaster(file: File): Promise<Asset> {
  if (file.size > 8 * 1024 * 1024) throw Error("Ảnh vượt 8 MiB");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("Chỉ hỗ trợ PNG, JPEG hoặc WebP");
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error("Không thể đọc ảnh"));
    r.readAsDataURL(file);
  });
  const size = await validateRaster(data);
  return {
    id: crypto.randomUUID(),
    name: file.name.slice(0, 100),
    provenance: "user-created",
    kind: "source",
    dependencies: [],
    data,
    ...size,
  };
}
export {animationMetadata,exportSpritesheet,spritesheetPackage,sheetPlan,compositionBounds} from './animation';

export * from './vfx';
