export const KITCHEN_UNITS = [
  "tsp",
  "tbsp",
  "rice_bowl",
  "soup_bowl",
  "gram",
  "kg",
  "ml",
  "liter"
] as const

export type KitchenUnit = (typeof KITCHEN_UNITS)[number]

export interface KitchenUnitDefinition {
  readonly code: KitchenUnit
  readonly nameVi: string
  readonly shortLabelVi: string
  readonly kind: "volume" | "mass"
  readonly volumeMl?: number
  readonly massGrams?: number
}

const UNIT_DEFINITIONS: Readonly<Record<KitchenUnit, KitchenUnitDefinition>> = Object.freeze({
  tsp: {
    code: "tsp",
    nameVi: "Thìa cà phê / Muỗng cà phê (tsp)",
    shortLabelVi: "thìa cà phê",
    kind: "volume",
    volumeMl: 5
  },
  tbsp: {
    code: "tbsp",
    nameVi: "Thìa canh / Muỗng canh / Muỗng ăn cơm (tbsp)",
    shortLabelVi: "thìa canh",
    kind: "volume",
    volumeMl: 15
  },
  rice_bowl: {
    code: "rice_bowl",
    nameVi: "Bát con ăn cơm / Chén ăn cơm",
    shortLabelVi: "bát con",
    kind: "volume",
    volumeMl: 250
  },
  soup_bowl: {
    code: "soup_bowl",
    nameVi: "Bát tô canh lớn",
    shortLabelVi: "bát tô",
    kind: "volume",
    volumeMl: 750
  },
  gram: {
    code: "gram",
    nameVi: "Gam (g)",
    shortLabelVi: "g",
    kind: "mass",
    massGrams: 1
  },
  kg: {
    code: "kg",
    nameVi: "Kilôgam (kg)",
    shortLabelVi: "kg",
    kind: "mass",
    massGrams: 1000
  },
  ml: {
    code: "ml",
    nameVi: "Mililít (ml)",
    shortLabelVi: "ml",
    kind: "volume",
    volumeMl: 1
  },
  liter: {
    code: "liter",
    nameVi: "Lít (l)",
    shortLabelVi: "l",
    kind: "volume",
    volumeMl: 1000
  }
})

export const COMMON_INGREDIENT_CATEGORIES = [
  "water_broth",
  "fish_sauce",
  "soy_sauce",
  "cooking_oil",
  "oyster_sauce",
  "table_salt",
  "granulated_sugar",
  "seasoning_powder",
  "msg",
  "ground_pepper",
  "raw_rice",
  "tapioca_starch"
] as const

export type CommonIngredientCategory = (typeof COMMON_INGREDIENT_CATEGORIES)[number]

export interface IngredientCategoryDefinition {
  readonly code: CommonIngredientCategory
  readonly nameVi: string
  readonly densityGramsPerMl: number
  readonly tspGrams: number
  readonly tbspGrams: number
  readonly riceBowlGrams: number
  readonly notesVi: string
}

const INGREDIENT_DEFINITIONS: Readonly<
  Record<CommonIngredientCategory, IngredientCategoryDefinition>
