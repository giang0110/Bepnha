import { spawnSync } from "node:child_process"
import process from "node:process"
import { resolve } from "node:path"
import { fileURLToPath, URL } from "node:url"

/** @param {string} output */
function parseStatus(output) {
  const values = new Map()
  for (const line of output.split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|'([^']*)'|(.*))$/u.exec(line.trim())
    if (match !== null) values.set(match[1], match[2] ?? match[3] ?? match[4] ?? "")
  }
  return values
}

/** @param {string} rawUrl */
function isLoopbackHttpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
  } catch {
    return false
  }
}

/**
 * @param {string} statusOutput
 * @returns {{ SUPABASE_URL: string, SUPABASE_PUBLISHABLE_KEY: string, SUPABASE_SECRET_KEY: string }}
 */
export function localAdminEnvironmentFromStatus(statusOutput) {
  const values = parseStatus(statusOutput)
  const url = values.get("API_URL")
  const publishableKey = values.get("PUBLISHABLE_KEY") ?? values.get("ANON_KEY")
  const secretKey = values.get("SECRET_KEY") ?? values.get("SERVICE_ROLE_KEY")
  if (
    url === undefined ||
    !isLoopbackHttpUrl(url) ||
    publishableKey === undefined ||
    publishableKey === "" ||
    secretKey === undefined ||
    secretKey === ""
  ) {
    throw new Error(
      "Local Supabase administrator configuration is unavailable or not loopback-only."
    )
  }
  return {
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey
  }
}

/** @param {string} command */
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
    throw new Error("Local Supabase administrator status is unavailable.")
  }
  return result.stdout
}

/** @param {string} command @param {string[]} args @param {NodeJS.ProcessEnv} environment */
function spawnChild(command, args, environment) {
  const result = spawnSync(executableForPlatform(command), args, {
    env: environment,
    shell: false,
    stdio: "inherit",
    windowsHide: true
  })
  if (result.error !== undefined) {
    throw new Error("Unable to launch local administrator verification child command.")
  }
  return result.status ?? 1
}

/**
 * @typedef {object} LocalAdminCommandDependencies
 * @property {() => string} readStatus
 * @property {(command: string, args: string[], environment: NodeJS.ProcessEnv) => number} spawnCommand
 * @property {NodeJS.ProcessEnv} inheritedEnvironment
 * @property {(message: string) => void} log
 */

/**
 * @param {string[]} commandArguments
 * @param {Partial<LocalAdminCommandDependencies>} dependencies
 * @returns {number}
 */
export function runWithLocalSupabaseAdmin(commandArguments, dependencies = {}) {
  const childArguments = commandArguments[0] === "--" ? commandArguments.slice(1) : commandArguments
  const [command, ...args] = childArguments
  if (command === undefined || command === "")
    throw new Error("A child command is required after --.")
  const readStatus = dependencies.readStatus ?? readStatusFromCli
  const runChild = dependencies.spawnCommand ?? spawnChild
  const inheritedEnvironment = { ...(dependencies.inheritedEnvironment ?? process.env) }
  const log = dependencies.log ?? globalThis.console.log
  for (const key of Object.keys(inheritedEnvironment)) {
    if (/(?:SECRET|PRIVATE|SERVICE_ROLE)/iu.test(key)) delete inheritedEnvironment[key]
  }
  const localEnvironment = localAdminEnvironmentFromStatus(readStatus())
  log("Using ephemeral loopback Supabase administrator configuration.")
  try {
    return runChild(command, args, { ...inheritedEnvironment, ...localEnvironment })
  } catch {
    throw new Error("Unable to launch local administrator verification child command.")
  }
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    process.exitCode = runWithLocalSupabaseAdmin(process.argv.slice(2))
  } catch (error) {
    globalThis.console.error(
      error instanceof Error ? error.message : "Local administrator verification failed."
    )
    process.exitCode = 1
  }
}
