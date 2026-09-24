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
