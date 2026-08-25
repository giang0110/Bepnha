# Application boundary

`application` contains use-case orchestration and application-owned ports.

## Imports

- May import `domain` and application-owned ports.
- Must not import React, `app`, `features`, or concrete `infrastructure` adapters.

Cross-boundary imports must use the `@/...` alias. Relative imports are only for files within `application`.
