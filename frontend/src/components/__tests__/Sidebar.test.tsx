import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import Sidebar from '../Sidebar'
import { useMapStore } from '../../store'

beforeEach(() => {
  localStorage.clear()
  useMapStore.setState({ pinningMode: false, pendingPin: null })
})

describe('Sidebar pinning control', () => {
  it('enters and leaves pinning mode', async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

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
