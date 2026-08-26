import { Button } from "@/app/components/ui/button"
import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  HOUSEHOLD_RULE_OPTIONS,
  type HouseholdRuleCode
} from "@/domain/household/household-rules"

const TIME_CHOICES = [15, 30, 45, 60, 90, 120] as const
const PREFERENCE_OPTIONS = HOUSEHOLD_RULE_OPTIONS.filter(
  (option) => option.ruleKind === "soft_preference"
)

interface PreferencesTimeStepProps {
  heading?: string
  hardRuleCodes: readonly string[]
  maxElapsedMinutes: number
  selectedCodes: readonly string[]
  onBack: () => void
  onContinue: () => void
  onTimeChange: (minutes: number) => void
  onToggle: (code: HouseholdRuleCode, selected: boolean) => void
}

export function PreferencesTimeStep({
  heading = "Sở thích và thời gian nấu",
  hardRuleCodes,
  maxElapsedMinutes,
  selectedCodes,
  onBack,
  onContinue,
  onTimeChange,
  onToggle
}: PreferencesTimeStepProps) {
  const selected = new Set(selectedCodes)
  const hardTargets = new Set(
    hardRuleCodes
      .map((code) => HOUSEHOLD_RULE_OPTION_BY_CODE.get(code as HouseholdRuleCode))
      .filter((option) => option !== undefined)
      .map((option) => option.targetKey)
  )
  const conflicts = PREFERENCE_OPTIONS.filter(
    (option) => selected.has(option.code) && hardTargets.has(option.targetKey)
  )

  return (
    <section aria-labelledby="preferences-step-heading" className="flex flex-col gap-5">
      <div>
        <h1 id="preferences-step-heading" className="text-2xl font-semibold">
          {heading}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sở thích là ưu tiên mềm, không thay thế các loại trừ bắt buộc.
        </p>
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">Món muốn ưu tiên</legend>
        {PREFERENCE_OPTIONS.map((option) => {
          const blocked = hardTargets.has(option.targetKey)
          return (
            <label
              key={option.code}
              className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2"
            >
              <input
                aria-label={option.labelVi}
                checked={selected.has(option.code)}
                className="h-5 w-5 shrink-0"
                disabled={blocked && !selected.has(option.code)}
                type="checkbox"
                onChange={(event) => onToggle(option.code, event.currentTarget.checked)}
              />
              <span>{option.labelVi}</span>
            </label>
          )
        })}
      </fieldset>
      {conflicts.map((option) => (
        <p key={option.code} role="alert" className="text-sm text-red-700">
          {option.labelVi.replace(/^Ưu tiên /u, "")} không thể vừa loại trừ vừa ưu tiên.
        </p>
      ))}
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="col-span-2 mb-1 font-semibold">Thời gian nấu tối đa</legend>
        {TIME_CHOICES.map((minutes) => (
          <label key={minutes} className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
            <input
              aria-label={`${minutes} phút`}
              checked={maxElapsedMinutes === minutes}
              name="maxElapsedMinutes"
              type="radio"
              value={minutes}
              onChange={() => onTimeChange(minutes)}
            />
            <span>{minutes} phút</span>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Button className="h-11" type="button" variant="outline" onClick={onBack}>
          Quay lại
        </Button>
        <Button className="h-11" type="button" disabled={conflicts.length > 0} onClick={onContinue}>
          Tiếp tục
        </Button>
      </div>
    </section>
  )
}
