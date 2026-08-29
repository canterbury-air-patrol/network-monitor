/**
 * Turns a node's snapshot history into plottable RSSI series.
 *
 * A snapshot carries one reading per radio, band and receiver, so a single
 * flight produces several concurrent links whose signal strengths diverge —
 * exactly what the operator needs to see. Each of those combinations becomes
 * its own series; a timestamp with no reading for a series is left null so a
 * dropped link shows as a gap rather than a flat line at the last value.
 */
import type {
  GroundStationResponse,
  NodeResponse,
  NodeSnapshotResponse,
  RadioReadingResponse,
  RadioResponse,
  RadioType,
} from './types'

export const RADIO_TYPE_LABEL: Record<RadioType, string> = {
  wifi: 'WiFi',
  lora: 'LoRa',
  cellular: 'Cellular',
  bluetooth: 'Bluetooth',
}

/** Line colours, chosen to stay distinguishable on the dark panel in daylight. */
export const SERIES_COLORS = [
  '#38bdf8',
  '#fbbf24',
  '#4ade80',
  '#f472b6',
  '#c084fc',
  '#2dd4bf',
  '#fb7185',
  '#a3e635',
]

export interface SignalSeries {
  /** Recharts `dataKey`; safe to use as a plain object property. */
  key: string
  label: string
  color: string
}

export interface SignalPoint {
  /** Capture time, epoch ms. */
  t: number
  [seriesKey: string]: number | null
}

export interface SignalHistory {
  series: SignalSeries[]
  points: SignalPoint[]
}

export interface SeriesLookups {
  radios?: RadioResponse[]
  stations?: GroundStationResponse[]
  nodes?: NodeResponse[]
}

/**
 * Recharts reads a `dataKey` as a property path, so a band like "2.4GHz" would
 * be split on its dot. Escaping every non-alphanumeric character to its code
 * point keeps the key both path-safe and collision-free.
 */
function escapePart(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0)}_`)
}

function receiverPart(reading: RadioReadingResponse): string {
  if (reading.ground_station !== null) return `gs${reading.ground_station}`
  if (reading.relay_node !== null) return `rn${reading.relay_node}`
  return 'unknown'
}

function seriesKey(reading: RadioReadingResponse): string {
  return `r${reading.radio}_${receiverPart(reading)}_${escapePart(reading.band)}`
}

export function buildSignalHistory(
  snapshots: NodeSnapshotResponse[],
  lookups: SeriesLookups = {},
): SignalHistory {
  const radioById = new Map((lookups.radios ?? []).map((r) => [r.id, r]))
  const stationById = new Map((lookups.stations ?? []).map((s) => [s.id, s]))
  const nodeById = new Map((lookups.nodes ?? []).map((n) => [n.id, n]))

  const radioLabel = (reading: RadioReadingResponse) => {
    const radio = radioById.get(reading.radio)
    const name = radio
      ? RADIO_TYPE_LABEL[radio.radio_type]
      : `Radio ${reading.radio}`
    return `${name} ${reading.band}`
  }

  const receiverLabel = (reading: RadioReadingResponse) => {
    if (reading.ground_station !== null) {
      const station = stationById.get(reading.ground_station)
      return station ? station.name : `station ${reading.ground_station}`
    }
    if (reading.relay_node !== null) {
      const relay = nodeById.get(reading.relay_node)
      return relay
        ? `${relay.name} (relay)`
        : `node ${reading.relay_node} (relay)`
    }
    return 'unknown receiver'
  }

  const seriesByKey = new Map<string, SignalSeries>()
  const pointByTime = new Map<number, SignalPoint>()

  for (const snapshot of snapshots) {
    const t = Date.parse(snapshot.captured_at)
    // An unparseable capture time has no place on a time axis; the reading is
    // still in the API response for anything that wants it.
    if (Number.isNaN(t)) continue
    for (const reading of snapshot.radio_readings) {
      const key = seriesKey(reading)
      if (!seriesByKey.has(key)) {
        seriesByKey.set(key, {
          key,
          label: `${radioLabel(reading)} → ${receiverLabel(reading)}`,
          color: '',
        })
      }
      const point = pointByTime.get(t) ?? { t }
      point[key] = reading.rssi_dbm
      pointByTime.set(t, point)
    }
  }

  // Sorting by label keeps the legend and the colour assignment stable across
  // refetches, which matters when the operator has learned a line's colour.
  const series = [...seriesByKey.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  )
  series.forEach((s, i) => {
    s.color = SERIES_COLORS[i % SERIES_COLORS.length]
  })

  const points = [...pointByTime.values()].sort((a, b) => a.t - b.t)
  for (const point of points) {
    for (const s of series) {
      if (!(s.key in point)) point[s.key] = null
    }
  }

  return { series, points }
}

/** dBm axis bounds, padded off the data and clamped to the sensor's range. */
export function rssiDomain(
  points: SignalPoint[],
  series: SignalSeries[],
): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const point of points) {
    for (const s of series) {
      const value = point[s.key]
      if (typeof value !== 'number') continue
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  if (min === Infinity) return [-100, -40]
  return [
    Math.max(-150, Math.floor(min / 5) * 5 - 5),
    Math.min(0, Math.ceil(max / 5) * 5 + 5),
  ]
}

export function formatClockTime(t: number): string {
  return new Date(t).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
