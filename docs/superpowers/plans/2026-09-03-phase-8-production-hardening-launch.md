# Phase 8 Production Hardening & Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden BepNha for a controlled production launch while preserving all deterministic planner/shopping/pantry authority and keeping Gemini optional, advisory, rate-limited, and fail-closed.

**Architecture:** Keep `ci.yml` as the canonical repository release gate, add explicit release/governance evidence, insert a small assistant rate-limit port between verified current-plan context and the Gemini provider, and lazy-load protected product routes so the initial bundle stays below 500 kB. External Supabase/Vercel production actions remain separate gated operator actions and never run against guessed targets.

**Tech Stack:** React 19, React Router 8, Vite 8, TypeScript, Vitest 4, Playwright, Vercel Functions, Supabase, GitHub Actions, Gemini `@google/genai`.

**Spec:** `docs/superpowers/specs/2026-09-03-phase-8-production-hardening-launch-design.md`

## Global Constraints

- Branch: `codex/phase-8-production-hardening`; never implement on `main`.
- Base main SHA: `ba8b90ea8cfd32dc02964fb28197a7f84e598995`.
- Preserve deterministic planner/search/pricing/portion/nutrition/allergy/pantry/shopping/revision authority.
- Gemini burst default: 5 accepted requests / rolling 60 seconds / authenticated user.
- Gemini daily default: 50 accepted requests / UTC day / authenticated user.
- Rate-limited response: HTTP 429, `ASSISTANT_RATE_LIMITED`, safe `Retry-After` when available.
- Ownership/stale-context failures do not consume quota; provider attempts after acceptance do.
- Public production Gemini must not use per-instance in-memory rate limiting; without a shared limiter it remains disabled.
- Coverage floors: statements >= 78%, branches >= 70%, functions >= 84%, lines >= 82%.
- No built JavaScript chunk may exceed 500 kB minified.
- No remote Supabase reset/test-fixture/destructive cleanup is allowed.
- Production deploy/database mutation requires an explicitly resolved target; missing target blocks instead of guessing.
- No secret value may enter Git, PR/issue text, CI logs, telemetry, or client responses.

---

### Task 1: Release evidence and governance gate

**Files:**
- Modify: `docs/superpowers/audits/2026-09-02-phase-7-exit-audit.md`
- Create: `docs/superpowers/audits/2026-09-03-phase-8-release-record.md`
- Modify: `docs/operations/production-readiness.md`

**Interfaces:**
- Consumes: exact-main Phase 7 evidence `ba8b90ea...`, CI run `33752677760` / #450.
- Produces: auditable `PHASE_7_PASS`; a Phase 8 record with separate repository and external-production gates.

- [ ] **Step 1: Verify current branch protection state read-only**

Fetch `GET /repos/ntgiang1235-ux/Bepnha/branches/main` and record whether `protected` is true. Expected current state from the pre-plan audit: `protected: false`.

- [ ] **Step 2: Correct the Phase 7 audit**

Replace the historical blocking status with a final evidence section:

```markdown
## Final status

`PHASE_7_PASS`

Final integrated `main`: `ba8b90ea8cfd32dc02964fb28197a7f84e598995`.
Exact-main CI run `33752677760` (#450) completed successfully with both `web` and `database` jobs green.
```

Keep the original pre-merge evidence as historical context rather than deleting it.

- [ ] **Step 3: Create the Phase 8 release record**

Create a checklist containing at least:

```markdown
## Status
`PHASE_8_BLOCKED`

### Repository gates
- [ ] main governance enforced or exact platform blocker recorded
- [ ] canonical CI cleaned/hardened
- [ ] assistant rate limiting implemented and verified
- [ ] bundle ceiling and coverage floors enforced
- [ ] exact-head web + database CI success
- [ ] PR review checkpoint complete
- [ ] authorized merge complete
- [ ] exact-main web + database CI success

### External production gates
- [ ] production Supabase target resolved
- [ ] production migration/catalog readiness verified
- [ ] BepNha Vercel project resolved
- [ ] exact-main deployment verified
- [ ] `/api/health` + security/deep-link smoke verified
- [ ] deterministic production smoke verified
- [ ] Gemini disabled safely or shared-rate-limited assistant smoke verified
- [ ] runtime error review complete
- [ ] backup/restore/deletion ownership documented
```

