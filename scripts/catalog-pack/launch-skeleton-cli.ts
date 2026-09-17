import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { serializeCsv } from "./catalog-sheet-csv.ts"
import { SHEET_FILE_NAMES, SHEET_HEADERS, type SheetBundle } from "./catalog-sheet-tables.ts"
import { FOODS, MEALS, RECIPES, type Method } from "./launch-skeleton-spec.ts"

/**
 * Expands the structural spec into the twelve spreadsheet tables at launch scale.
 *
 * The split is deliberate and load-bearing. A cell holds a value only when that value is
 * definitional — one gram per gram, version one, the order a step appears in. Every cell holding a
 * measurement or a judgement is written as a `CAN-DIEN` marker, or left blank where the column is
 * numeric, so the validator reports it by path rather than a default silently standing in for a
 * figure nobody looked up.
 */

const ALLERGENS = [
  "peanut",
  "tree_nut",
  "dairy",
  "egg",
  "soy",
  "wheat",
  "fish",
  "crustacean",
  "mollusc",
  "sesame"
] as const

const NUTRIENTS = [
  "energy_kcal",
  "protein_g",
  "carbohydrate_g",
  "fat_g",
  "fibre_g",
  "sodium_mg"
] as const

const FILL = (what: string) => `CAN-DIEN: ${what}`

const STEPS: Record<Method, readonly string[]> = {
  kho: [
    "Sơ chế nguyên liệu và ướp phần đạm với gia vị.",
    "Phi thơm hành tỏi rồi cho phần đạm vào đảo săn.",
    "Kho nhỏ lửa cho tới khi thấm và nước sánh lại."
  ],
  xao: [
    "Sơ chế và cắt nguyên liệu vừa ăn.",
    "Phi thơm tỏi, xào phần đạm trên lửa lớn.",
    "Cho phần rau vào đảo nhanh, nêm vừa ăn."
  ],
  chien: [
    "Sơ chế, thấm khô nguyên liệu và ướp gia vị.",
    "Chiên hoặc áp chảo cho vàng đều hai mặt.",
    "Vớt ra để ráo dầu, nêm lại nếu cần."
  ],
  luoc: [
    "Nhặt và rửa sạch rau.",
    "Đun nước sôi, thêm chút muối rồi cho rau vào luộc.",
    "Vớt ra ngay và để ráo."
  ],
  canh: [
    "Sơ chế nguyên liệu, cắt miếng vừa ăn.",
    "Đun nước sôi rồi cho phần đạm vào nấu.",
    "Cho rau vào, nêm vừa ăn, tắt bếp và thêm hành ngò."
  ],
  hap: [
    "Sơ chế nguyên liệu và ướp gia vị.",
    "Xếp vào xửng, hấp cách thủy.",
    "Lấy ra, rưới nước sốt và dùng nóng."
  ],
  nau: ["Vo gạo.", "Cho gạo và nước vào nồi theo tỉ lệ quen dùng.", "Nấu chín rồi ủ trước khi xới."]
}

/** Package units are a purchasing convention, not a measurement, so a sensible default is honest. */
const PACKAGE_UNIT: Record<string, string> = { g: "kg", ml: "l", item: "item" }

