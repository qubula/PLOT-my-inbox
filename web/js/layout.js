// ── ASSIGN GALAXY POSITIONS (top-level, phyllotaxis spiral) ──────
// 4-8 galaxies arranged so they never overlap their clouds.
// Must be called before assignMacroPositions so galaxies have rx/ry.
function assignGalaxyPositions(galaxies) {
  let n = galaxies.length;
  if (n === 0) return;
  if (n === 1) { galaxies[0].rx = 0; galaxies[0].ry = 0; return; }

  if (n <= 8) {
    // Tight ring — galaxies fill the screen without wasting space
    let ring = (GALAXY_RADIUS * 2 + 120) / (2 * sin(PI / n));
    ring     = max(ring, GALAXY_RADIUS * 1.8);
    for (let i = 0; i < n; i++) {
      let a       = -HALF_PI + i * TWO_PI / n;
      galaxies[i].rx = cos(a) * ring;
      galaxies[i].ry = sin(a) * ring;
    }
  } else {
    // Phyllotaxis for larger counts
    const goldenAngle = 2.39996323;
    const spacing     = GALAXY_RADIUS * 2.2 + 60;
    for (let i = 0; i < n; i++) {
      let a        = i * goldenAngle;
      let r        = spacing * sqrt(i + 1);
      galaxies[i].rx = cos(a) * r;
      galaxies[i].ry = sin(a) * r;
    }
  }
}

// ── ASSIGN MACRO POSITIONS WITHIN A GALAXY — flower ring ──────────
// All Spaces on one ring, equally spaced, edges ~gap px apart.
// Camera auto-fits the full constellation on entry via _fitMacrosInView.
function assignMacroPositionsInGalaxy(galaxy) {
  let sorted = [...galaxy.macros].sort((a, b) => b.size - a.size);
  let n      = sorted.length;
  if (n === 0) return;

  for (let m of sorted) assignSubClusterPositions(m);

  if (n === 1) { sorted[0].rx = 0; sorted[0].ry = 0; return; }

  const gap   = 18; // world-px gap between adjacent macro circle edges
  const sinPN = sin(PI / n);
  const ringR = (MACRO_RADIUS + gap / 2) / sinPN;

  for (let i = 0; i < n; i++) {
    const a      = -HALF_PI + i * TWO_PI / n; // start from top
    sorted[i].rx = cos(a) * ringR;
    sorted[i].ry = sin(a) * ringR;
  }
}

