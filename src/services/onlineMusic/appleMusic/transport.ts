import { readProviderSessionValue } from '../providerStorage';
import { OnlineProviderError } from '../../../types/onlineMusic';
import { requestMusicKit, usesMusicKit } from './musicKitTransport';

// src/services/onlineMusic/appleMusic/transport.ts

export interface AppleRequestInit {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: Record<string, unknown>;
}

export const hasCiderBridge = () => typeof window !== 'undefined' && Boolean(window.electron?.ciderRequest || window.electron?.appleMusicRequest);

export async function requestCider<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    if (!window.electron?.ciderRequest) throw new OnlineProviderError('unavailable', 'Apple Music requires the Folia desktop app and Cider.', 'applemusic');
    if (readProviderSessionValue('applemusic', 'disconnected') === 'true') throw new OnlineProviderError('auth-required', 'Connect Apple Music in Folia settings.', 'applemusic');
    const response = await window.electron.ciderRequest({ path, body });
    if (response.status === 401 || response.status === 403) throw new OnlineProviderError('auth-required', 'Check the Cider application token and Apple Music login.', 'applemusic');
    if (response.status < 200 || response.status >= 300) throw new OnlineProviderError('network', 'Cider is unavailable. Open Cider and enable its API.', 'applemusic');
    return response.data as T;
}

export async function requestApple<T>(path: string, init?: AppleRequestInit): Promise<T> {
    const write = Boolean(init?.method && init.method !== 'GET');
    if (usesMusicKit()) {
        if (readProviderSessionValue('applemusic', 'disconnected') === 'true') throw new OnlineProviderError('auth-required', 'Connect Apple Music in Folia settings.', 'applemusic');
        return requestMusicKit<T>('api', { path, ...(write ? { method: init!.method, body: init!.body } : {}) });
    }
    // Cider's run-v3 relays reads only; account writes need the standalone player.
    if (write) throw new OnlineProviderError('unsupported', 'Apple Music account changes require Folia standalone playback.', 'applemusic');
    const result = await requestCider<{ data?: T & { errors?: Array<{ status?: string }> } }>('/api/v1/amapi/run-v3', { path });
    if (result?.data?.errors?.some(error => error.status === '401' || error.status === '403')) {
        throw new OnlineProviderError('auth-required', 'Check your Apple Music login and subscription in Cider.', 'applemusic');
    }
    if (!result?.data || result.data.errors?.length) throw new OnlineProviderError('invalid-response', 'Apple Music rejected the request.', 'applemusic');
    return result.data;
}

export async function getStorefront(): Promise<string> {
    const response = await requestApple<{ data: Array<{ id: string }> }>('/v1/me/storefront');
    const id = response.data?.[0]?.id;
    if (!id || !/^[a-z]{2}$/.test(id)) throw new OnlineProviderError('auth-required', 'Sign in to Apple Music in Cider.', 'applemusic');
    return id;
}

export const applePath = (id: string, storefront: string, suffix = '') => (
    id.startsWith('i.') || id.startsWith('p.')
        ? `/v1/me/library/${id.startsWith('p.') ? 'playlists' : 'songs'}/${encodeURIComponent(id)}${suffix}`
        : `/v1/catalog/${storefront}/songs/${encodeURIComponent(id)}${suffix}`
);

// Library albums carry `l.` ids and live under the user's library rather than the storefront catalog.
export const appleAlbumPath = (id: string, storefront: string, suffix = '') => (
    id.startsWith('l.')
        ? `/v1/me/library/albums/${encodeURIComponent(id)}${suffix}`
        : `/v1/catalog/${storefront}/albums/${encodeURIComponent(id)}${suffix}`
);
