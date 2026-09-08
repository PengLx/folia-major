import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

// test/unit/electron/appleMusicLocalToken.test.ts

const require = createRequire(import.meta.url);
const { rewriteLocalTokenHeaders, rewriteLocalTokenResponse, installLocalTokenCompatibility } = require('../../../electron/appleMusic/localTokenCompatibility.cjs');

describe('opt-in local Cider token compatibility', () => {
    it('is disabled by default', () => {
        const session = { webRequest: { onBeforeSendHeaders: vi.fn() } };
        installLocalTokenCompatibility(session, false);
        expect(session.webRequest.onBeforeSendHeaders).not.toHaveBeenCalled();
    });
    it('changes only the observed Apple origins and preserves authentication headers', () => {
        const headers = { origin: 'http://127.0.0.1:10768', referer: 'http://127.0.0.1:10768/', Authorization: 'fixture' };
        expect(rewriteLocalTokenHeaders('https://api.music.apple.com/v1/test', headers))
            .toEqual({ Origin: 'https://music.apple.com', Referer: 'https://music.apple.com/', Authorization: 'fixture' });
        expect(rewriteLocalTokenHeaders('https://idmsa.apple.com/appleauth/auth', headers).Origin).toBe('https://idmsa.apple.com');
        expect(headers.origin).toBe('http://127.0.0.1:10768');
    });
    it('leaves non-Apple hosts and insecure requests untouched', () => {
        const headers = { Origin: 'http://127.0.0.1:10768' };
        for (const url of ['http://api.music.apple.com/v1/test', 'https://api.music.apple.com.evil.example/', 'https://example.com/', 'invalid']) {
            expect(rewriteLocalTokenHeaders(url, headers)).toBe(headers);
        }
    });
    it('maps only the expected Apple CORS response to the fixed isolated player origin', () => {
        const headers = { 'Access-Control-Allow-Origin': ['https://music.apple.com'], 'Access-Control-Allow-Credentials': ['true'] };
        expect(rewriteLocalTokenResponse('https://play.itunes.apple.com/test', headers))
            .toEqual({ ...headers, 'Access-Control-Allow-Origin': ['http://127.0.0.1:10768'] });
        expect(rewriteLocalTokenResponse('https://example.com/test', headers)).toBe(headers);
        const wildcard = { 'access-control-allow-origin': ['*'] };
        expect(rewriteLocalTokenResponse('https://play.itunes.apple.com/test', wildcard)).toBe(wildcard);
        expect(headers['Access-Control-Allow-Origin']).toEqual(['https://music.apple.com']);
    });
});
