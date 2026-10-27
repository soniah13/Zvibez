import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside a Next server build; tests run in plain Node.
      "server-only": fileURLToPath(new URL("./test-support/empty.ts", import.meta.url)),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
