# Phase 7 Gemini Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Gemini-powered assistant inside the ready weekly-plan experience that can explain the authoritative deterministic plan or propose a day to preview, without granting the model planner authority, database write access, tools, memory, or autonomous execution.

**Architecture:** Add a separate assistant application boundary, a read-only owner-scoped context adapter, a server-only Gemini Interactions API adapter, a narrow authenticated `/api/assistant` endpoint, and a browser assistant card embedded in `/plan`. Gemini receives only a minimal verified evidence DTO; replacement proposals can only invoke the existing deterministic `PlannerApi.preview()` flow and still require the existing explicit `PlannerApi.apply()` user confirmation.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest/RTL, Playwright, Vercel Functions, Supabase Auth/RLS, `@google/genai`, Zod 4, Gemini Interactions API, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-phase-7-gemini-assistant-design.md`

## Global Constraints

- Deterministic planner, pricing, nutrition, pantry, shopping, hard-rule and persistence logic remain authoritative.
- Gemini may return only `explanation`, `replacement_proposal`, or `unsupported`; it never selects a replacement meal.
- The assistant has no service-role client, persistence port, Supabase secret client, function calling, tools, grounding, web search, background execution, conversation memory, or `previous_interaction_id`.
- Every Gemini interaction is single-turn with `store: false`.
- Provider input is a minimal authoritative DTO; never send user/household/plan/revision IDs, access tokens, raw planner snapshots, full catalog candidates, idempotency keys, or service-role data.
- `GEMINI_API_KEY` and `GEMINI_MODEL` are server-only. No `VITE_GEMINI_*` variable is permitted.
- Missing Gemini configuration disables only the assistant; plan generation, deterministic replacement, pantry and shopping remain usable.
- CI never calls the real Gemini API. Provider behavior is injected/faked in unit, integration and Playwright tests.
- No database migration is planned for Phase 7; reuse the authenticated owner-scoped `get_plan_replacement_input` read path.
- Every behavioral change follows RED → GREEN → refactor and is committed independently.
- Feature exact-head CI must succeed before a non-force fast-forward to `main`; exact-main CI must succeed afterward.

---

### Task 1: Assistant contracts and fail-closed result validation

**Files:**
- Create: `src/application/assistant/meal-assistant.ts`
- Create: `src/application/assistant/meal-assistant.test.ts`
- Modify: `tsconfig.api.json`
- Modify: `tsconfig.integration.json`

**Interfaces:**

```ts
export const ASSISTANT_QUESTION_MAX_LENGTH = 500

export interface AssistantPlanEvidence {
  readonly meals: readonly {
    readonly dayIndex: number
    readonly dayLabelVi: string
    readonly mealNameVi: string
    readonly elapsedMinutes: number
  }[]
  readonly budgetStatus: "within" | "over"
  readonly totalEstimatedCostVnd: number
  readonly budgetVnd: number
  readonly warningCodes: readonly string[]
}

export type AssistantResult =
  | { readonly kind: "explanation"; readonly summaryVi: string; readonly observationsVi: readonly string[] }
  | { readonly kind: "replacement_proposal"; readonly targetDayIndex: number; readonly reasonVi: string }
  | { readonly kind: "unsupported"; readonly messageVi: string }

export type AssistantProviderResult =
  | { readonly ok: true; readonly value: AssistantResult }
  | { readonly ok: false; readonly error: "ASSISTANT_UNAVAILABLE" }

export interface MealAssistantPort {
  readonly respond: (input: {
    readonly question: string
    readonly evidence: AssistantPlanEvidence
  }) => Promise<AssistantProviderResult>
}

