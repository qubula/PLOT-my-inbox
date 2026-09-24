// ── THREAD DRAG & RING INTERACTION ───────────────────────────────
// Handles balloon-cluster dragging of email threads between rings.
// Loaded after layout.js / emailNode.js, before sketch.js.

// ── Drag state ───────────────────────────────────────────────────
const _threadDrag = {
  pending:        false,
  active:         false,
  sub:            null,
  macro:          null,
  color:          null,
  nodes:          [],
  threadObjs:     [],
  startWX:        0, startWY:       0,
  curWX:          0, curWY:         0,
  pickupStartMs:  0,
  pickupT:        0,
  PICKUP_MS:      280,
  targetRingIdx:  -1,   // ring in the SOURCE cluster under cursor
  balloonOffsets: [],
  origWorldPos:   [],
  // Finder-hover state
  hoverSub:       null, // cluster currently being hovered (for auto-open)
  hoverRingIdx:   -1,   // ring in hoverSub nearest to cursor
};

// Finder-like hover-open: how long to hover before a cluster auto-opens (ms)
const DRAG_HOVER_OPEN_MS = 480;
let _dragHoverCluster  = null;
let _dragHoverStartMs  = 0;

// ── Called from sketch.js ─────────────────────────────────────────

/**
 * Call from mousePressed. Detects a colored (threaded) node under the cursor
 * and arms the pending drag. Returns true if a candidate was found.
 */
