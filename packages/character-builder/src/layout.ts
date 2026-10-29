import {
  type ProjectDocument,
  type CharacterBuild,
  type PartCandidate,
  type Asset,
  type PartSlot,
  type Layer,
  type AnchorName,
  type AssemblySettings,
  primarySlots,
  worldMatrix,
} from "../../document-core/src";
import { degrees, transform, type Point } from "../../rig-core/src";
export function axisOf(c: CharacterBuild["candidates"][number], asset: Asset) {
  const points: Point[] = [];
  for (let y = 0; y < c.mask.height; y++)
    for (let x = 0; x < c.mask.width; x++)
      if (c.mask.data[y * c.mask.width + x] > 80)
        points.push({
          x: ((x + 0.5) / c.mask.width) * asset.width,
          y: ((y + 0.5) / c.mask.height) * asset.height,
        });
  if (points.length < 3) throw Error("Mask không đủ vùng đặc");
  const mean = {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      y: points.reduce((s, p) => s + p.y, 0) / points.length,
    },
    xx = points.reduce((s, p) => s + (p.x - mean.x) ** 2, 0),
    yy = points.reduce((s, p) => s + (p.y - mean.y) ** 2, 0),
    xy = points.reduce((s, p) => s + (p.x - mean.x) * (p.y - mean.y), 0);
  let angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  if (Math.sin(angle) < -0.01) angle += Math.PI;
  const dx = Math.cos(angle),
    dy = Math.sin(angle),
    projection = points.map((p) => (p.x - mean.x) * dx + (p.y - mean.y) * dy),
    min = Math.min(...projection),
    max = Math.max(...projection),
    span = Math.max(1, max - min);
  const nearest = (target: Point) => {
    const x = Math.floor((target.x / asset.width) * c.mask.width),
      y = Math.floor((target.y / asset.height) * c.mask.height);
    if (
      x >= 0 &&
      y >= 0 &&
      x < c.mask.width &&
      y < c.mask.height &&
      c.mask.data[y * c.mask.width + x] > 80
    )
      return target;
    return points.reduce(
      (best, p) =>
        Math.hypot(p.x - target.x, p.y - target.y) <
        Math.hypot(best.x - target.x, best.y - target.y)
          ? p
          : best,
      points[0],
    );
  };
  const start = nearest({
      x: mean.x + dx * (min + 0.03 * span),
      y: mean.y + dy * (min + 0.03 * span),
    }),
    end = nearest({
      x: mean.x + dx * (max - 0.02 * span),
      y: mean.y + dy * (max - 0.02 * span),
    });
  return {
    start,
    end,
    angle: degrees(Math.atan2(end.y - start.y, end.x - start.x)),
    length: Math.max(1, Math.hypot(end.x - start.x, end.y - start.y)),
  };
}
export const slotOrder: PartSlot[] = [
  "left_arm",
  "left_leg",
  "right_leg",
  "torso",
  "head",
  "hair",
  "right_arm",
];
export const labels: Record<PartSlot, string> = {
  head: "Đầu (gồm mặt)",
  hair: "Tóc",
  torso: "Thân",
  left_arm: "Tay trái",
  right_arm: "Tay phải",
  left_leg: "Chân trái",
  right_leg: "Chân phải",
};
export function ensureAssembly(doc: ProjectDocument): AssemblySettings {
  const b = doc.characterBuild!;
  return (
    b.assembly ??
    (b.assembly = { normalized: true, scales: {}, anchors: [], warnings: [] })
  );
}
export function maskBounds(c: PartCandidate, a: Asset) {
  const xs: number[] = [],
    ys: number[] = [];
  for (let y = 0; y < c.mask.height; y++)
    for (let x = 0; x < c.mask.width; x++)
      if (c.mask.data[y * c.mask.width + x] > 80) {
        xs.push(x);
        ys.push(y);
      }
  if (!xs.length)
    throw Error("Phần ảnh không còn vùng hiển thị; hãy khôi phục mask.");
  const left = (Math.min(...xs) / c.mask.width) * a.width,
    top = (Math.min(...ys) / c.mask.height) * a.height,
    right = ((Math.max(...xs) + 1) / c.mask.width) * a.width,
    bottom = ((Math.max(...ys) + 1) / c.mask.height) * a.height;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}
