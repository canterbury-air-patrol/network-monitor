import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_UNITS,
  type AltitudeUnit,
  type DistanceUnit,
  type UnitPreferences,
} from './units'

interface PreferencesState {
  units: UnitPreferences
  setAltitudeUnit: (unit: AltitudeUnit) => void
  setDistanceUnit: (unit: DistanceUnit) => void
  /** Replaces both at once — how a Phase 4 login will seed the operator's set. */
  setUnits: (units: UnitPreferences) => void
}

/**
 * Unit preferences are per-operator, and Phase 4 moves them to the backend
 * account. Until there is an account to hang them on they live in this
 * browser, under their own key so a stored preference is not entangled with
 * the ground-station roster's.
 */
const STORAGE_KEY = 'network-monitor-preferences'

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      units: DEFAULT_UNITS,
      setAltitudeUnit: (altitude) =>
        set((state) => ({ units: { ...state.units, altitude } })),
      setDistanceUnit: (distance) =>
        set((state) => ({ units: { ...state.units, distance } })),
      setUnits: (units) => set({ units }),
    }),
    {
      name: STORAGE_KEY,
      // A set written by an older build may be missing a unit the current one
      // reads, so the defaults fill in behind whatever was stored
      merge: (persisted, current) => ({
        ...current,
        units: {
          ...DEFAULT_UNITS,
          ...(persisted as { units?: Partial<UnitPreferences> } | undefined)
            ?.units,
        },
      }),
    },
  ),
)
