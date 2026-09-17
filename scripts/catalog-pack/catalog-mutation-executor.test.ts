// @vitest-environment node

import { describe, expect, it, vi } from "vitest"

import type {
  CatalogMutationPlanOperationV1,
  CatalogMutationPlanV1,
  MutationPlanBindingV1
} from "./catalog-mutation-types.ts"
import {
  EMPTY_JOURNAL,
  executeMutationPlan,
  orderOperations,
  resolveInput,
  type ExecuteMutationPlanOptions,
  type MutationExecutionJournal,
  type OperationOutcome
} from "./catalog-mutation-executor.ts"

const PLAN_SHA = "a".repeat(64)

function operation(
  operationId: string,
  overrides: Partial<CatalogMutationPlanOperationV1> = {}
): CatalogMutationPlanOperationV1 {
  return {
    operationId,
    kind: "create_food",
    logicalKey: `food:${operationId}`,
    dependsOn: [],
    input: {},
    outputs: ["id"],
    ...overrides
  }
}

function plan(
  operations: readonly CatalogMutationPlanOperationV1[],
  bindings: readonly MutationPlanBindingV1[] = []
): CatalogMutationPlanV1 {
  return {
    schemaVersion: "1",
    catalogCode: "launch_v1",
    inputSha256: PLAN_SHA,
    resolvedManifestSha256: "b".repeat(64),
    productionSnapshotSha256: "c".repeat(64),
    executable: true,
    operations,
    bindings,
    diagnostics: []
  }
}

/** Typed as the real runner so mock.calls carries both arguments, including the resolved input. */
type RunOperation = ExecuteMutationPlanOptions["runOperation"]

function succeeding(outputsById: Record<string, Record<string, string | number>> = {}) {
  const run: RunOperation = (op) =>
    Promise.resolve({
      ok: true,
      outputs: outputsById[op.operationId] ?? { id: `${op.operationId}-id` }
    })
  return vi.fn(run)
}

describe("orderOperations", () => {
  it("puts a dependency before the operation that needs it", () => {
    const result = orderOperations([
      operation("publish", { dependsOn: ["draft"] }),
      operation("draft", { dependsOn: ["create"] }),
      operation("create")
    ])

    expect(result).toEqual({ ok: true, order: ["create", "draft", "publish"] })
  })

  it("refuses a cycle rather than looping", () => {
    const result = orderOperations([
      operation("a", { dependsOn: ["b"] }),
      operation("b", { dependsOn: ["a"] })
    ])

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.failure.code).toBe("DEPENDENCY_CYCLE")
  })

  it("names the operation whose dependency does not exist", () => {
    const result = orderOperations([operation("a", { dependsOn: ["ghost"] })])

    expect(result.ok === false && result.failure).toEqual({
      code: "DEPENDENCY_MISSING",
      operationId: "a",
      detail: "a depends on unknown operation ghost"
    })
  })
})

describe("resolveInput", () => {
  const context = {
    bindingValue: (handle: string) => (handle === "food:ga" ? "uuid-ga" : undefined),
    outputValue: (id: string, field: string) =>
      id === "draft" && field === "revision" ? 7 : undefined
  }

  it("substitutes a binding nested anywhere in the input", () => {
    const resolved = resolveInput({ a: [{ b: { $binding: "food:ga" } }], c: "plain" }, context)

    expect(resolved).toEqual({ ok: true, value: { a: [{ b: "uuid-ga" }], c: "plain" } })
  })

  it("substitutes an operation output, keeping its type", () => {
    const resolved = resolveInput(
      { expectedRevision: { $operationOutput: { operationId: "draft", field: "revision" } } },
      context
    )

    expect(resolved).toEqual({ ok: true, value: { expectedRevision: 7 } })
  })

  it("refuses an unresolvable binding instead of writing the placeholder to the database", () => {
    const resolved = resolveInput({ id: { $binding: "food:unknown" } }, context)

    expect(resolved.ok).toBe(false)
    expect(resolved.ok === false && resolved.failure.code).toBe("BINDING_UNRESOLVED")
  })

  it("leaves an object that merely looks like a reference alone", () => {
    const value = { $binding: "food:ga", note: "not a reference, it has two keys" }

    expect(resolveInput(value, context)).toEqual({ ok: true, value })
  })

  it("passes primitives and null through untouched", () => {
    expect(resolveInput({ a: null, b: 0, c: false, d: "" }, context)).toEqual({
      ok: true,
      value: { a: null, b: 0, c: false, d: "" }
    })
  })
})

describe("executeMutationPlan refuses to start", () => {
  it.each([
    ["a plan marked not executable", { executable: false }, "PLAN_NOT_EXECUTABLE"],
    [
      "a plan carrying diagnostics",
      {
        diagnostics: [
          { severity: "error", code: "REFERENCE_MISSING", path: "$", message: "x" } as const
        ]
      },
      "PLAN_HAS_DIAGNOSTICS"
    ]
  ])("%s", async (_name, overrides, code) => {
    const runOperation = succeeding()

    const result = await executeMutationPlan({
      plan: { ...plan([operation("a")]), ...overrides },
      allocateUuid: () => "should-not-be-called",
      runOperation
    })

    expect(result.failure?.code).toBe(code)
    expect(runOperation).not.toHaveBeenCalled()
  })

  it("refuses a journal belonging to a different plan rather than merging them", async () => {
    const runOperation = succeeding()

    const result = await executeMutationPlan({
      plan: plan([operation("a")]),
      journal: EMPTY_JOURNAL("f".repeat(64)),
      allocateUuid: () => "unused",
      runOperation
    })

    expect(result.failure?.code).toBe("JOURNAL_PLAN_MISMATCH")
    expect(runOperation).not.toHaveBeenCalled()
  })
})

