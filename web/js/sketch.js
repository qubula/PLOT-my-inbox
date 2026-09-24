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

