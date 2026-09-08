import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';

// test/unit/onlineMusic/remotePlayback.test.ts

const start = vi.hoisted(() => vi.fn());
const command = vi.hoisted(() => vi.fn());
vi.mock('@/services/onlineMusic/omni', () => ({ omni: { startRemotePlayback: start, remotePlaybackCommand: command } }));
const song = (id: string): SongResult => ({ id, name: id, artists: [], album: { id: 0, name: '' }, durationMs: 10000, sourceRef: { kind: 'online', providerId: 'applemusic', mediaId: id } });
beforeEach(() => { vi.resetModules(); start.mockReset().mockResolvedValue(undefined); command.mockReset().mockResolvedValue(undefined); });

describe('remote playback ownership', () => {
    it('queues a stop behind a pending start so late replies cannot restart playback', async () => {
        let release!: () => void;
        start.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
        const runtime = await import('@/services/remotePlayback');
        const pending = runtime.startRemotePlayback(song('1'));
        await vi.waitFor(() => expect(start).toHaveBeenCalled());
        const stopped = runtime.stopRemotePlayback();
        expect(runtime.isRemotePlaybackActive()).toBe(false);
        release();
        await expect(pending).resolves.toBe(false);
        await stopped;
        expect(command).toHaveBeenCalledWith(song('1'), 'pause');
    });
    it('suppresses obsolete starts when two songs are selected quickly', async () => {
        const runtime = await import('@/services/remotePlayback');
        const first = runtime.startRemotePlayback(song('1'));
        const second = runtime.startRemotePlayback(song('2'));
        expect(await first).toBe(false);
        expect(await second).toBe(true);
        expect(start).toHaveBeenCalledTimes(1);
        expect(start).toHaveBeenCalledWith(song('2'));
    });
    it('freezes the clock on pause and clamps extrapolation when updates stop', async () => {
        const runtime = await import('@/services/remotePlayback');
        await runtime.startRemotePlayback(song('1'));
        runtime.updateRemotePlaybackClock({ mediaId: '1', position: 3, duration: 10, playing: true });
        await runtime.commandRemotePlayback('pause');
        const paused = runtime.getRemotePlaybackTime();
        expect(runtime.getRemotePlaybackTime()).toBe(paused);
        await runtime.commandRemotePlayback('seek', 7);
        expect(runtime.getRemotePlaybackTime()).toBe(7);
        await runtime.stopRemotePlayback();
        expect(runtime.getRemotePlaybackTime()).toBe(0);
    });
});
