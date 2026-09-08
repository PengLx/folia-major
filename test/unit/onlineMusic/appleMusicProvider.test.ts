import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { appleMusicProvider } from '@/services/onlineMusic/appleMusicProvider';
import { normalizeAppleSong, applePage } from '@/services/onlineMusic/appleMusic/normalize';
import { omni } from '@/services/onlineMusic/omni';

// test/unit/onlineMusic/appleMusicProvider.test.ts

const resource = { id: '42', type: 'songs', attributes: { name: 'Song', artistName: 'Artist', albumName: 'Album', durationInMillis: 120000,
    artwork: { url: 'https://example.org/{w}x{h}.jpg' }, previews: [{ url: 'https://example.org/preview.m4a' }] } };
const request = vi.fn();
beforeEach(() => { vi.stubGlobal('window', { electron: { ciderRequest: request } }); request.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe('Apple Music through Omni', () => {
    it('preserves library identity and never maps previews to audio sources', async () => {
        const song = normalizeAppleSong({ ...resource, id: 'i.library', attributes: { ...resource.attributes, playParams: { catalogId: '42' } } });
        expect(song.sourceRef).toMatchObject({ providerId: 'applemusic', mediaId: 'i.library', providerData: { catalogId: '42' } });
        expect(song.album.coverUrl).toBe('https://example.org/600x600.jpg');
        expect(omni.usesRemotePlayback(song)).toBe(true);
        await expect(omni.getAudioSource(song, 'lossless')).rejects.toMatchObject({ code: 'unsupported' });
    });
    it('uses the authenticated storefront and encodes search terms', async () => {
        request.mockResolvedValueOnce({ status: 200, data: { data: { data: [{ id: 'jp' }] } } })
            .mockResolvedValueOnce({ status: 200, data: { data: { results: { songs: { data: [resource], next: '/v1/catalog/jp/search?offset=25' } } } } });
        const page = await omni.searchProviderSongs('applemusic', 'A & B', { limit: 30, offset: 0 });
        expect(request.mock.calls[1][0].body.path).toBe('/v1/catalog/jp/search?term=A+%26+B&types=songs&limit=25&offset=0');
        expect(page).toMatchObject({ nextOffset: 25, hasMore: true, items: [{ sourceRef: { providerId: 'applemusic', mediaId: '42' } }] });
    });
    it('does not invent a logged-in account from a public catalog response', async () => {
        request.mockResolvedValueOnce({ status: 200, data: { data: { data: [{ id: 'us' }] } } })
            .mockResolvedValueOnce({ status: 401, data: null });
        await expect(omni.getLoginStatus('applemusic')).rejects.toMatchObject({ code: 'auth-required' });
    });
    it('routes library playback and seek through Cider', async () => {
        request.mockResolvedValue({ status: 200, data: { status: 'ok' } });
        const song = normalizeAppleSong({ ...resource, id: 'i.library' });
        await omni.startRemotePlayback(song);
        await omni.remotePlaybackCommand(song, 'seek', 32);
        expect(request.mock.calls.map(call => call[0])).toEqual([
            { path: '/api/v1/playback/play-item', body: { id: 'i.library', type: 'library-songs' } },
            { path: '/api/v1/playback/seek', body: { position: 32 } },
        ]);
    });
    it('continues a track Cider already advanced to instead of restarting it, and queues the next one', async () => {
        request.mockImplementation(async ({ path }: { path: string }) => ({ status: 200, data:
            path.endsWith('/now-playing') ? { info: { playParams: { id: 'i.next', catalogId: '43' }, currentPlaybackTime: 1, durationInMillis: 1000 } } : { status: 'ok' } }));
        await appleMusicProvider.playback!.remote!.queueNext!('i.next');
        await appleMusicProvider.playback!.remote!.start('i.next', { continueIfCurrent: true });
        await appleMusicProvider.playback!.remote!.start('i.other', { continueIfCurrent: true });
        expect(request.mock.calls.map(call => call[0].path)).toEqual([
            '/api/v1/playback/play-later', '/api/v1/playback/now-playing', '/api/v1/playback/play', '/api/v1/playback/now-playing', '/api/v1/playback/play-item',
        ]);
        expect(request.mock.calls[0][0].body).toEqual({ id: 'i.next', type: 'library-songs' });
    });
    it('rejects malformed snapshots and provider error envelopes', async () => {
        request.mockResolvedValue({ status: 200, data: {} });
        await expect(appleMusicProvider.playback!.remote!.snapshot()).rejects.toMatchObject({ code: 'invalid-response' });
        request.mockResolvedValue({ status: 200, data: { data: { errors: [{ status: '403' }] } } });
        await expect(omni.getLoginStatus('applemusic')).rejects.toMatchObject({ code: 'auth-required' });
    });
    it('resolves a library song to the catalog before requesting lyrics', async () => {
        request.mockResolvedValueOnce({ status: 200, data: { data: { data: [{ id: 'us' }] } } })
            .mockResolvedValueOnce({ status: 200, data: { data: { data: [resource] } } })
            .mockResolvedValue({ status: 200, data: { data: { data: [] } } });
        await omni.getLyrics(normalizeAppleSong({ ...resource, id: 'i.library' }));
        expect(request.mock.calls.map(call => call[0].body?.path)).toEqual([
            '/v1/me/storefront', '/v1/me/library/songs/i.library/catalog',
            '/v1/catalog/us/songs/42/syllable-lyrics', '/v1/catalog/us/songs/42/lyrics',
        ]);
    });
    it('keeps pagination progressing and rejects malformed resources', () => {
        expect(applePage({ data: [resource], next: '/page?offset=0' }, 20, normalizeAppleSong).nextOffset).toBe(21);
        expect(() => normalizeAppleSong({ id: '42' })).toThrow();
    });
});

describe('standalone MusicKit routing', () => {
    it('passes Apple word timing through Omni and falls back only when the syllable resource is absent', async () => {
        const ttml = '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><body><div><p begin="1.000" end="3.000" itunes:key="L1"><span begin="1.000" end="2.000">Test </span><span begin="2.000" end="3.000">line</span></p></div></body></tt>';
        const music = vi.fn(async (_action: string, input: { path: string }) => ({ ok: true, data:
            input.path === '/v1/me/storefront' ? { data: [{ id: 'us' }] }
                : input.path.endsWith('/syllable-lyrics') ? { data: [] }
                    : { data: [{ attributes: { ttml } }] },
        }));
        vi.stubGlobal('window', { electron: { appleMusicRequest: music } });
        const result = await omni.getLyrics(normalizeAppleSong(resource));
        expect(result.lyrics?.lines[0]).toMatchObject({ startTime: 1, endTime: 3 });
        expect(result.lyrics?.lines[0]?.words).toHaveLength(2);
        expect(result.wordByWordText).toBe(ttml);
        music.mockResolvedValue({ ok: false, error: 'lyrics-network-error' } as any);
        await expect(omni.getLyrics(normalizeAppleSong(resource))).rejects.toMatchObject({ code: 'network' });
    });
    it('uses the isolated host for catalog data and playback without Cider requests', async () => {
        const music = vi.fn(async (action: string, _input?: Record<string, unknown>) => ({ ok: true, data: action === 'api' ? { data: [{ id: 'us' }] } : true }));
        vi.stubGlobal('window', { electron: { appleMusicRequest: music, ciderRequest: request } });
        await appleMusicProvider.auth!.configureConnection!({ playbackMode: 'musickit' });
        await appleMusicProvider.playback!.remote!.start('42', { quality: 'standard' });
        await appleMusicProvider.playback!.remote!.start('43', { quality: 'lossless', continueIfCurrent: true });
        await appleMusicProvider.playback!.remote!.command('seek', 33);
        await appleMusicProvider.playback!.remote!.queueNext!('44');
        expect(music.mock.calls.map(call => call[0])).toEqual(['connect', 'start', 'start', 'command', 'queueNext']);
        expect(music.mock.calls[1][1]).toEqual({ id: '42', bitrate: 64, continueIfCurrent: false });
        expect(music.mock.calls[2][1]).toEqual({ id: '43', bitrate: 256, continueIfCurrent: true });
        expect(music.mock.calls[4][1]).toEqual({ id: '44' });
        expect(request).not.toHaveBeenCalled();
    });
    it('surfaces credential and DRM errors instead of silently falling back to Cider', async () => {
        const music = vi.fn().mockResolvedValue({ ok: false, error: 'developer-token-expired' });
        vi.stubGlobal('window', { electron: { appleMusicRequest: music, ciderRequest: request } });
        await expect(appleMusicProvider.auth!.configureConnection!({ playbackMode: 'musickit' })).rejects.toMatchObject({ code: 'auth-required', message: 'developer-token-expired' });
        music.mockResolvedValue({ ok: false, error: 'widevine-unavailable' });
        await expect(appleMusicProvider.playback!.remote!.start('42')).rejects.toMatchObject({ code: 'unavailable' });
        expect(request).not.toHaveBeenCalled();
    });
});
