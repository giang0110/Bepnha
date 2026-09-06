# Phase 9A Production Catalog Pack & Validator Design

## Status

Approved in chat for spec drafting on 2026-09-06. This document defines Phase 9A only. It does not authorize Phase 9B publishing, production catalog mutation, PR creation, merge, or deployment.

## Goal

Create a deterministic, offline validation pipeline for a real curated BepNha production catalog before any catalog data is written to Supabase. The pipeline must accept authoritative human-prepared catalog data, reject unsafe or incomplete content, produce a stable machine-readable readiness report, and never invent, infer, or repair authoritative nutrition, allergy, serving, recipe quantity, or price values.

## Non-goals

Phase 9A does not:

- write to Supabase or any other database;
- create, update, publish, retire, or delete catalog entities;
- resolve logical catalog codes to production UUIDs;
- reuse the local/CI catalog-readiness fixture as production seed data;
- call Gemini or any other LLM;
- scrape nutrition, prices, recipes, allergens, or serving sizes from the web;
- weaken planner, publication, allergy, price, or readiness rules;
- deploy to Vercel;
- add production secrets or service-role credentials;
- create a PR or merge the branch.

Phase 9B will later consume a Phase 9A-valid catalog pack and perform authenticated code-to-ID resolution and publication through the existing catalog-admin and meal-option-admin application paths.

## Governance and authority boundaries

The repository's deterministic domain remains authoritative. Phase 9A validates supplied data; it never authors authoritative data.

The validator must treat the following as human/source-owned facts and must not derive replacements when they are missing or invalid:

- serving/yield quantities;
- recipe ingredient quantities;
- nutrition values;
- edible fractions;
- allergen assessment statuses;
- food unit conversions;
- food and package prices;
- price source references and observation timestamps;
- meal-option composition;
- meal-option protein/style classification.

A missing authoritative value is a validation error, not an invitation to use a default. The only allowed normalization is non-semantic representation normalization such as stable ordering for reports. Input strings themselves are not silently trimmed, lower-cased, rounded, or rewritten.

## Input format decision

### Canonical Phase 9A format: JSON

Phase 9A standardizes one canonical source format: a single UTF-8 JSON document conforming to `CatalogPackV1`. JSON is chosen because recipes, steps, provenance, versioned food facts, meal-option components, and nested assessments are naturally hierarchical and can be reviewed without maintaining cross-file row identity.

CSV is intentionally not an executable Phase 9A input format. Spreadsheet owners may maintain source worksheets and export/transform them to `CatalogPackV1`, but a CSV adapter is deferred until there is a real worksheet layout to target. This avoids creating an arbitrary multi-CSV schema before the authoritative dataset exists. A future CSV adapter must produce the exact same `CatalogPackV1` object and pass the same validator; it must not introduce a second validation model.

### Production pack storage

The validator accepts an explicit path and does not assume a repository location. Real production packs are not committed automatically. Only synthetic test fixtures may be committed under `tests/fixtures/catalog-pack/`.

## CatalogPackV1 schema

Top-level object:

```ts
interface CatalogPackV1 {
  readonly schemaVersion: "1"
  readonly catalogCode: string
  readonly preparedAt: string
  readonly source: {
    readonly name: string
    readonly provenance: string
  }
  readonly foods: readonly CatalogPackFood[]
  readonly recipes: readonly CatalogPackRecipe[]
  readonly priceBook: CatalogPackPriceBook
  readonly mealOptions: readonly CatalogPackMealOption[]
}
```

All object schemas are strict: unknown keys are rejected. All identifiers ending in `Code` use `^[a-z][a-z0-9_]*$` unless otherwise specified. Human labels and provenance must already be trimmed; the validator rejects leading/trailing whitespace.

### Food and food-fact entries

