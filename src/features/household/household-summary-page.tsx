import { useEffect, useState } from "react"
import { Link } from "react-router"

import { loadHousehold, type LoadHouseholdResult } from "@/application/household/load-household"
import type { HouseholdRepository } from "@/application/household/household-repository"
import { Button } from "@/app/components/ui/button"
import type { HouseholdSetup } from "@/domain/household/household"
import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode
} from "@/domain/household/household-rules"

import { formatVnd } from "./budget-vnd"
import { memberGroupLabel, ruleLabel } from "./household-display"

interface HouseholdSummaryPageProps {
  repository: HouseholdRepository
}

type ViewState =
  | { status: "loading" }
  | { status: "ready"; household: HouseholdSetup | null }
  | { status: "error"; reason: Exclude<LoadHouseholdResult, { ok: true }>["reason"] }

function resultToViewState(result: LoadHouseholdResult): ViewState {
  return result.ok
    ? { status: "ready", household: result.household }
    : { status: "error", reason: result.reason }
}

export function HouseholdSummaryPage({ repository }: HouseholdSummaryPageProps) {
  const [state, setState] = useState<ViewState>({ status: "loading" })

  useEffect(() => {
    let active = true
    void loadHousehold(repository).then((result) => {
      if (active) setState(resultToViewState(result))
    })
    return () => {
      active = false
    }
  }, [repository])

  function retry() {
    setState({ status: "loading" })
    void loadHousehold(repository).then((result) => setState(resultToViewState(result)))
  }

  if (state.status === "loading") return <p role="status">Đang tải thông tin gia đình…</p>
  if (state.status === "error") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-6">
        <p role="alert">
          {state.reason === "UNAUTHORIZED"
            ? "Phiên đăng nhập đã hết hạn."
            : "Không thể tải thông tin gia đình."}
        </p>
        <Button type="button" onClick={retry}>
          Thử lại
        </Button>
      </main>
    )
  }
  if (state.household === null) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-semibold">Gia đình của bạn</h1>
        <p>Chưa có thông tin gia đình.</p>
        <Link to="/onboarding">Bắt đầu thiết lập</Link>
      </main>
    )
  }

  const hardCodes = state.household.ruleCodes.filter(
    (code) =>
      HOUSEHOLD_RULE_OPTION_BY_CODE.get(code as HouseholdRuleCode)?.ruleKind !== "soft_preference"
  )
  const preferenceCodes = state.household.ruleCodes.filter(
    (code) =>
      HOUSEHOLD_RULE_OPTION_BY_CODE.get(code as HouseholdRuleCode)?.ruleKind === "soft_preference"
  )

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 overflow-x-hidden px-4 py-6">
      <h1 className="text-2xl font-semibold">Gia đình của bạn</h1>
      <section>
        <h2 className="font-semibold">Thành viên</h2>
        <ul>
          {state.household.memberGroups.map((group) => (
            <li key={`${group.memberKind}:${group.ageBand}`}>{memberGroupLabel(group)}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold">Ngân sách</h2>
        <p>{formatVnd(state.household.weeklyPlanBudgetVnd)} VND cho 7 bữa chính</p>
      </section>
      <section>
        <h2 className="font-semibold">Dị ứng và loại trừ</h2>
        {hardCodes.length === 0 ? (
          <p>Không chọn</p>
        ) : (
          <ul>
            {hardCodes.map((code) => (
              <li key={code}>{ruleLabel(code)}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="font-semibold">Sở thích</h2>
        {preferenceCodes.length === 0 ? (
          <p>Không chọn</p>
        ) : (
          <ul>
            {preferenceCodes.map((code) => (
              <li key={code}>{ruleLabel(code)}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="font-semibold">Thời gian nấu tối đa</h2>
        <p>{state.household.maxElapsedMinutes} phút</p>
      </section>
      <Link
        className="rounded-md bg-slate-900 px-4 py-2 text-center text-white"
        to="/settings/household"
      >
        Chỉnh sửa thông tin
      </Link>
    </main>
  )
}
