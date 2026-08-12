/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

/**
 * The e2e suite, kept apart from the unit one on purpose.
 *
 * These tests need a built binary, a WebDriver, and a desktop with a real
 * mouse on it. `npm test` needs none of those and must keep needing none of
 * them, so the two never share a config: `vite.config.ts` includes `src` only,
 * and this includes `e2e` only.
 */
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    environment: "node",
    globals: true,
    // One desktop, one cursor. Two of these running at once would drag each
    // other's windows, so files run one after another rather than in parallel.
    fileParallelism: false,
    // Launching a real app past a real WebDriver is seconds, not milliseconds,
    // and a first launch on a cold machine is more than that.
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
