import { describe, expect, test } from "vitest"
import { calculateBudgetVariance, validateActualExpenseAmount } from "./shopping-actual-expense"

describe("calculateBudgetVariance", () => {
  test("calculates savings when actual cost is lower than estimated", () => {
    // Estimated: 700,000 VND, Actual: 650,000 VND, Weekly Budget: 1,000,000 VND
    const result = calculateBudgetVariance(700_000, 650_000, 1_000_000)

    expect(result.status).toBe("saved")
    expect(result.varianceVnd).toBe(50_000)
    expect(result.variancePercent).toBeCloseTo(7.14, 1)
    expect(result.budgetRemainingVnd).toBe(350_000)
    expect(result.budgetUtilizationPercent).toBe(65)
    expect(result.labelVi).toBe("Tiết kiệm 50.000 đ (7,1%)")
  })

  test("calculates overage when actual cost is higher than estimated", () => {
    // Estimated: 500,000 VND, Actual: 540,000 VND, Weekly Budget: 600,000 VND
    const result = calculateBudgetVariance(500_000, 540_000, 600_000)

    expect(result.status).toBe("over_estimated")
    expect(result.varianceVnd).toBe(-40_000)
    expect(result.variancePercent).toBe(8)
    expect(result.budgetRemainingVnd).toBe(60_000)
    expect(result.budgetUtilizationPercent).toBe(90)
    expect(result.labelVi).toBe("Vượt dự tính 40.000 đ (8%)")
  })

  test("calculates exact match when actual cost equals estimated", () => {
    const result = calculateBudgetVariance(800_000, 800_000, 1_000_000)

    expect(result.status).toBe("exact")
    expect(result.varianceVnd).toBe(0)
    expect(result.variancePercent).toBe(0)
    expect(result.budgetRemainingVnd).toBe(200_000)
    expect(result.budgetUtilizationPercent).toBe(80)
    expect(result.labelVi).toBe("Đúng bằng dự tính")
  })

  test("handles zero estimated cost safely without NaN", () => {
    const result = calculateBudgetVariance(0, 50_000, 100_000)

    expect(result.status).toBe("over_estimated")
    expect(result.varianceVnd).toBe(-50_000)
    expect(result.variancePercent).toBe(0)
    expect(result.budgetRemainingVnd).toBe(50_000)
    expect(result.labelVi).toBe("Vượt dự tính 50.000 đ")
  })

  test("handles zero budget safely without division by zero", () => {
    const result = calculateBudgetVariance(100_000, 100_000, 0)

    expect(result.budgetRemainingVnd).toBe(-100_000)
    expect(result.budgetUtilizationPercent).toBe(0)
  })
})

describe("validateActualExpenseAmount", () => {
  test("accepts valid positive numbers and zero", () => {
    expect(validateActualExpenseAmount(0)).toEqual({ valid: true })
    expect(validateActualExpenseAmount(150_000)).toEqual({ valid: true })
    expect(validateActualExpenseAmount(50_000_000)).toEqual({ valid: true })
  })

  test("rejects negative numbers, NaN, or non-finite numbers", () => {
    expect(validateActualExpenseAmount(-1000).valid).toBe(false)
    expect(validateActualExpenseAmount(NaN).valid).toBe(false)
    expect(validateActualExpenseAmount(Infinity).valid).toBe(false)
  })

  test("rejects excessively large values exceeding 500,000,000 VND limit", () => {
    expect(validateActualExpenseAmount(600_000_000).valid).toBe(false)
  })
})
