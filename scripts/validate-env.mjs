/* global URL, console, process */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

export class EnvironmentValidationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = "EnvironmentValidationError"
  }
}

/** @param {string} contents @returns {Readonly<Record<string, string>>} */
export function parseEnvFile(contents) {
  /** @type {Record<string, string>} */
  const values = Object.create(null)

  for (const [index, line] of contents.split(/\r?\n/u).entries()) {
    const lineNumber = index + 1
    const trimmed = line.trim()

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line)
    if (match === null) {
      throw new EnvironmentValidationError(`Malformed environment record on line ${lineNumber}`)
    }

    const [, key, value] = match
    if (Object.hasOwn(values, key)) {
      throw new EnvironmentValidationError(`Duplicate environment key: ${key}`)
    }

    values[key] = value
  }

  return Object.freeze(values)
}

/** @param {Readonly<Record<string, string>>} values */
export function validateClientEnvironment(values) {
  for (const key of Object.keys(values)) {
    if (/(?:SECRET|PRIVATE|SERVICE_ROLE)/iu.test(key)) {
      throw new EnvironmentValidationError(`Forbidden client environment key: ${key}`)
    }
  }

  validatePublicEnvironmentPair(values, "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY")
  validatePublicEnvironmentPair(values, "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY")
}

/**
 * @param {Readonly<Record<string, string>>} values
 * @param {string} urlKey
 * @param {string} publishableKeyName
 */
function validatePublicEnvironmentPair(values, urlKey, publishableKeyName) {
  const url = values[urlKey]
  if (url === undefined || url.trim() === "") {
    throw new EnvironmentValidationError(`Missing ${urlKey}`)
  }

  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new EnvironmentValidationError(`${urlKey} must be an HTTP(S) URL`)
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new EnvironmentValidationError(`${urlKey} must be an HTTP(S) URL`)
  }

  const publishableKey = values[publishableKeyName]
  if (publishableKey === undefined || publishableKey.trim() === "") {
    throw new EnvironmentValidationError(`Missing ${publishableKeyName}`)
  }
}

async function main() {
  const argument = process.argv.slice(2)
  if (argument.length > 1) {
    throw new EnvironmentValidationError("Expected zero or one environment file path")
  }

  const path = resolve(argument[0] ?? ".env.example")
  const contents = await readFile(path, "utf8")
  const values = parseEnvFile(contents)
  validateClientEnvironment(values)
  console.log("Environment configuration is valid.")
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Environment validation failed")
    process.exitCode = 1
  })
}
