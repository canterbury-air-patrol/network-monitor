import { beforeEach, describe, expect, it } from 'vitest'
import { usePreferencesStore } from '../preferences'
import { DEFAULT_UNITS } from '../units'

const STORAGE_KEY = 'network-monitor-preferences'

beforeEach(() => {
  localStorage.clear()
  usePreferencesStore.setState({ units: DEFAULT_UNITS })
})

describe('unit preferences', () => {
  it('defaults to metres and kilometres', () => {
    expect(usePreferencesStore.getState().units).toEqual(DEFAULT_UNITS)
  })

  it('switches each unit independently', () => {
    usePreferencesStore.getState().setAltitudeUnit('ft')
    expect(usePreferencesStore.getState().units).toEqual({
      altitude: 'ft',
      distance: 'km',
    })

    usePreferencesStore.getState().setDistanceUnit('mi')
    expect(usePreferencesStore.getState().units).toEqual({
      altitude: 'ft',
      distance: 'mi',
    })
  })

  it('takes a whole set at once, as a login will', () => {
    usePreferencesStore.getState().setUnits({ altitude: 'ft', distance: 'mi' })
    expect(usePreferencesStore.getState().units).toEqual({
      altitude: 'ft',
      distance: 'mi',
    })
  })

  it('persists the choice for the next session', () => {
    usePreferencesStore.getState().setAltitudeUnit('ft')

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject(
      { state: { units: { altitude: 'ft', distance: 'km' } } },
    )
  })

  it('fills in a unit an older stored set is missing', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { units: { distance: 'mi' } }, version: 0 }),
    )

    usePreferencesStore.persist.rehydrate()

    expect(usePreferencesStore.getState().units).toEqual({
      altitude: 'm',
      distance: 'mi',
    })
  })
})
