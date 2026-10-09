import { describe, expect, it } from "vitest"
import {
  analyzeMealLeftoverStorage,
  classifyDishStorageRule,
  detectStorageCategory
} from "./leftover-storage-guide"

describe("leftover-storage-guide domain", () => {
  describe("detectStorageCategory", () => {
    it("detects leafy greens that should not be kept overnight", () => {
      expect(detectStorageCategory("Rau muống luộc")).toBe("leafy_greens")
      expect(detectStorageCategory("Canh rau ngót nấu thịt")).toBe("leafy_greens")
      expect(detectStorageCategory("Cải ngọt xào tỏi")).toBe("leafy_greens")
      expect(detectStorageCategory("Rau mồng tơi nấu cua")).toBe("leafy_greens")
      expect(detectStorageCategory("Rau đay nấu tôm")).toBe("leafy_greens")
    })

    it("detects seafood dishes", () => {
      expect(detectStorageCategory("Cá ba sa kho tộ")).toBe("braised_savory") // kho takes precedence for savory storage
      expect(detectStorageCategory("Tôm hấp sả")).toBe("seafood")
      expect(detectStorageCategory("Mực xào cần tỏi")).toBe("seafood")
      expect(detectStorageCategory("Cua hấp bia")).toBe("seafood")
      expect(detectStorageCategory("Ngao hấp sả ớt")).toBe("seafood")
    })

    it("detects braised savory meat dishes with longer fridge shelf life", () => {
      expect(detectStorageCategory("Thịt kho tàu")).toBe("braised_savory")
      expect(detectStorageCategory("Sườn ram mặn")).toBe("braised_savory")
      expect(detectStorageCategory("Thịt kho trứng")).toBe("braised_savory")
      expect(detectStorageCategory("Thịt rang cháy cạnh")).toBe("braised_savory")
      expect(detectStorageCategory("Cá bống kho tiêu")).toBe("braised_savory")
    })

    it("detects soups and broths", () => {
      expect(detectStorageCategory("Canh chua cá lóc")).toBe("soup_broth")
      expect(detectStorageCategory("Canh bí đao sườn non")).toBe("soup_broth")
      expect(detectStorageCategory("Canh sườn hầm rau củ")).toBe("soup_broth")
    })

    it("detects cooked rice and staple dishes", () => {
      expect(detectStorageCategory("Cơm trắng")).toBe("cooked_rice_staple")
      expect(detectStorageCategory("Cơm gạo lứt")).toBe("cooked_rice_staple")
      expect(detectStorageCategory("Xôi gấc")).toBe("cooked_rice_staple")
    })

    it("detects tofu and egg dishes", () => {
      expect(detectStorageCategory("Đậu hũ sốt cà chua")).toBe("tofu_egg")
      expect(detectStorageCategory("Đậu phụ rán giòn")).toBe("tofu_egg")
      expect(detectStorageCategory("Trứng chiên hành")).toBe("tofu_egg")
    })

    it("detects poultry dishes", () => {
      expect(detectStorageCategory("Gà luộc lá chanh")).toBe("poultry_meat")
      expect(detectStorageCategory("Vịt om sấu")).toBe("poultry_meat")
    })
  })

  describe("classifyDishStorageRule", () => {
    it("flags leafy greens as do_not_keep_overnight", () => {
      const rule = classifyDishStorageRule("Rau muống luộc")
      expect(rule.safetyTier).toBe("do_not_keep_overnight")
      expect(rule.maxSafeStorageHours).toBeLessThanOrEqual(6)
      expect(rule.safetyNoticeVi).toContain("nitrit")
    })

    it("classifies braised meat dishes as keep_2_to_3_days", () => {
      const rule = classifyDishStorageRule("Thịt kho tàu")
      expect(rule.safetyTier).toBe("keep_2_to_3_days")
      expect(rule.maxSafeStorageHours).toBe(72)
      expect(rule.reheatingInstruction).toContain("Đun sôi")
    })

    it("classifies seafood as keep_max_24h", () => {
      const rule = classifyDishStorageRule("Mực xào cần tây")
      expect(rule.safetyTier).toBe("keep_max_24h")
      expect(rule.maxSafeStorageHours).toBe(24)
    })

    it("classifies cooked rice with Bacillus cereus precaution", () => {
      const rule = classifyDishStorageRule("Cơm trắng")
      expect(rule.safetyTier).toBe("keep_max_24h")
      expect(rule.safetyNoticeVi).toContain("nguội")
    })
  })

  describe("analyzeMealLeftoverStorage", () => {
    it("analyzes a full family meal and detects overnight hazards when leafy greens are present", () => {
      const analysis = analyzeMealLeftoverStorage([
        { name: "Thịt kho tàu", role: "main" },
        { name: "Rau muống luộc", role: "vegetable" },
        { name: "Canh cua mồng tơi", role: "soup" },
        { name: "Cơm trắng", role: "staple" }
      ])

      expect(analysis.hasOvernightHazard).toBe(true)
      expect(analysis.overnightHazardDishes).toEqual(["Rau muống luộc", "Canh cua mồng tơi"])
      expect(analysis.rules).toHaveLength(4)
      expect(analysis.summaryNoticeVi).toContain("không nên để qua đêm")
    })

    it("marks hasOvernightHazard as false when all dishes can be stored safely", () => {
      const analysis = analyzeMealLeftoverStorage([
        { name: "Thịt ba chỉ rang cháy cạnh", role: "main" },
        { name: "Sườn ram mặn", role: "main" }
      ])

      expect(analysis.hasOvernightHazard).toBe(false)
      expect(analysis.overnightHazardDishes).toHaveLength(0)
      expect(analysis.rules.every((r) => r.rule.safetyTier === "keep_2_to_3_days")).toBe(true)
    })

    it("handles empty dish list gracefully", () => {
      const analysis = analyzeMealLeftoverStorage([])
      expect(analysis.hasOvernightHazard).toBe(false)
      expect(analysis.rules).toHaveLength(0)
    })
  })
})
