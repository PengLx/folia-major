import type { RemotePlaybackBackend } from '../../../types/remotePlayback';
import { requestMusicKit } from './musicKitTransport';

// src/services/onlineMusic/appleMusic/playback.ts

export const musicKitPlayback: RemotePlaybackBackend = {
    async start(id) { await requestMusicKit('start', { id }); },
    async command(command, value) { await requestMusicKit('command', { command, value }); },
    async snapshot() { return requestMusicKit('snapshot'); },
};
