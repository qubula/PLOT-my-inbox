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
