// Full palette — all 7 accent colours used across the app.
// Single-node threads and floating nodes stay black (null).
const THREAD_COLORS = ['#3797B8', '#E6D539', '#CD3D5C', '#FF9FD4', '#E8A26B', '#FF4A00', '#62E599'];

// Curated colour combinations grouped by size.
// cacheNodePositions picks the combo whose size matches the number of
// multi-node threads in the sub-cluster, then selects one combo by sub-cluster ID.
const THREAD_COMBOS = {
  2: [
    ['#CD3D5C', '#62E599'],
    ['#FF4A00', '#3797B8'],
    ['#3797B8', '#E8A26B'],
    ['#E6D539', '#FF9FD4'],
  ],
  3: [
    ['#E6D539', '#3797B8', '#FF9FD4'],
    ['#FF9FD4', '#CD3D5C', '#62E599'],
    ['#3797B8', '#62E599', '#E8A26B'],
    ['#FF4A00', '#E8A26B', '#3797B8'],
  ],
  4: [
    ['#E6D539', '#3797B8', '#FF9FD4', '#E8A26B'],
    ['#FF9FD4', '#CD3D5C', '#62E599', '#3797B8'],
    ['#3797B8', '#62E599', '#FF4A00', '#E8A26B'],
    ['#FF4A00', '#E6D539', '#CD3D5C', '#3797B8'],
  ],
};

const NODE_RADIUS = 7;
const SUBCLUSTER_MIN_R = NODE_RADIUS * 2;
const SUBCLUSTER_BASE_R = 30;
const MACRO_RADIUS = 90;
const GALAXY_RADIUS = 320;  // ambient cloud radius; macros orbit inside

const NODE_ORBIT_RADIUS   = 46;
const NODE_ORBIT_RADIUS_2 = 80;   // second ring when inner is full
const NODE_ORBIT_RADIUS_3 = 120;  // third ring when second is also full
const ORBIT_RING_CAPACITY = 11;   // max threaded nodes per ring
const NODE_FLOAT_MIN = 21;
const NODE_FLOAT_MAX = 35;
const NODE_PADDING = 12;
const INNER_GAP = (NODE_RADIUS * 2 + NODE_PADDING) / NODE_ORBIT_RADIUS;
const OUTER_GAP = INNER_GAP * 4;

const OPEN_FOOTPRINT = NODE_ORBIT_RADIUS + NODE_RADIUS + 10;
const FIRST_RING_R = 130;
const RING_SPACING = OPEN_FOOTPRINT * 2 + 20;
const MACRO_RING_R = 350;

// ═══════════════════════════════════════════════════════════════════
// SIZE VISUALISATION — tune these to explore how data weight appears
// Reload the browser after changing any value.
// ═══════════════════════════════════════════════════════════════════

// ── EMAIL NODE size scaling ────────────────────────────────────────
// Maps simulated file size (KB) → node radius multiplier.
// A node is drawn at  NODE_RADIUS × scale  pixels.
//
//   EMAIL_SIZE_SCALE_MIN  — multiplier for the lightest emails (EMAIL_KB_MIN)
//   EMAIL_SIZE_SCALE_MAX  — multiplier for the heaviest emails (EMAIL_KB_MAX)
//
// Try:  uniform look   → MIN 1.0  MAX 1.0
//       subtle range   → MIN 0.8  MAX 1.3
//       dramatic range → MIN 0.5  MAX 2.2
const EMAIL_KB_MIN = 50;    // KB value mapped to EMAIL_SIZE_SCALE_MIN
const EMAIL_KB_MAX = 900;   // KB value mapped to EMAIL_SIZE_SCALE_MAX
const EMAIL_SIZE_SCALE_MIN = 0.5;   // node scale for lightest emails
const EMAIL_SIZE_SCALE_MAX = 1.7;   // node scale for heaviest emails

// ── CLUSTER (sub-cluster) dot radius ──────────────────────────────
// The dot you see before opening a cluster.  size=0 → CLUSTER_R_MIN,
// size=1 → CLUSTER_R_MAX.  Both are pixel radii.
//
// Try:  all same size → MIN 20  MAX 20
//       subtle        → MIN 14  MAX 28
//       dramatic      → MIN  6  MAX 45
const CLUSTER_R_MIN = 3;    // radius of the smallest/lightest cluster dot
const CLUSTER_R_MAX = 60;   // radius of the largest/heaviest cluster dot

// ── SPACE (macro-cluster) blob radius ─────────────────────────────
// MACRO_RADIUS is the absolute maximum (set above, currently 90 px).
// MACRO_SIZE_MIN_RATIO controls how small the lightest space appears
// as a fraction of MACRO_RADIUS.
//
// Try:  all same size → RATIO 1.0
//       subtle        → RATIO 0.7
//       dramatic      → RATIO 0.1
const MACRO_SIZE_MIN_RATIO = 0.1;   // lightest space = MACRO_RADIUS × this
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
function drawEmailNode(x, y, age, seed, isSelected = false, attachment = null, sizeKb = null, threadColor = null, isArchived = false) {
  // Scale node radius by data weight — adjust EMAIL_* constants in data.js
  const sizeScale = sizeKb
      ? constrain(map(sizeKb, EMAIL_KB_MIN, EMAIL_KB_MAX, EMAIL_SIZE_SCALE_MIN, EMAIL_SIZE_SCALE_MAX),
                  EMAIL_SIZE_SCALE_MIN * 0.9, EMAIL_SIZE_SCALE_MAX * 1.1)
      : 1.0;
  // Selection shown via size increase (30%), not colour change
  const selScale = isSelected ? 1.3 : 1.0;
  const R = NODE_RADIUS * sizeScale * selScale;

  let MARGIN      = 0.8;
  let NUM_POINTS  = floor(map(age, 0, 1, 5, 11));
  let BLOB_RATIO  = map(age, 0, 1, 0.22, 0.92);
  let OUTER_ALPHA = map(age, 0, 1, 32, 175);

  const ATT_ANGLE = PI / 4;
  const ATT_DOT   = Math.max(1.8, R * 0.32);

  push();
  translate(x, y);

  const blobColor = threadColor || '#000000';

  if (age >= 0.95) {
    noStroke();
    fill(blobColor);
    circle(0, 0, R * 2);
    if (attachment) {
      fill('#0022ff');
      noStroke();
      circle(cos(ATT_ANGLE) * R, sin(ATT_ANGLE) * R, ATT_DOT * 2);
    }
    if (isArchived) { fill(threadColor ? 0 : 255); noStroke(); circle(0, 0, R * 0.24); }
    pop();
    return;
  }

  let base = R * BLOB_RATIO;
  let maxR = R - MARGIN;
  let pts  = [];

  randomSeed(seed);
  for (let i = 0; i < NUM_POINTS; i++) {
    let a = i * TWO_PI / NUM_POINTS - HALF_PI;
    let r = min(base * random(0.92, 1.08), maxR);
    pts.push([cos(a) * r, sin(a) * r]);
  }

  drawingContext.setLineDash([1, 1]);
  fill(215, 215, 215, OUTER_ALPHA);
  stroke(160);
  strokeWeight(0.25);
  circle(0, 0, R * 2);
  drawingContext.setLineDash([]);

  fill(blobColor);
  noStroke();
  // curveTightness < 1 keeps rounding without overshoot; ghost points close the
  // loop smoothly. endShape (no CLOSE) avoids a straight line back to the ghost.
  const n = pts.length;
  curveTightness(0.4);
  beginShape();
  curveVertex(pts[n - 1][0], pts[n - 1][1]);
  for (const pt of pts) curveVertex(pt[0], pt[1]);
  curveVertex(pts[0][0], pts[0][1]);
  curveVertex(pts[1][0], pts[1][1]);
  endShape();
  curveTightness(0);

  // Attachment indicator: small blue circle on the circumference at 45°
  if (attachment) {
    fill('#0022ff');
    noStroke();
    circle(cos(ATT_ANGLE) * R, sin(ATT_ANGLE) * R, ATT_DOT * 2);
  }

  if (isArchived) { fill(threadColor ? 0 : 255); noStroke(); circle(0, 0, R * 0.24); }

  pop();
}
const OPEN_ANIM_MS = 320; // total click-open animation duration (ms): rings first half, emails second

// Returns the rendered radius of an email node given its size_kb.
// Must stay in sync with emailNode.js and layout.js _nodeRadius().
function _scaledNodeR(sizeKb) {
  if (!sizeKb) return NODE_RADIUS;
  // Uses EMAIL_* constants from data.js — stays in sync with emailNode.js
  const t     = Math.min(1, Math.max(0, (sizeKb - EMAIL_KB_MIN) / (EMAIL_KB_MAX - EMAIL_KB_MIN)));
  const scale = EMAIL_SIZE_SCALE_MIN + t * (EMAIL_SIZE_SCALE_MAX - EMAIL_SIZE_SCALE_MIN);
  return NODE_RADIUS * scale;
}

// Flat cluster design: solid #BEBEBE circle (shrinks with age) +
// proportionally-dashed ring with hard (butt) caps at outerRadius.
function drawSubCluster(x, y, outerRadius, age) {
  // Solid fill shrinks as cluster ages: old → tiny dot, recent → fills ring
  const solidR = map(age, 0, 1, outerRadius * 0.10, outerRadius * 0.85);

  push();
  translate(x, y);

  // Solid grey circle #BEBEBE
  noStroke();
  fill(175, 175, 175); // #AFAFAF
  circle(0, 0, solidR * 2);

  // Dashed ring — proportional dash/gap, hard caps
  const dashLen = outerRadius * 0.18;
  const gapLen  = outerRadius * 0.08;
  const prevCap = drawingContext.lineCap;

  drawingContext.setLineDash([dashLen, gapLen]);
  drawingContext.lineCap     = 'butt';
  drawingContext.strokeStyle = 'rgb(175,175,175)'; // #AFAFAF
  drawingContext.lineWidth   = 0.5;
  drawingContext.beginPath();
  drawingContext.arc(0, 0, outerRadius, 0, Math.PI * 2);
  drawingContext.stroke();

  drawingContext.setLineDash([]);
  drawingContext.lineCap = prevCap;

  pop();
}

function drawSubClusterSystem(sub) {
  let r = getSubClusterRadius(sub.size);

  // Draw cluster blob first so email nodes render on top
  drawSubCluster(sub.rx, sub.ry, r, sub.age);

  if (sub.open) {
    push();
    translate(sub.rx, sub.ry);

    // Use user-controlled ring layout (initialises _threadRingMap on first call)
    if (!sub._rings) sub._rings = computeUserRingLayout(sub);
    let rings  = sub._rings;
    let outerR = rings.length > 0 ? rings[rings.length - 1].r : NODE_ORBIT_RADIUS;

    // ── Click-open animation: rings fade in first half, emails second half ──
    const animT = (sub._openAnimStart != null)
      ? Math.min(1, (millis() - sub._openAnimStart) / OPEN_ANIM_MS)
      : 1;
    const _easeQ = t => t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    const ringAlpha  = animT < 1 ? _easeQ(Math.min(1, animT * 2))     : 1;
    const emailAlpha = animT < 1 ? _easeQ(Math.max(0, animT * 2 - 1)) : 1;

    // ── Orbit ring circles ──────────────────────────────────────
    drawingContext.globalAlpha = ringAlpha;
    noFill();
    if (rings.length > 0) {
      for (let ri = 0; ri < rings.length; ri++) {
        const isRingSel = (typeof _selectedRingIdx !== 'undefined')
          && _selectedRingIdx === ri && _selectedRingSub === sub;
        stroke(isRingSel ? 80 : 200);
        strokeWeight(isRingSel ? 1.2 / camZoom : 0.25);
        circle(0, 0, rings[ri].r * 2);
      }
    } else {
      stroke(200); strokeWeight(0.25);
      circle(0, 0, NODE_ORBIT_RADIUS * 2);
    }
    drawingContext.globalAlpha = 1;

    // ── Target ring highlight during drag (skip while animating) ─
    if (animT >= 1 && _threadDrag.active && _threadDrag.sub === sub) {
      const ti = _threadDrag.targetRingIdx;
      if (ti >= 0 && ti < rings.length) {
        push();
        noFill();
        const hc = color(_threadDrag.color || '#888888');
        hc.setAlpha(140);
        stroke(hc);
        strokeWeight(2 / camZoom);
        drawingContext.setLineDash([5 / camZoom, 5 / camZoom]);
        circle(0, 0, rings[ti].r * 2);
        drawingContext.setLineDash([]);
        pop();
      }
    }

    // ── + / − ring control buttons ───────────────────────────────
    const BTN_R  = 9 / camZoom;
    const BTN_X  = outerR + 38 / camZoom;
    const BTN_YP = -BTN_R * 2.4;
    const BTN_YM =  BTN_R * 2.4;
    const canRemove = sub._numRings > 1;

    // Store world positions for hit-testing (macro world offset passed in via _macroWorld)
    const mwo = sub._macroWorld || { x: 0, y: 0 };
    sub._plusBtnWorld  = { x: mwo.x + sub.rx + BTN_X, y: mwo.y + sub.ry + BTN_YP };
    sub._minusBtnWorld = { x: mwo.x + sub.rx + BTN_X, y: mwo.y + sub.ry + BTN_YM };

    drawingContext.globalAlpha = ringAlpha;
    push();
    fill(220); noStroke();
    circle(BTN_X, BTN_YP, BTN_R * 2);
    fill(0); noStroke();
    textSize(BTN_R * 1.7); textAlign(CENTER, CENTER);
    text('+', BTN_X, BTN_YP);
    pop();

    push();
    fill(canRemove ? 220 : 240); noStroke();
    circle(BTN_X, BTN_YM, BTN_R * 2);
    fill(canRemove ? 0 : 180); noStroke();
    textSize(BTN_R * 1.7); textAlign(CENTER, CENTER);
    text('−', BTN_X, BTN_YM);
    pop();
    drawingContext.globalAlpha = 1;

    // ── Email nodes: floating then threaded ──────────────────────
    let nodeIndex = 1;

    // Pre-compute floating node positions — algorithm mirrors cacheNodePositions
    // in sketch.js exactly (same seed + same random call order) so drawn positions
    // always equal the cached _wx/_wy used for hit-testing.
    const _floatOuter = _floatZoneR(sub.floating.length);
    randomSeed(sub.seed * 7);
    const _GA  = Math.PI * (3 - Math.sqrt(5)); // golden angle ≈ 137.5°
    const _fn  = sub.floating.length;
    const _r0sq = NODE_FLOAT_MIN * NODE_FLOAT_MIN;
    const _r1sq = _floatOuter * _floatOuter;
    const floatPos = sub.floating.map((_, i) => {
      const rJitter = random(-3, 3);
      const aJitter = random(-0.2, 0.2);
      const t  = (i + 0.5) / _fn;
      const rr = Math.max(NODE_FLOAT_MIN, Math.min(_floatOuter, Math.sqrt(_r0sq + t * (_r1sq - _r0sq)) + rJitter));
      const a  = i * _GA + aJitter;
      return { lx: cos(a) * rr, ly: sin(a) * rr };
    });

    drawingContext.globalAlpha = emailAlpha;

    for (let i = 0; i < sub.floating.length; i++) {
      let node = sub.floating[i];
      let { lx, ly } = floatPos[i];
      let nr = _scaledNodeR(node.size_kb);
      drawEmailNode(lx, ly, node.age, node.seed, node.email_id === _selectedEmailId, node.attachment, node.size_kb, node._threadColor, node._isArchive || node._isArchived);
      _drawNodeNumber(lx, ly, nodeIndex++, nr);
    }

    // Threaded nodes — skip any currently in the drag (drawn by drawThreadDragOverlay)
    for (let ring of rings) {
      for (let ti = 0; ti < ring.threads.length; ti++) {
        for (let j = 0; j < ring.threads[ti].nodes.length; j++) {
          let n  = ring.threads[ti].nodes[j];
          if (_threadDrag.active && _threadDrag.nodes.includes(n)) {
            nodeIndex++; continue;
          }
          let a  = ring.angles[ti][j];
          let lx = cos(a) * ring.r, ly = sin(a) * ring.r;
          let nr = _scaledNodeR(n.size_kb);
          drawEmailNode(lx, ly, n.age, n.seed, (_selectedEmailIds?.size > 0 ? _selectedEmailIds.has(n.email_id) : n.email_id === _selectedEmailId), n.attachment, n.size_kb, n._threadColor, n._isArchive || n._isArchived);
          _drawNodeNumber(lx, ly, nodeIndex++, nr);
        }
      }
    }

    drawingContext.globalAlpha = 1;

    // Finish animation: clear flag and let the loop stop if nothing else needs frames
    if (animT >= 1 && sub._openAnimStart != null) {
      sub._openAnimStart = null;
      if (typeof _maybePauseLoop === 'function') _maybePauseLoop();
    }

    pop();
  }

}

function _drawNodeNumber(lx, ly, num, nodeR) {
  let dist = sqrt(lx * lx + ly * ly);
  let dx = dist > 0.001 ? lx / dist : 0;
  let dy = dist > 0.001 ? ly / dist : -1;

  // Use the node's actual radius (accounting for size scaling) so the
  // number label always sits just outside the node, not inside large ones.
  let offset = (nodeR || NODE_RADIUS) + 12 / camZoom;

  push();
  noStroke();
  fill(0);
  textSize(10 / camZoom);
  textAlign(CENTER, CENTER);
  text(`${num}.`, lx + dx * offset, ly + dy * offset);
  pop();
}
// ── MACRO CLUSTER COMPONENT ───────────────────────────────────────
// Design: flat grey circle (#BEBEBE) that shrinks with age, surrounded by
// a fixed dashed ring (hard/butt caps) whose radius encodes the space size.
function drawMacroCluster(x, y, size, age) {
  // Ring radius — encodes the space's relative size, independent of age
  const outerR = map(size, 0, 1, MACRO_RADIUS * MACRO_SIZE_MIN_RATIO, MACRO_RADIUS);

  // Solid fill radius — shrinks as the space ages: old → tiny dot, recent → fills ring
  const solidR = map(age, 0, 1, outerR * 0.10, outerR * 0.85);

  push();
  translate(x, y);

  // ── Solid grey circle ──────────────────────────────────────────
  noStroke();
  fill(239, 239, 239); // #EFEFEF
  circle(0, 0, solidR * 2);

  // ── Dashed ring — proportional dash/gap, hard (butt) caps ─────
  const dashLen  = outerR * 0.18;
  const gapLen   = outerR * 0.08;
  const prevCap  = drawingContext.lineCap;

  drawingContext.setLineDash([dashLen, gapLen]);
  drawingContext.lineCap     = 'butt';
  drawingContext.strokeStyle = 'rgb(239,239,239)';
  drawingContext.lineWidth   = 1.0;
  drawingContext.beginPath();
  drawingContext.arc(0, 0, outerR, 0, Math.PI * 2);
  drawingContext.stroke();

  drawingContext.setLineDash([]);
  drawingContext.lineCap = prevCap;

  pop();
}
// ── GALAXY (THEME) COMPONENT ──────────────────────────────────────
// Flat white circle (shrinks with age) + dashed ring, matching the
// Space and Cluster design language. Rendered on the dark #1C1C1C bg.