export function validateAssistantResult(
  value: unknown,
  evidence: AssistantPlanEvidence
): AssistantResult | null
```

- [ ] **Step 1: Write failing contract/validation tests**

  Cover valid explanation, proposal and unsupported results; reject extra keys, empty/oversized strings, more than five observations, non-integer/out-of-range/missing-plan `targetDayIndex`, and unknown `kind`.

  ```ts
  expect(validateAssistantResult({ kind: "replacement_proposal", targetDayIndex: 9, reasonVi: "x" }, evidence)).toBeNull()
  ```

- [ ] **Step 2: Run focused test and verify RED**

  Run: `npx vitest run src/application/assistant/meal-assistant.test.ts`

  Expected: FAIL because `meal-assistant.ts` does not exist.

- [ ] **Step 3: Implement minimal strict Zod validation**

  Use `.strict()` object schemas. Bound `summaryVi <= 600`, `observationsVi <= 5` and each `<= 240`, `reasonVi <= 320`, `messageVi <= 240`. After schema parsing, verify proposal day exists in `evidence.meals`.

- [ ] **Step 4: Add assistant application paths to API/integration tsconfigs**

  Add `src/application/assistant/**/*.ts`; do not expose server modules to the browser config.

- [ ] **Step 5: Run GREEN and commit**

  Run: `npx vitest run src/application/assistant/meal-assistant.test.ts && npm run typecheck`

  Commit: `feat: add assistant result contracts`

---

### Task 2: Read-only authoritative assistant context

**Files:**
- Create: `src/application/assistant/assistant-context-repository.ts`
- Create: `src/infrastructure/server/supabase-assistant-context-repository.ts`
- Create: `src/infrastructure/server/supabase-assistant-context-repository.test.ts`

**Interfaces:**

```ts
export type AssistantContextLoadResult =
  | {
      readonly ok: true
      readonly value: {
        readonly currentRevisionId: string
        readonly evidence: AssistantPlanEvidence
      }
    }
  | {
      readonly ok: false
      readonly error: "UNAUTHORIZED" | "TRANSIENT_DEPENDENCY_FAILURE"
    }

export interface AssistantContextRepository {
  readonly loadCurrent: (input: {
    readonly actorUserId: string
    readonly planId: string
  }) => Promise<AssistantContextLoadResult>
}
```

- [ ] **Step 1: Write failing repository tests**

  Fake the authenticated RPC and planner input loader. Assert the adapter calls only `get_plan_replacement_input`, returns current revision plus minimal evidence, maps null/owner-denied to `UNAUTHORIZED`, and maps RPC/loader failures to `TRANSIENT_DEPENDENCY_FAILURE`.

- [ ] **Step 2: Verify RED**

  Run: `npx vitest run src/infrastructure/server/supabase-assistant-context-repository.test.ts`

  Expected: missing module failure.

- [ ] **Step 3: Implement the read-only adapter**

  Reuse `createSupabasePlannerInputLoader(userClient).hydrateReplacement(raw, userClient)` only to reconstruct the authoritative current plan, then immediately project it into `AssistantPlanEvidence`. Do not construct or accept `PlannerRepository`, `secretClientFactory`, or any persistence function.

  Evidence derives:
  - seven `currentPlan.items`, using `snapshot.mealOptionNameVi` and `snapshot.elapsedMinutes`;
  - budget status from deterministic `currentPlan.totalEstimatedCostVnd` vs `input.weeklyPlanBudgetVnd`;
  - warning codes from current purchase-basket warnings plus derived `PLAN_OVER_BUDGET` when applicable.

- [ ] **Step 4: Prove privacy projection**

  Tests must serialize the provider evidence and assert it does not contain `actorUserId`, household ID, plan ID, revision ID, meal/recipe/food database IDs, bearer token, candidate catalog, raw input snapshot, or pantry rows.

- [ ] **Step 5: Run GREEN and commit**

  Commit: `feat: add read-only assistant context`

---

### Task 3: Stateless Gemini Interactions provider

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/infrastructure/server/gemini-meal-assistant.ts`
- Create: `src/infrastructure/server/gemini-meal-assistant.test.ts`

**Interfaces:**

