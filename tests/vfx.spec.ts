import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
test("editable particles follow animation, scrub deterministically and survive project history/reload", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /VFX.*PARTICLES/ }).click();
  await page
    .getByRole("button", { name: "+ Tạo particle lửa", exact: true })
    .click();
  const picker = page.getByLabel("VFX preview animation");
  await picker.selectOption({ label: "Attack" });
  const frame = page.getByRole("spinbutton", {
    name: "Current animation frame",
    exact: true,
  });
  await frame.fill("10");
  const intensity = page.getByRole("spinbutton", {
    name: "Cường độ VFX",
    exact: true,
  });
  await intensity.fill("2");
  await page.getByLabel("VFX color", { exact: true }).fill("#2266ff");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
  );
  expect(saved.vfxGraphs).toHaveLength(1);
  expect(saved.vfxGraphs[0].nodes[0].attachment.boneId).toBeTruthy();
  expect(saved.vfxGraphs[0].intensity).toBe(2);
  // Exact replay at the same timestamp must produce the same actual GPU canvas.
  const canvas = page.locator("[data-testid=viewport] canvas");
  const before = await canvas.screenshot();
  await frame.fill("20");
  const next = await canvas.screenshot();
  expect(next.equals(before)).toBe(false);
  await frame.fill("10");
  expect((await canvas.screenshot()).equals(before)).toBe(true);
  await page.getByLabel("VFX visible").uncheck();
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(page.getByLabel("VFX visible")).toBeChecked();
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  await expect(page.getByLabel("VFX visible")).not.toBeChecked();
  await page.getByLabel("VFX visible").check();
  await page.getByLabel("VFX space").selectOption("world");
  await frame.fill("15");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
  );
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /VFX.*PARTICLES/ }).click();
  await expect(page.getByLabel("VFX space")).toHaveValue("world");
  await expect(page.getByLabel("VFX color", { exact: true })).toHaveValue(
    "#2266ff",
  );
  const loaded = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
  );
  expect(loaded.vfxGraphs).toEqual(data.vfxGraphs);
  await page.screenshot({ path: "work/phase4-workspace.png", fullPage: true });
  const measurements = await page.evaluate(async () => {
    const path = "/packages/vfx-core/src/project.ts";
    const { ProjectVFX } = await import(path);
    const base = JSON.parse(localStorage.getItem("a2dstudio.project.v1")!);
    const clip = base.animationClips.find(
      (c: { name: string; id: string }) =>
        c.name === "Attack" &&
        base.characterVariants
          .find((v: { view: string }) => v.view === "side_3_4")
          .clipIds.includes(c.id),
    );
    const engine = new ProjectVFX(),
      samples: number[] = [];
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      const p = engine.evaluate(base, clip.id, i / 60);
      samples.push(performance.now() - start);
      peak = Math.max(peak, p.length);
    }
    samples.sort((a, b) => a - b);
    const cacheSize = engine.cacheSize;
    engine.clear();
    return {
      sampleCount: 60,
      medianMs: samples[30],
      p95Ms: samples[57],
      peakParticles: peak,
      cacheSize,
      cacheAfterClear: engine.cacheSize,
      layers: base.layers.length,
      bones: base.bones.length,
    };
  });
  await writeFile(
    "work/phase4-performance.json",
    JSON.stringify(measurements, null, 2),
  );
  expect(measurements.cacheSize).toBeLessThanOrEqual(512);
  expect(measurements.cacheAfterClear).toBe(0);
  expect(errors).toEqual([]);
});
