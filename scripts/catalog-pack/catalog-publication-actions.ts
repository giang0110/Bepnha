import { createHash } from "node:crypto"
import { deflateSync, inflateSync } from "node:zlib"

import { EMPTY_JOURNAL, executeMutationPlan } from "./catalog-mutation-executor.ts"
import type {
  ExecuteMutationPlanOptions,
  MutationExecutionJournal
} from "./catalog-mutation-executor.ts"
import type { CatalogMutationPlanV1 } from "./catalog-mutation-types.ts"

export const APPROVED_PACK_SHA256 =
  "97d5d6793b510fa347d12cc71b830ba4549d6e0a090351138aeb9f8cb9c84110"
export const APPROVED_SNAPSHOT_SHA256 =
  "779269f095a0f31ac84b018c35e8e858d6aa9ffd88570b286a46c9a2f332ce4a"
export const APPROVED_PLAN_SHA256 =
  "32945c7a9c681171a1e3cdbb797d599534246674379977c33af9238422962a59"

export function assertApprovedPlan(plan: CatalogMutationPlanV1): void {
  if (
    !plan.executable ||
    plan.diagnostics.length !== 0 ||
    plan.operations.length !== 377 ||
    plan.inputSha256 !== APPROVED_PACK_SHA256 ||
    plan.productionSnapshotSha256 !== APPROVED_SNAPSHOT_SHA256 ||
    createHash("sha256").update(JSON.stringify(plan)).digest("hex") !== APPROVED_PLAN_SHA256
  ) {
    throw new Error("APPROVED_PLAN_MISMATCH")
  }
}

/** Expiry is an additional scheduling guard; the deployed API still authenticates the JWT. */
export function assertTokenLifetime(token: string, nowSeconds = Date.now() / 1000): void {
  let exp: unknown
  try {
    const payload = token.split(".")[1]
    if (!payload) throw new Error()
    exp = (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown }).exp
  } catch {
    throw new Error("TOKEN_EXPIRY_UNAVAILABLE")
  }
  if (typeof exp !== "number" || !Number.isFinite(exp)) throw new Error("TOKEN_EXPIRY_UNAVAILABLE")
  if (exp - nowSeconds < 25 * 60) throw new Error("TOKEN_EXPIRES_TOO_SOON_GET_FRESH_ADMIN_TOKEN")
}

const PREFIX = "catalog-checkpoint-v1:"

export function encodeCheckpoint(value: unknown): string {
  const result = PREFIX + deflateSync(Buffer.from(JSON.stringify(value))).toString("base64")
  if (Buffer.byteLength(result) > 60_000) throw new Error("CHECKPOINT_TOO_LARGE")
  return result
}

export function decodeCheckpoint(text: string): unknown {
  if (!text.startsWith(PREFIX) || text.length > 60_000) throw new Error("CHECKPOINT_INVALID")
  return JSON.parse(
    inflateSync(Buffer.from(text.slice(PREFIX.length), "base64"), {
      maxOutputLength: 2_000_000
    }).toString("utf8")
  ) as unknown
}

export interface PublicationCheckpoint {
  readonly journal: MutationExecutionJournal
  readonly pendingOperationId: string | null
}

/** The write intent includes every UUID allocation and is durable before its HTTP request. */
export async function executeWithCheckpoints(
  options: ExecuteMutationPlanOptions & {
    readonly pendingOperationId?: string | null
    readonly checkpoint: (value: PublicationCheckpoint) => Promise<void>
  }
) {
  let journal = options.journal ?? EMPTY_JOURNAL(options.plan.inputSha256)
  let pendingOperationId = options.pendingOperationId ?? null
  if (pendingOperationId !== null) throw new Error(`UNCERTAIN_OPERATION ${pendingOperationId}`)
  const result = await executeMutationPlan({
    plan: options.plan,
    journal,
    allocateUuid: options.allocateUuid,
    onJournalChange: async (next) => {
      journal = next
      if (
        pendingOperationId !== null &&
        next.completed.some((entry) => entry.operationId === pendingOperationId)
      ) {
        pendingOperationId = null
      }
      // Keep the local journal after every change. The next remote write-intent checkpoint also
      // carries this completion, avoiding two GitHub content writes per operation (500/hour).
      await options.onJournalChange?.(next)
    },
    runOperation: async (operation, input) => {
      pendingOperationId = operation.operationId
      await options.checkpoint({ journal, pendingOperationId })
      const outcome = await options.runOperation(operation, input)
      // Authentication and transaction validation refusals did not apply the write. Lost responses
      // and server failures remain pending so resumption requires inspecting production first.
      if (!outcome.ok && /^(?:400|401|403|409|415|422)\b/u.test(outcome.reason)) {
        pendingOperationId = null
        await options.checkpoint({ journal, pendingOperationId })
      }
      return outcome
    }
  })
  await options.checkpoint({ journal: result.journal, pendingOperationId })
  return result
}
