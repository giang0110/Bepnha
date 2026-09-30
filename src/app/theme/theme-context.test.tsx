import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, beforeEach } from "vitest"
import { ThemeProvider, useTheme, ThemeToggle, THEME_STORAGE_KEY } from "./theme-context"

function ThemeDisplay() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button type="button" onClick={toggleTheme}>
        Toggle
      </button>
    </div>
  )
}

describe("theme-context", () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove("dark")
  })

  it("defaults to light theme when nothing stored", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    )

    expect(screen.getByTestId("current-theme").textContent).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("falls back to default light theme when outside ThemeProvider", () => {
    render(<ThemeDisplay />)
    expect(screen.getByTestId("current-theme").textContent).toBe("light")
  })

  it("reads stored dark theme from localStorage and applies to html element", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark")

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    )

    expect(screen.getByTestId("current-theme").textContent).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("toggles between light and dark themes", async () => {
    const user = userEvent.setup()

    render(
      <ThemeProvider>
        <ThemeDisplay />
        <ThemeToggle />
      </ThemeProvider>
    )

    const toggleBtn = screen.getByRole("button", { name: /Chế độ ban đêm|Chế độ sáng/i })
    await user.click(toggleBtn)

    expect(screen.getByTestId("current-theme").textContent).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")

    await user.click(toggleBtn)
    expect(screen.getByTestId("current-theme").textContent).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light")
  })
})
