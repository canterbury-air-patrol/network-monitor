import { request } from './client'
import type { MapViewResponse } from '../types'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * A malformed viewport would put NaN into Leaflet and blank the map, so the
 * payload is checked before it is trusted; a rejected response leaves the
 * caller on its built-in fallback view.
 */
function isMapView(value: unknown): value is MapViewResponse {
  if (typeof value !== 'object' || value === null) return false
  const view = value as Partial<MapViewResponse>
  const center = view.center
  return (
    typeof center === 'object' &&
    center !== null &&
    isFiniteNumber(center.latitude) &&
    isFiniteNumber(center.longitude) &&
    isFiniteNumber(view.zoom)
  )
}

export async function fetchMapView(
  signal?: AbortSignal,
): Promise<MapViewResponse> {
  const body = await request<unknown>('/settings/map/', { signal })
  if (!isMapView(body)) throw new Error('Malformed map view response')
  return body
}

/**
 * Identity of a resolved view. The map re-centres when this changes — a
 * mission activating its override, say — and stays put across refetches that
 * return the same view, so an operator who has panned keeps their position.
 */
export function mapViewKey(view: MapViewResponse): string {
  const { center, zoom, source, mission } = view
  return `${source}:${mission ?? ''}:${center.latitude}:${center.longitude}:${zoom}`
}