```ts
export interface GeminiInteractionClient {
  readonly create: (input: Record<string, unknown>) => Promise<unknown>
}

export function createGeminiMealAssistant(input: {
  readonly client: GeminiInteractionClient
  readonly model: string
  readonly timeoutMs?: number
}): MealAssistantPort
```

- [ ] **Step 1: Add provider tests first**

  Test exact outbound invariants: `model`, `store: false`, structured `response_format` with `mime_type: "application/json"` and JSON Schema; no `tools`, `previous_interaction_id`, `background`, grounding or function declarations. Verify prompt text labels question/evidence as untrusted data and contains no hidden identifiers/tokens.

  Test valid `output_text`, malformed JSON, invalid schema, non-completed status, missing output, provider rejection/exception and timeout all fail closed.

- [ ] **Step 2: Verify RED**

  Run: `npx vitest run src/infrastructure/server/gemini-meal-assistant.test.ts`

- [ ] **Step 3: Install current official SDK through npm, never hand-edit lockfile**

  Run in a verified helper checkout: `npm install --save-exact @google/genai@2.19.0`

  Then run `npm audit --audit-level=moderate`. If the current registry version differs or introduces an advisory/type incompatibility, inspect evidence before changing the version; do not force/downgrade blindly.

- [ ] **Step 4: Implement provider adapter**

  Build one single-turn Interactions request and parse only `output_text`; independently `JSON.parse` and call `validateAssistantResult`. Use a bounded timeout (default 8 seconds) that returns `ASSISTANT_UNAVAILABLE`; provider errors never escape to HTTP.

- [ ] **Step 5: Verify SDK typing, audit, tests and build**

  Run:
  - `npx vitest run src/infrastructure/server/gemini-meal-assistant.test.ts`
  - `npm run security:dependencies`
  - `npm run typecheck`
  - `npm run build`

  Commit: `feat: add stateless Gemini assistant provider`

---

### Task 4: Authenticated assistant HTTP endpoint and runtime isolation

**Files:**
- Create: `src/infrastructure/server/assistant-http.ts`
- Create: `src/infrastructure/server/assistant-http.test.ts`
- Create: `src/infrastructure/server/assistant-runtime.ts`
- Create: `src/infrastructure/server/assistant-runtime.test.ts`
- Create: `api/assistant.ts`
- Modify: `src/infrastructure/server/operational-telemetry.ts`
- Modify: `src/infrastructure/server/operational-telemetry.test.ts`

**Interfaces:**

Browser body is exactly:

```ts
{
  readonly planId: string
  readonly expectedRevisionId: string
  readonly question: string
}
```

Public errors are only:
`UNAUTHORIZED`, `INVALID_ASSISTANT_REQUEST`, `STALE_ASSISTANT_CONTEXT`, `ASSISTANT_DISABLED`, `ASSISTANT_UNAVAILABLE`.

- [ ] **Step 1: Write failing HTTP tests**

  Cover POST-only/JSON-only/body-size gate, exact keys, UUID plan/revision validation, trimmed question length 1–500, missing/invalid auth, owner denial, stale revision before provider invocation, disabled provider, provider failure, success, security headers and safe correlation ID.

- [ ] **Step 2: Add telemetry RED tests**

  Generalize telemetry to a discriminated event union that also supports one `assistant_request`/`respond` event while retaining planner events unchanged. Assert telemetry never contains prompt, output, token or key values.

- [ ] **Step 3: Implement minimal handler**

  Order: security/correlation → request preflight → auth → validate command → load owner-scoped context → stale check → provider availability → provider call → safe response. Set `Cache-Control: no-store` through the existing header helper. Use an 8–16 KB body limit; do not reuse the planner 64 KB allowance.

- [ ] **Step 4: Implement server-only runtime**

  Create a Supabase user client with caller Bearer token and `createSupabaseAssistantContextRepository`. Create Gemini with `GEMINI_API_KEY` + `GEMINI_MODEL` only when both are present. `assistant-runtime.ts` must contain no `SUPABASE_SECRET_KEY`, service-role client, persistence repository or mutation RPC.

