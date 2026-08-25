# Domain boundary

`domain` contains framework-independent, deterministic business rules and types.

## Imports

- May import other `domain` modules and pure language or library utilities.
- Must not import React, browser APIs, environment variables, Supabase, Vercel, `app`, `features`, `application`, or `infrastructure`.

Cross-boundary imports must use the `@/...` alias. Relative imports are only for files within `domain`.
