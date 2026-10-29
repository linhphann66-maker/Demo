import { test, expect, type Page, type Locator } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
const parts = [
  "head_base",
  "hair",
  "torso",
  "left_arm",
  "right_arm",
  "left_leg",
  "right_leg",
];
const slots = [
  "head",
  "hair",
  "torso",
  "left_arm",
  "right_arm",
  "left_leg",
  "right_leg",
];
async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Tự động tạo nhân vật", exact: true })
    .click();
  return page.getByRole("dialog", {
    name: "Tự động tạo nhân vật",
    exact: true,
  });
}
async function detect(w: Locator, files: string[], mode = "layers") {
  await w.getByLabel("Builder import mode").selectOption(mode);
  await w.getByLabel("Builder images").setInputFiles(files);
  await w
    .getByRole("button", { name: "Tự động tạo nhân vật", exact: true })
    .click();
  await expect(
    w.getByRole("heading", { name: "3. Duyệt 7 phần nhân vật", exact: true }),
  ).toBeVisible({ timeout: 60000 });
}
async function complete(w: Locator) {
  await w.getByRole("button", { name: "4. Lắp ráp", exact: true }).click();
  await w.getByRole("button", { name: "Tạo bộ xương", exact: true }).click();
  await w
    .getByRole("button", { name: "Tạo mesh & kiểm tra", exact: true })
    .click();
  await expect(w.getByText(/Bản nháp đã có rig/)).toBeVisible({
    timeout: 60000,
  });
  await w
    .getByRole("button", { name: "Duyệt & hoàn tất", exact: true })
    .click();
  await w.getByLabel("Confirm right-facing parts").check();
  await w.getByLabel("Approve assembled character").check();
  await w
    .getByRole("button", {
      name: "Lưu & mở trong Animation / VFX Studio",
      exact: true,
    })
    .click();
  await expect(w).not.toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
  );
}

