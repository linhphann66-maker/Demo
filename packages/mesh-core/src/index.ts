import {
  type Asset,
  type EditableMesh,
  type ProjectDocument,
  type Vertex,
  type VertexWeight,
  worldMatrix,
} from "../../document-core/src";
import {
  boneMatrices,
  transform,
  skinVertices,
  type Point,
} from "../../rig-core/src";
export type AlphaMask = EditableMesh["alphaMask"];
export const area = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function maskAt(mask: AlphaMask, u: number, v: number) {
  if (u < 0 || v < 0 || u > 1 || v > 1) return false;
  return !!mask.data[
    Math.min(mask.height - 1, Math.floor(v * mask.height)) * mask.width +
      Math.min(mask.width - 1, Math.floor(u * mask.width))
  ];
}
/** Bounded Bowyer–Watson Delaunay in UV space, followed by alpha support filtering. */
export function triangulate(vertices: Vertex[], mask: AlphaMask): number[] {
  if (vertices.length < 3) throw Error("Mesh cần ít nhất 3 vertices");
  const pts = vertices.map((v) => ({ x: v.u, y: v.v }));
  const count = pts.length;
  pts.push({ x: -16, y: -16 }, { x: 16, y: -16 }, { x: 0, y: 16 });
  let tris = [[count, count + 1, count + 2]];
  const inCircle = (tri: number[], p: Point) => {
    const [a, b, c] = tri.map((i) => pts[i]);
    const ax = a.x - p.x,
      ay = a.y - p.y,
      bx = b.x - p.x,
      by = b.y - p.y,
      cx = c.x - p.x,
      cy = c.y - p.y;
    const determinant =
      (ax * ax + ay * ay) * (bx * cy - cx * by) -
      (bx * bx + by * by) * (ax * cy - cx * ay) +
      (cx * cx + cy * cy) * (ax * by - bx * ay);
    return determinant * area(a, b, c) > 1e-13;
  };
  for (let i = 0; i < count; i++) {
    const bad = tris.filter((t) => inCircle(t, pts[i]));
    const edges = new Map<string, { edge: number[]; count: number }>();
    for (const t of bad)
      for (let e = 0; e < 3; e++) {
        const edge = [t[e], t[(e + 1) % 3]],
          key = [...edge].sort((a, b) => a - b).join(",");
        const prev = edges.get(key);
        if (prev) prev.count++;
        else edges.set(key, { edge, count: 1 });
      }
    const remove = new Set(bad);
    tris = tris.filter((t) => !remove.has(t));
    for (const { edge, count: uses } of edges.values())
      if (uses === 1) {
        let t = [edge[0], edge[1], i];
        if (area(...(t.map((j) => pts[j]) as [Point, Point, Point])) < 0)
          t = [edge[1], edge[0], i];
        tris.push(t);
      }
  }
  const result = tris
    .filter(
      (t) =>
        t.every((i) => i < count) &&
        Math.abs(area(pts[t[0]], pts[t[1]], pts[t[2]])) > 1e-10 &&
        [
          [1 / 3, 1 / 3, 1 / 3],
          [0.5, 0.5, 0],
          [0, 0.5, 0.5],
          [0.5, 0, 0.5],
        ].every((weights) => {
          const u = t.reduce((s, id, j) => s + pts[id].x * weights[j], 0),
            v = t.reduce((s, id, j) => s + pts[id].y * weights[j], 0);
          return maskAt(mask, u, v);
        }),
    )
    .flat();
  if (!result.length)
    throw Error(
      "Không tạo được tam giác từ alpha. Hãy dùng ảnh có vùng đặc lớn hơn.",
    );
  return result;
}
export function meshFromMask(
  layerId: string,
  asset: Asset,
  mask: AlphaMask,
  bindMatrix: EditableMesh["bindMatrix"],
): EditableMesh {
  const points: Point[] = [];
  const step = Math.max(
    2,
    Math.ceil(Math.sqrt((mask.width * mask.height) / 200)),
  );
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      if (!mask.data[y * mask.width + x]) continue;
      const boundary =
        x === 0 ||
        y === 0 ||
        x === mask.width - 1 ||
        y === mask.height - 1 ||
        !mask.data[y * mask.width + x - 1] ||
        !mask.data[y * mask.width + x + 1] ||
        !mask.data[(y - 1) * mask.width + x] ||
        !mask.data[(y + 1) * mask.width + x];
      if (
        (x % step === 0 && y % step === 0) ||
        (boundary && (x + y) % Math.max(1, Math.floor(step / 2)) === 0)
      )
        points.push({ x: (x + 0.5) / mask.width, y: (y + 0.5) / mask.height });
    }
  if (points.length > 480) {
    const stride = Math.ceil(points.length / 480);
    points.splice(
      0,
      points.length,
      ...points.filter((_, i) => i % stride === 0),
    );
  }
  const vertices = points.map((p) => ({
    id: crypto.randomUUID(),
    x: p.x * asset.width,
    y: p.y * asset.height,
    u: p.x,
    v: p.y,
  }));
  const triangles = triangulate(vertices, mask);
  const used = new Set(triangles);
  const map = new Map<number, number>();
  const compact = vertices.filter((_, i) => {
    if (!used.has(i)) return false;
    map.set(i, map.size);
    return true;
  });
  return {
    id: crypto.randomUUID(),
    layerId,
    sourceAssetId: asset.id,
    vertices: compact,
    triangles: triangles.map((i) => map.get(i)!),
    boneIds: [],
    bindMatrix,
    alphaMask: mask,
  };
}
export async function generateMesh(doc: ProjectDocument, layerId: string) {
  const l = doc.layers.find((l) => l.id === layerId);
  if (!l) throw Error("Hãy chọn layer");
  const asset = doc.assetReferences.find((a) => a.id === l.assetId)!;
  const image = new Image();
  image.src = asset.data;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(64, asset.width);
  canvas.height = Math.min(64, asset.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const mask = {
    width: canvas.width,
    height: canvas.height,
    data: Array.from({ length: canvas.width * canvas.height }, (_, i) =>
      pixels[i * 4 + 3] > 24 ? 1 : 0,
    ),
  };
  return meshFromMask(layerId, asset, mask, worldMatrix(doc, l));
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(1e-9, dx * dx + dy * dy),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function autoWeights(
  doc: ProjectDocument,
  mesh: EditableMesh,
  boneIds: string[],
) {
  mesh.boneIds = [...new Set(boneIds)];
  doc.vertexWeights = doc.vertexWeights.filter((w) => w.meshId !== mesh.id);
  if (!boneIds.length) return;
  const matrices = boneMatrices(doc, "rest");
  for (const vertex of mesh.vertices) {
    const p = transform(mesh.bindMatrix, vertex);
    const distances = mesh.boneIds
      .map((boneId) => {
        const b = doc.bones.find((b) => b.id === boneId)!;
        const m = matrices.get(boneId)!;
        return {
          boneId,
          distance: segmentDistance(
            p,
            transform(m, { x: 0, y: 0 }),
            transform(m, { x: b.length, y: 0 }),
          ),
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);
    const inv = distances.map((d) => 1 / (d.distance * d.distance + 16));
    const sum = inv.reduce((a, b) => a + b, 0);
    doc.vertexWeights.push({
      id: crypto.randomUUID(),
      meshId: mesh.id,
      vertexId: vertex.id,
      influences: distances.map((d, i) => ({
        boneId: d.boneId,
        weight: inv[i] / sum,
      })),
    });
  }
}
export function setVertexWeight(
  doc: ProjectDocument,
  meshId: string,
  vertexId: string,
  boneId: string,
  weight: number,
) {
  const mesh = doc.meshes.find((m) => m.id === meshId)!;
  if (!mesh.boneIds.includes(boneId)) throw Error("Xương chưa gắn vào mesh");
  let record = doc.vertexWeights.find(
    (w) => w.meshId === meshId && w.vertexId === vertexId,
  );
  if (!record) {
    record = {
      id: crypto.randomUUID(),
      meshId,
      vertexId,
      influences: [{ boneId, weight: 1 }],
    };
    doc.vertexWeights.push(record);
  }
  const others = record.influences
    .filter((i) => i.boneId !== boneId)
    .slice(0, 3);
  if (!others.length) {
    if (weight < 1) {
      const other = mesh.boneIds.find((id) => id !== boneId);
      if (other) others.push({ boneId: other, weight: 1 });
      else weight = 1;
    }
  }
  const total = others.reduce((s, i) => s + i.weight, 0);
  record.influences = [
    ...(weight > 0 ? [{ boneId, weight }] : []),
    ...others
      .map((i) => ({
        boneId: i.boneId,
        weight: ((1 - weight) * i.weight) / total,
      }))
      .filter((i) => i.weight > 1e-9),
  ];
  if (!record.influences.length) record.influences = [{ boneId, weight: 1 }];
}
export function resetMesh(doc: ProjectDocument, meshId: string) {
  const m = doc.meshes.find((m) => m.id === meshId)!;
  const a = doc.assetReferences.find((a) => a.id === m.sourceAssetId)!;
  m.vertices.forEach((v) => {
    v.x = v.u * a.width;
    v.y = v.v * a.height;
  });
}
export function addVertex(
  doc: ProjectDocument,
  meshId: string,
  u: number,
  v: number,
) {
  const mesh = doc.meshes.find((m) => m.id === meshId)!;
  const a = doc.assetReferences.find((a) => a.id === mesh.sourceAssetId)!;
  if (mesh.vertices.length >= 512) throw Error("Mesh tối đa 512 vertices");
  if (!maskAt(mesh.alphaMask, u, v))
    throw Error("Vertex mới phải nằm trong vùng alpha");
  if (mesh.vertices.some((p) => Math.hypot(p.u - u, p.v - v) < 0.002))
    throw Error("Vertex quá gần điểm hiện tại");
  const vertex = {
    id: crypto.randomUUID(),
    x: u * a.width,
    y: v * a.height,
    u,
    v,
  };
  mesh.vertices.push(vertex);
  mesh.triangles = triangulate(mesh.vertices, mesh.alphaMask);
  if (!mesh.triangles.includes(mesh.vertices.length - 1))
    throw Error("Vertex không tạo được tam giác an toàn");
  if (mesh.boneIds.length) {
    const nearest = mesh.vertices
      .slice(0, -1)
      .sort(
        (a, b) => Math.hypot(a.u - u, a.v - v) - Math.hypot(b.u - u, b.v - v),
      )[0];
    const weights = doc.vertexWeights.find(
      (w) => w.meshId === meshId && w.vertexId === nearest.id,
    )!;
    doc.vertexWeights.push({
      id: crypto.randomUUID(),
      meshId,
      vertexId: vertex.id,
      influences: weights.influences.map((i) => ({ ...i })),
    });
  }
  return vertex.id;
}
export function removeVertex(
  doc: ProjectDocument,
  meshId: string,
  vertexId: string,
) {
  const mesh = doc.meshes.find((m) => m.id === meshId)!;
  if (mesh.vertices.length <= 3)
    throw Error("Mesh phải giữ ít nhất 3 vertices");
  mesh.vertices = mesh.vertices.filter((v) => v.id !== vertexId);
  mesh.triangles = triangulate(mesh.vertices, mesh.alphaMask);
  doc.vertexWeights = doc.vertexWeights.filter(
    (w) => !(w.meshId === meshId && w.vertexId === vertexId),
  );
}
/** Move posed vertex in world space by inverting its blended skin matrix. */
export function moveVertexWorld(
  doc: ProjectDocument,
  meshId: string,
  vertexId: string,
  point: Point,
) {
  const mesh = doc.meshes.find((m) => m.id === meshId)!;
  const vertex = mesh.vertices.find((v) => v.id === vertexId)!;
  const at = skinVertices(doc, mesh)[mesh.vertices.indexOf(vertex)];
  const dx = point.x - at.x,
    dy = point.y - at.y;
  const epsilon = 1;
  vertex.x += epsilon;
  const px = skinVertices(doc, mesh)[mesh.vertices.indexOf(vertex)];
  vertex.x -= epsilon;
  vertex.y += epsilon;
  const py = skinVertices(doc, mesh)[mesh.vertices.indexOf(vertex)];
  vertex.y -= epsilon;
  const a = px.x - at.x,
    b = px.y - at.y,
    c = py.x - at.x,
    d = py.y - at.y,
    det = a * d - b * c;
  if (Math.abs(det) < 1e-8)
    throw Error("Skinning suy biến; hãy Reset Pose trước khi chỉnh vertex");
  vertex.x += (d * dx - c * dy) / det;
  vertex.y += (-b * dx + a * dy) / det;
}
export function putMesh(doc: ProjectDocument, mesh: EditableMesh) {
  const previous = doc.meshes.find((m) => m.layerId === mesh.layerId);
  if (previous)
    doc.vertexWeights = doc.vertexWeights.filter(
      (w) => w.meshId !== previous.id,
    );
  doc.meshes = doc.meshes.filter((m) => m.layerId !== mesh.layerId);
  doc.meshes.push(mesh);
}
export type { VertexWeight };
