import { describe, expect, it } from 'vitest'
import { buildSignalHistory, rssiDomain, SERIES_COLORS } from '../signalHistory'
import type { NodeSnapshotResponse, RadioReadingResponse } from '../types'

let nextId = 1

function reading(
  overrides: Partial<RadioReadingResponse> = {},
): RadioReadingResponse {
  return {
    id: nextId++,
    radio: 1,
    ground_station: 1,
    relay_node: null,
    band: '2.4GHz',
    rssi_dbm: -70,
    snr_db: null,
    ...overrides,
  }
}

function snapshot(
  capturedAt: string,
  readings: RadioReadingResponse[],
): NodeSnapshotResponse {
  return {
    id: nextId++,
    node: 1,
    captured_at: capturedAt,
    received_at: capturedAt,
    position: { longitude: 172.5, latitude: -43.5, altitude: 100 },
    radio_readings: readings,
  }
}

const RADIOS = [
  { id: 1, node: 1, radio_type: 'wifi' as const, bands: ['2.4GHz', '5GHz'] },
  { id: 2, node: 1, radio_type: 'lora' as const, bands: ['915MHz'] },
]
const STATIONS = [
  { id: 1, name: 'Basecamp' },
  { id: 2, name: 'Ridge' },
]
const NODES = [
  { id: 1, name: 'uav-01' },
  { id: 9, name: 'relay-01' },
]

describe('buildSignalHistory', () => {
  it('plots one series per radio, band and receiver', () => {
    const { series, points } = buildSignalHistory(
      [
        snapshot('2026-08-29T00:00:00Z', [
          reading({
            radio: 1,
            band: '2.4GHz',
            ground_station: 1,
            rssi_dbm: -60,
          }),
          reading({ radio: 1, band: '5GHz', ground_station: 1, rssi_dbm: -75 }),
          reading({
            radio: 1,
            band: '2.4GHz',
            ground_station: 2,
            rssi_dbm: -80,
          }),
        ]),
      ],
      { radios: RADIOS, stations: STATIONS, nodes: NODES },
    )

    expect(series.map((s) => s.label)).toEqual([
      'WiFi 2.4GHz → Basecamp',
      'WiFi 2.4GHz → Ridge',
      'WiFi 5GHz → Basecamp',
    ])
    expect(points).toHaveLength(1)
    expect(series.map((s) => points[0][s.key])).toEqual([-60, -80, -75])
  })

  it('orders points chronologically however the API returned them', () => {
    // The snapshots endpoint pages newest-first; a time axis needs the reverse.
    const { points } = buildSignalHistory([
      snapshot('2026-08-29T00:00:20Z', [reading({ rssi_dbm: -65 })]),
      snapshot('2026-08-29T00:00:10Z', [reading({ rssi_dbm: -70 })]),
      snapshot('2026-08-29T00:00:00Z', [reading({ rssi_dbm: -75 })]),
    ])

    expect(points.map((p) => p.t)).toEqual([
      Date.parse('2026-08-29T00:00:00Z'),
      Date.parse('2026-08-29T00:00:10Z'),
      Date.parse('2026-08-29T00:00:20Z'),
    ])
  })

  it('leaves a null where a link reported nothing, so the trace breaks', () => {
    const { series, points } = buildSignalHistory(
      [
        snapshot('2026-08-29T00:00:00Z', [
          reading({ ground_station: 1, rssi_dbm: -60 }),
          reading({ ground_station: 2, rssi_dbm: -90 }),
        ]),
        snapshot('2026-08-29T00:00:10Z', [
          reading({ ground_station: 1, rssi_dbm: -62 }),
        ]),
      ],
      { radios: RADIOS, stations: STATIONS },
    )

    const ridge = series.find((s) => s.label.endsWith('Ridge'))!
    expect(points.map((p) => p[ridge.key])).toEqual([-90, null])
  })

  it('keeps a dotted band out of the recharts data-key path', () => {
    const { series } = buildSignalHistory([
      snapshot('2026-08-29T00:00:00Z', [reading({ band: '2.4GHz' })]),
    ])

    expect(series[0].key).not.toContain('.')
  })

  it('does not collide the keys of bands that differ only in punctuation', () => {
    const { series } = buildSignalHistory([
      snapshot('2026-08-29T00:00:00Z', [
        reading({ band: '2.4GHz' }),
        reading({ band: '2-4GHz' }),
      ]),
    ])

    expect(new Set(series.map((s) => s.key)).size).toBe(2)
  })

  it('names a relay receiver from the node list', () => {
    const { series } = buildSignalHistory(
      [
        snapshot('2026-08-29T00:00:00Z', [
          reading({ ground_station: null, relay_node: 9 }),
        ]),
      ],
      { radios: RADIOS, nodes: NODES },
    )

    expect(series[0].label).toBe('WiFi 2.4GHz → relay-01 (relay)')
  })

  it('falls back to ids when the lookups have not loaded', () => {
    const { series } = buildSignalHistory([
      snapshot('2026-08-29T00:00:00Z', [
        reading({ radio: 4, ground_station: 7 }),
      ]),
    ])

    expect(series[0].label).toBe('Radio 4 2.4GHz → station 7')
  })

  it('assigns each series a distinct colour from the palette', () => {
    const { series } = buildSignalHistory([
      snapshot('2026-08-29T00:00:00Z', [
        reading({ ground_station: 1 }),
        reading({ ground_station: 2 }),
      ]),
    ])

    expect(series.map((s) => s.color)).toEqual([
      SERIES_COLORS[0],
      SERIES_COLORS[1],
    ])
  })

  it('drops a snapshot whose capture time cannot be parsed', () => {
    const { points } = buildSignalHistory([
      snapshot('not a timestamp', [reading()]),
      snapshot('2026-08-29T00:00:00Z', [reading()]),
    ])

    expect(points).toHaveLength(1)
    expect(points[0].t).toBe(Date.parse('2026-08-29T00:00:00Z'))
  })

  it('returns nothing to plot for a node with no snapshots', () => {
    expect(buildSignalHistory([])).toEqual({ series: [], points: [] })
  })
})

describe('rssiDomain', () => {
  it('pads the observed range out to a 5 dB step', () => {
    const { series, points } = buildSignalHistory([
      snapshot('2026-08-29T00:00:00Z', [reading({ rssi_dbm: -63 })]),
      snapshot('2026-08-29T00:00:10Z', [reading({ rssi_dbm: -48 })]),
    ])

    expect(rssiDomain(points, series)).toEqual([-70, -40])
  })

  it('never runs past the ends of the sensor range', () => {
    const { series, points } = buildSignalHistory([
      snapshot('2026-08-29T00:00:00Z', [reading({ rssi_dbm: -150 })]),
      snapshot('2026-08-29T00:00:10Z', [reading({ rssi_dbm: 0 })]),
    ])

    expect(rssiDomain(points, series)).toEqual([-150, 0])
  })

  it('falls back to the practical RSSI window when there is no data', () => {
    expect(rssiDomain([], [])).toEqual([-100, -40])
  })
})
