import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { useShallow } from 'zustand/react/shallow'
import { fetchMapView } from '../api/mapView'
import { useGeolocation } from '../hooks/useGeolocation'
import {
  FALLBACK_CENTER,
  FALLBACK_ZOOM,
  resolveInitialView,
} from '../initialView'
import { rssiToIntensity } from '../rssi'
import { useMapStore } from '../store'
import type {
  MapViewResponse,
  NodeSnapshotResponse,
  PaginatedResponse,
} from '../types'
import ErrorBoundary from './ErrorBoundary'
import GroundStationForm from './GroundStationForm'
import GroundStationMarkers from './GroundStationMarkers'
import HeatmapLayer from './HeatmapLayer'
import NodeMarkers from './NodeMarkers'
import PinCapture from './PinCapture'

// Vite hashes assets, breaking Leaflet's default icon auto-detection. Naming
// the hashed URLs is only half the fix: `Icon.Default` prepends a path it
// sniffs out of leaflet.css to whatever it is given, so the hashed URL comes
// back doubled and the marker renders as a broken image with its alt text.
// Pinning the prefix to empty leaves the imported URLs to stand alone.
L.Icon.Default.imagePath = ''
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

interface OverlayProps {
  label: string
  onStatus: (label: string, failed: boolean) => void
  children: ReactNode
}

/**
 * Boundary for a layer drawn inside the Leaflet map pane. A crashed layer is
 * dropped rather than replaced in place — a fallback painted over the pane
 * would hide the coverage display — so the failure is reported to the caller,
 * which surfaces it beside the map. The report is withdrawn when the layer
 * unmounts, so a layer the operator has simply switched off stops being
 * announced as broken.
 */
function MapOverlay({ label, onStatus, children }: OverlayProps) {
  useEffect(() => () => onStatus(label, false), [label, onStatus])

  return (
    <ErrorBoundary
      label={label}
      fallback={null}
      onError={() => onStatus(label, true)}
    >
      {children}
    </ErrorBoundary>
  )
}

/**
 * Applies the resolved viewport to the live map. Re-centring is keyed on the
 * resolved view, so a mission going active snaps the map to its area of
 * operation while ordinary refetches leave the operator's panning alone.
 *
 * Movement the operator initiates is recorded so a device fix that lands late
 * — after they have already dragged the map somewhere deliberate — is dropped
 * rather than pulling the view out from under them. Our own re-centring is
 * unanimated, so it raises the same Leaflet events synchronously and is
 * bracketed out of that record.
 */
function MapViewController({ view }: { view: MapViewResponse | undefined }) {
  const map = useMap()
  const geo = useGeolocation()
  const appliedKey = useRef<string | null>(null)
  const operatorMoved = useRef(false)
  const programmatic = useRef(false)

  useEffect(() => {
    const noteMove = () => {
      if (!programmatic.current) operatorMoved.current = true
    }
    map.on('dragstart', noteMove)
    map.on('zoomstart', noteMove)
    return () => {
      map.off('dragstart', noteMove)
      map.off('zoomstart', noteMove)
    }
  }, [map])

  useEffect(() => {
    const target = resolveInitialView(view, geo, operatorMoved.current)
    if (!target || target.key === appliedKey.current) return
    appliedKey.current = target.key
    programmatic.current = true
    map.setView(target.center, target.zoom, { animate: false })
    programmatic.current = false
  }, [map, view, geo])

  return null
}

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
  const { showUAVOverlay, pinningMode } = useMapStore(
    useShallow((s) => ({
      showUAVOverlay: s.showUAVOverlay,
      pinningMode: s.pinningMode,
    })),
  )

  const [degraded, setDegraded] = useState<string[]>([])
  const onOverlayStatus = useCallback((label: string, failed: boolean) => {
    setDegraded((prev) => {
      if (failed) return prev.includes(label) ? prev : [...prev, label]
      return prev.includes(label) ? prev.filter((l) => l !== label) : prev
    })
  }, [])

  const { data: mapView } = useQuery({
    queryKey: ['map-view'],
    queryFn: ({ signal }) => fetchMapView(signal),
    refetchInterval: 30_000,
  })

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
        center={
          mapView
            ? [mapView.center.latitude, mapView.center.longitude]
            : FALLBACK_CENTER
        }
        zoom={mapView?.zoom ?? FALLBACK_ZOOM}
        className={`h-full w-full ${pinningMode ? 'cursor-crosshair!' : ''}`}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapOverlay label="Map view" onStatus={onOverlayStatus}>
          <MapViewController view={mapView} />
        </MapOverlay>
        <MapOverlay label="Coverage" onStatus={onOverlayStatus}>
          <HeatmapLayer points={heatPoints} />
        </MapOverlay>
        <MapOverlay label="Pin capture" onStatus={onOverlayStatus}>
          <PinCapture />
        </MapOverlay>
        <MapOverlay label="Ground station markers" onStatus={onOverlayStatus}>
          <GroundStationMarkers />
        </MapOverlay>
        {showUAVOverlay && (
          <MapOverlay label="UAV markers" onStatus={onOverlayStatus}>
            <NodeMarkers />
          </MapOverlay>
        )}
      </MapContainer>
      {degraded.length > 0 && (
        // Leaflet's own controls sit at z-index 1000, so the notice clears them
        <p
          role="alert"
          data-testid="map-degraded"
          className="absolute top-4 right-4 z-1100 rounded border border-red-400 bg-red-50 px-3 py-2 text-xs text-red-900 shadow"
        >
          Unavailable: {degraded.join(', ')}
        </p>
      )}
      <ErrorBoundary label="Ground station form">
        <GroundStationForm />
      </ErrorBoundary>
    </main>
  )
}
