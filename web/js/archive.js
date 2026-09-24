// ── ARCHIVE MODULE ────────────────────────────────────────────────
// Session-only: resets on page refresh.
// Archived emails are copies that live in a dedicated Archive Theme.

const _ARCHIVE_GALAXY_ID  = '__archive__';
const _ARCHIVE_DEFAULT_ID = '__archive_default__';

window._ARCHIVE_GALAXY_ID  = _ARCHIVE_GALAXY_ID;
window._ARCHIVE_DEFAULT_ID = _ARCHIVE_DEFAULT_ID;

// Tracks original email IDs that have been archived this session.
// Used by drawEmailNode to show the archive dot on the original.
const _archivedOriginalIds = new Set();
window._archivedOriginalIds = _archivedOriginalIds;

const _archiveGalaxy = {
  id:           _ARCHIVE_GALAXY_ID,
  title:        'Archive',
  age:          0.7,
  size:         0.3,
  data_size_kb: 0,
  macros:       [],
};

const _archiveMacro = {
  id:          '__archive_macro__',
  title:       'Archive',
  age:         0.7,
  size:        0.5,
  rx: 0, ry: 0,
  open:        false,
  _subRingR:   0,
  subClusters: [],
};

let _archiveDefaultCluster = null;
let _archiveClusterSeq     = 0;
let _lastCreatedCluster    = null; // for Cmd+Z undo

// ── Init ─────────────────────────────────────────────────────────

function _ensureArchive() {
  if (_archiveDefaultCluster) return;
  _archiveDefaultCluster = _newArchiveCluster(_ARCHIVE_DEFAULT_ID, 'All Emails', 0, 0);
  _archiveMacro.subClusters = [_archiveDefaultCluster];
  _archiveGalaxy.macros     = [_archiveMacro];
}

