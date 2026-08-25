import { fileURLToPath, URL } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    },
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: "./src/test/setup.ts"
        }
      },
      {
        extends: true,
        test: {
          name: "api",
          include: ["api/**/*.test.ts"],
          environment: "node"
        }
      },
      {
        extends: true,
        test: {
          name: "scripts",
          include: ["scripts/**/*.test.ts"],
          environment: "node"
        }
      }
    ]
  }
})
