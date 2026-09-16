import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { AppErrorBoundary } from "./app-error-boundary"

function Exploding(): never {
  throw new Error("render failed")
}

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    // React logs the caught error; silence it so a passing suite stays readable.
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("renders children untouched while nothing fails", () => {
    render(
      <AppErrorBoundary>
        <p>Nội dung</p>
      </AppErrorBoundary>
    )

    expect(screen.getByText("Nội dung")).toBeInTheDocument()
  })

  test("replaces a failed tree with a recoverable Vietnamese screen instead of a blank page", () => {
    render(
      <AppErrorBoundary>
        <Exploding />
      </AppErrorBoundary>
    )

    expect(screen.getByRole("heading", { name: "Ứng dụng gặp sự cố" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tải lại trang" })).toBeInTheDocument()
  })

  test("hands the failure to the host reporter without exposing application state", () => {
    const onError = vi.fn()

    render(
      <AppErrorBoundary onError={onError}>
        <Exploding />
      </AppErrorBoundary>
    )

    expect(onError).toHaveBeenCalledOnce()
    const [error, componentStack] = onError.mock.calls[0] as [unknown, string | null]
    expect(error).toBeInstanceOf(Error)
    expect(typeof componentStack === "string" || componentStack === null).toBe(true)
  })
})
