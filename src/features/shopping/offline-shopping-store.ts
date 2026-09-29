import { SHOPPING_CHECK_QUEUE_KEY } from "@/app/pwa/household-device-data"

export { SHOPPING_CHECK_QUEUE_KEY } from "@/app/pwa/household-device-data"
const MAX_QUEUED_CHECKS = 200

export interface ShoppingDeviceStorage {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
  readonly removeItem: (key: string) => void
}

export interface QueuedShoppingCheck {
  readonly revisionId: string
  readonly shoppingListItemId: string
  readonly checked: boolean
}

function isQueuedCheck(value: unknown): value is QueuedShoppingCheck {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.revisionId === "string" &&
    entry.revisionId.length > 0 &&
    typeof entry.shoppingListItemId === "string" &&
    entry.shoppingListItemId.length > 0 &&
    typeof entry.checked === "boolean" &&
    Object.keys(entry).every((key) => ["revisionId", "shoppingListItemId", "checked"].includes(key))
  )
}

function readQueue(storage: ShoppingDeviceStorage): QueuedShoppingCheck[] {
  try {
    const encoded = storage.getItem(SHOPPING_CHECK_QUEUE_KEY)
    if (encoded === null) return []
    const parsed: unknown = JSON.parse(encoded)
    return Array.isArray(parsed) && parsed.every(isQueuedCheck) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(
  storage: ShoppingDeviceStorage,
  queue: readonly QueuedShoppingCheck[]
): boolean {
  try {
    if (queue.length === 0) storage.removeItem(SHOPPING_CHECK_QUEUE_KEY)
    else storage.setItem(SHOPPING_CHECK_QUEUE_KEY, JSON.stringify(queue))
    return true
  } catch {
    // The list itself still works when private browsing blocks device storage.
    return false
  }
}

export function loadQueuedShoppingChecks(
  storage: ShoppingDeviceStorage,
  revisionId: string
): QueuedShoppingCheck[] {
  return readQueue(storage).filter((entry) => entry.revisionId === revisionId)
}

export function queueShoppingCheck(
  storage: ShoppingDeviceStorage,
  entry: QueuedShoppingCheck
): boolean {
  const compacted = readQueue(storage).filter(
    (candidate) =>
      candidate.revisionId !== entry.revisionId ||
      candidate.shoppingListItemId !== entry.shoppingListItemId
  )
  compacted.push(entry)
  return writeQueue(storage, compacted.slice(-MAX_QUEUED_CHECKS))
}

export function discardQueuedShoppingCheck(
  storage: ShoppingDeviceStorage,
  entry: Pick<QueuedShoppingCheck, "revisionId" | "shoppingListItemId">
): void {
  writeQueue(
    storage,
    readQueue(storage).filter(
      (candidate) =>
        candidate.revisionId !== entry.revisionId ||
        candidate.shoppingListItemId !== entry.shoppingListItemId
    )
  )
}

export async function replayQueuedShoppingChecks(
  storage: ShoppingDeviceStorage,
  revisionId: string,
  send: (shoppingListItemId: string, checked: boolean) => Promise<unknown>
): Promise<{ readonly applied: number; readonly remaining: number }> {
  const queue = loadQueuedShoppingChecks(storage, revisionId)
  let applied = 0
  for (const entry of queue) {
    try {
      await send(entry.shoppingListItemId, entry.checked)
      discardQueuedShoppingCheck(storage, entry)
      applied += 1
    } catch {
      break
    }
  }
  return { applied, remaining: loadQueuedShoppingChecks(storage, revisionId).length }
}
