import { useEffect, useState } from 'react'

export interface GeoFix {
  latitude: number
  longitude: number
}

export interface GeolocationState {
  /** The device position, once the browser has produced one. */
  fix: GeoFix | null
  /**
   * Whether the caller should stop waiting for a fix. Set when the browser
   * answers — a position or an error — and also when the grace period runs
   * out, because a permission prompt the operator never answers leaves
   * `getCurrentPosition` outstanding indefinitely (the `timeout` option does
   * not cover the time spent waiting for permission).
   */
  settled: boolean
}

const PENDING: GeolocationState = { fix: null, settled: false }
const UNAVAILABLE: GeolocationState = { fix: null, settled: true }

/**
 * The device's location, requested once on mount.
 *
 * A fix may still arrive after `settled` — an operator who grants permission
 * late is exactly who this is for — so callers should keep honouring `fix`
 * rather than treating `settled` as the end of the story.
 */
export function useGeolocation(graceMs = 3000): GeolocationState {
  // Insecure origins and locked-down browsers omit the API entirely; that is
  // settled before the first render rather than through a state update.
  const [state, setState] = useState<GeolocationState>(() =>
    navigator.geolocation ? PENDING : UNAVAILABLE,
  )

  useEffect(() => {
    if (!navigator.geolocation) return

    let live = true
    const grace = setTimeout(() => {
      if (live) setState((prev) => (prev.settled ? prev : UNAVAILABLE))
    }, graceMs)

    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        if (!live) return
        // A non-finite coordinate would put NaN into Leaflet and blank the
        // map, so an unusable fix counts as no fix at all.
        const usable = Number.isFinite(latitude) && Number.isFinite(longitude)
        setState(
          usable
            ? { fix: { latitude, longitude }, settled: true }
            : UNAVAILABLE,
        )
      },
      () => {
        if (live) setState(UNAVAILABLE)
      },
      { timeout: 10_000, maximumAge: 300_000 },
    )

    return () => {
      live = false
      clearTimeout(grace)
    }
  }, [graceMs])

  return state
}
