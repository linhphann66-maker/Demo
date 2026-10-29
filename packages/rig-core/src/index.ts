import {
  multiply,
  worldMatrix,
  type Matrix,
  type ProjectDocument,
  type Bone,
  type Layer,
  type EditableMesh,
} from "../../document-core/src";
export type Point = { x: number; y: number };
export const identity = (): Matrix => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx: 0,
  ty: 0,
});
export function transform(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty };
}
export function inverse(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-10)
    throw Error("Ma trận không khả nghịch");
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    tx: (m.c * m.ty - m.d * m.tx) / det,
    ty: (m.b * m.tx - m.a * m.ty) / det,
  };
}
export const degrees = (r: number) => (r * 180) / Math.PI;
export const radians = (d: number) => (d * Math.PI) / 180;
export const wrap = (r: number) => ((((r + 180) % 360) + 360) % 360) - 180;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function boneMatrices(
  doc: ProjectDocument,
  mode: "rest" | "pose" = doc.rigSettings.mode,
) {
  const map = new Map<string, Matrix>();
  const bones = new Map(doc.bones.map((b) => [b.id, b]));
  const visit = (b: Bone): Matrix => {
    const cached = map.get(b.id);
    if (cached) return cached;
    const pose = mode === "pose" ? b.pose : { x: 0, y: 0, rotation: 0 };
    const angle = radians(b.rest.rotation + pose.rotation);
    const m = {
      a:
        Math.cos(angle) *
        (b.rest.scaleX ?? 1) *
        ("scaleX" in pose ? (pose.scaleX ?? 1) : 1),
      b:
        Math.sin(angle) *
        (b.rest.scaleX ?? 1) *
        ("scaleX" in pose ? (pose.scaleX ?? 1) : 1),
      c:
        -Math.sin(angle) *
        (b.rest.scaleY ?? 1) *
        ("scaleY" in pose ? (pose.scaleY ?? 1) : 1),
      d:
        Math.cos(angle) *
        (b.rest.scaleY ?? 1) *
        ("scaleY" in pose ? (pose.scaleY ?? 1) : 1),
      tx: b.rest.x + pose.x,
      ty: b.rest.y + pose.y,
    };
    const world = b.parentId ? multiply(visit(bones.get(b.parentId)!), m) : m;
    map.set(b.id, world);
    return world;
  };
  for (const b of doc.bones) visit(b);
  return map;
}
export function boneDeltas(doc: ProjectDocument) {
  const rest = boneMatrices(doc, "rest"),
    posed = boneMatrices(doc);
  return new Map(
    doc.bones.map((b) => [
      b.id,
      multiply(posed.get(b.id)!, inverse(rest.get(b.id)!)),
    ]),
  );
}
export function evaluatedLayerMatrices(
  doc: ProjectDocument,
  delta = boneDeltas(doc),
) {
  const out = new Map<string, Matrix>();
  const visit = (l: Layer): Matrix => {
    const cached = out.get(l.id);
    if (cached) return cached;
    const binding = doc.attachments.find((a) => a.layerId === l.id);
    let m: Matrix;
    if (binding) m = multiply(delta.get(binding.boneId)!, worldMatrix(doc, l));
    else {
      const local = worldMatrix(
        { ...doc, layers: [{ ...l, parentId: null }] },
        { ...l, parentId: null },
      );
      const parent = doc.layers.find((p) => p.id === l.parentId);
      m = parent ? multiply(visit(parent), local) : local;
    }
    out.set(l.id, m);
    return m;
  };
  doc.layers.forEach(visit);
  return out;
}
export type SkinContext = {
  deltas: Map<string, Matrix>;
  layers: Map<string, Matrix>;
  baseLayers: Map<string, Matrix>;
  weights: Map<string, Map<string, ProjectDocument["vertexWeights"][number]>>;
};
const weightCache = new WeakMap<
  ProjectDocument["vertexWeights"],
  SkinContext["weights"]
