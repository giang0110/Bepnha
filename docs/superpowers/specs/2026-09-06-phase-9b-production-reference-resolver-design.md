# Phase 9B Production Reference Resolver Design

## Status

Approach approved in chat on 2026-09-06. This document defines Phase 9B only. The written spec still requires user review before an implementation plan is created. It does not authorize production catalog mutation, production migrations, deployment, PR creation, or merge.

## Goal

Build a deterministic, fail-closed, read-only production reference resolver that consumes a Phase 9A-valid `CatalogPackV1`, reads the current production catalog/reference state from Supabase, and emits a stable `ResolvedCatalogManifestV1` describing exactly which logical codes/version pins resolve to existing production UUIDs and which catalog identities are genuinely absent and therefore candidates for creation in a later phase.

Phase 9B is a preflight and resolution boundary. It must never create, update, publish, retire, delete, infer, repair, or substitute catalog data.

## Why Phase 9B is separate

Phase 9A proves that the supplied catalog pack is internally coherent and launch-pack ready without touching production. The existing catalog-admin APIs, however, accept UUID-backed references such as `baseUnitId`, `categoryId`, `foodId`, `foodFactVersionId`, recipe/version IDs, tag IDs, and price-region IDs. Production resolution therefore needs a separate trusted step between offline validation and any later write pipeline.

The existing create commands also allow the database to allocate identity IDs for new foods, recipes, and meal options. A read-only resolver cannot truthfully predict those future production IDs. Phase 9B therefore resolves only IDs that already exist in production and explicitly marks missing identities as `missing`; it never fabricates a production UUID.

## Non-goals

Phase 9B does not:

- create foods, food facts, recipes, price books, meal options, or versions;
- save drafts or publish/retire catalog entities;
- call existing catalog-admin or meal-option-admin mutation commands;
- generate fake or speculative production UUIDs for missing identities;
- modify Supabase schema, migrations, RLS, grants, triggers, or functions;
- weaken Phase 9A validation or bypass a failed Phase 9A report;
- infer a nearest code when a production reference is missing;
- author or repair nutrition, allergen, yield, recipe, conversion, meal composition, or price data;
- scrape external sources or call Gemini/another LLM;
- create a production pack from synthetic Phase 9A fixtures;
- deploy to Vercel;
- create or merge a pull request.

A later explicitly approved phase may consume the manifest to build a dry-run mutation plan and, after another production-mutation approval gate, execute writes through the existing application paths.

## Chosen architecture

The approved approach is:

```text
CatalogPackV1 bytes
      |
      v
Phase 9A deterministic validation
      |
      | valid + ready only
      v
CatalogReferenceReader (read-only interface)
      |
      v
Production snapshot normalization
      |
      v
ProductionReferenceResolver
      |
      v
ResolvedCatalogManifestV1 + deterministic report
```

The resolver is split into three responsibilities:

1. **Phase 9A gate** — parse the original pack bytes and require the Phase 9A report to be both `valid` and `ready` before any production query occurs.
2. **Read-only production snapshot** — query only the minimal rows needed from reference, identity, and version tables through a narrow `CatalogReferenceReader` interface.
3. **Pure deterministic resolution** — compare the validated pack with the snapshot, produce diagnostics/conflicts, and emit a stable manifest without network/database dependencies.

This keeps production I/O isolated from the resolver rules and makes the core resolution logic unit-testable without Supabase.

## Read-only authority boundary

### Runtime credential

