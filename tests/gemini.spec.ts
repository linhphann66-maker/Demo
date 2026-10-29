import { test, expect, type Page } from "@playwright/test";
const KEY = "AIza-BROWSER-MOCK-KEY-NEVER-REAL";
const slots = [
  "head",
  "hair",
  "torso",
  "left_arm",
  "right_arm",
  "left_leg",
  "right_leg",
];
async function mockAI(page: Page) {
  let configured = false,
    connected = false,
    storedKey = "",
    vision = "gemini-3.8-flash";
  let job: Record<string, unknown> | null = null;
  const settings = () => ({
    configured,
    csrfToken: "mock-csrf-token",
    visionModel: vision,
    imageModel: "gemini-nano-banana-2.1",
    persistenceSupported: false,
    storageMode: "temporary-session",
    expiresAt: Date.now() + 3600000,
    status: connected ? "connected" : "not_configured",
    models: [
      {
        id: "gemini-3.8-flash",
        displayName: "Gemini",
        methods: ["generateContent"],
      },
    ],
    modelAvailability: { vision: connected, image: false },
    capabilities: {
      imageUnderstanding: connected,
      structuredOutput: connected,
      imageEditing: false,
      imageGeneration: false,
    },
    usage: [],
    reason: "Key mã hóa trong phiên server tạm thời.",
  });
  const sent: unknown[] = [];
  await page.route("**/api/ai/**", async (route) => {
    const r = route.request(),
      p = new URL(r.url()).pathname.replace("/api/ai", "");
    const data = r.postDataJSON();
    if (p === "/settings" || p === "/models")
      return route.fulfill({ json: settings() });
    if (p === "/key/test") {
      if (data.apiKey === "bad-key-for-mock-test")
        return route.fulfill({
          status: 401,
          json: { code: "invalid_key", detail: "API key không hợp lệ." },
        });
      vision = data.visionModel;
      connected = vision === "gemini-3.8-flash";
      return route.fulfill({
        json: {
          ...settings(),
          status: connected ? "connected" : "model_unavailable",
        },
      });
    }
    if (p === "/key" && r.method() === "PUT") {
      storedKey = data.apiKey ?? storedKey;
      configured = !!storedKey;
      return route.fulfill({ json: settings() });
    }
    if (p === "/key" && r.method() === "DELETE") {
      storedKey = "";
      configured = false;
      connected = false;
      return route.fulfill({ json: settings() });
    }
    if (p === "/character/analyze") {
      sent.push(data);
      const result = {
        viewpoint: "side_3_4",
        facing: "right",
        assignments: data.candidates.map((c: { id: string }, i: number) => ({
          candidateId: c.id,
          slot: slots[i],
          confidence: i === 3 || i === 4 ? 0.6 : 0.96,
          lateralityCertain: i !== 3 && i !== 4,
          depth: "unknown",
          warnings: [],
        })),
        ambiguousCandidateIds: [],
        missingSlots: [],
        renderOrder: data.candidates.map((c: { id: string }) => c.id),
        anchors: [],
        warnings: [],
      };
      job = {
        id: crypto.randomUUID(),
        state: "succeeded",
        progress: 1,
        error: null,
        result: { analysis: result, model: vision, cached: false },
      };
      return route.fulfill({ status: 202, json: job });
    }
    if (p.startsWith("/jobs/")) return route.fulfill({ json: job });
    return route.fulfill({
      status: 501,
      json: { code: "not_implemented", detail: "Not implemented" },
    });
  });
  return { sent };
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Cài đặt AI", exact: true }).click();
  const d = page.getByRole("dialog", { name: "Cài đặt AI · Google Gemini" });
  await d.getByLabel("Gemini API key", { exact: true }).fill(KEY);
  await d
    .getByRole("button", { name: "Kiểm tra kết nối", exact: true })
    .click();
  await expect(d.getByRole("status")).toContainText("Đã kết nối");
  await d.getByRole("button", { name: "Lưu API Key", exact: true }).click();
  await expect(d.getByLabel("Gemini API key", { exact: true })).toHaveValue("");
  await d.getByRole("button", { name: "Đóng cài đặt AI", exact: true }).click();
}
test("AI settings handles invalid keys/model choice, separates image capabilities and deletes keys on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAI(page);
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Cài đặt AI", exact: true }).click();
  const d = page.getByRole("dialog", { name: "Cài đặt AI · Google Gemini" });
  await d
    .getByLabel("Gemini API key", { exact: true })
    .fill("bad-key-for-mock-test");
  await d
    .getByRole("button", { name: "Kiểm tra kết nối", exact: true })
    .click();
  await expect(d.getByRole("alert")).toContainText("API key không hợp lệ");
  await d.getByLabel("Gemini API key", { exact: true }).fill(KEY);
  await d.getByLabel("Gemini vision model").fill("unavailable-model");
  await d
    .getByRole("button", { name: "Kiểm tra kết nối", exact: true })
    .click();
  await expect(d.getByRole("status")).toContainText("Model không khả dụng");
  await d.getByLabel("Gemini vision model").fill("gemini-3.8-flash");
  await d
    .getByRole("button", { name: "Kiểm tra kết nối", exact: true })
    .click();
  await expect(d.getByRole("status")).toContainText("Đã kết nối");
  await expect(
    d.getByText("Tạo ảnh: Chưa xác minh — chưa bật", { exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Lưu API Key", exact: true }).click();
  await expect(d.getByLabel("Gemini API key", { exact: true })).toHaveValue("");
  const width = await d.evaluate((e) => ({
    client: e.clientWidth,
    scroll: e.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  await d.screenshot({ path: "work/gemini/settings-mobile.png" });
  await d.getByRole("button", { name: "Xóa API Key", exact: true }).click();
  await expect(d.getByRole("status")).toContainText("Chưa cấu hình");
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage })),
  ).not.toContain(KEY);
});
test("Gemini maps seven unnamed parts, requires ambiguous limb review, creates editable rig and preserves a restorable backup", async ({
  page,
}) => {
  test.setTimeout(120000);
  const mock = await mockAI(page);
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await settings(page);
  const original = await page.evaluate(async () => {
    const path = "/packages/editor-core/src/store.ts";
    return (await import(path)).useEditor.getState().document.projectId;
  });
  await page
    .getByRole("button", { name: "Tự động tạo nhân vật", exact: true })
    .click();
  const w = page.getByRole("dialog", {
    name: "Tự động tạo nhân vật",
    exact: true,
  });
  await expect(
    w.getByRole("button", { name: "Khôi phục dự án trước", exact: true }),
  ).toBeDisabled();
  await w.getByLabel("Builder import mode").selectOption("layers");
  const names = [
    "head_base",
    "hair",
    "torso",
    "left_arm",
    "right_arm",
    "left_leg",
    "right_leg",
  ];
  const { readFile } = await import("node:fs/promises");
  await w.getByLabel("Builder images").setInputFiles(
    await Promise.all(
      names.map(async (n, i) => ({
        name: "part-" + i + ".png",
        mimeType: "image/png",
        buffer: await readFile("tests/fixtures/builder-" + n + ".png"),
      })),
    ),
  );
  await w
    .getByText("Đồng ý gửi ảnh tới Gemini; có thể phát sinh phí API Google.", {
      exact: true,
    })
    .click();
  await w
    .getByRole("button", {
      name: "Tự động tạo nhân vật bằng Gemini",
      exact: true,
    })
    .click();
  await expect(
    w.getByRole("heading", { name: "3. Duyệt 7 phần nhân vật", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(w.locator(".builder-slot-cards article")).toHaveCount(7);
  await expect(
    w.getByRole("region", { name: "Assembly readiness" }),
  ).toContainText("7/7");
  expect(mock.sent).toHaveLength(1);
  const request = mock.sent[0] as {
    candidates: unknown[];
    images: unknown[];
    overview: { data: string };
  };
  expect(request.candidates).toHaveLength(7);
  expect(request.images).toHaveLength(7);
  expect(request.overview.data).toMatch(/^data:image\/png;base64,/);
  expect(JSON.stringify(request)).not.toContain(KEY);
  await w.getByRole("button", { name: "Lắp thử", exact: true }).click();
  await expect(
    w.getByRole("button", { name: "Tạo bộ xương", exact: true }),
  ).toBeDisabled();
  await w.getByRole("button", { name: "3. Duyệt 7 phần", exact: true }).click();
  await w
    .getByRole("button", { name: "Xác nhận Tay trái", exact: true })
    .click();
  await w
    .getByRole("button", { name: "Xác nhận Tay phải", exact: true })
    .click();
  await w.getByRole("button", { name: "Lắp thử", exact: true }).click();
  await w.screenshot({ path: "work/gemini/gemini-assembled.png" });
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
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("a2dstudio.project.v1")!),
  );
  expect(saved.characterBuild.aiReview.assignments).toHaveLength(7);
  expect(saved.characterBuild.aiReview.needsReviewCandidateIds).toEqual([]);
  expect(saved.bones).toHaveLength(22);
  expect(saved.meshes).toHaveLength(5);
  expect(JSON.stringify(saved)).not.toContain(KEY);
  const { writeFile } = await import("node:fs/promises");
  await writeFile("work/gemini/ai-character.json", JSON.stringify(saved));
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("a2dstudio.project.v1")!).characterBuild
          .aiReview.model,
    ),
  ).toBe("gemini-3.8-flash");
  await page
    .getByRole("button", { name: "Tự động tạo nhân vật", exact: true })
    .click();
  const reopened = page.getByRole("dialog", {
    name: "Tự động tạo nhân vật",
    exact: true,
  });
  await expect(
    reopened.getByRole("button", {
      name: "Khôi phục dự án trước",
      exact: true,
    }),
  ).toBeEnabled();
  await reopened
    .getByRole("button", { name: "Khôi phục dự án trước", exact: true })
    .click();
  await expect(reopened).not.toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("a2dstudio.project.v1")!).projectId,
    ),
  ).toBe(original);
  expect(
    await page.evaluate(async () => {
      const path = "/packages/editor-core/src/store.ts";
      const state = (await import(path)).useEditor.getState();
      return {
        id: state.document.projectId,
        error: state.error,
        hasBuild: !!state.document.characterBuild,
      };
    }),
  ).toEqual({ id: original, error: null, hasBuild: false });
});
