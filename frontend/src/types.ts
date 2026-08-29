export interface NodeInfo {
  nodeId: number
  nodeName: string
  latitude: number
  longitude: number
  altitude: number
  capturedAt: string
  /** Recent capture times (epoch ms, newest first) used to judge link health. */
  recentCaptures: number[]
}

/** A single telemetry arrival; the store maintains `recentCaptures` itself. */
export type NodeUpdate = Omit<NodeInfo, 'recentCaptures'>

export interface RadioReadingResponse {
  id: number
  radio: number
  ground_station: number | null
  relay_node: number | null
  band: string
  rssi_dbm: number
  snr_db: number | null
}

export interface NodeSnapshotResponse {
  id: number
  node: number
  captured_at: string
  received_at: string
  position: { longitude: number; latitude: number; altitude: number }
  radio_readings: RadioReadingResponse[]
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
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

export interface ManualGroundStation {
  id: number
  name: string
  latitude: number
  longitude: number
  altitudeM: number
}

export interface PendingPin {
  latitude: number
  longitude: number
}
