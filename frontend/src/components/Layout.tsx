import ErrorBoundary from './ErrorBoundary'
import MapArea from './MapArea'
import Sidebar from './Sidebar'

/**
 * The two top-level panels are boundaried independently so a crash in one
 * leaves the other on screen — losing the sidebar must not take the map with
 * it.
 */
export default function Layout() {
  return (
    <div className="flex h-full">
      <ErrorBoundary label="Sidebar">
        <Sidebar />
      </ErrorBoundary>
      <ErrorBoundary label="Map">
        <MapArea />
      </ErrorBoundary>
    </div>
  )
}
