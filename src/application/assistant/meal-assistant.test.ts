import { describe, expect, test } from "vitest"

import {
  ASSISTANT_QUESTION_MAX_LENGTH,
  validateAssistantResult,
  type AssistantPlanEvidence
} from "./meal-assistant"

const evidence: AssistantPlanEvidence = {
  meals: Array.from({ length: 7 }, (_, dayIndex) => ({
    dayIndex,
    dayLabelVi: `Ngày ${dayIndex + 1}`,
    mealNameVi: `Bữa ${dayIndex + 1}`,
    elapsedMinutes: 25
  })),
  budgetStatus: "within",
  totalEstimatedCostVnd: 650_000,
  budgetVnd: 700_000,
  warningCodes: []
}

describe("assistant contracts", () => {
  test("uses a bounded browser question length", () => {
    expect(ASSISTANT_QUESTION_MAX_LENGTH).toBe(500)
  })

  test("accepts strict explanation, proposal, and unsupported results", () => {
    expect(
      validateAssistantResult(
        {
          kind: "explanation",
          summaryVi: "Kế hoạch có bảy bữa chính.",
          observationsVi: ["Thời gian nấu được phân bổ khá đều."]
        },
        evidence
      )
    ).toEqual({
      kind: "explanation",
      summaryVi: "Kế hoạch có bảy bữa chính.",
      observationsVi: ["Thời gian nấu được phân bổ khá đều."]
    })

    expect(
      validateAssistantResult(
        { kind: "replacement_proposal", targetDayIndex: 2, reasonVi: "Có thể tăng tính đa dạng." },
        evidence
      )
    ).toEqual({
      kind: "replacement_proposal",
      targetDayIndex: 2,
      reasonVi: "Có thể tăng tính đa dạng."
    })

    expect(
      validateAssistantResult(
        { kind: "unsupported", messageVi: "Nội dung này nằm ngoài phạm vi trợ lý." },
        evidence
      )
    ).toEqual({ kind: "unsupported", messageVi: "Nội dung này nằm ngoài phạm vi trợ lý." })
  })

  test.each([
    { kind: "replacement_proposal", targetDayIndex: 9, reasonVi: "Ngoài tuần." },
    { kind: "replacement_proposal", targetDayIndex: 1.5, reasonVi: "Không nguyên." },
    { kind: "replacement_proposal", targetDayIndex: 2, reasonVi: "" },
    { kind: "replacement_proposal", targetDayIndex: 2, reasonVi: "x".repeat(321) },
    { kind: "unsupported", messageVi: "x", extra: true },
    { kind: "unknown", messageVi: "x" }
  ])("rejects invalid provider result %#", (value) => {
    expect(validateAssistantResult(value, evidence)).toBeNull()
  })

  test("rejects proposals for a day absent from authoritative evidence", () => {
    const partialEvidence = { ...evidence, meals: evidence.meals.slice(0, 2) }
    expect(
      validateAssistantResult(
        { kind: "replacement_proposal", targetDayIndex: 2, reasonVi: "Không tồn tại." },
        partialEvidence
      )
    ).toBeNull()
  })

  test("rejects oversized explanation content", () => {
    expect(
      validateAssistantResult(
        { kind: "explanation", summaryVi: "x".repeat(601), observationsVi: [] },
        evidence
      )
    ).toBeNull()
    expect(
      validateAssistantResult(
        {
          kind: "explanation",
          summaryVi: "Hợp lệ",
          observationsVi: Array.from({ length: 6 }, () => "x")
        },
        evidence
      )
    ).toBeNull()
    expect(
      validateAssistantResult(
        { kind: "explanation", summaryVi: "Hợp lệ", observationsVi: ["x".repeat(241)] },
        evidence
      )
    ).toBeNull()
  })
})
