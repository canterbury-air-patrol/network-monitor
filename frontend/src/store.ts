import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ManualGroundStation, NodeInfo, PendingPin } from './types'

interface MapState {
  nodes: Record<number, NodeInfo>
  showUAVOverlay: boolean
  upsertNode: (info: NodeInfo) => void
  toggleUAVOverlay: () => void

  manualGroundStations: Record<number, ManualGroundStation>
  pinningMode: boolean
  /** Coordinates captured from a map click, awaiting name/altitude confirmation. */
  pendingPin: PendingPin | null
  /** Station open in the edit form. Mutually exclusive with placing a new pin. */
  editingStationId: number | null
  _nextGsId: number
  setPinningMode: (on: boolean) => void
  togglePinningMode: () => void
  startPin: (latitude: number, longitude: number) => void
  cancelPin: () => void
  confirmPin: (name: string, altitudeM: number) => void
  addGroundStation: (
    name: string,
    latitude: number,
    longitude: number,
    altitudeM: number,
  ) => void
  removeGroundStation: (id: number) => void
  startEditingStation: (id: number) => void
  stopEditingStation: () => void
  updateGroundStation: (
    id: number,
    updates: Partial<Omit<ManualGroundStation, 'id'>>,
  ) => void
}

/** Ground stations are operator-entered, so they survive a reload until a backend endpoint exists. */
const STORAGE_KEY = 'network-monitor-ground-stations'

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      nodes: {},
      showUAVOverlay: false,
      upsertNode: (info) =>
        set((state) => ({ nodes: { ...state.nodes, [info.nodeId]: info } })),
      toggleUAVOverlay: () =>
        set((state) => ({ showUAVOverlay: !state.showUAVOverlay })),

      manualGroundStations: {},
      pinningMode: false,
      pendingPin: null,
      editingStationId: null,
      _nextGsId: 1,
      // Leaving the mode discards a pin the operator never confirmed, and the
      // form can only describe one station at a time, so editing closes too
      setPinningMode: (on) =>
        set({ pinningMode: on, pendingPin: null, editingStationId: null }),
      togglePinningMode: () =>
        set((state) => ({
          pinningMode: !state.pinningMode,
          pendingPin: null,
          editingStationId: null,
        })),
      // Clicks outside the mode are ordinary map interaction, not pin placement
      startPin: (latitude, longitude) =>
        set((state) =>
          state.pinningMode ? { pendingPin: { latitude, longitude } } : {},
        ),
      cancelPin: () => set({ pendingPin: null }),
      confirmPin: (name, altitudeM) =>
        set((state) => {
          const pin = state.pendingPin
          if (!pin) return {}
          const id = state._nextGsId
          return {
            manualGroundStations: {
              ...state.manualGroundStations,
              [id]: { id, name, ...pin, altitudeM },
            },
            _nextGsId: id + 1,
            pendingPin: null,
            pinningMode: false,
          }
        }),
      addGroundStation: (name, latitude, longitude, altitudeM) =>
        set((state) => {
          const id = state._nextGsId
          return {
            manualGroundStations: {
              ...state.manualGroundStations,
              [id]: { id, name, latitude, longitude, altitudeM },
            },
            _nextGsId: id + 1,
          }
        }),
      removeGroundStation: (id) =>
        set((state) => {
          const next = { ...state.manualGroundStations }
          delete next[id]
          return {
            manualGroundStations: next,
            // The form has nothing left to edit once its station is gone
            editingStationId:
              state.editingStationId === id ? null : state.editingStationId,
          }
        }),
      // Editing an existing station abandons any half-placed new pin
      startEditingStation: (id) =>
        set((state) =>
          state.manualGroundStations[id]
            ? { editingStationId: id, pinningMode: false, pendingPin: null }
            : {},
        ),
      stopEditingStation: () => set({ editingStationId: null }),
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
    }),
    {
      name: STORAGE_KEY,
      // Live telemetry and in-flight pinning state are deliberately not persisted
      partialize: (state) => ({
        manualGroundStations: state.manualGroundStations,
        _nextGsId: state._nextGsId,
      }),
    },
  ),
)
