import L from 'leaflet'
import 'leaflet.heat'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

// leaflet.heat attaches L.heatLayer to the Leaflet namespace when imported
type HeatPoint = [number, number, number] // [lat, lng, intensity 0–1]

interface Props {
  points: HeatPoint[]
}

// RSSI practical range: -100 dBm (edge of coverage) to -40 dBm (excellent)
const RSSI_FLOOR = -100
const RSSI_CEIL = -40

export function rssiToIntensity(rssiDbm: number): number {
  return Math.max(
    0,
    Math.min(1, (rssiDbm - RSSI_FLOOR) / (RSSI_CEIL - RSSI_FLOOR)),
  )
}

export default function HeatmapLayer({ points }: Props) {
  const map = useMap()
  const layerRef = useRef<L.HeatLayer | null>(null)

  useEffect(() => {
    layerRef.current = L.heatLayer([], {
      radius: 25,
      blur: 15,
      maxZoom: 17,
    }).addTo(map)
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map])

  useEffect(() => {
    layerRef.current?.setLatLngs(points)
  }, [points])

  return null
}
