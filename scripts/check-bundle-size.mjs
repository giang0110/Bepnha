import console from "node:console"
import { readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

export function oversizedJavaScriptAssets(entries, maxBytes = 500_000) {
  return entries.filter((entry) => entry.name.endsWith(".js") && entry.size > maxBytes)
}

function readBuildAssets(root = process.cwd()) {
  const assetsDirectory = join(root, "dist", "assets")
  return readdirSync(assetsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      name: entry.name,
      size: statSync(join(assetsDirectory, entry.name)).size
    }))
}

export function runBundleSizeCheck(root = process.cwd(), maxBytes = 500_000) {
  let entries
  try {
    entries = readBuildAssets(root)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Bundle ceiling check unavailable: ${message}`)
    return 1
  }

  const oversized = oversizedJavaScriptAssets(entries, maxBytes)
  if (oversized.length > 0) {
    console.error("Bundle ceiling exceeded:")
    for (const entry of oversized) {
      console.error(`- ${entry.name}: ${entry.size} bytes`)
    }
    return 1
  }

  const javaScriptAssets = entries
    .filter((entry) => entry.name.endsWith(".js"))
    .sort((left, right) => right.size - left.size)
  const largest = javaScriptAssets[0]
  console.log(
    largest === undefined
      ? "Bundle ceiling check passed: no JavaScript assets found."
      : `Bundle ceiling check passed. Largest JavaScript asset: ${largest.name} (${largest.size} bytes).`
  )
  return 0
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath)) {
  process.exitCode = runBundleSizeCheck()
}