function drawGalaxy(wx, wy, size, age, isHovered) {
  const outerR = map(size, 0, 1, GALAXY_RADIUS * 0.55, GALAXY_RADIUS);
  const solidR = map(age !== undefined ? age : 0.6, 0, 1, outerR * 0.10, outerR * 0.85);
  const ctx    = drawingContext;

  // Solid white circle
  ctx.beginPath();
  ctx.arc(wx, wy, solidR, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${isHovered ? 1.0 : 0.85})`;
  ctx.fill();

  // Dashed ring — proportional dash/gap, hard (butt) caps
  const dashLen = outerR * 0.18;
  const gapLen  = outerR * 0.08;
  const prevCap = ctx.lineCap;
  ctx.setLineDash([dashLen, gapLen]);
  ctx.lineCap     = 'butt';
  ctx.strokeStyle = `rgba(255,255,255,${isHovered ? 0.85 : 0.55})`;
  ctx.lineWidth   = (isHovered ? 1.5 : 1.0) / camZoom;
  ctx.beginPath();
  ctx.arc(wx, wy, outerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = prevCap;

  // Title label below the ring
  const sx = wx * camZoom + width / 2 + camX;
  const sy = wy * camZoom + height / 2 + camY + outerR * camZoom + 14;
  ctx.save();
  ctx.resetTransform();
  const pd = window.devicePixelRatio || 1;
  ctx.scale(pd, pd);
  ctx.font          = `${isHovered ? 500 : 400} 11px Inter, sans-serif`;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'top';
  ctx.fillStyle     = `rgba(255,255,255,${isHovered ? 0.9 : 0.55})`;
  ctx.fillText(window._galaxyTitle || '', sx / pd, sy / pd);
  ctx.restore();
}

function isInsideGalaxy(galaxy, wx, wy) {
  const r  = map(galaxy.size, 0, 1, GALAXY_RADIUS * 0.55, GALAXY_RADIUS);
  const dx = wx - galaxy.rx;
  const dy = wy - galaxy.ry;
  return (dx * dx + dy * dy) < r * r;
}
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
// ── PALM TREE MODULE ───────────────────────────────────────────────
// Grows the palm tree in the bottom-left corner as emails are deleted.
// Every 5 deleted emails advances one stage (9 stages total).
// Session-only — resets on page refresh.

(function () {
  'use strict';

  // 9 growth stages, smallest → largest
  const _STAGES = [
    // Stage 0 — seedling
    `<svg xmlns="http://www.w3.org/2000/svg" width="51" height="63" viewBox="0 0 51 63" fill="none"><rect x="20.1621" y="39.8047" width="10.4629" height="23.1855" rx="2" fill="#744222"/><rect x="20.1621" y="15.5234" width="10.4629" height="23.1855" rx="2" fill="#744222"/><path d="M45.0898 0.0179414C46.2849 -0.197903 46.969 1.59851 45.8505 2.07068C41.5255 3.89337 37.3744 5.49354 34.1806 7.67029C37.6952 7.54196 42.7138 7.60098 49.7157 7.36853C50.9062 7.32945 51.2172 9.11413 50.0741 9.44958L38.1523 12.9467C40.3367 13.2509 42.9152 13.601 45.9882 13.9183C47.2178 14.0455 47.2828 16.2267 46.0556 16.3754C46.0556 16.3754 29.1955 18.4162 29.1532 18.4213C27.8817 18.5746 26.8811 19.0336 25.3935 19.0336C23.9062 19.0335 22.8936 18.4814 21.6347 18.4213C14.9933 18.104 4.73234 16.3754 4.73234 16.3754C3.5049 16.2268 3.56987 14.0453 4.79972 13.9183C7.87271 13.601 10.4512 13.2509 12.6357 12.9467L0.713781 9.44958C-0.429479 9.11423 -0.118378 7.32944 1.07218 7.36853C8.07334 7.60096 13.0918 7.54201 16.6064 7.67029C13.4128 5.49385 9.26295 3.89317 4.93839 2.07068C3.81893 1.5989 4.50273 -0.19809 5.69816 0.0179414C13.0227 1.34183 19.5627 2.14505 24.8388 8.86462C25.0338 9.11304 25.2176 9.35911 25.3935 9.59997C25.5696 9.35877 25.7548 9.11339 25.9501 8.86462C31.2262 2.1451 37.7652 1.34183 45.0898 0.0179414Z" fill="#54B24D"/></svg>`,

    // Stage 1
    `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="89" viewBox="0 0 68 89" fill="none"><rect x="24.8008" y="65.3789" width="17.8105" height="23.1855" rx="2" fill="#744222"/><rect x="24.8008" y="41.0977" width="17.8105" height="23.1855" rx="2" fill="#744222"/><rect x="24.8008" y="16.8164" width="17.8105" height="23.1855" rx="2" fill="#744222"/><path d="M35.5957 5.2629C44.7287 -1.77656 53.5224 0.0864477 63.7754 0.637895C64.9881 0.703546 65.2346 2.57794 64.0361 2.77559C57.3839 3.87265 50.9631 4.46112 45.8184 6.34004C50.4087 7.32755 57.0334 9.11208 66.6016 11.1516C67.7669 11.4 67.6359 13.1886 66.4453 13.2326L48.9912 13.8752C52.1794 15.174 56.0979 16.7495 61.0352 18.4777C62.2018 18.8864 61.7574 20.947 60.5313 20.7893L36.2891 17.6682C28.2425 16.6321 16.1358 19.5975 6.87892 20.7893C5.6529 20.9469 5.20846 18.8864 6.37502 18.4777C11.3108 16.75 15.2284 15.1747 18.416 13.8762L0.964859 13.2326C-0.225703 13.1885 -0.356714 11.4 0.808609 11.1516C10.3781 9.11181 17.0034 7.32747 21.5938 6.34004C16.4493 4.46163 10.0295 3.87253 3.37794 2.77559C2.17948 2.57794 2.42604 0.703606 3.63869 0.637895C13.8917 0.0864484 22.6854 -1.77653 31.8184 5.2629C32.5109 5.79669 33.1391 6.32381 33.707 6.84004C34.275 6.3238 34.9032 5.7967 35.5957 5.2629Z" fill="#379330"/></svg>`,

    // Stage 2
    `<svg xmlns="http://www.w3.org/2000/svg" width="101" height="118" viewBox="0 0 101 118" fill="none"><rect x="38.3125" y="94.6738" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="38.3125" y="70.3926" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="38.3125" y="46.1113" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="38.3125" y="21.8301" width="23.6309" height="23.1855" rx="2" fill="#744222"/><path d="M51.6457 5.25247C67.6307 -4.38709 81.1933 1.7705 98.1974 3.9595C99.4021 4.11473 99.4804 5.95887 98.2697 6.05618C86.6743 6.98644 75.3739 6.32729 66.3019 8.51028C73.4029 10.9099 83.8744 15.0931 99.5548 20.2359C100.687 20.6073 100.366 22.3502 99.1779 22.2583L69.6574 19.9741C75.1878 23.0018 82.3119 26.8526 91.8966 31.2652C93.0191 31.7825 92.382 33.6875 91.1818 33.3911L50.1378 23.2564C50.1345 23.2556 50.1314 23.2533 50.1281 23.2525C50.1247 23.2533 50.1217 23.2555 50.1183 23.2564L9.07339 33.3911C7.87337 33.687 7.23675 31.7822 8.35952 31.2652C17.944 26.8527 25.0674 23.0017 30.5978 19.9741L1.07729 22.2583C-0.110449 22.3498 -0.430808 20.6072 0.701315 20.2359C16.3813 15.0933 26.8523 10.9099 33.9533 8.51028C24.8814 6.32748 13.5815 6.9864 1.98647 6.05618C0.775546 5.95903 0.853864 4.11461 2.05874 3.9595C19.0628 1.77047 32.6254 -4.38714 48.6105 5.25247C49.1381 5.57062 49.6429 5.88997 50.1271 6.20755C50.6117 5.88969 51.1176 5.5709 51.6457 5.25247Z" fill="#347430"/></svg>`,

    // Stage 3
    `<svg xmlns="http://www.w3.org/2000/svg" width="158" height="145" viewBox="0 0 158 145" fill="none"><rect x="66.832" y="121.396" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="97.1152" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="72.834" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="48.5527" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="24.2715" width="23.6309" height="23.1855" rx="2" fill="#744222"/><path d="M0.631546 22.2978C24.8 11.6933 40.6026 -4.84956 68.0271 1.35246C72.3259 2.32467 75.8724 3.54572 78.738 4.89445C81.5712 3.57964 85.0584 2.39003 89.2663 1.4384C116.691 -4.76363 132.493 11.7792 156.662 22.3837C157.774 22.8718 157.306 24.6286 156.119 24.372C138.414 20.5461 121.959 13.5963 107.564 12.3818C116.503 19.1232 129.587 30.1925 150.13 45.2519C151.091 45.9564 150.251 47.5012 149.152 47.04L106.957 29.328C113.788 36.6661 122.853 46.2879 135.955 58.246C136.868 59.0795 135.709 60.6464 134.663 59.9872L78.822 24.7968C78.7379 24.7438 78.6654 24.6794 78.6032 24.6083C78.5623 24.6449 78.5194 24.6806 78.4714 24.7109L22.6306 59.9013C21.5846 60.5605 20.4254 58.9936 21.3386 58.1601C34.4405 46.2022 43.5041 36.5801 50.3356 29.2421L8.14131 46.954C7.04261 47.4152 6.20276 45.8704 7.16377 45.1659C27.7061 30.1069 40.789 19.0373 49.7282 12.2958C35.3337 13.5106 18.8791 20.4602 1.17451 24.2861C-0.0128956 24.5426 -0.480897 22.7859 0.631546 22.2978Z" fill="#347430"/></svg>`,

    // Stage 4 — coconuts appear
    `<svg xmlns="http://www.w3.org/2000/svg" width="158" height="166" viewBox="0 0 158 166" fill="none"><rect x="66.3164" y="118.404" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.3164" y="142.686" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.3164" y="94.123" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.3164" y="69.8418" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.3164" y="45.5605" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.3164" y="21.2793" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="74.0176" width="9.25781" height="24.4551" rx="2" fill="#744222"/><circle cx="65.3701" cy="37.2139" r="5.10449" fill="#472C1A"/><circle cx="84.8428" cy="31.1084" r="5.10449" fill="#472C1A"/><circle cx="58.3584" cy="41.8018" r="5.10449" fill="#472C1A"/><circle cx="92.0537" cy="36.7666" r="5.10449" fill="#472C1A"/><path d="M0.631546 23.8876C24.8 13.2831 40.6026 -3.25972 68.0271 2.94231C72.3259 3.91451 75.8724 5.13557 78.738 6.4843C81.5712 5.16948 85.0584 3.97987 89.2663 3.02824C116.691 -3.17378 132.493 13.3691 156.662 23.9736C157.774 24.4617 157.306 26.2184 156.119 25.9618C138.414 22.1359 121.959 15.1862 107.564 13.9716C116.503 20.713 129.587 31.7823 150.13 46.8417C151.091 47.5462 150.251 49.091 149.152 48.6298L106.957 30.9179C113.788 38.2559 122.853 47.8778 135.955 59.8359C136.868 60.6693 135.709 62.2362 134.663 61.5771L78.822 26.3866C78.7379 26.3336 78.6654 26.2692 78.6032 26.1982C78.5623 26.2347 78.5194 26.2704 78.4714 26.3007L22.6306 61.4911C21.5846 62.1503 20.4254 60.5834 21.3386 59.7499C34.4411 47.7915 43.505 38.1691 50.3366 30.831L8.14131 48.5439C7.04261 49.0051 6.20276 47.4603 7.16377 46.7558C27.7061 31.6968 40.789 20.6271 49.7282 13.8857C35.3337 15.1004 18.8791 22.0501 1.17451 25.8759C-0.0128956 26.1325 -0.480897 24.3757 0.631546 23.8876Z" fill="#347430"/></svg>`,

    // Stage 5 — small yellow bud
    `<svg xmlns="http://www.w3.org/2000/svg" width="158" height="177" viewBox="0 0 158 177" fill="none"><path d="M73.5392 5.17158C73.6746 2.04989 76.4033 -0.369039 79.5001 0.0465831C81.9271 0.372384 83.813 2.36209 83.8683 4.81026C83.8843 5.51922 83.8876 6.21664 83.8819 6.90693C84.7232 4.63232 87.1213 3.36037 89.5099 3.81318C92.5799 4.39527 94.4068 7.55117 93.5509 10.5563C92.0793 15.7235 91.2671 20.2252 90.6827 26.111C90.3777 29.183 87.5371 31.3863 84.504 30.8112C82.0487 30.3456 80.2648 28.1848 80.3761 25.6882C80.3804 25.5915 80.3862 25.4951 80.3907 25.3991C79.5097 26.5058 78.1756 27.1975 76.7276 27.2819C76.2076 29.0583 74.703 30.4487 72.7911 30.8112C69.7581 31.3863 66.9185 29.183 66.6134 26.111C66.0291 20.2252 65.2159 15.7235 63.7442 10.5563C62.8884 7.55117 64.7153 4.39527 67.7853 3.81318C70.1912 3.35702 72.6073 4.65093 73.4317 6.95674C73.435 6.96585 73.4383 6.97497 73.4415 6.98408C73.4794 6.3888 73.5125 5.78572 73.5392 5.17158Z" fill="#E4C23D"/><rect x="66.9746" y="129.312" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.9746" y="153.594" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.9746" y="105.031" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.9746" y="80.75" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.9746" y="56.4688" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.9746" y="32.1875" width="23.6309" height="23.1855" rx="2" fill="#744222"/><circle cx="66.3525" cy="47.6748" r="5.10449" fill="#472C1A"/><circle cx="59.0166" cy="51.4326" r="5.10449" fill="#472C1A"/><circle cx="92.8447" cy="49.21" r="5.10449" fill="#472C1A"/><circle cx="100.06" cy="171.675" r="5.10449" fill="#472C1A"/><path d="M0.631546 34.7958C24.8 24.1913 40.6026 7.64848 68.0271 13.8505C72.3259 14.8227 75.8724 16.0438 78.738 17.3925C81.5712 16.0777 85.0584 14.8881 89.2663 13.9364C116.691 7.73442 132.493 24.2773 156.662 34.8818C157.774 35.3699 157.306 37.1266 156.119 36.87C138.414 33.0441 121.959 26.0944 107.564 24.8798C116.503 31.6212 129.587 42.6906 150.13 57.7499C151.091 58.4544 150.251 59.9992 149.152 59.538L106.957 41.8261C113.788 49.1641 122.853 58.786 135.955 70.7441C136.868 71.5775 135.709 73.1444 134.663 72.4853L78.822 37.2948C78.7379 37.2418 78.6654 37.1774 78.6032 37.1064C78.5623 37.1429 78.5194 37.1786 78.4714 37.2089L22.6306 72.3993C21.5846 73.0585 20.4254 71.4916 21.3386 70.6581C34.4411 58.6997 43.505 49.0773 50.3366 41.7392L8.14131 59.4521C7.04261 59.9133 6.20276 58.3685 7.16377 57.664C27.7061 42.605 40.789 31.5353 49.7282 24.7939C35.3337 26.0087 18.8791 32.9583 1.17451 36.7841C-0.0128956 37.0407 -0.480897 35.2839 0.631546 34.7958Z" fill="#347430"/></svg>`,

    // Stage 6 — bigger yellow burst
    `<svg xmlns="http://www.w3.org/2000/svg" width="158" height="191" viewBox="0 0 158 191" fill="none"><path d="M75.8606 8.37606C76.1404 3.32413 80.6356 -0.568768 85.6614 0.0684448C89.7319 0.584701 92.8282 3.94656 92.8265 8.0411C92.8255 10.2491 92.7801 12.3949 92.6849 14.5157C94.1515 12.8282 95.6718 11.1451 97.2688 9.43368C99.6979 6.83065 103.758 6.38102 106.721 8.31454C110.243 10.613 110.844 15.3347 108.099 18.5431C101.502 26.253 96.4452 32.9266 90.9515 41.1895C91.5991 42.6202 92.2555 44.0981 92.9222 45.629C94.1197 48.3793 93.2753 51.4408 91.014 53.2325C90.6534 54.0122 90.1279 54.7375 89.4388 55.3556C86.5088 57.9829 81.8259 57.6896 79.2308 54.7501C78.569 54.0005 77.918 53.2669 77.2767 52.5479C76.5551 52.3515 75.8545 52.0434 75.2015 51.6173C73.9516 50.8016 73.0547 49.6644 72.5608 48.3927C72.006 47.66 71.5727 46.8362 71.2786 45.9552C63.859 37.9848 57.2255 31.6177 48.6731 24.2257C45.6577 21.6193 45.5625 17.1429 48.5179 14.4923C51.0557 12.2163 55.0035 12.0766 57.681 14.2198C59.2159 15.4486 60.6999 16.6631 62.1468 17.877C61.3049 16.5606 60.4377 15.2211 59.5345 13.8516C57.3056 10.4722 58.4357 6.04097 62.0433 4.23446C65.1271 2.69052 68.9951 3.61239 71.0149 6.42977C72.6078 8.65173 74.112 10.82 75.552 12.9854C75.6696 11.4809 75.7735 9.94921 75.8606 8.37606Z" fill="#ECCA47"/><rect x="66.832" y="142.92" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="167.201" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="118.639" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="94.3574" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="70.0762" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="45.7949" width="23.6309" height="23.1855" rx="2" fill="#744222"/><circle cx="5.10449" cy="5.10449" r="5.10449" transform="matrix(-1 0 0 1 95.3359 55.0137)" fill="#472C1A"/><circle cx="5.10449" cy="5.10449" r="5.10449" transform="matrix(-1 0 0 1 102.672 58.7715)" fill="#472C1A"/><circle cx="5.10449" cy="5.10449" r="5.10449" transform="matrix(-1 0 0 1 68.8477 56.5488)" fill="#472C1A"/><circle cx="5.10449" cy="5.10449" r="5.10449" transform="matrix(-1 0 0 1 63.7422 180.092)" fill="#472C1A"/><path d="M0.631546 48.3173C24.8 37.7128 40.6026 21.17 68.0271 27.372C72.3259 28.3442 75.8724 29.5653 78.738 30.914C81.5712 29.5992 85.0584 28.4096 89.2663 27.4579C116.691 21.2559 132.493 37.7988 156.662 48.4032C157.774 48.8914 157.306 50.6481 156.119 50.3915C138.414 46.5656 121.959 39.6158 107.564 38.4013C116.503 45.1427 129.587 56.212 150.13 71.2714C151.091 71.9759 150.251 73.5207 149.152 73.0595L106.957 55.3476C113.788 62.6856 122.853 72.3074 135.955 84.2655C136.868 85.099 135.709 86.6659 134.663 86.0068L78.822 50.8163C78.7379 50.7633 78.6654 50.6989 78.6032 50.6279C78.5623 50.6644 78.5194 50.7001 78.4714 50.7304L22.6306 85.9208C21.5846 86.58 20.4254 85.0131 21.3386 84.1796C34.4411 72.2212 43.505 62.5988 50.3366 55.2607L8.14131 72.9736C7.04261 73.4347 6.20276 71.89 7.16377 71.1855C27.7061 56.1264 40.789 45.0568 49.7282 38.3154C35.3337 39.5301 18.8791 46.4798 1.17451 50.3056C-0.0128956 50.5622 -0.480897 48.8054 0.631546 48.3173Z" fill="#347430"/></svg>`,

    // Stage 7 — large yellow flower
    `<svg xmlns="http://www.w3.org/2000/svg" width="158" height="230" viewBox="0 0 158 230" fill="none"><rect x="66.832" y="181.559" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="205.84" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="157.277" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="132.996" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="108.715" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="66.832" y="84.4336" width="23.6309" height="23.1855" rx="2" fill="#744222"/><circle cx="66.624" cy="97.0361" r="5.10449" fill="#472C1A"/><circle cx="59.2881" cy="100.794" r="5.10449" fill="#472C1A"/><circle cx="93.1162" cy="98.5713" r="5.10449" fill="#472C1A"/><path d="M0.631546 84.1571C24.8 73.5527 40.6026 57.0098 68.0271 63.2118C72.3259 64.184 75.8724 65.4051 78.738 66.7538C81.5712 65.439 85.0584 64.2494 89.2663 63.2978C116.691 57.0957 132.493 73.6386 156.662 84.2431C157.774 84.7312 157.306 86.488 156.119 86.2314C138.414 82.4054 121.959 75.4557 107.564 74.2411C116.503 80.9825 129.587 92.0519 150.13 107.111C151.091 107.816 150.251 109.361 149.152 108.899L106.957 91.1874C113.788 98.5254 122.853 108.147 135.955 120.105C136.868 120.939 135.709 122.506 134.663 121.847L78.822 86.6562C78.7379 86.6032 78.6654 86.5388 78.6032 86.4677C78.5623 86.5043 78.5194 86.54 78.4714 86.5702L22.6306 121.761C21.5846 122.42 20.4254 120.853 21.3386 120.019C34.4411 108.061 43.505 98.4386 50.3366 91.1005L8.14131 108.813C7.04261 109.275 6.20276 107.73 7.16377 107.025C27.7061 91.9663 40.789 80.8966 49.7282 74.1552C35.3337 75.37 18.8791 82.3196 1.17451 86.1454C-0.0128956 86.402 -0.480897 84.6453 0.631546 84.1571Z" fill="#4A7547"/><path fill-rule="evenodd" clip-rule="evenodd" d="M79.5747 0.0710734C74.2257 -0.656099 69.8882 4.31363 70.8589 9.62381C71.6824 14.1289 72.1399 18.3191 72.2241 22.3396C68.0665 17.9276 62.9162 13.9127 56.6587 10.0291C54.8355 8.89749 52.5664 8.76785 50.5952 9.616C45.5479 11.7885 45.0535 18.7899 49.481 22.0447C57.3135 27.8028 62.9545 33.5528 66.7271 40.0183C60.8087 34.5703 54.1659 30.3477 46.0562 26.5584C43.2399 25.2427 39.9136 25.9381 37.7495 28.1697C33.9917 32.0452 35.4208 38.4846 40.272 40.8523C43.699 42.5249 46.7992 44.2736 49.6392 46.1482C43.5343 45.4695 36.7661 46.3692 28.9077 48.6404C27.2256 49.1266 25.8565 50.3446 25.1226 51.9344C22.8762 56.8008 27.4533 62.1095 32.7398 61.2263C45.7728 59.0492 62.8942 68.3885 62.8942 68.3885C62.8942 68.3885 72.9872 74.3378 79.6673 74.3378C86.0195 74.3378 95.6522 68.5734 95.6522 68.5734C95.6522 68.5734 112.813 59.1468 125.893 61.3318C131.179 62.2146 135.756 56.906 133.509 52.0398C132.775 50.4501 131.406 49.2321 129.724 48.7459C121.863 46.4739 115.093 45.5738 108.987 46.2537C111.827 44.3787 114.928 42.6308 118.356 40.9578C123.207 38.5901 124.636 32.1507 120.878 28.2752C118.714 26.0436 115.388 25.3482 112.572 26.6638C104.466 30.4514 97.825 34.6717 91.9087 40.116C95.6813 33.6535 101.321 27.906 109.151 22.1502C113.578 18.8955 113.085 11.8942 108.038 9.72146C106.066 8.87308 103.797 9.00284 101.973 10.1346C96.3082 13.6505 91.5492 17.273 87.6138 21.201C87.5004 16.2526 86.8803 11.2029 85.7984 5.8035C85.1875 2.75552 82.6549 0.490019 79.5747 0.0710734Z" fill="#F8D756"/></svg>`,

    // Stage 8 — full bloom
    `<svg xmlns="http://www.w3.org/2000/svg" width="142" height="234" viewBox="0 0 142 234" fill="none"><rect x="59.0293" y="186.271" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="59.0293" y="210.553" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="59.0293" y="161.99" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="59.0293" y="137.709" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="59.0293" y="113.428" width="23.6309" height="23.1855" rx="2" fill="#744222"/><rect x="59.0293" y="89.1465" width="23.6309" height="23.1855" rx="2" fill="#744222"/><circle cx="58.4072" cy="110.798" r="5.10449" fill="#472C1A"/><circle cx="51.0713" cy="114.556" r="5.10449" fill="#472C1A"/><circle cx="84.8994" cy="112.333" r="5.10449" fill="#472C1A"/><path d="M70.8445 72.2861C74.4378 71.2765 79.5396 70.9881 86.2498 72.0498C110.763 75.9284 118.579 94.4249 134.66 111.082C135.503 111.956 134.406 113.414 133.404 112.729C120.325 103.776 109.181 92.9 97.8582 87.2402C102.997 95.7098 110.097 109.028 121.92 127.984C122.55 128.995 121.186 130.111 120.337 129.275L91.7263 101.155C94.8861 109.294 99.0844 119.925 105.682 133.638C106.218 134.752 104.546 135.785 103.818 134.785L70.8445 89.4795L37.8709 134.785C37.1433 135.785 35.4705 134.752 36.0066 133.638C42.6042 119.926 46.801 109.294 49.9607 101.156L21.3523 129.275C20.5025 130.111 19.1397 128.995 19.7703 127.984C31.5918 109.03 38.6915 95.7108 43.8298 87.2412C32.507 92.9012 21.3636 103.776 8.28492 112.729C7.28258 113.414 6.18564 111.956 7.02906 111.082C23.1104 94.4249 30.926 75.9284 55.4392 72.0498C62.1493 70.9881 67.2511 71.2765 70.8445 72.2861Z" fill="#527350"/><path d="M63.8149 24.4612C63.6608 20.203 63.146 15.7693 62.2801 11.0321C61.1675 4.94491 66.1396 -0.752141 72.2713 0.0814799C75.8025 0.5616 78.7066 3.15964 79.4068 6.65386C80.3754 11.4881 81.0192 16.0779 81.3177 20.5587C86.0098 15.6733 91.7805 11.2105 98.7455 6.88783C100.836 5.59065 103.437 5.44171 105.696 6.41429C111.482 8.90477 112.049 16.9306 106.974 20.6617C100.05 25.7512 94.6193 30.8343 90.513 36.2928C99.854 29.9141 111.031 26.6111 125.262 25.3142C127.712 25.091 130.105 26.1234 131.689 28.0054C135.746 32.8243 132.656 40.2531 126.447 41.3147C120.69 42.299 115.552 43.5907 110.93 45.2709C118.56 44.8494 126.29 45.1185 134.658 45.9751C138.032 46.3204 140.702 48.946 141.211 52.2989C141.98 57.3582 137.621 61.702 132.533 61.155C127.557 60.6199 122.879 60.3061 118.395 60.2191C124.31 61.3446 130.273 62.895 136.543 64.8784C139.777 65.9012 141.858 69.0136 141.677 72.4C141.404 77.5102 136.254 80.8795 131.382 79.3116C128.28 78.3128 125.282 77.4309 122.361 76.6618C124.404 78.9448 126.423 81.4967 128.44 84.3246C129.606 85.9584 129.969 88.0271 129.497 89.9779C128.053 95.9497 120.163 97.4651 116.04 92.9098C106.017 81.835 104.91 73.9016 90.5149 77.853C76.1195 81.8043 67.4085 81.3005 51.173 77.853C34.9375 74.4055 35.6709 81.8352 25.6478 92.9098C21.5248 97.4648 13.6346 95.9497 12.1907 89.9779C11.7191 88.027 12.0828 85.9584 13.2486 84.3246C15.2664 81.4968 17.2839 78.9447 19.3273 76.6618C16.4064 77.4309 13.4089 78.3129 10.3067 79.3116C5.43528 80.8799 0.284344 77.5103 0.0109354 72.4C-0.170138 69.0136 1.91248 65.9011 5.14592 64.8784C11.4161 62.8951 17.3782 61.3445 23.2925 60.2191C18.8078 60.306 14.1287 60.6198 9.15137 61.155C4.06323 61.7022 -0.296771 57.3582 0.472155 52.2989C0.981919 48.946 3.65284 46.3204 7.02662 45.9751C15.3955 45.1184 23.1271 44.8502 30.7582 45.272C26.1361 43.5918 20.9978 42.299 15.2413 41.3147C9.0323 40.253 5.94306 32.8242 9.99992 28.0054C11.5842 26.1236 13.9758 25.0911 16.4257 25.3142C30.6565 26.611 41.8331 29.9138 51.1739 36.2917C47.0677 30.8339 41.6379 25.7507 34.7155 20.6617C29.6401 16.9307 30.2068 8.90469 35.9928 6.41429C38.2524 5.44176 40.8533 5.59056 42.9435 6.88783C51.7199 12.3348 58.6001 18.0035 63.8149 24.4612Z" fill="#FFE684"/></svg>`,
  ];

  let _bank  = 0; // emails accumulated toward the next advance (0–4)
  let _stage = 0; // current tree stage (0–8)

  function _render(stage, animate) {
    const el = document.getElementById('palm-tree');
    if (!el) return;

    if (!animate) {
      el.innerHTML = _STAGES[stage];
      return;
    }

    // Fade out, swap SVG, fade + scale in
    el.style.opacity = '0';
    el.style.transform = 'scale(0.82) translateY(8px)';
    setTimeout(() => {
      el.innerHTML = _STAGES[stage];
      el.style.opacity = '1';
      el.style.transform = 'scale(1) translateY(0)';
    }, 260);
  }

  // Called once per delete action with the total number of emails removed.
  // Accumulates toward the next multiple of 5, but advances the tree by at
  // most ONE stage per action regardless of how many emails were deleted.
  window.addDeletedEmails = function (n) {
    if (n <= 0 || _stage >= _STAGES.length - 1) return;
    _bank += n;
    if (_bank >= 5) {
      _bank = _bank % 5; // carry remainder; never advance more than 1 step
      _stage = Math.min(_STAGES.length - 1, _stage + 1);
      _render(_stage, true);
    }
    window.CarbonModule?.onEmailsDeleted(n);
  };

  // Initialise on load
  document.addEventListener('DOMContentLoaded', () => _render(0, false));
})();
// ── CARBON FOOTPRINT MODULE ─────────────────────────────────────────────────
// Estimates the CO2 and water footprint of the user's inbox.
// Narrative: data centres drink water to stay cool. Delete emails -> they need
// less cooling -> that water flows back to your tree instead.
// Session-only: resets on page refresh (mirrors the palm tree behaviour).

(function () {
  'use strict';

  // ── Constants (estimates) ───────────────────────────────────────────
  const CO2_G_PER_EMAIL = 4;                        // g CO2/year per stored email (Berners-Lee)
  const WATER_L_PER_EMAIL = 0.05;                     // litres/email/year (data-centre cooling)
  const TREE_G_PER_YEAR = 21000;                    // g CO2 absorbed per mature tree per year
  const TREE_G_PER_HOUR = TREE_G_PER_YEAR / 8760;  // ~2.4 g/hour

  // Fixed global stat (email ~0.3% of 37 GT global CO2; Amazon absorbs ~2,200 MT/yr).
  const GLOBAL_STAT =
    'Globally, email generates ~110 million tonnes of CO2 a year. ' +
    'The Amazon rainforest would need to work for 18 full days ' +
    'just to offset it.';

  // ── Session state ───────────────────────────────────────────────────
  let _total = 0;
  let _deleted = 0;

  // ── Formatting helpers ──────────────────────────────────────────────

  function _fmtHours(h) {
    if (h < 1) return '< 1 hour';
    if (h < 10) return '≈' + h.toFixed(1) + ' hours';
    return '≈' + Math.round(h).toLocaleString() + ' hours';
  }

  function _daysSuffix(h) {
    const days = h / 24;
    if (days < 1) return '';
    if (days < 14) {
      const d = Math.round(days);
      return ' (≈' + d + ' day' + (d === 1 ? '' : 's') + ')';
    }
    const weeks = days / 7;
    if (weeks < 8) {
      const w = Math.round(weeks);
      return ' (≈' + w + ' week' + (w === 1 ? '' : 's') + ')';
    }
    const months = days / 30.4;
    const m = Math.round(months);
    return ' (≈' + m + ' month' + (m === 1 ? '' : 's') + ')';
  }

  function _fmtWater(l) {
    if (l < 0.1) return 'a few drops';
    if (l < 1) return '≈' + (l * 1000).toFixed(0) + ' ml';
    if (l < 10) return '≈' + l.toFixed(1) + ' L';
    return '≈' + Math.round(l) + ' L';
  }

  // ── Water droplet animation ─────────────────────────────────────────

  function _triggerDroplets() {
    const el = document.getElementById('carbon-droplets');
    if (!el) return;
    el.classList.remove('dropping');
    void el.offsetWidth; // force reflow so animation restarts cleanly
    el.classList.add('dropping');
    el.addEventListener('animationend', function handler() {
      el.classList.remove('dropping');
      el.removeEventListener('animationend', handler);
    });
  }

  // ── DOM render ──────────────────────────────────────────────────────

  function _render() {
    const current = Math.max(0, _total - _deleted);
    const hoursNeeded = (current * CO2_G_PER_EMAIL) / TREE_G_PER_HOUR;
    const water = current * WATER_L_PER_EMAIL;
    const hoursFreed = (_deleted * CO2_G_PER_EMAIL) / TREE_G_PER_HOUR;
    const waterFreed = _deleted * WATER_L_PER_EMAIL;

    const treesEl = document.getElementById('carbon-trees-stat');
    const waterEl = document.getElementById('carbon-water-stat');
    const globalEl = document.getElementById('carbon-global-stat');
    const savingsEl = document.getElementById('carbon-savings-stat');

    if (treesEl) {
      treesEl.textContent =
        'Your tree spends ' + _fmtHours(hoursNeeded) + _daysSuffix(hoursNeeded) +
        ' a year doing your inbox’s CO₂ work.';
    }

    if (waterEl) {
      waterEl.textContent =
        'Data centres use ' + _fmtWater(water) +
        ' of water a year keeping your emails cool. Delete your emails' +
        ' and that water flows straight to your tree instead.';
    }

    if (globalEl) globalEl.textContent = GLOBAL_STAT;

    if (savingsEl) {
      if (_deleted === 0) {
        savingsEl.textContent =
          'Delete your emails to give that water to your tree.';
      } else {
        const plural = _deleted === 1;
        savingsEl.textContent =
          'Your ' + _deleted + ' deletion' + (plural ? '' : 's') +
          ' gave your tree ' + _fmtHours(hoursFreed) + _daysSuffix(hoursFreed) +
          ' to focus on other carbon to offset, and returned ' + _fmtWater(waterFreed) +
          ' of water to your tree — water the data centre no longer needs.';
      }
    }
  }

  // ── Hover: hide left panel while carbon panel is open ──────────────

  document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('palm-tree-container');
    if (!container) return;
    container.addEventListener('mouseenter', function () {
      document.body.classList.add('tree-hovered');
    });
    container.addEventListener('mouseleave', function () {
      document.body.classList.remove('tree-hovered');
    });
  });

  // ── Public API ──────────────────────────────────────────────────────

  window.CarbonModule = {
    init: function (emailCount) {
      _total = emailCount || 0;
      _deleted = 0;
      _render();
    },
    onEmailsDeleted: function (n) {
      _deleted += (n || 0);
      _render();
      _triggerDroplets();
    }
  };
})();
/**
 * Email Panel Module
 * Manages the three panel states: Macro Panel, Macro & Cluster Panel, and Expanded Panel
 * Exposes: showMacroPanel, showMacroClusterPanel, showExpandedPanel, closePanel, updateMinimisedPanel
 */

