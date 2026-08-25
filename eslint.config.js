import { readdirSync } from "node:fs"
import { resolve } from "node:path"

import js from "@eslint/js"
import prettier from "eslint-config-prettier"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

const restrictedImports = ({ paths = [], patterns = [] }) => [
  "error",
  {
    paths,
    patterns
  }
]

const relativeLayerPattern = (layers) => ({
  regex: `^\\.\\.(?:/[^/]+)*?/(?:${layers.join("|")})(?:/|$)`,
  message: "Cross-boundary imports must use @/...; relative imports stay within their boundary."
})

const browserGlobals = [
  "alert",
  "caches",
  "confirm",
  "document",
  "fetch",
  "history",
  "indexedDB",
  "localStorage",
  "location",
  "navigator",
  "Notification",
  "performance",
  "prompt",
  "screen",
  "sessionStorage",
  "WebSocket",
  "window",
  "Worker"
]

const platformSdkPattern = {
  group: ["@supabase/*", "@vercel/*"],
  message: "This layer must not import platform SDKs."
}

const reactImportPattern = {
  group: ["react", "react/**", "react-dom", "react-dom/**"],
  message: "This layer must not import React."
}

const featureImportPatterns = [
  { group: ["@/infrastructure/*", "@/features/*/*"] },
  platformSdkPattern,
  relativeLayerPattern(["infrastructure"])
]

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const featureRoot = resolve(import.meta.dirname, "src/features")
const featureOwners = readdirSync(featureRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const featureOwnerConfigs = featureOwners.flatMap((owner) => {
  const otherOwners = featureOwners.filter((candidate) => candidate !== owner)
  if (otherOwners.length === 0) {
    return []
  }

  return [
    {
      files: [`src/features/${owner}/**/*.{ts,tsx}`],
      rules: {
        "no-restricted-imports": restrictedImports({
          patterns: [
            ...featureImportPatterns,
            {
              regex: `^\\.\\.(?:/\\.\\.)*/(?:${otherOwners.map(escapeRegex).join("|")})(?:/|$)`,
              message: "Feature relative imports must not cross into another feature boundary."
            }
          ]
        })
      }
    }
  ]
})

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      ".vercel/**",
      "supabase/.temp/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: [
      "api/**/*.{ts,tsx}",
      "scripts/**/*.{ts,tsx}",
      "*.{config,setup}.{ts,js}",
      "tests/**/*.{ts,tsx}"
    ],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ["src/**/*.{tsx,jsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true, allowExportNames: ["buttonVariants"] }
      ]
    }
  },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports({
        paths: [{ name: "react", message: "Domain modules must not import React." }],
        patterns: [
          { group: ["@/app/*", "@/features/*", "@/application/*", "@/infrastructure/*"] },
          {
            group: ["react/**", "react-dom", "react-dom/**"],
            message: "Domain modules must not import React."
          },
          {
            ...platformSdkPattern,
            message: "Domain modules must not import platform SDKs."
          },
          relativeLayerPattern(["app", "features", "application", "infrastructure"])
        ]
      }),
      "no-restricted-globals": [
        "error",
        ...browserGlobals.map((name) => ({
          name,
          message: "Domain modules must not use browser globals."
        }))
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'MemberExpression[object.type="MetaProperty"][object.meta.name="import"][object.property.name="meta"][property.name="env"]',
          message: "Domain modules must not access import.meta.env."
        }
      ]
    }
  },
  {
    files: ["src/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports({
        patterns: [
          { group: ["@/app/*", "@/features/*", "@/infrastructure/*"] },
          { ...reactImportPattern, message: "Application modules must not import React." },
          { ...platformSdkPattern, message: "Application modules must not import platform SDKs." },
          relativeLayerPattern(["app", "features", "infrastructure"])
        ]
      })
    }
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports({
        patterns: [{ group: ["@/api/*"] }, relativeLayerPattern(["api"])]
      })
    }
  },
  {
    files: ["src/infrastructure/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports({
        patterns: [
          { group: ["@/app/*", "@/features/*"] },
          { ...reactImportPattern, message: "Infrastructure modules must not import React." },
          relativeLayerPattern(["app", "features"])
        ]
      })
    }
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports({
        patterns: featureImportPatterns
      })
    }
  },
  {
    files: ["api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports({
        patterns: [
          { group: ["@/app/*", "@/features/*"] },
          { ...reactImportPattern, message: "API modules must not import React." },
          relativeLayerPattern(["app", "features"])
        ]
      })
    }
  },
  prettier,
  ...featureOwnerConfigs
)
