import {
  type ProjectDocument,
  type CharacterJoint,
  type JointReport,
  type JointIssue,
  layerDisplayed,
  boneInView,
} from "../../document-core/src";
import {
  boneMatrices,
  createSkinContext,
  skinVertices,
  transform,
  inverse,
  setBoneRotation,
} from "../../rig-core/src";
import { area, maskAt } from "./index";
import { clonePose } from "../../animation-core/src/evaluation";
type Point = { x: number; y: number };
function surfaces(doc: ProjectDocument, joint: CharacterJoint) {
  const ctx = createSkinContext(doc);
  return joint.layerIds
    .filter((id) => layerDisplayed(doc, id))
    .map((id) => {
      const layer = doc.layers.find((l) => l.id === id)!,
        part = doc.characterParts.find((p) => p.layerId === id),
        mesh = doc.meshes.find((m) => m.layerId === id),
        asset = doc.assetReferences.find((a) => a.id === layer.assetId)!;
      const points = mesh ? skinVertices(doc, mesh, ctx) : null,
        matrix = ctx.layers.get(id)!,
        inv = inverse(matrix);
      return {
        id,
        part,
        mesh,
        points,
        covers(p: Point) {
          if (!part) return false;
          if (!mesh) {
            const q = transform(inv, p);
            return maskAt(
              part.alphaMask,
              q.x / asset.width,
              q.y / asset.height,
            );
          }
          for (let i = 0; i < mesh.triangles.length; i += 3) {
            const ids = mesh.triangles.slice(i, i + 3),
              tri = ids.map((i) => points![i]);
            if (tri.some((p) => !p)) continue;
            const [a, b, c] = tri,
              den = area(a, b, c);
            if (Math.abs(den) < 1e-8) continue;
            const u = area(p, b, c) / den,
              v = area(a, p, c) / den,
              w = 1 - u - v;
            if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) {
              const vertices = ids.map((id) => mesh.vertices[id]);
              if (
                maskAt(
                  part.alphaMask,
                  u * vertices[0].u + v * vertices[1].u + w * vertices[2].u,
                  u * vertices[0].v + v * vertices[1].v + w * vertices[2].v,
                )
              )
                return true;
            }
          }
          return false;
        },
      };
    });
}
const intersect = (a: Point, b: Point, c: Point, d: Point) =>
  area(a, b, c) * area(a, b, d) < -1e-7 &&
  area(c, d, a) * area(c, d, b) < -1e-7;
