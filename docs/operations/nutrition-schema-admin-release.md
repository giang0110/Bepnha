# Compatible schema and admin release for household nutrition

This release contains the additive household nutrition, actual cooking/purchase contracts and admin
publication pipeline through checkpoint `2e14a9e`. It includes the final corrected fourth migration
and the fifth immutable whole-unit read projection from the reviewed feature `9b9d145`.

The application runtime and family UI remain on planner-engine-v5. Old-schema read fallbacks remain;
profile writes fail rather than drop fields. Do not enable v6 before schema and catalog readiness.

Release sequence authorized by the user on 2026-10-02:

1. Verify this exact branch, review its PR, merge into main and observe the compatible deployment.
2. Inspect the production migration workflow dry-run for project `vkrqzwlpneocgjwhqbsl`. The actual
   remote history decides the pending chain; do not assume only five migrations are missing.
3. Apply the reviewed chain through the guarded production workflow and verify actual schema.
4. Publish the reviewed matching food facts/recipes/cooking policies and purchase terms using the
   admin pipeline; use the full feature branch's reviewed authoring pack. Keep unverified kg quotes
   fixed. Do not run local reset, test users or fixtures on production.
5. Reconcile and merge the full feature PR only after readiness passes, then verify deployment.

The five feature migrations are `20261002010000` through `20261002050000`; this checkout has 27
migrations, 46 public tables and 33 public function names. The corrected v6 settlement pins its
purchase fact and rejects incompatible whole-piece stock; legacy settlement keeps its behavior.
The display projection uses stored sources/conversions, without live catalog heads.

Verification on this compatible branch passed before commit: 187 web test files / 1,726 tests,
516 SQL/RLS checks, 24 real integration tests, 20 browser checks and six planner performance checks.
Formatting, lint, TypeScript, production build, dependency/secret checks and the pinned database
type check passed. First-load JavaScript was 655,400 / 660,000 bytes. The v1 catalog import,
validation and audit passed with the existing 102 secondary and one Atwater warning unchanged.

This document is release preparation. No production migration, catalog mutation or main merge is
claimed until the corresponding external action and checks succeed.
