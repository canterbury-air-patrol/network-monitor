import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebSocket } from '../useWebSocket'

class MockWebSocket {
  static instances: MockWebSocket[] = []

  url: string
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  readyState = 0 // CONNECTING

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  close() {
    this.readyState = 3 // CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  simulateOpen() {
    this.readyState = 1 // OPEN
    this.onopen?.(new Event('open'))
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(data) }),
    )
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useWebSocket', () => {
  it('opens a WebSocket connection to the given URL', () => {
    const onMessage = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws/test/', { onMessage }))

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost/ws/test/')
  })

  it('calls onOpen when the connection opens', () => {
    const onMessage = vi.fn()
    const onOpen = vi.fn()
    renderHook(() =>
      useWebSocket('ws://localhost/ws/test/', { onMessage, onOpen }),
    )

    act(() => MockWebSocket.instances[0].simulateOpen())

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('calls onMessage when a message arrives', () => {
    const onMessage = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws/test/', { onMessage }))

    act(() => MockWebSocket.instances[0].simulateMessage({ type: 'ping' }))

    expect(onMessage).toHaveBeenCalledTimes(1)
    const event = onMessage.mock.calls[0][0] as MessageEvent
    expect(JSON.parse(event.data)).toEqual({ type: 'ping' })
  })

  it('calls onClose when the connection closes', () => {
    const onMessage = vi.fn()
    const onClose = vi.fn()
    renderHook(() =>
      useWebSocket('ws://localhost/ws/test/', { onMessage, onClose }),
    )

    act(() => MockWebSocket.instances[0].close())

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reconnects after the configured delay when closed', () => {
    const onMessage = vi.fn()
    renderHook(() =>
      useWebSocket('ws://localhost/ws/test/', {
        onMessage,
        reconnectDelay: 1000,
      }),
    )
    expect(MockWebSocket.instances).toHaveLength(1)

    act(() => MockWebSocket.instances[0].close())
    expect(MockWebSocket.instances).toHaveLength(1) // no immediate reconnect

    act(() => vi.advanceTimersByTime(1000))
    expect(MockWebSocket.instances).toHaveLength(2)
    expect(MockWebSocket.instances[1].url).toBe('ws://localhost/ws/test/')
  })

  it('closes on error and triggers reconnect', () => {
    const onMessage = vi.fn()
    renderHook(() =>
      useWebSocket('ws://localhost/ws/test/', {
        onMessage,
        reconnectDelay: 500,
      }),
    )

    act(() => MockWebSocket.instances[0].simulateError())
    // error calls ws.close() which triggers onclose + reconnect timer
    act(() => vi.advanceTimersByTime(500))

    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('does not reconnect after unmount', () => {
    const onMessage = vi.fn()
    const { unmount } = renderHook(() =>
      useWebSocket('ws://localhost/ws/test/', {
        onMessage,
        reconnectDelay: 500,
      }),
    )

    unmount()
    act(() => vi.advanceTimersByTime(2000))

    // Unmounting closes the ws — but the reconnect timer should be cancelled
    expect(MockWebSocket.instances).toHaveLength(1)
  })
})
