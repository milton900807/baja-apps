function (graph, genegraph_panel_layout) {
    // A PRESS ON ONE MONOMER OF A ZOOMED-IN COMPOUND OPENS ITS CHEMISTRY MENU, whatever
    // else the graph is doing.
    //   exec('baja/chem/ui/chem-part-press.js', graph, genegraph_panel_layout)
    //
    // WHY NOT THE GRAPH'S MOUSE-DOWN LISTENER. That was the first attempt and it never
    // fired. Two reasons, both already documented in this codebase and both fatal:
    //   * `graph.__downScreen` -- the press position that the off-target badge block reads
    //     -- is stashed on the FLEXIGRAPH, not on the gene object mouse-over-highlight.js
    //     is handed, so it is undefined there. Any block keyed on it is dead code.
    //   * that listener chain only runs when no side menu is open, no centre menu is up and
    //     nothing earlier swallowed the press. Selecting a compound raises the selection
    //     window, so "click a selected compound" is exactly the case where the chain does
    //     not run.
    // So the press is caught here at the WINDOW in the capture phase, before the canvas,
    // the graph or the app's handlers see it -- the same treatment layer-row-press.js needed
    // for the same reasons.
    //
    // A press is consumed ONLY when it lands on a monomer of a compound that is currently
    // drawn as molecules. Anywhere else -- zoomed out, off the compound, on a different
    // track -- the event goes on untouched, so panning, selection and the oligo drag behave
    // exactly as before.
    //
    // FOR DEBUGGING: window.__bajaChemPressInfo() reports the canvas, which compounds have
    // live monomer geometry, and what the last press did.
    return (async () => {
        let cv = null;
        try { const fg = graph.graph || graph; cv = fg.canvas.canvas.nativeElement; } catch (e) { cv = null; }
        if (!cv) { try { const fg = graph.graph || graph; cv = fg.canvas.getCTX().canvas; } catch (e) { cv = null; } }
        if (!cv || !cv.addEventListener) return false;

        const S = window.__bajaChemPress = window.__bajaChemPress || { installed: false, last: null, presses: 0, misses: 0 };
        S.cv = cv;                                   // the CURRENT canvas: a new editor page has a new one
        S.graph = graph; S.layout = genegraph_panel_layout;
        if (S.installed) return true;

        // THE HIT TEST IS INLINE, not exec'd from pick-chem-part.js. Installation must not
        // depend on a second module loading: an exec that rejects here would leave the
        // listeners unattached, and because `installed` was already set every later call
        // returned early -- a permanent silent failure with nothing in the console. The
        // same functions still live in pick-chem-part.js for other callers; this copy is
        // deliberate so that a press handler can never fail to install.
        // The zoom at which the polymer renderer draws each sugar as a furanose ring
        // (SUGAR_PER in flexigraph/chem-draw.js). Selection is gated on the same number: a
        // "part" can only be clicked once it is actually drawn as a part.
        const SUGAR_PER = 34;

        const SUG_LABEL = { d: 'DNA', dna: 'DNA', r: 'RNA', rna: 'RNA', moe: "2'-MOE", mo: "2'-MOE", m: "2'-OMe", ome: "2'-OMe", f: "2'-F", fana: "2'-F", fl2r: "2'-F", lna: 'LNA', bna: 'LNA', cet: 'cEt', ena: 'ENA', pmo: 'PMO' };
        const LNK_LABEL = { sp: 'PS', ps: 'PS', rsp: 'PS (Rp)', ssp: 'PS (Sp)', p: 'PO', po: 'PO' };

        const pickChemPart = (oligo, sx, sy) => {
            try {
                const g = oligo && oligo.__chemGeom;
                if (!g || !g.editable || !(g.n > 0) || !(g.per > 0)) return null;
                const dy = sy - g.sy;
                if (dy > g.R + 6 || dy < -(g.R * 2.4 + 8)) return null;
                // SLOT -> MONOMER. chem-draw draws a compound in genomic order, so on a
                // mirrored (antisense) compound the leftmost bead is the LAST residue. The
                // slot is what was clicked; the index everything downstream wants is the
                // monomer, because __chemGeom.monos and the compound's own HELM are both in
                // the compound's order. A linkage spans two slots and is recorded on the 5'
                // partner, which after mirroring is the right-hand one of the pair.
                const __slotToMono = (kind, k) => !g.flipped ? k
                    : (kind === 'linkage' ? (g.n - 2 - k) : (g.n - 1 - k));
                const fx = (sx - g.x0) / g.per;
                if (fx < -0.5 || fx > g.n + 0.5) return null;
                let i = Math.floor(fx);
                if (i < 0) i = 0;
                if (i > g.n - 1) i = g.n - 1;
                const cx = g.x0 + (i + 0.5) * g.per;
                if (Math.abs(sx - cx) <= g.R * 1.05) return { kind: 'monomer', i: __slotToMono('monomer', i) };
                const j = (sx > cx) ? i : i - 1;
                if (j < 0 || j >= g.n - 1) return { kind: 'monomer', i: __slotToMono('monomer', Math.max(0, Math.min(g.n - 1, i))) };
                return { kind: 'linkage', i: __slotToMono('linkage', j) };
            } catch (e) { return null; }
        };
        // The monomers as drawn when the renderer recorded them, otherwise parsed from the
        // compound's own HELM -- so a snap on a compound with no recorded geometry still
        // names the right residue instead of "?".
        const monosOf = (oligo) => {
            const g = oligo && oligo.__chemGeom;
            if (g && Array.isArray(g.monos) && g.monos.length) return g.monos;
            const out = [];
            try {
                const body = ('' + (oligo.structure || '')).match(/\{([^}]*)\}/);
                for (const u of ((body && body[1]) || '').split('.')) {
                    const t = u.trim(); if (!t) continue;
                    const m = t.match(/\[?([A-Za-z0-9\-]+)\]?\s*\(([^)]+)\)\s*(?:\[([^\]]+)\]|([A-Za-z0-9]+))?/);
                    if (m) out.push({ sugar: ('' + (m[1] || '')).toLowerCase(), base: ('' + (m[2] || '')).toUpperCase(), linkage: ('' + (m[3] || m[4] || '')).toLowerCase() });
                }
            } catch (e) { }
            return out;
        };
        const describeChemPart = (oligo, part) => {
            try {
                const g = oligo && oligo.__chemGeom;
                const monos = monosOf(oligo);
                if (!part) return 'Compound';
                if (part.kind === 'conjugate') {
                    const c = oligo && oligo.conjugate;
                    if (!c) return 'Conjugate';
                    return (c.label || c.symbol || 'Conjugate')
                        + '  ' + (c.site || '?') + '′'
                        + (c.linkage ? ('  ' + (LNK_LABEL[c.linkage] || c.linkage)) : '');
                }
                const m = monos[part.i] || {};
                if (part.kind === 'linkage') {
                    const nx = monos[part.i + 1] || {};
                    return 'Linkage ' + (part.i + 1) + '\u2013' + (part.i + 2)
                        + '  ' + (LNK_LABEL[m.linkage] || 'unspecified')
                        + '  (' + (m.base || '?') + '\u2192' + (nx.base || '?') + ')';
                }
                const total = (g && g.n) || monos.length || 0;
                return 'Residue ' + (part.i + 1) + (total ? ' of ' + total : '')
                    + '  ' + (m.base || '?') + '  ' + (SUG_LABEL[m.sugar] || m.sugar || '');
            } catch (e) { return 'Compound'; }
        };
        const picker = { pickChemPart: pickChemPart, describeChemPart: describeChemPart };

        const toCanvas = (e, el) => {
            const r = el.getBoundingClientRect();
            return {
                x: (e.clientX - r.left) * (r.width ? el.width / r.width : 1),
                y: (e.clientY - r.top) * (r.height ? el.height / r.height : 1)
            };
        };
        // THE CONJUGATE GLYPH IS ITS OWN TARGET. It is drawn outside the chain's span, so
        // it can never be confused with a residue, and clicking the GalNAc squares is the
        // obvious way to ask about the GalNAc.
        const conjAt = (o, p) => {
            try {
                const b = o && o.__conjBox;
                if (!b) return null;
                const lo = Math.min(b.x1, b.x2) - 4, hi = Math.max(b.x1, b.x2) + 4;
                if (p.x < lo || p.x > hi) return null;
                const h = (b.h || 12) + 6;
                if (p.y < b.sy - h || p.y > b.sy + h) return null;
                return { kind: 'conjugate', i: 0 };
            } catch (e) { return null; }
        };

        // Topmost compound wins, the way the drawing stacks: tracks are painted in array
        // order, so a later one is on top of an earlier one.
        // How many monomers a compound has, when the polymer renderer has not said. Its
        // HELM is the truth; the synthesis sequence and then the span are the fallbacks.
        const monomerCount = (o) => {
            try {
                const body = ('' + (o.structure || '')).match(/\{([^}]*)\}/);
                if (body && body[1]) {
                    const n = body[1].split('.').filter((u) => u.trim()).length;
                    if (n > 0) return n;
                }
            } catch (e) { }
            const seq = o.synthesisSequence || o.sequence;
            if (seq && seq.length) return seq.length;
            const span = Math.abs((+o.xf || 0) - (+o.xi || 0));
            return span > 0 ? Math.round(span) : 0;
        };

        // RESOLVE A PRESS AGAINST THE COMPOUND'S DRAWN SPAN. This is the path that actually
        // carries the feature: __screenBox is recorded by Oligo.draw() for EVERY compound
        // whatever shape drew it, whereas __chemGeom comes from the polymer renderer and in
        // practice is not arriving (the compound is passed to the shape function as a 7th
        // argument and does not survive the call). Working from the span and the monomer
        // count needs neither.
        //
        // It used to require the compound to be selected first, which is why the feature
        // only worked after a lasso: selection was not enabling anything real, it was just
        // the one condition that let this branch run. Any compound zoomed in far enough to
        // show its parts is a valid target now, which is the behaviour asked for.
        //
        // A selected compound still gets a MORE FORGIVING vertical band -- it has already
        // been singled out, so a click near it is unambiguous -- while an unselected one is
        // held to the body and its base letters, so a press meant for something else on a
        // busy track is not captured.
        const isPicked = (o) => !!(o && (o.selected || o.highlight__ || o.__chemSel));
        const snapOnSelected = (o, p) => {
            try {
                const g = o.__chemGeom, box = o.__screenBox;
                const x1 = g ? g.x0 : (box && box.x1);
                const sy = g ? g.sy : (box && box.sy);
                const n = g ? g.n : monomerCount(o);
                const per = g ? g.per : (box ? (box.x2 - box.x1) / Math.max(1, n) : 0);
                if (x1 == null || sy == null || !(n > 0) || !(per >= SUGAR_PER)) return null;
                const R = g ? g.R : Math.max(2, Math.min(10, per * 0.42));
                // The body plus the base letters drawn above it; wider once the compound has
                // been singled out by a selection.
                const picked = isPicked(o);
                const below = R + (picked ? 14 : 8);
                const above = picked ? (R * 3 + 14) : (R * 2.4 + 10);
                if (p.y > sy + below || p.y < sy - above) return null;
                if (p.x < x1 - per || p.x > x1 + per * n + per) return null;
                let i = Math.round((p.x - x1) / per - 0.5);
                if (i < 0) i = 0;
                if (i > n - 1) i = n - 1;
                const cx = x1 + (i + 0.5) * per;
                if (Math.abs(p.x - cx) <= R * 1.05) return { kind: 'monomer', i: i };
                const j = (p.x > cx) ? i : i - 1;
                if (j < 0 || j >= n - 1) return { kind: 'monomer', i: i };
                return { kind: 'linkage', i: j };
            } catch (e) { return null; }
        };

        // Topmost compound wins, the way the drawing stacks: tracks are painted in array
        // order, so a later one is on top of an earlier one. An exact hit on any compound
        // beats a snap, and a snap only ever applies to one the user has already picked.
        // GEOMETRY MUST BE FROM THE FRAME THAT IS ON SCREEN NOW. A compound records where
        // it was drawn; nothing clears that when a document is closed, so after loading a
        // saved file the previous document's compounds still carry positions and a press
        // could be resolved against something that is no longer there -- taking a click
        // that belonged to the new content, the track menu, or a layer row. Anything older
        // than a couple of seconds is from a frame that is gone.
        const FRESH_MS = 2500;
        const fresh = (o) => {
            const t1 = (o.__chemGeom && o.__chemGeom.at) || 0;
            const t2 = (o.__screenBox && o.__screenBox.at) || 0;
            return (Date.now() - Math.max(t1, t2)) <= FRESH_MS;
        };

        const partAt = (g, p) => {
            let found = null, snapped = null;
            for (const t of ((g && g.track) || [])) {
                for (const o of ((t && t.oligos) || [])) {
                    if (!o || !fresh(o)) continue;
                    const cj = conjAt(o, p);
                    if (cj) { found = { oligo: o, track: t, part: cj }; continue; }
                    if (o.__chemGeom && o.__chemGeom.editable) {
                        const part = picker.pickChemPart(o, p.x, p.y);
                        if (part) { found = { oligo: o, track: t, part: part }; continue; }
                    }
                    const sn = snapOnSelected(o, p);
                    // A selected compound wins over an unselected one at the same point: the
                    // user has already said which compound they are working on.
                    if (sn && (!snapped || isPicked(o))) snapped = { oligo: o, track: t, part: sn, snapped: true };
                }
            }
            return found || snapped;
        };
        // CANVAS-DRAWN MENUS OWN THEIR PRESSES. The side menu and the centre menu are
        // painted onto this same canvas, so elementFromPoint sees only the canvas and a
        // menu item lying over a compound would be swallowed here and never act. HTML
        // menus are already handled by the element test; these are not, and have to be
        // asked about directly. (Same guard as layer-row-press.js, which hit this first.)
        const overCanvasMenu = (g, p) => {
            try { if (g.menuVisible && g.menuVisible()) return true; } catch (e) { }
            try {
                const m = g.side_menu;
                if (m && m.__bounds) {
                    const b = m.__bounds(g.graph || g);
                    const x = p.x + (m.xoffset || 0), y = p.y + (m.yoffset || 0);
                    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
                }
            } catch (e) { }
            return false;
        };
        const describe = (el) => el ? ((el.nodeName || '') + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) : null;
        let lastHandledAt = 0;

        const onPress = async (e) => {
            const rec = { type: e.type, button: e.button, at: Date.now(), seen: true, inCanvas: false, hit: false };
            S.last = rec;
            try {
                if (e.button !== 0) return;
                const el = S.cv, g = S.graph;
                if (!el || !g || !el.isConnected) return;
                const r = el.getBoundingClientRect();
                if (!(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)) return;
                rec.inCanvas = true;
                // The canvas, or anything in its own container, is part of the canvas as far
                // as a press goes; a menu, a dialog or our own popup owns its own press.
                // WHAT IS ON TOP, asked of the CANVAS's own document (an iframe has its
                // own, and asking the wrong one returns an unrelated element).
                let top = null;
                try { top = (el.ownerDocument || document).elementFromPoint(e.clientX, e.clientY); } catch (err) { top = null; }
                rec.top = describe(top);
                // ONLY A REAL MENU OR DIALOG OWNS THE PRESS. The previous test demanded the
                // topmost element BE the canvas or sit inside its parent, which fails the
                // moment the app stacks an interaction layer over the canvas or mounts the
                // canvas somewhere unexpected -- and it failed silently, before the miss
                // diagnostic could say anything, so the press fell through to the graph and
                // started a compound drag instead. The press is already known to be inside
                // the canvas's bounding rect; that is enough unless something that owns its
                // own interactions is genuinely over it.
                try {
                    if (top && top.closest && top.closest('[role="menu"],[role="dialog"],#baja-layer-popup,.baja-floating-menu')) {
                        rec.blockedBy = rec.top;
                        return;
                    }
                } catch (err) { }
                const p = toCanvas(e, el);
                rec.at_canvas_px = { x: Math.round(p.x), y: Math.round(p.y) };
                if (overCanvasMenu(g, p)) { rec.blockedBy = 'canvas menu'; return; }
                const hit = partAt(g, p);
                if (!hit) {
                    // A MISS HAS TO SAY WHY. "Nothing happened" is the hardest kind of bug to
                    // report, and the reasons are all knowable at this point: no compound was
                    // drawn as molecules, the zoom is below the threshold, or the press simply
                    // landed off the polymer. Recorded on every miss and logged once, so the
                    // console answers the question without anyone having to run anything.
                    // MEASURE FROM WHATEVER GEOMETRY EXISTS. This used to look only at
                    // __chemGeom, which in practice is never set -- so `best` stayed null,
                    // `aimed` was never true and the diagnostic that exists to explain a
                    // miss never said anything. __screenBox is recorded for every compound,
                    // so it is the one to measure against, with __chemGeom preferred when
                    // it happens to be there.
                    let drawn = 0, editable = 0, best = null;
                    try {
                        for (const t of ((g && g.track) || [])) for (const o of ((t && t.oligos) || [])) {
                            if (!o) continue;
                            const cg = o.__chemGeom, box = o.__screenBox;
                            if (!cg && !box) continue;
                            const n = cg ? cg.n : monomerCount(o);
                            const x1 = cg ? cg.x0 : box.x1;
                            const sy = cg ? cg.sy : box.sy;
                            const per = cg ? cg.per : (n > 0 ? (box.x2 - box.x1) / n : 0);
                            if (!(n > 0) || !(per > 0)) continue;
                            drawn++;
                            if (per >= SUGAR_PER) editable++;
                            const dx = Math.max(0, Math.max(x1 - p.x, p.x - (x1 + per * n)));
                            const dy = Math.abs(p.y - sy);
                            if (!best || (dx + dy) < (best.dx + best.dy)) {
                                best = {
                                    name: '' + (o.name || o.id || 'compound'),
                                    dx: Math.round(dx), dy: Math.round(dy),
                                    per: Math.round(per * 10) / 10, residues: n,
                                    editable: per >= SUGAR_PER, from: cg ? 'chemGeom' : 'screenBox',
                                };
                            }
                        }
                    } catch (err) { }
                    rec.miss = { compoundsDrawnAsMolecules: drawn, editable: editable, nearest: best };
                    S.misses++;
                    // SAY IT ON SCREEN, not only in the console. "I click and nothing
                    // happens" is the hardest thing to report and the slowest thing to
                    // diagnose remotely, and every reason is known right here. Only when the
                    // press was plausibly AIMED at a compound (within 40 px of one), so an
                    // ordinary click on empty canvas stays silent.
                    const aimed = best && best.dx <= 40 && best.dy <= 40;
                    if (aimed) {
                        const why = drawn === 0
                            ? 'no compound is drawn here'
                            : !best.editable
                                ? best.name + ' is at ' + best.per + ' px per residue — zoom in until the sugar rings show (' + SUGAR_PER + ' needed)'
                                : 'the press landed ' + best.dx + ' px across and ' + best.dy + ' px above/below ' + best.name + ' (' + best.per + ' px per residue)';
                        try { g.setError(' Chemistry select: ' + why + '. '); } catch (err) { }
                    }
                    if (!S.warned) {
                        S.warned = true;
                        console.warn('[chem press] press did not land on a monomer.',
                            drawn === 0 ? 'No compound is currently drawn as molecules (zoom in).'
                                : editable === 0 ? 'Compounds are drawn but below the sugar-ring zoom (need >= ' + SUGAR_PER + ' px per residue).'
                                    : 'Nearest compound is ' + (best && best.dx) + 'px across and ' + (best && best.dy) + 'px vertically.',
                            rec.miss, 'press at', rec.at_canvas_px, '| window.__bajaChemPressInfo() for more');
                    }
                    return;                           // not on a monomer: leave the press alone
                }
                rec.hit = true;
                rec.part = hit.part.kind + ' ' + (hit.part.i + 1);
                rec.compound = '' + (hit.oligo.name || hit.oligo.id || 'compound');

                // pointerdown and the mousedown the browser sends after it are one physical
                // press: consume both, act once.
                const dup = (rec.at - lastHandledAt) < 250;
                e.stopImmediatePropagation();
                e.preventDefault();
                if (dup) return;
                lastHandledAt = rec.at;
                S.presses++;
                // Tell the graph the press was dealt with, so nothing downstream starts a
                // pan, a drag or a deselect from it.
                g.__downMenuHandled = true;

                hit.oligo.__chemSel = hit.part;
                try { if (g.wake) g.wake(); } catch (err) { }

                const title = picker.describeChemPart ? picker.describeChemPart(hit.oligo, hit.part) : 'Monomer';
                const cname = rec.compound;
                const o = hit.oligo, t = hit.track;
                const items = [];
                // RE-ARM BEFORE HANDING OFF TO A SCRIPT THAT BUILDS ITS OWN MENU. A floating
                // session ends as soon as an item finishes without opening another menu, and
                // these items finish immediately -- the exec is deliberately not awaited,
                // because the script has work to do before it has a list to show. Without
                // re-arming, the session is closed by the time the script calls
                // showSideMenu, so its menu lands in the side panel on the far left instead
                // of here. Arming again at the same point keeps it, and every submenu below
                // it, in place under the cursor.
                const handOff = (path, ...args) => {
                    try { if (g.armFloatingMenu) g.armFloatingMenu(p.x, p.y, title); } catch (err) { }
                    Promise.resolve(exec(path, ...args))
                        .catch((err) => { try { g.__floatAt = null; } catch (e2) { } console.warn('[' + path + ']', err); });
                };

                items.push({
                    label: (hit.part.kind === 'conjugate' ? 'Conjugate ▸' : 'Modify chemistry ▸'), move: () => { },
                    click: () => handOff('baja/chem/ui/edit-monomer-chemistry.js', g, o, hit.part, S.layout, t),
                });
                // Picking a residue must not cost access to the compound's own menu --
                // off-targets, properties, delete -- which is what a press here used to open.
                items.push({
                    label: 'Compound: ' + (cname.length > 28 ? cname.slice(0, 27) + '…' : cname) + ' ▸', move: () => { },
                    click: () => {
                        try { o.__chemSel = null; if (g.wake) g.wake(); } catch (err) { }
                        try { if (g.addOligoToSelection) g.addOligoToSelection(o, t); } catch (err) { }
                        handOff('baja/manchester/menu/menu-for-single-aso.js', g, o, S.layout);
                    },
                });
                // MOVE THE COMPOUND UP AND DOWN ITS TRACK. Dragging it already works, but a
                // drag is a poor way to place something precisely and it is not available
                // once a menu is open. Repeatable nudges are: the submenu re-shows itself
                // after each step, so the compound can be walked into position and watched
                // as it goes.
                items.push({
                    label: '\u2195 Move vertically \u25b8', move: () => { },
                    click: () => {
                        const tg = (t && t.tgraph) || null;
                        // Which way is UP in world coordinates: ask the track's own mapping
                        // rather than assume, since a flipped axis would send the compound
                        // the opposite way from the arrow the user pressed.
                        let upSign = 1;
                        try { if (tg && typeof tg.Y === 'function') upSign = (tg.Y(1) < tg.Y(0)) ? 1 : -1; } catch (err) { }
                        const lo = (tg && typeof tg.ymin === 'number') ? tg.ymin : 0;
                        const hi = (tg && typeof tg.ymax === 'number') ? tg.ymax : 1;
                        const margin = Math.min(0.02, (hi - lo) * 0.05);
                        const step = Math.max(0.005, (hi - lo) * 0.04);
                        let pushed = false;
                        const nudge = (dir) => {
                            try {
                                // One history entry for the whole run of nudges, not one per
                                // press -- otherwise undo walks back a step at a time.
                                if (!pushed) { try { g.pushOntoHistory(); } catch (err) { } pushed = true; }
                                const cur = (o.y != null) ? +o.y : 0.1;
                                o.y = Math.max(lo + margin, Math.min(hi - margin, cur + dir * upSign * step));
                                if (g.wake) g.wake();
                            } catch (err) { }
                            showMove();
                        };
                        const place = (frac) => {
                            try {
                                if (!pushed) { try { g.pushOntoHistory(); } catch (err) { } pushed = true; }
                                o.y = lo + margin + (hi - lo - 2 * margin) * frac;
                                if (g.wake) g.wake();
                            } catch (err) { }
                            showMove();
                        };
                        const showMove = () => {
                            const at = (o.y != null) ? (Math.round(+o.y * 1000) / 1000) : '\u2014';
                            g.showSideMenu([
                                { label: 'Move ' + cname + '   y = ' + at, move: () => { }, click: () => { } },
                                { label: '\u25b2 Up', move: () => { }, click: () => nudge(+1) },
                                { label: '\u25bc Down', move: () => { }, click: () => nudge(-1) },
                                { label: 'Top of track', move: () => { }, click: () => place(upSign > 0 ? 1 : 0) },
                                { label: 'Middle', move: () => { }, click: () => place(0.5) },
                                { label: 'Bottom of track', move: () => { }, click: () => place(upSign > 0 ? 0 : 1) },
                                { label: '\u2039 Back', move: () => { }, click: () => { openPartMenu(); } },
                            ]);
                        };
                        showMove();
                    },
                });
                items.push({
                    label: 'Clear selection', move: () => { },
                    click: () => {
                        try { o.__chemSel = null; if (g.wake) g.wake(); } catch (err) { }
                        try { g.showSideMenu(null); } catch (err) { }
                    },
                });

                // Named so a submenu can come back to it.
                const openPartMenu = () => {
                    try { if (g.openFloatingMenu && g.openFloatingMenu(items, p.x, p.y, title)) return; } catch (err) { }
                    try { g.showSideMenu(items, null, title); } catch (err) { }
                };
                let shown = false;
                try { shown = !!(g.openFloatingMenu && g.openFloatingMenu(items, p.x, p.y, title)); } catch (err) { shown = false; }
                // Mobile has no floating menu and openFloatingMenu says so by returning
                // false; the side panel is the fallback rather than nothing happening.
                if (!shown) { try { g.showSideMenu(items, null, title); } catch (err) { } }
                rec.opened = shown ? 'floating' : 'side-menu';
            } catch (err) {
                rec.error = '' + (err && err.message || err);
                console.warn('[chem press]', err);
            }
        };
        // LISTEN WHEREVER THE PRESS IS ACTUALLY DISPATCHED. A keyboard event reaches the
        // top window, but a mouse event is delivered in the canvas's OWN window and
        // document -- so if the canvas is in an iframe or a separate document, a listener
        // on `window` alone never sees it. That is exactly the shape of the symptom this
        // module was failing with: Ctrl+C (keydown, same file, same install) worked while
        // the press did nothing.
        //
        // So bind on every plausible target: the canvas's own window and document, this
        // window, and the element itself. One physical press can now arrive several times;
        // the de-dupe below (lastHandledAt) already collapses that to a single action.
        const targets = [];
        try { const w = cv.ownerDocument && cv.ownerDocument.defaultView; if (w) targets.push(w); } catch (e) { }
        try { if (cv.ownerDocument) targets.push(cv.ownerDocument); } catch (e) { }
        if (targets.indexOf(window) < 0) targets.push(window);
        try { if (window.document && targets.indexOf(window.document) < 0) targets.push(window.document); } catch (e) { }
        targets.push(cv);
        for (const tgt of targets) {
            try {
                tgt.addEventListener('pointerdown', onPress, true);
                tgt.addEventListener('mousedown', onPress, true);
            } catch (e) { }
        }
        S.targets = targets.length;
        // Only now is it true. Set before the listeners existed, a throw in between left
        // this permanently "installed" with nothing listening.
        S.installed = true;
        try { console.info('[chem press] installed on ' + targets.length + ' event targets \u2014 click a monomer on a zoomed-in compound; window.__bajaChemPressInfo() for diagnostics'); } catch (e) { }

        window.__bajaChemPressInfo = () => {
            const el = S.cv, g = S.graph;
            let rect = null;
            try { const r = el.getBoundingClientRect(); rect = { left: r.left, top: r.top, w: r.width, h: r.height, canvasW: el.width, canvasH: el.height }; } catch (e) { }
            const compounds = [];
            try {
                for (const t of ((g && g.track) || [])) for (const o of ((t && t.oligos) || [])) {
                    const cg = o && o.__chemGeom;
                    compounds.push({
                        name: '' + (o.name || o.id || 'compound'), type: o.type,
                        drawnAsMolecules: !!cg, editable: !!(cg && cg.editable),
                        pxPerResidue: cg ? Math.round(cg.per * 10) / 10 : null,
                        residues: cg ? cg.n : null,
                        selected: o.__chemSel || null,
                    });
                }
            } catch (e) { }
            return { installed: S.installed, connected: !!(el && el.isConnected), canvas: rect, compounds: compounds, presses: S.presses, last: S.last };
        };
        return true;
    })();
}
