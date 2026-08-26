# App boundary

`app` composes browser routing, layouts, authentication state, the design system, and feature screens.

## Imports

- May import browser-side modules from `app`, `features`, `application`, `domain`, and `infrastructure` when needed for composition.
- Must not import server-only modules from `api`.

Cross-boundary imports must use the `@/...` alias. Relative imports are only for files within `app`.

The app composition root creates the public browser Supabase client and injects the Auth session port.
Routes own presentation/session state only; Supabase Auth verification and database RLS remain the
authorization boundaries.
