import type { VercelResponse } from "@vercel/node"

export function applyApiSecurityHeaders(response: VercelResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("Referrer-Policy", "no-referrer")
  response.setHeader("X-Frame-Options", "DENY")
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  )
  response.setHeader("Cache-Control", "no-store")
}
