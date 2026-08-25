# Phase 1 Household and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the authenticated, one-household-per-user foundation and a mobile-first onboarding/settings flow that persists only validated household planning inputs under least-privilege Supabase RLS.

**Architecture:** Extend the approved Phase 0 modular monolith. Pure household contracts and validation live in `src/domain/household`; use cases and ports in `src/application/household`; Supabase adapters in `src/infrastructure/supabase`; auth/routing composition in `src/app`; and household presentation in one `src/features/household` slice. The browser uses a publishable key and user JWT under RLS. A minimal Vercel Function verifies bearer tokens without a service credential. PostgreSQL remains authoritative for ownership and stored invariants.

**Tech Stack:** Approved Phase 0 Node.js 24, React, Vite, strict TypeScript, Tailwind CSS, shadcn/ui, Vitest, React Testing Library, Playwright, Supabase Auth/PostgreSQL/pgTAP, Vercel Functions, and GitHub Actions; add only `@supabase/supabase-js`, React Router, and Zod.

**Spec:** `docs/superpowers/specs/2026-08-25-bep-nha-design.md`

## Global Constraints

- Work only on `codex/phase-1-household`. Do not merge `main`, deploy, link a remote Supabase/Vercel project, run production migrations, or start Phase 2.
- This document plans future work only. It does not authorize source code, dependencies, migrations, accounts, or infrastructure changes now.
- Before implementation, the approved Phase 0 foundation must be in the execution branch. At plan-writing time this branch comes from `origin/main`, which does not contain the Phase 0 scaffold. If it is still absent, report `PHASE_1_BLOCKED_FOUNDATION_NOT_INTEGRATED`; do not silently recreate, merge, or cherry-pick it.
- Node 24 is mandatory. Docker is capability detection locally. Database/RLS verification is mandatory locally when available, otherwise in exact-final-HEAD GitHub Actions. Never substitute a remote Supabase database.
- Collect no names, child/member accounts, birth dates, sex, weight, diagnoses, health conditions, or free-text dietary notes. Account email/password belongs only to Supabase Auth.
- Allergies/exclusions are structured hard rules. Preferences are structurally separate soft rules. No AI or free-text interpretation is permitted.
- Budget is integer VND for exactly seven planned primary meals. Phase 1 stores it but performs no cost calculation.
- Store member groups only. Do not calculate adult equivalents or add `PortionConfigV1`; those belong to later deterministic engines.
- No foods, recipes, catalog lineage, nutrition, prices, planner, shopping list, pantry, admin, or AI behavior enters this phase.

---

## 1. Baseline and Fixed Decisions

### 1.1 Repository precondition

At plan-writing time:

- `origin/main` and this branch point at `e6ec6cb4237f3d8fd35418ef2a38f6d41785eed9`;
- the approved Phase 0 foundation is on `origin/codex/phase-0-foundation`, ending at `b5d68ed248ab215b55bb76949dd0d77c8b08d688`;
- Phase 0 supplies Node 24/Vite/React, strict boundaries, Supabase CLI/pgTAP, Vercel health/routing tests, Playwright, and two-job CI;
- local generated directories are unrelated untracked artifacts and must not be staged.

Implementation checks ancestry rather than filenames:

```powershell
$phase0Head = "b5d68ed248ab215b55bb76949dd0d77c8b08d688"
git merge-base --is-ancestor $phase0Head HEAD
if ($LASTEXITCODE -ne 0) { throw "PHASE_1_BLOCKED_FOUNDATION_NOT_INTEGRATED" }
```

If reviewed integration later uses different ancestry, verify the complete Phase 0 file/gate contract and record the actual integrated commit. This plan does not authorize that integration.

### 1.2 Authentication and session boundary

- Support email/password sign-up, sign-in, sign-out, and session restoration. Defer OAuth, anonymous auth, MFA, social linking, password recovery, and account administration.
- Local Supabase disables email confirmation only for deterministic local/CI smoke tests. UI handles both hosted `signUp` outcomes: immediate session or confirmation pending. Do not alter hosted Auth settings.
- Browser creates one `SupabaseClient<Database>` using `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; session persistence, refresh, and URL detection are explicit and tested.
- Browser may use `getSession()` for UI restoration and `onAuthStateChange()` for changes, but local session state is not server authorization.
- RLS derives ownership from `(select auth.uid())`; no body/query user ID is authoritative.
- `GET /api/me` proves server integration. It parses `Authorization: Bearer`, verifies with `supabase.auth.getUser(accessToken)`, and returns only `{ userId }`. It uses `SUPABASE_URL` and public `SUPABASE_PUBLISHABLE_KEY`; no service/secret key.
- Missing/forged/expired tokens return `401 { error: "UNAUTHORIZED" }`; unsupported methods return 405 with `Allow: GET`; infrastructure failures are sanitized and never echo tokens or Supabase internals.

### 1.3 Domain contracts and validation

`src/domain/household/household.ts` owns these contracts:

```typescript
export const CHILD_AGE_BANDS = ["1_3", "4_6", "7_9", "10_12", "13_17"] as const
export type ChildAgeBand = (typeof CHILD_AGE_BANDS)[number]

