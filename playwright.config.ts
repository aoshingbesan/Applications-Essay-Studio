import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real app against a local fake of the Supabase APIs and
// deterministic AI fixtures, so they need no external services or paid API calls.
// To run against a real Supabase project instead, set E2E_BASE_URL to a running deployment
// configured with AI_MOCK_RESPONSES=1 (non-production only) and skip the web servers.
const PORT = 3100;
const SUPABASE_PORT = 54329;
const external = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: external
    ? undefined
    : [
        {
          command: "pnpm exec tsx tests/e2e/fake-supabase-server.ts",
          url: `http://127.0.0.1:${SUPABASE_PORT}/__reset`,
          env: { FAKE_SUPABASE_PORT: String(SUPABASE_PORT) },
          reuseExistingServer: false,
        },
        {
          command: `pnpm exec next dev --port ${PORT}`,
          url: `http://127.0.0.1:${PORT}/login`,
          timeout: 180_000,
          reuseExistingServer: false,
          env: {
            NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPABASE_PORT}`,
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-test-key",
            AI_MOCK_RESPONSES: "1",
            AI_RATE_LIMIT_PER_HOUR: "500",
          },
        },
      ],
});
