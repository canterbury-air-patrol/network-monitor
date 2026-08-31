/**
 * Unit preferences ([P3-17]).
 *
 * Everything is stored and transported in SI — altitudes in metres, distances
 * in metres — and converted only on its way to the display, so the operator
 * can switch units at any time without rewriting stored data or reloading.
 */

export type AltitudeUnit = 'm' | 'ft'
export type DistanceUnit = 'km' | 'mi'

export interface UnitPreferences {
  altitude: AltitudeUnit
  distance: DistanceUnit
}

/** SI until the operator says otherwise; a login may seed it in Phase 4. */
export const DEFAULT_UNITS: UnitPreferences = { altitude: 'm', distance: 'km' }

const METRES_PER_FOOT = 0.3048
const METRES_PER_KILOMETRE = 1000
const METRES_PER_MILE = 1609.344

export const ALTITUDE_UNIT_LABEL: Record<AltitudeUnit, string> = {
  m: 'm',
  ft: 'ft',
}

export const DISTANCE_UNIT_LABEL: Record<DistanceUnit, string> = {
  km: 'km',
  mi: 'mi',
}

/** Metres in the operator's altitude unit. */
export function toAltitude(metres: number, unit: AltitudeUnit): number {
  return unit === 'ft' ? metres / METRES_PER_FOOT : metres
}

/** An altitude typed in the operator's unit, back in metres for storage. */
export function toMetres(value: number, unit: AltitudeUnit): number {
  return unit === 'ft' ? value * METRES_PER_FOOT : value
}

/** Metres in the operator's distance unit. */
export function toDistance(metres: number, unit: DistanceUnit): number {
  return metres / (unit === 'mi' ? METRES_PER_MILE : METRES_PER_KILOMETRE)
}

/**
 * An altitude for display. Sub-metre precision is noise on a UAV or a mast,
 * so both units round to whole numbers, as the displays did before the
 * preference existed.
 */
export function formatAltitude(metres: number, unit: AltitudeUnit): string {
  // A template literal renders Math.round's -0 as "0"
  return `${Math.round(toAltitude(metres, unit))} ${ALTITUDE_UNIT_LABEL[unit]}`
}

/**
 * A distance for display. Precision follows the magnitude: a few hundred
 * metres between a UAV and its ground station is meaningless at 0 dp, while a
 * cross-country leg reads better without the decimals.
 */
export function formatDistance(metres: number, unit: DistanceUnit): string {
  const value = toDistance(metres, unit)
  const magnitude = Math.abs(value)
  const digits = magnitude < 10 ? 2 : magnitude < 100 ? 1 : 0
  return `${value.toFixed(digits)} ${DISTANCE_UNIT_LABEL[unit]}`
}

/**
 * A stored altitude as the edit form's input value: converted, and rounded to
 * a precision an operator would plausibly type rather than the full repeating
 * conversion.
 */
export function altitudeInputValue(metres: number, unit: AltitudeUnit): string {
  return String(Math.round(toAltitude(metres, unit) * 10) / 10)
}
