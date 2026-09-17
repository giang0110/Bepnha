import { createClient } from "@supabase/supabase-js"
import type { VercelRequest, VercelResponse } from "@vercel/node"

import { createAccountHttpHandler } from "../src/infrastructure/server/account-http.js"
import type { Database } from "../src/infrastructure/supabase/database.types.js"
import { createServerSupabaseAuthVerifier } from "../src/infrastructure/supabase/server-auth.js"

function publicConfig() {
  const url = process.env.SUPABASE_URL
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
  if (url === undefined || publishableKey === undefined) {
    throw new Error("ACCOUNT_CONFIG_UNAVAILABLE")
  }
  return { url, publishableKey }
}

const handler = createAccountHttpHandler({
  auth: {
    verify(accessToken) {
      return createServerSupabaseAuthVerifier(publicConfig()).verify(accessToken)
    }
  },
  // Created lazily and only after the caller is verified, so the secret key is never touched on an
  // unauthenticated request.
  deleterFactory() {
    const { url } = publicConfig()
    const secretKey = process.env.SUPABASE_SECRET_KEY
    if (secretKey === undefined) throw new Error("ACCOUNT_DELETE_CONFIG_UNAVAILABLE")
    const serviceClient = createClient<Database>(url, secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
    })
    return {
      async deleteUser(userId: string) {
        const { error } = await serviceClient.auth.admin.deleteUser(userId)
        return { error }
      }
    }
  }
})

export default (request: VercelRequest, response: VercelResponse) => handler(request, response)
