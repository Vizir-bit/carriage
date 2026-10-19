// Preview harness only. A seed in the address (?seed=...) is drawn instead of
// a random one, ?motion=settle turns the one optional motion on, "Draw
// another" draws a new seed, and searches are shown rather than sent anywhere.
'use strict';

(function () {
  const identity = document.querySelector('[data-anvers-identity]');
  const params = new URLSearchParams(location.search);
  if (identity && params.get('seed')) identity.dataset.seed = params.get('seed');
  const motion = params.get('motion') === 'settle' ? 'settle' : 'none';
  if (identity) identity.dataset.motion = motion;

  const seedOut = document.getElementById('seed');
  const status = document.getElementById('status');

  function showSeed(seed) {
    seedOut.textContent = seed;
    try {
      const url = new URL(location.href);
      url.searchParams.set('seed', seed);
      history.replaceState(null, '', url);
    } catch (e) {
      // Some file: pages refuse history changes; the seed is still shown.
    }
  }

  // anvers-identity.js registered its own DOMContentLoaded listener first,
  // so the mark is drawn by the time this one runs.
  document.addEventListener('DOMContentLoaded', () => {
    // Without the identity script there is nothing to draw another with,
    // so the seed line stays unseen.
    if (window.AnversIdentity && identity && identity.dataset.anversSeed) {
      showSeed(identity.dataset.anversSeed);
      document.getElementById('reroll').addEventListener('click', () => {
        const mark = window.AnversIdentity.render(identity, {
          seed: window.AnversIdentity.newSeed(),
          wordmark: true,
          motion,
        });
        showSeed(mark.seed);
      });
      document.querySelector('.home__seed').removeAttribute('data-pending');
    }

    document.querySelector('.home__search').addEventListener('submit', event => {
      event.preventDefault();
      const query = document.getElementById('q').value.trim();
      status.textContent = query
        ? `Preview: a search for \u201C${query}\u201D would be sent by Anvers's own Home page.`
        : 'Preview: type something to search.';
    });
  }, {once: true});
})();
