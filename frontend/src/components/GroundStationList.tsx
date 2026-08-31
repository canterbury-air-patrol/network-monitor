import { useShallow } from 'zustand/react/shallow'
import { usePreferencesStore } from '../preferences'
import { useMapStore } from '../store'
import { formatAltitude } from '../units'

/** Roster of pinned ground stations with edit/remove controls. */
export default function GroundStationList() {
  const { stations, editingStationId } = useMapStore(
    useShallow((s) => ({
      stations: s.manualGroundStations,
      editingStationId: s.editingStationId,
    })),
  )
  const startEditingStation = useMapStore((s) => s.startEditingStation)
  const removeGroundStation = useMapStore((s) => s.removeGroundStation)
  const altitudeUnit = usePreferencesStore((s) => s.units.altitude)

  const list = Object.values(stations)

  if (list.length === 0) {
    return (
      <p className="mt-3 text-xs text-slate-300" data-testid="no-stations">
        No ground stations pinned.
      </p>
    )
  }

  return (
    <ul className="mt-3 space-y-2" data-testid="ground-station-list">
      {list.map((station) => (
        <li
          key={station.id}
          className={`rounded p-2 ${
            station.id === editingStationId ? 'bg-white/15' : 'bg-white/5'
          }`}
        >
          <p className="truncate text-sm" title={station.name}>
            {station.name}
          </p>
          <p className="text-xs text-slate-300">
            {formatAltitude(station.altitudeM, altitudeUnit)} &middot;{' '}
            {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => startEditingStation(station.id)}
              aria-label={`Edit ${station.name}`}
              className="min-h-11 flex-1 rounded bg-white/10 px-2 text-sm hover:bg-white/20"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => removeGroundStation(station.id)}
              aria-label={`Remove ${station.name}`}
              className="min-h-11 flex-1 rounded bg-white/10 px-2 text-sm text-red-200 hover:bg-white/20"
            >
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
