import {
  type ProjectDocument,
  type CharacterJoint,
  type Layer,
  worldMatrix,
  syncHierarchy,
} from "../../document-core/src";
import {
  boneMatrices,
  transform,
  inverse,
  bindLayer,
} from "../../rig-core/src";
import { registerPart, alphaOf } from "../../mesh-core/src/joint-completion";
import { bitmap } from "./images";
/** Optional rigid/overlap alternatives for a full-limb source. Both masks extend across
 * the estimated joint; procedural underlap covers missing edge texture separately.
 * This preserves the unsplit original and never claims anatomical inpainting. */
export async function refreshBuilderSegments(
  doc: ProjectDocument,
  joint: CharacterJoint,
) {
  if (!doc.characterBuild || !["elbow", "knee"].includes(joint.kind)) return;
  const main = doc.characterParts.find(
    (p) => p.jointId === joint.id && p.role === "continuous",
  );
  if (!main) return;
  const layer = doc.layers.find((l) => l.id === main.layerId)!,
    source = doc.assetReferences.find((a) => a.id === main.sourceAssetId)!;
  const img = await bitmap(source),
    matrix = worldMatrix(doc, layer),
    inv = inverse(matrix),
    rest = boneMatrices(doc, "rest");
  const point = rest.get(joint.lowerBoneId)!,
    origin = rest.get(joint.upperBoneId)!,
    pivot = transform(inv, { x: point.tx, y: point.ty }),
    start = transform(inv, { x: origin.tx, y: origin.ty });
  const length = Math.max(
      0.001,
      Math.hypot(pivot.x - start.x, pivot.y - start.y),
    ),
    dx = (pivot.x - start.x) / length,
    dy = (pivot.y - start.y) / length;
  const scale = Math.max(0.01, Math.hypot(matrix.a, matrix.b)),
    overlap = (joint.radius * 0.6 + joint.overlapSize) / scale;
  for (const role of ["upper", "lower"] as const) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const distance = (x + 0.5 - pivot.x) * dx + (y + 0.5 - pivot.y) * dy;
        const coverage = Math.max(
          0,
          Math.min(
            1,
            role === "upper" ? overlap - distance : overlap + distance,
          ),
        );
        const i = (y * canvas.width + x) * 4 + 3;
        pixels.data[i] = Math.round(pixels.data[i] * coverage);
      }
    ctx.putImageData(pixels, 0, 0);
    const data = canvas.toDataURL("image/png");
    const existing = doc.characterParts.find(
      (p) => p.jointId === joint.id && p.role === role,
    );
    if (existing) {
      const asset = doc.assetReferences.find(
        (a) => a.id === existing.sourceAssetId,
      )!;
      asset.data = data;
      existing.alphaMask = await alphaOf(data);
      continue;
    }
    const assetId = crypto.randomUUID(),
      layerId = crypto.randomUUID();
    doc.assetReferences.push({
      id: assetId,
      name: (joint.name + " " + role + " mask · procedural").slice(0, 100),
      width: source.width,
      height: source.height,
      data,
      kind: "derived",
      provenance: "procedural",
      dependencies: [source.id],
    });
    const segment: Layer = {
      ...layer,
      id: layerId,
      assetId,
      name: joint.name + " " + role + " · overlap",
      locked: false,
    };
    doc.layers.splice(
      doc.layers.findIndex((l) => l.id === layer.id),
      0,
      segment,
    );
    bindLayer(
      doc,
      layerId,
      role === "upper" ? joint.upperBoneId : joint.lowerBoneId,
    );
    joint.layerIds.push(layerId);
    const part = await registerPart(
      doc,
      layerId,
      main.semantic,
      main.depth,
      role,
      joint.id,
    );
    part.overlapAssetId = main.overlapAssetId;
    part.underlapAssetId = main.underlapAssetId;
  }
  syncHierarchy(doc);
  doc.characterParts.forEach(
    (p) => (p.renderOrder = doc.layers.findIndex((l) => l.id === p.layerId)),
  );
}
