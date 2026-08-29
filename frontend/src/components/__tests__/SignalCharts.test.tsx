import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../../test/query'
import SignalCharts from '../SignalCharts'

interface Fixtures {
  nodes: unknown[]
  radios: unknown[]
  stations: unknown[]
  snapshots: unknown[]
}

let fixtures: Fixtures
let failing: string | null
let requested: string[]

function page(results: unknown[]) {
  return new Response(
    JSON.stringify({
      count: results.length,
      next: null,
      previous: null,
      results,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function reading(overrides: Record<string, unknown>) {
  return {
    id: 1,
    radio: 1,
    ground_station: 1,
    relay_node: null,
    band: '2.4GHz',
    rssi_dbm: -70,
    snr_db: null,
    ...overrides,
  }
}

function snapshot(capturedAt: string, readings: unknown[]) {
  return {
    id: 1,
    node: 1,
    captured_at: capturedAt,
    received_at: capturedAt,
    position: { longitude: 172.5, latitude: -43.5, altitude: 100 },
    radio_readings: readings,
  }
}

beforeEach(() => {
  failing = null
  requested = []
  fixtures = {
    nodes: [
      { id: 1, name: 'uav-01' },
      { id: 2, name: 'uav-02' },
    ],
    radios: [{ id: 1, node: 1, radio_type: 'wifi', bands: ['2.4GHz'] }],
    stations: [
      { id: 1, name: 'Basecamp' },
      { id: 2, name: 'Ridge' },
    ],
    snapshots: [
      snapshot('2026-08-29T00:00:10Z', [
        reading({ ground_station: 1, rssi_dbm: -62 }),
        reading({ ground_station: 2, rssi_dbm: -88 }),
      ]),
      snapshot('2026-08-29T00:00:00Z', [
        reading({ ground_station: 1, rssi_dbm: -60 }),
      ]),
    ],
  }

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      requested.push(url)
      if (failing !== null && url.startsWith(failing)) {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: 'backend down' }), {
            status: 500,
          }),
        )
      }
      if (url.startsWith('/api/v1/nodes/'))
        return Promise.resolve(page(fixtures.nodes))
      if (url.startsWith('/api/v1/radios/'))
        return Promise.resolve(page(fixtures.radios))
      if (url.startsWith('/api/v1/stations/'))
        return Promise.resolve(page(fixtures.stations))
      if (url.startsWith('/api/v1/snapshots/'))
        return Promise.resolve(page(fixtures.snapshots))
      return Promise.reject(new Error(`unexpected request: ${url}`))
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function expand() {
  await userEvent.click(screen.getByTestId('signal-charts-toggle'))
}

describe('SignalCharts', () => {
  it('fetches nothing until the operator opens the panel', async () => {
    renderWithQuery(<SignalCharts />)

    expect(screen.getByTestId('signal-charts-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(requested).toEqual([])

    await expand()
    await waitFor(() => expect(requested.length).toBeGreaterThan(0))
  })

  it('charts one legend entry per radio, band and receiver', async () => {
    renderWithQuery(<SignalCharts />)
    await expand()

    const legend = await screen.findByTestId('signal-legend')
    await waitFor(() =>
      expect(
        within(legend)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['WiFi 2.4GHz → Basecamp', 'WiFi 2.4GHz → Ridge']),
    )
  })

  it('loads the chart module once the panel is open', async () => {
    // The trace is a lazy chunk; the panel is useless if it never resolves.
    renderWithQuery(<SignalCharts />)
    await expand()

    const slot = await screen.findByTestId('signal-chart')
    await waitFor(() =>
      expect(
        slot.querySelector('.recharts-responsive-container'),
      ).not.toBeNull(),
    )
  })

  it('toggles a series off from the legend', async () => {
    renderWithQuery(<SignalCharts />)
    await expand()

    const entry = await screen.findByRole('button', {
      name: 'WiFi 2.4GHz → Ridge',
    })
    expect(entry).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(entry)
    expect(entry).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(entry)
    expect(entry).toHaveAttribute('aria-pressed', 'true')
  })

  it('reloads the history when the operator picks another node', async () => {
    renderWithQuery(<SignalCharts />)
    await expand()

    await screen.findByTestId('signal-legend')
    await userEvent.selectOptions(screen.getByTestId('signal-node-select'), '2')

    await waitFor(() =>
      expect(requested).toContain('/api/v1/snapshots/?node=2'),
    )
  })

  it('says so when the node has no readings yet', async () => {
    fixtures.snapshots = []
    renderWithQuery(<SignalCharts />)
    await expand()

    expect(
      await screen.findByText('No radio readings recorded for this node yet.'),
    ).toBeInTheDocument()
  })

  it('says so when nothing is reporting at all', async () => {
    fixtures.nodes = []
    renderWithQuery(<SignalCharts />)
    await expand()

    expect(
      await screen.findByText('No nodes reporting yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('signal-node-select')).not.toBeInTheDocument()
  })

  it('reports a failed history fetch in place instead of crashing', async () => {
    failing = '/api/v1/snapshots/'
    renderWithQuery(<SignalCharts />)
    await expand()

    expect(await screen.findByRole('alert')).toHaveTextContent('backend down')
  })

  it('still charts when the label lookups fail', async () => {
    // Names are cosmetic; losing them must not cost the operator the trace.
    failing = '/api/v1/stations/'
    renderWithQuery(<SignalCharts />)
    await expand()

    expect(
      await screen.findByRole('button', { name: 'WiFi 2.4GHz → station 1' }),
    ).toBeInTheDocument()
  })
})
