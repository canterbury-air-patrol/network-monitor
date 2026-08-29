import { describe, expect, it } from 'vitest'
import type { GeolocationState } from '../hooks/useGeolocation'
import { FALLBACK_ZOOM, resolveInitialView } from '../initialView'
import type { MapViewResponse } from '../types'

const DEFAULT_VIEW: MapViewResponse = {
  center: { latitude: -41.3, longitude: 174.8 },
  zoom: 12,
  source: 'default',
  mission: null,
}

const MISSION_VIEW: MapViewResponse = {
  center: { latitude: -45.03, longitude: 168.66 },
  zoom: 14,
  source: 'mission',
  mission: 7,
}

const PENDING: GeolocationState = { fix: null, settled: false }
const DENIED: GeolocationState = { fix: null, settled: true }
const LOCATED: GeolocationState = {
  fix: { latitude: -36.85, longitude: 174.76 },
  settled: true,
}

describe('resolveInitialView', () => {
  it('holds the map still while a fix is being acquired', () => {
    expect(resolveInitialView(DEFAULT_VIEW, PENDING, false)).toBeNull()
  })

  it('centres on the device once a fix arrives, at the deployment zoom', () => {
    expect(resolveInitialView(DEFAULT_VIEW, LOCATED, false)).toEqual({
      center: [-36.85, 174.76],
      zoom: 12,
      key: 'device:-36.85:174.76:12',
    })
  })

  it('uses the built-in zoom for a fix that beats the settings endpoint', () => {
    expect(resolveInitialView(undefined, LOCATED, false)).toEqual({
      center: [-36.85, 174.76],
      zoom: FALLBACK_ZOOM,
      key: 'device:-36.85:174.76:10',
    })
  })

  it('falls back to the deployment default when geolocation gives nothing', () => {
    expect(resolveInitialView(DEFAULT_VIEW, DENIED, false)).toEqual({
      center: [-41.3, 174.8],
      zoom: 12,
      key: 'default::-41.3:174.8:12',
    })
  })

  it('has nothing to apply when neither the server nor the device answers', () => {
    expect(resolveInitialView(undefined, DENIED, false)).toBeNull()
  })

  it('lets an active mission outrank the device location', () => {
    expect(resolveInitialView(MISSION_VIEW, LOCATED, false)).toEqual({
      center: [-45.03, 168.66],
      zoom: 14,
      key: 'mission:7:-45.03:168.66:14',
    })
  })

  it('snaps to a mission even after the operator has moved the map', () => {
    expect(resolveInitialView(MISSION_VIEW, LOCATED, true)).not.toBeNull()
  })

  it('leaves a map the operator has moved where they put it', () => {
    expect(resolveInitialView(DEFAULT_VIEW, LOCATED, true)).toBeNull()
    expect(resolveInitialView(DEFAULT_VIEW, DENIED, true)).toBeNull()
  })

  it('re-applies the deployment zoom to a fix that arrived without one', () => {
    // A fix that outran the settings endpoint is centred at the built-in
    // zoom; the deployment's own zoom must still take effect when it lands.
    const early = resolveInitialView(undefined, LOCATED, false)
    const late = resolveInitialView(DEFAULT_VIEW, LOCATED, false)
    expect(late?.center).toEqual(early?.center)
    expect(late?.key).not.toBe(early?.key)
    expect(late?.zoom).toBe(12)
  })
})
