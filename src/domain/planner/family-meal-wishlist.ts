/**
 * Domain module for family collaboration, meal wishlists, voting, and calendar export.
 * Deterministic and framework-independent.
 */

export interface FamilyMealWish {
  readonly mealOptionId: string
  readonly mealOptionNameVi: string
  readonly requestedBy: string
  readonly voteCount: number
  readonly note?: string | undefined
  readonly createdAtIso: string
}

export interface AddWishItemInput {
  readonly mealOptionId: string
  readonly mealOptionNameVi: string
  readonly requestedBy: string
  readonly note?: string | undefined
  readonly nowIso?: string | undefined
}

export interface RankedMealOption {
  readonly id: string
  readonly nameVi: string
  readonly familyVotes: number
  readonly isRequested: boolean
}

export interface WeeklyAnnouncementItem {
  readonly dayIndex: number
  readonly mealOptionNameVi: string
  readonly elapsedMinutes: number
}

export interface WeeklyAnnouncementInput {
  readonly householdName?: string | undefined
  readonly weekStart: string
  readonly items: readonly WeeklyAnnouncementItem[]
}

const DAY_NAMES = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

function addDaysToIso(baseDate: string, days: number): string {
  const parts = baseDate.split("-").map(Number)
  const year = parts[0] ?? 2026
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const d = new Date(year, month - 1, day + days, 12, 0, 0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dt = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dt}`
}

function formatDateVietnamese(isoDate: string): string {
  const parts = isoDate.split("-")
  const day = parts[2] ?? "01"
  const month = parts[1] ?? "01"
  return `${day}/${month}`
}

export function addOrVoteWishItem(
  wishlist: readonly FamilyMealWish[],
  input: AddWishItemInput
): FamilyMealWish[] {
  const existingIdx = wishlist.findIndex((w) => w.mealOptionId === input.mealOptionId)
  const nowIso = input.nowIso ?? "2026-09-30T12:00:00.000Z"

  if (existingIdx >= 0) {
    const existing = wishlist[existingIdx]
    if (!existing) return [...wishlist]

    const voters = existing.requestedBy
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    if (!voters.includes(input.requestedBy.trim())) {
      voters.push(input.requestedBy.trim())
    }

    const updated: FamilyMealWish = {
      ...existing,
      voteCount: existing.voteCount + 1,
      requestedBy: voters.join(", "),
      note: input.note ? input.note : existing.note
    }

    const next = [...wishlist]
    next[existingIdx] = updated
    return next
  }

  const newItem: FamilyMealWish = {
    mealOptionId: input.mealOptionId,
    mealOptionNameVi: input.mealOptionNameVi,
    requestedBy: input.requestedBy.trim(),
    voteCount: 1,
    ...(input.note ? { note: input.note } : {}),
    createdAtIso: nowIso
  }

  return [...wishlist, newItem]
}

export function removeWishItem(
  wishlist: readonly FamilyMealWish[],
  mealOptionId: string
): FamilyMealWish[] {
  return wishlist.filter((w) => w.mealOptionId !== mealOptionId)
}

export function rankMealReplacementsByFamilyWish(
  replacements: readonly { readonly id: string; readonly nameVi: string }[],
  wishlist: readonly FamilyMealWish[]
): RankedMealOption[] {
  const votesMap = new Map<string, number>()
  for (const item of wishlist) {
    votesMap.set(item.mealOptionId, item.voteCount)
  }

  const scored = replacements.map((rep) => {
    const familyVotes = votesMap.get(rep.id) ?? 0
    return {
      id: rep.id,
      nameVi: rep.nameVi,
      familyVotes,
      isRequested: familyVotes > 0
    }
  })

  return scored.sort((a, b) => {
    if (b.familyVotes !== a.familyVotes) {
      return b.familyVotes - a.familyVotes
    }
    return a.nameVi.localeCompare(b.nameVi, "vi")
  })
}

export function formatFamilyMenuAnnouncement(input: WeeklyAnnouncementInput): string {
  const sortedItems = [...input.items].sort((a, b) => a.dayIndex - b.dayIndex)
  const endDate = addDaysToIso(input.weekStart, 6)
  const rangeStr = `${formatDateVietnamese(input.weekStart)} đến ${formatDateVietnamese(endDate)}`
  const title = input.householdName
    ? `🏡 THỰC ĐƠN BẾP NHÀ TUẦN NÀY - ${input.householdName.toUpperCase()}`
    : "🏡 THỰC ĐƠN BẾP NHÀ TUẦN NÀY"

  const lines: string[] = [
    title,
    `📅 Tuần từ ${rangeStr}`,
    "Cả nhà cùng về ăn cơm ấm áp nhé! ❤️",
    ""
  ]

  for (const item of sortedItems) {
    const dayLabel = DAY_NAMES[item.dayIndex] ?? `Ngày ${item.dayIndex + 1}`
    const isWeekend = item.dayIndex === 5 || item.dayIndex === 6
    const weekendTag = isWeekend ? " (Cuối tuần sum họp)" : ""
    lines.push(`🥢 ${dayLabel}${weekendTag}: ${item.mealOptionNameVi} (${item.elapsedMinutes}p)`)
  }

  lines.push("")
  lines.push("✨ Chúc cả nhà tuần mới ngon miệng và đầm ấm!")

  return lines.join("\n")
}

export function generateFamilyMealCalendarIcs(input: WeeklyAnnouncementInput): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BepNha//FamilyMealPlanner//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ]

  const sortedItems = [...input.items].sort((a, b) => a.dayIndex - b.dayIndex)

  for (const item of sortedItems) {
    const dateIso = addDaysToIso(input.weekStart, item.dayIndex)
    const compactDate = dateIso.replace(/-/g, "")
    const dtStart = `${compactDate}T183000`
    const dtEnd = `${compactDate}T193000`
    const uid = `bepnha-meal-${item.dayIndex}-${dateIso}@bepnha.vn`

    lines.push("BEGIN:VEVENT")
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${compactDate}T120000Z`)
    lines.push(`DTSTART:${dtStart}`)
    lines.push(`DTEND:${dtEnd}`)
    lines.push(`SUMMARY:Bếp Nhà: ${item.mealOptionNameVi}`)
    lines.push(
      `DESCRIPTION:Bữa tối gia đình: ${item.mealOptionNameVi}. Thời gian nấu dự kiến: ${item.elapsedMinutes} phút.`
    )
    lines.push("STATUS:CONFIRMED")
    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")
  return lines.join("\r\n")
}
