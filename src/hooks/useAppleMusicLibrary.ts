import { getRemotePlaybackOwner, stopRemotePlayback } from '../services/remotePlayback';
import { setCurrentSong, setPlayQueue } from '../stores/usePlaybackStore';
import { useCallback, useEffect } from 'react';
import { omni } from '../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import type { ProviderCollection } from '../types/onlineMusic';

// src/hooks/useAppleMusicLibrary.ts

let generation = 0;
export async function stopAppleMusicForConnection() {
    ++generation;
    const owner = getRemotePlaybackOwner();
    if (owner?.sourceRef?.kind === 'online' && owner.sourceRef.providerId === 'applemusic') {
        await stopRemotePlayback();
        setCurrentSong(null);
        setPlayQueue([]);
    }
}
// Refresh only the latest account request; never persist an Apple user session.
export async function refreshAppleMusicLibrary(): Promise<boolean> {
    const request = ++generation;
    const { updateAccount, clearAccount } = useOnlineProviderAccountStore.getState();
    if (!omni.getProviderAvailability('applemusic').configured) { clearAccount('applemusic'); return false; }
    updateAccount('applemusic', { freshness: 'refreshing' });
    try {
        const user = await omni.getLoginStatus('applemusic');
        if (!user) throw new Error('auth-required');
        const collections: ProviderCollection[] = [];
        let offset = 0;
        while (offset < 1000) {
            const page = await omni.getProviderUserPlaylists('applemusic', user.id, { limit: 100, offset });
            if (request !== generation) return false;
            collections.push(...page.items);
            if (!page.hasMore || page.nextOffset <= offset) break;
            offset = page.nextOffset;
        }
        updateAccount('applemusic', { user, collections, status: 'authenticated', hydration: 'ready', freshness: 'fresh', error: undefined });
        return true;
    } catch {
        if (request === generation) updateAccount('applemusic', { status: 'error', hydration: 'ready', freshness: 'error', error: 'apple-music-unavailable' });
        return false;
    }
}

export function useAppleMusicLibrary() {
    const refresh = useCallback(refreshAppleMusicLibrary, []);
    const logout = useCallback(async () => {
        await stopAppleMusicForConnection();
        await omni.logout('applemusic');
        useOnlineProviderAccountStore.getState().clearAccount('applemusic');
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    return { refresh, logout };
}
