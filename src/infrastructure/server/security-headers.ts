import type { VercelResponse } from "@vercel/node"

export function applyApiSecurityHeaders(response: VercelResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("Referrer-Policy", "no-referrer")
  response.setHeader("X-Frame-Options", "DENY")
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  )
  response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  // API responses are JSON only, so nothing may be loaded, framed or navigated from them.
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  )
  response.setHeader("Cache-Control", "no-store")
}