(function () {
    'use strict';

    // DOM references (populated on init)
    let macroPanel = null;

    let macroClusterPanel = null;
    let expandedPanel = null;
    let emailDetailPanel = null;
    let _rightStack = null;
    let _organisePanel = null;
    let _sortPanel = null;
    let emailsCount = null;
    let clustersCount = null;
    let macroClusterCount = null;
    let galaxiesCount = null;

    /** Format a KB value → "42 KB" / "1.4 MB" / "2.1 GB" */
    function _fmtKb(kb) {
        if (!kb) return '—';
        if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(2)} GB`;
        if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
        return `${Math.round(kb)} KB`;
    }

    /**
     * Initialize panel references after DOM is ready
     */
    function init() {
        macroPanel = document.getElementById('macro-panel');
        macroClusterPanel = document.getElementById('macro-cluster-panel');
        expandedPanel = document.getElementById('expanded-panel');
        emailDetailPanel = document.getElementById('email-detail-panel');
        // New panel stack refs
        _rightStack = document.getElementById('right-panel-stack');
        _organisePanel = document.getElementById('organise-panel');
        _sortPanel = document.getElementById('sort-panel');
        emailsCount = document.getElementById('emails-count');
        clustersCount = document.getElementById('clusters-count');
        macroClusterCount = document.getElementById('macro-clusters-count');
        galaxiesCount = document.getElementById('galaxies-count');

        _wireLegend();
        _wireIconSlots();
        _wireDeleteButtons();
        _wireArrow();
        _wireExpandModal();
        _wireEmbeddedToggle();
    }

    function _wireDeleteButtons() {
        const map = {
            'btn-sort-week': () => window.setSortMode?.('week'),
            'btn-sort-month': () => window.setSortMode?.('month'),
            'btn-sort-year': () => window.setSortMode?.('year'),
            'btn-archive': () => window.archiveSelectedEmails?.(),
            'btn-group': () => window.groupSelectedEmails?.(),
            'btn-split': () => window.splitSelectedEmails?.(),
            'btn-delete-email': () => window.deleteSelectedEmail?.(),
            'btn-delete-thread': () => window.deleteSelectedThread?.(),
            'btn-delete-ring': () => window.deleteSelectedRing?.(),
            'btn-delete-cluster': () => window.deleteSelectedCluster?.(),
            'btn-undo': () => window.undoLastDelete?.(),
            'btn-undo-all': () => window.undoAllChanges?.(),
        };
        for (const [id, handler] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handler);
        }

        // Organise panel node-colour swatches — plain click, no pointerdown.
        // pointerdown.preventDefault() suppresses the click event per spec,
        // which was silently blocking colour assignment every time.
        document.querySelectorAll('#organise-panel .color-swatch[data-color]').forEach(btn => {
            btn.addEventListener('click', () => window.applyEmailColor?.(btn.dataset.color));
        });

        // Custom colour picker (organise panel)
        const customInput = document.getElementById('color-custom-input');
        if (customInput) {
            customInput.addEventListener('input', () => {
                window.applyEmailColor?.(customInput.value);
            });
        }
    }

    function _wireLegend() {
        _drawLegendItems();
        const slot = document.getElementById('icon-slot-legend');
        if (!slot) return;
        slot.addEventListener('mouseenter', () => {
            document.body.classList.add('legend-hovered');
        });
        slot.addEventListener('mouseleave', () => {
            document.body.classList.remove('legend-hovered');
        });
    }

    /**
     * Wire hover-to-show / click-to-pin for all icon slots with an .icon-panel child.
     * Also wires the Arrow icon to hide when any left panel is active.
     */
    function _wireIconSlots() {
        const slots = document.querySelectorAll('.icon-slot');
        slots.forEach(slot => {
            // Chat is wired by chat.js; legend is wired by _wireLegend
            if (slot.id === 'icon-slot-chat') return;
            if (slot.id === 'icon-slot-legend') return;

            const btn = slot.querySelector('.icon-btn');
            if (!btn) return;

            let pinned = false;
            let _legendHadPanel = false; // was a left panel visible when legend opened?

            const open = () => {
                slot.classList.add('open');
                if (slot.id === 'icon-slot-legend') {
                    _drawLegendItems();
                    // Close any open left panel to avoid overlap
                    _legendHadPanel = !!(
                        macroPanel?.classList.contains('active') ||
                        macroClusterPanel?.classList.contains('active') ||
                        expandedPanel?.classList.contains('active')
                    );
                    if (_legendHadPanel) _hideLeftPanels();
                }
            };

            const close = () => {
                slot.classList.remove('open');
                btn.classList.remove('active');
                if (slot.id === 'icon-slot-legend' && _legendHadPanel) {
                    // Restore the left panel that was showing before legend opened
                    _userHiddenPanel = false;
                    _restoreFromArrow();
                    _legendHadPanel = false;
                }
            };

            slot.addEventListener('mouseenter', open);
            slot.addEventListener('mouseleave', () => { if (!pinned) close(); });

            btn.addEventListener('click', e => {
                e.stopPropagation();
                pinned = !pinned;
                btn.classList.toggle('active', pinned);
                if (pinned) open(); else close();
            });

            document.addEventListener('click', e => {
                if (!slot.contains(e.target)) {
                    pinned = false;
                    close();
                }
            });
        });
    }

    // ── Legend canvas rendering ───────────────────────────────────

    // Creates a wide landscape canvas for level background previews.
    // W is hardcoded to match the panel content area (320px slot − 40px padding).
    function _legendCtxWide(id) {
        const el = document.getElementById(id);
        if (!el) return null;
        const dpr = window.devicePixelRatio || 1;
        const W = 280, H = 60;
        el.width  = W * dpr;
        el.height = H * dpr;
        el.style.width  = W + 'px';
        el.style.height = H + 'px';
        const ctx = el.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, W, H);
        return { ctx, W, H };
    }

    function _drawLegendThemePreview(ctx, W, H) {
        // Dark background
        ctx.fillStyle = '#1C1C1C';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0, 0, W, H, 6);
        else ctx.rect(0, 0, W, H);
        ctx.fill();
        // 5 white circles in a loose flower arrangement (like the galaxy picker)
        const circles = [
            { x: W * 0.13, r: H * 0.30 },
            { x: W * 0.30, r: H * 0.22 },
            { x: W * 0.50, r: H * 0.36 },
            { x: W * 0.70, r: H * 0.18 },
            { x: W * 0.86, r: H * 0.27 },
        ];
        circles.forEach(({ x, r }) => {
            const y = H / 2;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
            ctx.save();
            ctx.setLineDash([r * 0.35, r * 0.18]);
            ctx.strokeStyle = 'rgba(255,255,255,0.50)';
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        });
    }

    function _drawLegendSpacePreview(ctx, W, H) {
        // Medium dark background
        ctx.fillStyle = '#2F2F2F';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0, 0, W, H, 6);
        else ctx.rect(0, 0, W, H);
        ctx.fill();
        // 6 macro circles in a ring (like the Spaces view)
        const cx = W / 2, cy = H / 2, ringR = H * 0.30, r = H * 0.16;
        for (let i = 0; i < 6; i++) {
            const a = -Math.PI / 2 + i * (Math.PI * 2 / 6);
            const x = cx + Math.cos(a) * ringR;
            const y = cy + Math.sin(a) * ringR;
            ctx.fillStyle = 'rgba(175,175,175,0.85)';
            ctx.beginPath(); ctx.arc(x, y, r * 0.50, 0, Math.PI * 2); ctx.fill();
            ctx.save();
            ctx.setLineDash([r * 0.35, r * 0.18]);
            ctx.strokeStyle = 'rgba(175,175,175,0.50)';
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    function _drawLegendClusterPreview(ctx, W, H) {
        // Light background
        ctx.fillStyle = '#F5F5F5';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0, 0, W, H, 6);
        else ctx.rect(0, 0, W, H);
        ctx.fill();
        // Three sub-cluster circles with email node dots
        const clusters = [
            { x: W * 0.20, r: H * 0.26, dots: 6 },
            { x: W * 0.50, r: H * 0.34, dots: 8 },
            { x: W * 0.80, r: H * 0.20, dots: 5 },
        ];
        clusters.forEach(({ x, r, dots }) => {
            const y = H / 2;
            ctx.fillStyle = 'rgba(175,175,175,0.85)';
            ctx.beginPath(); ctx.arc(x, y, r * 0.52, 0, Math.PI * 2); ctx.fill();
            ctx.save();
            ctx.setLineDash([r * 0.35, r * 0.18]);
            ctx.strokeStyle = 'rgba(175,175,175,0.60)';
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            // Email node dots on an orbit
            const orbitR = r + H * 0.12;
            for (let i = 0; i < dots; i++) {
                const a = -Math.PI / 2 + i * (Math.PI * 2 / dots);
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(x + Math.cos(a) * orbitR, y + Math.sin(a) * orbitR, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    function _legendCtx(id) {
        const el = document.getElementById(id);
        if (!el) return null;
        const dpr = window.devicePixelRatio || 1;
        const S = 78;
        el.width = S * dpr;
        el.height = S * dpr;
        el.style.width = S + 'px';
        el.style.height = S + 'px';
        const ctx = el.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, S, S);
        ctx.save();
        ctx.translate(S / 2, S / 2); // origin at centre
        return ctx;
    }

    function _legendSeeded(seed) {
        let s = seed;
        return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    }

    function _drawLegendEmail(ctx, age, seed) {
        const R = 34; // radius inside the 78px canvas (some padding)
        const numPts = Math.floor(age * 14 + 6);
        const blobRatio = age * 0.82 + 0.10;
        const outerAlpha = (age * 143 + 32) / 255;
        const rnd = _legendSeeded(seed);

        // Outer dashed circle (matches canvas: fill rgba(215,215,215,alpha) + stroke(160))
        ctx.setLineDash([1.5, 2]);
        ctx.fillStyle = `rgba(215,215,215,${outerAlpha.toFixed(3)})`;
        ctx.strokeStyle = 'rgba(160,160,160,1)';
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);

        // Inner blob polygon
        const base = R * blobRatio;
        const maxR = R - 0.8;
        const pts = [];
        for (let i = 0; i < numPts; i++) {
            const a = (i * Math.PI * 2 / numPts) - Math.PI / 2;
            const r = Math.min(base * (0.92 + rnd() * 0.16), maxR);
            pts.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fill();
    }


    function _drawLegendItems() {
        // Level background previews
        let wide;
        wide = _legendCtxWide('legend-themes-preview');
        if (wide) _drawLegendThemePreview(wide.ctx, wide.W, wide.H);

        wide = _legendCtxWide('legend-spaces-preview');
        if (wide) _drawLegendSpacePreview(wide.ctx, wide.W, wide.H);

        wide = _legendCtxWide('legend-clusters-preview');
        if (wide) _drawLegendClusterPreview(wide.ctx, wide.W, wide.H);

        // Digital decomposition — email decay only (applies to all levels)
        let ctx;
        ctx = _legendCtx('legend-email-recent');
        if (ctx) { _drawLegendEmail(ctx, 0.92, 1337); ctx.restore(); }

        ctx = _legendCtx('legend-email-old');
        if (ctx) { _drawLegendEmail(ctx, 0.08, 42); ctx.restore(); }
    }

    // ── Arrow click / minimize wiring ────────────────────────────────

    let _arrowPinned = false;  // user explicitly clicked Arrow to show panel
    let _userHiddenPanel = false;  // set when user minimizes; blocks auto-show from nav

    function _hasOpenCluster() {
        // True only when a sub-cluster is open (not just a macro/space).
        // The right-panel tools are only meaningful inside a specific cluster.
        return typeof MACROS !== 'undefined' &&
               MACROS.some(m => m.subClusters && m.subClusters.some(s => s.open));
    }

    function _hasOpenMacro() {
        // Arrow is meaningful whenever any macro is open (Clusters overview or deeper).
        return typeof MACROS !== 'undefined' && MACROS.some(m => m.open);
    }

    function _setArrowVisible(visible) {
        const arrow = document.getElementById('icon-arrow');
        if (!arrow) return;
        if (visible) {
            // Only reveal the Arrow when there is actually something to restore.
            // This keeps it hidden on the landing page where nothing is open.
            arrow.classList.toggle('hidden', !_hasOpenMacro());
        } else {
            arrow.classList.add('hidden');
        }
    }

    function _restoreFromArrow() {
        if (typeof MACROS === 'undefined') return false;
        const openMacro = MACROS.find(m => m.open);
        if (!openMacro) return false;

        _userHiddenPanel = false; // user is deliberately re-opening the panel

        const openSub = openMacro.subClusters && openMacro.subClusters.find(s => s.open);
        if (openSub) {
            if (expandedPanel) expandedPanel.classList.add('active');
            window.showClusterPanel && window.showClusterPanel();
        } else {
            if (macroPanel) macroPanel.classList.add('active');
        }
        _setArrowVisible(false);
        return true;
    }


    function _wireArrow() {
        const arrow = document.getElementById('icon-arrow');
        if (!arrow) return;

        // Click → toggle left panel; hover does nothing
        arrow.addEventListener('click', e => {
            e.stopPropagation();
            _arrowPinned = !_arrowPinned;
            arrow.classList.toggle('active', _arrowPinned);
            if (_arrowPinned) {
                _userHiddenPanel = false;
                _restoreFromArrow();
            } else {
                _userHiddenPanel = true;
                _hideLeftPanels();
                _setArrowVisible(true);
            }
        });

        // Minimize button → collapse left panel only; right stack stays intact
        document.querySelectorAll('.panel-minimize-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                _arrowPinned     = false;
                _userHiddenPanel = true;
                arrow.classList.remove('active');
                _hideLeftPanels();
                _setArrowVisible(true);
            });
        });
    }

    // Hides only the left navigation panels — leaves the right stack untouched.
    // Used when the user explicitly minimises or unpins the left panel so the
    // Organise / Sort / Email-detail panels on the right stay visible.
    function _hideLeftPanels() {
        if (macroPanel)        macroPanel.classList.remove('active');
        if (macroClusterPanel) macroClusterPanel.classList.remove('active');
        if (expandedPanel)     expandedPanel.classList.remove('active');
    }

    function _showRightStack(showEmail) {
        if (_rightStack) _rightStack.classList.add('active');
        if (_organisePanel) _organisePanel.classList.add('active');
        if (_sortPanel) _sortPanel.classList.add('active');
        if (emailDetailPanel) {
            if (showEmail) emailDetailPanel.classList.add('active');
            else emailDetailPanel.classList.remove('active');
        }
    }

    function _hideRightStack() {
        if (_rightStack)      _rightStack.classList.remove('active');
        if (_organisePanel)   _organisePanel.classList.remove('active');
        if (_sortPanel)       _sortPanel.classList.remove('active');
        if (emailDetailPanel) emailDetailPanel.classList.remove('active');
    }

    function hideAllPanels() {
        _hideLeftPanels();
        _hideRightStack();
        _setArrowVisible(true);
    }

    /**
     * Shows the right stack in cluster mode — Organise + Sort visible, email hidden.
     * Called whenever a sub-cluster is open but no specific email is selected.
     */
    window.showClusterPanel = function () {
        if (!_rightStack) init();
        _showRightStack(false); // email panel stays hidden
    };

    function setMinimizedPanelVisible() {
        // no-op: stats are now always accessible via the Info icon
    }

    /**
     * Shows the macro panel state with macro data
     * @param {Object} macro - Macro cluster object with title, summary, description
     */
    // ── Editable description helper ───────────────────────────────────
    // When a cluster has no LLM-generated summary (e.g. Archive, Trash,
    // user-created clusters), the description field becomes contenteditable
    // so the user can add their own label. Typed content is saved back to
    // obj.description and survives panel re-shows without being overwritten.
    function _setupEditableDesc(el, obj, placeholder) {
        if (!el) return;
        const hasLLM = !!(obj && obj.summary);

        if (hasLLM) {
            // Regular cluster — read-only, plain text
            el.removeAttribute('contenteditable');
            el.removeAttribute('data-placeholder');
            el.classList.remove('pd-editable', 'pd-empty');
            el.textContent = obj.summary || obj.description || '';
            return;
        }

        // Editable: wire up once, then only update content if it changed externally
        if (!el.dataset.editWired) {
            el.setAttribute('contenteditable', 'true');
            el.setAttribute('spellcheck', 'false');
            el.classList.add('pd-editable');

            el.addEventListener('input', () => {
                if (el._descTarget) el._descTarget.description = el.textContent.trim();
                el.classList.toggle('pd-empty', !el.textContent.trim());
            });
            el.addEventListener('focus', () => el.classList.remove('pd-empty'));
            el.addEventListener('blur',  () => {
                el.classList.toggle('pd-empty', !el.textContent.trim());
            });
            // Prevent Enter from inserting <div> / <br> blocks — keep plain text
            el.addEventListener('keydown', e => {
                e.stopPropagation(); // prevent keys reaching p5's canvas handler
                if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertText', false, '\n'); }
            });
            el.dataset.editWired = '1';
        }

        // Update the target object reference (may change between calls)
        el._descTarget = obj;
        el.setAttribute('data-placeholder', placeholder);

        // Only reset text if the object's stored description differs from what's shown
        const stored = obj.description || '';
        if (el.textContent !== stored) el.textContent = stored;
        el.classList.toggle('pd-empty', !stored);
    }

    window.showMacroPanel = function (macro) {
        if (!macroPanel) init();
        _hideLeftPanels();
        if (!_hasOpenCluster()) _hideRightStack(); // right stack only hidden outside cluster view
        setMinimizedPanelVisible(true);

        if (macro) {
            const description_el = macroPanel.querySelector('.panel-description');
            _setupEditableDesc(description_el, macro, 'Describe this space…');
        }

        if (_userHiddenPanel) return; // user minimized — stay hidden
        if (macroPanel) macroPanel.classList.add('active');
        _setArrowVisible(false);
    };

    /**
     * Shows the macro & cluster panel state with both macro and sub-cluster data
     * @param {Object} macro - Macro cluster object
     * @param {Object} sub - Sub-cluster object
     */
    window.showMacroClusterPanel = function (macro, sub) {
        if (!macroClusterPanel) init();
        _hideLeftPanels();
        if (!_hasOpenCluster()) _hideRightStack();
        setMinimizedPanelVisible(true);

        if (macro) {
            const description_el = macroClusterPanel.querySelector('.panel-description');
            _setupEditableDesc(description_el, macro, 'Describe this space…');
        }

        if (sub) {
            const descriptions = macroClusterPanel.querySelectorAll('.panel-description');
            if (descriptions.length > 1) {
                _setupEditableDesc(descriptions[1], sub, 'Describe this cluster…');
            }
        }

        if (_userHiddenPanel) return; // user minimized — stay hidden
        if (macroClusterPanel) macroClusterPanel.classList.add('active');
        _setArrowVisible(false);
    };

    /**
     * Shows the expanded panel with email details, embedded emails, and connected threads
     * @param {Object} macro - Macro cluster object
     * @param {Object} sub - Sub-cluster object
     * @param {Object} emailNode - Email node object
     * @param {Array} crossLinks - Cross-linked emails for this sub-cluster
     */
    window.showExpandedPanel = function (macro, sub, emailNode, crossLinks) {
        if (!expandedPanel) init();
        _hideLeftPanels(); // right stack managed separately by showClusterPanel
        setMinimizedPanelVisible(true);

        if (macro && sub) {
            const descriptions = expandedPanel.querySelectorAll('.panel-description');

            if (descriptions.length > 0) {
                _setupEditableDesc(descriptions[0], macro, 'Describe this space…');
            }
            if (descriptions.length > 1) {
                _setupEditableDesc(descriptions[1], sub, 'Describe this cluster…');
            }
        }

        // Render embedded emails from this sub-cluster
        _renderEmbeddedEmails(expandedPanel, sub);

        // Render connected email threads from cross-links
        _renderConnectedThreads(expandedPanel, sub, crossLinks);

        if (_userHiddenPanel) return; // user minimized — stay hidden
        if (expandedPanel) expandedPanel.classList.add('active');
        _setArrowVisible(false);
    };

    /**
     * Shows the email detail panel for a selected email
     * Hides the minimized panel to avoid overlap
     * @param {Object} emailData - Email object with subject, date, size, body
     */
    // ── Expanded email modal ──────────────────────────────────────────
    let _lastEmailData = null; // retain for modal population
    let _lastEmailNode = null; // retain for expand modal (highlights lookup)

    function _wireEmbeddedToggle() {
        const section = document.querySelector('.embedded-section');
        const btn     = document.querySelector('.embedded-toggle-btn');
        if (!section || !btn) return;

        btn.addEventListener('click', () => {
            const isCollapsed = section.classList.contains('collapsed');
            section.classList.toggle('collapsed', !isCollapsed);
            section.classList.toggle('expanded',   isCollapsed);
            btn.setAttribute('aria-expanded', String(isCollapsed));
            btn.title = isCollapsed ? 'Collapse embedded emails' : 'Expand embedded emails';
        });
    }

    function _wireExpandModal() {
        const modal       = document.getElementById('email-expanded-modal');
        const expandBtn   = document.getElementById('btn-expand-email');
        const collapseBtn = document.getElementById('btn-collapse-email');
        const notesEl     = document.getElementById('email-modal-notes');
        const bodyEl = document.getElementById('email-modal-body');
        if (!modal) return;

        // Body is contenteditable for colour highlights, but we block actual typing
        if (bodyEl) {
            bodyEl.addEventListener('keydown', e => {
                e.stopPropagation(); // prevent keys from reaching p5's canvas handler
                // Allow Ctrl/Cmd shortcuts (copy, select-all etc.) and Escape
                if (e.ctrlKey || e.metaKey || e.key === 'Escape') return;
                e.preventDefault(); // block all other keyboard input
            });
        }

        // ── Session-only state (cleared on page refresh) ──────────────
        const _emailNotes      = new Map(); // email_id → notes string
        const _emailHighlights = new Map(); // email_id → highlighted innerHTML
        // Exposed so archive.js can copy highlights when archiving
        window._emailHighlightsMap = _emailHighlights;

        let _expandId = null;

        // ── Per-highlight notes state ─────────────────────────────────
        const _hlPanelEl     = document.getElementById('email-modal-highlight-notes-panel');
        const _hlNotesEl     = document.getElementById('email-modal-highlight-notes');
        const _emailHLNotes  = new Map(); // email_id → Map<highlightId, {color, notes}>
        let _hlNotes         = new Map(); // highlight notes for the current email
        let _pendingRange    = null;      // selected-but-not-yet-highlighted range
        let _activeHLId      = null;      // ID of the highlight currently active/viewed
        let _lastHLColor     = '#F9FF8D'; // default / last-used colour

        // ── Notes auto-resize + save ───────────────────────────────────
        if (notesEl) {
            notesEl.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = this.scrollHeight + 'px';
                if (_expandId) _emailNotes.set(_expandId, this.value);
            });
        }

        // ── Highlight Notes helpers ───────────────────────────────────
        function _uuid() {
            return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        }

        function _updateHLSwatchActive(color) {
            if (!_hlPanelEl) return;
            _hlPanelEl.querySelectorAll('.color-swatch[data-color]').forEach(btn => {
                btn.classList.toggle('active-color', btn.dataset.color === color);
            });
        }

        function _showHLPanel(color) {
            if (_hlPanelEl) _hlPanelEl.classList.add('active');
            _updateHLSwatchActive(color || null);
        }

        function _hideHLPanel() {
            if (_hlPanelEl) _hlPanelEl.classList.remove('active');
            _pendingRange = null;
            _activeHLId   = null;
        }

        function _saveHighlights() {
            if (!_expandId || !bodyEl) return;
            _emailHighlights.set(_expandId, bodyEl.innerHTML);
            _emailHLNotes.set(_expandId, _hlNotes);
        }

        // Create a <mark> with a unique ID around the given range; returns the id or null
        function _doHighlight(range, color) {
            if (!range || range.collapsed) return null;
            const id   = _uuid();
            const mark = document.createElement('mark');
            mark.style.backgroundColor = color;
            mark.style.borderRadius    = '2px';
            mark.style.padding         = '0 1px';
            mark.dataset.highlightId   = id;
            try {
                const fragment = range.extractContents();
                mark.appendChild(fragment);
                range.insertNode(mark);
            } catch (e) { return null; }
            _hlNotes.set(id, { color, notes: '' });
            _saveHighlights();
            return id;
        }

        // Apply a highlight using _pendingRange or the live selection; return id or null
        function _applyHighlight(color) {
            let range = _pendingRange;
            if (!range) {
                const sel = window.getSelection();
                if (sel && sel.rangeCount && !sel.isCollapsed) {
                    const r = sel.getRangeAt(0);
                    if (bodyEl && bodyEl.contains(r.commonAncestorContainer)) {
                        range = r.cloneRange();
                    }
                }
            }
            if (!range) return null;
            _lastHLColor = color;
            const id = _doHighlight(range, color);
            if (id) {
                _pendingRange = null;
                _activeHLId   = id;
            }
            return id;
        }

        // ── Open expanded view ─────────────────────────────────────────
        window.openEmailExpanded = function (emailData, node) {
            if (!emailData) return;
            _expandId   = emailData._emailId || null;
            // node used directly below, no separate storage needed

            // Restore per-email highlight notes; hide panel until user interacts
            _hlNotes = (_expandId && _emailHLNotes.get(_expandId)) || new Map();
            _hideHLPanel();

            // Subject
            const subj = modal.querySelector('.email-modal-subject');
            if (subj) subj.textContent = emailData.subject || '(no subject)';

            // Meta
            const dateEl2 = modal.querySelector('.email-modal-date');
            const sizeEl2 = modal.querySelector('.email-modal-size');
            if (dateEl2) dateEl2.textContent = emailData.date || 'Unknown';
            if (sizeEl2) {
                const kb = emailData.size_kb, at = emailData.attachment;
                sizeEl2.textContent = kb ? (at ? `${at}  ·  ${_fmtKb(kb)}` : _fmtKb(kb)) : (emailData.size || '—');
            }

            // Body — apply saved highlights if any
            if (bodyEl) {
                const archiveHL = node && node._highlights;
                const mapHL     = _expandId && _emailHighlights.get(_expandId);
                if (mapHL || archiveHL) {
                    bodyEl.innerHTML = mapHL || archiveHL;
                } else {
                    // Escape then render newlines — safe plain text
                    bodyEl.innerHTML = (emailData.body || '')
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        .replace(/\n/g, '<br>');
                }
            }

            // Notes
            if (notesEl) {
                notesEl.value = (_expandId && _emailNotes.get(_expandId)) || '';
                notesEl.style.height = 'auto';
                notesEl.style.height = (notesEl.scrollHeight || 80) + 'px';
            }

            modal.classList.add('active');
        };

        // ── Close expanded view ────────────────────────────────────────
        window.closeEmailExpanded = function () {
            _hideHLPanel();
            modal.classList.remove('active');
            _expandId = null;
        };

        // ── Right-panel colour swatches: apply or recolour highlights ─
        // pointerdown + preventDefault keeps the text selection alive so
        // the range is still valid when we create the mark.
        document.querySelectorAll('#email-modal-colors-panel .color-swatch[data-color]').forEach(btn => {
            btn.addEventListener('pointerdown', e => {
                e.preventDefault();
                const color = btn.dataset.color;
                if (_activeHLId) {
                    // Change colour of the currently active highlight
                    const mark = bodyEl && bodyEl.querySelector(`mark[data-highlight-id="${_activeHLId}"]`);
                    if (mark) {
                        mark.style.backgroundColor = color;
                        const data = _hlNotes.get(_activeHLId) || { notes: '' };
                        data.color = color;
                        _hlNotes.set(_activeHLId, data);
                        _lastHLColor = color;
                        _saveHighlights();
                        _updateHLSwatchActive(color);
                    }
                } else {
                    const id = _applyHighlight(color);
                    if (id) _showHLPanel(color);
                }
            });
        });

        // ── Body: detect text selection ───────────────────────────────
        if (bodyEl) {
            bodyEl.addEventListener('mouseup', () => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount && !sel.isCollapsed) {
                    const r = sel.getRangeAt(0);
                    if (bodyEl.contains(r.commonAncestorContainer)) {
                        _pendingRange = r.cloneRange();
                        _activeHLId   = null;
                        if (_hlNotesEl) { _hlNotesEl.value = ''; _hlNotesEl.style.height = 'auto'; }
                        _showHLPanel(null);
                    }
                }
            });

            // Click on a highlight → open its notes; click elsewhere → close panel
            bodyEl.addEventListener('click', e => {
                const mark = e.target.closest('mark[data-highlight-id]');
                if (mark && bodyEl.contains(mark)) {
                    _activeHLId   = mark.dataset.highlightId;
                    _pendingRange = null;
                    window.getSelection()?.removeAllRanges();
                    const data = _hlNotes.get(_activeHLId);
                    if (_hlNotesEl) {
                        _hlNotesEl.value = data ? data.notes : '';
                        _hlNotesEl.style.height = 'auto';
                        _hlNotesEl.style.height = Math.max(60, _hlNotesEl.scrollHeight) + 'px';
                    }
                    _showHLPanel(data ? data.color : _lastHLColor);
                } else {
                    _hideHLPanel();
                }
            });
        }

        // ── Highlight Notes textarea: auto-highlight + save ───────────
        if (_hlNotesEl) {
            _hlNotesEl.addEventListener('input', function () {
                // First keystroke while text is selected → apply highlight automatically
                if (_pendingRange && !_activeHLId) {
                    const id = _applyHighlight(_lastHLColor);
                    if (id) _updateHLSwatchActive(_lastHLColor);
                }
                // Persist the typed note on the active highlight
                if (_activeHLId) {
                    const data = _hlNotes.get(_activeHLId) || { color: _lastHLColor, notes: '' };
                    data.notes = this.value;
                    _hlNotes.set(_activeHLId, data);
                    _saveHighlights();
                }
                this.style.height = 'auto';
                this.style.height = this.scrollHeight + 'px';
            });
        }

        // ── Button wiring ──────────────────────────────────────────────
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                window.openEmailExpanded?.(_lastEmailData, _lastEmailNode);
            });
        }
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => window.closeEmailExpanded?.());
        }
        // Backdrop click also closes
        modal.addEventListener('click', e => {
            if (e.target === modal) window.closeEmailExpanded?.();
        });
    }

    const showEmailDetailPanel = window.showEmailDetailPanel = function (emailData) {
        if (!emailDetailPanel) init();
        _showRightStack(true); // show stack + email panel

        // Hide minimized panel to avoid overlap
        setMinimizedPanelVisible(false);

        if (emailData) {
            _lastEmailData = emailData;              // retain for expand modal
            _lastEmailNode = emailData._node || null; // retain for highlights

            const subject_el = emailDetailPanel.querySelector('.email-subject');
            const date_el = emailDetailPanel.querySelector('.email-date');
            const size_el = emailDetailPanel.querySelector('.email-size');
            const body_el = emailDetailPanel.querySelector('.email-body');

            if (subject_el) subject_el.textContent = emailData.subject || '(no subject)';
            if (date_el) date_el.textContent = emailData.date || 'Unknown';
            if (body_el) body_el.textContent = emailData.body || '';

            // Format size with attachment type
            if (size_el) {
                const kb = emailData.size_kb;
                const att = emailData.attachment;
                if (kb) {
                    size_el.textContent = att
                        ? `${att}  ·  ${_fmtKb(kb)}`
                        : _fmtKb(kb);
                } else {
                    size_el.textContent = emailData.size || 'Unknown';
                }
            }
        }

        if (emailDetailPanel) emailDetailPanel.classList.add('active');
    };

    /**
     * Render embedded email thumbnails (floating and threaded emails in the sub-cluster)
     * @param {HTMLElement} panelEl - The expanded panel element
     * @param {Object} sub - Sub-cluster object with floating and threads
     */
    function _renderEmbeddedEmails(panelEl, sub) {
        if (!panelEl || !sub) return;

        const emailsGrid = panelEl.querySelector('.emails-grid');
        if (!emailsGrid) return;

        // Clear existing email nodes
        emailsGrid.innerHTML = '';

        if (!sub.floating && (!sub.threads || sub.threads.length === 0)) {
            return;
        }

        // Collect all nodes: floating first, then all threaded nodes
        let allNodes = [];

        if (sub.floating && Array.isArray(sub.floating)) {
            allNodes.push(...sub.floating);
        }

        if (sub.threads && Array.isArray(sub.threads)) {
            for (let thread of sub.threads) {
                if (thread.nodes && Array.isArray(thread.nodes)) {
                    allNodes.push(...thread.nodes);
                }
            }
        }

        // Show all emails; the grid scrolls when there are more than ~4 rows
        const total = allNodes.length;

        // Compute total data size for this sub-cluster
        const totalKb = allNodes.reduce((sum, n) => sum + (n.size_kb || 0), 0);
        const sizeStr = totalKb > 0 ? _fmtKb(totalKb) : '';

        // Update section title with count and data size
        const sectionTitle = panelEl.querySelector('.embedded-section .section-title');
        if (sectionTitle) {
            sectionTitle.textContent = total > 0
                ? (sizeStr ? `Embedded Emails · ${total} · ${sizeStr}` : `Embedded Emails · ${total}`)
                : 'Embedded Emails';
        }

        for (let i = 0; i < allNodes.length; i++) {
            const node = allNodes[i];
            const nodeEl = document.createElement('div');
            nodeEl.className = 'email-node';

            // Create canvas for email thumbnail
            const canvas = document.createElement('canvas');
            canvas.width = 52;
            canvas.height = 52;
            canvas.className = 'email-canvas';
            canvas._panelNode = node; // stored so refreshPanelCanvases can redraw cheaply

            // Draw email node on canvas using p5 rendering
            _drawEmailNodeOnCanvas(canvas, node);

            const label = document.createElement('p');
            label.className = 'email-label';
            label.textContent = `${i + 1}.`;

            nodeEl.appendChild(canvas);
            nodeEl.appendChild(label);
            emailsGrid.appendChild(nodeEl);
        }
    }

    /**
     * Draw an email node on a canvas element
     * Uses the same logic as drawEmailNode in emailNode.js but adapted for canvas context
     */
    function _drawEmailNodeOnCanvas(canvas, node) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Scale canvas buffer to device pixel ratio so arcs are sharp on retina
        const dpr = window.devicePixelRatio || 1;
        const CSS_SIZE = 52;
        if (canvas.width !== CSS_SIZE * dpr || canvas.height !== CSS_SIZE * dpr) {
            canvas.width = CSS_SIZE * dpr;
            canvas.height = CSS_SIZE * dpr;
            canvas.style.width = CSS_SIZE + 'px';
            canvas.style.height = CSS_SIZE + 'px';
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // reset + apply DPR scale

        const BASE_RADIUS = 26; // logical radius (CSS pixels)
        // Scale by simulated file size: 50 KB → 0.6× · 900 KB → 1.7×
        const sizeKb = node.size_kb || null;
        const _eMin = window.EMAIL_KB_MIN || 50, _eMax = window.EMAIL_KB_MAX || 900;
        const _sMin = window.EMAIL_SIZE_SCALE_MIN || 0.6, _sMax = window.EMAIL_SIZE_SCALE_MAX || 1.7;
        const sizeScale = sizeKb
            ? Math.min(_sMax * 1.1, Math.max(_sMin * 0.9,
                _sMin + Math.min(1, Math.max(0, (sizeKb - _eMin) / (_eMax - _eMin))) * (_sMax - _sMin)))
            : 1.0;
        const isSelected = (window._selectedEmailIds?.size > 0)
            ? window._selectedEmailIds.has(node.email_id)
            : (window._selectedEmailId != null && node.email_id === window._selectedEmailId);
        const NODE_RADIUS = Math.round(BASE_RADIUS * sizeScale * (isSelected ? 1.3 : 1.0));
        const MARGIN = 0.5;
        const age = node.age || 0.5;
        let seed = node.seed || Math.random();

        // Map age to visual properties.
        // Minimum 20 points so the blob always looks smoothly circular at panel size
        // (6 points produces a visible hexagon at 52 px display size).
        const NUM_POINTS = Math.max(20, Math.floor(age * 14 + 6));
        const BLOB_RATIO = age * 0.82 + 0.1; // 0.1-0.92
        const OUTER_ALPHA = Math.floor(age * 143 + 32); // 32-175

        ctx.clearRect(0, 0, CSS_SIZE, CSS_SIZE); // logical pixels (DPR handled by setTransform)

        // Translate to center
        ctx.save();
        ctx.translate(CSS_SIZE / 2, CSS_SIZE / 2); // logical centre

        const blobColor = node._threadColor || '#000000';

        // Very old nodes are solid circles
        if (age >= 0.95) {
            ctx.fillStyle = blobColor;
            ctx.beginPath();
            ctx.arc(0, 0, NODE_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        // Seeded random function
        const _seededRandom = (min, max) => {
            seed = (seed * 9301 + 49297) % 233280;
            const rnd = seed / 233280;
            return min + rnd * (max - min);
        };

        // Generate blob points using seeded random
        const base = NODE_RADIUS * BLOB_RATIO;
        const maxR = NODE_RADIUS - MARGIN;
        const pts = [];

        for (let i = 0; i < NUM_POINTS; i++) {
            const a = (i * Math.PI * 2 / NUM_POINTS) - Math.PI / 2;
            const r = Math.min(base * _seededRandom(0.92, 1.08), maxR);
            pts.push([Math.cos(a) * r, Math.sin(a) * r]);
        }

        // Draw outer dashed circle
        ctx.setLineDash([1, 1]);
        ctx.fillStyle = `rgba(215, 215, 215, ${OUTER_ALPHA})`;
        ctx.strokeStyle = 'rgb(160, 160, 160)';
        ctx.lineWidth = 0.25;
        ctx.beginPath();
        ctx.arc(0, 0, NODE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw solid blob shape
        ctx.fillStyle = blobColor;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    /**
     * Render connected email threads (emails from cross-linked sub-clusters)
     * @param {HTMLElement} panelEl - The expanded panel element
     * @param {Object} sub - Current sub-cluster object
     * @param {Array} crossLinks - Array of cross-link objects
     */
    function _renderConnectedThreads(panelEl, sub, crossLinks) {
        if (!panelEl || !sub) return;

        const threadsSection = panelEl.querySelector('.threads-section');
        const threadsDivider = threadsSection ? threadsSection.previousElementSibling : null;
        const threadsGrid = panelEl.querySelector('.threads-grid');
        if (!threadsGrid) return;
        threadsGrid.innerHTML = '';

        // Hide section when there are no cross-links at all
        if (!crossLinks || crossLinks.length === 0) {
            if (threadsSection) threadsSection.style.display = 'none';
            if (threadsDivider && threadsDivider.classList.contains('panel-divider')) {
                threadsDivider.style.display = 'none';
            }
            return;
        }

        // Show section (may have been hidden on a previous open)
        if (threadsSection) threadsSection.style.display = '';
        if (threadsDivider && threadsDivider.classList.contains('panel-divider')) {
            threadsDivider.style.display = '';
        }

        for (let cl of crossLinks) {
            const subIds = cl.sub_clusters.map(e => e.sub_id);
            if (!subIds.includes(sub.id)) continue;

            for (let entry of cl.sub_clusters) {
                if (entry.sub_id === sub.id) continue;

                const ref = window.findSubCluster ? window.findSubCluster(entry.sub_id) : null;
                const emailIdSet = new Set(entry.email_ids || []);
                let nodes = [];

                if (ref) {
                    for (let thread of (ref.sub.threads || [])) {
                        for (let node of (thread.nodes || [])) {
                            if (emailIdSet.has(node.email_id)) nodes.push(node);
                        }
                    }
                    for (let node of (ref.sub.floating || [])) {
                        if (emailIdSet.has(node.email_id)) nodes.push(node);
                    }
                }

                for (let node of nodes.slice(0, 2)) {
                    const nodeEl = document.createElement('div');
                    nodeEl.className = 'email-node';
                    nodeEl.style.cursor = 'pointer';

                    const canvas = document.createElement('canvas');
                    canvas.width = 52;
                    canvas.height = 52;
                    canvas.className = 'email-canvas';
                    _drawEmailNodeOnCanvas(canvas, node);

                    const label = document.createElement('p');
                    label.className = 'email-label';
                    const rawSubject = node.subject || cl.subject || '';
                    const cleanSubject = rawSubject.replace(/^(Re:|Fwd?:|FW:)\s*/gi, '').trim();
                    label.textContent = cleanSubject.length > 22 ? cleanSubject.slice(0, 22) + '…' : cleanSubject;

                    nodeEl.appendChild(canvas);
                    nodeEl.appendChild(label);
                    nodeEl.addEventListener('click', () => {
                        if (window.navigateToSubCluster) window.navigateToSubCluster(entry.sub_id);
                    });
                    threadsGrid.appendChild(nodeEl);
                }
            }
        }

        // Hide section if nothing was actually rendered for this sub-cluster
        if (threadsGrid.children.length === 0) {
            if (threadsSection) threadsSection.style.display = 'none';
            if (threadsDivider && threadsDivider.classList.contains('panel-divider')) {
                threadsDivider.style.display = 'none';
            }
        }
    }

    /**
     * Closes all panels
     */
    window.closePanel = function () {
        if (!expandedPanel) init();
        hideAllPanels();
        setMinimizedPanelVisible(true);
    };

    /**
     * Updates the minimized panel with count data
     * @param {number} emails - Total emails count
     * @param {number} clusters - Total clusters count
     * @param {number} macroClusters - Total macro clusters count
     */
    window.updateMinimisedPanel = function (emails, clusters, spaces, galaxies, dataSizeKb) {
        if (!emailsCount) init();

        if (typeof emails !== 'undefined') emailsCount.textContent = emails;
        if (typeof clusters !== 'undefined') clustersCount.textContent = clusters;
        if (typeof spaces !== 'undefined') macroClusterCount.textContent = spaces;
        if (typeof galaxies !== 'undefined' && galaxiesCount) galaxiesCount.textContent = galaxies;

        const dataEl = document.getElementById('data-size-value');
        if (dataEl && typeof dataSizeKb !== 'undefined' && dataSizeKb) {
            dataEl.textContent = _fmtKb(dataSizeKb);
        }
    };

    /**
     * Redraws existing email-canvas elements without rebuilding DOM.
     * Used by arrow-key email navigation to update the selection highlight cheaply.
     */
    window.refreshPanelCanvases = function () {
        if (!expandedPanel) return;
        expandedPanel.querySelectorAll('.email-canvas').forEach(c => {
            if (c._panelNode) _drawEmailNodeOnCanvas(c, c._panelNode);
        });
    };

    /**
     * Legacy function for backward compatibility
     */
    window.openEmailPanel = function (data) {
        if (!emailDetailPanel) init();

        if (data) {
            showEmailDetailPanel(data);
        }
    };

    /**
     * Legacy function for backward compatibility
     */
    window.closeEmailPanel = function () {
        window.closePanel();
    };

    /**
     * Legacy function for backward compatibility with showClusterHover
     */
    window.showClusterHover = function (title, description, type) {
        // No-op for now - functionality integrated into main panel states
    };

    /**
     * Legacy function for backward compatibility
     */
    window.hideClusterHover = function () {
        // No-op for now
    };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
let GALAXIES = [];
let MACROS   = [];
let CROSS_LINKS = [];

// ── Background colour animation ───────────────────────────────────
const _BG_THEMES   = [28,  28,  28];   // #1C1C1C – galaxy / Theme picker
const _BG_SPACES   = [47,  47,  47];   // #2F2F2F – Spaces overview
const _BG_CLUSTERS = [245, 245, 245];  // #F5F5F5 – cluster / email view
let _bgCurrent = [28, 28, 28]; // mutable copy — will be corrected in setup()
let _bgTarget  = _BG_THEMES;   // reference to a constant array
let _bgTitleState = ''; // last state pushed to the DOM
let _vizData;
let _emailsData;
let _emailsById = null;

let HAS_GALAXY_LEVEL = false;
let _activeGalaxy    = null;   // null = galaxy picker screen; set = inside that galaxy
let _hoveredGalaxyIdx = -1;    // index in GALAXIES under mouse (picker screen)

// sub_id -> { macro, sub } for fast cross-link lookups
let _subById = {};
let _hoveredClusterKey = null;
let _clusterHoverPinned = false;
let _hoveredGalaxy = null;
let _hoveredMacro = null;
let _hoveredSub = null;   // explicit hover only (drives the canvas label)
let _panelSub = null;     // nearest sub for panel display (explicit hover OR auto-proximity)
let _selectedEmailId  = null;
let _selectedEmailIds = new Set(); // multi-selection for Split (Shift+click)
// Full selection context for delete operations (reset on panel close)
let _selectedNode  = null;
let _selectedSub   = null;
let _selectedMacro = null;
// Single-level undo for delete operations
let _lastDeleteAction = null;
// Selected ring (independent of email selection)
let _selectedRingIdx   = null;
let _selectedRingSub   = null;
let _selectedRingMacro = null;

// Camera state
let camX = 0, camY = 0, camZoom = 1;
let _dragStartX = 0, _dragStartY = 0, _hasDragged = false;
let _prevDragX = 0, _prevDragY = 0;
let _isPanning = false;
let _rightClickPanning = false;
let _wheelPanTimeout = null;

const DRAG_THRESHOLD = 14;
const PAN_SPEED = 1.0;
const ZOOM_IN = 1.04;
const ZOOM_OUT = 0.96;

// Smooth scroll zoom
let _zoomTarget = 1;
let _zoomAnchorWX = 0, _zoomAnchorWY = 0; // world point to keep fixed
let _zoomAnchorSX = 0, _zoomAnchorSY = 0; // screen point it maps to
let _isZooming = false;
const ZOOM_LERP = 0.10; // fraction to close per frame (~60fps → smooth ~500ms settle)

// Camera animation
let _animTarget = null; // { x, y, zoom }
let _animFrom = null; // { x, y, zoom, t }
const ANIM_DURATION     = 500; // ms — click-based zoom animations
const NAV_ANIM_DURATION = 280; // ms — arrow-key pan between clusters

// Edge scrolling
const EDGE_SCROLL_ZONE = 130;  // px band at each screen edge that triggers pan
const EDGE_SCROLL_SPEED = 20;   // max pan speed in screen-space px per frame
let _edgePanVX = 0, _edgePanVY = 0;
let _isEdgeScrolling = false;

// WASD panning
const WASD_SPEED = 20; // screen-space px per frame (faster than edge scroll — intentional input)
let _wasdActive = false;
let _arrowZoomActive = false;

// All ports now use the galaxy version (cluster_structure.json).
// To revert to the old 8-macro Gemma version, change the file below.
const VIZ_DATA_FILE = '../output/cluster_structure.json';

function preload() {
  _vizData = loadJSON(VIZ_DATA_FILE);
  // Galaxy mode lazy-loads email content per cluster — no upfront bulk load needed
}

// Expose panning state for renderers to skip expensive effects
function isPanning() { return _isPanning || _isEdgeScrolling || _isZooming; }

// Stop the draw loop only when nothing needs continuous frames
function _maybePauseLoop() {
  const bgDone   = _bgCurrent.every((c, i) => Math.abs(c - _bgTarget[i]) < 0.5);
  const animDone = !MACROS || !MACROS.some(m => m.subClusters.some(s => s._openAnimStart != null));
  if (!_isEdgeScrolling && !_animTarget && !_isPanning && !_wasdActive && !_arrowZoomActive && bgDone && animDone) noLoop();
}

// Updates _bgTarget based on current navigation state and syncs the breadcrumb DOM.
// Called once per draw frame; only touches the DOM when the state key changes.
function _syncViewBackground() {
  const inGalaxyPicker = HAS_GALAXY_LEVEL && !_activeGalaxy;
  const openMacro      = !inGalaxyPicker && MACROS.find(m => m.open);
  const openSub        = openMacro && openMacro.subClusters.find(s => s.open);

  const newTarget = inGalaxyPicker ? _BG_THEMES : openMacro ? _BG_CLUSTERS : _BG_SPACES;

  // Include email-selection in the state key so the label updates reactively
  // when the user selects / deselects emails within the same sub-cluster.
  const _multiSel  = openSub && (_selectedEmailIds?.size || 0) > 1;
  const _singleSel = openSub && !!_selectedEmailId;
  const _emailSuffix = _multiSel ? ':emails' : _singleSel ? ':email' : '';

  const newState = inGalaxyPicker ? 'themes'
    : openSub   ? `cluster:${openSub.id}${_emailSuffix}`
    : openMacro ? `clusters:${openMacro.id}`
    : `spaces:${_activeGalaxy ? _activeGalaxy.id : ''}`;

  if (newTarget !== _bgTarget) { _bgTarget = newTarget; loop(); }

  if (newState !== _bgTitleState) {
    _bgTitleState = newState;
    document.body.classList.toggle('view-clusters',     !!openMacro);
    document.body.classList.toggle('view-sub-cluster', !!openSub);

    const bcEl    = document.getElementById('view-breadcrumb');
    const labelEl = document.getElementById('view-label');
    if (!bcEl || !labelEl) return;

    const sep = '  /  ';
    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (inGalaxyPicker) {
      bcEl.textContent    = '';
      labelEl.textContent = 'Themes';
    } else if (!openMacro) {
      bcEl.textContent    = _activeGalaxy ? (_activeGalaxy.title || '') : '';
      labelEl.textContent = 'Spaces';
    } else if (!openSub) {
      const parts = [];
      if (_activeGalaxy) parts.push(_activeGalaxy.title || '');
      parts.push(openMacro.title || '');
      bcEl.textContent    = parts.join(sep);
      labelEl.textContent = 'Clusters';
    } else {
      const htmlParts = [];
      if (_activeGalaxy) htmlParts.push(`<span>${esc(_activeGalaxy.title)}</span>`);
      htmlParts.push(`<span>${esc(openMacro.title)}</span>`);
      htmlParts.push(`<span class="bc-current">${esc(openSub.title)}</span>`);
      bcEl.innerHTML = htmlParts.join(sep);
      // Label reflects email-selection state within the cluster
      labelEl.textContent = _multiSel ? 'Emails' : _singleSel ? 'Email' : 'Cluster';
    }
  }
}

function setup() {
  const _canvas = createCanvas(windowWidth, windowHeight);
  _canvas.elt.addEventListener('contextmenu', e => e.preventDefault());
  noLoop();
  frameRate(60);

  HAS_GALAXY_LEVEL = !!(_vizData.galaxies);

  if (HAS_GALAXY_LEVEL) {
    GALAXIES = _vizData.galaxies.map(g => Object.assign({}, g, {
      macros: g.macros.map(m => Object.assign({}, m, {
        subClusters: (m.subClusters || []).map(s => Object.assign(
          { open: false, rx: 0, ry: 0, _emailsLoaded: false, threads: [], floating: [] }, s
        ))
      }))
    }));
    CROSS_LINKS = _vizData.cross_links || [];
    // Show galaxy picker — no macro layout needed yet
    _activeGalaxy = null;
    _showBackButton(false);

  } else {
    // Legacy 2-level mode
    MACROS = _vizData.macros.map(m => Object.assign({ open: false, rx: 0, ry: 0 }, m, {
      subClusters: m.subClusters.map(s => Object.assign({ open: false, rx: 0, ry: 0 }, s))
    }));
    for (let macro of MACROS) {
      for (let sub of macro.subClusters) _subById[sub.id] = { macro, sub };
    }
    for (let macro of MACROS) assignSubClusterPositions(macro);
    assignMacroPositions(MACROS);
    CROSS_LINKS = _vizData.cross_links || [];
    _fitMacrosInView();
  }

  updateMinimisedPanel(
    _vizData.email_count,
    _vizData.sub_cluster_count,
    _vizData.macro_count,
    _vizData.galaxy_count,
    _vizData.total_data_size_kb
  );
  window.CarbonModule?.init(_vizData.email_count || 0);

  // Initialise background to the correct starting state (no lerp flash on load)
  if (HAS_GALAXY_LEVEL && !_activeGalaxy) {
    _bgCurrent = [..._BG_THEMES]; _bgTarget = _BG_THEMES;
  } else {
    _bgCurrent = [..._BG_SPACES]; _bgTarget = _BG_SPACES;
  }
}

// Enter a galaxy: build its macro constellation and switch to constellation view
function _enterGalaxy(galaxy) {
  _activeGalaxy = galaxy;

  // Reset state
  MACROS = [];
  _subById = {};
  camX = 0; camY = 0; camZoom = 1; _zoomTarget = 1;
  closePanel();
  _clusterHoverPinned = false;
  _hoveredClusterKey = null;
  _hoveredMacro = null;
  _hoveredSub = null;

  // Build macros from this galaxy
  for (let m of galaxy.macros) {
    let macro = Object.assign({ open: false, rx: 0, ry: 0 }, m);
    macro.subClusters = (m.subClusters || []).map(s => Object.assign(
      { open: false, rx: 0, ry: 0, _emailsLoaded: false, threads: [], floating: [] }, s
    ));
    MACROS.push(macro);
    for (let sub of macro.subClusters) _subById[sub.id] = { macro, sub };
  }

  // Use the compact concentric-ring layout (same as galaxy picker view uses)
  // instead of the large phyllotaxis spiral — keeps world coordinates small
  // so camera travel during animations stays visible and not teleport-like.
  assignMacroPositionsInGalaxy({ macros: MACROS });
  _fitMacrosInView();

  _showBackButton(true);
  loop(); // trigger one draw, then noLoop() in _maybePauseLoop
  redraw();
}

function _fitMacrosInView() {
  let maxDist = 0;
  for (let m of MACROS) {
    maxDist = max(maxDist, sqrt(m.rx * m.rx + m.ry * m.ry) + MACRO_RADIUS);
  }
  if (maxDist > 0) {
    camZoom = min(1, (min(width, height) * 0.42) / maxDist);
    _zoomTarget = camZoom;
  }
}

function _showBackButton(visible) {
  document.querySelectorAll('.panel-back-btn').forEach(el => {
    el.classList.toggle('visible', visible);
  });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}

function draw() {
  if (_animTarget) {
    const t = constrain((millis() - _animFrom.t) / (_animFrom.dur || ANIM_DURATION), 0, 1);
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // quadratic ease in-out
    camX = lerp(_animFrom.x, _animTarget.x, e);
    camY = lerp(_animFrom.y, _animTarget.y, e);
    camZoom = lerp(_animFrom.zoom, _animTarget.zoom, e);
    if (t >= 1) {
      _animTarget = null;
      _zoomTarget = camZoom; // keep smooth zoom in sync after programmatic anim
      _maybePauseLoop();
    }
  } else if (_isZooming) {
    const remaining = abs(camZoom - _zoomTarget);
    if (remaining > 0.005) { // threshold to avoid endless lerp when very close
      camZoom = lerp(camZoom, _zoomTarget, ZOOM_LERP);
    } else {
      camZoom = _zoomTarget;
      _isZooming = false; // pan ends zooming, but keep loop running for potential pan follow-up
      _maybePauseLoop();
    }
    // Keep the anchor world point fixed under its screen position
    camX = _zoomAnchorSX - width / 2 - _zoomAnchorWX * camZoom;
    camY = _zoomAnchorSY - height / 2 - _zoomAnchorWY * camZoom;
  } else if (_edgePanVX !== 0 || _edgePanVY !== 0) {
    camX += _edgePanVX;
    camY += _edgePanVY;
  }

  if (_wasdActive) {
    if (keyIsDown(65)) camX += WASD_SPEED; // A — pan left
    if (keyIsDown(68)) camX -= WASD_SPEED; // D — pan right
    if (keyIsDown(87)) camY += WASD_SPEED; // W — pan up
    if (keyIsDown(83)) camY -= WASD_SPEED; // S — pan down
  }

  if (_arrowZoomActive) {
    const zoomIn  = keyIsDown(UP_ARROW);
    const zoomOut = keyIsDown(DOWN_ARROW);
    if (zoomIn || zoomOut) {
      _zoomAnchorSX = width  / 2;
      _zoomAnchorSY = height / 2;
      _zoomAnchorWX = -camX / camZoom;
      _zoomAnchorWY = -camY / camZoom;
      _zoomTarget   = constrain(_zoomTarget * (zoomIn ? 1.008 : 0.992), 0.1, 5);
      _isZooming    = true;
    }
  }

  // Lerp background colour toward target; ~0.1 per frame ≈ 400 ms transition
  for (let i = 0; i < 3; i++) {
    _bgCurrent[i] = lerp(_bgCurrent[i], _bgTarget[i], 0.10);
    if (Math.abs(_bgCurrent[i] - _bgTarget[i]) < 0.5) _bgCurrent[i] = _bgTarget[i];
  }
  background(_bgCurrent[0], _bgCurrent[1], _bgCurrent[2]);

  // Sync title + background target BEFORE any early return so every navigation
  // level (Themes picker, Spaces, Clusters) always updates the state.
  _syncViewBackground();

  // ── Galaxy picker (full-screen tiled panels) ──────────────────────
  if (HAS_GALAXY_LEVEL && !_activeGalaxy) {
    _drawGalaxyPicker();
    return;
  }

  // ── Macro constellation (existing rendering) ──────────────────────
  translate(width / 2 + camX, height / 2 + camY);
  scale(camZoom);

  // Determine focus state for dimming
  const _focusMacro = MACROS.find(m => m.open) || null;
  const _focusSub   = _focusMacro
    ? (_focusMacro.subClusters.find(s => s.open) || null)
    : null;
  if (_focusSub) window._maybeShowNavHint?.();

  for (let macro of MACROS) {
    const macroActive = !_focusMacro || macro === _focusMacro;
    const macroAlpha  = macroActive ? 1.0 : 0.12;

    if (macro.open) {
      push();
      translate(macro.rx, macro.ry);
      for (let sub of macro.subClusters) {
        // Pass macro world position so +/− buttons can compute their hit-test coords
        sub._macroWorld = { x: macro.rx, y: macro.ry };
        const subActive    = macroActive && (!_focusSub || sub === _focusSub);
        // While drag is active, the hover-target cluster renders at full alpha
        // so it visually "comes forward" like a Finder folder being hovered over
        const isDragTarget = _threadDrag.active &&
                             (sub === _dragHoverCluster || sub === _threadDrag.hoverSub);
        drawingContext.globalAlpha = (subActive || isDragTarget) ? 1.0 : 0.18;
        drawSubClusterSystem(sub);
      }
      drawingContext.globalAlpha = 1.0;
      pop();
    }

    drawingContext.globalAlpha = macroAlpha;
    drawMacroCluster(macro.rx, macro.ry, macro.size, macro.age);
    drawingContext.globalAlpha = 1.0;
  }

  _drawCrossLinks();
  drawThreadDragOverlay(); // balloon cluster drawn last so it's on top
}

// ── GALAXY / THEME PICKER ─────────────────────────────────────────
// Radii are proportional to each theme's data_size_kb so a theme with
// twice the data appears twice as large (linear radius = double diameter).
// No hover scaling, no text labels — title + data shown in cursor pill.

function _fmtSize(kb) {
  if (!kb || kb <= 0) return '';
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb >= 1024)        return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

function _drawGalaxyPicker() {
  const n   = GALAXIES.length;
  if (n === 0) return;
  const ctx = drawingContext;

  // Flower ring: n equal circles packed tightly in a ring, no centre item.
  // Reserve the top area for the "Themes" title; shift the ring centre down.
  const margin        = 20;
  const titleBottom   = 90; // px from top — clears breadcrumb + "Themes" label
  const halfX         = width  / 2 - margin;
  const halfY         = (height - titleBottom) / 2 - margin;
  const halfScreen    = Math.min(halfX, halfY);
  const cy            = height / 2 + titleBottom / 2; // shift centre below title

  let R, ringR;
  if (n === 1) {
    R = halfScreen * 0.45;
    ringR = 0;
  } else {
    const sinPN = Math.sin(Math.PI / n);
    const gap   = 10; // px gap between adjacent circle edges
    R     = Math.max(20, (halfScreen - gap / (2 * sinPN)) * sinPN / (1 + sinPN));
    ringR = (R + gap / 2) / sinPN;
  }

  // Equal-angle positions starting from the top (−π/2)
  const positions = [];
  const radii     = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * (2 * Math.PI / n);
    positions.push({ x: width / 2 + Math.cos(a) * ringR,
                     y: cy         + Math.sin(a) * ringR });
    radii.push(R);
  }

  window._gpPos   = positions;
  window._gpR     = R;
  window._gpRadii = radii;

  for (let i = 0; i < n; i++) {
    const g   = GALAXIES[i];
    const { x, y } = positions[i];
    const r   = radii[i]; // no hover size change
    const hov = i === _hoveredGalaxyIdx;

    // Solid white fill circle — shrinks with age
    const age    = g.age !== undefined ? g.age : 0.6;
    const solidR = r * (0.10 + age * 0.75);
    ctx.beginPath();
    ctx.arc(x, y, solidR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${hov ? 1.0 : 0.85})`;
    ctx.fill();

    // Bin icon for the Trash galaxy
    if (g.id === window._TRASH_GALAXY_ID) {
      const paths = window._getTrashBinPaths?.();
      if (paths) {
        const iconScale = solidR * 0.54 / 52; // scale to fit inside solid circle
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(iconScale, iconScale);
        ctx.translate(-23.5, -26); // centre the 47×52 SVG
        ctx.fillStyle = `rgba(28,28,28,${hov ? 0.75 : 0.55})`;
        for (const p of paths) ctx.fill(p);
        ctx.restore();
      }
    }

    // Document icon for the Archive galaxy
    if (g.id === window._ARCHIVE_GALAXY_ID) {
      const paths = window._getArchiveIconPaths?.();
      if (paths) {
        const iconScale = solidR * 0.54 / 52; // scale to fit inside solid circle
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(iconScale, iconScale);
        ctx.translate(-22, -26); // centre the 44×52 SVG
        ctx.fillStyle = `rgba(28,28,28,${hov ? 0.75 : 0.55})`;
        ctx.fill(paths.body, 'evenodd');
        ctx.fill(paths.foldBlack);
        ctx.fillStyle = `rgba(255,255,255,${hov ? 1.0 : 0.85})`;
        ctx.fill(paths.foldWhite);
        ctx.fill(paths.indicator);
        ctx.restore();
      }
    }

    // Dashed ring — proportional dash/gap, hard (butt) caps
    const dashLen = r * 0.18;
    const gapLen  = r * 0.08;
    const prevCap = ctx.lineCap;
    ctx.setLineDash([dashLen, gapLen]);
    ctx.lineCap     = 'butt';
    ctx.strokeStyle = `rgba(255,255,255,${hov ? 0.85 : 0.55})`;
    ctx.lineWidth   = 1.0;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = prevCap;
  }
}