The production reader may use the existing server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` because current RLS/grants are not assumed to expose all required catalog metadata through the publishable key. The secret key must remain server-only and must never be printed or serialized.

The credential itself is privileged, so Phase 9B enforces read-only behavior at the code boundary:

- the reader interface exposes only load/query methods;
- the Supabase implementation uses only `.select(...)`, filters, and read-only RPCs if an already-existing RPC is required;
- it must not call `.insert`, `.upsert`, `.update`, `.delete`, or any lifecycle/publication RPC;
- tests use a recording/fake client or repository seam to prove no mutation path is reachable;
- the CLI exits before constructing the reader if Phase 9A validation/readiness fails.

Phase 9B will not add a new database role or migration solely to create a credential-level read-only account. That would widen the phase and require a separate migration approval.

## Production tables read by Phase 9B

The resolver may read only the catalog/reference tables needed to resolve the pack:

- `units`;
- `food_categories`;
- `allergens`;
- `dietary_tags`;
- `nutrients`;
- `price_regions`;
- `recipe_tags`;
- `foods` and `food_fact_versions`;
- `recipes` and `recipe_versions`;
- `price_books`;
- `meal_options` and `meal_option_versions`.

No household, meal-plan, shopping-list, pantry, auth-profile, or other user/private data belongs in this phase.

The resolver reads minimal fields: UUID, logical code, version number, lifecycle/publication status, revision, and the small amount of immutable metadata needed for drift/collision checks. It does not download catalog child payloads such as nutrient rows, recipe steps, or price rows in Phase 9B.

## Reference-data resolution

### Exact-by-code rule

Every reference code must resolve to exactly one production row. Zero matches is `REFERENCE_NOT_FOUND`; more than one logical match is `REFERENCE_AMBIGUOUS`. The resolver never falls back to partial, case-insensitive, prefix, suffix, translated-name, or fuzzy matching.

Production UUIDs are always taken from the queried row. Phase 9A's seeded/reference UUIDs are not trusted as runtime truth even if they currently match the migration.

### Units

Resolve every unique code used as:

- food base unit;
- food conversion unit;
- recipe ingredient unit;
- price package unit;
- price base unit.

The production `dimension` must match the Phase 9A launch-unit dimension policy. A code that exists with unexpected metadata is `REFERENCE_DRIFT`.

### Food categories

Resolve every selected category and every code in `categoryAncestry`. The queried production parent chain must exactly equal the Phase 9A leaf-to-root ancestry. Any mismatch is `REFERENCE_DRIFT`.

### Allergens, nutrients, dietary tags, and price region

Resolve exact Phase 9A codes and verify required production metadata where Phase 9A depends on it:

- all ten launch allergen codes exist;
- all six required nutrients exist and remain `required_for_publication = true`;
- dietary tag `vegetarian` exists when used;
- `vn_baseline` exists as the requested price region.

Missing or drifted rows fail resolution.

## Recipe-tag adapter

The database stores a single `recipe_tags` table with kind-prefixed codes while `CatalogPackV1` intentionally uses semantic codes in its structured meal-option fields. Phase 9B is the adapter between those contracts.

Canonical mappings are:

- cooking style semantic code `X` -> DB code `style_X` with `tag_kind = cooking_style`;
- protein hint semantic code `X` -> DB code `protein_X` with `tag_kind = protein_hint`;
- dish role semantic code `X` -> DB code `role_X` with `tag_kind = dish_role`.

For meal options, the field determines the required kind, so `boil`, `plant`, and `main` resolve respectively to `style_boil`, `protein_plant`, and `role_main`.

For `recipe.version.tagCodes`, Phase 9A supplies semantic tag codes without a kind field. Phase 9B resolves each semantic code against the three canonical candidates above. Exactly one candidate must exist. Zero candidates is `REFERENCE_NOT_FOUND`; multiple candidates is `REFERENCE_AMBIGUOUS`. The resolver must not guess a kind.

The manifest records both the semantic pack code and the canonical production tag code/UUID so later phases do not repeat or reinterpret this mapping.

## Pack identity and version collision policy

### Identity states

For each food, recipe, and meal option code, the manifest records one of:

- `missing` — no production identity currently has the code;
- `existing` — exactly one production identity has the code and its immutable identity metadata is compatible with the pack;
- `conflict` — a production identity exists but is retired or has incompatible immutable metadata.

For foods, immutable compatibility includes `name_vi`, `base_dimension`, and resolved `base_unit_id`. For recipes and meal options, the code and `name_vi` must match. The resolver does not silently rename production identities.

A `missing` identity is not itself a Phase 9B error. It is expected input for a later creation phase and has `id: null` in the manifest. The resolver never fills that field with a generated UUID.

### Version states

For each requested food-fact, recipe, price-book, and meal-option version number:

- if the parent identity/region exists and the requested version does not exist, record `missing`;
- if the requested version already exists, record `collision` with its UUID, revision, and publication status.

A version collision is a Phase 9B blocking diagnostic `VERSION_ALREADY_EXISTS`. Phase 9B does not attempt idempotent reuse, draft overwrite, content-hash equivalence, or version-number incrementing. Those behaviors would require a separate explicitly designed mutation/resume policy.

This conservative rule prevents a later importer from accidentally overwriting an existing draft or republishing a version number already in use.

For a missing parent identity, its requested child version is recorded as `pending_parent_creation`, with `id: null`; this is informative rather than an error.

### Price book

The `vn_baseline` region must resolve. If the requested `priceBook.versionNumber` already exists for that region, it is a blocking `VERSION_ALREADY_EXISTS`. Otherwise it is `missing` and receives no speculative UUID.

## ResolvedCatalogManifestV1

The output is a machine-readable JSON document with this conceptual shape:

```ts
interface ResolvedCatalogManifestV1 {
  readonly schemaVersion: "1"
  readonly catalogCode: string
  readonly inputSha256: string
  readonly productionSnapshotSha256: string
  readonly resolved: boolean
  readonly references: {
    readonly units: readonly ResolvedReference[]
    readonly categories: readonly ResolvedCategoryReference[]
    readonly allergens: readonly ResolvedReference[]
    readonly nutrients: readonly ResolvedReference[]
    readonly dietaryTags: readonly ResolvedReference[]
    readonly priceRegion: ResolvedReference
    readonly recipeTags: readonly ResolvedRecipeTagReference[]
  }
  readonly foods: readonly ResolvedIdentityVersion[]
  readonly recipes: readonly ResolvedIdentityVersion[]
  readonly priceBook: ResolvedPriceBookTarget
  readonly mealOptions: readonly ResolvedIdentityVersion[]
  readonly diagnostics: readonly CatalogResolutionDiagnostic[]
}
```

`ResolvedReference` contains the logical/semantic code, canonical production code where different, and real production UUID. Identity/version entries include code, requested version number, state, nullable UUIDs, and existing revision/status metadata when present.

The manifest is deliberately not a mutation-command list. It contains enough exact production facts for a later planner to decide what may be created, but it does not encode write ordering or execution.

## Determinism and hashing

The same input bytes against the same logical production snapshot must produce byte-equivalent JSON output.

Rules:

- preserve Phase 9A's SHA-256 of the original input bytes as `inputSha256`;
- normalize every production row to a minimal plain object before hashing;
- sort snapshot arrays by stable logical keys, never by database return order;
- calculate `productionSnapshotSha256` from canonical normalized snapshot bytes;
- sort manifest reference and identity arrays by code and requested version;
- sort diagnostics by severity, code, path, and message;
- do not include current time, request IDs, query latency, hostnames, secret values, Supabase project URL, or nondeterministic UUIDs generated by the resolver.

`resolved` is true only when Phase 9A is valid+ready and Phase 9B has no error diagnostics.

## Diagnostics

Phase 9B uses stable machine-readable diagnostic codes. The initial required set is:

- `PHASE_9A_INVALID` — pack fails Phase 9A validity;
- `PHASE_9A_NOT_READY` — pack is valid but launch-readiness blockers remain;
- `REFERENCE_NOT_FOUND` — required production code has no exact row;
- `REFERENCE_AMBIGUOUS` — a semantic reference resolves to more than one allowed candidate;
- `REFERENCE_DRIFT` — code exists but authoritative metadata/ancestry/kind no longer matches the reviewed launch contract;
- `IDENTITY_CONFLICT` — an existing food/recipe/meal identity is retired or immutable metadata differs;
- `VERSION_ALREADY_EXISTS` — requested version number is already present;
- `DEPENDENCY_UNAVAILABLE` — production read could not complete or returned an invalid shape.

Diagnostics include a stable JSON-path-like `path` into the pack or manifest target. Database/network error text is not copied verbatim into the deterministic public report because vendor text may be unstable or leak operational detail.

## Failure behavior

The CLI is fail-closed:

1. read exact input bytes;
2. run Phase 9A report;
3. if invalid/not ready, emit a deterministic failure report and perform zero production queries;
4. load production snapshot using the read-only reader;
5. if any required query fails or returns malformed/ambiguous data, emit `DEPENDENCY_UNAVAILABLE`/reference diagnostics and no resolved manifest for later execution;
6. resolve the snapshot purely;
7. write/print deterministic JSON;
8. return a non-zero exit code when `resolved = false`.

No automatic retry changes the meaning of a result. A caller may rerun the command after a transient dependency failure.

## CLI contract

Phase 9B adds a Node 24 CLI separate from `catalog:validate`, conceptually:

```bash
npm run catalog:resolve -- --input /secure/path/catalog.json --output /secure/path/catalog.resolved.json
```

Rules:

- `--input` is required;
- `--output` is optional; without it, JSON goes to stdout;
- the CLI reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from server/process environment only;
- missing runtime configuration fails without revealing secret values;
- real catalog packs and resolved manifests are never committed automatically;
- the CLI never prompts for confirmation because it has no write capability;
- stdout is machine-readable JSON when no output path is provided; operational messages go to stderr only;
- output exit codes distinguish success, pack validation/readiness failure, resolution conflict, and dependency/configuration failure.

Exact numeric exit codes belong in the implementation plan/tests, but their semantic categories must remain stable.

## Security and privacy

- Service-role credentials remain server/process-only and are never exposed through `VITE_*` variables.
- No user/household/auth data is queried.
- No secret, bearer token, database password, Supabase URL, or raw vendor error is included in manifest/report JSON.
- Pack provenance/source references are not sent anywhere except Supabase catalog-reference reads; Phase 9B performs no external enrichment.
- Resolved manifests contain production UUIDs and should be treated as operational artifacts. They are written only to an explicit path and are not committed automatically.

## Testing strategy

### Pure resolver unit tests

Use synthetic production snapshots to prove:

- every supported reference resolves exactly;
- missing reference -> `REFERENCE_NOT_FOUND`;
- category parent drift -> `REFERENCE_DRIFT`;
- wrong unit dimension -> `REFERENCE_DRIFT`;
- wrong recipe-tag kind -> `REFERENCE_DRIFT`;
- recipe semantic tag resolves only when exactly one canonical candidate exists;
- ambiguous recipe semantic tag -> `REFERENCE_AMBIGUOUS`;
- missing identity is represented with `id: null` and is not an error;
- incompatible existing identity -> `IDENTITY_CONFLICT`;
- existing requested version -> `VERSION_ALREADY_EXISTS`;
- missing child under missing identity -> `pending_parent_creation`;
- sorting/hashing is deterministic across different source-row order.

### Reader contract tests

Use a fake/recording Supabase seam to verify:

- only approved tables are queried;
- only read operations are reachable;
- minimal fields are selected;
- unexpected/malformed row shapes fail closed;
- secrets/vendor error details do not enter deterministic diagnostics.

### CLI tests

Spawn the Node CLI with temporary files and dependency seams to prove:

- Phase 9A invalid/not-ready input performs zero reader calls;
- valid pack + resolvable snapshot exits successfully and emits deterministic JSON;
- reference drift/conflict returns non-zero;
- missing configuration returns dependency/configuration failure without leaking values;
- output file bytes equal stdout bytes for the same resolved object;
- no production mutation API or admin command is imported/called by the CLI.

### Integration verification

No live production write test belongs to Phase 9B. If a live Supabase read-only smoke check is later performed, it must only run the resolver against explicitly configured production credentials and must not be required for normal CI.

Normal CI remains offline and deterministic.

## File/module boundaries

The implementation should stay alongside Phase 9A under `scripts/catalog-pack/` unless a small server-only adapter requires an infrastructure module. Expected responsibilities are:

- `catalog-production-types.ts` — snapshot/manifest/diagnostic types;
- `catalog-production-resolver.ts` — pure deterministic resolution;
- `catalog-production-reader.ts` — reader interface and row contracts;
- `supabase-catalog-production-reader.ts` — server-only Supabase select implementation;
- `catalog-production-resolver-cli.ts` — CLI orchestration only;
- focused Vitest files for resolver, reader, and CLI contracts.

Do not move Phase 9A validation into infrastructure code and do not import test builders into runtime modules.

## Phase boundary and handoff

Phase 9B is complete only when the resolver can demonstrate, without writes, whether a specific Phase 9A-valid catalog pack is safe to hand to a later mutation-planning phase.

The handoff artifact is `ResolvedCatalogManifestV1`:

- every static/reference code has a real production UUID;
- every pack identity is classified as compatible existing, missing, or conflict;
- every requested version is classified without overwriting anything;
- no production UUID is fabricated for missing entities/versions;
- the production snapshot is deterministically fingerprinted;
- any drift or collision blocks the handoff.

A later phase must re-check relevant revisions/snapshot assumptions before writing because production may change after the Phase 9B read. The manifest is evidence of a point-in-time preflight, not a lock or authorization to mutate production.
