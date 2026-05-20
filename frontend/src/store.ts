import { create } from 'zustand'
import type { ManualGroundStation, NodeInfo } from './types'

interface MapState {
  nodes: Record<number, NodeInfo>
  showUAVOverlay: boolean
  upsertNode: (info: NodeInfo) => void
  toggleUAVOverlay: () => void

  manualGroundStations: Record<number, ManualGroundStation>
  pinningMode: boolean
  _nextGsId: number
  addGroundStation: (
    name: string,
    latitude: number,
    longitude: number,
    altitudeM: number,
  ) => void
  removeGroundStation: (id: number) => void
  updateGroundStation: (
    id: number,
    updates: Partial<Pick<ManualGroundStation, 'name' | 'altitudeM'>>,
  ) => void
  togglePinningMode: () => void
}

export const useMapStore = create<MapState>((set) => ({
  nodes: {},
  showUAVOverlay: false,
  upsertNode: (info) =>
    set((state) => ({ nodes: { ...state.nodes, [info.nodeId]: info } })),
  toggleUAVOverlay: () =>
    set((state) => ({ showUAVOverlay: !state.showUAVOverlay })),

  manualGroundStations: {},
  pinningMode: false,
  _nextGsId: 1,
  addGroundStation: (name, latitude, longitude, altitudeM) =>
    set((state) => {
      const id = state._nextGsId
      return {
        manualGroundStations: {
          ...state.manualGroundStations,
          [id]: { id, name, latitude, longitude, altitudeM },
        },
        _nextGsId: id + 1,
        pinningMode: false,
      }
    }),
  removeGroundStation: (id) =>
    set((state) => {
      const next = { ...state.manualGroundStations }
      delete next[id]
      return { manualGroundStations: next }
    }),
  updateGroundStation: (id, updates) =>
    set((state) => {
      const existing = state.manualGroundStations[id]
      if (!existing) return {}
      return {
        manualGroundStations: {
          ...state.manualGroundStations,
          [id]: { ...existing, ...updates },
        },
      }
    }),
  togglePinningMode: () =>
    set((state) => ({ pinningMode: !state.pinningMode })),
}))
