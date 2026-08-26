import { Button } from "@/app/components/ui/button"
import { HOUSEHOLD_RULE_OPTIONS, type HouseholdRuleCode } from "@/domain/household/household-rules"

interface HardRulesStepProps {
  selectedCodes: readonly string[]
  onBack: () => void
  onContinue: () => void
  onToggle: (code: HouseholdRuleCode, selected: boolean) => void
}

const ALLERGEN_OPTIONS = HOUSEHOLD_RULE_OPTIONS.filter(
  (option) => option.ruleKind === "allergen_exclusion"
)
const FOOD_EXCLUSION_OPTIONS = HOUSEHOLD_RULE_OPTIONS.filter(
  (option) => option.ruleKind === "food_exclusion"
)

export function HardRulesStep({ selectedCodes, onBack, onContinue, onToggle }: HardRulesStepProps) {
  const selected = new Set(selectedCodes)

  const optionList = (options: typeof ALLERGEN_OPTIONS | typeof FOOD_EXCLUSION_OPTIONS) =>
    options.map((option) => (
      <label
        key={option.code}
        className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2"
      >
        <input
          aria-label={option.labelVi}
          checked={selected.has(option.code)}
          className="h-5 w-5 shrink-0"
          type="checkbox"
          onChange={(event) => onToggle(option.code, event.currentTarget.checked)}
        />
        <span>{option.labelVi}</span>
      </label>
    ))

  return (
    <section aria-labelledby="hard-rules-step-heading" className="flex flex-col gap-5">
      <div>
        <h1 id="hard-rules-step-heading" className="text-2xl font-semibold">
          Dị ứng và loại trừ
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Đây là các quy tắc bắt buộc. Kế hoạch sẽ lọc theo các loại trừ đã lưu.
        </p>
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">Dị ứng</legend>
        {optionList(ALLERGEN_OPTIONS)}
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