function _galaxyCellAt(mx, my) {
  const positions = window._gpPos;
  const radii     = window._gpRadii;
  if (!positions) return -1;
  for (let i = 0; i < positions.length; i++) {
    const r  = radii ? radii[i] : (window._gpR || 0);
    const dx = mx - positions[i].x;
    const dy = my - positions[i].y;
    if (dx * dx + dy * dy < r * r * 1.1) return i;
  }
  return -1;
}

// ── HOVER TITLE LABEL ────────────────────────────────────────────

function _drawHoverLabel() {
  if (!_hoveredMacro) return;
  // Don't show hover label when the sub-cluster is already open (title renders above the ring)
  if (_hoveredSub && _hoveredSub.open) return;

  let worldX, worldY, clearanceR;

  if (_hoveredSub) {
    worldX = _hoveredMacro.rx + _hoveredSub.rx;
    worldY = _hoveredMacro.ry + _hoveredSub.ry;
    clearanceR = getSubClusterRadius(_hoveredSub.size);
  } else {
    worldX = _hoveredMacro.rx;
    worldY = _hoveredMacro.ry;
    clearanceR = MACRO_RADIUS;
  }

  const sx = worldX * camZoom + width / 2 + camX;
  const sy = worldY * camZoom + height / 2 + camY - clearanceR * camZoom - 6; // 6px above the cluster edge

  const label = _hoveredSub ? (_hoveredSub.title || '') : (_hoveredMacro.title || '');
  if (!label) return;

  const ctx = drawingContext;
  ctx.save();
  ctx.resetTransform();
  const pd = pixelDensity();
  ctx.scale(pd, pd);
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#000000';
  ctx.fillText(label, sx, sy);
  ctx.restore();
}

