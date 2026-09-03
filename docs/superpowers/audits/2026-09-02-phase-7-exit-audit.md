# Phase 7 Exit Audit — Gemini Assistant

Date: 2026-09-03
Branch: `codex/phase-7-task7-ops-audit`
Pre-Phase-7 base: `main` at `9a663668a60eca405c22d978def95a8977341daf`
Task-7 branch base: merged Phase-7 `main` at `6be919caf8ff016bd010ca5da35e03837ecdc058`

## Status

`PHASE_7_BLOCKED` until the exact final Task-7 feature HEAD containing this audit record passes the required exact-head release/CI gates and the resulting exact `main` SHA passes both GitHub Actions `web` and `database` jobs. Existing successful ancestor/merged-product runs are supporting evidence only.

## Topology and scope audit

The Task-7 branch is currently ahead of merged Phase-7 `main` and zero commits behind; its changes are limited to the Gemini secret scanner/tests, README, production runbook, design-spec approval, and this exit audit.

The full Phase-7 delta from pre-Phase-7 `9a663668a60eca405c22d978def95a8977341daf` to this branch is ahead-only and contains the approved assistant application/provider/API/UI/test/CI scope plus the Task-7 operations work. The changed-file set contains no `supabase/migrations/*` file.

No deterministic planner/search/price/portion/allergy domain authority file is changed by Phase 7. The only planner feature changes are UI composition/reset behavior that embeds the advisory card and sends a proposal into the pre-existing deterministic preview path. Package-rounded cost, household hard rules, nutrition, pantry deduction, shopping quantity/provenance, planner eligibility/search, and revision persistence remain outside Gemini authority.

## Assistant trust-boundary audit

`src/infrastructure/server/assistant-runtime.ts` accepts only public Supabase configuration plus optional `GEMINI_API_KEY`/`GEMINI_MODEL`. It creates the assistant context with the caller Bearer token and the publishable Supabase client. It has no `SUPABASE_SECRET_KEY`, service-role factory, planner persistence repository, mutation port, or write RPC dependency.

The context adapter is read-only and owner-scoped. The integration suite proves owner success, cross-owner denial, stale-revision rejection before provider invocation, safe provider failure, invalid/missing auth, minimal provider evidence, and no changes to plan revision/version/current revision, pantry, or shopping state.

`src/infrastructure/server/gemini-meal-assistant.ts` exposes a request type with `store: false` and only model/input/system-instruction/structured response format. No tools, function declarations, grounding/search, URL/file context, code execution, background execution, or previous-interaction state are available. Provider output is parsed and independently validated into only `explanation`, `replacement_proposal`, or `unsupported`; malformed/timeout/provider failures fail closed.

The provider evidence is a minimal verified DTO. It excludes Supabase tokens, user/household/plan/revision IDs, idempotency keys, raw planner snapshots, pantry rows, service-role data, unpublished catalog data, and the full candidate search space.

## Browser and mutation audit

Browser code has no Gemini SDK or Gemini credential. It calls only same-origin `/api/assistant` with the authenticated access token and bounded request contract.

A `replacement_proposal` contains only `targetDayIndex` plus a qualitative reason. The proposal action calls the existing deterministic replacement preview. It cannot choose the replacement meal and cannot call apply automatically. Persisting a new revision still requires the existing explicit `Áp dụng bữa thay thế` user action. The assistant card remounts on revision identity so advice from an old revision is removed after apply.

The mobile assistant Playwright gate proves explanation, proposal-to-preview-only behavior, explicit apply gating, revision-reset behavior, and deterministic planner availability when the assistant is unavailable. CI intercepts/fakes `/api/assistant`; it never calls the real Gemini API.

## Secrets, privacy, and operations audit

The tracked-secret scanner now treats a non-empty committed `GEMINI_API_KEY` or `VITE_GEMINI_API_KEY` assignment as `sensitive-environment-assignment` while allowing variable-name prose and empty assignments. Existing Supabase, VITE secret/private/service-role, GitHub token, OpenAI-style token, AWS access-key, and PEM rules remain intact.

Production operations document Gemini as optional server-only configuration. The runbook requires an authorization key appropriate for the September 2026 Gemini key migration, key rotation/revocation ownership, Gemini project data/logging review, `store:false` for every Interaction, no prompt/response telemetry, no provider tools/state, disabled fallback, and an assistant post-deploy smoke that is separate from deterministic planner smoke.

## Supporting CI evidence already established

Phase-7 product HEAD `a86544189586e105bee53cc5ef3afae3ab323d6e` passed PR CI run `33747741248`: both `web` and `database` succeeded, including planner/assistant/shopping/pantry/accessibility E2E and all database/integration gates.

After PR #2 merged, exact-main merge SHA `6be919caf8ff016bd010ca5da35e03837ecdc058` passed main CI run `33749082739` with conclusion `success`.

Those runs establish the merged product behavior but do not satisfy the final Task-7 exact-head requirement because the scanner/docs/audit candidate is newer.

## Remaining gate

Before `PHASE_7_PASS` may be recorded:

1. run/observe `npm run verify:release:web`, `npm run secrets:check`, `npm run security:dependencies`, and formatting/diff checks for the exact final Task-7 candidate;
2. require exact-feature CI evidence with both `web` and `database` successful and the branch still zero commits behind `main`;
3. integrate to `main` only with explicit authorization and without force/history rewrite;
4. require exact-main CI success for the resulting SHA.

Until all four are complete, keep Phase 7 open as `PHASE_7_BLOCKED`.
