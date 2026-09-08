import { readProviderSessionValue } from '../providerStorage';
import { OnlineProviderError } from '../../../types/onlineMusic';
import { requestMusicKit } from './musicKitTransport';

// src/services/onlineMusic/appleMusic/transport.ts

export const hasMusicKit = () => typeof window !== 'undefined' && window.electron?.appleMusicAvailable === true && Boolean(window.electron.appleMusicRequest);

export async function requestApple<T>(path: string): Promise<T> {
    if (readProviderSessionValue('applemusic', 'disconnected') === 'true') throw new OnlineProviderError('auth-required', 'Connect Apple Music from the account menu.', 'applemusic');
    return requestMusicKit<T>('api', { path });
}

export async function getStorefront(): Promise<string> {
    const response = await requestApple<{ data: Array<{ id: string }> }>('/v1/me/storefront');
    const id = response.data?.[0]?.id;
    if (!id || !/^[a-z]{2}$/.test(id)) throw new OnlineProviderError('auth-required', 'Sign in to Apple Music.', 'applemusic');
    return id;
}

export const applePath = (id: string, storefront: string, suffix = '') => (
    id.startsWith('i.') || id.startsWith('p.')
        ? `/v1/me/library/${id.startsWith('p.') ? 'playlists' : 'songs'}/${encodeURIComponent(id)}${suffix}`
        : `/v1/catalog/${storefront}/songs/${encodeURIComponent(id)}${suffix}`
);
