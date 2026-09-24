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
