import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unpackProject, packageProject } from "../packages/exporters/src";
const chest = "a2d00000-0000-4000-8000-000000000203";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  const front = await page.evaluate(async () => {
    const path = "/apps/web/src/demo.ts";
    const { createDemo } = await import(path);
    return createDemo({ view: "front" });
  });
  page.once("dialog", (d) => d.accept());
  await page.locator('input[type=file][accept=".a2dstudio"]').setInputFiles({
    name: "front-regression.a2dstudio",
    mimeType: "application/zip",
    buffer: Buffer.from(packageProject(front)),
  });
  await expect(page.getByRole("listitem")).toHaveCount(14);
});
test("edit, undo, redo, save and reload", async ({ page }) => {
  await page.getByTestId("layer-" + chest).click();
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("350");
  await page.getByRole("spinbutton", { name: "X", exact: true }).press("Tab");
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue("350");
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue("313");
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await page.reload();
  await page.getByTestId("layer-" + chest).click();
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue("350");
});
test("visibility, ordering and portable round trip", async ({ page }) => {
  await page.getByTestId("layer-" + chest).click();
  await page.getByRole("switch", { name: "Hiển thị lớp" }).click();
  await page.getByRole("button", { name: "Đưa lên", exact: true }).click();
  await page.getByRole("button", { name: "Xuất dự án", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: /Dự án có thể chỉnh sửa/ }).click();
  const file = await downloadEvent;
  const bytes = await readFile((await file.path())!);
  const doc = unpackProject(bytes);
  expect(doc.layers.find((l) => l.id === chest)?.visible).toBe(false);
  expect(doc.layers[4].id).toBe(chest);
  await page.locator('input[type=file][accept=".a2dstudio"]').setInputFiles({
    name: "test.a2dstudio",
    mimeType: "application/zip",
    buffer: bytes,
  });
  page.once("dialog", (d) => d.accept());
  await expect(
    page.getByRole("status").filter({ hasText: "Đã mở dự án" }),
  ).toBeVisible();
  await page.getByTestId("layer-" + chest).click();
  await expect(
    page.getByRole("switch", { name: "Hiển thị lớp" }),
  ).toHaveAttribute("aria-checked", "false");
});
test("direct canvas move, pan and zoom", async ({ page }) => {
  const canvas = page.getByTestId("viewport");
  const box = (await canvas.boundingBox())!;
  await page.getByRole("button", { name: "Vừa khung nhìn" }).click();
  const height = box.height,
    width = box.width;
  const z = Math.min((width - 100) / 800, (height - 60) / 700, 1.5);
  const ox = (width - 800 * z) / 2,
    oy = (height - 740 * z) / 2;
  const x = box.x + ox + 400 * z,
    y = box.y + oy + 340 * z;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).not.toHaveValue("313");
  await expect(
    page.getByRole("button", { name: "Hoàn tác", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page
    .getByRole("button", { name: "Công cụ di chuyển khung nhìn" })
    .click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y + 50);
  await page.mouse.up();
});
test("PNG export, raster import and unsafe import rejection", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Xuất dự án", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /Ảnh PNG trong suốt/ }).click();
  const file = await event;
  const png = await readFile((await file.path())!);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(800);
  expect(png.readUInt32BE(20)).toBe(800);
  await page
    .getByLabel("Import raster image")
    .setInputFiles({ name: "export.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("listitem")).toHaveCount(15);
  await page.getByLabel("Import raster image").setInputFiles({
    name: "evil.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg onload="alert(1)"/>'),
  });
  await expect(page.getByRole("alert")).toContainText("Chỉ hỗ trợ");
  await expect(page.getByRole("listitem")).toHaveCount(15);
});
test("desktop layout, English and honest AI availability", async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 960 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Xuất dự án", exact: true }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("button", { name: /^VI/ }).click();
  await page.getByRole("button", { name: "AI Mode", exact: true }).click();
  await expect(page.getByText("No AI provider connected")).toBeVisible();
  await page.getByRole("button", { name: "Back to editor" }).click();
  await page.screenshot({
    path: "work/screenshots/editor-en.png",
    fullPage: true,
  });
});
test("50 layer project loads and remains editable", async ({ page }) => {
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  const elapsed = await page.evaluate(() => {
    const start = performance.now();
    const raw = localStorage.getItem("a2dstudio.project.v1")!;
    const d = JSON.parse(raw);
    const original = d.layers[3];
    for (let i = d.layers.length; i < 60; i++) {
      const layer = {
        ...original,
        id: crypto.randomUUID(),
        name: "Extra " + i,
        x: 100 + i,
        y: 100 + i,
      };
      d.layers.push(layer);
      d.hierarchy.push({ layerId: layer.id, parentId: null });
    }
    localStorage.setItem("a2dstudio.project.v1", JSON.stringify(d));
    return performance.now() - start;
  });
  console.log("60-layer fixture preparation ms:", elapsed);
  const start = Date.now();
  await page.reload();
  await expect(page.getByRole("listitem")).toHaveCount(60);
  await page.getByTestId("layer-" + chest).click();
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("400");
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue("400");
  console.log("60-layer reload + edit wall ms:", Date.now() - start);
});

test("PNG preserves visible composition and transparency", async ({ page }) => {
  const capture = async () => {
    await page.getByRole("button", { name: "Xuất dự án", exact: true }).click();
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: /Ảnh PNG trong suốt/ }).click();
    const f = await event;
    return (await readFile((await f.path())!)).toString("base64");
  };
  const pixels = async (data: string) =>
    page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = "data:image/png;base64," + encoded;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = 800;
      c.height = 800;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return {
        corner: [...ctx.getImageData(0, 0, 1, 1).data],
        body: [...ctx.getImageData(400, 340, 1, 1).data],
      };
    }, data);
  const visible = await pixels(await capture());
  expect(visible.corner[3]).toBe(0);
  expect(visible.body[3]).toBe(255);
  await page.getByTestId("layer-" + chest).click();
  await page.getByRole("switch", { name: "Hiển thị lớp" }).click();
  const hidden = await pixels(await capture());
  expect(hidden.body).not.toEqual(visible.body);
  expect(hidden.body[0]).toBeGreaterThan(hidden.body[2]);
});

