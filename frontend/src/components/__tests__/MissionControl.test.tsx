import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../../test/query'
import type { MissionResponse, MissionStatus } from '../../types'
import MissionControl from '../MissionControl'

function makeMission(
  id: number,
  name: string,
  status: MissionStatus,
): MissionResponse {
  return {
    id,
    name,
    operator_notes: '',
    status,
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
  }
}

let missions: MissionResponse[] = []
let posts: string[] = []
let postFailure: string | null = null

function page(results: unknown[]) {
  return new Response(
    JSON.stringify({
      count: results.length,
      next: null,
      previous: null,
      results,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

beforeEach(() => {
  missions = []
  posts = []
  postFailure = null
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST') {
        posts.push(url)
        return Promise.resolve(
          postFailure === null
            ? new Response('{}', { status: 200 })
            : new Response(JSON.stringify({ detail: [postFailure] }), {
                status: 400,
              }),
        )
      }
      if (url.startsWith('/api/v1/missions/'))
        return Promise.resolve(page(missions))
      if (url.startsWith('/api/v1/phases/')) return Promise.resolve(page([]))
      return Promise.reject(new Error(`unexpected request: ${url}`))
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MissionControl', () => {
  it('names the active mission and offers only the transitions it allows', async () => {
    missions = [makeMission(7, 'Kaikoura Sweep', 'active')]
    renderWithQuery(<MissionControl />)

    await screen.findByText('Kaikoura Sweep')
    expect(screen.getByTestId('mission-stop')).toBeEnabled()
    expect(screen.getByTestId('mission-start')).toBeDisabled()
    expect(screen.getByTestId('mission-archive')).toBeDisabled()
  })

  it('reports when nothing is flying and still allows a pending mission to start', async () => {
    missions = [makeMission(3, 'Ridge Survey', 'pending')]
    renderWithQuery(<MissionControl />)

    expect(await screen.findByTestId('mission-start')).toBeEnabled()
    expect(screen.getByText('No active mission')).toBeInTheDocument()
    expect(screen.getByTestId('mission-archive')).toBeEnabled()
    expect(screen.getByTestId('mission-stop')).toBeDisabled()
  })

  it('posts the lifecycle action for the selected mission', async () => {
    const user = userEvent.setup()
    missions = [
      makeMission(1, 'Ridge Survey', 'pending'),
      makeMission(2, 'Coast Patrol', 'active'),
    ]
    renderWithQuery(<MissionControl />)

    // The active mission is preselected, so Stop acts on it without a choice
    await screen.findByText('Coast Patrol')
    await user.click(screen.getByTestId('mission-stop'))
    await waitFor(() => expect(posts).toEqual(['/api/v1/missions/2/stop/']))

    await user.selectOptions(screen.getByTestId('mission-select'), '1')
    await user.click(screen.getByTestId('mission-start'))
    await waitFor(() => expect(posts).toContain('/api/v1/missions/1/start/'))
  })

  it('surfaces a rejected transition', async () => {
    const user = userEvent.setup()
    missions = [makeMission(4, 'Ridge Survey', 'pending')]
    postFailure = 'Only pending missions can be started.'
    renderWithQuery(<MissionControl />)

    await screen.findByTestId('mission-start')
    await user.click(screen.getByTestId('mission-start'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only pending missions can be started.',
    )
  })

  it('says so when no mission exists', async () => {
    renderWithQuery(<MissionControl />)

    expect(await screen.findByTestId('no-missions')).toBeInTheDocument()
    expect(screen.queryByTestId('mission-select')).not.toBeInTheDocument()
  })
})