export type HouseholdMemberGroup =
  | { memberKind: "adult"; ageBand: "adult"; memberCount: number }
  | { memberKind: "child"; ageBand: ChildAgeBand; memberCount: number }
  | { memberKind: "elderly"; ageBand: "elderly"; memberCount: number }

export type HouseholdRuleKind =
  | "allergen_exclusion"
  | "food_exclusion"
  | "soft_preference"

export interface HouseholdSetupInput {
  memberGroups: readonly HouseholdMemberGroup[]
  weeklyPlanBudgetVnd: number
  maxElapsedMinutes: number
  ruleCodes: readonly string[]
}

export interface HouseholdSetup extends HouseholdSetupInput {
  householdId: string
  version: number
  onboardingCompletedAt: string
}
```

Validation and normalization rules:

| Field | Authoritative rule |
|---|---|
| Supported members | 1–20 total. Stored rows have integer count 1–20; zero exists only in UI drafts and is omitted. |
| Bands | Adult=`adult`; child=`1_3`,`4_6`,`7_9`,`10_12`,`13_17`; elderly=`elderly`. Under one is unsupported and no field is stored. |
| Order | Adult, child bands ascending, elderly. Duplicate non-zero groups fail. |
| Budget | Safe integer `1..100_000_000` VND; UI step 10,000 and always says “7 bữa chính”. The upper bound is an abuse/overflow cap, not advice. |
| Time | Integer 10–180 elapsed minutes; UI offers 15, 30, 45, 60, 90, 120; default 30. |
| Rules | Every code exists in the migration-owned option table; sort/deduplicate canonically. |
| Conflict | Hard exclusion plus soft preference with the same `target_key` cannot be saved. |
| Concurrency | First save uses `expectedVersion=null`; edit requires current positive version; mismatch maps to `STALE_HOUSEHOLD_VERSION`. |

The domain returns tagged results, not thrown UI strings. No coefficient, serving, safety, cost, or nutrition calculation exists.

### 1.4 Canonical household rule vocabulary

`household_rule_options` is a migration-owned input vocabulary, not the Phase 2 catalog. Clients select it but never mutate it. Rows have stable `code`, `target_key`, hard/soft `rule_kind`, Vietnamese label, and order.

Seed exactly:

| Kind | Codes |
|---|---|
| `allergen_exclusion` | `allergen_peanut`, `allergen_tree_nut`, `allergen_milk`, `allergen_egg`, `allergen_soy`, `allergen_wheat`, `allergen_fish`, `allergen_crustacean`, `allergen_mollusc`, `allergen_sesame`, `allergen_other` |
| `food_exclusion` | `exclude_pork`, `exclude_beef`, `exclude_poultry`, `exclude_seafood`, `exclude_egg`, `exclude_dairy`, `diet_vegetarian` |
| `soft_preference` | `prefer_pork`, `prefer_beef`, `prefer_poultry`, `prefer_fish`, `prefer_seafood`, `prefer_tofu`, `prefer_vegetable_forward`, `prefer_soup` |

The migration/domain fixture uses these exact `(code, target_key, label_vi)` values:

- allergens: `allergen_peanut/peanut/Dị ứng đậu phộng`, `allergen_tree_nut/tree_nut/Dị ứng các loại hạt cây`, `allergen_milk/dairy/Dị ứng sữa`, `allergen_egg/egg/Dị ứng trứng`, `allergen_soy/soy/Dị ứng đậu nành`, `allergen_wheat/wheat/Dị ứng lúa mì`, `allergen_fish/fish/Dị ứng cá`, `allergen_crustacean/crustacean/Dị ứng giáp xác (tôm, cua)`, `allergen_mollusc/mollusc/Dị ứng nhuyễn thể`, `allergen_sesame/sesame/Dị ứng mè (vừng)`, `allergen_other/unsupported_allergen/Dị ứng khác chưa có trong danh sách`;
- hard food/diet choices: `exclude_pork/pork/Không dùng thịt heo`, `exclude_beef/beef/Không dùng thịt bò`, `exclude_poultry/poultry/Không dùng thịt gia cầm`, `exclude_seafood/seafood/Không dùng hải sản`, `exclude_egg/egg/Không dùng trứng`, `exclude_dairy/dairy/Không dùng sữa`, `diet_vegetarian/vegetarian/Ăn chay`;
- soft choices: `prefer_pork/pork/Ưu tiên thịt heo`, `prefer_beef/beef/Ưu tiên thịt bò`, `prefer_poultry/poultry/Ưu tiên thịt gia cầm`, `prefer_fish/fish/Ưu tiên cá`, `prefer_seafood/seafood/Ưu tiên hải sản`, `prefer_tofu/tofu/Ưu tiên đậu hũ`, `prefer_vegetable_forward/vegetable_forward/Ưu tiên nhiều rau`, `prefer_soup/soup/Ưu tiên món canh`.

Paired hard/soft choices share targets such as `pork`, `beef`, `poultry`, `fish`, `seafood`, or `egg`. `allergen_other` stores no note: later planning must treat it as unsupported/unknown until mapped, never as safe. Phase 2 must map every hard option to immutable catalog lineage before planning; this phase creates no mapping.

### 1.5 Database schema and constraints

Create one future migration: `supabase/migrations/20260825010000_phase_1_household.sql`.

`public.profiles`:

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `locale text not null default 'vi-VN' check (locale='vi-VN')`
- non-null `created_at`, `updated_at` timestamptz
- no display name or role

A private `auth.users` trigger creates the profile. Its `security definer` function lives in `private`, uses `search_path=''`, fully qualifies objects, and revokes execute from `public`, `anon`, and `authenticated`.

`public.households`:

- UUID primary key; unique non-null `owner_user_id` FK to `auth.users` with cascade
- fixed `timezone='Asia/Ho_Chi_Minh'` and `currency_code='VND'`
- `weekly_plan_budget_vnd bigint` 1–100,000,000
- `max_elapsed_minutes smallint` 10–180
- nullable `onboarding_completed_at`; positive `version` default 1; timestamps
- trigger forbids owner changes, maintains timestamp, increments version
- no name and no `price_region_id` in Phase 1

`public.household_member_groups`:

- UUID primary key and cascading `household_id`
- enum kind `adult|child|elderly`
- enum band `adult|1_3|4_6|7_9|10_12|13_17|elderly`
- integer count 1–20, kind/band compatibility check, timestamps
- unique `(household_id, member_kind, age_band)` and indexed ownership path
- deferred constraint trigger rejects total above 20 and a completed household with zero supported members at transaction end

`public.household_rule_options`:

- `code text primary key`, lowercase machine format
- `target_key text not null`, same format
- enum `rule_kind`; Vietnamese label length 1–80; positive `sort_order`
- unique `(rule_kind,target_key)` and `(rule_kind,sort_order)`

`public.household_food_rules`:

- cascading `household_id`, restrictive `rule_code` FK, timestamp
- primary key `(household_id,rule_code)`
- no free text or nullable catalog-polymorphic columns

Atomic browser RPC signature:

```sql
public.save_household_setup(
  p_expected_version integer,
  p_weekly_plan_budget_vnd bigint,
  p_max_elapsed_minutes smallint,
  p_member_groups jsonb,
  p_rule_codes text[]
) returns public.households
```

The function is `plpgsql security invoker set search_path=''`, revoked from `public`/`anon`, granted only to `authenticated`. It validates all fields and conflicts; derives/locks household by `auth.uid()` with no caller household/user ID; inserts only with null expected version; edits only on exact version; atomically replaces owned groups/rules; sets completion once; and returns the authoritative versioned row. Constraints/RLS remain authoritative even for legitimate direct Data API writes.

### 1.6 RLS and grants

Enable RLS on every table; revoke all from `anon` and `authenticated`, then grant only:

| Table | Authenticated grants | Separate policy shape |
|---|---|---|
| `profiles` | select, update locale | `user_id=(select auth.uid())`; update has `using` and `with check` |
| `households` | select, insert, update | owner equals UID; insert check; update both clauses |
| member groups | select/insert/update/delete | indexed `exists` owned household; write checks |
| rule options | select | authenticated-only `using(true)` |
| food rules | select/insert/delete | indexed owned-household `exists`; insert check |

Never use `for all`. Name `authenticated` in each policy. `anon` has no private/reference access. No client role mutates options and no service key is configured.

### 1.7 UX routes and onboarding

Routes:

- `/sign-in`, `/sign-up`;
- protected `/onboarding`, `/household`, `/settings/household`;
- `/` redirects by auth/household state;
- unknown non-API paths render a small not-found view while preserving the Phase 0 Vercel rewrite.

Onboarding uses five narrow-mobile steps:

1. anonymous supported-member counts/bands with infant-exclusion copy;
2. VND budget with “chỉ áp dụng cho 7 bữa chính” copy;
3. canonical allergy/food hard exclusions, never described as guaranteed safe;
4. soft preferences and maximum total elapsed cooking time;
5. review and atomic save.

Back preserves in-memory answers. Reload before final save may restart the draft; persisting unsaved household rules in storage is YAGNI. After save, summary/settings reload authoritative Supabase data. Loading, signed-out, confirmation-pending, validation, stale conflict, transient failure, and retry states are accessible.

---

## 2. Ordered Implementation Tasks

### Gate 0: Prove branch, foundation, runtime, and database capability

**TDD:** No; read-only preflight.

**Expected files:** None.

- [ ] Run:

  ```powershell
  git branch --show-current
  git status --short --branch
  git diff --check
  $phase0Head = "b5d68ed248ab215b55bb76949dd0d77c8b08d688"
  git merge-base --is-ancestor $phase0Head HEAD
  node --version
  npm --version
  npm ci
  npm run preflight
  npm run verify:non-db
  ```

- [ ] Require branch `codex/phase-1-household`, Node v24, integrated Phase 0, clean task baseline, and record `LOCAL_DB_VERIFICATION_AVAILABLE` or `LOCAL_DB_VERIFICATION_UNAVAILABLE`.
- [ ] Preserve unrelated artifacts. Missing Docker continues non-DB work; missing foundation/Node blocks.

**Safety/rollback:** No source mutation. Do not integrate Phase 0 without separate approval.

### Task 1: Add household domain contracts and validation

**TDD:** Yes.

**Expected files:** Create `src/domain/household/household.ts`, `src/domain/household/household-rules.ts`, `src/domain/household/validate-household-setup.ts`, `src/domain/household/validate-household-setup.test.ts`; modify `package.json`, `package-lock.json`.

- [ ] `npm install zod@latest`.
- [ ] Write RED tests for every band, zero omission, duplicate groups, totals 1/20/21, budget/time boundaries, unknown rules, hard/soft conflicts, canonical ordering, and repeated determinism.
- [ ] Implement only section 1.3/1.4 and run:

  ```powershell
  npx vitest run src/domain/household/validate-household-setup.test.ts
  npm run lint
  npm run typecheck
  npm run test
  git diff --check
  git status --short
  ```

- [ ] Commit exact task files with `feat: define household setup domain`.

**Safety/rollback:** No React, Supabase, coefficients, engine, or catalog imports in domain.

### Task 2: Add schema, atomic RPC, and pgTAP security tests

**TDD:** Yes; tests precede migration. Claim local RED/GREEN only if Docker is available.

**Expected files:** Modify `supabase/config.toml`; create `supabase/migrations/20260825010000_phase_1_household.sql`, `supabase/tests/database/phase_1_household_schema.test.sql`, `supabase/tests/database/phase_1_household_rls.test.sql`.

- [ ] Configure only local site/redirect URLs and local email-confirmation behavior; no hosted setting.
- [ ] Schema tests cover all tables/types/checks/FKs/seeds, profile trigger, no prohibited columns, version trigger, RPC signature/security/search path, grants, and RLS on every public table.
- [ ] RLS tests create users A/B and explicitly switch role/JWT. Cover anon denial and allowed/denied select/insert/update/delete for each table. Prove A cannot read/write B, reassign owner, create a second household, mutate options, target B through RPC, or partially persist stale/invalid input.
- [ ] When local DB exists, observe missing-schema RED before migration. Implement section 1.5/1.6, then run:

  ```powershell
  npm run supabase:reset
  npm run supabase:lint
  npm run supabase:test
  npm run verify:db
  npm run supabase:stop
  ```

- [ ] Without local DB record `DATABASE_RLS_GATE_PENDING_CI`; do not claim skip/PASS. In both paths run:

  ```powershell
  npm run format:check
  npm run lint
  npm run typecheck
  npm run test
  git diff --check
  git status --short
  ```
- [ ] Commit exact files with `feat: add owned household schema`.

**Safety/rollback:** Reset/stop loopback only. Never link/push/use remote Supabase or loosen RLS.

### Task 3: Add generated database types and browser/server Supabase boundaries

**TDD:** Yes for environment, client configuration, bearer parsing, and server behavior.

**Expected files:**

- Modify: `.env.example`, `package.json`, `package-lock.json`, `scripts/validate-env.mjs`, `scripts/validate-env.test.ts`, `tsconfig.api.json`, `vitest.config.ts`
- Create: `scripts/generate-database-types.mjs`, `scripts/generate-database-types.test.ts`
- Create: `src/infrastructure/supabase/database.types.ts`, `src/infrastructure/supabase/browser-client.ts`, `src/infrastructure/supabase/browser-client.test.ts`
- Create: `src/infrastructure/supabase/server-auth.ts`, `src/infrastructure/supabase/server-auth.test.ts`
- Create: `api/me.ts`, `api/me.test.ts`

- [ ] Install `@supabase/supabase-js@latest`.
- [ ] Add public server values to `.env.example`:

  ```dotenv
  SUPABASE_URL=http://127.0.0.1:54321
  SUPABASE_PUBLISHABLE_KEY=replace-with-local-publishable-key
  ```

  Retain both public `VITE_` values. Extend validator tests first: four required keys, HTTP(S) URLs, no printed values, and rejection of secret/service-role/private-key names.

- [ ] Add cross-platform `db:types:generate` and `db:types:check` scripts that run only `supabase gen types typescript --local --schema public`. Never generate from `--linked` or hand-edit drift away.
- [ ] With local DB, reset then generate `src/infrastructure/supabase/database.types.ts`. Without it, continue non-DB work but leave the type sub-gate pending; Task 9 CI generates an artifact, which must be inspected/committed and verified on a new exact HEAD before PASS.
- [ ] Write RED tests proving browser client uses passed public config with persistent/refresh/detect options and is dependency-injectable.
- [ ] Write RED tests for exact bearer parsing, `getUser(token)`, no body identity, 200/401/405/sanitized-503, and no token/environment leakage.
- [ ] Implement the smallest factories/handler and run:

  ```powershell
  npx vitest run scripts/validate-env.test.ts src/infrastructure/supabase/browser-client.test.ts src/infrastructure/supabase/server-auth.test.ts api/me.test.ts
  npm run env:check
  npm run secrets:check
  npm run lint
  npm run typecheck
  npm run test
  npm run build
  git diff --check
  git status --short
  ```

- [ ] Commit exact task files with `feat: add Supabase auth boundaries`.

**Safety/rollback:** No secret/service key is needed. Publishable keys are public configuration but not hard-coded in runtime source.

### Task 4: Add application ports, use cases, and repository adapter

**TDD:** Yes; fakes before adapters.

**Expected files:**

- Create: `src/application/auth/auth-session-port.ts`
- Create: `src/application/household/household-repository.ts`
- Create: `src/application/household/load-household.ts`, `src/application/household/load-household.test.ts`
- Create: `src/application/household/save-household.ts`, `src/application/household/save-household.test.ts`
- Create: `src/infrastructure/supabase/supabase-auth-session.ts`
- Create: `src/infrastructure/supabase/supabase-household-repository.ts`, `src/infrastructure/supabase/supabase-household-repository.test.ts`

- [ ] Define `HouseholdRepository.loadOwn(): Promise<HouseholdSetup | null>` and `saveOwn(input, expectedVersion): Promise<SaveHouseholdResult>`. No operation accepts authoritative user/owner/household IDs.
- [ ] RED-test validation before I/O, normalized canonical input, first save/edit, stale version, unauthorized/session expiry, and retryable dependency failures.
- [ ] Implement tagged use-case results; raw PostgREST/Supabase error strings never reach UI.
- [ ] RED-test adapter column selection, canonical-option join, RPC args, safe VND mapping, null/error handling, and typed error translation. Implement using generated types.
- [ ] Verify:

  ```powershell
  npx vitest run src/application/household src/infrastructure/supabase/supabase-household-repository.test.ts
  npm run lint
  npm run typecheck
  npm run test
  npm run build
  git diff --check
  git status --short
  ```

- [ ] Commit exact files with `feat: add household application boundary`.

**Safety/rollback:** Features never import infrastructure directly. Do not add generic repository/global-state/query frameworks.

### Task 5: Add routing and authenticated app shell

**TDD:** Yes.

**Expected files:**

- Modify: `package.json`, `package-lock.json`, `src/main.tsx`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/README.md`
- Create: `src/app/router.tsx`, `src/app/auth/auth-provider.tsx`, `src/app/auth/require-auth.tsx`, `src/app/not-found-page.tsx`
- Create: `src/features/auth/sign-in-page.tsx`, `src/features/auth/sign-in-page.test.tsx`
- Create: `src/features/auth/sign-up-page.tsx`, `src/features/auth/sign-up-page.test.tsx`, `src/features/auth/sign-out-button.tsx`

