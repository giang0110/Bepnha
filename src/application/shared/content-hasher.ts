export interface ContentHasher {
  readonly sha256: (content: Uint8Array) => Promise<string>
}
