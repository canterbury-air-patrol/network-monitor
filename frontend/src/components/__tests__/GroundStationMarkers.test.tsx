import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GroundStationMarkers from '../GroundStationMarkers'
import { usePreferencesStore } from '../../preferences'
import { useMapStore } from '../../store'
import { DEFAULT_UNITS } from '../../units'

// react-leaflet needs a live map context; the markers themselves are what matter
vi.mock('react-leaflet', () => ({
  Marker: ({
    position,
    children,
  }: {
    position: [number, number]
    children?: ReactNode
  }) => (
    <div data-testid="marker" data-position={position.join(',')}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

beforeEach(() => {
  localStorage.clear()
  usePreferencesStore.setState({ units: DEFAULT_UNITS })
  useMapStore.setState({
    manualGroundStations: {},
    pinningMode: false,
    pendingPin: null,
    editingStationId: null,
    _nextGsId: 1,
  })
})

describe('GroundStationMarkers', () => {
  it('places a marker at each station', () => {
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)
    render(<GroundStationMarkers />)

    expect(screen.getByTestId('marker')).toHaveAttribute(
      'data-position',
      '-43.5,172.5',
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('shows the unconfirmed pin as well', () => {
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)
    useMapStore.getState().setPinningMode(true)
    useMapStore.getState().startPin(-41.3, 174.8)
    render(<GroundStationMarkers />)

    expect(
      screen.getAllByTestId('marker').map((el) => el.dataset.position),
    ).toEqual(['-43.5,172.5', '-41.3,174.8'])
  })

  it('edits and removes from the popup', async () => {
    const user = userEvent.setup()
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)
    render(<GroundStationMarkers />)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(useMapStore.getState().editingStationId).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(useMapStore.getState().manualGroundStations).toEqual({})
  })

  it("reports altitude in the operator's unit", () => {
    usePreferencesStore.getState().setAltitudeUnit('ft')
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 320)
    render(<GroundStationMarkers />)

    expect(screen.getByText(/Alt: 1050 ft/)).toBeInTheDocument()
  })
})
