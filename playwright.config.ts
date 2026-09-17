import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  // Production smoke lives under tests/production and runs from playwright.production.config.ts.
  // Excluding it here is what stops an ordinary `npm run test:e2e` from reaching a live site.
  testIgnore: "**/production/**",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" }
    }
  ],
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY:
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "local-public-playwright-placeholder"
    },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI
  }
})
