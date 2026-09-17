import { defineConfig } from "@playwright/test"

/**
 * Read-only smoke checks against a deployed environment, kept in its own config so the ordinary
 * end-to-end run can never point at production by accident: the default config owns `tests/` and
 * ignores this directory, and this one starts no web server of its own.
 *
 * Nothing here signs up, signs in, or writes. Production data belongs to real households, and a
 * smoke test that created an account would leave one behind every time it ran.
 */

const baseURL = process.env.BEPNHA_PRODUCTION_URL

if (baseURL === undefined || baseURL === "") {
  throw new Error(
    "Set BEPNHA_PRODUCTION_URL to the deployed origin, e.g. https://bepnhatoi.vercel.app"
  )
}

export default defineConfig({
  testDir: "./tests/production",
  retries: 1,
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }]
})
