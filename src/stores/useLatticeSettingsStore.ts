import { create } from 'zustand';
import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';

// src/stores/useLatticeSettingsStore.ts
// Persistent queue-collage preferences. Deliberately separate from useLatticeControlsStore: that
// store only publishes runtime actions from the currently mounted wall.

const LATTICE_VIGNETTE_KEY = 'lattice_vignette';
const LATTICE_AUTO_FOCUS_ON_SONG_CHANGE_KEY = 'lattice_auto_focus_on_song_change';

export type LatticeSettingsState = {
    latticeVignette: boolean;
    autoFocusOnSongChange: boolean;
    handleToggleLatticeVignette: (enabled: boolean) => void;
    handleToggleAutoFocusOnSongChange: (enabled: boolean) => void;
};

export const useLatticeSettingsStore = create<LatticeSettingsState>(set => ({
    latticeVignette: getStoredBoolean(LATTICE_VIGNETTE_KEY, true),
    autoFocusOnSongChange: getStoredBoolean(LATTICE_AUTO_FOCUS_ON_SONG_CHANGE_KEY, true),
    handleToggleLatticeVignette: (enabled) => {
        set({ latticeVignette: enabled });
        setStoredBoolean(LATTICE_VIGNETTE_KEY, enabled);
    },
    handleToggleAutoFocusOnSongChange: (enabled) => {
        set({ autoFocusOnSongChange: enabled });
        setStoredBoolean(LATTICE_AUTO_FOCUS_ON_SONG_CHANGE_KEY, enabled);
    },
}));
