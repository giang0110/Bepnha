export type ExpenseVarianceStatus = "saved" | "over_estimated" | "exact"

export interface BudgetVarianceResult {
  readonly estimatedCostVnd: number
  readonly actualCostVnd: number
  readonly budgetVnd: number
  readonly varianceVnd: number
  readonly variancePercent: number
  readonly status: ExpenseVarianceStatus
  readonly budgetRemainingVnd: number
  readonly budgetUtilizationPercent: number
  readonly labelVi: string
}

const MAX_EXPENSE_LIMIT_VND = 500_000_000

function formatNumberVn(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)
}

function formatPercentVn(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }).format(value)
}

/**
 * Calculates budget variance comparing estimated shopping basket cost with actual expense paid at checkout.
 * Pure deterministic domain calculation with no external dependencies or side effects.
 */
export function calculateBudgetVariance(
  estimatedCostVnd: number,
  actualCostVnd: number,
  budgetVnd: number
): BudgetVarianceResult {
  const safeEstimated = Math.max(0, estimatedCostVnd)
  const safeActual = Math.max(0, actualCostVnd)
  const safeBudget = Math.max(0, budgetVnd)

  const varianceVnd = safeEstimated - safeActual
  const budgetRemainingVnd = safeBudget - safeActual
  const budgetUtilizationPercent =
    safeBudget > 0 ? Math.round((safeActual / safeBudget) * 1000) / 10 : 0

  let status: ExpenseVarianceStatus = "exact"
  let variancePercent = 0
  let labelVi = "Đúng bằng dự tính"

  if (varianceVnd > 0) {
    status = "saved"
    variancePercent = safeEstimated > 0 ? (varianceVnd / safeEstimated) * 100 : 0
    const percentStr = formatPercentVn(variancePercent)
    labelVi = `Tiết kiệm ${formatNumberVn(varianceVnd)} đ (${percentStr}%)`
  } else if (varianceVnd < 0) {
    status = "over_estimated"
    const diff = Math.abs(varianceVnd)
    variancePercent = safeEstimated > 0 ? (diff / safeEstimated) * 100 : 0
    if (safeEstimated > 0) {
      const percentStr = formatPercentVn(variancePercent)
      labelVi = `Vượt dự tính ${formatNumberVn(diff)} đ (${percentStr}%)`
    } else {
      labelVi = `Vượt dự tính ${formatNumberVn(diff)} đ`
    }
  }

  return {
    estimatedCostVnd: safeEstimated,
    actualCostVnd: safeActual,
    budgetVnd: safeBudget,
    varianceVnd,
    variancePercent,
    status,
    budgetRemainingVnd,
    budgetUtilizationPercent,
    labelVi
  }
}

/**
 * Validates actual shopping expense input.
 */
export function validateActualExpenseAmount(
  amountVnd: number
): { readonly valid: true } | { readonly valid: false; readonly reason: string } {
  if (typeof amountVnd !== "number" || !Number.isFinite(amountVnd)) {
    return { valid: false, reason: "Số tiền không hợp lệ." }
  }

  if (amountVnd < 0) {
    return { valid: false, reason: "Số tiền không thể là số âm." }
  }

  if (amountVnd > MAX_EXPENSE_LIMIT_VND) {
    return {
      valid: false,
      reason: `Số tiền vượt quá giới hạn tối đa cho phép (${formatNumberVn(MAX_EXPENSE_LIMIT_VND)} đ).`
    }
  }

  return { valid: true }
}
