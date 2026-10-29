import { it, expect } from "vitest";
import { googleDiagnostic } from "./gemini-errors";
it.each([
  ["User location is not supported for the API use.", "region_unavailable"],
  ["API key expired.", "key_expired"],
  ["API_KEY_HTTP_REFERRER_BLOCKED", "key_restricted"],
  ["API_KEY_SERVICE_BLOCKED", "api_disabled"],
  ["API key not valid.", "invalid_key"],
])("classifies Google rejection %s", (message, code) => {
  expect(googleDiagnostic({ status: 400, message })?.code).toBe(code);
});
it("redacts exact credentials, encoded credentials and URLs from structured HTTP 400 errors", () => {
  const key = "test-secret-with-spaces 123456",
    error = {
      status: 400,
      message: JSON.stringify({
        error: {
          message:
            "Invalid input " +
            key +
            " " +
            encodeURIComponent(key) +
            " https://example.com/?key=" +
            key,
        },
      }),
    };
  const result = googleDiagnostic(error, key)!;
  expect(result.message).not.toContain(key);
  expect(result.message).not.toContain(encodeURIComponent(key));
  expect(result.message).not.toContain("https://");
  expect(result.message).toContain("Invalid input");
  expect(googleDiagnostic(error)?.message).not.toContain("test-secret");
});
