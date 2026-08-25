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
            group: ["@supabase/*", "@vercel/*"],
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
          {
            group: ["react", "react/**", "react-dom", "react-dom/**"],
            message: "Application modules must not import React."
          },
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
          relativeLayerPattern(["app", "features"])
        ]
      })
    }
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports({
        patterns: [
          { group: ["@/infrastructure/*", "@/features/*/*"] },
          relativeLayerPattern(["infrastructure"]),
          {
            regex: "^\\.\\./",
            message: "Feature relative imports must stay within the same feature boundary."
          }
        ]
      })
    }
  },
  {
    files: ["api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports({
        patterns: [
          { group: ["@/app/*", "@/features/*"] },
          relativeLayerPattern(["app", "features"])
        ]
      })
    }
  },
  prettier
)