- [ ] **Step 5: Add source-level runtime isolation assertions**

  Test that runtime source/config exports no secret/persistence dependency and that missing Gemini env yields disabled behavior rather than module initialization failure.

- [ ] **Step 6: Run GREEN and commit**

  Run focused assistant HTTP/runtime/telemetry tests plus `npm run typecheck`.

  Commit: `feat: add authenticated assistant endpoint`

---

### Task 5: Browser Assistant API and `/plan` advisory card

**Files:**
- Create: `src/features/assistant/assistant-api.ts`
- Create: `src/features/assistant/assistant-api.test.ts`
- Create: `src/features/assistant/assistant-card.tsx`
- Create: `src/features/assistant/assistant-card.test.tsx`
- Modify: `src/features/plans/weekly-plan-page.tsx`
- Modify: `src/features/plans/weekly-plan-page.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/main.tsx`

**Interfaces:**

```ts
export interface AssistantApi {
  readonly ask: (
    accessToken: string,
    input: { readonly planId: string; readonly expectedRevisionId: string; readonly question: string }
  ) => Promise<
    | { readonly ok: true; readonly value: AssistantResult }
    | { readonly ok: false; readonly error: string; readonly correlationId?: string }
  >
}
```

- [ ] **Step 1: Write AssistantApi RED tests**

  Assert same-origin `/api/assistant`, bearer header, exact body, strict response parsing, safe correlation-ID extraction and fail-closed malformed success payload.

- [ ] **Step 2: Write card RED tests**

  Assert presets, free-text max 500, loading/unsupported/unavailable/stale states, explanation rendering and proposal rendering. Proposal action calls only `onPreviewDay(targetDayIndex)`.

- [ ] **Step 3: Implement browser API/card minimally**

  No Gemini SDK/env import in browser files. Keep assistant state local to the card.

- [ ] **Step 4: Integrate with ready plan**

  `WeeklyPlanPage` receives `assistantApi`. Render the card only when `state.status === "ready"`, passing current `planId` and `revisionId`. The proposal callback invokes the existing `previewDay(dayIndex)` function; do not add another replacement algorithm.

  After successful deterministic apply/new revision, reset old assistant advice by remounting/keying the card on `revisionId` or equivalent explicit reset.

- [ ] **Step 5: Prove no automatic mutation**

  RTL test: Gemini proposal → click proposal button → `plannerApi.preview` called once, `plannerApi.apply` still zero; only the existing `Áp dụng bữa thay thế` button may call apply.

- [ ] **Step 6: Wire composition and run GREEN**

  Instantiate `createAssistantApi()` in `main.tsx`, thread it through App/router into `WeeklyPlanPage`, update app test fixtures.

  Commit: `feat: add Gemini advisory plan card`

---

### Task 6: Owner-isolated integration and mobile E2E gates

