import {
  type PartCandidate,
  type PartSlot,
  primarySlots,
} from "../../document-core/src/builder-schema";
export type Raster = { width: number; height: number; data: Uint8ClampedArray };
export type Component = {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  pixels: number[];
};
export type Detection = {
  mask: Uint8ClampedArray;
  components: Component[];
  warnings: string[];
  method: "alpha_components" | "solid_background";
};
/** Removes only a border-connected solid background. Interior white clothing/highlights are retained. */
export function foreground(
  image: Raster,
  tolerance = 24,
  progress?: (n: number) => void,
): { alpha: Uint8ClampedArray; warnings: string[]; opaque: boolean } {
  const { width: w, height: h, data } = image;
  if (!w || !h || w * h > 1024 * 1024 || data.length !== w * h * 4)
    throw Error("Detection raster must be at most 1024²");
  const alpha = new Uint8ClampedArray(w * h),
    warnings: string[] = [];
  let transparent = 0;
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = data[i * 4 + 3];
    if (alpha[i] < 16) transparent++;
  }
  if (transparent > alpha.length * 0.005)
    return { alpha, warnings, opaque: false };
  const corners = [0, w - 1, (h - 1) * w, w * h - 1],
    bg = [0, 1, 2].map(
      (k) => corners.map((i) => data[i * 4 + k]).sort((a, b) => a - b)[1],
    );
  const distance = (i: number) =>
    Math.max(...bg.map((c, k) => Math.abs(data[i * 4 + k] - c)));
  if (corners.some((i) => distance(i) > tolerance))
    warnings.push(
      "Nền không đồng nhất; mask heuristic cần được kiểm tra/vẽ lại.",
    );
  const removed = new Uint8Array(w * h),
    queue = new Int32Array(w * h);
  let start = 0,
    end = 0;
  const visit = (i: number) => {
    if (!removed[i] && distance(i) <= tolerance) {
      removed[i] = 1;
      queue[end++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    visit(x);
    visit((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    visit(y * w);
    visit(y * w + w - 1);
  }
  while (start < end) {
    const i = queue[start++],
      x = i % w;
    if (x) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < (h - 1) * w) visit(i + w);
    if (start % 65536 === 0) progress?.((start / (w * h)) * 0.4);
  }
  for (let i = 0; i < alpha.length; i++)
    if (removed[i]) alpha[i] = 0;
    else {
      const neighbors = [i - 1, i + 1, i - w, i + w];
      if (neighbors.some((n) => n >= 0 && n < alpha.length && removed[n]))
        alpha[i] = Math.min(
          alpha[i],
          Math.round(
            Math.max(
              0,
              Math.min(
                1,
                (distance(i) - tolerance) / Math.max(1, 64 - tolerance),
              ),
            ) * 255,
          ),
        );
    }
  warnings.push(
    "Đã tách nền liền màu bằng flood-fill từ viền; vùng trắng chạm nền có thể cần restore brush.",
  );
  return { alpha, warnings, opaque: true };
}
export function components(
  image: Raster,
  mode: "sheet" | "layers",
  tolerance = 24,
  progress?: (n: number) => void,
): Detection {
  const { alpha, opaque, warnings } = foreground(image, tolerance, progress),
    w = image.width,
    h = image.height,
    seen = new Uint8Array(w * h),
    queue = new Int32Array(w * h),
    parts: Component[] = [];
  if (mode === "layers") {
    const pixels: number[] = [];
    let x = w,
      y = h,
      right = 0,
      bottom = 0;
    for (let i = 0; i < alpha.length; i++)
      if (alpha[i] > 0) {
        const px = i % w,
          py = Math.floor(i / w);
        pixels.push(i);
        x = Math.min(x, px);
        y = Math.min(y, py);
        right = Math.max(right, px);
        bottom = Math.max(bottom, py);
      }
    return {
      mask: alpha,
      components: pixels.length
        ? [
            {
              x,
              y,
              width: right - x + 1,
              height: bottom - y + 1,
              area: pixels.length,
              pixels,
            },
          ]
        : [],
      warnings,
      method: opaque ? "solid_background" : "alpha_components",
    };
  }
  for (let i = 0; i < alpha.length; i++)
    if (alpha[i] > 24 && !seen[i]) {
      let start = 0,
        end = 0,
        minX = w,
        minY = h,
        maxX = 0,
        maxY = 0;
      const pixels: number[] = [];
      queue[end++] = i;
      seen[i] = 1;
      while (start < end) {
        const p = queue[start++],
          x = p % w,
          y = Math.floor(p / w);
        pixels.push(p);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy,
              n = ny * w + nx;
            if (
              nx >= 0 &&
              nx < w &&
              ny >= 0 &&
              ny < h &&
              !seen[n] &&
              alpha[n] > 24
            ) {
              seen[n] = 1;
              queue[end++] = n;
            }
          }
      }
      if (pixels.length >= 4) {
        const edge = new Set<number>();
        for (const p of pixels)
          for (const q of [p - 1, p + 1, p - w, p + w])
            if (q >= 0 && q < alpha.length && alpha[q] > 0 && alpha[q] <= 24)
              edge.add(q);
        for (const q of edge) {
          pixels.push(q);
          minX = Math.min(minX, q % w);
          maxX = Math.max(maxX, q % w);
          minY = Math.min(minY, Math.floor(q / w));
          maxY = Math.max(maxY, Math.floor(q / w));
        }
        parts.push({
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          area: pixels.length,
          pixels,
        });
      }
    }
  if (parts.length > 4096)
    throw Error(
      "Quá nhiều mảnh (>128); tăng ngưỡng hoặc chuẩn bị sheet sạch hơn.",
    );
  // Small detached highlights/accessories can belong to a larger anatomical region.
  parts.sort((a, b) => b.area - a.area);
  const grouped: Component[] = [];
  for (const part of parts) {
    const near = grouped
      .filter(
        (g) =>
          part.area < g.area * 0.08 &&
          Math.max(g.x - part.x - part.width, part.x - g.x - g.width, 0) <=
            Math.max(3, w * 0.012) &&
          Math.max(g.y - part.y - part.height, part.y - g.y - g.height, 0) <=
            Math.max(3, h * 0.012),
      )
      .sort(
        (a, b) =>
          Math.hypot(
            a.x + a.width / 2 - part.x - part.width / 2,
            a.y + a.height / 2 - part.y - part.height / 2,
          ) -
          Math.hypot(
            b.x + b.width / 2 - part.x - part.width / 2,
            b.y + b.height / 2 - part.y - part.height / 2,
          ),
      )[0];
    if (near) {
      const right = Math.max(near.x + near.width, part.x + part.width),
        bottom = Math.max(near.y + near.height, part.y + part.height);
      near.x = Math.min(near.x, part.x);
      near.y = Math.min(near.y, part.y);
      near.width = right - near.x;
      near.height = bottom - near.y;
      near.pixels.push(...part.pixels);
      near.area += part.area;
    } else grouped.push(part);
  }

  const minimum = Math.max(6, (grouped[0]?.area ?? 0) * 0.003);
  const retained = grouped.filter((p) => p.area >= minimum);
  if (retained.length > 128)
    throw Error("Quá nhiều vùng ảnh; hãy chọn sheet có ít bộ phận hơn.");
  progress?.(1);
  return {
    mask: alpha,
    components: retained.sort((a, b) => a.y - b.y || a.x - b.x),
    warnings: [
      ...warnings,
      ...(retained.length !== 7
        ? ["Hãy duyệt các ảnh và chọn đủ 7 bộ phận."]
        : []),
    ],
    method: opaque ? "solid_background" : "alpha_components",
  };
}
const aliases: Record<PartSlot, RegExp> = {
  head: /head.?base|dau.?nen|(?:^|[-_ ])head(?:$|[-_ ])|^dau$/,
  hair: /hair|toc/,
  torso: /torso|body|than/,
  left_arm: /left.?arm|tay.?trai|far.?arm/,
  right_arm: /right.?arm|tay.?phai|near.?arm/,
  left_leg: /left.?leg|chan.?trai|far.?leg/,
  right_leg: /right.?leg|chan.?phai|near.?leg/,
};
export function classify(
  c: { bbox: PartCandidate["bbox"]; filename: string },
  sheet: { width: number; height: number },
  ordinal: number,
  count: number,
  neighbors?: PartCandidate["bbox"][],
): {
  label: PartCandidate["label"];
  confidence: number;
  method: PartCandidate["method"];
  warnings: string[];
} {
  const name = c.filename
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");
  for (const slot of primarySlots)
    if (aliases[slot].test(name))
      return {
        label: slot,
        confidence: 0.95,
        method: "filename",
        warnings: ["Nhãn theo tên file; chưa có xác nhận semantic từ model."],
      };
  if (count < 4)
    return {
      label: "unknown",
      confidence: 0.2,
      method: "alpha_components",
      warnings: ["Chưa đủ thông tin để nhận dạng phần ảnh; hãy chọn thủ công."],
    };
  const b = c.bbox,
    aspect = b.width / b.height,
    y = (b.y + b.height / 2) / sheet.height;
  let label: PartCandidate["label"] = "unknown";
  const top = b.y / sheet.height < 0.25;
  if (top && aspect >= 1.28)
    label = b.height < sheet.height * 0.08 ? "unknown" : "hair";
  else if (top && aspect >= 0.55 && aspect < 1.28) label = "head";
  else if (aspect < 0.6) {
    const row = (neighbors ?? [b])
      .filter(
        (n) =>
          n.width / n.height < 0.6 &&
          Math.abs(n.y + n.height / 2 - (b.y + b.height / 2)) <
            Math.max(n.height, b.height) * 0.55,
      )
      .sort((a, b) => a.x - b.x);
    const index = row.findIndex(
      (n) => Math.abs(n.x - b.x) < 2 && Math.abs(n.y - b.y) < 2,
    );
    const left = (index < 0 ? ordinal : index) % 2 === 0;
    if (row.length !== 2)
      return {
        label: "unknown",
        confidence: 0.2,
        method: "alpha_components",
        warnings: [
          "Chưa phân biệt chắc chắn tay/chân; chọn bộ phận trong bước duyệt.",
        ],
      };
    label =
      y > 0.6
        ? left
          ? "left_leg"
          : "right_leg"
        : left
          ? "left_arm"
          : "right_arm";
  } else if (!top && aspect >= 0.6 && aspect < 1.4 && y < 0.65) label = "torso";
  if (
    count < 4 &&
    label !== "unknown" &&
    b.width * b.height < sheet.width * sheet.height * 0.005
  )
    label = "unknown";

  return {
    label,
    confidence: label === "unknown" ? 0.15 : 0.65,
    method: "alpha_components",
    warnings: [
      "Gợi ý hình học/layout có thể sai; hãy duyệt slot và biến thể.",
      "Hướng nhìn chưa được model xác nhận.",
    ],
  };
}
export function recommend(candidates: PartCandidate[]) {
  const selection = Object.fromEntries(
    primarySlots.map((s) => [s, null]),
  ) as Record<PartSlot, string | null>;
  for (const slot of primarySlots) {
    const choices = candidates
      .filter((c) => !c.rejected && c.label === slot && c.confidence >= 0.5)
      .sort(
        (a, b) =>
          b.confidence - a.confidence ||
          a.bbox.y - b.bbox.y ||
          a.bbox.x - b.bbox.x,
      );
    selection[slot] = choices[0]?.id ?? null;
  }
  return selection;
}

/** Keeps original candidates/assets for advanced review, but suppresses noise and duplicate variants. */
export function filterCandidates(candidates: PartCandidate[]) {
  const ranked = [...candidates]
    .filter((c) => !c.rejected)
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height,
    );
  const kept: PartCandidate[] = [],
    counts = new Map<string, number>();
  for (const c of ranked) {
    const duplicate = kept.find(
      (k) =>
        k.appearance &&
        c.appearance &&
        (k.label === c.label ||
          k.label === "unknown" ||
          c.label === "unknown") &&
        Math.abs(
          k.bbox.width / k.bbox.height / (c.bbox.width / c.bbox.height) - 1,
        ) < 0.1 &&
        k.appearance.reduce((sum, v, i) => {
          const q = c.appearance![i];
          return (
            sum +
            Math.abs((v & 15) - (q & 15)) +
            Math.abs(((v >> 4) & 15) - ((q >> 4) & 15)) +
            Math.abs(((v >> 8) & 15) - ((q >> 8) & 15)) +
            Math.abs((v >> 12) - (q >> 12))
          );
        }, 0) /
          (256 * 4) <
          0.45,
    );
    if (duplicate) {
      c.rejected = true;
      c.warnings.push("Ảnh gần trùng đã được đưa vào phần nâng cao.");
      continue;
    }
    if (c.label !== "unknown") {
      const n = counts.get(c.label) ?? 0;
      if (n >= 3) {
        c.label = "unknown";
        c.confidence = Math.min(c.confidence, 0.3);
        c.warnings.push("Có nhiều biến thể; hãy gán thủ công nếu cần.");
      } else counts.set(c.label, n + 1);
    }
    kept.push(c);
  }
  return candidates;
}
