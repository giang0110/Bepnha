/* global console, process */

import { readFile, stat } from "node:fs/promises"
import { spawnSync } from "node:child_process"

const rules = [
  ["pem-private-key", /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/u],
  [
    "sensitive-environment-assignment",
    /^(?:SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY)|GEMINI_API_KEY|VITE_(?:GEMINI_API_KEY|[A-Z0-9_]*(?:SECRET|PRIVATE|SERVICE_ROLE)[A-Z0-9_]*))[\t ]*=[\t ]*[^\s#].*$/imu
  ],
  [
    "credential-token",
    /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/u
  ]
]

/** @param {string} _path @param {string} contents @returns {string[]} */
export function findSecretFindings(_path, contents) {
  return rules.filter(([, pattern]) => pattern.test(contents)).map(([ruleId]) => ruleId)
}

function getTrackedPaths() {
  const result = spawnSync("git", ["ls-files", "-z"], { encoding: "buffer" })
  if (result.status !== 0) {
    throw new Error("Unable to list tracked files")
  }

  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter((path) => path !== "")
}

async function isRegularTextFile(path) {
  const fileStat = await stat(path)
  if (!fileStat.isFile()) {
    return false
  }

  const contents = await readFile(path)
  return !contents.includes(0)
}

async function main() {
  const findings = []

  for (const path of getTrackedPaths()) {
    if (!(await isRegularTextFile(path))) {
      continue
    }

    const contents = await readFile(path, "utf8")
    for (const ruleId of findSecretFindings(path, contents)) {
      findings.push({ path, ruleId })
    }
  }

  if (findings.length > 0) {
    for (const { path, ruleId } of findings) {
      console.error(`${ruleId}: ${path}`)
    }
    process.exitCode = 1
    return
  }

  console.log("No secret findings.")
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Secret scan failed")
    process.exitCode = 1
  })
}
