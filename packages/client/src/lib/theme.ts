import {useCallback, useSyncExternalStore} from "react"

export type Theme = "dark" | "light"

const KEY = "lore-theme"
const listeners = new Set<() => void>()

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark"
  } catch {
    return "dark"
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private mode or storage disabled. The class still applies for this tab.
  }
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme)
  const setTheme = useCallback((next: Theme) => apply(next), [])
  const toggle = useCallback(() => apply(read() === "dark" ? "light" : "dark"), [])
  return {theme, setTheme, toggle}
}
