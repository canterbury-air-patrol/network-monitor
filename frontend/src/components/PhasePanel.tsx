import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchPhases, phaseAction, type PhaseAction } from '../api/missions'
import type { MissionPhaseResponse, MissionResponse } from '../types'

/** Phases are ordered by start time, so an unstarted phase has no history yet. */
function describe(phase: MissionPhaseResponse): string {
  if (phase.is_active) return 'Current phase'
  if (phase.ended_at !== null) return 'Closed'
  return 'Not started'
}

/**
 * Phase roster for one mission: which phase is current, and the controls to
 * switch to another or close the current one. Switching is a single click —
 * the API closes the outgoing phase as part of activating the incoming one.
 */
export default function PhasePanel({ mission }: { mission: MissionResponse }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data: phases = [] } = useQuery({
    queryKey: ['phases', mission.id],
    queryFn: ({ signal }) => fetchPhases(mission.id, signal),
    refetchInterval: 30_000,
  })

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: PhaseAction }) =>
      phaseAction(id, action),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['phases', mission.id] })
    },
    onError: (err: Error) => setError(err.message),
  })

  // A completed or archived mission rejects every phase transition server-side
  const frozen = mission.status === 'completed' || mission.status === 'archived'
  const busy = mutation.isPending
  const current = phases.find((phase) => phase.is_active) ?? null

  return (
    <div className="mt-4" data-testid="phase-panel">
      <p className="mb-2 text-xs font-semibold tracking-wide text-white/50 uppercase">
        Phases
      </p>
      <p className="text-sm" data-testid="current-phase">
        {current ? current.name : 'No phase running'}
      </p>

      {phases.length === 0 ? (
        <p className="mt-2 text-xs text-white/50" data-testid="no-phases">
          No phases defined for this mission.
        </p>
      ) : (
        <ul className="mt-2 space-y-2" data-testid="phase-list">
          {phases.map((phase) => (
            <li
              key={phase.id}
              className={`rounded p-2 ${
                phase.is_active ? 'bg-white/15' : 'bg-white/5'
              }`}
            >
              <p className="truncate text-sm" title={phase.name}>
                {phase.name}
              </p>
              <p className="text-xs text-white/50">{describe(phase)}</p>
              {phase.is_active ? (
                <button
                  type="button"
                  disabled={frozen || busy}
                  onClick={() =>
                    mutation.mutate({ id: phase.id, action: 'close' })
                  }
                  aria-label={`Close ${phase.name}`}
                  className="mt-2 min-h-11 w-full rounded bg-white/10 px-2 text-sm hover:bg-white/20 disabled:opacity-40"
                >
                  Close
                </button>
              ) : (
                phase.ended_at === null && (
                  <button
                    type="button"
                    disabled={frozen || busy}
                    onClick={() =>
                      mutation.mutate({ id: phase.id, action: 'activate' })
                    }
                    aria-label={`Switch to ${phase.name}`}
                    className="mt-2 min-h-11 w-full rounded bg-white/10 px-2 text-sm hover:bg-white/20 disabled:opacity-40"
                  >
                    Switch to
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
