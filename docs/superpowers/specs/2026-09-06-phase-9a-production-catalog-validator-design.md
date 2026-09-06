# Phase 9A Production Catalog Pack & Validator Design

## Status

Approved in chat for spec drafting on 2026-09-06. This document defines Phase 9A only. It does not authorize Phase 9B publishing, production catalog mutation, PR creation, merge, or deployment.

## Goal

Create a deterministic, offline validation pipeline for a real curated BepNha production catalog before any catalog data is written to Supabase. The pipeline accepts authoritative human-prepared catalog data, rejects unsafe or incomplete content, produces a stable machine-readable readiness report, and never invents, infers, repairs, rounds, or substitutes authoritative nutrition, allergy, serving, recipe quantity, conversion, or price values.

## Non-goals

Phase 9A does not:

- write to Supabase or any other database;
- create, update, publish, retire, or delete catalog entities;
- resolve logical catalog codes to production UUIDs;
- reuse the local/CI `catalog-readiness.integration.test.ts` fixture as production seed data;
- call Gemini or any other LLM;
- scrape nutrition, prices, recipes, allergens, or serving sizes from the web;
- weaken planner, publication, allergy, price, or readiness rules;
- deploy to Vercel;
- add production secrets or service-role credentials;
- create a PR or merge the branch.

Phase 9B may later consume a Phase 9A-valid catalog pack and perform authenticated code-to-ID resolution and publication through the existing catalog-admin and meal-option-admin application paths.

## Governance and authority boundaries

The repository's deterministic domain remains authoritative. Phase 9A validates supplied data; it never authors authoritative data.

The validator treats these as human/source-owned facts and never derives replacements when they are missing or invalid:

- serving/yield quantities;
- recipe ingredient quantities;
- nutrition values;
- edible fractions;
- allergen assessment statuses;
- food unit conversions;
- food and package prices;
- price source references and observation dates;
- meal-option composition;
- meal-option protein/style classification.

A missing authoritative value is an error or launch blocker, not an invitation to use a default. Input strings are never silently trimmed, lower-cased, rounded, or rewritten. Stable sorting is allowed only for report output and internal comparisons.

## Input format decision

### Canonical Phase 9A format: JSON

Phase 9A standardizes one canonical source format: a single UTF-8 JSON document conforming to `CatalogPackV1`. JSON is used because recipes, steps, provenance, versioned food facts, and meal-option components are hierarchical and can be reviewed without inventing cross-file row identifiers.

CSV is not an executable Phase 9A input format. Spreadsheet owners may maintain source worksheets and transform them to `CatalogPackV1`, but a CSV adapter is deferred until there is a real authoritative worksheet layout to target. Any future CSV adapter must produce the exact same `CatalogPackV1` object and pass the same validator; it must not introduce a second validation model.

### Production pack storage

The CLI accepts an explicit input path and assumes no repository location. Real production packs are not committed automatically. Only synthetic fixture data may be committed under `tests/fixtures/catalog-pack/`.

## CatalogPackV1 schema

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

All object schemas are strict: unknown keys are rejected. Identifiers ending in `Code` use `^[a-z][a-z0-9_]*$` unless a narrower enum is specified. Human labels, source references, and provenance must already be trimmed.

Top-level rules:

- `catalogCode` matches the catalog code pattern and is 1-80 characters;
- `preparedAt` is a valid RFC 3339 timestamp with explicit timezone offset or `Z`;
- `source.name` is 1-120 trimmed Unicode characters;
- `source.provenance` is 1-500 trimmed Unicode characters;
- every top-level array/object is present; no field is synthesized.

## Launch reference policy

Phase 9A is offline, so it uses an explicit launch reference policy copied from the reviewed repository domain/migration. Unsupported reference codes are validation errors; the validator never guesses a nearest value.

### Units

