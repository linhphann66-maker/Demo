import { rigFixture } from "../../rig-core/src/fixture";
import { uid } from "../../document-core/src/fixture";
import { type CharacterPart, type EditableMesh } from "../../document-core/src";
export function jointFixture() {
  const d = rigFixture();
  d.bones[0].rest = { x: 0, y: 0.5, rotation: 0 };
  d.bones[1].rest = { x: 0.5, y: 0, rotation: 0 };
  d.bones[2].rest = { x: 0.5, y: 0, rotation: 0 };
  d.bones.forEach((b) => (b.length = 1));
  const mesh: EditableMesh = {
    id: uid(300),
    layerId: uid(3),
    sourceAssetId: uid(2),
    vertices: [
      { id: uid(301), x: 0, y: 0, u: 0, v: 0 },
      { id: uid(302), x: 1, y: 0, u: 1, v: 0 },
      { id: uid(303), x: 1, y: 1, u: 1, v: 1 },
      { id: uid(304), x: 0, y: 1, u: 0, v: 1 },
    ],
    triangles: [0, 1, 2, 0, 2, 3],
    boneIds: [],
    bindMatrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    alphaMask: { width: 1, height: 1, data: [1] },
  };
  d.meshes = [mesh];
  d.layers.push({
    ...d.layers[0],
    id: uid(305),
    name: "Underlap",
    x: -1,
    y: -1,
    scaleX: 3,
    scaleY: 3,
  });
  d.attachments.push({ id: uid(306), layerId: uid(305), boneId: uid(102) });
  const main: CharacterPart = {
    id: uid(307),
    layerId: uid(3),
    sourceAssetId: uid(2),
    semantic: "arm",
    depth: "near",
    alphaMask: { width: 1, height: 1, data: [1] },
    parentBoneId: null,
    meshId: mesh.id,
    attachmentId: null,
    renderOrder: 0,
    jointId: uid(310),
    role: "continuous",
    overlapAssetId: uid(2),
    underlapAssetId: uid(2),
    mirrorPolicy: "mirror",
    leftAssetId: null,
  };
  d.characterParts = [
    main,
    {
      ...main,
      id: uid(308),
      layerId: uid(305),
      meshId: null,
      attachmentId: uid(306),
      parentBoneId: uid(102),
      role: "underlap",
      renderOrder: 1,
    },
  ];
  d.characterJoints = [
    {
      id: uid(310),
      name: "Elbow",
      kind: "elbow",
      upperBoneId: uid(101),
      lowerBoneId: uid(102),
      layerIds: [uid(3), uid(305)],
      mode: "continuous_mesh",
      radius: 1,
      overlapSize: 1,
      underlapSize: 1,
      completion: "procedural_neighbor_fill_v1",
    },
  ];

  for (const [layerId, partId, attachmentId, role, boneId] of [
    [uid(311), uid(313), uid(315), "upper", uid(101)],
    [uid(312), uid(314), uid(316), "lower", uid(102)],
  ] as const) {
    d.layers.push({ ...d.layers[0], id: layerId, name: role });
    d.attachments.push({ id: attachmentId, layerId, boneId });
    d.characterParts.push({
      ...main,
      id: partId,
      layerId,
      role,
      parentBoneId: boneId,
      attachmentId,
      meshId: null,
      renderOrder: d.layers.length - 1,
    });
    d.characterJoints[0].layerIds.push(layerId);
  }
  d.hierarchy = d.layers.map((l) => ({ layerId: l.id, parentId: l.parentId }));
  return d;
}
