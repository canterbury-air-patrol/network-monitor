import { useMapEvents } from 'react-leaflet'
import { useMapStore } from '../store'

/**
 * Captures map clicks as candidate ground-station positions. The store ignores
 * clicks unless pinning mode is active, so this stays mounted unconditionally.
 */
export default function PinCapture() {
  const startPin = useMapStore((s) => s.startPin)

  useMapEvents({
    click: (e) => startPin(e.latlng.lat, e.latlng.lng),
  })

  return null
}