| Code | Dimension |
| --- | --- |
| `g` | `mass` |
| `kg` | `mass` |
| `ml` | `volume` |
| `l` | `volume` |
| `tsp` | `volume` |
| `tbsp` | `volume` |
| `item` | `count` |

### Food category ancestry

The selected category must use exactly the following leaf-to-root ancestry sequence:

| Category | Required ancestry |
| --- | --- |
| `food` | `food` |
| `pork` | `pork`, `food` |
| `beef` | `beef`, `food` |
| `poultry` | `poultry`, `food` |
| `seafood` | `seafood`, `food` |
| `fish` | `fish`, `seafood`, `food` |
| `crustacean` | `crustacean`, `seafood`, `food` |
| `mollusc` | `mollusc`, `seafood`, `food` |
| `egg` | `egg`, `food` |
| `dairy` | `dairy`, `food` |
| `tofu` | `tofu`, `food` |
| `vegetable` | `vegetable`, `food` |
| `staple` | `staple`, `food` |
| `seasoning` | `seasoning`, `food` |

### Allergens

Every food fact must contain exactly one assessment for each supported launch allergen:

`peanut`, `tree_nut`, `dairy`, `egg`, `soy`, `wheat`, `fish`, `crustacean`, `mollusc`, `sesame`.

Although the database enum contains `unknown`, the current deterministic domain rejects `unknown` lineage for publication/readiness. Therefore Phase 9A treats any `unknown` allergen assessment as validation error `UNKNOWN_ALLERGEN_LINEAGE`; it is never converted to `absent`.

### Required nutrients

Every food fact must contain exactly one value for each currently required nutrient:

`energy_kcal`, `protein_g`, `carbohydrate_g`, `fat_g`, `fibre_g`, `sodium_mg`.

Extra allergen or nutrient codes are rejected in Phase 9A because they cannot be resolved safely offline against a reviewed production reference set.

### Dietary tags

The only supported launch dietary tag is `vegetarian`. An empty list is valid. Duplicate or unsupported dietary tags are errors.

### Price region

The only supported launch price region is `vn_baseline`.

## Decimal rules

Phase 9A uses the same canonical-decimal constraints as the existing domain rather than JavaScript floating-point coercion.

- `edibleFraction`: canonical decimal, scale <= 6, integer digits <= 1, `0 < value <= 1`;
- nutrient `amountPer100g`: canonical decimal, scale <= 6, integer digits <= 12, value >= 0;
- yield, recipe quantity, conversion quantity, package quantity, package base quantity, purchase increment, and meal-option multiplier: canonical decimal, scale <= 18, integer digits <= 34, value > 0.

Strings such as non-canonical padded/rewritten numeric forms that fail the existing `parseCanonicalDecimal` contract are rejected; values are never rounded.

## Food and food-fact entries

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

- food codes are unique;
- `nameVi` is 1-120 trimmed Unicode characters;
- `versionNumber` is a safe positive integer;
- `baseUnitCode` is a supported launch unit and its dimension equals `baseDimension`;
- `categoryCode` is a supported launch category and `categoryAncestry` exactly matches the launch reference policy sequence;
- fact provenance and every assessment/nutrient/conversion provenance are 1-500 trimmed Unicode characters;
- allergen codes are unique, exactly cover the ten supported launch allergens, and none has status `unknown`;
- nutrient codes are unique and exactly cover the six required nutrients;
- dietary tag codes are unique and are either empty or `vegetarian`;
- conversions are non-empty;
- conversion unit codes are unique and supported;
- conversion numeric fields satisfy the positive decimal rules;
- nutrient amounts and edible fraction satisfy the decimal rules above.

## Recipe entries

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

Recipe validation rules mirror the existing command/domain constraints:

