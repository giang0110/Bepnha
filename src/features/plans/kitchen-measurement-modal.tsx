import { useMemo, useState } from "react"

import { Button } from "@/app/components/ui/button"
import {
  convertKitchenMeasurement,
  getCommonAromaticsCheatSheet,
  getCommonSeasoningCheatSheet,
  getIngredientCategoryDefinition,
  getKitchenUnitDefinition,
  getVisualHandEstimates,
  KITCHEN_UNITS,
  COMMON_INGREDIENT_CATEGORIES,
  type CommonIngredientCategory,
  type KitchenUnit
} from "@/domain/recipe/kitchen-measurement-converter"

export interface KitchenMeasurementModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
}

type ModalTab = "calculator" | "seasoning_sheet" | "hand_estimates"

interface QuickPreset {
  readonly label: string
  readonly amount: number
  readonly fromUnit: KitchenUnit
  readonly toUnit: KitchenUnit
  readonly ingredient: CommonIngredientCategory
}

const QUICK_PRESETS: readonly QuickPreset[] = Object.freeze([
  {
    label: "1 thìa canh nước mắm",
    amount: 1,
    fromUnit: "tbsp",
    toUnit: "gram",
    ingredient: "fish_sauce"
  },
  {
    label: "1 bát con gạo",
    amount: 1,
    fromUnit: "rice_bowl",
    toUnit: "gram",
    ingredient: "raw_rice"
  },
  {
    label: "1 thìa cà phê muối",
    amount: 1,
    fromUnit: "tsp",
    toUnit: "gram",
    ingredient: "table_salt"
  },
  {
    label: "1 thìa canh dầu ăn",
    amount: 1,
    fromUnit: "tbsp",
    toUnit: "gram",
    ingredient: "cooking_oil"
  },
  {
    label: "1 thìa canh đường",
    amount: 1,
    fromUnit: "tbsp",
    toUnit: "gram",
    ingredient: "granulated_sugar"
  }
])