/** Alpha-aware sampled sweep. It finds likely artifacts, not proof for arbitrary imported artwork. */
export function validateJoints(
  source: ProjectDocument,
  angles?: number[],
  kinds:CharacterJoint["kind"][]=["elbow","knee"],
): JointReport {
  const report: JointReport = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    sourceRevision: source.metadata.revision,
    testedAngles: [],
    samples: 0,
    uncoveredSamples: 0,
    issues: [],
    jointIds: [],
  };
  const add = (
    joint: CharacterJoint,
    kind: JointIssue["kind"],
    angle: number,
    position: Point,
    message: string,
    severity: JointIssue["severity"] = "warning",
    suggestions: JointIssue["suggestions"] = [
      "increase_overlap",
      "adjust_pivot",
      "expand_underlap",
      "smooth_weights",
      "increase_density",
    ],
  ) => {
    if (
      report.issues.length >= 2048 ||
      report.issues.some(
        (i) => i.jointId === joint.id && i.kind === kind && i.angle === angle,
      )
    )
      return;
    report.issues.push({
      id: crypto.randomUUID(),
      jointId: joint.id,
      kind,
      angle,
      position,
      message,
      severity,
      suggestions,
    });
  };
  for (const joint of source.characterJoints.filter(
    (j) =>
      kinds.includes(j.kind) && boneInView(source, j.lowerBoneId),
  )) {
    report.jointIds.push(joint.id);
    const samples =
      angles ??
      (joint.kind === "elbow"
        ? [-120, -90, -60, -30, 0, 30]
        : [0, 30, 60, 90, 120]);
    for (const angle of samples) {
      if (!report.testedAngles.includes(angle)) report.testedAngles.push(angle);
      const doc = clonePose(source);
      for (const b of doc.bones) b.pose = { x: 0, y: 0, rotation: 0 };
      for (const t of doc.ikTargets) t.enabled = false;
      const bone = doc.bones.find((b) => b.id === joint.lowerBoneId)!;
      const upper = doc.bones.find((b) => b.id === joint.upperBoneId)!;
      setBoneRotation(upper, joint.kind === "elbow" ? -18 : -8);
      const invalid =
        angle < bone.constraints.minRotation ||
        angle > bone.constraints.maxRotation;
      setBoneRotation(bone, angle);
      const m = boneMatrices(doc).get(bone.id)!,
        center = { x: m.tx, y: m.ty };
      if (invalid)
        add(
          joint,
          "rotation_limit",
          angle,
          center,
          "Góc sweep vượt giới hạn khớp; đã kiểm tra tại góc bị giới hạn.",
          "error",
          ["adjust_pivot"],
        );
      const visible = surfaces(doc, joint),
        radius = joint.radius * 0.42;
      let missing = 0,
        location = center;
      for (let y = -3; y <= 3; y++)
        for (let x = -3; x <= 3; x++) {
          if (x * x + y * y > 9) continue;
          const p = {
            x: center.x + (x * radius) / 3,
            y: center.y + (y * radius) / 3,
          };
          report.samples++;
          if (!visible.some((s) => s.covers(p))) {
            report.uncoveredSamples++;
            missing++;
            location = p;
          }
        }
      if (missing) {
        add(
          joint,
          "visible_gap",
          angle,
          location,
          `${missing} mẫu alpha bị hở trong lõi khớp.`,
          "error",
        );
        add(
          joint,
          "exposed_alpha",
          angle,
          location,
          "Vùng dự kiến được che có alpha trong suốt.",
          "error",
        );
        if (joint.mode === "overlap_only")
          add(
            joint,
            "broken_overlap",
            angle,
            location,
            "Overlap/underlap không che kín đường nối.",
            "error",
          );
      }
      const rest = clonePose(source);
      rest.rigSettings.mode = "rest";
      const restCtx = createSkinContext(rest);
      for (const surface of visible) {
        const { mesh, points } = surface;
        if (!mesh || !points) continue;
        const base = skinVertices(
          rest,
          rest.meshes.find((m) => m.id === mesh.id)!,
          restCtx,
        );
        const edges = new Map<string, [number, number]>();
        for (let i = 0; i < mesh.triangles.length; i += 3) {
          const ids = mesh.triangles.slice(i, i + 3);
          if (
            ids.length !== 3 ||
            ids.some(
              (n) => !Number.isInteger(n) || n < 0 || n >= points.length,
            ) ||
            new Set(ids).size !== 3
          ) {
            add(
              joint,
              "invalid_triangle",
              angle,
              center,
              "Triangle indices không hợp lệ.",
              "error",
            );
            continue;
          }
          const tri = ids.map((n) => points[n]);
          if (
            Math.abs(area(tri[0], tri[1], tri[2])) < 1e-5 ||
            area(tri[0], tri[1], tri[2]) < 0
          )
            add(
              joint,
              "invalid_triangle",
              angle,
              center,
              "Tam giác bị xẹp hoặc đảo chiều khi gập; cần xem mesh overlay.",
            );
          for (let e = 0; e < 3; e++) {
            const a = ids[e],
              b = ids[(e + 1) % 3],
              key = [a, b].sort((a, b) => a - b).join(":");
            edges.set(key, [a, b]);
            const original = Math.hypot(
                base[a].x - base[b].x,
                base[a].y - base[b].y,
              ),
              length = Math.hypot(
                points[a].x - points[b].x,
                points[a].y - points[b].y,
              );
            if (original > 0.01 && length / original > 3.2)
              add(
                joint,
                "stretch",
                angle,
                points[a],
                `Cạnh mesh kéo dài ${(length / original).toFixed(1)}× so với rest.`,
              );
          }
        }
        const near = [...edges.values()].filter(
          ([a, b]) =>
            Math.min(
              Math.hypot(points[a].x - center.x, points[a].y - center.y),
              Math.hypot(points[b].x - center.x, points[b].y - center.y),
            ) <
            joint.radius * 2.5,
        );
        let crossed = false;
        for (let i = 0; i < near.length && !crossed; i++)
          for (let j = i + 1; j < near.length; j++) {
            const [a, b] = near[i],
              [c, d] = near[j];
            if (
              new Set([a, b, c, d]).size === 4 &&
              intersect(points[a], points[b], points[c], points[d])
            ) {
              crossed = true;
              break;
            }
          }
        if (crossed)
          add(
            joint,
            "self_intersection",
            angle,
            center,
            "Cạnh mesh tự cắt tại vùng khớp; kiểm tra silhouette và smooth weights.",
          );
        for (const vertex of mesh.vertices) {
          const w = doc.vertexWeights.find(
            (w) => w.meshId === mesh.id && w.vertexId === vertex.id,
          );
          if (
            mesh.boneIds.length &&
            (!w ||
              Math.abs(w.influences.reduce((s, i) => s + i.weight, 0) - 1) >
                1e-5 ||
              w.influences.some(
                (i) => i.weight <= 0 || !mesh.boneIds.includes(i.boneId),
              ))
          ) {
            add(
              joint,
              "invalid_weights",
              angle,
              center,
              "Vertex thiếu hoặc sai bone weights.",
              "error",
              ["smooth_weights"],
            );
            break;
          }
        }
      }
      const upperSurface = visible.find((s) => s.part?.role === "upper"),
        lowerSurface = visible.find((s) => s.part?.role === "lower");
      if (upperSurface && lowerSurface) {
        let excess = 0;
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8,
            p = {
              x: center.x + Math.cos(a) * joint.radius * 2.5,
              y: center.y + Math.sin(a) * joint.radius * 2.5,
            };
          if (upperSurface.covers(p) && lowerSurface.covers(p)) excess++;
        }
        if (excess > 3)
          add(
            joint,
            "unexpected_overlap",
            angle,
            center,
            "Hai segment chồng lên nhau ngoài vùng overlap dự kiến.",
            "warning",
            ["adjust_pivot", "increase_density"],
          );
      }
    }
  }
  return report;
}
