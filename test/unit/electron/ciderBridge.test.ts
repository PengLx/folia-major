import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

// test/unit/electron/ciderBridge.test.ts

const { createCiderBridge, validateRequest } = createRequire(import.meta.url)('../../../electron/ciderBridge.cjs');

describe('Cider loopback boundary', () => {
    it.each([
        { path: 'https://example.org/' },
        { path: '/api/v1/amapi/run-v3', body: { path: 'https://example.org/' } },
        { path: '/api/v1/amapi/run-v3', body: { path: '/v1/me/storefront/../../secret' } },
        { path: '/api/v1/playback/play-item', body: { id: "1');process.exit()", type: 'songs' } },
        { path: '/api/v1/playback/seek', body: { position: -1 } },
        { path: '/api/v1/playback/play-later', body: { id: '42', type: 'albums' } },
        { path: '/api/v1/playback/volume', body: { volume: 2 } },
    ])('rejects requests outside the supported protocol', request => { expect(() => validateRequest(request)).toThrow(); });
    it('accepts queueing the next item with the same shape as playing one', () => {
        expect(validateRequest({ path: '/api/v1/playback/play-later', body: { id: 'i.next', type: 'library-songs' } })).toEqual({ path: '/api/v1/playback/play-later', body: { id: 'i.next', type: 'library-songs' } });
    });
    it('relays account reads such as recommendations but not paths outside the user scope', () => {
        expect(validateRequest({ path: '/api/v1/amapi/run-v3', body: { path: '/v1/me/recommendations', method: 'POST' } })).toEqual({ path: '/api/v1/amapi/run-v3', body: { path: '/v1/me/recommendations' } });
        expect(() => validateRequest({ path: '/api/v1/amapi/run-v3', body: { path: '/v1/me/account' } })).toThrow();
    });
    it('stores the token encrypted and only attaches it to the fixed loopback origin', async () => {
        const values = new Map();
        const store = { get: (key: string) => values.get(key), set: (key: string, value: unknown) => values.set(key, value), delete: (key: string) => values.delete(key) };
        const safeStorage = { isEncryptionAvailable: () => true, encryptString: vi.fn(() => Buffer.from('encrypted')), decryptString: vi.fn(() => 'test-app-token') };
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ status: 'ok' }) }));
        const bridge = createCiderBridge({ store, safeStorage, fetchImpl });
        bridge.configure('test-app-token');
        expect(values.get('appleMusic.ciderToken')).toBe(Buffer.from('encrypted').toString('base64'));
        await bridge.request({ path: '/api/v1/playback/active' });
        expect(fetchImpl.mock.calls[0]).toEqual(['http://127.0.0.1:10767/api/v1/playback/active', expect.objectContaining({ redirect: 'error', headers: { apptoken: 'test-app-token' } })]);
        bridge.configure('');
        expect(values.size).toBe(0);
    });
    it('refuses plaintext fallback', () => {
        const bridge = createCiderBridge({ store: {}, safeStorage: { isEncryptionAvailable: () => false } });
        expect(() => bridge.configure('token')).toThrow('Credential storage unavailable');
    });
});
