import { request } from './client'
import type {
  MissionPhaseResponse,
  MissionResponse,
  PaginatedResponse,
} from '../types'

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
