import type { VercelResponse } from "@vercel/node"
import { expect, test, vi } from "vitest"

import { applyApiSecurityHeaders } from "./security-headers"

test("applies the production API security header baseline", () => {
  const setHeader = vi.fn()
  const response = { setHeader } as unknown as VercelResponse

  applyApiSecurityHeaders(response)

  expect(setHeader.mock.calls).toEqual([
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "no-referrer"],
    ["X-Frame-Options", "DENY"],
    [
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
    ],
    ["Cache-Control", "no-store"]
  ])
})