- [ ] **Step 4: Document governance blocker if the connector cannot write protection**

Add the exact desired rules to the runbook: PR required, `web` and `database` required, force-push/delete disabled. Explicitly say current GitHub connector exposes protection read but no write action if that remains true.

- [ ] **Step 5: Verify docs formatting through Fast CI on the resulting commit**

Expected: `npm run verify:web` succeeds. If a Markdown formatting failure occurs, fix only formatting and rerun.

---

### Task 2: CI workflow cleanup and supported Actions runtime

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/fast-ci.yml`
- Delete: `.github/workflows/phase7-task5-reset.yml`
- Delete: `.github/workflows/phase7-task6.yml`
- Delete: `.github/workflows/phase7-task7.yml`

**Interfaces:**
- Consumes: existing `verify:web`, database integration/E2E commands.
- Produces: two canonical workflows only: full `CI` for PR/main and `Fast CI` for non-main branch pushes.

- [ ] **Step 1: Check currently supported major releases of `actions/checkout` and `actions/setup-node`**

Use current GitHub marketplace/repository release evidence. Choose the supported majors that run natively on the current Actions Node runtime. Do not guess versions.

- [ ] **Step 2: Update only the action major refs**

Example shape, substituting the verified supported major:

```yaml
- uses: actions/checkout@v<verified-major>
- uses: actions/setup-node@v<verified-major>
  with:
    node-version: 24
    cache: npm
```

Do not remove or reorder release gates.

- [ ] **Step 3: Delete the three Phase-7-only workflows**

They are branch/task isolation gates and are no longer part of canonical main/PR verification.

- [ ] **Step 4: Push and inspect Fast CI**

Expected: `npm ci` and `npm run verify:web` succeed with no old Node-20 action deprecation warning. If the action upgrade itself fails, revert to the latest supported working major rather than weakening CI.

---

### Task 3: Gemini assistant rate-limit boundary

**Files:**
- Create: `src/application/assistant/assistant-rate-limiter.ts`
- Create: `src/infrastructure/server/in-memory-assistant-rate-limiter.ts`
- Create: `src/infrastructure/server/in-memory-assistant-rate-limiter.test.ts`
- Modify: `src/infrastructure/server/assistant-http.ts`
- Modify: `src/infrastructure/server/assistant-http.test.ts`
- Modify: `src/infrastructure/server/assistant-runtime.ts`
- Modify: `src/infrastructure/server/assistant-runtime.test.ts`
- Modify: `api/assistant.ts` only if runtime dependency wiring requires it.

**Interfaces:**
- Produces:

```ts
export interface AssistantRateLimitRequest {
  readonly actorUserId: string
  readonly nowMs: number
}

export type AssistantRateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds?: number }

