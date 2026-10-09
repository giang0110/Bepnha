import { pantryStorageZone } from "../pantry/pantry-zones"

export type PrepTaskType = "defrost" | "rice" | "marinate" | "soak"

export interface PrepTask {
  readonly id: string
  readonly type: PrepTaskType
  readonly titleVi: string
  readonly detailVi: string
  readonly foodNameVi?: string
  readonly quantityLabel?: string
  readonly timingHintVi: string
}

export interface DayPrepItemInput {
  readonly dayIndex: number
  readonly mealOptionNameVi: string
  readonly scaledIngredients: readonly {
    readonly foodNameVi: string
    readonly displayQuantity: string
  }[]
  readonly components: readonly {
    readonly mealRole: string
    readonly recipeNameVi?: string
  }[]
}

const SOAK_PATTERNS = [
  /\bnam huong\b/iu,
  /\bmoc nhi\b/iu,
  /\bnam kho\b/iu,
  /\bdau den\b/iu,
  /\bdau xanh\b/iu,
  /\bdau do\b/iu,
  /\bhat sen kho\b/iu
]

function normalizeSearch(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
}

function needsSoaking(foodName: string): boolean {
  const norm = normalizeSearch(foodName)
  return SOAK_PATTERNS.some((pat) => pat.test(norm))
}

/**
 * Extracts early prep and defrost tasks for a given meal.
 * - Defrost tasks: Meat, poultry, fish, seafood stored in the freezer zone.
 * - Rice task: Meals with a staple rice component.
 * - Soak task: Dried mushrooms, wood ear, or beans that require soaking beforehand.
 */
export function extractDayPrepTasks(input: DayPrepItemInput): readonly PrepTask[] {
  const tasks: PrepTask[] = []

  // 1. Scan for frozen meat / fish / seafood needing advance defrost
  for (const ing of input.scaledIngredients) {
    const zone = pantryStorageZone(ing.foodNameVi)
    if (zone === "frozen") {
      tasks.push({
        id: `defrost:${input.dayIndex}:${normalizeSearch(ing.foodNameVi).replace(/\s+/g, "-")}`,
        type: "defrost",
        titleVi: `Rã đông: ${ing.foodNameVi}`,
        detailVi: `Lấy ${ing.foodNameVi} (${ing.displayQuantity}) từ ngăn đông xuống ngăn mát tủ lạnh để rã đông tự nhiên.`,
        foodNameVi: ing.foodNameVi,
        quantityLabel: ing.displayQuantity,
        timingHintVi: "Trước 6–8 tiếng (từ buổi sáng)"
      })
    }
  }

  // 2. Scan for dry ingredients that require soaking (mushrooms, beans)
  const soakIngredients = input.scaledIngredients.filter((ing) => needsSoaking(ing.foodNameVi))
  if (soakIngredients.length > 0) {
    const names = soakIngredients.map((i) => `${i.foodNameVi} (${i.displayQuantity})`).join(", ")
    tasks.push({
      id: `soak:${input.dayIndex}`,
      type: "soak",
      titleVi: `Ngâm nở nguyên liệu khô`,
      detailVi: `Ngâm ${names} với nước ấm để nguyên liệu nở mềm, thơm ngon trước khi nấu.`,
      timingHintVi: "Trước 1–2 tiếng"
    })
  }

  // 3. Scan for staple rice
  const hasStaple = input.components.some((c) => c.mealRole === "staple")
  const riceIng = input.scaledIngredients.find((ing) => {
    const norm = normalizeSearch(ing.foodNameVi)
    return norm.includes("gao te") || norm.includes("gao lut") || norm.includes("gao tam")
  })

  if (hasStaple || riceIng !== undefined) {
    const qty = riceIng?.displayQuantity ?? "lượng vừa đủ"
    tasks.push({
      id: `rice:${input.dayIndex}`,
      type: "rice",
      titleVi: "Cắm nồi cơm điện",
      detailVi: `Vo và cắm cơm: Gạo tẻ (${qty}) trước bữa ăn để kịp cơm nóng dẻo.`,
      timingHintVi: "Trước giờ ăn 35–45 phút"
    })
  }

  return tasks
}

/**
 * Formats a friendly Vietnamese message to send to family members via Zalo / SMS.
 */
export function generatePrepShareMessage(
  dayLabelVi: string,
  mealNameVi: string,
  tasks: readonly PrepTask[]
): string {
  const header = `🌞 Lời nhắc chuẩn bị bữa cơm [${dayLabelVi} — ${mealNameVi}]:`
  const lines: string[] = []

  for (const task of tasks) {
    let icon = "📌"
    if (task.type === "defrost") icon = "🧊"
    else if (task.type === "rice") icon = "🍚"
    else if (task.type === "soak") icon = "🍄"

    lines.push(`${icon} ${task.titleVi}: ${task.detailVi} (${task.timingHintVi})`)
  }

  const footer = `— Nhắn từ Bếp Nhà 🍳`
  return [header, ...lines, footer].join("\n\n")
}
