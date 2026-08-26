import { useReducer, useState } from "react"
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
  memberGroupsFromCounts
} from "../household-form-state"

interface OnboardingPageProps {
  repository: HouseholdRepository
}

export function OnboardingPage({ repository }: OnboardingPageProps) {
  const [state, dispatch] = useReducer(householdFormReducer, INITIAL_HOUSEHOLD_FORM_STATE)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const navigate = useNavigate()
  const budgetVnd = parseVnd(state.budgetInput)

  async function save() {
    if (budgetVnd === null) return
    setSaveState("saving")
    const result = await saveHousehold(
      repository,
      {
        memberGroups: memberGroupsFromCounts(state.memberCounts),
        weeklyPlanBudgetVnd: budgetVnd,
        maxElapsedMinutes: state.maxElapsedMinutes,
        ruleCodes: [...state.hardRuleCodes, ...state.preferenceCodes]
      },
      null
    )
    if (result.ok) {
      void navigate("/household", { replace: true })
      return
    }
    if (result.reason === "STALE_HOUSEHOLD_VERSION") setSaveState("stale-error")
    else if (result.reason === "UNAUTHORIZED") setSaveState("auth-error")
    else setSaveState("retryable-error")
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <progress
          aria-label="Tiến độ thiết lập"
          aria-valuemax={5}
          aria-valuemin={1}
          aria-valuenow={state.step}
          className="h-2 w-full"
          max={5}
          value={state.step}
        />
        <span className="shrink-0 text-sm">{state.step}/5</span>
      </div>
      {state.step === 1 ? (
        <MemberGroupsStep
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
          onBack={() => dispatch({ type: "go-to-step", step: 2 })}
          onContinue={() => dispatch({ type: "go-to-step", step: 4 })}
          onToggle={(code, selected) => dispatch({ type: "toggle-rule", code, selected })}
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
          budgetVnd={budgetVnd}
          hardRuleCodes={state.hardRuleCodes}
          maxElapsedMinutes={state.maxElapsedMinutes}
          memberGroups={memberGroupsFromCounts(state.memberCounts)}
          preferenceCodes={state.preferenceCodes}
          saveState={saveState}
          onBack={() => dispatch({ type: "go-to-step", step: 4 })}
          onSave={() => void save()}
        />
      ) : null}
    </main>
  )
}
