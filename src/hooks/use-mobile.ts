import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * shadcn ships this as useState + useEffect, which this project's eslint rejects
 * (react-hooks/set-state-in-effect: setState in an effect triggers cascading renders).
 * useSyncExternalStore is the same behaviour told the way React wants to hear it, and it
 * also gets the server snapshot right: false, so SSR renders the desktop layout rather
 * than flashing the mobile one.
 */
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}
