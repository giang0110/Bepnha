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

interface ViolationNode {
  readonly target: readonly unknown[]
  readonly html: string
  readonly failureSummary?: string | undefined
}

function describeNode(node: ViolationNode) {
  const where = node.target.map((part) => String(part)).join(" ")
  const why = node.failureSummary === undefined ? "" : `\n    ${node.failureSummary.trim()}`
  return `  ${where}\n    ${node.html}${why}`
}

function describe(
  violations: readonly { id: string; help: string; nodes: readonly ViolationNode[] }[]
) {
  return violations
    .map((violation) =>
      [
        `${violation.id} (${violation.nodes.length}): ${violation.help}`,
        // The element and the measurement, not just the rule. Without them the message names a
        // rule and a page, and finding which of a screen's elements broke it means running the
        // suite again locally — which is not possible for everyone who reads this failure.
        ...violation.nodes.map(describeNode)
      ].join("\n")
    )
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
