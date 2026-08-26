import { spawnSync } from "node:child_process"
import process from "node:process"
import { fileURLToPath, URL } from "node:url"
import { resolve } from "node:path"

function parseStatus(output) {
  const values = new Map()
  for (const line of output.split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|'([^']*)'|(.*))$/u.exec(line.trim())
    if (match === null) continue
    values.set(match[1], match[2] ?? match[3] ?? match[4] ?? "")
  }
  return values
}

function isLoopbackHttpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]")
    )
  } catch {
    return false
  }
}

/**
 * @param {string} statusOutput
 * @returns {{ SUPABASE_URL: string, SUPABASE_PUBLISHABLE_KEY: string, VITE_SUPABASE_URL: string, VITE_SUPABASE_PUBLISHABLE_KEY: string }}
 */
export function localPublicEnvironmentFromStatus(statusOutput) {
  const status = parseStatus(statusOutput)
  const url = status.get("API_URL")
  const publishableKey = status.get("PUBLISHABLE_KEY") ?? status.get("ANON_KEY")
  if (
    url === undefined ||
    !isLoopbackHttpUrl(url) ||
    publishableKey === undefined ||
    publishableKey === ""
  ) {
    throw new Error("Local Supabase public configuration is unavailable or not loopback-only.")
  }
  return {
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey
  }
}

function executableForPlatform(command) {
  return process.platform === "win32" && command === "npx" ? "npx.cmd" : command
}

function readStatusFromCli() {
  const result = spawnSync(executableForPlatform("npx"), ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    shell: false,
    windowsHide: true
  })
  if (result.error !== undefined || result.status !== 0 || typeof result.stdout !== "string") {
    throw new Error("Local Supabase status is unavailable. Start the local stack before this gate.")
  }
  return result.stdout
}

function spawnChild(command, args, environment) {
  const result = spawnSync(executableForPlatform(command), args, {
    env: environment,
    shell: false,
    stdio: "inherit",
    windowsHide: true
  })
  if (result.error !== undefined) {
    throw new Error(`Unable to launch local verification child command: ${result.error.message}`)
  }
  return result.status ?? 1
}

/**
 * @typedef {object} LocalCommandDependencies
 * @property {() => string} readStatus
 * @property {(command: string, args: string[], environment: NodeJS.ProcessEnv) => number} spawnCommand
 * @property {NodeJS.ProcessEnv} inheritedEnvironment
 * @property {(message: string) => void} log
 */

/**
 * @param {string[]} commandArguments
 * @param {Partial<LocalCommandDependencies>} dependencies
 * @returns {number}
 */
export function runWithLocalSupabase(commandArguments, dependencies = {}) {
  const argumentsWithoutSeparator =
    commandArguments[0] === "--" ? commandArguments.slice(1) : commandArguments
  const [command, ...args] = argumentsWithoutSeparator
  if (command === undefined || command === "") {
    throw new Error("A child command is required after --.")
  }
  const readStatus = dependencies.readStatus ?? readStatusFromCli
  const runChild = dependencies.spawnCommand ?? spawnChild
  const inheritedEnvironment = dependencies.inheritedEnvironment ?? process.env
  const log = dependencies.log ?? globalThis.console.log
  const publicEnvironment = localPublicEnvironmentFromStatus(readStatus())
  log("Using ephemeral loopback Supabase public configuration.")
  return runChild(command, args, { ...inheritedEnvironment, ...publicEnvironment })
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    process.exitCode = runWithLocalSupabase(process.argv.slice(2))
  } catch (error) {
    globalThis.console.error(
      error instanceof Error ? error.message : "Local Supabase verification failed."
    )
    process.exitCode = 1
  }
}
