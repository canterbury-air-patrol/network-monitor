import { beforeEach, describe, expect, it } from 'vitest'
import { useMapStore } from '../store'

const STORAGE_KEY = 'network-monitor-ground-stations'

function reset() {
  useMapStore.setState({
    nodes: {},
    showUAVOverlay: false,
    manualGroundStations: {},
    pinningMode: false,
    pendingPin: null,
    _nextGsId: 1,
  })
}

beforeEach(() => {
  localStorage.clear()
  reset()
})

describe('pinning mode', () => {
  it('starts disabled', () => {
    expect(useMapStore.getState().pinningMode).toBe(false)
    expect(useMapStore.getState().pendingPin).toBeNull()
  })

  it('toggles on and off', () => {
    useMapStore.getState().togglePinningMode()
    expect(useMapStore.getState().pinningMode).toBe(true)

    useMapStore.getState().togglePinningMode()
    expect(useMapStore.getState().pinningMode).toBe(false)
  })

  it('sets the mode explicitly', () => {
    useMapStore.getState().setPinningMode(true)
    expect(useMapStore.getState().pinningMode).toBe(true)

    useMapStore.getState().setPinningMode(false)
    expect(useMapStore.getState().pinningMode).toBe(false)
  })

  it('discards an unconfirmed pin when the mode is left', () => {
    const { togglePinningMode, startPin } = useMapStore.getState()
    togglePinningMode()
    startPin(-43.5, 172.5)
    expect(useMapStore.getState().pendingPin).not.toBeNull()

    togglePinningMode()
    expect(useMapStore.getState().pendingPin).toBeNull()
  })
})

describe('startPin', () => {
  it('ignores map clicks while the mode is off', () => {
    useMapStore.getState().startPin(-43.5, 172.5)
    expect(useMapStore.getState().pendingPin).toBeNull()
  })

  it('captures the clicked position while the mode is on', () => {
    useMapStore.getState().setPinningMode(true)
    useMapStore.getState().startPin(-43.5, 172.5)

    expect(useMapStore.getState().pendingPin).toEqual({
      latitude: -43.5,
      longitude: 172.5,
    })
  })

  it('moves the pending pin when the operator clicks again', () => {
    useMapStore.getState().setPinningMode(true)
    useMapStore.getState().startPin(-43.5, 172.5)
    useMapStore.getState().startPin(-41.3, 174.8)

    expect(useMapStore.getState().pendingPin).toEqual({
      latitude: -41.3,
      longitude: 174.8,
    })
  })
})

describe('confirmPin', () => {
  it('promotes the pending pin to a ground station and leaves the mode', () => {
    useMapStore.getState().setPinningMode(true)
    useMapStore.getState().startPin(-43.5, 172.5)
    useMapStore.getState().confirmPin('Alpha', 15)

    const state = useMapStore.getState()
    expect(state.manualGroundStations[1]).toEqual({
      id: 1,
      name: 'Alpha',
      latitude: -43.5,
      longitude: 172.5,
      altitudeM: 15,
    })
    expect(state.pendingPin).toBeNull()
    expect(state.pinningMode).toBe(false)
  })

  it('is a no-op without a pending pin', () => {
    useMapStore.getState().confirmPin('Alpha', 15)

    expect(useMapStore.getState().manualGroundStations).toEqual({})
    expect(useMapStore.getState()._nextGsId).toBe(1)
  })
})

describe('cancelPin', () => {
  it('drops the pending pin but stays in pinning mode', () => {
    useMapStore.getState().setPinningMode(true)
    useMapStore.getState().startPin(-43.5, 172.5)
    useMapStore.getState().cancelPin()

    expect(useMapStore.getState().pendingPin).toBeNull()
    expect(useMapStore.getState().pinningMode).toBe(true)
  })
})

describe('ground station collection', () => {
  it('assigns increasing ids', () => {
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)
    useMapStore.getState().addGroundStation('Bravo', -43.6, 172.6, 20)

    const { manualGroundStations, _nextGsId } = useMapStore.getState()
    expect(Object.keys(manualGroundStations)).toEqual(['1', '2'])
    expect(manualGroundStations[2].name).toBe('Bravo')
    expect(_nextGsId).toBe(3)
  })

  it('removes a station without reusing its id', () => {
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)
    useMapStore.getState().removeGroundStation(1)
    useMapStore.getState().addGroundStation('Bravo', -43.6, 172.6, 20)

    const { manualGroundStations } = useMapStore.getState()
    expect(manualGroundStations[1]).toBeUndefined()
    expect(manualGroundStations[2].name).toBe('Bravo')
  })

  it('updates name, altitude and position', () => {
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)
    useMapStore.getState().updateGroundStation(1, {
      name: 'Alpha Relocated',
      altitudeM: 25,
      latitude: -43.4,
      longitude: 172.4,
    })

    expect(useMapStore.getState().manualGroundStations[1]).toEqual({
      id: 1,
      name: 'Alpha Relocated',
      latitude: -43.4,
      longitude: 172.4,
      altitudeM: 25,
    })
  })

  it('ignores updates to an unknown station', () => {
    useMapStore.getState().updateGroundStation(99, { name: 'Ghost' })

    expect(useMapStore.getState().manualGroundStations).toEqual({})
  })
})

describe('persistence', () => {
  it('writes ground stations to local storage', () => {
    useMapStore.getState().addGroundStation('Alpha', -43.5, 172.5, 10)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.state.manualGroundStations['1'].name).toBe('Alpha')
    expect(stored.state._nextGsId).toBe(2)
  })

  it('does not persist live telemetry or transient pinning state', () => {
    useMapStore.getState().setPinningMode(true)
    useMapStore.getState().startPin(-43.5, 172.5)
    useMapStore.getState().upsertNode({
      nodeId: 7,
      nodeName: 'UAV-7',
      latitude: -43.5,
      longitude: 172.5,
      altitude: 120,
      capturedAt: '2026-05-20T00:00:00Z',
    })

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.state.nodes).toBeUndefined()
    expect(stored.state.pinningMode).toBeUndefined()
    expect(stored.state.pendingPin).toBeUndefined()
  })
})
