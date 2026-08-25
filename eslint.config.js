import js from "@eslint/js"
import prettier from "eslint-config-prettier"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

const restrictedImports = (patterns) => [
  "error",
  {
    patterns
  }
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
      "no-restricted-imports": restrictedImports([
        "@/app/*",
        "@/features/*",
        "@/application/*",
        "@/infrastructure/*"
      ])
    }
  },
  {
    files: ["src/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(["@/app/*", "@/features/*", "@/infrastructure/*"])
    }
  },
  {
    files: ["src/infrastructure/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(["@/app/*", "@/features/*"])
    }
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(["@/infrastructure/*", "@/features/*/*"])
    }
  },
  {
    files: ["api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(["@/app/*", "@/features/*"])
    }
  },
  prettier
)
