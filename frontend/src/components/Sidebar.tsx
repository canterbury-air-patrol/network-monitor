import { useShallow } from 'zustand/react/shallow'
import { useMapStore } from '../store'
import GroundStationList from './GroundStationList'
import MissionControl from './MissionControl'

export default function Sidebar() {
  const { showUAVOverlay, toggleUAVOverlay, pinningMode, togglePinningMode } =
    useMapStore(
      useShallow((s) => ({
        showUAVOverlay: s.showUAVOverlay,
        toggleUAVOverlay: s.toggleUAVOverlay,
        pinningMode: s.pinningMode,
        togglePinningMode: s.togglePinningMode,
      })),
    )

  return (
    <aside
      className="bg-surface flex w-64 shrink-0 flex-col overflow-y-auto text-white"
      data-testid="sidebar"
    >
      <div className="p-4 text-lg font-semibold tracking-wide">
        Network Monitor
      </div>
      <MissionControl />
      <div className="border-t border-white/10 p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-white/50 uppercase">
          Layers
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showUAVOverlay}
            onChange={toggleUAVOverlay}
            className="accent-accent"
          />
          UAV positions
        </label>
      </div>
      <div className="border-t border-white/10 p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-white/50 uppercase">
          Ground Stations
        </p>
        <button
          type="button"
          onClick={togglePinningMode}
          aria-pressed={pinningMode}
          data-testid="pinning-mode-toggle"
          className={`min-h-11 w-full rounded px-3 py-2 text-sm font-medium ${
            pinningMode
              ? 'bg-accent text-white'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          {pinningMode ? 'Cancel pinning' : 'Pin ground station'}
        </button>
        {pinningMode && (
          <p className="mt-2 text-xs text-white/60">
            Click the map to place a ground station.
          </p>
        )}
        <GroundStationList />
      </div>
    </aside>
  )
}
