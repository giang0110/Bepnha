\# AGENTS.md — BepNha



\## 1. Working principles



\- Work only on the explicitly approved phase or task.

\- Do not implement future phases early.

\- Prefer the smallest correct change.

\- Keep domain logic separate from UI and infrastructure.

\- Use TypeScript strict mode.

\- Do not introduce unnecessary dependencies or architecture.

\- Do not modify production data directly.

\- Do not weaken security, RLS, constraints, or validation to make tests pass.



\## 2. Deterministic domain rules



The BepNha core must remain deterministic.



Never use an LLM to author or override:

\- serving quantities;

\- nutrition calculations;

\- food prices;

\- shopping quantities;

\- allergy or exclusion safety;

\- meal eligibility;

\- authoritative budget calculations.



AI may only be added in an explicitly approved future phase.



Core domain logic must remain framework-independent and testable without React, Supabase, or Vercel.



\## 3. Allergy and safety



\- Allergies and explicit exclusions are hard constraints.

\- Unknown allergen lineage is not safe.

\- Never interpret free-text notes as authoritative allergy rules.

\- Never silently replace missing nutrition, price, conversion, or allergen data with zero/default values.



\## 4. Testing



Use TDD for domain and planner behavior whenever practical.



Core logic requires unit tests.



Before declaring a task complete, run all verification relevant to the current phase, including as applicable:



\- formatting/lint;

\- TypeScript typecheck;

\- unit tests;

\- component tests;

\- database/RLS tests;

\- production build;

\- Playwright smoke tests.



Never report PASS for a verification step that was not actually executed.



If a required verification cannot run because of an environment dependency, report it as:



`BLOCKED`



with the exact reason.



Do not silently skip required gates.



\## 5. Database and Supabase



\- All schema changes must be migrations.

\- Never edit production schema manually.

\- RLS must remain enabled on exposed private/user-data tables.

\- Never solve authorization failures by broadening anonymous or authenticated access.

\- Service-role credentials must remain server-only.

\- Never place secrets in `VITE\_\*` environment variables.

\- Production migrations require explicit user approval.

\- Production data mutation requires explicit user approval.



\## 6. Git branches



Do not perform feature development directly on `main`.



For each approved phase or substantial task, use a dedicated branch, for example:



\- `codex/phase-0-foundation`

\- `codex/phase-1-household`

\- `codex/phase-2-catalog`

\- `codex/fix-planner-budget`



If already working on an approved non-main branch, continue using it unless there is a technical reason not to.



Never force-push.



Never rewrite published history unless explicitly instructed.



\## 7. Automatic commit and push



After completing an approved task:



1\. Run the required verification.

2\. Inspect `git status`.

3\. Confirm only files belonging to the approved task are included.

4\. If all required verification passes:

&#x20;  - stage only task-related changes;

&#x20;  - create a concise conventional commit;

&#x20;  - push the current branch to `origin` automatically.

5\. Do not ask the user to run `git push` manually.



Examples of commit messages:



\- `docs: refine Bep Nha design specification`

\- `feat: add household onboarding foundation`

\- `test: add portion engine coverage`

\- `fix: correct planner budget fallback`



\## 8. Push safety



Do not commit or push when:



\- required tests fail;

\- typecheck fails;

\- build fails;

\- required verification is blocked;

\- unrelated local changes would be included;

\- the requested task is incomplete.



Instead, report the blocker and leave the working tree available for inspection.



Never use:



`git push --force`



or equivalent force operations.



\## 9. Main branch protection



Codex may push approved work branches automatically.



Codex must NOT:



\- merge a branch into `main`;

\- push implementation commits directly to `main`;

\- delete remote branches;

\- create or merge pull requests;

\- deploy production;

\- execute production migrations;



unless the user explicitly authorizes that specific action.



A review checkpoint is required before merge to `main`.



\## 10. Task boundaries



Each commit should represent one coherent completed task.



Do not combine unrelated cleanup or refactoring with an approved task.



Do not modify generated files unnecessarily.



If unrelated existing changes are present:

\- preserve them;

\- do not discard them;

\- do not include them in the task commit;

\- report them separately.



\## 11. Completion report



After a successful automatic push, report:



\- task status;

\- branch;

\- commit SHA;

\- commit message;

\- files changed;

\- verification commands and results;

\- remote push status;

\- any remaining warnings or intentionally deferred work.



Use:



`TASK\_COMPLETE\_PUSHED`



only when verification passed and the commit was successfully pushed.



Use:



`TASK\_COMPLETE\_NOT\_PUSHED`



when implementation is complete but pushing was intentionally prohibited.



Use:



`BLOCKED`



when a required gate cannot pass.



\## 12. Approval gates



An approved design does not automatically authorize implementation.



An approved implementation task does not automatically authorize:

\- the next phase;

\- merge to `main`;

\- production deployment;

\- production database changes.



Stop at the end of the approved scope and wait for the next explicit instruction.
