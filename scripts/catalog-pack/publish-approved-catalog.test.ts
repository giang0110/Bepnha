import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { expect, test } from "vitest"

test("the publication runner withholds malformed readiness response bodies", () => {
  const directory = mkdtempSync(join(tmpdir(), "bepnha-readiness-test-"))
  const preload = join(directory, "preload.mjs")
  const marker = "RAW_READINESS_BODY_SENTINEL"
  writeFileSync(
    preload,
    `let calls = 0
globalThis.fetch = async (url) => {
  if (url !== 'https://bepnhatoi.vercel.app/api/admin/catalog') throw new Error('Unexpected test request')
  return ++calls === 1
    ? Response.json({error: 'VALIDATION_FAILED'}, {status: 400})
    : new Response('${marker}', {status: 503})
}
`
  )
  let output = ""
  try {
    try {
      execFileSync(
        process.execPath,
        [
          "--import",
          pathToFileURL(preload).href,
          "scripts/catalog-pack/publish-approved-catalog.ts"
        ],
        {
          encoding: "utf8",
          timeout: 10_000,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            GITHUB_REPOSITORY: "giang0110/Bepnha",
            GITHUB_REF: "refs/heads/main",
            PUBLICATION_PUBLISH: "false",
            PUBLICATION_DIRECTORY: directory,
            PUBLICATION_CHECK_TOKEN: "synthetic-check-token",
            BEPNHA_PRODUCTION_DB_URL: "",
            BEPNHA_ADMIN_ACCESS_TOKEN: `synthetic.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 3600 })).toString("base64url")}.signature`
          }
        }
      )
    } catch (error) {
      const failure = error as { status: number; stdout: string; stderr: string }
      expect(failure.status).toBe(1)
      output = failure.stdout + failure.stderr
    }
    expect(output).toContain("ADMIN_READINESS_REQUEST_FAILED")
    expect(output).not.toContain(marker)
    expect(output).not.toContain(marker.slice(0, 8))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
