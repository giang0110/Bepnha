import type { VercelRequest, VercelResponse } from "@vercel/node"

import type { ShoppingListReadResult } from "../../application/shopping/shopping-list-repository.js"

import { applyApiSecurityHeaders } from "./security-headers.js"
import { parseBearerToken, type ServerAuthVerifier } from "../supabase/server-auth.js"

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu

interface Dependencies {
  readonly auth: ServerAuthVerifier
  readonly load: (
    accessToken: string,
    planId: string,
    revisionId: string | null
  ) => Promise<ShoppingListReadResult | null>
}

function queryReference(query: VercelRequest["query"]): {
  readonly planId: string
  readonly revisionId: string | null
} | null {
  const keys = Object.keys(query)
  if (keys.some((key) => key !== "planId" && key !== "revisionId")) return null
  const planId = query.planId
  const revisionId = query.revisionId
  if (typeof planId !== "string" || !UUID.test(planId)) return null
  if (revisionId !== undefined && (typeof revisionId !== "string" || !UUID.test(revisionId))) {
    return null
  }
  return { planId, revisionId: revisionId ?? null }
}

export function createShoppingReadHttpHandler(dependencies: Dependencies) {
  return async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
    applyApiSecurityHeaders(response)
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET")
      response.status(405).json({ error: "METHOD_NOT_ALLOWED" })
      return
    }
    const reference = queryReference(request.query)
    if (reference === null) {
      response.status(400).json({ error: "INVALID_REQUEST" })
      return
    }
    const token = parseBearerToken(request.headers.authorization)
    if (token === null) {
      response.status(401).json({ error: "UNAUTHORIZED" })
      return
    }
    try {
      const actor = await dependencies.auth.verify(token)
      if (actor === null) {
        response.status(401).json({ error: "UNAUTHORIZED" })
        return
      }
    } catch {
      response.status(503).json({ error: "AUTH_UNAVAILABLE" })
      return
    }
    try {
      const shoppingList = await dependencies.load(token, reference.planId, reference.revisionId)
      response.status(200).json({ shoppingList })
    } catch {
      response.status(503).json({ error: "SHOPPING_LIST_UNAVAILABLE" })
    }
  }
}
