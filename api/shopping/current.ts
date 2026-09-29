import type { VercelRequest, VercelResponse } from "@vercel/node"

import { shoppingReadHttpHandler } from "../../src/infrastructure/server/shopping-runtime.js"

export default (request: VercelRequest, response: VercelResponse) =>
  shoppingReadHttpHandler(request, response)
