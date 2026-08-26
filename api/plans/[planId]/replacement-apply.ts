import type { VercelRequest, VercelResponse } from "@vercel/node"

import { plannerHttpHandlers } from "@/infrastructure/server/planner-runtime"

export default (request: VercelRequest, response: VercelResponse) =>
  plannerHttpHandlers.apply(request, response)