>();
export function createSkinContext(doc: ProjectDocument): SkinContext {
  const deltas = boneDeltas(doc);
  let weights = Object.isFrozen(doc.vertexWeights)
    ? weightCache.get(doc.vertexWeights)
    : undefined;
  if (!weights) {
    weights = new Map();
    for (const w of doc.vertexWeights) {
      let map = weights.get(w.meshId);
      if (!map) {
        map = new Map();
        weights.set(w.meshId, map);
      }
      map.set(w.vertexId, w);
    }
    if (Object.isFrozen(doc.vertexWeights))
      weightCache.set(doc.vertexWeights, weights);
  }
  return {
    deltas,
    layers: evaluatedLayerMatrices(doc, deltas),
    baseLayers: new Map(doc.layers.map((l) => [l.id, worldMatrix(doc, l)])),
    weights,
  };
}
export function skinVertices(
  doc: ProjectDocument,
  mesh: EditableMesh,
  context = createSkinContext(doc),
): Point[] {
  const base = context.baseLayers.get(mesh.layerId)!,
    evaluated = context.layers.get(mesh.layerId)!,
    weights = context.weights.get(mesh.id);
  return mesh.vertices.map((v) => {
    const w = weights?.get(v.id);
    if (!w) return transform(evaluated, v);
    const p = transform(base, v);
    return w.influences.reduce(
      (out, i) => {
        const q = transform(context.deltas.get(i.boneId)!, p);
        out.x += q.x * i.weight;
        out.y += q.y * i.weight;
        return out;
      },
      { x: 0, y: 0 },
    );
  });
}
export function deformationWarnings(doc: ProjectDocument, mesh: EditableMesh) {
  const points = skinVertices(doc, mesh);
  let flipped = 0;
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const [a, b, c] = mesh.triangles.slice(i, i + 3).map((i) => points[i]);
    if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 1e-5) flipped++;
  }
  return flipped;
}
export function setBoneRotation(b: Bone, rotation: number) {
  b.pose.rotation = clamp(
    wrap(rotation),
    b.constraints.minRotation,
    b.constraints.maxRotation,
  );
}
export function solveTwoBone(
  doc: ProjectDocument,
  targetId: string,
  point: Point,
) {
  const target = doc.ikTargets.find((t) => t.id === targetId);
  if (!target) throw Error("Không tìm thấy chuỗi IK");
  const root = doc.bones.find((b) => b.id === target.rootBoneId)!,
    mid = doc.bones.find((b) => b.id === target.midBoneId)!,
    end = doc.bones.find((b) => b.id === target.endBoneId)!;
  doc.rigSettings.mode = "pose";
  if (
    doc.bones.some(
      (b) =>
        Math.abs((b.rest.scaleX ?? 1) - 1) > 1e-8 ||
        Math.abs((b.rest.scaleY ?? 1) - 1) > 1e-8 ||
        Math.abs((b.pose.scaleX ?? 1) - 1) > 1e-8 ||
        Math.abs((b.pose.scaleY ?? 1) - 1) > 1e-8,
    )
  ) {
    // CCD in each joint's parent space handles inherited non-uniform scales.
    const first = { x: mid.rest.x + mid.pose.x, y: mid.rest.y + mid.pose.y };
    const second = {
      x:
        (end.rest.x + end.pose.x) *
        (mid.rest.scaleX ?? 1) *
        (mid.pose.scaleX ?? 1),
      y:
        (end.rest.y + end.pose.y) *
        (mid.rest.scaleY ?? 1) *
        (mid.pose.scaleY ?? 1),
    };
    if (
      Math.hypot(first.x, first.y) < 1e-5 ||
      Math.hypot(second.x, second.y) < 1e-5
    )
      throw Error("IK cần hai đoạn xương có độ dài lớn hơn 0");
    const alignment =
      mid.rest.rotation +
      degrees(Math.atan2(second.y, second.x) - Math.atan2(first.y, first.x));
    const bendRotation = (rotation: number) => {
      const turn = wrap(rotation + alignment);
      return wrap(
        target.bend * clamp(target.bend * turn, 0.001, 179.999) - alignment,
      );
    };
    if (target.bend * wrap(mid.pose.rotation + alignment) < 0.001)
      setBoneRotation(mid, wrap(target.bend * 30 - alignment));
    for (let iteration = 0; iteration < 64; iteration++) {
      for (const joint of [mid, root]) {
        const worlds = boneMatrices(doc);
        const parent = joint.parentId
          ? worlds.get(joint.parentId)!
          : identity();
        const endPoint = transform(
          inverse(parent),
          transform(worlds.get(end.id)!, { x: 0, y: 0 }),
        );
        const targetPoint = transform(inverse(parent), point);
        const origin = {
          x: joint.rest.x + joint.pose.x,
          y: joint.rest.y + joint.pose.y,
        };
        const delta = degrees(
          Math.atan2(targetPoint.y - origin.y, targetPoint.x - origin.x) -
            Math.atan2(endPoint.y - origin.y, endPoint.x - origin.x),
        );
        const rotation = joint.pose.rotation + delta;
        setBoneRotation(
          joint,
          joint === mid ? bendRotation(rotation) : rotation,
        );
      }
      const actual = transform(boneMatrices(doc).get(end.id)!, { x: 0, y: 0 });
      if (Math.hypot(actual.x - point.x, actual.y - point.y) < 0.001) break;
    }
    target.x = point.x;
    target.y = point.y;
    target.enabled = true;
    const actual = transform(boneMatrices(doc).get(end.id)!, { x: 0, y: 0 });
    return {
      actual,
      error: Math.hypot(actual.x - point.x, actual.y - point.y),
    };
  }
  const matrices = boneMatrices(doc);
  const start = transform(matrices.get(root.id)!, { x: 0, y: 0 });
  const v1 = { x: mid.rest.x + mid.pose.x, y: mid.rest.y + mid.pose.y },
    v2 = { x: end.rest.x + end.pose.x, y: end.rest.y + end.pose.y };
  const l1 = Math.hypot(v1.x, v1.y),
    l2 = Math.hypot(v2.x, v2.y);
  if (l1 < 1e-5 || l2 < 1e-5)
    throw Error("IK cần hai đoạn xương có độ dài lớn hơn 0");
  const dx = point.x - start.x,
    dy = point.y - start.y;
  const distance = clamp(
    Math.hypot(dx, dy),
    Math.abs(l1 - l2) + 1e-5,
    l1 + l2 - 1e-5,
  );
  const theta = Math.atan2(dy, dx),
    bend = target.bend;
  const alpha =
    theta -
    bend *
      Math.acos(
        clamp(
          (l1 * l1 + distance * distance - l2 * l2) / (2 * l1 * distance),
          -1,
          1,
        ),
      );
  const beta =
    alpha +
    bend *
      (Math.PI -
        Math.acos(
          clamp(
            (l1 * l1 + l2 * l2 - distance * distance) / (2 * l1 * l2),
            -1,
            1,
          ),
        ));
  const rootWorld = degrees(alpha - Math.atan2(v1.y, v1.x));
  const midWorld = degrees(beta - Math.atan2(v2.y, v2.x));
  const parent = root.parentId ? matrices.get(root.parentId)! : identity();
  setBoneRotation(
    root,
    rootWorld - degrees(Math.atan2(parent.b, parent.a)) - root.rest.rotation,
  );
  const actualRootWorld = degrees(
    Math.atan2(
      boneMatrices(doc).get(root.id)!.b,
      boneMatrices(doc).get(root.id)!.a,
    ),
  );
  setBoneRotation(mid, midWorld - actualRootWorld - mid.rest.rotation);
  target.x = point.x;
  target.y = point.y;
  target.enabled = true;
  const actual = transform(boneMatrices(doc).get(end.id)!, { x: 0, y: 0 });
  return { actual, error: Math.hypot(actual.x - point.x, actual.y - point.y) };
}
export function resetPose(doc: ProjectDocument) {
  for (const b of doc.bones) b.pose = { x: 0, y: 0, rotation: 0 };
  for (const t of doc.ikTargets) t.enabled = false;
}
export function bindLayer(
  doc: ProjectDocument,
  layerId: string,
  boneId: string | null,
) {
  doc.attachments = doc.attachments.filter((a) => a.layerId !== layerId);
  if (boneId)
    doc.attachments.push({ id: crypto.randomUUID(), layerId, boneId });
}
export function removeBone(doc: ProjectDocument, id: string) {
  const bone = doc.bones.find((b) => b.id === id);
  if (!bone) return;
  const rest = boneMatrices(doc, "rest"),
    pose = boneMatrices(doc, "pose");
  for (const child of doc.bones.filter((b) => b.parentId === id)) {
    const parentRest = bone.parentId ? rest.get(bone.parentId)! : identity();
    const parentPose = bone.parentId ? pose.get(bone.parentId)! : identity();
    const r = multiply(inverse(parentRest), rest.get(child.id)!),
      p = multiply(inverse(parentPose), pose.get(child.id)!);
    child.parentId = bone.parentId;
    child.rest = { x: r.tx, y: r.ty, rotation: degrees(Math.atan2(r.b, r.a)) };
    child.pose = { x: p.tx - r.tx, y: p.ty - r.ty, rotation: 0 };
    setBoneRotation(child, degrees(Math.atan2(p.b, p.a)) - child.rest.rotation);
  }
  doc.bones = doc.bones.filter((b) => b.id !== id);
  doc.attachments = doc.attachments.filter((a) => a.boneId !== id);
  doc.equipmentSlots = doc.equipmentSlots.filter((s) => s.boneId !== id);
  doc.ikTargets = doc.ikTargets.filter(
    (t) => ![t.rootBoneId, t.midBoneId, t.endBoneId].includes(id),
  );
  for (const m of doc.meshes) {
    m.boneIds = m.boneIds.filter((b) => b !== id);
    if (!m.boneIds.length)
      doc.vertexWeights = doc.vertexWeights.filter((w) => w.meshId !== m.id);
    else
      for (const w of doc.vertexWeights.filter((w) => w.meshId === m.id)) {
        w.influences = w.influences.filter((i) => i.boneId !== id);
        if (!w.influences.length)
          w.influences = [{ boneId: m.boneIds[0], weight: 1 }];
        else {
          const sum = w.influences.reduce((s, i) => s + i.weight, 0);
          w.influences.forEach((i) => (i.weight /= sum));
        }
      }
  }
}
export function reparentBone(
  doc: ProjectDocument,
  id: string,
  parentId: string | null,
) {
  const bone = doc.bones.find((b) => b.id === id)!;
  if (parentId === id) throw Error("Không thể chọn chính xương làm cha");
  let p = doc.bones.find((b) => b.id === parentId);
  while (p) {
    if (p.id === id) throw Error("Xương cha tạo vòng lặp");
    p = doc.bones.find((b) => b.id === p!.parentId);
  }
  const rest = boneMatrices(doc, "rest"),
    posed = boneMatrices(doc, "pose");
  const r = multiply(
    inverse(parentId ? rest.get(parentId)! : identity()),
    rest.get(id)!,
  );
  const pose = multiply(
    inverse(parentId ? posed.get(parentId)! : identity()),
    posed.get(id)!,
  );
  bone.parentId = parentId;
  bone.rest = { x: r.tx, y: r.ty, rotation: degrees(Math.atan2(r.b, r.a)) };
  bone.pose = { x: pose.tx - r.tx, y: pose.ty - r.ty, rotation: 0 };
  setBoneRotation(
    bone,
    degrees(Math.atan2(pose.b, pose.a)) - bone.rest.rotation,
  );
  doc.ikTargets = doc.ikTargets.filter((t) => {
    const m = doc.bones.find((b) => b.id === t.midBoneId),
      e = doc.bones.find((b) => b.id === t.endBoneId);
    return m?.parentId === t.rootBoneId && e?.parentId === t.midBoneId;
  });
}
