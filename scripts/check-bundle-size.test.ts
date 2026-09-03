// @vitest-environment node

import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

const temporaryDirectories: string[] = []

function createBuildAsset(name: string, size: number): string {
  const root = mkdtempSync(join(tmpdir(), "bepnha-bundle-check-"))
  temporaryDirectories.push(root)
  const assets = join(root, "dist", "assets")
  mkdirSync(assets, { recursive: true })
  writeFileSync(join(assets, name), Buffer.alloc(size))
  return root
}

function runBundleCheck(cwd: string) {
  return spawnSync(process.execPath, [resolve("scripts/check-bundle-size.mjs")], {
    cwd,
    encoding: "utf8"
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("bundle size checker", () => {
  it("accepts a JavaScript asset at the 500000 byte ceiling", () => {
    const result = runBundleCheck(createBuildAsset("app.js", 500_000))

    expect(result.status).toBe(0)
  })
})