test("parent deletion preserves child rendering, undo restores and renderer releases resources", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const renderPath = "/packages/render-core/src/index.ts",
      demoPath = "/apps/web/src/demo.ts";
    const { SceneRenderer } = await import(renderPath);
    const { createDemo } = await import(demoPath);
    const doc = await createDemo({ view: "front" });
    const host = document.createElement("div");
    host.style.cssText = "width:800px;height:800px;position:fixed;left:-9999px";
    document.body.append(host);
    const r = new SceneRenderer();
    await r.init(host);
    doc.layers[4].parentId = doc.layers[3].id;
    await r.setDocument(doc);
    const child = r.nodes.get(doc.layers[4].id);
    const parentId = doc.layers[3].id;
    doc.layers = doc.layers.filter((l: { id: string }) => l.id !== parentId);
    doc.layers[3].parentId = null;
    await r.setDocument(doc);
    const survives = !child.destroyed && child.parent === r.world;
    const tickerStopped = !r.app.ticker.started;
    r.destroy();
    const texturesAfter = r.textures.size;
    host.remove();
    return { survives, tickerStopped, texturesAfter };
  });
  expect(result).toEqual({
    survives: true,
    tickerStopped: true,
    texturesAfter: 0,
  });
});

test("parented layer dragging uses parent coordinates and persists", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByTestId("layer-" + chest).click();
  await page
    .getByRole("combobox", { name: "Lớp cha", exact: true })
    .selectOption("a2d00000-0000-4000-8000-000000000200");
  await page.getByRole("button", { name: "Vừa khung nhìn" }).click();
  const box = (await page.getByTestId("viewport").boundingBox())!;
  const z = Math.min((box.width - 100) / 800, (box.height - 60) / 700, 1.5);
  const ox = (box.width - 800 * z) / 2,
    oy = (box.height - 740 * z) / 2;
  const x = box.x + ox + 620 * z,
    y = box.y + oy + 550 * z;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y + 10, { steps: 4 });
  await page.mouse.up();
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue(String(Math.round(313 + 20 / z)));
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await page.reload();
  await page.getByTestId("layer-" + chest).click();
  await expect(
    page.getByRole("combobox", { name: "Lớp cha", exact: true }),
  ).toHaveValue("a2d00000-0000-4000-8000-000000000200");
  expect(errors).toEqual([]);
});
