import type { ProjectDocument } from "./index";
export const activeVariant = (doc: ProjectDocument) =>
  doc.characterVariants.find(
    (v) => v.view === doc.characterSettings.characterView,
  );
export function layerInView(doc: ProjectDocument, id: string) {
  const variants = doc.characterVariants;
  const owner = variants.find((v) => v.layerIds.includes(id));
  return !owner || owner.view === doc.characterSettings.characterView;
}
export function boneInView(doc: ProjectDocument, id: string) {
  const owner = doc.characterVariants.find((v) => v.boneIds.includes(id));
  return !owner || owner.view === doc.characterSettings.characterView;
}
export function clipInView(doc: ProjectDocument, id: string) {
  const owner = doc.characterVariants.find((v) => v.clipIds.includes(id));
  return !owner || owner.view === doc.characterSettings.characterView;
}
export function layerDisplayed(doc: ProjectDocument, id: string) {
  const l = doc.layers.find((l) => l.id === id);
  if (!l?.visible || !layerInView(doc, id)) return false;
  const part = doc.characterParts.find((p) => p.layerId === id),
    joint = doc.characterJoints.find((j) => j.id === part?.jointId);
  if (!part || !joint) return true;
  if (part.role === "continuous") return joint.mode === "continuous_mesh";
  if (part.role === "upper" || part.role === "lower")
    return joint.mode !== "continuous_mesh";
  if (part.role === "underlap") return joint.mode !== "rigid_segment";
  if (part.role === "overlap") return joint.mode === "overlap_only";
  return true;
}
/** View/world movement is outside canonical bone/mesh/animation coordinates. */
export function characterMatrix(doc: ProjectDocument) {
  const s = doc.characterSettings,
    rootId = activeVariant(doc)?.rootBoneId,
    root = doc.bones.find((b) => b.id === rootId),
    x = root?.rest.x ?? 400;
  const sign =
    s.mirrorForOppositeDirection && s.facing !== s.defaultFacing ? -1 : 1;
  return {
    a: sign,
    b: 0,
    c: 0,
    d: 1,
    tx: s.worldPosition.x + (sign === -1 ? 2 * x : 0),
    ty: s.worldPosition.y,
  };
}
export function pruneCharacterReferences(doc: ProjectDocument) {
  const retain = <T>(items: T[], predicate: (value: T) => boolean) => {
    const kept = items.filter(predicate);
    return kept.length === items.length ? items : kept;
  };
  const layers = new Set(doc.layers.map((l) => l.id)),
    bones = new Set(doc.bones.map((b) => b.id)),
    assets = new Set(doc.assetReferences.map((a) => a.id));
  doc.characterJoints = retain(
    doc.characterJoints,
    (j) =>
      bones.has(j.upperBoneId) &&
      bones.has(j.lowerBoneId) &&
      j.layerIds.some((id) => layers.has(id)),
  );
  const joints = new Set(doc.characterJoints.map((j) => j.id));
  for (const j of doc.characterJoints)
    j.layerIds = retain(j.layerIds, (id) => layers.has(id));
  doc.characterParts = retain(doc.characterParts, (p) => layers.has(p.layerId));
  for (const p of doc.characterParts) {
    const l = doc.layers.find((l) => l.id === p.layerId)!;
    p.sourceAssetId = l.assetId;
    p.renderOrder = doc.layers.indexOf(l);
    const a = doc.attachments.find((a) => a.layerId === l.id);
    p.attachmentId = a?.id ?? null;
    p.parentBoneId = a?.boneId ?? null;
    p.meshId = doc.meshes.find((m) => m.layerId === l.id)?.id ?? null;
    if (p.jointId && !joints.has(p.jointId)) {
      p.jointId = null;
      p.role = "body";
    }
    if (p.overlapAssetId && !assets.has(p.overlapAssetId))
      p.overlapAssetId = null;
    if (p.underlapAssetId && !assets.has(p.underlapAssetId))
      p.underlapAssetId = null;
    if (p.leftAssetId && !assets.has(p.leftAssetId)) {
      p.leftAssetId = null;
      p.mirrorPolicy = "mirror";
    }
  }
  for (const v of doc.characterVariants) {
    v.layerIds = retain(v.layerIds, (id) => layers.has(id));
    v.boneIds = retain(v.boneIds, (id) => bones.has(id));
    v.clipIds = retain(v.clipIds, (id) =>
      doc.animationClips.some((c) => c.id === id),
    );
    if (v.rootBoneId && !bones.has(v.rootBoneId)) v.rootBoneId = null;
  }
  if (doc.jointValidation?.jointIds.some((id) => !joints.has(id)))
    doc.jointValidation = null;
}

/** A rigid mode preserves the editable source mesh while using a sprite for display. */
export function renderMesh(doc: ProjectDocument, layerId: string) {
  const joint = doc.characterJoints.find((j) => j.layerIds.includes(layerId));
  if (
    joint &&
    !["elbow", "knee"].includes(joint.kind) &&
    joint.mode !== "continuous_mesh"
  )
    return undefined;
  return doc.meshes.find((m) => m.layerId === layerId);
}
