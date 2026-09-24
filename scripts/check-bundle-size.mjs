import console from "node:console"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

export function oversizedJavaScriptAssets(entries, maxBytes = 500_000) {
  return entries.filter((entry) => entry.name.endsWith(".js") && entry.size > maxBytes)
}

/**
 * The asset file names the entry document makes the browser fetch before it can paint.
 *
 * Scripts, module preloads and stylesheets, which is what a first visit actually pays. Route chunks
 * pulled in later by `lazy()` are not here and should not be: they are the reason code splitting
 * exists, and counting them would punish the splitting rather than the weight.
 */
export function firstLoadAssetNames(html) {
  const names = new Set()
  const pattern = /(?:src|href)\s*=\s*"([^"]+)"/gu
  for (const match of html.matchAll(pattern)) {
    const reference = match[1]
    if (reference === undefined) continue
    if (!reference.endsWith(".js") && !reference.endsWith(".css")) continue
    names.add(reference.replace(/^[./]*assets\//u, ""))
  }
  return [...names]
}

/**
 * What a first visit costs, in bytes over the wire before compression.
 *
 * The per-asset ceiling above cannot see this: twenty files of two hundred kilobytes each pass it
 * one at a time. This is the number a person on a phone actually waits for, so it is the number
 * with a budget.
 */
export function firstLoadBytes(entries, html) {
  const sizeByName = new Map(entries.map((entry) => [entry.name, entry.size]))
  return firstLoadAssetNames(html).reduce((total, name) => total + (sizeByName.get(name) ?? 0), 0)
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

/**
 * The first-load budget.
 *
 * Set just above what the app ships today, so it is a ratchet against drift rather than a target to
 * grow into. Lower it whenever a change makes room; never raise it without saying why in the commit
 * that does.
 *
 * It has already earned its keep: a routine dependency update pushed a first visit from 678 KB to
 * 736 KB and this is what noticed.
 */
export const FIRST_LOAD_MAX_BYTES = 660_000

export function runBundleSizeCheck(
  root = process.cwd(),
  maxBytes = 500_000,
  firstLoadMaxBytes = FIRST_LOAD_MAX_BYTES
) {
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

  let html
  try {
    html = readFileSync(join(root, "dist", "index.html"), "utf8")
  } catch {
    html = undefined
  }
  if (html !== undefined) {
    const firstLoad = firstLoadBytes(entries, html)
    if (firstLoad > firstLoadMaxBytes) {
      console.error(
        `First-load budget exceeded: ${firstLoad} bytes across the entry document's assets, limit ${firstLoadMaxBytes}.`
      )
      return 1
    }
    console.log(`First-load budget passed: ${firstLoad} / ${firstLoadMaxBytes} bytes.`)
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
