import { useEffect, useState } from 'react'

/**
 * A clock that ticks on an interval, so "last seen" labels and link states age
 * on screen even while no telemetry arrives — silence is exactly the case the
 * stale-node display exists for.
 */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
