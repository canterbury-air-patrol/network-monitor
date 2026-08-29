import ErrorBoundary from './ErrorBoundary'
import MapArea from './MapArea'
import Sidebar from './Sidebar'
import SignalCharts from './SignalCharts'

/**
 * The top-level panels are boundaried independently so a crash in one leaves
 * the others on screen — losing the sidebar or the signal charts must not take
 * the map with it.
 */
export default function Layout() {
  return (
    <div className="flex h-full">
      <ErrorBoundary label="Sidebar">
        <Sidebar />
      </ErrorBoundary>
      <div className="flex min-w-0 flex-1 flex-col">
        <ErrorBoundary label="Map">
          <MapArea />
        </ErrorBoundary>
        <ErrorBoundary label="Signal history">
          <SignalCharts />
        </ErrorBoundary>
      </div>
    </div>
  )
}
