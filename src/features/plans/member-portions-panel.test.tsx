import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import { MemberPortionsPanel } from "./member-portions-panel"
import type { MemberMealPortion } from "@/domain/portion/calculate-member-meal-portions"
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