> = Object.freeze({
  water_broth: {
    code: "water_broth",
    nameVi: "Nước lọc / Nước dùng",
    densityGramsPerMl: 1.0,
    tspGrams: 5,
    tbspGrams: 15,
    riceBowlGrams: 250,
    notesVi: "1ml tương đương 1g nước lọc chuẩn."
  },
  fish_sauce: {
    code: "fish_sauce",
    nameVi: "Nước mắm",
    densityGramsPerMl: 1.15,
    tspGrams: 6,
    tbspGrams: 17,
    riceBowlGrams: 285,
    notesVi: "Nước mắm truyền thống có độ đạm cao và khối lượng riêng nặng hơn nước."
  },
  soy_sauce: {
    code: "soy_sauce",
    nameVi: "Nước tương / Xì dầu",
    densityGramsPerMl: 1.1,
    tspGrams: 5.5,
    tbspGrams: 16.5,
    riceBowlGrams: 275,
    notesVi: "Nước tương sánh nhẹ, đậm đà hơn nước lọc."
  },
  cooking_oil: {
    code: "cooking_oil",
    nameVi: "Dầu ăn",
    densityGramsPerMl: 0.92,
    tspGrams: 4.6,
    tbspGrams: 14,
    riceBowlGrams: 230,
    notesVi: "Dầu ăn nhẹ hơn nước, nổi trên bề mặt."
  },
  oyster_sauce: {
    code: "oyster_sauce",
    nameVi: "Dầu hào",
    densityGramsPerMl: 1.2,
    tspGrams: 6,
    tbspGrams: 18,
    riceBowlGrams: 300,
    notesVi: "Dầu hào sền sệt, nặng và đậm đặc."
  },
  table_salt: {
    code: "table_salt",
    nameVi: "Muối ăn",
    densityGramsPerMl: 1.2,
    tspGrams: 5,
    tbspGrams: 15,
    riceBowlGrams: 300,
    notesVi: "1 thìa cà phê gạt ngang chứa khoảng 5g muối tinh."
  },
  granulated_sugar: {
    code: "granulated_sugar",
    nameVi: "Đường kính trắng",
    densityGramsPerMl: 0.85,
    tspGrams: 4,
    tbspGrams: 12,
    riceBowlGrams: 200,
    notesVi: "Hạt đường xốp, 1 thìa canh gạt ngang nặng khoảng 12g."
  },
  seasoning_powder: {
    code: "seasoning_powder",
    nameVi: "Hạt nêm",
    densityGramsPerMl: 0.8,
    tspGrams: 4,
    tbspGrams: 12,
    riceBowlGrams: 190,
    notesVi: "Hạt nêm dạng cốm nhỏ xốp."
  },
  msg: {
    code: "msg",
    nameVi: "Mì chính / Bột ngọt",
    densityGramsPerMl: 0.9,
    tspGrams: 4.5,
    tbspGrams: 13.5,
    riceBowlGrams: 215,
    notesVi: "Hạt mì chính hình que mảnh."
  },
  ground_pepper: {
    code: "ground_pepper",
    nameVi: "Hạt tiêu xay",
    densityGramsPerMl: 0.6,
    tspGrams: 3,
    tbspGrams: 9,
    riceBowlGrams: 140,
    notesVi: "Bột tiêu nhẹ xốp, mùi thơm nồng."
  },
  raw_rice: {
    code: "raw_rice",
    nameVi: "Gạo tẻ sống",
    densityGramsPerMl: 0.75,
    tspGrams: 4,
    tbspGrams: 12,
    riceBowlGrams: 150,
    notesVi: "1 bát con gạo gạt ngang ~150g, nấu chín cho khoảng 300g cơm (2 bát cơm)."
  },
  tapioca_starch: {
    code: "tapioca_starch",
    nameVi: "Bột năng / Bột bắp",
    densityGramsPerMl: 0.65,
    tspGrams: 3.5,
    tbspGrams: 10,
    riceBowlGrams: 160,
    notesVi: "Bột mịn nhẹ, dùng để tạo độ sánh sệt."
  }
})

export function getKitchenUnitDefinition(unit: KitchenUnit): KitchenUnitDefinition {
  return UNIT_DEFINITIONS[unit]
}

export function getIngredientCategoryDefinition(
  category: CommonIngredientCategory
): IngredientCategoryDefinition {
  return INGREDIENT_DEFINITIONS[category]
}

export interface ConvertMeasurementParams {
  readonly amount: number
  readonly fromUnit: KitchenUnit
  readonly toUnit: KitchenUnit
  readonly ingredient?: CommonIngredientCategory | undefined
}

export interface KitchenConversionResult {
  readonly convertedAmount: number
  readonly displayResultVi: string
  readonly explanationVi: string
}

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatResult(value: number, targetUnitDef: KitchenUnitDefinition): string {
  const rounded = roundToTwoDecimals(value)
  return `${rounded} ${targetUnitDef.shortLabelVi}`
}

