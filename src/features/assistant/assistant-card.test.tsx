import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"

import type { AssistantApi } from "./assistant-api"
import { AssistantCard } from "./assistant-card"

const props = {
  accessToken: "access-token",
  planId: "40000000-0000-0000-0000-000000000001",
  expectedRevisionId: "50000000-0000-0000-0000-000000000001"
}

function api(result: Awaited<ReturnType<AssistantApi["ask"]>>): AssistantApi {
  return { ask: vi.fn(() => Promise.resolve(result)) }
}

describe("AssistantCard", () => {
  test("offers bounded presets and free text", () => {
    render(
      <AssistantCard
        {...props}
        assistantApi={api({ ok: false, error: "ASSISTANT_DISABLED" })}
        onPreviewDay={vi.fn()}
      />
    )

    expect(screen.getByRole("heading", { name: "Trợ lý Bếp Nhà" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Giải thích kế hoạch này" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Bữa nào nên xem thử để đa dạng hơn?" })
    ).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Câu hỏi cho Trợ lý Bếp Nhà" })).toHaveAttribute(
      "maxlength",
      "500"
    )
  })

  test("renders an explanation returned by the assistant", async () => {
    const user = userEvent.setup()
    const assistantApi = api({
      ok: true,
      value: {
        kind: "explanation",
        summaryVi: "Kế hoạch có bảy bữa chính đã được tính tất định.",
        observationsVi: ["Chi phí đang trong ngân sách."]
      }
    })
    render(<AssistantCard {...props} assistantApi={assistantApi} onPreviewDay={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Giải thích kế hoạch này" }))

    expect(
      await screen.findByText("Kế hoạch có bảy bữa chính đã được tính tất định.")
    ).toBeInTheDocument()
    expect(screen.getByText("Chi phí đang trong ngân sách.")).toBeInTheDocument()
    expect(assistantApi.ask).toHaveBeenCalledWith("access-token", {
      planId: props.planId,
      expectedRevisionId: props.expectedRevisionId,
      question: "Giải thích kế hoạch này"
    })
  })

  test("proposal can only request deterministic preview and never apply", async () => {
    const user = userEvent.setup()
    const onPreviewDay = vi.fn()
    const assistantApi = api({
      ok: true,
      value: {
        kind: "replacement_proposal",
        targetDayIndex: 2,
        reasonVi: "Có thể xem thử một phương án khác để tăng độ đa dạng."
      }
    })
    render(<AssistantCard {...props} assistantApi={assistantApi} onPreviewDay={onPreviewDay} />)

    await user.click(screen.getByRole("button", { name: "Bữa nào nên xem thử để đa dạng hơn?" }))
    expect(
      await screen.findByText("Có thể xem thử một phương án khác để tăng độ đa dạng.")
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Xem bữa thay thế cho Thứ Tư" }))
    expect(onPreviewDay).toHaveBeenCalledOnce()
    expect(onPreviewDay).toHaveBeenCalledWith(2)
  })

  test.each([
    ["ASSISTANT_DISABLED", "Trợ lý hiện chưa được cấu hình."],
    ["ASSISTANT_UNAVAILABLE", "Trợ lý tạm thời chưa sẵn sàng."],
    ["STALE_ASSISTANT_CONTEXT", "Kế hoạch đã thay đổi. Hãy hỏi lại trên bản kế hoạch mới."]
  ] as const)("shows bounded error state for %s", async (error, copy) => {
    const user = userEvent.setup()
    render(
      <AssistantCard {...props} assistantApi={api({ ok: false, error })} onPreviewDay={vi.fn()} />
    )

    await user.click(screen.getByRole("button", { name: "Giải thích kế hoạch này" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(copy)
  })

  test("renders unsupported advice without disabling future questions", async () => {
    const user = userEvent.setup()
    render(
      <AssistantCard
        {...props}
        assistantApi={api({
          ok: true,
          value: { kind: "unsupported", messageVi: "Mình không thể đưa ra chẩn đoán y tế." }
        })}
        onPreviewDay={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "Giải thích kế hoạch này" }))

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Mình không thể đưa ra chẩn đoán y tế."
    )
    expect(screen.getByRole("button", { name: "Giải thích kế hoạch này" })).toBeEnabled()
  })
})
