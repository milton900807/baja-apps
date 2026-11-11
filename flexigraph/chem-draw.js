function () {
    // --- Professional genomics style (muted, IGV / Ensembl inspired) ---
    const font = '13px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
    const GX = {
        ink:      '#0a2540',
        guide:    'rgba(120,130,145,0.45)',
        acceptor: '#1aa3bd',
        sirna:    '#1897b0',
        rnaBind:  '#b0533f',
        chem:     '#46617a',
        aso:      '#159a91',
        snp:      '#9c2f45',
        ins:      '#12768f',
        del:      '#8c2f42'
    };

    // ── ASO polymer schematic (3D) ────────────────────────────────────────────────────
    // Renders an antisense oligo as its actual polymer: one shaded "sugar" bead per
    // nucleotide (colored by 2'-modification), the base letter above it, and the
    // internucleotide linkage drawn as a bond colored by chemistry (phosphorothioate vs
    // phosphodiester). Beads use a radial-gradient highlight + drop shadow for a 3D look.

    // Color helpers (lighten/darken a hex for the gradient stops and outlines).
    const __clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const __hexToRgb = (h) => { h = ('' + h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };
    const __rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => __clamp(v).toString(16).padStart(2, '0')).join('');
    const __lighten = (hex, amt) => { try { const c = __hexToRgb(hex); return __rgbToHex(c.r + (255 - c.r) * amt, c.g + (255 - c.g) * amt, c.b + (255 - c.b) * amt); } catch (e) { return hex; } };
    const __darken = (hex, amt) => { try { const c = __hexToRgb(hex); return __rgbToHex(c.r * (1 - amt), c.g * (1 - amt), c.b * (1 - amt)); } catch (e) { return hex; } };

    // 2'-sugar modification, backbone linkage, and base color palettes.
    // 2'-OMe ('m'/'ome') and the library's 2'-F symbol ('fl2r') were missing, so a residue
    // carrying either fell through to the compound's own colour and read as "no modification"
    // -- the one thing the bead colour is there to say. SUGAR_2P below already knew both.
    const SUGAR_COL = { moe: '#e0a83c', mo: '#e0a83c', lna: '#8e5cc0', bna: '#8e5cc0', cet: '#5c9dc0', dna: '#8894a5', d: '#8894a5', rna: '#1aa3bd', r: '#1aa3bd', fana: '#c07a3c', f: '#c07a3c', fl2r: '#c07a3c', m: '#3f8f5e', ome: '#3f8f5e', ena: '#7a6cc4', 'me-d': '#6b7a8c' };
    // sp/ps = phosphorothioate (orange), po/p = phosphodiester (gray). Rsp/Ssp are the
    // stereodefined phosphorothioates in this app's monomer set -- same linkage, a fixed
    // configuration at phosphorus -- so they read as PS rather than as an unknown bond.
    const LINK_COL = { sp: '#ef7d3a', ps: '#ef7d3a', rsp: '#ef7d3a', ssp: '#ef7d3a', po: '#9aa6b2', p: '#9aa6b2' };
    const BASE_COL = { A: '#2ca25f', C: '#2b7bba', G: '#d9a441', T: '#d1495b', U: '#d1495b' };

    // Screen px per residue at which each sugar is drawn as a furanose RING showing its
    // 2'-chemistry, rather than as a bead. Module scope because it is also what gates
    // per-monomer selection: you can only click a part once the parts are drawn, and one
    // constant means the drawing and the hit test cannot drift apart.
    const SUGAR_PER = 34;

    // Parse a HELM-ish ASO structure: RNA1{[moe](C)[sp].[moe](T)[sp]. … }
    // → [{ sugar, base, linkage }] (linkage is '' on the 3' terminal residue).
    const parseAsoStructure = (structure) => {
        const monos = [];
        try {
            const s = '' + (structure || '');
            const braced = s.match(/\{([^}]*)\}/);
            const body = braced ? braced[1] : s;
            if (!body) return monos;
            for (const unit of body.split('.')) {
                const u = ('' + unit).trim();
                if (!u) continue;
                // [sugar](Base) then the linkage, which HELM writes EITHER WAY:
                //   [moe](C)[sp]   multi-character symbols are bracketed
                //   d(A)p          single-character ones are bare -- that is the notation,
                //                  not a malformed string
                //
                // Only the bracketed form was read, so every bare linker parsed as no linker
                // at all: phosphodiester `p` is single-character by definition, so a PO
                // backbone lost its whole chemistry, and any mixed backbone lost the PO half
                // of it. With linkage '' the renderer's `isPS || isPO` is false and it draws a
                // plain bond -- no phosphorus, no =O, no =S -- which is the backbone chemistry
                // going missing while the sugars and bases around it render fine.
                const m = u.match(/\[?([A-Za-z0-9\-]+)\]?\s*\(([^)]+)\)\s*(?:\[([^\]]+)\]|([A-Za-z0-9]+))?/);
                if (m) monos.push({ sugar: ('' + (m[1] || '')).toLowerCase(), base: ('' + (m[2] || '')).toUpperCase(), linkage: ('' + (m[3] || m[4] || '')).toLowerCase() });
                else { const b = u.replace(/[^A-Za-z]/g, '').toUpperCase(); monos.push({ sugar: '', base: b ? b[0] : '?', linkage: '' }); }
            }
        } catch (e) { }
        return monos;
    };

    // Draw the 3D polymer along world span [xs, xf] at world y. opts.thin = zoomed-out.
    const drawAsoPolymer = (graph, xs, xf, y, color, structure, opts) => {
        opts = opts || {};
        // Motion LOD: while the user is actively panning, drop to simple beads (no sugar rings,
        // phosphate chemistry, or base letters) so dragging stays smooth. Full detail returns
        // the instant motion stops (graph.__lowDetail is cleared + a repaint fires).
        const lowDetail = !!(graph && graph.__lowDetail);
        const ctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
        const baseCol = color || GX.aso;
        // No canvas ctx (or degenerate) — fall back to the original simple line.
        if (!ctx) { graph.drawLine(xs, y, xf, y, baseCol, opts.thin ? 4 : 8, 'round'); return; }

        const sxs = graph.X(xs), sxf = graph.X(xf), sy = graph.Y(y);
        const span = Math.abs(sxf - sxs);
        let monos = parseAsoStructure(structure);
        let n = monos.length || Math.max(1, Math.round(Math.abs(xf - xs)));
        // Gapmer without an explicit HELM chemistry: synthesize the canonical layout —
        // modified (MOE) wings flanking a DNA gap, phosphorothioate backbone — so it still
        // renders with proper sugar chemistry (gray DNA 'H' core between amber MOE wings)
        // and PS linkages, the same treatment a fully-specified ASO/gapmer gets.
        if (opts.gapmerDefault && (!monos.length || monos.every((m) => !m.sugar))) {
            const wing = Math.max(1, Math.min(5, Math.floor(n * 0.25)));
            const rebuilt = [];
            for (let i = 0; i < n; i++) {
                const isWing = (i < wing) || (i >= n - wing);
                rebuilt.push({ sugar: isWing ? 'moe' : 'd', base: (monos[i] && monos[i].base) || '', linkage: (i < n - 1) ? 'sp' : '' });
            }
            monos = rebuilt;
        }
        // ---- GENOMIC ORIENTATION, AND THE REFERENCE UNDERNEATH ---------------------------
        //
        // The beads were always laid out in SYNTHESIS order, 5' to 3' left to right,
        // whatever direction the compound runs on the genome. For an antisense oligo that
        // is backwards: its 5' end pairs with the HIGHER coordinate, so the leftmost bead
        // was the last residue, and everything drawn under it read against the grain of a
        // canvas where left is the lower coordinate.
        //
        // DECIDED AGAINST THE GENOME, NOT AGAINST THE TARGET FIELD. An earlier version of
        // this measured the monomers against the compound's own targetSequence and assumed
        // that field was in genomic orientation. It is not a fixed convention: it is
        // whatever the designer was handed, and on a minus-strand gene that is now the
        // mRNA, which is the reverse complement of the genome. Keying a drawing decision on
        // it meant the fix to one made the other wrong. The track stashes the REFERENCE
        // sequence under this compound (__genomicSite) and that is what this measures
        // against, because the genome is not a convention.
        //
        // Four readings, because both unknowns are settled by the same measurement: the
        // residues run with the genome or against it, and an oligo sitting on a plus-strand
        // gene is the COMPLEMENT of the reference while one on a minus-strand gene IS the
        // reference. Whichever of the four fits best wins, and a compound that fits none of
        // them is left alone.
        const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', U: 'A', N: 'N' };
        const __host = opts.oligo || null;
        // Take the n bases this compound actually covers. The track hands over a slice
        // that is deliberately a little long, because its range accessor is end-exclusive
        // and the compound's own end is stored inclusively by some callers; requiring an
        // exact length made the row disappear on an off-by-one instead of drawing.
        const __refRaw = ('' + ((__host && __host.__genomicSite) || '')).toUpperCase().replace(/[^ACGTUN]/g, '');
        const __ref = (__refRaw.length >= n) ? __refRaw.slice(0, n) : '';
        if (__refRaw && !__ref && __host && !__host.__refShortWarned) {
            __host.__refShortWarned = true;
            try {
                console.warn('[chem-draw] ' + (__host.name || __host.id) + ': the track gave '
                    + __refRaw.length + ' reference bases for a ' + n + '-residue compound, so no '
                    + 'reference is drawn under it.');
            } catch (e) { }
        }
        let __flip = false, __same = false, __refFit = -1;
        if (__ref.length === n && n > 1) {
            const fit = (mirror, same) => {
                let k = 0;
                for (let i = 0; i < n; i++) {
                    const m = monos[mirror ? (n - 1 - i) : i];
                    const b = (m && m.base) ? m.base[0] : '';
                    if (!b || !__ref[i]) continue;
                    if (same ? (b === __ref[i]) : (COMP[b] === __ref[i])) k++;
                }
                return k;
            };
            let best = null;
            for (const mirror of [false, true]) {
                for (const same of [false, true]) {
                    const k = fit(mirror, same);
                    if (!best || k > best.k) best = { k: k, mirror: mirror, same: same };
                }
            }
            __refFit = best.k;
            // An allele-selective oligo differs from the reference in one or two places, not
            // in eight. Below three quarters none of the four readings is the right one, so
            // nothing is reoriented and nothing is drawn underneath.
            if (best.k >= Math.ceil(n * 0.75)) {
                __flip = best.mirror;
                __same = best.same;
            } else if (__host && !__host.__refFitWarned) {
                __host.__refFitWarned = true;
                try {
                    console.warn('[chem-draw] ' + (__host.name || __host.id)
                        + ': best fit to the reference under it is ' + best.k + ' of ' + n
                        + ' in any reading, so the compound is not reoriented and no reference '
                        + 'is drawn under it.');
                } catch (e) { }
            }
        }
        // Slot -> monomer. Everything that draws walks SLOTS, left to right in genomic
        // order; everything that records or resolves an index speaks MONOMERS, because
        // __chemGeom.monos is the compound's own chemistry and the editor writes back
        // through it. Mixing the two is how a mirrored compound would get its wings
        // swapped the first time somebody edited a sugar.
        const __mono = (slot) => monos[__flip ? (n - 1 - slot) : slot] || {};

        const x0 = Math.min(sxs, sxf);
        const per = span / n;
        // Bead radius from per-base width, clamped. When beads would be too tight to read,
        // draw a smooth backbone line instead (still colored by the dominant linkage).
        const R = Math.max(2, Math.min(opts.thin ? 5 : 10, per * 0.42));

        // Perf: cull residues whose screen x is outside the canvas (when zoomed in, only a
        // handful of an oligo's residues are visible — don't draw the rest), and cache the
        // radial-gradient bead fill per color (R is constant per call, so only a few distinct
        // gradients are ever needed instead of one per residue every frame).
        const CW = (ctx.canvas && ctx.canvas.width) || 1e9;
        const visMin = -R * 3, visMax = CW + R * 3;
        const _gradCache = {};
        const beadGrad = (col) => {
            let gg = _gradCache[col];
            if (!gg) {
                gg = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.12, 0, 0, R);
                gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.28, __lighten(col, 0.5)); gg.addColorStop(1, col);
                _gradCache[col] = gg;
            }
            return gg;
        };

        // WHERE EACH MONOMER LANDED ON SCREEN, so a click can be turned back into "the 7th
        // sugar" or "the linkage between 7 and 8". Recorded as the GEOMETRY (origin, pitch,
        // count, radius) rather than as a rect per residue, because the loops below cull
        // off-screen residues -- an array would have holes exactly where the user scrolled
        // to. From x0/per/R any index is arithmetic, and it stays correct for residues that
        // were never drawn. Same idea as the `__otBadge` screen-rect the off-target badge
        // caches, one step more general.
        //
        // `editable` is the honest question the UI has to ask before offering chemistry
        // editing: below ~6 px a residue there is no distinct thing under the cursor to
        // click, so the answer is no and the menu says why rather than picking a monomer at
        // random. It is deliberately not gated on lowDetail: the geometry is the same while
        // panning even though the ornament is dropped, so a click that lands mid-pan still
        // resolves to the residue the user aimed at.
        const host = opts.oligo || null;
        if (host) {
            host.__chemGeom = {
                x0: x0, per: per, n: n, sy: sy, R: R,
                thin: !!opts.thin,
                // Drawn in genomic order, so slot k holds monomer n-1-k. `monos` stays in
                // the compound's own order -- the chemistry editor writes back through it
                // and a reversed array there would swap a gapmer's wings the first time
                // anyone edited a sugar. Whoever turns a pixel into an index applies this.
                flipped: __flip,
                // Selectable only once the sugars are drawn as rings -- the zoom at which
                // there is a visible "part" to aim at. Below this the polymer is beads and a
                // click has nothing specific to mean.
                editable: (per >= SUGAR_PER && !opts.thin),
                sugarPer: SUGAR_PER,
                // WHEN it was recorded. A press handler must not act on geometry left over
                // from a document that is no longer open: after a file is loaded the old
                // compounds are gone but their last recorded positions are not, and a click
                // meant for the new content could be resolved against them.
                at: Date.now(),
                monos: monos,
            };
        }

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (per < 3.2) {
            // Too tight for individual residues → a clean rounded backbone with a soft shadow.
            ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5;
            ctx.strokeStyle = baseCol; ctx.lineWidth = opts.thin ? 4 : 7;
            ctx.beginPath(); ctx.moveTo(sxs, sy); ctx.lineTo(sxf, sy); ctx.stroke();
            ctx.restore();
            return;
        }

        // A little atom glyph: a white disc with a colored ring and the element letter, so
        // O / S read clearly against the beads at high zoom.
        const drawAtom = (ax, ay, sym, col, ar) => {
            ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff'; ctx.fill();
            ctx.lineWidth = 1.2; ctx.strokeStyle = col; ctx.stroke();
            ctx.font = 'bold ' + Math.max(7, Math.round(ar * 1.5)) + 'px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = col; ctx.fillText(sym, ax, ay + 0.5);
        };
        // A single or double (two parallel lines) chemical bond.
        const drawBond = (x1, y1, x2, y2, col, w, dbl) => {
            ctx.strokeStyle = col; ctx.lineWidth = w;
            if (!dbl) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); return; }
            const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
            const ox = -dy / L * Math.max(1.4, w * 0.9), oy = dx / L * Math.max(1.4, w * 0.9);
            ctx.beginPath();
            ctx.moveTo(x1 + ox, y1 + oy); ctx.lineTo(x2 + ox, y2 + oy);
            ctx.moveTo(x1 - ox, y1 - oy); ctx.lineTo(x2 - ox, y2 - oy);
            ctx.stroke();
        };

        // 1) Internucleoside linkage between adjacent sugars.
        //    Zoomed all the way in (per >= CHEM_PER): draw the actual phosphate chemistry —
        //    the P raised above the backbone (sugar-low / P-high zig-zag), O–P–O bridging bonds,
        //    a non-bridging =O, and the defining substituent (=S gold for phosphorothioate PS,
        //    O⁻ for phosphodiester PO). Otherwise: a single chemistry-colored bond.
        // Two levels of backbone chemistry, because one was set so high that in practice
        // there was none.
        //
        // The full phosphate group -- P raised off the backbone with its bridging oxygens and
        // its =O and =S -- needs room, and at 30 px per residue a 16mer has to be 480 px wide
        // on screen before it appears (a 20mer, 600). That is one compound filling half the
        // canvas. At every zoom anyone actually works at, including the one where base letters
        // are perfectly readable at 176 px, the backbone drew as an unadorned bond: the
        // sugars and bases said what they were and the linkages said nothing.
        //
        // So the identity comes in far earlier than the anatomy. From 6 px per residue a
        // linkage carries a NODE at the midpoint of its bond -- filled gold for
        // phosphorothioate, hollow grey for phosphodiester -- which is the one fact about the
        // backbone a reader needs at a glance and costs two arcs. The full group still takes
        // over when there is room for it, now at 22 rather than 30.
        const CHEM_PER = 22;
        const NODE_PER = 6;
        const chemMode = !opts.thin && per >= CHEM_PER && !lowDetail;
        const nodeMode = !opts.thin && per >= NODE_PER && per < CHEM_PER && !lowDetail;
        for (let i = 0; i < n - 1; i++) {
            const cx = x0 + (i + 0.5) * per, nx = x0 + (i + 1.5) * per;
            if (nx < visMin || cx > visMax) continue;   // off-screen linkage — skip
            // The bond drawn between slot i and slot i+1. Mirrored, those slots hold
            // monomers n-1-i and n-2-i, and the bond is recorded on the 5' partner of the
            // pair -- which is the SECOND of them in genomic order, not the first.
            const __lkMono = __flip ? (monos[n - 2 - i] || {}) : (monos[i] || {});
            const lk = __lkMono.linkage || '';
            const isPS = (lk === 'sp' || lk === 'ps' || lk === 'rsp' || lk === 'ssp');
            const isPO = (lk === 'po' || lk === 'p');
            if (chemMode && (isPS || isPO)) {
                const mx = (cx + nx) / 2, Py = sy - R * 0.85;      // phosphorus raised above the line
                const bond = '#4b5560', red = '#c0392b', gold = '#d9a520';
                const bw = Math.max(1.4, R * 0.16);
                // O–P–O bridging bonds from each sugar edge up to P, with bridging O atoms.
                const lsx = cx + R * 0.9, rsx = nx - R * 0.9;
                drawBond(lsx, sy, mx, Py, bond, bw, false);
                drawBond(rsx, sy, mx, Py, bond, bw, false);
                const oR = Math.max(3, R * 0.36);
                drawAtom((lsx + mx) / 2, (sy + Py) / 2, 'O', red, oR);
                drawAtom((rsx + mx) / 2, (sy + Py) / 2, 'O', red, oR);
                // Non-bridging substituents above P: =O (double bond) up-left, and the
                // linkage-defining atom up-right (=S gold for PS, O⁻ for PO).
                const upY = Py - R * 1.15, dxo = R * 0.62;
                drawBond(mx, Py, mx - dxo, upY, red, bw, true);
                drawAtom(mx - dxo, upY, 'O', red, oR);
                if (isPS) {
                    drawBond(mx, Py, mx + dxo, upY, gold, bw + 0.4, true);
                    drawAtom(mx + dxo, upY, 'S', gold, oR + 0.6);
                } else {
                    drawBond(mx, Py, mx + dxo, upY, red, bw, false);
                    drawAtom(mx + dxo, upY, 'O', red, oR);
                    // minus charge on the phosphodiester non-bridging oxygen
                    ctx.font = 'bold ' + Math.max(7, Math.round(oR)) + 'px Arial';
                    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                    ctx.fillStyle = red; ctx.fillText('–', mx + dxo + oR * 0.7, upY - oR * 0.6);
                }
                // P atom last, on top.
                drawAtom(mx, Py, 'P', isPS ? '#b8860b' : '#6b4fbb', oR + 1);
            } else {
                ctx.strokeStyle = LINK_COL[lk] || __darken(baseCol, 0.1);
                ctx.lineWidth = Math.max(1.5, R * 0.55);
                ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(nx, sy); ctx.stroke();
                // The node: which chemistry this linkage is, without the anatomy. Filled for
                // PS because it is the substituted one and the one a reader is usually
                // checking for; hollow for PO so the two are told apart by more than a hue,
                // which matters on a small mark.
                if (nodeMode && (isPS || isPO)) {
                    const nx2 = (cx + nx) / 2;
                    const nr = Math.max(2, Math.min(4.5, R * 0.30));
                    ctx.beginPath(); ctx.arc(nx2, sy, nr, 0, Math.PI * 2);
                    if (isPS) {
                        ctx.fillStyle = '#d9a520'; ctx.fill();
                        ctx.lineWidth = 1; ctx.strokeStyle = '#8a6a10'; ctx.stroke();
                    } else {
                        ctx.fillStyle = '#0d2237'; ctx.fill();
                        ctx.lineWidth = 1.2; ctx.strokeStyle = '#9aa6b2'; ctx.stroke();
                    }
                }
            }
        }
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        // The 2'-substituent shorthand per sugar chemistry, and which sugars carry a
        // locked 2'-O,4'-C bridge (LNA/cEt/ENA family).
        const SUGAR_2P = { moe: 'MOE', mo: 'MOE', ome: 'OMe', m: 'OMe', dna: 'H', d: 'H', 'me-d': 'H', rna: 'OH', r: 'OH', fana: 'F', f: 'F', fl2r: 'F', lna: 'LNA', bna: 'LNA', cet: 'cEt', ena: 'ENA' };
        const BRIDGED = { lna: 1, bna: 1, cet: 1, ena: 1 };
        // Draw one sugar as a furanose pentagon (O apex, C1'..C4' clockwise) with a 3D fill,
        // its ring oxygen, and the 2'-substituent off C2' — the actual sugar chemistry.
        const drawSugar = (cx, cy, RR, mo) => {
            const sugarCol = SUGAR_COL[mo.sugar] || baseCol;
            const A = [-90, -18, 54, 126, 198].map((a) => a * Math.PI / 180);
            const vx = A.map((a) => cx + RR * Math.cos(a)), vy = A.map((a) => cy + RR * Math.sin(a));
            const g = ctx.createRadialGradient(cx - RR * 0.3, cy - RR * 0.35, RR * 0.1, cx, cy, RR);
            g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, __lighten(sugarCol, 0.5)); g.addColorStop(1, sugarCol);
            ctx.beginPath(); ctx.moveTo(vx[0], vy[0]); for (let k = 1; k < 5; k++) ctx.lineTo(vx[k], vy[k]); ctx.closePath();
            ctx.fillStyle = g; ctx.fill();
            ctx.lineWidth = 1.3; ctx.strokeStyle = __darken(sugarCol, 0.3); ctx.stroke();
            drawAtom(vx[0], vy[0], 'O', '#c0392b', Math.max(3, RR * 0.32));   // ring oxygen at apex
            const sug = ('' + (mo.sugar || '')).toLowerCase();
            if (BRIDGED[sug]) drawBond(vx[2], vy[2], vx[4], vy[4], __darken(sugarCol, 0.15), Math.max(1.6, RR * 0.18), false); // locked 2'-O,4'-C bridge
            const lbl = SUGAR_2P[sug];
            if (lbl) {
                const ux = vx[2] - cx, uy = vy[2] - cy, ul = Math.hypot(ux, uy) || 1;   // outward from C2'
                const ex = vx[2] + ux / ul * RR * 0.5, ey = vy[2] + uy / ul * RR * 0.5;
                drawBond(vx[2], vy[2], ex, ey, '#5b6470', Math.max(1.3, RR * 0.14), false);
                const lc = lbl === 'F' ? '#2e8b57' : lbl === 'OH' ? '#c0392b' : lbl === 'H' ? '#6b7a8c' : __darken(sugarCol, 0.15);
                ctx.font = 'bold ' + Math.max(7, Math.round(RR * 0.72)) + 'px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillStyle = lc; ctx.fillText(lbl, ex + 1, ey + 1);
            }
        };

        // 2) Sugars + base letters. Zoomed all the way in (per >= SUGAR_PER) each sugar is
        //    drawn as a furanose ring showing its 2'-chemistry; otherwise a 3D bead.
        const sugarMode = per >= SUGAR_PER && !opts.thin && !lowDetail;
        const showBase = per >= 11 && !opts.thin && !lowDetail;

        // ---- THE TARGET STRAND, UNDER THE COMPOUND ----------------------------------------
        //
        // The letters above the beads are the compound's OWN monomers. What a reader of an
        // allele-selective design needs beside them is the strand being bound, in register,
        // so the discriminating base is a column rather than two strings to compare.
        // Drawn here rather than as a label because here the register is not a calculation:
        // it is the same cx the bead was drawn at.
        //
        // The orientation question was settled above, where it had to be: the compound
        // itself is drawn in genomic order now, so the target is written exactly as it is
        // stored -- genomic order too -- and reads in the same direction as the track's own
        // sequence underneath it. Slot i pairs with target base i, by construction.
        const tgtRow = (showBase && __refFit >= Math.ceil(n * 0.75)) ? __ref.split('') : null;
        for (let i = 0; i < n; i++) {
            const cx = x0 + (i + 0.5) * per;
            if (cx < visMin || cx > visMax) continue;   // off-screen residue — skip
            const mo = __mono(i);
            const sugarCol = SUGAR_COL[mo.sugar] || baseCol;
            if (sugarMode) {
                drawSugar(cx, sy, R, mo);
                if (mo.base && R >= 5) {   // base letter CENTERED inside the sugar ring (like siRNA),
                    // with a white halo so it stays clearly legible over the ring's 2'-mod color.
                    const bl = mo.base[0];
                    ctx.font = 'bold ' + Math.max(8, Math.round(R * 0.95)) + 'px "Segoe UI", Arial, sans-serif';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.lineWidth = Math.max(2, R * 0.3); ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineJoin = 'round';
                    ctx.strokeText(bl, cx, sy);
                    ctx.fillStyle = BASE_COL[bl] || GX.ink; ctx.fillText(bl, cx, sy);
                }
                continue;
            }
            // Cached gradient built at the origin, positioned by translating the context —
            // avoids re-creating a radial gradient for every bead every frame.
            ctx.save(); ctx.translate(cx, sy);
            ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = beadGrad(sugarCol); ctx.fill();
            ctx.lineWidth = 1; ctx.strokeStyle = __darken(sugarCol, 0.28); ctx.stroke();
            // tiny specular highlight
            ctx.beginPath(); ctx.arc(-R * 0.32, -R * 0.36, Math.max(0.8, R * 0.22), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
            ctx.restore();

            if (showBase && mo.base) {
                ctx.font = 'bold ' + Math.max(8, Math.min(13, Math.round(R * 1.35))) + 'px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillStyle = BASE_COL[mo.base[0]] || GX.ink;
                ctx.fillText(mo.base[0], cx, sy - R - 2);
            }
            // The target base that pairs with this monomer, directly beneath it. A column
            // that does NOT pair is the whole point of an allele-selective design, so it is
            // marked as a column rather than left for the reader to spot.
            if (tgtRow) {
                const tb = tgtRow[i] || '';
                const mb = (mo.base && mo.base[0]) || '';
                // A column that disagrees with the REFERENCE is the allele-selective base:
                // the one place the oligo was built to differ. Judged by the relation the
                // measurement found, so it means the same thing on either strand.
                const bad = !!(tb && mb && (__same ? (mb !== tb) : (COMP[mb] !== tb)));
                if (bad) {
                    ctx.fillStyle = 'rgba(224,138,0,0.20)';
                    ctx.fillRect(Math.round(cx - per / 2), sy + R + 1, Math.max(1, Math.round(per)), 14);
                }
                if (tb) {
                    ctx.font = 'bold ' + Math.max(8, Math.min(13, Math.round(R * 1.35))) + 'px "Segoe UI", Arial, sans-serif';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                    ctx.fillStyle = bad ? '#b45309' : 'rgba(15,23,42,0.55)';
                    ctx.fillText(tb, cx, sy + R + 3);
                }
            }
        }

        // 3) A TERMINAL CONJUGATE, drawn as the thing it is rather than as the word for it.
        //    GalNAc was a text label beside the compound, which says a conjugate exists but
        //    nothing about which end it is on, how many sugars it carries, or how it is
        //    attached -- and the attachment chemistry (phosphorothioate vs phosphodiester)
        //    is a real design decision, not a detail.
        //
        //    Drawn to the glycan convention (SNFG): each GalNAc is a YELLOW SQUARE, so a
        //    trivalent cluster is three squares on a branched trebler, which is how these
        //    are drawn in the literature. The stem is coloured by its linkage using the
        //    same palette as the backbone, so a PS attachment reads as PS.
        // The conjugate to draw: the compound's own record, or -- for one saved before
        // that field existed -- derived from the HELM connection here, BEFORE drawing,
        // rather than after. Derived afterwards it was a frame late, so a legacy compound
        // showed no conjugate until something else happened to repaint it.
        let conj = host && host.conjugate;
        if (host && !conj && structure) {
            const five = structure.indexOf('CHEM1,RNA1') > 0;
            const three = structure.indexOf('RNA1,CHEM1') > 0;
            if (five || three) {
                const sym = (structure.match(/CHEM1\{\[?([A-Za-z0-9]+)\]?\}/) || [])[1] || '';
                conj = { site: five ? '5' : '3', symbol: sym, linkage: '', legacy: true };
                host.conjugate = conj;
            }
        }
        if (conj && !opts.thin && per >= 6) {
            const three = /3$/.test('' + (conj.units || '')) || (+conj.units === 3)
                || /GN3|GalNAc3/i.test('' + (conj.symbol || ''));
            const nUnits = three ? 3 : 1;
            // Which SIDE the 5' end is on now depends on the mirror, so the conjugate
            // follows its own end rather than a fixed edge.
            const atFive = (('' + conj.site) === '5') !== __flip;
            // 5' is the LEFT end of the drawn span only when the compound is drawn 5'->3'
            // left to right, which is how this renderer lays it out.
            const endX = atFive ? x0 : x0 + per * n;
            const dir = atFive ? -1 : 1;                 // outward, away from the chain
            const lkCol = LINK_COL[('' + (conj.linkage || '')).toLowerCase()] || '#9aa6b2';
            const stem = Math.max(10, Math.min(26, per * 0.7));
            const sq = Math.max(4, Math.min(9, R * 0.9));
            const bx = endX + dir * stem;                // branch point

            ctx.save();
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            // Stem from the terminus to the branch point, in the linkage's own colour, and
            // a node on it the same way a PS/PO linkage in the backbone carries one.
            ctx.strokeStyle = lkCol; ctx.lineWidth = Math.max(1.6, R * 0.2);
            ctx.beginPath(); ctx.moveTo(endX + dir * R * 0.6, sy); ctx.lineTo(bx, sy); ctx.stroke();
            const isPS = /^(sp|ps|rsp|ssp)$/.test(('' + (conj.linkage || '')).toLowerCase());
            const nodeR = Math.max(2.2, R * 0.26);
            ctx.beginPath();
            ctx.arc(endX + dir * (R * 0.6 + (stem - R * 0.6) / 2), sy, nodeR, 0, Math.PI * 2);
            if (isPS) { ctx.fillStyle = lkCol; ctx.fill(); }
            else { ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = lkCol; ctx.stroke(); }

            // Arms out to each sugar: one straight arm, or three fanned from the branch.
            const arm = Math.max(8, Math.min(20, per * 0.5));
            const ys = (nUnits === 3) ? [-1, 0, 1] : [0];
            ctx.strokeStyle = '#8a8f98'; ctx.lineWidth = Math.max(1.2, R * 0.14);
            for (const k of ys) {
                const tx = bx + dir * arm, ty = sy + k * (sq * 2.1);
                ctx.beginPath(); ctx.moveTo(bx, sy); ctx.lineTo(tx, ty); ctx.stroke();
            }
            // The sugars themselves: SNFG yellow squares with a dark edge.
            for (const k of ys) {
                const tx = bx + dir * arm, ty = sy + k * (sq * 2.1);
                ctx.fillStyle = '#f5c518';
                ctx.strokeStyle = '#6b5a00'; ctx.lineWidth = 1.1;
                ctx.beginPath(); ctx.rect(tx - sq, ty - sq, sq * 2, sq * 2);
                ctx.fill(); ctx.stroke();
            }
            // Name it only when there is room; the squares carry the meaning.
            if (per >= 18) {
                const lbl = (nUnits === 3 ? 'GalNAc₃' : 'GalNAc');
                ctx.font = 'bold ' + Math.max(8, Math.round(R * 0.8)) + 'px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = atFive ? 'right' : 'left';
                ctx.textBaseline = 'top';
                ctx.fillStyle = GX.ink;
                ctx.fillText(lbl, bx + dir * (arm + sq + 3) * (atFive ? 0 : 1) + (atFive ? -(arm + sq + 3) : 0),
                    sy + sq * 2.1 + sq + 2);
            }
            ctx.restore();

            // Where it was drawn, so a press can offer the conjugate's own menu.
            if (host) {
                const lo = Math.min(endX, bx + dir * (arm + sq)), hi = Math.max(endX, bx + dir * (arm + sq));
                host.__conjBox = { x1: lo, x2: hi, sy: sy, h: sq * 2.1 * (nUnits === 3 ? 1.6 : 1) + sq };
            }
        } else if (host) { host.__conjBox = null; }

        // 4) THE SELECTED PART, drawn last so it sits over the chemistry rather than under
        //    it. A selected monomer gets a ring around its sugar; a selected linkage gets a
        //    capsule around the bond it occupies -- different shapes because they are
        //    different kinds of thing, and a reader should not have to work out which one
        //    they picked from the position of a highlight alone.
        const sel = host && host.__chemSel;
        if (sel && sel.i >= 0 && sel.i < n) {
            const accent = '#ff8c42';               // the same orange a selected oligo uses
            ctx.save();
            ctx.strokeStyle = accent;
            ctx.lineWidth = Math.max(2, R * 0.22);
            ctx.shadowColor = 'rgba(255,140,66,0.55)'; ctx.shadowBlur = 6;
            if (sel.kind === 'linkage' && sel.i < n - 1) {
                const a = x0 + (sel.i + 0.5) * per, b = x0 + (sel.i + 1.5) * per;
                const pad = R * 0.35, h = Math.max(6, R * 1.5);
                const lx = a + R * 0.75 - pad, rx = b - R * 0.75 + pad;
                const top = sy - (chemMode ? R * 2.1 : h / 2), bot = sy + h / 2;
                const rr = Math.min(6, (bot - top) / 2);
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(lx, top, Math.max(4, rx - lx), bot - top, rr);
                else ctx.rect(lx, top, Math.max(4, rx - lx), bot - top);
                ctx.stroke();
            } else {
                const cx = x0 + (sel.i + 0.5) * per;
                ctx.beginPath(); ctx.arc(cx, sy, R + Math.max(3, R * 0.3), 0, Math.PI * 2); ctx.stroke();
            }
            ctx.restore();
        }
        ctx.restore();
    };

    return {
        'siRNA_deprectrd': createIon((graph, xs, xf, y, color, structure) => {
            let ys = graph.Y(y);
            let xss = graph.X(xs);
            let xff = graph.X(xf);
            graph.drawScreenLine(xss - 25, ys + 10, xff - 2, ys + 5, GX.guide, 5, 'butt')
            graph.drawScreenLine(xss, ys, xff, ys, GX.sirna, 4, 'round')
        }),
        'rna-binding': createIon((graph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs, y, xf, y, GX.rnaBind, 5, 'round')
        }),
        // Gapmer: the 3D polymer schematic. A gapmer's chemistry pattern (modified wings +
        // DNA core "gap") reads straight off the sugar-bead colors — amber/purple MOE/LNA wings
        // flanking gray DNA — so no special gap drawing is needed beyond the structure itself.
        'gapmer.detailed': createIon((graph, xs, xf, y, color, structure, oligo) => {
            drawAsoPolymer(graph, xs, xf, y, color || GX.sirna, structure, { thin: true, gapmerDefault: true, oligo: oligo });
        }),
        'gapmer': createIon((graph, xs, xf, y, color, structure, oligo) => {
            drawAsoPolymer(graph, xs, xf, y, color || GX.sirna, structure, { thin: false, gapmerDefault: true, oligo: oligo });
            // A conjugate is DRAWN by the polymer renderer above (SNFG squares on a
            // trebler, stem coloured by its linkage) rather than written beside the
            // compound as the word "GalNAc", which said one existed and nothing else --
            // not which end, not how many sugars, not how it is attached. Compounds saved
            // before the `conjugate` field existed are picked up from their HELM
            // connection inside drawAsoPolymer, so they draw on the first frame too.
        }),
        'amplicon': createIon((graph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs + d / 4, y, xf - d / 4, y, GX.sirna, 1, 'round')
            graph.drawLine(xs, y, xf - (3 * (d / 4)), y, GX.chem, 3, 'butt')
            graph.drawLine(xs + (3 * (d / 4)), y, xf, y, GX.chem, 3, 'butt')

        }),
        'amplicon.detailed': createIon((graph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs + d / 4, y, xf - d / 4, y, GX.sirna, 1, 'round')
            graph.drawLine(xs, y, xf - (3 * (d / 4)), y, GX.chem, 3, 'butt')
            graph.drawLine(xs + (3 * (d / 4)), y, xf, y, GX.chem, 3, 'butt')

        }),

        'splicing': createIon((graph, xs, xf, y) => {

            graph.drawZigZag(xs, y, xf, y, GX.acceptor, 2, 'round')
            graph.drawLine(xs, y, xf, y, GX.ink, 1, 'round')

        }),
        // Zoomed OUT (called as detailedShapeFunction when screencell <= 1): compact beaded
        // backbone — the 3D polymer read at a glance without base letters.
        'aso.detailed': createIon((graph, xs, xf, y, color, structure, oligo) => {
            drawAsoPolymer(graph, xs, xf, y, color || GX.aso, structure, { thin: true, oligo: oligo });
        }),
        // Zoomed IN / detailed view (called as shapeFunction when screencell > 1): the full 3D
        // polymer schematic — shaded sugar beads (by 2'-modification), base letters, and
        // chemistry-colored linkages (phosphorothioate vs phosphodiester).
        'aso': createIon((graph, xs, xf, y, color, structure, oligo) => {
            drawAsoPolymer(graph, xs, xf, y, color || GX.aso, structure, { thin: false, oligo: oligo });
        }),

        // The types the DESIGNERS actually produce. Oligo.draw looks its shape up by
        // `type` (chem_draw[this.type]) and falls back to a plain graph.drawLine when the key
        // is missing -- so a steric-blocking ASO or an siRNA was drawn as a bare line in its
        // score color, which at gene zoom reads as a stray red tick rather than a compound.
        //
        // Only the gapmer designer had a matching key. siRNA's shape was here all along under
        // 'siRNA_deprectrd' -- a typo for deprecated -- which nothing could ever look up, since
        // the designer sets type = "siRNA".
        //
        // Aliases rather than copies: one shape, three names, so a change to the drawing cannot
        // apply to some of them and not others.
        'siRNA': createIon((graph, xs, xf, y, color, structure) => {
            let ys = graph.Y(y);
            let xss = graph.X(xs);
            let xff = graph.X(xf);
            // The passenger strand, offset below and behind the guide: a duplex reads as two
            // strands, which is the thing that distinguishes an siRNA from an ASO on sight.
            graph.drawScreenLine(xss - 25, ys + 10, xff - 2, ys + 5, GX.guide, 5, 'butt');
            graph.drawScreenLine(xss, ys, xff, ys, color || GX.sirna, 4, 'round');
        }),
        // A steric blocker is a fully-modified single strand -- the same polymer the ASO shape
        // draws, and deliberately not a distinct mark: what separates it from a gapmer is its
        // chemistry, which the polymer already renders from `structure`.
        'steric_blocking_aso': createIon((graph, xs, xf, y, color, structure, oligo) => {
            drawAsoPolymer(graph, xs, xf, y, color || GX.aso, structure, { thin: false, oligo: oligo });
        }),
        'steric_blocking_aso.detailed': createIon((graph, xs, xf, y, color, structure, oligo) => {
            drawAsoPolymer(graph, xs, xf, y, color || GX.aso, structure, { thin: true, oligo: oligo });
        }),

        'mutation-annotation': createIon((graph, xs, xf, y, c, phase) => {
            graph.drawVerticalLine(xs, y, y + 0.02, GX.guide, 1)
            graph.drawVerticalLine(xf, y, y + 0.02, GX.guide, 1)

        }),
        'snp': createIon((graph, xs__, xf__, yf, ys, c, phase) => {
            const xw = graph.grid.worldWidth(10)
            const xs = xs__ + xw;
            const xf = xf__ + xw;

            graph.drawLine(xs, yf, xf, yf, GX.snp, 10, 'round')
            graph.drawLine(xs, ys, xs, yf, GX.snp, 0.5);
            graph.drawLine(xf, ys, xf, yf, GX.snp, 0.5);

        }),
        'ins': createIon((graph, xs, xf, yf, ys, c, phase) => {
            graph.drawLine(xs, yf, xf, yf, GX.ins, 10, 'round');
            graph.drawLine(xs, ys, xs, yf, GX.ins, 0.5);
            graph.drawLine(xf, ys, xf, yf, GX.ins, 0.5);

        }),
        'del': createIon((graph, xs, xf, yf, ys, c, phase) => {
            graph.drawLine(xs, yf, xf, yf, GX.del, 13, 'round')
            graph.drawLine(xs, ys, xs, yf, GX.del, 0.5);
            graph.drawLine(xs, yf, xf, ys, GX.del, 0.5);

        }),
    }
}