// ── CROSS-LINK LINES ─────────────────────────────────────────────

function _drawCrossLinks() {
  // Build email_id -> node map from all cached nodes
  let nodeByEmailId = {};
  for (let macro of MACROS) {
    for (let sub of macro.subClusters) {
      if (!sub.open) continue;
      for (let node of sub.floating) {
        if (node._wx !== undefined) nodeByEmailId[node.email_id] = node;
      }
      for (let thread of sub.threads) {
        for (let node of thread.nodes) {
          if (node._wx !== undefined) nodeByEmailId[node.email_id] = node;
        }
      }
    }
  }

  drawingContext.save();
  drawingContext.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  drawingContext.lineWidth = 0.4;

  for (let cl of CROSS_LINKS) {
    let anchors = [];
    for (let entry of cl.sub_clusters) {
      let ref = _subById[entry.sub_id];
      if (!ref || !ref.sub.open) continue;

      let ox = ref.macro.rx + ref.sub.rx;
      let oy = ref.macro.ry + ref.sub.ry;

      let nodes = entry.email_ids
        .map(id => nodeByEmailId[id])
        .filter(n => n !== undefined);

      let avgAngle;
      if (nodes.length > 0) {
        // Aim toward the average angle of the relevant email nodes
        let sumSin = 0, sumCos = 0;
        for (let n of nodes) {
          let dx = n._wx - ox, dy = n._wy - oy;
          let a = atan2(dy, dx);
          sumSin += sin(a);
          sumCos += cos(a);
        }
        avgAngle = atan2(sumSin, sumCos);
      } else {
        // Nodes not cached yet — aim toward the other sub-cluster centre so
        // the line still draws during navigation transitions
        let other = cl.sub_clusters.find(e => e.sub_id !== entry.sub_id);
        let otherRef = other ? _subById[other.sub_id] : null;
        if (otherRef) {
          avgAngle = atan2(
            otherRef.macro.ry + otherRef.sub.ry - oy,
            otherRef.macro.rx + otherRef.sub.rx - ox
          );
        } else {
          avgAngle = 0;
        }
      }

      // Store angle so we can compute the ring tangent when drawing
      anchors.push({
        x: ox + cos(avgAngle) * NODE_ORBIT_RADIUS,
        y: oy + sin(avgAngle) * NODE_ORBIT_RADIUS,
        angle: avgAngle
      });
    }

    for (let i = 0; i < anchors.length - 1; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        let a = anchors[i], b = anchors[j];

        // Tangent to the orbit ring at a: perpendicular to radius, pick the
        // half that faces toward b so the curve exits in the right direction.
        let tAx = -Math.sin(a.angle), tAy = Math.cos(a.angle);
        if ((b.x - a.x) * tAx + (b.y - a.y) * tAy < 0) { tAx = -tAx; tAy = -tAy; }

        // Tangent at b, facing toward a
        let tBx = -Math.sin(b.angle), tBy = Math.cos(b.angle);
        if ((a.x - b.x) * tBx + (a.y - b.y) * tBy < 0) { tBx = -tBx; tBy = -tBy; }

        // Control points: walk along each tangent by ~35% of chord length
        let chord = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
        let pull = chord * 0.35;
        let cx1 = a.x + tAx * pull, cy1 = a.y + tAy * pull;
        let cx2 = b.x + tBx * pull, cy2 = b.y + tBy * pull;

        // Dashed cubic bezier — exits ring tangentially on both ends
        drawingContext.setLineDash([3, 5]);
        drawingContext.beginPath();
        drawingContext.moveTo(a.x, a.y);
        drawingContext.bezierCurveTo(cx1, cy1, cx2, cy2, b.x, b.y);
        drawingContext.stroke();
        drawingContext.setLineDash([]);

        // Midpoint of cubic bezier at t=0.5
        // B(0.5) = (1/8)*a + (3/8)*ctrl1 + (3/8)*ctrl2 + (1/8)*b
        let midX = 0.125 * a.x + 0.375 * cx1 + 0.375 * cx2 + 0.125 * b.x;
        let midY = 0.125 * a.y + 0.375 * cy1 + 0.375 * cy2 + 0.125 * b.y;

        // Tangent at t=0.5: B'(0.5) ∝ (cx2 + b - cx1 - a)
        let ttx = cx2 + b.x - cx1 - a.x;
        let tty = cx2 + b.y - cy1 - a.y;
        let ttLen = Math.sqrt(ttx * ttx + tty * tty);
        ttx /= ttLen; tty /= ttLen;

        // Chevron arrow at midpoint — two arms ±30° from backward direction
        let arrowLen = 5;
        let cosA = Math.cos(Math.PI / 6), sinA = Math.sin(Math.PI / 6);
        let arm1X = (-ttx) * cosA - (-tty) * sinA;
        let arm1Y = (-ttx) * sinA + (-tty) * cosA;
        let arm2X = (-ttx) * cosA + (-tty) * sinA;
        let arm2Y = ttx * sinA + (-tty) * cosA;

        drawingContext.beginPath();
        drawingContext.moveTo(midX, midY);
        drawingContext.lineTo(midX + arm1X * arrowLen, midY + arm1Y * arrowLen);
        drawingContext.stroke();

        drawingContext.beginPath();
        drawingContext.moveTo(midX, midY);
        drawingContext.lineTo(midX + arm2X * arrowLen, midY + arm2Y * arrowLen);
        drawingContext.stroke();
      }
    }
  }

  drawingContext.restore();
}

// ── HOVER HELPERS ───────────────────────────────────────────────

function _updateClusterHover(mx, my) {
  let hoverMacro = null;
  let hoverSub = null;   // explicit: mouse is directly over this sub
  let nearestSub = null; // auto-proximity: closest sub in the open macro
  let hoverKey = null;

  // 1. Explicit sub-cluster hover (mouse within radius)
  for (let macro of MACROS) {
    if (!macro.open) continue;
    let dx0 = mx - macro.rx, dy0 = my - macro.ry;
    for (let sub of macro.subClusters) {
      let sx = dx0 - sub.rx, sy = dy0 - sub.ry;
      if (sqrt(sx * sx + sy * sy) < getSubClusterRadius(sub.size)) {
        hoverMacro = macro;
        hoverSub = sub;
        hoverKey = `sub:${sub.id}:Cluster Theme`;
        break;
      }
    }
    if (hoverKey) break;
  }

  // 2. Macro proximity (expanded radius when open)
  if (!hoverKey) {
    for (let macro of MACROS) {
      let dx = mx - macro.rx, dy = my - macro.ry;
      const r = macro.open
        ? max(MACRO_RADIUS, (macro._subRingR || 0) + SUBCLUSTER_BASE_R + 130)
        : MACRO_RADIUS;
      if (sqrt(dx * dx + dy * dy) < r) {
        hoverMacro = macro;
        hoverKey = `macro:${macro.id}:Space Theme`;
        break;
      }
    }
  }

  // 3. Auto-proximity: when inside an open macro but not directly over a sub,
  //    find the nearest sub-cluster and use it for the Cluster Theme panel
  if (hoverMacro && hoverMacro.open && !hoverSub) {
    let bestDist = Infinity;
    let dx0 = mx - hoverMacro.rx, dy0 = my - hoverMacro.ry;
    for (let sub of hoverMacro.subClusters) {
      let sx = dx0 - sub.rx, sy = dy0 - sub.ry;
      let d = sqrt(sx * sx + sy * sy);
      if (d < bestDist) { bestDist = d; nearestSub = sub; }
    }
    // Update the hover key so the panel refreshes as the nearest sub changes
    if (nearestSub) hoverKey = `sub:${nearestSub.id}:Cluster Theme`;
  }

  // _hoveredSub is explicit-only (used to position the canvas hover label)
  // _panelSub drives the Cluster Theme panel (explicit takes priority)
  _hoveredMacro = hoverMacro;
  _hoveredSub = hoverSub;
  _panelSub = hoverSub || nearestSub;

  // Cursor pill: show sub-cluster title on direct hover; space title only when space is NOT yet open
  if (typeof window.setCursorLabel === 'function') {
    window.setCursorLabel(
      hoverSub                        ? (hoverSub.title   || '') :
      hoverMacro && !hoverMacro.open  ? (hoverMacro.title || '') : ''
    );
  }

  if (_clusterHoverPinned) return;

  if (hoverKey) {
    if (_hoveredClusterKey !== hoverKey) {
      if (_panelSub) {
        showMacroClusterPanel(hoverMacro, _panelSub);
      } else if (hoverMacro) {
        showMacroPanel(hoverMacro);
      }
      _hoveredClusterKey = hoverKey;
    }
  } else if (_hoveredClusterKey) {
    // Cursor has left the proximity zone. If a macro is still open keep
    // its panel visible — don't close just because the cursor moved away.
    const openMacro = MACROS.find(m => m.open);
    if (openMacro) {
      const newKey = `macro:${openMacro.id}:Space Theme`;
      if (_hoveredClusterKey !== newKey) {
        showMacroPanel(openMacro);
        _hoveredClusterKey = newKey;
        _hoveredMacro = openMacro;
        _panelSub = null;
      }
    } else {
      closePanel();
      _hoveredClusterKey = null;
    }
  }
}

// Sync the custom cursor size to the current navigation state.
// Call after any open/close change.
function _updateCursorState() {
  if (typeof window.setCursorState !== 'function') return;
  if (HAS_GALAXY_LEVEL && !_activeGalaxy) { window.setCursorState('theme'); return; }
  const openMacro = MACROS.find(m => m.open);
  if (!openMacro)                                         window.setCursorState('default');
  else if (openMacro.subClusters.find(s => s.open))      window.setCursorState('cluster');
  else                                                    window.setCursorState('space');
}

// Returns the open macro the world point (wx, wy) is within, or null
function _macroAtPoint(wx, wy) {
  for (let macro of MACROS) {
    if (!macro.open) continue;
    let dx = wx - macro.rx, dy = wy - macro.ry;
    const r = max(MACRO_RADIUS, (macro._subRingR || 0) + SUBCLUSTER_BASE_R + 30);
    if (sqrt(dx * dx + dy * dy) < r) return macro;
  }
  return null;
}

// ── COORDINATE HELPERS ────────────────────────────────────────────

function screenToWorld(sx, sy) {
  return {
    x: (sx - width / 2 - camX) / camZoom,
    y: (sy - height / 2 - camY) / camZoom
  };
}

// Animate the camera to center world point (wx, wy) at the given zoom level
// duration: optional override (defaults to ANIM_DURATION)
function _zoomTo(wx, wy, targetZoom, duration) {
  const z = constrain(targetZoom, 0.1, 5);
  _isZooming = false;
  _zoomTarget = z;
  _animFrom = { x: camX, y: camY, zoom: camZoom, t: millis(), dur: duration || ANIM_DURATION };
  _animTarget = { x: -wx * z, y: -wy * z, zoom: z };
  loop();
}

function _cancelAnim() {
  if (_animTarget) { _animTarget = null; _maybePauseLoop(); }
}

// Cache node world positions — must match drawSubClusterSystem exactly
function cacheNodePositions(sub, macroRx, macroRy) {
  for (let thread of sub.threads) {
    thread.nodes.sort((a, b) => a.age - b.age);
  }

  // Pick a curated colour combination for this sub-cluster.
  // Combo size matches the number of multi-node threads (capped at 4).
  // Sub-cluster ID selects which combo to use within that group.
  // Preserve any colour already set by the user (_userColor flag).
  const multiCount = sub.threads.filter(t => t.nodes.length > 1).length;
  const comboSize  = multiCount <= 2 ? 2 : multiCount === 3 ? 3 : 4;
  const comboList  = THREAD_COMBOS[comboSize];
  const combo      = comboList[(sub.id * 137) % comboList.length];
  let comboIdx = 0;
  for (let ti = 0; ti < sub.threads.length; ti++) {
    const thread = sub.threads[ti];
    const existingColor = thread.nodes.length > 0 ? thread.nodes[0]._threadColor : null;
    const userSet = thread.nodes.some(n => n._userColor);
    let color;
    if (userSet) {
      color = (thread.nodes.find(n => n._userColor) || thread.nodes[0])?._threadColor ?? null;
    } else if (thread.nodes.length > 1) {
      color = existingColor || combo[comboIdx % combo.length];
      comboIdx++;
    } else {
      color = null;
    }
    for (let node of thread.nodes) node._threadColor = color;
  }
  // Only reset floating colours that haven't been user-assigned
  for (let node of sub.floating) {
    if (!node._userColor) node._threadColor = null;
  }

  // Floating nodes — golden-angle phyllotaxis for even distribution.
  // Radius derived from uniform-area annulus formula; small seeded jitter
  // keeps the layout organic. Algorithm mirrored exactly in subCluster.js.
  const _floatOuter = _floatZoneR(sub.floating.length);
  randomSeed(sub.seed * 7);
  {
    const _GA  = Math.PI * (3 - Math.sqrt(5)); // golden angle ≈ 137.5°
    const n    = sub.floating.length;
    const r0sq = NODE_FLOAT_MIN * NODE_FLOAT_MIN;
    const r1sq = _floatOuter * _floatOuter;
    for (let i = 0; i < n; i++) {
      const rJitter = random(-3, 3);
      const aJitter = random(-0.2, 0.2);
      const t  = (i + 0.5) / n;
      const rr = Math.max(NODE_FLOAT_MIN, Math.min(_floatOuter, Math.sqrt(r0sq + t * (r1sq - r0sq)) + rJitter));
      const a  = i * _GA + aJitter;
      sub.floating[i]._wx = macroRx + sub.rx + cos(a) * rr;
      sub.floating[i]._wy = macroRy + sub.ry + sin(a) * rr;
    }
  }

  // Use user-controlled ring layout (preserves _threadRingMap if already set)
  sub._rings = computeUserRingLayout(sub);
  // If a sort mode is active, override the ring assignment immediately
  if (_sortMode) _applySortToSub(sub, macroRx, macroRy);

  for (let ring of sub._rings) {
    for (let ti = 0; ti < ring.threads.length; ti++) {
      for (let j = 0; j < ring.threads[ti].nodes.length; j++) {
        let n = ring.threads[ti].nodes[j];
        let a = ring.angles[ti][j];
        n._wx = macroRx + sub.rx + cos(a) * ring.r;
        n._wy = macroRy + sub.ry + sin(a) * ring.r;
      }
    }
  }
}

// ── INPUT HANDLERS ────────────────────────────────────────────────

function mousePressed() {
  if (document.getElementById('email-expanded-modal')?.classList.contains('active')) return;
  _cancelAnim();
  _isZooming = false;
  _zoomTarget = camZoom;
  _dragStartX = mouseX;
  _dragStartY = mouseY;
  _prevDragX  = mouseX;
  _prevDragY  = mouseY;
  _hasDragged = false;

  if (mouseButton === RIGHT) {
    _rightClickPanning = true;
    return false; // suppress context menu
  }

  // Arm thread drag if pressing on a coloured (threaded) email node (left-click only)
  tryStartThreadDragPending();
}

function mouseDragged() {
  // Right-click drag → pan the canvas
  if (_rightClickPanning) {
    const ddx = mouseX - _dragStartX, ddy = mouseY - _dragStartY;
    if (!_hasDragged && sqrt(ddx * ddx + ddy * ddy) > DRAG_THRESHOLD) {
      _hasDragged = true;
      _isPanning  = true;
      loop();
    }
    if (_hasDragged) {
      camX += (mouseX - _prevDragX) * PAN_SPEED;
      camY += (mouseY - _prevDragY) * PAN_SPEED;
    }
    _prevDragX = mouseX;
    _prevDragY = mouseY;
    return;
  }

  // Left-click drag → thread drag only (no canvas pan)
  const ddx = mouseX - _dragStartX, ddy = mouseY - _dragStartY;
  const overThreshold = sqrt(ddx * ddx + ddy * ddy) > DRAG_THRESHOLD;

  if (_threadDrag.pending && overThreshold) {
    activateThreadDrag();
    _hasDragged = true;
  }

  if (_threadDrag.active) {
    updateThreadDrag();
    _prevDragX = mouseX;
    _prevDragY = mouseY;
    return;
  }

  _prevDragX = mouseX;
  _prevDragY = mouseY;
}

function mouseReleased() {
  if (document.getElementById('email-expanded-modal')?.classList.contains('active')) return;
  // Right-click release: end pan, suppress context menu
  if (_rightClickPanning) {
    _rightClickPanning = false;
    if (_isPanning) {
      _isPanning = false;
      _maybePauseLoop();
      redraw();
    }
    _hasDragged = false;
    return false;
  }

  // Complete an active thread drag drop
  if (_threadDrag.active) {
    completeThreadDrop();
    return;
  }
  // Discard a pending drag that never moved far enough
  if (_threadDrag.pending) {
    _threadDrag.pending = false;
  }

  if (_isPanning) {
    _isPanning = false;
    _maybePauseLoop();
    redraw();
    return;
  }
  if (_hasDragged) return;

  // If the mouse-up landed on an HTML overlay panel, let the browser handle
  // the click (button handlers) and skip all canvas logic.
  // This is the same guard used in mouseMoved; without it, clicking any HTML
  // button fires p5's mouseReleased which clears selection state before the
  // button's own click event fires.
  const _releaseEl = document.elementFromPoint(mouseX, mouseY);
  if (_releaseEl && _releaseEl.closest(
    '.email-detail-container, .panel-container, #right-panel-stack, .icon-slot, #icon-arrow, #icon-help, #icon-group-bottom-left'
  )) return;

  // Double-click detection — create new cluster in Archive galaxy
  const _nowMs = millis();
  const _dblDist = sqrt((mouseX - _lastClickSX) ** 2 + (mouseY - _lastClickSY) ** 2);
  const _isDbl   = (_nowMs - _lastClickMs < _DBL_CLICK_MS) && (_dblDist < _DBL_CLICK_DIST);
  _lastClickMs = _nowMs;
  _lastClickSX = mouseX;
  _lastClickSY = mouseY;
  if (_isDbl && window._isInArchiveGalaxy?.()) {
    const _dw = screenToWorld(mouseX, mouseY);
    const _openMacroArc = MACROS.find(m => m.open);
    if (_openMacroArc && !_openMacroArc.subClusters.find(s => s.open)) {
      window.createArchiveCluster(_dw.x - _openMacroArc.rx, _dw.y - _openMacroArc.ry);
      return;
    }
  }

  // Hit-test + / − ring buttons (before general click handling)
  const _w = screenToWorld(mouseX, mouseY);
  if (plusMinusHitTest(_w.x, _w.y)) return;

  // ── Galaxy picker click ───────────────────────────────────────────
  if (HAS_GALAXY_LEVEL && !_activeGalaxy) {
    const idx = _galaxyCellAt(mouseX, mouseY);
    if (idx >= 0) _enterGalaxy(GALAXIES[idx]);
    return;
  }

  let w = screenToWorld(mouseX, mouseY);
  let mx = w.x, my = w.y;

  // 1. Email node clicks (deepest level first)
  for (let macro of MACROS) {
    if (!macro.open) continue;
    for (let sub of macro.subClusters) {
      if (!sub.open) continue;

      for (let node of sub.floating) {
        if (node._wx === undefined) continue;
        let dx = mx - node._wx, dy = my - node._wy;
        if (sqrt(dx * dx + dy * dy) < _nodeRadius(node)) {
          _showNodePanel(node, sub, macro);
          redraw();
          return;
        }
      }

      for (let thread of sub.threads) {
        for (let node of thread.nodes) {
          if (node._wx === undefined) continue;
          let dx = mx - node._wx, dy = my - node._wy;
          if (sqrt(dx * dx + dy * dy) < _nodeRadius(node)) {
            if (keyIsDown(SHIFT)) {
              // Shift+click → add/remove from existing selection (any node, any colour)
              _shiftSelectEmail(node, sub, macro);
            } else {
              // Plain click → this email becomes the selection seed.
              // We keep it in the set so Shift+click on the NEXT email
              // can extend the selection without needing Shift from the start.
              _selectedEmailIds = new Set([node.email_id]);
              _showNodePanel(node, sub, macro);
              _updateActionBtns();
            }
            redraw();
            return;
          }
        }
      }

      // Ring circle hit-test — consumes click so the sub doesn't close
      if (sub._rings) {
        const subCX = macro.rx + sub.rx, subCY = macro.ry + sub.ry;
        const d = Math.sqrt((mx - subCX) ** 2 + (my - subCY) ** 2);
        for (let ri = 0; ri < sub._rings.length; ri++) {
          if (Math.abs(d - sub._rings[ri].r) < 10 / camZoom) {
            if (_selectedRingIdx === ri && _selectedRingSub === sub) {
              _clearRingSelection();
            } else {
              _selectedRingIdx   = ri;
              _selectedRingSub   = sub;
              _selectedRingMacro = macro;
            }
            _updateActionBtns();
            redraw();
            return;
          }
        }
      }
    }
  }

  // 2. Sub-cluster clicks
  for (let macro of MACROS) {
    if (!macro.open) continue;
    let dx0 = mx - macro.rx, dy0 = my - macro.ry;
    for (let sub of macro.subClusters) {
      let sx = dx0 - sub.rx, sy = dy0 - sub.ry;
      if (sqrt(sx * sx + sy * sy) < getSubClusterRadius(sub.size)) {
        let opening = !sub.open;
        sub.open = opening;
        if (!opening) sub._rings = null;  // clear so layout recomputes on next open
        if (opening) {
          if (HAS_GALAXY_LEVEL && !sub._emailsLoaded) {
            sub._pendingOpenAnim = true; // animation starts once emails arrive
            _loadSubEmails(sub, macro);
          } else {
            sub._openAnimStart = millis();
            loop();
            cacheNodePositions(sub, macro.rx, macro.ry);
          }
        }

        // Close every other open sub-cluster across all macros
        if (opening) {
          for (let m of MACROS) {
            for (let s of m.subClusters) {
              if (s !== sub && s.open) { s.open = false; s._rings = null; }
            }
          }
        }

        // Auto-open/close linked sub-clusters together
        _toggleCrossLinkedSubs(sub.id, opening);

        if (opening) {
          _showBackButton(true);
          showExpandedPanel(macro, sub, null, CROSS_LINKS);
          window.showClusterPanel?.(); // right panel: action bar visible immediately
          _clusterHoverPinned = true;
          _hoveredClusterKey = `sub:${sub.id}:Expanded`;
          _zoomTo(macro.rx + sub.rx, macro.ry + sub.ry, _adaptiveSubZoom(sub));
        } else {
          _clusterHoverPinned = false;
          _showBackButton(false);
          showMacroPanel(macro);
          _hoveredClusterKey = `macro:${macro.id}:Space Theme`;
          redraw();
        }
        _updateCursorState();
        return;
      }
    }
  }

  // 3. Macro cluster clicks
  for (let macro of MACROS) {
    let dx = mx - macro.rx, dy = my - macro.ry;
    if (sqrt(dx * dx + dy * dy) < MACRO_RADIUS) {
      macro.open = !macro.open;
      if (!macro.open) {
        for (let sub of macro.subClusters) { sub.open = false; sub._rings = null; }
        closePanel();
        redraw();
      } else {
        // Close every other open macro (and their sub-clusters) before opening this one
        for (let m of MACROS) {
          if (m !== macro && m.open) {
            m.open = false;
            for (let s of m.subClusters) { s.open = false; s._rings = null; }
          }
        }
        showMacroPanel(macro);
        _prefetchMacroSubs(macro); // batch-load all sub data so arrow nav is instant
        const extent = (macro._subRingR || FIRST_RING_R) + SUBCLUSTER_BASE_R;
        _zoomTo(macro.rx, macro.ry, (min(width, height) * 0.35) / extent);
      }
      _updateCursorState();
      return;
    }
  }

  // 3b. Galaxy clicks (galaxy mode only) — open/close galaxy to show/hide macros
  if (HAS_GALAXY_LEVEL) {
    for (let galaxy of GALAXIES) {
      if (isInsideGalaxy(galaxy, mx, my)) {
        const opening = !galaxy.open;
        // Close all other galaxies when opening one (one galaxy active at a time)
        if (opening) {
          for (let g of GALAXIES) {
            if (g !== galaxy) {
              g.open = false;
              for (let m of g.macros) { m.open = false; for (let s of m.subClusters) s.open = false; }
            }
          }
        }
        galaxy.open = opening;
        if (!opening) {
          for (let m of galaxy.macros) { m.open = false; for (let s of m.subClusters) s.open = false; }
          closePanel();
          redraw();
        } else {
          const r = map(galaxy.size, 0, 1, GALAXY_RADIUS * 0.55, GALAXY_RADIUS);
          _zoomTo(galaxy.rx, galaxy.ry, (min(width, height) * 0.42) / r);
        }
        return;
      }
    }
  }

  // 4. Empty canvas click
  _clearRingSelection();

  const _openMacroNow = MACROS.find(m => m.open);
  const _openSubNow   = _openMacroNow?.subClusters.find(s => s.open);
  if (_openSubNow) {
    // Inside a specific cluster: only deselect the email node highlight.
    // Keep _clusterHoverPinned = true so _updateClusterHover stays locked
    // and hover-driven showMacroPanel / showMacroClusterPanel calls never
    // reach hideAllPanels — which is what was wiping the right panel.
    _selectedEmailId  = null;
    _selectedEmailIds = new Set();
    _selectedNode     = null;
    window.showClusterPanel?.();
    _updateActionBtns();
    redraw();
    return;
  }

  if (_openMacroNow && !_openSubNow) {
    // Clusters overview: macro open but no sub — keep the macro panel, just
    // clear any email selection and ring highlight without closing the panel.
    _selectedEmailId  = null;
    _selectedEmailIds = new Set();
    _selectedNode     = null;
    _updateActionBtns();
    redraw();
    return;
  }

  // Outside cluster view: unpin hover and close panels normally
  _clusterHoverPinned = false;

  _selectedEmailId = null;
  _selectedNode = null; _selectedSub = null; _selectedMacro = null;
  _updateActionBtns();

  const nearMacro = _macroAtPoint(mx, my);
  if (nearMacro) {
    showMacroPanel(nearMacro);
    _hoveredClusterKey = `macro:${nearMacro.id}:Space Theme`;
    redraw();
  } else {
    closePanel();
  }
}

