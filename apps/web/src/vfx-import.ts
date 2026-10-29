import {
  assetSchema,
  type ProjectDocument,
} from "../../../packages/document-core/src";
import { effectSchema, type VFXEffect } from "../../../packages/vfx-core/src";
import { effectAttachments } from "../../../packages/vfx-core/src/validation";
import { validateRaster } from "../../../packages/exporters/src";
import { duplicateEffect } from "../../../packages/vfx-core/src";
export async function importVFXFile(
  file: File,
  doc: ProjectDocument,
  boneId: string | null,
) {
  if (file.size > 20 * 1024 * 1024) throw Error("VFX JSON vượt 20 MiB");
  const data = JSON.parse(await file.text()),
    raw: VFXEffect = effectSchema.parse(
      data.format === "a2dstudio-vfx" ? data.effect : data,
    ),
    next = duplicateEffect(raw);
  const imported = data.format === "a2dstudio-vfx" ? data.assets : [];
  if (!Array.isArray(imported) || imported.length > 128)
    throw Error("Texture resources không hợp lệ");
  const assets = imported.map((a) => assetSchema.parse(a)),
    map = new Map(assets.map((a) => [a.id, crypto.randomUUID()]));
  if (map.size !== assets.length) throw Error("Texture ID trùng");
  for (const a of assets) {
    await validateRaster(a.data, a);
    a.id = map.get(a.id)!;
    a.dependencies = a.dependencies.map((id) => map.get(id) ?? id);
  }
  for (const n of next.nodes)
    if (n.textureId) n.textureId = map.get(n.textureId) ?? n.textureId;
  for (const n of next.trails ?? [])
    if (n.textureId) n.textureId = map.get(n.textureId) ?? n.textureId;
  for (const n of next.flipbooks ?? [])
    n.assetId = map.get(n.assetId) ?? n.assetId;
  let rebound = false;
  for (const a of effectAttachments(next))
    if (a.boneId && !doc.bones.some((b) => b.id === a.boneId)) {
      a.boneId = boneId;
      rebound = true;
    }
  if (
    next.trigger &&
    (!doc.animationClips.some((c) => c.id === next.trigger!.clipId) ||
      [next.trigger.startEventId, next.trigger.stopEventId].some(
        (id) => id && !doc.animationEvents.some((ev) => ev.id === id),
      ))
  ) {
    delete next.trigger;
    rebound = true;
  }
  return {
    effect: next,
    assets,
    message: rebound
      ? "Đã gắn các tham chiếu cũ vào xương hiện tại và bỏ event không tương thích; hãy kiểm tra lại attachment/trigger."
      : "",
  };
}
