import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    env: { DATABASE_URL: "pglite:memory" },
    // Node 25+ ships its own localStorage/sessionStorage globals, which shadow the DOM test environment's.
    execArgv: ["--no-experimental-webstorage"],
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/.react-router/**",
    ],
  },
});
