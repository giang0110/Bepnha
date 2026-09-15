# Bepnha Cloudflare Workers + Neon Migration Design

Date: 2026-09-15
Status: Approved design; implementation not started
Base branch: `main`
Base commit: `800ad844f946a022d3451be9dcfa33b865113e19`
Design branch: `codex/cloudflare-neon-migration-design`

## 1. Goal

Migrate Bepnha away from Vercel + Supabase runtime dependencies to a Cloudflare Workers + Neon architecture while preserving the existing React/Vite frontend, domain behavior, application contracts, PostgreSQL integrity rules, and row-level authorization semantics.

Target architecture:

```text
GitHub
   |
   v
Cloudflare Workers
   |- React / Vite static assets
   |- /api/* Worker API
   |- Neon Auth
   `- Cloudflare Hyperdrive
          |
          v
     Neon PostgreSQL
```

Turso is explicitly out of scope.

## 2. Architectural decisions

### 2.1 Hosting and runtime

Use Cloudflare Workers as the application runtime and static asset host. Do not build the new architecture around Cloudflare Pages.

The React/Vite application remains the frontend. Cloudflare's Vite integration and Wrangler configuration will provide local development, build, test, and deployment integration.

Existing public API paths should remain stable wherever practical, including:

- `/api/health`
- `/api/me`
- `/api/assistant`
- `/api/admin/catalog`
- `/api/admin/meal-options`
- `/api/plans/generate`
- `/api/plans/replacements-preview`
- `/api/plans/replacements-apply`

The implementation should introduce thin Cloudflare Worker route adapters around existing server/application logic rather than rewriting the domain layer.

### 2.2 Database

Neon PostgreSQL is the only authoritative application database.

The browser must not connect directly to PostgreSQL. Database credentials must never be exposed through `VITE_*` variables or frontend bundles.

Cloudflare Workers connect to Neon through Cloudflare Hyperdrive using PostgreSQL driver `pg`. Hyperdrive is responsible for connection pooling between Workers and Neon.

The runtime database role must:

- not own application tables;
- not have `BYPASSRLS`;
- receive only the grants needed by the Worker;
- remain subject to RLS on protected tables.

A separate migration/owner role may own schema objects and apply migrations.

### 2.3 Authentication

Replace Supabase Auth with Neon Auth.

Neon Auth is responsible for login, session management, and the external authenticated identity. Application tables should not depend directly on Supabase's `auth.users` schema or `auth.uid()`.

Introduce an application identity boundary:

```text
Neon Auth identity
        |
        v
public.app_users
        |
        v
households / plans / pantry / shopping / other private data
```

`public.app_users` owns the stable application UUID used by business tables. It contains a unique binding to the authenticated Neon Auth subject. This decouples business foreign keys from authentication-provider implementation details and permits controlled identity migration.

If production migration can safely preserve the current application UUIDs, preserve them. Otherwise create an explicit old-user-to-app-user mapping during migration.

### 2.4 Authorization and RLS

RLS remains a required security layer. Migration must not replace database authorization with frontend checks or JavaScript-only authorization.

Replace Supabase-dependent policies such as:

```sql
owner_user_id = auth.uid()
```

with provider-neutral session context such as:

```sql
owner_user_id = app.current_user_id()
```

The Worker must validate the Neon Auth session first. For every protected database operation it opens a transaction and sets trusted transaction-local context, conceptually:

```sql
begin;
select set_config('app.current_user_id', $1, true);
select set_config('app.current_role', $2, true);
-- application queries
commit;
```

The client cannot choose these values. They are derived by the Worker from the validated session and server-side authorization data.

Add provider-neutral helper functions such as:

- `app.current_user_id()`
- `app.current_role()` or equivalent
- any household-membership helpers required by policies

Use `FORCE ROW LEVEL SECURITY` on protected business tables where appropriate, especially when ownership behavior could otherwise allow accidental RLS bypass.

Admin APIs must use explicit admin authorization policies or trusted application context. They must not disable RLS globally.

## 3. Repository and code structure

Preserve the current separation between domain, application, and infrastructure layers.

Expected target structure:

```text
src/
|- domain/
|- application/
|- infrastructure/
|  |- auth/
|  |  `- neon-auth-session.ts
|  |- database/
|  |  |- postgres-client.ts
|  |  `- transaction.ts
|  `- repositories/
|     |- postgres-household-repository.ts
|     |- postgres-catalog-repository.ts
|     |- postgres-planner-repository.ts
|     |- postgres-shopping-list-repository.ts
|     `- postgres-pantry-repository.ts
|- worker/
|  |- index.ts
|  |- router.ts
|  |- auth.ts
|  `- routes/
|     |- health.ts
|     |- me.ts
|     |- assistant.ts
|     |- admin/
|     `- plans/
`- ...

db/
|- migrations/
`- tests/

