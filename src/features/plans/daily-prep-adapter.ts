import type { IngredientLabels } from "./ingredient-labels"
import type { PlanItemView } from "./planner-api"
import { extractDayPrepTasks, type PrepTask } from "@/domain/planner/meal-prep-defrost"

/**
 * Adapts authoritative PlanItemView and IngredientLabels from the feature layer
 * to domain DayPrepItemInput and extracts actionable prep tasks.
 */
export function extractPlanItemPrepTasks(
  item: PlanItemView,
  labels: IngredientLabels
): readonly PrepTask[] {
  const scaledIngredients = item.scaledIngredients.map((ing) => {
    const foodNameVi = labels.foodNames.get(ing.foodId) ?? ing.foodId
    const unit = labels.unitCodes.get(ing.baseUnitId) ?? ""
    const displayQuantity = `${ing.baseQuantity} ${unit}`.trim()
    return { foodNameVi, displayQuantity }
  })

  return extractDayPrepTasks({
    dayIndex: item.dayIndex,
    mealOptionNameVi: item.mealOptionNameVi,
    scaledIngredients,
    components: item.components
  })
}