function _newArchiveCluster(id, title, rx, ry) {
  return {
    id, title,
    age: 0.7, size: 0.3,
    rx, ry,
    open: false,
    threads: [], floating: [],
    _emailsLoaded: true,
    _rings: null,
    seed: Math.abs(id.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 100000,
  };
}

function _syncArchiveToGalaxies() {
  const totalNodes = _archiveMacro.subClusters.reduce(
    (s, c) => s + c.threads.reduce((ts, t) => ts + t.nodes.length, 0) + c.floating.length, 0
  );

  if (totalNodes === 0) {
    if (typeof GALAXIES !== 'undefined') {
      const i = GALAXIES.findIndex(g => g.id === _ARCHIVE_GALAXY_ID);
      if (i !== -1) GALAXIES.splice(i, 1);
    }
    return;
  }

  const totalKb = _archiveMacro.subClusters.flatMap(c =>
    c.threads.flatMap(t => t.nodes.map(n => n.size_kb || 0)).concat(c.floating.map(n => n.size_kb || 0))
  ).reduce((a, b) => a + b, 0);

  _archiveGalaxy.data_size_kb = totalKb;
  _archiveGalaxy.size = Math.min(1, Math.max(0.1, totalNodes / 80));

  for (const c of _archiveMacro.subClusters) {
    const n = c.threads.reduce((s, t) => s + t.nodes.length, 0) + c.floating.length;
    c.size = Math.min(1, Math.max(0.15, n / 40));
  }

  if (typeof GALAXIES !== 'undefined') {
    const i = GALAXIES.findIndex(g => g.id === _ARCHIVE_GALAXY_ID);
    if (i === -1) GALAXIES.push(_archiveGalaxy);
  }

  assignSubClusterPositions(_archiveMacro);
}

// ── Archive a single node (copy) ──────────────────────────────────

function _archiveNode(node) {
  _ensureArchive();
  node._isArchived = true;
  _archivedOriginalIds.add(node.email_id);
  const seq  = _archiveDefaultCluster.threads.length;
  const copy = Object.assign({}, node, {
    email_id:     `${node.email_id}__arc${seq}`,
    _threadColor: null,
    _isArchive:   true,
    _origId:      node.email_id,
    _wx: undefined, _wy: undefined,
  });
  // Carry saved highlights so the archived copy shows them in expanded view
  copy._highlights = window._emailHighlightsMap?.get(node.email_id) || null;

  // 1-node thread → placed on the orbit ring (not scatter zone)
  _archiveDefaultCluster.threads.push({ nodes: [copy] });
  _archiveDefaultCluster._rings = null;
}

// ── Public API ────────────────────────────────────────────────────

// Archive every thread on a ring as a ring-assigned group in the archive.
function _archiveRing(sub, ringIdx) {
  const ring = sub._rings && sub._rings[ringIdx];
  if (!ring || ring.threads.length === 0) return;

  _ensureArchive();
  const dest = _archiveDefaultCluster;

  if (!dest._threadRingMap) dest._threadRingMap = new Map();

  // Pick the next available ring index in the archive cluster
  const destRingIdx = dest._numRings != null ? dest._numRings : 0;
  dest._numRings = destRingIdx + 1;

  // Copy each thread from the source ring into the archive on the same ring
  for (const thread of ring.threads) {
    const seq = dest.threads.length;
    for (const n of thread.nodes) { n._isArchived = true; _archivedOriginalIds.add(n.email_id); }
    const archivedThread = {
      nodes: thread.nodes.map((n, i) => Object.assign({}, n, {
        email_id:     `${n.email_id}__arc${seq}_${i}`,
        _isArchive:   true,
        _origId:      n.email_id,
        _threadColor: thread.nodes[0]._threadColor || null,
        _wx: undefined, _wy: undefined,
      })),
    };
    dest.threads.push(archivedThread);
    dest._threadRingMap.set(archivedThread, destRingIdx);
  }
  dest._rings = null; // force ring layout recompute
}

/**
 * Archive currently selected email(s), or the selected ring if no emails are selected.
 */
window.archiveSelectedEmails = function () {
  // Don't archive-from-archive
  if (typeof _activeGalaxy !== 'undefined' && _activeGalaxy?.id === _ARCHIVE_GALAXY_ID) return;

  // Ring archive takes priority when a ring is selected and no individual emails are chosen
  const hasEmailSel = (typeof _selectedEmailIds !== 'undefined' && _selectedEmailIds.size > 0)
                   || (typeof _selectedEmailId  !== 'undefined' && !!_selectedEmailId);
  const ringIdx  = typeof _selectedRingIdx  !== 'undefined' ? _selectedRingIdx  : null;
  const ringSub  = typeof _selectedRingSub  !== 'undefined' ? _selectedRingSub  : null;

  if (!hasEmailSel && ringIdx != null && ringSub) {
    _archiveRing(ringSub, ringIdx);
    _syncArchiveToGalaxies();
    if (typeof _clearRingSelection === 'function') _clearRingSelection();
    window.showClusterPanel?.();
    if (typeof _updateActionBtns === 'function') _updateActionBtns();
    if (typeof redraw === 'function') redraw();
    return;
  }

  const ids =
    (typeof _selectedEmailIds !== 'undefined' && _selectedEmailIds.size > 0)
      ? new Set(_selectedEmailIds)
      : (typeof _selectedEmailId !== 'undefined' && _selectedEmailId
          ? new Set([_selectedEmailId]) : new Set());
  if (!ids.size) return;

  const macroList = typeof MACROS !== 'undefined' ? MACROS : [];
  for (const macro of macroList) {
    for (const sub of macro.subClusters) {
      for (const n of sub.floating || []) {
        if (ids.has(n.email_id)) _archiveNode(n);
      }
      for (const t of sub.threads || []) {
        for (const n of t.nodes) {
          if (ids.has(n.email_id)) _archiveNode(n);
        }
      }
    }
  }

  _syncArchiveToGalaxies();

  if (typeof _selectedEmailIds !== 'undefined') _selectedEmailIds = new Set();
  if (typeof _selectedEmailId  !== 'undefined') _selectedEmailId = null;
  if (typeof _selectedNode     !== 'undefined') _selectedNode    = null;
  window.showClusterPanel?.();
  if (typeof _updateActionBtns === 'function') _updateActionBtns();
  if (typeof redraw === 'function') redraw();
};

/**
 * Create a new empty cluster at world coords (rx, ry) relative to the archive macro.
 * Called on double-click when in the Archive galaxy's Spaces view.
 */
window.createArchiveCluster = function (rx, ry) {
  if (typeof MACROS === 'undefined') return;
  const macro = MACROS.find(m => m.id === '__archive_macro__') || MACROS[0];
  if (!macro) return;

  _archiveClusterSeq++;
  const id      = `__arc_c${_archiveClusterSeq}__`;
  const cluster = _newArchiveCluster(id, `Cluster ${_archiveClusterSeq}`, rx, ry);

  macro.subClusters.push(cluster);
  if (typeof _subById !== 'undefined') _subById[id] = { macro, sub: cluster };
  _archiveMacro.subClusters.push(cluster);

  _lastCreatedCluster = { cluster, macro };
  _syncArchiveToGalaxies();
  if (typeof redraw === 'function') redraw();
};

/**
 * Undo the last cluster created by double-click (Cmd+Z).
 * Moves the cluster's emails back to the default Archive cluster.
 */
window.undoLastArchiveCluster = function () {
  if (!_lastCreatedCluster) return;
  const { cluster, macro } = _lastCreatedCluster;

  const defSub = macro.subClusters.find(s => s.id === _ARCHIVE_DEFAULT_ID);
  if (defSub) {
    for (const t of cluster.threads)  defSub.threads.push(t);
    for (const n of cluster.floating) defSub.floating.push(n);
    defSub._rings = null;
    if (defSub.open && typeof _recacheRingNodePositions === 'function') {
      _recacheRingNodePositions(defSub, macro.rx, macro.ry);
    }
  }

  const mi = macro.subClusters.indexOf(cluster);
  if (mi !== -1) macro.subClusters.splice(mi, 1);
  const ti = _archiveMacro.subClusters.indexOf(cluster);
  if (ti !== -1) _archiveMacro.subClusters.splice(ti, 1);
  if (typeof _subById !== 'undefined') delete _subById[cluster.id];

  _lastCreatedCluster = null;
  _syncArchiveToGalaxies();
  if (typeof redraw === 'function') redraw();
};

/** True when the user is inside the Archive galaxy. */
window._isInArchiveGalaxy = function () {
  return typeof _activeGalaxy !== 'undefined' &&
    _activeGalaxy?.id === _ARCHIVE_GALAXY_ID;
};

// ── Archive icon SVG paths (for canvas rendering in _drawGalaxyPicker) ─
let _archivePaths = null;
window._getArchiveIconPaths = function () {
  if (_archivePaths) return _archivePaths;
  _archivePaths = {
    body:      new Path2D('M0.2 0C0.0895433 0 0 0.0895431 0 0.2V51.7992C0 51.9096 0.0895431 51.9992 0.2 51.9992H43.2537C43.3642 51.9992 43.4537 51.9096 43.4537 51.7992V12.9696H30.6841C30.5737 12.9696 30.4841 12.8801 30.4841 12.7696V0H0.2Z'),
    foldBlack: new Path2D('M43.4537 12.9696H30.6841C30.5737 12.9696 30.4841 12.8801 30.4841 12.7696V0L43.4537 12.9696Z'),
    foldWhite: new Path2D('M43.4526 12.9702H31.3671C30.8785 12.9702 30.4824 12.5741 30.4824 12.0854V0L43.4526 12.9702Z'),
    indicator: new Path2D('M11.998 39.7637H31.4532V52.0004H11.998Z'),
  };
  return _archivePaths;
};
