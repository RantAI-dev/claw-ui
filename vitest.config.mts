import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // `node` by default; a component test opts into jsdom with a
    // `// @vitest-environment jsdom` docblock. Switching the whole suite to
    // jsdom would slow every pure-function test for the sake of a few.
    environment: "node",
    // `.tsx` was not collected at all, so no React component in this repo could
    // be tested even if a test existed — and none did.
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      // Let unit tests import server-only modules (the real package throws
      // outside an RSC bundler).
      "server-only": fileURLToPath(new URL("./src/test-stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