function mouseMoved() {
  if (document.getElementById('email-expanded-modal')?.classList.contains('active')) return;
  if (_isPanning) return;

  // If cursor is over any panel element, skip all nav-state updates at every level —
  // prevents panel from closing when user moves toward it, and prevents galaxy-picker
  // label calls from overriding the cursor shrink while over a panel.
  const overEl = document.elementFromPoint(mouseX, mouseY);
  if (overEl && overEl.closest('.panel-container, .email-detail-container, #right-panel-stack, .icon-slot, #icon-arrow, #icon-help')) {
    return;
  }
  // Tour guide panel: clear pending dwell timers so labels don't persist while
  // the user reads the walkthrough. cursor.js handles pill removal + shrink.
  if (overEl && overEl.closest('#tour-guide')) {
    clearTimeout(_ringHoverTimer);  _ringHoverTimer = null; _ringHoverRi = -1; _ringLabelActive = false;
    clearTimeout(_emailHoverTimer); _emailHoverTimer = null; _hoveredEmailSubject = null;
    return;
  }

  // Galaxy / Theme picker hover
  if (HAS_GALAXY_LEVEL && !_activeGalaxy) {
    const prev = _hoveredGalaxyIdx;
    _hoveredGalaxyIdx = _galaxyCellAt(mouseX, mouseY);
    // Show "Title · data" in cursor pill — same pattern as cluster/space hover labels
    if (typeof window.setCursorLabel === 'function') {
      const g = _hoveredGalaxyIdx >= 0 ? GALAXIES[_hoveredGalaxyIdx] : null;
      if (g) {
        const title   = g.title || `Theme ${_hoveredGalaxyIdx + 1}`;
        const sizeStr = _fmtSize(g.data_size_kb);
        window.setCursorLabel(sizeStr ? `${title}  ·  ${sizeStr}` : title);
      } else {
        window.setCursorLabel('');
      }
    }
    if (_hoveredGalaxyIdx !== prev) redraw();
    return;
  }

  let w = screenToWorld(mouseX, mouseY);
  const prevMacro = _hoveredMacro;
  const prevSub   = _hoveredSub;
  _updateClusterHover(w.x, w.y);
  _updateCursorState();

  // ── Email node hover label ────────────────────────────────────────
  // Show the email subject in the cursor pill when hovering an email dot,
  // exactly like cluster/space/theme names appear — using setCursorLabelForce
  // because _inCluster=true would otherwise suppress any label.
  // Disabled once the user has clicked an email (selected state) so the pill
  // doesn't interfere while they are reading or navigating with arrow keys.
  const _emailIsSelected = !!_selectedEmailId || (_selectedEmailIds?.size > 0);
  if (!_emailIsSelected && typeof window.setCursorLabelForce === 'function') {
    const _emSm = MACROS.find(m => m.open);
    const _emSs = _emSm?.subClusters.find(s => s.open);
    let emailSub = null;

    if (_emSm && _emSs) {
      // Floating nodes (inner scatter)
      for (const n of (_emSs.floating || [])) {
        if (n._wx === undefined) continue;
        if (Math.sqrt((w.x - n._wx) ** 2 + (w.y - n._wy) ** 2) < _nodeRadius(n) + 5) {
          emailSub = n.subject || '(no subject)';
          break;
        }
      }
      // Ring thread nodes
      if (!emailSub && _emSs._rings) {
        outer2: for (const ring of _emSs._rings) {
          for (const thread of ring.threads) {
            for (const n of thread.nodes) {
              if (n._wx === undefined) continue;
              if (Math.sqrt((w.x - n._wx) ** 2 + (w.y - n._wy) ** 2) < _nodeRadius(n) + 5) {
                emailSub = n.subject || '(no subject)';
                break outer2;
              }
            }
          }
        }
      }
    }

    if (emailSub !== _hoveredEmailSubject) {
      _hoveredEmailSubject = emailSub;
      clearTimeout(_emailHoverTimer); _emailHoverTimer = null;
      if (emailSub) {
        // Wait 0.8 s before showing the pill so fast cursor movement stays quiet
        const lbl = emailSub.length > 44 ? emailSub.slice(0, 44) + '…' : emailSub;
        _emailHoverTimer = setTimeout(() => {
          _emailHoverTimer = null;
          clearTimeout(_ringHoverTimer); _ringHoverTimer = null; _ringHoverRi = -1; _ringLabelActive = false;
          window.setCursorLabelForce(lbl);
        }, 1200);
      } else {
        // Leaving an email — collapse the pill immediately
        window.setCursorLabelForce('');
      }
    } else if (emailSub && _hoveredEmailSubject && !_emailHoverTimer) {
      // Dwell confirmed — keep re-applying so ring/cluster labels don't overwrite it
      const lbl = emailSub.length > 44 ? emailSub.slice(0, 44) + '…' : emailSub;
      window.setCursorLabelForce(lbl);
    }
  }

  // Ring dwell label — works for ANY open sub-cluster, with or without sort mode.
  // Uses setCursorLabelForce because _inCluster=true (set when a sub is open)
  // suppresses normal setCursorLabel calls — that was the root cause of the
  // label never appearing.
  if (typeof window.setCursorLabelForce === 'function') {
    const _sm = MACROS.find(m => m.open);
    const _ss = _sm?.subClusters.find(s => s.open);
    // Skip ring labels while an email subject is showing — they'd conflict
    if (!_hoveredEmailSubject && _sm && _ss && _ss._rings && _ss._rings.length > 0) {
      const subCX = _sm.rx + _ss.rx, subCY = _sm.ry + _ss.ry;
      const dist  = Math.sqrt((w.x - subCX) ** 2 + (w.y - subCY) ** 2);

      // If the cursor is directly over an email node, skip ring hover so the
      // normal drag/click interactions aren't disrupted.
      let _overNode = false;
      for (const node of (_ss.floating || [])) {
        if (node._wx === undefined) continue;
        const nd = Math.sqrt((w.x - node._wx) ** 2 + (w.y - node._wy) ** 2);
        if (nd < _nodeRadius(node) + 4) { _overNode = true; break; }
      }
      if (!_overNode) {
        outer: for (const ring of _ss._rings) {
          for (const thread of ring.threads) {
            for (const node of thread.nodes) {
              if (node._wx === undefined) continue;
              const nd = Math.sqrt((w.x - node._wx) ** 2 + (w.y - node._wy) ** 2);
              if (nd < _nodeRadius(node) + 4) { _overNode = true; break outer; }
            }
          }
        }
      }

      // 28 world-px tolerance so precision isn't required.
      const PROX = 28 / camZoom;
      let nearRi = -1;
      if (!_overNode) {
        for (let ri = 0; ri < _ss._rings.length; ri++) {
          if (Math.abs(dist - _ss._rings[ri].r) < PROX) { nearRi = ri; break; }
        }
      }

      if (nearRi >= 0) {
        if (nearRi !== _ringHoverRi) {
          // Entered a different ring — restart dwell timer
          clearTimeout(_ringHoverTimer);
          _ringHoverRi     = nearRi;
          _ringLabelActive = false;
          _ringHoverTimer  = setTimeout(() => {
            if (_ringHoverRi !== nearRi) return;
            const lbl = _ringLabelForIndex(_ss, nearRi);
            if (lbl) { window.setCursorLabelForce(lbl); _ringLabelActive = true; }
          }, _RING_LABEL_DELAY_MS);
        } else if (_ringLabelActive) {
          // Keep label visible — re-apply each frame to override cluster title
          const lbl = _ringLabelForIndex(_ss, nearRi);
          if (lbl) window.setCursorLabelForce(lbl);
        }
      } else if (_ringHoverRi >= 0) {
        // Left all rings — cancel timer and return cursor to default
        clearTimeout(_ringHoverTimer);
        _ringHoverTimer  = null;
        _ringHoverRi     = -1;
        _ringLabelActive = false;
        window.setCursorLabelForce(''); // explicitly collapse the pill
      }
    }
  }

  if (_hoveredMacro !== prevMacro || _hoveredSub !== prevSub) redraw();
}

function mouseExited() {
  _edgePanVX = 0; _edgePanVY = 0;
  if (_isEdgeScrolling) { _isEdgeScrolling = false; _maybePauseLoop(); }
  if (_threadDrag.active || _threadDrag.pending) cancelThreadDrag();
}

// Returns true when a text input, textarea, or contenteditable has focus —
// in that case all canvas keyboard shortcuts should be suppressed.
function _inputHasFocus() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.contentEditable === 'true';
}

function keyPressed() {
  if (_inputHasFocus()) return; // let the browser handle typing naturally

  // Enter: go one level deeper at every level
  if (keyCode === ENTER) {
    // Themes picker → enter hovered/first theme
    if (HAS_GALAXY_LEVEL && !_activeGalaxy) {
      _enterFirstGalaxy();
      return false;
    }
    const _enterMacro = MACROS.find(m => m.open);
    if (_enterMacro) {
      const _enterSub = _enterMacro.subClusters.find(s => s.open);
      if (_enterSub && _selectedEmailId === null) {
        // Sub open, no email selected → select the first email
        _selectFirstEmail(_enterSub, _enterMacro);
      } else if (!_enterSub) {
        // Macro open, no sub → open the first sub-cluster
        _enterFirstSub(_enterMacro);
      }
      return false;
    }
    // Spaces level (no macro open) → enter hovered/first macro
    if (_activeGalaxy && MACROS.length > 0) {
      _enterFirstMacro();
      return false;
    }
  }

  // Cmd/Ctrl+Z: undo last archive cluster creation (when in Archive galaxy)
  // keyCode 91/93 = Cmd (Mac left/right), 17 = Ctrl (Windows/Linux)
  if (keyCode === 90 && (keyIsDown(91) || keyIsDown(93) || keyIsDown(17))) {
    if (window._isInArchiveGalaxy?.()) {
      window.undoLastArchiveCluster?.();
      return false;
    }
  }

  // Escape: close expanded email view first if open
  if (document.getElementById('email-expanded-modal')?.classList.contains('active')) {
    window.closeEmailExpanded?.();
    return false;
  }

  // Delete / Backspace: delete selected ring, then fall back to selected email
  if (keyCode === DELETE || keyCode === BACKSPACE) {
    if (_selectedRingIdx != null) {
      window.deleteSelectedRing?.();
      return false;
    }
    if (_selectedEmailId || _selectedEmailIds.size > 0) {
      window.deleteSelectedEmail?.();
      return false;
    }
  }

  // Escape: cancel active drag, deselect ring, or step back
  if (keyCode === ESCAPE) {
    if (_threadDrag.active || _threadDrag.pending) {
      cancelThreadDrag();
      return false;
    }
    if (_selectedRingIdx != null) {
      _clearRingSelection(); _updateActionBtns(); redraw();
      return false;
    }
    _escapeBack();
    return false;
  }

  // Left / right arrows: navigate at every level
  if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
    const dir = keyCode === RIGHT_ARROW ? 1 : -1;

    // Themes picker: cycle the hover highlight between themes
    if (HAS_GALAXY_LEVEL && !_activeGalaxy && GALAXIES.length > 0) {
      const n   = GALAXIES.length;
      _hoveredGalaxyIdx = ((_hoveredGalaxyIdx < 0 ? 0 : _hoveredGalaxyIdx) + dir + n) % n;
      redraw();
      return false;
    }

    if (_selectedEmailId !== null) { _navigateEmail(dir); return false; }

    const _openMacro = MACROS.find(m => m.open);
    if (_openMacro && _openMacro.subClusters.find(s => s.open)) {
      _navigateSubCluster(_openMacro, _openMacro.subClusters.find(s => s.open), dir);
      return false;
    }
    if (_openMacro) { _navigateMacro(_openMacro, dir); return false; }

    // Spaces level (no macro open): cycle highlight between macros
    if (_activeGalaxy && MACROS.length > 0) {
      const sorted  = [...MACROS].sort((a, b) => Math.atan2(a.ry, a.rx) - Math.atan2(b.ry, b.rx));
      const curIdx  = _hoveredMacro ? sorted.indexOf(_hoveredMacro) : -1;
      const nextIdx = ((curIdx < 0 ? 0 : curIdx) + dir + sorted.length) % sorted.length;
      _hoveredMacro = sorted[nextIdx];
      _zoomTo(_hoveredMacro.rx, _hoveredMacro.ry, camZoom, NAV_ANIM_DURATION);
      redraw();
      return false;
    }
  }

  // WASD pan
  const k = key.toLowerCase();
  if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
    if (!_wasdActive) {
      _wasdActive = true;
      _animTarget = null;
      loop();
    }
    return false;
  }

  // Arrow key zoom — continuous while held, driven by the draw loop
  if (keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
    _cancelAnim();
    if (!_arrowZoomActive) {
      _arrowZoomActive = true;
      loop();
    }
    return false;
  }
}

window._escapeBack = _escapeBack; // exposed for panel back buttons

// ── Tour navigation helpers (used by onboarding guided tour) ─────
window._tourGoThemes  = function () {
  if (typeof window._galaxyBack === 'function') window._galaxyBack();
  else if (typeof redraw === 'function') redraw();
};
window._tourGoSpaces  = _enterFirstGalaxy;
window._tourGoCluster = _enterFirstMacro;
window._tourGoEmails  = function () {
  const m = MACROS && MACROS.find(m => m.open);
  if (m) _enterFirstSub(m);
};

// Tour step 4 — navigate into a cluster and auto-select the first email
// so the right-hand panel is visible with email contents ready to demonstrate.
window._tourGoEmailSelected = function () {
  const m = MACROS && MACROS.find(m => m.open);
  if (!m) { window._tourGoEmails?.(); return; }

  const sub = m.subClusters.find(s => s.open);
  if (!sub) {
    // Not yet inside a sub-cluster — open the first one, then select
    _enterFirstSub(m);
    setTimeout(() => {
      const s2 = m.subClusters.find(s => s.open);
      if (s2) _selectFirstEmail(s2, m);
    }, 700);
  } else {
    _selectFirstEmail(sub, m);
  }
};

function _escapeBack() {
  // Level 3: email selected → deselect, return to sub-cluster view
  if (_selectedEmailId !== null) {
    _selectedEmailId = null;
    _clusterHoverPinned = false;
    const openMacro = MACROS.find(m => m.open);
    const openSub   = openMacro ? openMacro.subClusters.find(s => s.open) : null;
    if (openSub && openMacro) {
      // Go back to the expanded sub panel (not the email detail)
      showExpandedPanel(openMacro, openSub, null, CROSS_LINKS);
      _clusterHoverPinned = true;
      _hoveredClusterKey = `sub:${openSub.id}:Expanded`;
    }
    // Return right panel to cluster/actions mode (email deselected)
    window.showClusterPanel?.();
    redraw();
    return;
  }

  // Level 2: sub-cluster open → close it, return to macro view
  const openMacro = MACROS.find(m => m.open);
  if (openMacro) {
    const openSub = openMacro.subClusters.find(s => s.open);
    if (openSub) {
      openSub.open = false;
      openSub._rings = null;
      _clearRingSelection(); _updateActionBtns();
      clearTimeout(_emailHoverTimer); _emailHoverTimer = null;
      _hoveredEmailSubject = null; // clear email hover label on exit
      _toggleCrossLinkedSubs(openSub.id, false);
      _showBackButton(false);
      showMacroPanel(openMacro);
      _hoveredClusterKey = `macro:${openMacro.id}:Space Theme`;
      const extent = (openMacro._subRingR || FIRST_RING_R) + SUBCLUSTER_BASE_R;
      _zoomTo(openMacro.rx, openMacro.ry, (min(width, height) * 0.35) / extent);
      return;
    }

    // Level 1: macro open, no sub → close macro, return to Spaces overview
    openMacro.open = false;
    for (let sub of openMacro.subClusters) { sub.open = false; sub._rings = null; }
    closePanel();
    _zoomTo(0, 0, 0.8);
    _updateCursorState();
    return;
  }

  // Level 0: in Spaces overview inside a galaxy → back to Themes picker
  if (HAS_GALAXY_LEVEL && _activeGalaxy) {
    window._galaxyBack();
    return;
  }
}

// Timestamp of the last sub-cluster navigation — used to gate key-repeat
let _lastSubNavTime   = -9999;
let _lastMacroNavTime = -9999;

// ── Ring sort mode ────────────────────────────────────────────────
// null = auto-layout  |  'month' = one ring per calendar month
//                     |  'year'  = one ring per year (placeholder)
let _sortMode = null;

// Ring-label dwell: cursor must hover on the same ring for this long before
// the month/year label appears — prevents flicker while navigating.
const _RING_LABEL_DELAY_MS = 1500;
let _ringHoverTimer  = null;
let _ringHoverRi     = -1;
let _ringLabelActive = false;
let _hoveredEmailSubject = null; // email subject currently shown in cursor pill
let _emailHoverTimer    = null; // delay before the subject pill appears

const _SORT_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                           'Jul','Aug','Sep','Oct','Nov','Dec'];

function _parseEmailDate(str) {
  if (!str || str === '—' || str === 'Unknown') return null;
  try { const d = new Date(str); return isNaN(d.getTime()) ? null : d; }
  catch (e) { return null; }
}

function _monthKey(d) { return d.getFullYear() * 100 + (d.getMonth() + 1); }
function _monthLabel(key) {
  return _SORT_MONTH_NAMES[(key % 100) - 1] + ' ' + Math.floor(key / 100);
}

// Returns the Monday of the ISO week containing d, as a millisecond timestamp.
function _weekKey(d) {
  const dt  = new Date(d.getTime());
  const day = dt.getDay(); // 0=Sun
  dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1)); // shift to Monday
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

// "1–7 Jan 2024"  /  "29 Jan–4 Feb 2024"  /  "30 Dec 2023–5 Jan 2024"
function _weekLabel(weekStartMs) {
  const s  = new Date(weekStartMs);
  const e  = new Date(weekStartMs + 6 * 86400000); // +6 days = Sunday
  const sd = s.getDate(), ed = e.getDate();
  const sm = _SORT_MONTH_NAMES[s.getMonth()], em = _SORT_MONTH_NAMES[e.getMonth()];
  const sy = s.getFullYear(), ey = e.getFullYear();
  if (sy !== ey) return `${sd} ${sm} ${sy}–${ed} ${em} ${ey}`;
  if (sm !== em)  return `${sd} ${sm}–${ed} ${em} ${sy}`;
  return `${sd}–${ed} ${sm} ${sy}`;
}

// Compute a human-readable label for ring `ri` in sub-cluster `sub`.
// Uses pre-computed _ringLabels if available (set by sort mode), otherwise
// derives the date range from the emails actually on that ring.
function _ringLabelForIndex(sub, ri) {
  // Fast path: sort mode already computed labels
  if (sub._ringLabels && sub._ringLabels[ri]) return sub._ringLabels[ri];

  if (!sub._rings || !sub._rings[ri]) return null;
  const ring = sub._rings[ri];

  // Gather all dates from emails on this ring
  const dates = [];
  for (const t of ring.threads) {
    for (const n of t.nodes) {
      const d = _parseEmailDate(n.date_str);
      if (d) dates.push(d);
    }
  }
  if (!dates.length) return null;

  dates.sort((a, b) => a - b);
  const oldest = dates[0], newest = dates[dates.length - 1];

  if (_sortMode === 'year') {
    const yOld = oldest.getFullYear(), yNew = newest.getFullYear();
    return yOld === yNew ? String(yOld) : `${yOld} – ${yNew}`;
  }

  // Month (default)
  const kOld = _monthKey(oldest), kNew = _monthKey(newest);
  return kOld === kNew ? _monthLabel(kOld)
                       : `${_monthLabel(kOld)} – ${_monthLabel(kNew)}`;
}

// Weekly sort: splits threads across rings — emails from the same thread that
// fall in different weeks appear in their respective week rings but keep their
// colour, so the user can see they originated from the same conversation.
function _applyWeeklySortToSub(sub, macroRx, macroRy) {
  if (!sub.threads || !sub.threads.length) return;

  // ── 1. Bucket every node by week ──────────────────────────────────
  const weekBuckets = new Map(); // weekStartMs → Map<colorKey, {nodes}>

  for (const t of sub.threads) {
    const color = t.nodes.length > 0 ? t.nodes[0]._threadColor : null;
    for (const n of t.nodes) {
      const d = _parseEmailDate(n.date_str);
      if (!d) continue;
      const wk = _weekKey(d);
      if (!weekBuckets.has(wk)) weekBuckets.set(wk, new Map());
      const byColor = weekBuckets.get(wk);
      // null-color nodes each get their own 1-node group; colored nodes share group
      const ck = color || n;
      if (!byColor.has(ck)) byColor.set(ck, { nodes: [], color });
      byColor.get(ck).nodes.push(n);
    }
  }
  if (!weekBuckets.size) return;

  // ── 2. Sort weeks chronologically ────────────────────────────────
  const sortedWeeks = [...weekBuckets.keys()].sort((a, b) => a - b);

  // ── 3. Build rings directly with virtual split-thread objects ─────
  const FILL_LIMIT = Math.PI * 2 * 0.75;
  const MIN_R = NODE_ORBIT_RADIUS, MIN_GAP = 28;
  const rings = [];
  let prevR = 0;

  for (let i = 0; i < sortedWeeks.length; i++) {
    const wk      = sortedWeeks[i];
    const byColor = weekBuckets.get(wk);
    // Virtual threads — one per colour group within the week
    const threads = [...byColor.values()].map(({ nodes }) => ({ nodes }));

    let r = Math.max(MIN_R + i * MIN_GAP, prevR + MIN_GAP);
    if (threads.length > 0) {
      while (_ringFootprintOf(threads, r) > FILL_LIMIT && r < 400) r += 4;
    }
    rings.push({
      r,
      threads,
      angles: threads.length > 0 ? computeThreadLayout(threads, r) : [],
      _label: _weekLabel(wk),
    });
    prevR = r;
  }

  sub._rings      = rings;
  sub._numRings   = rings.length;
  sub._ringLabels = rings.map(rng => rng._label);
  _recacheRingNodePositions(sub, macroRx, macroRy);
}

function _applySortToSub(sub, macroRx, macroRy) {
  if (!_sortMode || !sub.threads || !sub.threads.length) return;
  if (_sortMode === 'week') { _applyWeeklySortToSub(sub, macroRx, macroRy); return; }

  const threadKeys = new Map();
  for (const t of sub.threads) {
    if (!t.nodes.length) continue;
    const d = _parseEmailDate(t.nodes[0].date_str);
    if (!d) continue;
    threadKeys.set(t, _sortMode === 'year' ? d.getFullYear() : _monthKey(d));
  }
  if (!threadKeys.size) return;

  // Compact sorted keys — no gaps, no empty rings
  const uniqueKeys = [...new Set(threadKeys.values())].sort((a, b) => a - b);
  const keyToRing  = new Map(uniqueKeys.map((k, i) => [k, i]));

  sub._threadRingMap = new Map();
  for (const t of sub.threads) {
    const k = threadKeys.get(t);
    sub._threadRingMap.set(t, k != null ? (keyToRing.get(k) ?? 0) : 0);
  }
  sub._numRings   = Math.max(1, uniqueKeys.length);
  sub._ringLabels = uniqueKeys.map(k =>
    _sortMode === 'year' ? String(k) : _monthLabel(k)
  );

  sub._rings = computeUserRingLayout(sub);
  _recacheRingNodePositions(sub, macroRx, macroRy);
}

window.setSortMode = function (mode) {
  _sortMode = (_sortMode === mode) ? null : mode;
  // Reset dwell state whenever sort mode changes
  clearTimeout(_ringHoverTimer);
  _ringHoverTimer  = null;
  _ringHoverRi     = -1;
  _ringLabelActive = false;
  // Clear email hover state so the ring dwell guard (!_hoveredEmailSubject) passes
  // immediately after sort — without this, a subject left in _hoveredEmailSubject
  // from a prior email hover blocks ring labels until the user clicks background.
  clearTimeout(_emailHoverTimer);
  _emailHoverTimer     = null;
  _hoveredEmailSubject = null;
  // Also clear email selection (mirrors what background-click does)
  _selectedEmailId  = null;
  _selectedEmailIds = new Set();
  _selectedNode     = null;
  window.showClusterPanel?.();
  _updateActionBtns();

  for (const macro of MACROS) {
    for (const sub of macro.subClusters) {
      if (_sortMode) {
        _applySortToSub(sub, macro.rx, macro.ry);
      } else {
        sub._threadRingMap = null;
        sub._numRings      = null;
        sub._rings         = null;
        sub._ringLabels    = null;
        if (sub.open) cacheNodePositions(sub, macro.rx, macro.ry);
      }
    }
  }

  document.getElementById('btn-sort-week') ?.classList.toggle('active', _sortMode === 'week');
  document.getElementById('btn-sort-month')?.classList.toggle('active', _sortMode === 'month');
  document.getElementById('btn-sort-year') ?.classList.toggle('active', _sortMode === 'year');
  redraw();
};

// Double-click tracking (for Archive cluster creation)
let _lastClickMs  = 0;
let _lastClickSX  = 0;
let _lastClickSY  = 0;
const _DBL_CLICK_MS   = 380;
const _DBL_CLICK_DIST = 22;

// Enter a macro's first sub-cluster (angular sort, index 0)
function _enterFirstSub(macro) {
  if (!macro.subClusters || macro.subClusters.length === 0) return;

  const sorted = [...macro.subClusters].sort((a, b) =>
    Math.atan2(a.ry, a.rx) - Math.atan2(b.ry, b.rx)
  );
  const sub = sorted[0];

  sub.open = true;
  if (HAS_GALAXY_LEVEL && !sub._emailsLoaded) {
    _loadSubEmails(sub, macro); // async — redraws on completion
  } else {
    cacheNodePositions(sub, macro.rx, macro.ry);
  }

  _showBackButton(true);
  showExpandedPanel(macro, sub, null, CROSS_LINKS);
  window.showClusterPanel?.();
  _clusterHoverPinned = true;
  _hoveredClusterKey  = `sub:${sub.id}:Expanded`;
  _zoomTo(macro.rx + sub.rx, macro.ry + sub.ry, _adaptiveSubZoom(sub));
  _updateCursorState();
}

// Enter the hovered or first macro on the Spaces screen (keyboard Enter at Spaces level)
function _enterFirstMacro() {
  const sorted = [...MACROS].sort((a, b) => Math.atan2(a.ry, a.rx) - Math.atan2(b.ry, b.rx));
  const target = (_hoveredMacro && MACROS.includes(_hoveredMacro)) ? _hoveredMacro : sorted[0];
  if (!target) return;
  for (let m of MACROS) {
    if (m !== target && m.open) {
      m.open = false;
      for (let s of m.subClusters) { s.open = false; s._rings = null; }
    }
  }
  target.open = true;
  showMacroPanel(target);
  _prefetchMacroSubs(target);
  const extent = (target._subRingR || FIRST_RING_R) + SUBCLUSTER_BASE_R;
  _zoomTo(target.rx, target.ry, (min(width, height) * 0.35) / extent);
  _updateCursorState();
}

// Enter the hovered or first theme on the Themes picker (keyboard Enter at Themes level)
function _enterFirstGalaxy() {
  const idx = _hoveredGalaxyIdx >= 0 ? _hoveredGalaxyIdx : 0;
  if (GALAXIES && idx < GALAXIES.length) _enterGalaxy(GALAXIES[idx]);
}

// Select node 1 of the open sub-cluster (same collection order as _navigateEmail)
function _selectFirstEmail(sub, macro) {
  const allNodes = [...(sub.floating || [])];
  if (sub._rings && sub._rings.length > 0) {
    for (const ring of sub._rings)
      for (const thread of ring.threads)
        allNodes.push(...thread.nodes);
  } else {
    for (const thread of (sub.threads || []))
      allNodes.push(...(thread.nodes || []));
  }
  if (allNodes.length === 0) return;

  _showNodePanel(allNodes[0], sub, macro);
  redraw();
}

// Navigate left/right between macro clusters (spaces)
function _navigateMacro(currentMacro, dir) {
  if (millis() - _lastMacroNavTime < NAV_ANIM_DURATION) return;
  _lastMacroNavTime = millis();

  // Sort macros by angular position so ← / → feel consistent
  const sorted = [...MACROS].sort((a, b) =>
    Math.atan2(a.ry, a.rx) - Math.atan2(b.ry, b.rx)
  );
  const idx       = sorted.indexOf(currentMacro);
  const nextMacro = sorted[(idx + dir + sorted.length) % sorted.length];
  if (nextMacro === currentMacro) return;

  // Close current macro
  currentMacro.open = false;
  for (const s of currentMacro.subClusters) { s.open = false; s._rings = null; }
  _clearRingSelection();
  _showBackButton(false);

  // Open next macro
  nextMacro.open = true;
  _showBackButton(true);
  showMacroPanel(nextMacro);
  _clusterHoverPinned = true;
  _hoveredClusterKey  = `macro:${nextMacro.id}:Space Theme`;
  _prefetchMacroSubs(nextMacro);

  const extent = (nextMacro._subRingR || FIRST_RING_R) + SUBCLUSTER_BASE_R;
  _zoomTo(nextMacro.rx, nextMacro.ry, (min(width, height) * 0.35) / extent, NAV_ANIM_DURATION);
  _updateCursorState();
}

// Navigate left/right between sub-clusters in the same macro
// Returns the world-space outer radius of an open sub-cluster (rings + float zone + padding).
function _subClusterOuterRadius(sub) {
  let r = _floatZoneR(sub.floating ? sub.floating.length : 0);
  if (sub._rings) {
    for (const ring of sub._rings) {
      if (ring.threads.length > 0) r = Math.max(r, ring.r);
    }
  }
  return r + NODE_RADIUS + 8;
}

// Returns the target zoom level when opening or navigating to a sub-cluster.
// Falls back to a fixed zoom when the ring layout isn't computed yet (pending load).
function _adaptiveSubZoom(sub) {
  if (!sub._rings) return constrain((min(width, height) * 0.22) / NODE_ORBIT_RADIUS, 1.2, 2.8);
  const subR   = _subClusterOuterRadius(sub);
  const minDim = Math.min(width, height);
  // Ideal zoom so the cluster occupies ~70% of the smaller viewport dimension.
  // Computed from absolute world size — independent of camZoom so entering from
  // any zoom level (macro overview, gallery, etc.) always produces the right result.
  const ideal  = Math.max(0.5, Math.min(3.0, (minDim * 0.35) / subR));
  // Suppress micro-zooms: if the required change is < 15% of current zoom,
  // leave it alone (avoids jitter when navigating between similarly-sized clusters).
  if (Math.abs(ideal - camZoom) / Math.max(camZoom, 0.1) < 0.15) return camZoom;
  return ideal;
}

