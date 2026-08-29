import { act, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MapArea from '../MapArea'
import { useMapStore } from '../../store'
import { renderWithQuery } from '../../test/query'
import type { MapViewResponse, NodeSnapshotResponse } from '../../types'

const setView = vi.fn()

// react-leaflet needs a live map context; what matters here is which layers
// survive a crash in one of their siblings, and where the map gets centred.
vi.mock('react-leaflet', () => ({
  MapContainer: ({
    children,
    center,
    zoom,
  }: {
    children?: ReactNode
    center: [number, number]
    zoom: number
  }) => (
    <div
      data-testid="map-container"
      data-center={center.join(',')}
      data-zoom={zoom}
    >
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  useMap: () => ({ setView }),
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

const DEFAULT_VIEW: MapViewResponse = {
  center: { latitude: -41.3, longitude: 174.8 },
  zoom: 12,
  source: 'default',
  mission: null,
}

const MISSION_VIEW: MapViewResponse = {
  center: { latitude: -45.03, longitude: 168.66 },
  zoom: 14,
  source: 'mission',
  mission: 7,
}

/** Swapped by a test to model the server resolving a different view. */
let mapView: MapViewResponse = DEFAULT_VIEW

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

beforeEach(() => {
  localStorage.clear()
  mapView = DEFAULT_VIEW
  setView.mockClear()
  useMapStore.setState({
    showUAVOverlay: true,
    pinningMode: false,
    pendingPin: null,
    editingStationId: null,
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/settings/map/')) return jsonResponse(mapView)
      return jsonResponse({
        count: 1,
        next: null,
        previous: null,
        results: [SNAPSHOT],
      })
    }),
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

describe('MapArea initial view', () => {
  it('centres on the view the settings endpoint resolves', async () => {
    renderWithQuery(<MapArea />)

    await waitFor(() =>
      expect(setView).toHaveBeenCalledWith([-41.3, 174.8], 12),
    )
  })

  it('snaps to a mission override once the mission goes active', async () => {
    const { queryClient } = renderWithQuery(<MapArea />)
    await waitFor(() => expect(setView).toHaveBeenCalledTimes(1))

    mapView = MISSION_VIEW
    await act(() => queryClient.invalidateQueries({ queryKey: ['map-view'] }))

    await waitFor(() =>
      expect(setView).toHaveBeenLastCalledWith([-45.03, 168.66], 14),
    )
  })

  it('leaves a panned map alone when a refetch resolves the same view', async () => {
    const { queryClient } = renderWithQuery(<MapArea />)
    await waitFor(() => expect(setView).toHaveBeenCalledTimes(1))

    await act(() => queryClient.invalidateQueries({ queryKey: ['map-view'] }))

    expect(setView).toHaveBeenCalledTimes(1)
  })

  it('falls back to the built-in view when the endpoint is unusable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes('/settings/map/'))
          return jsonResponse({ center: null })
        return jsonResponse({
          count: 0,
          next: null,
          previous: null,
          results: [],
        })
      }),
    )
    renderWithQuery(<MapArea />)

    const container = await screen.findByTestId('map-container')
    expect(container).toHaveAttribute('data-center', '-43.5,172.5')
    expect(container).toHaveAttribute('data-zoom', '10')
    expect(setView).not.toHaveBeenCalled()
  })
})
