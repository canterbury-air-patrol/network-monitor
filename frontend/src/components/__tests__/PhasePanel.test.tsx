import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../../test/query'
import type {
  MissionPhaseResponse,
  MissionResponse,
  MissionStatus,
} from '../../types'
import PhasePanel from '../PhasePanel'

function makeMission(status: MissionStatus): MissionResponse {
  return {
    id: 5,
    name: 'Coast Patrol',
    operator_notes: '',
    status,
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
  }
}

function makePhase(
  id: number,
  name: string,
  started_at: string | null,
  ended_at: string | null,
): MissionPhaseResponse {
  return {
    id,
    mission: 5,
    name,
    area_of_operation_notes: '',
    ground_station_layout: '',
    started_at,
    ended_at,
    is_active: started_at !== null && ended_at === null,
  }
}

let phases: MissionPhaseResponse[] = []
let posts: string[] = []

beforeEach(() => {
  phases = []
  posts = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST') {
        posts.push(url)
        return Promise.resolve(new Response('{}', { status: 200 }))
      }
      if (url.startsWith('/api/v1/phases/')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              count: phases.length,
              next: null,
              previous: null,
              results: phases,
            }),
            { status: 200 },
          ),
        )
      }
      return Promise.reject(new Error(`unexpected request: ${url}`))
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PhasePanel', () => {
  it('shows the current phase and switches to another', async () => {
    const user = userEvent.setup()
    phases = [
      makePhase(1, 'Ingress', '2026-08-29T01:00:00Z', '2026-08-29T02:00:00Z'),
      makePhase(2, 'Search', '2026-08-29T02:00:00Z', null),
      makePhase(3, 'Egress', null, null),
    ]
    renderWithQuery(<PhasePanel mission={makeMission('active')} />)

    await screen.findByTestId('phase-list')
    expect(screen.getByTestId('current-phase')).toHaveTextContent('Search')
    // A closed phase cannot be reactivated, so it offers no control
    expect(
      screen.queryByRole('button', { name: 'Switch to Ingress' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Switch to Egress' }))
    await waitFor(() => expect(posts).toEqual(['/api/v1/phases/3/activate/']))
  })

  it('closes the running phase', async () => {
    const user = userEvent.setup()
    phases = [makePhase(2, 'Search', '2026-08-29T02:00:00Z', null)]
    renderWithQuery(<PhasePanel mission={makeMission('active')} />)

    await user.click(
      await screen.findByRole('button', { name: 'Close Search' }),
    )
    await waitFor(() => expect(posts).toEqual(['/api/v1/phases/2/close/']))
  })

  it('reports an empty roster', async () => {
    renderWithQuery(<PhasePanel mission={makeMission('active')} />)

    expect(await screen.findByTestId('no-phases')).toBeInTheDocument()
    expect(screen.getByTestId('current-phase')).toHaveTextContent(
      'No phase running',
    )
  })

  it('disables phase controls once the mission is finished', async () => {
    phases = [makePhase(3, 'Egress', null, null)]
    renderWithQuery(<PhasePanel mission={makeMission('completed')} />)

    expect(
      await screen.findByRole('button', { name: 'Switch to Egress' }),
    ).toBeDisabled()
  })
})
