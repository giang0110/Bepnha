import { describe, expect, test } from "vitest"
import {
  filterPantryItemsByZone,
  PANTRY_STORAGE_ZONES,
  pantryStorageZone,
  storageZoneMetadata
} from "./pantry-zones"

describe("pantry-zones domain", () => {
  test("defines all standard storage zones with Vietnamese labels", () => {
    expect(PANTRY_STORAGE_ZONES.map((z) => z.id)).toEqual(["all", "chilled", "frozen", "ambient"])
  })

  test("classifies fresh produce and eggs/tofu as chilled zone (ngăn mát)", () => {
    expect(pantryStorageZone("Rau muống")).toBe("chilled")
    expect(pantryStorageZone("Bắp cải trắng")).toBe("chilled")
    expect(pantryStorageZone("Cà chua")).toBe("chilled")
    expect(pantryStorageZone("Đậu hũ non")).toBe("chilled")
    expect(pantryStorageZone("Trứng gà ta")).toBe("chilled")
  })

  test("classifies meats and seafood as frozen zone (ngăn đông trữ thịt cá)", () => {
    expect(pantryStorageZone("Thịt ba chỉ")).toBe("frozen")
    expect(pantryStorageZone("Thịt bò nạc")).toBe("frozen")
    expect(pantryStorageZone("Sườn heo")).toBe("frozen")
    expect(pantryStorageZone("Gà ta nguyên con")).toBe("frozen")
    expect(pantryStorageZone("Cá lóc")).toBe("frozen")
    expect(pantryStorageZone("Tôm sú")).toBe("frozen")
    expect(pantryStorageZone("Mực tươi")).toBe("frozen")
  })

  test("classifies staples, seasonings, and dry spices as ambient zone (tủ đồ khô & gia vị)", () => {
    expect(pantryStorageZone("Gạo tẻ")).toBe("ambient")
    expect(pantryStorageZone("Nước mắm")).toBe("ambient")
    expect(pantryStorageZone("Dầu ăn")).toBe("ambient")
    expect(pantryStorageZone("Muối tinh")).toBe("ambient")
    expect(pantryStorageZone("Đường cát")).toBe("ambient")
    expect(pantryStorageZone("Tiêu xay")).toBe("ambient")
  })

  test("returns clear freshness hints and visual metadata for each zone", () => {
    const chilled = storageZoneMetadata("chilled")
    expect(chilled.labelVi).toBe("Ngăn mát")
    expect(chilled.freshnessHintVi).toContain("2–4 ngày")

    const frozen = storageZoneMetadata("frozen")
    expect(frozen.labelVi).toBe("Ngăn đông")
    expect(frozen.freshnessHintVi).toContain("thịt cá")

    const ambient = storageZoneMetadata("ambient")
    expect(ambient.labelVi).toBe("Tủ đồ khô")
    expect(ambient.freshnessHintVi).toContain("dài hạn")
  })

  test("filters items correctly by zone", () => {
    const items = [
      { id: "1", name: "Rau muống" },
      { id: "2", name: "Thịt ba chỉ" },
      { id: "3", name: "Nước mắm" }
    ]

    expect(filterPantryItemsByZone(items, "all", (i) => i.name)).toHaveLength(3)
    expect(filterPantryItemsByZone(items, "chilled", (i) => i.name).map((i) => i.id)).toEqual(["1"])
    expect(filterPantryItemsByZone(items, "frozen", (i) => i.name).map((i) => i.id)).toEqual(["2"])
    expect(filterPantryItemsByZone(items, "ambient", (i) => i.name).map((i) => i.id)).toEqual(["3"])
  })
})
