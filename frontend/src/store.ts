import { create } from 'zustand'
import type { NodeInfo } from './types'

interface MapState {
  nodes: Record<number, NodeInfo>
  showUAVOverlay: boolean
  upsertNode: (info: NodeInfo) => void
  toggleUAVOverlay: () => void
}

export const useMapStore = create<MapState>((set) => ({
  nodes: {},
  showUAVOverlay: false,
  upsertNode: (info) =>
    set((state) => ({ nodes: { ...state.nodes, [info.nodeId]: info } })),
  toggleUAVOverlay: () =>
    set((state) => ({ showUAVOverlay: !state.showUAVOverlay })),
}))
