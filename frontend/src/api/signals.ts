import { request } from './client'
import type {
  GroundStationResponse,
  NodeResponse,
  NodeSnapshotResponse,
  PaginatedResponse,
  RadioResponse,
} from '../types'

async function page<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const body = await request<PaginatedResponse<T>>(path, { signal })
  return body.results
}

export function fetchNodes(signal?: AbortSignal): Promise<NodeResponse[]> {
  return page<NodeResponse>('/nodes/', signal)
}

export function fetchRadios(
  nodeId: number,
  signal?: AbortSignal,
): Promise<RadioResponse[]> {
  return page<RadioResponse>(`/radios/?node=${nodeId}`, signal)
}

export function fetchGroundStations(
  signal?: AbortSignal,
): Promise<GroundStationResponse[]> {
  return page<GroundStationResponse>('/stations/', signal)
}

/**
 * The node's recent snapshots, newest first. The server orders by
 * `captured_at` descending and pages at `DRF_PAGE_SIZE`, so this is the
 * trailing window of history rather than the whole flight — enough for a
 * live signal trace without pulling a mission's worth of telemetry.
 */
export function fetchNodeSnapshots(
  nodeId: number,
  signal?: AbortSignal,
): Promise<NodeSnapshotResponse[]> {
  return page<NodeSnapshotResponse>(`/snapshots/?node=${nodeId}`, signal)
}
