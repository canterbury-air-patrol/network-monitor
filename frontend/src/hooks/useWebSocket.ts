import { useCallback, useEffect, useRef } from 'react'

export interface UseWebSocketOptions {
  onMessage: (event: MessageEvent) => void
  onOpen?: (event: Event) => void
  onClose?: (event: CloseEvent) => void
  reconnectDelay?: number
}

export function useWebSocket(url: string, options: UseWebSocketOptions) {
  const reconnectDelay = options.reconnectDelay ?? 3000

  // Stable refs so the connect closure doesn't depend on caller-provided callbacks,
  // which would cause infinite reconnect loops if they are inline functions.
  const onMessageRef = useRef(options.onMessage)
  const onOpenRef = useRef(options.onOpen)
  const onCloseRef = useRef(options.onClose)

  useEffect(() => {
    onMessageRef.current = options.onMessage
  }, [options.onMessage])
  useEffect(() => {
    onOpenRef.current = options.onOpen
  }, [options.onOpen])
  useEffect(() => {
    onCloseRef.current = options.onClose
  }, [options.onClose])

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = (event) => onOpenRef.current?.(event)
    ws.onmessage = (event) => onMessageRef.current(event)
    ws.onclose = (event) => {
      onCloseRef.current?.(event)
      if (mountedRef.current) {
        reconnectTimerRef.current = setTimeout(connect, reconnectDelay)
      }
    }
    ws.onerror = () => ws.close()
  }, [url, reconnectDelay])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return wsRef
}