- [ ] Install current stable `react-router` only.
- [ ] Write RED component tests for auth loading, signed-out redirect, sign-in success/failure, sign-up immediate/confirmation-pending outcomes, sign-out, redirect preservation, and subscription cleanup.
- [ ] Implement the smallest shell and inject application ports from app composition. Forms have correct email/password autocomplete, busy/disabled states, accessible errors, generic auth failures, and no name questions.
- [ ] Verify:

  ```powershell
  npx vitest run src/app src/features/auth
  npm run lint
  npm run typecheck
  npm run test
  npm run build
  npm run test:e2e
  git diff --check
  git status --short
  ```

- [ ] Commit exact files with `feat: add authenticated app shell`.

**Safety/rollback:** Preserve ordered `/api/*` then SPA rewrites. Vite preview still proves SPA deep links only, not hosted Functions.

### Task 6: Build member and seven-meal budget steps

**TDD:** Yes.

**Expected files:**

- Create: `src/features/household/onboarding/onboarding-page.tsx`, `src/features/household/onboarding/onboarding-page.test.tsx`
- Create: `src/features/household/household-form-state.ts`
- Create: `src/features/household/components/member-groups-step.tsx`, `src/features/household/components/member-groups-step.test.tsx`
- Create: `src/features/household/components/budget-step.tsx`, `src/features/household/components/budget-step.test.tsx`
- Modify: `src/app/router.tsx`, `components.json` only if generator output requires it
- Create only as required: `src/app/components/ui/input.tsx`, `label.tsx`, `card.tsx`, `progress.tsx`

