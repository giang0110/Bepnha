import { createAssistantHttpHandler } from "@/infrastructure/server/assistant-http"
import { createAssistantRuntimeDependencies } from "@/infrastructure/server/assistant-runtime"

export default createAssistantHttpHandler(createAssistantRuntimeDependencies())