```ts
interface CatalogPackFood {
  readonly code: string
  readonly nameVi: string
  readonly baseDimension: "mass" | "volume" | "count"
  readonly baseUnitCode: string
  readonly fact: {
    readonly versionNumber: number
    readonly categoryCode: string
    readonly categoryAncestry: readonly string[]
    readonly edibleFraction: string
    readonly provenance: string
    readonly allergenAssessments: readonly {
      readonly allergenCode: string
      readonly status: "absent" | "contains" | "may_contain" | "unknown"
      readonly provenance: string
    }[]
    readonly nutrients: readonly {
      readonly nutrientCode: string
      readonly amountPer100g: string
      readonly provenance: string
    }[]
    readonly dietaryTagCodes: readonly string[]
    readonly conversions: readonly {
      readonly unitCode: string
      readonly baseQuantityPerUnit: string
      readonly grossGramsPerUnit: string
      readonly displayStep: string
      readonly provenance: string
    }[]
  }
}
```

Food validation rules:

- `code` is unique across foods.
- `nameVi` is 1-120 Unicode characters after verifying it is already trimmed.
- `versionNumber` is a safe positive integer.
- `edibleFraction` is a canonical positive decimal greater than 0 and less than or equal to 1.
- `categoryAncestry` is non-empty, contains unique codes, starts with `categoryCode`, and ends with `food`.
- every provenance string is 1-500 Unicode characters and already trimmed.
- allergen codes are unique within a food fact.
- nutrient codes are unique within a food fact.
- dietary tag codes are unique.
- conversion unit codes are unique.
- every numeric conversion field is a canonical positive decimal.
- nutrient amounts are canonical non-negative decimals.

Phase 9A uses the launch reference policy established by the reviewed Phase 2 migration. Every food fact must contain exactly one assessment for each launch allergen code:

`peanut`, `tree_nut`, `dairy`, `egg`, `soy`, `wheat`, `fish`, `crustacean`, `mollusc`, `sesame`.

Every food fact must contain exactly one value for each nutrient currently marked required-for-publication by the reviewed migration:

`energy_kcal`, `protein_g`, `carbohydrate_g`, `fat_g`, `fibre_g`, `sodium_mg`.

Extra allergen or nutrient codes are rejected in Phase 9A because they cannot be resolved offline against production reference tables. Reference-set expansion requires a reviewed code/schema change first.

`unknown` is a valid explicit allergen assessment value, but it produces a readiness warning named `UNKNOWN_ALLERGEN_ASSESSMENT`; it is never converted to `absent`.

