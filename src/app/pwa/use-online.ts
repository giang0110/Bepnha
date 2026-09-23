import { useSyncExternalStore } from "react"

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

/**
 * Whether the browser thinks it has a network.
 *
 * `navigator.onLine` is a weak signal — it reports a connection, not a working one, so a phone on a
 * café wifi that never reaches the internet still reads `true`. It is used here only to explain a
 * failure the person is already looking at, never to decide whether to try: every request is still
 * made, and the answer still comes from the network or the cache on its own merits.
 *
 * Read through `useSyncExternalStore` so it cannot tear during a render, and defaulted to online on
 * the server where there is no navigator to ask.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  )
}
