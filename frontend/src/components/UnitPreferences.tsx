import { usePreferencesStore } from '../preferences'
import type { AltitudeUnit, DistanceUnit } from '../units'

interface ChoiceProps<T extends string> {
  /** Also the testid stem: `unit-altitude-ft`, `unit-distance-mi`. */
  name: string
  legend: string
  value: T
  options: { value: T; label: string }[]
  onSelect: (value: T) => void
}

/**
 * One row of mutually exclusive units. Radios would be the obvious markup,
 * but a radio's own box is 20 px at best and the operator is wearing gloves,
 * so these are 44 px buttons carrying the selection in `aria-pressed`
 * ([P3-16]).
 */
function UnitChoice<T extends string>({
  name,
  legend,
  value,
  options,
  onSelect,
}: ChoiceProps<T>) {
  return (
    <fieldset className="mt-3 first:mt-0">
      <legend className="mb-1 text-xs text-slate-300">{legend}</legend>
      <div className="flex gap-2">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              aria-pressed={selected}
              data-testid={`unit-${name}-${option.value}`}
              className={`min-h-11 flex-1 rounded px-2 py-2 text-sm font-medium ${
                selected
                  ? 'bg-accent text-primary'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * Unit preferences ([P3-17]): the operator picks the units every display
 * reads, and the choice is remembered for the next session.
 */
export default function UnitPreferences() {
  const units = usePreferencesStore((s) => s.units)
  const setAltitudeUnit = usePreferencesStore((s) => s.setAltitudeUnit)
  const setDistanceUnit = usePreferencesStore((s) => s.setDistanceUnit)

  return (
    <div data-testid="unit-preferences">
      <UnitChoice<AltitudeUnit>
        name="altitude"
        legend="Altitude"
        value={units.altitude}
        options={[
          { value: 'm', label: 'Metres' },
          { value: 'ft', label: 'Feet' },
        ]}
        onSelect={setAltitudeUnit}
      />
      <UnitChoice<DistanceUnit>
        name="distance"
        legend="Distance"
        value={units.distance}
        options={[
          { value: 'km', label: 'Kilometres' },
          { value: 'mi', label: 'Miles' },
        ]}
        onSelect={setDistanceUnit}
      />
    </div>
  )
}
