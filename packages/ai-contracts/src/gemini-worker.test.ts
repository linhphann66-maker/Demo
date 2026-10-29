import { describe, it, expect, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { createGeminiBackend } from "../../../apps/worker/gemini";
import {
  type AISettings,
  type AIJob,
  validateAIAnalysis,
  type AnalyzeRequest,
} from "./gemini";
const KEY = "AIza-MOCK-KEY-NOT-REAL-DO-NOT-USE";
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zN8AAAAASUVORK5CYII=";
const slots = [
  "head",
  "hair",
  "torso",
  "left_arm",
  "right_arm",
  "left_leg",
  "right_leg",
] as const;
function body(): AnalyzeRequest {
  const image = {
    id: crypto.randomUUID(),
    name: "source",
    data: PNG,
    width: 1,
    height: 1,
  };
  return {
    images: [image],
    overview: { ...image, id: crypto.randomUUID() },
    candidates: slots.map(() => ({
      id: crypto.randomUUID(),
      sourceAssetId: image.id,
      bbox: { x: 0, y: 0, width: 1, height: 1 },
      image: { ...image, id: crypto.randomUUID() },
    })),
    consent: true,
  };
}
const analysis = (b: AnalyzeRequest) => ({
  viewpoint: "side_3_4",
  facing: "right",
  assignments: b.candidates.map((c, i) => ({
    candidateId: c.id,
    slot: slots[i],
    confidence: 0.95,
    lateralityCertain: true,
    depth: "unknown",
    warnings: [],
  })),
  ambiguousCandidateIds: [],
  missingSlots: [],
  renderOrder: b.candidates.map((c) => c.id),
  anchors: [],
  warnings: [],
});
function harness() {
  let clock = 0,
    analysisBody: AnalyzeRequest,
    calls = 0,
    fail = 0;
  const keys: string[] = [];
  const sdk = {
    models: {
      async *list() {
        yield {
          name: "models/gemini-3.8-flash",
          supportedActions: ["generateContent"],
        };
        yield {
          name: "models/gemini-nano-banana-2.1",
          supportedActions: ["generateContent"],
        };
      },
      async generateContent(request: unknown) {
        calls++;
        if (fail) throw { status: fail, message: "DO NOT ECHO " + KEY };
        const input = JSON.stringify(request);
        expect(input).not.toContain(KEY);
        return {
          text: JSON.stringify(
            input.includes("imageSeen")
              ? { imageSeen: true }
              : analysis(analysisBody),
          ),
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 12 },
        };
      },
    },
  };
  const backend = createGeminiBackend({
    now: () => clock,
    client: (key) => {
      keys.push(key);
      return sdk as unknown as GoogleGenAI;
    },
  });
  function browser(owner = "alice") {
    let cookie = "",
      csrf = "";
    const request = async (
      path: string,
      method = "GET",
      data?: unknown,
      headers: Record<string, string> = {},
    ) => {
      const r = await backend.fetch(
        new Request("https://studio.example/api/ai" + path, {
          method,
          headers: {
            "oai-authenticated-user-id": owner,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
            ...(data ? { "Content-Type": "application/json" } : {}),
            ...headers,
          },
          ...(data ? { body: JSON.stringify(data) } : {}),
        }),
      );
      if (r.headers.get("Set-Cookie"))
        cookie = r.headers.get("Set-Cookie")!.split(";")[0];
      const value = await r.json();
      if (value.csrfToken) csrf = value.csrfToken;
      return { r, value };
    };
    return {
      request,
      async configure() {
        await request("/settings");
        await request("/key/test", "POST", { apiKey: KEY });
        return request("/key", "PUT", { apiKey: KEY });
      },
      getCookie: () => cookie,
    };
  }
  return {
    backend,
    browser,
    setClock: (v: number) => (clock = v),
    setBody: (b: AnalyzeRequest) => {
      analysisBody = b;
    },
    calls: () => calls,
    keys,
    setFail: (v: number) => (fail = v),
  };
}
describe("hosted same-origin Gemini backend (mock Google SDK)", () => {
  it("defers asynchronous crypto until an actual request, as required by Cloudflare", async () => {
    const cryptoSpy = vi.spyOn(crypto.subtle, "generateKey");
    try {
      const h = harness();
      expect(cryptoSpy).not.toHaveBeenCalled();
      const b = h.browser();
      await b.request("/settings");
      expect(cryptoSpy).not.toHaveBeenCalled();
      await b.configure();
      expect(cryptoSpy).toHaveBeenCalledTimes(1);
    } finally {
      cryptoSpy.mockRestore();
    }
  });
  it("keeps rate limits across sessions for the same hosted identity", async () => {
    const h = harness(),
      first = h.browser();
    await first.configure();
    for (let i = 0; i < 8; i++)
      expect((await first.request("/models")).r.status).toBe(200);
    const second = h.browser();
    await second.request("/settings");
    expect(
      (await second.request("/key/test", "POST", { apiKey: KEY })).r.status,
    ).toBe(429);
  });
  it("expires abandoned queued jobs so capacity and uploaded images are released", async () => {
    const h = harness(),
      b = h.browser(),
      input = body();
    h.setBody(input);
    await b.configure();
    const created = await b.request("/character/analyze", "POST", input);
    h.setClock(90001);
    const status = await b.request("/jobs/" + created.value.id);
    expect(status.value.state).toBe("failed");
    expect(status.value.errorCode).toBe("timeout");
    expect(
      (await b.request("/character/analyze", "POST", input)).r.status,
    ).toBe(202);
  });
  it("never replaces active credentials or model settings merely by testing an unsaved key", async () => {
    const h = harness(),
      b = h.browser();
    await b.configure();
    const tested = await b.request("/key/test", "POST", {
      apiKey: KEY + "replacement",
      visionModel: "unavailable-model",
    });
    expect(tested.value.status).toBe("model_unavailable");
    const current = await b.request("/settings");
    expect(current.value.visionModel).toBe("gemini-3.8-flash");
    expect(current.value.capabilities.imageUnderstanding).toBe(true);
    const saved = await b.request("/key", "PUT", {
      apiKey: KEY + "replacement",
      visionModel: "unavailable-model",
    });
    expect(saved.value.visionModel).toBe("unavailable-model");
    expect(saved.value.capabilities.imageUnderstanding).toBe(false);
  });
  it("uses secure cookies, temporary encrypted sessions and independent capability probes", async () => {
    const h = harness(),
      b = h.browser();
    const first = await b.request("/settings");
    expect(first.r.headers.get("set-cookie")).toMatch(
      /HttpOnly; Secure; SameSite=Strict/,
    );
    expect(first.r.headers.get("cache-control")).toBe("no-store");
    const { value } = await b.configure();
    expect(value.configured).toBe(true);
    expect(value.capabilities).toEqual({
      imageUnderstanding: true,
      structuredOutput: true,
      imageEditing: false,
      imageGeneration: false,
    });
    expect(JSON.stringify(value)).not.toContain(KEY);
    expect(h.keys).toEqual([KEY, KEY]);
    expect(
      (await b.request("/key", "PUT", { apiKey: KEY, persist: true })).r.status,
    ).toBe(409);
    expect((await b.request("/key", "DELETE")).value.configured).toBe(false);
    expect((await b.request("/models")).value.code).toBe("missing_key");
  });
  it("isolates accounts, rejects missing identity, cross-origin and CSRF, and expires sessions", async () => {
    const h = harness(),
      a = h.browser(),
      b = h.browser("bob");
    await a.configure();
    expect((await b.request("/settings")).value.configured).toBe(false);
    const noIdentity = await h.backend.fetch(
      new Request("https://studio.example/api/ai/settings"),
    );
    expect(noIdentity.status).toBe(401);
    expect(
      (await a.request("/key", "DELETE", undefined, { "X-CSRF-Token": "bad" }))
        .r.status,
    ).toBe(403);
    expect(
      (
        await a.request("/key", "DELETE", undefined, {
          Origin: "https://evil.example",
        })
      ).r.status,
    ).toBe(403);
    expect(
      (
        await a.request("/settings", "GET", undefined, {
          "oai-authenticated-user-id": "bob",
        })
      ).r.status,
    ).toBe(401);
    h.setClock(3600_001);
    expect((await a.request("/models")).value.code).toBe("session_expired");
    expect((await a.request("/settings")).value.configured).toBe(false);
  });
  it("executes seven-part jobs, validates real references and caches per session", async () => {
    const h = harness(),
      a = h.browser(),
      b = h.browser("bob"),
      input = body();
    h.setBody(input);
    await a.configure();
    await b.request("/settings");
    const start = await a.request("/character/analyze", "POST", input);
    expect(start.r.status).toBe(202);
    const id = start.value.id;
    expect((await b.request("/jobs/" + id)).r.status).toBe(404);
    const done = await a.request("/jobs/" + id + "/run", "POST");
    expect((done.value as AIJob).result?.analysis.assignments).toHaveLength(7);
    expect(h.calls()).toBe(2);
    const cache = await a.request("/character/analyze", "POST", input);
    expect(cache.value.result.cached).toBe(true);
    expect(h.calls()).toBe(2);
    expect((await a.request("/settings")).value.usage).toHaveLength(3);
    expect(JSON.stringify(done.value)).not.toContain(KEY);
  });
  it("reports unavailable models without substitution, sanitized quota errors and unsupported image workflow", async () => {
    const h = harness(),
      b = h.browser();
    await b.request("/settings");
    const unavailable = await b.request("/key/test", "POST", {
      apiKey: KEY,
      visionModel: "does-not-exist",
    });
    expect((unavailable.value as AISettings).status).toBe("model_unavailable");
    expect(h.calls()).toBe(0);
    h.setFail(429);
    const quota = await b.request("/key/test", "POST", { apiKey: KEY });
    expect(quota.r.status).toBe(429);
    expect(quota.value.code).toBe("quota_exceeded");
    expect(JSON.stringify(quota.value)).not.toContain(KEY);
    expect((await b.request("/joint/repair", "POST")).r.status).toBe(501);
  });
  it("cancels queued jobs and rejects MIME/header mismatches without spending tokens", async () => {
    const h = harness(),
      b = h.browser(),
      input = body();
    await b.configure();
    h.setBody(input);
    const j = await b.request("/character/analyze", "POST", input);
    expect(
      (await b.request("/jobs/" + j.value.id + "/cancel", "POST")).value.state,
    ).toBe("cancelled");
    expect(
      (await b.request("/jobs/" + j.value.id + "/run", "POST")).value.state,
    ).toBe("cancelled");
    expect(h.calls()).toBe(1);
    input.overview.data = input.overview.data.replace(
      "image/png",
      "image/jpeg",
    );
    expect(
      (await b.request("/character/analyze", "POST", input)).value.code,
    ).toBe("invalid_image");
    expect(h.calls()).toBe(1);
  });
  it("enforces one-to-one assignments and missing-slot consistency", () => {
    const b = body(),
      r = analysis(b);
    expect(() => validateAIAnalysis(r, b)).not.toThrow();
    r.assignments[1].candidateId = r.assignments[0].candidateId;
    expect(() => validateAIAnalysis(r, b)).toThrow();
    const other = analysis(b);
    other.renderOrder[0] = crypto.randomUUID();
    expect(() => validateAIAnalysis(other, b)).toThrow();
  });
});
