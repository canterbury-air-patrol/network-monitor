import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import GroundStationList from '../GroundStationList'
import { useMapStore } from '../../store'

beforeEach(() => {
  localStorage.clear()
  useMapStore.setState({
    manualGroundStations: {},
    pinningMode: false,
    pendingPin: null,
    editingStationId: null,
    _nextGsId: 1,
  })
})

describe('GroundStationList', () => {
  it('explains the empty state', () => {
    render(<GroundStationList />)

    expect(screen.getByTestId('no-stations')).toBeInTheDocument()
    expect(screen.queryByTestId('ground-station-list')).not.toBeInTheDocument()
  })

  it('lists each station with its altitude and position', () => {
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)
    useMapStore.getState().addGroundStation('Bravo', -43.6, 172.6, 20)
    render(<GroundStationList />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(
      screen.getByText('20 m · -43.6000, 172.6000', { exact: false }),
    ).toBeInTheDocument()
  })

  it('opens a station in the edit form', async () => {
    const user = userEvent.setup()
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)
    render(<GroundStationList />)

    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }))

    expect(useMapStore.getState().editingStationId).toBe(1)
  })

  it('removes a station', async () => {
    const user = userEvent.setup()
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)
    render(<GroundStationList />)

    await user.click(screen.getByRole('button', { name: 'Remove Alpha' }))

    expect(useMapStore.getState().manualGroundStations).toEqual({})
    expect(screen.getByTestId('no-stations')).toBeInTheDocument()
  })
})
