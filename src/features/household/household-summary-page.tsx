import { useEffect, useState } from "react"
import { Link } from "react-router"

import { loadHousehold, type LoadHouseholdResult } from "@/application/household/load-household"
import type { HouseholdRepository } from "@/application/household/household-repository"
import { Button } from "@/app/components/ui/button"
import { AppPageShell } from "@/app/components/app-page-shell"
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

  // Wrapped so the global skip link always has a target, including while loading.
  if (state.status === "loading") {
    return (
      <AppPageShell className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <p role="status">Đang tải thông tin gia đình…</p>
      </AppPageShell>
    )
  }
  if (state.status === "error") {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
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
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
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
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
    >
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-emerald-700">Tổng quan gia đình</p>
        <h1 className="text-3xl font-semibold tracking-tight">Gia đình của bạn</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Những thông tin này được dùng để lập thực đơn, tính ngân sách và lọc món phù hợp.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Thành viên</h2>
          <ul className="mt-3 grid gap-2 text-sm text-slate-700">
            {state.household.memberGroups.map((group) => (
              <li key={`${group.memberKind}:${group.ageBand}`}>{memberGroupLabel(group)}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Ngân sách</h2>
          <p className="mt-3 text-2xl font-semibold tracking-tight">
            {formatVnd(state.household.weeklyPlanBudgetVnd)} VND
          </p>
          <p className="mt-1 text-sm text-slate-600">Cho 7 bữa chính mỗi tuần</p>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Thời gian nấu tối đa</h2>
          <p className="mt-3 text-2xl font-semibold tracking-tight">
            {state.household.maxElapsedMinutes} phút
          </p>
          <p className="mt-1 text-sm text-slate-600">Mỗi bữa trong kế hoạch</p>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:col-span-1 xl:col-span-2">
          <h2 className="font-semibold">Dị ứng và loại trừ</h2>
          {hardCodes.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Không chọn</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {hardCodes.map((code) => (
                <li
                  className="rounded-full bg-amber-50 px-3 py-1.5 text-sm text-amber-950 ring-1 ring-inset ring-amber-200"
                  key={code}
                >
                  {ruleLabel(code)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Sở thích</h2>
          {preferenceCodes.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Không chọn</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {preferenceCodes.map((code) => (
                <li
                  className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm text-emerald-950 ring-1 ring-inset ring-emerald-200"
                  key={code}
                >
                  {ruleLabel(code)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <Link
          className="rounded-xl bg-slate-900 px-4 py-3 text-center font-medium text-white transition hover:bg-slate-800"
          to="/plan"
        >
          Lập kế hoạch tuần
        </Link>
        <Link
          className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-center font-medium text-slate-900 transition hover:bg-stone-100"
          to="/settings/household"
        >
          Chỉnh sửa thông tin
        </Link>
      </div>
      <Link className="w-fit text-sm font-medium underline" to="/settings/account">
        Cài đặt tài khoản
      </Link>
    </main>
  )
}
