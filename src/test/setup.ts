import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// jsdom has dialog elements but no top layer API. Content/focus-return tests still use real DOM;
// Playwright verifies native modal focus trapping, Escape, and mobile geometry in Chromium.
if (typeof HTMLDialogElement !== "undefined")
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true
      }
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false
      }
    }
  })

afterEach(() => {
  cleanup()
})
