import type { VercelRequest, VercelResponse } from "@vercel/node"

import {
  createServerSupabaseAuthVerifier,
  parseBearerToken,
  type ServerAuthVerifier
} from "@/infrastructure/supabase/server-auth.js"

export function createMeHandler(verifier: ServerAuthVerifier) {
  return async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET")
      response.status(405).json({ error: "METHOD_NOT_ALLOWED" })
      return
    }

    const token = parseBearerToken(request.headers.authorization)
    if (token === null) {
      response.status(401).json({ error: "UNAUTHORIZED" })
      return
    }

    try {
      const identity = await verifier.verify(token)
      if (identity === null) {
        response.status(401).json({ error: "UNAUTHORIZED" })
        return
      }
      response.status(200).json(identity)
    } catch {
      response.status(503).json({ error: "AUTH_UNAVAILABLE" })
    }
  }
}

const verifier: ServerAuthVerifier = {
  async verify(accessToken) {
    const url = process.env.SUPABASE_URL
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
    if (url === undefined || publishableKey === undefined) {
      throw new Error("Server Supabase public configuration is unavailable")
    }
    return createServerSupabaseAuthVerifier({ url, publishableKey }).verify(accessToken)
  }
}

export default createMeHandler(verifier)
