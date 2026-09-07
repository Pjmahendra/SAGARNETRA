import { create } from 'zustand'

interface UiState {
  zoneId: string
  setZone: (id: string) => void
  selectedMmsi: string | null
  selectMmsi: (mmsi: string | null) => void
  /** hours before acquisition for the track replay slider, 0 = acquisition time */
  replayHours: number
  setReplayHours: (h: number) => void
}

export const useUi = create<UiState>((set) => ({
  zoneId: 'z-guj',
  setZone: (zoneId) => set({ zoneId }),
  selectedMmsi: null,
  selectMmsi: (selectedMmsi) => set({ selectedMmsi }),
  replayHours: 0,
  setReplayHours: (replayHours) => set({ replayHours }),
}))
