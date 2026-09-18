import { Button } from "@/app/components/ui/button"
import {
  ALLERGEN_STRICTNESS_LABELS_VI,
  ALLERGEN_STRICTNESS_VALUES,
  resolveAllergenStrictness,
  type AllergenStrictness
} from "@/domain/household/allergen-strictness"
import { HOUSEHOLD_RULE_OPTIONS, type HouseholdRuleCode } from "@/domain/household/household-rules"

interface HardRulesStepProps {
  heading?: string
  selectedCodes: readonly string[]
  allergenStrictness: Readonly<Record<string, AllergenStrictness>>
  onBack: () => void
  onContinue: () => void
  onToggle: (code: HouseholdRuleCode, selected: boolean) => void
  onStrictnessChange: (code: HouseholdRuleCode, strictness: AllergenStrictness) => void
}

const ALLERGEN_OPTIONS = HOUSEHOLD_RULE_OPTIONS.filter(
  (option) => option.ruleKind === "allergen_exclusion"
)
const FOOD_EXCLUSION_OPTIONS = HOUSEHOLD_RULE_OPTIONS.filter(
  (option) => option.ruleKind === "food_exclusion"
)

type RuleOption = (typeof ALLERGEN_OPTIONS)[number] | (typeof FOOD_EXCLUSION_OPTIONS)[number]

export function HardRulesStep({
  heading = "Dị ứng và loại trừ",
  selectedCodes,
  allergenStrictness,
  onBack,
  onContinue,
  onToggle,
  onStrictnessChange
}: HardRulesStepProps) {
  const selected = new Set(selectedCodes)

  const checkbox = (option: RuleOption) => (
    <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2">
      <input
        aria-label={option.labelVi}
        checked={selected.has(option.code)}
        className="h-5 w-5 shrink-0"
        type="checkbox"
        onChange={(event) => onToggle(option.code, event.currentTarget.checked)}
      />
      <span>{option.labelVi}</span>
    </label>
  )

  const optionList = (options: readonly RuleOption[]) =>
    options.map((option) => <div key={option.code}>{checkbox(option)}</div>)

  // The reach question only appears for an allergy the household actually selected, and only for the
  // ten the catalog can reason about. `allergen_other` has no catalog mapping, so there is nothing
  // for a choice to change there.
  const strictnessChoice = (option: (typeof ALLERGEN_OPTIONS)[number]) => {
    if (!selected.has(option.code) || option.code === "allergen_other") return null
    const current = resolveAllergenStrictness(allergenStrictness, option.code)
    return (
      <fieldset className="ml-8 mt-2 grid gap-2 border-l-2 border-slate-200 pl-3">
        <legend className="sr-only">{`Mức độ cho ${option.labelVi}`}</legend>
        <p className="text-sm text-slate-600">
          Nguyên liệu mua ngoài chợ không kiểm chứng được khâu chế biến của nơi bán. Bạn muốn lọc
          tới đâu?
        </p>
        {ALLERGEN_STRICTNESS_VALUES.map((value) => (
          <label key={value} className="flex min-h-11 items-start gap-3 text-sm">
            <input
              checked={current === value}
              className="mt-1 h-4 w-4 shrink-0"
              name={`strictness-${option.code}`}
              type="radio"
              value={value}
              onChange={() => onStrictnessChange(option.code, value)}
            />
            <span>{ALLERGEN_STRICTNESS_LABELS_VI[value]}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  return (
    <section aria-labelledby="hard-rules-step-heading" className="flex flex-col gap-5">
      <div>
        <h1 id="hard-rules-step-heading" className="text-2xl font-semibold">
          {heading}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Đây là các quy tắc bắt buộc. Kế hoạch sẽ lọc theo các loại trừ đã lưu.
        </p>
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">Dị ứng</legend>
        {ALLERGEN_OPTIONS.map((option) => (
          <div key={option.code}>
            {checkbox(option)}
            {strictnessChoice(option)}
          </div>
        ))}
      </fieldset>
      {selected.has("allergen_other") ? (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          Dị ứng này chưa được hỗ trợ bằng quy tắc chi tiết. Không nhập mô tả tự do; ứng dụng sẽ
          không tự diễn giải nội dung dị ứng.
        </p>
      ) : null}
      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">Thực phẩm không dùng</legend>
        {optionList(FOOD_EXCLUSION_OPTIONS)}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Button className="h-11" type="button" variant="outline" onClick={onBack}>
          Quay lại
        </Button>
        <Button className="h-11" type="button" onClick={onContinue}>
          Tiếp tục
        </Button>
      </div>
    </section>
  )
}