export function convertKitchenMeasurement({
  amount,
  fromUnit,
  toUnit,
  ingredient = "water_broth"
}: ConvertMeasurementParams): KitchenConversionResult {
  if (amount <= 0) {
    return {
      convertedAmount: 0,
      displayResultVi: "0",
      explanationVi: "Số lượng quy đổi phải lớn hơn 0."
    }
  }

  const fromDef = UNIT_DEFINITIONS[fromUnit]
  const toDef = UNIT_DEFINITIONS[toUnit]
  const ingDef = INGREDIENT_DEFINITIONS[ingredient]

  if (fromUnit === toUnit) {
    return {
      convertedAmount: roundToTwoDecimals(amount),
      displayResultVi: formatResult(amount, toDef),
      explanationVi: `Cùng đơn vị ${fromDef.shortLabelVi}.`
    }
  }

  // 1. Both units are VOLUME
  if (fromDef.kind === "volume" && toDef.kind === "volume") {
    const totalMl = amount * (fromDef.volumeMl ?? 1)
    const converted = totalMl / (toDef.volumeMl ?? 1)
    return {
      convertedAmount: roundToTwoDecimals(converted),
      displayResultVi: formatResult(converted, toDef),
      explanationVi: `Quy đổi thể tích chuẩn: ${amount} ${fromDef.shortLabelVi} = ${roundToTwoDecimals(converted)} ${toDef.shortLabelVi}.`
    }
  }

  // 2. Both units are MASS
  if (fromDef.kind === "mass" && toDef.kind === "mass") {
    const totalGrams = amount * (fromDef.massGrams ?? 1)
    const converted = totalGrams / (toDef.massGrams ?? 1)
    return {
      convertedAmount: roundToTwoDecimals(converted),
      displayResultVi: formatResult(converted, toDef),
      explanationVi: `Quy đổi khối lượng chuẩn: ${amount} ${fromDef.shortLabelVi} = ${roundToTwoDecimals(converted)} ${toDef.shortLabelVi}.`
    }
  }

  // 3. FROM VOLUME TO MASS (or vice versa) using ingredient density / specific mass
  // Handle specific spoon-to-gram mappings for high accuracy
  let totalGrams: number

  if (fromDef.kind === "volume") {
    if (fromUnit === "tsp") {
      totalGrams = amount * ingDef.tspGrams
    } else if (fromUnit === "tbsp") {
      totalGrams = amount * ingDef.tbspGrams
    } else if (fromUnit === "rice_bowl") {
      totalGrams = amount * ingDef.riceBowlGrams
    } else {
      const ml = amount * (fromDef.volumeMl ?? 1)
      totalGrams = ml * ingDef.densityGramsPerMl
    }

    const converted = totalGrams / (toDef.massGrams ?? 1)
    return {
      convertedAmount: roundToTwoDecimals(converted),
      displayResultVi: formatResult(converted, toDef),
      explanationVi: `Áp dụng tỷ trọng của ${ingDef.nameVi}: ${amount} ${fromDef.shortLabelVi} ≈ ${roundToTwoDecimals(converted)} ${toDef.shortLabelVi}.`
    }
  }

  // fromDef.kind === "mass" -> toDef.kind === "volume"
  const sourceGrams = amount * (fromDef.massGrams ?? 1)
  let converted: number

  if (toUnit === "tsp") {
    converted = sourceGrams / ingDef.tspGrams
  } else if (toUnit === "tbsp") {
    converted = sourceGrams / ingDef.tbspGrams
  } else if (toUnit === "rice_bowl") {
    converted = sourceGrams / ingDef.riceBowlGrams
  } else {
    const totalMl = sourceGrams / ingDef.densityGramsPerMl
    converted = totalMl / (toDef.volumeMl ?? 1)
  }

  return {
    convertedAmount: roundToTwoDecimals(converted),
    displayResultVi: formatResult(converted, toDef),
    explanationVi: `Áp dụng tỷ trọng của ${ingDef.nameVi}: ${amount} ${fromDef.shortLabelVi} ≈ ${roundToTwoDecimals(converted)} ${toDef.shortLabelVi}.`
  }
}

export interface VisualHandEstimateItem {
  readonly code: string
  readonly nameVi: string
  readonly visualGestureVi: string
  readonly estimatedGrams: string
  readonly exampleVi: string
  readonly iconEmoji: string
}

export function getVisualHandEstimates(): readonly VisualHandEstimateItem[] {
  return Object.freeze([
    {
      code: "palm_meat",
      nameVi: "1 Lòng bàn tay (không tính ngón)",
      visualGestureVi: "Lòng bàn tay mở phẳng, dày khoảng 1 đốt ngón tay",
      estimatedGrams: "100 - 120g",
      exampleVi: "1 phần thịt nạc, ức gà, hoặc phi lê cá cho 1 người ăn",
      iconEmoji: "✋"
    },
    {
      code: "handful_greens",
      nameVi: "1 Nắm tay đầy rau xanh",
      visualGestureVi: "Bàn tay nắm hờ một bó rau lá tươi",
      estimatedGrams: "150 - 200g",
      exampleVi: "Rau muống, mồng tơi, cải ngọt sau khi nhặt sạch",
      iconEmoji: "🥬"
    },
    {
      code: "fist_rice",
      nameVi: "1 Nắm tay khép chặt",
      visualGestureVi: "Bàn tay nắm chặt lại thành hình khối cầu",
      estimatedGrams: "150g (cơm chín)",
      exampleVi: "Tương đương 1 bát con cơm ăn vừa vặn cho 1 người trưởng thành",
      iconEmoji: "🍚"
    },
    {
      code: "thumb_spices",
      nameVi: "1 Đốt ngón tay cái",
      visualGestureVi: "Đoạn từ khớp ngón tay cái đến đầu ngón",
      estimatedGrams: "10 - 15g",
      exampleVi: "Một miếng gừng tươi, riềng, hoặc củ nghệ cạo vỏ",
      iconEmoji: "🫚"
    },
    {
      code: "thumb_tip_fat",
      nameVi: "1 Đầu ngón tay cái",
      visualGestureVi: "Phần đầu ngón tay cái từ mép móng tay",
      estimatedGrams: "5g (~1 thìa cà phê)",
      exampleVi: "Lượng dầu ăn, mỡ lợn hoặc bơ cho một lần phi thơm tỏi hành",
      iconEmoji: "🧈"
    }
  ])
}

