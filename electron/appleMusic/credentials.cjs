// electron/appleMusic/credentials.cjs

function validateDeveloperToken(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error('developer-token-invalid');
  try {
    const [header, claims] = token.split('.').slice(0, 2).map(value => JSON.parse(Buffer.from(value, 'base64url')));
    if (header.alg !== 'ES256' || !Number.isFinite(claims.exp)) throw new Error();
    if (claims.exp * 1000 <= now + 60000) throw new Error('developer-token-expired');
    return token;
  } catch (error) {
    throw new Error(error.message === 'developer-token-expired' ? error.message : 'developer-token-invalid');
  }
}

// Persist only the developer JWT; Apple login is owned by the isolated MusicKit session.
function createCredentials(store, safeStorage) {
  return {
    get() {
      const saved = store.get('appleMusic.developerToken');
      const token = process.env.FOLIA_APPLE_MUSIC_DEVELOPER_TOKEN || (saved && safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(saved, 'base64')) : '');
      if (!token) throw new Error('developer-token-required');
      return validateDeveloperToken(token);
    },
    set(token) {
      validateDeveloperToken(token);
      if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('credential-storage-unavailable');
      store.set('appleMusic.developerToken', safeStorage.encryptString(token).toString('base64'));
    },
  };
}
module.exports = { validateDeveloperToken, createCredentials };
