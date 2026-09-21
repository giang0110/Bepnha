import type { CatalogMutationPlanOperationV1 } from "./catalog-mutation-types.ts"
import type { OperationOutcome } from "./catalog-mutation-executor.ts"

/**
 * Runs a plan operation by asking the deployed admin endpoint to do it.
 *
 * Food, recipe, and price-book actions use `/api/admin/catalog`. Meal-option actions use the
 * sibling `/api/admin/meal-options` endpoint. Going through the endpoints rather than talking to
 * the database keeps the service-role key on the server, where it belongs: the operator
 * authenticates as themselves with an ordinary Supabase access token, the server checks they are an
 * admin, and every write lands in
 * `admin_audit_log` attributed to a person rather than to a shared secret.
 *
 * Nothing here retries. An operation that failed may or may not have been applied, and a blind retry
 * of a create is how a catalog grows a duplicate food; the executor's journal lets the operator
 * resume deliberately once they have looked.
 */

export interface AdminHttpGatewayOptions {
  /** Full URL of the admin endpoint, e.g. `https://bepnhatoi.vercel.app/api/admin/catalog`. */
  readonly endpoint: string
  /** A Supabase access token for a user whose `raw_app_meta_data.role` is `admin`. */
  readonly accessToken: string
  readonly fetch: typeof globalThis.fetch
  /** Milliseconds to wait for one request. */
  readonly timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

const MEAL_OPTION_KINDS = new Set<CatalogMutationPlanOperationV1["kind"]>([
  "create_meal_option",
  "save_meal_option_version_draft",
  "publish_meal_option"
])

function endpointForOperation(endpoint: string, operation: CatalogMutationPlanOperationV1): string {
  if (!MEAL_OPTION_KINDS.has(operation.kind)) return endpoint

  const url = new URL(endpoint)
  if (!url.pathname.endsWith("/api/admin/catalog")) {
    throw new Error("BEPNHA_ADMIN_ENDPOINT must end with /api/admin/catalog")
  }
  url.pathname = url.pathname.replace(/\/api\/admin\/catalog$/u, "/api/admin/meal-options")
  return url.toString()
}

/** The endpoint answers a success with exactly the fields a plan operation declares as outputs. */
function outputsFrom(body: unknown): Readonly<Record<string, string | number>> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  const outputs: Record<string, string | number> = {}
  for (const field of ["id", "revision", "status", "contentHash"]) {
    const value = record[field]
    if (typeof value === "string" || typeof value === "number") outputs[field] = value
  }
  return typeof outputs["id"] === "string" ? outputs : null
}

function reasonFrom(status: number, body: unknown): string {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const error = (body as Record<string, unknown>)["error"]
    if (typeof error === "string" && error !== "") return `${status} ${error}`
  }
  return `${status}`
}

/** A body that is not JSON tells us nothing; the status code still does. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export function createAdminHttpGateway(options: AdminHttpGatewayOptions) {
  return async function runOperation(
    operation: CatalogMutationPlanOperationV1,
    resolvedInput: unknown
  ): Promise<OperationOutcome> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    let response: Response
    try {
      response = await options.fetch(endpointForOperation(options.endpoint, operation), {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ action: operation.kind, input: resolvedInput }),
        signal: controller.signal
      })
    } catch (error) {
      // A request that never got an answer is the dangerous case: the write may still have landed.
      // Say so rather than implying it did not.
      return {
        ok: false,
        reason: `no response (${error instanceof Error ? error.message : "unknown"}); the write may or may not have been applied`
      }
    } finally {
      clearTimeout(timer)
    }

    const body = await readJson(response)

    if (!response.ok) return { ok: false, reason: reasonFrom(response.status, body) }

    const outputs = outputsFrom(body)
    if (outputs === null) {
      return { ok: false, reason: "the endpoint answered 200 with no usable id" }
    }
    return { ok: true, outputs }
  }
}
