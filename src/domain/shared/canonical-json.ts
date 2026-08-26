export type CanonicalJsonPrimitive = null | boolean | number | string
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue }

function normalizeCanonicalValue(value: unknown): CanonicalJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new Error("UNSUPPORTED_CANONICAL_VALUE")
    }

    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeCanonicalValue(item))
  }

  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const normalized: Record<string, CanonicalJsonValue> = {}
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeCanonicalValue(Reflect.get(value, key))
    }

    return normalized
  }

  throw new Error("UNSUPPORTED_CANONICAL_VALUE")
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonicalValue(value))
}

export function canonicalUtf8(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value))
}

export function sortSetByStableKey<T>(
  values: readonly T[],
  getStableKey: (value: T) => string
): readonly T[] {
  return [...values].sort((left, right) => {
    const leftKey = getStableKey(left)
    const rightKey = getStableKey(right)
    const keyOrder = leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    if (keyOrder !== 0) {
      return keyOrder
    }

    const leftCanonical = canonicalJson(left)
    const rightCanonical = canonicalJson(right)
    return leftCanonical < rightCanonical ? -1 : leftCanonical > rightCanonical ? 1 : 0
  })
}
