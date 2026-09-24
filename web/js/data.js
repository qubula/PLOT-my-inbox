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