test("seven-part sheet uses visible anchored assembly, creates editable rig and survives save/reload with animation and VFX", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const w = await open(page);
  await detect(w, ["tests/fixtures/builder-adventurer.png"], "sheet");
  await expect(w.locator(".builder-slot-cards article")).toHaveCount(7);
  await expect(
    w.getByRole("region", { name: "Assembly readiness" }),
  ).toContainText("7/7");
  await expect(w.getByLabel("Slot face", { exact: true })).toHaveCount(0);
  expect(await w.innerText()).not.toMatch(
    /alpha_components|fragment|near \/ far/,
  );
  for (const slot of slots)
    expect(
      await w.getByLabel("Slot " + slot, { exact: true }).inputValue(),
    ).not.toBe("");
  await page.screenshot({
    path: "work/builder-seven/review-seven.png",
    fullPage: true,
  });
  await w.getByRole("button", { name: "Lắp thử", exact: true }).click();
  await expect(w.getByTestId("builder-assembly-summary")).toContainText(
    "7 layer",
  );
  await expect(w.getByLabel("Ground line and center guide")).toBeVisible();
  await w.screenshot({ path: "work/builder-seven/assembled-seven.png" });
  await complete(w);
  const d = await stored(page);
  expect(d.characterBuild.version).toBe(2);
  expect(Object.keys(d.characterBuild.selection)).toEqual(slots);
  expect(d.characterBuild.layerMappings).toHaveLength(7);
  expect(d.bones).toHaveLength(22);
  expect(
    d.bones.some(
      (b: { name: string }) =>
        b.name === "Cape Base" || b.name === "Weapon Socket",
    ),
  ).toBe(false);
  expect(d.meshes).toHaveLength(5);
  expect(d.animationClips.map((c: { name: string }) => c.name)).toEqual([
    "Idle",
    "Walk",
    "Run",
    "Attack",
    "Hurt",
  ]);
  expect(d.characterBuild.assembly.normalized).toBe(true);
  const contacts = await page.evaluate(async () => {
    const path = "/packages/document-core/src/index.ts";
    const { worldMatrix } = await import(path);
    const doc = JSON.parse(localStorage.getItem("a2dstudio.project.v1")!);
    const contacts: number[] = [];
    for (const slot of ["left_leg", "right_leg"]) {
      const map = doc.characterBuild.layerMappings.find(
          (m: { slot: string }) => m.slot === slot,
        ),
        layer = doc.layers.find((l: { id: string }) => l.id === map.layerId),
        asset = doc.assetReferences.find(
          (a: { id: string }) => a.id === layer.assetId,
        ),
        img = new Image();
      img.src = asset.data;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        m = worldMatrix(doc, layer);
      let bottom = -Infinity;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++)
          if (pixels[(y * canvas.width + x) * 4 + 3] > 128)
            bottom = Math.max(bottom, m.b * (x + 0.5) + m.d * (y + 1) + m.ty);
      contacts.push(bottom);
    }
    return contacts;
  });
  for (const y of contacts) expect(Math.abs(y - 650)).toBeLessThan(3);

  await writeFile("work/phase5ab-real-project.json", JSON.stringify(d));
  await writeFile(
    "work/builder-seven/assembled-project.json",
    JSON.stringify(d),
  );
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  expect((await stored(page)).characterBuild).toEqual(d.characterBuild);
  await page.getByRole("button", { name: "Hoạt ảnh", exact: false }).click();
  await page
    .getByRole("button", { name: "Select animation Walk", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause animation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.getByRole("button", { name: /VFX.*PARTICLES/ }).click();
  await page.getByRole("button", { name: "Magic Aura", exact: true }).click();
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  const withVFX = await stored(page);
  expect(
    withVFX.bones.some(
      (b: { id: string }) =>
        b.id === withVFX.vfxGraphs[0].nodes[0].attachment.boneId,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("normalization restores original scale, repairs uneven limbs and persists advanced anchors and optional accessories", async ({
  page,
}) => {
  test.setTimeout(120000);
  const w = await open(page);
  await detect(w, [
    ...parts.map(
      (n) =>
        "tests/fixtures/builder-" +
        n +
        (n === "right_arm" ? "-large" : "") +
        ".png",
    ),
    "tests/fixtures/builder-cloak.png",
    "tests/fixtures/builder-sword.png",
  ]);
  await w
    .getByRole("button", { name: "Chuẩn hóa kích cỡ", exact: true })
    .click();
  await w.getByLabel("Assembly layer").selectOption({ label: "Tay phải" });
  const normalized = Number(
    await w.getByLabel("Assembly scaleX", { exact: true }).inputValue(),
  );
  await w.getByRole("button", { name: "3. Duyệt 7 phần", exact: true }).click();
  await w
    .getByRole("button", { name: "Khôi phục scale gốc", exact: true })
    .click();
  await w.getByLabel("Assembly layer").selectOption({ label: "Tay phải" });
  await expect(w.getByLabel("Assembly scaleX", { exact: true })).toHaveValue(
    "1",
  );
  expect(normalized).not.toBe(1);
  await w.getByRole("button", { name: "3. Duyệt 7 phần", exact: true }).click();
  await w
    .getByRole("button", { name: "Chuẩn hóa kích cỡ", exact: true })
    .click();
  await w
    .getByRole("button", { name: "Chuyển sang chế độ nâng cao", exact: true })
    .click();
  await w.getByRole("button", { name: "3. Duyệt 7 phần", exact: true }).click();
  await w.getByAltText("Candidate torso", { exact: true }).click();
  await w.getByLabel("Anchor neck_anchor x", { exact: true }).fill("0.6");
  await expect(
    w.getByLabel("Anchor neck_anchor x", { exact: true }),
  ).toHaveValue("0.6");
  await complete(w);
  const d = await stored(page);
  expect(d.bones).toHaveLength(25);
  expect(
    d.characterBuild.optionalAttachments.map((a: { kind: string }) => a.kind),
  ).toEqual(["cloak", "sword"]);
  const torso = d.characterBuild.candidates.find(
    (c: { label: string }) => c.label === "torso",
  );
  expect(
    d.characterBuild.assembly.anchors.find(
      (a: { candidateId: string }) => a.candidateId === torso.id,
    ).points.neck_anchor.x,
  ).toBe(0.6);
  const cloak = d.characterBuild.optionalAttachments.find(
    (a: { kind: string }) => a.kind === "cloak",
  );
  expect(
    d.meshes.some((m: { layerId: string }) => m.layerId === cloak.layerId),
  ).toBe(true);
  await page.getByRole("button", { name: /VFX.*PARTICLES/ }).click();
  await page.getByRole("button", { name: "Sword Fire", exact: true }).click();
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  const saved = await stored(page);
  const socket = saved.bones.find(
    (b: { name: string }) => b.name === "Weapon Socket",
  );
  expect(saved.vfxGraphs[0].nodes[0].attachment.boneId).toBe(socket.id);
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  expect((await stored(page)).characterBuild).toEqual(saved.characterBuild);
});

test("mobile review exposes exactly seven simple cards, missing-slot focus, mask corrections and undo", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const w = await open(page);
  await detect(
    w,
    parts.map((n) => "tests/fixtures/builder-" + n + ".png"),
  );
  const readiness = w.getByRole("region", { name: "Assembly readiness" });
  const hair = w.getByLabel("Slot hair", { exact: true }),
    id = await hair.inputValue();
  await w
    .locator(".builder-slot-cards article")
    .nth(1)
    .getByRole("button", { name: "Bỏ chọn", exact: true })
    .click();
  await expect(readiness).toContainText("6/7");
  await expect(readiness).toContainText("Tóc");
  await expect(
    w.getByRole("button", { name: "5. Rig", exact: true }),
  ).toBeDisabled();
  await w.getByRole("button", { name: "4. Lắp ráp", exact: true }).click();
  await expect(w.getByTestId("builder-assembly-summary")).toContainText(
    "6 layer",
  );
  await readiness.getByRole("button", { name: "Tóc", exact: true }).click();
  await expect(hair).toBeFocused();
  await hair.selectOption(id);
  await expect(readiness).toContainText("7/7");
  await w
    .getByRole("button", { name: "Sửa mask", exact: true })
    .first()
    .click();
  const canvas = w.getByLabel("Candidate alpha mask");
  await expect(canvas).toBeInViewport();
  const alpha = () =>
    canvas.evaluate((c) => {
      const image = c as HTMLCanvasElement;
      return image
        .getContext("2d")!
        .getImageData(
          Math.floor(image.width / 2),
          Math.floor(image.height / 2),
          1,
          1,
        ).data[3];
    });
  await expect.poll(alpha).toBeGreaterThan(200);
  const before = await alpha();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(w.getByText(/Mask đã cập nhật/)).toBeVisible();
  await expect.poll(alpha).toBe(0);
  await w.getByRole("button", { name: "Undo Builder", exact: true }).click();
  await expect.poll(alpha).toBe(before);
  await w.getByRole("button", { name: "Đóng sửa mask", exact: true }).click();
  const bounds = (await w.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await w.screenshot({ path: "work/builder-seven/mobile-seven.png" });
});

test("duplicate candidate suppression preserves originals and opaque sheet preserves enclosed white artwork", async ({
  page,
}) => {
  test.setTimeout(120000);
  const w = await open(page);
  await detect(w, [
    ...parts.map((n) => "tests/fixtures/builder-" + n + ".png"),
    "tests/fixtures/builder-head_base.png",
  ]);
  await expect(
    w.getByLabel("Slot head", { exact: true }).locator(":scope > option"),
  ).toHaveCount(2);
  await complete(w);
  let d = await stored(page);
  expect(d.characterBuild.sourceAssetIds).toHaveLength(8);
  expect(
    d.characterBuild.candidates.filter(
      (c: { rejected: boolean }) => c.rejected,
    ),
  ).toHaveLength(1);
  await page
    .getByRole("button", { name: "Tự động tạo nhân vật", exact: true })
    .click();
  const second = page.getByRole("dialog", {
    name: "Tự động tạo nhân vật",
    exact: true,
  });
  await detect(
    second,
    ["tests/fixtures/builder-adventurer-white.png"],
    "sheet",
  );
  await complete(second);
  d = await stored(page);
  const stats = await page.evaluate(async () => {
    const d = JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
      c = d.characterBuild.candidates.find(
        (c: { label: string }) => c.label === "torso",
      ),
      a = d.assetReferences.find(
        (a: { id: string }) => a.id === c.previewAssetId,
      ),
      img = new Image();
    img.src = a.data;
    await img.decode();
    const out = document.createElement("canvas");
    out.width = img.width;
    out.height = img.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, out.width, out.height).data;
    let white = 0,
      clear = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (
        pixels[i] > 245 &&
        pixels[i + 1] > 245 &&
        pixels[i + 2] > 245 &&
        pixels[i + 3] > 240
      )
        white++;
      if (!pixels[i + 3]) clear++;
    }
    return { white, clear };
  });
  expect(stats.white).toBeGreaterThan(1500);
  expect(stats.clear).toBeGreaterThan(100);
  expect(d.characterBuild.layerMappings).toHaveLength(7);
});

test("complete-image mode reports unavailable provider without replacing the existing document", async ({
  page,
}) => {
  const w = await open(page);
  await w.getByLabel("Builder import mode").selectOption("complete");
  await w
    .getByLabel("Builder images")
    .setInputFiles("tests/fixtures/builder-adventurer.png");
  await w
    .getByRole("button", { name: "Tự động tạo nhân vật", exact: true })
    .click();
  await expect(w.getByRole("alert")).toContainText(/provider|API/i);
  await expect(w.getByLabel("Complete-image provider consent")).toBeDisabled();
  await w.getByLabel("Builder import mode").selectOption("sheet");
  await w.getByLabel("Builder images").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(w.getByRole("alert")).toBeVisible();
});

test("ambiguous unnamed PNGs stay in a separate review queue and require explicit seven-part assignment", async ({
  page,
}) => {
  test.setTimeout(120000);
  const w = await open(page);
  await w.getByLabel("Builder import mode").selectOption("layers");
  const files = await Promise.all(
    parts.map(async (n, i) => ({
      name: "image_" + i + ".png",
      mimeType: "image/png",
      buffer: await readFile("tests/fixtures/builder-" + n + ".png"),
    })),
  );
  await w.getByLabel("Builder images").setInputFiles(files);
  await w
    .getByRole("button", { name: "Tự động tạo nhân vật", exact: true })
    .click();
  await expect(
    w.getByRole("region", { name: "Assembly readiness" }),
  ).toContainText("0/7", { timeout: 30000 });
  await expect(
    w.getByRole("button", { name: "4. Lắp ráp", exact: true }),
  ).toBeDisabled();
  for (const slot of slots)
    await expect(w.getByLabel("Slot " + slot, { exact: true })).toHaveValue("");
  await w.locator(".builder-review-queue summary").click();
  for (const slot of slots)
    await w
      .locator('select[aria-label^="Assign unclassified "]')
      .first()
      .selectOption(slot);
  await expect(
    w.getByRole("region", { name: "Assembly readiness" }),
  ).toContainText("7/7");
  await expect(
    w.locator('select[aria-label^="Assign unclassified "]'),
  ).toHaveCount(0);
  await complete(w);
  const d = await stored(page);
  expect(
    d.characterBuild.candidates.every(
      (c: { method: string }) => c.method === "manual",
    ),
  ).toBe(true);
  expect(d.characterBuild.layerMappings).toHaveLength(7);
});
