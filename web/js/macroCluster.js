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