export interface AssistantRateLimiter {
  consume(request: AssistantRateLimitRequest): Promise<AssistantRateLimitDecision>
}
```

- `createAssistantHttpHandler` receives `rateLimiter: AssistantRateLimiter | null`.
- `null` means assistant cannot be publicly invoked and returns `ASSISTANT_DISABLED` before provider invocation.

- [ ] **Step 1: Write RED HTTP tests**

Add tests proving:

```ts
const consume = vi.fn(() => Promise.resolve({ allowed: false as const, retryAfterSeconds: 12 }))
// valid owner/current revision request
expect(state.statusCode).toBe(429)
expect(state.body).toEqual({ error: "ASSISTANT_RATE_LIMITED" })
expect(state.setHeader).toHaveBeenCalledWith("Retry-After", "12")
expect(respond).not.toHaveBeenCalled()
```

Also prove stale/owner-denied requests do not call `consume`, and successful verified requests call it with `{ actorUserId: "user-1", nowMs: <injected wall clock> }` exactly once before provider invocation.

- [ ] **Step 2: Run the focused test and require RED**

Run through Fast CI or a dedicated temporary branch gate if local execution is unavailable:

```bash
npx vitest run src/infrastructure/server/assistant-http.test.ts
```

Expected failure: missing `rateLimiter` behavior / 429 mapping.

- [ ] **Step 3: Add the application port and minimal HTTP integration**

In `assistant-http.ts`, after successful owner/current-revision validation and after `assistant !== null`, call `rateLimiter.consume`. On denied decision:

```ts
if (decision.retryAfterSeconds !== undefined) {
  response.setHeader("Retry-After", String(decision.retryAfterSeconds))
}
sendError(429, "ASSISTANT_RATE_LIMITED")
return
```

Do not include user ID or quota counters in telemetry.

- [ ] **Step 4: Write RED limiter algorithm tests**

For `createInMemoryAssistantRateLimiter({ burstLimit: 5, burstWindowMs: 60_000, dailyLimit: 50 })`, prove:

```ts
// first 5 same-user requests inside 60s allowed
// 6th denied with retryAfterSeconds > 0
// a different user remains allowed
// after 60s burst window advances and request is allowed
// 51st request in same UTC day denied
// next UTC day resets daily count
```

Use injected `nowMs` from the request; do not use real timers.

- [ ] **Step 5: Implement minimal deterministic in-memory limiter**

Store per-user timestamp queue for the rolling burst and `{ utcDayKey, count }` daily count. Prune timestamps `<= nowMs - burstWindowMs`. Calculate retry from the oldest retained timestamp. Never store request body or identifiers other than the authenticated user key.

- [ ] **Step 6: Runtime fail-closed wiring**

Extend `AssistantRuntimeEnvironment` with `VERCEL_ENV?: string` and validated optional numeric overrides:

```ts
ASSISTANT_RATE_LIMIT_BURST?: string
ASSISTANT_RATE_LIMIT_DAILY?: string
```

Defaults remain 5 and 50; allowed bounds: burst 1..30, daily 1..500.

For non-production runtime, create the in-memory limiter. For `VERCEL_ENV === "production"`, do not use in-memory limiting; until a shared adapter exists, expose `assistant: null` and `rateLimiter: null`, keeping deterministic app functionality available.

- [ ] **Step 7: GREEN verification**

Run focused HTTP/runtime/limiter tests plus `npm run verify:web`. Expected: all pass; no secret/log boundary regression.

---

### Task 4: Route code splitting, bundle ceiling, and coverage floors

**Files:**
- Modify: `src/app/router.tsx`
- Modify: `src/app/App.test.tsx` and/or router-focused tests as required to preserve route behavior
- Create: `scripts/check-bundle-size.mjs`
- Create: `scripts/check-bundle-size.test.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces `npm run bundle:check` which scans `dist/assets/*.js` and exits non-zero if any minified JavaScript file size exceeds 500000 bytes.
- `verify:web` becomes `... && npm run build && npm run bundle:check`.

- [ ] **Step 1: Write RED bundle checker tests**

Export a pure helper from the script:

```js
export function oversizedJavaScriptAssets(entries, maxBytes = 500_000) {
  return entries.filter((entry) => entry.name.endsWith(".js") && entry.size > maxBytes)
}
```

Tests prove 499999 and 500000 byte JS assets pass, 500001 fails, and non-JS files are ignored.

- [ ] **Step 2: Add route-level lazy imports**

Use `lazy` + `Suspense` for product feature pages while keeping lightweight auth shell/router synchronous. Example:

```ts
const WeeklyPlanPage = lazy(async () => ({
  default: (await import("@/features/plans/weekly-plan-page")).WeeklyPlanPage
}))
```

Do the same for household protected pages, pantry, shopping, and assistant composition where it materially moves code out of the entry chunk. Use one accessible loading fallback such as `<p role="status">Đang tải…</p>`.

