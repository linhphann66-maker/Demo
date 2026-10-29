import { it, expect } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { createGeminiBackend } from "../../../apps/worker/gemini";
it.each([
  "User location is not supported for the API use.",
  "Unknown invalid argument with mock-secret-key-123456",
])("surfaces real SDK HTTP400 diagnostics safely: %s", async (message) => {
  const key = "mock-secret-key-123456";
  let calls = 0;
  const backend = createGeminiBackend({
    client: (key) =>
      new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          retryOptions: { attempts: 1 },
          fetch: async () => {
            calls++;
            return new Response(
              JSON.stringify({
                error: { code: 400, status: "INVALID_ARGUMENT", message },
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          },
        },
      }),
  });
  const headers = { "oai-authenticated-user-id": "test-owner" };
  const first = await backend.fetch(
      new Request("https://studio.test/api/ai/settings", { headers }),
    ),
    s = await first.json();
  const cookie = first.headers.get("Set-Cookie")!.split(";")[0];
  const r = await backend.fetch(
    new Request("https://studio.test/api/ai/key/test", {
      method: "POST",
      headers: {
        ...headers,
        Cookie: cookie,
        "X-CSRF-Token": s.csrfToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey: key }),
    }),
  );
  const result = await r.json();
  expect(calls).toBe(1);
  expect(r.status).toBe(400);
  expect(result.detail).toContain("Bước lấy danh sách model");
  expect(JSON.stringify(result)).not.toContain(key);
  expect(result.code).toBe(
    message.startsWith("User location")
      ? "region_unavailable"
      : "provider_request",
  );
});