// ── MULTI-RING ORBIT LAYOUT ───────────────────────────────────────
// Decides how many orbit rings to use based on whether the nodes' angular
// footprints physically fit on the ring — not a raw node count.
// Keeps whole threads together on the same ring (greedy bin-packing).
function computeMultiRingLayout(threads) {
  if (!threads || threads.length === 0) return [];

  // Pixel gaps — the single source of truth used by both ringFootprint and computeThreadLayout.
  const INTRA_PX = 10;  // edge-to-edge gap between nodes in the same thread
  const INTER_PX = 30;  // edge-to-edge gap between the last node of one thread and the first of the next

  // Angular footprint of a thread list on a ring of radius r using the pixel gaps above.
  function ringFootprint(tList, r) {
    let arc = 0;
    for (let i = 0; i < tList.length; i++) {
      const t = tList[i];
      if (t.nodes.length === 0) continue;
      arc += _nodeRadius(t.nodes[0]) / r;                              // left half of first node
      for (let j = 0; j < t.nodes.length - 1; j++) {
        arc += (_nodeRadius(t.nodes[j]) + INTRA_PX + _nodeRadius(t.nodes[j + 1])) / r;
      }
      arc += _nodeRadius(t.nodes[t.nodes.length - 1]) / r;            // right half of last node
      if (i < tList.length - 1) arc += INTER_PX / r;                  // gap to next thread
    }
    return arc;
  }

  // 75% fill limit — leaves enough headroom that the proportional layout
  // never needs to compress nodes below their physical minimum gap.
  const FILL_LIMIT = TWO_PI * 0.75;

  // Split a thread whose nodes wrap more than one ring into chunks that each
  // fit within FILL_LIMIT on the innermost ring (most restrictive).
  function splitThread(t) {
    if (ringFootprint([t], NODE_ORBIT_RADIUS) <= FILL_LIMIT) return [t];
    const chunks = [];
    let chunk = [];
    for (const node of t.nodes) {
      if (ringFootprint([{ nodes: [...chunk, node] }], NODE_ORBIT_RADIUS) <= FILL_LIMIT) {
        chunk.push(node);
      } else {
        if (chunk.length > 0) chunks.push({ nodes: chunk });
        chunk = [node];
      }
    }
    if (chunk.length > 0) chunks.push({ nodes: chunk });
    return chunks.length > 0 ? chunks : [t];
  }

  // Pre-process: expand any thread too large to fit on one ring into chunks
  const expanded = [];
  for (const t of threads) expanded.push(...splitThread(t));

  // Greedily pack threads/chunks onto a ring without exceeding FILL_LIMIT.
  function packRing(threadList, r) {
    let onRing = [], overflow = [];
    for (let t of threadList) {
      if (ringFootprint([...onRing, t], r) <= FILL_LIMIT) {
        onRing.push(t);
      } else {
        overflow.push(t);
      }
    }
    if (onRing.length === 0 && threadList.length > 0) {
      onRing.push(threadList[0]);   // always place at least one thread
      overflow = threadList.slice(1);
    }
    return { onRing, overflow };
  }

  // Does everything fit on the inner ring after splitting?
  if (ringFootprint(expanded, NODE_ORBIT_RADIUS) <= FILL_LIMIT) {
    return [{ r: NODE_ORBIT_RADIUS, threads: expanded, angles: computeThreadLayout(expanded, NODE_ORBIT_RADIUS) }];
  }

  // Sort largest chunks first so dense groups get placed on the widest ring
  const sorted = [...expanded].sort((a, b) => b.nodes.length - a.nodes.length);

  const r1 = packRing(sorted, NODE_ORBIT_RADIUS);
  const result = [{ r: NODE_ORBIT_RADIUS, threads: r1.onRing, angles: computeThreadLayout(r1.onRing, NODE_ORBIT_RADIUS) }];

  if (r1.overflow.length > 0) {
    const r2 = packRing(r1.overflow, NODE_ORBIT_RADIUS_2);
    result.push({ r: NODE_ORBIT_RADIUS_2, threads: r2.onRing, angles: computeThreadLayout(r2.onRing, NODE_ORBIT_RADIUS_2) });

    if (r2.overflow.length > 0) {
      // Third ring for extremely dense sub-clusters
      result.push({ r: NODE_ORBIT_RADIUS_3, threads: r2.overflow, angles: computeThreadLayout(r2.overflow, NODE_ORBIT_RADIUS_3) });
    }
  }

  return result;
}

// ── FLOAT ZONE RADIUS ─────────────────────────────────────────────
// Returns the outer radius of the inner scatter disk for floating (un-threaded)
// email nodes. Grows with node count so nodes have enough area to spread out
// without overlapping each other or the first orbit ring.
//
// Formula: area of disk ≥ n × (per-node area × safety factor)
//   π R² ≥ n × π (NODE_RADIUS + gap)² × 2.0
//   R ≥ (NODE_RADIUS + gap) × √(2n)
// With gap = 8 → per-node footprint radius ≈ 15px.
function _floatZoneR(nFloating) {
  if (!nFloating || nFloating <= 0) return NODE_FLOAT_MAX;
  const footprint = NODE_RADIUS + 8;          // effective radius per node
  const r = footprint * Math.sqrt(2 * nFloating);
  return Math.max(NODE_FLOAT_MAX, r);
}

