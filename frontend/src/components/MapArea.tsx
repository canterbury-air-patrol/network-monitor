import L from 'leaflet'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import { useShallow } from 'zustand/react/shallow'
import { useMapStore } from '../store'

// Vite hashes assets, breaking Leaflet's default icon auto-detection
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

const DEFAULT_CENTER: [number, number] = [-43.5, 172.5]
const DEFAULT_ZOOM = 10

export default function MapArea() {
  const { nodes, showUAVOverlay } = useMapStore(
    useShallow((s) => ({ nodes: s.nodes, showUAVOverlay: s.showUAVOverlay })),
  )

  return (
    <main className="relative flex-1" data-testid="map-area">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {/* P3-02: coverage heatmap layer */}
        {showUAVOverlay &&
          Object.values(nodes).map((node) => (
            <Marker
              key={node.nodeId}
              position={[node.latitude, node.longitude]}
            >
              <Popup>
                <strong>{node.nodeName}</strong>
                <br />
                Alt: {node.altitude.toFixed(0)} m
                <br />
                {new Date(node.capturedAt).toLocaleTimeString()}
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </main>
  )
}
