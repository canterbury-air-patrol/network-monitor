import { mapViewKey } from './api/mapView'
import type { GeolocationState } from './hooks/useGeolocation'
import type { MapViewResponse } from './types'

// Used until a view has been resolved, and if none ever is.
export const FALLBACK_CENTER: [number, number] = [-43.5, 172.5]
export const FALLBACK_ZOOM = 10

export interface ResolvedView {
  center: [number, number]
  zoom: number
  /** Identity of the choice; the map re-centres only when this changes. */
  key: string
}

/**
 * Which viewport the map should be showing, given what the server resolved
 * ([P3-19]) and where the device says it is ([P3-20]).
 *
 * Precedence, highest first:
 *
 * 1. An active mission's override. A mission that names its area of operation
 *    is a deliberate instruction about where to look, so it outranks both the
 *    device and the operator's own panning.
 * 2. The device location, while the operator has not moved the map. Zoom comes
 *    from the server, which is the one that knows the useful scale for this
 *    deployment.
 * 3. The deployment default, once geolocation has been given its chance —
 *    permission denied, no fix, or simply too slow to keep the map waiting.
 *
 * Returns `null` when there is nothing to apply: still waiting for a fix, or
 * the operator has taken the map somewhere themselves.
 */
export function resolveInitialView(
  view: MapViewResponse | undefined,
  geo: GeolocationState,
  operatorMoved: boolean,
): ResolvedView | null {
  if (view && view.source === 'mission') {
    return {
      center: [view.center.latitude, view.center.longitude],
      zoom: view.zoom,
      key: mapViewKey(view),
    }
  }

  if (operatorMoved) return null

  if (geo.fix) {
    // The zoom is part of the key so a fix that beats the settings endpoint
    // still picks up the deployment's scale when it lands, rather than
    // stranding the map at the built-in zoom.
    const zoom = view?.zoom ?? FALLBACK_ZOOM
    return {
      center: [geo.fix.latitude, geo.fix.longitude],
      zoom,
      key: `device:${geo.fix.latitude}:${geo.fix.longitude}:${zoom}`,
    }
  }

  if (!geo.settled) return null

  if (!view) return null

  return {
    center: [view.center.latitude, view.center.longitude],
    zoom: view.zoom,
    key: mapViewKey(view),
  }
}