// ── MODULE-LEVEL RING FOOTPRINT ───────────────────────────────────
// Same logic as the inner ringFootprint in computeMultiRingLayout, exposed
// so computeUserRingLayout (and drag.js) can call it without nesting.
const _RING_INTRA_PX = 10;
const _RING_INTER_PX = 30;

function _ringFootprintOf(tList, r) {
  let arc = 0;
  for (let i = 0; i < tList.length; i++) {
    const t = tList[i];
    if (!t.nodes || t.nodes.length === 0) continue;
    arc += _nodeRadius(t.nodes[0]) / r;
    for (let j = 0; j < t.nodes.length - 1; j++) {
      arc += (_nodeRadius(t.nodes[j]) + _RING_INTRA_PX + _nodeRadius(t.nodes[j + 1])) / r;
    }
    arc += _nodeRadius(t.nodes[t.nodes.length - 1]) / r;
    if (i < tList.length - 1) arc += _RING_INTER_PX / r;
  }
  return arc;
}

// ── USER-CONTROLLED RING LAYOUT ───────────────────────────────────
// Uses sub._threadRingMap (thread → ringIndex) and sub._numRings to group
// the original sub.threads entries onto user-assigned rings.
// Ring radii grow automatically so each ring's content fits at ≤75% fill.
// Initialises _threadRingMap / _numRings from computeMultiRingLayout on
// the first call (when those properties don't exist yet).
function computeUserRingLayout(sub) {
  if (!sub.threads || sub.threads.length === 0) return [];

  const FILL_LIMIT = Math.PI * 2 * 0.75;
  // Innermost ring must clear the float zone so floating nodes never overlap it
  const floatZone  = _floatZoneR(sub.floating ? sub.floating.length : 0);
  const MIN_R      = Math.max(NODE_ORBIT_RADIUS, floatZone + NODE_RADIUS + 10);
  const MIN_GAP    = 28;                  // minimum px gap between consecutive ring radii

  // ── First-time initialisation: derive assignments from standard layout ──
  if (!sub._threadRingMap) {
    const standard = computeMultiRingLayout(sub.threads);
    sub._threadRingMap = new Map();

    for (let ri = 0; ri < standard.length; ri++) {
      for (const chunk of standard[ri].threads) {
        if (!chunk.nodes || chunk.nodes.length === 0) continue;
        // Find which original thread owns this chunk's first node
        const orig = sub.threads.find(t => t.nodes.includes(chunk.nodes[0]));
        if (orig && !sub._threadRingMap.has(orig)) {
          sub._threadRingMap.set(orig, ri);
        }
      }
    }
    // Any thread not yet mapped → innermost ring
    for (const t of sub.threads) {
      if (!sub._threadRingMap.has(t)) sub._threadRingMap.set(t, 0);
    }

    // Compact: when a large thread was split across rings by computeMultiRingLayout,
    // only one ring ends up owning the original thread while the other rings are
    // phantom-empty. Remap all ring indices to be consecutive so no ring group
    // starts out empty. This does NOT affect user-added rings (those are added after
    // init via the + button and are intentionally empty targets).
    const usedRings = [...new Set(sub._threadRingMap.values())].sort((a, b) => a - b);
    if (usedRings.length < standard.length) {
      const indexMap = new Map(usedRings.map((oldRi, newRi) => [oldRi, newRi]));
      for (const [t, ri] of sub._threadRingMap.entries()) {
        sub._threadRingMap.set(t, indexMap.get(ri) ?? 0);
      }
      sub._numRings = Math.max(1, usedRings.length);
    } else {
      sub._numRings = Math.max(1, standard.length);
    }
  }

  const numRings = sub._numRings || 1;

  // ── Group original threads by ring index ──
  const ringGroups = Array.from({ length: numRings }, () => []);
  for (const t of sub.threads) {
    let ri = sub._threadRingMap.get(t) ?? 0;
    ri = Math.max(0, Math.min(numRings - 1, ri));
    ringGroups[ri].push(t);
  }

  // ── Compute each ring's radius so its content fits ──
  const result = [];
  let prevR = 0;

  for (let i = 0; i < numRings; i++) {
    const threads = ringGroups[i];
    let r = Math.max(MIN_R + i * MIN_GAP, prevR + MIN_GAP);

    if (threads.length > 0) {
      // Grow radius until threads fit within FILL_LIMIT (cap at 400 to avoid runaway)
      while (_ringFootprintOf(threads, r) > FILL_LIMIT && r < 400) r += 4;
    }

    result.push({
      r,
      threads,
      angles: threads.length > 0 ? computeThreadLayout(threads, r) : [],
    });
    prevR = r;
  }

  return result;
}

