import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import UnitPreferences from '../UnitPreferences'
import { usePreferencesStore } from '../../preferences'
import { DEFAULT_UNITS } from '../../units'

beforeEach(() => {
  localStorage.clear()
  usePreferencesStore.setState({ units: DEFAULT_UNITS })
})

describe('UnitPreferences', () => {
  it('shows the units in force', () => {
    render(<UnitPreferences />)

    expect(screen.getByTestId('unit-altitude-m')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('unit-altitude-ft')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByTestId('unit-distance-km')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('switches altitude to feet', async () => {
    const user = userEvent.setup()
    render(<UnitPreferences />)

    await user.click(screen.getByRole('button', { name: 'Feet' }))

    expect(usePreferencesStore.getState().units.altitude).toBe('ft')
    expect(screen.getByTestId('unit-altitude-ft')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('unit-altitude-m')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('switches distance to miles without disturbing altitude', async () => {
    const user = userEvent.setup()
    render(<UnitPreferences />)

    await user.click(screen.getByRole('button', { name: 'Miles' }))

    expect(usePreferencesStore.getState().units).toEqual({
      altitude: 'm',
      distance: 'mi',
    })
  })

  it('reflects a preference restored from a previous session', () => {
    usePreferencesStore.setState({ units: { altitude: 'ft', distance: 'mi' } })
    render(<UnitPreferences />)

    expect(screen.getByTestId('unit-altitude-ft')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('unit-distance-mi')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