- [ ] RED-test all child bands, adult/elderly controls, zero omission, 1/20/21 totals, keyboard/touch labels, infant copy, back preservation, VND parsing/formatting/bounds, and exact seven-meal copy.
- [ ] Implement local reducer/form state and domain validation at step boundaries. Do not persist partial drafts to storage or Supabase.
- [ ] Verify 320 px layout without horizontal overflow and run:

  ```powershell
  npx vitest run src/features/household/onboarding src/features/household/components/member-groups-step.test.tsx src/features/household/components/budget-step.test.tsx
  npm run lint
  npm run typecheck
  npm run test
  npm run build
  git diff --check
  git status --short
  ```
- [ ] Commit exact files with `feat: add household size and budget steps`.

**Safety/rollback:** Do not show coefficients, infer servings, add infant fields, names, or other budget scopes.

### Task 7: Add canonical rules, time, review, and first persistence

**TDD:** Yes.

**Expected files:**

- Create: `src/features/household/components/hard-rules-step.tsx`, `src/features/household/components/hard-rules-step.test.tsx`
- Create: `src/features/household/components/preferences-time-step.tsx`, `src/features/household/components/preferences-time-step.test.tsx`
- Create: `src/features/household/components/review-step.tsx`, `src/features/household/components/review-step.test.tsx`
- Create: `src/features/household/household-summary-page.tsx`, `src/features/household/household-summary-page.test.tsx`
- Modify: onboarding page/tests, `src/features/household/household-form-state.ts`, `src/app/router.tsx`
- Create only as required: `src/app/components/ui/checkbox.tsx`, `radio-group.tsx`, `alert.tsx`

