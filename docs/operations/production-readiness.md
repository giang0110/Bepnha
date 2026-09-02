# BepNha Production Readiness Runbook

## Release authority and scope

BepNha's deterministic domain and persistence rules remain authoritative. Phase 6 adds operational evidence only; it does not change planner feasibility, budget ordering, package rounding, pantry subtraction, allergy rules, nutrition calculations, or immutable revision semantics. No repository command provisions, links, migrates, or deploys a remote Supabase or Vercel project.

Before a release, compare `main...codex/phase-6-production-readiness` and reject any AI/chat execution, retailer integration, inventory-lot/expiry model, OCR/barcode feature, background job, or unplanned planner-semantic change.

## Environment separation and secrets

Use separate Supabase/Vercel projects for development, test/staging, and production. Never reuse production credentials for local verification.

Public configuration names are:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-only runtime configuration additionally uses `SUPABASE_SECRET_KEY` where catalog administration or planner persistence requires it. Never expose a secret/service-role/private key through `VITE_*`, logs, source control, screenshots, issue text, or client responses.

Run `npm run env:check`, `npm run secrets:check`, and `npm run security:dependencies` before release. The dependency gate fails on moderate-or-higher advisories. Do not use `npm audit fix --force` to silence a gate; make a reviewed, lockfile-pinned change and rerun the full verifier.

## Exact-head verification

From the exact candidate SHA:

```powershell
npm ci
npx playwright install chromium
npm run verify:release:web
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

The final GitHub Actions run for the exact candidate SHA must have both `web` and `database` jobs successful. A run for an ancestor SHA is not release evidence.

## Catalog-readiness report

The launch gate uses the same normalization and eligibility domain as production planning. Launch-ready representative scenarios require at least 21 eligible curated meal options and sufficient primary-protein-group capacity; vegetarian scenarios use the explicitly narrower vegetarian protein-capacity rule. Coverage failures such as incomplete lineage or unusable price evidence fail closed. The intentionally infeasible time/catalog scenario must report its precise deterministic blocker rather than being counted as launch-ready.

Do not lower thresholds or weaken hard rules to make a release pass. Expand curated immutable catalog data only when evidence demonstrates genuine insufficiency.

## Health and post-deploy smoke

After an approved deployment, issue an unauthenticated `GET /api/health`. Expected response is HTTP 200 with exactly:

```json
{ "status": "ok" }
```

The endpoint is a process/configuration smoke only; it does not expose database records or secrets. A non-GET request must not be used as a health probe.

Then manually verify sign-in/onboarding, `/household`, `/plan`, `/pantry`, and an owned `/shopping/:planId` flow against the intended environment without modifying unrelated production records.

## Correlation-ID troubleshooting

Planner generate/preview/apply accepts a safe `x-correlation-id` request header or creates a UUID and returns it in the same response header. Use that ID to correlate a client-visible failure with the server event.

Operational planner logs contain only:

- `event=planner_request`
- `operation` (`generate`, `preview`, or `apply`)
- `correlationId`
- rounded `durationMs`
- `httpStatus`
- `outcomeCode`

Do not add household payloads, access tokens, food free text, secret keys, or full request/response bodies to operational telemetry.

## Performance

`npm run test:performance:planner` is the repeatable CI regression gate and remains separate from coverage instrumentation. Before production launch and after material infrastructure changes, collect production-like planner latency samples using representative launch catalog size and household scenarios. Record sample count and p50/p95/max with the release evidence. Investigate any material regression before promotion; do not relax planner frontier limits or correctness semantics solely to improve a timing number.

## Accessibility and responsive smoke

Automated Playwright covers protected deep links, skip-link focus, primary keyboard focus, and no document-level horizontal overflow at 320 px. Before promotion, also perform a manual keyboard and screen-reader smoke at 320 px-equivalent width:

1. Tab from the address/page start and confirm the skip link is visible and moves focus to main content.
2. Traverse primary actions on household, plan, pantry, and shopping pages without a pointer.
3. Confirm headings, labels, validation/recovery messages, and button/link names are announced meaningfully.
4. Confirm zoom/narrow width does not hide required controls or create horizontal document scrolling.

## Schema changes, backup, rollback, retention, and deletion

Production schema changes are migration-only. Do not run ad-hoc DDL in production. Review the exact migration history and backup/restore readiness before applying an approved migration outside this repository's verification commands.

The production operator owns backup cadence, restore drills, retention policy, and account-deletion handling. This repository does not claim an automated production backup, retention scheduler, or end-user account-deletion workflow. Before launch, the operator must document who receives deletion requests, how identity/ownership is verified, which owned household/planner/pantry/shopping records are removed or retained under the applicable policy, and how deletion completion is recorded without retaining secrets in tickets.

For an application regression, prefer promotion/rollback to a previously verified immutable application deployment. For an already-applied database migration, use an explicitly reviewed forward-fix migration rather than destructive ad-hoc rollback unless a tested recovery plan requires otherwise.

## Security headers and browser boundary

Production responses are expected to preserve the repository's same-origin hardening: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and the restrictive `Permissions-Policy`. API handlers also apply their server security headers. Do not weaken these controls to work around embedding or cross-origin integration without a separate security review.

## Release evidence record

Keep one release record containing:

- exact Git commit SHA;
- exact GitHub Actions run URL and successful `web`/`database` jobs;
- dependency and secret-scan result;
- generated database-type drift result;
- catalog-readiness result;
- planner performance result plus production-like p95 sample when applicable;
- 320 px keyboard/screen-reader manual smoke result;
- post-deploy `/api/health` result;
- migration/backup owner and rollback decision.

If any mandatory item is missing or failed, record `PHASE_6_BLOCKED`; do not promote the candidate as Phase 6 complete.