export function buildLaunchSkeleton(): SheetBundle {
  const bundle = Object.fromEntries(
    SHEET_FILE_NAMES.map((name) => [name, [[...SHEET_HEADERS[name]]]])
  ) as SheetBundle

  bundle["pack.csv"].push([
    "launch_v1",
    FILL("ISO 8601 UTC, vi du 2026-09-20T00:00:00Z"),
    FILL("ten nguon du lieu"),
    FILL("mo ta nguon va pham vi")
  ])

  for (const food of FOODS) {
    bundle["foods.csv"].push([
      food.code,
      food.nameVi,
      food.baseDimension,
      food.baseUnitCode,
      "1",
      food.categoryCode,
      food.ancestry.join("|"),
      FILL("phan an duoc tren khoi luong mua, 0 < x <= 1"),
      FILL("nguon du lieu tra cuu duoc"),
      ""
    ])

    for (const allergen of ALLERGENS) {
      bundle["food_allergens.csv"].push([
        food.code,
        allergen,
        FILL("absent | contains | may_contain | unknown"),
        FILL("can cu cho ket luan nay")
      ])
    }

    for (const nutrient of NUTRIENTS) {
      bundle["food_nutrients.csv"].push([
        food.code,
        nutrient,
        FILL("tren 100g phan an duoc"),
        FILL("nguon so lieu")
      ])
    }

    // One gram per gram is definitional. Grams per millilitre is density and grams per item is a
    // weight: both are measurements, so both stay empty.
    bundle["food_conversions.csv"].push([
      food.code,
      food.baseUnitCode,
      "1",
      food.baseUnitCode === "g" ? "1" : FILL("so gam thuc te cua mot don vi nay"),
      FILL("buoc hien thi, vi du 5"),
      FILL("can cu quy doi")
    ])
  }

  for (const recipe of RECIPES) {
    bundle["recipes.csv"].push([
      recipe.code,
      recipe.nameVi,
      "1",
      FILL("so nguoi lon mon nay du cho"),
      "",
      "",
      ""
    ])

    recipe.ingredients.forEach((foodCode, index) => {
      const food = FOODS.find((entry) => entry.code === foodCode)
      bundle["recipe_ingredients.csv"].push([
        recipe.code,
        foodCode,
        foodCode,
        "1",
        FILL("luong theo unitCode"),
        food?.baseUnitCode ?? "g",
        "",
        String(index + 1)
      ])
    })

    STEPS[recipe.method].forEach((instruction, index) => {
      bundle["recipe_steps.csv"].push([
        recipe.code,
        String(index + 1),
        instruction,
        "",
        index === 0 ? recipe.ingredients.join("|") : ""
      ])
    })
  }

  bundle["price_book.csv"].push(["vn_baseline", "1", FILL("YYYY-MM-DD"), ""])

  for (const food of FOODS) {
    bundle["prices.csv"].push([
      food.code,
      "1",
      FILL("so luong moi quy cach ban, vi du 1"),
      PACKAGE_UNIT[food.baseUnitCode] ?? food.baseUnitCode,
      FILL("quy cach ban quy ve don vi co so, vi du 1000"),
      food.baseUnitCode,
      "",
      FILL("buoc mua toi thieu ngoai cho"),
      FILL("YYYY-MM-DD ngay khao gia thuc te"),
      FILL("cho/sieu thi va cach khao")
    ])
  }

  for (const meal of MEALS) {
    const components = [["com_trang", "staple"] as const, ...meal.components]
    bundle["meal_options.csv"].push([
      meal.code,
      meal.nameVi,
      "1",
      FILL("so nguoi lon bua nay du cho"),
      "",
      "",
      meal.proteinHintCode,
      meal.cookingStyleCodes.join("|"),
      [...new Set(components.map(([, role]) => role))].join("|")
    ])

    components.forEach(([recipeCode, mealRole], index) => {
      bundle["meal_option_components.csv"].push([
        meal.code,
        recipeCode,
        "1",
        "1",
        mealRole,
        String(index + 1)
      ])
    })
  }

  return bundle
}

if (import.meta.main) {
  const directory = process.argv[2] ?? "docs/catalog/launch-skeleton"
  const bundle = buildLaunchSkeleton()

  mkdirSync(directory, { recursive: true })
  let rows = 0
  for (const name of SHEET_FILE_NAMES) {
    writeFileSync(join(directory, name), serializeCsv(bundle[name]), "utf8")
    rows += bundle[name].length - 1
  }

  process.stdout.write(
    `Wrote ${SHEET_FILE_NAMES.length} tables (${rows} data rows) to ${directory}\n` +
      `Next: npm run catalog:sheet -- import --dir ${directory} --out pack.json\n`
  )
}
