import {
  type ProjectDocument,
  type CharacterJoint,
  type CharacterPart,
  type DeformationMode,
  worldMatrix,
} from "../../document-core/src";
import {
  boneMatrices,
  transform,
  bindLayer,
  identity,
  inverse,
} from "../../rig-core/src";
import { generateMesh, putMesh, autoWeights } from "./index";
export async function alphaOf(data: string, width = 64, height = 64) {
  const image = new Image();
  image.src = data;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0, width, height);
  const a = ctx.getImageData(0, 0, width, height).data;
  return {
    width,
    height,
    data: Array.from({ length: width * height }, (_, i) =>
      a[i * 4 + 3] > 24 ? 1 : 0,
    ),
  };
}
export async function registerPart(
  doc: ProjectDocument,
  layerId: string,
  semantic: string,
  depth: CharacterPart["depth"],
  role: CharacterPart["role"] = "body",
  jointId: string | null = null,
) {
  const l = doc.layers.find((l) => l.id === layerId)!,
    a = doc.assetReferences.find((a) => a.id === l.assetId)!,
    attachment = doc.attachments.find((a) => a.layerId === l.id);
  const part: CharacterPart = {
    id: crypto.randomUUID(),
    layerId: l.id,
    sourceAssetId: a.id,
    semantic,
    depth,
    alphaMask: await alphaOf(a.data),
    parentBoneId: attachment?.boneId ?? null,
    meshId: doc.meshes.find((m) => m.layerId === l.id)?.id ?? null,
    attachmentId: attachment?.id ?? null,
    renderOrder: doc.layers.indexOf(l),
    jointId,
    role,
    overlapAssetId: null,
    underlapAssetId: null,
    mirrorPolicy: "mirror",
    leftAssetId: null,
  };
  doc.characterParts.push(part);
  return part;
}
/** Completion is sampled from neighbouring opaque pixels, never represented as AI output. */
export async function completionTexture(
  doc: ProjectDocument,
  sourceAssetId: string,
  center: { x: number; y: number },
  radius: number,
  ring = false,
) {
  const source = doc.assetReferences.find((a) => a.id === sourceAssetId)!;
  const image = new Image();
  image.src = source.data;
  await image.decode();
  const input = document.createElement("canvas");
  input.width = source.width;
  input.height = source.height;
  const ic = input.getContext("2d")!;
  ic.drawImage(image, 0, 0);
  const pixels = ic.getImageData(0, 0, input.width, input.height).data;
  const colours: number[][] = [];
  for (
    let y = Math.max(0, Math.floor(center.y - 24));
    y < Math.min(input.height, center.y + 24);
    y += 2
  )
    for (
      let x = Math.max(0, Math.floor(center.x - 24));
      x < Math.min(input.width, center.x + 24);
      x += 2
    ) {
      const i = (y * input.width + x) * 4;
      if (pixels[i + 3] > 220)
        colours.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    }
  if (!colours.length)
    throw Error(
      "Không có màu alpha đặc quanh khớp; cần chỉnh pivot hoặc vẽ underlap thủ công",
    );
  const mean = [0, 1, 2].map((k) =>
    Math.round(colours.reduce((n, c) => n + c[k], 0) / colours.length),
  );
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(
    64 - radius,
    64 - radius,
    64 + radius,
    64 + radius,
  );
  g.addColorStop(0, `rgb(${mean.map((c) => Math.min(255, c + 12)).join(",")})`);
  g.addColorStop(1, `rgb(${mean.map((c) => Math.max(0, c - 12)).join(",")})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(64, 64, radius, ring ? radius * 0.72 : radius, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvas.toDataURL("image/png");
}
export function smoothJointWeights(
  doc: ProjectDocument,
  joint: CharacterJoint,
) {
  const matrices = boneMatrices(doc, "rest"),
    upper = matrices.get(joint.upperBoneId)!,
    lower = matrices.get(joint.lowerBoneId)!;
  for (const part of doc.characterParts.filter(
    (p) => p.jointId === joint.id && p.role === "continuous",
  )) {
    const mesh = doc.meshes.find((m) => m.layerId === part.layerId);
    if (!mesh) continue;
    const foot = doc.bones.find(
      (b) => b.parentId === joint.lowerBoneId && b.name.endsWith(" Foot"),
    );
    const footM = foot ? matrices.get(foot.id) : null;
    mesh.boneIds = [
      joint.upperBoneId,
      joint.lowerBoneId,
      ...(foot ? [foot.id] : []),
    ];
    doc.vertexWeights = doc.vertexWeights.filter((w) => w.meshId !== mesh.id);
    const dx = lower.tx - upper.tx,
      dy = lower.ty - upper.ty,
      length = Math.hypot(dx, dy),
      width = Math.max(
        20,
        joint.radius * 2 + joint.overlapSize + joint.underlapSize * 0.25,
      );
    for (const v of mesh.vertices) {
      const p = transform(
        worldMatrix(doc, doc.layers.find((l) => l.id === mesh.layerId)!),
        v,
      );
      const along = ((p.x - lower.tx) * dx + (p.y - lower.ty) * dy) / length;
      const t = Math.max(0, Math.min(1, 0.5 + along / (2 * width)));
      const s = t * t * (3 - 2 * t);
      let influences = [
        { boneId: joint.upperBoneId, weight: 1 - s },
        { boneId: joint.lowerBoneId, weight: s },
      ];
      if (foot && footM) {
        const f = Math.max(0, Math.min(1, (p.y - footM.ty + 18) / 18));
        influences = influences.map((i) => ({
          ...i,
          weight: i.weight * (1 - f),
        }));
        influences.push({ boneId: foot.id, weight: f });
      }
      doc.vertexWeights.push({
        id: crypto.randomUUID(),
        meshId: mesh.id,
        vertexId: v.id,
        influences: influences.filter((i) => i.weight > 1e-8),
      });
    }
  }
}
export async function refreshCompletion(
  doc: ProjectDocument,
  joint: CharacterJoint,
) {
  const main = doc.characterParts.find(
    (p) => p.jointId === joint.id && p.role === "continuous",
  );
  if (!main) return;
  const layer = doc.layers.find((l) => l.id === main.layerId)!,
    jointPoint = boneMatrices(doc, "rest").get(joint.lowerBoneId)!;
  const center = transform(inverse(worldMatrix(doc, layer)), {
    x: jointPoint.tx,
    y: jointPoint.ty,
  });
  for (const role of ["underlap", "overlap"] as const) {
    const part = doc.characterParts.find(
      (p) => p.jointId === joint.id && p.role === role,
    );
    if (!part) continue;
    let a = doc.assetReferences.find((a) => a.id === part.sourceAssetId)!;
    const patchMesh = doc.meshes.find((m) => m.layerId === part.layerId);
    if (patchMesh && (a.width !== 128 || a.height !== 128))
      throw Error(
        "Patch tùy chỉnh có mesh/kích thước riêng: hãy chỉnh texture/mesh thủ công trước khi procedural repair",
      );
    if (
      a.provenance !== "procedural" ||
      a.width !== 128 ||
      a.height !== 128 ||
      doc.layers.filter((l) => l.assetId === a.id).length > 1
    ) {
      a = {
        ...a,
        id: crypto.randomUUID(),
        name: (joint.name + " · " + role + " · procedural").slice(0, 100),
        width: 128,
        height: 128,
        kind: "derived",
        provenance: "procedural",
        dependencies: [main.sourceAssetId],
      };
      doc.assetReferences.push(a);
      doc.layers.find((l) => l.id === part.layerId)!.assetId = a.id;
      part.sourceAssetId = a.id;
      for (const segment of doc.characterParts.filter(
        (p) =>
          p.jointId === joint.id &&
          ["continuous", "upper", "lower"].includes(p.role),
      )) {
        if (role === "underlap") segment.underlapAssetId = a.id;
        else segment.overlapAssetId = a.id;
      }
      if (patchMesh) patchMesh.sourceAssetId = a.id;
    }
    a.dependencies = [main.sourceAssetId];
    const size = role === "underlap" ? joint.underlapSize : joint.overlapSize;
    a.data = await completionTexture(
      doc,
      main.sourceAssetId,
      center,
      Math.max(0.1, Math.min(60, joint.radius * 0.6 + size)),
      role === "overlap",
    );
    part.alphaMask = await alphaOf(a.data);
    if (patchMesh) patchMesh.alphaMask = part.alphaMask;
  }
}
export async function createJointCompletion(
  doc: ProjectDocument,
  joint: CharacterJoint,
) {
  const main = doc.characterParts.find(
    (p) => p.jointId === joint.id && p.role === "continuous",
  )!;
  const layer = doc.layers.find((l) => l.id === main.layerId)!,
    point = boneMatrices(doc, "rest").get(joint.lowerBoneId)!;
  const patchIds: string[] = [];
  for (const role of ["underlap", "overlap"] as const) {
    const id = crypto.randomUUID(),
      layerId = crypto.randomUUID();
    doc.assetReferences.push({
      id,
      name: joint.name + " · " + role + " · procedural",
      provenance: "procedural",
      kind: "derived",
      dependencies: [main.sourceAssetId],
      width: 128,
      height: 128,
      data: await completionTexture(
        doc,
        main.sourceAssetId,
        transform(inverse(worldMatrix(doc, layer)), {
          x: point.tx,
          y: point.ty,
        }),
        Math.max(
          1,
          joint.radius * 0.6 +
            (role === "underlap" ? joint.underlapSize : joint.overlapSize),
        ),
        role === "overlap",
      ),
    });
    const patch = {
      id: layerId,
      assetId: id,
      parentId: null,
      name: joint.name + " · " + role,
      visible: true,
      locked: false,
      opacity: 1,
      x: point.tx,
      y: point.ty,
      pivotX: 64,
      pivotY: 64,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    // Patches remain individually editable layers beneath / above the continuous source.
    const index = doc.layers.findIndex((l) => l.id === layer.id);
    doc.layers.splice(role === "underlap" ? index : index + 1, 0, patch);
    bindLayer(doc, layerId, joint.lowerBoneId);
    joint.layerIds.push(layerId);
    const part = await registerPart(
      doc,
      layerId,
      role,
      main.depth,
      role,
      joint.id,
    );
    patchIds.push(part.sourceAssetId);
  }
  for (const part of doc.characterParts.filter(
    (p) =>
      p.jointId === joint.id &&
      ["continuous", "upper", "lower"].includes(p.role),
  )) {
    part.underlapAssetId = patchIds[0];
    part.overlapAssetId = patchIds[1];
  }
}
export async function prepareJointEdit(
  source: ProjectDocument,
  jointId: string,
  patch: Partial<Pick<CharacterJoint, "mode" | "overlapSize" | "underlapSize">>,
  repair = false,
) {
  const doc = structuredClone(source),
    joint = doc.characterJoints.find((j) => j.id === jointId);
  if (!joint) throw Error("Hãy chọn khớp");
  Object.assign(joint, patch);
  if (repair) {
    joint.overlapSize = Math.min(48, joint.overlapSize + 4);
    joint.underlapSize = Math.min(48, joint.underlapSize + 6);
  }
  if (["elbow", "knee"].includes(joint.kind)) {
    if (
      repair ||
      patch.overlapSize !== undefined ||
      patch.underlapSize !== undefined
    )
      await refreshCompletion(doc, joint);
    if (repair) smoothJointWeights(doc, joint);
  } else {
    for (const id of joint.layerIds) {
      const layer = doc.layers.find((l) => l.id === id)!;
      if (
        joint.mode === "continuous_mesh" &&
        !doc.meshes.some((m) => m.layerId === id)
      ) {
        const mesh = await generateMesh(doc, id);
        putMesh(doc, mesh);
        autoWeights(doc, mesh, [joint.upperBoneId, joint.lowerBoneId]);
      }
      const p = doc.characterParts.find((p) => p.layerId === layer.id);
      if (p) p.meshId = doc.meshes.find((m) => m.layerId === id)?.id ?? null;
    }
  }
  doc.jointValidation = null;
  return doc;
}
export function setJointMode(
  doc: ProjectDocument,
  jointId: string,
  mode: DeformationMode,
) {
  doc.characterJoints.find((j) => j.id === jointId)!.mode = mode;
}
export { identity };
