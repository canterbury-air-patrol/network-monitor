import { act, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MapArea from '../MapArea'
import { useMapStore } from '../../store'
import { renderWithQuery } from '../../test/query'
import type { NodeSnapshotResponse } from '../../types'

// react-leaflet needs a live map context; what matters here is which layers
// survive a crash in one of their siblings.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
}))

vi.mock('../HeatmapLayer', () => ({
  default: ({ points }: { points: unknown[] }) => (
    <div data-testid="heatmap" data-points={points.length} />
  ),
}))

vi.mock('../PinCapture', () => ({ default: () => null }))

vi.mock('../GroundStationMarkers', () => ({
  default: () => <div data-testid="station-markers" />,
}))

vi.mock('../NodeMarkers', () => ({
  default: () => {
    throw new Error('uav overlay exploded')
  },
}))

const SNAPSHOT: NodeSnapshotResponse = {
  id: 1,
  node: 1,
  captured_at: '2026-08-29T00:00:00Z',
  received_at: '2026-08-29T00:00:01Z',
  position: { longitude: 172.5, latitude: -43.5, altitude: 120 },
  radio_readings: [
    {
      id: 1,
      radio: 1,
      ground_station: 1,
      relay_node: null,
      band: 'uhf',
      rssi_dbm: -70,
      snr_db: null,
    },
  ],
}

beforeEach(() => {
  localStorage.clear()
  useMapStore.setState({
    showUAVOverlay: true,
    pinningMode: false,
    pendingPin: null,
    editingStationId: null,
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            count: 1,
            next: null,
            previous: null,
            results: [SNAPSHOT],
          }),
          { status: 200 },
        ),
      ),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('MapArea layer isolation', () => {
  it('keeps the coverage layer alive when the UAV overlay crashes', async () => {
    renderWithQuery(<MapArea />)

    // The coverage heatmap keeps receiving data despite the sibling crash.
    await waitFor(() =>
      expect(screen.getByTestId('heatmap')).toHaveAttribute('data-points', '1'),
    )
    expect(screen.getByTestId('station-markers')).toBeInTheDocument()
    expect(screen.getByTestId('map-container')).toBeInTheDocument()
  })

  it('reports the crashed overlay beside the map rather than over it', async () => {
    renderWithQuery(<MapArea />)

    const notice = await screen.findByTestId('map-degraded')
    expect(notice).toHaveTextContent('Unavailable: UAV markers')
    // A fallback inside the map pane would cover the coverage display.
    expect(screen.queryByTestId('panel-error')).not.toBeInTheDocument()
  })

  it('withdraws the notice once the operator hides the crashed overlay', async () => {
    renderWithQuery(<MapArea />)
    await screen.findByTestId('map-degraded')

    act(() => useMapStore.getState().toggleUAVOverlay())

    expect(screen.queryByTestId('map-degraded')).not.toBeInTheDocument()
    expect(screen.getByTestId('heatmap')).toBeInTheDocument()
  })
})