Known launch unit codes are `g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `item`. Known launch food category codes are `food`, `pork`, `beef`, `poultry`, `seafood`, `fish`, `crustacean`, `mollusc`, `egg`, `dairy`, `tofu`, `vegetable`, `staple`, `seasoning`. The validator rejects other unit/category codes until the reviewed reference schema is extended.

Base-unit dimension compatibility is validated offline:

- `g`, `kg` -> `mass`;
- `ml`, `l`, `tsp`, `tbsp` -> `volume`;
- `item` -> `count`.

### Recipe entries

```ts
interface CatalogPackRecipe {
  readonly code: string
  readonly nameVi: string
  readonly version: {
    readonly versionNumber: number
    readonly yieldAdultEquivalent: string
    readonly activeMinutes: number
    readonly elapsedMinutes: number
    readonly ingredients: readonly {
      readonly ingredientCode: string
      readonly foodCode: string
      readonly foodFactVersionNumber: number
      readonly quantity: string
      readonly unitCode: string
      readonly preparationNoteVi: string | null
      readonly order: number
    }[]
    readonly steps: readonly {
      readonly order: number
      readonly instructionVi: string
      readonly timerMinutes: number | null
      readonly ingredientCodes: readonly string[]
    }[]
    readonly tagCodes: readonly string[]
  }
}
```

Recipe validation rules:

- recipe codes are unique;
- recipe names are 1-120 Unicode characters and already trimmed;
- version numbers are safe positive integers;
- `yieldAdultEquivalent` and ingredient quantities are canonical positive decimals;
- `activeMinutes` is a positive safe integer;
- `elapsedMinutes` is a safe integer greater than or equal to `activeMinutes` and no greater than 180;
- each recipe contains at least one ingredient and one step;
- ingredient codes are unique within a recipe;
- ingredient order and step order are contiguous `1..N` with no gaps or duplicates;
- every `foodCode` resolves to exactly one food in the same pack;
- every `foodFactVersionNumber` equals the referenced food fact version in the same pack;
- every ingredient unit code is known and is present in the referenced food fact's conversions, unless it equals the referenced food's base unit code;
- every step ingredient code resolves to an ingredient in the same recipe;
- step ingredient references are unique within each step;
- each ingredient is referenced by at least one step;
- recipe tag codes are unique and syntactically valid;
- preparation notes are null or 1-160 trimmed Unicode characters;
- step instructions are 1-1000 trimmed Unicode characters.

Phase 9A does not invent recipe tag metadata. It validates tag-code syntax and cross-pack usage only. Exact tag-code-to-kind resolution against production reference rows is Phase 9B preflight responsibility.

### Price-book entries

```ts
interface CatalogPackPriceBook {
  readonly regionCode: "vn_baseline"
  readonly versionNumber: number
  readonly effectiveFrom: string
  readonly effectiveTo: string | null
  readonly prices: readonly {
    readonly foodCode: string
    readonly foodFactVersionNumber: number
    readonly packageQuantity: string
    readonly packageUnitCode: string
    readonly packageBaseQuantity: string
    readonly baseUnitCode: string
    readonly packagePriceVnd: number
    readonly purchaseIncrement: string
    readonly observedAt: string
    readonly sourceReference: string
  }[]
}
```

Price validation rules:

- Phase 9A accepts only launch region `vn_baseline`;
- version number is a safe positive integer;
- effective dates are strict `YYYY-MM-DD` calendar dates; `effectiveTo` is null or not earlier than `effectiveFrom`;
- `(foodCode, foodFactVersionNumber)` price rows are unique;
- every food/version reference resolves inside the pack;
- package and purchase quantities are canonical positive decimals;
- `packagePriceVnd` is a positive safe integer; no floating VND value is accepted;
- `packageUnitCode` and `baseUnitCode` are known launch unit codes;
- `baseUnitCode` equals the referenced food's base unit code;
- `observedAt` is an RFC 3339 timestamp with an explicit timezone offset or `Z`;
- `sourceReference` is 1-500 trimmed Unicode characters and must not be a placeholder such as `unknown`, `n/a`, `na`, `todo`, or `tbd` case-insensitively.

Every food referenced by a recipe used by a meal option must have a usable price row. Foods not reachable from any meal option may exist without a price but produce warning `UNUSED_FOOD_WITHOUT_PRICE` rather than a blocker.

### Meal-option entries

```ts
interface CatalogPackMealOption {
  readonly code: string
  readonly nameVi: string
  readonly version: {
    readonly versionNumber: number
    readonly yieldAdultEquivalent: string
    readonly activeMinutes: number
    readonly elapsedMinutes: number
    readonly proteinHintCode: string
    readonly cookingStyleCodes: readonly string[]
    readonly dishRoleCodes: readonly string[]
    readonly components: readonly {
      readonly recipeCode: string
      readonly recipeVersionNumber: number
      readonly quantityMultiplier: string
      readonly mealRole: "staple" | "main" | "vegetable" | "soup" | "side"
      readonly order: number
    }[]
  }
}
```

Meal-option validation rules:

- meal-option codes are unique;
- names are 1-120 Unicode characters and already trimmed;
- version number is a safe positive integer;
- yield and quantity multipliers are canonical positive decimals;
- active/elapsed minutes follow the same constraints as existing meal-option admin validation;
- each meal option contains at least one component and at least one `main` component;
- component recipe codes are unique within a meal option;
- component order is contiguous `1..N`;
- recipe/version references resolve inside the pack;
- exactly one non-empty `proteinHintCode` is supplied;
- at least one unique `cookingStyleCode` is supplied;
- dish-role codes are unique;
- tag codes must match the standard catalog code pattern.

The pack stores protein/style codes explicitly because Phase 9A must evaluate launch diversity without querying Supabase. Phase 9B must verify that these codes resolve to recipe-tag rows of the expected kind before writing anything.

## Validation layers

The validator runs four deterministic layers in order and accumulates all diagnostics where safe instead of failing at the first semantic issue.

### Layer 1: parse and strict shape

- valid UTF-8 JSON;
- top-level object only;
- `schemaVersion === "1"`;
- strict Zod schemas reject unknown keys and wrong primitive types;
- no coercion from strings to numbers or vice versa.

If Layer 1 cannot produce a typed pack, Layers 2-4 do not run.

### Layer 2: field invariants

Validates code syntax, labels, canonical decimal syntax/ranges, timestamps, date ordering, list uniqueness, contiguous order fields, supported reference codes, and per-entity completeness.

### Layer 3: graph and lineage invariants

Validates all pack-internal references and version pins:

- recipe -> food/fact version;
- recipe step -> recipe ingredient;
- meal option -> recipe version;
- meal option -> recipe -> food -> price;
- base-unit and conversion compatibility.

No implicit "latest version" lookup is allowed; all version references are explicit and exact.

### Layer 4: launch-pack readiness

Produces a deterministic readiness summary without pretending to replace the existing runtime planner readiness evaluator.

Pack-level blockers:

- `MINIMUM_MEAL_OPTIONS_NOT_MET` when fewer than 21 valid meal options exist;
- `INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY` when fewer than 3 distinct `proteinHintCode` values exist across valid meal options;
- `CATALOG_LINEAGE_INCOMPLETE` for any unresolved required graph edge;
- `PRICE_COVERAGE_INCOMPLETE` when any food reachable from a meal option lacks a usable price row;
- `REQUIRED_NUTRITION_COVERAGE_INCOMPLETE` when any food lacks one of the six required nutrients;
- `ALLERGEN_COVERAGE_INCOMPLETE` when any food lacks one of the ten launch allergen assessments;
- `REFERENCE_CODE_UNSUPPORTED` when a pack uses a unit/category/reference value Phase 9A cannot resolve safely offline.

Warnings do not change readiness on their own. Initial warnings:

- `UNKNOWN_ALLERGEN_ASSESSMENT`;
- `UNUSED_FOOD_WITHOUT_PRICE`;
- `UNUSED_RECIPE`;
- `UNUSED_FOOD`.

Phase 9A deliberately does not reproduce household-specific allergy/vegetarian eligibility scenarios. After Phase 9B publishes a catalog, the existing `evaluateCatalogReadiness` flow remains the authoritative launch gate for planner-specific scenarios and its existing threshold of 21 eligible meal options remains unchanged.

## Diagnostics contract

```ts
type CatalogPackDiagnosticSeverity = "error" | "warning"

