import type { ShoppingDeviceStorage } from "./offline-shopping-store"

import { MANUAL_SHOPPING_EXTRAS_KEY } from "@/app/pwa/household-device-data"

export { MANUAL_SHOPPING_EXTRAS_KEY } from "@/app/pwa/household-device-data"
const MAX_EXTRAS = 50
const MAX_LABEL_LENGTH = 80

export interface ManualShoppingExtra {
  readonly id: string
  readonly revisionId: string
  readonly label: string
  readonly checked: boolean
}

function isExtra(value: unknown): value is ManualShoppingExtra {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.revisionId === "string" &&
    entry.revisionId.length > 0 &&
    typeof entry.label === "string" &&
    entry.label.length > 0 &&
    entry.label.length <= MAX_LABEL_LENGTH &&
    typeof entry.checked === "boolean" &&
    Object.keys(entry).every((key) => ["id", "revisionId", "label", "checked"].includes(key))
  )
}

function readExtras(storage: ShoppingDeviceStorage): ManualShoppingExtra[] {
  try {
    const encoded = storage.getItem(MANUAL_SHOPPING_EXTRAS_KEY)
    if (encoded === null) return []
    const parsed: unknown = JSON.parse(encoded)
    return Array.isArray(parsed) && parsed.every(isExtra) ? parsed : []
  } catch {
    return []
  }
}

function writeExtras(
  storage: ShoppingDeviceStorage,
  extras: readonly ManualShoppingExtra[]
): boolean {
  try {
    if (extras.length === 0) storage.removeItem(MANUAL_SHOPPING_EXTRAS_KEY)
    else storage.setItem(MANUAL_SHOPPING_EXTRAS_KEY, JSON.stringify(extras.slice(-MAX_EXTRAS)))
    return true
  } catch {
    // Manual extras are an optional convenience; storage refusal must not affect the real list.
    return false
  }
}

export function loadManualShoppingExtras(
  storage: ShoppingDeviceStorage,
  revisionId: string
): ManualShoppingExtra[] {
  return readExtras(storage).filter((entry) => entry.revisionId === revisionId)
}

export function addManualShoppingExtra(
  storage: ShoppingDeviceStorage,
  revisionId: string,
  label: string,
  createId: () => string = () => crypto.randomUUID()
): boolean {
  const normalized = label.trim().slice(0, MAX_LABEL_LENGTH)
  if (normalized.length === 0) return false
  const id = createId()
  if (id.length === 0) return false
  return writeExtras(storage, [
    ...readExtras(storage),
    { id, revisionId, label: normalized, checked: false }
  ])
}

export function toggleManualShoppingExtra(
  storage: ShoppingDeviceStorage,
  revisionId: string,
  id: string,
  checked: boolean
): void {
  writeExtras(
    storage,
    readExtras(storage).map((entry) =>
      entry.revisionId === revisionId && entry.id === id ? { ...entry, checked } : entry
    )
  )
}

export function removeManualShoppingExtra(
  storage: ShoppingDeviceStorage,
  revisionId: string,
  id: string
): void {
  writeExtras(
    storage,
    readExtras(storage).filter((entry) => entry.revisionId !== revisionId || entry.id !== id)
  )
}
