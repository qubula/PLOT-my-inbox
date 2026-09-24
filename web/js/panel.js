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