- [ ] RED-test canonical sort, hard/soft visual/semantic separation, `allergen_other` fixed warning with no text field, conflict blocking, exact elapsed-time choices, complete review, and success/stale/auth/retry save outcomes.
- [ ] Implement atomic `saveOwn`. Copy says “filtered using saved exclusions,” never “allergy safe.”
- [ ] On success navigate to `/household` and reload authoritative data. Summary shows groups, seven-meal budget, rules, preferences, max elapsed time, and edit action; no planner control.
- [ ] Run:

  ```powershell
  npx vitest run src/features/household
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run build
  git diff --check
  git status --short
  ```

- [ ] Commit exact files with `feat: complete household onboarding`.

**Safety/rollback:** Option labels are not catalog lineage. `allergen_other` remains hard unsupported structured intent.

### Task 8: Add editable household settings with optimistic concurrency

**TDD:** Yes.

**Expected files:** Create `src/features/household/settings/household-settings-page.tsx`, `src/features/household/settings/household-settings-page.test.tsx`; modify `src/app/router.tsx`, `src/features/household/household-form-state.ts`, the shared components from Tasks 6–7, and `src/features/household/household-summary-page.test.tsx`.

- [ ] RED-test authoritative loading, prefilled values, cancel-without-write, successful edit/version refresh, stale conflict/reload, signed-out redirect, and no second-household creation.
- [ ] Reuse onboarding sections and validation. Save the loaded version; on conflict reload/ask the user rather than silently overwriting.
- [ ] Run:

  ```powershell
  npx vitest run src/features/household/settings src/features/household/household-summary-page.test.tsx
  npm run lint
  npm run typecheck
  npm run test
  npm run build
  git diff --check
  git status --short
  ```
