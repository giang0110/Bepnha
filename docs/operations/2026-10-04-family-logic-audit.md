# Household, weekly planning and purchasing logic audit

Audit started on 2026-10-04 against `a66cf2cf93ceb965ce53c19e90c43d62e3d96cf4` after a household preferring pork and poultry received fish, seafood and tofu meals. Reproductions use synthetic households and the reviewed publication pack. No private production profiles, household plans or credentials were inspected.

## Confirmed defects and repairs

| Boundary | Confirmed behavior before repair | Repair |
| --- | --- | --- |
| Preference search | Partial search counts soup/vegetable preferences but omits protein preferences. The final scorer cannot recover preferred meals discarded earlier. | Share the final preference matcher with partial search, including ingredient category ancestry and configured preference weight. |
| Budget search | Over-budget high-quality prefixes crowd affordable preferred alternatives out of the quality frontier. | Retain affordable quality prefixes first; keep the cost frontier and the existing over-budget fallback. Final scoring and hard constraints retain their existing contracts. |
| Legacy meal replacement | Direct owner writes to child rule/member rows can leave the parent setup version unchanged. Replacement can preserve six meals from obsolete household rules. | Compare the normalized historical household setup with current authoritative setup before preview or apply, including allergies, strictness, exclusions, preferences and members. Require regeneration on a difference. |
| Setup contradictions | Exact target equality misses vegetarian + preferred meat/fish, excluded seafood + preferred fish, and soy allergy + preferred tofu. | Use shared semantic conflicts in draft validation and preference controls. Keep previously saved household records readable so their owners can correct them. |
| Settings review | Direct step tabs bypass member/rule guards and offer Save on an invalid draft, then report a temporary failure. | Validate the whole draft at Review and again before saving, with actionable validation errors. |
| Saved legacy plan reads | Reading a complete saved v5 week invokes live generation/catalog hydration. A failure there hides an otherwise intact saved week. | Decode owner-scoped stored snapshots directly, including historical revision reads; calculated decimals retain their original precision, and malformed stored snapshots still fail validation. |
| Physical conversions | Count/volume → mass conversions can disagree on base mass and nutrition mass. A synthetic 55g item can be counted as 110g for nutrition. | Require gross grams to equal base quantity × base-unit mass factor whenever the food base is mass. Retain the source-mass invariant and valid density conversions. |
| Pantry settlement | A checked pantry-covered line with zero actual consumption and zero surplus skips its completion record. Retrying after refilling pantry consumes the new stock. | Separate SQL migration records a durable per-line completion even for zero-change settlement, without creating/updating stock unnecessarily. |

## Reproduction evidence

- A 20-meal synthetic catalog has fish/seafood/tofu/pork/poultry meals with matching protein category lineage. Before repair, no preference, pork preference, and pork+poultry preferences select the same protein sequence. Protein matching partial branches have identical bounds. Regressions failed for both legacy and v6 selection before the preference repair.
- An affordable-branch regression has seven cheaper meals costing 280,000 VND and a pork substitution costing exactly 300,000 VND. The old search returns zero preferred meals despite that valid alternative. The repaired search keeps the preferred meal within the 300,000 VND budget.
- With the reviewed 48-meal publication pack, two synthetic adults, a 45-minute limit and a 900,000 VND budget, the search before budget-frontier repair returns a 682,600 VND week containing no pork/poultry. A pork substitution costs 828,300 VND and improves its existing score from 4372 to 4002, proving that absence of preferred meals is not caused by infeasibility in that scenario. After both search repairs, the preferred scenario includes pork and costs 827,600 VND. This is an offline catalog replay, not the requesting household's production result.
- The same pack at a 30-minute limit has only eight eligible meals, including one pork meal and no poultry meals. Time limits genuinely restrict preference fulfillment and are preserved.
- Count and volume conversion regressions failed before repair. Valid g/kg mass bases and valid count/volume density conversions remain covered. All 89 reviewed staging conversion rows agree on mass; the audit does not establish affected live nutrition facts.
- Pantry SQL evidence uses scoped synthetic IDs and rolled-back transactions. Empty and deleted pantry, mixed zero/nonzero lines, retry after refill, ownership and changed-fact rejection are tested independently from the web release.

## Validated contracts and practical limits

