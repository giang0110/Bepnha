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
  it.each([499_999, 500_000])("accepts a JavaScript asset at %i bytes", (size) => {
    const result = runBundleCheck(createBuildAsset("app.js", size))

    expect(result.status).toBe(0)
  })

  it("rejects a JavaScript asset above the 500000 byte ceiling", () => {
    const result = runBundleCheck(createBuildAsset("app.js", 500_001))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Bundle ceiling exceeded")
  })

  it("ignores non-JavaScript assets above the ceiling", () => {
    const result = runBundleCheck(createBuildAsset("app.css", 600_000))

    expect(result.status).toBe(0)
  })
})

describe("first-load budget", () => {
  it("counts only what the entry document itself pulls in", async () => {
    const { firstLoadAssetNames } = await import("./check-bundle-size.mjs")
    const html = [
      '<script type="module" src="/assets/index-AAA.js"></script>',
      '<link rel="modulepreload" href="/assets/vendor-BBB.js">',
      '<link rel="stylesheet" href="/assets/index-CCC.css">',
      // A route chunk arrives later through lazy(); counting it would punish the splitting.
      "<!-- /assets/plan-page-DDD.js is not referenced here -->",
      '<link rel="icon" href="/icons/icon-192.png">'
    ].join("\n")

    expect(firstLoadAssetNames(html).sort()).toEqual([
      "index-AAA.js",
      "index-CCC.css",
      "vendor-BBB.js"
    ])
  })

  it("sums the bytes of those assets and ignores the rest of the directory", async () => {
    const { firstLoadBytes } = await import("./check-bundle-size.mjs")
    const entries = [
      { name: "index-AAA.js", size: 1000 },
      { name: "vendor-BBB.js", size: 2000 },
      { name: "lazy-route-DDD.js", size: 900_000 }
    ]
    const html =
      '<script src="/assets/index-AAA.js"></script><link rel="modulepreload" href="/assets/vendor-BBB.js">'

    expect(firstLoadBytes(entries, html)).toBe(3000)
  })

  it("fails the build when a first visit grows past the budget", async () => {
    const { runBundleSizeCheck } = await import("./check-bundle-size.mjs")
    const root = createBuildAsset("index-AAA.js", 120)
    writeFileSync(
      join(root, "dist", "index.html"),
      '<script type="module" src="/assets/index-AAA.js"></script>'
    )

    // The per-asset ceiling cannot see this: twenty files of two hundred kilobytes each pass it one
    // at a time, and a phone still waits for all twenty.
    expect(runBundleSizeCheck(root, 500_000, 100)).toBe(1)
    expect(runBundleSizeCheck(root, 500_000, 500)).toBe(0)
  })

  it("stays quiet when there is no entry document to read", async () => {
    const { runBundleSizeCheck } = await import("./check-bundle-size.mjs")
    const root = createBuildAsset("index-AAA.js", 120)

    expect(runBundleSizeCheck(root, 500_000, 1)).toBe(0)
  })
})
