import type {
  CatalogMutationPlanOperationV1,
  CatalogMutationPlanV1,
  MutationPlanBindingV1
} from "./catalog-mutation-types.ts"

/**
 * Phase 9D: runs a Phase 9C plan.
 *
 * Phase 9C is deliberately pure — it allocates no identifiers, reads no production state at write
 * time, and never calls an application executor. Everything it deferred lands here, which makes
 * this the only place in the catalog pipeline that can change production, and the place where
 * getting resumption wrong is expensive.
 *
 * Resumption is the hard part. A run that dies after creating twenty foods must, on its next
 * attempt, use the identifiers it already handed out. A journal that recorded only completed
 * operations would not be enough: an `allocate_uuid` binding consumed by a later operation would be
 * allocated afresh, and the retry would create a second food that the plan believes is the first.
 * So allocations are journalled at the moment they are made, before the operation that uses them
 * runs, and a resumed run never allocates a handle the journal already holds.
 *
 * This module performs no I/O and knows nothing about Supabase. The caller supplies `runOperation`,
 * which is where authority and credentials live.
 */

export interface MutationExecutionJournal {
  /** Ties the journal to one plan; resuming with a different plan is refused, not merged. */
  readonly planInputSha256: string
  readonly allocations: Readonly<Record<string, string>>
  readonly completed: readonly {
    readonly operationId: string
    readonly outputs: Readonly<Record<string, string | number>>
  }[]
}

export const EMPTY_JOURNAL = (planInputSha256: string): MutationExecutionJournal => ({
  planInputSha256,
  allocations: {},
  completed: []
})

export type MutationExecutionFailureCode =
  | "PLAN_NOT_EXECUTABLE"
  | "PLAN_HAS_DIAGNOSTICS"
  | "JOURNAL_PLAN_MISMATCH"
  | "DEPENDENCY_MISSING"
  | "DEPENDENCY_CYCLE"
  | "BINDING_MISSING"
  | "BINDING_UNRESOLVED"
  | "OPERATION_OUTPUT_MISSING"
  | "OPERATION_FAILED"

export interface MutationExecutionFailure {
  readonly code: MutationExecutionFailureCode
  readonly operationId: string | null
  readonly detail: string
}

export type OperationOutcome =
  | { readonly ok: true; readonly outputs: Readonly<Record<string, string | number>> }
  | { readonly ok: false; readonly reason: string }

export interface ExecuteMutationPlanOptions {
  readonly plan: CatalogMutationPlanV1
  readonly journal?: MutationExecutionJournal
  readonly allocateUuid: () => string
  readonly runOperation: (
    operation: CatalogMutationPlanOperationV1,
    resolvedInput: unknown
  ) => Promise<OperationOutcome>
  /** Called as each allocation and each completion happens, so a crash still leaves a usable file. */
  readonly onJournalChange?: (journal: MutationExecutionJournal) => void | Promise<void>
}

export interface MutationExecutionResult {
  readonly ok: boolean
  readonly journal: MutationExecutionJournal
  readonly executed: readonly string[]
  readonly skipped: readonly string[]
  readonly failure: MutationExecutionFailure | null
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function bindingReference(value: UnknownRecord): string | null {
  const handle = value["$binding"]
  return Object.keys(value).length === 1 && typeof handle === "string" ? handle : null
}

function outputReference(
  value: UnknownRecord
): { operationId: string; field: "id" | "revision" } | null {
  const reference = value["$operationOutput"]
  if (Object.keys(value).length !== 1 || !isRecord(reference)) return null
  const operationId = reference["operationId"]
  const field = reference["field"]
  if (typeof operationId !== "string") return null
  if (field !== "id" && field !== "revision") return null
  return { operationId, field }
}

/** Depth-first topological order. Refuses rather than trusting the plan's own ordering. */
export function orderOperations(
  operations: readonly CatalogMutationPlanOperationV1[]
): { ok: true; order: readonly string[] } | { ok: false; failure: MutationExecutionFailure } {
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]))
  const state = new Map<string, "visiting" | "done">()
  const order: string[] = []

  function visit(id: string, from: string | null): MutationExecutionFailure | null {
    const current = state.get(id)
    if (current === "done") return null
    if (current === "visiting") {
      return { code: "DEPENDENCY_CYCLE", operationId: id, detail: `cycle reaches ${id}` }
    }
    const operation = byId.get(id)
    if (operation === undefined) {
      return {
        code: "DEPENDENCY_MISSING",
        operationId: from,
        detail: `${from ?? "plan"} depends on unknown operation ${id}`
      }
    }

    state.set(id, "visiting")
    for (const dependency of operation.dependsOn) {
      const failure = visit(dependency, id)
      if (failure !== null) return failure
    }
    state.set(id, "done")
    order.push(id)
    return null
  }

  for (const operation of operations) {
    const failure = visit(operation.operationId, null)
    if (failure !== null) return { ok: false, failure }
  }
  return { ok: true, order }
}

interface ResolutionContext {
  readonly bindingValue: (handle: string) => string | undefined
  readonly outputValue: (operationId: string, field: string) => string | number | undefined
}

/**
 * Replaces every `$binding` and `$operationOutput` placeholder with its value. An unresolvable
 * placeholder is an error rather than a value left in place: passing `{"$binding":"food:ga_ta"}`
 * through to a repository would write that object into the database as if it were an identifier.
 */
