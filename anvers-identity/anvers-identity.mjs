// ES module entry. In a browser or a worker the classic script runs as a
// module and sets globalThis.AnversIdentity; in Node it is CommonJS and
// arrives as the namespace's default export. Either way the same object is
// exported.
import * as loaded from './anvers-identity.js';

const AnversIdentity = loaded.default || globalThis.AnversIdentity;
if (!AnversIdentity || typeof AnversIdentity.describe !== 'function') {
  throw new Error('anvers-identity.mjs: anvers-identity.js did not provide AnversIdentity');
}

export default AnversIdentity;
export const {describe, svg, render, mountAll, newSeed, resolveSeed} = AnversIdentity;
