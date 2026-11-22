import type { Layer } from 'leaflet'
import { HeatLayer, type HeatLatLng } from 'leaflet.heat'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

type HeatPoint = [number, number, number] // [lat, lng, intensity 0–1]

// leaflet.heat 1.x subclasses L.Layer at runtime on Leaflet 1.9, but its
// typings extend Leaflet 2's generic `Layer<Options>`, which @types/leaflet 1.9
// doesn't declare — so TypeScript loses every inherited Layer method. Describe
// the instance as what it is until the map moves to Leaflet 2's own types.
interface CoverageHeatLayer extends Layer {
  setLatLngs(latlngs: HeatLatLng[]): this
}

interface Props {
  points: HeatPoint[]
}

export default function HeatmapLayer({ points }: Props) {
  const map = useMap()
  const layerRef = useRef<CoverageHeatLayer | null>(null)

  useEffect(() => {
    const layer = new HeatLayer([], {
      radius: 25,
      blur: 15,
      maxZoom: 17,
    }) as unknown as CoverageHeatLayer
    layerRef.current = layer.addTo(map)
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
