import { useShallow } from 'zustand/react/shallow'
import { useMapStore } from '../store'

export default function Sidebar() {
  const { showUAVOverlay, toggleUAVOverlay } = useMapStore(
    useShallow((s) => ({
      showUAVOverlay: s.showUAVOverlay,
      toggleUAVOverlay: s.toggleUAVOverlay,
    })),
  )

  return (
    <aside
      className="bg-surface flex w-64 flex-col text-white"
      data-testid="sidebar"
    >
      <div className="p-4 text-lg font-semibold tracking-wide">
        Network Monitor
      </div>
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
    </aside>
  )
}
