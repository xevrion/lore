import {useEffect, useState, useSyncExternalStore} from "react"

export function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn)
  window.addEventListener("offline", fn)
  return () => {
    window.removeEventListener("online", fn)
    window.removeEventListener("offline", fn)
  }
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

function subscribeMedia(query: string) {
  return (fn: () => void) => {
    const mq = window.matchMedia(query)
    mq.addEventListener("change", fn)
    return () => mq.removeEventListener("change", fn)
  }
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => false,
  )
}
