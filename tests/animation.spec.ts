import { packageProject } from "../packages/exporters/src";
import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import type { ProjectDocument } from "../packages/document-core/src";
async function saved(page: Page): Promise<ProjectDocument> {
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
  );
}
async function open(page: Page, name = "Idle") {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  const front = await page.evaluate(async () => {
    const path = "/apps/web/src/demo.ts";
    const { createDemo } = await import(path);
    return createDemo({ view: "front" });
  });
  page.once("dialog", (d) => d.accept());
  await page.locator('input[type=file][accept=".a2dstudio"]').setInputFiles({
    name: "front-animation-regression.a2dstudio",
    mimeType: "application/zip",
    buffer: Buffer.from(packageProject(front)),
  });
  await page.getByRole("button", { name: "Hoạt ảnh", exact: false }).click();
  await page
    .getByRole("button", { name: "Select animation " + name, exact: true })
    .click();
}
async function frame(page: Page, n: number) {
  await page
    .getByRole("spinbutton", { name: "Current animation frame", exact: true })
    .fill(String(n));
}
async function screenshotPixels(page: Page) {
  return page.locator("[data-testid=viewport] canvas").screenshot();
}
test("five real clips, playback/pause, deterministic scrub and persisted library", async ({
  page,
}) => {
  await open(page);
  const d = await saved(page);
  expect(d.animationClips.map((c) => c.name)).toEqual([
    "Idle",
    "Walk",
    "Run",
    "Attack",
    "Hurt",
  ]);
  expect(
    d.keyframeTracks.reduce((n, t) => n + t.keyframes.length, 0),
  ).toBeGreaterThan(100);
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
  // Pause can leave a fractional timestamp whose displayed integer is already 12.
  // Force an actual input change before requesting the exact deterministic timestamp.
  await frame(page, 0);
  await frame(page, 12);
  const before = await screenshotPixels(page);
  await frame(page, 24);
  expect((await screenshotPixels(page)).equals(before)).toBe(false);
  await frame(page, 12);
  expect((await screenshotPixels(page)).equals(before)).toBe(true);
  const data = await saved(page);
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible();
  expect((await saved(page)).animationClips).toEqual(data.animationClips);
  await page.getByRole("button", { name: "Hoạt ảnh", exact: false }).click();
  await page
    .getByRole("button", { name: "Select animation Attack", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Animation duration" }),
  ).toHaveValue("0.8");
  await expect(
    page.getByRole("checkbox", { name: "Animation loop" }),
  ).not.toBeChecked();
});
test("Auto Key records bone changes, moving/copy/paste keys and keyboard undo/redo", async ({
  page,
}) => {
  await open(page);
  await frame(page, 12);
  await page.getByRole("button", { name: "Bộ xương", exact: false }).click();
  await page.getByTestId("bone-Chest").click();
  await page.getByRole("button", { name: "Auto Key", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Bone rotation", exact: true })
    .fill("12");
  let d = await saved(page);
  const idle = d.animationClips.find((c) => c.name === "Idle")!,
    bone = d.bones.find((b) => b.name === "Chest")!,
    track = d.keyframeTracks.find(
      (t) =>
        t.clipId === idle.id &&
        t.targetId === bone.id &&
        t.type === "bone.rotation",
    )!;
  expect(track.keyframes[0].time).toBe(0.5);
  expect(track.keyframes[0].value).toBe(12);
  expect(bone.pose.rotation).toBe(0);
  const key = page.getByTestId("key-" + track.keyframes[0].id);
  await key.scrollIntoViewIfNeeded();
  const rect = (await key.boundingBox())!;
  await page.mouse.move(rect.x + 7, rect.y + 7);
  await page.mouse.down();
  await page.mouse.move(rect.x + 67, rect.y + 7, { steps: 4 });
  await page.mouse.up();
  d = await saved(page);
  expect(
    d.keyframeTracks.find((t) => t.id === track.id)!.keyframes[0].time,
  ).toBe(0.75);
  await page.getByRole("region", { name: "Animation timeline" }).focus();
  await page.keyboard.press("Control+c");
  await frame(page, 24);
  await page.getByRole("region", { name: "Animation timeline" }).focus();
  await page.keyboard.press("Control+v");
  d = await saved(page);
  expect(
    d.keyframeTracks.find((t) => t.id === track.id)!.keyframes,
  ).toHaveLength(2);
  await page.getByRole("region", { name: "Animation timeline" }).focus();
  await page.keyboard.press("Control+z");
  expect(
    (await saved(page)).keyframeTracks.find((t) => t.id === track.id)!
      .keyframes,
  ).toHaveLength(1);
  await page.getByRole("region", { name: "Animation timeline" }).focus();
  await page.keyboard.press("Control+Shift+z");
  expect(
    (await saved(page)).keyframeTracks.find((t) => t.id === track.id)!
      .keyframes,
  ).toHaveLength(2);
});
test("temporary posing never silently writes keys; explicit recording persists the pose", async ({
  page,
}) => {
  await open(page);
  const before = await saved(page);
  await frame(page, 6);
  await page.getByRole("button", { name: "Bộ xương", exact: false }).click();
  await page.getByTestId("bone-Head").click();
  await page
    .getByRole("spinbutton", { name: "Bone rotation", exact: true })
    .fill("9");
  await expect(page.getByText("POSE TẠM", { exact: true })).toBeVisible();
  expect((await saved(page)).keyframeTracks).toEqual(before.keyframeTracks);
  await page
    .getByRole("button", { name: "Record pose keyframe", exact: true })
    .click();
  const d = await saved(page),
    clip = d.animationClips.find((c) => c.name === "Idle")!,
    head = d.bones.find((b) => b.name === "Head")!;
  expect(
    d.keyframeTracks
      .find(
        (t) =>
          t.clipId === clip.id &&
          t.targetId === head.id &&
          t.type === "bone.rotation",
      )!
      .keyframes.some((k) => k.time === 0.25 && k.value === 9),
  ).toBe(true);
});
test("duration/FPS edits retime data and clip CRUD uses editable IDs", async ({
  page,
}) => {
  await open(page);
  const before = await saved(page);
  const idle = before.animationClips.find((c) => c.name === "Idle")!;
  await page.getByRole("spinbutton", { name: "Animation duration" }).fill("3");
  const d = await saved(page);
  expect(
    d.keyframeTracks
      .filter((t) => t.clipId === idle.id)
      .every((t) => t.keyframes.at(-1)!.time === 3),
  ).toBe(true);
  await page.getByRole("spinbutton", { name: "Animation FPS" }).fill("30");
  expect(
    (await saved(page)).animationClips.find((c) => c.id === idle.id)!.fps,
  ).toBe(30);
  await page
    .getByRole("button", { name: "Duplicate animation Idle", exact: true })
    .click();
  expect((await saved(page)).animationClips).toHaveLength(6);
  await page
    .getByRole("button", { name: "Create animation", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Animation name", exact: true })
    .fill("Custom clip");
  expect(
    (await saved(page)).animationClips.some((c) => c.name === "Custom clip"),
  ).toBe(true);
  await page.getByRole("textbox", { name: "Search animations" }).fill("Custom");
  await expect(
    page.getByRole("button", {
      name: "Select animation Custom clip",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete animation Custom clip", exact: true })
    .click();
  expect(
    (await saved(page)).animationClips.some((c) => c.name === "Custom clip"),
  ).toBe(false);
});
test("events dispatch on real playback, seeking is silent and payload editing survives reload", async ({
  page,
}) => {
  await open(page, "Attack");
  await page.evaluate(() => {
    const events: string[] = [];
    (window as unknown as { animationEvents: string[] }).animationEvents =
      events;
    window.addEventListener("a2dstudio:animation-event", (e) =>
      events.push((e as CustomEvent).detail.event.name),
    );
  });
  await frame(page, 12);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { animationEvents: string[] }).animationEvents,
    ),
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Restart animation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play animation", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { animationEvents: string[] }).animationEvents
            .length,
      ),
    )
    .toBe(6);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { animationEvents: string[] }).animationEvents,
    ),
  ).toEqual([
    "attack_start",
    "sword_trail_start",
    "hit_window_start",
    "hit_window_end",
    "sword_trail_end",
    "attack_end",
  ]);
  await page
    .getByRole("button", { name: "Add animation event", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Event name", exact: true })
    .fill("custom_marker");
  await page
    .getByRole("textbox", { name: "Event payload", exact: true })
    .fill('{"type":"number","value":7}');
  await page
    .getByRole("button", { name: "Áp dụng payload", exact: true })
    .click();
  let d = await saved(page);
  expect(
    d.animationEvents.find((e) => e.name === "custom_marker")!.payload,
  ).toEqual({ type: "number", value: 7 });
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible();
  d = await saved(page);
  expect(
    d.animationEvents.find((e) => e.name === "custom_marker")!.payload,
  ).toEqual({ type: "number", value: 7 });
});
test("IK target Auto Key and mesh deformation keys remain ordinary editable records", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Create animation", exact: true })
    .click();
  await frame(page, 12);
  await page.getByRole("button", { name: "Bộ xương", exact: false }).click();
  await page.getByTestId("bone-Right Hand").click();
  await page.getByRole("button", { name: "Auto Key", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "IK target X", exact: true })
    .fill("520");
  await page
    .getByRole("spinbutton", { name: "IK target Y", exact: true })
    .fill("400");
  const d = await saved(page),
    clip = d.animationClips.find((c) => c.name === "Animation")!;
  expect(
    d.keyframeTracks
      .filter((t) => t.clipId === clip.id)
      .map((t) => t.type)
      .sort(),
  ).toEqual(["ik.blend", "ik.x", "ik.y"]);
  expect(d.bones.every((b) => b.pose.rotation === 0)).toBe(true);
  await page
    .getByRole("combobox", { name: "Animation track type", exact: true })
    .selectOption("mesh.deform");
  const mesh = d.meshes.find(
    (m) =>
      d.assetReferences.find((a) => a.id === m.sourceAssetId)?.name ===
      "Crimson cape",
  )!;
  await page
    .getByRole("combobox", { name: "Animation track target", exact: true })
    .selectOption(mesh.id);
  await page
    .getByRole("button", { name: "Add track keyframe", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Deformation offset X", exact: true })
    .fill("3");
  const after = await saved(page);
  const deform = after.keyframeTracks.find(
    (t) => t.clipId === clip.id && t.type === "mesh.deform",
  )!;
  expect(
    Object.values(
      deform.keyframes[0].value as Record<string, { x: number }>,
    ).some((v) => v.x === 3),
  ).toBe(true);
  expect(after.meshes).toEqual(d.meshes);
});
test("onion skins and crossfade preview work and playback controls respect text focus", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("checkbox", { name: "Onion skin", exact: true }).check();
  await page
    .getByRole("spinbutton", { name: "Onion previous frames" })
    .fill("2");
  await page.getByRole("spinbutton", { name: "Onion next frames" }).fill("2");
  await page.getByRole("button", { name: /Idle.*Walk.*Run.*Idle/ }).click();
  await expect
    .poll(
      async () =>
        page.locator(".animation-timeline-header>span").first().innerText(),
      { timeout: 6000 },
    )
    .toContain("Walk");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.getByRole("region", { name: "Animation timeline" }).focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Pause animation", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Play animation", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("spinbutton", { name: "Current animation frame" }),
  ).toHaveValue("0");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({
    path: "work/screenshots/phase3-mixer.png",
    fullPage: true,
  });
});
test("spritesheet exports actual differing transparent frames and metadata", async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page, "Attack");
  await page.getByRole("button", { name: "Xuất dự án", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Export animation", exact: true })
    .selectOption({ label: "Attack" });
  await page
    .getByRole("spinbutton", { name: "Export FPS", exact: true })
    .fill("6");
  await page
    .getByRole("spinbutton", { name: "Frame width", exact: true })
    .fill("128");
  await page
    .getByRole("spinbutton", { name: "Frame height", exact: true })
    .fill("128");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export animated spritesheet", exact: true })
    .click();
  const bytes = await readFile((await (await event).path())!);
  const zip = unzipSync(bytes),
    metadata = JSON.parse(strFromU8(zip["frames.json"]));
  expect(metadata.frames.length).toBeGreaterThan(3);
  expect(metadata.fps).toBe(6);
  expect(metadata.loopMode).toBe("once");
  expect(
    metadata.frames.reduce(
      (n: number, frame: { duration: number }) => n + frame.duration,
      0,
    ),
  ).toBeCloseTo(metadata.duration);
  expect(metadata.frames.at(-1).time).toBeCloseTo(metadata.duration);
  const encoded = Buffer.from(zip["spritesheet.png"]).toString("base64");
  const pixels = await page.evaluate(
    async ({ encoded, frames }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + encoded;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return frames.map(
        (f: { rect: { x: number; y: number; w: number; h: number } }) => {
          const data = ctx.getImageData(
            f.rect.x,
            f.rect.y,
            f.rect.w,
            f.rect.h,
          ).data;
          let hash = 0,
            opaque = 0;
          for (let i = 0; i < data.length; i++) {
            hash = (Math.imul(hash, 31) + data[i]) >>> 0;
            if (i % 4 === 3 && data[i] > 0) opaque++;
          }
          return { hash, opaque, corner: data[3] };
        },
      );
    },
    { encoded, frames: metadata.frames },
  );
  expect(
    new Set(pixels.map((p: { hash: number }) => p.hash)).size,
  ).toBeGreaterThan(2);
  expect(
    pixels.every(
      (p: { opaque: number; corner: number }) =>
        p.opaque > 50 && p.corner === 0,
    ),
  ).toBe(true);
  await writeFile("work/phase3-spritesheet.png", zip["spritesheet.png"]);
  await writeFile("work/phase3-frames.json", zip["frames.json"]);
});
