import { useEffect, useState } from "react"

import {
  ASSISTANT_QUESTION_MAX_LENGTH,
  type AssistantResult
} from "@/application/assistant/meal-assistant"
import { Button } from "@/app/components/ui/button"

import type { AssistantApi } from "./assistant-api"

const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
const EXPLAIN_QUESTION = "Giải thích kế hoạch này"
const VARIETY_QUESTION = "Bữa nào nên xem thử để đa dạng hơn?"

type AdviceState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly value: AssistantResult }
  | { readonly status: "error"; readonly code: string; readonly correlationId?: string }

interface Props {
  readonly assistantApi: AssistantApi
  readonly accessToken: string
  readonly planId: string
  readonly expectedRevisionId: string
  readonly onPreviewDay: (dayIndex: number) => void
}

function errorCopy(code: string): string {
  if (code === "ASSISTANT_DISABLED") return "Trợ lý hiện chưa được cấu hình."
  if (code === "STALE_ASSISTANT_CONTEXT") {
    return "Kế hoạch đã thay đổi. Hãy hỏi lại trên bản kế hoạch mới."
  }
  return "Trợ lý tạm thời chưa sẵn sàng."
}

export function AssistantCard({
  assistantApi,
  accessToken,
  planId,
  expectedRevisionId,
  onPreviewDay
}: Props) {
  const [question, setQuestion] = useState("")
  const [advice, setAdvice] = useState<AdviceState>({ status: "idle" })

  useEffect(() => {
    setQuestion("")
    setAdvice({ status: "idle" })
  }, [planId, expectedRevisionId])

  async function ask(value: string) {
    const normalized = value.trim()
    if (
      advice.status === "loading" ||
      normalized.length < 1 ||
      normalized.length > ASSISTANT_QUESTION_MAX_LENGTH
    ) {
      return
    }
    setAdvice({ status: "loading" })
    const result = await assistantApi.ask(accessToken, {
      planId,
      expectedRevisionId,
      question: normalized
    })
    setAdvice(
      result.ok
        ? { status: "ready", value: result.value }
        : {
            status: "error",
            code: result.error,
            ...(result.correlationId === undefined ? {} : { correlationId: result.correlationId })
          }
    )
  }

  const replacementProposal =
    advice.status === "ready" && advice.value.kind === "replacement_proposal" ? advice.value : null

  return (
    <section
      className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm"
      aria-labelledby="assistant-title"
    >
      <div className="grid gap-1">
        <h2 className="font-semibold" id="assistant-title">
          Trợ lý Bếp Nhà
        </h2>
        <p className="text-sm text-slate-600">
          Trợ lý chỉ giải thích và gợi ý ngày nên xem thử. Mọi bữa thay thế vẫn do bộ lập kế hoạch
          tất định kiểm tra.
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        <Button
          disabled={advice.status === "loading"}
          type="button"
          variant="outline"
          onClick={() => void ask(EXPLAIN_QUESTION)}
        >
          {EXPLAIN_QUESTION}
        </Button>
        <Button
          disabled={advice.status === "loading"}
          type="button"
          variant="outline"
          onClick={() => void ask(VARIETY_QUESTION)}
        >
          {VARIETY_QUESTION}
        </Button>
      </div>

      <form
        className="mt-3 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void ask(question)
        }}
      >
        <label className="text-sm font-medium" htmlFor="assistant-question">
          Câu hỏi cho Trợ lý Bếp Nhà
        </label>
        <textarea
          className="min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          id="assistant-question"
          maxLength={ASSISTANT_QUESTION_MAX_LENGTH}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Button
          disabled={advice.status === "loading" || question.trim().length === 0}
          type="submit"
        >
          Hỏi trợ lý
        </Button>
      </form>

      {advice.status === "loading" ? (
        <p role="status" className="mt-3">
          Đang xem kế hoạch…
        </p>
      ) : null}

      {advice.status === "error" ? (
        <div className="mt-3 text-sm" role="alert">
          <p>{errorCopy(advice.code)}</p>
          {advice.correlationId === undefined ? null : (
            <p className="mt-1 text-xs text-slate-600">
              Mã hỗ trợ: <code>{advice.correlationId}</code>
            </p>
          )}
        </div>
      ) : null}

      {advice.status === "ready" && advice.value.kind === "explanation" ? (
        <div className="mt-3 grid gap-2 text-sm">
          <p>{advice.value.summaryVi}</p>
          {advice.value.observationsVi.length === 0 ? null : (
            <ul className="list-inside list-disc">
              {advice.value.observationsVi.map((observation, index) => (
                <li key={`${index}:${observation}`}>{observation}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {advice.status === "ready" && advice.value.kind === "unsupported" ? (
        <p className="mt-3 text-sm" role="status">
          {advice.value.messageVi}
        </p>
      ) : null}

      {replacementProposal === null ? null : (
        <div className="mt-3 grid gap-2 text-sm">
          <p>{replacementProposal.reasonVi}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => onPreviewDay(replacementProposal.targetDayIndex)}
          >
            Xem bữa thay thế cho {DAY_LABELS[replacementProposal.targetDayIndex]}
          </Button>
        </div>
      )}
    </section>
  )
}