function _navigateSubCluster(macro, currentSub, dir) {
  // Block key-repeat: wait until the pan animation from the previous press has
  // had time to finish before accepting the next input.
  if (millis() - _lastSubNavTime < NAV_ANIM_DURATION) return;
  _lastSubNavTime = millis();

  const sorted = [...macro.subClusters].sort((a, b) =>
    Math.atan2(a.ry, a.rx) - Math.atan2(b.ry, b.rx)
  );
  const idx     = sorted.indexOf(currentSub);
  const nextSub = sorted[(idx + dir + sorted.length) % sorted.length];
  if (nextSub === currentSub) return;

  // If the next sub's data hasn't arrived yet (prefetch still in flight),
  // wait for it before doing anything visible — avoids the empty-ring flicker.
  if (HAS_GALAXY_LEVEL && !nextSub._emailsLoaded) {
    _loadSubEmails(nextSub, macro).then(() => {
      // Re-enter once data is ready; timing gate already passed so it will proceed
      _lastSubNavTime = -9999;
      _navigateSubCluster(macro, currentSub, dir);
    });
    return;
  }

  // Close current
  currentSub.open   = false;
  currentSub._rings = null;

  // Open next — data is guaranteed loaded at this point
  nextSub.open = true;
  cacheNodePositions(nextSub, macro.rx, macro.ry);

  showExpandedPanel(macro, nextSub, null, CROSS_LINKS);
  window.showClusterPanel?.(); // right panel: cluster mode for the new sub
  _clusterHoverPinned = true;
  _hoveredClusterKey = `sub:${nextSub.id}:Expanded`;

  _zoomTo(macro.rx + nextSub.rx, macro.ry + nextSub.ry, _adaptiveSubZoom(nextSub), NAV_ANIM_DURATION);
  _updateCursorState();
}

// Navigate left/right between email nodes in the open sub-cluster
function _navigateEmail(dir) {
  const openMacro = MACROS.find(m => m.open);
  if (!openMacro) return;
  const openSub = openMacro.subClusters.find(s => s.open);
  if (!openSub) return;

  // Collect nodes in exactly the order they are numbered on the canvas:
  // floating nodes first, then ring nodes in ring-layout order (sub._rings).
  // This matches the sequence in drawSubClusterSystem so arrow-key order
  // matches the visible 1. 2. 3. labels.
  const allNodes = [...(openSub.floating || [])];
  if (openSub._rings && openSub._rings.length > 0) {
    for (const ring of openSub._rings) {
      for (const thread of ring.threads) {
        allNodes.push(...thread.nodes);
      }
    }
  } else {
    for (const thread of (openSub.threads || [])) {
      allNodes.push(...(thread.nodes || []));
    }
  }
  if (allNodes.length === 0) return;

  const idx      = allNodes.findIndex(n => n.email_id === _selectedEmailId);
  const nextIdx  = ((idx === -1 ? 0 : idx) + dir + allNodes.length) % allNodes.length;
  const nextNode = allNodes[nextIdx];

  _selectedEmailId    = nextNode.email_id;
  _selectedEmailIds   = new Set([nextNode.email_id]); // keep in sync so size highlight follows
  _clusterHoverPinned = true;
  _hoveredClusterKey  = `email:${nextNode.email_id}:Expanded`;

  // Fast path: don't rebuild the panel DOM — just update the detail panel text
  // and redraw existing canvases to flip the red highlight.
  const fullEmail   = findEmailContents(nextNode.email_id);
  const fullSubject = fullEmail ? (fullEmail.subject_full || fullEmail.subject) : null;
  showEmailDetailPanel({
    subject:  fullSubject || nextNode.subject     || '(no subject)',
    date:     (fullEmail && fullEmail.date) ? fullEmail.date : (nextNode.date_str    || 'Unknown'),
    size:     (fullEmail && fullEmail.size) ? fullEmail.size : (nextNode.size        || 'Unknown'),
    body:     (fullEmail && fullEmail.body) ? fullEmail.body : (nextNode.body_preview || ''),
    _emailId: nextNode.email_id,
    _node:    nextNode,
  });
  if (window.refreshPanelCanvases) window.refreshPanelCanvases();
  redraw();
}

function keyReleased() {
  if (_inputHasFocus()) return;
  const k = key.toLowerCase();
  if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
    // Only stop if no WASD key remains held (W=87 A=65 S=83 D=68)
    if (!keyIsDown(87) && !keyIsDown(65) && !keyIsDown(83) && !keyIsDown(68)) {
      _wasdActive = false;
      _maybePauseLoop();
    }
    return false;
  }
  // Stop arrow zoom when neither arrow key is held
  if (keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
    if (!keyIsDown(UP_ARROW) && !keyIsDown(DOWN_ARROW)) {
      _arrowZoomActive = false;
      _maybePauseLoop();
    }
    return false;
  }
}

function _updateEdgePan() {
  // Don't edge-scroll while hovering over any panel
  let el = document.elementFromPoint(mouseX, mouseY);
  while (el) {
    if (el.classList && (el.classList.contains('panel-container') ||
      el.classList.contains('email-detail-container'))) {
      _edgePanVX = 0; _edgePanVY = 0;
      if (_isEdgeScrolling) { _isEdgeScrolling = false; _maybePauseLoop(); }
      return;
    }
    el = el.parentElement;
  }

  const z = EDGE_SCROLL_ZONE, s = EDGE_SCROLL_SPEED;
  _edgePanVX = 0;
  if (mouseX < z) _edgePanVX = s * (1 - mouseX / z);
  if (mouseX > width - z) _edgePanVX = -s * (1 - (width - mouseX) / z);
  _edgePanVY = 0;
  if (mouseY < z) _edgePanVY = s * (1 - mouseY / z);
  if (mouseY > height - z) _edgePanVY = -s * (1 - (height - mouseY) / z);

  const scrolling = _edgePanVX !== 0 || _edgePanVY !== 0;
  if (scrolling && !_isEdgeScrolling) {
    _isEdgeScrolling = true;
    _animTarget = null; // cancel zoom animation when user steers away
    loop();
  } else if (!scrolling && _isEdgeScrolling) {
    _isEdgeScrolling = false;
    _maybePauseLoop();
  }
}

// Open or close all sub-clusters linked to the given sub_id via cross_links
function _toggleCrossLinkedSubs(subId, opening) {
  for (let cl of CROSS_LINKS) {
    let ids = cl.sub_clusters.map(e => e.sub_id);
    if (!ids.includes(subId)) continue;

    for (let entry of cl.sub_clusters) {
      if (entry.sub_id === subId) continue;
      let ref = _subById[entry.sub_id];
      if (!ref) continue;

      // Ensure the parent macro is also open
      if (opening) ref.macro.open = true;

      ref.sub.open = opening;
      if (opening) cacheNodePositions(ref.sub, ref.macro.rx, ref.macro.ry);
    }
  }
}

function mouseWheel(event) {
  // If the cursor is over any panel / chat / overlay let the browser scroll it naturally
  if (event && event.target) {
    const overPanel = event.target.closest(
      '.panel-container, .email-detail-container, #right-panel-stack, .icon-slot, #icon-arrow, #icon-help'
    );
    if (overPanel) return; // do NOT return false — allow native scroll
  }
  _cancelAnim();

  if (event.ctrlKey) {
    // Pinch-to-zoom (trackpad) or Ctrl+scroll
    const zf = event.delta > 0 ? ZOOM_OUT : ZOOM_IN;
    _zoomAnchorWX = (mouseX - width / 2 - camX) / camZoom;
    _zoomAnchorWY = (mouseY - height / 2 - camY) / camZoom;
    _zoomAnchorSX = mouseX;
    _zoomAnchorSY = mouseY;
    _zoomTarget = constrain(_zoomTarget * zf, 0.1, 5);
    _isZooming = true;
    loop();
  } else {
    // Two-finger pan (trackpad) or scroll wheel → pan
    camX -= event.deltaX * PAN_SPEED;
    camY -= event.deltaY * PAN_SPEED;
    _isPanning = true;
    loop();
    clearTimeout(_wheelPanTimeout);
    _wheelPanTimeout = setTimeout(() => {
      _isPanning = false;
      _maybePauseLoop();
    }, 150);
  }
  return false;
}

// ── EMAIL LOOKUP HELPER ──────────────────────────────────────────

function findEmailContents(emailId) {
  if (!_emailsData || !_emailsData.emails) return null;
  if (!_emailsById) {
    _emailsById = {};
    for (let e of _emailsData.emails) {
      _emailsById[e.id] = e;
    }
  }
  return _emailsById[emailId] || null;
}

// ── CHAT NAVIGATION ───────────────────────────────────────────────
// Opens a sub-cluster from a chat chip — works regardless of which galaxy
// the user is currently viewing.
window.openSubById = function (subId) {
  // Sub already in current galaxy — navigate directly
  if (_subById[subId]) {
    window.navigateToSubCluster(subId);
    return;
  }

  // Sub is in a different galaxy — enter it first, then navigate.
  // _enterGalaxy is synchronous (populates MACROS/_subById immediately),
  // but we give the layout one rAF tick to settle before zooming.
  if (!_vizData || !_vizData.galaxies) return;
  for (let g of _vizData.galaxies) {
    for (let m of g.macros || []) {
      for (let s of m.subClusters || []) {
        if (s.id === subId) {
          const galaxy = GALAXIES ? GALAXIES.find(gl => gl.id === g.id) : null;
          if (galaxy) {
            _enterGalaxy(galaxy);
            requestAnimationFrame(() => window.navigateToSubCluster(subId));
          }
          return;
        }
      }
    }
  }
};

// ── LAZY LOADING (galaxy mode) ────────────────────────────────────

// Fetch email metadata for a sub-cluster from the Flask API.
// Batch-fetches all sub-cluster email data for a macro in one request.
// Called when a macro opens so data is ready before the user presses arrows.
async function _prefetchMacroSubs(macro) {
  if (macro._subsLoaded) return;
  macro._subsLoaded = true;
  try {
    const data = await fetch(`/output/macro_subs/${macro.id}.json`).then(r => r.json());
    for (const sub of macro.subClusters) {
      const d = data[String(sub.id)];
      if (d && !sub._emailsLoaded) {
        sub.threads       = d.threads  || [];
        sub.floating      = d.floating || [];
        sub._emailsLoaded = true;
        sub._rings        = null;
        _snapshotCluster(sub);
      }
    }
    // If a sub is already open, recompute its positions with the fresh data
    const openSub = macro.subClusters.find(s => s.open);
    if (openSub) {
      cacheNodePositions(openSub, macro.rx, macro.ry);
      // Refresh the expanded panel so the email grid shows the newly loaded data
      showExpandedPanel(macro, openSub, null, CROSS_LINKS);
    }
    // Always redraw — thread data is now populated so sub-cluster gradients
    // can show their thread colours even on closed blobs.
    redraw();
  } catch (e) {
    macro._subsLoaded = false; // allow retry on next open
  }
}

// Populates sub.threads and sub.floating, then triggers render.
async function _loadSubEmails(sub, macro) {
  try {
    const url = `../output/emails_meta/sub_${sub.id}.json`;
    const data = await fetch(url).then(r => r.json());
    sub.threads  = data.threads  || [];
    sub.floating = data.floating || [];
    sub._emailsLoaded = true;
    sub._rings = null;
    _snapshotCluster(sub);
    cacheNodePositions(sub, macro.rx, macro.ry);
    if (sub._pendingOpenAnim) {
      sub._pendingOpenAnim = false;
      sub._openAnimStart = millis();
      loop();
      // Now that rings are computed, apply the correct adaptive zoom
      _zoomTo(macro.rx + sub.rx, macro.ry + sub.ry, _adaptiveSubZoom(sub));
    }
    // If this sub is currently open, refresh the expanded panel with the loaded emails
    if (sub.open) showExpandedPanel(macro, sub, null, CROSS_LINKS);
    redraw();
  } catch (e) {
    console.warn(`Could not load emails for sub-cluster ${sub.id}:`, e);
  }
}

async function _fetchEmailBody(emailId) {
  try {
    const url = `../output/email_body/email_${emailId}.json`;
    return await fetch(url).then(r => r.json());
  } catch (e) {
    console.warn(`Could not load email body ${emailId}:`, e);
    return null;
  }
}

// ── PANEL HELPERS ────────────────────────────────────────────────

// Wrap closeEmailPanel to also unpin the cluster hover
const _closeEmailPanelOrig = window.closeEmailPanel;
window.closeEmailPanel = function () {
  _clusterHoverPinned = false;
  _hoveredClusterKey = null;
  _hoveredMacro = null;
  _hoveredSub = null;
  _panelSub = null;
  _selectedEmailId = null;
  closePanel();
};

function _showNodePanel(node, sub, macro) {
  _selectedEmailId = node.email_id;
  _selectedNode    = node;
  _selectedSub     = sub;
  _selectedMacro   = macro;
  showExpandedPanel(macro, sub, node, CROSS_LINKS);
  _clusterHoverPinned = true;
  _hoveredClusterKey = `email:${node.email_id}:Expanded`;

  // Archive copies carry all their own data — no network fetch needed
  if (node._isArchive) {
    showEmailDetailPanel({
      subject:    node.subject      || '(no subject)',
      date:       node.date_str     || 'Unknown',
      body:       node.body_preview || '',
      size_kb:    node.size_kb      || null,
      attachment: node.attachment   || null,
      _emailId:   node.email_id,
      _node:      node,
    });
  } else if (HAS_GALAXY_LEVEL) {
    _fetchEmailBody(node.email_id).then(fullEmail => {
      showEmailDetailPanel({
        subject:    (fullEmail && fullEmail.subject) || node.subject || '(no subject)',
        date:       (fullEmail && fullEmail.date)    || node.date_str || 'Unknown',
        body:       (fullEmail && fullEmail.body)    || node.body_preview || '',
        size_kb:    node.size_kb    || null,
        attachment: node.attachment || null,
        _emailId:   node.email_id,
        _node:      node,
      });
    });
  } else {
    let fullEmail = findEmailContents(node.email_id);
    const fullSubject = fullEmail ? (fullEmail.subject_full || fullEmail.subject) : null;
    if (fullEmail || node) {
      showEmailDetailPanel({
        subject:    fullSubject || node.subject || '(no subject)',
        date:       (fullEmail && fullEmail.date) ? fullEmail.date : ((node.date_str && node.date_str !== '—') ? node.date_str : 'Unknown'),
        body:       (fullEmail && fullEmail.body) ? fullEmail.body : (node.body_preview || ''),
        size_kb:    node.size_kb    || null,
        attachment: node.attachment || null,
        _emailId:   node.email_id,
        _node:      node,
      });
    }
  }
}

// ── DELETE & UNDO ─────────────────────────────────────────────────

function _clearRingSelection() {
  _selectedRingIdx = null;
  _selectedRingSub = null;
  _selectedRingMacro = null;
}

// Snapshot a sub-cluster's original state the first time its emails are loaded.
// Used by undoAllChanges to restore the cluster to its as-loaded condition.
function _snapshotCluster(sub) {
  if (sub._originalState) return; // already saved
  const ringAssignments = [];
  if (sub._threadRingMap) {
    sub.threads.forEach((t, i) => {
      const ri = sub._threadRingMap.get(t);
      if (ri !== undefined) ringAssignments.push([i, ri]);
    });
  }
  sub._originalState = {
    threads:         sub.threads.map(t => ({ nodes: t.nodes.slice() })),
    floating:        sub.floating.slice(),
    ringAssignments,
    numRings:        sub._numRings,
  };
}

function _afterNodeDelete(sub, macro) {
  sub._rings = computeUserRingLayout(sub);
  _recacheRingNodePositions(sub, macro.rx, macro.ry);
  _selectedNode     = null;
  _selectedEmailId  = null;
  _selectedEmailIds = new Set();
  // Keep trash galaxy size in sync after permanent deletions inside it
  if (sub.id === window._TRASH_DEFAULT_ID) window._syncTrashGalaxy?.();
  // Stay in cluster view — switch right panel back to minimal (actions only)
  window.showClusterPanel?.();
  _updateActionBtns();
  redraw();
}

function _updateActionBtns() {
  const anySelected = _selectedEmailIds.size > 0 || !!_selectedEmailId;
  const multiSelected = _selectedEmailIds.size >= 2;

  const undoBtn    = document.getElementById('btn-undo');
  if (undoBtn)    undoBtn.disabled    = !_lastDeleteAction;
  const undoAllBtn = document.getElementById('btn-undo-all');
  if (undoAllBtn) undoAllBtn.disabled = !(_selectedSub?._originalState);
  const ringBtn    = document.getElementById('btn-delete-ring');
  if (ringBtn)    ringBtn.disabled    = (_selectedRingIdx == null);
  const splitBtn   = document.getElementById('btn-split');
  if (splitBtn)   splitBtn.disabled   = (_selectedEmailIds.size === 0);
  const archiveBtn  = document.getElementById('btn-archive');
  const ringSelected = (_selectedRingIdx != null);
  if (archiveBtn) archiveBtn.disabled = !anySelected && !ringSelected;
  const groupBtn   = document.getElementById('btn-group');
  if (groupBtn)   groupBtn.disabled   = !multiSelected;

  // Colour swatches — enabled when email(s) or a ring is selected
  const canColor = anySelected || _selectedRingIdx != null;
  document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.disabled = !canColor;
  });
}

// Apply a colour to all currently selected email nodes
window.applyEmailColor = function (color) {
  if (!MACROS) return;

  // ── Ring selected: colour every thread on that ring ───────────────
  if (_selectedRingIdx != null && _selectedRingSub) {
    const sub = _selectedRingSub;
    const ri  = _selectedRingIdx;
    for (const thread of (sub.threads || [])) {
      const tRi = sub._threadRingMap ? (sub._threadRingMap.get(thread) ?? 0) : 0;
      if (tRi === ri) {
        for (const n of thread.nodes) { n._threadColor = color; n._userColor = true; }
      }
    }
    redraw();
    return;
  }

  // ── Email(s) selected: colour each matched node + its whole thread ─
  const ids = new Set(_selectedEmailIds);
  if (_selectedEmailId) ids.add(_selectedEmailId);
  if (ids.size === 0) return;

  for (const macro of MACROS) {
    for (const sub of macro.subClusters) {
      if (!sub.open) continue;
      for (const node of (sub.floating || [])) {
        if (ids.has(node.email_id)) { node._threadColor = color; node._userColor = true; }
      }
      for (const thread of (sub.threads || [])) {
        if (thread.nodes.some(n => ids.has(n.email_id))) {
          // Colour the entire thread so the arc ring shows consistently
          for (const n of thread.nodes) { n._threadColor = color; n._userColor = true; }
        }
      }
    }
  }
  redraw();
};

// Legacy alias used by panel.js wiring
function _updateUndoBtn() { _updateActionBtns(); }

window.deleteSelectedEmail = function () {
  if (!_selectedSub || !_selectedMacro) return;
  const sub = _selectedSub, macro = _selectedMacro;

  const _inTrash = window._isInTrashGalaxy?.();

  // ── Multi-select: delete every selected email at once ─────────────
  if (_selectedEmailIds.size > 1) {
    const ids = new Set(_selectedEmailIds);

    // Collect nodes BEFORE removal so we can move them to trash
    if (!_inTrash) {
      const toTrash = [];
      for (const t of sub.threads) for (const n of t.nodes) if (ids.has(n.email_id)) toTrash.push(n);
      for (const n of sub.floating) if (ids.has(n.email_id)) toTrash.push(n);
      window.moveNodesToTrash?.(toTrash, sub, macro);
    }

    let count = 0;
    for (let i = sub.floating.length - 1; i >= 0; i--) {
      if (ids.has(sub.floating[i].email_id)) { sub.floating.splice(i, 1); count++; }
    }
    for (let ti = sub.threads.length - 1; ti >= 0; ti--) {
      const thread = sub.threads[ti];
      for (let ni = thread.nodes.length - 1; ni >= 0; ni--) {
        if (ids.has(thread.nodes[ni].email_id)) { thread.nodes.splice(ni, 1); count++; }
      }
      if (thread.nodes.length === 0) {
        sub.threads.splice(ti, 1);
        if (sub._threadRingMap) sub._threadRingMap.delete(thread);
      }
    }

    if (count > 0) {
      _lastDeleteAction = { type: 'multi-email', sub, macro, count };
      _selectedEmailIds = new Set();
      if (!_inTrash) window.addDeletedEmails?.(count);
      _afterNodeDelete(sub, macro);
    }
    return;
  }

  // ── Single-select ─────────────────────────────────────────────────
  if (!_selectedNode) return;
  const node = _selectedNode;

  // Floating node?
  const fi = sub.floating.indexOf(node);
  if (fi !== -1) {
    if (!_inTrash) window.moveNodesToTrash?.([node], sub, macro);
    _lastDeleteAction = { type: 'email', sub, macro,
      wasFloating: true, floatingIdx: fi, nodeObj: node };
    sub.floating.splice(fi, 1);
    if (!_inTrash) window.addDeletedEmails?.(1);
    _afterNodeDelete(sub, macro);
    return;
  }

  // Thread node
  for (let ti = 0; ti < sub.threads.length; ti++) {
    const thread = sub.threads[ti];
    const ni = thread.nodes.indexOf(node);
    if (ni === -1) continue;

    const threadRemoved = thread.nodes.length === 1;
    const ringMapEntry  = sub._threadRingMap
      ? [thread, sub._threadRingMap.get(thread)] : null;

    if (!_inTrash) window.moveNodesToTrash?.([node], sub, macro);
    _lastDeleteAction = { type: 'email', sub, macro,
      wasFloating: false,
      threadObj: thread, threadIdxInSub: ti,
      nodeIdxInThread: ni, nodeObj: node,
      threadRemoved, ringMapEntry };

    thread.nodes.splice(ni, 1);
    if (threadRemoved) {
      sub.threads.splice(ti, 1);
      if (sub._threadRingMap) sub._threadRingMap.delete(thread);
    }
    if (!_inTrash) window.addDeletedEmails?.(1);
    _afterNodeDelete(sub, macro);
    return;
  }
};

window.deleteSelectedThread = function () {
  if (!_selectedNode || !_selectedSub || !_selectedMacro) return;
  const node = _selectedNode, sub = _selectedSub, macro = _selectedMacro;
  const color = node._threadColor;

  // No color means single/floating — fall back to email delete
  if (!color) { window.deleteSelectedEmail(); return; }

  const removedEntries = [];
  for (let ti = sub.threads.length - 1; ti >= 0; ti--) {
    const thread = sub.threads[ti];
    if (thread.nodes.length > 0 && thread.nodes[0]._threadColor === color) {
      const ringMapEntry = sub._threadRingMap
        ? [thread, sub._threadRingMap.get(thread)] : null;
      removedEntries.unshift({ thread, idxInSub: ti, ringMapEntry });
      sub.threads.splice(ti, 1);
      if (sub._threadRingMap) sub._threadRingMap.delete(thread);
    }
  }
  if (removedEntries.length === 0) return;

  if (!window._isInTrashGalaxy?.()) {
    const nodes = removedEntries.flatMap(e => e.thread.nodes);
    window.moveNodesToTrash?.(nodes, sub, macro);
    window.addDeletedEmails?.(nodes.length);
  }
  _lastDeleteAction = { type: 'thread', sub, macro, removedEntries };
  _afterNodeDelete(sub, macro);
};

window.deleteSelectedRing = function () {
  if (_selectedRingIdx == null || !_selectedRingSub || !_selectedRingMacro) return;
  const sub = _selectedRingSub, macro = _selectedRingMacro;
  const ri  = _selectedRingIdx;

  // Ensure rings are computed (can be null after email load)
  if (!sub._rings) sub._rings = computeUserRingLayout(sub);
  if (!sub._rings || ri >= sub._rings.length) return;
  if ((sub._numRings || sub._rings.length) <= 1) return; // can't delete the last ring

  // Collect threads assigned to this ring — treat unmapped threads as ring 0
  const threadsOnRing = [];
  sub.threads.forEach((t, i) => {
    const tRi = sub._threadRingMap ? (sub._threadRingMap.get(t) ?? 0) : 0;
    if (tRi === ri) threadsOnRing.push({ thread: t, idxInSub: i });
  });

  _lastDeleteAction = {
    type: 'ring', sub, macro,
    ringIdx:         ri,
    deletedThreads:  threadsOnRing.map(e => e.thread),
    deletedIdxs:     threadsOnRing.map(e => e.idxInSub),
    ringMapSnapshot: sub._threadRingMap ? new Map(sub._threadRingMap) : null,
    numRingsBefore:  sub._numRings || sub._rings.length,
  };

  // Move ring contents to trash before removing (skip if already in Trash)
  const _ringInTrash = window._isInTrashGalaxy?.();
  if (!_ringInTrash) {
    const ringNodes = threadsOnRing.flatMap(e => e.thread.nodes);
    window.moveNodesToTrash?.(ringNodes, sub, macro);
  }

  // Delete threads (and their emails) on the selected ring — iterate in reverse
  let deletedEmailCount = 0;
  for (let i = threadsOnRing.length - 1; i >= 0; i--) {
    const { thread, idxInSub } = threadsOnRing[i];
    deletedEmailCount += thread.nodes.length;
    sub.threads.splice(idxInSub, 1);
    if (sub._threadRingMap) sub._threadRingMap.delete(thread);
  }

  // Shift remaining ring indices above ri down by 1
  if (sub._threadRingMap) {
    for (const [thread, rIdx] of sub._threadRingMap) {
      if (rIdx > ri) sub._threadRingMap.set(thread, rIdx - 1);
    }
  }

  sub._numRings = Math.max(1, (sub._numRings || sub._rings.length) - 1);
  _clearRingSelection();

  if (!_ringInTrash) window.addDeletedEmails?.(deletedEmailCount);

  sub._rings = computeUserRingLayout(sub);
  _recacheRingNodePositions(sub, macro.rx, macro.ry);
  _updateActionBtns();
  redraw();
};

window.deleteSelectedCluster = function () {
  // Fall back to the currently open cluster when nothing is explicitly selected
  const macro = _selectedMacro || _selectedRingMacro || MACROS.find(m => m.open);
  const sub   = _selectedSub   || _selectedRingSub   || macro?.subClusters.find(s => s.open);
  if (!sub || !macro) return;

  const subIdx = macro.subClusters.indexOf(sub);
  if (subIdx === -1) return;

  // Move all cluster emails to trash before removing (skip if already in Trash)
  if (!window._isInTrashGalaxy?.()) {
    const clusterNodes = [];
    for (const t of sub.threads) clusterNodes.push(...t.nodes);
    clusterNodes.push(...(sub.floating || []));
    window.moveNodesToTrash?.(clusterNodes, sub, macro);
    window.addDeletedEmails?.(clusterNodes.length);
  }

  _lastDeleteAction = { type: 'cluster', sub, macro, subIdxInMacro: subIdx };

  macro.subClusters.splice(subIdx, 1);
  sub.open = false;
  sub._rings = null;

  _selectedNode = null; _selectedSub = null;
  _selectedMacro = null; _selectedEmailId = null;
  _clusterHoverPinned = false;

  closePanel();

  if (macro.subClusters.length > 0) {
    assignSubClusterPositions(macro);
    showMacroPanel(macro);
    const extent = (macro._subRingR || FIRST_RING_R) + SUBCLUSTER_BASE_R;
    _zoomTo(macro.rx, macro.ry, (min(width, height) * 0.35) / extent);
  } else {
    macro.open = false;
  }

  _updateUndoBtn();
  redraw();
};