- recipe codes are unique;
- `nameVi` is 1-120 trimmed Unicode characters;
- version number is a safe positive integer;
- `yieldAdultEquivalent` and ingredient quantity satisfy the positive decimal rules;
- `activeMinutes` is a safe integer >= 1;
- `elapsedMinutes` is a safe integer with `activeMinutes <= elapsedMinutes <= 180`;
- each recipe has at least one ingredient and at least one step;
- ingredient codes are unique within a recipe;
- food codes are unique within a recipe, matching the existing unique food-per-recipe rule;
- ingredient order is contiguous `1..N` with no duplicates or gaps;
- each `foodCode` resolves to exactly one food in the same pack;
- each `foodFactVersionNumber` exactly equals the referenced food fact version;
- ingredient unit code is a supported unit and either equals the referenced food's base unit code or exists in that fact's conversion list;
- `preparationNoteVi` is null or 1-120 trimmed Unicode characters;
- step order is contiguous `1..N`;
- `instructionVi` is 1-500 trimmed Unicode characters;
- `timerMinutes` is null or a safe integer in `0..elapsedMinutes`;
- step ingredient codes are unique within each step and all resolve to ingredients in the same recipe;
- recipe `tagCodes` are unique and match the catalog code pattern.

Phase 9A does not invent recipe-tag metadata. Exact recipe-tag code-to-kind resolution is a Phase 9B preflight responsibility.

## Price-book entries

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

Price validation rules mirror the existing price-book command contract:

- `regionCode` is exactly `vn_baseline`;
- version number is a safe positive integer;
- `effectiveFrom`, non-null `effectiveTo`, and `observedAt` are strict valid `YYYY-MM-DD` calendar dates;
- non-null `effectiveTo >= effectiveFrom`;
- prices are non-empty;
- food codes are unique across the price book, matching the existing one-price-row-per-food command rule;
- every food/version reference resolves inside the pack and pins the exact fact version;
- package quantity, package base quantity, and purchase increment satisfy the positive decimal rules;
- `packagePriceVnd` is a positive safe integer;
- package/base unit codes are supported launch units;
- `baseUnitCode` equals the referenced food's base unit code;
- `sourceReference` is 1-500 trimmed Unicode characters and is not a generic placeholder token such as `unknown`, `n/a`, `na`, `pending`, or `placeholder` case-insensitively.

Price presence is a launch-readiness concern rather than a shape error for unused foods. Every food reachable from a meal option through a recipe must have a price row. An unreachable food may lack a price and produces warning `UNUSED_FOOD_WITHOUT_PRICE`.

## Meal-option entries

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

Meal-option validation rules mirror the existing meal-option admin constraints while retaining logical codes for offline validation:

- meal-option codes are unique;
- `nameVi` is 1-120 trimmed Unicode characters;
- version number is a safe positive integer;
- yield and quantity multipliers satisfy the positive decimal rules;
- `activeMinutes` is a safe integer > 0;
- `elapsedMinutes` is a safe integer with `activeMinutes <= elapsedMinutes <= 180`;
- components are non-empty and contain at least one `main` component;
- recipe codes are unique within a meal option;
- component order is contiguous `1..N`;
- every recipe/version reference resolves inside the pack and pins the exact recipe version;
- `proteinHintCode` is exactly one non-empty code-pattern value;
- `cookingStyleCodes` contains at least one unique code-pattern value;
- `dishRoleCodes` contains unique code-pattern values.

Phase 9B must verify that protein/style/dish-role codes resolve to production recipe-tag rows of the expected kind before any write.

## Validation layers

The validator runs deterministic layers in order and accumulates all diagnostics where safe.

### Layer 1: parse and strict shape

- valid UTF-8 JSON;
- top-level object only;
- `schemaVersion === "1"`;
- strict Zod schemas reject unknown keys and wrong primitive types;
- no coercion between strings and numbers.

If Layer 1 cannot produce a typed pack, later layers do not run.

### Layer 2: field and domain invariants

Validates code syntax, labels, canonical decimals, supported launch reference codes, dates/timestamps, list uniqueness, contiguous order fields, and constraints mirrored from existing catalog/recipe/meal-option command handlers.

