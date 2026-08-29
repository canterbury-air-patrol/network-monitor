import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSignalHistory } from '../../signalHistory'
import type { NodeSnapshotResponse } from '../../types'
import SignalTrace from '../SignalTrace'

function snapshot(
  capturedAt: string,
  rssi: Record<number, number>,
): NodeSnapshotResponse {
  return {
    id: 1,
    node: 1,
    captured_at: capturedAt,
    received_at: capturedAt,
    position: { longitude: 172.5, latitude: -43.5, altitude: 100 },
    radio_readings: Object.entries(rssi).map(([station, rssi_dbm], i) => ({
      id: i,
      radio: 1,
      ground_station: Number(station),
      relay_node: null,
      band: '2.4GHz',
      rssi_dbm,
      snr_db: null,
    })),
  }
}

const HISTORY = buildSignalHistory(
  [
    snapshot('2026-08-29T00:00:00Z', { 1: -60, 2: -85 }),
    snapshot('2026-08-29T00:00:10Z', { 1: -64, 2: -88 }),
    snapshot('2026-08-29T00:00:20Z', { 1: -61, 2: -90 }),
  ],
  {
    radios: [{ id: 1, node: 1, radio_type: 'wifi', bands: ['2.4GHz'] }],
    stations: [
      { id: 1, name: 'Basecamp' },
      { id: 2, name: 'Ridge' },
    ],
  },
)

// jsdom lays everything out at zero size, so the responsive container would
// measure an empty chart and draw nothing. Give it a viewport.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb
      }
      observe(target: Element) {
        this.cb(
          [
            {
              target,
              contentRect: { width: 640, height: 240 },
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        )
      }
      unobserve() {}
      disconnect() {}
    },
  )
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      width: 640,
      height: 240,
      top: 0,
      left: 0,
      right: 640,
      bottom: 240,
      x: 0,
      y: 0,
    }) as DOMRect
  for (const [prop, value] of [
    ['offsetWidth', 640],
    ['offsetHeight', 240],
    ['clientWidth', 640],
    ['clientHeight', 240],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      value,
    })
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SignalTrace', () => {
  it('draws a line per visible series', () => {
    const { container } = render(
      <SignalTrace
        points={HISTORY.points}
        series={HISTORY.series}
        visible={HISTORY.series}
      />,
    )

    const lines = container.querySelectorAll('.recharts-line-curve')
    expect(lines).toHaveLength(2)
    expect(lines[0].getAttribute('d')).toMatch(/^M/)
    expect([...lines].map((l) => l.getAttribute('stroke'))).toEqual(
      HISTORY.series.map((s) => s.color),
    )
  })

  it('drops the lines the operator has switched off', () => {
    const { container } = render(
      <SignalTrace
        points={HISTORY.points}
        series={HISTORY.series}
        visible={HISTORY.series.slice(0, 1)}
      />,
    )

    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(1)
  })

  it('labels the time axis with clock times', () => {
    const { container } = render(
      <SignalTrace
        points={HISTORY.points}
        series={HISTORY.series}
        visible={HISTORY.series}
      />,
    )

    const ticks = [
      ...container.querySelectorAll(
        '.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value',
      ),
    ].map((t) => t.textContent)
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks.every((t) => /^\d{2}:\d{2}:\d{2}/.test(t ?? ''))).toBe(true)
  })
})