wrangler.jsonc
```

Names may vary slightly during implementation if the existing repository conventions make a different placement cleaner, but the architectural boundaries above must remain.

## 4. Supabase-to-Neon schema migration

### 4.1 Preserve PostgreSQL-native logic

Existing PostgreSQL-native objects should be preserved unless there is a concrete incompatibility or an approved simplification:

- enums;
- tables;
- indexes;
- foreign keys;
- check constraints;
- triggers;
- PL/pgSQL functions;
- deferred constraint triggers;
- integrity invariants;
- RLS semantics.

Do not rewrite the schema into an ORM as part of this migration.

### 4.2 Remove Supabase-specific assumptions

Translate or remove dependencies on:

- `auth.users`;
- `auth.uid()`;
- Supabase roles such as `anon` and `authenticated` where they are runtime-specific;
- Supabase REST/RPC access patterns;
- Supabase-generated database clients;
- Supabase CLI-only migration/test orchestration.

Existing business tables that reference `auth.users` must be migrated to the application identity boundary described above.

### 4.3 Migration directory

Move the source of truth for application schema changes from:

```text
supabase/migrations/
```

to:

```text
db/migrations/
```

Use plain SQL migrations. A small migration runner may be introduced for CI/local/release workflows, but it must not reinterpret the schema through an ORM.

The migration system must support rebuilding an empty PostgreSQL database from zero deterministically.

## 5. Data access migration

Replace Supabase-specific repositories incrementally with PostgreSQL repositories backed by `pg` and Hyperdrive.

The key rule is:

```text
existing application/domain contracts
               |
               v
replace infrastructure adapters
```

Do not rewrite meal-planning, nutrition, allergy, pantry, shopping, catalog, budgeting, or deterministic business rules merely because the storage adapter changes.

Repository queries must be parameterized. Multi-step mutations requiring consistency must execute inside explicit database transactions.

## 6. Worker API migration

Replace Vercel serverless entrypoints with Cloudflare Worker route handlers while preserving API contracts where practical.

Worker routes should remain thin:

```text
HTTP request
   -> auth/session validation
   -> request validation
   -> application service/use case
   -> repository transaction
   -> normalized HTTP response
```

Do not move domain behavior into Worker route files.

Current generic server runtime modules should be reused or adapted where possible rather than duplicated.

## 7. Environment and secrets

Frontend-visible environment variables must contain only values safe for browser exposure, such as the public Neon Auth frontend configuration that Neon documents as public.

Database credentials are server-only.

Expected categories include:

```text
Frontend/public:
- Neon Auth public/base configuration required by the React client

Cloudflare bindings/secrets:
- Hyperdrive binding
- any server-side Neon Auth secret/configuration required by the Worker
- application secrets such as AI provider keys

CI/migration only:
- direct Neon DATABASE_URL / migration credentials
```

`DATABASE_URL` must never be bundled into the React client.

## 8. Testing strategy

Migration is not complete until the new stack has equivalent or stronger automated coverage.

### 8.1 Unit tests

Keep Vitest unit tests for domain and application behavior independent of database/runtime infrastructure.

### 8.2 Database integration tests

Replace local-Supabase orchestration with a disposable PostgreSQL test database.

CI flow:

```text
PostgreSQL service/database
   -> apply db/migrations from zero
   -> seed only test fixtures
   -> run integrity tests
   -> run RLS isolation tests
```

Required test coverage includes:

- schema creation from empty DB;
- foreign keys and indexes where behavior depends on them;
- check constraints;
- triggers and deferred integrity constraints;
- household isolation;
- pantry isolation;
- planner integrity;
- shopping-list integrity;
- catalog integrity;
- admin permissions;
- unauthorized cross-user reads/writes denied by RLS.

RLS failures are release blockers.

### 8.3 Worker tests

Test Worker routes in a Cloudflare-compatible runtime using Cloudflare's current supported Workers/Vite test approach.

Cover at minimum:

- unauthenticated requests;
- authenticated requests;
- invalid session behavior;
- input validation;
- error normalization;
- successful repository/service integration;
- admin authorization;
- health endpoint.

### 8.4 Build verification

CI/release verification must include, at minimum:

```text
lint
TypeScript checks
Vitest/unit tests
database migration from empty PostgreSQL
DB/RLS integration tests
Worker/API tests
Vite production build
Cloudflare/Wrangler dry-run validation
```

## 9. CI migration

Remove Supabase CLI as the required CI database runtime once replacement tests are working.

Replace scripts such as local Supabase start/reset/type-generation wrappers with provider-neutral PostgreSQL migration/test scripts and Cloudflare Worker verification.

Do not delete working Supabase CI scripts until equivalent Neon/PostgreSQL coverage is passing; cleanup is a late migration step.

## 10. Production migration strategy

Production cutover is a separate explicitly approved operation. Implementation approval alone does not authorize production migration.

Maintain old and new stacks in parallel during validation:

```text
OLD                        NEW
Vercel                     Cloudflare Workers
  |                           |
