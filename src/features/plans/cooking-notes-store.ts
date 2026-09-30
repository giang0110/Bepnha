const STORAGE_PREFIX = "bepnha:cooking-note:v1:"

function storageKey(mealOptionId: string): string {
  return `${STORAGE_PREFIX}${mealOptionId}`
}

export function loadCookingNote(storage: Storage, mealOptionId: string): string | null {
  try {
    const raw = storage.getItem(storageKey(mealOptionId))
    if (raw === null) return null
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

export function saveCookingNote(storage: Storage, mealOptionId: string, note: string): void {
  try {
    const trimmed = note.trim()
    if (trimmed.length === 0) {
      storage.removeItem(storageKey(mealOptionId))
    } else {
      storage.setItem(storageKey(mealOptionId), trimmed)
    }
  } catch {
    // LocalStorage quota or access denied
  }
}

export function clearCookingNote(storage: Storage, mealOptionId: string): void {
  try {
    storage.removeItem(storageKey(mealOptionId))
  } catch {
    // LocalStorage access denied
  }
}
