export interface NodeInfo {
  nodeId: number
  nodeName: string
  latitude: number
  longitude: number
  altitude: number
  capturedAt: string
}

export interface NodeSnapshotMessage {
  node_id: number
  node_name: string
  captured_at: string
  position: {
    longitude: number
    latitude: number
    altitude: number
  }
}