// ── ASSIGN SUB-CLUSTER POSITIONS ON A SINGLE RING ────────────────
// All sub-clusters fit on one ring whose radius auto-scales to the count.
// Stores macro._subRingR for use by assignMacroPositions.
function assignSubClusterPositions(macro) {
  let n = macro.subClusters.length;
  if (n === 0) { macro._subRingR = FIRST_RING_R; return; }

  // Use closed sub-cluster size (not fully-open footprint) so sub-clusters
  // orbit close to the macro. Only one sub-cluster opens at a time, so the
  // large open-footprint spacing is unnecessary and makes world coords huge.
  const footprint = CLUSTER_R_MAX * 2 + 16;   // ~96px — closed dot diameter + gap
  let minR = (n * footprint) / TWO_PI;
  let r = max(FIRST_RING_R, minR);
  macro._subRingR = r;

  let sorted   = [...macro.subClusters].sort((a, b) => b.size - a.size);
  let evenGap  = TWO_PI / n;

  for (let i = 0; i < n; i++) {
    let angle      = -HALF_PI + i * evenGap;
    sorted[i].rx   = cos(angle) * r;
    sorted[i].ry   = sin(angle) * r;
  }
}

// ── ASSIGN MACRO POSITIONS — phyllotaxis spiral ───────────────────
// Sunflower / golden-angle spiral: scales to any macro count,
// packs naturally without overlap, looks like a constellation field.
// For ≤12 macros the classic ring is used instead (better for small sets).
function assignMacroPositions(macros) {
  let sorted = [...macros].sort((a, b) => b.size - a.size);
  let n = sorted.length;

  if (n === 0) return;
  if (n === 1) { sorted[0].rx = 0; sorted[0].ry = 0; return; }

  // Footprint each macro needs when its sub-clusters are expanded
  let maxFootprint = 0;
  for (let m of macros) {
    let subR = m._subRingR || FIRST_RING_R;
    let fp   = subR + OPEN_FOOTPRINT + SUBCLUSTER_BASE_R;
    if (fp > maxFootprint) maxFootprint = fp;
  }

  if (n <= 12) {
    // Classic ring for small sets
    let padding    = 80;
    let minRingExp = (maxFootprint * 2 + padding) / (2 * sin(PI / n));
    let minRingBase = (MACRO_RADIUS * 1.5) / sin(PI / n);
    let ring       = max(minRingExp, minRingBase);
    for (let i = 0; i < n; i++) {
      let angle    = -HALF_PI + i * TWO_PI / n;
      sorted[i].rx = cos(angle) * ring;
      sorted[i].ry = sin(angle) * ring;
    }
  } else {
    // Phyllotaxis spiral — golden angle ≈ 137.508°
    // Spacing based on collapsed macro size only (not expanded footprint) so the
    // field stays navigable. Expanded sub-clusters are explored one at a time.
    const goldenAngle  = 2.39996323;
    const spiralSpacing = MACRO_RADIUS * 3.5 + 40;  // ~355px between macro centres
    for (let i = 0; i < n; i++) {
      let angle    = i * goldenAngle;
      let r        = spiralSpacing * sqrt(i + 1);
      sorted[i].rx = cos(angle) * r;
      sorted[i].ry = sin(angle) * r;
    }
  }
}

