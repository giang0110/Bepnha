import type { VercelRequest, VercelResponse } from "@vercel/node"

export default function handler(request: VercelRequest, response: VercelResponse): void {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET")
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" })
    return
  }

  response.status(200).json({ status: "ok" })
}
