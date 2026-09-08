// electron/appleMusic/localTokenCompatibility.cjs
// Opt-in interoperability test for the developer token cached by the user's local Cider.
// Applied only to Folia's isolated MusicKit session, never to the main UI or other browsers.

const APPLE_MUSIC_HOSTS = new Set([
  'api.music.apple.com', 'amp-api.music.apple.com', 'authorize.music.apple.com',
  'play.itunes.apple.com', 'buy.itunes.apple.com', 'idmsa.apple.com',
]);

function rewriteLocalTokenHeaders(url, headers) {
  let target;
  try { target = new URL(url); } catch { return headers; }
  if (target.protocol !== 'https:' || !APPLE_MUSIC_HOSTS.has(target.hostname)) return headers;
  const output = Object.fromEntries(Object.entries(headers).filter(([key]) => !['origin', 'referer'].includes(key.toLowerCase())));
  const origin = target.hostname === 'idmsa.apple.com' ? 'https://idmsa.apple.com' : 'https://music.apple.com';
  return { ...output, Origin: origin, Referer: `${origin}/` };
}

function installLocalTokenCompatibility(session, enabled) {
  if (!enabled) return;
  session.webRequest.onBeforeSendHeaders({ urls: [...APPLE_MUSIC_HOSTS].map(host => `https://${host}/*`) }, (details, callback) => {
    callback({ requestHeaders: rewriteLocalTokenHeaders(details.url, details.requestHeaders) });
  });
  session.webRequest.onHeadersReceived({ urls: [...APPLE_MUSIC_HOSTS].map(host => `https://${host}/*`) }, (details, callback) => {
    callback({ responseHeaders: rewriteLocalTokenResponse(details.url, details.responseHeaders) });
  });
}

// Reflect the isolated player's origin for Apple responses to the compatibility request.
// Keep CORS enabled: no wildcard, credential changes, or changes to unrelated responses.
function rewriteLocalTokenResponse(url, headers = {}) {
  let target;
  try { target = new URL(url); } catch { return headers; }
  if (target.protocol !== 'https:' || !APPLE_MUSIC_HOSTS.has(target.hostname)) return headers;
  const key = Object.keys(headers).find(key => key.toLowerCase() === 'access-control-allow-origin');
  if (!key || headers[key]?.length !== 1 || headers[key][0] !== 'https://music.apple.com') return headers;
  return { ...headers, [key]: ['http://127.0.0.1:10768'] };
}
module.exports = { rewriteLocalTokenHeaders, rewriteLocalTokenResponse, installLocalTokenCompatibility };
