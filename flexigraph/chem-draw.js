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
    const SUGAR_COL = { moe: '#e0a83c', mo: '#e0a83c', lna: '#8e5cc0', bna: '#8e5cc0', cet: '#5c9dc0', dna: '#8894a5', d: '#8894a5', rna: '#1aa3bd', r: '#1aa3bd', fana: '#c07a3c', f: '#c07a3c', 'me-d': '#6b7a8c' };
    const LINK_COL = { sp: '#ef7d3a', ps: '#ef7d3a', po: '#9aa6b2', p: '#9aa6b2' };   // sp/ps = phosphorothioate (orange), po = phosphodiester (gray)
    const BASE_COL = { A: '#2ca25f', C: '#2b7bba', G: '#d9a441', T: '#d1495b', U: '#d1495b' };

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
                // [sugar](Base)[linkage]?
                const m = u.match(/\[?([A-Za-z0-9\-]+)\]?\s*\(([^)]+)\)\s*(?:\[([^\]]+)\])?/);
                if (m) monos.push({ sugar: ('' + (m[1] || '')).toLowerCase(), base: ('' + (m[2] || '')).toUpperCase(), linkage: ('' + (m[3] || '')).toLowerCase() });
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
        const CHEM_PER = 30;
        const chemMode = !opts.thin && per >= CHEM_PER && !lowDetail;
        for (let i = 0; i < n - 1; i++) {
            const cx = x0 + (i + 0.5) * per, nx = x0 + (i + 1.5) * per;
            if (nx < visMin || cx > visMax) continue;   // off-screen linkage — skip
            const lk = (monos[i] && monos[i].linkage) || '';
            const isPS = (lk === 'sp' || lk === 'ps');
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
            }
        }
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        // The 2'-substituent shorthand per sugar chemistry, and which sugars carry a
        // locked 2'-O,4'-C bridge (LNA/cEt/ENA family).
        const SUGAR_2P = { moe: 'MOE', mo: 'MOE', ome: 'OMe', m: 'OMe', dna: 'H', d: 'H', 'me-d': 'H', rna: 'OH', r: 'OH', fana: 'F', f: 'F', lna: 'LNA', bna: 'LNA', cet: 'cEt', ena: 'ENA' };
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
        const SUGAR_PER = 34;
        const sugarMode = per >= SUGAR_PER && !opts.thin && !lowDetail;
        const showBase = per >= 11 && !opts.thin && !lowDetail;
        for (let i = 0; i < n; i++) {
            const cx = x0 + (i + 0.5) * per;
            if (cx < visMin || cx > visMax) continue;   // off-screen residue — skip
            const mo = monos[i] || {};
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
        'gapmer.detailed': createIon((graph, xs, xf, y, color, structure) => {
            drawAsoPolymer(graph, xs, xf, y, color || GX.sirna, structure, { thin: true, gapmerDefault: true });
        }),
        'gapmer': createIon((graph, xs, xf, y, color, structure) => {
            drawAsoPolymer(graph, xs, xf, y, color || GX.sirna, structure, { thin: false, gapmerDefault: true });
            // GalNAc conjugate annotation (if the HELM carries a CHEM1 conjugate).
            if (structure) {
                if (structure.indexOf('CHEM1,RNA1,1:R1-1:R1') > 0 || structure.indexOf('RNA1,CHEM1,1:R1-1:R1') > 0) {
                    graph.drawString("GalNAc", xs - 3, y, GX.ink, font)
                } else if (structure.indexOf('CHEM1,RNA1') > 0 || structure.indexOf('RNA1,CHEM1') > 0) {
                    graph.drawString("GalNAc", xf, y, GX.ink, font)
                }
            }
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
        'aso.detailed': createIon((graph, xs, xf, y, color, structure) => {
            drawAsoPolymer(graph, xs, xf, y, color || GX.aso, structure, { thin: true });
        }),
        // Zoomed IN / detailed view (called as shapeFunction when screencell > 1): the full 3D
        // polymer schematic — shaded sugar beads (by 2'-modification), base letters, and
        // chemistry-colored linkages (phosphorothioate vs phosphodiester).
        'aso': createIon((graph, xs, xf, y, color, structure) => {
            drawAsoPolymer(graph, xs, xf, y, color || GX.aso, structure, { thin: false });
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
