# Phase 9C Production Catalog Mutation Planner Design

## Status

Approach A approved in chat on 2026-09-07. This document defines Phase 9C only. The written spec still requires user review before an implementation plan is created. It does not authorize production catalog mutation, production migrations, deployment, PR creation, or merge.

## Goal

Build a deterministic, fail-closed, offline production catalog mutation planner that consumes the exact `CatalogPackV1` bytes validated by Phase 9A together with the exact `ResolvedCatalogManifestV1` produced by Phase 9B and emits a stable `CatalogMutationPlanV1`.

The plan describes what a later executor would need to do through the existing catalog-admin and meal-option-admin application paths, in dependency-safe order, without performing any production I/O and without inventing production UUIDs.

Phase 9C is a planning boundary only. It must never create, update, publish, retire, delete, query, or deploy production state.

## Why Phase 9C is separate

Phase 9A proves that the source catalog pack is internally coherent and launch-ready. Phase 9B proves that the pack can be reconciled with the current production reference and identity state, and records real UUIDs only where those UUIDs already exist.

The next safety problem is different: translating that reviewed pack plus manifest into an exact ordered sequence of application-layer operations while preserving unresolved production identities until execution time.

Combining planning and execution would make it harder to review exactly what production writes are intended before those writes become reachable. Phase 9C therefore creates a dry-run artifact that can be inspected, hashed, tested, and separately approved before any Phase 9D executor is allowed to mutate production.

## Non-goals

Phase 9C does not:

- call Supabase, Vercel, HTTP admin endpoints, RPCs, or any remote service;
- read `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, Gemini credentials, or deployment configuration;
- create database rows, drafts, publications, retirements, or schema changes;
- allocate or predict production identity UUIDs;
- allocate final version UUIDs inside the dry-run artifact;
- reuse or overwrite an existing version collision;
- infer a new version number when the requested version is unavailable;
- reinterpret Phase 9A nutrition, allergy, conversion, recipe, price, serving, or meal-option facts;
- repair a Phase 9B reference drift or identity conflict;
- emit SQL, database migration scripts, direct PostgREST writes, or direct RPC plans;
- execute, resume, retry, rollback, or compensate for partial production writes;
- create or merge a pull request;
- deploy to Vercel.

A later Phase 9D may execute an approved plan through the existing application commands. Production mutation remains a separate explicit approval gate.

## Existing application contracts that Phase 9C must target

The planner targets the existing application command boundaries rather than database tables.

Catalog commands currently include:

- `create_food`;
- `save_food_fact_draft`;
- `publish_food_fact`;
- `create_recipe`;
- `save_recipe_version_draft`;
- `publish_recipe`;
- `create_price_book`;
- `save_price_book_draft`;
- `publish_price_book`.

Meal-option commands currently include:

- `create_meal_option`;
- `save_meal_option_version_draft`;
- `publish_meal_option`.

Retire commands exist but are intentionally excluded from Phase 9C. The launch pack represents additive creation/publication, not destructive lifecycle management.

The current repositories establish an important distinction:

- new food, recipe, meal-option, and price-book identities receive their production IDs from their create operations;
- food-fact, recipe-version, and meal-option-version save commands accept an explicit version ID supplied by the caller;
- recipe ingredient, recipe step, meal-option component, and similar child-row IDs may be generated internally by the existing repositories and are not stable external plan dependencies.

Therefore Phase 9C must model unresolved identity outputs and executor-time version-ID allocation explicitly rather than fabricate UUID strings in the dry run.

## Chosen architecture

```text
CatalogPackV1 exact bytes
        |
        v
Phase 9A validation replay
        |
        +------------------------------+
        | valid + ready                |
        v                              |
ResolvedCatalogManifestV1 bytes        |
        |                              |
        v                              |
Manifest strict parse + integrity gate |
        |                              |
        v                              |
Pack/manifest cross-check  <------------+
        |
        v
Pure Mutation Planner
        |
        v