- [ ] Commit exact files with `feat: add household settings editing`.

**Safety/rollback:** Account/household deletion is out of scope.

### Task 9: Add local Supabase integration tests and strengthen CI

**TDD:** Yes for integration/helper behavior; CI is command-verified.

**Expected files:**

- Modify: `package.json`, `.github/workflows/ci.yml`, `vitest.config.ts`, `.gitignore`
- Create: `tests/integration/supabase-auth.integration.test.ts`, `supabase-household.integration.test.ts`
- Create: `scripts/local-supabase-env.mjs` and test

- [ ] RED-test a Node helper that runs `supabase status -o env`, accepts only loopback API URLs, extracts local public key without logging it, and launches a child command with four public env values. Fail closed on remote URLs, missing keys, or stopped services.
- [ ] Add `test:integration` and `test:e2e:onboarding` scripts that require `preflight:db` and the local-env helper. They accept no remote URL/linked mode.
- [ ] Integration tests use publishable keys only and prove:

  - local sign-up/sign-in/session/sign-out;
  - valid token accepted by server verifier, forged token rejected;
  - A creates/loads/edits exactly one household through RPC;
  - second create and stale update fail;
  - B sees/mutates none of A's private rows through Data API;
  - canonical options are authenticated-readable and immutable;
  - adapter outputs satisfy strict domain contracts.

- [ ] Extend the existing independent CI `database` job after start/reset/lint/pgTAP to run:

  ```text
  npm run db:types:check
  npm run test:integration
  npx playwright install --with-deps chromium
  npm run test:e2e:onboarding
  ```

  Keep the `web` job and every Phase 0 gate. Upload freshly generated database types with `if: always()` for the no-local-Docker bootstrap path, but type drift still fails final CI. Add no `continue-on-error`, secrets, environments, deploys, or remote Supabase.

- [ ] With local Docker run:

  ```powershell
  npm run supabase:start
  npm run supabase:reset
  npm run supabase:lint
  npm run supabase:test
  npm run db:types:check
  npm run test:integration
  npm run supabase:stop
  ```

  Without it retain `DATABASE_RLS_GATE_PENDING_CI`.

- [ ] Run non-database checks:

  ```powershell
  npx vitest run scripts/local-supabase-env.test.ts
  npm run format:check
  npm run lint
  npm run typecheck
  npm run test
  npm run build
  git diff --check
  git status --short
  ```
