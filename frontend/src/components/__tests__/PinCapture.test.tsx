import { render } from '@testing-library/react'
import type { LeafletMouseEvent } from 'leaflet'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PinCapture from '../PinCapture'
import { useMapStore } from '../../store'

type ClickHandler = (e: LeafletMouseEvent) => void

let handlers: { click: ClickHandler }

vi.mock('react-leaflet', () => ({
  useMapEvents: (h: { click: ClickHandler }) => {
    handlers = h
    return null
  },
}))

function clickMap(lat: number, lng: number) {
  handlers.click({ latlng: { lat, lng } } as LeafletMouseEvent)
}

beforeEach(() => {
  localStorage.clear()
  useMapStore.setState({
    manualGroundStations: {},
    pinningMode: false,
    pendingPin: null,
    _nextGsId: 1,
  })
})

describe('PinCapture', () => {
  it('records a clicked position while pinning mode is active', () => {
    useMapStore.getState().setPinningMode(true)
    render(<PinCapture />)

    clickMap(-43.5, 172.5)

    expect(useMapStore.getState().pendingPin).toEqual({
      latitude: -43.5,
      longitude: 172.5,
    })
  })

  it('leaves the map alone when pinning mode is off', () => {
    render(<PinCapture />)

    clickMap(-43.5, 172.5)

    expect(useMapStore.getState().pendingPin).toBeNull()
  })
})