export function KitchenMeasurementModal({
  isOpen,
  onClose
}: Readonly<KitchenMeasurementModalProps>) {
  const [activeTab, setActiveTab] = useState<ModalTab>("calculator")
  const [amountInput, setAmountInput] = useState<string>("1")
  const [fromUnit, setFromUnit] = useState<KitchenUnit>("tbsp")
  const [toUnit, setToUnit] = useState<KitchenUnit>("gram")
  const [ingredient, setIngredient] = useState<CommonIngredientCategory>("fish_sauce")

  const parsedAmount = useMemo(() => {
    const val = parseFloat(amountInput)
    return isNaN(val) || val <= 0 ? 0 : val
  }, [amountInput])

  const conversionResult = useMemo(() => {
    return convertKitchenMeasurement({
      amount: parsedAmount,
      fromUnit,
      toUnit,
      ingredient
    })
  }, [parsedAmount, fromUnit, toUnit, ingredient])

  const handEstimates = useMemo(() => getVisualHandEstimates(), [])
  const aromaticsCheatSheet = useMemo(() => getCommonAromaticsCheatSheet(), [])
  const seasoningCheatSheet = useMemo(() => getCommonSeasoningCheatSheet(), [])

  if (!isOpen) return null

  const handleSwapUnits = () => {
    setFromUnit(toUnit)
    setToUnit(fromUnit)
  }

  const applyPreset = (preset: QuickPreset) => {
    setAmountInput(String(preset.amount))
    setFromUnit(preset.fromUnit)
    setToUnit(preset.toUnit)
    setIngredient(preset.ingredient)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kitchen-converter-title"
      data-testid="kitchen-measurement-modal"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl border border-edge bg-paper-raised shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge bg-paper-sunken/40 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-amber-100 text-lg text-amber-800">
              ⚖️
            </span>
            <div>
              <h3
                id="kitchen-converter-title"
                className="text-base font-extrabold text-ink sm:text-lg"
              >
                Quy đổi đơn vị &amp; Ước lượng bếp Việt
              </h3>
              <p className="text-xs text-ink-soft">
                Đổi thìa, bát, gam, ml &amp; mẹo ước lượng bằng mắt/bàn tay
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-full"
            aria-label="Đóng"
          >
            Đóng
          </Button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-edge bg-paper px-4 pt-2 text-sm font-semibold overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("calculator")}
            className={`border-b-2 px-3.5 py-2.5 transition-colors whitespace-nowrap ${
              activeTab === "calculator"
                ? "border-herb-700 text-herb-700 font-bold"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            Máy tính quy đổi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("seasoning_sheet")}
            className={`border-b-2 px-3.5 py-2.5 transition-colors whitespace-nowrap ${
              activeTab === "seasoning_sheet"
                ? "border-herb-700 text-herb-700 font-bold"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            Bảng gia vị
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("hand_estimates")}
            className={`border-b-2 px-3.5 py-2.5 transition-colors whitespace-nowrap ${
              activeTab === "hand_estimates"
                ? "border-herb-700 text-herb-700 font-bold"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            Ước lượng bàn tay
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === "calculator" && (
            <div data-testid="converter-calculator-panel" className="space-y-4">
              {/* Presets */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-ink-muted uppercase tracking-wider">
                  Mẹo chọn nhanh:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="rounded-full border border-edge bg-paper px-2.5 py-1 text-xs font-semibold text-ink-soft hover:border-herb-600 hover:text-herb-700 hover:bg-herb-50/50 transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Converter Form Controls */}
              <div className="rounded-2xl border border-edge bg-paper-sunken/40 p-4 space-y-3.5">
                {/* Ingredient Selector */}
                <div>
                  <label
                    htmlFor="converter-ingredient-select"
                    className="block text-xs font-bold text-ink mb-1"
                  >
                    Gia vị / Thực phẩm quy đổi:
                  </label>
                  <select
                    id="converter-ingredient-select"
                    data-testid="converter-ingredient-select"
                    value={ingredient}
                    onChange={(e) => setIngredient(e.target.value as CommonIngredientCategory)}
                    className="w-full rounded-xl border border-edge bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-herb-700 focus:outline-hidden"
                  >
                    {COMMON_INGREDIENT_CATEGORIES.map((cat) => {
                      const def = getIngredientCategoryDefinition(cat)
                      return (
                        <option key={cat} value={cat}>
                          {def.nameVi}
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* Amount and From Unit */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="converter-amount-input"
                      className="block text-xs font-bold text-ink mb-1"
                    >
                      Số lượng:
                    </label>
                    <input
                      id="converter-amount-input"
                      data-testid="converter-amount-input"
                      type="number"
                      step="any"
                      min="0"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      placeholder="Nhập số..."
                      className="w-full rounded-xl border border-edge bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-herb-700 focus:outline-hidden"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor="converter-from-unit-select"
                      className="block text-xs font-bold text-ink mb-1"
                    >
                      Từ đơn vị:
                    </label>
                    <select
                      id="converter-from-unit-select"
                      data-testid="converter-from-unit-select"
                      value={fromUnit}
                      onChange={(e) => setFromUnit(e.target.value as KitchenUnit)}
                      className="w-full rounded-xl border border-edge bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-herb-700 focus:outline-hidden"
                    >
                      {KITCHEN_UNITS.map((unit) => {
                        const def = getKitchenUnitDefinition(unit)
                        return (
                          <option key={unit} value={unit}>
                            {def.nameVi}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>

                {/* Swap button */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    data-testid="converter-swap-btn"
                    onClick={handleSwapUnits}
                    className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-paper px-3 py-1 text-xs font-bold text-ink-soft hover:bg-paper-sunken hover:text-ink transition-colors"
                    title="Đổi chiều đơn vị quy đổi"
                  >
                    <span>⇅ Đổi chiều đơn vị</span>
                  </button>
                </div>

                {/* To Unit */}
                <div>
                  <label
                    htmlFor="converter-to-unit-select"
                    className="block text-xs font-bold text-ink mb-1"
                  >
                    Sang đơn vị đích:
                  </label>
                  <select
                    id="converter-to-unit-select"
                    data-testid="converter-to-unit-select"
                    value={toUnit}
                    onChange={(e) => setToUnit(e.target.value as KitchenUnit)}
                    className="w-full rounded-xl border border-edge bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-herb-700 focus:outline-hidden"
                  >
                    {KITCHEN_UNITS.map((unit) => {
                      const def = getKitchenUnitDefinition(unit)
                      return (
                        <option key={unit} value={unit}>
                          {def.nameVi}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>

              {/* Conversion Result Display */}
              <div className="rounded-2xl border border-herb-300 bg-herb-50/80 p-4 space-y-1.5 dark:border-herb-800 dark:bg-herb-950/30">
                <p className="text-xs font-bold text-herb-900 uppercase tracking-wider">
                  Kết quả quy đổi tương đương:
                </p>
                <div
                  data-testid="converter-result-display"
                  className="text-2xl font-black text-herb-800 dark:text-herb-300 tracking-tight"
                >
                  {conversionResult.displayResultVi}
                </div>
                <p className="text-xs text-herb-900/90 leading-relaxed">
                  {conversionResult.explanationVi}
                </p>
              </div>
            </div>
          )}

          {activeTab === "seasoning_sheet" && (
            <div data-testid="seasoning-sheet-panel" className="space-y-4">
              <div className="rounded-2xl border border-edge bg-paper-sunken/40 p-3.5 text-xs text-ink-soft leading-relaxed">
                💡 <strong>Chuẩn muỗng bếp Việt:</strong> 1 thìa cà phê (tsp) gạt ngang = 5ml; 1
                thìa canh (tbsp / muỗng ăn cơm) gạt ngang = 15ml.
              </div>

              <div className="rounded-2xl border border-edge overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-edge bg-paper-sunken font-bold text-ink">
                      <th className="p-3">Gia vị</th>
                      <th className="p-3 text-center">1 thìa cà phê (tsp)</th>
                      <th className="p-3 text-center">1 thìa canh (tbsp)</th>
                      <th className="p-3">Lưu ý khi nêm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {seasoningCheatSheet.map((item) => (
                      <tr key={item.ingredient} className="hover:bg-paper-sunken/30">
                        <td className="p-3 font-bold text-ink whitespace-nowrap">{item.nameVi}</td>
                        <td className="p-3 text-center font-semibold text-herb-700 whitespace-nowrap">
                          {item.oneTspGrams} g
                        </td>
                        <td className="p-3 text-center font-bold text-herb-800 whitespace-nowrap">
                          {item.oneTbspGrams} g
                        </td>
                        <td className="p-3 text-ink-soft">{item.noteVi}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "hand_estimates" && (
            <div data-testid="hand-estimate-panel" className="space-y-5">
              {/* Hand rule */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  Quy tắc bàn tay (Ước lượng định lượng không cần cân)
                </h4>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {handEstimates.map((item) => (
                    <div
                      key={item.code}
                      className="rounded-2xl border border-edge bg-paper-sunken/40 p-3.5 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-ink text-sm flex items-center gap-1.5">
                          <span>{item.iconEmoji}</span>
                          <span>{item.nameVi}</span>
                        </p>
                        <span className="rounded-full bg-herb-100 px-2 py-0.5 font-bold text-herb-800">
                          {item.estimatedGrams}
                        </span>
                      </div>
                      <p className="text-ink-soft italic">{item.visualGestureVi}</p>
                      <p className="text-ink-soft">
                        <strong className="text-ink">Ví dụ:</strong> {item.exampleVi}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Aromatics sheet */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  Ước lượng củ quả &amp; Rau thơm dân dã
                </h4>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {aromaticsCheatSheet.map((item) => (
                    <div
                      key={item.nameVi}
                      className="rounded-2xl border border-edge bg-paper p-3 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-ink">{item.nameVi}</p>
                        <span className="font-semibold text-herb-800 bg-paper-sunken px-2 py-0.5 rounded-full">
                          {item.weightGramsVi}
                        </span>
                      </div>
                      <p className="text-ink-soft">
                        <strong>Quy đổi:</strong> {item.unitEstimateVi}
                      </p>
                      <p className="text-ink-soft">
                        <strong>Bí quyết:</strong> {item.culinaryTipVi}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-edge bg-paper-sunken/30 px-5 py-3 text-xs text-ink-soft">
          <span>* Các con số dựa trên dụng cụ nấu nướng tiêu chuẩn gia đình Việt.</span>
          <Button type="button" size="sm" onClick={onClose}>
            Xong
          </Button>
        </div>
      </div>
    </div>
  )
}
