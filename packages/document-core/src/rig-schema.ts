import { z } from "zod";
const id = z.string().uuid(),
  n = z.number().finite();
const coord = n.min(-10000).max(10000);
export const matrixSchema = z
  .object({ a: n, b: n, c: n, d: n, tx: coord, ty: coord })
  .strict();
export const restSchema = z
  .object({
    x: coord,
    y: coord,
    rotation: n.min(-3600).max(3600),
    scaleX: n.min(0.05).max(10).optional(),
    scaleY: n.min(0.05).max(10).optional(),
  })
  .strict();
export const skeletonSchema = z
  .object({
    id,
    name: z.string().min(1).max(100),
    provenance: z.enum(["procedural", "user-created"]),
    template: z.string().max(100).nullable(),
  })
  .strict();
export const boneSchema = z
  .object({
    id,
    skeletonId: id,
    parentId: id.nullable(),
    name: z.string().min(1).max(100),
    rest: restSchema,
    pose: restSchema,
    length: n.min(1).max(5000),
    constraints: z
      .object({
        minRotation: n.min(-180).max(180),
        maxRotation: n.min(-180).max(180),
      })
      .strict(),
  })
  .strict();
export const attachmentSchema = z
  .object({ id, layerId: id, boneId: id })
  .strict();
export const slotSchema = z
  .object({ id, name: z.string().min(1).max(100), boneId: id })
  .strict();
export const ikSchema = z
  .object({
    id,
    rootBoneId: id,
    midBoneId: id,
    endBoneId: id,
    x: coord,
    y: coord,
    bend: z.union([z.literal(-1), z.literal(1)]),
    enabled: z.boolean(),
    blend: n.min(0).max(1).optional(),
  })
  .strict();
export const vertexSchema = z
  .object({ id, x: coord, y: coord, u: n.min(0).max(1), v: n.min(0).max(1) })
  .strict();
export const meshSchema = z
  .object({
    id,
    layerId: id,
    sourceAssetId: id,
    vertices: z.array(vertexSchema).min(3).max(512),
    triangles: z.array(z.number().int().nonnegative()).min(3).max(6000),
    boneIds: z.array(id).max(128),
    bindMatrix: matrixSchema,
    alphaMask: z
      .object({
        width: z.number().int().min(1).max(128),
        height: z.number().int().min(1).max(128),
        data: z.array(z.number().int().min(0).max(1)).max(16384),
      })
      .strict(),
  })
  .strict();
export const weightSchema = z
  .object({
    id,
    meshId: id,
    vertexId: id,
    influences: z
      .array(z.object({ boneId: id, weight: n.positive().max(1) }).strict())
      .min(1)
      .max(4),
  })
  .strict();
