import { useEffect, useRef, useReducer, useState } from "react"
import { useNavigate } from "react-router"

import type { HouseholdRepository } from "@/application/household/household-repository"
import { saveHousehold } from "@/application/household/save-household"

import { BudgetStep } from "../components/budget-step"
import { HardRulesStep } from "../components/hard-rules-step"
import { MemberGroupsStep } from "../components/member-groups-step"
import { PreferencesTimeStep } from "../components/preferences-time-step"
import { ReviewStep, type SaveState } from "../components/review-step"
import { parseVnd } from "../budget-vnd"
import {
  householdFormReducer,
  INITIAL_HOUSEHOLD_FORM_STATE,
  nutritionSetupFromForm,
  memberGroupsFromCounts
} from "../household-form-state"

interface OnboardingPageProps {
  repository: HouseholdRepository
}

export function OnboardingPage({ repository }: OnboardingPageProps) {
  const [state, dispatch] = useReducer(householdFormReducer, INITIAL_HOUSEHOLD_FORM_STATE)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const navigate = useNavigate()
  const nutritionValidation = nutritionSetupFromForm(state)
  const budgetVnd = parseVnd(state.budgetInput)
  const requestEpoch = useRef(0)
  useEffect(() => {
    requestEpoch.current += 1
    return () => {
      requestEpoch.current += 1
    }
  }, [repository])

  async function save() {
    const nutrition = nutritionSetupFromForm(state)
    if (budgetVnd === null || !nutrition.ok) return
    const epoch = requestEpoch.current
    setSaveState("saving")
    const result = await saveHousehold(
      repository,
      {
        nutritionSetup: nutrition.value,
        memberGroups: memberGroupsFromCounts(state.memberCounts),
        weeklyPlanBudgetVnd: budgetVnd,
        maxElapsedMinutes: state.maxElapsedMinutes,
        ruleCodes: [...state.hardRuleCodes, ...state.preferenceCodes],
        allergenStrictness: state.allergenStrictness
      },
      null
    )
    if (epoch !== requestEpoch.current) return
    if (result.ok) {
      void navigate("/household", { replace: true })
      return
    }
    if (result.reason === "STALE_HOUSEHOLD_VERSION") setSaveState("stale-error")
    else if (result.reason === "UNAUTHORIZED") setSaveState("auth-error")
    else if (result.reason === "DEPENDENCY_SCHEMA_NOT_READY") setSaveState("schema-error")
    else setSaveState("retryable-error")
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-screen w-full max-w-2xl px-4 py-6 sm:px-6 lg:py-8"
    >
      <div className="mb-6 rounded-2xl border border-edge bg-paper-raised p-4">
        <p className="mb-3 flex items-center justify-between gap-3 text-sm font-semibold text-ink-soft">
          Thiết lập gia đình
          <span className="tabular-nums">{state.step}/5</span>
        </p>
        <div
          aria-label="Tiến độ thiết lập"
          aria-valuemax={5}
          aria-valuemin={1}
          aria-valuenow={state.step}
          className="h-1.5 overflow-hidden rounded-full bg-paper-sunken"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-herb-600 transition-[width]"
            style={{ width: `${state.step * 20}%` }}
          />
        </div>
      </div>
      {state.step === 1 ? (
        <MemberGroupsStep
          profiles={state.memberProfiles}
          mealShareInput={state.mealEnergyShareInput}
          onProfileAction={dispatch}
          counts={state.memberCounts}
          onChange={(key, count) => dispatch({ type: "set-member-count", key, count })}
          onContinue={() => dispatch({ type: "go-to-step", step: 2 })}
        />
      ) : null}
      {state.step === 2 ? (
        <BudgetStep
          value={state.budgetInput}
          onBack={() => dispatch({ type: "go-to-step", step: 1 })}
          onChange={(value) => dispatch({ type: "set-budget", value })}
          onContinue={() => dispatch({ type: "go-to-step", step: 3 })}
        />
      ) : null}
      {state.step === 3 ? (
        <HardRulesStep
          selectedCodes={state.hardRuleCodes}
          allergenStrictness={state.allergenStrictness}
          onBack={() => dispatch({ type: "go-to-step", step: 2 })}
          onContinue={() => dispatch({ type: "go-to-step", step: 4 })}
          onToggle={(code, selected) => dispatch({ type: "toggle-rule", code, selected })}
          onStrictnessChange={(code, strictness) =>
            dispatch({ type: "set-allergen-strictness", code, strictness })
          }
        />
      ) : null}
      {state.step === 4 ? (
        <PreferencesTimeStep
          hardRuleCodes={state.hardRuleCodes}
          maxElapsedMinutes={state.maxElapsedMinutes}
          selectedCodes={state.preferenceCodes}
          onBack={() => dispatch({ type: "go-to-step", step: 3 })}
          onContinue={() => dispatch({ type: "go-to-step", step: 5 })}
          onTimeChange={(minutes) => dispatch({ type: "set-max-elapsed-minutes", minutes })}
          onToggle={(code, selected) => dispatch({ type: "toggle-rule", code, selected })}
        />
      ) : null}
      {state.step === 5 && budgetVnd !== null ? (
        <ReviewStep
          nutritionSetup={nutritionValidation.ok ? nutritionValidation.value : undefined}
          budgetVnd={budgetVnd}
          hardRuleCodes={state.hardRuleCodes}
          maxElapsedMinutes={state.maxElapsedMinutes}
          memberGroups={memberGroupsFromCounts(state.memberCounts)}
          preferenceCodes={state.preferenceCodes}
          saveState={saveState}
          onBack={() => dispatch({ type: "go-to-step", step: 4 })}
          canSave={nutritionValidation.ok}
          onSave={() => void save()}
        />
      ) : null}
    </main>
  )
}
