// ── TRASH MODULE ──────────────────────────────────────────────────
// Deleted emails are moved here rather than permanently removed.
// Permanent deletion only happens when the user presses Delete while
// already inside the Trash theme. Session-only.

const _TRASH_GALAXY_ID  = '__trash__';
const _TRASH_DEFAULT_ID = '__trash_default__';

// Expose IDs so sketch.js can reference them
window._TRASH_GALAXY_ID  = _TRASH_GALAXY_ID;
window._TRASH_DEFAULT_ID = _TRASH_DEFAULT_ID;

const _trashGalaxy = {
  id:           _TRASH_GALAXY_ID,
  title:        'Trash',
  age:          0.9,
  size:         0.3,
  data_size_kb: 0,
  macros:       [],
};

const _trashMacro = {
  id:          '__trash_macro__',
  title:       'Trash',
  age:         0.9,
  size:        0.5,
  rx: 0, ry: 0,
  open:        false,
  _subRingR:   0,
  subClusters: [],
};

let _trashDefaultCluster = null;

function _hashStr(s) {
  return Math.abs(s.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 100000;
}

function _ensureTrash() {
  if (_trashDefaultCluster) return;
  _trashDefaultCluster = {
    id:            _TRASH_DEFAULT_ID,
    title:         'Deleted Emails',
    age:           0.9,
    size:          0.3,
    rx: 0, ry: 0,
    open:          false,
    threads:       [],
    floating:      [],
    _emailsLoaded: true,
    _rings:        null,
    seed:          _hashStr(_TRASH_DEFAULT_ID),
  };
  _trashMacro.subClusters = [_trashDefaultCluster];
  _trashGalaxy.macros     = [_trashMacro];
}

function _syncTrashToGalaxies() {
  const totalNodes = _trashMacro.subClusters.reduce(
    (s, c) => s + c.threads.reduce((a, t) => a + t.nodes.length, 0) + (c.floating?.length || 0),
    0
  );
  const idx = GALAXIES.findIndex(g => g.id === _TRASH_GALAXY_ID);
  if (totalNodes > 0) {
    _trashGalaxy.size = Math.min(1, Math.max(0.1, totalNodes / 80));
    if (idx === -1) GALAXIES.push(_trashGalaxy);
  } else {
    if (idx !== -1) GALAXIES.splice(idx, 1);
  }
  if (typeof redraw === 'function') redraw();
}

// Expose sync so _afterNodeDelete in sketch.js can call it
window._syncTrashGalaxy = _syncTrashToGalaxies;

window._isInTrashGalaxy = function () {
  return typeof _activeGalaxy !== 'undefined' && _activeGalaxy?.id === _TRASH_GALAXY_ID;
};

// Move nodes from a source sub-cluster into the Trash cluster
window.moveNodesToTrash = function (nodes, sub, macro) {
  if (!nodes || nodes.length === 0) return;
  _ensureTrash();
  for (const node of nodes) {
    const copy = Object.assign({}, node, {
      _isTrash:     true,
      _origSubId:   sub.id,
      _origMacroId: macro.id,
      _threadColor: null,
    });
    _trashDefaultCluster.threads.push({ nodes: [copy] });
  }
  _trashDefaultCluster._rings = null;
  if (typeof _subById !== 'undefined') {
    _subById[_TRASH_DEFAULT_ID] = { macro: _trashMacro, sub: _trashDefaultCluster };
  }
  _syncTrashToGalaxies();
};

// ── Bin icon SVG paths (for canvas rendering in _drawGalaxyPicker) ─
// Lazy-initialised as Path2D objects on first draw call.
let _binPaths = null;
window._getTrashBinPaths = function () {
  if (_binPaths) return _binPaths;
  _binPaths = [
    new Path2D('M46.3119 0.301642L41.1184 52H5.19354L0 0.301642L2.99292 0L7.91419 48.9914H38.3977L43.319 0L46.3119 0.301642Z'),
    new Path2D('M23.1565 39.8048C23.1565 43.4152 20.2297 46.342 16.6192 46.342C13.0088 46.342 10.082 43.4152 10.082 39.8048C10.082 36.1944 13.0088 33.2676 16.6192 33.2676C20.2297 33.2676 23.1565 36.1944 23.1565 39.8048Z'),
    new Path2D('M37.3791 27.7345C37.3791 31.3449 34.4523 34.2717 30.8419 34.2717C27.2315 34.2717 24.3047 31.3449 24.3047 27.7345C24.3047 24.1241 27.2315 21.1973 30.8419 21.1973C34.4523 21.1973 37.3791 24.1241 37.3791 27.7345Z'),
    new Path2D('M23.1565 22.8888C23.1565 26.4992 20.2297 29.426 16.6192 29.426C13.0088 29.426 10.082 26.4992 10.082 22.8888C10.082 19.2784 13.0088 16.3516 16.6192 16.3516C20.2297 16.3516 23.1565 19.2784 23.1565 22.8888Z'),
    new Path2D('M35.6135 11.0509C35.6135 14.6613 32.6867 17.5881 29.0763 17.5881C25.4659 17.5881 22.5391 14.6613 22.5391 11.0509C22.5391 7.44048 25.4659 4.51367 29.0763 4.51367C32.6867 4.51367 35.6135 7.44048 35.6135 11.0509Z'),
  ];
  return _binPaths;
};