Missing required nutrition, missing required allergen assessment, or any `unknown` allergen status is a validation error. Unsupported unit/category/dietary-tag codes are validation errors.

### Layer 3: graph and version lineage

Validates all pack-internal exact references:

- recipe -> food/fact version;
- recipe step -> recipe ingredient;
- meal option -> recipe version;
- ingredient unit -> food base unit/conversion.

No implicit "latest version" lookup exists. An unresolved or mismatched graph edge is a validation error and sets `valid=false`.

### Layer 4: launch-pack readiness

Layer 4 runs only when Layers 1-3 have no errors. It does not replace household-specific planner readiness.

It calculates reachability from meal options to recipes to foods, then produces these blockers:

- `MINIMUM_MEAL_OPTIONS_NOT_MET` when the pack contains fewer than 21 meal options;
- `INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY` when fewer than 3 distinct `proteinHintCode` values occur across meal options;
- `PRICE_COVERAGE_INCOMPLETE` when any reachable food lacks a price row for its exact fact version.

Warnings do not change readiness by themselves:

- `UNUSED_FOOD_WITHOUT_PRICE`;
- `UNUSED_RECIPE`;
- `UNUSED_FOOD`.

After Phase 9B publishes a catalog, the existing `evaluateCatalogReadiness` flow remains authoritative for planner-specific scenarios. Its threshold of 21 eligible meal options and its household-rule/coverage logic are not changed by Phase 9A.

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

Report determinism requirements:

- `inputSha256` is SHA-256 of the original input bytes, not parsed/reformatted JSON;
- diagnostics are sorted by severity, code, path, then message;
- blockers are deduplicated and lexicographically sorted;
- summary counts are deterministic set/array counts only;
- no current runtime timestamp is emitted;
- no random IDs are generated;
- no environment-specific UUIDs appear;
- report serialization uses the repository's canonical JSON behavior and one trailing newline so stdout and `--report` bytes are identical for the same input and validator version.

`valid` means Layers 1-3 produced no errors. `ready` means `valid === true` and Layer 4 produced no blocker. When `valid === false`, `ready` is always false and `blockers` is empty because launch readiness is not evaluated on invalid data.

## CLI contract

Add:

```bash
npm run catalog:validate -- --input <path-to-pack.json>
```

Optional file output:

```bash
npm run catalog:validate -- --input <path-to-pack.json> --report <path-to-report.json>
```

Implementation decision: add `tsx` as a dev-only dependency and define `catalog:validate` as `tsx scripts/catalog-validate.ts`. This keeps the CLI thin and reuses the TypeScript validator without adding a production runtime dependency.

CLI behavior:

- stdout prints canonical report JSON followed by one newline;
- when `--report` is provided, exactly the same bytes are written to that path;
- stderr is reserved for invocation, filesystem, or unexpected internal failures;
- the CLI never prompts, scans directories, accesses the network, or reads Supabase environment variables;
- the CLI never prints environment variables or secrets;
- the input file is never mutated.

Exit codes:

- `0`: `valid=true` and `ready=true`;
- `2`: validation errors exist (`valid=false`);
- `3`: pack is valid but launch readiness blockers exist (`valid=true`, `ready=false`);
- `1`: CLI usage error, file I/O failure, or unexpected internal failure.

## File boundaries

Phase 9A implementation is limited to these responsibilities:

- `src/application/catalog-pack/catalog-pack.ts` — V1 data contracts and report/diagnostic types;
- `src/application/catalog-pack/catalog-pack-reference-policy.ts` — immutable supported units, category ancestry, allergens, nutrients, dietary tags, and launch region;
- `src/application/catalog-pack/catalog-pack-schema.ts` — strict Zod shape parser only;
- `src/application/catalog-pack/validate-catalog-pack.ts` — Layer 2/3 validation, diagnostic collection, SHA/report assembly;
- `src/application/catalog-pack/catalog-pack-readiness.ts` — Layer 4 reachability, coverage, warnings, and readiness blockers;
- focused unit tests next to those modules;
- `scripts/catalog-validate.ts` — filesystem/argument/exit-code adapter only; no domain validation rules;
- `tests/fixtures/catalog-pack/` — synthetic fixture-only JSON;
- `package.json` and lockfile — `catalog:validate` plus dev-only `tsx`.