**Files:**
- Create: `tests/integration/assistant-api.integration.test.ts`
- Create: `tests/assistant.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Add `test:integration:assistant` using local Supabase env with a fake provider.
- Add `test:e2e:assistant` using Playwright route interception; never real Gemini.

- [ ] **Step 1: Write integration RED tests**

  Use real local Supabase Auth/RLS/plan persistence to produce an owned plan. Inject a fake `MealAssistantPort` into the HTTP handler. Cover owner success, cross-owner denial, stale revision rejected before fake invocation, provider failure safe response/correlation ID and invalid auth.

- [ ] **Step 2: Prove the endpoint writes nothing**

  Count authoritative `meal_plan_revisions`, plan version/current revision, pantry and shopping state before and after assistant requests; assert byte-equivalent/no row-count change. The fake provider receives only the minimal evidence DTO.

- [ ] **Step 3: Run integration GREEN**

  Add `test:integration:assistant` after planner integration in the database job.

- [ ] **Step 4: Write mobile Playwright test**

  At 390×844, intercept `/api/assistant` and planner endpoints. Verify assistant appears only after ready plan, explanation renders, proposal invokes deterministic preview, no apply occurs until explicit existing confirmation, and assistant unavailable does not disable planner controls.

- [ ] **Step 5: Add E2E script/CI and run GREEN**

  Add `test:e2e:assistant` to the database job after planner E2E. CI must not define `GEMINI_API_KEY`/`GEMINI_MODEL` and must not make external Gemini requests.

  Commit: `test: add assistant isolation gates`

---

### Task 7: Gemini secrets policy, operations documentation and scope audit

**Files:**
- Modify: `scripts/check-secrets.mjs`
- Modify: `scripts/check-secrets.test.ts`
- Modify: `README.md`
- Modify: `docs/operations/production-readiness.md`
- Modify: `docs/superpowers/specs/2026-09-02-phase-7-gemini-assistant-design.md`
- Create: `docs/superpowers/audits/2026-09-02-phase-7-exit-audit.md`

**Interfaces:**
- No real Gemini key or model value is committed.
- Do not add `GEMINI_API_KEY` to `.env.example` if the tracked-secret scanner would then need a dangerous exception; document it as an optional server-only deployment variable instead.

- [ ] **Step 1: Write secret-scanner RED tests**

  Assert tracked `GEMINI_API_KEY=<credential-like-value>` and any `VITE_GEMINI_API_KEY=...` are flagged. Placeholder/documentation text without an assignment remains allowed.

- [ ] **Step 2: Implement scanner rule and run GREEN**

  Keep existing Supabase/GitHub/AWS/OpenAI patterns intact.

- [ ] **Step 3: Update product/operations docs**

  README: Phase 7 optional assistant, planner remains authoritative, Gemini config is server-only.

  Runbook: Gemini authorization-key requirement for September 2026, `GEMINI_API_KEY`/`GEMINI_MODEL`, key rotation, Gemini project data/logging review, every Interaction uses `store:false`, no prompt/response telemetry, no provider tools, disabled fallback and post-deploy assistant smoke separate from deterministic planner smoke.

- [ ] **Step 4: Mark design spec approved and write exit audit**

  Audit `main...feature` for forbidden changes: planner/search/price/portion/allergy authority changes, Supabase migrations, secret-client access in assistant, browser Gemini SDK/key, tools/function calling/search/background state, direct DB writes or auto-apply.

  Audit status remains `PHASE_7_BLOCKED` until exact feature and exact main CI evidence exists.

- [ ] **Step 5: Run release verifier**

  Run `npm run verify:release:web`, `npm run secrets:check`, `npm run security:dependencies`, and `git diff --check`.

  Commit: `docs: finalize Phase 7 Gemini operations`

---

### Task 8: Exact-head verification, non-force integration and exact-main gate

**Files:**
- No product code expected; only fix verified failures if discovered.

- [ ] **Step 1: Verify exact feature topology**

  Compare `main...codex/phase-7-gemini-assistant`; require `behind_by=0` and only approved Phase 7 scope.

- [ ] **Step 2: Run/observe exact feature CI**

  Require both `web` and `database` jobs `success` for the exact feature SHA. Database evidence must include assistant integration/E2E plus all pre-existing gates. Web evidence must include audit/secrets/typecheck/coverage/build/performance/smoke.

- [ ] **Step 3: Fix any failure using systematic debugging + TDD**

  Do not merge on ancestor evidence. Every fix creates a new candidate SHA and requires fresh exact-head CI.

- [ ] **Step 4: Fast-forward `main` non-force**

  Re-check topology immediately before `update_ref`. Never force.

- [ ] **Step 5: Require exact-main CI**

  Find the new `main` push run for the same SHA and require both `web` and `database` jobs success, including assistant gates.

- [ ] **Step 6: Report completion only with fresh evidence**

  Only after exact-main success report `PHASE_7_PASS`. Otherwise report the precise failed/pending gate and keep Phase 7 open.
