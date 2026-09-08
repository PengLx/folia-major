import type { RemotePlaybackBackend } from '../../../types/remotePlayback';
import { OnlineProviderError } from '../../../types/onlineMusic';
import { requestCider } from './transport';
import { requestMusicKit, usesMusicKit } from './musicKitTransport';

// src/services/onlineMusic/appleMusic/playback.ts

type CiderNowPlaying = { info?: { playParams?: { id?: string; catalogId?: string }; currentPlaybackTime?: number; durationInMillis?: number } };

const itemType = (mediaId: string) => (mediaId.startsWith('i.') ? 'library-songs' : 'songs');
// MusicKit only offers two tiers; everything above standard maps to its 256 kbps AAC.
const bitrateFor = (quality?: string) => (quality === 'standard' ? 64 : 256);

export const ciderPlayback: RemotePlaybackBackend = {
    async start(mediaId, options = {}) {
        if (usesMusicKit()) {
            await requestMusicKit('start', { id: mediaId, bitrate: bitrateFor(options.quality), continueIfCurrent: Boolean(options.continueIfCurrent) });
            return;
        }
        if (options.continueIfCurrent) {
            const now = await requestCider<CiderNowPlaying>('/api/v1/playback/now-playing').catch(() => null);
            if (now?.info?.playParams?.id === mediaId || now?.info?.playParams?.catalogId === mediaId) {
                await requestCider('/api/v1/playback/play', {});
                return;
            }
        }
        await requestCider('/api/v1/playback/play-item', { id: mediaId, type: itemType(mediaId) });
    },
    async command(command, value) {
        if (usesMusicKit()) { await requestMusicKit('command', { command, value }); return; }
        await requestCider(`/api/v1/playback/${command}`, command === 'seek' ? { position: value } : command === 'volume' ? { volume: value } : {});
    },
    async queueNext(mediaId) {
        if (usesMusicKit()) { await requestMusicKit('queueNext', { id: mediaId }); return; }
        await requestCider('/api/v1/playback/play-later', { id: mediaId, type: itemType(mediaId) });
    },
    async snapshot() {
        if (usesMusicKit()) return requestMusicKit('snapshot');
        const [track, state] = await Promise.all([
            requestCider<CiderNowPlaying>('/api/v1/playback/now-playing'),
            requestCider<{ is_playing: boolean }>('/api/v1/playback/is-playing'),
        ]);
        if (typeof state?.is_playing !== 'boolean') throw new OnlineProviderError('invalid-response', 'Invalid Cider playback state.', 'applemusic');
        const info = track.info;
        return { mediaId: info?.playParams?.id || info?.playParams?.catalogId || null,
            catalogMediaId: info?.playParams?.catalogId || null,
            position: Math.max(0, info?.currentPlaybackTime || 0), duration: Math.max(0, (info?.durationInMillis || 0) / 1000), playing: state.is_playing };
    },
};
