import { describe, expect, test } from "vitest"

import {
  assertApprovedPlan,
  assertTokenLifetime,
  decodeCheckpoint,
  encodeCheckpoint,
  executeWithCheckpoints
} from "./catalog-publication-actions.ts"
import { EMPTY_JOURNAL } from "./catalog-mutation-executor.ts"
import type { CatalogMutationPlanV1 } from "./catalog-mutation-types.ts"

const plan: CatalogMutationPlanV1 = {
  schemaVersion: "1",
  catalogCode: "test",
  inputSha256: "a".repeat(64),
  resolvedManifestSha256: "b".repeat(64),
  productionSnapshotSha256: "c".repeat(64),
  executable: true,
  diagnostics: [],
  bindings: [{ handle: "version", source: { kind: "allocate_uuid" } }],
  operations: [
    {
      operationId: "save_food_fact_draft:test:4",
      logicalKey: "test:4",
      kind: "save_food_fact_draft",
      dependsOn: [],
      outputs: ["id"],
      input: { foodFactVersionId: { $binding: "version" } }
    }
  ]
}

describe("GitHub catalog publication checkpoints", () => {
  test("requires enough token lifetime for the bounded publication job", () => {
    const token = (exp: number) =>
      `test.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.test`
    expect(() => assertTokenLifetime(token(3600), 0)).not.toThrow()
    expect(() => assertTokenLifetime(token(300), 0)).toThrow("TOKEN_EXPIRES_TOO_SOON")
    expect(() => assertTokenLifetime("no JWT expiry", 0)).toThrow("TOKEN_EXPIRY_UNAVAILABLE")
  })
  test("refuses a plan outside the exact approved batch", () => {
    expect(() => assertApprovedPlan(plan)).toThrow("APPROVED_PLAN_MISMATCH")
  })

  test("round trips a compressed checkpoint without credentials", () => {
    const value = { journal: EMPTY_JOURNAL(plan.inputSha256), pendingOperationId: null }
    expect(decodeCheckpoint(encodeCheckpoint(value))).toEqual(value)
    expect(() => decodeCheckpoint("not a checkpoint")).toThrow()
  })

  test("durably records allocations and write intent before sending a mutation", async () => {
    const events: string[] = []
    let durable: { pendingOperationId: string | null; journal: ReturnType<typeof EMPTY_JOURNAL> }
    const result = await executeWithCheckpoints({
      plan,
      allocateUuid: () => "allocated-version",
      checkpoint: (value) => {
        durable = structuredClone(value)
        events.push(`checkpoint:${value.journal.completed.length}`)
        return Promise.resolve()
      },
      runOperation: (operation, input) => {
        expect(durable.pendingOperationId).toBe(operation.operationId)
        expect(durable.journal.allocations).toEqual({ version: "allocated-version" })
        expect(input).toEqual({ foodFactVersionId: "allocated-version" })
        events.push("write")
        return Promise.resolve({ ok: true as const, outputs: { id: "allocated-version" } })
      }
    })
    expect(result.ok).toBe(true)
    expect(events.indexOf("write")).toBeGreaterThan(0)
    expect(result.journal.completed).toHaveLength(1)
  })

  test("stops before a mutation when durable checkpoint storage fails", async () => {
    let writes = 0
    await expect(
      executeWithCheckpoints({
        plan,
        allocateUuid: () => "allocated-version",
        checkpoint: () => Promise.reject(new Error("GitHub unavailable")),
        runOperation: () => {
          writes++
          return Promise.resolve({ ok: true as const, outputs: { id: "x" } })
        }
      })
    ).rejects.toThrow("GitHub unavailable")
    expect(writes).toBe(0)
  })

  test("keeps an uncertain operation for inspection and refuses blind resumption", async () => {
    let latest = {
      journal: EMPTY_JOURNAL(plan.inputSha256),
      pendingOperationId: null as string | null
    }
    const result = await executeWithCheckpoints({
      plan,
      allocateUuid: () => "allocated-version",
      checkpoint: (value) => {
        latest = structuredClone(value)
        return Promise.resolve()
      },
      runOperation: () =>
        Promise.resolve({ ok: false as const, reason: "no response; write may have applied" })
    })
    expect(result.ok).toBe(false)
    expect(latest.pendingOperationId).toBe(plan.operations[0]?.operationId)
    await expect(
      executeWithCheckpoints({
        plan,
        journal: latest.journal,
        pendingOperationId: latest.pendingOperationId,
        allocateUuid: () => "must-not-allocate",
        checkpoint: async () => {},
        runOperation: () => {
          return Promise.reject(new Error("must-not-write"))
        }
      })
    ).rejects.toThrow("UNCERTAIN_OPERATION")
  })

  test("reconciles an initial save only after the exact snapshot proves its allocated draft absent", async () => {
    const allocated = "d6f6ce4f-367a-42a8-a310-babbe10a271d"
    let requests = 0
    const checkpoints: (string | null)[] = []
    const result = await executeWithCheckpoints({
      plan,
      journal: { ...EMPTY_JOURNAL(plan.inputSha256), allocations: { version: allocated } },
      pendingOperationId: plan.operations[0]!.operationId,
      reconciliationProof: {
        productionSnapshotSha256: plan.productionSnapshotSha256,
        foodFactVersionIds: [],
        settledFailure: "503 CATALOG_UNAVAILABLE"
      },
      allocateUuid: () => {
        throw new Error("Must retain the original allocated UUID")
      },
      checkpoint: (value) => {
        checkpoints.push(value.pendingOperationId)
        return Promise.resolve()
      },
      runOperation: (_operation, input) => {
        requests++
        expect(input).toEqual({ foodFactVersionId: allocated })
        return Promise.resolve({ ok: true as const, outputs: { id: allocated } })
      }
    })
    expect(result.ok).toBe(true)
    expect(requests).toBe(1)
    expect(checkpoints).toEqual([null, plan.operations[0]!.operationId, null])
  })

  test.each([
    "draft_exists",
    "snapshot_changed",
    "already_completed",
    "different_operation",
    "unsettled"
  ])("keeps pending intent when reconciliation cannot prove absence: %s", async (scenario) => {
    const allocated = "d6f6ce4f-367a-42a8-a310-babbe10a271d"
    let requests = 0
    await expect(
      executeWithCheckpoints({
        plan,
        journal: {
          ...EMPTY_JOURNAL(plan.inputSha256),
          allocations: { version: allocated },
          completed:
            scenario === "already_completed"
              ? [{ operationId: "previous", outputs: { id: "previous" } }]
              : []
        },
        pendingOperationId:
          scenario === "different_operation" ? "publish:test:4" : plan.operations[0]!.operationId,
        reconciliationProof: {
          productionSnapshotSha256:
            scenario === "snapshot_changed" ? "changed" : plan.productionSnapshotSha256,
          foodFactVersionIds: scenario === "draft_exists" ? [allocated] : [],
          ...(scenario === "unsettled"
            ? {}
            : { settledFailure: "503 CATALOG_UNAVAILABLE" as const })
        },
        allocateUuid: () => allocated,
        checkpoint: async () => {},
        runOperation: () => {
          requests++
          return Promise.resolve({ ok: true as const, outputs: { id: allocated } })
        }
      })
    ).rejects.toThrow("UNCERTAIN_OPERATION")
    expect(requests).toBe(0)
  })

  test("resumes completed operations without creating another version", async () => {
    let writes = 0
    const result = await executeWithCheckpoints({
      plan,
      journal: {
        planInputSha256: plan.inputSha256,
        allocations: { version: "existing" },
        completed: [{ operationId: plan.operations[0]!.operationId, outputs: { id: "existing" } }]
      },
      allocateUuid: () => {
        throw new Error("must-not-allocate")
      },
      checkpoint: async () => {},
      runOperation: () => {
        writes++
        return Promise.resolve({ ok: true as const, outputs: { id: "duplicate" } })
      }
    })
    expect(result.ok).toBe(true)
    expect(result.skipped).toEqual([plan.operations[0]?.operationId])
    expect(writes).toBe(0)
  })
})
