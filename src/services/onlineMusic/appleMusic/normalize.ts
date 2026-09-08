import type { UnifiedSong } from '../../../types';
import type { ProviderCollection, ProviderPage } from '../../../types/onlineMusic';
import { OnlineProviderError } from '../../../types/onlineMusic';

// src/services/onlineMusic/appleMusic/normalize.ts

type Attributes = {
    name?: string; artistName?: string; albumName?: string; durationInMillis?: number;
    artwork?: { url?: string }; description?: { standard?: string }; trackCount?: number;
    playParams?: { id?: string; catalogId?: string }; url?: string;
};
export interface AppleResource { id: string; type: string; attributes?: Attributes }
export interface ApplePage { data: AppleResource[]; next?: string }

export const artworkUrl = (artwork?: { url?: string }): string | undefined => artwork?.url
    ?.replace(/\{w\}|\{h\}/g, '600').replace('{f}', 'jpg');

export function normalizeAppleSong(raw: unknown): UnifiedSong {
    const item = raw as AppleResource;
    if (!item || typeof item.id !== 'string' || !item.attributes?.name) throw new OnlineProviderError('invalid-response', 'Invalid Apple Music song.', 'applemusic');
    const a = item.attributes;
    return {
        id: item.id, name: a.name!, artists: [{ id: 0, name: a.artistName || '' }],
        album: { id: 0, name: a.albumName || '', coverUrl: artworkUrl(a.artwork) },
        durationMs: Number.isFinite(a.durationInMillis) ? a.durationInMillis! : 0,
        sourceRef: { kind: 'online', providerId: 'applemusic', mediaId: item.id,
            providerData: { catalogId: a.playParams?.catalogId || item.id, url: a.url || '' } },
    };
}

export function normalizeAppleCollection(raw: unknown): ProviderCollection {
    const item = raw as AppleResource;
    if (!item?.id || !item.attributes?.name) throw new OnlineProviderError('invalid-response', 'Invalid Apple Music playlist.', 'applemusic');
    return { providerId: 'applemusic', id: item.id, type: 'playlist', name: item.attributes.name,
        coverUrl: artworkUrl(item.attributes.artwork), description: item.attributes.description?.standard,
        trackCount: item.attributes.trackCount, isOwned: false };
}

export function applePage<T>(raw: ApplePage, offset: number, normalize: (item: unknown) => T): ProviderPage<T> {
    if (!Array.isArray(raw?.data)) throw new OnlineProviderError('invalid-response', 'Invalid Apple Music page.', 'applemusic');
    const items = raw.data.map(normalize);
    const nextOffset = raw.next ? Number(new URL(raw.next, 'https://api.music.apple.com').searchParams.get('offset')) : NaN;
    return { items, hasMore: Boolean(raw.next) && items.length > 0,
        nextOffset: Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : offset + items.length };
}