describe("executeMutationPlan", () => {
  it("runs operations in dependency order", async () => {
    const runOperation = succeeding()

    const result = await executeMutationPlan({
      plan: plan([operation("publish", { dependsOn: ["create"] }), operation("create")]),
      allocateUuid: () => "unused",
      runOperation
    })

    expect(result.ok).toBe(true)
    expect(result.executed).toEqual(["create", "publish"])
    expect(runOperation.mock.calls.map((call) => call[0].operationId)).toEqual([
      "create",
      "publish"
    ])
  })

  it("feeds one operation's output into the next operation's input", async () => {
    const runOperation = succeeding({ create: { id: "food-1", revision: 1 } })

    await executeMutationPlan({
      plan: plan([
        operation("create"),
        operation("publish", {
          dependsOn: ["create"],
          input: {
            foodId: { $operationOutput: { operationId: "create", field: "id" } },
            expectedRevision: { $operationOutput: { operationId: "create", field: "revision" } }
          }
        })
      ]),
      allocateUuid: () => "unused",
      runOperation
    })

    expect(runOperation.mock.calls[1]?.[1]).toEqual({ foodId: "food-1", expectedRevision: 1 })
  })

  it("uses a resolved production uuid without allocating anything", async () => {
    const allocateUuid = vi.fn(() => "allocated")
    const runOperation = succeeding()

    await executeMutationPlan({
      plan: plan(
        [operation("a", { input: { id: { $binding: "food:ga" } } })],
        [{ handle: "food:ga", source: { kind: "resolved_uuid", id: "existing-uuid" } }]
      ),
      allocateUuid,
      runOperation
    })

    expect(runOperation.mock.calls[0]?.[1]).toEqual({ id: "existing-uuid" })
    expect(allocateUuid).not.toHaveBeenCalled()
  })

  it("stops at the first failure and keeps what already succeeded", async () => {
    const runOperation = vi.fn((op: CatalogMutationPlanOperationV1): Promise<OperationOutcome> =>
      Promise.resolve(
        op.operationId === "b"
          ? { ok: false, reason: "STALE_CATALOG_REVISION" }
          : { ok: true, outputs: { id: `${op.operationId}-id` } }
      )
    )

    const result = await executeMutationPlan({
      plan: plan([
        operation("a"),
        operation("b", { dependsOn: ["a"] }),
        operation("c", { dependsOn: ["b"] })
      ]),
      allocateUuid: () => "unused",
      runOperation
    })

    expect(result.ok).toBe(false)
    expect(result.failure).toEqual({
      code: "OPERATION_FAILED",
      operationId: "b",
      detail: "STALE_CATALOG_REVISION"
    })
    expect(result.executed).toEqual(["a"])
    expect(runOperation.mock.calls.map((call) => call[0].operationId)).toEqual(["a", "b"])
  })
})

describe("resuming an interrupted run", () => {
  const allocatingPlan = plan(
    [
      operation("create", { input: { id: { $binding: "food:new" } } }),
      operation("publish", { dependsOn: ["create"], input: { id: { $binding: "food:new" } } })
    ],
    [{ handle: "food:new", source: { kind: "allocate_uuid" } }]
  )

  it("allocates a handle once and records it in the journal", async () => {
    const allocateUuid = vi.fn(() => "minted-uuid")

    const result = await executeMutationPlan({
      plan: allocatingPlan,
      allocateUuid,
      runOperation: succeeding()
    })

    expect(allocateUuid).toHaveBeenCalledOnce()
    expect(result.journal.allocations).toEqual({ "food:new": "minted-uuid" })
  })

  it("journals an allocation before the write that consumes it, so a crash is recoverable", async () => {
    const sequence: string[] = []

    await executeMutationPlan({
      plan: allocatingPlan,
      allocateUuid: () => "minted-uuid",
      onJournalChange: (journal: MutationExecutionJournal) => {
        if (journal.allocations["food:new"] !== undefined) sequence.push("journalled")
      },
      runOperation: (op) => {
        sequence.push(`ran:${op.operationId}`)
        return Promise.resolve({ ok: true, outputs: { id: "x" } })
      }
    })

    expect(sequence[0]).toBe("journalled")
    expect(sequence.indexOf("journalled")).toBeLessThan(sequence.indexOf("ran:create"))
  })

  it("reuses the journalled uuid instead of minting a second identity", async () => {
    const allocateUuid = vi.fn(() => "SECOND-UUID")
    const journal: MutationExecutionJournal = {
      planInputSha256: PLAN_SHA,
      allocations: { "food:new": "first-uuid" },
      completed: [{ operationId: "create", outputs: { id: "first-uuid" } }]
    }
    const runOperation = succeeding()

    const result = await executeMutationPlan({
      plan: allocatingPlan,
      journal,
      allocateUuid,
      runOperation
    })

    // Minting again here would create a second food that the plan believes is the first one.
    expect(allocateUuid).not.toHaveBeenCalled()
    expect(result.skipped).toEqual(["create"])
    expect(result.executed).toEqual(["publish"])
    expect(runOperation.mock.calls[0]?.[1]).toEqual({ id: "first-uuid" })
  })

  it("does not re-run an operation the journal already records", async () => {
    const runOperation = succeeding()

    const result = await executeMutationPlan({
      plan: plan([operation("a"), operation("b", { dependsOn: ["a"] })]),
      journal: {
        planInputSha256: PLAN_SHA,
        allocations: {},
        completed: [{ operationId: "a", outputs: { id: "a-id" } }]
      },
      allocateUuid: () => "unused",
      runOperation
    })

    expect(result.skipped).toEqual(["a"])
    expect(runOperation.mock.calls.map((call) => call[0].operationId)).toEqual(["b"])
    expect(result.ok).toBe(true)
  })
})
