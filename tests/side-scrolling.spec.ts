import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import type { ProjectDocument } from "../packages/document-core/src";
const panel = async (p: Page) =>
  p.getByRole("button", { name: "Character Direction and Joints" }).click();
async function saved(p: Page): Promise<ProjectDocument> {
  await p.getByRole("button", { name: "Lưu", exact: true }).click();
  return p.evaluate(() =>
    JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
  );
}
async function open(p: Page) {
  await p.goto("/");
  await expect(p.locator("canvas")).toBeVisible({ timeout: 45000 });
}
async function clip(p: Page, name: string) {
  await p.getByRole("button", { name: "Hoạt ảnh", exact: false }).click();
  await p
    .getByRole("button", { name: "Select animation " + name, exact: true })
    .click();
}
test("side 3/4 artwork, near/far rig, intact front reference and direction persistence", async ({
  page,
}) => {
  await open(page);
  const d = await saved(page);
  await writeFile("work/side-real-project.json", JSON.stringify(d));
  expect(d.characterSettings).toMatchObject({
    characterView: "side_3_4",
    defaultFacing: "right",
    facing: "right",
    movementMode: "horizontal",
    mirrorForOppositeDirection: true,
    enableVerticalFacing: false,
  });
  expect(d.characterVariants).toHaveLength(2);
  expect(d.bones.some((b) => b.name === "Near Forearm")).toBe(true);
  expect(d.bones.some((b) => b.name === "Far Shin")).toBe(true);
  expect(d.assetReferences.every((a) => a.provenance === "procedural")).toBe(
    true,
  );
  await panel(page);
  await page.getByRole("button", { name: "Face Left", exact: true }).click();
  await page.getByRole("spinbutton", { name: "World position X" }).fill("25");
  const left = await saved(page);
  expect(left.bones).toEqual(d.bones);
  expect(left.meshes).toEqual(d.meshes);
  expect(left.keyframeTracks).toEqual(d.keyframeTracks);
  await page.screenshot({
    path: "work/screenshots/side-left.png",
    fullPage: true,
  });
  await page.reload();
  await panel(page);
  await expect(
    page.getByRole("button", { name: "Face Left", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("spinbutton", { name: "World position X" }),
  ).toHaveValue("25");
  await page.getByRole("button", { name: "Face Right", exact: true }).click();
  await page.getByRole("spinbutton", { name: "World position X" }).fill("0");
  await page.getByRole("button", { name: "Front reference view" }).click();
  await expect(page.locator(".viewport-heading")).toContainText("CHÍNH DIỆN");
  await page.screenshot({
    path: "work/screenshots/side-front-reference.png",
    fullPage: true,
  });
  const front = await saved(page);
  expect(front.characterVariants[0].layerIds).toHaveLength(14);
  expect(front.characterVariants[0].boneIds).toHaveLength(23);
  expect(front.bones).toEqual(d.bones);
  await page.getByRole("button", { name: "Side 3/4 view" }).click();
  await page.screenshot({
    path: "work/screenshots/side-right.png",
    fullPage: true,
  });
});
test("actual rendered pixels mirror around root and rigid texture exceptions retain orientation", async ({
  page,
}) => {
  await open(page);
  await saved(page);
  const result = await page.evaluate(async () => {
    const renderPath = "/packages/render-core/src/index.ts",
      dc = "/packages/document-core/src/index.ts",
      comp = "/packages/mesh-core/src/joint-completion.ts";
    const { SceneRenderer } = await import(renderPath),
      { syncHierarchy } = await import(dc),
      { registerPart } = await import(comp);
    const d = JSON.parse(localStorage.getItem("a2dstudio.project.v1")!);
    const host = document.createElement("div");
    host.style.cssText = "width:800px;height:800px;position:fixed;left:-9999px";
    document.body.append(host);
    const scene = new SceneRenderer();
    await scene.init(host);
    await scene.setDocument(d);
    scene.setView(1, 0, 0);
    const pixels = async () => {
      const c = await scene.extractFrame();
      const out = document.createElement("canvas");
      out.width = out.height = 800;
      const ctx = out.getContext("2d")!;
      ctx.drawImage(c as HTMLCanvasElement, 0, 0);
      return ctx.getImageData(0, 0, 800, 800).data;
    };
    const right = await pixels();
    d.characterSettings.facing = "left";
    scene.updatePose(d);
    const left = await pixels();
    let mismatches = 0,
      visible = 0;
    for (let y = 0; y < 800; y++)
      for (let x = 0; x < 800; x++) {
        const a = (y * 800 + x) * 4,
          b = (y * 800 + 799 - x) * 4;
        if (right[a + 3] || left[b + 3]) {
          visible++;
          if (
            [0, 1, 2, 3].some((c) => Math.abs(right[a + c] - left[b + c]) > 4)
          )
            mismatches++;
        }
      }
    const stamp = document.createElement("canvas");
    stamp.width = 24;
    stamp.height = 16;
    const ctx = stamp.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(8, 0, 16, 16);
    const aid = crypto.randomUUID(),
      lid = crypto.randomUUID();
    d.assetReferences.push({
      id: aid,
      name: "Asymmetric text marker",
      provenance: "user-created",
      kind: "source",
      dependencies: [],
      width: 24,
      height: 16,
      data: stamp.toDataURL(),
    });
    d.layers.push({
      id: lid,
      assetId: aid,
      parentId: null,
      name: "Text",
      visible: true,
      locked: false,
      opacity: 1,
      x: 560,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
    const part = await registerPart(d, lid, "text", "near");
    part.mirrorPolicy = "keep_texture";
    syncHierarchy(d);
    await scene.setDocument(d);
    const kept = await pixels();
    const a = (105 * 800 + (800 - 560 - 24) + 2) * 4;
    const red = kept[a],
      blue = kept[a + 2];
    scene.destroy();
    host.remove();
    return {
      ratio: mismatches / visible,
      visible,
      red,
      blue,
      nodes: scene.nodes.size,
      textures: scene.textures.size,
    };
  });
  expect(result.visible).toBeGreaterThan(10000);
  expect(result.ratio).toBeLessThan(0.02);
  expect(result.red).toBeGreaterThan(200);
  expect(result.blue).toBeLessThan(20);
  expect(result.nodes).toBe(0);
  expect(result.textures).toBe(0);
  await panel(page);
  await page.getByRole("button", { name: "Face Left", exact: true }).click();
  await expect(page.getByTestId("viewport").locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Không thể mở trình biên tập" }),
  ).toHaveCount(0);
});
test("isolated elbows and knees have no transparent core holes in actual rendered bend sweeps for all modes", async ({
  page,
}) => {
  test.setTimeout(120000);
  await open(page);
  await saved(page);
  const result = await page.evaluate(async () => {
    const renderPath = "/packages/render-core/src/index.ts",
      rigPath = "/packages/rig-core/src/index.ts",
      dc = "/packages/document-core/src/index.ts";
    const { SceneRenderer } = await import(renderPath),
      { boneMatrices, setBoneRotation } = await import(rigPath),
      { layerDisplayed } = await import(dc);
    const source = JSON.parse(localStorage.getItem("a2dstudio.project.v1")!);
    const host = document.createElement("div");
    host.style.cssText = "width:800px;height:800px;position:fixed;left:-9999px";
    document.body.append(host);
    const scene = new SceneRenderer();
    await scene.init(host);
    await scene.setDocument(source);
    scene.setView(1, 0, 0);
    const out = document.createElement("canvas");
    out.width = out.height = 800;
    const ctx = out.getContext("2d")!;
    const cases: {
      joint: string;
      mode: string;
      angle: number;
      holes: number;
      samples: number;
    }[] = [];
    for (const joint of source.characterJoints.filter((j: { kind: string }) =>
      ["elbow", "knee"].includes(j.kind),
    ))
      for (const mode of ["continuous_mesh", "overlap_only", "rigid_segment"])
        for (const angle of joint.kind === "elbow"
          ? [-120, -90, -45, 30]
          : [0, 45, 90, 120]) {
          const d = structuredClone(source);
          for (const b of d.bones) b.pose = { x: 0, y: 0, rotation: 0 };
          for (const t of d.ikTargets) t.enabled = false;
          d.rigSettings.mode = "pose";
          d.characterJoints.find(
            (j: { id: string }) => j.id === joint.id,
          ).mode = mode;
          for (const l of d.layers) l.visible = joint.layerIds.includes(l.id);
          setBoneRotation(
            d.bones.find((b: { id: string }) => b.id === joint.upperBoneId),
            joint.kind === "elbow" ? -25 : -8,
          );
          setBoneRotation(
            d.bones.find((b: { id: string }) => b.id === joint.lowerBoneId),
            angle,
          );
          scene.updatePose(d);
          const c = await scene.extractFrame();
          ctx.clearRect(0, 0, 800, 800);
          ctx.drawImage(c as HTMLCanvasElement, 0, 0);
          const m = boneMatrices(d).get(joint.lowerBoneId)!,
            radius = Math.floor(joint.radius * 0.6),
            x = Math.round(m.tx),
            y = Math.round(m.ty),
            data = ctx.getImageData(
              x - radius,
              y - radius,
              radius * 2 + 1,
              radius * 2 + 1,
            ).data;
          let samples = 0,
            holes = 0;
          for (let py = -radius; py <= radius; py++)
            for (let px = -radius; px <= radius; px++) {
              if (px * px + py * py > radius * radius) continue;
              samples++;
              if (
                data[
                  ((py + radius) * (radius * 2 + 1) + (px + radius)) * 4 + 3
                ] < 16
              )
                holes++;
            }
          cases.push({ joint: joint.name, mode, angle, holes, samples });
          if (!d.layers.some((l: { id: string }) => layerDisplayed(d, l.id)))
            throw Error("No actual geometry shown");
        }
    scene.destroy();
    host.remove();
    return cases;
  });
  await writeFile(
    "work/side-pixel-sweep.json",
    JSON.stringify(result, null, 2),
  );
  expect(result).toHaveLength(48);
  expect(result.filter((r) => r.holes > 0)).toEqual([]);
});
test("procedural completion, sweep reports, repair, mesh density and undo survive save/reload", async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page);
  await panel(page);
  const before = await saved(page);
  const joint = before.characterJoints.find((j) => j.name === "Near Elbow")!;
  await page
    .getByRole("combobox", { name: "Selected joint" })
    .selectOption(joint.id);
  await page.getByRole("checkbox", { name: "Show Joint Overlay" }).check();
  await page.getByRole("checkbox", { name: "Show Near/Far Layers" }).check();
  await page.getByRole("button", { name: "Run Joint Validation" }).click();
  await expect(
    page.getByRole("status", { name: "Joint validation report" }),
  ).toContainText("0 hở");
  const checked = await saved(page);
  expect(checked.jointValidation!.samples).toBeGreaterThan(500);
  expect(checked.jointValidation!.uncoveredSamples).toBe(0);
  const patch = checked.characterParts.find(
    (p) => p.jointId === joint.id && p.role === "underlap",
  )!;
  const shared = await page.evaluate(async () => {
    const path = "/packages/mesh-core/src/joint-completion.ts";
    const { prepareJointEdit } = await import(path);
    const d = JSON.parse(localStorage.getItem("a2dstudio.project.v1")!);
    const joint = d.characterJoints.find(
        (j: { name: string }) => j.name === "Near Elbow",
      ),
      under = d.characterParts.find(
        (p: { jointId: string; role: string }) =>
          p.jointId === joint.id && p.role === "underlap",
      ),
      over = d.characterParts.find(
        (p: { jointId: string; role: string }) =>
          p.jointId === joint.id && p.role === "overlap",
      );
    const source = d.assetReferences.find(
        (a: { id: string }) => a.id === over.sourceAssetId,
      ),
      data = source.data;
    const extraId = crypto.randomUUID();
    d.layers.push({
      ...d.layers.find((l: { id: string }) => l.id === over.layerId),
      id: extraId,
      name: "Unrelated shared texture",
    });
    d.hierarchy.push({ layerId: extraId, parentId: null });
    under.sourceAssetId = source.id;
    d.layers.find((l: { id: string }) => l.id === under.layerId).assetId =
      source.id;
    const fixed = await prepareJointEdit(d, joint.id, {}, true);
    return {
      preserved:
        fixed.assetReferences.find((a: { id: string }) => a.id === source.id)
          .data === data,
      own:
        fixed.characterParts.find((p: { id: string }) => p.id === under.id)
          .sourceAssetId !== source.id,
    };
  });
  expect(shared).toEqual({ preserved: true, own: true });
  const oldTexture = checked.assetReferences.find(
    (a) => a.id === patch.sourceAssetId,
  )!.data;
  await page.getByRole("button", { name: "Auto Repair", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Underlap Size" }),
  ).toHaveValue("16");
  const repaired = await saved(page);
  expect(
    repaired.assetReferences.find((a) => a.id === patch.sourceAssetId)!.data,
  ).not.toBe(oldTexture);
  expect(repaired.keyframeTracks).toEqual(before.keyframeTracks);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Underlap Size" }),
  ).toHaveValue("10");
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Underlap Size" }),
  ).toHaveValue("16");
  const count = repaired.meshes.find(
    (m) =>
      m.layerId ===
      before.characterParts.find(
        (p) => p.jointId === joint.id && p.role === "continuous",
      )!.layerId,
  )!.vertices.length;
  await page
    .getByRole("button", { name: "Increase joint mesh density" })
    .click();
  const dense = await saved(page);
  expect(
    dense.meshes.find(
      (m) =>
        m.layerId ===
        before.characterParts.find(
          (p) => p.jointId === joint.id && p.role === "continuous",
        )!.layerId,
    )!.vertices.length,
  ).toBeGreaterThan(count);
  await page
    .getByRole("combobox", { name: "Joint Deformation Mode" })
    .selectOption("overlap_only");
  await expect(
    page.getByRole("combobox", { name: "Joint Deformation Mode" }),
  ).toHaveValue("overlap_only");
  await page.getByRole("button", { name: "Run Joint Validation" }).click();
  await expect(
    page.getByRole("status", { name: "Joint validation report" }),
  ).toContainText("0 hở");
  const stored = await saved(page);
  await page.reload();
  await panel(page);
  await page
    .getByRole("combobox", { name: "Selected joint" })
    .selectOption(joint.id);
  await expect(
    page.getByRole("combobox", { name: "Joint Deformation Mode" }),
  ).toHaveValue("overlap_only");
  const reloaded = await saved(page);
  for (const key of [
    "characterParts",
    "characterJoints",
    "jointValidation",
    "meshes",
    "vertexWeights",
  ] as const)
    expect(reloaded[key]).toEqual(stored[key]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("side walk reuses the same editable data when mirrored and sword attack exports actual changing frames", async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page);
  await clip(page, "Walk");
  const before = await saved(page);
  await page
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole("spinbutton", { name: "Current animation frame" })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(2);
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await panel(page);
  await page.getByRole("button", { name: "Face Left", exact: true }).click();
  expect((await saved(page)).keyframeTracks).toEqual(before.keyframeTracks);
  await page.getByRole("button", { name: "Face Right", exact: true }).click();
  await clip(page, "Attack");
  await page
    .getByRole("spinbutton", { name: "Current animation frame" })
    .fill("10");
  await page.screenshot({
    path: "work/screenshots/side-attack.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Xuất dự án", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Export animation", exact: true })
    .selectOption({ label: "Attack" });
  await page.getByRole("spinbutton", { name: "Export FPS" }).fill("6");
  await page.getByRole("spinbutton", { name: "Frame width" }).fill("160");
  await page.getByRole("spinbutton", { name: "Frame height" }).fill("160");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export animated spritesheet" })
    .click();
  const zip = unzipSync(await readFile((await (await event).path())!));
  const metadata = JSON.parse(strFromU8(zip["frames.json"]));
  expect(metadata.direction.characterView).toBe("side_3_4");
  expect(metadata.events).toHaveLength(6);
  const hashes = await page.evaluate(
    async ({ encoded, frames }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + encoded;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return frames.map(
        (f: { rect: { x: number; y: number; w: number; h: number } }) => {
          let hash = 0;
          for (const n of ctx.getImageData(
            f.rect.x,
            f.rect.y,
            f.rect.w,
            f.rect.h,
          ).data)
            hash = (Math.imul(hash, 31) + n) >>> 0;
          return hash;
        },
      );
    },
    {
      encoded: Buffer.from(zip["spritesheet.png"]).toString("base64"),
      frames: metadata.frames,
    },
  );
  expect(new Set(hashes).size).toBeGreaterThan(3);
  expect(
    new Set(metadata.frames.map((f: { time: number }) => f.time)).size,
  ).toBeGreaterThan(3);
  await writeFile("work/side-spritesheet.png", zip["spritesheet.png"]);
  await writeFile("work/side-frames.json", zip["frames.json"]);
});
test("genuine Phase 3 front-view files load with compatible defaults", async ({
  page,
}) => {
  await open(page);
  const d = await page.evaluate(async () => {
    const path = "/apps/web/src/demo.ts";
    const { createDemo } = await import(path);
    const d = await createDemo({ view: "front" });
    const raw = { ...d, schemaVersion: 3 };
    for (const key of [
      "characterSettings",
      "characterParts",
      "characterVariants",
      "characterJoints",
      "jointValidation",
    ])
      delete raw[key as keyof typeof raw];
    return raw;
  });
  const zip = zipSync({ "project.json": strToU8(JSON.stringify(d)) });
  page.once("dialog", (d) => d.accept());
  await page.locator('input[type=file][accept=".a2dstudio"]').setInputFiles({
    name: "phase3-front.a2dstudio",
    mimeType: "application/zip",
    buffer: Buffer.from(zip),
  });
  await expect(page.getByRole("listitem")).toHaveCount(14);
  const loaded = await saved(page);
  expect(loaded.schemaVersion).toBe(4);
  expect(loaded.characterSettings.characterView).toBe("front");
  expect(loaded.bones).toHaveLength(23);
  expect(loaded.animationClips).toHaveLength(5);
  await clip(page, "Idle");
  await expect(
    page.getByRole("button", { name: "Play animation", exact: true }),
  ).toBeEnabled();
});

test("dragging a mirrored hand records canonical IK targets without rewriting source bones", async ({
  page,
}) => {
  await open(page);
  await clip(page, "Idle");
  await panel(page);
  await page.getByRole("button", { name: "Face Left", exact: true }).click();
  await page.getByRole("button", { name: "Bộ xương", exact: false }).click();
  await page.getByRole("button", { name: "Auto Key", exact: true }).click();
  const d = await saved(page),
    hand = d.bones.find((b) => b.name === "Near Hand")!,
    target = d.ikTargets.find((t) => t.endBoneId === hand.id)!;
  const coordinates = await page.getByTestId("viewport").evaluate((el) => {
    const rect = el.getBoundingClientRect(),
      style = getComputedStyle(el),
      z = parseFloat(style.backgroundSize) / 32,
      [x, y] = style.backgroundPosition.split(" ").map(parseFloat);
    return { left: rect.left + x, top: rect.top + y, z };
  });
  const x = coordinates.left + (800 - 482) * coordinates.z,
    y = coordinates.top + 457 * coordinates.z;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 12, y - 20, { steps: 5 });
  await page.mouse.up();
  const after = await saved(page);
  const active = after.animationClips.find(
    (c) =>
      after.characterVariants
        .find((v) => v.view === "side_3_4")!
        .clipIds.includes(c.id) && c.name === "Idle",
  )!;
  expect(
    after.keyframeTracks.find(
      (t) =>
        t.clipId === active.id && t.targetId === target.id && t.type === "ik.x",
    )!.keyframes[0].value as number,
  ).toBeGreaterThan(482);
  expect(
    after.keyframeTracks.find(
      (t) =>
        t.clipId === active.id && t.targetId === target.id && t.type === "ik.y",
    )!.keyframes[0].value as number,
  ).toBeLessThan(457);
  expect(after.bones).toEqual(d.bones);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("clip deletion and reusable presets stay scoped to the selected view", async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page);
  await page
    .getByRole("button", { name: "Trang bị / Socket", exact: false })
    .click();
  await expect(page.getByTestId("bone-Weapon Socket")).toHaveClass(/selected/);
  await clip(page, "Idle");
  const before = await saved(page),
    front = before.characterVariants.find((v) => v.view === "front")!;
  expect(
    before.animationClips
      .filter((c) => front.clipIds.includes(c.id))
      .map((c) => c.name),
  ).toEqual(["Idle", "Walk", "Run", "Attack", "Hurt"]);
  await page
    .getByRole("button", { name: "Delete animation Idle", exact: true })
    .click();
  await expect(
    page.locator(".animation-timeline-header>span").first(),
  ).toContainText("Walk");
  await page.getByRole("button", { name: "5 mẫu", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Select animation Idle", exact: true }),
  ).toBeVisible();
  const side = await saved(page);
  expect(side.animationClips).toHaveLength(10);
  expect(
    side.animationClips.filter((c) => front.clipIds.includes(c.id)),
  ).toEqual(before.animationClips.filter((c) => front.clipIds.includes(c.id)));
  const sideIds = side.characterVariants.find(
    (v) => v.view === "side_3_4",
  )!.clipIds;
  await panel(page);
  await page.getByRole("button", { name: "Front reference view" }).click();
  await clip(page, "Idle");
  await page
    .getByRole("button", { name: "Delete animation Idle", exact: true })
    .click();
  await page.getByRole("button", { name: "5 mẫu", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Select animation Idle", exact: true }),
  ).toBeVisible();
  const restored = await saved(page);
  expect(restored.animationClips).toHaveLength(10);
  expect(restored.animationClips.filter((c) => sideIds.includes(c.id))).toEqual(
    side.animationClips.filter((c) => sideIds.includes(c.id)),
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("front auto rig remains usable after explicitly adding a side reference to an unrigged project", async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page);
  const raw = await page.evaluate(async () => {
    const path = "/apps/web/src/demo.ts";
    const { createDemo } = await import(path);
    return createDemo({ rigged: false });
  });
  const buffer = Buffer.from(
    zipSync({ "project.json": strToU8(JSON.stringify(raw)) }),
  );
  page.once("dialog", (d) => d.accept());
  await page.locator('input[type=file][accept=".a2dstudio"]').setInputFiles({
    name: "unrigged-front.a2dstudio",
    mimeType: "application/zip",
    buffer,
  });
  await panel(page);
  await page
    .getByRole("button", {
      name: "Tạo bản side procedural · giữ bản gốc",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Side 3/4 view" }),
  ).toBeEnabled();
  const side = await saved(page),
    sideIds = side.characterVariants.find(
      (v) => v.view === "side_3_4",
    )!.boneIds;
  await page.getByRole("button", { name: "Front reference view" }).click();
  await page.getByRole("button", { name: "Auto Rig", exact: true }).click();
  await expect
    .poll(async () => {
      const d = await saved(page);
      return d.characterVariants.find((v) => v.view === "front")?.boneIds
        .length;
    })
    .toBe(23);
  const rigged = await saved(page);
  expect(rigged.bones.filter((b) => sideIds.includes(b.id))).toEqual(
    side.bones.filter((b) => sideIds.includes(b.id)),
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});
