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
