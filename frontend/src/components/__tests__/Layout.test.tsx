import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Layout from '../Layout'

const crash = vi.hoisted(() => ({ sidebar: false, map: false, charts: false }))

vi.mock('../Sidebar', () => ({
  default: () => {
    if (crash.sidebar) throw new Error('sidebar exploded')
    return <div data-testid="sidebar" />
  },
}))

vi.mock('../MapArea', () => ({
  default: () => {
    if (crash.map) throw new Error('map exploded')
    return <div data-testid="map-area" />
  },
}))

vi.mock('../SignalCharts', () => ({
  default: () => {
    if (crash.charts) throw new Error('charts exploded')
    return <div data-testid="signal-charts" />
  },
}))

beforeEach(() => {
  crash.sidebar = false
  crash.map = false
  crash.charts = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Layout panel isolation', () => {
  it('keeps the map when the sidebar crashes', () => {
    crash.sidebar = true
    render(<Layout />)

    expect(screen.getByTestId('map-area')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveAttribute('data-panel', 'Sidebar')
  })

  it('keeps the sidebar when the map crashes', () => {
    crash.map = true
    render(<Layout />)

    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveAttribute('data-panel', 'Map')
  })

  it('keeps the map when the signal charts crash', () => {
    crash.charts = true
    render(<Layout />)

    expect(screen.getByTestId('map-area')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveAttribute(
      'data-panel',
      'Signal history',
    )
  })
})