Supabase                   Neon PostgreSQL
```

### 10.1 Business data

Use PostgreSQL-native export/import or a scripted table migration depending on the final schema delta.

For bulk dump/restore, use a direct/unpooled Neon connection rather than routing migration traffic through Hyperdrive.

After import validate:

- row counts for every authoritative table;
- primary/foreign key integrity;
- known aggregates and reference counts;
- required sequences/identity behavior;
- application invariants;
- RLS behavior under migrated identities.

### 10.2 Authentication data

Auth migration is handled separately from business data.

Do not assume Supabase password hashes are directly portable to the current Neon Auth implementation.

At production migration time, verify the then-current supported Neon Auth migration path. Preferred order:

1. preserve identities and passwords only if officially supported and verified;
2. otherwise preserve application identity mapping and require a controlled password reset/re-auth flow.

No undocumented password-hash conversion is allowed.

### 10.3 Cutover procedure

Planned cutover sequence:

```text
1. Take verified Supabase backup/export.
2. Enter a controlled mutation freeze/read-only window.
3. Export final delta/data.
4. Import into Neon.
5. Verify rows, constraints, identities and RLS.
6. Run Cloudflare production smoke tests.
7. Switch production domain/traffic to Cloudflare.
8. Re-enable mutations.
9. Monitor and verify critical flows.
```

The exact DNS/domain mechanism will be documented in the deployment plan when production deployment is explicitly authorized.

## 11. Rollback

Do not delete Vercel or Supabase immediately after cutover.

Rollback remains available until the new stack is accepted:

```text
Cloudflare/Neon critical failure
        |
        v
restore traffic to Vercel
        |
        v
Supabase remains available as rollback system
```

Any writes accepted on the new system after cutover complicate rollback. The production runbook must therefore define the rollback decision window and data reconciliation method before cutover begins.

## 12. Cleanup phase

Only after the Cloudflare + Neon stack is verified and separately approved for cleanup, remove obsolete runtime artifacts such as:

- `vercel.json`;
- Vercel-specific API adapters;
- `@vercel/node`;
- `@supabase/supabase-js` runtime usage;
- Supabase browser/server clients;
- Supabase CLI scripts no longer needed;
- `supabase/config.toml`;
- superseded Supabase test wrappers.

Historical SQL should remain available through Git history. If files are removed, the new `db/migrations` directory becomes the canonical schema history for active development.

## 13. Migration sequence

Implementation should proceed in dependency order with small verified commits:

1. Add Cloudflare Worker/Vite scaffolding without changing business behavior.
2. Establish provider-neutral PostgreSQL migration tooling and disposable DB tests.
3. Translate schema/auth/RLS dependencies to the application identity model.
4. Add PostgreSQL/Hyperdrive database infrastructure.
5. Replace Supabase repositories one bounded area at a time.
6. Add Neon Auth adapter and server-side identity propagation.
7. Port Vercel API handlers to Worker routes while preserving contracts.
8. Convert CI from Supabase-local assumptions to PostgreSQL + Workers verification.
9. Run full regression and remove runtime Supabase/Vercel dependencies only when replacements pass.
10. Prepare a separate production migration/deployment runbook.
11. Production deployment/data migration only after explicit approval.

Each implementation phase should follow TDD where practical and must preserve a runnable/verified branch state.

## 14. Non-goals

This migration does not include:

- Turso;
- Cloudflare Pages as the primary runtime;
- rewriting React/Vite unnecessarily;
- rewriting domain/application logic merely to change providers;
- introducing a new ORM across the existing database;
- changing meal-planning business rules;
- merging unfinished Phase 9C work into this migration by default;
- production deployment without separate authorization;
- production database mutation without separate authorization;
- immediate deletion of Supabase/Vercel rollback infrastructure.

## 15. Relationship to current Phase 9C work

The migration design is based on `main` at `800ad844f946a022d3451be9dcfa33b865113e19` and intentionally does not branch from the unfinished Phase 9C branch.

Phase 9C changes should only be integrated later through an explicit compatibility decision, rebase/cherry-pick, or a fresh implementation on top of the new architecture. This avoids mixing an architectural migration with unfinished feature work.

## 16. Acceptance criteria

The code migration is considered technically complete only when all applicable checks pass:

- React/Vite application builds under the Cloudflare architecture;
- all required `/api/*` endpoints run as Worker routes;
- Neon Auth replaces Supabase Auth in runtime paths;
- Hyperdrive + `pg` is the production database path;
- no browser code has database credentials;
- no production runtime path requires Supabase;
- no production runtime path requires Vercel;
- schema can be created from zero through `db/migrations`;
- database constraints and triggers pass integration tests;
- RLS cross-user isolation tests pass;
- Worker API tests pass;
- TypeScript checks pass;
- lint passes;
- unit/integration tests pass;
- production Vite build passes;
- Wrangler/Cloudflare dry-run validation passes;
- a documented production migration and rollback runbook exists before any cutover.

## 17. Approval boundaries

This document records approved architecture and migration design.

It does **not** authorize:

- merge to `main`;
- creation or mutation of production Neon resources;
- Cloudflare production deployment;
- DNS/domain cutover;
- production data migration;
- production database schema mutation;
- removal of the existing Vercel/Supabase production stack.

Those actions require separate explicit approval under the repository's `AGENTS.md` rules.
