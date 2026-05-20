import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import { useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import { useShallow } from 'zustand/react/shallow'
import { useMapStore } from '../store'
import type { NodeSnapshotResponse, PaginatedResponse } from '../types'
import HeatmapLayer, { rssiToIntensity } from './HeatmapLayer'

// Vite hashes assets, breaking Leaflet's default icon auto-detection
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

const DEFAULT_CENTER: [number, number] = [-43.5, 172.5]
const DEFAULT_ZOOM = 10

async function fetchSnapshots({
  signal,
}: {
  signal: AbortSignal
}): Promise<NodeSnapshotResponse[]> {
  const res = await fetch('/api/v1/snapshots/', { signal })
  if (!res.ok) throw new Error(`Snapshots fetch failed: ${res.status}`)
  const json = (await res.json()) as PaginatedResponse<NodeSnapshotResponse>
  return json.results
}

export default function MapArea() {
  const { nodes, showUAVOverlay } = useMapStore(
    useShallow((s) => ({ nodes: s.nodes, showUAVOverlay: s.showUAVOverlay })),
  )

  const { data: snapshots = [] } = useQuery({
    queryKey: ['snapshots-heatmap'],
    queryFn: ({ signal }) => fetchSnapshots({ signal }),
    refetchInterval: 30_000,
  })

  const heatPoints = useMemo(
    () =>
      snapshots.flatMap(({ position, radio_readings }) =>
        radio_readings.map(
          ({ rssi_dbm }) =>
            [
              position.latitude,
              position.longitude,
              rssiToIntensity(rssi_dbm),
            ] as [number, number, number],
        ),
      ),
    [snapshots],
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
        <HeatmapLayer points={heatPoints} />
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