- [ ] Commit exact files with `test: verify household Supabase integration`.

**Safety/rollback:** GitHub-hosted Docker runs an ephemeral local Supabase stack. A red database job remains authoritative failure.

### Task 10: Add Playwright onboarding smoke and run the exit gate

**TDD:** Yes for the browser journey; documentation/audit is command-verified.

**Expected files:** Create `tests/household-onboarding.spec.ts`; modify `tests/smoke.spec.ts` only as required, `playwright.config.ts`, `README.md`.

- [ ] Write the 390x844 browser test first. It must:

  1. create a unique local email/password user;
  2. complete all five steps with a child band, hard exclusion, soft preference, budget, and time;
  3. refresh and verify authoritative summary;
  4. deep-link to settings, edit one value, save, and verify persistence/version behavior;
  5. sign out/in and verify the same single household;
  6. observe no uncaught error, failed first-party request, missing accessible name, or horizontal overflow.

- [ ] Keep unauthenticated/deep-link smoke in `web`; run real Auth/onboarding in Docker-backed `database`. Vite preview proves SPA behavior, handler tests prove server auth, and no hosted routing claim is made.
- [ ] README documents local Auth, public env keys, routes, structured-rule limitations, seven-meal budget semantics, local/CI DB paths, generated types, no production commands, and explicit Phase 2 deferral.
- [ ] Run scope scans:

  ```powershell
  rg -n "TODO|TBD|FIXME|HACK|not implemented" src api scripts supabase tests README.md
  rg -n "display_name|household_name|birth|weight|diagnos|dietary_notes|free.?text|openai|anthropic|langchain|vector|turso" src api scripts supabase tests package.json
  rg -n "service_role|SUPABASE_SECRET|SUPABASE_SERVICE" .env.example src api scripts .github supabase
  ```

  Expect no placeholders/prohibited data/AI/catalog concepts. Secret names may appear only in negative scanner/validator tests or security prose, never runtime config.

- [ ] Run mandatory local non-database exit gate:

  ```powershell
  npm ci
  npm run preflight
  npm run env:check
  npm run secrets:check
  npm run security:dependencies
  npm run format:check
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run build
  npx playwright install chromium
  npm run test:e2e
  git diff --check
  git status --short --branch
  ```

- [ ] Resolve database evidence:

  - `LOCAL_DB_VERIFICATION_AVAILABLE`: run preflight/start/reset/lint/pgTAP/type drift/integration/onboarding Playwright/stop locally.
  - `LOCAL_DB_VERIFICATION_UNAVAILABLE`: push only to trigger non-deploying CI, then require `web` and `database` success for exact final HEAD. If generated types require the first CI artifact, inspect/commit it, push the new HEAD, and require a second exact-HEAD PASS.

- [ ] Inspect branch delta:

  ```powershell
  git status --short --branch
  git log --oneline main..HEAD
  git diff --stat main...HEAD
  git diff --check main...HEAD
  ```

- [ ] Push without force and inspect exact-HEAD CI:

  ```powershell
  git push --set-upstream origin codex/phase-1-household
  $phase1Head = git rev-parse HEAD
  $phase1Run = gh run list --workflow ci.yml --branch codex/phase-1-household --commit $phase1Head --limit 1 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json
  if ($phase1Run.Count -ne 1 -or $phase1Run.headSha -ne $phase1Head) { throw "No CI run found for exact Phase 1 HEAD" }
  gh run watch $phase1Run.databaseId --exit-status
  $jobs = (gh run view $phase1Run.databaseId --json jobs | ConvertFrom-Json).jobs
  if (($jobs | Where-Object name -eq "web").conclusion -ne "success") { throw "CI web job did not pass" }
  if (($jobs | Where-Object name -eq "database").conclusion -ne "success") { throw "CI database job did not pass" }
  ```

- [ ] Report `PHASE_1_PASS` and `TASK_COMPLETE_PUSHED` only after exact pushed HEAD passes. Otherwise report `PHASE_1_BLOCKED` with the exact gate. Stop; do not merge or start Phase 2.

**Safety/rollback:** Verification push is not deployment. Fix failures in their owning task, rerun focused then full gates, and never force-push or mutate production.

---

## 3. Exact Verification Command Reference

### Fast non-database feedback

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

### Local capability

```powershell
npm run preflight
```

Record exactly `LOCAL_DB_VERIFICATION_AVAILABLE` or `LOCAL_DB_VERIFICATION_UNAVAILABLE`.

### Authoritative local database path when available

```powershell
npm run preflight:db
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run db:types:check
npm run test:integration
npm run test:e2e:onboarding
npm run supabase:stop
```

All endpoints must be loopback. No `--linked`, login, push, or remote URL.

### Authoritative CI path when local Docker is unavailable

The exact-final-SHA `database` job must pass Node/Docker/Supabase preflight, start, clean reset, SQL lint, all pgTAP/RLS tests, generated-type drift, Auth/server/household integration, real local-Auth onboarding Playwright, and cleanup.

### Mandatory local non-database exit gate