- [ ] **Step 3: Preserve existing route tests**

Update tests only for async rendering (`findBy...`/`waitFor`) rather than weakening assertions. Deep links, auth guards, planner controls, and assistant embedding must remain tested.

- [ ] **Step 4: Add bundle check command**

Package scripts:

```json
"bundle:check": "node scripts/check-bundle-size.mjs",
"verify:web": "npm run env:check && npm run secrets:check && npm run security:dependencies && npm run format:check && npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm run bundle:check"
```

- [ ] **Step 5: Set coverage thresholds**

In `vitest.config.ts`:

```ts
thresholds: {
  statements: 78,
  branches: 70,
  functions: 84,
  lines: 82
}
```

- [ ] **Step 6: Verify exact branch build output**

Fast CI must show build success and `bundle:check` success. Record the largest resulting JS chunk size in the Phase 8 release record.

---

### Task 5: Exact-head review and PR gate

**Files:**
- Modify: `docs/superpowers/audits/2026-09-03-phase-8-release-record.md` with exact branch evidence only after runs finish.

**Interfaces:**
- Consumes exact final branch SHA.
- Produces merge-ready PR evidence; does not merge without explicit user authorization.

- [ ] **Step 1: Compare branch topology to `main`**

Require `behind_by = 0`. If main advanced, update/rebase only through non-force safe history and rerun exact-head gates.

- [ ] **Step 2: Require exact-head Fast CI success**

Confirm `verify:web`, including audit, format, lint, typecheck, coverage thresholds, build, and bundle ceiling.

- [ ] **Step 3: Open PR and require full CI**

PR body lists scope, security invariants, and known external production blockers. Require both `web` and `database` success on the exact head.

- [ ] **Step 4: Review checkpoint**

Audit changed files for: no planner-authority drift, no migration unless explicitly intended, no browser secret, no assistant provider-before-limiter path, no production in-memory limiter, no weakened tests.

- [ ] **Step 5: Stop before merge**

Report `PHASE_8_READY_FOR_MERGE` and wait for explicit merge authorization.

---

### Task 6: External production launch gates

**Files:**
- Modify after evidence only: `docs/superpowers/audits/2026-09-03-phase-8-release-record.md`
- Modify if needed: `docs/operations/production-readiness.md`

**Interfaces:**
- Consumes exact-main SHA after approved merge.
- Produces either `PRODUCTION_READY` or exact blocker statuses such as `PRODUCTION_SUPABASE_UNRESOLVED`, `PRODUCTION_VERCEL_UNRESOLVED`, `PRODUCTION_GEMINI_SHARED_LIMITER_BLOCKED`.

- [ ] **Step 1: Exact-main CI**

After authorized integration, require full `web` + `database` success on the resulting exact main SHA.

- [ ] **Step 2: Resolve production Supabase read-only**

Identify the intended production project. Read migration history/schema/catalog readiness without reset or fixture mutation. If the target cannot be proven, record `PRODUCTION_SUPABASE_UNRESOLVED` and do not mutate anything.

- [ ] **Step 3: Resolve BepNha Vercel project**

List connected Vercel projects and require a project linked to `ntgiang1235-ux/Bepnha`. If absent and the available connector cannot safely create/link it from this repository, record `PRODUCTION_VERCEL_UNRESOLVED` rather than deploying another project.

- [ ] **Step 4: Configure/deploy only after target resolution**

Set only the approved production variables. Gemini may remain absent/disabled. Deploy the exact approved main SHA, not a local/uncommitted tree.

- [ ] **Step 5: Production smoke**

Verify `/api/health`, headers/deep links, deterministic authenticated journey, runtime errors, and assistant disabled or shared-limited behavior. Never use production reset/test fixtures.

- [ ] **Step 6: Close operations evidence**

Record backup/restore owner, deletion handling, rollback/forward-fix owner, Gemini key owner, and release evidence locations. Record `PRODUCTION_READY` only if every mandatory external gate is green.
