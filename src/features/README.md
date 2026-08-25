# Features boundary

`features` contains vertical browser UI slices and owns their presentation behavior.

## Imports

- May import `application`, `domain`, and approved app UI primitives.
- Must not import concrete `infrastructure` adapters or another feature's internal paths.

Cross-boundary imports must use the `@/...` alias. Relative imports are only for files within the same feature boundary. ESLint blocks aliased feature subpaths; this intentionally requires future feature internals to use relative imports.
