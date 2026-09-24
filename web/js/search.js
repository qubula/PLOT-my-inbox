// ── SEARCH MODULE ──────────────────────────────────────────────────
// Creates runtime "search clusters" in the Archive Theme from chat
// filter queries (sender / year / subject keyword).
// Session-only: resets on page refresh.

(function () {
  'use strict';

  const _searchClustersByKey = {};   // queryKey -> subId (deduplication)

  function _stableHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % 100000;
  }

  // Called by chat.js when the server returns a filter_result.
  // Returns the sub-cluster ID (creates it on first call; reuses on duplicates).
  window.createSearchCluster = function (queryKey, matchedNodes, label) {
    if (_searchClustersByKey[queryKey]) {
      return _searchClustersByKey[queryKey];
    }

    // Ensure the Archive galaxy and macro exist
    _ensureArchive();

    // Wrap each matched node as a single-node thread
    const threads = matchedNodes.map(n =>
      ({ nodes: [Object.assign({}, n, { _isSearch: true, _threadColor: null })] })
    );

    const safeKey = queryKey.replace(/[^a-z0-9]/g, '_');
    const id      = `__search_${safeKey}__`;

    // Spread search clusters around the archive macro using golden-angle spacing
    const idx    = _archiveMacro.subClusters.length;
    const angle  = idx * 2.399963;   // golden angle in radians
    const radius = 200 + idx * 50;
    const rx     = Math.cos(angle) * radius;
    const ry     = Math.sin(angle) * radius;

    const sub = {
      id,
      title:          label,
      age:            0.5,
      size:           Math.min(1, matchedNodes.length / 60),
      rx, ry,
      open:           false,
      threads,
      floating:       [],
      _emailsLoaded:  true,
      _rings:         null,
      seed:           _stableHash(queryKey),
    };

    _archiveMacro.subClusters.push(sub);

    if (typeof _subById !== 'undefined') {
      _subById[id] = { macro: _archiveMacro, sub };
    }

    _syncArchiveToGalaxies();

    _searchClustersByKey[queryKey] = id;
    return id;
  };
})();
