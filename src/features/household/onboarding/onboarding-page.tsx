import { useReducer } from "react"

import { BudgetStep } from "../components/budget-step"
import { MemberGroupsStep } from "../components/member-groups-step"
import { householdFormReducer, INITIAL_HOUSEHOLD_FORM_STATE } from "../household-form-state"

export function OnboardingPage() {
  const [state, dispatch] = useReducer(householdFormReducer, INITIAL_HOUSEHOLD_FORM_STATE)

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
      {state.step > 2 ? <p role="status">Tiếp tục thiết lập ở bước tiếp theo.</p> : null}
    </main>
  )
}