interface CatalogPackDiagnostic {
  readonly severity: CatalogPackDiagnosticSeverity
  readonly code: string
  readonly path: string
  readonly message: string
}

interface CatalogPackValidationReport {
  readonly schemaVersion: "1"
  readonly inputSha256: string
  readonly catalogCode: string | null
  readonly valid: boolean
  readonly ready: boolean
  readonly summary: {
    readonly foods: number
    readonly recipes: number
    readonly priceRows: number
    readonly mealOptions: number
    readonly primaryProteinGroups: number
    readonly reachableFoods: number
    readonly pricedReachableFoods: number
  }
  readonly blockers: readonly string[]
  readonly diagnostics: readonly CatalogPackDiagnostic[]
}
```

The report is stable for identical input bytes and validator version:

- SHA-256 is calculated from the original input bytes;
- diagnostics are sorted by `severity`, `code`, `path`, then `message`;
- blocker codes are deduplicated and lexicographically sorted;
- no current timestamp is written into the report;
- no random IDs are generated;
- no environment-specific UUIDs appear.

`valid` means strict shape, field, and graph validation produced no errors. `ready` means `valid === true` and no launch-pack blocker exists.

## CLI contract

Add command:

```bash
npm run catalog:validate -- --input <path-to-pack.json>
```

Optional report output:

```bash
npm run catalog:validate -- --input <path-to-pack.json> --report <path-to-report.json>
```

Behavior:

- stdout prints the same canonical JSON report that is optionally written to `--report`;
- stderr is reserved for I/O or invocation errors;
- the command never prompts and never accesses the network or Supabase;
- the command never prints environment variables or secrets.

Exit codes:

- `0`: pack is valid and ready;
- `2`: validation errors exist (`valid === false`);
- `3`: pack is structurally/semantically valid but launch readiness blockers exist (`valid === true`, `ready === false`);
- `1`: CLI usage, file I/O, or unexpected internal failure.

The implementation may add a dev-only TypeScript runner if needed, but must not add a production runtime dependency solely for the CLI.

## File boundaries

Expected Phase 9A units:

- `src/application/catalog-pack/catalog-pack.ts` — public V1 TypeScript data contracts and diagnostic/report types;
- `src/application/catalog-pack/catalog-pack-schema.ts` — strict Zod parsing and supported launch reference constants;
- `src/application/catalog-pack/validate-catalog-pack.ts` — deterministic field/graph validation and report assembly;
- `src/application/catalog-pack/catalog-pack-readiness.ts` — pack-level reachability, coverage, and launch blocker evaluation;
- `scripts/catalog-validate.ts` — thin filesystem/CLI adapter only; no validation rules live here;
- focused unit tests next to application modules;
- `tests/fixtures/catalog-pack/` — synthetic valid/invalid packs only;
- `package.json` — `catalog:validate` script and, only if required, one dev-only TS execution dependency.

The validator must not import Supabase clients, server runtime configuration, Gemini code, or browser code.

## Testing strategy

Implementation must be TDD and include at least these behaviors:

1. minimal synthetic valid pack parses and validates deterministically;
2. unknown JSON fields are rejected;
3. duplicate food/recipe/meal-option codes are rejected;
4. non-canonical decimals are rejected rather than rounded;
5. missing one required nutrient blocks validation;
6. missing one required allergen assessment blocks validation;
7. explicit `unknown` allergen status remains unchanged and produces warning;
8. category ancestry that does not start at the selected category and end at `food` is rejected;
9. base-unit dimension mismatch is rejected;
10. recipe ingredient referencing missing food/version is rejected;
11. recipe ingredient unit without a usable conversion/base-unit match is rejected;
12. step references to missing ingredients are rejected;
13. meal-option references to missing recipe/version are rejected;
14. reachable food without price produces `PRICE_COVERAGE_INCOMPLETE`;
15. fewer than 21 valid meal options produces `MINIMUM_MEAL_OPTIONS_NOT_MET`;
16. fewer than 3 protein hints produces `INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY`;
17. identical input bytes produce byte-identical canonical report output;
18. CLI returns 0, 2, 3, and 1 for the documented classes of result;
19. CLI never requires Supabase environment variables or network access;
20. existing `verify:web` and non-database test gates remain green.

No test may use the current `catalog-readiness.integration.test.ts` synthetic nutrition/price values as production data. Shared test helpers may be synthetically generated but must be clearly labeled fixture-only.

## Security and privacy

- no secrets are accepted in the pack schema;
- source references/provenance are treated as data and echoed only into diagnostics when necessary; reports should prefer JSON paths and codes over reproducing long source text;
- the validator never transmits pack contents;
- input paths are explicit; no recursive filesystem discovery;
- report writes must replace only the exact user-supplied report path and must not mutate the input file;
- no executable content from the pack is evaluated.

## Compatibility with existing domain paths

Phase 9A intentionally mirrors the existing catalog-admin data requirements but does not bypass them. The later Phase 9B mapper will translate logical codes in a valid `CatalogPackV1` into the existing commands:

- `create_food`;
- `save_food_fact_draft`;
- `publish_food_fact`;
- `create_recipe`;
- `save_recipe_version_draft`;
- `publish_recipe`;
- `create_price_book`;
- `save_price_book_draft`;
- `publish_price_book`;
- meal-option create/save/publish commands.

Phase 9B must still call the existing application command handlers so their validation, content hashing, revision guards, publication completeness checks, and audit behavior remain authoritative.

## Acceptance criteria

Phase 9A implementation is complete only when:

- a documented `CatalogPackV1` schema exists in code;
- the validator is deterministic and offline;
- all authoritative numeric/safety fields are validated but never synthesized;
- required launch allergen/nutrient/reference sets match the reviewed migration;
- graph lineage and reachable price coverage are validated;
- pack-level 21-meal-option and 3-protein-hint gates are enforced without weakening existing planner readiness rules;
- CLI exit codes and canonical report format match this spec;
- focused unit/CLI tests pass;
- repository `verify:web` passes on the exact implementation head;
- no Supabase schema or production catalog mutation occurs;
- no Vercel deployment occurs;
- no PR or merge occurs without separate explicit authorization.
