import assets from "site-assets";
import { createGeminiBackend } from "./gemini";
const ai = createGeminiBackend();
export default {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/ai/")) return ai.fetch(request);
    if (path === "/api/builder/providers")
      return Response.json(
        {
          configured: false,
          ready: false,
          capabilities: [],
          providerId: null,
          model: null,
          reason:
            "Dùng Cài đặt AI để kết nối Gemini. Segmentation gateway riêng chưa được cấu hình.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (path.startsWith("/api/"))
      return Response.json(
        {
          code: "not_found",
          detail: "Endpoint chưa được hỗ trợ trên backend Sites.",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405 });
    const a = assets[path === "/" ? "/index.html" : path];
    if (!a) return new Response("Not found", { status: 404 });
    const raw = atob(a.body),
      bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Response(request.method === "HEAD" ? null : bytes, {
      headers: {
        "Content-Type": a.mime,
        "Cache-Control": path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
        "Content-Security-Policy":
          "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self'; worker-src 'self' blob:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'",
      },
    });
  },
};
