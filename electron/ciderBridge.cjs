// electron/ciderBridge.cjs
// Restricts Cider access to its loopback API; Apple credentials remain in Cider.

const GET_PATHS = new Set(['active', 'now-playing', 'is-playing', 'volume']);
const POST_PATHS = new Set(['play-item', 'play-later', 'play', 'pause', 'seek', 'volume']);

// Validate the small interop surface before attaching the application token.
function validateRequest(request) {
    if (!request || typeof request !== 'object') throw new Error('Invalid Cider request');
    const { path, body } = request;
    if (path === '/api/v1/amapi/run-v3') {
        if (typeof body?.path !== 'string' || !/^\/v1\/(catalog\/[a-z]{2}\/|me\/(storefront|library\/|ratings\/|recommendations|recent\/played\/|history\/heavy-rotation))/.test(body.path)
            || /[\x00-\x20'"\\]/.test(body.path) || body.path.includes('..')) throw new Error('Invalid Apple Music path');
        return { path, body: { path: body.path } };
    }
    const action = typeof path === 'string' ? path.replace('/api/v1/playback/', '') : '';
    if (path !== `/api/v1/playback/${action}`) throw new Error('Invalid Cider path');
    if (body === undefined && GET_PATHS.has(action)) return { path };
    if (!POST_PATHS.has(action) || !body || typeof body !== 'object') throw new Error('Invalid Cider action');
    if ((action === 'play-item' || action === 'play-later') && (!/^[a-zA-Z0-9._-]+$/.test(body.id) || !['songs', 'library-songs'].includes(body.type))) throw new Error('Invalid Cider item');
    if (action === 'seek' && (!Number.isFinite(body.position) || body.position < 0)) throw new Error('Invalid seek');
    if (action === 'volume' && (!Number.isFinite(body.volume) || body.volume < 0 || body.volume > 1)) throw new Error('Invalid volume');
    return { path, body };
}

// Own the encrypted application token and fixed-origin requests in the main process.
function createCiderBridge({ store, safeStorage, fetchImpl = fetch }) {
    const readToken = () => {
        const encrypted = store.get('appleMusic.ciderToken');
        if (!encrypted) return '';
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Credential storage unavailable');
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    };
    return {
        configure(token) {
            if (typeof token !== 'string' || token.length > 4096 || /[\r\n]/.test(token)) throw new Error('Invalid Cider token');
            if (token && !safeStorage.isEncryptionAvailable()) throw new Error('Credential storage unavailable');
            if (token) store.set('appleMusic.ciderToken', safeStorage.encryptString(token).toString('base64'));
            else store.delete('appleMusic.ciderToken');
            return true;
        },
        async request(input) {
            const { path, body } = validateRequest(input);
            const token = readToken();
            try {
                const response = await fetchImpl(`http://127.0.0.1:10767${path}`, {
                    method: body === undefined ? 'GET' : 'POST',
                    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { apptoken: token } : {}) },
                    body: body === undefined ? undefined : JSON.stringify(body),
                    signal: AbortSignal.timeout(12000), redirect: 'error',
                });
                return { status: response.status, data: await response.json() };
            } catch {
                return { status: 503, data: null };
            }
        },
    };
}
module.exports = { createCiderBridge, validateRequest };
