import L from 'leaflet'
import 'leaflet.heat'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

// leaflet.heat attaches L.heatLayer to the Leaflet namespace when imported
type HeatPoint = [number, number, number] // [lat, lng, intensity 0–1]

interface Props {
  points: HeatPoint[]
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
