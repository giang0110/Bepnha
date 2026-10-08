import type { PantryStorageZone } from "./pantry-zones"

export interface PantryInventoryEntry {
  readonly foodNameVi: string
  readonly quantity: string
  readonly unitName: string
  readonly zone: PantryStorageZone
  readonly isUrgent?: boolean
  readonly expiryLabel?: string | null
}

export interface FormatPantryInventoryOptions {
  readonly householdName?: string
  readonly dateStr?: string
  readonly entries: readonly PantryInventoryEntry[]
}

const ZONE_TITLE_MAP: Readonly<
  Record<PantryStorageZone, { readonly icon: string; readonly label: string }>
> = {
  chilled: { icon: "🥬", label: "NGĂN MÁT" },
  frozen: { icon: "❄️", label: "NGĂN ĐÔNG" },
  ambient: { icon: "🥫", label: "TỦ ĐỒ KHÔ" }
}

const ZONE_ORDER: readonly PantryStorageZone[] = ["chilled", "frozen", "ambient"]

/**
 * Normalizes Vietnamese text by stripping diacritics and converting to lowercase for fast search.
 */
export function normalizeVietnameseSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/gu, "d")
    .toLowerCase()
    .trim()
}

/**
 * Filters pantry inventory items deterministically by keyword and zone/urgency status.
 */
export function filterPantryItems<
  T extends {
    readonly foodNameVi: string
    readonly zone: PantryStorageZone
    readonly isUrgent?: boolean
  }
>(
  items: readonly T[],
  options: {
    readonly keyword?: string
    readonly filter?: PantryStorageZone | "all" | "urgent"
  }
): readonly T[] {
  const { keyword = "", filter = "all" } = options
  const normalizedQuery = normalizeVietnameseSearchText(keyword)

  return items.filter((item) => {
    // 1. Filter by zone or urgency
    if (filter === "urgent") {
      if (!item.isUrgent) return false
    } else if (filter !== "all") {
      if (item.zone !== filter) return false
    }

    // 2. Filter by search keyword
    if (normalizedQuery !== "") {
      const normalizedName = normalizeVietnameseSearchText(item.foodNameVi)
      if (!normalizedName.includes(normalizedQuery)) return false
    }

    return true
  })
}

/**
 * Formats a clean, readable text summary of the pantry inventory grouped by storage zone,
 * suitable for sharing via chat apps (Zalo, Telegram, SMS) or copying for family grocery checks.
 */
export function formatPantryInventoryText(options: FormatPantryInventoryOptions): string {
  const { householdName, dateStr, entries } = options

  if (entries.length === 0) {
    const title = householdName
      ? `📦 KIỂM KÊ TỦ BẾP — ${householdName.toUpperCase()}`
      : "📦 KIỂM KÊ TỦ BẾP GIA ĐÌNH"
    return `${title}\nTủ bếp hiện đang trống. Chưa có thực phẩm lưu trữ.\n\n---\nBepNha — Bếp Nhà`
  }

  const lines: string[] = []
  const header = householdName
    ? `📦 KIỂM KÊ TỦ BẾP — ${householdName.toUpperCase()} (${entries.length} loại thực phẩm)`
    : `📦 KIỂM KÊ TỦ BẾP GIA ĐÌNH (${entries.length} loại thực phẩm)`
  lines.push(header)

  if (dateStr) {
    lines.push(`Cập nhật ngày: ${dateStr}`)
  }

  const urgentCount = entries.filter((e) => e.isUrgent).length
  if (urgentCount > 0) {
    lines.push(`⚡ Lưu ý: Có ${urgentCount} món cần ưu tiên dùng sớm!`)
  }

  lines.push("")

  for (const zone of ZONE_ORDER) {
    const zoneEntries = entries.filter((e) => e.zone === zone)
    if (zoneEntries.length === 0) continue

    const { icon, label } = ZONE_TITLE_MAP[zone]
    lines.push(`${icon} ${label} (${zoneEntries.length} món):`)

    for (const item of zoneEntries) {
      let line = `• ${item.foodNameVi}: ${item.quantity} ${item.unitName}`
      if (item.isUrgent) {
        line += item.expiryLabel ? ` (⚠️ ${item.expiryLabel})` : " (⚠️ Dùng sớm)"
      }
      lines.push(line)
    }

    lines.push("")
  }

  lines.push("---")
  lines.push("BepNha — Bếp Nhà")

  return lines.join("\n")
}