window.undoLastDelete = function () {
  if (!_lastDeleteAction) return;
  const action = _lastDeleteAction;
  _lastDeleteAction = null;

  const { sub, macro } = action;

  if (action.type === 'email') {
    if (action.wasFloating) {
      sub.floating.splice(action.floatingIdx, 0, action.nodeObj);
    } else if (action.threadRemoved) {
      // Restore the node into its thread first, then re-insert the thread
      action.threadObj.nodes.splice(action.nodeIdxInThread, 0, action.nodeObj);
      sub.threads.splice(action.threadIdxInSub, 0, action.threadObj);
      if (sub._threadRingMap && action.ringMapEntry) {
        sub._threadRingMap.set(action.ringMapEntry[0], action.ringMapEntry[1]);
      }
    } else {
      action.threadObj.nodes.splice(action.nodeIdxInThread, 0, action.nodeObj);
    }
    sub._rings = computeUserRingLayout(sub);
    _recacheRingNodePositions(sub, macro.rx, macro.ry);

  } else if (action.type === 'thread') {
    for (const entry of action.removedEntries) {
      sub.threads.splice(entry.idxInSub, 0, entry.thread);
      if (sub._threadRingMap && entry.ringMapEntry) {
        sub._threadRingMap.set(entry.ringMapEntry[0], entry.ringMapEntry[1]);
      }
    }
    sub._rings = computeUserRingLayout(sub);
    _recacheRingNodePositions(sub, macro.rx, macro.ry);

  } else if (action.type === 'cluster') {
    macro.subClusters.splice(action.subIdxInMacro, 0, action.sub);
    assignSubClusterPositions(macro);

  } else if (action.type === 'ring') {
    // Restore deleted threads (insert in original positions, smallest index first)
    if (action.deletedThreads?.length) {
      const entries = action.deletedThreads.map((t, i) => ({ thread: t, idx: action.deletedIdxs[i] }));
      entries.sort((a, b) => a.idx - b.idx);
      for (const { thread, idx } of entries) sub.threads.splice(idx, 0, thread);
    }
    if (action.ringMapSnapshot) sub._threadRingMap = new Map(action.ringMapSnapshot);
    sub._numRings = action.numRingsBefore;
    sub._rings = computeUserRingLayout(sub);
    _recacheRingNodePositions(sub, macro.rx, macro.ry);

  } else if (action.type === 'group') {
    const idx = sub.threads.indexOf(action.newThread);
    if (idx !== -1) sub.threads.splice(idx, 1);
    for (const t of action.removedEmpty) sub.threads.push(t);
    for (const [t, orig] of action.sourcesEdited) {
      t.nodes = orig;
      const c = orig.length > 1 ? orig[0]._threadColor : null;
      for (const n of orig) n._threadColor = c;
    }
    sub.floating = action.floatingSnapshot;
    if (action.ringMapSnapshot) sub._threadRingMap = new Map(action.ringMapSnapshot);
    sub._rings = computeUserRingLayout(sub);
    _recacheRingNodePositions(sub, macro.rx, macro.ry);

  } else if (action.type === 'split') {
    // Remove the newly created thread
    const idx = sub.threads.indexOf(action.newThread);
    if (idx !== -1) sub.threads.splice(idx, 1);
    // Re-add any threads that were emptied and removed
    for (const t of action.removedEmpty) sub.threads.push(t);
    // Restore original node lists and colours
    for (const [thread, origNodes] of action.sourcesEdited) {
      thread.nodes = origNodes;
      const origColor = origNodes.length > 1 ? origNodes[0]._threadColor : null;
      for (const n of origNodes) n._threadColor = origColor;
    }
    // Restore ring map
    if (action.ringMapSnapshot) sub._threadRingMap = new Map(action.ringMapSnapshot);
    sub._rings = computeUserRingLayout(sub);
    _recacheRingNodePositions(sub, macro.rx, macro.ry);
  }

  _updateActionBtns();
  redraw();
};

window.undoAllChanges = function () {
  if (!_selectedSub || !_selectedMacro) return;
  const sub = _selectedSub, macro = _selectedMacro;
  const orig = sub._originalState;
  if (!orig) return;

  const newThreads = orig.threads.map(t => ({ nodes: [...t.nodes] }));
  sub.threads  = newThreads;
  sub.floating = [...orig.floating];
  sub._numRings = orig.numRings;

  if (orig.ringAssignments?.length) {
    sub._threadRingMap = new Map();
    for (const [ti, ri] of orig.ringAssignments) {
      if (newThreads[ti]) sub._threadRingMap.set(newThreads[ti], ri);
    }
  } else {
    sub._threadRingMap = null;
  }

  _lastDeleteAction = null;
  _selectedNode     = null;
  _selectedEmailId  = null;
  _selectedEmailIds = new Set();

  sub._rings = computeUserRingLayout(sub);
  _recacheRingNodePositions(sub, macro.rx, macro.ry);
  window.showClusterPanel?.();
  _updateActionBtns();
  redraw();
};

// ── SPLIT ─────────────────────────────────────────────────────────

function _shiftSelectEmail(node, sub, macro) {
  // Toggle this node's email_id in the multi-select set
  if (_selectedEmailIds.has(node.email_id)) {
    _selectedEmailIds.delete(node.email_id);
  } else {
    _selectedEmailIds.add(node.email_id);
  }
  // Keep context pointers to the sub/macro for Split to use
  _selectedSub   = sub;
  _selectedMacro = macro;
  _selectedNode  = node;
  _selectedEmailId = node.email_id;

  if (_selectedEmailIds.size > 0) {
    window.showClusterPanel?.();
  }
  _updateActionBtns();
}

function _pickNewThreadColor(sub) {
  const used = new Set(sub.threads.flatMap(t => t.nodes.map(n => n._threadColor)).filter(Boolean));
  const multiCount = sub.threads.filter(t => t.nodes.length > 1).length;
  const comboSize  = multiCount <= 2 ? 2 : multiCount === 3 ? 3 : 4;
  const comboList  = THREAD_COMBOS[comboSize];
  const combo      = comboList[(sub.id * 137) % comboList.length];
  for (const c of combo) { if (!used.has(c)) return c; }
  // Fallback: any unused colour from the full palette
  const offset = (sub.id * 137) % THREAD_COLORS.length;
  for (let i = 0; i < THREAD_COLORS.length; i++) {
    const c = THREAD_COLORS[(i + offset) % THREAD_COLORS.length];
    if (!used.has(c)) return c;
  }
  return combo[0];
}

window.splitSelectedEmails = function () {
  const ids = _selectedEmailIds;
  if (!ids.size || !_selectedSub || !_selectedMacro) return;
  const sub = _selectedSub, macro = _selectedMacro;

  // Collect the selected nodes (in order) and which threads they came from
  const splitNodes    = [];
  const sourcesEdited = new Map(); // thread → original nodes snapshot

  for (const t of sub.threads) {
    const kept = [], taken = [];
    for (const n of t.nodes) {
      if (ids.has(n.email_id)) taken.push(n);
      else                      kept.push(n);
    }
    if (!taken.length) continue;
    if (!sourcesEdited.has(t)) sourcesEdited.set(t, [...t.nodes]);
    t.nodes = kept;
    splitNodes.push(...taken);
  }
  if (!splitNodes.length) return;

  // Assign new colour to split-off nodes (even single-node groups get a colour)
  const newColor  = _pickNewThreadColor(sub);
  const newThread = { nodes: splitNodes };
  for (const n of splitNodes) n._threadColor = newColor;
  sub.threads.push(newThread);

  // Remove threads that became empty
  const removedEmpty = [];
  sub.threads = sub.threads.filter(t => {
    if (t === newThread) return true;
    if (t.nodes.length === 0) { removedEmpty.push(t); return false; }
    return true;
  });

  // Place new thread on the same ring as the first source thread
  if (sub._threadRingMap) {
    const firstSource = [...sourcesEdited.keys()][0];
    const ri = sub._threadRingMap.get(firstSource) ?? 0;
    sub._threadRingMap.set(newThread, ri);
    for (const t of removedEmpty) sub._threadRingMap.delete(t);
  }

  // Undo snapshot
  _lastDeleteAction = {
    type: 'split', sub, macro, newThread,
    sourcesEdited,    // Map<thread, originalNodes[]>
    removedEmpty,
    ringMapSnapshot: sub._threadRingMap ? new Map(sub._threadRingMap) : null,
  };

  // Clear multi-selection
  _selectedEmailIds = new Set();
  _selectedEmailId  = null;
  _selectedNode     = null;

  sub._rings = computeUserRingLayout(sub);
  _recacheRingNodePositions(sub, macro.rx, macro.ry);

  window.showClusterPanel?.();
  _updateActionBtns();
  redraw();
};

// ── GROUP (opposite of Split — merges selected emails into a new thread) ──

window.groupSelectedEmails = function () {
  const ids = _selectedEmailIds;
  if (ids.size < 2 || !_selectedSub || !_selectedMacro) return;
  const sub = _selectedSub, macro = _selectedMacro;

  const groupNodes      = [];
  const floatingSnapshot = [...sub.floating];

  // Take from floating
  sub.floating = sub.floating.filter(n => {
    if (ids.has(n.email_id)) { groupNodes.push(n); return false; }
    return true;
  });

  // Take from threads
  const sourcesEdited = new Map();
  const removedEmpty  = [];
  for (const t of sub.threads) {
    const kept = [], taken = [];
    for (const n of t.nodes) {
      if (ids.has(n.email_id)) taken.push(n); else kept.push(n);
    }
    if (!taken.length) continue;
    sourcesEdited.set(t, [...t.nodes]);
    t.nodes = kept;
    groupNodes.push(...taken);
  }

  if (!groupNodes.length) { sub.floating = floatingSnapshot; return; }

  // Remove emptied threads
  sub.threads = sub.threads.filter(t => {
    if (t.nodes.length === 0) { removedEmpty.push(t); return false; }
    return true;
  });

  const newColor  = _pickNewThreadColor(sub);
  const newThread = { nodes: groupNodes };
  for (const n of groupNodes) n._threadColor = newColor;
  sub.threads.push(newThread);

  if (sub._threadRingMap) {
    const firstSrc = [...sourcesEdited.keys()][0];
    const ri = firstSrc ? (sub._threadRingMap.get(firstSrc) ?? 0) : 0;
    sub._threadRingMap.set(newThread, ri);
    for (const t of removedEmpty) sub._threadRingMap.delete(t);
  }

  _lastDeleteAction = {
    type: 'group', sub, macro, newThread,
    sourcesEdited, removedEmpty, floatingSnapshot,
    ringMapSnapshot: sub._threadRingMap ? new Map(sub._threadRingMap) : null,
  };

  _selectedEmailIds = new Set();
  _selectedEmailId  = null;
  _selectedNode     = null;

  sub._rings = computeUserRingLayout(sub);
  _recacheRingNodePositions(sub, macro.rx, macro.ry);
  window.showClusterPanel?.();
  _updateActionBtns();
  redraw();
};

// ── GALAXY NAVIGATION ─────────────────────────────────────────────

window._galaxyBack = function () {
  if (!HAS_GALAXY_LEVEL) return;
  _activeGalaxy = null;
  MACROS = [];
  _subById = {};
  camX = 0; camY = 0; camZoom = 1; _zoomTarget = 1;
  _animTarget = null;
  _hoveredClusterKey = null;
  _clusterHoverPinned = false;
  _hoveredMacro = null;
  _hoveredSub = null;
  _hoveredGalaxyIdx = -1;
  closePanel();
  _showBackButton(false);
  _updateCursorState(); // cursor size → 'theme' level
  redraw();
};

// ── PUBLIC API FOR PANEL ─────────────────────────────────────────

window.findSubCluster = function (subId) {
  return _subById[subId] || null;
};

window.navigateToSubCluster = function (subId) {
  const ref = _subById[subId];
  if (!ref) return;
  const { macro, sub } = ref;

  // Accordion: close every other open macro
  for (let m of MACROS) {
    if (m !== macro && m.open) {
      m.open = false;
      for (let s of m.subClusters) { s.open = false; s._rings = null; }
    }
  }
  macro.open = true;
  sub.open   = true;

  // Kick off batch prefetch for the whole macro so arrow nav is instant afterwards
  _prefetchMacroSubs(macro);

  // Compute the two-phase animation targets
  const destWX   = macro.rx + sub.rx;
  const destWY   = macro.ry + sub.ry;
  const curWX    = -camX / camZoom;
  const curWY    = -camY / camZoom;
  const midWX    = (curWX + destWX) / 2;
  const midWY    = (curWY + destWY) / 2;
  const dist     = Math.sqrt((destWX - curWX) ** 2 + (destWY - curWY) ** 2);
  const S        = min(width, height);
  const midZoom  = max(0.15, min((S * 0.45) / max(dist, 1), (S * 0.325 / OPEN_FOOTPRINT) * 0.4));
  const destZoom = constrain((S * 0.22) / NODE_ORBIT_RADIUS, 1.2, 2.8);

  function _doZoom() {
    _zoomTo(midWX, midWY, midZoom);
    setTimeout(() => _zoomTo(destWX, destWY, destZoom), ANIM_DURATION + 80);
    setTimeout(() => {
      showExpandedPanel(macro, sub, null, CROSS_LINKS);
      _clusterHoverPinned = true;
      _hoveredClusterKey = `sub:${sub.id}:Expanded`;
      redraw();
    }, ANIM_DURATION * 2 + 80);
    _updateCursorState();
    redraw();
  }

  // If email data is ready, cache positions and zoom immediately.
  // If not, load it first so the sub is never shown empty.
  if (!HAS_GALAXY_LEVEL || sub._emailsLoaded) {
    cacheNodePositions(sub, macro.rx, macro.ry);
    _doZoom();
  } else {
    _loadSubEmails(sub, macro).then(_doZoom);
  }
};

(function () {
  'use strict';

  // Flask runs on 5001 (separate from Live Server).
  // Change this if you start Flask on a different port.
  const API_BASE = 'http://localhost:5001';

  const panel   = document.getElementById('chat-panel');
  const btn     = document.getElementById('chat-btn');
  const input   = document.getElementById('chat-input');
  const msgs    = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send');

  if (!panel || !btn || !input || !msgs || !sendBtn) return;

  const chatSlot = document.getElementById('icon-slot-chat');
  const history = [];

  btn.addEventListener('click', () => {
    const isOpen = chatSlot.classList.toggle('open');
    if (isOpen) {
      input.focus();
      // Hide the right-hand panel stack while the chat is open so they don't overlap
      document.body.classList.add('chat-is-open');
    } else {
      document.body.classList.remove('chat-is-open');
    }
  });

  // Close when clicking outside the slot
  document.addEventListener('click', e => {
    if (chatSlot && !chatSlot.contains(e.target)) {
      chatSlot.classList.remove('open');
      document.body.classList.remove('chat-is-open');
    }
  });

  function appendMsg(role, text, refs) {
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.textContent = text;

    if (refs && refs.length) {
      const refRow = document.createElement('div');
      refRow.className = 'chat-refs';
      refs.forEach(r => {
        const chip = document.createElement('span');
        chip.className = 'chat-ref' + (r.sub_id?.startsWith?.('__search_') ? ' chat-ref--search' : '');
        const label = r.title || `Cluster ${r.sub_id}`;
        chip.textContent = r.email_count ? `${label}  (${r.email_count})` : label;
        if (r.reason) chip.title = r.reason;
        chip.addEventListener('click', e => {
          e.stopPropagation(); // prevent panel-close listener from firing
          if (typeof window.openSubById === 'function') {
            window.openSubById(r.sub_id);
          }
        });
        refRow.appendChild(chip);
      });
      div.appendChild(refRow);
    }

    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    appendMsg('user', text);
    history.push({ role: 'user', content: text });

    const thinking = appendMsg('bot', 'Thinking…');
    thinking.classList.add('chat-thinking');

    try {
      const res  = await fetch(`${API_BASE}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, history: history.slice(-8) }),
        signal:  AbortSignal.timeout(120_000) // 2 min — model may take time on first load
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      msgs.removeChild(thinking);

      if (data.error) {
        appendMsg('bot', `Error: ${data.error}`);
      } else {
        // If the server found filter results, create the cluster now and patch the ref chip
        if (data.filter_result?.matched_nodes?.length > 0 && typeof window.createSearchCluster === 'function') {
          const { query_key, matched_nodes, label } = data.filter_result;
          const subId = window.createSearchCluster(query_key, matched_nodes, label);
          if (data.refs?.[0]) data.refs[0].sub_id = subId;
        }
        appendMsg('bot', data.answer || '(no response)', data.refs || []);
        history.push({ role: 'assistant', content: data.answer || '' });
      }
    } catch (e) {
      const isServerDown = e instanceof TypeError && e.message.includes('fetch');
      thinking.textContent = isServerDown
        ? 'Flask server not reachable — open a terminal and run: venv/bin/python server.py'
        : `Error: ${e.message}`;
      thinking.classList.remove('chat-thinking');
    }

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => {
    e.stopPropagation(); // prevent keys from reaching p5's canvas handler
    if (e.key === 'Enter' && !e.shiftKey) send();
  });
})();
(function () {
  'use strict';

  // cursor:none is applied globally via CSS (* { cursor: none !important }) in panel.css

  const cursorEl = document.getElementById('custom-cursor');
  const labelEl  = document.getElementById('cursor-label');
  const ptrEl    = document.getElementById('cursor-ptr');
  const textEl   = document.getElementById('cursor-text');
  if (!cursorEl || !labelEl) return;

  // Off-screen canvas for measuring text width without touching the DOM
  const _ctx = document.createElement('canvas').getContext('2d');
  _ctx.font = '600 11px Inter, sans-serif';

  let _clearTimer = null;
  let _inCluster  = false; // suppress title pop-up when a sub is open
  let _overPanel  = false; // true while cursor is over any panel element

  // Size constants (px) — hierarchy: Theme > Space > default > Cluster
  const SIZE_THEME   = 40;
  const SIZE_DEFAULT = 24;
  const SIZE_SPACE   = 31;
  const SIZE_CLUSTER = 12;

  // Tags whose content counts as readable text — triggers the I-beam cursor
  const TEXT_TAGS = new Set(['P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI']);

  const PANEL_SELECTOR =
    '.panel-container, .email-detail-container, #right-panel-stack, ' +
    '.icon-slot, .icon-panel, #icon-arrow, #icon-help, #email-expanded-modal, #tour-guide';

  function _applySize(px) {
    cursorEl.style.setProperty('--cursor-base', px + 'px');
    cursorEl.dataset.baseSize = px; // always update so restore works when leaving panel
    // Don't override the panel-hover shrink while the cursor is over a panel,
    // and don't touch pill width — pill manages its own width
    if (_overPanel || cursorEl.classList.contains('pill')) return;
    cursorEl.style.width        = px + 'px';
    cursorEl.style.minHeight    = px + 'px';
    cursorEl.style.borderRadius = (px / 2) + 'px';
  }

  // Called from sketch.js whenever navigation state changes
  window.setCursorState = function (state) {
    _inCluster = (state === 'cluster');
    if (_inCluster) {
      window.setCursorLabel('');
    }
    const size = state === 'theme'   ? SIZE_THEME
      : state === 'space'    ? SIZE_SPACE
      : state === 'cluster'  ? SIZE_CLUSTER
      : SIZE_DEFAULT;
    _applySize(size);
  };

  // Initialise to default
  _applySize(SIZE_DEFAULT);

  // Smoothed cursor position — lerp toward real mouse each frame
  let _tx = 0, _ty = 0; // real mouse target
  let _cx = 0, _cy = 0; // current smoothed position
  let _cursorReady = false;
  const CURSOR_LERP = 0.18;

  (function _tick() {
    _cx += (_tx - _cx) * CURSOR_LERP;
    _cy += (_ty - _cy) * CURSOR_LERP;
    if (_cursorReady) {
      cursorEl.style.left = _cx + 'px';
      cursorEl.style.top  = _cy + 'px';
      if (ptrEl)  { ptrEl.style.left  = _cx + 'px'; ptrEl.style.top  = _cy + 'px'; }
      if (textEl) { textEl.style.left = _cx + 'px'; textEl.style.top = _cy + 'px'; }
    }
    requestAnimationFrame(_tick);
  })();

  // Track mouse — swap between dot, text caret, and SVG pointer
  document.addEventListener('mousemove', e => {
    const x = e.clientX, y = e.clientY;
    _tx = x; _ty = y;
    if (!_cursorReady) { _cx = x; _cy = y; _cursorReady = true; } // snap on first move

    const over        = document.elementFromPoint(x, y);
    const isClickable = !!(over && over.closest('button, a, input, textarea, select, label, [role="button"]'));

    if (ptrEl) ptrEl.classList.toggle('active', isClickable);

    if (isClickable) {
      // Pointer cursor — hide dot and text caret
      cursorEl.style.opacity = '0';
      if (textEl) textEl.classList.remove('active');
      _overPanel = false;
      return;
    }

    const overPanelEl   = over && over.closest(PANEL_SELECTOR);
    _overPanel = !!overPanelEl;
    const overTourGuide = !!(over && over.closest('#tour-guide'));

    // Any panel: collapse the cluster label pill immediately so the cursor can shrink.
    // sketch.js mouseMoved doesn't fire over HTML overlays, so this is the only
    // listener that reliably catches the transition.
    if (_overPanel) {
      clearTimeout(_clearTimer);
      cursorEl.classList.remove('pill');
      _clearTimer = setTimeout(() => { labelEl.textContent = ''; }, 380);
    }

    // Text caret: show over readable text inside panels — but NOT inside the
    // tour guide, where we want the cursor dot to remain visible.
    const isOverText = !!overPanelEl && !overTourGuide && !!over && (
      TEXT_TAGS.has(over.tagName) ||
      TEXT_TAGS.has(over.parentElement?.tagName) ||
      over.isContentEditable ||
      !!over.parentElement?.isContentEditable
    );

    if (textEl) textEl.classList.toggle('active', isOverText);

    // Hide the dot when showing the text caret
    if (isOverText) {
      cursorEl.style.opacity = '0';
      return;
    }

    cursorEl.style.opacity = '1';
    cursorEl.style.background = _overPanel ? '#9D9D9D' : '#D9D9D9';

    if (!cursorEl.classList.contains('pill')) {
      const targetSize = _overPanel
        ? SIZE_CLUSTER
        : (parseInt(cursorEl.dataset.baseSize) || SIZE_DEFAULT);
      cursorEl.style.width        = targetSize + 'px';
      cursorEl.style.minHeight    = targetSize + 'px';
      cursorEl.style.borderRadius = (targetSize / 2) + 'px';
    }
  });

  // Called from sketch.js when the hovered cluster changes
  window.setCursorLabel = function (text) {
    clearTimeout(_clearTimer);

    // No title pop-up while inside an open cluster
    if (_inCluster || !text) {
      const base = parseInt(cursorEl.dataset.baseSize) || SIZE_DEFAULT;
      cursorEl.style.width        = base + 'px';
      cursorEl.style.minHeight    = base + 'px';
      cursorEl.style.borderRadius = (base / 2) + 'px';
      cursorEl.classList.remove('pill');
      _clearTimer = setTimeout(() => { labelEl.textContent = ''; }, 380);
      return;
    }

    labelEl.textContent = text;
    const pillW = Math.round(_ctx.measureText(text).width + 34);
    cursorEl.style.width = pillW + 'px';
    cursorEl.classList.add('pill');
  };

  // Force-show a label even inside an open cluster (used for ring date labels and email hover).
  window.setCursorLabelForce = function (text) {
    clearTimeout(_clearTimer);
    if (!text) {
      const base = parseInt(cursorEl.dataset.baseSize) || SIZE_DEFAULT;
      cursorEl.style.width        = base + 'px';
      cursorEl.style.minHeight    = base + 'px';
      cursorEl.style.borderRadius = (base / 2) + 'px';
      cursorEl.classList.remove('pill');
      _clearTimer = setTimeout(() => { labelEl.textContent = ''; }, 380);
      return;
    }
    labelEl.textContent = text;
    const pillW = Math.round(_ctx.measureText(text).width + 34);
    cursorEl.style.width        = pillW + 'px';
    cursorEl.style.borderRadius = '999px';
    cursorEl.classList.add('pill');
  };
})();
(function () {
  'use strict';

  const overlay   = document.getElementById('onboarding');
  const tourGuide = document.getElementById('tour-guide');
  if (!overlay) return;

  document.body.classList.add('ob-active');

  // ── Login: step 1 → 2 ────────────────────────────────────────────

  const emailInput = document.getElementById('ob-email-input');
  const emailErr   = document.getElementById('ob-email-error');

  function goStep2() {
    const val = emailInput.value.trim();
    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      emailErr.textContent = 'Please enter a valid email address.';
      return;
    }
    emailErr.textContent = '';
    document.getElementById('ob-email-display').textContent = val;
    document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
    document.getElementById('ob-step-2').classList.add('active');
  }

  document.getElementById('ob-email-btn').addEventListener('click', goStep2);
  emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') goStep2(); });

  // ── Login: Confirm → reveal canvas + start tour ───────────────────

  document.getElementById('ob-confirm-btn').addEventListener('click', () => {
    document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
    document.getElementById('ob-step-3').classList.add('active');
  });

  document.getElementById('ob-enter-plot-btn').addEventListener('click', () => {
    // Fade out the login overlay and reveal the canvas
    overlay.classList.add('ob-hidden');
    document.body.classList.remove('ob-active');
    setTimeout(() => { overlay.style.display = 'none'; }, 520);

    if (typeof window._galaxyBack === 'function') window._galaxyBack();
    else if (typeof redraw === 'function') redraw();

    setTimeout(startTour, 400);
  });

  // ── Tour steps ────────────────────────────────────────────────────

  const STEPS = [
    {
      text: 'These are your <strong>Themes</strong> — broad topic clusters across your entire inbox. Circle size reflects the volume of email data in each theme.',
      nav:  null,
      btn:  'Next →',
    },
    {
      text: 'Inside a Theme you\'ll find <strong>Spaces</strong> — more specific sub-topics. Faded circles contain older emails — this is <em>digital decomposition</em>, where age shapes form.',
      nav:  () => window._tourGoSpaces?.(),
      btn:  'Next →',
    },
    {
      text: 'Each Space holds <strong>Clusters</strong> of closely related emails. The rings inside a cluster organise emails into conversation threads.',
      nav:  () => window._tourGoCluster?.(),
      btn:  'Next →',
    },
    {
      text: 'Each dot is an individual <strong>email</strong>. Click any dot to select it — the panel on the right will show its contents. Use ← → to step between emails, Esc to go back up.',
      nav:    () => window._tourGoEmails?.(),
      btn:    'Next →',
      target: null,
    },
    {
      text: 'With an email open, hit the <strong>↗ expand icon</strong> at the top-right of the email panel to enter <em>read mode</em> — a focused view where you can highlight passages and add private notes for this session.',
      nav:    () => window._tourGoEmailSelected?.(),
      btn:    'Next →',
      target: '#btn-expand-email',
    },
    {
      text: 'The <strong>Organise</strong> panel gives you tools to reshape the cluster: Shift-click to multi-select, then <em>Group</em> emails into a new colour-coded thread, <em>Split</em> threads, or delete items. The <strong>Sort</strong> panel reorders rings by week, month, or year.',
      nav:    null,
      btn:    'Next →',
      target: '#organise-panel',
    },
    {
      text: 'Down in the corner lives <strong>your tree</strong> 🌳. Every time you delete emails, the data centres cooling them need less water — and that water flows straight to your tree instead. Watch the droplets fall as it grows. <em>Hover it</em> to see your real-time footprint and how much water you\'ve returned.',
      nav:    null,
      btn:    'Next →',
      target: '#palm-tree-container',
    },
    {
      text: '<strong>Archive</strong> copies any selected email to your personal <em>Archive Theme</em> — a dedicated space visible from the Themes view. Nothing is removed from the original cluster; you\'re building a curated collection alongside it.',
      nav:    null,
      btn:    'Got it →',
      target: '#btn-archive',
    },
  ];

  let currentStep    = 0;
  let _tourTargetEl  = null; // currently highlighted element

  function renderDots() {
    const dotsEl = document.getElementById('tour-dots');
    if (!dotsEl) return;
    dotsEl.innerHTML = STEPS.map((_, i) =>
      `<span class="tour-dot${i === currentStep ? ' tour-dot--active' : ''}"></span>`
    ).join('');
  }

  function _setTourTarget(selector) {
    // Remove previous highlight
    if (_tourTargetEl) {
      _tourTargetEl.classList.remove('tour-target');
      _tourTargetEl = null;
    }
    if (!selector) return;
    // Small delay so navigation has time to reveal the element first
    setTimeout(() => {
      const el = document.querySelector(selector);
      if (el) { _tourTargetEl = el; el.classList.add('tour-target'); }
    }, 500);
  }

  // skipNav = true when the user is already at this level (help button);
  // false (default) when Next navigates them there.
  function showTourStep(n, skipNav) {
    currentStep = n;
    const step    = STEPS[n];
    const textEl  = document.getElementById('tour-text');
    const nextBtn = document.getElementById('tour-next');
    if (textEl)  textEl.innerHTML   = step.text;
    if (nextBtn) nextBtn.textContent = step.btn;
    renderDots();
    if (!skipNav && step.nav) step.nav();
    _setTourTarget(step.target || null);
  }

  function startTour() {
    if (!tourGuide) return;
    tourGuide.classList.add('tour-visible');
    showTourStep(0);
  }

  function dismissTour() {
    _setTourTarget(null); // clear any active highlight
    if (!tourGuide) return;
    tourGuide.classList.remove('tour-visible');
    tourGuide.classList.add('tour-hidden-out');
  }

  // Returns the tour step index that matches the current canvas navigation level.
  function getTourStep() {
    try {
      const openMacro = typeof MACROS !== 'undefined' && MACROS.find(m => m.open);
      if (!openMacro) {
        return (typeof _activeGalaxy !== 'undefined' && _activeGalaxy) ? 1 : 0;
      }
      if (openMacro.subClusters.find(s => s.open)) {
        // Email selected → show the reading step; otherwise the dots step
        return (typeof _selectedEmailId !== 'undefined' && _selectedEmailId) ? 4 : 3;
      }
      return 2;
    } catch (_) { return 0; }
  }

  // ── Tour button wiring ────────────────────────────────────────────

  document.getElementById('tour-next')?.addEventListener('click', () => {
    if (currentStep < STEPS.length - 1) {
      showTourStep(currentStep + 1);
    } else {
      dismissTour();
    }
  });

  document.getElementById('tour-skip')?.addEventListener('click', dismissTour);

  // ── Help (?) button — show tour at the current navigation level ───

  document.getElementById('icon-help')?.addEventListener('click', () => {
    if (!tourGuide) return;
    const step = getTourStep();
    // If card is already visible at this step, toggle it off
    if (tourGuide.classList.contains('tour-visible') && currentStep === step) {
      dismissTour();
      return;
    }
    tourGuide.classList.remove('tour-hidden-out');
    tourGuide.classList.add('tour-visible');
    showTourStep(step, true); // skipNav — user is already here
  });

})();
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
