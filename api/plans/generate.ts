import type { VercelRequest, VercelResponse } from "@vercel/node"

import { plannerHttpHandlers } from "../../src/infrastructure/server/planner-runtime.js"

export default (request: VercelRequest, response: VercelResponse) =>
  plannerHttpHandlers.generate(request, response)
