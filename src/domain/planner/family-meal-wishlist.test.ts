import { describe, expect, test } from "vitest"
import {
  addOrVoteWishItem,
  removeWishItem,
  rankMealReplacementsByFamilyWish,
  formatFamilyMenuAnnouncement,
  generateFamilyMealCalendarIcs,
  type FamilyMealWish,
  type WeeklyAnnouncementInput
} from "./family-meal-wishlist"

describe("family-meal-wishlist domain", () => {
  describe("addOrVoteWishItem", () => {
    test("adds a new wish item if it does not exist", () => {
      const initial: readonly FamilyMealWish[] = []
      const updated = addOrVoteWishItem(initial, {
        mealOptionId: "opt-1",
        mealOptionNameVi: "Canh chua cá lóc",
        requestedBy: "Bố",
        note: "Thèm canh chua cuối tuần"
      })

      expect(updated).toHaveLength(1)
      expect(updated[0]).toMatchObject({
        mealOptionId: "opt-1",
        mealOptionNameVi: "Canh chua cá lóc",
        requestedBy: "Bố",
        voteCount: 1,
        note: "Thèm canh chua cuối tuần"
      })
      expect(updated[0]?.createdAtIso).toBeDefined()
    })

    test("increments vote count if item already exists", () => {
      const initial: readonly FamilyMealWish[] = [
        {
          mealOptionId: "opt-1",
          mealOptionNameVi: "Canh chua cá lóc",
          requestedBy: "Bố",
          voteCount: 1,
          note: "Thèm canh chua",
          createdAtIso: "2026-09-30T10:00:00.000Z"
        }
      ]

      const updated = addOrVoteWishItem(initial, {
        mealOptionId: "opt-1",
        mealOptionNameVi: "Canh chua cá lóc",
        requestedBy: "Mẹ"
      })

      expect(updated).toHaveLength(1)
      expect(updated[0]?.voteCount).toBe(2)
      expect(updated[0]?.requestedBy).toContain("Bố")
      expect(updated[0]?.requestedBy).toContain("Mẹ")
    })
  })

  describe("removeWishItem", () => {
    test("removes item from wishlist by mealOptionId", () => {
      const initial: readonly FamilyMealWish[] = [
        {
          mealOptionId: "opt-1",
          mealOptionNameVi: "Canh chua cá lóc",
          requestedBy: "Bố",
          voteCount: 2,
          createdAtIso: "2026-09-30T10:00:00.000Z"
        },
        {
          mealOptionId: "opt-2",
          mealOptionNameVi: "Sườn rim mặn ngọt",
          requestedBy: "Bé Bắp",
          voteCount: 1,
          createdAtIso: "2026-09-30T10:05:00.000Z"
        }
      ]

      const updated = removeWishItem(initial, "opt-1")
      expect(updated).toHaveLength(1)
      expect(updated[0]?.mealOptionId).toBe("opt-2")
    })
  })

  describe("rankMealReplacementsByFamilyWish", () => {
    test("ranks options with more family votes higher", () => {
      const replacements = [
        { id: "opt-a", nameVi: "Thịt rang cháy cạnh" },
        { id: "opt-b", nameVi: "Cá bống kho tiêu" },
        { id: "opt-c", nameVi: "Bò kho bánh mì" }
      ]

      const wishlist: readonly FamilyMealWish[] = [
        {
          mealOptionId: "opt-c",
          mealOptionNameVi: "Bò kho bánh mì",
          requestedBy: "Bố",
          voteCount: 3,
          createdAtIso: "2026-09-30T10:00:00.000Z"
        },
        {
          mealOptionId: "opt-a",
          mealOptionNameVi: "Thịt rang cháy cạnh",
          requestedBy: "Mẹ",
          voteCount: 1,
          createdAtIso: "2026-09-30T10:00:00.000Z"
        }
      ]

      const ranked = rankMealReplacementsByFamilyWish(replacements, wishlist)

      expect(ranked[0]?.id).toBe("opt-c")
      expect(ranked[0]?.familyVotes).toBe(3)
      expect(ranked[0]?.isRequested).toBe(true)

      expect(ranked[1]?.id).toBe("opt-a")
      expect(ranked[1]?.familyVotes).toBe(1)
      expect(ranked[1]?.isRequested).toBe(true)

      expect(ranked[2]?.id).toBe("opt-b")
      expect(ranked[2]?.familyVotes).toBe(0)
      expect(ranked[2]?.isRequested).toBe(false)
    })
  })

  describe("formatFamilyMenuAnnouncement", () => {
    test("generates warm Vietnamese family chat announcement", () => {
      const input: WeeklyAnnouncementInput = {
        householdName: "Tổ Ấm Nhỏ",
        weekStart: "2026-09-21",
        items: [
          { dayIndex: 0, mealOptionNameVi: "Thịt kho trứng cút", elapsedMinutes: 30 },
          { dayIndex: 1, mealOptionNameVi: "Canh chua cá lóc", elapsedMinutes: 35 },
          { dayIndex: 2, mealOptionNameVi: "Gà rang gừng", elapsedMinutes: 25 },
          { dayIndex: 3, mealOptionNameVi: "Bò xào cần tỏi", elapsedMinutes: 20 },
          { dayIndex: 4, mealOptionNameVi: "Sườn nướng mật ong", elapsedMinutes: 40 },
          { dayIndex: 5, mealOptionNameVi: "Lẩu gà lá é", elapsedMinutes: 45 },
          { dayIndex: 6, mealOptionNameVi: "Bún chả Hà Nội", elapsedMinutes: 45 }
        ]
      }

      const text = formatFamilyMenuAnnouncement(input)

      expect(text).toContain("THỰC ĐƠN BẾP NHÀ TUẦN NÀY")
      expect(text).toContain("TỔ ẤM NHỎ")
      expect(text).toContain("Thứ Hai: Thịt kho trứng cút")
      expect(text).toContain("Thứ Bảy")
      expect(text).toContain("Lẩu gà lá é")
      expect(text).toContain("Chủ Nhật")
      expect(text).toContain("Bún chả Hà Nội")
      expect(text).toContain("Cả nhà cùng về ăn cơm ấm áp nhé")
    })
  })

  describe("generateFamilyMealCalendarIcs", () => {
    test("generates standard iCalendar RFC 5545 format", () => {
      const input: WeeklyAnnouncementInput = {
        householdName: "Nhà Mình",
        weekStart: "2026-09-21",
        items: [
          { dayIndex: 0, mealOptionNameVi: "Thịt kho trứng", elapsedMinutes: 30 },
          { dayIndex: 1, mealOptionNameVi: "Canh cá nấu chua", elapsedMinutes: 35 }
        ]
      }

      const ics = generateFamilyMealCalendarIcs(input)

      expect(ics).toContain("BEGIN:VCALENDAR")
      expect(ics).toContain("VERSION:2.0")
      expect(ics).toContain("PRODID:-//BepNha//FamilyMealPlanner//VI")
      expect(ics).toContain("BEGIN:VEVENT")
      expect(ics).toContain("SUMMARY:Bếp Nhà: Thịt kho trứng")
      expect(ics).toContain("DTSTART:20260921T183000")
      expect(ics).toContain("DTEND:20260921T193000")
      expect(ics).toContain("SUMMARY:Bếp Nhà: Canh cá nấu chua")
      expect(ics).toContain("DTSTART:20260922T183000")
      expect(ics).toContain("END:VCALENDAR")
    })
  })
})