CatalogMutationPlanV1
```

The planner has four conceptual responsibilities:

1. **Source gate** — replay Phase 9A against the exact pack bytes and require `valid=true` and `ready=true`.
2. **Manifest gate** — strictly parse the Phase 9B manifest, require `resolved=true`, and reject any error diagnostic, collision, conflict, missing reference UUID, malformed state, or unsupported schema version.
3. **Integrity gate** — require catalog code and Phase 9A input SHA to match the manifest; verify every logical identity/version/reference used by the plan is represented consistently by both artifacts.
4. **Pure plan construction** — produce a canonical operation DAG and a stable linear execution order without network, environment, clock, randomness, or production mutation.

## Inputs

The Phase 9C CLI accepts two explicit files:

- the original Phase 9A catalog pack;
- the Phase 9B resolved manifest for that exact pack and production snapshot.

The planner never accepts a manifest without the pack because command payloads contain authoritative source values that must come from the reviewed `CatalogPackV1`, not from a reduced resolver artifact.

The planner never accepts only a pack because existing production identity/reference UUIDs must come from Phase 9B rather than from seeded fixture assumptions.

## Integrity and tamper checks

Phase 9C fails closed unless all of the following hold:

- Phase 9A replay succeeds and reports `valid=true` and `ready=true`;
- manifest schema version is supported;
- manifest `resolved=true`;
- manifest contains zero error diagnostics;
- manifest `catalogCode` equals the pack `catalogCode` exactly;
- manifest `inputSha256` equals SHA-256 of the exact input pack bytes;
- every required reference resolved by Phase 9B has a non-empty real production UUID;
- each food, recipe, price-book, and meal-option target in the pack has exactly one matching manifest target;
- identity/version state combinations are allowed by Phase 9C;
- requested version numbers match exactly between pack and manifest;
- recipe-tag semantic/canonical mappings in the manifest cover every tag used by the pack;
- no production UUID appears in a logical slot that Phase 9B marked as missing or pending creation.

`productionSnapshotSha256` is carried into the plan as provenance but is not recomputed in Phase 9C because Phase 9C performs zero production reads. The executor must later decide whether a stale snapshot requires a fresh Phase 9B resolution before execution.

## Allowed identity/version states

Phase 9C supports only states that represent additive work.

### Food, recipe, and meal-option identity

Allowed:

- `existing` with a real production identity UUID;
- `missing` with `id: null`.

Rejected:

- `conflict`;
- retired/incompatible states;
- any unknown future state.

### Requested versions

Allowed:

- `missing` under an existing parent identity;
- `pending_parent_creation` under a missing parent identity.

Rejected:

- `collision` / `VERSION_ALREADY_EXISTS`;
- any non-null production version UUID for a version that is supposed to be new;
- unknown future states.

A resolved Phase 9B manifest should already have blocked conflicts/collisions. Phase 9C validates these invariants again because the plan artifact is a separate safety boundary.

## Symbolic references

`CatalogMutationPlanV1` uses typed symbolic references wherever execution-time values do not yet exist.

Examples:

- `identity:food:chicken_thigh`;
- `version:food_fact:chicken_thigh:1`;
- `identity:recipe:ga_kho_gung`;
- `version:recipe:ga_kho_gung:1`;
- `identity:price_book:vn_baseline:1`;
- `identity:meal_option:com_ga_rau:1`;
- `version:meal_option:com_ga_rau:1`.

A symbolic reference is a logical handle, not a UUID-shaped placeholder. It must never match the UUID lexical form and must never be passed directly to the existing application commands.

For existing production rows, the plan may embed the real Phase 9B UUID as an immutable resolved reference.

For new identity rows, the corresponding create operation produces a named output handle. Later operations depend on that output.

For new food-fact, recipe-version, and meal-option-version rows, the plan records an `allocate_uuid` requirement owned by the future executor. Phase 9C does not generate the UUID. Phase 9D must allocate a real UUID immediately before the first save of that version and bind it to the symbolic version handle for the rest of that execution.

Child IDs that the existing repositories generate internally are not represented as executor-visible mutation-plan outputs unless the application command contract explicitly requires them. Recipe ingredient logical IDs used only to connect recipe steps remain deterministic local handles inside the `save_recipe_version_draft` payload template and may be translated by the executor without pretending they are production row UUIDs.

## Operation model

Each planned operation has a stable `operationId`, `kind`, dependencies, input template, and expected outputs.

Conceptually:

```ts
interface CatalogMutationPlanOperationV1 {
  readonly operationId: string
  readonly kind:
    | "create_food"
    | "save_food_fact_draft"
    | "publish_food_fact"
    | "create_recipe"
    | "save_recipe_version_draft"
    | "publish_recipe"
    | "create_price_book"
    | "save_price_book_draft"
    | "publish_price_book"
    | "create_meal_option"
    | "save_meal_option_version_draft"
    | "publish_meal_option"
  readonly dependsOn: readonly string[]
  readonly input: unknown
  readonly outputs: readonly MutationPlanOutputBinding[]
}
```

The exact TypeScript shape belongs in the implementation plan, but the semantic contract is fixed by this design.

## Dependency graph and execution order

The planner constructs a DAG first, then emits one canonical topological order.

The required dependency rules are:

1. Every missing food identity must be created before its food-fact draft can be saved.
2. Every food-fact draft must be saved before that food fact can be published.
3. Every recipe version may be saved only after all referenced food identities and exact food-fact versions have production IDs available and the food-fact versions required for publication have been published.
4. Every recipe version must be published before a meal-option version that references it can be published; Phase 9C orders recipe publication before meal-option draft construction to keep the execution plan conservative and easy to audit.
5. The price book may be created only after the target region reference is resolved; its draft may be saved only after all referenced food/fact IDs are available and required food facts are published.
6. Every meal-option identity must exist before its version draft is saved.
7. Every meal-option version draft requires exact recipe identity/version UUIDs and all resolved tag UUIDs.
8. Every meal-option version must be saved before publication.

Canonical phase buckets are therefore:

1. create missing food identities;
2. save food-fact drafts;
3. publish food facts;
4. create missing recipe identities;
5. save recipe-version drafts;
6. publish recipes;
7. create price book;
8. save price-book draft;
9. publish price book;
10. create missing meal-option identities;
11. save meal-option-version drafts;
12. publish meal options.

Within a bucket, operations are sorted by stable logical key: entity code, then requested version number, then operation kind. The resulting order must not depend on source array order or object insertion order.

If a valid DAG cannot be produced, planning fails rather than silently dropping or reordering a dependency.

## Existing identities

If Phase 9B marks a food, recipe, or meal-option identity as `existing` and compatible, Phase 9C does not emit its corresponding create operation. All dependent operations bind directly to the real production UUID from the manifest.

If the identity is `missing`, Phase 9C emits exactly one create operation and all dependent operations refer to that create operation's output handle.

The planner never emits a rename, retire, repair, or identity update.

## Draft revision semantics

New food-fact, recipe-version, and meal-option-version save commands require a positive `expectedRevision` even when the executor-supplied version UUID does not yet exist. Current repository insert paths do not compare that value on first insert, while application validation requires it to be a positive safe integer.

Phase 9C therefore fixes the first-save contract at `expectedRevision: 1` for every new version draft. This is a command-validation value for the not-yet-existing version, not a claim that production already contains revision 1.

After the first save succeeds, every later operation must use the exact `revision` returned by the preceding authoritative command result. In particular, publication must use the revision returned by the save operation, never the literal `1` from the first-save template and never a stale revision copied from Phase 9B.

`create_price_book` returns the real price-book ID and revision. `save_price_book_draft` must use that returned ID and revision, and `publish_price_book` must use the revision returned by the save.

A future executor must never reuse a revision embedded from an earlier production snapshot when a preceding operation in the same execution has returned a newer authoritative revision.

## Payload construction rules

All authoritative content values come from `CatalogPackV1` exactly as validated by Phase 9A.

All production reference UUIDs come from `ResolvedCatalogManifestV1` exactly as resolved by Phase 9B.

Examples:

- food `baseUnitId` comes from the resolved unit reference;
- food-fact `categoryId` comes from the resolved category reference;
- food-fact conversion `unitId` comes from the resolved unit reference;
- recipe ingredient `foodId`, `foodFactVersionId`, and `unitId` bind through existing UUIDs or symbolic outputs;
- recipe `tagIds` come from Phase 9B canonical recipe-tag mappings;
- price rows bind food, fact, package-unit, base-unit, and price-region references without reinterpretation;
- meal-option components bind exact recipe identity/version references from the same plan;
- meal-option tag IDs come from resolved protein/style/dish-role mappings.

Phase 9C never normalizes, trims, rounds, translates, enriches, or substitutes source values beyond stable structural ordering required for deterministic output.

## CatalogMutationPlanV1

The plan is a machine-readable JSON document with this conceptual shape:

```ts
interface CatalogMutationPlanV1 {
  readonly schemaVersion: "1"
  readonly catalogCode: string
  readonly inputSha256: string
  readonly resolvedManifestSha256: string
  readonly productionSnapshotSha256: string
  readonly executable: boolean
  readonly operations: readonly CatalogMutationPlanOperationV1[]
  readonly bindings: readonly MutationPlanBindingV1[]
  readonly diagnostics: readonly CatalogMutationPlanDiagnostic[]
}
```

`resolvedManifestSha256` is calculated from the exact manifest bytes supplied to Phase 9C. This binds the plan to a reviewed Phase 9B artifact, not merely to its parsed semantic content.

`executable=true` means only that Phase 9C found a complete, deterministic, internally consistent dry-run plan. It does **not** authorize execution and does not mean the production snapshot is still current.

## Determinism and canonical output

The same exact pack bytes and same exact manifest bytes must produce byte-equivalent plan output.

Rules:

- hash exact pack bytes and exact manifest bytes;
- never include current time, hostname, process ID, environment values, request IDs, random UUIDs, query latency, or secrets;
- construct symbolic handles from stable logical codes/version numbers only;
- sort bindings and diagnostics canonically;
- build a DAG and use a deterministic topological ordering with stable tie breakers;
- canonicalize JSON output using the repository's existing canonical JSON rules where appropriate;
- preserve source decimal strings and date strings exactly.

## Diagnostics

Required stable diagnostic categories include:

- `PHASE_9A_INVALID`;
- `PHASE_9A_NOT_READY`;
- `MANIFEST_INVALID`;
- `MANIFEST_NOT_RESOLVED`;
- `INPUT_SHA_MISMATCH`;
- `CATALOG_CODE_MISMATCH`;
- `REFERENCE_MISSING`;
- `REFERENCE_STATE_INVALID`;
- `IDENTITY_STATE_INVALID`;
- `VERSION_STATE_INVALID`;
- `MANIFEST_TARGET_MISSING`;
- `MANIFEST_TARGET_DUPLICATE`;
- `DEPENDENCY_MISSING`;
- `DEPENDENCY_CYCLE`;
- `UNSUPPORTED_OPERATION`.

Diagnostics include a stable JSON-path-like path and deterministic message. No vendor/network error category is required because Phase 9C performs zero external I/O after local file reads.

The exact final diagnostic enum may use clearer names during implementation, but it must preserve these semantic distinctions and remain stable once committed.

## CLI contract

Phase 9C adds a Node 24 CLI conceptually:

```bash
npm run catalog:plan -- --input /secure/catalog.json --manifest /secure/catalog.resolved.json --output /secure/catalog.plan.json
```

Rules:

- `--input` is required;
- `--manifest` is required;
- `--output` is optional;
- without `--output`, canonical JSON is written to stdout;
- operational errors go to stderr only;
- no environment credential is required or read;
- no confirmation prompt is needed because the command cannot write production state;
- real production packs, manifests, and plans are never committed automatically;
- unreadable input/output paths fail closed;
- non-executable plans return a non-zero exit code;
- output file bytes must equal stdout bytes for the same successful planning result.

Numeric exit codes belong in the implementation plan/tests, but success, validation/integrity failure, dependency/graph failure, and local I/O/usage failure must remain distinguishable.

## Security and privacy

- Phase 9C must contain no Supabase client construction and no HTTP client construction.
- It must not import the production Supabase adapters from Phase 9B or the mutation repositories used by the application runtime.
- It must not read server secrets or browser-visible credentials.
- Plan artifacts may contain production UUIDs already present in the Phase 9B manifest and should be treated as operational artifacts.
- Plan artifacts must not contain bearer tokens, project URLs, secret keys, database passwords, vendor errors, or user/household data.
- The plan contains catalog content only; it must not query or include household, auth, plan, shopping, pantry, or assistant data.

## Testing strategy

### Planner unit tests

Use synthetic packs/manifests to prove:

- existing identity skips create and binds its real UUID;
- missing identity emits exactly one create and dependent symbolic binding;
- new version uses an executor-time UUID allocation binding, never a fake UUID in the plan;
- first save of each new version uses the fixed `expectedRevision: 1` contract;
- every later revision comes from the preceding operation result binding;
- food facts are saved/published before dependent recipes;
- recipes are published before dependent meal options;
- price-book operations bind the exact region and food/fact/unit references;
- recipe tags and meal-option tags use Phase 9B canonical mappings;
- source array shuffling does not change canonical output bytes;
- duplicate/missing targets fail closed;
- conflict/collision/unknown states fail closed;
- missing references fail closed;
- dependency cycles fail closed;
- symbolic handles never satisfy the UUID lexical pattern.

### Integrity tests

Prove:

- one-byte pack mutation after Phase 9B produces `INPUT_SHA_MISMATCH`;
- mismatched catalog code fails;
- `resolved=false` fails;
- injected error diagnostics fail;
- tampered reference UUID/state combinations fail;
- manifest target version mismatches fail;
- unsupported schema versions fail.

### CLI tests

Spawn the CLI with temporary local files and prove:

- valid pack + manifest emits deterministic canonical JSON and exit 0;
- invalid/not-ready pack fails before planning;
- malformed/unresolved/tampered manifest returns non-zero;
- unreadable file or invalid usage returns the local I/O/usage exit category;
- explicit output bytes match stdout bytes for the same plan;
- stdout remains machine-readable;
- no production environment variables are required;
- no network call is made.

### Static zero-I/O tests

Add focused tests or import-boundary assertions proving the planner/CLI does not import:

- `@supabase/supabase-js`;
- Phase 9B Supabase production reader;
- catalog/meal-option Supabase mutation repositories;
- Vercel runtime handlers;
- network/HTTP client modules.

Normal CI remains fully offline for Phase 9C.

## Verification gate

Before Phase 9C can be declared complete:

- focused Phase 9C tests pass;
- Prettier passes;
- ESLint passes;
- TypeScript typecheck passes;
- the full web verification relevant to this repository passes;
- the exact final feature-branch HEAD receives green GitHub Actions evidence required by `AGENTS.md` when local database verification is unavailable or when CI is part of the phase gate;
- the final diff contains only Phase 9C work;
- no Supabase/Vercel production mutation or deployment occurred.

## Phase 9D handoff contract

Phase 9D is intentionally deferred and requires a separate approved design plus explicit production-mutation authorization before any real write occurs.

A future Phase 9D executor should consume a reviewed `CatalogMutationPlanV1` and must at minimum:

- bind symbolic identity outputs to real IDs returned by create commands;
- allocate real UUIDs at execution time for new food-fact, recipe-version, and meal-option-version rows whose current command contracts require caller-supplied IDs;
- use `expectedRevision: 1` only for the first save of a newly allocated version UUID and then use revisions returned by preceding commands;
- call only existing application-layer catalog/meal-option commands, not direct table writes invented by the executor;
- stop immediately on any failed operation;
- record an execution journal sufficient to diagnose partial progress;
- require a freshness policy for the Phase 9B production snapshot before first write;
- define a deliberate resume/partial-failure policy rather than assuming rollback across many application calls;
- never auto-retire or overwrite unrelated production catalog content.

Those execution semantics are outside Phase 9C and must not be implemented early.

## Exit criteria

Phase 9C is complete when an exact Phase 9A-ready pack and exact Phase 9B-resolved manifest can be transformed offline into a deterministic, reviewable, dependency-safe `CatalogMutationPlanV1` that contains no fake production UUIDs, performs no production I/O, and clearly distinguishes resolved production references from execution-time symbolic outputs.
