import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMapView, mapViewKey } from '../mapView'
import type { MapViewResponse } from '../../types'

const VIEW: MapViewResponse = {
  center: { latitude: -41.3, longitude: 174.8 },
  zoom: 12,
  source: 'default',
  mission: null,
}

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status })),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchMapView', () => {
  it('returns the resolved view', async () => {
    stubFetch(VIEW)
    await expect(fetchMapView()).resolves.toEqual(VIEW)
  })

  it.each([
    ['a missing centre', { zoom: 12 }],
    [
      'a non-numeric centre',
      { center: { latitude: 'north', longitude: 1 }, zoom: 12 },
    ],
    ['a missing zoom', { center: { latitude: -41.3, longitude: 174.8 } }],
    ['a null body', null],
  ])('rejects %s rather than handing Leaflet a NaN', async (_label, body) => {
    stubFetch(body)
    await expect(fetchMapView()).rejects.toThrow('Malformed map view response')
  })

  it('reports a failed request', async () => {
    stubFetch({ detail: 'boom' }, 500)
    await expect(fetchMapView()).rejects.toThrow('boom')
  })
})

describe('mapViewKey', () => {
  it('changes when a mission override takes over', () => {
    expect(mapViewKey(VIEW)).not.toBe(
      mapViewKey({ ...VIEW, source: 'mission', mission: 7 }),
    )
  })

  it('is stable across repeated resolutions of the same view', () => {
    expect(mapViewKey(VIEW)).toBe(mapViewKey({ ...VIEW }))
  })
})
