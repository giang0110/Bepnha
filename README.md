# BepNha

BepNha is a deterministic meal-planning application for Vietnamese households. Phase 7 adds an optional, stateless Gemini assistant inside the ready weekly-plan experience while keeping the deterministic planner, pricing, nutrition, pantry, shopping, hard-rule, and persistence paths authoritative. The assistant can explain the current authoritative plan or propose a day worth previewing for variety; it never selects a replacement meal, computes authoritative values, writes database state, or applies a change automatically.

An AI model must never author or override serving quantities, nutrition, prices, shopping quantities, allergy safety, meal eligibility, or authoritative budgets. Every assistant replacement proposal enters the existing deterministic preview flow and still requires the user's explicit `Áp dụng bữa thay thế` confirmation before persistence.

The production runbook is `docs/operations/production-readiness.md`. Phase 7 Gemini configuration is optional and server-only; if it is absent or the provider is unavailable, the deterministic planner, replacement, pantry, and shopping flows remain usable.

## Prerequisites

- Node 24 (`>=24 <25`) and npm are mandatory.
- The committed Supabase CLI is installed by `npm ci`.
- A Docker-compatible runtime is optional for local database verification, but the database/RLS gate is mandatory. If Docker is unavailable locally, the exact-final-HEAD GitHub Actions `database` job must pass.

No command in this repository links, provisions, deploys, or migrates a remote Supabase/Vercel project. Production migrations and production data changes require separate explicit approval.

## Install and run

Install from the committed lockfile:

```powershell
npm ci
npm run preflight
```

The browser and public server verifier use only four public configuration variables:

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for server verification;
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser.

Never place a service-role, secret, or private key in a `VITE_*` variable. `.env.example` contains placeholders only.

Catalog administration and planner persistence additionally require `SUPABASE_SECRET_KEY` in the server Function runtime. The value is never committed, exposed through `VITE_*`, accepted from a request, or created by repository scripts. Admin endpoints first verify the caller and role with public Auth before creating the narrowly granted client. Planner endpoints load the owned household/catalog through the caller's access token and RLS before lazily creating a secret client only for the restricted persistence RPC. Shopping-list reads use the signed-in user's owner scope; browser code can mutate only the separate checked state through the narrow check-state RPC.

The optional Phase 7 assistant uses `GEMINI_API_KEY` and `GEMINI_MODEL` only in the server Function runtime. Never define `VITE_GEMINI_API_KEY`, `VITE_GEMINI_MODEL`, or another browser-visible Gemini credential. Do not commit a Gemini key or model assignment to repository files. The tracked-secret scanner rejects committed Gemini key assignments. If either server variable is absent, `/api/assistant` fails closed as disabled while deterministic application features continue to work.

With local Docker available, start and reset the ephemeral local stack, then launch Vite with values read directly from `supabase status -o env`:

```powershell
npm run supabase:start
npm run supabase:reset
node scripts/local-supabase-env.mjs -- npm run dev
```

The wrapper fails closed unless the Supabase API URL is loopback-only, passes only the public variables to its child command, and does not print the public key. Stop the local stack without retaining test data:

```powershell
npm run supabase:stop
```

## Routes and household semantics

| Route                              | Purpose                                                              |
| ---------------------------------- | -------------------------------------------------------------------- |
| `/sign-up`, `/sign-in`             | Supabase email/password Auth without household-member accounts       |
| `/onboarding`                      | Five-step mobile household setup                                     |
| `/household`                       | Authoritative saved household summary                                |
| `/settings/household`              | Version-checked editing of the single owned household                |
| `/pantry`                          | Owner-scoped current pantry amounts used by future plan revisions    |
| `/plan`                            | Seven primary meals, exact weekly estimate, one-day replacement, and optional advisory assistant |
| `/shopping/:planId`                | Current authoritative shopping list for an owned plan                |
| `/shopping/:planId?revisionId=...` | Exact historical revision read when Phase 4 shopping evidence exists |

Children are counts in approved age bands, never user accounts. The application does not collect names, birth dates, sex, weight, diagnoses, health fields, or free-text dietary rules.

Allergies and exclusions are canonical hard rules. Preferences are canonical soft rules. A hard rule and preference with the same target cannot coexist. `allergen_other` is structured unsupported intent with fixed guidance; no AI or free text interprets it, and the UI never promises allergy safety.

The weekly budget applies only to the seven planned primary meals. It does not cover breakfast, snacks, drinks, pantry replenishment, or other meals.

## Catalog, planner, and shopping semantics

