# BepNha Production Readiness Runbook

## Release authority and scope

BepNha's deterministic domain and persistence rules remain authoritative. Phase 7 adds only an optional advisory Gemini assistant; it does not change planner feasibility, meal selection, budget ordering, package rounding, pantry subtraction, allergy rules, nutrition calculations, shopping quantities, or immutable revision semantics. Gemini may explain the current authoritative plan or propose a day to preview, but it never selects the replacement meal and never applies or persists a change automatically.

No repository command provisions, links, migrates, or deploys a remote Supabase or Vercel project. Production configuration, migration, deployment, and data changes remain explicit operator actions.

Before a Phase 7 release, audit the full Phase 7 delta from the pre-Phase-7 main SHA and reject any unplanned planner/search/price/portion/allergy authority change, Supabase migration, assistant secret-client access, browser Gemini SDK/key, provider tool/function-calling/search/grounding/background state, direct assistant database write, or automatic replacement apply path.

## Environment separation and secrets

Use separate Supabase/Vercel/Gemini projects or environments for development, test/staging, and production where practical. Never reuse production credentials for local verification or CI.

Public configuration names are:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-only runtime configuration additionally uses `SUPABASE_SECRET_KEY` where catalog administration or planner persistence requires it. Never expose a secret/service-role/private key through `VITE_*`, logs, source control, screenshots, issue text, or client responses.

Phase 7 adds two optional server-only Gemini variables:

- `GEMINI_API_KEY` — Gemini authorization key suitable for the September 2026 API-key migration requirement;
- `GEMINI_MODEL` — explicit stable model identifier approved for the deployment.

Never define `VITE_GEMINI_API_KEY`, `VITE_GEMINI_MODEL`, or another browser-visible Gemini credential. Do not commit a real Gemini key or model assignment. If either server variable is absent, the assistant is disabled while deterministic planner, replacement, pantry, and shopping features remain available.

Before enabling Gemini in production:

1. Confirm the key belongs to the intended production Gemini project and is an authorization key appropriate for the September 2026 key migration.
2. Review the Gemini project's data-use/logging settings and do not opt assistant prompts/responses into provider logging or datasets beyond the approved project policy.
3. Confirm the configured model identifier matches the reviewed deployment choice.
4. Confirm every application interaction is single-turn with `store: false`.
5. Confirm no Gemini tools, grounding, Google Search, URL context, file search, code execution, function declarations, previous interaction state, or background execution are enabled.

Rotate `GEMINI_API_KEY` through the deployment platform's server-side secret configuration. After rotation, revoke the old key according to the Gemini project procedure and perform the assistant smoke below. Never print the old/new value while troubleshooting.

Run `npm run env:check`, `npm run secrets:check`, and `npm run security:dependencies` before release. The dependency gate fails on moderate-or-higher advisories. Do not use `npm audit fix --force` to silence a gate; make a reviewed, lockfile-pinned change and rerun the full verifier.

## Exact-head verification

From the exact candidate SHA:

```powershell
npm ci
npx playwright install chromium
npm run verify:release:web
git diff --check
```

When Docker is available:

```powershell
npm run supabase:start
try {
  npm run verify:release:db
} finally {
  npm run supabase:stop
}
```

The database command is local-only. It resets the local database before the general integration suites and again immediately before catalog-readiness evaluation. Never replace either reset with a remote database command.

The final GitHub Actions run for the exact candidate SHA must have both `web` and `database` jobs successful. A run for an ancestor SHA is not release evidence. Phase 7 database evidence must include assistant owner-isolation/no-write integration and assistant mobile E2E using a fake provider; CI must never call the real Gemini API.

## Catalog-readiness report

The launch gate uses the same normalization and eligibility domain as production planning. Launch-ready representative scenarios require at least 21 eligible curated meal options and sufficient primary-protein-group capacity; vegetarian scenarios use the explicitly narrower vegetarian protein-capacity rule. Coverage failures such as incomplete lineage or unusable price evidence fail closed. The intentionally infeasible time/catalog scenario must report its precise deterministic blocker rather than being counted as launch-ready.

Do not lower thresholds or weaken hard rules to make a release pass. Expand curated immutable catalog data only when evidence demonstrates genuine insufficiency.

## Health and post-deploy smoke

After an approved deployment, issue an unauthenticated `GET /api/health`. Expected response is HTTP 200 with exactly:

```json
{ "status": "ok" }
```

The endpoint is a process/configuration smoke only; it does not expose database records or secrets. A non-GET request must not be used as a health probe.

Then manually verify the deterministic application independently of Gemini: sign-in/onboarding, `/household`, generation on `/plan`, deterministic replacement preview/apply, `/pantry`, and an owned `/shopping/:planId` flow against the intended environment without modifying unrelated production records.

Run the assistant smoke separately so an assistant outage cannot be confused with planner availability:

- With Gemini intentionally unconfigured in a non-production check, verify `/plan` still generates/replaces meals and the assistant reports a bounded disabled/unavailable state rather than breaking planner controls.
- With production Gemini configuration enabled, open a ready owned plan and request `Giải thích kế hoạch này`; verify a bounded advisory result returns without any authoritative plan/revision change.
- Request the variety proposal; verify it can only open the existing deterministic replacement preview and no revision is persisted until the user explicitly chooses `Áp dụng bữa thay thế`.
- Verify the assistant result clears/remounts after a successful revision change so old advice is not shown against a new revision.

Do not use production smoke testing to probe prompts containing secrets, tokens, personal data, or unrelated production records.

## Gemini privacy and telemetry

Every assistant call must use the minimal authoritative evidence projection and `store: false`. Never send Supabase access tokens, secret keys, user/household/plan/revision IDs, idempotency keys, raw planner snapshots, pantry rows, unpublished catalog data, or the full candidate search space to Gemini.

Application telemetry must not contain the assistant question, provider prompt, model response, access token, or API key. Bounded operational telemetry may contain only the safe correlation ID, assistant operation/outcome, rounded duration, HTTP status, and model identifier when useful. Do not add provider raw errors to client responses or logs.

## Correlation-ID troubleshooting

Planner generate/preview/apply and the assistant endpoint use the safe correlation-ID pattern. Use the returned correlation ID to correlate a client-visible failure with bounded server telemetry.

Operational planner logs contain only:

- `event=planner_request`
- operation (`generate`, `preview`, or `apply`)
- correlation ID
- rounded `durationMs`
- HTTP status
- outcome code

Assistant telemetry is similarly bounded and excludes prompt/response contents. Do not add household payloads, access tokens, food free text, secret keys, provider prompt/output, or full request/response bodies to operational telemetry.

## Performance

`npm run test:performance:planner` is the repeatable CI regression gate and remains separate from coverage instrumentation. Before production launch and after material infrastructure changes, collect production-like planner latency samples using representative launch catalog size and household scenarios. Record sample count and p50/p95/max with the release evidence. Investigate any material regression before promotion; do not relax planner frontier limits or correctness semantics solely to improve a timing number.

The assistant has a bounded provider timeout and is optional. Provider latency or outage must not alter deterministic planner SLOs or availability.

## Accessibility and responsive smoke

Automated Playwright covers protected deep links, skip-link focus, primary keyboard focus, and no document-level horizontal overflow at 320 px; Phase 7 also includes the assistant mobile journey at 390×844. Before promotion, also perform a manual keyboard and screen-reader smoke at narrow width:

1. Tab from the address/page start and confirm the skip link is visible and moves focus to main content.
2. Traverse primary actions on household, plan, assistant, pantry, and shopping pages without a pointer.
3. Confirm headings, labels, validation/recovery messages, assistant unavailable state, and button/link names are announced meaningfully.
4. Confirm zoom/narrow width does not hide required controls or create horizontal document scrolling.

## Schema changes, backup, rollback, retention, and deletion

Production schema changes are migration-only. Phase 7 itself requires no database migration. Do not run ad-hoc DDL in production. Review the exact migration history and backup/restore readiness before applying an approved migration outside this repository's verification commands.

The production operator owns backup cadence, restore drills, retention policy, and account-deletion handling. This repository does not claim an automated production backup, retention scheduler, or end-user account-deletion workflow. Before launch, the operator must document who receives deletion requests, how identity/ownership is verified, which owned household/planner/pantry/shopping records are removed or retained under the applicable policy, and how deletion completion is recorded without retaining secrets in tickets.

For an application regression, prefer promotion/rollback to a previously verified immutable application deployment. For an already-applied database migration, use an explicitly reviewed forward-fix migration rather than destructive ad-hoc rollback unless a tested recovery plan requires otherwise. If only Gemini is degraded, disable/remove the Gemini runtime variables or roll back the application configuration without changing deterministic planner data.

## Security headers and browser boundary

Production responses are expected to preserve the repository's same-origin hardening: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and the restrictive `Permissions-Policy`. API handlers also apply their server security headers. Do not weaken these controls to work around embedding or cross-origin integration without a separate security review.

The Gemini SDK and credentials remain server-only. Browser code communicates only with the same-origin `/api/assistant` endpoint and must not call Gemini directly.

## Release evidence record

Keep one Phase 7 release record containing:

- exact feature Git commit SHA and exact resulting `main` SHA after approved integration;
- exact GitHub Actions run URLs with successful `web`/`database` jobs for both required exact-head gates;
- dependency and secret-scan result;
- generated database-type drift result;
- catalog-readiness result;
- assistant owner-isolation/no-write integration result and assistant mobile E2E result;
- Phase 7 scope/security exit-audit result;
- planner performance result plus production-like p95 sample when applicable;
- narrow-width keyboard/screen-reader manual smoke result;
- post-deploy deterministic `/api/health` and planner smoke result;
- separate assistant disabled/enabled smoke result when Gemini is activated;
- Gemini key/project logging review and rotation owner;
- migration/backup owner and rollback decision.

If any mandatory Phase 7 item is missing or failed, record `PHASE_7_BLOCKED`; do not promote the candidate as Phase 7 complete.