```powershell
npm ci
npm run preflight
npm run env:check
npm run secrets:check
npm run security:dependencies
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npx playwright install chromium
npm run test:e2e
git diff --check
git status --short --branch
```

---

## 4. Phase 1 Exit Criteria

Phase 1 is complete only when all are true for exact pushed HEAD:

- [ ] Approved Phase 0 is integrated and inherited gates pass on Node 24.
- [ ] Email/password sign-up/sign-in/restore/confirmation-pending/sign-out work without collecting names.
- [ ] Browser uses public config only; server verifies `getUser(token)` with no service/secret key.
- [ ] One owned household/account; completed household has 1–20 supported anonymous grouped members.
- [ ] No child account, name, birth date, sex, weight, diagnosis, health, or free-text rule field exists.
- [ ] Budget/time/rules validate in domain and database; budget copy always scopes seven primary meals.
- [ ] Hard allergies/exclusions and soft preferences are canonical and structurally distinct; unknown text cannot become authoritative.
- [ ] First save is atomic; edits are optimistic; stale writes never overwrite.
- [ ] Least-privilege grants and separate RLS policies pass anon/cross-user negative tests for every operation.
- [ ] Clean reset, SQL lint, pgTAP, generated types, integration, and real onboarding smoke pass in approved Docker-backed local/CI Supabase.
- [ ] Component accessibility/mobile/error/conflict tests, format, lint, strict typecheck, coverage, build, SPA smoke, secret scan, and audit pass.
- [ ] CI has no deployment, production/staging database, secret key, broad permission, or optional DB gate.
- [ ] No Phase 2+ schema, logic, route, or dependency exists.
- [ ] Only coherent task files are committed; unrelated artifacts remain untouched; push is non-force.

### `PHASE_1_PASS`

Record only when every local non-database gate passes and database/RLS/type/integration/onboarding verification passes locally or in exact-final-HEAD GitHub Actions.

### `PHASE_1_BLOCKED`

Record when Phase 0 is absent, Node 24 is unavailable, any mandatory verification fails, generated types are missing/stale, or database/RLS/integration has passed nowhere. `LOCAL_DB_VERIFICATION_UNAVAILABLE` alone is not blocked; it requires exact-final-HEAD CI evidence.

---

## 5. Self-Review Against the Design and AGENTS.md

### Coverage

| Requirement | Coverage |
|---|---|
| Auth/session | Sections 1.2; Tasks 3/5/9 |
| Profiles/one household | Schema, unique owner, trigger, RLS |
| Grouped approved bands | Domain/DB checks; Tasks 1/2/6 |
| Seven-meal budget | Domain/DB/UX copy |
| Canonical hard/soft rules | Vocabulary, constraints, Tasks 2/7 |
| Max cooking time | Domain/DB/UI bounds |
| Mobile onboarding/edit | Routes; Tasks 6–8/10 |
| Browser/server Supabase | Typed client plus `/api/me` verification |
| Migrations/RLS | One migration, separate policies, cross-user pgTAP |
| Typed boundaries | Domain/application contracts; generated DB types infrastructure-only |
| CI/Docker fallback | Tasks 9/10 and status semantics |

### Contradiction and ambiguity review

- The design's older local-Docker-only language is superseded only in verification location by the approved Phase 0 correction and this request; every DB/RLS check remains mandatory.
- Current branch lacks Phase 0 ancestry. Future implementation blocks until reviewed integration; this plan does not import it.
- Design sketches display/household names, notes, price region, and catalog foreign keys. Explicit Phase 1 constraints prohibit names/free text and exclude prices/catalog, so they are omitted. Later reviewed migrations can add price/catalog mappings without changing stable input codes.
- Rule options are household vocabulary, not catalog allergen lineage. They cannot support a safety claim. `allergen_other` blocks silent “no allergy” interpretation.
- Security-invoker RPC provides atomicity without bypassing RLS; constraints/policies protect both RPC and legitimate direct writes.
- Browser session is presentation state; RLS and server `getUser(token)` are authorization boundaries.
- Budget is stored but not evaluated; no planner/portion/nutrition/cost logic enters early.
- Local confirmation configuration affects local/CI only. No hosted Auth or production resource changes.
- A CI verification push is not deployment or PASS. Exact-final-HEAD evidence is required.

### YAGNI review

One household domain, one migration/RPC, one feature slice, one protected identity Function, and three dependencies are sufficient. Omitted: names/notes, child users, household memberships/invitations, OAuth/MFA, account administration, extra state/query frameworks, service credentials, catalog mappings/data, every engine, planner, shopping, pantry, admin, AI, deployment, and production provisioning.

## 6. Primary Implementation References

- [Supabase Auth with React](https://supabase.com/docs/guides/auth/quickstarts/react)
- [Supabase JavaScript initialization](https://supabase.com/docs/reference/javascript/initializing)
- [Password-based Auth](https://supabase.com/docs/guides/auth/passwords)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase local workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase TypeScript generation](https://supabase.com/docs/guides/api/rest/generating-types)
