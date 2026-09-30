import { createContext, useContext } from "react"

export type Theme = "light" | "dark"

export const THEME_STORAGE_KEY = "bepnha:theme:v1"

export interface ThemeContextValue {
  readonly theme: Theme
  readonly toggleTheme: () => void
}

const defaultThemeValue: ThemeContextValue = {
  theme: "light",
  toggleTheme: () => {}
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  return ctx ?? defaultThemeValue
}

export { ThemeProvider } from "./theme-provider"
export { ThemeToggle } from "./theme-toggle"
