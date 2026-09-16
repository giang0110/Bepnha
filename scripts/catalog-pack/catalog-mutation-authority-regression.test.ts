import { readFileSync } from "node:fs"

import { describe, expect, test } from "vitest"

const phase9CFiles = [
  "scripts/catalog-pack/catalog-mutation-manifest-parser.ts",
  "scripts/catalog-pack/catalog-mutation-planner.ts",
  "scripts/catalog-pack/catalog-mutation-cli.ts"
]

const forbidden = [
  /@supabase\/supabase-js/u,
  /createClient\s*\(/u,
  /\.rpc\s*\(/u,
  /\.insert\s*\(/u,
  /\.upsert\s*\(/u,
  /\.update\s*\(/u,
  /\.delete\s*\(/u,
  /process\.env/u,
  /SUPABASE_/u,
  /GEMINI_/u,
  /fetch\s*\(/u,
  /randomUUID\s*\(/u,
  /api\/admin/u,
  /supabase-catalog-admin-repository/u,
  /supabase-meal-option-admin-repository/u,
  /executeCatalogAdminCommand/u,
  /executeMealOptionAdminCommand/u
]

describe("Phase 9C authority boundary", () => {
  test.each(phase9CFiles)("keeps %s offline and non-mutating", (path) => {
    const source = readFileSync(path, "utf8")
    for (const pattern of forbidden) expect(source).not.toMatch(pattern)
  })

  test("keeps catalog:plan pinned to the local Phase 9C CLI", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      readonly scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.["catalog:plan"]).toBe(
      "node scripts/catalog-pack/catalog-mutation-cli.ts"
    )
  })
})
