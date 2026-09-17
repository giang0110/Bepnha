import type { VercelRequest, VercelResponse } from "@vercel/node"

import { ACCOUNT_DELETE_CONFIRMATION } from "@/application/account/account-deletion"

import {
  correlationId,
  createConsoleOperationalTelemetry,
  type OperationalTelemetry
} from "@/infrastructure/server/operational-telemetry"
import { applyApiSecurityHeaders } from "@/infrastructure/server/security-headers"
import { parseBearerToken, type ServerAuthVerifier } from "@/infrastructure/supabase/server-auth"

/**
 * Deletes the calling account and, through `on delete cascade` from `auth.users`, the profile and
 * household it owns — which in turn cascades to member groups, rules, plans, revisions, pantry and
 * shopping rows.
 *
 * The endpoint never accepts a target user id. It deletes whoever the verified token belongs to and
 * nothing else, so no request shape exists that could delete someone else's household.
 */

export interface AccountDeleter {
  deleteUser(userId: string): Promise<{ readonly error: unknown }>
}

export interface AccountHttpDependencies {
  readonly auth: ServerAuthVerifier
  readonly deleterFactory: () => AccountDeleter
  readonly telemetry?: OperationalTelemetry
  readonly createCorrelationId?: () => string
  readonly now?: () => number
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasConfirmation(body: unknown): boolean {
  if (!isRecord(body)) return false
  const keys = Object.keys(body)
  return (
    keys.length === 1 &&
    keys[0] === "confirmation" &&
    body.confirmation === ACCOUNT_DELETE_CONFIRMATION
  )
}

/**
 * Catalog authorship and the admin audit log reference `auth.users` with `on delete restrict`, so an
 * account that published food facts, recipes, price books or meal options — or that appears in the
 * audit log — cannot be removed without destroying immutable catalog provenance. That is a refusal
 * to explain, not a fault to report as a server error.
 */
function isAuthorshipRestriction(error: unknown): boolean {
  if (!isRecord(error)) return false
  const code = typeof error.code === "string" ? error.code : ""
  const message = typeof error.message === "string" ? error.message : ""
  return code === "23503" || /foreign key|violates foreign key constraint/iu.test(message)
}

export function createAccountHttpHandler(dependencies: AccountHttpDependencies) {
  return async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
    applyApiSecurityHeaders(response)

    const telemetry = dependencies.telemetry ?? createConsoleOperationalTelemetry()
    const now = dependencies.now ?? (() => performance.now())
    const startedAt = now()
    const correlation = correlationId(
      request.headers["x-correlation-id"],
      dependencies.createCorrelationId
    )
    response.setHeader("X-Correlation-Id", correlation)

    function finish(httpStatus: number, outcomeCode: string): void {
      telemetry.emit({
        event: "account_request",
        operation: "delete",
        correlationId: correlation,
        durationMs: now() - startedAt,
        httpStatus,
        outcomeCode
      })
    }

    function send(status: number, body: UnknownRecord, outcomeCode: string): void {
      response.status(status).json(body)
      finish(status, outcomeCode)
    }

    if (request.method !== "DELETE") {
      response.setHeader("Allow", "DELETE")
      send(405, { error: "METHOD_NOT_ALLOWED" }, "METHOD_NOT_ALLOWED")
      return
    }
    if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json") {
      send(415, { error: "UNSUPPORTED_MEDIA_TYPE" }, "UNSUPPORTED_MEDIA_TYPE")
      return
    }
    if (!hasConfirmation(request.body)) {
      send(400, { error: "CONFIRMATION_REQUIRED" }, "CONFIRMATION_REQUIRED")
      return
    }

    const token = parseBearerToken(request.headers.authorization)
    if (token === null) {
      send(401, { error: "UNAUTHORIZED" }, "UNAUTHORIZED")
      return
    }

    let actorUserId: string
    try {
      const verified = await dependencies.auth.verify(token)
      if (verified === null) {
        send(401, { error: "UNAUTHORIZED" }, "UNAUTHORIZED")
        return
      }
      actorUserId = verified.userId
    } catch {
      send(503, { error: "AUTH_UNAVAILABLE" }, "AUTH_UNAVAILABLE")
      return
    }

    try {
      const { error } = await dependencies.deleterFactory().deleteUser(actorUserId)
      if (error === null || error === undefined) {
        send(200, { status: "deleted" }, "DELETED")
        return
      }
      if (isAuthorshipRestriction(error)) {
        send(
          409,
          { error: "ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP" },
          "ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP"
        )
        return
      }
      send(503, { error: "ACCOUNT_DELETE_UNAVAILABLE" }, "ACCOUNT_DELETE_UNAVAILABLE")
    } catch {
      send(503, { error: "ACCOUNT_DELETE_UNAVAILABLE" }, "ACCOUNT_DELETE_UNAVAILABLE")
    }
  }
}
