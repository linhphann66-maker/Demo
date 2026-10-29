import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
async function open(page: Page, preset: string) {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /VFX.*PARTICLES/ }).click();
  await page.getByRole("button", { name: preset, exact: true }).click();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
  );
}
async function frame(page: Page, n: number) {
  await page
    .getByRole("spinbutton", { name: "Current animation frame", exact: true })
    .fill(String(n));
}
async function state(page: Page, time: number) {
  return page.evaluate(async (time) => {
    const path = "/packages/vfx-core/src/project.ts";
    const { ProjectVFX } = await import(path);
    const doc = JSON.parse(localStorage.getItem("a2dstudio.project.v1")!);
    const clip = doc.animationClips.find(
      (c: { name: string; id: string }) =>
        c.name === "Attack" &&
        doc.characterVariants
          .find((v: { view: string }) => v.view === "side_3_4")
          .clipIds.includes(c.id),
    );
    return new ProjectVFX().frame(doc, clip.id, time);
  }, time);
}
test("motion-based sword ribbon follows events, exposes editable markers and fades without ghosts", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "Fire Slash");
  await frame(page, 10);
  const doc = await save(page);
  expect(doc.vfxGraphs[0].trigger.startEventId).toBeTruthy();
  const a = await state(page, 10 / 24);
  expect(a.trails[0].rows.length).toBeGreaterThan(4);
  expect(a.trails[0].rows[0].x).not.toBe(a.trails[0].rows.at(-1).x);
  const canvas = page.locator("[data-testid=viewport] canvas");
  const before = await canvas.screenshot();
  await page.getByLabel("VFX visible").uncheck();
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  await page.getByLabel("VFX visible").check();
  await page
    .getByRole("spinbutton", { name: "Trail width", exact: true })
    .fill("70");
  await page
    .getByRole("spinbutton", { name: "Weapon tip x", exact: true })
    .fill("110");
  await save(page);
  expect((await state(page, 0.95)).trails[0].rows).toHaveLength(0);
  await page
    .getByRole("button", { name: "Chỉnh mốc event", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "sword_trail_start time", exact: true })
    .fill(".5");
  await save(page);
  expect((await state(page, 10 / 24)).trails).toHaveLength(0);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await save(page);
  expect((await state(page, 10 / 24)).trails[0].rows.length).toBeGreaterThan(4);
  await frame(page, 13);
  await page.screenshot({ path: "work/phase4-trail.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("parameter keys, easing, preset instances, quality and save/reload remain editable", async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page, "Sword Fire");
  await page
    .getByLabel("VFX preview animation")
    .selectOption({ label: "Attack" });
  await frame(page, 0);
  await page.getByLabel("VFX key value", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Add VFX key", exact: true }).click();
  await frame(page, 12);
  await page.getByLabel("VFX key value", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Add VFX key", exact: true }).click();
  await page.getByLabel("VFX interpolation").first().selectOption("bezier");
  await page
    .getByRole("spinbutton", { name: "Easing x1", exact: true })
    .fill(".2");
  await page
    .getByRole("button", { name: "Lưu thành preset riêng", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dùng bản riêng", exact: true })
    .click();
  const doc = await save(page);
  expect(doc.vfxPresets).toHaveLength(1);
  expect(doc.vfxGraphs).toHaveLength(2);
  expect(doc.vfxGraphs[0].tracks[0].targetId).not.toBe(
    doc.vfxGraphs[1].tracks[0].targetId,
  );
  expect(doc.vfxGraphs[0].tracks[0].keys).toHaveLength(2);
  const saved = doc.vfxGraphs;
  await page.getByLabel("VFX quality").selectOption("low");
  await page.getByLabel("VFX gizmos").check();
  const low = await save(page);
  expect(low.vfxGraphs).toEqual(saved);
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /VFX.*PARTICLES/ }).click();
  expect((await save(page)).vfxGraphs).toEqual(saved);
});
test("scoped GLSL filters compile and real flipbook frames render from imported metadata", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "Sword Fire");
  await page
    .getByLabel("VFX preview animation")
    .selectOption({ label: "Attack" });
  await frame(page, 8);
  await page.getByText("Filter / shader · scoped VFX", { exact: true }).click();
  await page.getByRole("button", { name: "+ Distortion", exact: true }).click();
  await page.getByRole("button", { name: "+ Dissolve", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Filter intensity", exact: true })
    .last()
    .fill("5");
  await frame(page, 10);
  await page
    .getByText("Flipbook · spritesheet gốc và frame metadata", { exact: true })
    .click();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 16;
    const x = c.getContext("2d")!;
    x.fillStyle = "#00ff00";
    x.fillRect(0, 0, 16, 16);
    x.fillStyle = "#0000ff";
    x.fillRect(16, 0, 16, 16);
    return c.toDataURL().split(",")[1];
  });
  await page.getByLabel("VFX spritesheet image").setInputFiles({
    name: "green-blue.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByText("1 frame · texture gốc giữ nguyên", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nhập frame metadata JSON", exact: true })
    .click();
  await page.getByLabel("VFX frame metadata").setInputFiles({
    name: "frames.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        { x: 0, y: 0, w: 16, h: 16 },
        { x: 16, y: 0, w: 16, h: 16 },
      ]),
    ),
  });
  await expect(
    page.getByText("2 frame · texture gốc giữ nguyên", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "Flipbook FPS", exact: true })
    .fill("6");
  const doc = await save(page);
  expect(doc.vfxGraphs[0].flipbooks[0].frames).toHaveLength(2);
  const a = await state(page, 0.05),
    b = await state(page, 0.2);
  expect(a.flipbooks[0].rect.x).not.toBe(b.flipbooks[0].rect.x);
  await frame(page, 11);
  await page.screenshot({
    path: "work/phase4-filters-flipbook.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await expect(page.getByText(/VFX filter fallback/)).toHaveCount(0);
});
test("VFX-only and character plus VFX exports contain actual transparent differing frames", async ({
  page,
}) => {
  test.setTimeout(120000);
  await open(page, "Fire Slash");
  await page.getByText("Xuất VFX / nhân vật + VFX", { exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Export VFX FPS", exact: true })
    .fill("8");
  await page
    .getByRole("spinbutton", { name: "Export frame size", exact: true })
    .fill("128");
  await page
    .getByRole("spinbutton", { name: "Export VFX duration", exact: true })
    .fill(".8");
  for (const [label, prefix] of [
    ["Xuất VFX spritesheet PNG + JSON", "vfx"],
    ["Xuất nhân vật + VFX", "combined"],
  ] as const) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const f = await download;
    const bytes = await readFile((await f.path())!);
    const zip = unzipSync(bytes),
      metadata = JSON.parse(strFromU8(zip["frames.json"]));
    expect(metadata.frames.length).toBeGreaterThan(4);
    expect(metadata.vfxOnly).toBe(prefix === "vfx");
    const result = await page.evaluate(
      async ({ base64, metadata }) => {
        const img = new Image();
        img.src = "data:image/png;base64," + base64;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        let transparent = 0,
          colored = 0;
        const hashes = [];
        for (const frame of metadata.frames) {
          const r = frame.rect,
            p = ctx.getImageData(r.x, r.y, r.w, r.h).data;
          let hash = 0;
          for (let i = 0; i < p.length; i++) {
            hash = (Math.imul(hash, 31) + p[i]) | 0;
            if (i % 4 === 3) {
              if (p[i] === 0) transparent++;
              else colored++;
            }
          }
          hashes.push(hash);
        }
        return { unique: new Set(hashes).size, transparent, colored };
      },
      {
        base64: Buffer.from(zip["spritesheet.png"]).toString("base64"),
        metadata,
      },
    );
    expect(result.unique).toBeGreaterThan(2);
    expect(result.transparent).toBeGreaterThan(0);
    expect(result.colored).toBeGreaterThan(0);
    await writeFile(
      "work/phase4-" + prefix + "-spritesheet.png",
      zip["spritesheet.png"],
    );
    await writeFile(
      "work/phase4-" + prefix + "-frames.json",
      JSON.stringify(metadata),
    );
  }
});

test("attachment marker drag is a single undoable edit and mirrored ribbon geometry stays canonical", async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page, "Fire Slash");
  await frame(page, 10);
  await page.getByLabel("VFX gizmos").check();
  await page
    .getByRole("button", { name: "Vừa khung nhìn", exact: true })
    .click();
  const before = await save(page),
    scene = await state(page, 10 / 24);
  const handle = scene.gizmos.find((h: { kind: string }) => h.kind === "tip");
  expect(handle).toBeTruthy();
  const host = page.getByTestId("viewport"),
    box = (await host.boundingBox())!;
  const zoom = Math.min((box.width - 100) / 800, (box.height - 60) / 700, 1.5),
    x = box.x + (box.width - 800 * zoom) / 2 + handle.x * zoom,
    y = box.y + (box.height - 740 * zoom) / 2 + handle.y * zoom;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 25, y + 12, { steps: 6 });
  await page.mouse.up();
  const after = await save(page);
  expect(after.vfxGraphs[0].trails[0].tip.offset).not.toEqual(
    before.vfxGraphs[0].trails[0].tip.offset,
  );
  expect(after.bones).toEqual(before.bones);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  expect((await save(page)).vfxGraphs[0].trails[0].tip.offset).toEqual(
    before.vfxGraphs[0].trails[0].tip.offset,
  );
  // Mirror only presentation: the same source trail/animation values must produce reflected geometry.
  const mirror = await page.evaluate(async () => {
    const path = "/packages/vfx-core/src/project.ts";
    const { ProjectVFX } = await import(path),
      base = JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
      clip = base.vfxGraphs[0].trigger.clipId;
    const right = new ProjectVFX().frame(base, clip, 10 / 24);
    const left = structuredClone(base);
    left.characterSettings.facing = "left";
    const reflected = new ProjectVFX().frame(left, clip, 10 / 24);
    return {
      right: right.trails[0].rows,
      left: reflected.trails[0].rows,
      root: base.bones.find(
        (b: { name: string; id: string }) =>
          b.name === "Root" &&
          base.characterVariants
            .find((v: { view: string }) => v.view === "side_3_4")
            .boneIds.includes(b.id),
      ).rest.x,
      unchanged:
        JSON.stringify(base.vfxGraphs) === JSON.stringify(left.vfxGraphs),
    };
  });
  expect(mirror.unchanged).toBe(true);
  mirror.right.forEach((r: { x: number; bx: number; y: number }, i: number) => {
    expect(mirror.left[i].x).toBeCloseTo(2 * mirror.root - r.x, 5);
    expect(mirror.left[i].bx).toBeCloseTo(2 * mirror.root - r.bx, 5);
    expect(mirror.left[i].y).toBeCloseTo(r.y, 5);
  });
});
test("five preset render lifecycle remains bounded and records actual CPU/render measurements", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "Sword Fire");
  await save(page);
  const result = await page.evaluate(async () => {
    const enginePath = "/packages/vfx-core/src/project.ts",
      rendererPath = "/packages/render-core/src/index.ts",
      presetsPath = "/packages/vfx-core/src/presets.ts",
      animationPath = "/packages/animation-core/src/evaluation.ts";
    const [
      { ProjectVFX },
      { SceneRenderer },
      { makePreset, presetNames },
      { evaluateClip },
    ] = await Promise.all([
      import(enginePath),
      import(rendererPath),
      import(presetsPath),
      import(animationPath),
    ]);
    const doc = JSON.parse(localStorage.getItem("a2dstudio.project.v1")!);
    const clip = doc.animationClips.find(
      (c: { name: string; id: string }) =>
        c.name === "Attack" &&
        doc.characterVariants
          .find((v: { view: string }) => v.view === "side_3_4")
          .clipIds.includes(c.id),
    );
    doc.vfxGraphs = presetNames.map((name: string) =>
      makePreset(name, doc, clip.id),
    );
    const host = document.createElement("div");
    host.style.cssText = "width:256px;height:256px;position:fixed;left:-9999px";
    document.body.append(host);
    const renderer = new SceneRenderer();
    await renderer.init(host);
    await renderer.setDocument(doc);
    renderer.setView(0.3, 0, 0);
    const engine = new ProjectVFX(),
      samples: number[] = [];
    let maxAllocated = 0,
      peakParticles = 0,
      peakRows = 0;
    for (let i = 0; i < 90; i++) {
      const time = ((i % 45) / 45) * 0.8,
        start = performance.now(),
        frame = engine.frame(doc, clip.id, time, "medium");
      renderer.updatePose(evaluateClip(doc, clip.id, time, false), false);
      renderer.particles.updateFrame(frame, renderer.textures, time);
      renderer.render();
      if (i >= 5) samples.push(performance.now() - start);
      maxAllocated = Math.max(maxAllocated, renderer.particles.allocated);
      peakParticles = Math.max(peakParticles, frame.particles.length);
      peakRows = Math.max(
        peakRows,
        frame.trails.reduce(
          (n: number, t: { rows: unknown[] }) => n + t.rows.length,
          0,
        ),
      );
    }
    const atlas=doc.assetReferences.find((a:{width:number;height:number})=>a.width!==a.height);
    renderer.particles.updateFrame({particles:[{id:'aspect:particle:0',x:100,y:100,size:20,rotation:0,color:0xffffff,alpha:1,blendMode:'normal',textureId:atlas.id}],styles:[{effectId:'aspect',filters:[]}],trails:[],flipbooks:[],gizmos:[]},renderer.textures);
    renderer.render();
    const sprite=renderer.particles.root.children[0].children[1].children.find((n:{texture?:unknown})=>typeof n.texture==='object'&&n.texture!==null);
    const aspect={actual:sprite.width/sprite.height,expected:atlas.width/atlas.height};
    const warning = [...renderer.particles.errors];
    samples.sort((a, b) => a - b);
    const measurements = {
      samples: samples.length,
      medianMs: samples[Math.floor(samples.length * 0.5)],
      p95Ms: samples[Math.floor(samples.length * 0.95)],
      maxAllocated,
      peakParticles,
      peakRows,
      cacheSize: engine.cacheSize,
      layers: doc.layers.length,
      bones: doc.bones.length,
    };
    renderer.destroy();
    engine.clear();
    host.remove();
    return {
      measurements,
      aspect,
      warning,
      allocatedAfterDestroy: renderer.particles.allocated,
      cacheAfterClear: engine.cacheSize,
    };
  });
  expect(result.warning).toEqual([]);
  expect(result.aspect.actual).toBeCloseTo(result.aspect.expected,5);
  expect(result.allocatedAfterDestroy).toBe(0);
  expect(result.cacheAfterClear).toBe(0);
  expect(result.measurements.cacheSize).toBeLessThanOrEqual(512);
  expect(result.measurements.maxAllocated).toBeLessThanOrEqual(8704);
  await writeFile(
    "work/phase4-completion-performance.json",
    JSON.stringify(result, null, 2),
  );
  await page
    .getByLabel("VFX preview animation")
    .selectOption({ label: "Attack" });
  await frame(page, 10);
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("portable effect JSON preserves textures and footstep contact instances keep live-edit playback running", async ({
  page,
}) => {
  test.setTimeout(120000);
  await open(page, "Sword Fire");
  await page
    .getByText("Flipbook · spritesheet gốc và frame metadata", { exact: true })
    .click();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const x = c.getContext("2d")!;
    x.fillStyle = "#55ff66";
    x.fillRect(0, 0, 8, 8);
    return c.toDataURL().split(",")[1];
  });
  await page
    .getByLabel("VFX spritesheet image")
    .setInputFiles({
      name: "portable.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(
    page.getByText("1 frame · texture gốc giữ nguyên", { exact: true }),
  ).toBeVisible();
  const original = await save(page),
    download = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Xuất effect + texture + events JSON",
      exact: true,
    })
    .click();
  const bundle = await readFile((await (await download).path())!);
  expect(JSON.parse(bundle.toString()).assets).toHaveLength(1);
  await page
    .getByLabel("Import VFX JSON")
    .setInputFiles({
      name: "portable.vfx.json",
      mimeType: "application/json",
      buffer: bundle,
    });
  await expect.poll(async () => (await save(page)).vfxGraphs.length).toBe(2);
  const imported = await save(page);
  expect(imported.vfxGraphs[1].id).not.toBe(imported.vfxGraphs[0].id);
  expect(imported.vfxGraphs[1].flipbooks[0].assetId).not.toBe(
    imported.vfxGraphs[0].flipbooks[0].assetId,
  );
  expect(
    imported.assetReferences.find(
      (a: { id: string }) =>
        a.id === imported.vfxGraphs[1].flipbooks[0].assetId,
    ).data,
  ).toBe(
    original.assetReferences.find(
      (a: { id: string }) =>
        a.id === original.vfxGraphs[0].flipbooks[0].assetId,
    ).data,
  );
  expect(imported.bones).toEqual(original.bones);
  expect(imported.keyframeTracks).toEqual(original.keyframeTracks);
  await page
    .getByRole("button", { name: "Footstep Dust", exact: true })
    .click();
  const dust = await save(page);
  expect(dust.vfxGraphs.length).toBeGreaterThan(4);
  const contacts = dust.vfxGraphs.filter((e: { name: string }) =>
    e.name.startsWith("Footstep Dust"),
  );
  expect(
    contacts.every(
      (e: { trigger: { mode: string; startEventId: string } }) =>
        e.trigger?.mode === "burst" &&
        dust.animationEvents.some(
          (ev: { id: string }) => ev.id === e.trigger.startEventId,
        ),
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause animation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "Cường độ VFX", exact: true })
    .fill("2");
  await expect(
    page.getByRole("button", { name: "Pause animation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dừng preview VFX", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play animation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Preview VFX đang dừng. Bấm Phát cùng hoạt ảnh để xem lại.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    (await save(page)).vfxGraphs.some((e: { enabled: boolean }) => e.enabled),
  ).toBe(true);
});

