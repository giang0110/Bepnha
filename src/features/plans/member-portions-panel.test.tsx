import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import { MemberPortionsPanel } from "./member-portions-panel"
import type { MemberMealPortion } from "@/domain/portion/calculate-member-meal-portions"
import { calculateMemberMealPortions } from "@/domain/portion/calculate-member-meal-portions"
import type { HouseholdNutritionSetupV1 } from "@/domain/household/member-profile"
test("displays frozen targets and actual energy without any body lookup", () => {
  const portion = {
    recipientKey: "p",
    memberKind: "adult",
    ageBand: "adult",
    label: "Anh",
    memberCount: 1,
    coefficientPerMember: "1",
    totalCoefficient: "1",
    sharePerMember: "0.5",
    mealTargetKcal: "711.253125",
    actualMealKcal: "700",
    energyTargetStatus: "applied",
    unappliedReason: null
  } as MemberMealPortion & { actualMealKcal: string }
  render(<MemberPortionsPanel portions={[portion]} plannedMealSharePercent={33} />)
  expect(screen.getByText(/711 kcal/)).toBeVisible()
  expect(screen.getByText(/700 kcal/)).toBeVisible()
  expect(screen.getByText(/50%/)).toBeVisible()
  expect(screen.getByText(/33%/)).toBeVisible()
})
test("saved unnamed allocations retain distinct identities after household edits", () => {
  const setup: HouseholdNutritionSetupV1 = {
    version: "household-nutrition-v1",
    plannedMealSharePercent: 33,
    memberProfiles: [1, 3].map((sortOrder) => ({
      id: `10000000-0000-4000-8000-00000000000${sortOrder}`,
      memberKind: "adult",
      sortOrder,
      label: null,
      heightCm: "170",
      weightKg: "65",
      ageYears: 30,
      sexForEquation: "male",
      activityLevel: "light",
      goal: sortOrder === 1 ? "lose" : "gain"
    }))
  }
  const result = calculateMemberMealPortions(
    [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
    setup,
    "711.253125"
  )
  if (!result.ok) throw new Error(result.error.code)
  const saved = JSON.parse(JSON.stringify(result.value.portions)) as MemberMealPortion[]
  const changed = calculateMemberMealPortions(
    [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
    { ...setup, memberProfiles: setup.memberProfiles.map((p) => ({ ...p, label: "Tên mới" })) },
    "711.253125"
  )
  if (!changed.ok) throw new Error(changed.error.code)
  expect(changed.value.portions[0]?.label).toBe("Tên mới")
  render(
    <MemberPortionsPanel
      portions={saved.map((p) => ({ ...p, actualMealKcal: p.mealTargetKcal! }))}
      plannedMealSharePercent={33}
    />
  )
  expect(screen.getByText("Người lớn 1").closest("li")).toHaveTextContent("640 kcal/người")
  expect(screen.getByText("Người lớn 3").closest("li")).toHaveTextContent("782 kcal/người")
  expect(screen.queryByText("Tên mới")).not.toBeInTheDocument()
})
