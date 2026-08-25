/* global process */

import { existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"

const requireDatabase = process.argv.includes("--require-database")
const localSupabaseCli = join(process.cwd(), "node_modules", "supabase", "dist", "supabase.js")

function isExecutable(command, args) {
  try {
    execFileSync(command, args, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function isNpmExecutable() {
  if (process.platform === "win32") {
    return isExecutable(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm --version"])
  }

  return isExecutable("npm", ["--version"])
}

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10)
const nodeValid = nodeMajor === 24
const npmValid = nodeValid && isNpmExecutable()
const dockerVersionAvailable = npmValid && isExecutable("docker", ["version"])
const dockerInfoAvailable = dockerVersionAvailable && isExecutable("docker", ["info"])
const supabaseCliValid =
  npmValid &&
  existsSync(localSupabaseCli) &&
  isExecutable(process.execPath, [localSupabaseCli, "--version"])

if (!nodeValid || !npmValid || !supabaseCliValid) {
  process.exitCode = 1
} else {
  const capability = dockerInfoAvailable
    ? "LOCAL_DB_VERIFICATION_AVAILABLE"
    : "LOCAL_DB_VERIFICATION_UNAVAILABLE"

  process.stdout.write(`${capability}\n`)

  if (requireDatabase && !dockerInfoAvailable) {
    process.exitCode = 1
  }
}