export interface AromaticCheatSheetItem {
  readonly nameVi: string
  readonly unitEstimateVi: string
  readonly weightGramsVi: string
  readonly culinaryTipVi: string
}

export function getCommonAromaticsCheatSheet(): readonly AromaticCheatSheetItem[] {
  return Object.freeze([
    {
      nameVi: "Tỏi củ & Tép tỏi",
      unitEstimateVi: "1 tép vừa = 3 - 5g; 1 củ tỏi vừa (6-8 tép)",
      weightGramsVi: "25 - 30g / củ",
      culinaryTipVi: "Đập dập và để ngoài không khí 5 phút trước khi phi thơm để kích hoạt allicin."
    },
    {
      nameVi: "Hành tím (Hành khô)",
      unitEstimateVi: "1 củ hành tím vừa",
      weightGramsVi: "10 - 15g / củ",
      culinaryTipVi: "Thái lát mỏng phi vàng làm hành phi hoặc băm nhuyễn ướp thịt cá."
    },
    {
      nameVi: "Gừng tươi",
      unitEstimateVi: "1 đốt ngón tay cái",
      weightGramsVi: "10 - 15g / nhánh",
      culinaryTipVi: "Đập dập cho vào canh cá, luộc gà vịt để khử mùi tanh hiệu quả."
    },
    {
      nameVi: "Ớt chỉ thiên",
      unitEstimateVi: "1 quả ớt cay",
      weightGramsVi: "3 - 5g / quả",
      culinaryTipVi: "Bỏ hạt nếu muốn giảm độ cay nồng khi pha nước chấm."
    },
    {
      nameVi: "Hành lá & Ngò rí",
      unitEstimateVi: "1 nhánh hành lá (cả gốc và lá)",
      weightGramsVi: "10 - 15g / cây",
      culinaryTipVi: "Đầu hành trắng xào thơm trước, lá hành xanh rắc vào cuối cùng khi tắt bếp."
    }
  ])
}

export interface SeasoningCheatSheetItem {
  readonly ingredient: CommonIngredientCategory
  readonly nameVi: string
  readonly oneTspGrams: number
  readonly oneTbspGrams: number
  readonly noteVi: string
}

export function getCommonSeasoningCheatSheet(): readonly SeasoningCheatSheetItem[] {
  return Object.freeze([
    {
      ingredient: "table_salt",
      nameVi: "Muối ăn (muối tinh)",
      oneTspGrams: 5,
      oneTbspGrams: 15,
      noteVi: "1 thìa cà phê gạt ngang đủ nêm cho 1 bát tô canh 750ml."
    },
    {
      ingredient: "fish_sauce",
      nameVi: "Nước mắm",
      oneTspGrams: 6,
      oneTbspGrams: 17,
      noteVi: "1 thìa canh (15ml) thơm ngon chuẩn vị khi ướp 300g thịt kho."
    },
    {
      ingredient: "granulated_sugar",
      nameVi: "Đường kính trắng",
      oneTspGrams: 4,
      oneTbspGrams: 12,
      noteVi: "Đường dạng hạt xốp, cần 1 thìa canh để làm nước màu thắng đường."
    },
    {
      ingredient: "seasoning_powder",
      nameVi: "Hạt nêm",
      oneTspGrams: 4,
      oneTbspGrams: 12,
      noteVi: "Vừa vị, dễ hòa tan trong canh và các món xào nhanh."
    },
    {
      ingredient: "cooking_oil",
      nameVi: "Dầu ăn",
      oneTspGrams: 4.6,
      oneTbspGrams: 14,
      noteVi: "1 thìa canh là lượng dầu lý tưởng cho 1 đĩa rau xào 300g."
    },
    {
      ingredient: "oyster_sauce",
      nameVi: "Dầu hào",
      oneTspGrams: 6,
      oneTbspGrams: 18,
      noteVi: "Đặc sánh, tạo độ bóng mượt hấp dẫn cho món xào và nướng."
    },
    {
      ingredient: "ground_pepper",
      nameVi: "Tiêu xay",
      oneTspGrams: 3,
      oneTbspGrams: 9,
      noteVi: "Rắc nhẹ 1/2 thìa cà phê (~1.5g) khi món ăn vừa chín tới."
    }
  ])
}