export function resolveInput(
  input: unknown,
  context: ResolutionContext
): { ok: true; value: unknown } | { ok: false; failure: MutationExecutionFailure } {
  if (Array.isArray(input)) {
    const items: unknown[] = []
    for (const entry of input) {
      const resolved = resolveInput(entry, context)
      if (!resolved.ok) return resolved
      items.push(resolved.value)
    }
    return { ok: true, value: items }
  }

  if (isRecord(input)) {
    const handle = bindingReference(input)
    if (handle !== null) {
      const value = context.bindingValue(handle)
      if (value === undefined) {
        return {
          ok: false,
          failure: { code: "BINDING_UNRESOLVED", operationId: null, detail: handle }
        }
      }
      return { ok: true, value }
    }

    const reference = outputReference(input)
    if (reference !== null) {
      const value = context.outputValue(reference.operationId, reference.field)
      if (value === undefined) {
        return {
          ok: false,
          failure: {
            code: "OPERATION_OUTPUT_MISSING",
            operationId: reference.operationId,
            detail: `${reference.operationId}.${reference.field}`
          }
        }
      }
      return { ok: true, value }
    }

    const record: UnknownRecord = {}
    for (const [key, entry] of Object.entries(input)) {
      const resolved = resolveInput(entry, context)
      if (!resolved.ok) return resolved
      record[key] = resolved.value
    }
    return { ok: true, value: record }
  }

  return { ok: true, value: input }
}

export async function executeMutationPlan(
  options: ExecuteMutationPlanOptions
): Promise<MutationExecutionResult> {
  const { plan } = options

  function refuse(failure: MutationExecutionFailure, journal: MutationExecutionJournal) {
    return { ok: false, journal, executed: [], skipped: [], failure }
  }

  const startingJournal = options.journal ?? EMPTY_JOURNAL(plan.inputSha256)

  if (!plan.executable) {
    return refuse(
      { code: "PLAN_NOT_EXECUTABLE", operationId: null, detail: "plan.executable is false" },
      startingJournal
    )
  }
  if (plan.diagnostics.length > 0) {
    return refuse(
      {
        code: "PLAN_HAS_DIAGNOSTICS",
        operationId: null,
        detail: `${plan.diagnostics.length} diagnostic(s)`
      },
      startingJournal
    )
  }
  if (startingJournal.planInputSha256 !== plan.inputSha256) {
    return refuse(
      {
        code: "JOURNAL_PLAN_MISMATCH",
        operationId: null,
        detail: `journal belongs to ${startingJournal.planInputSha256}`
      },
      startingJournal
    )
  }

  const ordered = orderOperations(plan.operations)
  if (!ordered.ok) return refuse(ordered.failure, startingJournal)

  const bindings = new Map<string, MutationPlanBindingV1>(
    plan.bindings.map((binding) => [binding.handle, binding])
  )
  const allocations: Record<string, string> = { ...startingJournal.allocations }
  const outputs = new Map<string, Readonly<Record<string, string | number>>>(
    startingJournal.completed.map((entry) => [entry.operationId, entry.outputs])
  )
  const completed = [...startingJournal.completed]

  let journal: MutationExecutionJournal = {
    planInputSha256: plan.inputSha256,
    allocations,
    completed
  }

  async function publishJournal(): Promise<void> {
    journal = {
      planInputSha256: plan.inputSha256,
      allocations: { ...allocations },
      completed: [...completed]
    }
    await options.onJournalChange?.(journal)
  }

  const byId = new Map(plan.operations.map((operation) => [operation.operationId, operation]))
  const executed: string[] = []
  const skipped: string[] = []
  let pendingFailure: MutationExecutionFailure | null = null

  for (const operationId of ordered.order) {
    const operation = byId.get(operationId) as CatalogMutationPlanOperationV1

    if (outputs.has(operationId)) {
      skipped.push(operationId)
      continue
    }

    let allocationFailure: MutationExecutionFailure | null = null
    const context: ResolutionContext = {
      bindingValue: (handle) => {
        const binding = bindings.get(handle)
        if (binding === undefined) {
          allocationFailure ??= { code: "BINDING_MISSING", operationId, detail: handle }
          return undefined
        }
        if (binding.source.kind === "resolved_uuid") return binding.source.id
        if (binding.source.kind === "operation_output") {
          const produced = outputs.get(binding.source.operationId)
          const value = produced?.[binding.source.field]
          return typeof value === "string" ? value : undefined
        }
        // allocate_uuid: reuse the journalled value so a resumed run cannot mint a second identity.
        allocations[handle] ??= options.allocateUuid()
        return allocations[handle]
      },
      outputValue: (dependencyId, field) => outputs.get(dependencyId)?.[field]
    }

    const resolved = resolveInput(operation.input, context)
    if (!resolved.ok) {
      pendingFailure = allocationFailure ?? { ...resolved.failure, operationId }
      await publishJournal()
      break
    }

    // Allocations made while resolving are recorded before the write that consumes them.
    await publishJournal()

    const outcome = await options.runOperation(operation, resolved.value)
    if (!outcome.ok) {
      pendingFailure = { code: "OPERATION_FAILED", operationId, detail: outcome.reason }
      break
    }

    outputs.set(operationId, outcome.outputs)
    completed.push({ operationId, outputs: outcome.outputs })
    executed.push(operationId)
    await publishJournal()
  }

  await publishJournal()

  return {
    ok: pendingFailure === null,
    journal,
    executed,
    skipped,
    failure: pendingFailure
  }
}
