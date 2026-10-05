# Zero-change pantry settlement repair

When a checked shopping line is fully covered by pantry at generation, but that stock is empty or deleted by confirmation, the existing RPC skips the zero-change line's completion record. Confirming the same revision again after refilling or recreating the pantry row can consume that newly entered stock.

Migration `20261005010000_zero_change_pantry_settlement.sql` writes the per-line completion record on the first confirmation, even when both actual consumption and surplus are zero. A missing pantry row stays missing; an existing zero-change row is not updated. The same revision cannot consume later refill stock. Normal nonzero consumption and surplus remain unchanged.

The migration patches only two zero-change exits in `public.apply_shopping_to_pantry(uuid)`. It preserves the RPC signature, JSON response, owner checks, household locking, per-line uniqueness, immutable v6 fact guards and grants. Both expected source snippets are checked before replacing the function; if either snippet is absent, the migration aborts with SQLSTATE `55000` rather than executing a partially patched body. No historical settlement records or household stock are recalculated or backfilled.

## Verification

- The focused pgTAP regression failed 23 of 55 assertions against the old function and passed all 55 with the migration.
- The entire database suite passed 571 assertions in 29 files, with the exact migration inserted inside each test's rolled-back transaction in an isolated schema/reference-only database.
- Four migration probes passed for RPC metadata, source-drift rejection and atomicity.
- Independent SQL review found no defects. Existing locking and uniqueness are unchanged; simultaneous confirmation was not separately exercised.
- Repository schema inventory is 28 migrations, 46 public tables and 33 public functions. Only the migration count changes.
- Final local `npm run verify:web` passed on main `26fde62` with the database repair: 1,897 tests in 199 files, formatting, lint, typecheck, build and bundle limits. The pinned CLI 2.115.0 generated-types check passed using `env -u SUPABASE_CLI_BINARY_OVERRIDE npm run db:types:check`; the setup's service CLI 2.117.0 produces different generic formatting, without a schema difference. GitHub CI must also validate the final PR head before merge.

## Production application

Production application requires explicit approval under `AGENTS.md` section 5. Preparing or merging this PR does not itself apply the migration; Vercel code remains compatible with the existing RPC shape during the gap.

After approval and green PR checks, merge the reviewed PR to `main` and run the existing **Production database migration** workflow from `main` for project `vkrqzwlpneocgjwhqbsl`. It lists pending migrations before applying them, then runs `npm run verify:production:schema`. Confirm beforehand that this is the only pending migration; an unexpected pending chain needs additional review. Successful verification must report 28/28 migrations, 46/46 public tables, 33/33 public functions and `PRODUCTION_SCHEMA_MATCHES_REPOSITORY`.

No production confirmation test should create household stock or shopping records. Use the read-only production smoke and the transaction-only local regressions for release evidence. A newly confirmed zero-change line receives the corrected completion record; this patch cannot reconstruct confirmations skipped before it was deployed.
