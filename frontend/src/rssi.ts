// RSSI practical range: -100 dBm (edge of coverage) to -40 dBm (excellent)
const RSSI_FLOOR = -100
const RSSI_CEIL = -40

export function rssiToIntensity(rssiDbm: number): number {
  return Math.max(
    0,
    Math.min(1, (rssiDbm - RSSI_FLOOR) / (RSSI_CEIL - RSSI_FLOOR)),
  )
}