export type Bone = z.infer<typeof boneSchema>;
export type Skeleton = z.infer<typeof skeletonSchema>;
export type EditableMesh = z.infer<typeof meshSchema>;
export type Vertex = z.infer<typeof vertexSchema>;
export type VertexWeight = z.infer<typeof weightSchema>;
export type IKTarget = z.infer<typeof ikSchema>;
type RigDocument = {
  bones: Bone[];
  skeletons: Skeleton[];
  meshes: EditableMesh[];
  vertexWeights: VertexWeight[];
  attachments: z.infer<typeof attachmentSchema>[];
  equipmentSlots: z.infer<typeof slotSchema>[];
  ikTargets: IKTarget[];
  layers: { id: string; assetId: string }[];
  assetReferences: { id: string }[];
};
export function validateRig(p: RigDocument, fail: (m: string) => void) {
  const boneMap = new Map(p.bones.map((b) => [b.id, b]));
  const skeletons = new Set(p.skeletons.map((s) => s.id));
  const layerMap = new Map(p.layers.map((l) => [l.id, l]));
  const meshes = new Map(p.meshes.map((m) => [m.id, m]));
  for (const b of p.bones) {
    if (!skeletons.has(b.skeletonId)) fail("Skeleton không tồn tại");
    if (
      b.constraints.minRotation > b.constraints.maxRotation ||
      b.pose.rotation < b.constraints.minRotation - 1e-6 ||
      b.pose.rotation > b.constraints.maxRotation + 1e-6
    )
      fail("Góc pose vượt giới hạn khớp");
    let parent = b.parentId;
    const seen = new Set([b.id]);
    while (parent) {
      const node = boneMap.get(parent);
      if (!node || node.skeletonId !== b.skeletonId) {
        fail("Xương cha không hợp lệ");
        break;
      }
      if (seen.has(parent)) {
        fail("Cấu trúc xương có vòng lặp");
        break;
      }
      seen.add(parent);
      parent = node.parentId;
    }
  }
  if (
    new Set(p.attachments.map((a) => a.layerId)).size !== p.attachments.length
  )
    fail("Một layer chỉ được gắn vào một xương");
  for (const a of p.attachments)
    if (!layerMap.has(a.layerId) || !boneMap.has(a.boneId))
      fail("Attachment không hợp lệ");
  for (const s of p.equipmentSlots)
    if (!boneMap.has(s.boneId)) fail("Socket không hợp lệ");
  if (new Set(p.ikTargets.map((t) => t.endBoneId)).size !== p.ikTargets.length)
    fail("IK effector bị trùng");
  for (const t of p.ikTargets) {
    const r = boneMap.get(t.rootBoneId),
      m = boneMap.get(t.midBoneId),
      e = boneMap.get(t.endBoneId);
    if (!r || !m || !e || m.parentId !== r.id || e.parentId !== m.id)
      fail("Chuỗi IK phải gồm 3 khớp cha–con liên tiếp");
    else if (
      Math.hypot(m.rest.x, m.rest.y) < 1e-5 ||
      Math.hypot(e.rest.x, e.rest.y) < 1e-5 ||
      Math.hypot(m.rest.x + m.pose.x, m.rest.y + m.pose.y) < 1e-5 ||
      Math.hypot(e.rest.x + e.pose.x, e.rest.y + e.pose.y) < 1e-5
    )
      fail("Chuỗi IK cần hai đoạn có độ dài lớn hơn 0");
  }
  if (new Set(p.meshes.map((m) => m.layerId)).size !== p.meshes.length)
    fail("Một layer chỉ được có một mesh");
  let total = 0;
  for (const m of p.meshes) {
    total += m.vertices.length;
    if (
      !layerMap.has(m.layerId) ||
      layerMap.get(m.layerId)?.assetId !== m.sourceAssetId
    )
      fail("Mesh tham chiếu ảnh nguồn đã thay đổi");
    if (m.alphaMask.data.length !== m.alphaMask.width * m.alphaMask.height)
      fail("Alpha mask không đúng kích thước");
    if (
      Math.abs(
        m.bindMatrix.a * m.bindMatrix.d - m.bindMatrix.b * m.bindMatrix.c,
      ) < 1e-8
    )
      fail("Bind matrix suy biến");
    if (
      new Set(m.boneIds).size !== m.boneIds.length ||
      m.boneIds.some((id) => !boneMap.has(id))
    )
      fail("Xương của mesh không hợp lệ");
    if (new Set(m.boneIds.map((id) => boneMap.get(id)?.skeletonId)).size > 1)
      fail("Mesh chỉ gắn vào một skeleton");
    if (m.triangles.length % 3) fail("Triangle indices phải là bộ ba");
    const seen = new Set<string>();
    for (let i = 0; i < m.triangles.length; i += 3) {
      const tri = m.triangles.slice(i, i + 3);
      if (
        tri.length !== 3 ||
        new Set(tri).size !== 3 ||
        tri.some((i) => !Number.isInteger(i) || i < 0 || i >= m.vertices.length)
      ) {
        fail("Triangle index không hợp lệ");
        continue;
      }
      const key = [...tri].sort((a, b) => a - b).join(",");
      if (seen.has(key)) fail("Tam giác bị trùng");
      seen.add(key);
      const [a, b, c] = tri.map((i) => m.vertices[i]);
      const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
        uv = (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);
      if (Math.abs(area) < 1e-5 || Math.abs(uv) < 1e-10 || area * uv <= 0)
        fail("Tam giác suy biến hoặc bị lật");
    }
  }
  if (total > 16384) fail("Tổng mesh vượt 16384 vertices");
  const pairs = new Set<string>();
  for (const w of p.vertexWeights) {
    const m = meshes.get(w.meshId);
    const key = w.meshId + ":" + w.vertexId;
    if (pairs.has(key)) fail("Weights bị trùng");
    pairs.add(key);
    if (
      !m ||
      !m.vertices.some((v) => v.id === w.vertexId) ||
      w.influences.some((i) => !m.boneIds.includes(i.boneId)) ||
      new Set(w.influences.map((i) => i.boneId)).size !== w.influences.length ||
      Math.abs(w.influences.reduce((s, i) => s + i.weight, 0) - 1) > 1e-5
    )
      fail("Bone weights không hợp lệ hoặc tổng khác 1");
  }
  for (const m of p.meshes)
    if (m.boneIds.length)
      for (const v of m.vertices)
        if (!pairs.has(m.id + ":" + v.id)) fail("Vertex thiếu weights");
}
