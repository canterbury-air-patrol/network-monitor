import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePreferencesStore } from '../preferences'
import { useMapStore } from '../store'
import type { PendingPin } from '../types'
import {
  altitudeInputValue,
  ALTITUDE_UNIT_LABEL,
  toMetres,
  type AltitudeUnit,
} from '../units'

interface Fields {
  name: string
  /** Typed in the operator's altitude unit ([P3-17]); stored in metres. */
  altitude: string
  latitude: string
  longitude: string
}

const EMPTY: Fields = { name: '', altitude: '', latitude: '', longitude: '' }

/** A plausible mast height in each unit, so the hint matches what is asked for. */
const ALTITUDE_PLACEHOLDER: Record<AltitudeUnit, string> = {
  m: 'e.g. 320',
  ft: 'e.g. 1050',
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

interface FieldsProps {
  initial: Fields
  /** The unit the altitude field is typed and displayed in. */
  altitudeUnit: AltitudeUnit
  /** Editing exposes coordinate inputs; a new pin shows its map position. */
  pendingPin: PendingPin | null
  /** Returns a message to display, or null once the station has been saved. */
  onSubmit: (fields: Fields) => string | null
  onCancel: () => void
}

function StationFields({
  initial,
  altitudeUnit,
  pendingPin,
  onSubmit,
  onCancel,
}: FieldsProps) {
  const [fields, setFields] = useState<Fields>(initial)
  const [error, setError] = useState<string | null>(null)

  const editing = pendingPin === null

  const set = (key: keyof Fields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(onSubmit(fields))
  }

  const inputClass =
    'mt-1 min-h-11 w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400'

  return (
    // Leaflet's own controls sit at z-index 1000, so the form has to clear them
    <form
      onSubmit={submit}
      data-testid="ground-station-form"
      className="bg-surface absolute bottom-4 left-4 z-1100 w-72 rounded-lg p-4 text-white shadow-lg"
    >
      <p className="mb-3 text-sm font-semibold">
        {editing ? 'Edit ground station' : 'New ground station'}
      </p>

      <label className="mb-3 block text-xs text-white/70">
        Name
        <input
          value={fields.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Summit Repeater"
          className={inputClass}
        />
      </label>

      <label className="mb-3 block text-xs text-white/70">
        Altitude ({ALTITUDE_UNIT_LABEL[altitudeUnit]})
        <input
          value={fields.altitude}
          onChange={(e) => set('altitude', e.target.value)}
          inputMode="decimal"
          placeholder={ALTITUDE_PLACEHOLDER[altitudeUnit]}
          className={inputClass}
        />
      </label>

      {editing ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block text-xs text-white/70">
            Latitude
            <input
              value={fields.latitude}
              onChange={(e) => set('latitude', e.target.value)}
              inputMode="decimal"
              className={inputClass}
            />
          </label>
          <label className="block text-xs text-white/70">
            Longitude
            <input
              value={fields.longitude}
              onChange={(e) => set('longitude', e.target.value)}
              inputMode="decimal"
              className={inputClass}
            />
          </label>
        </div>
      ) : (
        <p
          className="mb-3 text-xs text-white/60"
          data-testid="pending-position"
        >
          {pendingPin.latitude.toFixed(5)}, {pendingPin.longitude.toFixed(5)}
          <br />
          Click the map again to move the pin.
        </p>
      )}

      {error && (
        <p role="alert" className="mb-3 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-accent text-primary min-h-11 flex-1 rounded px-3 py-2 text-sm font-medium"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 flex-1 rounded bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * Add/edit panel for manual ground stations, shown over the map whenever the
 * operator has placed a pin or opened an existing station.
 *
 * A new station takes its position from the map click, so the coordinates are
 * shown read-only and are moved by clicking the map again — typing coordinates
 * on a touch screen in the field is worse than re-tapping. An existing station
 * has no pin to re-place, so editing exposes the coordinates as inputs.
 */
export default function GroundStationForm() {
  const { pendingPin, station } = useMapStore(
    useShallow((s) => ({
      pendingPin: s.pendingPin,
      station:
        s.editingStationId === null
          ? null
          : (s.manualGroundStations[s.editingStationId] ?? null),
    })),
  )
  const confirmPin = useMapStore((s) => s.confirmPin)
  const cancelPin = useMapStore((s) => s.cancelPin)
  const updateGroundStation = useMapStore((s) => s.updateGroundStation)
  const stopEditingStation = useMapStore((s) => s.stopEditingStation)
  const altitudeUnit = usePreferencesStore((s) => s.units.altitude)

  if (station) {
    const initial: Fields = {
      name: station.name,
      altitude: altitudeInputValue(station.altitudeM, altitudeUnit),
      latitude: String(station.latitude),
      longitude: String(station.longitude),
    }

    const save = (fields: Fields) => {
      const common = validateCommon(fields, altitudeUnit)
      if (typeof common === 'string') return common

      const latitude = parseNumber(fields.latitude)
      if (latitude === null || latitude < -90 || latitude > 90) {
        return 'Latitude must be between -90 and 90.'
      }
      const longitude = parseNumber(fields.longitude)
      if (longitude === null || longitude < -180 || longitude > 180) {
        return 'Longitude must be between -180 and 180.'
      }

      // Re-saving a station whose altitude was never retyped keeps the stored
      // metres exactly: the field was seeded from a rounded conversion, and
      // converting it back would walk the altitude a little every edit.
      const altitudeM =
        fields.altitude.trim() === initial.altitude
          ? station.altitudeM
          : common.altitudeM

      updateGroundStation(station.id, {
        name: common.name,
        altitudeM,
        latitude,
        longitude,
      })
      stopEditingStation()
      return null
    }

    return (
      // Remounting per station reseeds the inputs without a state-sync effect.
      // Changing the altitude unit reseeds them too: the number in the field
      // means something else the moment the label beside it changes.
      <StationFields
        key={`edit-${station.id}-${altitudeUnit}`}
        initial={initial}
        altitudeUnit={altitudeUnit}
        pendingPin={null}
        onSubmit={save}
        onCancel={stopEditingStation}
      />
    )
  }

  if (!pendingPin) return null

  const save = (fields: Fields) => {
    const common = validateCommon(fields, altitudeUnit)
    if (typeof common === 'string') return common

    confirmPin(common.name, common.altitudeM)
    return null
  }

  return (
    <StationFields
      key={`new-${altitudeUnit}`}
      initial={EMPTY}
      altitudeUnit={altitudeUnit}
      pendingPin={pendingPin}
      onSubmit={save}
      onCancel={cancelPin}
    />
  )
}

/**
 * Returns the parsed name and the altitude in metres — the field is typed in
 * the operator's unit ([P3-17]) but everything downstream stores metres — or
 * the message explaining what failed.
 */
function validateCommon(
  fields: Fields,
  altitudeUnit: AltitudeUnit,
): { name: string; altitudeM: number } | string {
  const name = fields.name.trim()
  if (name === '') return 'Name is required.'

  const altitude = parseNumber(fields.altitude)
  if (altitude === null) return 'Altitude must be a number.'

  return { name, altitudeM: toMetres(altitude, altitudeUnit) }
}
