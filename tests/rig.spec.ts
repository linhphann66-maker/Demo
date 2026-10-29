import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { type ProjectDocument } from "../packages/document-core/src";
import { boneMatrices, skinVertices } from "../packages/rig-core/src";
import { packageProject, unpackProject } from "../packages/exporters/src";
import { zipSync, strToU8 } from "fflate";
const cape = "a2d00000-0000-4000-8000-000000000200",
  sword = "a2d00000-0000-4000-8000-000000000211";
async function documentOf(page: Page): Promise<ProjectDocument> {
  // Read the public saved document, avoiding HMR-dependent module instances.
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
  );
}

async function openUnriggedFixture(page: Page) {
  const d = await page.evaluate(async () => {
    const path = "/apps/web/src/demo.ts";
    const { createDemo } = await import(path);
    return createDemo({ rigged: false });
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('input[type=file][accept=".a2dstudio"]').setInputFiles({
    name: "legacy-unrigged.a2dstudio",
    mimeType: "application/zip",
    buffer: Buffer.from(packageProject(d)),
  });
  await expect.poll(async () => (await documentOf(page)).bones.length).toBe(0);
  await page.getByTestId("layer-a2d00000-0000-4000-8000-000000000203").click();
}

async function rig(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await openUnriggedFixture(page);
  await page.getByRole("button", { name: "Auto Rig", exact: true }).click();
  await expect.poll(async () => (await documentOf(page)).bones.length).toBe(23);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Bộ xương", exact: false }).click();
  await expect(page.locator(".bone-row")).toHaveCount(23);
}
async function screenPoint(page: Page, x: number, y: number) {
  await page.getByRole("button", { name: "Vừa khung nhìn" }).click();
  const b = (await page.getByTestId("viewport").boundingBox())!;
  const zoom = Math.min((b.width - 100) / 800, (b.height - 60) / 700, 1.5);
  return {
    x: b.x + (b.width - 800 * zoom) / 2 + x * zoom,
    y: b.y + (b.height - 740 * zoom) / 2 + y * zoom,
    zoom,
  };
}
async function exportPNG(page: Page) {
  await page.getByRole("button", { name: "Xuất dự án", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /Ảnh PNG trong suốt/ }).click();
  return readFile((await (await event).path())!);
}
async function chooseLayer(
  page: Page,
  id: string,
  tool: "select" | "mesh" | "weight" = "select",
) {
  await page.getByRole("button", { name: "Lớp", exact: true }).click();
  await page.getByRole("button", { name: "Công cụ chọn", exact: true }).click();
  await page.getByTestId("layer-" + id).click();
  if (tool !== "select")
    await page
      .getByRole("button", {
        name: tool === "mesh" ? "Mesh Tool" : "Weight Tool",
        exact: true,
      })
      .click();
}
test("procedural rig, visible FK deformation, inheritance, reset and history", async ({
  page,
}) => {
  await rig(page);
  const original = await documentOf(page);
  expect(original.meshes).toHaveLength(5);
  expect(original.ikTargets).toHaveLength(4);
  expect(original.attachments).toHaveLength(14);
  const before = await exportPNG(page);
  await page.getByRole("button", { name: "Pose Mode", exact: true }).click();
  await page.getByTestId("bone-Left Upper Arm").click();
  await page
    .getByRole("spinbutton", { name: "Bone rotation", exact: true })
    .fill("35");
  const posed = await documentOf(page);
  const arm = posed.bones.find((b) => b.name === "Left Upper Arm")!;
  expect(arm.pose.rotation).toBe(35);
  const beforeHand = boneMatrices(original).get(
      original.bones.find((b) => b.name === "Left Hand")!.id,
    )!,
    afterHand = boneMatrices(posed).get(
      posed.bones.find((b) => b.name === "Left Hand")!.id,
    )!;
  expect(
    Math.hypot(afterHand.tx - beforeHand.tx, afterHand.ty - beforeHand.ty),
  ).toBeGreaterThan(50);
  const after = await exportPNG(page);
  expect(after.equals(before)).toBe(false);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  expect(
    (await documentOf(page)).bones.find((b) => b.name === "Left Upper Arm")!
      .pose.rotation,
  ).toBe(0);
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  await page.getByRole("button", { name: "Reset Pose", exact: true }).click();
  expect((await exportPNG(page)).equals(before)).toBe(true);
});
test("IK hand and foot handles solve real two-bone chains", async ({
  page,
}) => {
  await rig(page);
  await page.getByRole("button", { name: "Pose Mode", exact: true }).click();
  for (const name of ["Right Hand", "Left Foot"]) {
    const d = await documentOf(page),
      bone = d.bones.find((b) => b.name === name)!,
      m = boneMatrices(d).get(bone.id)!;
    const start = await screenPoint(page, m.tx, m.ty);
    const dx = name === "Right Hand" ? 35 : -20,
      dy = name === "Right Hand" ? -45 : -25;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(
      start.x + dx * start.zoom,
      start.y + dy * start.zoom,
      { steps: 6 },
    );
    await page.mouse.up();
    const next = await documentOf(page),
      target = next.ikTargets.find((t) => t.endBoneId === bone.id)!;
    expect(target.enabled).toBe(true);
    const actual = boneMatrices(next).get(bone.id)!;
    expect(Math.hypot(actual.tx - target.x, actual.ty - target.y)).toBeLessThan(
      0.05,
    );
    expect(
      next.bones.find((b) => b.id === target.rootBoneId)!.pose.rotation,
    ).not.toBe(0);
  }
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("rest joint drag edits bind landmarks with no artwork drift", async ({
  page,
}) => {
  await rig(page);
  await page.getByTestId("bone-Head").click();
  const doc = await documentOf(page),
    b = doc.bones.find((b) => b.name === "Head")!,
    m = boneMatrices(doc).get(b.id)!;
  const before = await exportPNG(page),
    start = await screenPoint(page, m.tx, m.ty);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 9, start.y + 4, { steps: 4 });
  await page.mouse.up();
  const changed = await documentOf(page);
  expect(changed.bones.find((x) => x.id === b.id)!.rest).not.toEqual(b.rest);
  expect((await exportPNG(page)).equals(before)).toBe(true);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  expect(
    (await documentOf(page)).bones.find((x) => x.id === b.id)!.rest,
  ).toEqual(b.rest);
});
test("cape vertex dragging, normalized manual weights, topology and reset", async ({
  page,
}) => {
  await rig(page);
  await chooseLayer(page, cape, "mesh");
  const doc = await documentOf(page),
    mesh = doc.meshes.find((m) => m.layerId === cape)!;
  const vertex = [...mesh.vertices].sort(
    (a, b) =>
      Math.hypot(a.u - 0.15, a.v - 0.75) - Math.hypot(b.u - 0.15, b.v - 0.75),
  )[0];
  await page
    .getByRole("combobox", { name: "Mesh vertex", exact: true })
    .selectOption(vertex.id);
  const point = skinVertices(doc, mesh)[
      mesh.vertices.findIndex((v) => v.id === vertex.id)
    ],
    start = await screenPoint(page, point.x, point.y);
  const pngBefore = await exportPNG(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 4 * start.zoom, start.y, { steps: 4 });
  await page.mouse.up();
  const changed = await documentOf(page);
  expect(
    changed.meshes
      .find((m) => m.id === mesh.id)!
      .vertices.find((v) => v.id === vertex.id)!.x,
  ).toBeCloseTo(vertex.x + 4, 2);
  expect((await exportPNG(page)).equals(pngBefore)).toBe(false);
  await page.getByRole("button", { name: "Weight Tool", exact: true }).click();
  const chest = doc.bones.find((b) => b.name === "Chest")!;
  await page
    .getByRole("combobox", { name: "Weight bone", exact: true })
    .selectOption(chest.id);
  await page
    .getByRole("spinbutton", { name: "Bone weight", exact: true })
    .fill(".25");
  let current = await documentOf(page);
  const w = current.vertexWeights.find(
    (w) => w.meshId === mesh.id && w.vertexId === vertex.id,
  )!;
  expect(w.influences.find((i) => i.boneId === chest.id)!.weight).toBe(0.25);
  expect(w.influences.reduce((s, i) => s + i.weight, 0)).toBeCloseTo(1);
  await page.getByRole("button", { name: "Add vertex", exact: true }).click();
  current = await documentOf(page);
  const newMesh = current.meshes.find((m) => m.id === mesh.id)!;
  expect(newMesh.vertices).toHaveLength(mesh.vertices.length + 1);
  const added = newMesh.vertices.find(
    (v) => !mesh.vertices.some((old) => old.id === v.id),
  )!;
  await page
    .getByRole("combobox", { name: "Mesh vertex", exact: true })
    .selectOption(added.id);
  await page
    .getByRole("button", { name: "Delete vertex", exact: true })
    .click();
  expect(
    (await documentOf(page)).meshes.find((m) => m.id === mesh.id)!.vertices,
  ).toHaveLength(mesh.vertices.length);
  await page.getByRole("button", { name: "Đặt lại mesh", exact: true }).click();
  expect(
    (await documentOf(page)).meshes
      .find((m) => m.id === mesh.id)!
      .vertices.find((v) => v.id === vertex.id)!.x,
  ).toBeCloseTo(vertex.x);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("weapon replacement keeps rig, socket and unrelated meshes", async ({
  page,
}) => {
  await rig(page);
  await chooseLayer(page, sword);
  const before = await documentOf(page);
  const asset = before.assetReferences.find(
    (a) => a.id === before.layers.find((l) => l.id === sword)!.assetId,
  )!;
  await page.getByLabel("Replace layer image").setInputFiles({
    name: "new-weapon.png",
    mimeType: "image/png",
    buffer: Buffer.from(asset.data.split(",")[1], "base64"),
  });
  await expect
    .poll(async () => (await documentOf(page)).assetReferences.length)
    .toBe(15);
  const after = await documentOf(page);
  expect(after.bones).toEqual(before.bones);
  expect(after.meshes).toEqual(before.meshes);
  expect(after.vertexWeights).toEqual(before.vertexWeights);
  expect(after.attachments).toEqual(before.attachments);
  expect(after.layers.find((l) => l.id === sword)!.assetId).not.toBe(asset.id);
  await page.getByRole("button", { name: "Pose Mode", exact: true }).click();
  await page.getByRole("button", { name: "Bộ xương", exact: false }).click();
  await page.getByTestId("bone-Right Forearm").click();
  await page
    .getByRole("spinbutton", { name: "Bone rotation", exact: true })
    .fill("20");
  expect(
    (await documentOf(page)).bones.find((b) => b.name === "Right Forearm")!.pose
      .rotation,
  ).toBe(20);
});
test("rig, pose, meshes and weights survive save, reload and portable import", async ({
  page,
}) => {
  await rig(page);
  await page.getByRole("button", { name: "Pose Mode", exact: true }).click();
  await page.getByTestId("bone-Cape").click();
  await page
    .getByRole("spinbutton", { name: "Bone rotation", exact: true })
    .fill("8");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  const before = await documentOf(page);
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible();
  expect(await documentOf(page)).toEqual(before);
  await page.getByRole("button", { name: "Xuất dự án", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /Dự án có thể chỉnh sửa/ }).click();
  const bytes = await readFile((await (await event).path())!);
  expect(unpackProject(bytes)).toEqual(before);
  await page.locator('input[type=file][accept=".a2dstudio"]').setInputFiles({
    name: "rig.a2dstudio",
    mimeType: "application/zip",
    buffer: bytes,
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Đã mở dự án" }),
  ).toBeVisible();
  expect(await documentOf(page)).toEqual(before);
  await page.getByRole("button", { name: "Hiện/ẩn xương" }).click();
  await chooseLayer(page, cape, "mesh");
  await page.screenshot({
    path: "work/screenshots/phase2-cape.png",
    fullPage: true,
  });
});
test("invalid mesh import is rejected without replacing editable rig", async ({
  page,
}) => {
  await rig(page);
  const before = await documentOf(page);
  const invalid = structuredClone(before);
  invalid.meshes[0].triangles[0] = 999999;
  const archive = zipSync({ "project.json": strToU8(JSON.stringify(invalid)) });
  await page.locator('input[type=file][accept=".a2dstudio"]').setInputFiles({
    name: "broken.a2dstudio",
    mimeType: "application/zip",
    buffer: Buffer.from(archive),
  });
  await expect(page.getByRole("alert")).toContainText("Triangle index");
  expect(await documentOf(page)).toEqual(before);
});
test("manual bone CRUD and parent change have undo/redo", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await openUnriggedFixture(page);
  await page.getByRole("button", { name: "Bộ xương", exact: false }).click();
  await page
    .locator(".skeleton-actions")
    .getByRole("button", { name: "Thêm xương", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Bone name", exact: true })
    .fill("Custom Root");
  await page.getByRole("button", { name: "Xương con", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Bone name", exact: true })
    .fill("Custom Child");
  let d = await documentOf(page);
  expect(d.bones).toHaveLength(2);
  expect(d.bones[1].parentId).toBe(d.bones[0].id);
  await page
    .getByRole("combobox", { name: "Bone parent", exact: true })
    .selectOption("");
  expect((await documentOf(page)).bones[1].parentId).toBeNull();
  await page
    .getByRole("combobox", { name: "Bone parent", exact: true })
    .selectOption(d.bones[0].id);
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  expect((await documentOf(page)).bones).toHaveLength(1);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  expect((await documentOf(page)).bones).toHaveLength(2);
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  d = await documentOf(page);
  expect(d.bones).toHaveLength(1);
});

test("manual alpha mesh generation is editable and undoable without a rig", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await openUnriggedFixture(page);
  await page.getByRole("button", { name: "Mesh Tool", exact: true }).click();
  await page
    .getByRole("button", { name: "Tạo mesh từ alpha", exact: true })
    .click();
  await expect.poll(async () => (await documentOf(page)).meshes.length).toBe(1);
  const d = await documentOf(page);
  expect(d.bones).toHaveLength(0);
  expect(d.meshes[0].triangles.length).toBeGreaterThan(3);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  expect((await documentOf(page)).meshes).toHaveLength(0);
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  expect((await documentOf(page)).meshes[0]).toEqual(d.meshes[0]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("skinned renderer releases owned vertex/index buffers and stays idle", async ({
  page,
}) => {
  await rig(page);
  await documentOf(page);
  const result = await page.evaluate(async () => {
    const path = "/packages/render-core/src/index.ts";
    const { SceneRenderer } = await import(path);
    const doc = JSON.parse(localStorage.getItem("a2dstudio.project.v1")!);
    const host = document.createElement("div");
    host.style.cssText = "width:800px;height:800px;position:fixed;left:-9999px";
    document.body.append(host);
    const r = new SceneRenderer();
    await r.init(host);
    await r.setDocument(doc);
    const nodes = [...r.nodes.values()] as Array<{
      children: Array<{
        geometry?: { buffers: Array<{ destroyed: boolean }> };
      }>;
    }>;
    const buffers = nodes.flatMap((n) => n.children[0].geometry?.buffers ?? []);
    const stopped = !r.app.ticker.started;
    const count = buffers.length;
    r.destroy();
    host.remove();
    return {
      count,
      stopped,
      buffersDestroyed: buffers.every((b) => b.destroyed),
      textures: r.textures.size,
    };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.stopped).toBe(true);
  expect(result.buffersDestroyed).toBe(true);
  expect(result.textures).toBe(0);
});
