import { act, render, screen } from '@testing-library/react'
import type { DivIcon, Icon } from 'leaflet'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NodeMarkers from '../NodeMarkers'
import { usePreferencesStore } from '../../preferences'
import { useMapStore } from '../../store'
import { LINK_THRESHOLDS } from '../../staleness'
import { DEFAULT_UNITS } from '../../units'

// react-leaflet needs a live map context; what matters here is which icon and
// label each node ends up with.
vi.mock('react-leaflet', () => ({
  Marker: ({
    position,
    icon,
    title,
    children,
  }: {
    position: [number, number]
    icon?: Icon | DivIcon
    title?: string
    children?: ReactNode
  }) => (
    <div
      data-testid="marker"
      data-position={position.join(',')}
      data-icon={icon?.options.className || 'default'}
      title={title}
    >
      {children}
    </div>
  ),
  Tooltip: ({ children }: { children?: ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => (
    <div data-testid="popup">{children}</div>
  ),
}))

const NOW = Date.UTC(2026, 7, 29, 12, 0, 0)

function addNode(nodeId: number, nodeName: string, captures: number[]) {
  useMapStore.setState((state) => ({
    nodes: {
      ...state.nodes,
      [nodeId]: {
        nodeId,
        nodeName,
        latitude: -43.5,
        longitude: 172.5,
        altitude: 120,
        capturedAt: new Date(captures[0]).toISOString(),
        recentCaptures: captures,
      },
    },
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  usePreferencesStore.setState({ units: DEFAULT_UNITS })
  useMapStore.setState({ nodes: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NodeMarkers', () => {
  it('leaves a live node with the default marker and no stale label', () => {
    addNode(1, 'UAV-1', [NOW - 2000, NOW - 7000])
    render(<NodeMarkers />)

    expect(screen.getByTestId('marker')).toHaveAttribute('data-icon', 'default')
    // The name reaches Leaflet as the icon's title, which is what the E2E
    // suite locates a node's marker by
    expect(screen.getByTitle('UAV-1')).toBe(screen.getByTestId('marker'))
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
    expect(screen.getByTestId('popup')).toHaveTextContent(
      'Live — last seen 2 s ago',
    )
  })

  it('warns and labels a degraded node', () => {
    addNode(2, 'UAV-2', [NOW - LINK_THRESHOLDS.degradedAfterMs - 1000])
    render(<NodeMarkers />)

    expect(screen.getByTestId('marker')).toHaveAttribute(
      'data-icon',
      'node-marker node-marker--degraded',
    )
    expect(screen.getByTestId('tooltip')).toHaveTextContent(
      /UAV-2 — last seen \d+ s ago/,
    )
    expect(screen.getByTestId('popup')).toHaveTextContent('Link degraded')
  })

  it('greys out a node with no data in the timeout window', () => {
    addNode(3, 'UAV-3', [NOW - LINK_THRESHOLDS.lostAfterMs - 60_000])
    render(<NodeMarkers />)

    expect(screen.getByTestId('marker')).toHaveAttribute(
      'data-icon',
      'node-marker node-marker--lost',
    )
    expect(screen.getByTestId('tooltip')).toHaveTextContent(
      'UAV-3 — last seen 3 min ago',
    )
    expect(screen.getByTestId('popup')).toHaveTextContent(
      'Contact lost — last seen 3 min ago',
    )
  })

  it('ages a node into the stale states as the clock runs on', () => {
    addNode(4, 'UAV-4', [NOW])
    render(<NodeMarkers />)
    expect(screen.getByTestId('marker')).toHaveAttribute('data-icon', 'default')

    act(() => vi.advanceTimersByTime(LINK_THRESHOLDS.degradedAfterMs + 5000))
    expect(screen.getByTestId('marker')).toHaveAttribute(
      'data-icon',
      'node-marker node-marker--degraded',
    )

    act(() => vi.advanceTimersByTime(LINK_THRESHOLDS.lostAfterMs))
    expect(screen.getByTestId('marker')).toHaveAttribute(
      'data-icon',
      'node-marker node-marker--lost',
    )
  })

  it('reports altitude in metres by default', () => {
    addNode(5, 'UAV-5', [NOW])
    render(<NodeMarkers />)

    expect(screen.getByTestId('popup')).toHaveTextContent('Alt: 120 m')
  })

  it("reports altitude in the operator's unit", () => {
    usePreferencesStore.getState().setAltitudeUnit('ft')
    addNode(6, 'UAV-6', [NOW])
    render(<NodeMarkers />)

    expect(screen.getByTestId('popup')).toHaveTextContent('Alt: 394 ft')
  })
})
