import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"

import { loadHousehold } from "@/application/household/load-household"
import type { HouseholdRepository } from "@/application/household/household-repository"
import { useAuth } from "@/app/auth/auth-context"
import { AppPageShell } from "@/app/components/app-page-shell"
import { Button } from "@/app/components/ui/button"
import type { PlannerApi } from "./planner-api"
import { currentWeekStart } from "./week-start"

interface Props {
  readonly householdRepository: HouseholdRepository
  readonly plannerApi: PlannerApi
  readonly today?: () => Date
}

type State = "loading" | "no-plan" | "error"

/**
 * The shopping list, reachable without already knowing a plan id.
 *
 * It lives with the planner rather than with the shopping list because every question it asks is a
 * planner question — which household, which week, which plan. Its only knowledge of shopping is the
 * URL it hands over to.
 *
 * Going to the market is one of the two things this app is for every week, and it had no entry in
 * the navigation at all: the only door was a button on the plan page, so a person who wanted their
 * list had to go and find the plan first. This resolves the week's plan and hands over to the list
 * that belongs to it.
 */
export function ShoppingEntryPage({ householdRepository, plannerApi, today }: Props) {
  const auth = useAuth()
  const navigate = useNavigate()
  const accessToken = auth.session?.accessToken
  const [state, setState] = useState<State>("loading")
  const [reloadToken, setReloadToken] = useState(0)
  const now = today ?? (() => new Date())

  useEffect(() => {
    if (accessToken === undefined) return
    let cancelled = false

    const run = async () => {
      const household = await loadHousehold(householdRepository)
      if (cancelled) return
      if (!household.ok || household.household === null) {
        setState("no-plan")
        return
      }
      const result = await plannerApi.current(accessToken, {
        householdId: household.household.householdId,
        weekStart: currentWeekStart(now())
      })
      if (cancelled) return
      if (!result.ok) {
        setState("error")
        return
      }
      if (result.value === null) {
        setState("no-plan")
        return
      }
      // Replace rather than push: a back gesture from the list belongs on the page the person came
      // from, not on a redirect that would bounce them forward again.
      void navigate(`/shopping/${result.value.planId}`, { replace: true })
    }

    void run().catch(() => {
      if (!cancelled) setState("error")
    })
    return () => {
      cancelled = true
    }
    // `now` is a clock, not state: re-reading whenever its identity changes would refetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, householdRepository, plannerApi, navigate, reloadToken])

  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-6 text-ink sm:px-6 lg:px-8 lg:py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Đi chợ</h1>
      {state === "loading" ? <p role="status">Đang mở danh sách đi chợ…</p> : null}
      {state === "no-plan" ? (
        <div className="grid justify-items-start gap-3" role="status">
          <p>Tuần này chưa có kế hoạch, nên chưa có danh sách đi chợ.</p>
          <Link className="font-bold text-herb-700 underline underline-offset-2" to="/plan">
            Lập kế hoạch tuần
          </Link>
        </div>
      ) : null}
      {state === "error" ? (
        <div className="grid justify-items-start gap-3" role="alert">
          <p>Không mở được danh sách đi chợ lúc này.</p>
          <Button
            type="button"
            onClick={() => {
              setState("loading")
              setReloadToken((token) => token + 1)
            }}
          >
            Thử lại
          </Button>
        </div>
      ) : null}
    </AppPageShell>
  )
}
