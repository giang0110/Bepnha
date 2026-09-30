export type PantryStorageZone = "chilled" | "frozen" | "ambient"

export interface StorageZoneOption {
  readonly id: PantryStorageZone | "all"
  readonly labelVi: string
  readonly shortLabelVi: string
}

export const PANTRY_STORAGE_ZONES: readonly StorageZoneOption[] = Object.freeze([
  { id: "all", labelVi: "Tất cả các ngăn", shortLabelVi: "Tất cả" },
  { id: "chilled", labelVi: "Ngăn mát (Rau củ, trứng & đậu)", shortLabelVi: "Ngăn mát" },
  { id: "frozen", labelVi: "Ngăn đông (Thịt, cá & hải sản)", shortLabelVi: "Ngăn đông" },
  { id: "ambient", labelVi: "Tủ đồ khô (Gia vị & lương thực)", shortLabelVi: "Tủ đồ khô" }
])

export interface StorageZoneMetadata {
  readonly zone: PantryStorageZone
  readonly labelVi: string
  readonly freshnessHintVi: string
  readonly badgeColor: "clay" | "broth" | "herb"
  readonly iconName: "leaf" | "thermometer" | "bowl"
}

const ZONE_METADATA: Readonly<Record<PantryStorageZone, StorageZoneMetadata>> = Object.freeze({
  chilled: {
    zone: "chilled",
    labelVi: "Ngăn mát",
    freshnessHintVi: "Nên dùng trong 2–4 ngày để giữ trọn độ tươi ngon",
    badgeColor: "herb",
    iconName: "leaf"
  },
  frozen: {
    zone: "frozen",
    labelVi: "Ngăn đông",
    freshnessHintVi: "Trữ đông thịt cá tươi, rã đông trước khi nấu",
    badgeColor: "clay",
    iconName: "thermometer"
  },
  ambient: {
    zone: "ambient",
    labelVi: "Tủ đồ khô",
    freshnessHintVi: "Bảo quản nơi khô ráo, dùng dài hạn",
    badgeColor: "broth",
    iconName: "bowl"
  }
})

const CHILLED_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bca chua\b/u,
  /\bca rot\b/u,
  /\bca tim\b/u,
  /\bca phao\b/u,
  /\bbap cai\b/u,
  /\bdau cove\b/u,
  /\bdau co ve\b/u,
  /\bdau hu\b/u,
  /\btofu\b/u,
  /\btrung\b/u,
  /\brau\b/u,
  /\bcai\b/u,
  /\bmuong\b/u,
  /\bden\b/u,
  /\bngot\b/u,
  /\bthao\b/u,
  /\bbi dao\b/u,
  /\bbi do\b/u,
  /\bbi\b/u,
  /\bmuop\b/u,
  /\bsu su\b/u,
  /\bkhoai\b/u,
  /\bgia do\b/u,
  /\bgia\b/u,
  /\bnam\b/u,
  /\bdua leo\b/u,
  /\bxa lach\b/u,
  /\bhanh la\b/u,
  /\brau ngo\b/u,
  /\bngo ri\b/u,
  /\bmui\b/u
])

const FROZEN_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bthit\b/u,
  /\bsuon\b/u,
  /\bba chi\b/u,
  /\bnac vai\b/u,
  /\bbo\b/u,
  /\bheo\b/u,
  /\blon\b/u,
  /\bga\b/u,
  /\bvit\b/u,
  /\bchim\b/u,
  /\bca\b/u,
  /\btom\b/u,
  /\bmuc\b/u,
  /\bbach tuoc\b/u,
  /\bhai san\b/u,
  /\bcha ca\b/u,
  /\bgio\b/u,
  /\bcua\b/u,
  /\bngheu\b/u,
  /\bso\b/u,
  /\boc\b/u,
  /\bluon\b/u,
  /\bech\b/u
])

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/gu, "d")
    .toLowerCase()
}

export function pantryStorageZone(foodNameVi: string): PantryStorageZone {
  const normalized = normalizeName(foodNameVi)

  for (const pattern of CHILLED_PATTERNS) {
    if (pattern.test(normalized)) return "chilled"
  }

  for (const pattern of FROZEN_PATTERNS) {
    if (pattern.test(normalized)) return "frozen"
  }

  return "ambient"
}

export function storageZoneMetadata(zone: PantryStorageZone): StorageZoneMetadata {
  return ZONE_METADATA[zone]
}

export function filterPantryItemsByZone<T>(
  items: readonly T[],
  zone: PantryStorageZone | "all",
  getFoodName: (item: T) => string
): readonly T[] {
  if (zone === "all") return items
  return items.filter((item) => pantryStorageZone(getFoodName(item)) === zone)
}
