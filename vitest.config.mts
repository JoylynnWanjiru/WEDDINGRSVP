import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Test-only values. Real secrets live in .env.local and are never read by tests.
    env: {
      TOKEN_SECRET: "test-secret-test-secret-test-secret-0123456789",
      APP_URL: "https://wedding.test",
      CRON_SECRET: "test-cron-secret",
    },
  },
});
