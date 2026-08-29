import type {
  MissionPhaseResponse,
  MissionResponse,
  PaginatedResponse,
} from '../types'

const API_BASE = '/api/v1'

/**
 * DRF reports a rejected transition as `detail`, which is a bare string from an
 * explicit `Response` and a list of messages from a raised `ValidationError`.
 * Either way the operator needs the message, not the status code.
 */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json()
    const detail = (body as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && typeof detail[0] === 'string') return detail[0]
  } catch {
    // A non-JSON body (a proxy error page, say) leaves only the status
  }
  return `Request failed (${res.status})`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as T
}

export async function fetchMissions(
  signal?: AbortSignal,
): Promise<MissionResponse[]> {
  const page = await request<PaginatedResponse<MissionResponse>>('/missions/', {
    signal,
  })
  return page.results
}

export async function fetchPhases(
  missionId: number,
  signal?: AbortSignal,
): Promise<MissionPhaseResponse[]> {
  const page = await request<PaginatedResponse<MissionPhaseResponse>>(
    `/phases/?mission=${missionId}`,
    { signal },
  )
  return page.results
}

export type MissionAction = 'start' | 'stop' | 'archive'

export function missionAction(
  missionId: number,
  action: MissionAction,
): Promise<MissionResponse> {
  return request<MissionResponse>(`/missions/${missionId}/${action}/`, {
    method: 'POST',
  })
}

export type PhaseAction = 'activate' | 'close'

export function phaseAction(
  phaseId: number,
  action: PhaseAction,
): Promise<MissionPhaseResponse> {
  return request<MissionPhaseResponse>(`/phases/${phaseId}/${action}/`, {
    method: 'POST',
  })
}
