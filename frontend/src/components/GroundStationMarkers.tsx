import L from 'leaflet'
import { Marker, Popup } from 'react-leaflet'
import { useShallow } from 'zustand/react/shallow'
import { useMapStore } from '../store'
import type { ManualGroundStation } from '../types'

// Ground stations are fixed infrastructure, so they get a mast glyph rather
// than Leaflet's default teardrop, which the UAV overlay already uses.
//
// The glyph stays 24 px — a station has to be placed precisely — but Leaflet
// sizes the clickable box from `iconSize`, so it is centred in a 44 px target
// that a gloved finger can hit ([P3-16]).
function mastIcon(className: string) {
  return L.divIcon({
    className: '',
    html: `<div class="flex h-11 w-11 items-center justify-center"><div class="${className}">&#9650;</div></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 30],
    popupAnchor: [0, -30],
  })
}

const STATION_ICON = mastIcon(
  'flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-primary shadow',
)
const PENDING_ICON = mastIcon(
  'flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs text-primary shadow ring-2 ring-accent',
)

function StationPopup({ station }: { station: ManualGroundStation }) {
  const startEditingStation = useMapStore((s) => s.startEditingStation)
  const removeGroundStation = useMapStore((s) => s.removeGroundStation)

  return (
    <Popup>
      <strong>{station.name}</strong>
      <br />
      Alt: {station.altitudeM.toFixed(0)} m
      <br />
      {station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => startEditingStation(station.id)}
          className="min-h-11 flex-1 rounded bg-slate-200 px-3 text-sm"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => removeGroundStation(station.id)}
          className="min-h-11 flex-1 rounded bg-red-100 px-3 text-sm text-red-800"
        >
          Remove
        </button>
      </div>
    </Popup>
  )
}

/** Markers for saved ground stations, plus the pin awaiting confirmation. */
export default function GroundStationMarkers() {
  const { stations, pendingPin } = useMapStore(
    useShallow((s) => ({
      stations: s.manualGroundStations,
      pendingPin: s.pendingPin,
    })),
  )

  return (
    <>
      {Object.values(stations).map((station) => (
        <Marker
          key={station.id}
          position={[station.latitude, station.longitude]}
          icon={STATION_ICON}
        >
          <StationPopup station={station} />
        </Marker>
      ))}
      {pendingPin && (
        <Marker
          position={[pendingPin.latitude, pendingPin.longitude]}
          icon={PENDING_ICON}
        />
      )}
    </>
  )
}
