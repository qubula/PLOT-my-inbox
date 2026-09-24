// ── First-time navigation hint ───────────────────────────────────────
// Shown once, the first time a user opens a cluster, to explain how to
// move between clusters and step back out. Lives near the Help icon.
(function () {
  'use strict';

  const hint  = document.getElementById('nav-hint');
  const close = document.getElementById('nav-hint-close');
  if (!hint || !close) return;

  let shown = false;

  close.addEventListener('click', () => {
    hint.classList.remove('nav-hint-visible');
  });

  window._maybeShowNavHint = function () {
    if (shown) return;
    shown = true;
    hint.classList.add('nav-hint-visible');
  };
})();
