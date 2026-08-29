import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar'
import { useMapStore } from '../../store'
import { renderWithQuery } from '../../test/query'

beforeEach(() => {
  localStorage.clear()
  useMapStore.setState({ pinningMode: false, pendingPin: null })
  // The mission panel queries on mount; this suite only exercises pinning.
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
          { status: 200 },
        ),
      ),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Sidebar pinning control', () => {
  it('enters and leaves pinning mode', async () => {
    const user = userEvent.setup()
    renderWithQuery(<Sidebar />)

    const toggle = screen.getByTestId('pinning-mode-toggle')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)
    expect(useMapStore.getState().pinningMode).toBe(true)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByText('Click the map to place a ground station.'),
    ).toBeInTheDocument()

    await user.click(toggle)
    expect(useMapStore.getState().pinningMode).toBe(false)
  })
})
