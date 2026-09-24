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
