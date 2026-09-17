import { createAssistantHttpHandler } from "../src/infrastructure/server/assistant-http.js"
import { createAssistantRuntimeDependencies } from "../src/infrastructure/server/assistant-runtime.js"

export default createAssistantHttpHandler(createAssistantRuntimeDependencies())
