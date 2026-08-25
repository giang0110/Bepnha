# Phase 0 Foundation Implementation Plan

> **Execution requirement:** Use `superpowers:subagent-driven-development` when executing this plan in the current task, or `superpowers:executing-plans` when executing it in a separate task. This document is planning output only; it does not authorize execution.

**Goal:** Establish a production-oriented, locally reproducible foundation for Bếp Nhà with a strict React/TypeScript SPA, a small trusted-function harness, local Supabase migration and RLS verification, and CI-enforced quality gates—without implementing any Phase 1 product behavior.

**Architecture:** Use one npm package and one modular monolith. Browser composition lives in `src/app`; future vertical UI slices live in `src/features`; framework-independent rules live in `src/domain`; use-case orchestration and ports live in `src/application`; Supabase, HTTP, environment, and other adapters live in `src/infrastructure`; trusted Vercel Functions live in `api`. Dependencies point inward, and Phase 0 creates boundary documentation and enforcement without creating speculative business abstractions.

**Tech Stack:** Node.js 24 LTS, npm, React, Vite, strict TypeScript, Tailwind CSS, shadcn/ui, ESLint, Prettier, Vitest, React Testing Library, Playwright, Supabase CLI/PostgreSQL/pgTAP, Vercel Functions, and GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-bep-nha-design.md`

**Global constraints:** Work only on `codex/phase-0-foundation`; do not merge `main`, deploy, link a remote Supabase project, provision Vercel/Supabase resources, run production migrations, or add Phase 1 behavior. A clean Docker-compatible container-runtime preflight is a non-skippable prerequisite for local database work. If it is unavailable, report `BLOCKED: Docker-compatible container runtime unavailable`, leave the database gate unpassed, and do not claim Phase 0 completion.

---

## 1. Approved scope and repository baseline

At plan-writing time the repository contains only:

```text
AGENTS.md
docs/
└── superpowers/
    ├── plans/
    │   └── 2026-08-25-phase-0-foundation.md
    └── specs/
        └── 2026-08-25-bep-nha-design.md
```

There is no application code, package manifest, database migration, CI configuration, or provisioned infrastructure in the repository. Phase 0 execution therefore starts from a greenfield scaffold while preserving both approved documents byte-for-byte.

### Phase 0 delivers

- a single-package React/Vite SPA that builds under strict TypeScript;
- Tailwind CSS and one generated shadcn/ui primitive proving the UI toolchain;
- explicit module-boundary documentation and lint restrictions;
- Vitest, React Testing Library, and Playwright harnesses with foundation smoke coverage;
- deterministic environment-file validation that rejects client-side secret names;
- a typed, side-effect-free Vercel health Function with unit coverage;
- the documented Vercel SPA rewrite and a direct deep-link browser test;
- a local Supabase project, one security-baseline migration, and pgTAP/RLS harness tests;
- deterministic lint, formatting, typecheck, build, unit/component, browser, and database commands;
- a non-deploying GitHub Actions CI workflow;
- setup and verification documentation.

### Explicitly deferred

The following remain absent until a later, separately approved phase:

- Supabase Auth screens, browser sessions, household profiles, members, budgets, onboarding, and routes;
- `@supabase/supabase-js`, generated database types, repositories, and remote-project configuration;
- food, recipe, allergen, nutrition, price, portion, planner, shopping, pantry, or admin tables and logic;
- any LLM, chatbot, ML, vector database, image, payment, delivery, social, or medical-nutrition feature;
- a client router until the product has at least one approved route requiring it;
- Vercel deployment, `vercel link`, `vercel dev` if it requires account/project creation, Supabase linking, and all production changes;
- speculative shared packages, workspaces, Turborepo, service containers, queues, or microservices.

## 2. Fixed technical decisions

### 2.1 Runtime and dependency policy

- Pin the runtime major to Node.js 24 LTS with `.nvmrc`, `.node-version`, `package.json#engines`, and CI. Node 24 is an active LTS line and satisfies current Vite and Playwright requirements.
- Use npm and commit `package-lock.json`. Install current stable package releases once during implementation; the lockfile becomes the authoritative reproducibility boundary.
- Use a single package. A monorepo adds no Phase 0 value.
- Keep runtime dependencies limited to React plus the dependencies generated for the first shadcn/ui primitive. Tooling and platform types remain development dependencies.
- Do not add React Router in Phase 0. The path-independent shell plus the Vercel rewrite is enough to prove direct SPA deep links; routing enters with approved product routes.
- Do not add the Supabase JavaScript client in Phase 0. The local CLI and database harness prove the platform without inventing an unused browser adapter.

### 2.2 TypeScript policy

