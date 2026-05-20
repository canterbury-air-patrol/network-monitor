import { useCallback } from 'react'
import Layout from './components/Layout'
import { useWebSocket } from './hooks/useWebSocket'
import { useMapStore } from './store'
import type { NodeSnapshotMessage } from './types'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/nodes/`

export default function App() {
  const upsertNode = useMapStore((s) => s.upsertNode)

  const onMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as NodeSnapshotMessage
        upsertNode({
          nodeId: msg.node_id,
          nodeName: msg.node_name,
          latitude: msg.position.latitude,
          longitude: msg.position.longitude,
          altitude: msg.position.altitude,
          capturedAt: msg.captured_at,
        })
      } catch (err) {
        console.debug('[WS] malformed message', event.data, err)
      }
    },
    [upsertNode],
  )

  useWebSocket(WS_URL, { onMessage })

  return <Layout />
}