- Published food facts, their nutrients, allergen assessments, conversions, and dietary/category lineage are immutable. Published recipe versions pin both stable `food_id` and exact `food_fact_version_id` for every consumed ingredient.
- Recipe instructions are bounded Vietnamese editorial text. They never create ingredients and are never interpreted by AI, NLP, or keyword matching for allergens, eligibility, nutrition, quantity, conversion, cost, or shopping consolidation.
- Unknown or incomplete allergen, nutrient, conversion, or price lineage fails closed. Explicit nutrient zero is valid data; missing data is not replaced with zero.
- Prices aged 0–30 days are current. Prices aged 31–90 days remain usable with `STALE_PRICE` and their observation date is shown to the user. Older, missing, or future prices fail rather than producing a partial or zero-valued list.
- Weekly budget selection and Phase 4 shopping use the same deterministic purchase-basket evidence. Requirements are aggregated by stable food identity before exact package/increment rounding; `calculatePurchaseBasket` remains the sole package-rounded cost algorithm.
- A region's current price-book pointer controls discovery only. Published historical books and exact revision evidence remain immutable and readable by exact identity after retirement.

The planner selects exactly seven curated primary cooked family meals, one for each Monday-start day. Eligibility is resolved before scoring. Search is deterministic but intentionally bounded; failure copy never claims global infeasibility.

Budget is not part of quality scoring. If any discovered complete plan is within budget, over-budget finalists are discarded. Otherwise the minimum exact basket cost wins first and quality only breaks equal-cost ties. An over-budget result is still a successful plan and reports exact estimate, budget, and overage.

Replacement locks six exact day/version tuples, recomputes the complete weekly basket, and creates a new immutable seven-item revision. Every new Phase 4 generation, regeneration, and replacement uses the shared `planner-engine-v2` production constant. Historical Phase 3 `planner-engine-v1` revisions are never rewritten.

### Shopping-list authority

A shopping list belongs to one exact `meal_plan_revision_id`, not to mutable current catalog state. The immutable calculation snapshot contains the label-free shopping projection and exact provenance. Relational shopping rows are persisted in the same authoritative transaction as the revision and plan items.

For a ready Phase 4 revision, the application exposes:

- one consolidated line per compatible stable food identity;
- canonical required, package, purchase, and leftover quantities;
- exact price/book/fact lineage and estimated line cost;
- deterministic grocery category grouping;
- exact meal/recipe/ingredient/fact sources behind each line;
- stale-price warnings with observation dates;
- a separate mutable `checked` state that is not part of the immutable calculation fingerprint.

Checking an item never changes quantity, package count, price, provenance, budget, fingerprint, or pantry state. Check state is carried into a replacement revision only when the stable food, canonical base unit, and canonical required amount remain byte-equivalent under the shopping rules.

### Pantry authority

Pantry stores one current owner-scoped quantity per `(household_id, food_id)`. Each generation or replacement copies the exact normalized pantry snapshot into immutable plan evidence. Shopping deduction is deterministic and happens before package rounding: `gross required = pantry deducted + purchase required`; only the remaining purchase requirement is rounded to purchasable packages. A fully covered line can therefore require zero packages and zero purchase cost.

Current pantry edits affect only future calculations. They never rewrite an existing plan revision or its shopping list. Shopping rows persist both `pantryDeductedBaseQuantity` and `purchaseRequiredBaseQuantity`, so every deduction remains traceable after the current pantry changes. Checking a shopping item does not decrement pantry automatically. Phase 5 intentionally has no inventory lots, expiry dates, barcode/OCR, retailer ordering, receipt ingestion, or background inventory jobs.

A one-meal replacement creates a complete new revision/list and never mutates the prior revision/list. An explicit historical Phase 4 revision therefore remains reproducible even after the current plan advances.

Historical Phase 3 revisions created before the shopping projection existed are not reconstructed from current catalog data. Reading one returns the typed `SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION` state; the UI explains that a new authoritative plan/revision is required instead of fabricating historical shopping evidence.

The authoritative total invariant is:

```text
meal_plans.total_estimated_cost_vnd
== current meal_plan_revisions.total_estimated_cost_vnd
== calculation_snapshot.purchaseBasket.totalEstimatedCostVnd
== calculation_snapshot.shoppingList.totalEstimatedCostVnd
== persisted shopping_list total
== sum(persisted shopping_list lines)
```

Mutable food/recipe/meal-option display labels are presentation data only. They are excluded from canonical planner/shopping snapshots and calculation fingerprints.

### Phase 7 assistant authority

The assistant is an advisory boundary, not a planner extension. The browser sends only `planId`, `expectedRevisionId`, a bounded question, and the caller's Bearer token to the same-origin assistant endpoint. The server verifies ownership and the current revision, projects authoritative plan state into a minimal evidence DTO, and only then calls Gemini.

Every provider interaction is single-turn with `store: false`. The provider receives no Supabase token, user/household/plan/revision identifier, raw planner snapshot, pantry rows, unpublished catalog, candidate search space, service-role data, mutation RPC, tool definition, grounding, web search, background execution, or previous interaction state. Provider output is strictly parsed into `explanation`, `replacement_proposal`, or `unsupported`; invalid output fails closed.

