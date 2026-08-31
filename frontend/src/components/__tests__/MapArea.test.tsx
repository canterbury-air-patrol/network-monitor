import { act, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MapArea from '../MapArea'
import { usePreferencesStore } from '../../preferences'
import { useMapStore } from '../../store'
import { renderWithQuery } from '../../test/query'
import type { MapViewResponse, NodeSnapshotResponse } from '../../types'
import { DEFAULT_UNITS } from '../../units'

const setView = vi.fn()

/** Leaflet event handlers the map controller has registered. */
const mapHandlers = new Map<string, Set<() => void>>()

/** Stable across renders, so the controller's listener effect runs once. */
const fakeMap = {
  setView,
  on: (event: string, handler: () => void) => {
    const set = mapHandlers.get(event) ?? new Set()
    set.add(handler)
    mapHandlers.set(event, set)
  },
  off: (event: string, handler: () => void) => {
    mapHandlers.get(event)?.delete(handler)
  },
}

/** Models the operator dragging or scroll-zooming the map themselves. */
function operatorMovesMap(): void {
  act(() => {
    mapHandlers.get('dragstart')?.forEach((handler) => handler())
  })
}

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
  ScaleControl: ({
    metric,
    imperial,
  }: {
    metric?: boolean
    imperial?: boolean
  }) => (
    <div
      data-testid="scale-control"
      data-metric={String(Boolean(metric))}
      data-imperial={String(Boolean(imperial))}
    />
  ),
  useMap: () => fakeMap,
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

type GeoSuccess = (position: GeolocationPosition) => void
type GeoFailure = (error: GeolocationPositionError) => void

const getCurrentPosition =
  vi.fn<(onSuccess: GeoSuccess, onError?: GeoFailure | null) => void>()

/** Installs a browser geolocation API; without this the hook finds none. */
function withGeolocation(): void {
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  })
}

function deviceAt(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: { latitude, longitude },
    timestamp: 0,
  } as GeolocationPosition
}

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

beforeEach(() => {
  localStorage.clear()
  mapView = DEFAULT_VIEW
  setView.mockClear()
  mapHandlers.clear()
  getCurrentPosition.mockReset()
  usePreferencesStore.setState({ units: DEFAULT_UNITS })
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
  vi.useRealTimers()
  Object.defineProperty(navigator, 'geolocation', {
    value: undefined,
    configurable: true,
  })
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
      expect(setView).toHaveBeenCalledWith([-41.3, 174.8], 12, {
        animate: false,
      }),
    )
  })

  it('snaps to a mission override once the mission goes active', async () => {
    const { queryClient } = renderWithQuery(<MapArea />)
    await waitFor(() => expect(setView).toHaveBeenCalledTimes(1))

    mapView = MISSION_VIEW
    await act(() => queryClient.invalidateQueries({ queryKey: ['map-view'] }))

    await waitFor(() =>
      expect(setView).toHaveBeenLastCalledWith([-45.03, 168.66], 14, {
        animate: false,
      }),
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

describe('MapArea device location', () => {
  it('centres on the device, at the zoom the deployment configured', async () => {
    withGeolocation()
    getCurrentPosition.mockImplementation((onSuccess) =>
      onSuccess(deviceAt(-36.85, 174.76)),
    )

    renderWithQuery(<MapArea />)

    await waitFor(() =>
      expect(setView).toHaveBeenLastCalledWith([-36.85, 174.76], 12, {
        animate: false,
      }),
    )
  })

  it('falls back to the server default when permission is refused', async () => {
    withGeolocation()
    getCurrentPosition.mockImplementation((_onSuccess, onError) =>
      onError?.({ code: 1, message: 'denied' } as GeolocationPositionError),
    )

    renderWithQuery(<MapArea />)

    await waitFor(() =>
      expect(setView).toHaveBeenCalledWith([-41.3, 174.8], 12, {
        animate: false,
      }),
    )
    expect(setView).toHaveBeenCalledTimes(1)
  })

  it('keeps an active mission ahead of the device location', async () => {
    mapView = MISSION_VIEW
    withGeolocation()
    getCurrentPosition.mockImplementation((onSuccess) =>
      onSuccess(deviceAt(-36.85, 174.76)),
    )

    const { queryClient } = renderWithQuery(<MapArea />)

    // The fix lands before the endpoint answers, so the mission has to take
    // the map off the device rather than merely getting there first.
    await waitFor(() =>
      expect(setView).toHaveBeenLastCalledWith([-45.03, 168.66], 14, {
        animate: false,
      }),
    )

    await act(() => queryClient.invalidateQueries({ queryKey: ['map-view'] }))
    expect(setView).toHaveBeenLastCalledWith([-45.03, 168.66], 14, {
      animate: false,
    })
  })

  it('drops a late fix once the operator has moved the map themselves', async () => {
    withGeolocation()
    let grantPermission: GeoSuccess = () => {}
    getCurrentPosition.mockImplementation((onSuccess) => {
      grantPermission = onSuccess
    })

    renderWithQuery(<MapArea />)
    // Nothing is applied while the permission prompt sits unanswered.
    await waitFor(() => expect(mapHandlers.get('dragstart')?.size).toBe(1))
    expect(setView).not.toHaveBeenCalled()

    operatorMovesMap()
    act(() => grantPermission(deviceAt(-36.85, 174.76)))

    expect(setView).not.toHaveBeenCalled()
  })

  it('gives up on an unanswered prompt and uses the server default', async () => {
    vi.useFakeTimers()
    withGeolocation()
    getCurrentPosition.mockImplementation(() => {})

    renderWithQuery(<MapArea />)
    // Waiting on the prompt indefinitely would strand the map on its
    // built-in view, so the grace period ends the wait.
    await act(() => vi.advanceTimersByTimeAsync(3000))

    expect(setView).toHaveBeenCalledWith([-41.3, 174.8], 12, {
      animate: false,
    })
  })

  it('still snaps a moved map to a mission that goes active', async () => {
    const { queryClient } = renderWithQuery(<MapArea />)
    await waitFor(() => expect(setView).toHaveBeenCalledTimes(1))

    operatorMovesMap()
    mapView = MISSION_VIEW
    await act(() => queryClient.invalidateQueries({ queryKey: ['map-view'] }))

    await waitFor(() =>
      expect(setView).toHaveBeenLastCalledWith([-45.03, 168.66], 14, {
        animate: false,
      }),
    )
  })
})

describe('MapArea scale bar', () => {
  it("reads in the operator's distance unit", () => {
    renderWithQuery(<MapArea />)

    const scale = screen.getByTestId('scale-control')
    expect(scale).toHaveAttribute('data-metric', 'true')
    expect(scale).toHaveAttribute('data-imperial', 'false')

    act(() => usePreferencesStore.getState().setDistanceUnit('mi'))

    // Leaflet reads a control's options once, so the bar is remounted rather
    // than left showing kilometres under a changed preference
    const imperialScale = screen.getByTestId('scale-control')
    expect(imperialScale).toHaveAttribute('data-metric', 'false')
    expect(imperialScale).toHaveAttribute('data-imperial', 'true')
  })
})