export function defaultAnchors(
  c: PartCandidate,
  a: Asset,
  slot: PartSlot,
): Partial<Record<AnchorName, Point>> {
  const box = maskBounds(c, a),
    at = (x: number, y: number) => ({
      x: (box.left + box.width * x) / a.width,
      y: (box.top + box.height * y) / a.height,
    });
  if (slot === "torso")
    return {
      neck_anchor: at(0.53, 0.04),
      left_shoulder_anchor: at(0.15, 0.13),
      right_shoulder_anchor: at(0.85, 0.13),
      left_hip_anchor: at(0.32, 0.94),
      right_hip_anchor: at(0.7, 0.94),
      cloak_anchor: at(0.12, 0.12),
      weapon_anchor: at(0.95, 0.55),
    };
  if (slot === "head")
    return { neck_base: at(0.5, 0.97), scalp_anchor: at(0.5, 0.16) };
  if (slot === "hair") return { scalp_anchor: at(0.5, 0.58) };
  const axis = axisOf(c, a);
  return {
    [slot.includes("arm") ? "shoulder_joint" : "hip_joint"]: {
      x: axis.start.x / a.width,
      y: axis.start.y / a.height,
    },
  };
}
export function candidateAnchors(
  doc: ProjectDocument,
  c: PartCandidate,
  slot: PartSlot,
) {
  const a = doc.assetReferences.find((a) => a.id === c.previewAssetId)!;
  return {
    ...defaultAnchors(c, a, slot),
    ...(doc.characterBuild!.assembly?.anchors.find(
      (e) => e.candidateId === c.id,
    )?.points ?? {}),
  };
}
export function setAnchor(
  doc: ProjectDocument,
  candidateId: string,
  name: AnchorName,
  value: Point,
) {
  const settings = ensureAssembly(doc);
  let entry = settings.anchors.find((e) => e.candidateId === candidateId);
  if (!entry) {
    entry = { candidateId, points: {} };
    settings.anchors.push(entry);
  }
  entry.points[name] = {
    x: Math.max(0, Math.min(1, value.x)),
    y: Math.max(0, Math.min(1, value.y)),
  };
}
export function worldAnchor(
  doc: ProjectDocument,
  slot: PartSlot,
  name: AnchorName,
) {
  const b = doc.characterBuild!,
    c = b.candidates.find((c) => c.id === b.selection[slot])!,
    a = doc.assetReferences.find((a) => a.id === c.previewAssetId)!,
    l = doc.layers.find(
      (l) => l.id === b.layerMappings.find((m) => m.slot === slot)!.layerId,
    )!,
    p = candidateAnchors(doc, c, slot)[name];
  if (!p) throw Error("Chưa có anchor " + name);
  return transform(worldMatrix(doc, l), {
    x: p.x * a.width,
    y: p.y * a.height,
  });
}
function bottomExtent(
  c: PartCandidate,
  a: Asset,
  pivot: Point,
  rotation: number,
) {
  const angle = (rotation * Math.PI) / 180;
  let max = 1;
  for (let y = 0; y < c.mask.height; y++)
    for (let x = 0; x < c.mask.width; x++)
      if (c.mask.data[y * c.mask.width + x] > 80) {
        const px = ((x + 0.5) / c.mask.width) * a.width - pivot.x,
          py = ((y + 1) / c.mask.height) * a.height - pivot.y;
        max = Math.max(max, px * Math.sin(angle) + py * Math.cos(angle));
      }
  return max;
}
/** Procedural anchored layout: all dimensions derive from alpha bounds and torso proportions. */
export function anchoredLayers(doc: ProjectDocument) {
  const b = doc.characterBuild!,
    settings = ensureAssembly(doc),
    normalized = settings.normalized,
    warnings: string[] = [],
    layers: Layer[] = [],
    mappings: { slot: PartSlot; candidateId: string; layerId: string }[] = [],
    placed = new Map<PartSlot, Layer>();
  settings.scales = {};
  const info = (slot: PartSlot) => {
    const c = b.candidates.find(
      (c) => c.id === b.selection[slot] && !c.rejected,
    );
    if (!c) return null;
    const a = doc.assetReferences.find((a) => a.id === c.previewAssetId)!;
    return {
      c,
      a,
      box: maskBounds(c, a),
      anchors: candidateAnchors(doc, c, slot),
    };
  };
  const torso = info("torso"),
    torsoScale = normalized && torso ? 150 / torso.box.height : 1;
  const torsoWidth = torso ? torso.box.width * torsoScale : 110;
  const cap = (n: number, slot: PartSlot) => {
    if (n < 0.01 || n > 20)
      warnings.push(
        labels[slot] +
          ": ảnh quá nhỏ/lớn; scale được giới hạn, cần kiểm tra lại.",
      );
    return Math.max(0.01, Math.min(20, n));
  };
  const place = (
    slot: PartSlot,
    local: Point,
    world: Point,
    scale: number,
    rotation = 0,
  ) => {
    const i = info(slot)!;
    scale = cap(scale, slot);
    const l: Layer = {
      id: crypto.randomUUID(),
      assetId: i.a.id,
      parentId: null,
      name: labels[slot],
      visible: true,
      locked: false,
      opacity: 1,
      x: world.x,
      y: world.y,
      pivotX: local.x,
      pivotY: local.y,
      scaleX: scale,
      scaleY: scale,
      rotation,
    };
    layers.push(l);
    placed.set(slot, l);
    mappings.push({ slot, candidateId: i.c.id, layerId: l.id });
    settings.scales[slot] = scale;
    return l;
  };
  const pixel = (i: NonNullable<ReturnType<typeof info>>, name: AnchorName) => {
    const p = i.anchors[name]!;
    return { x: p.x * i.a.width, y: p.y * i.a.height };
  };
  const anchor = (slot: PartSlot, name: AnchorName, fallback: Point) => {
    const i = info(slot),
      l = placed.get(slot);
    if (!i || !l) return fallback;
    const angle = (l.rotation * Math.PI) / 180,
      p = pixel(i, name),
      x = (p.x - (l.pivotX ?? 0)) * l.scaleX,
      y = (p.y - (l.pivotY ?? 0)) * l.scaleY;
    return {
      x: l.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: l.y + x * Math.sin(angle) + y * Math.cos(angle),
    };
  };
  let torsoY = 395;
  if (!normalized && torso) {
    const contacts = (["left_leg", "right_leg"] as PartSlot[]).flatMap(
      (slot) => {
        const i = info(slot);
        if (!i) return [];
        const pivot = pixel(i, "hip_joint"),
          rotation = 90 - axisOf(i.c, i.a).angle,
          hip = pixel(
            torso,
            slot === "left_leg" ? "left_hip_anchor" : "right_hip_anchor",
          );
        return [
          hip.y -
            (torso.box.top + torso.box.bottom) / 2 +
            bottomExtent(i.c, i.a, pivot, rotation),
        ];
      },
    );
    if (contacts.length) torsoY = 650 - Math.max(...contacts);
    warnings.push(
      "Đang giữ scale gốc. Nếu hai chân lệch nhau hoặc phần ảnh quá to/nhỏ, hãy dùng Chuẩn hóa kích cỡ.",
    );
  }
  if (torso)
    place(
      "torso",
      {
        x: (torso.box.left + torso.box.right) / 2,
        y: (torso.box.top + torso.box.bottom) / 2,
      },
      { x: 400, y: torsoY },
      torsoScale,
    );
  const head = info("head");
  if (head) {
    const scale = normalized
      ? Math.min(135 / head.box.height, (torsoWidth * 1.22) / head.box.width)
      : 1;
    place(
      "head",
      pixel(head, "neck_base"),
      anchor("torso", "neck_anchor", { x: 400, y: 326 }),
      scale,
    );
  }
  const hair = info("hair");
  if (hair) {
    const headWidth = head ? head.box.width * (settings.scales.head ?? 1) : 125;
    const scale = normalized
      ? Math.min((headWidth * 1.12) / hair.box.width, 110 / hair.box.height)
      : 1;
    place(
      "hair",
      pixel(hair, "scalp_anchor"),
      anchor("head", "scalp_anchor", { x: 400, y: 210 }),
      scale,
    );
  }
  for (const slot of [
    "left_arm",
    "right_arm",
    "left_leg",
    "right_leg",
  ] as PartSlot[]) {
    const i = info(slot);
    if (!i) continue;
    const arm = slot.includes("arm"),
      right = slot.startsWith("right"),
      joint = arm ? "shoulder_joint" : "hip_joint",
      pivot = pixel(i, joint),
      axis = axisOf(i.c, i.a),
      rotation = 90 - axis.angle + (arm ? -8 : 0),
      target = anchor(
        "torso",
        arm
          ? right
            ? "right_shoulder_anchor"
            : "left_shoulder_anchor"
          : right
            ? "right_hip_anchor"
            : "left_hip_anchor",
        { x: right ? 435 : 375, y: arm ? 340 : 466 },
      );
    const scale = normalized
      ? arm
        ? 168 / axis.length
        : (650 - target.y) / bottomExtent(i.c, i.a, pivot, rotation)
      : 1;
    place(slot, pivot, target, scale, rotation);
  }
  if (normalized && torso)
    for (const slot of primarySlots) {
      const i = info(slot),
        scale = settings.scales[slot];
      if (!i || !scale) continue;
      const relative = scale / torsoScale;
      if (relative > 2.5 || relative < 0.4)
        warnings.push(
          labels[slot] +
            ": kích cỡ nguồn lệch nhiều so với thân; đã chuẩn hóa, hãy kiểm tra ảnh và anchor.",
        );
    }
  for (const type of ["arm", "leg"]) {
    const l = info(("left_" + type) as PartSlot),
      r = info(("right_" + type) as PartSlot);
    if (l && r) {
      const ratio = axisOf(l.c, l.a).length / axisOf(r.c, r.a).length;
      if (ratio > 1.5 || ratio < 1 / 1.5)
        warnings.push(
          (type === "arm" ? "Hai tay" : "Hai chân") +
            " có độ dài nguồn chênh lệch lớn.",
        );
    }
  }
  layers.sort(
    (a, c) =>
      slotOrder.indexOf(mappings.find((m) => m.layerId === a.id)!.slot) -
      slotOrder.indexOf(mappings.find((m) => m.layerId === c.id)!.slot),
  );
  if(b.aiReview?.renderOrder.length){
    const order=b.aiReview.renderOrder;
    const rank=(id:string)=>{const c=mappings.find(m=>m.layerId===id)?.candidateId;const n=c?order.indexOf(c):-1;return n<0?order.length:n;};
    layers.sort((a,c)=>rank(a.id)-rank(c.id));
  }
  mappings.sort(
    (a, c) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(c.slot),
  );
  for (const extra of b.optionalAttachments ?? []) {
    const c = b.candidates.find(
      (c) => c.id === extra.candidateId && !c.rejected,
    );
    if (!c) continue;
    const a = doc.assetReferences.find((a) => a.id === c.previewAssetId)!,
      cloak = extra.kind === "cloak",
      arm = placed.get("right_arm"),
      armInfo = info("right_arm"),
      end =
        arm && armInfo
          ? (() => {
              const p = axisOf(armInfo.c, armInfo.a).end,
                angle = (arm.rotation * Math.PI) / 180,
                x = (p.x - arm.pivotX!) * arm.scaleX,
                y = (p.y - arm.pivotY!) * arm.scaleY;
              return {
                x: arm.x + x * Math.cos(angle) - y * Math.sin(angle),
                y: arm.y + x * Math.sin(angle) + y * Math.cos(angle),
              };
            })()
          : { x: 460, y: 490 };
    const target = cloak
      ? anchor("torso", "cloak_anchor", { x: 360, y: 335 })
      : end;
    const l: Layer = {
      id: crypto.randomUUID(),
      assetId: a.id,
      parentId: null,
      name: cloak ? "Áo choàng" : "Kiếm",
      x: target.x,
      y: target.y,
      rotation: 0,
      pivotX: a.width * (cloak ? 0.8 : 0.5),
      pivotY: a.height * (cloak ? 0.05 : 0.8),
      scaleX: Math.max(0.01, Math.min(20, (cloak ? 250 : 150) / a.height)),
      scaleY: Math.max(0.01, Math.min(20, (cloak ? 250 : 150) / a.height)),
      opacity: 1,
      visible: true,
      locked: false,
    };
    if (cloak) layers.unshift(l);
    else layers.push(l);
    extra.layerId = l.id;
  }
  settings.warnings = warnings.slice(0, 32);
  return { layers, mappings };
}
