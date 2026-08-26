/// <reference types="node" />

import { createHash } from "node:crypto"

import type { ContentHasher } from "@/application/catalog/content-hasher"

export class NodeContentHasher implements ContentHasher {
  readonly sha256 = (content: Uint8Array): Promise<string> => {
    return Promise.resolve(createHash("sha256").update(content).digest("hex"))
  }
}
