# Infrastructure boundary

`infrastructure` contains adapters for Supabase, HTTP, environment access, and other platform SDKs.

## Imports

- May import `application`, `domain`, and platform SDKs.
- Must not import `app`, `features`, or product UI.

Cross-boundary imports must use the `@/...` alias. Relative imports are only for files within `infrastructure`.