test('deleting a keyed emitter removes its own tracks and undo restores the complete component',async({page})=>{
 await open(page,'Sword Fire');const before=await save(page),id=before.vfxGraphs[0].nodes[0].id;await page.getByLabel('VFX track target').selectOption(id);await page.getByLabel('VFX track channel').selectOption('opacity');await page.getByLabel('VFX key value',{exact:true}).fill('.5');await page.getByRole('button',{name:'Add VFX key',exact:true}).click();expect((await save(page)).vfxGraphs[0].tracks.some((t:{targetId:string})=>t.targetId===id)).toBe(true);await page.getByRole('button',{name:'Xóa emitter',exact:true}).click();let doc=await save(page);expect(doc.vfxGraphs[0].nodes).toHaveLength(1);expect(doc.vfxGraphs[0].tracks).toHaveLength(0);await page.getByRole('button',{name:'Hoàn tác',exact:true}).click();doc=await save(page);expect(doc.vfxGraphs[0].nodes).toHaveLength(2);expect(doc.vfxGraphs[0].tracks[0].targetId).toBe(id);await page.getByRole('button',{name:'Làm lại',exact:true}).click();expect((await save(page)).vfxGraphs[0].nodes).toHaveLength(1);await expect(page.getByRole('button',{name:'Xóa emitter',exact:true})).toBeDisabled();
});