A `replacement_proposal` contains only a day index and qualitative reason. It can trigger the existing deterministic preview path but never chooses a meal or calls apply. The user must explicitly confirm the deterministic preview before any new revision is persisted.

## Module boundaries

Cross-boundary imports use the `@/...` alias. Relative imports are limited to files within the same boundary.

| From             | May depend on                                       | Must not depend on                                                                                               |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `domain`         | Other `domain` modules and pure utilities           | React, `app`, `features`, `application`, `infrastructure`, Supabase, Vercel, browser APIs, environment variables |
| `application`    | `domain` and application-owned ports                | React, `app`, `features`, concrete `infrastructure` adapters                                                     |
| `infrastructure` | `application`, `domain`, platform SDKs              | `app`, `features`, product UI                                                                                    |
| `features`       | `application`, `domain`, approved app UI primitives | Concrete `infrastructure`; feature-to-feature internals                                                          |
| `app`            | Browser-side modules needed for composition         | Server-only `api` modules and `infrastructure/server`                                                            |
| `api`            | `application`, `domain`, server infrastructure      | React, browser-only `app` or `features` modules                                                                  |

Domain validation is framework-independent. PostgreSQL constraints, constraint triggers, grants, and RLS remain authoritative. The browser uses no service-role access and has no authoritative shopping arithmetic/provenance DML.

## Verification

Phase 7 release verification is fail-closed. Install from the committed lockfile and install Chromium once before the browser gates:

```powershell
npm ci
npx playwright install chromium
npm run verify:release:web
git diff --check
```

`verify:release:web` composes environment validation, secret scanning, dependency audit at moderate severity or above, Prettier, ESLint, TypeScript, coverage, production build, the dedicated planner performance gate, and the lightweight SPA/deep-link smoke.

`npm run preflight` records exactly one capability result:

- `LOCAL_DB_VERIFICATION_AVAILABLE` — run the local database release sequence below;
- `LOCAL_DB_VERIFICATION_UNAVAILABLE` — continue non-database work and require exact-final-HEAD GitHub Actions `database` success.

When Docker is available, start the local stack once and always stop it without backup:

```powershell
npm run supabase:start
try {
  npm run verify:release:db
} finally {
  npm run supabase:stop
}
```

`verify:release:db` performs a local-only reset, fatal SQL lint, pgTAP, generated-type drift, Auth/household/catalog/admin/planner/assistant/shopping/pantry integrations, then performs a second clean reset before the catalog-readiness fixture so earlier integration fixtures cannot contaminate the release decision. It then runs onboarding, planner, assistant, shopping, pantry, and 320 px accessibility Playwright suites. CI uses a fake assistant provider and never calls the real Gemini API.

`supabase:reset` is explicitly local-only. Never substitute a remote production or staging database. `src/infrastructure/supabase/database.types.ts` is generated from the clean local migration state; `db:types:check` rejects drift.

The ordinary `test:e2e` command proves Vite-preview SPA/deep-link behavior only. Docker-backed integration remains authoritative for local Auth, RPC, RLS, catalog, planner persistence, assistant owner isolation/no-write evidence, shopping persistence, revision history, and catalog-readiness evidence.

## GitHub Actions evidence

CI keeps independent `web` and `database` jobs. The web job runs the full non-database verifier, the dedicated planner performance gate, and lightweight browser smoke. The database job uses GitHub-hosted Docker for a clean Supabase migration/reset, fatal SQL lint, pgTAP/RLS/integrity tests, generated-type drift, Auth/household/catalog/admin/planner/assistant/shopping/pantry integration, an isolated catalog-readiness reset/report, and all focused browser journeys. Assistant integration/E2E use an injected/fake provider; CI defines no Gemini secret and makes no external Gemini request.

Release evidence must match the exact final Phase 7 feature SHA and, after approved integration, the exact resulting `main` SHA. An ancestor run is supporting evidence only.

Record `PHASE_7_PASS` only when the exact final feature HEAD has clean `web` and `database` jobs, the Phase 7 scope/security exit audit is clean, and exact-main CI succeeds after integration. Otherwise record `PHASE_7_BLOCKED` with the exact failed or pending gate.

## Intentionally deferred

Phase 7 does **not** add AI-generated meal plans, AI-selected replacement meals, AI-authored prices/quantities/portions/nutrition/budget status, medical or therapeutic nutrition advice, Gemini tools/function calling/grounding/web search, persistent chat history, vector search/RAG, background agents, retailer/live-price comparison, pantry lots or expiry tracking, automatic pantry consumption, custom/manual grocery items, marketplace flows, delivery, payment, receipts, barcode/OCR, notifications, collaboration/offline sync, or background inventory jobs.
