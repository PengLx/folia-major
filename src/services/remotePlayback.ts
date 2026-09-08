import type { SongResult } from '../types';
import type { RemotePlaybackCommand, RemotePlaybackSnapshot } from '../types/remotePlayback';
import { omni } from './onlineMusic/omni';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// src/services/remotePlayback.ts

let owner: SongResult | null = null;
let generation = 0;
let commands = Promise.resolve();
let anchor: (RemotePlaybackSnapshot & { at: number }) | null = null;

export const isRemotePlaybackActive = () => owner !== null;
export const getRemotePlaybackOwner = () => owner;
export const getRemotePlaybackTime = () => anchor
    ? Math.min(anchor.duration, anchor.position + (anchor.playing ? Math.min(1.5, (performance.now() - anchor.at) / 1000) : 0)) : 0;
export const updateRemotePlaybackClock = (snapshot: RemotePlaybackSnapshot) => { anchor = { ...snapshot, at: performance.now() }; };

// Serialize commands so a late start cannot restart a backend after a source switch.
const enqueue = (run: () => Promise<void>) => {
    const result = commands.then(run);
    commands = result.catch(() => {});
    return result;
};

// Transfer ownership before queuing work so rapid selections can invalidate old starts.
export async function startRemotePlayback(song: SongResult): Promise<boolean> {
    const request = ++generation;
    const previous = owner;
    owner = song;
    anchor = null;
    await enqueue(async () => {
        if (previous) await omni.remotePlaybackCommand(previous, 'pause');
        if (request !== generation) return;
        await omni.startRemotePlayback(song);
    });
    return request === generation;
}

export async function stopRemotePlayback(): Promise<void> {
    const previous = owner;
    ++generation;
    owner = null;
    anchor = null;
    if (previous) await enqueue(() => omni.remotePlaybackCommand(previous, 'pause'));
}

export async function commandRemotePlayback(command: RemotePlaybackCommand, value?: number): Promise<void> {
    const song = owner;
    const request = generation;
    if (!song) return;
    await enqueue(async () => {
        if (request !== generation) return;
        await omni.remotePlaybackCommand(song, command, value);
        if (request !== generation || !anchor) return;
        const position = command === 'seek' ? value! : getRemotePlaybackTime();
        anchor = { ...anchor, position, at: performance.now(), playing: command === 'pause' ? false : command === 'play' ? true : anchor.playing };
    });
}

export const ownsRemotePlayback = (song: SongResult | null) => Boolean(song && owner && getPlaybackSongKey(song) === getPlaybackSongKey(owner));