`tsconfig.app.json`, `tsconfig.node.json`, and `tsconfig.api.json` are referenced by the root `tsconfig.json`. All enable strict checking appropriate to their runtime. At minimum, the shared strict policy contains:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "useUnknownInCatchVariables": true,
  "verbatimModuleSyntax": true
}
```

The `@/*` alias maps only to `src/*`. Cross-boundary imports use this alias so lint rules can inspect them consistently.

### 2.3 Module dependency policy

```text
src/app ------------------------ composition root, shell, UI primitives
   |\
   | +--> src/features -------- future vertical presentation slices
   |            |
   |            v
   +------> src/application --- use cases and ports
                  |
                  v
             src/domain ------- pure deterministic rules
                  ^
                  |
src/infrastructure ------------ adapters implementing application ports

api --------------------------- trusted HTTP entry points; calls application,
                                never React and never browser-only modules
```

Allowed dependencies:

| From | May depend on | Must not depend on |
|---|---|---|
| `domain` | other `domain` modules and pure language/library utilities | React, `app`, `features`, `application`, `infrastructure`, Supabase, Vercel, browser APIs, environment variables |
| `application` | `domain` and application-owned ports | React, `app`, `features`, concrete `infrastructure` adapters |
| `infrastructure` | `application`, `domain`, platform SDKs | `app`, `features`, product UI |
| `features` | `application`, `domain`, approved app UI primitives | concrete `infrastructure`; feature-to-feature internals |
| `app` | all browser-side modules needed for composition | server-only `api` modules |
| `api` | `application`, `domain`, server-side `infrastructure` | React, browser-only `app` or `features` modules |

Phase 0 tracks `README.md` boundary contracts in empty future layers instead of adding fake interfaces or barrel files. ESLint uses `no-restricted-imports` overrides to enforce the rules that can exist before product code. Add a dedicated boundary tool only if normal lint proves inadequate during a later approved phase.

### 2.4 Testing policy

- TDD is mandatory for the environment validator and Vercel Function behavior.
- Use a red/green cycle for the React shell and Playwright deep-link smoke behavior.
- Scaffold/configuration-only work is not forced through artificial unit tests; validate it with the owning tool's command.
- Database security tests are written before the baseline migration and observed failing, then the migration is applied and the same tests pass.
- Do not set a misleading global coverage percentage while most domain directories are intentionally empty. Produce a coverage report in Phase 0; add domain-specific thresholds with real domain modules in Phase 2.
- Every completion claim must be based on fresh command output.

### 2.5 Security and infrastructure policy

- The only committed client environment keys are `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; both are public configuration. Any `VITE_*` key containing `SECRET`, `SERVICE_ROLE`, or `PRIVATE_KEY` fails validation.
- Do not introduce a server Supabase credential until a trusted endpoint actually requires it in a later phase.
- The Phase 0 migration creates no product or user-data table. It establishes a private schema and secure default privileges so future migrations begin from least privilege.
- Database verification runs against the local Supabase stack only. Never substitute a remote database for a failed local gate.
- `supabase db reset --local` is destructive only to the verified local development database. Never use `--linked`, `db push`, or a production connection string.
- CI contains no deploy job and no production or preview credentials.

## 3. Target repository structure

The completed Phase 0 tree is intentionally small:

```text
.
├── .editorconfig
├── .env.example
├── .github/
│   └── workflows/
│       └── ci.yml
├── .gitignore
├── .node-version
├── .nvmrc
├── .prettierignore
├── .prettierrc.json
├── AGENTS.md
├── README.md
├── api/
│   ├── health.test.ts
│   └── health.ts
├── components.json
├── docs/
│   └── superpowers/
│       ├── plans/
│       │   └── 2026-08-25-phase-0-foundation.md
│       └── specs/
│           └── 2026-08-25-bep-nha-design.md
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── playwright.config.ts
├── scripts/
│   ├── check-secrets.mjs
│   ├── check-secrets.test.ts
│   ├── preflight.mjs
│   ├── validate-env.mjs
│   └── validate-env.test.ts
├── src/
│   ├── app/
│   │   ├── App.test.tsx
│   │   ├── App.tsx
│   │   ├── README.md
│   │   ├── components/
│   │   │   └── ui/
│   │   │       └── button.tsx
│   │   └── lib/
│   │       └── utils.ts
│   ├── application/
│   │   └── README.md
│   ├── domain/
│   │   └── README.md
│   ├── features/
│   │   └── README.md
│   ├── infrastructure/
│   │   └── README.md
│   ├── index.css
│   ├── main.tsx
│   └── test/
│       └── setup.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 20260825000000_phase_0_security_baseline.sql
│   └── tests/
│       └── database/
│           └── phase_0_security.test.sql
├── tests/
│   └── smoke.spec.ts
├── tsconfig.api.json
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
├── vercel.json
├── vite.config.ts
└── vitest.config.ts
```

Generated and ignored output includes `node_modules`, `dist`, `coverage`, `playwright-report`, `test-results`, `.vercel`, `.env.local`, and Supabase temporary/runtime directories. No `.env` containing credentials is committed.

## 4. Ordered implementation tasks

### Gate 0: Verify the execution environment before changing files

**TDD:** No; this is a mandatory read-only preflight.

**Expected files:** None.

- [ ] Confirm the approved branch and clean baseline:

  ```powershell
  git branch --show-current
  git status --short --branch
  git diff --check
  ```

  Expected branch: `codex/phase-0-foundation`. Stop if unrelated changes exist.

- [ ] Verify the selected runtime:

  ```powershell
  node --version
  npm --version
  ```

  Require Node `v24.x`. Do not silently continue on an unsupported major.

- [ ] Verify a running Docker-API-compatible container runtime:

  ```powershell
  docker version
  docker info
  ```

  Both commands must reach the server, not merely find a client executable.

- [ ] If the container server cannot be reached, stop before Task 1 and report exactly:

  ```text
  BLOCKED: Docker-compatible container runtime unavailable
  ```

  Do not create a remote Supabase project, use a shared database, skip pgTAP, or weaken the Phase 0 exit gate.

**Safety/rollback:** This gate is read-only. No rollback is needed.

### Task 1: Create the npm, React, Vite, and strict TypeScript scaffold

**TDD:** No; verify generated configuration with TypeScript and Vite.

**Expected files:**

- Create: `.gitignore`, `.node-version`, `.nvmrc`, `index.html`, `package.json`, `package-lock.json`
- Create: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.api.json`, `vite.config.ts`
- Create: `src/main.tsx`, `src/app/App.tsx`, `src/index.css`

- [ ] Initialize npm in the existing repository without running a generator over `AGENTS.md` or `docs`:

  ```powershell
  npm init --yes
  npm install react@latest react-dom@latest
  npm install --save-dev typescript@latest vite@latest @vitejs/plugin-react@latest @types/node@latest @types/react@latest @types/react-dom@latest
  ```

- [ ] Set `package.json` metadata and scripts. Preserve the versions npm resolved and the lockfile it created. The script contract must be:

  ```json
  {
    "name": "bep-nha",
    "private": true,
    "type": "module",
    "engines": {
      "node": ">=24 <25"
    },
    "scripts": {
      "dev": "vite",
      "build": "tsc -b && vite build",
      "preview": "vite preview",
      "typecheck": "tsc -b --pretty false"
    }
  }
  ```

- [ ] Put `24` in both `.nvmrc` and `.node-version`.

- [ ] Configure the three TypeScript projects:

  - `tsconfig.app.json` includes `src` and DOM libraries;
  - `tsconfig.api.json` includes `api` and Node/Vercel types;
  - `tsconfig.node.json` includes root tooling files, scripts, Playwright, and Vitest configuration;
  - all projects inherit the strict policy in section 2.2;
  - `baseUrl` is `.` and `paths` maps `@/*` to `src/*`;
  - the root file contains project references only.

- [ ] Configure `vite.config.ts` with React, the `@` alias, and no proxy, SSR, or product route configuration.

- [ ] Create a minimal mountable shell. At this task it may render only an empty semantic `main`; content arrives test-first in Task 2.

- [ ] Add only generated/output/local-secret paths to `.gitignore`. Include:

  ```gitignore
  node_modules/
  dist/
  coverage/
  playwright-report/
  test-results/
  .vercel/
  .env
  .env.*
  !.env.example
  supabase/.branches/
  supabase/.temp/
  ```

- [ ] Run scaffold verification:

  ```powershell
  npm run typecheck
  npm run build
  git diff --check
  ```

- [ ] Commit the coherent scaffold:

  ```powershell
  git add .gitignore .node-version .nvmrc index.html package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.api.json vite.config.ts src/main.tsx src/app/App.tsx src/index.css
  git commit -m "chore: scaffold strict React foundation"
  ```

**Safety/rollback:** Do not use `npm create vite .` in the non-empty repository because it can prompt to overwrite tracked documentation. If dependency installation fails, remove only files created in this task after confirming their exact paths; never reset or clean the repository broadly.

### Task 2: Add Vitest, React Testing Library, and the tested app shell

**TDD:** Yes; write the component expectation before adding shell content.

**Expected files:**

- Modify: `package.json`, `package-lock.json`, `tsconfig.node.json`
- Create: `vitest.config.ts`, `src/test/setup.ts`, `src/app/App.test.tsx`
- Modify: `src/app/App.tsx`

- [ ] Install the focused test dependencies:

  ```powershell
  npm install --save-dev vitest@latest @vitest/coverage-v8@latest jsdom@latest @testing-library/react@latest @testing-library/jest-dom@latest @testing-library/user-event@latest
  ```

- [ ] Add these scripts:

  ```json
  {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
  ```

- [ ] Configure `vitest.config.ts` with `jsdom`, globals disabled, `src/test/setup.ts`, V8 text/HTML coverage output, and the `@` alias. Do not add a percentage threshold for empty future layers.

- [ ] In `src/test/setup.ts`, import `@testing-library/jest-dom/vitest` and run Testing Library cleanup after each test.

- [ ] Write `src/app/App.test.tsx` first. It must assert that the shell:

  - renders a level-one heading named `Bếp Nhà`;
  - exposes Vietnamese document/shell copy describing weekly meal planning;
  - does not expose onboarding, household, planner, auth, or catalog controls.

- [ ] Run the focused test and observe RED because the scaffold shell has no content:

  ```powershell
  npx vitest run src/app/App.test.tsx
  ```

- [ ] Implement only the accessible Phase 0 shell content needed for GREEN. Set `<html lang="vi">` in `index.html`; do not add navigation, router state, forms, API calls, or product behavior.

- [ ] Re-run focused and full verification:

  ```powershell
  npx vitest run src/app/App.test.tsx
  npm run test:coverage
  npm run typecheck
  npm run build
  git diff --check
  ```

- [ ] Commit:

  ```powershell
  git add package.json package-lock.json tsconfig.node.json vitest.config.ts src/test/setup.ts src/app/App.test.tsx src/app/App.tsx index.html
  git commit -m "test: add React foundation harness"
  ```

**Safety/rollback:** Keep the test about foundation semantics, not product journeys. A coverage report is evidence, not permission to add unused modules merely to increase a percentage.

### Task 3: Configure Tailwind CSS and shadcn/ui

**TDD:** Partly. Use the existing component test to drive the UI primitive integration; configuration itself is command-verified.

**Expected files:**

- Modify: `package.json`, `package-lock.json`, `vite.config.ts`, `src/index.css`, `src/app/App.tsx`, `src/app/App.test.tsx`
- Create: `components.json`, `src/app/components/ui/button.tsx`, `src/app/lib/utils.ts`

- [ ] Install and configure Tailwind's Vite integration:

  ```powershell
  npm install --save-dev tailwindcss@latest @tailwindcss/vite@latest
  ```

  Add `tailwindcss()` to the Vite plugins and put this first in `src/index.css`:

  ```css
  @import "tailwindcss";
  ```

  Do not create a legacy `tailwind.config.js` unless the installed current Tailwind/shadcn toolchain requires a concrete setting that cannot live in CSS.

- [ ] Initialize shadcn non-interactively, then normalize aliases to the architecture:

  ```powershell
  npx shadcn@latest init --defaults
  ```

  `components.json` must resolve:

  ```json
  {
    "aliases": {
      "components": "@/app/components",
      "ui": "@/app/components/ui",
      "lib": "@/app/lib",
      "utils": "@/app/lib/utils",
      "hooks": "@/app/hooks"
    }
  }
  ```

- [ ] Add exactly one primitive to prove the generator path:

  ```powershell
  npx shadcn@latest add button --yes
  ```

- [ ] Before using it, extend `App.test.tsx` with a failing assertion for a disabled `Bắt đầu ở Giai đoạn 1` button. The disabled state makes clear that no onboarding behavior exists.

- [ ] Run RED:

  ```powershell
  npx vitest run src/app/App.test.tsx
  ```

- [ ] Render the generated `Button` in the shell with the exact disabled label, add only mobile-first layout utilities, and rerun GREEN:

  ```powershell
  npx vitest run src/app/App.test.tsx
  npm run typecheck
  npm run build
  git diff --check
  ```

- [ ] Commit:

  ```powershell
  git add package.json package-lock.json vite.config.ts src/index.css components.json src/app/components/ui/button.tsx src/app/lib/utils.ts src/app/App.tsx src/app/App.test.tsx
  git commit -m "chore: configure Tailwind and shadcn ui"
  ```

**Safety/rollback:** Inspect `git diff` after each shadcn command. Restore no tracked file wholesale; retain only intentional generator changes. Do not add a theme system, extra components, product branding assets, or a component abstraction layer in Phase 0.

### Task 4: Establish formatting, linting, and architecture boundaries

**TDD:** No; ESLint, Prettier, and TypeScript are the executable specifications.

**Expected files:**

- Modify: `package.json`, `package-lock.json`, `tsconfig.node.json`
- Create: `.editorconfig`, `.prettierignore`, `.prettierrc.json`, `eslint.config.js`
- Create: `src/app/README.md`, `src/features/README.md`, `src/domain/README.md`, `src/application/README.md`, `src/infrastructure/README.md`

- [ ] Install only the lint/format dependencies used by configuration:

  ```powershell
  npm install --save-dev eslint@latest @eslint/js@latest typescript-eslint@latest globals@latest eslint-plugin-react-hooks@latest eslint-plugin-react-refresh@latest eslint-config-prettier@latest prettier@latest
  ```

- [ ] Add scripts with explicitly scoped format targets so approved specifications and `AGENTS.md` are not rewritten:

  ```json
  {
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write --no-error-on-unmatched-pattern src api scripts .github supabase README.md package.json tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.api.json vite.config.ts vitest.config.ts playwright.config.ts eslint.config.js components.json vercel.json",
    "format:check": "prettier --check --no-error-on-unmatched-pattern src api scripts .github supabase README.md package.json tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.api.json vite.config.ts vitest.config.ts playwright.config.ts eslint.config.js components.json vercel.json"
  }
  ```

  During intermediate tasks, run Prettier directly only on paths that already exist. The final commands run after the full tree exists.

- [ ] Configure flat ESLint for browser, Node, test, and Function files. Enable TypeScript recommended type-checked rules, React Hooks, React Refresh, and zero warnings.

- [ ] Add file-pattern overrides implementing section 2.3 with `no-restricted-imports`:

  - domain blocks `@/app/*`, `@/features/*`, `@/application/*`, and `@/infrastructure/*`;
  - application blocks `@/app/*`, `@/features/*`, and `@/infrastructure/*`;
  - infrastructure blocks `@/app/*` and `@/features/*`;
  - features block `@/infrastructure/*` and other features' internal paths;
  - API files block `@/app/*` and `@/features/*`.

  Document that cross-boundary imports must use `@/...`; relative imports are only for files inside the same boundary.

- [ ] Put the allowed imports, forbidden imports, and layer purpose in each boundary README. Do not create the design's future `features/household`, `domain/planner`, or similar directories yet.

- [ ] Configure Prettier with LF endings and an `.editorconfig` consistent with it. Exclude generated output, `AGENTS.md`, and `docs/superpowers/**` from automatic formatting.

- [ ] Verify:

  ```powershell
  npx prettier --write src package.json tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.api.json vite.config.ts vitest.config.ts eslint.config.js components.json
  npm run format:check
  npm run lint
  npm run typecheck
  npm run test
  npm run build
  git diff --check
  ```

- [ ] Commit:

  ```powershell
  git add .editorconfig .prettierignore .prettierrc.json eslint.config.js package.json package-lock.json tsconfig.node.json src/app/README.md src/features/README.md src/domain/README.md src/application/README.md src/infrastructure/README.md
  git commit -m "chore: enforce foundation boundaries"
  ```

**Safety/rollback:** Never run an unscoped formatter across the repository. If lint cannot express a future dependency rule reliably, document the gap; do not add a custom compiler, monorepo, or speculative architecture plugin in Phase 0.

### Task 5: Add deterministic environment validation

**TDD:** Yes.

**Expected files:**

- Modify: `package.json`, `tsconfig.node.json`
- Create: `.env.example`, `scripts/validate-env.mjs`, `scripts/validate-env.test.ts`
- Create: `scripts/check-secrets.mjs`, `scripts/check-secrets.test.ts`

- [ ] Create `.env.example` with public local-development placeholders only:

  ```dotenv
  VITE_SUPABASE_URL=http://127.0.0.1:54321
  VITE_SUPABASE_PUBLISHABLE_KEY=replace-with-local-publishable-key
  ```

- [ ] Write `scripts/validate-env.test.ts` first with Node test environment coverage for:

  1. the two expected keys are accepted when non-empty and the URL is HTTP(S);
  2. a missing URL fails with a named error;
  3. a malformed URL fails;
  4. a missing publishable key fails;
  5. `VITE_SUPABASE_SECRET_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, and `VITE_PRIVATE_KEY` each fail;
  6. the committed `.env.example` parses and passes.

- [ ] Run RED because the validator does not exist:

  ```powershell
  npx vitest run scripts/validate-env.test.ts
  ```

- [ ] Implement `scripts/validate-env.mjs` with two pure exports and a thin CLI:

  ```text
  parseEnvFile(contents: string) -> Readonly<Record<string, string>>
  validateClientEnvironment(values: Readonly<Record<string, string>>) -> void
  ```

  The parser only needs the documented `.env.example` grammar: blank lines, comments, and unquoted `KEY=VALUE` records. Reject duplicates and malformed records rather than guessing. The CLI reads `.env.example` by default or the explicit path passed as its only argument, prints a concise success line, and exits non-zero with the exact validation error on failure. It never prints values.

- [ ] Add:

  ```json
  {
    "env:check": "node scripts/validate-env.mjs .env.example"
  }
  ```

- [ ] Run GREEN and full checks:

  ```powershell
  npx vitest run scripts/validate-env.test.ts
  npm run env:check
  npm run lint
  npm run typecheck
  git diff --check
  ```

- [ ] Write `scripts/check-secrets.test.ts` first. It must prove that the scanner detects:

  - PEM private-key headers;
  - non-empty `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, and `VITE_*SECRET*` assignments;
  - common token prefixes followed by credential-like material;
  - and does not flag policy prose, empty assignments, or the public publishable-key placeholder.

- [ ] Run RED, implement `scripts/check-secrets.mjs`, and rerun GREEN:

  ```powershell
  npx vitest run scripts/check-secrets.test.ts
  ```

  Export a pure `findSecretFindings(path, contents)` function. The CLI obtains paths from `git ls-files -z`, scans only regular text files, reports rule IDs and paths without echoing suspected values, and exits non-zero on findings.

- [ ] Add and verify the security script:

  ```json
  {
    "secrets:check": "node scripts/check-secrets.mjs"
  }
  ```

  ```powershell
  npx vitest run scripts/check-secrets.test.ts
  npm run secrets:check
  ```

- [ ] Commit:

  ```powershell
  git add .env.example scripts/validate-env.mjs scripts/validate-env.test.ts scripts/check-secrets.mjs scripts/check-secrets.test.ts package.json tsconfig.node.json
  git commit -m "test: validate public environment configuration"
  ```

**Safety/rollback:** Never put a real key in `.env.example` or test output. Client validation must reject suspicious names; it must not treat absent nutrition, price, conversion, or allergen data as defaults because none of those concepts belong in Phase 0.

### Task 6: Add the typed Vercel Function and SPA rewrite harness

**TDD:** Yes for Function behavior and configuration shape.

**Expected files:**

- Modify: `package.json`, `package-lock.json`, `tsconfig.api.json`, `vitest.config.ts`
- Create: `api/health.ts`, `api/health.test.ts`, `vercel.json`

- [ ] Install Vercel request/response types only:

  ```powershell
  npm install --save-dev @vercel/node@latest
  ```

  Do not install the deployment CLI or link a project in this task.

- [ ] Write `api/health.test.ts` first in the Node test environment. Mock only the `VercelResponse` methods and verify:

  - `GET` responds 200 with `{ "status": "ok" }`;
  - non-GET responds 405, sets `Allow: GET`, and returns a stable error body;
  - the response does not expose environment variables, versions, database state, or secrets.

- [ ] Run RED:

  ```powershell
  npx vitest run api/health.test.ts
  ```

- [ ] Implement `api/health.ts` as the complete Phase 0 contract:

  ```typescript
  import type { VercelRequest, VercelResponse } from '@vercel/node'

  export default function handler(
    request: VercelRequest,
    response: VercelResponse,
  ): void {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      response.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
      return
    }

    response.status(200).json({ status: 'ok' })
  }
  ```

  This handler is intentionally independent of Supabase and domain logic.

- [ ] Add the documented Vercel Vite-SPA rewrite exactly:

  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "rewrites": [
      {
        "source": "/(.*)",
        "destination": "/index.html"
      }
    ]
  }
  ```

- [ ] Add a test that reads `vercel.json` and asserts the exact single rewrite. This catches accidental removal or broad configuration drift without deploying.

- [ ] Run GREEN and boundary checks:

  ```powershell
  npx vitest run api/health.test.ts
  npm run typecheck
  npm run lint
  npm run build
  git diff --check
  ```

- [ ] Commit:

  ```powershell
  git add api/health.ts api/health.test.ts vercel.json package.json package-lock.json tsconfig.api.json vitest.config.ts
  git commit -m "test: add Vercel function harness"
  ```

**Safety/rollback:** Do not run `vercel link`, `vercel deploy`, or any command that creates a remote project. Local Vercel runtime integration remains unclaimed until an approved environment can run it without provisioning; Phase 0 verifies the adapter contract, typecheck, location, and routing configuration locally.

### Task 7: Add Playwright smoke and direct deep-link verification

**TDD:** Yes at the browser boundary.

**Expected files:**

- Modify: `package.json`, `package-lock.json`, `tsconfig.node.json`, `.gitignore`
- Create: `playwright.config.ts`, `tests/smoke.spec.ts`

- [ ] Install Playwright without installing every browser:

  ```powershell
  npm install --save-dev @playwright/test@latest
  npx playwright install chromium
  ```

- [ ] Add:

  ```json
  {
    "test:e2e": "playwright test"
  }
  ```

- [ ] Write `tests/smoke.spec.ts` before configuration. It must contain exactly the Phase 0 journeys:

  1. `/` renders the `Bếp Nhà` heading and the disabled Phase 1 button on a mobile viewport;
  2. direct navigation to `/phase-0/deep-link`, without first visiting `/`, returns the same app shell and keeps that URL;
  3. no uncaught page errors or failed first-party asset requests occur.

- [ ] Run RED because Playwright has no web-server configuration:

  ```powershell
  npx playwright test tests/smoke.spec.ts --project=chromium
  ```

- [ ] Configure `playwright.config.ts` with:

  - Chromium only;
  - base URL `http://127.0.0.1:4173`;
  - mobile viewport `390x844`;
  - trace on first retry;
  - one retry in CI and zero locally;
  - `webServer.command` set to `npm run build && npm run preview -- --host 127.0.0.1 --port 4173`;
  - `reuseExistingServer` only outside CI.

- [ ] Run GREEN:

  ```powershell
  npm run test:e2e
  git diff --check
  ```

- [ ] Commit:

  ```powershell
  git add package.json package-lock.json tsconfig.node.json .gitignore playwright.config.ts tests/smoke.spec.ts
  git commit -m "test: add browser and deep-link smoke coverage"
  ```

**Safety/rollback:** Bind the preview server to loopback. Do not add browser tests for onboarding, plans, shopping, or authentication. The Vite preview fallback proves the built SPA accepts a direct path; `vercel.json` is the production hosting contract and remains separately asserted.

### Task 8: Add the local Supabase migration and database/RLS harness

**TDD:** Yes; write and observe the pgTAP security test failing before applying the migration.

**Expected files:**

- Modify: `package.json`, `package-lock.json`, `.gitignore`
- Create: `scripts/preflight.mjs`, `supabase/config.toml`
- Create: `supabase/migrations/20260825000000_phase_0_security_baseline.sql`
- Create: `supabase/tests/database/phase_0_security.test.sql`

- [ ] Re-run the manual Docker gate from Gate 0 immediately before installing/starting Supabase. If it fails now, stop and report `BLOCKED: Docker-compatible container runtime unavailable`.

- [ ] Install the CLI locally and initialize a local-only project:

  ```powershell
  npm install --save-dev supabase@latest
  npx supabase init
  npx supabase --version
  ```

  Set `project_id = "bepnha-local"` in `supabase/config.toml`. Commit the config; ignore only generated `.branches` and `.temp` state.

- [ ] Add `scripts/preflight.mjs`. It must run and check, in order:

  1. Node major is 24;
  2. npm is executable;
  3. `docker version` reaches a server;
  4. `docker info` succeeds;
  5. the local Supabase CLI is executable.

  On a container failure it writes exactly `BLOCKED: Docker-compatible container runtime unavailable` to stderr and exits non-zero. It never falls back to a remote host.

- [ ] Add scripts:

  ```json
  {
    "preflight": "node scripts/preflight.mjs",
    "supabase:start": "supabase start",
    "supabase:reset": "supabase db reset --local",
    "supabase:lint": "supabase db lint --local --level warning",
    "supabase:test": "supabase test db",
    "supabase:stop": "supabase stop --no-backup",
    "verify:db": "npm run preflight && npm run supabase:start && npm run supabase:reset && npm run supabase:lint && npm run supabase:test"
  }
  ```

- [ ] Start the stack and verify it is explicitly local:

  ```powershell
  npm run preflight
  npm run supabase:start
  npx supabase status
  ```

  Inspect the status output for loopback URLs. Stop if it references a linked/remote project.

- [ ] Create `supabase/tests/database/phase_0_security.test.sql` before the migration:

  ```sql
  begin;

  create extension if not exists pgtap with schema extensions;

  select plan(4);

  select has_schema('private');

  select is(
    has_schema_privilege('anon', 'private', 'USAGE'),
    false,
    'anon cannot use private schema'
  );

  select is(
    has_schema_privilege('authenticated', 'private', 'USAGE'),
    false,
    'authenticated cannot use private schema'
  );

  select is(
    (
      select count(*)::integer
      from pg_class as relation
      join pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relkind in ('r', 'p')
        and not relation.relrowsecurity
    ),
    0,
    'every exposed public table has RLS enabled'
  );

  select * from finish();
  rollback;
  ```

- [ ] Run RED. The missing `private` schema must fail at least the first three assertions:

  ```powershell
  npm run supabase:test
  ```

- [ ] Create the one Phase 0 migration:

  ```sql
  create schema if not exists private;

  revoke all on schema private from public;
  revoke all on schema private from anon;
  revoke all on schema private from authenticated;

  alter default privileges for role postgres in schema public
    revoke execute on functions from public;

  alter default privileges for role postgres in schema public
    revoke all on tables from anon, authenticated;

  alter default privileges for role postgres in schema public
    revoke all on sequences from anon, authenticated;
  ```

  This migration contains no user table, policy, function, seed data, or product concept.

- [ ] Prove GREEN from a clean database, then rerun the test independently:

  ```powershell
  npm run supabase:reset
  npm run supabase:lint
  npm run supabase:test
  npm run verify:db
  ```

- [ ] Stop the local stack after evidence is captured:

  ```powershell
  npm run supabase:stop
  ```

- [ ] Review and commit only local configuration, the baseline migration, and tests:

  ```powershell
  git diff --check
  git status --short
  git add package.json package-lock.json .gitignore scripts/preflight.mjs supabase/config.toml supabase/migrations/20260825000000_phase_0_security_baseline.sql supabase/tests/database/phase_0_security.test.sql
  git commit -m "test: add local Supabase security harness"
  ```

**Safety/rollback:** `supabase db reset --local` may destroy local development data, so first verify `supabase status` and the local project ID. Never use `supabase link`, `supabase db push`, `--linked`, a service-role credential, or a production URL. If cleanup is needed, `supabase stop --no-backup` affects only the verified local stack. A missing Docker runtime blocks completion; it is not a reason to remove the database job or mark it optional.

### Task 9: Add the non-deploying CI pipeline

**TDD:** No; validate YAML plus run every CI command locally before relying on automation.

**Expected files:**

- Modify: `package.json`
- Create: `.github/workflows/ci.yml`

- [ ] Add aggregate scripts:

  ```json
  {
    "security:dependencies": "npm audit --audit-level=high",
    "verify:web": "npm run env:check && npm run secrets:check && npm run security:dependencies && npm run format:check && npm run lint && npm run typecheck && npm run test:coverage && npm run build",
    "verify": "npm run verify:web && npm run test:e2e && npm run verify:db"
  }
  ```

- [ ] Create `.github/workflows/ci.yml` with read-only repository permissions, cancellation of superseded branch runs, and two independent jobs. The workflow contract is:

  ```yaml
  name: CI

  on:
    pull_request:
    push:

  permissions:
    contents: read

  concurrency:
    group: ci-${{ github.ref }}
    cancel-in-progress: true

  jobs:
    web:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 24
            cache: npm
        - run: npm ci
        - run: npm run verify:web
        - run: npx playwright install --with-deps chromium
        - run: npm run test:e2e

    database:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 24
            cache: npm
        - run: npm ci
        - run: npm run preflight
        - run: npm run supabase:start
        - run: npm run supabase:reset
        - run: npm run supabase:lint
        - run: npm run supabase:test
        - if: always()
          run: npm run supabase:stop
  ```

- [ ] Confirm the workflow has no `environment`, deployment, remote Supabase URL, Vercel token, service-role key, write permission, or production command.

- [ ] Run the exact local equivalents before commit:

  ```powershell
  npm ci
  npm run verify:web
  npx playwright install chromium
  npm run test:e2e
  npm run verify:db
  npm run supabase:stop
  git diff --check
  ```

- [ ] Commit:

  ```powershell
  git add package.json .github/workflows/ci.yml
  git commit -m "ci: add Phase 0 verification pipeline"
  ```

**Safety/rollback:** GitHub-hosted runners provide the Docker daemon needed by the local Supabase stack, but `preflight` must still prove it. A failing database job remains red; do not add `continue-on-error`. CI never deploys or connects to a remote Supabase/Vercel environment.

### Task 10: Document operation and run the Phase 0 exit gate

**TDD:** No; this is documentation, audit, and fresh end-to-end verification.

**Expected files:**

- Create: `README.md`
- Modify only if verification exposes an error: files created in Tasks 1–9 and their owning tests

- [ ] Write `README.md` with:

  - the deterministic-planner-first product principle;
  - Node 24 and Docker-compatible runtime prerequisites;
  - install, dev, test, build, and local Supabase commands;
  - public `.env.example` copying instructions without real credentials;
  - the module-boundary table from section 2.3;
  - the exact `BLOCKED: Docker-compatible container runtime unavailable` rule;
  - the local-only warning for `supabase db reset --local`;
  - the fact that Phase 0 has no product functionality and no deployment step.

- [ ] Run placeholder and scope scans:

  ```powershell
  rg -n "TODO|TBD|FIXME|HACK|not implemented|phase 1" src api scripts supabase tests README.md
  rg -n "openai|anthropic|langchain|vector|supabase-js|react-router|service_role|SERVICE_ROLE" package.json src api scripts .github supabase README.md
  ```

  Expected results:

  - no implementation placeholders;
  - `phase 1` appears only in the intentionally disabled shell copy or README scope note;
  - no AI/vector/router/Supabase browser dependency;
  - `service_role` appears nowhere in client environment names or source. Documentation may state it is forbidden, but no credential name/value is configured.

- [ ] Run dependency and tracked-file audits:

  ```powershell
  npm ls --depth=0
  git ls-files
  git status --short
  ```

  Confirm no secret file, generated report, `.vercel` data, Supabase runtime state, application feature, or unrelated edit is tracked.

- [ ] Run the full clean exit gate from a fresh dependency install:

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
  npm run supabase:start
  npm run supabase:reset
  npm run supabase:lint
  npm run supabase:test
  npm run supabase:stop
  git diff --check
  ```

  Every command must pass. If Docker becomes unavailable, report the database verification `BLOCKED` and do not commit/push or claim Phase 0 completion, as required by `AGENTS.md`.

- [ ] Commit the operations guide only after the full gate passes:

  ```powershell
  git add README.md
  git commit -m "docs: document Phase 0 development workflow"
  ```

- [ ] Inspect the branch delta and prove it contains only Phase 0:

  ```powershell
  git status --short --branch
  git log --oneline main..HEAD
  git diff --stat main...HEAD
  git diff --check main...HEAD
  ```

- [ ] Push the approved work branch without force:

  ```powershell
  git push --set-upstream origin codex/phase-0-foundation
  ```

- [ ] Report `TASK_COMPLETE_PUSHED` only after the push succeeds. Report branch, HEAD SHA, commits/files, every verification result, push status, and intentionally deferred work. Stop; do not merge `main` or start Phase 1.

**Safety/rollback:** Fix failures only in the task that owns them and rerun the affected focused test before the entire gate. Do not weaken TypeScript, lint, RLS, pgTAP, browser smoke, or Docker checks to obtain green output. No production or preview resources are touched by this plan.

## 5. Exact verification command reference

### Fast feedback while editing

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

### Browser verification

```powershell
npx playwright install chromium
npm run test:e2e
```

### Local database and RLS verification

```powershell
npm run preflight
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run supabase:stop
```

### Final Phase 0 gate

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
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run supabase:stop
git diff --check
git status --short --branch
```

No command in this reference links, deploys, pushes a database schema remotely, or mutates production.

## 6. Phase 0 exit criteria

Phase 0 is complete only when all of the following are true on `codex/phase-0-foundation`:

- [ ] `npm ci` succeeds from the committed lockfile under Node 24.
- [ ] `npm run env:check` validates the public template and rejects client secret-like names in tests.
- [ ] `npm run secrets:check` finds no credential material in tracked files, and `npm run security:dependencies` reports no high-or-critical audit finding.
- [ ] `npm run format:check`, `npm run lint`, and `npm run typecheck` pass with zero warnings/errors.
- [ ] `npm run test:coverage` passes for the shell, validator, Vercel Function, and routing configuration.
- [ ] `npm run build` produces the Vite production bundle.
- [ ] `npm run test:e2e` passes the mobile shell and direct deep-link smoke tests against the built preview.
- [ ] `npm run preflight` proves a running Docker-compatible server and local Supabase CLI.
- [ ] A clean `npm run supabase:reset` applies the committed migration.
- [ ] `npm run supabase:lint` passes and `npm run supabase:test` proves the private-schema grants and the invariant that every exposed public table has RLS enabled.
- [ ] The Vercel health Function typechecks and passes its GET/method tests.
- [ ] `vercel.json` contains the tested SPA rewrite; no Vercel or Supabase resource has been provisioned.
- [ ] CI runs the same web/browser/database gates without deploy steps or production secrets.
- [ ] The tree contains no Phase 1 feature behavior, product tables, domain-engine logic, remote configuration, secrets, or unrelated edits.
- [ ] `git diff --check` passes, task commits are coherent, and the approved branch is pushed without force.

An unavailable Docker-compatible container runtime means Phase 0 is `BLOCKED`, not partially complete and not complete with a skipped database/RLS gate.

## 7. Self-review against the approved design and AGENTS.md

### Coverage check

| Requirement | Plan coverage |
|---|---|
| Repository/scaffold structure | Sections 1–3; Tasks 1 and 10 |
| React + Vite + strict TypeScript | Task 1; strict flags in section 2.2 |
| Tailwind + shadcn/ui | Task 3; one primitive only |
| `app/features/domain/application/infrastructure` boundaries | Section 2.3; Task 4 |
| Vitest + React Testing Library | Task 2 |
| Playwright smoke setup | Task 7 |
| Lint/format/typecheck | Task 4 and exit gate |
| Environment validation | Task 5 |
| Supabase local development | Task 8 |
| Docker-compatible runtime preflight | Gate 0, Task 8, CI, exit gate |
| Initial migration/testing harness as planned work | Task 8; no migration is created by this planning task |
| RLS/database verification | Task 8 pgTAP and clean reset |
| Vercel Functions harness | Task 6 |
| SPA rewrite/deep links | Tasks 6–7 |
| CI pipeline | Task 9 |
| Exact verification commands | Each task and section 5 |
| Exit criteria | Section 6 |

### Contradiction and ambiguity check

- The plan does not claim that design approval authorizes implementation. It explicitly requires a later execution approval.
- The planned database migration does not conflict with the current prohibition on creating migrations: this document specifies future work; this planning task creates only this Markdown file.
- The baseline migration contains no product schema, so it does not pull household or catalog work into Phase 0.
- RLS is not weakened. Because Phase 0 intentionally has no product tables, the public-table assertion begins as a future-facing invariant and will fail as soon as any later migration adds an exposed table without RLS; private-schema access is already tested as denied.
- The Vercel Function harness proves the adapter contract without provisioning. It does not falsely claim a hosted integration test.
- The SPA rewrite follows the Vercel Vite-SPA contract, while Playwright separately proves direct navigation against the production build preview.
- The Docker gate is repeated before database work and in CI. No remote substitute or skip path exists.
- `service_role` and other secrets remain server-only by policy and are not introduced as Phase 0 configuration.
- No deterministic meal-planning calculation is added early; consequently no LLM or other nondeterministic dependency appears.
- The architecture uses documentation plus native lint restrictions rather than speculative packages or empty business abstractions.

### YAGNI check

The plan retains a single deployable app, one health Function, one UI primitive, one security-baseline migration, one browser smoke file, and one CI workflow. It deliberately omits product routes, auth, SDK clients, repositories, database code generation, business tables, design-system expansion, monorepo tooling, and remote infrastructure. Those omissions preserve the approved MVP boundaries rather than deferring required Phase 0 gates.

## 8. Primary implementation references

- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Vite getting started and runtime requirements](https://vite.dev/guide/)
- [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [shadcn/ui Vite installation](https://ui.shadcn.com/docs/installation/vite)
- [Vitest environments](https://vitest.dev/guide/environment.html)
- [Playwright installation](https://playwright.dev/docs/intro)
- [Supabase local development and CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Vite on Vercel, Functions, and SPA deep links](https://vercel.com/docs/frameworks/frontend/vite)
