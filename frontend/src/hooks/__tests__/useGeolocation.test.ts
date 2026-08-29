import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGeolocation } from '../useGeolocation'

type Success = (position: GeolocationPosition) => void
type Failure = (error: GeolocationPositionError) => void

const getCurrentPosition =
  vi.fn<(onSuccess: Success, onError?: Failure | null) => void>()

function fix(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: { latitude, longitude },
    timestamp: 0,
  } as GeolocationPosition
}

function installGeolocation(): void {
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  })
}

function removeGeolocation(): void {
  Object.defineProperty(navigator, 'geolocation', {
    value: undefined,
    configurable: true,
  })
}

afterEach(() => {
  getCurrentPosition.mockReset()
  removeGeolocation()
  vi.useRealTimers()
})

describe('useGeolocation', () => {
  it('settles immediately when the browser has no geolocation API', () => {
    removeGeolocation()

    const { result } = renderHook(() => useGeolocation())

    expect(result.current).toEqual({ fix: null, settled: true })
  })

  it('reports the device position once the browser produces one', async () => {
    installGeolocation()
    getCurrentPosition.mockImplementation((onSuccess) =>
      onSuccess(fix(-36.85, 174.76)),
    )

    const { result } = renderHook(() => useGeolocation())

    await waitFor(() =>
      expect(result.current).toEqual({
        fix: { latitude: -36.85, longitude: 174.76 },
        settled: true,
      }),
    )
  })

  it('settles with no fix when permission is denied', async () => {
    installGeolocation()
    getCurrentPosition.mockImplementation((_onSuccess, onError) =>
      onError?.({ code: 1, message: 'denied' } as GeolocationPositionError),
    )

    const { result } = renderHook(() => useGeolocation())

    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current.fix).toBeNull()
  })

  it('rejects a fix whose coordinates are unusable', async () => {
    installGeolocation()
    getCurrentPosition.mockImplementation((onSuccess) =>
      onSuccess(fix(Number.NaN, 174.76)),
    )

    const { result } = renderHook(() => useGeolocation())

    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current.fix).toBeNull()
  })

  it('stops waiting on an unanswered prompt but still takes a late fix', async () => {
    vi.useFakeTimers()
    installGeolocation()
    let deliver: Success = () => {}
    getCurrentPosition.mockImplementation((onSuccess) => {
      deliver = onSuccess
    })

    const { result } = renderHook(() => useGeolocation(3000))
    expect(result.current).toEqual({ fix: null, settled: false })

    // The operator leaves the permission prompt sitting on screen.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(result.current).toEqual({ fix: null, settled: true })

    // ...and grants it a minute later.
    act(() => deliver(fix(-45.03, 168.66)))
    expect(result.current).toEqual({
      fix: { latitude: -45.03, longitude: 168.66 },
      settled: true,
    })
  })

  it('ignores a fix that arrives after unmount', async () => {
    installGeolocation()
    let deliver: Success = () => {}
    getCurrentPosition.mockImplementation((onSuccess) => {
      deliver = onSuccess
    })

    const { result, unmount } = renderHook(() => useGeolocation())
    unmount()

    expect(() => deliver(fix(-45.03, 168.66))).not.toThrow()
    expect(result.current.fix).toBeNull()
  })
})
