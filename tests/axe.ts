import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

/**
 * The rule sets a Vietnamese family app is actually held to.
 *
 * WCAG 2.2 AA is included because two of its rules are the ones this app kept failing by hand:
 * target size and focus appearance. Best-practice rules are deliberately left out — they are advice,
 * not conformance, and a gate that fails on advice gets switched off.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const

function describe(violations: readonly { id: string; help: string; nodes: readonly unknown[] }[]) {
  return violations
    .map((violation) => `${violation.id} (${violation.nodes.length}): ${violation.help}`)
    .join("\n")
}

/**
 * Fails the test with the rule that broke and where, rather than with a bare count.
 *
 * Written as a helper because the useful part is the message: "2 violations" sends the next person
 * to the axe docs, while "target-size (3): Touch targets must be large enough" sends them to the
 * line of markup.
 */
export async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags([...TAGS]).analyze()
  expect(describe(results.violations), describe(results.violations)).toBe("")
}
