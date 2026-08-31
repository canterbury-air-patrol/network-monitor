import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import GroundStationForm from '../GroundStationForm'
import { usePreferencesStore } from '../../preferences'
import { useMapStore } from '../../store'
import { DEFAULT_UNITS } from '../../units'

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

function startNewPin(latitude = -43.5, longitude = 172.5) {
  useMapStore.getState().setPinningMode(true)
  useMapStore.getState().startPin(latitude, longitude)
}

function seedStation() {
  useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)
  useMapStore.getState().startEditingStation(1)
}

describe('creating a ground station', () => {
  it('stays hidden until there is a pin or a station to edit', () => {
    render(<GroundStationForm />)

    expect(screen.queryByTestId('ground-station-form')).not.toBeInTheDocument()
  })

  it('shows the pinned position and saves the entered details', async () => {
    const user = userEvent.setup()
    startNewPin()
    render(<GroundStationForm />)

    expect(screen.getByTestId('pending-position')).toHaveTextContent(
      '-43.50000, 172.50000',
    )

    await user.type(screen.getByLabelText(/name/i), 'Summit Repeater')
    await user.type(screen.getByLabelText(/altitude/i), '320')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const state = useMapStore.getState()
    expect(state.manualGroundStations[1]).toEqual({
      id: 1,
      name: 'Summit Repeater',
      latitude: -43.5,
      longitude: 172.5,
      altitudeM: 320,
    })
    expect(state.pendingPin).toBeNull()
  })

  it('follows the pin when the operator clicks the map again', () => {
    startNewPin()
    render(<GroundStationForm />)

    act(() => useMapStore.getState().startPin(-41.3, 174.8))

    expect(screen.getByTestId('pending-position')).toHaveTextContent(
      '-41.30000, 174.80000',
    )
  })

  it('rejects a blank name', async () => {
    const user = userEvent.setup()
    startNewPin()
    render(<GroundStationForm />)

    await user.type(screen.getByLabelText(/altitude/i), '320')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Name is required.')
    expect(useMapStore.getState().manualGroundStations).toEqual({})
  })

  it('rejects an altitude that is not a number', async () => {
    const user = userEvent.setup()
    startNewPin()
    render(<GroundStationForm />)

    await user.type(screen.getByLabelText(/name/i), 'Alpha')
    await user.type(screen.getByLabelText(/altitude/i), 'high up')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Altitude must be a number.',
    )
    expect(useMapStore.getState().manualGroundStations).toEqual({})
  })

  it('discards the pin on cancel', async () => {
    const user = userEvent.setup()
    startNewPin()
    render(<GroundStationForm />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(useMapStore.getState().pendingPin).toBeNull()
    expect(useMapStore.getState().manualGroundStations).toEqual({})
  })
})

describe('editing a ground station', () => {
  it('prefills the existing details, coordinates included', () => {
    seedStation()
    render(<GroundStationForm />)

    expect(screen.getByLabelText(/name/i)).toHaveValue('Alpha')
    expect(screen.getByLabelText(/altitude/i)).toHaveValue('10')
    expect(screen.getByLabelText(/latitude/i)).toHaveValue('-43.5')
    expect(screen.getByLabelText(/longitude/i)).toHaveValue('172.5')
  })

  it('saves a rename and a move', async () => {
    const user = userEvent.setup()
    seedStation()
    render(<GroundStationForm />)

    await user.clear(screen.getByLabelText(/name/i))
    await user.type(screen.getByLabelText(/name/i), 'Alpha Relocated')
    await user.clear(screen.getByLabelText(/latitude/i))
    await user.type(screen.getByLabelText(/latitude/i), '-43.4')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const state = useMapStore.getState()
    expect(state.manualGroundStations[1]).toEqual({
      id: 1,
      name: 'Alpha Relocated',
      latitude: -43.4,
      longitude: 172.5,
      altitudeM: 10,
    })
    expect(state.editingStationId).toBeNull()
  })

  it('rejects an out-of-range latitude', async () => {
    const user = userEvent.setup()
    seedStation()
    render(<GroundStationForm />)

    await user.clear(screen.getByLabelText(/latitude/i))
    await user.type(screen.getByLabelText(/latitude/i), '120')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Latitude must be between -90 and 90.',
    )
    expect(useMapStore.getState().manualGroundStations[1].latitude).toBe(-43.5)
  })

  it('leaves the station untouched on cancel', async () => {
    const user = userEvent.setup()
    seedStation()
    render(<GroundStationForm />)

    await user.clear(screen.getByLabelText(/name/i))
    await user.type(screen.getByLabelText(/name/i), 'Discarded')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(useMapStore.getState().editingStationId).toBeNull()
    expect(useMapStore.getState().manualGroundStations[1].name).toBe('Alpha')
  })
})

describe("altitude in the operator's unit", () => {
  it('labels the field with the unit and stores metres', async () => {
    const user = userEvent.setup()
    usePreferencesStore.getState().setAltitudeUnit('ft')
    startNewPin()
    render(<GroundStationForm />)

    expect(screen.getByLabelText(/altitude/i)).toHaveAccessibleName(
      'Altitude (ft)',
    )

    await user.type(screen.getByLabelText(/name/i), 'Summit Repeater')
    await user.type(screen.getByLabelText(/altitude/i), '1050')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // The roster, the map and the API all speak metres, whatever was typed
    expect(
      useMapStore.getState().manualGroundStations[1].altitudeM,
    ).toBeCloseTo(320.04, 2)
  })

  it('prefills an existing station in the display unit', () => {
    usePreferencesStore.getState().setAltitudeUnit('ft')
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 320)
    useMapStore.getState().startEditingStation(1)
    render(<GroundStationForm />)

    expect(screen.getByLabelText(/altitude/i)).toHaveValue('1049.9')
  })

  it('leaves the stored altitude exact when it is not retyped', async () => {
    const user = userEvent.setup()
    usePreferencesStore.getState().setAltitudeUnit('ft')
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 320)
    useMapStore.getState().startEditingStation(1)
    render(<GroundStationForm />)

    await user.clear(screen.getByLabelText(/name/i))
    await user.type(screen.getByLabelText(/name/i), 'Alpha Renamed')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // The field was seeded from a rounded conversion; converting it back would
    // walk the altitude a few centimetres on every edit
    expect(useMapStore.getState().manualGroundStations[1].altitudeM).toBe(320)
  })

  it('reseeds the field when the unit changes under an open form', () => {
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 320)
    useMapStore.getState().startEditingStation(1)
    render(<GroundStationForm />)

    expect(screen.getByLabelText(/altitude/i)).toHaveValue('320')

    act(() => usePreferencesStore.getState().setAltitudeUnit('ft'))

    expect(screen.getByLabelText(/altitude/i)).toHaveAccessibleName(
      'Altitude (ft)',
    )
    expect(screen.getByLabelText(/altitude/i)).toHaveValue('1049.9')
  })
})
