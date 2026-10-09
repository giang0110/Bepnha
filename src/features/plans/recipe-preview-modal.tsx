import { useState } from "react"
import { Link } from "react-router"

import { Button, buttonVariants } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"
import { mealRoleLabel } from "./cooking-sequence"
import { describeIngredient, type IngredientLabels } from "./ingredient-labels"
import { nutrientName, orderedNutrients } from "./nutrition-labels"
import type { PlanItemView } from "./planner-api"
import { stepConditions, stepIngredientNames } from "./step-details"
import { MemberPortionsPanel } from "./member-portions-panel"
import { FamilyCookingNotes } from "./family-cooking-notes"
import { CondimentPairingCard } from "./condiment-pairing-card"
import { LeftoverStorageGuideCard } from "./leftover-storage-guide-card"

const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

export interface RecipePreviewModalProps {
  readonly isOpen: boolean
  readonly item: PlanItemView | null
  readonly labels: IngredientLabels
  readonly initialTab?:
    "ingredients" | "steps" | "nutrition" | "notes" | "condiments" | "storage" | undefined
  readonly onClose: () => void
}

export function RecipePreviewModal({
  isOpen,
  item,
  labels,
  initialTab = "ingredients",
  onClose
}: Readonly<RecipePreviewModalProps>) {
  const [activeTab, setActiveTab] = useState<
    "ingredients" | "steps" | "nutrition" | "notes" | "condiments" | "storage"
  >(initialTab)

  if (!isOpen || item === null) return null

  const dayLabel = DAY_LABELS[item.dayIndex] ?? `Ngày ${item.dayIndex + 1}`

  return (
    <div
      aria-label={`Chi tiết công thức và sơ chế: ${item.mealOptionNameVi}`}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs"
      role="dialog"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-edge bg-paper-raised shadow-lift overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-edge p-5 sm:p-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-herb-100 px-3 py-0.5 text-xs font-bold text-herb-900">
                {dayLabel}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-paper-sunken px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                <Icon name="clock" className="size-3.5" />
                {item.elapsedMinutes} phút
              </span>
              <span className="flex items-center gap-1 rounded-full bg-paper-sunken px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                <Icon name="users" className="size-3.5" />
                {item.adultEquivalent} suất
              </span>
            </div>
            <h2 className="mt-2 text-lg sm:text-xl font-extrabold text-ink truncate">
              {item.mealOptionNameVi}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-ink-soft">
              {[...item.components]
                .toSorted((left, right) => left.sortOrder - right.sortOrder)
                .map((component) => mealRoleLabel(component.mealRole))
                .join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết công thức"
            className="rounded-full p-2 text-ink-soft hover:bg-paper-sunken hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto border-b border-edge bg-paper px-4 sm:px-6 pt-2 text-sm font-semibold scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("ingredients")}
            className={`border-b-2 px-3 sm:px-4 py-2.5 transition-colors whitespace-nowrap ${
              activeTab === "ingredients"
                ? "border-herb-700 text-herb-700 font-bold"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            Nguyên liệu & Sơ chế
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("steps")}
            className={`border-b-2 px-3 sm:px-4 py-2.5 transition-colors whitespace-nowrap ${
              activeTab === "steps"
                ? "border-herb-700 text-herb-700 font-bold"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            Các bước nấu ({item.components.reduce((acc, c) => acc + c.recipe.steps.length, 0)})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("nutrition")}
            className={`border-b-2 px-3 sm:px-4 py-2.5 transition-colors whitespace-nowrap ${
              activeTab === "nutrition"
                ? "border-herb-700 text-herb-700 font-bold"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            Dinh dưỡng
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("condiments")}
            className={`border-b-2 px-3 sm:px-4 py-2.5 transition-colors whitespace-nowrap ${
              activeTab === "condiments"
                ? "border-herb-700 text-herb-700 font-bold"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            Nước chấm & Ăn kèm
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("notes")}
            className={`border-b-2 px-3 sm:px-4 py-2.5 transition-colors whitespace-nowrap ${
              activeTab === "notes"
                ? "border-herb-700 text-herb-700 font-bold"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            Ghi chú & Mẹo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("storage")}
            className={`border-b-2 px-3 sm:px-4 py-2.5 transition-colors whitespace-nowrap ${
              activeTab === "storage"
                ? "border-herb-700 text-herb-700 font-bold"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
            data-testid="tab-storage"
          >
            Bảo quản thức ăn
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {activeTab === "ingredients" && (
            <div className="grid gap-4">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Icon name="leaf" className="size-4 text-herb-600" />
                  Nguyên liệu đã định lượng theo khẩu phần
                </h3>
                <p className="mt-1 text-xs text-ink-soft">
                  Lượng thực phẩm đã được tính toán chính xác cho {item.adultEquivalent} suất ăn gia
                  đình.
                </p>
              </div>

              <ul className="grid gap-2 sm:grid-cols-2">
                {item.scaledIngredients.map((ingredient) => (
                  <li
                    key={ingredient.sourceId}
                    className="flex items-center gap-2 rounded-2xl border border-edge bg-paper-sunken/60 p-3 text-sm"
                  >
                    <span className="size-2 rounded-full bg-herb-500 shrink-0" />
                    <span className="font-medium text-ink">
                      {describeIngredient(ingredient, labels)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-2 rounded-2xl border border-herb-200 bg-herb-50/70 p-4 text-xs text-herb-900 dark:border-herb-900/40 dark:bg-herb-950/20 dark:text-herb-200">
                <p className="font-bold flex items-center gap-1.5">
                  <Icon name="note" className="size-4 text-herb-700" />
                  Mẹo sơ chế trước khi nấu:
                </p>
                <p className="mt-1 text-ink-soft leading-relaxed">
                  Rửa sạch các loại rau củ, thái thịt và ướp gia vị trước từ 10-15 phút để món ăn
                  đậm đà và tiết kiệm thời gian đứng bếp.
                </p>
              </div>
            </div>
          )}

          {activeTab === "steps" && (
            <div className="grid gap-5">
              {item.components
                .toSorted((left, right) => left.sortOrder - right.sortOrder)
                .map((component) => (
                  <div key={component.recipe.recipeVersionId} className="grid gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-clay-100 px-3 py-1 text-xs font-bold text-clay-900">
                        {mealRoleLabel(component.mealRole)}
                      </span>
                      <span className="text-xs text-ink-soft">
                        {component.recipe.steps.length} bước
                      </span>
                    </div>

                    <ol className="grid gap-2.5">
                      {component.recipe.steps
                        .toSorted((left, right) => left.order - right.order)
                        .map((step) => {
                          const conditions = stepConditions(step)
                          const ingredientNames = stepIngredientNames(
                            step,
                            component.recipe.ingredients,
                            labels
                          )
                          return (
                            <li
                              key={step.order}
                              className="rounded-2xl border border-edge bg-paper-sunken/40 p-3.5 text-sm"
                            >
                              <div className="flex items-start gap-2.5">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-herb-100 text-xs font-extrabold text-herb-800">
                                  {step.order}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-ink leading-snug">
                                    {step.instructionVi}
                                  </p>

                                  {(conditions.length > 0 || ingredientNames.length > 0) && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                                      {conditions.map((cond) => (
                                        <span
                                          key={cond}
                                          className="rounded-full bg-broth-100 px-2 py-0.5 font-medium text-broth-900"
                                        >
                                          {cond}
                                        </span>
                                      ))}
                                      {ingredientNames.length > 0 && (
                                        <span className="text-ink-soft">
                                          Gồm: {ingredientNames.join(", ")}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </li>
                          )
                        })}
                    </ol>
                  </div>
                ))}
            </div>
          )}

          {activeTab === "nutrition" && (
            <div className="grid gap-5">
              {item.memberPortions && (
                <MemberPortionsPanel
                  portions={item.memberPortions}
                  plannedMealSharePercent={item.plannedMealSharePercent ?? null}
                />
              )}

              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Icon name="soup" className="size-4 text-broth-700" />
                  Dinh dưỡng ước tính cả bữa
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {orderedNutrients(item.nutrition.nutrients).map((nutrient) => (
                    <div
                      key={nutrient.nutrientCode}
                      className="rounded-2xl border border-edge bg-paper-sunken/50 p-3"
                    >
                      <dt className="text-xs font-medium text-ink-soft">
                        {nutrientName(nutrient.nutrientCode)}
                      </dt>
                      <dd className="mt-0.5 text-base font-extrabold text-ink tabular-nums">
                        {nutrient.displayAmount} {nutrient.unitCode}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {activeTab === "condiments" && (
            <div className="grid gap-4">
              <CondimentPairingCard
                mealNameVi={item.mealOptionNameVi}
                dishNames={item.components
                  .map((c) => (c.recipe.steps.length > 0 ? c.recipe.recipeId : ""))
                  .filter(Boolean)}
                dishRoles={item.components.map((c) => c.mealRole)}
              />
            </div>
          )}

          {activeTab === "notes" && (
            <div className="grid gap-4">
              <FamilyCookingNotes
                mealOptionId={item.mealOptionId}
                mealOptionNameVi={item.mealOptionNameVi}
              />
              <div className="rounded-2xl border border-clay-200 bg-clay-50/70 p-4 text-xs text-clay-900 dark:border-clay-900/40 dark:bg-clay-950/20 dark:text-clay-200">
                <p className="font-bold flex items-center gap-1.5">
                  <Icon name="note" className="size-4 text-clay-700" />
                  Ghi nhớ bí quyết nấu ăn gia đình:
                </p>
                <p className="mt-1 text-ink-soft leading-relaxed">
                  Ghi chú riêng của gia đình sẽ tự động đồng bộ khi bạn bắt đầu chế độ nấu ăn trên
                  bếp, giúp bạn không bao giờ quên các khẩu vị đặc biệt của người thân!
                </p>
              </div>
            </div>
          )}

          {activeTab === "storage" && (
            <div className="grid gap-4">
              <LeftoverStorageGuideCard
                dishes={item.components.map((c) => ({
                  name:
                    item.components.length === 1
                      ? item.mealOptionNameVi
                      : `${mealRoleLabel(c.mealRole)}: ${item.mealOptionNameVi}`,
                  role: c.mealRole
                }))}
                defaultExpanded={true}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-edge bg-paper-raised p-4 sm:p-5">
          <Button type="button" variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Link
            to={`/plan/${item.dayIndex}/cook`}
            onClick={onClose}
            className={buttonVariants({
              size: "default",
              className: "gap-2 font-bold"
            })}
          >
            <Icon name="pan" className="size-4" />
            Bắt đầu nấu bữa này
          </Link>
        </div>
      </div>
    </div>
  )
}