The application validator must not import Supabase clients, server runtime config, Gemini, Vercel, browser code, or test integration fixtures.

## Testing strategy

Implementation must use TDD and cover at least these behaviors:

1. a synthetic valid/ready pack parses and validates deterministically;
2. unknown JSON fields are rejected;
3. duplicate food/recipe/meal-option codes are rejected;
4. non-canonical decimals are rejected rather than rounded;
5. missing one required nutrient is rejected;
6. missing one required allergen assessment is rejected;
7. allergen status `unknown` is rejected with lineage error;
8. wrong category ancestry is rejected;
9. base-unit dimension mismatch is rejected;
10. empty food conversion list is rejected;
11. duplicate food use inside one recipe is rejected;
12. recipe ingredient referencing missing food/fact version is rejected;
13. recipe ingredient unit without base-unit/conversion support is rejected;
14. recipe step instruction >500 characters or timer outside `0..elapsedMinutes` is rejected;
15. recipe step reference to missing ingredient is rejected;
16. meal-option reference to missing recipe/version is rejected;
17. valid pack with reachable food lacking a price returns exit/readiness class 3 with `PRICE_COVERAGE_INCOMPLETE`;
18. valid pack with fewer than 21 meal options returns `MINIMUM_MEAL_OPTIONS_NOT_MET`;
19. valid pack with fewer than 3 protein hints returns `INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY`;
20. identical input bytes produce byte-identical canonical report output;
21. CLI returns 0, 2, 3, and 1 for the documented result classes;
22. CLI works without Supabase variables and without network access;
23. current focused tests and repository `verify:web` remain green.

No test may present the current integration fixture's synthetic nutrition/prices as production data. Synthetic Phase 9A fixtures must be clearly labeled fixture-only.

## Security and privacy

- no secret/key/password/token fields exist in the pack schema;
- source references/provenance are data; diagnostics prefer JSON paths and entity codes rather than echoing long source text;
- the validator never transmits pack contents;
- input/report paths are explicit and no recursive discovery occurs;
- report output may replace only the exact user-supplied report path;
- input JSON is parsed as data only; no executable content is evaluated.

## Compatibility with existing publication paths

Phase 9A mirrors current command/domain constraints but never bypasses them. A future Phase 9B mapper must translate logical codes from a valid pack into the existing command handlers for food facts, recipes, price books, and meal options. Phase 9B must still use those handlers so content hashing, revision guards, publication completeness checks, and audit behavior remain authoritative.

Phase 9A does not promise that a valid/ready pack will publish successfully if production reference tables have drifted. Phase 9B must run a read-only exact-reference preflight before any mutation and fail closed on mismatch.

## Acceptance criteria

Phase 9A implementation is complete only when:

- `CatalogPackV1` exists in code with strict shape validation;
- launch reference policy matches the reviewed current repository constants/migration;
- validator is deterministic and offline;
- authoritative values are validated but never synthesized, substituted, or rounded;
- allergen `unknown` is rejected consistently with the current domain;
- required nutrition/allergen coverage is enforced;
- graph/version lineage is exact and has no implicit-latest behavior;
- reachable price coverage, 21 meal options, and 3 protein hints are launch-pack gates;
- CLI output/exit codes match this spec;
- focused tests pass;
- exact implementation head passes `npm run verify:web`;
- no Supabase schema or production catalog mutation occurs;
- no Vercel deployment occurs;
- no PR or merge occurs without separate explicit authorization.
