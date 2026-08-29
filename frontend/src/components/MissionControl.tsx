import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  fetchMissions,
  missionAction,
  type MissionAction,
} from '../api/missions'
import type { MissionStatus } from '../types'
import PhasePanel from './PhasePanel'

const STATUS_LABEL: Record<MissionStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
}

/** Which statuses each lifecycle action accepts, mirroring the API's transitions. */
const ACTION_FROM: Record<MissionAction, MissionStatus[]> = {
  start: ['pending'],
  stop: ['active'],
  archive: ['pending', 'completed'],
}

const ACTION_LABEL: Record<MissionAction, string> = {
  start: 'Start',
  stop: 'Stop',
  archive: 'Archive',
}

/**
 * Mission lifecycle controls and the current-phase panel.
 *
 * The indicator always reports the mission the server considers active — only
 * one can be — while the selector governs which mission the buttons act on, so
 * an operator can archive a finished mission without losing sight of the live
 * one.
 */
export default function MissionControl() {
  const queryClient = useQueryClient()
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: missions = [], isPending } = useQuery({
    queryKey: ['missions'],
    queryFn: ({ signal }) => fetchMissions(signal),
    refetchInterval: 30_000,
  })

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: MissionAction }) =>
      missionAction(id, action),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['missions'] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const activeMission = missions.find((m) => m.status === 'active') ?? null
  // Falling back through the active mission means the panel opens on whatever
  // is flying without the operator having to choose it first.
  const selected =
    missions.find((m) => m.id === pickedId) ??
    activeMission ??
    missions[0] ??
    null

  return (
    <section
      className="border-t border-white/10 p-4"
      data-testid="mission-control"
    >
      <p className="mb-2 text-xs font-semibold tracking-wide text-white/50 uppercase">
        Mission
      </p>

      <p
        className="flex items-center gap-2 text-sm"
        data-testid="active-mission-indicator"
      >
        <span
          aria-hidden="true"
          className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
            activeMission ? 'bg-emerald-400' : 'bg-white/30'
          }`}
        />
        <span className="truncate" title={activeMission?.name}>
          {isPending
            ? 'Loading missions…'
            : (activeMission?.name ?? 'No active mission')}
        </span>
      </p>

      {isPending ? null : selected === null ? (
        <p className="mt-3 text-xs text-white/50" data-testid="no-missions">
          No missions yet — create one in the admin.
        </p>
      ) : (
        <>
          <label className="mt-3 block text-xs text-white/70">
            Controlling
            <select
              value={selected.id}
              onChange={(e) => setPickedId(Number(e.target.value))}
              data-testid="mission-select"
              className="mt-1 min-h-11 w-full rounded border border-white/20 bg-white/5 px-2 text-sm text-white"
            >
              {missions.map((mission) => (
                <option key={mission.id} value={mission.id}>
                  {mission.name} — {STATUS_LABEL[mission.status]}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-3 flex gap-2">
            {(['start', 'stop', 'archive'] as const).map((action) => (
              <button
                key={action}
                type="button"
                disabled={
                  mutation.isPending ||
                  !ACTION_FROM[action].includes(selected.status)
                }
                onClick={() => mutation.mutate({ id: selected.id, action })}
                data-testid={`mission-${action}`}
                className="min-h-11 flex-1 rounded bg-white/10 px-2 text-sm font-medium hover:bg-white/20 disabled:opacity-40"
              >
                {ACTION_LABEL[action]}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <PhasePanel mission={selected} />
        </>
      )}
    </section>
  )
}
