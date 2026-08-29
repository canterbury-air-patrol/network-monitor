import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from '../ErrorBoundary'

function Panel({ fail }: { fail: boolean }) {
  if (fail) throw new Error('sensor feed exploded')
  return <p>panel body</p>
}

beforeEach(() => {
  // React reports every caught render error to console.error; the suite
  // deliberately crashes components, so keep the output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders its children while they are healthy', () => {
    render(
      <ErrorBoundary label="Mission control">
        <Panel fail={false} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('panel body')).toBeInTheDocument()
    expect(screen.queryByTestId('panel-error')).not.toBeInTheDocument()
  })

  it('replaces a crashed child with a fallback naming the panel', () => {
    render(
      <ErrorBoundary label="Mission control">
        <Panel fail={true} />
      </ErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('data-panel', 'Mission control')
    expect(alert).toHaveTextContent('Mission control unavailable')
    expect(alert).toHaveTextContent('sensor feed exploded')
    expect(screen.queryByText('panel body')).not.toBeInTheDocument()
  })

  it('restores the panel when Retry is pressed after the cause clears', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ErrorBoundary label="Mission control">
        <Panel fail={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('panel-error')).toBeInTheDocument()

    // A re-render alone must not clear the fallback — only an explicit retry.
    rerender(
      <ErrorBoundary label="Mission control">
        <Panel fail={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('panel-error')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText('panel body')).toBeInTheDocument()
    expect(screen.queryByTestId('panel-error')).not.toBeInTheDocument()
  })

  it('renders a caller-supplied fallback and reports the crash', () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary label="Coverage" fallback={null} onError={onError}>
        <Panel fail={true} />
      </ErrorBoundary>,
    )

    expect(screen.queryByTestId('panel-error')).not.toBeInTheDocument()
    expect(onError).toHaveBeenCalledWith('Coverage', expect.any(Error))
    expect(onError.mock.calls[0][1]).toHaveProperty(
      'message',
      'sensor feed exploded',
    )
  })
})
