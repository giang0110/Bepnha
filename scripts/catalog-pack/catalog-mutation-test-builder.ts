import { createHash } from "node:crypto"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import type { CatalogPackV1 } from "./catalog-pack-types.ts"
import { buildResolvableProductionSnapshot } from "./catalog-production-test-builder.ts"
import { resolveCatalogProductionReferences } from "./catalog-production-resolver.ts"
import type { ResolvedCatalogManifestV1 } from "./catalog-production-types.ts"

export interface CatalogMutationPlanningFixture {
  readonly pack: CatalogPackV1
  readonly packBytes: Uint8Array
  readonly inputSha256: string
  readonly manifest: ResolvedCatalogManifestV1
  readonly manifestBytes: Uint8Array
}

export function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export function buildPlanningFixture(): CatalogMutationPlanningFixture {
  const pack = buildReadyCatalogPack()
  const packBytes = encodeJson(pack)
  const inputSha256 = sha256(packBytes)
  const manifest = resolveCatalogProductionReferences(
    pack,
    inputSha256,
    buildResolvableProductionSnapshot(pack)
  )
  const manifestBytes = encodeJson(manifest)
  return { pack, packBytes, inputSha256, manifest, manifestBytes }
}