function getSubClusterRadius(size) {
  // Range controlled by CLUSTER_R_MIN / CLUSTER_R_MAX in data.js
  return map(size, 0, 1, CLUSTER_R_MIN, CLUSTER_R_MAX);
}

// ── NODE RADIUS HELPER ────────────────────────────────────────────
// Returns the actual rendered radius of an email node based on its size_kb.
// Must match the formula in emailNode.js exactly.
function _nodeRadius(node) {
  const kb = node && node.size_kb ? node.size_kb : null;
  if (!kb) return NODE_RADIUS;
  // Uses EMAIL_* constants from data.js — same formula as emailNode.js
  const t     = Math.min(1, Math.max(0, (kb - EMAIL_KB_MIN) / (EMAIL_KB_MAX - EMAIL_KB_MIN)));
  const scale = EMAIL_SIZE_SCALE_MIN + t * (EMAIL_SIZE_SCALE_MAX - EMAIL_SIZE_SCALE_MIN);
  return NODE_RADIUS * Math.min(EMAIL_SIZE_SCALE_MAX * 1.1, Math.max(EMAIL_SIZE_SCALE_MIN * 0.9, scale));
}

// ── THREAD-AWARE ORBIT LAYOUT ─────────────────────────────────────
// Places nodes with fixed pixel gaps:
//   INTRA_PX (10 px) edge-to-edge between nodes in the same thread
//   INTER_PX (30 px) edge-to-edge between the last node of one thread
//               and the first node of the next
// Node size is fully accounted for so the gaps are always in screen pixels
// regardless of email size. The whole arrangement is centred at 12 o'clock.
//
// ringR: orbit radius for this ring (default NODE_ORBIT_RADIUS).
function computeThreadLayout(threads, ringR) {
  if (!threads || threads.length === 0) return [];
  ringR = ringR || NODE_ORBIT_RADIUS;

  // These must match the constants defined in computeMultiRingLayout above.
  const INTRA_PX = 10;
  const INTER_PX = 30;

  // Angular span of one thread (left edge of first node → right edge of last)
  function threadSpan(t) {
    if (t.nodes.length === 0) return 0;
    const rFirst = _nodeRadius(t.nodes[0]);
    const rLast  = _nodeRadius(t.nodes[t.nodes.length - 1]);
    if (t.nodes.length === 1) return 2 * rFirst / ringR;
    let span = rFirst / ringR;
    for (let j = 0; j < t.nodes.length - 1; j++) {
      span += (_nodeRadius(t.nodes[j]) + INTRA_PX + _nodeRadius(t.nodes[j + 1])) / ringR;
    }
    span += rLast / ringR;
    return span;
  }

  const n      = threads.length;
  const spans  = threads.map(threadSpan);
  const interTotal = n > 1 ? (n - 1) * INTER_PX / ringR : 0;
  const totalSpan  = spans.reduce((a, b) => a + b, 0) + interTotal;

  // Centre the whole group at 12 o'clock (-HALF_PI)
  let cursor = -HALF_PI - totalSpan / 2;
  const angles = [];

  for (let i = 0; i < n; i++) {
    const t  = threads[i];
    const k  = t.nodes.length;
    const ta = [];

    for (let j = 0; j < k; j++) {
      const rj = _nodeRadius(t.nodes[j]);
      // Advance cursor to the left edge of this node, then place centre
      if (j > 0) cursor += INTRA_PX / ringR;   // gap from previous node's right edge
      cursor += rj / ringR;                      // move to node centre
      ta.push(cursor);
      cursor += rj / ringR;                      // move to node's right edge
    }

    angles.push(ta);
    if (i < n - 1) cursor += INTER_PX / ringR;  // gap before next thread
  }
  return angles;
}
