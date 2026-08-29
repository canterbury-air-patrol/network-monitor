import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar'
import { useMapStore } from '../../store'
import { renderWithQuery } from '../../test/query'

vi.mock('../MissionControl', () => ({
  default: () => {
    throw new Error('mission control exploded')
  },
}))

beforeEach(() => {
  localStorage.clear()
  useMapStore.setState({ pinningMode: false, pendingPin: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Sidebar panel isolation', () => {
  it('keeps the layer and pinning controls when mission control crashes', () => {
    renderWithQuery(<Sidebar />)

    expect(screen.getByRole('alert')).toHaveAttribute(
      'data-panel',
      'Mission control',
    )
    expect(screen.getByTestId('pinning-mode-toggle')).toBeInTheDocument()
    expect(screen.getByLabelText('UAV positions')).toBeInTheDocument()
  })
})
