import { activeVariant } from "../../document-core/src/character";
import { alphaOf } from "../../mesh-core/src/joint-completion";
import {
  type ProjectDocument,
  type Bone,
  type Asset,
} from "../../document-core/src";
import { humanoidTemplate } from "../../rig-core/src/template";
import {
  resetPose,
  boneMatrices,
  transform,
  degrees,
  inverse,
  setBoneRotation,
  reparentBone,
} from "../../rig-core/src";
import { generateMesh, putMesh, autoWeights } from "../../mesh-core/src";
export async function prepareHumanoid(doc: ProjectDocument) {
  const view = activeVariant(doc);
  if (view) {
    if (view.boneIds.length) throw Error("View đã có rig; không ghi đè");
    if (view.view !== "front")
      throw Error(
        "Side rig cần template side và semantic parts; dùng Undo hoặc chỉnh xương thủ công",
      );
    const ids = new Set(view.layerIds),
      layerMeshes = doc.meshes.filter((m) => ids.has(m.layerId));
    const scoped = {
      ...structuredClone(doc),
      characterVariants: [],
      characterParts: [],
      characterJoints: [],
      jointValidation: null,
      layers: structuredClone(doc.layers.filter((l) => ids.has(l.id))),
      bones: [],
      skeletons: [],
      ikTargets: [],
      attachments: [],
      equipmentSlots: [],
      meshes: [],
      vertexWeights: [],
    };
    const rigged = await prepareHumanoid(scoped),
      result = structuredClone(doc);
    result.bones.push(...rigged.bones);
    result.skeletons.push(...rigged.skeletons);
    result.ikTargets.push(...rigged.ikTargets);
    result.equipmentSlots.push(...rigged.equipmentSlots);
    result.attachments.push(...rigged.attachments);
    result.meshes = result.meshes.filter((m) => !ids.has(m.layerId));
    result.meshes.push(...rigged.meshes);
    result.vertexWeights = result.vertexWeights.filter(
      (w) => !layerMeshes.some((m) => m.id === w.meshId),
    );
    result.vertexWeights.push(...rigged.vertexWeights);
    const target = result.characterVariants.find((v) => v.id === view.id)!;
    target.boneIds = rigged.bones.map((b) => b.id);
    target.rootBoneId = rigged.bones.find((b) => b.name === "Root")!.id;
    return result;
  }
  const planned = structuredClone(doc);
  const byName = humanoidTemplate(planned);
  for (const layer of planned.layers) {
    const asset = planned.assetReferences.find((a) => a.id === layer.assetId)!;
    let names: string[] = [];
    for (const side of ["Left", "Right"]) {
      if (asset.name === side + " arm")
        names = [side + " Upper Arm", side + " Forearm", side + " Hand"];
      if (asset.name === side + " leg")
        names = [side + " Thigh", side + " Shin", side + " Foot"];
    }
    if (asset.name === "Crimson cape") names = ["Chest", "Cape"];
    if (names.length) {
      const mesh = await generateMesh(planned, layer.id);
      putMesh(planned, mesh);
      autoWeights(
        planned,
        mesh,
        names.map((n) => byName.get(n)!.id),
      );
    }
  }
  return planned;
}
export function addBone(doc: ProjectDocument, parentId: string | null) {
  let skeletonId = parentId
    ? doc.bones.find((b) => b.id === parentId)!.skeletonId
    : activeVariant(doc)
      ? doc.bones.find((b) => activeVariant(doc)!.boneIds.includes(b.id))
          ?.skeletonId
      : doc.skeletons[0]?.id;
  if (!skeletonId) {
    skeletonId = crypto.randomUUID();
    doc.skeletons.push({
      id: skeletonId,
      name: "Manual skeleton",
      provenance: "user-created",
      template: null,
    });
  }
  const parent = doc.bones.find((b) => b.id === parentId);
  const b: Bone = {
    id: crypto.randomUUID(),
    skeletonId,
    parentId,
    name: "Bone " + (doc.bones.length + 1),
    rest: { x: parent?.length ?? 400, y: parent ? 0 : 300, rotation: 0 },
    pose: { x: 0, y: 0, rotation: 0 },
    length: 60,
    constraints: { minRotation: -180, maxRotation: 180 },
  };
  doc.bones.push(b);
  return b.id;
}
export function editBone(
  doc: ProjectDocument,
  id: string,
  patch: Partial<Bone>,
) {
  const bone = doc.bones.find((b) => b.id === id)!;
  if (patch.parentId !== undefined && patch.parentId !== bone.parentId)
    reparentBone(doc, id, patch.parentId);
  if (patch.length !== undefined) {
    const old = bone.length;
    for (const child of doc.bones.filter((b) => b.parentId === id))
      if (Math.abs(child.rest.x - old) < 0.1 && Math.abs(child.rest.y) < 0.1)
        child.rest.x = patch.length;
    bone.length = patch.length;
  }
  if (patch.name !== undefined) bone.name = patch.name;
  if (patch.constraints) bone.constraints = { ...patch.constraints };
  if (patch.rest) bone.rest = { ...patch.rest };
  if (patch.pose) {
    bone.pose = { ...patch.pose };
    setBoneRotation(bone, bone.pose.rotation);
  } else setBoneRotation(bone, bone.pose.rotation);
  for (const t of doc.ikTargets) t.enabled = false;
}
export function moveJoint(
  doc: ProjectDocument,
  id: string,
  point: { x: number; y: number },
  tip = false,
) {
  const bone = doc.bones.find((b) => b.id === id)!;
  const matrices = boneMatrices(doc);
  if (tip) {
    const m = matrices.get(id)!;
    const angle = degrees(Math.atan2(point.y - m.ty, point.x - m.tx));
    const parent = bone.parentId ? matrices.get(bone.parentId) : null;
    const parentAngle = parent ? degrees(Math.atan2(parent.b, parent.a)) : 0;
    if (doc.rigSettings.mode === "pose")
      setBoneRotation(bone, angle - parentAngle - bone.rest.rotation);
    else {
      editBone(doc, id, {
        length: Math.max(1, Math.hypot(point.x - m.tx, point.y - m.ty)),
      });
      bone.rest.rotation = angle - parentAngle;
    }
  } else {
    const parent = bone.parentId ? matrices.get(bone.parentId) : null;
    const local = parent ? transform(inverse(parent), point) : point;
    if (doc.rigSettings.mode === "rest") {
      bone.rest.x = local.x;
      bone.rest.y = local.y;
    } else {
      bone.pose.x = local.x - bone.rest.x;
      bone.pose.y = local.y - bone.rest.y;
    }
  }
  for (const t of doc.ikTargets) t.enabled = false;
}
export async function prepareReplacement(
  doc: ProjectDocument,
  layerId: string,
  asset: Asset,
) {
  const next = structuredClone(doc);
  const layer = next.layers.find((l) => l.id === layerId);
  if (!layer) throw Error("Layer không tồn tại");
  if (layer.locked) throw Error("Hãy mở khóa layer trước khi thay ảnh");
  const previous = next.meshes.find((m) => m.layerId === layerId);
  next.assetReferences.push(asset);
  layer.assetId = asset.id;
  const part = next.characterParts.find((p) => p.layerId === layerId);
  if (part) {
    part.sourceAssetId = asset.id;
    part.alphaMask = await alphaOf(asset.data);
    next.jointValidation = null;
  }
  if (previous) {
    const mesh = await generateMesh(next, layerId);
    putMesh(next, mesh);
    autoWeights(next, mesh, previous.boneIds);
  }
  return next;
}
export { resetPose };
