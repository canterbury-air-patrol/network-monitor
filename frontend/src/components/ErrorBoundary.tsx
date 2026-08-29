import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Panel name, shown in the fallback and in the console log. */
  label: string
  children: ReactNode
  /**
   * Replaces the default panel fallback. Pass `null` to render nothing, which
   * is what the map overlays want — a crashed overlay must never paint over
   * the coverage display.
   */
  fallback?: ReactNode
  /** Notified once per crash, for callers that surface degradation elsewhere. */
  onError?: (label: string, error: Error) => void
}

interface State {
  error: Error | null
}

interface FallbackProps {
  label: string
  error: Error
  onRetry: () => void
}

/**
 * Contained failure notice. The colours are chosen to read on both the dark
 * sidebar and the light map area, since panels live in both.
 */
export function PanelFallback({ label, error, onRetry }: FallbackProps) {
  return (
    <div
      role="alert"
      data-testid="panel-error"
      data-panel={label}
      className="m-2 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900"
    >
      <p className="font-semibold">{label} unavailable</p>
      <p className="mt-1 text-xs break-words">{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 min-h-11 w-full rounded bg-red-100 px-3 text-sm font-medium hover:bg-red-200"
      >
        Retry
      </button>
    </div>
  )
}

/**
 * Isolates one panel's render failures from the rest of the UI.
 *
 * Every major panel gets its own boundary so a crash degrades that panel
 * alone: in a flight the coverage display has to keep working even when the
 * mission controls, the station roster or a marker overlay have fallen over.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[${this.props.label}] panel crashed`,
      error,
      info.componentStack,
    )
    this.props.onError?.(this.props.label, error)
  }

  private retry = () => this.setState({ error: null })

  render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback
    return (
      <PanelFallback
        label={this.props.label}
        error={error}
        onRetry={this.retry}
      />
    )
  }
}