function tryStartThreadDragPending() {
  if (!MACROS) return false;
  const w         = screenToWorld(mouseX, mouseY);
  const inArchive = window._isInArchiveGalaxy?.() === true;

  for (const macro of MACROS) {
    if (!macro.open) continue;
    for (const sub of macro.subClusters) {
      if (!sub.open || !sub._rings) continue;

      for (const ring of sub._rings) {
        for (const thread of ring.threads) {
          for (const node of thread.nodes) {
            if (!node._threadColor && !inArchive) continue;
            const dx = w.x - node._wx, dy = w.y - node._wy;
            if (Math.sqrt(dx * dx + dy * dy) < _nodeRadius(node) + 4) {
              _armPending(node._threadColor, sub, macro, w, node);
              return true;
            }
          }
        }
      }

      // Floating (stray) nodes — always draggable so the user can place them on a ring
      for (const node of (sub.floating || [])) {
        if (node._wx === undefined) continue;
        const dx = w.x - node._wx, dy = w.y - node._wy;
        if (Math.sqrt(dx * dx + dy * dy) < _nodeRadius(node) + 4) {
          _armPending(null, sub, macro, w, node); // null color → floating path
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Call from mouseDragged once the move threshold has been crossed while
 * _threadDrag.pending is true. Transitions to active drag.
 */
function activateThreadDrag() {
  _threadDrag.pending      = false;
  _threadDrag.active       = true;
  _threadDrag.pickupStartMs = millis();
  _threadDrag.pickupT      = 0;
  const w = screenToWorld(mouseX, mouseY);
  _threadDrag.curWX = w.x;
  _threadDrag.curWY = w.y;
  loop(); // keep continuous redraws for balloon animation
}

/**
 * Call from mouseDragged while drag is active. Updates position and target ring.
 * Returns true so the caller can skip normal pan logic.
 */
function updateThreadDrag() {
  if (!_threadDrag.active) return false;
  const w = screenToWorld(mouseX, mouseY);
  _threadDrag.curWX   = w.x;
  _threadDrag.curWY   = w.y;
  _threadDrag.pickupT = Math.min(1, (millis() - _threadDrag.pickupStartMs) / _threadDrag.PICKUP_MS);
  _threadDrag.targetRingIdx = _nearestRingIdx(w.x, w.y);

  // Edge-pan: move the camera when cursor is near the screen boundary so
  // the user can navigate to off-screen clusters while still holding the drag
  // (same formula as the edge-scroll logic in sketch.js).
  const _ez = EDGE_SCROLL_ZONE, _es = EDGE_SCROLL_SPEED;
  _edgePanVX = 0;
  if (mouseX < _ez)              _edgePanVX =  _es * (1 - mouseX / _ez);
  if (mouseX > width  - _ez)     _edgePanVX = -_es * (1 - (width  - mouseX) / _ez);
  _edgePanVY = 0;
  if (mouseY < _ez)              _edgePanVY =  _es * (1 - mouseY / _ez);
  if (mouseY > height - _ez)     _edgePanVY = -_es * (1 - (height - mouseY) / _ez);
  _isEdgeScrolling = (_edgePanVX !== 0 || _edgePanVY !== 0);

  // Finder-like: track hovering over a different cluster → auto-open after threshold
  _updateDragHover(w.x, w.y);
  return true;
}

function _updateDragHover(wx, wy) {
  // Finder hover-open only makes sense in the Archive galaxy where
  // cross-cluster drops are allowed; skip it everywhere else.
  if (!window._isInArchiveGalaxy?.()) {
    _dragHoverCluster      = null;
    _threadDrag.hoverSub   = null;
    _threadDrag.hoverRingIdx = -1;
    return;
  }
  const sub   = _threadDrag.sub;
  const macro = _threadDrag.macro;
  if (!macro) return;

  // Find the nearest other cluster under the cursor (generous radius)
  let nearSub = null;
  for (const s of macro.subClusters) {
    if (s === sub) continue;
    const r    = getSubClusterRadius(s.size) * 2.0 + 24 / camZoom;
    const subCX = macro.rx + s.rx, subCY = macro.ry + s.ry;
    const dist = Math.sqrt((wx - subCX) ** 2 + (wy - subCY) ** 2);
    if (dist < r) { nearSub = s; break; }
  }

  if (nearSub) {
    if (_dragHoverCluster !== nearSub) {
      _dragHoverCluster = nearSub;
      _dragHoverStartMs = millis();
    } else if (!nearSub.open && millis() - _dragHoverStartMs > DRAG_HOVER_OPEN_MS) {
      // Auto-open like a Finder folder
      nearSub.open = true;
      if (typeof cacheNodePositions === 'function') {
        cacheNodePositions(nearSub, macro.rx, macro.ry);
      }
    }
  } else {
    _dragHoverCluster = null;
  }

  // Update hover ring index for the visual indicator
  _threadDrag.hoverSub = _dragHoverCluster;
  if (_dragHoverCluster && _dragHoverCluster.open && _dragHoverCluster._rings) {
    _threadDrag.hoverRingIdx = _nearestRingIdxInSub(wx, wy, _dragHoverCluster, macro);
  } else {
    _threadDrag.hoverRingIdx = -1;
  }
}

/**
 * Call from mouseReleased when drag is active.
 * Assigns the thread to the nearest ring and recomputes the layout.
 */
function completeThreadDrop() {
  if (!_threadDrag.active) return;

  const sub   = _threadDrag.sub;
  const macro = _threadDrag.macro;
  if (sub && macro) {
    const w = screenToWorld(mouseX, mouseY);

    // ── 1 & 2. Cross-cluster drops — Archive galaxy only ─────────────
    if (window._isInArchiveGalaxy?.()) {
      // 1a. Drop onto a Finder-hovered auto-opened cluster
      if (_threadDrag.hoverSub && _threadDrag.hoverSub.open) {
        const destRing = Math.max(0, _threadDrag.hoverRingIdx);
        _crossClusterDropWithRing(_threadDrag.hoverSub, destRing, sub, macro);
        _resetDrag(); noLoop(); redraw(); return;
      }
      // 1b. Manual drop onto any open neighbouring cluster
      const destSub = _nearestOtherCluster(w.x, w.y, sub, macro);
      if (destSub && destSub.open) {
        const destRing = _nearestRingIdxInSub(w.x, w.y, destSub, macro);
        _crossClusterDropWithRing(destSub, Math.max(0, destRing), sub, macro);
        _resetDrag(); noLoop(); redraw(); return;
      }
    }

    const isFloatingDrag = _threadDrag.threadObjs.some(t => t._isFloatingDrag);

    // ── 3. Drop near centre → de-group (threaded nodes only; floating nodes skip)
    if (!isFloatingDrag) {
      const subCX    = macro.rx + sub.rx, subCY = macro.ry + sub.ry;
      const dropDist = Math.sqrt((w.x - subCX) ** 2 + (w.y - subCY) ** 2);
      const floatR   = _floatZoneR((sub.floating ? sub.floating.length : 0) + _threadDrag.nodes.length);
      if (dropDist < floatR * 0.75) {
        _degroupToFloating(sub, macro, w.x, w.y);
        _resetDrag(); noLoop(); redraw(); return;
      }
    }

    // ── 4a. Floating drag → promote to ring thread (stays black/stray) ──
    if (isFloatingDrag) {
      const target = _nearestRingIdx(w.x, w.y);
      if (target >= 0) {
        for (const t of _threadDrag.threadObjs) {
          if (!t._isFloatingDrag) continue;
          // Remove from floating array
          for (const n of t.nodes) {
            const fi = (sub.floating || []).indexOf(n);
            if (fi !== -1) sub.floating.splice(fi, 1);
          }
          // Add as a 1-node thread on the target ring — null color preserved
          const newThread = { nodes: t.nodes }; // _threadColor stays null
          sub.threads.push(newThread);
          if (!sub._threadRingMap) sub._threadRingMap = new Map();
          sub._threadRingMap.set(newThread, target);
          if (!sub._numRings || sub._numRings <= target) sub._numRings = target + 1;
        }
        sub._rings = computeUserRingLayout(sub);
        _recacheRingNodePositions(sub, macro.rx, macro.ry);
      }
      _resetDrag(); noLoop(); redraw(); return;
    }

    // ── 4b. Standard same-cluster ring assignment ─────────────────────
    const target = _nearestRingIdx(w.x, w.y);
    if (target >= 0 && sub._threadRingMap) {
      for (const t of _threadDrag.threadObjs) sub._threadRingMap.set(t, target);
      sub._rings = computeUserRingLayout(sub);
      _recacheRingNodePositions(sub, macro.rx, macro.ry);
    }
  }
  _resetDrag(); noLoop(); redraw();
}

// Nearest ring in a specific sub by distance from centre.
function _nearestRingIdxInSub(wx, wy, sub, macro) {
  if (!sub || !sub._rings || !sub._rings.length) return 0;
  const cx = macro.rx + sub.rx, cy = macro.ry + sub.ry;
  const d  = Math.sqrt((wx - cx) ** 2 + (wy - cy) ** 2);
  let best = 0, bestD = Infinity;
  for (let i = 0; i < sub._rings.length; i++) {
    const diff = Math.abs(d - sub._rings[i].r);
    if (diff < bestD) { bestD = diff; best = i; }
  }
  return best;
}

// Returns a different cluster within generous hover range, or null.
function _nearestOtherCluster(wx, wy, currentSub, macro) {
  for (const sub of macro.subClusters) {
    if (sub === currentSub) continue;
    const r    = getSubClusterRadius(sub.size) + 20 / camZoom;
    const subCX = macro.rx + sub.rx, subCY = macro.ry + sub.ry;
    if (Math.sqrt((wx - subCX) ** 2 + (wy - subCY) ** 2) < r) return sub;
  }
  return null;
}

// Cross-cluster drop: move dragged threads into destSub at destRingIdx.
function _crossClusterDropWithRing(destSub, destRingIdx, sourceSub, macro) {
  for (const t of _threadDrag.threadObjs) {
    const i = sourceSub.threads.indexOf(t);
    if (i !== -1) sourceSub.threads.splice(i, 1);
    if (sourceSub._threadRingMap) sourceSub._threadRingMap.delete(t);
    destSub.threads.push(t);
    if (!destSub._threadRingMap) destSub._threadRingMap = new Map();
    destSub._threadRingMap.set(t, destRingIdx);
  }
  if ((destSub._numRings || 0) <= destRingIdx) destSub._numRings = destRingIdx + 1;
  sourceSub._rings = computeUserRingLayout(sourceSub);
  _recacheRingNodePositions(sourceSub, macro.rx, macro.ry);
  destSub._rings = computeUserRingLayout(destSub);
  _recacheRingNodePositions(destSub, macro.rx, macro.ry);
}

// Drop near centre: un-thread the dragged nodes → floating (black) nodes.
function _degroupToFloating(sub, macro, dropWX, dropWY) {
  for (const t of _threadDrag.threadObjs) {
    const i = sub.threads.indexOf(t);
    if (i !== -1) sub.threads.splice(i, 1);
    if (sub._threadRingMap) sub._threadRingMap.delete(t);
  }
  if (!sub.floating) sub.floating = [];
  for (const n of _threadDrag.nodes) {
    n._threadColor = null;
    sub.floating.push(n);
    n._wx = dropWX + (Math.random() - 0.5) * 10;
    n._wy = dropWY + (Math.random() - 0.5) * 10;
  }
  sub._rings = computeUserRingLayout(sub);
  _recacheRingNodePositions(sub, macro.rx, macro.ry);
}

/**
 * Abort drag without making any changes (e.g. on Escape or mouseExited).
 */
function cancelThreadDrag() {
  _resetDrag();
  noLoop();
  redraw();
}

/**
 * Render the balloon cluster and ring highlight.
 * Must be called inside the camera transform (after translate/scale in draw()).
 */
function drawThreadDragOverlay() {
  if (!_threadDrag.active) return;
  const sub = _threadDrag.sub, macro = _threadDrag.macro;
  if (!sub || !macro || !sub._rings) return;

  const subCX = macro.rx + sub.rx;
  const subCY = macro.ry + sub.ry;

  // ── Finder hover: glow + progress arc on cluster about to auto-open ──
  if (_dragHoverCluster && !_dragHoverCluster.open && _dragHoverCluster !== sub) {
    const progress = Math.min(1, (millis() - _dragHoverStartMs) / DRAG_HOVER_OPEN_MS);
    if (progress > 0.05) {
      const hCX = macro.rx + _dragHoverCluster.rx;
      const hCY = macro.ry + _dragHoverCluster.ry;
      const hR  = getSubClusterRadius(_dragHoverCluster.size);
      push();
      noFill();
      // Expanding glow ring
      stroke(255, 255, 255, 100 * progress);
      strokeWeight((1.5 + progress) / camZoom);
      circle(hCX, hCY, (hR * 2) * (1 + progress * 0.25));
      // Progress arc (clockwise from top)
      stroke(255, 255, 255, 200 * progress);
      strokeWeight(2 / camZoom);
      drawingContext.lineCap = 'round';
      drawingContext.beginPath();
      drawingContext.arc(hCX, hCY, hR * 1.15,
        -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      drawingContext.stroke();
      pop();
    }
  }

  // ── Highlight ring in hover-opened destination cluster ──────────
  if (_threadDrag.hoverSub && _threadDrag.hoverSub.open && _threadDrag.hoverSub._rings) {
    const hSub = _threadDrag.hoverSub;
    const hri  = _threadDrag.hoverRingIdx;
    if (hri >= 0 && hri < hSub._rings.length) {
      push();
      translate(macro.rx + hSub.rx, macro.ry + hSub.ry);
      noFill();
      const hc = color(_threadDrag.color || '#ffffff');
      hc.setAlpha(180);
      stroke(hc);
      strokeWeight(2.5 / camZoom);
      drawingContext.setLineDash([6 / camZoom, 6 / camZoom]);
      circle(0, 0, hSub._rings[hri].r * 2);
      drawingContext.setLineDash([]);
      pop();
    }
  }

  // ── Highlight target ring in the SOURCE cluster ────────────────
  const ti = _threadDrag.targetRingIdx;
  if (!_threadDrag.hoverSub && ti >= 0 && ti < sub._rings.length) {
    push();
    translate(subCX, subCY);
    noFill();
    const ringColor = color(_threadDrag.color || '#888888');
    ringColor.setAlpha(160);
    stroke(ringColor);
    strokeWeight(2.5 / camZoom);
    drawingContext.setLineDash([6 / camZoom, 6 / camZoom]);
    circle(0, 0, sub._rings[ti].r * 2);
    drawingContext.setLineDash([]);
    pop();
  }

  // ── Draw balloon nodes following the cursor ────────────────────
  // smoothstep ease 0→1 over PICKUP_MS
  const rawT = _threadDrag.pickupT;
  const ease  = rawT * rawT * (3 - 2 * rawT);
  // Brief scale-up (pop) during pickup, settles back to 1.0
  const lift  = 1 + 0.14 * Math.sin(rawT * Math.PI);

  for (let i = 0; i < _threadDrag.nodes.length; i++) {
    const node = _threadDrag.nodes[i];
    const orig = _threadDrag.origWorldPos[i];
    const bl   = _threadDrag.balloonOffsets[i];

    // Lerp from original ring position → cursor + balloon offset
    const wx = orig.x + (_threadDrag.curWX + bl.x - orig.x) * ease;
    const wy = orig.y + (_threadDrag.curWY + bl.y - orig.y) * ease;

    push();
    translate(wx, wy);
    scale(lift);
    drawEmailNode(0, 0, node.age, node.seed, false, node.attachment, node.size_kb, node._threadColor);
    pop();
  }
}

// ── Ring add / remove ────────────────────────────────────────────

function addRingToSub(sub, macro) {
  if (!sub._numRings) sub._numRings = sub._rings ? sub._rings.length : 1;
  sub._numRings++;
  sub._rings = computeUserRingLayout(sub);
  _recacheRingNodePositions(sub, macro.rx, macro.ry);
  redraw();
}

function removeRingFromSub(sub, macro) {
  if (!sub._numRings || sub._numRings <= 1) return;

  const outerIdx = sub._numRings - 1;
  // Refuse removal if the outermost ring has content
  if (sub._threadRingMap) {
    for (const [, ri] of sub._threadRingMap) {
      if (ri === outerIdx) return;
    }
  }

  sub._numRings--;
  sub._rings = computeUserRingLayout(sub);
  _recacheRingNodePositions(sub, macro.rx, macro.ry);
  redraw();
}

/**
 * Hit-test the +/− buttons stored on open sub-clusters.
 * Returns true if a button action was performed.
 */
function plusMinusHitTest(wx, wy) {
  for (const macro of MACROS) {
    if (!macro.open) continue;
    for (const sub of macro.subClusters) {
      if (!sub.open || !sub._plusBtnWorld) continue;
      const BTN_R = 14 / camZoom;

      const pb = sub._plusBtnWorld, mb = sub._minusBtnWorld;
      if (Math.sqrt((wx - pb.x) ** 2 + (wy - pb.y) ** 2) < BTN_R) {
        addRingToSub(sub, macro);
        return true;
      }
      if (Math.sqrt((wx - mb.x) ** 2 + (wy - mb.y) ** 2) < BTN_R) {
        removeRingFromSub(sub, macro);
        return true;
      }
    }
  }
  return false;
}

/**
 * Reset all user ring assignments back to the auto-computed defaults.
 * Exposed as window.resetDragState() for a restart button.
 */
function resetAllDragState() {
  if (!MACROS) return;
  for (const macro of MACROS) {
    for (const sub of macro.subClusters) {
      sub._threadRingMap = null;
      sub._numRings      = null;
      sub._rings         = null;
    }
  }
  _resetDrag();
  redraw();
}
window.resetDragState = resetAllDragState;

// ── Internal helpers ──────────────────────────────────────────────

function _armPending(color, sub, macro, w, clickedNode) {
  const nodes      = [];
  const threadObjs = [];

  if (color === null && clickedNode) {
    // Null-color (archive): grab only the specific thread that was clicked,
    // not all null-color threads (which would be every archive email).
    for (const t of (sub.threads || [])) {
      if (t.nodes.includes(clickedNode)) {
        for (const n of t.nodes) { if (!nodes.includes(n)) nodes.push(n); }
        threadObjs.push(t);
        break;
      }
    }
    // Also catch split-chunk references
    for (const ring of (sub._rings || [])) {
      for (const chunk of ring.threads) {
        if (chunk.nodes.includes(clickedNode)) {
          for (const n of chunk.nodes) { if (!nodes.includes(n)) nodes.push(n); }
        }
      }
    }
    // Floating node — not in any thread yet
    if (nodes.length === 0 && (sub.floating || []).includes(clickedNode)) {
      nodes.push(clickedNode);
      threadObjs.push({ nodes: [clickedNode], _isFloatingDrag: true });
    }
  } else {
    // Coloured thread: grab all nodes that share this colour
    for (const t of (sub.threads || [])) {
      if (t.nodes.length > 0 && t.nodes[0]._threadColor === color) {
        for (const n of t.nodes) { if (!nodes.includes(n)) nodes.push(n); }
        threadObjs.push(t);
      }
    }
    for (const ring of (sub._rings || [])) {
      for (const chunk of ring.threads) {
        if (chunk.nodes.length > 0 && chunk.nodes[0]._threadColor === color) {
          for (const n of chunk.nodes) { if (!nodes.includes(n)) nodes.push(n); }
        }
      }
    }
  }

  if (nodes.length === 0) return;

  // Balloon cluster: nodes orbit the cursor at NODE_RADIUS*2 spacing
  const clusterR   = NODE_RADIUS * 2.4;
  const balloonOffsets = nodes.map((_, i) => {
    if (nodes.length === 1) return { x: 0, y: 0 };
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a) * clusterR, y: Math.sin(a) * clusterR };
  });

  _threadDrag.pending        = true;
  _threadDrag.color          = color;
  _threadDrag.sub            = sub;
  _threadDrag.macro          = macro;
  _threadDrag.nodes          = nodes;
  _threadDrag.threadObjs     = threadObjs;
  _threadDrag.balloonOffsets = balloonOffsets;
  _threadDrag.origWorldPos   = nodes.map(n => ({ x: n._wx, y: n._wy }));
  _threadDrag.startWX        = w.x;
  _threadDrag.startWY        = w.y;
}

function _nearestRingIdx(wx, wy) {
  const sub = _threadDrag.sub, macro = _threadDrag.macro;
  if (!sub || !macro || !sub._rings || sub._rings.length === 0) return 0;

  const subCX = macro.rx + sub.rx, subCY = macro.ry + sub.ry;
  const dist  = Math.sqrt((wx - subCX) ** 2 + (wy - subCY) ** 2);

  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < sub._rings.length; i++) {
    const d = Math.abs(dist - sub._rings[i].r);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  return best;
}

function _recacheRingNodePositions(sub, macroRx, macroRy) {
  if (!sub._rings) return;
  for (const ring of sub._rings) {
    for (let ti = 0; ti < ring.threads.length; ti++) {
      for (let j = 0; j < ring.threads[ti].nodes.length; j++) {
        const n = ring.threads[ti].nodes[j];
        const a = ring.angles[ti][j];
        n._wx = macroRx + sub.rx + Math.cos(a) * ring.r;
        n._wy = macroRy + sub.ry + Math.sin(a) * ring.r;
      }
    }
  }
}

function _resetDrag() {
  _threadDrag.pending        = false;
  _threadDrag.active         = false;
  _threadDrag.sub            = null;
  _threadDrag.macro          = null;
  _threadDrag.color          = null;
  _threadDrag.nodes          = [];
  _threadDrag.threadObjs     = [];
  _threadDrag.balloonOffsets = [];
  _threadDrag.origWorldPos   = [];
  _threadDrag.targetRingIdx  = -1;
  _threadDrag.pickupT        = 0;
  _threadDrag.hoverSub       = null;
  _threadDrag.hoverRingIdx   = -1;
  _dragHoverCluster          = null;
  _dragHoverStartMs          = 0;
  // Stop any edge-pan that was running during the drag
  _edgePanVX       = 0;
  _edgePanVY       = 0;
  _isEdgeScrolling = false;
}
