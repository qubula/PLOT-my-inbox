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
