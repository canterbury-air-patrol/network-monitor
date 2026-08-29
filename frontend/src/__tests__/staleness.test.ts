import { describe, expect, it } from 'vitest'
import {
  classifyLink,
  formatLastSeen,
  mergeCapture,
  CAPTURE_RETENTION_MS,
  LINK_THRESHOLDS,
  MAX_CAPTURES,
} from '../staleness'

const NOW = Date.UTC(2026, 7, 29, 12, 0, 0)
const { degradedAfterMs, lostAfterMs } = LINK_THRESHOLDS

/** Captures every `stepMs` back from `NOW`, newest first. */
function steady(count: number, stepMs: number, from = NOW): number[] {
  return Array.from({ length: count }, (_, i) => from - i * stepMs)
}

describe('classifyLink', () => {
  it('treats a node reporting steadily as live', () => {
    expect(classifyLink(steady(5, 5000), NOW)).toBe('live')
  })

  it('treats a node with no captures at all as lost', () => {
    expect(classifyLink([], NOW)).toBe('lost')
  })

  it('degrades once the last capture passes the degraded timeout', () => {
    expect(classifyLink([NOW - degradedAfterMs], NOW)).toBe('degraded')
    expect(classifyLink([NOW - degradedAfterMs + 1000], NOW)).toBe('live')
  })

  it('reports fully lost once the last capture passes the lost timeout', () => {
    expect(classifyLink([NOW - lostAfterMs], NOW)).toBe('lost')
    expect(classifyLink([NOW - lostAfterMs + 1000], NOW)).toBe('degraded')
  })

  it('degrades an intermittent link even when the newest capture is fresh', () => {
    // Two recent samples, but a long silence between them: the link is
    // delivering again, yet cannot be relied on for the next report.
    const captures = [
      NOW - 1000,
      NOW - 1000 - degradedAfterMs,
      NOW - 2 * lostAfterMs,
    ]
    expect(classifyLink(captures, NOW)).toBe('degraded')
  })

  it('ignores gaps that fall outside the timeout window', () => {
    // The old backlog is history; only the window decides current health.
    const recent = steady(4, 5000)
    expect(classifyLink([...recent, NOW - 4 * lostAfterMs], NOW)).toBe('live')
  })

  it('honours caller-supplied thresholds', () => {
    const slow = { degradedAfterMs: 600_000, lostAfterMs: 1_800_000 }
    expect(classifyLink([NOW - 300_000], NOW, slow)).toBe('live')
    expect(classifyLink([NOW - 300_000], NOW)).toBe('lost')
  })

  it('tolerates a capture timestamped slightly ahead of the browser clock', () => {
    expect(classifyLink([NOW + 2000], NOW)).toBe('live')
  })
})

describe('formatLastSeen', () => {
  it('formats seconds, minutes, hours and days', () => {
    expect(formatLastSeen(0)).toBe('0 s ago')
    expect(formatLastSeen(45_000)).toBe('45 s ago')
    expect(formatLastSeen(3 * 60_000)).toBe('3 min ago')
    expect(formatLastSeen(2 * 3_600_000)).toBe('2 h ago')
    expect(formatLastSeen(2 * 3_600_000 + 5 * 60_000)).toBe('2 h 5 min ago')
    expect(formatLastSeen(50 * 3_600_000)).toBe('2 d ago')
  })

  it('clamps a negative age to zero rather than showing a future time', () => {
    expect(formatLastSeen(-5000)).toBe('0 s ago')
  })
})

describe('mergeCapture', () => {
  it('keeps history newest first', () => {
    expect(mergeCapture([NOW - 5000], NOW)).toEqual([NOW, NOW - 5000])
  })

  it('inserts a late arrival in order without disturbing the newest', () => {
    expect(mergeCapture([NOW, NOW - 5000], NOW - 2500)).toEqual([
      NOW,
      NOW - 2500,
      NOW - 5000,
    ])
  })

  it('de-duplicates a repeated delivery', () => {
    expect(mergeCapture([NOW, NOW - 5000], NOW)).toEqual([NOW, NOW - 5000])
  })

  it('drops captures older than the retention window', () => {
    const old = NOW - CAPTURE_RETENTION_MS - 1
    expect(mergeCapture([old], NOW)).toEqual([NOW])
  })

  it('caps how much history a chatty node accumulates', () => {
    const many = steady(MAX_CAPTURES + 20, 100)
    expect(mergeCapture(many, NOW + 100)).toHaveLength(MAX_CAPTURES)
  })
})
