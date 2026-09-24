function () {
    // A professional vertical 3D cylinder marking a start (green) / stop (red) codon.
    // Stands as a small shaded pillar centered on the annotation, with elliptical caps,
    // a specular highlight and a soft drop shadow.
    // What the TRACK being drawn wants shown. baja/bio/track.js publishes this on the graph
    // before drawing its annotations, because these shape functions are handed the graph and
    // never the track. Absent means show, so a graph that never set it behaves as before.
    // What the TRACK being drawn is themed as. baja/bio/track.js publishes this on the graph
    // alongside __trackDisplay, for the same reason: these shape functions are handed the graph
    // and never the track. Absent means the old fixed scheme, so a graph that never set it
    // behaves exactly as before.
    //
    // Without this, a themed track drew its gene body in the theme and every annotation ON it
    // in one hard-coded palette -- and on the dark themes that meant near-black leaders, labels
    // and domain marks on near-black paper.
    const __theme = (graph) => {
        try { return (graph && graph.__trackTheme) || null; } catch (e) { return null; }
    };
    // The theme's INK: leader lines, callout text, outlines -- everything whose job is to be
    // read against the paper.
    const __ink = (graph) => {
        const t = __theme(graph);
        return (t && t.ink) || __ink(graph);
    };
    // One annotation color by name, from the theme-derived palette track.js publishes.
    const __ann = (graph, key, fallback) => {
        try {
            const a = graph && graph.__trackAnn;
            return (a && a[key]) || fallback;
        } catch (e) { return fallback; }
    };

    const __show = (graph, key) => {
        try {
            const d = graph && graph.__trackDisplay;
            return !d || d[key] !== false;
        } catch (e) { return true; }
    };

    const drawCodonCylinder = (graph, tgraph, xs, xf, y, kind) => {
        if (!__show(graph, 'tssStop')) return;   // TSS / stop codon
        const screencell = graph.screenWidth(tgraph.screenWidth(1));
        // No zoom-out cull: the start/stop pillar is a FIXED screen size, so keep it visible
        // even when zoomed way out (it was previously hidden below 0.05 px/base).
        const isStart = (kind === 'start');
        const base = isStart ? [46, 158, 68] : [209, 52, 47];   // green / red
        const rgb = (a) => 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')';
        const shade = (a, f) => rgb(a.map((v) => Math.max(0, Math.min(255, Math.round(v + f * 255)))));
        const cx = graph.X((xs + xf) / 2);
        const cy = graph.Y(y);
        const ctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
        if (!ctx) {
            try { graph.drawScreenLine(cx, cy - 13, cx, cy + 13, rgb(base), 4, 'butt'); } catch (e) { }
            return;
        }
        const rx = 5, ryCap = 2.2, half = 13;
        const top = cy - half, bot = cy + half;
        ctx.save();
        // Drop shadow behind the pillar.
        ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
        // Bottom cap (darker), sits behind the body.
        ctx.beginPath(); ctx.ellipse(cx, bot, rx, ryCap, 0, 0, Math.PI * 2); ctx.fillStyle = shade(base, -0.3); ctx.fill();
        // Cylinder body with a horizontal dark→light→dark gradient (round look).
        const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
        g.addColorStop(0, shade(base, -0.32)); g.addColorStop(0.45, shade(base, 0.4)); g.addColorStop(1, shade(base, -0.32));
        ctx.beginPath(); ctx.rect(cx - rx, top, rx * 2, half * 2); ctx.fillStyle = g; ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        // Side edges.
        ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.moveTo(cx - rx, top); ctx.lineTo(cx - rx, bot); ctx.moveTo(cx + rx, top); ctx.lineTo(cx + rx, bot); ctx.stroke();
        // Top cap (lighter elliptical lid).
        const cg = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
        cg.addColorStop(0, shade(base, 0.08)); cg.addColorStop(0.5, shade(base, 0.5)); cg.addColorStop(1, shade(base, 0.08));
        ctx.beginPath(); ctx.ellipse(cx, top, rx, ryCap, 0, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill(); ctx.stroke();
        // Specular highlight stripe.
        ctx.beginPath(); ctx.moveTo(cx - rx * 0.45, top + 2); ctx.lineTo(cx - rx * 0.45, bot - 2); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
        ctx.restore();
        // Label above the pillar when there's room.
        if (graph.drawScreenText && screencell > 3) {
            try { graph.drawScreenText(isStart ? 'START' : 'STOP', cx, top - 5, shade(base, -0.12), 9, 'center'); } catch (e) { }
        }
    };

    // ---------------------------------------------------------------------------------------
    // CDD functional-site glyphs. NCBI's Conserved Domain Database annotates a fixed vocabulary
    // of functional SITES on a protein (active sites, binding sites, interfaces, modification
    // sites, …). protein-domains.js classifies each site's title into one of the categories
    // below and creates an annotation of type 'cdd-<category>'; each category draws a distinct
    // fixed-size icon (shape + color) on a short stem above the track so the different site
    // kinds are visually distinguishable at a glance. Nearby sites stack by their label lane
    // (assigned in track.add) so their icons/labels don't collide on the X axis.
    const CDD_SITE_STYLES = {
        active: { color: '#e11d48', icon: 'circledot', tag: 'AS' },
        catalytic: { color: '#ea580c', icon: 'star', tag: 'CAT' },
        substrate: { color: '#0d9488', icon: 'triangle', tag: 'SUB' },
        nucleotide: { color: '#7c3aed', icon: 'diamond', tag: 'NTP' },
        metal: { color: '#ca8a04', icon: 'hexagon', tag: 'M' },
        dna: { color: '#2563eb', icon: 'square', tag: 'NA' },
        interface: { color: '#475569', icon: 'doublecircle', tag: 'IF' },
        inhibitor: { color: '#9f1239', icon: 'triangledown', tag: 'INH' },
        cofactor: { color: '#c026d3', icon: 'pentagon', tag: 'COF' },
        modification: { color: '#d97706', icon: 'cross', tag: 'MOD' },
        cleavage: { color: '#1f2937', icon: 'notch', tag: 'CLV' },
        ion: { color: '#0891b2', icon: 'smallsquare', tag: 'ION' },
        peptide: { color: '#16a34a', icon: 'chevron', tag: 'PEP' },
        other: { color: '#6b7280', icon: 'circle', tag: '' },
    };

    const drawCddGlyph = (ctx, kind, cx, cy, r, color) => {
        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (kind === 'circledot') {
            ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2); ctx.fill();
        } else if (kind === 'triangle') {
            ctx.moveTo(cx, cy - r); ctx.lineTo(cx - r, cy + r * 0.82); ctx.lineTo(cx + r, cy + r * 0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (kind === 'triangledown') {
            ctx.moveTo(cx, cy + r); ctx.lineTo(cx - r, cy - r * 0.82); ctx.lineTo(cx + r, cy - r * 0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (kind === 'diamond') {
            ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (kind === 'square') {
            ctx.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7); ctx.fill(); ctx.stroke();
        } else if (kind === 'smallsquare') {
            ctx.rect(cx - r * 0.68, cy - r * 0.68, r * 1.36, r * 1.36); ctx.fill(); ctx.stroke();
        } else if (kind === 'hexagon') {
            for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
            ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (kind === 'pentagon') {
            for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
            ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (kind === 'star') {
            for (let i = 0; i < 10; i++) { const rr = (i % 2) ? r * 0.45 : r; const a = -Math.PI / 2 + i * Math.PI / 5; const px = cx + rr * Math.cos(a), py = cy + rr * Math.sin(a); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
            ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (kind === 'cross') {
            const w = r * 0.42; ctx.rect(cx - w, cy - r, w * 2, r * 2); ctx.rect(cx - r, cy - w, r * 2, w * 2); ctx.fill(); ctx.stroke();
        } else if (kind === 'doublecircle') {
            ctx.arc(cx - r * 0.5, cy, r * 0.72, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx + r * 0.5, cy, r * 0.72, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (kind === 'chevron') {
            ctx.lineWidth = 2.2; ctx.strokeStyle = color; ctx.moveTo(cx - r, cy - r * 0.55); ctx.lineTo(cx, cy + r * 0.65); ctx.lineTo(cx + r, cy - r * 0.55); ctx.stroke();
        } else if (kind === 'notch') {
            ctx.lineWidth = 2.2; ctx.strokeStyle = color; ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx, cy + r * 0.25); ctx.lineTo(cx + r, cy - r); ctx.stroke();
        } else {   // 'circle' / fallback
            ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
    };

    // Draw one CDD functional site: a stem from the track up to its glyph, a short TAG code
    // (so the many site kinds stay distinguishable even where icons repeat — GEF / Mg / PLP / …),
    // and the full site name when zoomed in. The full style ({color,icon,tag,label}) is resolved
    // from the CDD vocabulary at creation and stored on the annotation as `__cdd`
    // (protein-domains.js); `catKey` is only a legacy fallback into CDD_SITE_STYLES.
    const drawCddSite = (graph, tgraph, xs, xf, y, annotation, catKey) => {
        if (!__show(graph, 'domains')) return;   // protein domains (CDD)
        // Don't draw CDD sites that sit below track y-position 0.25 (lower part of the track).
        if ((+(annotation && annotation.y) || 0) > 0.25) return;
        const st = (annotation && annotation.__cdd) || CDD_SITE_STYLES[catKey] || CDD_SITE_STYLES.other;
        const cx = graph.X((xs + xf) / 2);
        const cyTrack = graph.Y(tgraph.Y(0.03));
        const lane = Math.max(0, (annotation.__labelLane | 0));
        const r = 4.5;
        // Sit the glyph ABOVE the peptide/amino-acid sequence row so it never overlaps the
        // residue letters. track.js draws that row ~ (seqPx + gap) px above the track baseline,
        // with seqPx ≈ min(screencell*0.8, 44) once the sequence is visible (screencell > 5).
        const screencell = graph.screenWidth(tgraph.screenWidth(1));
        let pepClear = 0;
        // if (screencell > 5) { pepClear = Math.max(11, Math.min(Math.round(screencell * 0.8), 44)) + 12; }
        const anchorY = cyTrack - pepClear;
        // Keep the whole glyph + label stack WITHIN the track's screen height so it never spills
        // into the neighbouring track. The per-track recheck (track.js) scales __laneStepPx so all
        // lanes fit; clamp here as a failsafe against the track shrinking between rechecks.
        const trackHpx = Math.abs(graph.screenHeight ? graph.screenHeight(tgraph.height) : 46) || 46;
        const base = (annotation.__laneBasePx != null) ? annotation.__laneBasePx : 12;
        const step = (annotation.__laneStepPx != null) ? annotation.__laneStepPx : 16;
        let up = base + lane * step;
        const maxUp = Math.max(8, trackHpx - pepClear - 4);
        if (up > maxUp) up = maxUp;
        const gy = anchorY - up;
        const ctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
        if (!ctx) {
            try { graph.drawScreenLine(cx, cyTrack, cx, gy, st.color, 1, 'butt'); } catch (e) { }
            return;
        }
        // Transparent, category-colored box capturing the NUCLEOTIDE span [xs, xf] this annotation
        // covers — drawn first (behind the glyph/letters), no border, so it just tints the region.
        try {
            const __bx0 = Math.min(graph.X(xs), graph.X(xf));
            const __bx1 = Math.max(graph.X(xs), graph.X(xf));
            let __byT = graph.Y(tgraph.Y(tgraph.getymax()));
            let __byB = graph.Y(tgraph.Y(tgraph.getymin()));
            if (isFinite(__byT) && isFinite(__byB)) {
                const __ry = Math.min(__byT, __byB), __rh = Math.abs(__byB - __byT);
                const __rw = Math.max(1, __bx1 - __bx0);
                ctx.save();
                ctx.globalAlpha = 0.12;
                ctx.fillStyle = st.color;
                ctx.fillRect(__bx0, __ry, __rw, __rh);
                ctx.restore();
            }
        } catch (e) { }
        ctx.save();
        // Dashed, very thin, faint light-gray leader from the glyph DOWN to the amino-acid letter
        // it refers to (the peptide row, published by track.js) — not all the way to the track
        // baseline. Falls back to the baseline when the sequence isn't visible.
        let footY = cyTrack;
        if (screencell > 5 && tgraph && tgraph.__pepTopPx != null) footY = tgraph.__pepTopPx;
        ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.lineWidth = 1.0;
        try { ctx.setLineDash([2, 2]); } catch (e) { }
        ctx.beginPath(); ctx.moveTo(cx, footY); ctx.lineTo(cx, gy + r); ctx.stroke();
        try { ctx.setLineDash([]); } catch (e) { }
        ctx.restore();
        // If this site spans a REGION (e.g. a merged run of residues), draw a solid bracket across
        // its FULL sequence extent [xs, xf] so the annotation visibly covers the entire space its
        // originals occupied. It sits at anchorY — ABOVE the peptide/AA row (by pepClear), so it
        // stays clear of and visible above the residue letters, especially zoomed in (detail mode).
        const __sx0 = Math.min(graph.X(xs), graph.X(xf));
        const __sx1 = Math.max(graph.X(xs), graph.X(xf));
        if (__sx1 - __sx0 > 4) {
            const __bracketY = anchorY;
            ctx.save();
            try { ctx.setLineDash([]); } catch (e) { }
            ctx.strokeStyle = st.color; ctx.globalAlpha = 0.85; ctx.lineWidth = 2; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(__sx0, __bracketY); ctx.lineTo(__sx1, __bracketY);
            ctx.moveTo(__sx0, __bracketY - 3.5); ctx.lineTo(__sx0, __bracketY + 3.5);
            ctx.moveTo(__sx1, __bracketY - 3.5); ctx.lineTo(__sx1, __bracketY + 3.5);
            ctx.stroke();
            ctx.restore();
        }
        drawCddGlyph(ctx, st.icon, cx, gy, r, st.color);
        // The site NAME sits at the TOP END of the dashed leader, centered above the glyph (with
        // a short color tag prefix so the family is still obvious). Skipped if its box would
        // overlap a name already drawn this frame (shared list on the tgraph).
        const name = ('' + (annotation.name || st.label || st.tag || 'site'));
        const label = (name).slice(0, 46);
        const lyName = gy - r - 6;
        let lw = label.length * 4.8;
        try { ctx.font = '8.5px system-ui, -apple-system, Roboto, Arial, sans-serif'; lw = ctx.measureText(label).width; } catch (e) { }
        const nrects = (tgraph.__labelRects = tgraph.__labelRects || []);
        const nx0 = cx - lw / 2 - 1, nx1 = cx + lw / 2 + 1, ny0 = lyName - 6, ny1 = lyName + 6;
        let nov = false;
        for (const rr of nrects) { if (nx0 < rr.x1 && nx1 > rr.x0 && ny0 < rr.y1 && ny1 > rr.y0) { nov = true; break; } }
        if (!nov) {
            nrects.push({ x0: nx0, y0: ny0, x1: nx1, y1: ny1 });
            try { graph.drawScreenText(label, cx, lyName, st.color, 8.5, 'center'); } catch (e) { }
        }
    };

    // Single shared CDD-site shape (style read from annotation.__cdd) plus legacy per-category
    // aliases, all routed through drawCddSite.
    const cddShape = (catKey) => createIon((graph, tgraph, xs, xf, y, color, annotation) => drawCddSite(graph, tgraph, xs, xf, y, annotation, catKey));

    // ---- PASTED-TEXT ITEMS: the marker and card for the "pasted_text" track layer ----------------
    //
    // An ASO target or a residue the pasted text calls out. NOT a mutation, so it must not read
    // as one: a SNP is a round lollipop "button" on a black stem with a red/white face, and
    // its callout is a white panel with a red/green/amber rail. This is an INDIGO (residue) or
    // TEAL (ASO) highlight band laid over the codon, a diamond pin standing off it, and a card
    // whose header is the residue itself.
    //
    // Two levels of detail, because the same item has to work zoomed out over a whole gene and
    // zoomed in on a codon:
    //   far    the band, the pin and a small label pill ("Tyr122")
    //   near   the whole card: heading, what the residue is, what the text says it does, the
    //          sentence itself (in full) with the residue's own name picked out in it, and where
    //          it came from.
    // Everything is drawn in SCREEN pixels so the text is the same size at any zoom, and the card
    // registers its box in graph.__annoBoxes -- the per-frame list the SNP callouts already
    // avoid -- so the two kinds never sit on top of each other.
    const __PT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    const __PT_AA = {
        A: 'Alanine', R: 'Arginine', N: 'Asparagine', D: 'Aspartic acid', C: 'Cysteine', Q: 'Glutamine',
        E: 'Glutamic acid', G: 'Glycine', H: 'Histidine', I: 'Isoleucine', L: 'Leucine', K: 'Lysine',
        M: 'Methionine', F: 'Phenylalanine', P: 'Proline', S: 'Serine', T: 'Threonine', W: 'Tryptophan',
        Y: 'Tyrosine', V: 'Valine'
    };
    const __ptRound = (ctx, x, y, w, h, r) => {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    };
    // Word-wrap a sentence into lines of {t, hit} words. `hits` are lowercase spellings of the
    // residue's own name ("tyr122", "y122") -- those words are set bold, in the accent color.
    const __ptWrap = (ctx, text, hits, fontN, fontB, maxW, maxLines) => {
        const words = ('' + (text || '')).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        if (!words.length) return [];
        ctx.font = fontN;
        const spaceW = ctx.measureText(' ').width;
        const lines = [];
        let cur = [], curW = 0;
        const push = () => { if (cur.length) lines.push(cur); cur = []; curW = 0; };
        for (const w of words) {
            const core = w.replace(/^[("'\[]+|[)\]"'.,;:]+$/g, '').toLowerCase();
            const hit = hits.indexOf(core) >= 0;
            ctx.font = hit ? fontB : fontN;
            const ww = ctx.measureText(w).width;
            if (cur.length && curW + spaceW + ww > maxW) push();
            cur.push({ t: w, hit, w: ww });
            curW += (cur.length > 1 ? spaceW : 0) + ww;
        }
        push();
        if (lines.length > maxLines) {
            lines.length = maxLines;
            const last = lines[maxLines - 1];
            // Lose whole words from the end until the ellipsis fits on the line.
            ctx.font = fontN;
            const ellW = ctx.measureText('…').width;
            let tot = 0; for (const x of last) tot += x.w + spaceW;
            while (last.length > 1 && tot + ellW > maxW) { const x = last.pop(); tot -= x.w + spaceW; }
            last[last.length - 1] = { t: last[last.length - 1].t.replace(/[.,;:]+$/, '') + '…', hit: last[last.length - 1].hit, w: last[last.length - 1].w + ellW };
        }
        return lines;
    };

    const __pastedTextGlyph = (graph, tgraph, xs, xf, y, color, an) => {
        const ctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
        if (!ctx || !an) return;
        const cw = ctx.canvas.width, ch = ctx.canvas.height;
        const sx0 = graph.X(xs), sx1 = graph.X(xf), sy = graph.Y(y);
        if (!isFinite(sx0) || !isFinite(sx1) || !isFinite(sy)) return;
        const mid = (sx0 + sx1) / 2;
        if (mid < -330 || mid > cw + 330 || sy < -60 || sy > ch + 60) return;   // a card hangs ~300px to one side

        const accent = an.color || '#4f46e5';
        const label = '' + (an.name || '');
        const gene = '' + (an.gene || '');
        const isAso = an.kind === 'aso';

        // Bases in view are drawn as letters only from 5px a base up (Track.draw), and it is only
        // then that the peptide row exists and its position is published.
        let cellPx = 0;
        try { cellPx = Math.abs(graph.screenWidth(tgraph.screenWidth(1))); } catch (e) { cellPx = 0; }

        // ---- the marker on the track: a band over the residue, a pin standing off it ---------
        //
        // WHERE the residue is drawn: baja/bio/track.js publishes how far above the track's
        // baseline the codon-number row (__pepIndexTopUpPx) and the amino-acid letters
        // (__pepMidUpPx) sit. OFFSETS, added here to THIS frame's baseline (sy): a screen y saved
        // from an earlier frame is wrong as soon as the view pans or zooms, and the layers are
        // drawn before the track's own peptide pass, so an absolute value is always at least a
        // frame old -- the markers were left floating where the track used to be. The band spans
        // from the top of the number to the bottom of the letter, so it reads as a highlighter
        // over "122 / Y", and the letters and numbers, which the track draws AFTER its layers,
        // sit on top of it rather than painting over something of ours. The pin and the card
        // stand above that. Zoomed out (no letters) or before the track has drawn them, the band
        // is a strip on the baseline.
        const bandW = Math.max(9, Math.abs(sx1 - sx0));
        let bandTop = sy - 7.5, bandBot = sy + 7.5;
        try {
            if (cellPx > 5) {
                const upIdx = +tgraph.__pepIndexTopUpPx, upMid = +tgraph.__pepMidUpPx;
                if (isFinite(upIdx) && isFinite(upMid) && upIdx > upMid && upIdx < 240) {
                    bandTop = sy - upIdx - 3;
                    bandBot = sy - upMid + 5;
                }
            }
        } catch (e) { }
        const bandH = bandBot - bandTop;
        const pinY = bandTop - 12;                    // centre of the diamond
        ctx.save();
        ctx.globalAlpha = 1; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        try { ctx.setLineDash([]); } catch (e) { }
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        // band
        ctx.globalAlpha = 0.2; ctx.fillStyle = accent;
        __ptRound(ctx, mid - bandW / 2, bandTop, bandW, bandH, 3); ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
        __ptRound(ctx, mid - bandW / 2 + 0.75, bandTop + 0.75, bandW - 1.5, bandH - 1.5, 3); ctx.stroke();
        // stem, then the diamond
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(mid, bandTop); ctx.lineTo(mid, pinY + 6); ctx.stroke();
        const dia = (r) => { ctx.beginPath(); ctx.moveTo(mid, pinY - r); ctx.lineTo(mid + r, pinY); ctx.lineTo(mid, pinY + r); ctx.lineTo(mid - r, pinY); ctx.closePath(); };
        ctx.shadowColor = 'rgba(15,23,42,0.28)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
        dia(7); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        dia(7); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
        dia(3.2); ctx.fillStyle = accent; ctx.fill();
        ctx.restore();

        // ---- how much to show --------------------------------------------------------------
        const near = cellPx >= 2.5 || an.highlighted;
        const label11 = '700 11px ' + __PT_FONT;

        if (!near) {
            // far: the name on a small pill beside the pin, nothing more.
            ctx.save();
            ctx.font = label11; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
            const tw = ctx.measureText(label).width;
            const pw = tw + 14, ph = 17;
            const px = (mid < cw * 0.7) ? mid + 12 : mid - 12 - pw;
            ctx.fillStyle = accent; __ptRound(ctx, px, pinY - ph / 2, pw, ph, ph / 2); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.fillText(label, px + 7, pinY + 0.5);
            ctx.restore();
            return;
        }

        // ---- near: the card ------------------------------------------------------------------
        const FN = '11.5px ' + __PT_FONT, FB = '700 11.5px ' + __PT_FONT, FR = '600 11.5px ' + __PT_FONT;
        const FG = '600 13px ' + __PT_FONT, FM = '10.5px ' + __PT_FONT, FF = '600 8.5px ' + __PT_FONT;
        const maxW = 300, padX = 13, padY = 11, rail = 4, radius = 8;

        // The layout is expensive (measuring every word) and never changes for one item, so it
        // is kept on the item. A leading underscore keeps it out of a saved document.
        const key = [label, gene, an.role, an.comment, an.description, an.meta].join('␟');
        let L = an.__ptLayout;
        if (!L || L.key !== key) {
            const hits = [];
            const m = label.match(/^([A-Za-z]{3})(\d+)$/);
            if (m) {
                hits.push(label.toLowerCase());
                const one = an.aa1 || '';
                if (one) hits.push((one + m[2]).toLowerCase());
            }
            let role = ('' + (an.role || '')).trim();
            role = role.charAt(0).toUpperCase() + role.slice(1);   // the model returns it in lower case
            const bodyText = ('' + (an.comment || an.description || '')).trim();
            L = {
                key,
                role: role ? __ptWrap(ctx, role, hits, FR, FR, maxW, 2) : [],
                body: bodyText ? __ptWrap(ctx, bodyText, hits, FN, FB, maxW, 8) : [],
                meta: ('' + (an.meta || (an.aa1 && an.pos ? ((__PT_AA[an.aa1] || an.aa1) + ' (' + an.aa1 + ') \u00b7 residue ' + an.pos) : ''))).trim()
            };
            an.__ptLayout = L;
        }
        ctx.save();
        ctx.globalAlpha = 1; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        try { ctx.setLineDash([]); } catch (e) { }
        ctx.font = label11;
        const pillW = ctx.measureText(label).width + 16, pillH = 19;
        ctx.font = FG;
        const geneW = gene ? ctx.measureText(gene).width : 0;
        ctx.font = FM;
        const metaW = L.meta ? ctx.measureText(L.meta).width : 0;
        let contentW = Math.max(pillW + (gene ? 9 + geneW : 0), metaW);
        for (const ln of L.role.concat(L.body)) { let w = 0; for (const x of ln) w += x.w; w += (ln.length - 1) * 3.2; contentW = Math.max(contentW, w); }
        contentW = Math.min(maxW, Math.max(contentW, 150));
        const bw = Math.ceil(contentW) + padX * 2 + rail;
        const LH = 16.5, RH = 15.5;
        let bh = padY * 2 + pillH + (L.meta ? 16 : 0);
        if (L.role.length || L.body.length) bh += 9;                       // rule + gap
        bh += L.role.length * RH + (L.role.length && L.body.length ? 4 : 0) + L.body.length * LH;
        bh += 14;                                                            // footer

        const side = (mid < cw * 0.62) ? 1 : -1;
        let bx = side > 0 ? mid + 18 : mid - 18 - bw;
        bx = Math.max(6, Math.min(bx, cw - bw - 6));
        const used = (graph.__annoBoxes = graph.__annoBoxes || []);
        const clash = (yy0) => used.some((r) => !(bx + bw < r.x - 5 || bx > r.x + r.w + 5 || yy0 + bh < r.y - 5 || yy0 > r.y + r.h + 5));
        // Above the pin first, stacking upward past whatever is already there (SNP callouts and
        // other cards share this list). If that runs out of canvas, take the space BELOW the
        // track instead, stacking downward -- rather than clamping to the top edge and landing
        // on top of the cards already there.
        let by = pinY - 16 - bh, guard = 0;
        while (guard++ < 40 && clash(by)) by -= (bh + 8);
        if (by < 6) {
            let below = sy + 34; guard = 0;
            while (guard++ < 40 && clash(below)) below += (bh + 8);
            if (below + bh <= ch - 6) by = below;
        }
        by = Math.max(6, Math.min(by, ch - bh - 6));
        used.push({ x: bx, y: by, w: bw, h: bh });
        const cardAbove = (by + bh) <= sy;

        // leader: from the pin to the card -- an elbow rather than a diagonal across a busy track
        const anchorX = Math.max(bx + 16, Math.min(mid, bx + bw - 16));
        ctx.strokeStyle = accent; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.25; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        if (cardAbove) {
            const foot = by + bh;
            const elbowY = Math.min(pinY - 9, foot + 10);
            ctx.moveTo(mid, pinY - 7);
            if (elbowY < pinY - 7) { ctx.lineTo(mid, elbowY); ctx.lineTo(anchorX, foot); } else ctx.lineTo(anchorX, foot);
        } else {
            // the card is under the track: leave from the band's foot instead of the pin
            const top = by, startY = bandBot;
            const elbowY = Math.max(startY + 8, top - 10);
            ctx.moveTo(mid, startY);
            if (elbowY > startY + 8) { ctx.lineTo(mid, elbowY); ctx.lineTo(anchorX, top); } else ctx.lineTo(anchorX, top);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        // panel
        ctx.shadowColor = 'rgba(15,23,42,0.24)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
        ctx.fillStyle = 'rgba(255,255,255,0.985)';
        __ptRound(ctx, bx, by, bw, bh, radius); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.globalAlpha = 0.38; ctx.strokeStyle = accent; ctx.lineWidth = 1;
        __ptRound(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, radius); ctx.stroke();
        ctx.globalAlpha = 1;
        // accent rail, clipped to the corner radius
        ctx.save(); __ptRound(ctx, bx, by, bw, bh, radius); ctx.clip();
        ctx.fillStyle = accent; ctx.fillRect(bx, by, rail, bh);
        ctx.restore();

        const x = bx + rail + padX;
        let yy = by + padY;
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        // header: the residue on a pill, the gene beside it
        ctx.fillStyle = accent; __ptRound(ctx, x, yy, pillW, pillH, pillH / 2); ctx.fill();
        ctx.font = label11; ctx.fillStyle = '#ffffff'; ctx.fillText(label, x + 8, yy + pillH / 2 + 0.5);
        if (gene) { ctx.font = FG; ctx.fillStyle = '#0f172a'; ctx.fillText(gene, x + pillW + 9, yy + pillH / 2 + 0.5); }
        yy += pillH;
        if (L.meta) { yy += 3; ctx.font = FM; ctx.fillStyle = '#64748b'; ctx.fillText(L.meta, x, yy + 6.5); yy += 13; }
        if (L.role.length || L.body.length) {
            yy += 4;
            ctx.globalAlpha = 0.5; ctx.fillStyle = '#cbd5e1'; ctx.fillRect(x, yy, bw - rail - padX * 2, 1); ctx.globalAlpha = 1;
            yy += 5;
        }
        const drawLines = (lines, fontN, fontB, fillN, fillB, lh) => {
            for (const ln of lines) {
                let cx = x;
                for (const wd of ln) {
                    ctx.font = wd.hit ? fontB : fontN;
                    ctx.fillStyle = wd.hit ? fillB : fillN;
                    ctx.fillText(wd.t, cx, yy + lh / 2);
                    ctx.font = fontN;
                    cx += wd.w + ctx.measureText(' ').width;
                }
                yy += lh;
            }
        };
        drawLines(L.role, FR, FR, '#0f172a', '#0f172a', RH);
        if (L.role.length && L.body.length) yy += 4;
        drawLines(L.body, FN, FB, '#475569', accent, LH);
        // where it came from
        yy += 3;
        ctx.font = FF; ctx.fillStyle = '#94a3b8';
        try { ctx.letterSpacing = '0.8px'; } catch (e) { }
        ctx.fillText(isAso ? 'ASO TARGET · FROM PASTED TEXT' : 'FROM PASTED TEXT', x, yy + 5);
        try { ctx.letterSpacing = '0px'; } catch (e) { }
        ctx.restore();
    };

    return {
        'cdd-site': cddShape(null),
        'cdd-active': cddShape('active'),
        'cdd-catalytic': cddShape('catalytic'),
        'cdd-substrate': cddShape('substrate'),
        'cdd-nucleotide': cddShape('nucleotide'),
        'cdd-metal': cddShape('metal'),
        'cdd-dna': cddShape('dna'),
        'cdd-interface': cddShape('interface'),
        'cdd-inhibitor': cddShape('inhibitor'),
        'cdd-cofactor': cddShape('cofactor'),
        'cdd-modification': cddShape('modification'),
        'cdd-cleavage': cddShape('cleavage'),
        'cdd-ion': cddShape('ion'),
        'cdd-peptide': cddShape('peptide'),
        'cdd-other': cddShape('other'),
        'UserAnnotation': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            color = annotation.color;

            graph.drawVerticalLine(xs, y, 0.13, '#9fe0e8', 0.5)
            graph.drawVerticalLine(xf, y, 0.13, '#9fe0e8', 0.7)

            graph.drawLine(xs, y, xf, y, color, 13, 'butt')

        }),
        'PointOfInterest': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            const col = annotation.color || 'rgba(255,140,26,0.85)';
            graph.drawLine(xs, y, xf, y, col, 14, 'butt');
            graph.drawVerticalLine(xs, y, 0.16, __ink(graph), 0.6);
            graph.drawVerticalLine(xf, y, 0.16, __ink(graph), 0.6);
            const mid = (xs + xf) / 2;
            const ly = y + (annotation.labelY || 0.45);
            graph.drawLine(mid, y, mid, ly, __ink(graph), 0.5, 'butt');
            if (annotation.name) {
                graph.drawString(annotation.name, mid, ly, __ink(graph), 'bold 11px system-ui, -apple-system, Roboto, Arial, sans-serif');
            }
            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)));
            if (screencell > 2 && annotation.description) {
                graph.drawString(('' + annotation.description).slice(0, 90), mid, ly + 0.14, '#365a63', '9px system-ui, -apple-system, Roboto, Arial, sans-serif');
            }
        }),

        // A marker from pasted text (an ASO target, a residue the text calls out) on the
        // "pasted_text" track layer -- see __pastedTextGlyph. Never throws into the track's draw.
        'PastedText': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            try { __pastedTextGlyph(graph, tgraph, xs, xf, y, color, annotation); } catch (e) { }
        }),

        'Acceptor-Splice-Site': createIon((graph, tgraph, xss, xff, __y, color, annotation) => {
            var radius = 10;

            let xs = xss - 1;
            let xf = xff - 1;

            graph.drawVerticalLine(xs, __y, 0.63, '#9fe0e8', 0.5)
            graph.drawVerticalLine(xf, __y, 0.63, '#9fe0e8', 0.7)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();

            if (ctx) {
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4 && __show(graph, 'exonNumbers')) {

                    let x = (graph.X(xs) + graph.X(xf)) / 2;

                    ctx.shadowBlur = 2;
                    ctx.shadowColor = __ink(graph);

                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(x, graph.Y(__y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();
                    ctx.shadowBlur = 0;
                    ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = __ink(graph)

                    ctx.fillText("A", x, graph.Y(__y) + 10);
                    ctx.textAlign = 'left'
                }
            }
        }),
        'Acceptor-Splice-Site.highlight': createIon((graph, tgraph, xss, xff, __y, color, annotation) => {
            var radius = 10;
            let xs = xss - 1;
            let xf = xff - 1;

            graph.drawVerticalLine(xs, __y, 0.63, '#9fe0e8', 0.5)
            graph.drawVerticalLine(xf, __y, 0.63, '#9fe0e8', 0.7)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();

            if (ctx) {
                ctx.shadowBlur = 7;
                ctx.shadowColor = __ink(graph);
                ctx.lineWidth = 3;

                ctx.color = '#1b4a7a'
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4 && __show(graph, 'exonNumbers')) {
                    let x = (graph.X(xs) + graph.X(xf)) / 2;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(x, graph.Y(__y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();
                    ctx.shadowBlur = 0;
                    ctx.lineWidth = 1;

                    ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = __ink(graph)
                    ctx.fillText("A", x, graph.Y(__y) + 10);
                    ctx.textAlign = 'left'

                }
            }
        }),
        'Donor-Splice-Site': createIon((graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss;
            let xf = xff;
            graph.drawLine(xs + ((xf - xs) / 2), y + 0.05, xs + ((xf - xs) / 2), y, 'rgb(200,200,200,0.3)', 3, 'butt')
            graph.drawLine(xs, y, xf, y, 'rgba(78,157,105,0.5)', 10, 'butt')
            graph.drawVerticalLine(xs, y, 0.13, __ann(graph, 'GX_REGION', '#7a4f66'), 0.7)
            graph.drawVerticalLine(xf, y, 0.13, __ann(graph, 'GX_REGION', '#7a4f66'), 0.4)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();
            if (ctx) {
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4 && __show(graph, 'exonNumbers')) {
                    let x = (graph.X(xs) + graph.X(xf)) / 2;
                    ctx.lineWidth = 1;
                    ctx.shadowBlur = 3;
                    ctx.shadowColor = __ink(graph);

                    ctx.beginPath();
                    ctx.arc(x, graph.Y(y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();

                    ctx.shadowBlur = 0;

                    ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = __ink(graph)

                    ctx.fillText('D', x, graph.Y(y) + 10);
                }
            }
        }),
        'Donor-Splice-Site.highlight': createIon((graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss;
            let xf = xff;
            graph.drawLine(xs + ((xf - xs) / 2), y + 0.05, xs + ((xf - xs) / 2), y, 'rgb(200,200,200,0.3)', 3, 'butt')
            graph.drawLine(xs, y, xf, y, 'rgba(78,157,105,0.5)', 10, 'butt')
            graph.drawVerticalLine(xs, y, 0.13, __ann(graph, 'GX_REGION', '#7a4f66'), 0.7)
            graph.drawVerticalLine(xf, y, 0.13, __ann(graph, 'GX_REGION', '#7a4f66'), 0.4)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();
            if (ctx) {
                ctx.shadowBlur = 7;
                ctx.shadowColor = __ink(graph);
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4 && __show(graph, 'exonNumbers')) {
                    let x = (graph.X(xs) + graph.X(xf)) / 2;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(x, graph.Y(y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();

                    ctx.shadowBlur = 0;

                    ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = __ink(graph)

                    ctx.fillText('D', x, graph.Y(y) + 10);
                }
                ctx.shadowBlur = 0;

            }
        }),

        'Canonical-Donor-Splice-Site': createIon((graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss;
            let xf = xff;

            graph.drawLine(xs + ((xf - xs) / 2), y + 0.05, xs + ((xf - xs) / 2), y, 'rgb(200,200,200,0.6)', 3, 'butt')
            graph.drawLine(xs, y, xf, y, 'rgba(78,157,105,0.45)', 10, 'butt')

            graph.drawVerticalLine(xs, y, 0.63, __ann(graph, 'GX_DEL', '#8c2f42'), 0.5)
            graph.drawVerticalLine(xf, y, 0.63, __ann(graph, 'GX_DEL', '#8c2f42'), 0.5)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();
            if (ctx) {
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4 && __show(graph, 'exonNumbers')) {
                    let x = (graph.X(xs) + graph.X(xf)) / 2;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(x, graph.Y(y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();

                    ctx.shadowBlur = 0;

                    ctx.font = '10px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = __ink(graph)
                    ctx.fillText("Donor", x, graph.Y(y)) + 10;
                }
            }
        }),

        'Exon': createIon((graph, tgraph, xs, xf, yv, color, annotation, strand) => {

            const exonColor = 'rgba(26,163,189,0.85)';   // tropical teal
            const exonWidth = 12;

            // Rounded, cylinder-like exon: a capsule with a vertical tropical-teal
            // gradient (light aqua top -> deep teal bottom) and a specular highlight.
            const drawExonCylinder = (ctx, x1, x2, yc, h) => {
                if (x2 < x1) { const t = x1; x1 = x2; x2 = t; }
                const left = x1, right = Math.max(x2, x1 + 2);
                const r = h / 2;
                const top = yc - r;
                const rr = Math.min(r, (right - left) / 2);
                const path = () => {
                    ctx.beginPath();
                    ctx.moveTo(left + rr, top);
                    ctx.lineTo(right - rr, top);
                    ctx.arc(right - rr, yc, rr, -Math.PI / 2, Math.PI / 2);
                    ctx.lineTo(left + rr, yc + r);
                    ctx.arc(left + rr, yc, rr, Math.PI / 2, -Math.PI / 2);
                    ctx.closePath();
                };
                ctx.save();
                ctx.setLineDash([]);
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                path();
                ctx.clip();
                const g = ctx.createLinearGradient(0, top, 0, yc + r);
                g.addColorStop(0.0, 'rgba(125,226,233,0.95)');   // light aqua top
                g.addColorStop(0.35, 'rgba(38,180,200,0.95)');   // tropical teal
                g.addColorStop(1.0, 'rgba(15,108,130,0.96)');    // deep teal bottom
                ctx.fillStyle = g;
                ctx.fillRect(left, top, right - left, h);
                ctx.fillStyle = 'rgba(255,255,255,0.32)';        // specular highlight band
                ctx.fillRect(left, top + h * 0.13, right - left, h * 0.18);
                ctx.restore();
                ctx.save();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                path();
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(12,92,112,0.55)';
                ctx.stroke();
                ctx.restore();
            };

            {
                const ctx = graph.canvas.getCTX();
                if (ctx) {
                    drawExonCylinder(ctx, graph.X(xs), graph.X(xf + 1), graph.Y(yv), exonWidth + 2);
                } else {
                    graph.drawLine(xs, yv, xf + 1, yv, exonColor, exonWidth, 'butt');
                }
            }

            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)));

            if (annotation.showIndex) {
                const ctx = graph.canvas.getCTX();
                if (ctx) {

                    const small = (annotation.index >= 0 && screencell < 0.52);
                    const radius = small ? 10 : 20;
                    const fontSize = small ? 8 : 15;
                    // Center the badge x on the exon (midpoint of its span). When
                    // zoomed out (small), lift it above the exon so the exon block
                    // doesn't obscure the number; centered on the lane when zoomed in.
                    const x = (graph.X(xs) + graph.X(xf)) / 2;
                    const y = small ? (graph.Y(yv) + (radius + 28)) : graph.Y(yv);

                    // Hide overlapping exon-index badges: if this badge's circle
                    // would collide with the previous badge kept on this track/frame,
                    // skip it entirely (both the circle AND the number) rather than
                    // let numbers and their background circles pile up when zoomed out.
                    // track.js resets graph.__exonBadgeLastX before each track's
                    // exon-draw loop, so the anchor never carries across frames.
                    const minGap = 2 * radius + 3;   // circle diameter + a little pad
                    // Drop this badge if its circle would collide with ANY badge already kept
                    // on this track/frame (not just the previous one). track.js resets the list.
                    const _badgeXs = Array.isArray(graph.__exonBadgeXs) ? graph.__exonBadgeXs : [];
                    if (!isFinite(x) || _badgeXs.some((px) => Math.abs(x - px) < minGap)) {
                        // too close (or invalid) -> drop this badge
                    } else {
                        ctx.save();
                        ctx.setLineDash([]);
                        ctx.shadowBlur = 0;          // don't inherit a leaked drop shadow
                        ctx.shadowColor = 'transparent';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.arc(x, y, radius, 0, 2 * Math.PI);
                        ctx.fillStyle = 'white';     // white background
                        ctx.strokeStyle = __ink(graph); // oval border
                        ctx.lineWidth = 1;
                        ctx.fill();
                        ctx.closePath();
                        ctx.stroke();

                        ctx.font = `${fontSize}px system-ui, -apple-system, Roboto, Arial, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'black';     // black number
                        ctx.fillText('' + annotation.index, x, y);
                        ctx.restore();

                        if (Array.isArray(graph.__exonBadgeXs)) graph.__exonBadgeXs.push(x);  // remember this badge on the track
                    }
                }
            }

        }),

        'Phylon': createIon((graph, tgraph, xs, xf, yv, color, annotation, strand) => {

            const ctx = graph.canvas.getCTX?.();

            const span = (xf - xs);

            const inFrame = (Math.abs(span) % 3) === 0;

            const lineStyle = inFrame
                ? {
                    stroke: 'rgba(78,157,105,0.6)',
                    width: 32,
                    dash: [],
                    cap: 'butt',

                    glow: { color: 'rgba(78,157,105,0.22)', blur: 14 }
                }
                : {
                    stroke: 'rgba(199,125,52,0.6)',
                    width: 26,
                    dash: [10, 8],
                    cap: 'butt',
                    glow: { color: 'rgba(199,125,52,0.2)', blur: 10 }
                };

            const badgeStyle = inFrame
                ? { bg: 'rgba(44, 16, 74, 0.80)' }
                : { bg: 'rgba(70, 35, 10, 0.80)' };

            const screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)));

            function drawRoundedRect(ctx, left, top, w, h, r) {
                const rr = Math.min(r, w / 2, h / 2);
                ctx.beginPath();
                ctx.moveTo(left + rr, top);
                ctx.arcTo(left + w, top, left + w, top + h, rr);
                ctx.arcTo(left + w, top + h, left, top + h, rr);
                ctx.arcTo(left, top + h, left, top, rr);
                ctx.arcTo(left, top, left + w, top, rr);
                ctx.closePath();
            }

            function measureBadge(ctx, text, fontPx, padX, padY) {
                ctx.save();
                ctx.font = `${fontPx}px system-ui, -apple-system, Roboto, Arial, sans-serif`;
                const m = ctx.measureText(text);
                const textW = m.width;
                const textH = Math.max(
                    fontPx,
                    (m.actualBoundingBoxAscent || fontPx) + (m.actualBoundingBoxDescent || 0)
                );
                ctx.restore();
                return { w: textW + padX * 2, h: textH + padY * 2 };
            }

            function drawBadge(ctx, x, y, text, fontPx, opts = {}) {
                const {
                    padX = 8,
                    padY = 5,
                    radius = 8,
                    bg = 'rgba(0,0,0,0.78)',
                    fg = '#FFFFFF',
                    border = 'rgba(255,255,255,0.25)',
                    shadowColor = 'rgba(0,0,0,0.55)',
                    shadowBlur = 8,
                    shadowOffsetX = 2,
                    shadowOffsetY = 2,
                    strokeWidth = 1
                } = opts;

                const { w, h } = measureBadge(ctx, text, fontPx, padX, padY);
                const left = x - w / 2;
                const top = y - h / 2;

                ctx.save();

                ctx.shadowColor = shadowColor;
                ctx.shadowBlur = shadowBlur;
                ctx.shadowOffsetX = shadowOffsetX;
                ctx.shadowOffsetY = shadowOffsetY;

                drawRoundedRect(ctx, left, top, w, h, radius);
                ctx.fillStyle = bg;
                ctx.fill();

                ctx.shadowColor = 'transparent';
                ctx.lineWidth = strokeWidth;
                ctx.strokeStyle = border;
                ctx.stroke();

                ctx.font = `${fontPx}px system-ui, -apple-system, Roboto, Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = fg;
                ctx.fillText(text, x, y);

                ctx.restore();

                return { left, top, right: left + w, bottom: top + h, cx: x, cy: y, w, h };
            }

            function drawConnector(ctx, badgeBox, tx, ty, opts = {}) {
                const {
                    color = 'rgba(0,0,0,0.55)',
                    width = 2,
                    shadowColor = 'rgba(0,0,0,0.35)',
                    shadowBlur = 6,
                    shadowOffsetX = 1,
                    shadowOffsetY = 1,
                    dash = []
                } = opts;

                const dx = tx - badgeBox.cx;
                const dy = ty - badgeBox.cy;

                const halfW = badgeBox.w / 2;
                const halfH = badgeBox.h / 2;

                const txEdge = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
                const tyEdge = dy !== 0 ? halfH / Math.abs(dy) : Infinity;

                const t = Math.min(txEdge, tyEdge);
                const sx = badgeBox.cx + dx * t;
                const sy = badgeBox.cy + dy * t;

                ctx.save();
                ctx.setLineDash(dash);
                ctx.lineCap = 'round';
                ctx.lineWidth = width;

                ctx.shadowColor = shadowColor;
                ctx.shadowBlur = shadowBlur;
                ctx.shadowOffsetX = shadowOffsetX;
                ctx.shadowOffsetY = shadowOffsetY;

                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(tx, ty);
                ctx.stroke();

                ctx.restore();
            }

            if (ctx) {
                const x1 = graph.X(xs);
                const x2 = graph.X(xf + 1);
                const y = graph.Y(yv);

                ctx.save();
                ctx.setLineDash(lineStyle.dash);
                ctx.lineCap = lineStyle.cap;
                ctx.lineWidth = lineStyle.width;

                if (lineStyle.glow) {
                    ctx.shadowColor = lineStyle.glow.color;
                    ctx.shadowBlur = lineStyle.glow.blur;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                }

                ctx.strokeStyle = lineStyle.stroke;
                ctx.beginPath();
                ctx.moveTo(x1, y);
                ctx.lineTo(x2, y);
                ctx.stroke();
                ctx.restore();
            } else {

                graph.drawLine(xs, yv, xf + 1, yv, lineStyle.stroke, lineStyle.width, 'butt');
            }

            if (ctx) {
                const lineCx = (graph.X(xs) + graph.X(xf)) / 2;
                const lineCy = graph.Y(yv);

                const scoreRaw =
                    (annotation?.annotations !== undefined && annotation?.annotations !== null)
                        ? `${annotation.annotations}`
                        : '—';

                const score = `${scoreRaw}${inFrame ? '' : 'shft'}`;

                if (annotation?.index >= 0 && screencell < 0.52) {
                    const bx = lineCx;
                    const by = graph.Y(yv - 0.5) + 10;

                    const badgeBox = drawBadge(ctx, bx, by, score, 9, {
                        padX: 7,
                        padY: 4,
                        radius: 7,
                        bg: badgeStyle.bg,
                        fg: '#FFFFFF',
                        shadowBlur: 10
                    });

                    drawConnector(ctx, badgeBox, lineCx, lineCy, {
                        color: 'rgba(0,0,0,0.60)',
                        width: 2,
                        dash: inFrame ? [] : [4, 6]
                    });
                } else {
                    const bx = lineCx;
                    const by = lineCy - 28;

                    const badgeBox = drawBadge(ctx, bx, by, score, 14, {
                        padX: 10,
                        padY: 7,
                        radius: 10,
                        bg: badgeStyle.bg,
                        fg: '#FFFFFF',
                        shadowBlur: 12
                    });

                    drawConnector(ctx, badgeBox, lineCx, lineCy, {
                        color: 'rgba(0,0,0,0.60)',
                        width: 2.5,
                        dash: inFrame ? [] : [6, 7]
                    });
                }
            }
        }),
        'LJ-TSS': createIon((graph, tgraph, xs, xf, yv, color, annotation, strand) => {
            const ctx = graph.canvas.getCTX?.();

            let s = (annotation?.strand ?? strand);
            if (s === '+') s = 1;
            if (s === '-') s = -1;

            if (typeof s === 'string') s = Number(s);

            if (s === 0) s = 1;
            if (s !== 1 && s !== -1) s = 1;

            const visualDir = s;

            const y = yv;
            const featureColor = color || 'rgba(78,157,105,0.55)';

            const startX = (s === 1) ? xs : xf;

            const arrowStartX = (visualDir === 1) ? xs : xf;
            const arrowEndX = (visualDir === 1) ? xf : xs;

            const labelText =
                annotation?.label ??
                annotation?.name ??
                annotation?.id ??
                'LJ-TSS';

            if (ctx) {
                const yPix = graph.Y(y);

                const xStartPix = graph.X(arrowStartX);
                const xEndPix = graph.X(arrowEndX);

                const lineWidth = 34;
                const headL = 18;
                const headW = 12;

                const xShaftEnd = xEndPix - visualDir * (headL * 0.85);

                ctx.save();
                ctx.lineCap = 'butt';
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = featureColor;
                ctx.beginPath();
                ctx.moveTo(xStartPix, yPix);
                ctx.lineTo(xShaftEnd, yPix);
                ctx.stroke();
                ctx.restore();

                ctx.save();
                ctx.fillStyle = featureColor;
                ctx.beginPath();
                ctx.moveTo(xEndPix, yPix);
                ctx.lineTo(xEndPix - visualDir * headL, yPix - headW);
                ctx.lineTo(xEndPix - visualDir * headL, yPix + headW);
                ctx.closePath();
                ctx.fill();
                ctx.restore();

                const sx = graph.X(startX);
                const tickH = 18;

                ctx.save();
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(46,110,164,0.95)';
                ctx.beginPath();
                ctx.moveTo(sx, yPix - tickH);
                ctx.lineTo(sx, yPix + tickH);
                ctx.stroke();
                ctx.restore();

                const midPix = (xStartPix + xShaftEnd) * 0.5;
                const labelOffsetY = 38;
                const labelY = yPix - (lineWidth * 0.5) - labelOffsetY;
                const labelX = midPix;

                ctx.save();
                ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(labelX, labelY + 6);
                ctx.lineTo(midPix, yPix - (lineWidth * 0.5) - 2);
                ctx.stroke();
                ctx.restore();

                ctx.save();
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                const padX = 6, padY = 3;
                const metrics = ctx.measureText(labelText);
                const textW = metrics.width;
                const boxW = textW + padX * 2;
                const boxH = 14 + padY * 2;

                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(labelX - boxW / 2, labelY - boxH, boxW, boxH);

                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.fillText(labelText, labelX, labelY - padY);

                ctx.restore();

            } else {

                graph.drawLine(arrowStartX, y, arrowEndX, y, featureColor, 40, 'butt');

                graph.drawScreenLine(
                    graph.X(startX),
                    graph.Y(y) - 12,
                    graph.X(startX),
                    graph.Y(y) + 12,
                    __ann(graph, 'GX_POLYA', '#1aa3bd'),
                    4,
                    'butt'
                );

                const xStartPix = graph.X(arrowStartX);
                const xEndPix = graph.X(arrowEndX);
                const midPix = (xStartPix + xEndPix) * 0.5;
                const yPix = graph.Y(y);

                const labelOffsetY = 44;
                const labelX = midPix;
                const labelY = yPix - labelOffsetY;

                graph.drawScreenLine(
                    labelX, labelY + 4,
                    midPix, yPix - 18,
                    'rgba(255,255,255,0.85)',
                    2,
                    'butt'
                );

                if (graph.drawScreenText) {
                    graph.drawScreenText(labelText, labelX, labelY, 'white', 12, 'center');
                }
            }
        }),

        // START / STOP codons are drawn ONCE, by the 'Translation' shape (strand-aware, both
        // pillars in one place). The TSS/STOP annotations are kept for their functional role
        // (CDS regeneration triggers on tss/stop) but no longer draw — otherwise the codons
        // appeared twice (Translation + TSS/STOP).
        'TSS': createIon((graph, tgraph, xs, xf, y) => { }),
        'STOP': createIon((graph, tgraph, xs, xf, y) => { }),
        'oligo': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#17a39a', 1, 'butt')

        }),
        'ProteinDomain': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            // const FONT = '10px system-ui, -apple-system, Roboto, Arial, sans-serif';
            graph.drawLine(xs, y + 1, xf, y + 1, '#0099ff2f', 10, 'butt')

            // const cx = (xs + xf) / 2;
            // const name = annotation.name || '';
            // // Stagger labels vertically so neighbouring domains' horizontal labels don't overlap:
            // // measure the label's screen width and place it on the lowest "row" (leader length)
            // // at this track's y that has no horizontal collision with a label already placed this
            // // frame. Each extra row lengthens the leader by ~one text height, keeping them readable.
            // const ctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
            // let sx = graph.X(cx), halfW = 24;
            // if (ctx) { ctx.font = FONT; halfW = ctx.measureText(name).width / 2 + 6; }
            // const spans = (graph.__domainLabelSpans = graph.__domainLabelSpans || []);
            // let row = 0;
            // while (spans.some(s => s.row === row && Math.abs(s.y - y) < 1e-6 && !(sx + halfW < s.x0 || sx - halfW > s.x1))) row++;
            // spans.push({ row, y, x0: sx - halfW, x1: sx + halfW });

            // // Stagger the label UPWARD on screen (away from the track), whatever the track's
            // // world-Y orientation. An mRNA track runs its world Y the other way, so keying the
            // // direction off labelY's sign fanned the labels DOWNWARD and let them overlap. Derive
            // // the direction from the actual screen mapping, and separate rows by a consistent
            // // per-row SCREEN gap so they never collide regardless of track type.
            // const upSign = (graph.Y(y + 1) <= graph.Y(y)) ? 1 : -1;   // world sign that moves the label UP on screen
            // let step = 0.02, baseGap = 0.03;
            // try { if (graph.worldHeight) { step = Math.abs(graph.worldHeight(13)); baseGap = Math.abs(graph.worldHeight(18)); } } catch (e) { }
            // const labelY = Math.abs(y + upSign * (baseGap + row * step));   // further up for higher rows

            // // Leader from the domain bar up to its (staggered) label so it stays associated.
            // // graph.drawLine(cx, y, cx, labelY, 'rgba(168,107,62,0.6)', 1, 'butt');
            // // graph.drawString(name, cx, labelY, __ink(graph), FONT)
            // let screencell = graph.screenWidth(tgraph.screenWidth(1))
            // if (screencell < 1.5 && screencell > 0.1) {
            //     if (annotation.description != null && annotation.description.length > 0) {
            //         // graph.drawString(annotation.description, cx, labelY + upSign * step, __ink(graph), FONT)
            //     }

            // }
        }),
        'amplicon': createIon((graph, tgraph, xs, xf, y, color, annotation) => {

        }),
        'aso': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#17a39a', 1, 'butt')

        }), 'AA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {

            let screencell = graph.screenWidth(tgraph.screenWidth(1))

            graph.drawLine(xs, y, xf, y, 'rgba(176,69,62,0.55)', 65, 'butt')
            graph.drawLine(xs, y, xs, y + annotation.labelY - 1, 'rgba(120,130,145,0.45)', 1, 'butt')
            if (screencell > 0.5) {
                graph.drawString(annotation.name, xs, y + annotation.labelY - 1, __ink(graph), '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

            }
        }),
        'Intron': createIon((graph, tgraph, xs, xf, y) => {

            graph.drawZigZag(xs, y, xf, y, __ann(graph, 'GX_RNABIND', '#b0533f'), 2)

        }),
        'Translation': createIon((graph, tgraph, xs, xf, y, color, annotation, strand) => {
            // No zoom-out cull — the START/STOP pillars are fixed screen size, so keep them
            // visible even when zoomed way out.
            // Reverse-strand translation runs high->low genomic, so the START is at the
            // high (xf) end and the STOP at the low (xs) end. Draw them as the same
            // START (green) / STOP (red) cylinders, at the correct strand-aware ends.
            const _sv = (annotation && annotation.strand != null) ? annotation.strand : strand;
            const _minus = (_sv === '-' || _sv === -1 || _sv === '-1');
            const startX = _minus ? xf : xs;
            const stopX = _minus ? xs : xf;
            drawCodonCylinder(graph, tgraph, startX, startX, y, 'start');
            drawCodonCylinder(graph, tgraph, stopX, stopX, y, 'stop');
            const r = 0.1;
            graph.drawString('START', startX, y + r, '#2e9e44', '9px system-ui, -apple-system, Roboto, Arial, sans-serif');
            graph.drawString('STOP', stopX, y + r, '#9c3350', '9px system-ui, -apple-system, Roboto, Arial, sans-serif');

        }),
        'CODON': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, 'rgba(120,130,145,0.45)', 3, 'butt')
            graph.drawVerticalLine(xs, y, 0.2, '#8399ac')

        }),
        'CDS': createIon((graph, tgraph, xs, xf, y) => {
            // The yellow/gold ORF line was removed by request; the CDS/ORF data is kept
            // (used by translation, protein domains, etc.) but no longer drawn as a line.
            graph.drawVerticalLine(xs, y, 0.08, __ann(graph, 'GX_POLYA', '#1aa3bd'), 1)
            graph.drawVerticalLine(xf + 1, y, 0.08, __ann(graph, 'GX_POLYA', '#1aa3bd'), 1)

        }),
        'UTR': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#9fe0e8', 7)
            graph.drawVerticalLine(xs, y, 0.2, '#9fe0e8')
            graph.drawVerticalLine(xf, y, 0.2, '#9fe0e8')

        }),
        'polypeptide': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, 'rgba(120,130,145,0.45)', 1)
            graph.drawVerticalLine(xs, y, 0.2, 'rgba(120,130,145,0.45)')
            graph.drawVerticalLine(xf, y, 0.2, 'rgba(120,130,145,0.45)')

        }),
        'rna-binding': createIon((graph, tgraph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs, y, xf, y, __ann(graph, 'GX_RNABIND', '#b0533f'), 4, 'round')
            graph.drawVerticalLine(xs, y, 0.2, __ink(graph))
            graph.drawVerticalLine(xf, y, 0.2, __ink(graph))

        }),
        'snp': createIon((graph, tgraph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs, y, xf, y, '#6e4560', 20, 'round')
            graph.drawVerticalLine(xs, y, 0.2, __ink(graph))
            graph.drawVerticalLine(xf, y, 0.2, __ink(graph))

        }), 'Query': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#6e4560', 12, 'round')
            graph.drawVerticalLine(xs, y, 0.2, __ink(graph))
            graph.drawVerticalLine(xf, y, 0.2, __ink(graph))

        }), 'Query-Target': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, __ann(graph, 'GX_RNABIND', '#b0533f'), 12, 'round')
            graph.drawVerticalLine(xs, y, 0.2, __ink(graph))
            graph.drawVerticalLine(xf, y, 0.2, __ink(graph))

        }),
        'biological_region': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, __ann(graph, 'GX_REGION', '#7a4f66'), 5)
            graph.drawVerticalLine(xs, y, 0.2, __ann(graph, 'GX_REGION', '#7a4f66'))
            graph.drawVerticalLine(xf, y, 0.2, __ann(graph, 'GX_REGION', '#7a4f66'))

        }),
        'region': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, __ann(graph, 'GX_PSEUDO', '#7f96a8'), 2, 'butt')
            graph.drawVerticalLine(xs, y, 0.1, __ann(graph, 'GX_PSEUDO', '#7f96a8'))
            graph.drawVerticalLine(xf, y, 0.1, __ann(graph, 'GX_PSEUDO', '#7f96a8'))

        }),
        'polyA': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, __ann(graph, 'GX_POLYA', '#1aa3bd'), 25, 'round')
            graph.drawVerticalLine(xs, y, 1.1, 'rgba(120,130,145,0.45)')
            graph.drawVerticalLine(xf, y, 1.1, 'rgba(120,130,145,0.45)')

        }),
        'lncRNA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {

            let screencell = graph.screenWidth((1))

            graph.drawLine(xs, y + 0.3, xf, y + 0.3, __ann(graph, 'GX_POLYA', '#1aa3bd'), 25, 'round')
            graph.drawVerticalLine(xs, y + 0.3, 1.1, __ann(graph, 'GX_REGION', '#7a4f66'))
            graph.drawVerticalLine(xf, y + 0.3, 1.1, __ann(graph, 'GX_REGION', '#7a4f66'))
            let name = 'lncRNA'
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }
            let r = 0.35;
            graph.drawString(name, xs, y + 1 + r, __ink(graph), '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'miRNA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, 0.3, xf, 0.3, '#2bb0bf', 20, 'round')
            graph.drawVerticalLine(xs, 0.3, 1.1, '#9fe0e8')
            graph.drawVerticalLine(xf, 0.3, 1.1, __ann(graph, 'GX_DEL', '#8c2f42'))
            let name = 'miRNA'
            let screencell = graph.screenWidth((1))
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
                graph.drawLine(xs, 0.3, xs, tgraph.Y(annotation.labelY), __ink(graph), 1, 'round')

            }
            graph.drawString(name, xs, tgraph.Y(annotation.labelY), __ink(graph), '12px system-ui, -apple-system, Roboto, Arial, sans-serif')
        }),
        'miRNA_primary_transcript': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, 0.3, xf, 0.3, '#a86b3e', 10, 'round')
            graph.drawVerticalLine(xs, 0.3, 1.1, __ann(graph, 'GX_REGION', '#7a4f66'))
            graph.drawVerticalLine(xf, 0.3, 1.1, __ann(graph, 'GX_REGION', '#7a4f66'))
            let name = 'miRNA'
            let screencell = graph.screenWidth((1))
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
                graph.drawLine(xs, 0.3, xs, y, __ink(graph), 1, 'round')

            }

            graph.drawString(name, xs, y, __ink(graph), '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'processed_pseudogene': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, y + 0.3, xf, y + 0.3, 'rgba(78,157,105,0.55)', 155, 'round')
            graph.drawVerticalLine(xs, y + 0.3, 1.1, __ann(graph, 'GX_REGION', '#7a4f66'))
            graph.drawVerticalLine(xf, y + 0.3, 1.1, __ann(graph, 'GX_REGION', '#7a4f66'))
            let name = 'Pseudogene'

            let screencell = graph.screenWidth((1))

            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }

            let r = 0.3;
            graph.drawString(name, xs, y + 1 + r, __ink(graph), '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'snRNA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, y + 0.3, xf, y + 0.3, '#a86b3e', 155, 'round')
            graph.drawVerticalLine(xs, y + 0.3, 1.1, __ann(graph, 'GX_REGION', '#7a4f66'))
            graph.drawVerticalLine(xf, y + 0.3, 1.1, __ann(graph, 'GX_REGION', '#7a4f66'))
            let name = 'snRNA'

            let screencell = graph.screenWidth(tgraph.screenWidth(1))

            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }

            let r = 0.3;
            graph.drawString(name, xs, y + 1 + r, __ink(graph), '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),

    }

}