Household saving and generation preserve pork/poultry preference codes. Normal settings saves increment the setup version. Saved weeks intentionally retain their original setup, prices, portions and basket until the owner regenerates them; loading a week does not rewrite it using new settings.

Allergies and food exclusions filter eligibility before scoring. Unknown allergen lineage remains unsafe under strict exclusion. Preferences are soft ranking inputs under the existing design, alongside protein diversity, cooking variety, energy fit, history, ratings, ingredient reuse and leftovers. They do not promise a fixed number of preferred meals. Search remains deterministic and bounded; it does not prove global optimality or global budget infeasibility.

BMI, adult energy equations, activity factors, maintain/gain/lose factors, child/elderly fallback, the 0.5–2 portion coefficient clamp, per-member allocation and post-rounding energy scoring match the approved nutrition design. Energy goals are soft targets. The clamp and indivisible foods can prevent exact target matching; actual versus target energy remains visible. The model estimates nutrients from pinned raw ingredient facts and edible fractions, without cooked nutrient-retention factors. Its score does not enforce protein, fat, fibre, sodium or whole-day nutrient ranges. Broad accepted age/height/weight ranges also do not establish suitability of the adult equation at extreme profiles; that is a separate model-policy decision.

Weekly purchasing aggregates actual per-meal food quantities before deducting pantry and applying sale increments. It uses gross purchasing quantities; nutrition applies the edible fraction once. Count cooking policies round indivisible items before basket aggregation. Frozen shopping sources and the authoritative purchase basket remain distinct from proportional consumption cost and manual shopping extras.

The read-only production report (run `37242592454`, 2026-10-04 23:07 UTC) has 48 active published meals and price-book version 4 with 45 price rows, all fixed packs and zero loose-sale quotes. Required purchase terms and referenced quantity policies are present. The current 1kg fixed fish quote therefore turns a 600g requirement into a 1kg purchase with 400g surplus; the egg quote is a ten-egg pack. The engine supports loose-mass and loose-count increments, but correct real-market buying requires verified sale terms in a newly published price book. This audit does not invent those terms or replace current quote evidence.

## Release boundaries

The web repairs retain `planner-engine-v6`, existing final score weights and persisted snapshot shapes. They can deploy against the current production schema. Household semantic validation is enforced on application drafts/saves; the older direct database RPC conflict check remains narrower. Generation and replacement retain hard safety checks even for direct owner API writes.

The pantry repair is a separate additive migration preserving the RPC signature and access controls. Per `AGENTS.md` section 5, its production application needs explicit approval. It must not be described as live until production migration verification confirms it.

## Verification record

- Preference/search/cache regression gate: 53 tests in five files passed after both search repairs.
- Application legacy replacement and physical-quantity boundary gate: 73 tests in four files passed; the five same-version household-edit regressions failed before the guard.
- Planner performance regression gate: six scenarios passed; maximum fixture remained below its 5-second CI ceiling. This is a CI regression guard, not a production latency measurement.
- Pantry regression: 23 expected failures in 55 assertions before repair; 55/55 after repair. All 29 SQL files / 571 assertions passed in an isolated schema/reference-only database with the migration inside rolled-back transactions. Four metadata/source-guard assertions passed; independent SQL review found no defects.
- Independent whole-web review found one important new decoder defect: valid calculated nutrition and serving ratios exceed source-input decimal limits. Real domain round-trip regressions failed for six-decimal nutrient inputs, yield 3 and a small factor with more than 80 fractional places. The repair validates canonical finite calculated outputs separately and preserves stored bytes; source-input limits remain intact.
- Final `npm run verify:web`: 199 files / 1,897 tests passed, with coverage thresholds, environment/secrets checks, dependency audit, formatting, lint, typecheck, production build and bundle budgets passing.
- Final local Chromium smoke: 12/12 tests passed after building with the ephemeral loopback Supabase configuration. An initial smoke run reused an unconfigured build and failed with `Supabase URL must use HTTP(S)`; rebuilding with `local-supabase-env.mjs` resolved the environment mismatch without application changes.
- The independent decoder review repair gate passed 40 tests, including real generated-snapshot round trips and compiled serverless handler boot checks.
- GitHub CI and deployed smoke must pass for the reviewed release head before the web repair is reported live. The separate pantry migration remains unapplied pending explicit approval.
