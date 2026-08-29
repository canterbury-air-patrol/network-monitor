/**
 * Link freshness classification for telemetry nodes.
 *
 * A node reports snapshots continuously while its link holds. Silence is the
 * only signal the operator gets that contact is degrading, so the gap between
 * `captured_at` timestamps — not the arrival time — is what these thresholds
 * measure: a device flushing its offline buffer after link recovery ([P1-17])
 * backfills old captures, and those must not read as a healthy link.
 */

export type LinkState = 'live' | 'degraded' | 'lost'

export interface LinkThresholds {
  /** Silence beyond this marks the link degraded. */
  degradedAfterMs: number
  /** Silence beyond this marks the node fully lost. */
  lostAfterMs: number
}

function envSeconds(raw: string | undefined, fallbackS: number): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed * 1000
    : fallbackS * 1000
}

const _lostAfterMs = envSeconds(import.meta.env.VITE_LINK_LOST_AFTER_S, 120)

/**
 * Deployment-wide defaults, overridable at build time so a site flying slow
 * reporting intervals does not paint every node amber. A degraded timeout
 * configured past the lost timeout is clamped rather than left unreachable —
 * the operator must never lose the intermediate warning to a typo.
 */
export const LINK_THRESHOLDS: LinkThresholds = {
  degradedAfterMs: Math.min(
    envSeconds(import.meta.env.VITE_LINK_DEGRADED_AFTER_S, 30),
    _lostAfterMs,
  ),
  lostAfterMs: _lostAfterMs,
}

/** How much capture history is worth keeping to judge intermittency. */
export const CAPTURE_RETENTION_MS = LINK_THRESHOLDS.lostAfterMs * 2

/** Upper bound on retained captures, so a chatty node cannot grow unbounded. */
export const MAX_CAPTURES = 50

export const LINK_STATE_LABEL: Record<LinkState, string> = {
  live: 'Live',
  degraded: 'Link degraded',
  lost: 'Contact lost',
}

/**
 * Classify a node from its recent capture timestamps (epoch ms, newest first).
 *
 * Fully lost means nothing at all inside the timeout window. Degraded covers
 * both a link that has just gone quiet and one still delivering, but with gaps
 * long enough that the next report cannot be relied on.
 */
export function classifyLink(
  recentCaptures: readonly number[],
  now: number,
  thresholds: LinkThresholds = LINK_THRESHOLDS,
): LinkState {
  const newest = recentCaptures[0]
  if (newest === undefined) return 'lost'

  const age = now - newest
  if (age >= thresholds.lostAfterMs) return 'lost'
  if (age >= thresholds.degradedAfterMs) return 'degraded'

  // Fresh data, but check whether it has been arriving steadily: a link
  // dropping in and out is degraded even when the last sample is seconds old.
  const windowStart = now - thresholds.lostAfterMs
  const inWindow = recentCaptures.filter((t) => t >= windowStart)
  for (let i = 0; i < inWindow.length - 1; i++) {
    if (inWindow[i] - inWindow[i + 1] >= thresholds.degradedAfterMs) {
      return 'degraded'
    }
  }
  return 'live'
}

/** Human "last seen" label, kept short for outdoor readability. */
export function formatLastSeen(ageMs: number): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000))
  if (seconds < 60) return `${seconds} s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remainder = minutes % 60
    return remainder ? `${hours} h ${remainder} min ago` : `${hours} h ago`
  }
  return `${Math.floor(hours / 24)} d ago`
}

/**
 * Merge a new capture time into a node's history: newest first, de-duplicated,
 * and trimmed to what classification can still use.
 */
export function mergeCapture(
  existing: readonly number[],
  capturedMs: number,
): number[] {
  const times = [...new Set([capturedMs, ...existing])].sort((a, b) => b - a)
  const cutoff = times[0] - CAPTURE_RETENTION_MS
  return times.filter((t) => t >= cutoff).slice(0, MAX_CAPTURES)
}
