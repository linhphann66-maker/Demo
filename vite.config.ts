import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      ignored: [
        "**/docs/**",
        "**/tests/**",
        "**/work/**",
        "**/apps/api/**",
        "**/apps/worker/**",
        "**/scripts/**",
        "**/.openai/**",
        "**/*.test.ts",
        "**/README.md",
        "**/AGENTS.md",
      ],
    },
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/pixi.js/")) return "pixi";
          if (id.includes("/node_modules/zod/")) return "validation";
        },
      },
    },
  },
});
