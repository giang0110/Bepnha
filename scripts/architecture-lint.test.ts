import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import { ESLint } from "eslint"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

let eslint: ESLint | undefined
const fixturePaths = [
  "src/domain/architecture-lint.fixture.ts",
  "src/application/architecture-lint.fixture.ts",
  "src/app/architecture-lint.fixture.ts",
  "src/infrastructure/architecture-lint.fixture.ts",
  "src/features/architecture-lint-alpha/architecture-lint.fixture.ts",
  "src/features/architecture-lint-alpha/nested/architecture-lint.fixture.ts",
  "src/features/architecture-lint-beta/architecture-lint.fixture.ts",
  "api/architecture-lint.fixture.ts"
]

beforeAll(async () => {
  await Promise.all(
    fixturePaths.map(async (filePath) => {
      const absolutePath = resolve(filePath)

      await mkdir(dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, "export {}\n")
    })
  )
  eslint = new ESLint({ cwd: process.cwd() })
})

afterAll(async () => {
  await Promise.all(fixturePaths.map((filePath) => rm(resolve(filePath), { force: true })))
  await Promise.all([
    rm(resolve("src/features/architecture-lint-alpha"), { recursive: true, force: true }),
    rm(resolve("src/features/architecture-lint-beta"), { recursive: true, force: true })
  ])
})

async function lintRuleIds(code: string, filePath: string): Promise<string[]> {
  if (eslint === undefined) {
    throw new Error("ESLint must be created after fixture directories exist")
  }
  const results = await eslint.lintText(code, { filePath })
  const result = results[0]
  if (result === undefined) {
    throw new Error(`ESLint returned no result for ${filePath}`)
  }

  return result.messages.flatMap((message) => (message.ruleId === null ? [] : [message.ruleId]))
}

async function expectRejected(code: string, filePath: string): Promise<void> {
  await expect(lintRuleIds(code, filePath)).resolves.toContain("no-restricted-imports")
}

describe("architecture lint boundaries", () => {
  test("rejects React and browser globals in domain modules", async () => {
    await expectRejected("import React from 'react'", "src/domain/architecture-lint.fixture.ts")
    await expectRejected(
      "import { createClient } from '@supabase/supabase-js'",
      "src/domain/architecture-lint.fixture.ts"
    )
    await expectRejected(
      "import type { VercelRequest } from '@vercel/node'",
      "src/domain/architecture-lint.fixture.ts"
    )
    await expect(
      lintRuleIds("window.location.href", "src/domain/architecture-lint.fixture.ts")
    ).resolves.toContain("no-restricted-globals")
    await expect(
      lintRuleIds("const environment = import.meta.env", "src/domain/architecture-lint.fixture.ts")
    ).resolves.toContain("no-restricted-syntax")
  }, 30_000)

  test("rejects React imports in application modules", async () => {
    await expectRejected(
      "import { useState } from 'react'",
      "src/application/architecture-lint.fixture.ts"
    )
    await expectRejected(
      "import { createRoot } from 'react-dom/client'",
      "src/application/architecture-lint.fixture.ts"
    )
    await expectRejected(
      "import { createClient } from '@supabase/supabase-js'",
      "src/application/architecture-lint.fixture.ts"
    )
    await expectRejected(
      "import type { VercelRequest } from '@vercel/node'",
      "src/application/architecture-lint.fixture.ts"
    )
  })

  test("rejects platform SDK imports in feature modules", async () => {
    await expectRejected(
      "import { createClient } from '@supabase/supabase-js'",
      "src/features/architecture-lint-alpha/architecture-lint.fixture.ts"
    )
    await expectRejected(
      "import type { VercelRequest } from '@vercel/node'",
      "src/features/architecture-lint-alpha/architecture-lint.fixture.ts"
    )
  })

  test("rejects React imports in infrastructure and API modules", async () => {
    await expectRejected(
      "import { useState } from 'react'",
      "src/infrastructure/architecture-lint.fixture.ts"
    )
    await expectRejected(
      "import { createRoot } from 'react-dom/client'",
      "src/infrastructure/architecture-lint.fixture.ts"
    )
    await expectRejected("import { useState } from 'react'", "api/architecture-lint.fixture.ts")
    await expectRejected(
      "import { createRoot } from 'react-dom/client'",
      "api/architecture-lint.fixture.ts"
    )
  }, 15_000)

  test("rejects server API imports from app modules", async () => {
    await expectRejected("import '@/api/health'", "src/app/architecture-lint.fixture.ts")
    await expectRejected("import '../../api/health'", "src/app/architecture-lint.fixture.ts")
    await expectRejected(
      "import '@/infrastructure/server/node-content-hasher'",
      "src/app/architecture-lint.fixture.ts"
    )
    await expectRejected(
      "import '../../infrastructure/server/node-content-hasher'",
      "src/app/architecture-lint.fixture.ts"
    )
  })

  test("permits API composition to import server infrastructure", async () => {
    await expect(
      lintRuleIds(
        "import '@/infrastructure/server/node-content-hasher'",
        "api/architecture-lint.fixture.ts"
      )
    ).resolves.not.toContain("no-restricted-imports")
  })

  test.each([
    ["domain", "src/domain/architecture-lint.fixture.ts", "../../app/App"],
    [
      "domain",
      "src/domain/architecture-lint.fixture.ts",
      "../../features/architecture-lint-alpha/internal"
    ],
    ["domain", "src/domain/architecture-lint.fixture.ts", "../../application/use-case"],
    ["domain", "src/domain/architecture-lint.fixture.ts", "../../infrastructure/adapter"],
    ["application", "src/application/architecture-lint.fixture.ts", "../../app/App"],
    [
      "application",
      "src/application/architecture-lint.fixture.ts",
      "../../features/architecture-lint-alpha/internal"
    ],
    ["application", "src/application/architecture-lint.fixture.ts", "../../infrastructure/adapter"],
    ["infrastructure", "src/infrastructure/architecture-lint.fixture.ts", "../../app/App"],
    [
      "infrastructure",
      "src/infrastructure/architecture-lint.fixture.ts",
      "../../features/architecture-lint-alpha/internal"
    ],
    [
      "features",
      "src/features/architecture-lint-alpha/architecture-lint.fixture.ts",
      "../../infrastructure/adapter"
    ],
    [
      "features",
      "src/features/architecture-lint-alpha/architecture-lint.fixture.ts",
      "../architecture-lint-beta/internal"
    ],
    ["api", "api/architecture-lint.fixture.ts", "../src/app/App"],
    ["api", "api/architecture-lint.fixture.ts", "../src/features/architecture-lint-alpha/internal"]
  ])("rejects %s relative layer escape to %s", async (_boundary, filePath, importPath) => {
    await expectRejected(`import '${importPath}'`, filePath)
  })

  test("allows same-boundary relative imports and domain imports", async () => {
    await expect(
      lintRuleIds("import './local'", "src/domain/architecture-lint.fixture.ts")
    ).resolves.not.toContain("no-restricted-imports")
    await expect(
      lintRuleIds(
        "import type { Recipe } from '@/domain/recipe'",
        "src/application/architecture-lint.fixture.ts"
      )
    ).resolves.not.toContain("no-restricted-imports")
    await expect(
      lintRuleIds(
        "import '../shared'",
        "src/features/architecture-lint-alpha/nested/architecture-lint.fixture.ts"
      )
    ).resolves.not.toContain("no-restricted-imports")
  })
})
