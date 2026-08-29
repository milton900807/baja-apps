function () {
    // A professional vertical 3D cylinder marking a start (green) / stop (red) codon.
    // Stands as a small shaded pillar centered on the annotation, with elliptical caps,
    // a specular highlight and a soft drop shadow.
    const drawCodonCylinder = (graph, tgraph, xs, xf, y, kind) => {
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
    // fixed-size icon (shape + colour) on a short stem above the track so the different site
    // kinds are visually distinguishable at a glance. Nearby sites stack by their label lane
    // (assigned in track.add) so their icons/labels don't collide on the X axis.
    const CDD_SITE_STYLES = {
        active:       { color: '#e11d48', icon: 'circledot',    tag: 'active site' },
        catalytic:    { color: '#ea580c', icon: 'star',         tag: 'catalytic' },
        substrate:    { color: '#0d9488', icon: 'triangle',     tag: 'substrate binding' },
        nucleotide:   { color: '#7c3aed', icon: 'diamond',      tag: 'nucleotide binding' },
        metal:        { color: '#ca8a04', icon: 'hexagon',      tag: 'metal binding' },
        dna:          { color: '#2563eb', icon: 'square',       tag: 'nucleic-acid binding' },
        interface:    { color: '#475569', icon: 'doublecircle', tag: 'interface' },
        inhibitor:    { color: '#9f1239', icon: 'triangledown', tag: 'inhibitor binding' },
        cofactor:     { color: '#c026d3', icon: 'pentagon',     tag: 'cofactor binding' },
        modification: { color: '#d97706', icon: 'cross',        tag: 'modification site' },
        cleavage:     { color: '#1f2937', icon: 'notch',        tag: 'cleavage site' },
        ion:          { color: '#0891b2', icon: 'smallsquare',  tag: 'ion binding' },
        peptide:      { color: '#16a34a', icon: 'chevron',      tag: 'peptide binding' },
        other:        { color: '#6b7280', icon: 'circle',       tag: 'site' },
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

    // Draw one CDD functional site: a stem from the track up to the category glyph, plus the
    // site's name when zoomed in enough to read it. `catKey` is a CDD_SITE_STYLES key.
    const drawCddSite = (graph, tgraph, xs, xf, y, annotation, catKey) => {
        const st = CDD_SITE_STYLES[catKey] || CDD_SITE_STYLES.other;
        const cx = graph.X((xs + xf) / 2);
        const cyTrack = graph.Y(y);
        const screencell = graph.screenWidth(tgraph.screenWidth(1));
        const lane = Math.max(0, (annotation.__labelLane | 0));
        const r = 5.5;
        const gy = cyTrack - (15 + lane * 15);   // glyph sits above the track; lanes stack upward
        const ctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
        if (!ctx) {
            try { graph.drawScreenLine(cx, cyTrack, cx, gy, st.color, 1, 'butt'); } catch (e) { }
            return;
        }
        ctx.save();
        // Stem from the residue on the track up to the glyph.
        ctx.strokeStyle = 'rgba(100,116,139,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cyTrack); ctx.lineTo(cx, gy + r); ctx.stroke();
        ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
        ctx.restore();
        drawCddGlyph(ctx, st.icon, cx, gy, r, st.color);
        if (screencell > 2.5) {
            const label = annotation.name || st.tag;
            try { graph.drawScreenText(('' + label).slice(0, 42), cx + r + 3, gy + 3, '#0a2540', 9, 'left'); } catch (e) { }
        }
    };

    // One shape entry per CDD site category, all sharing drawCddSite.
    const cddShape = (catKey) => createIon((graph, tgraph, xs, xf, y, color, annotation) => drawCddSite(graph, tgraph, xs, xf, y, annotation, catKey));

    return {
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
            graph.drawVerticalLine(xs, y, 0.16, '#0a2540', 0.6);
            graph.drawVerticalLine(xf, y, 0.16, '#0a2540', 0.6);
            const mid = (xs + xf) / 2;
            const ly = y + (annotation.labelY || 0.45);
            graph.drawLine(mid, y, mid, ly, '#0a2540', 0.5, 'butt');
            if (annotation.name) {
                graph.drawString(annotation.name, mid, ly, '#0a2540', 'bold 11px system-ui, -apple-system, Roboto, Arial, sans-serif');
            }
            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)));
            if (screencell > 2 && annotation.description) {
                graph.drawString(('' + annotation.description).slice(0, 90), mid, ly + 0.14, '#365a63', '9px system-ui, -apple-system, Roboto, Arial, sans-serif');
            }
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
                if (screencell > 4) {

                    let x = (graph.X(xs) + graph.X(xf)) / 2;

                    ctx.shadowBlur = 2;
                    ctx.shadowColor = '#0a2540';

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
                    ctx.fillStyle = '#0a2540'

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
                ctx.shadowColor = '#0a2540';
                ctx.lineWidth = 3;

                ctx.color = '#1b4a7a'
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4) {
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
                    ctx.fillStyle = '#0a2540'
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
            graph.drawVerticalLine(xs, y, 0.13, '#7a4f66', 0.7)
            graph.drawVerticalLine(xf, y, 0.13, '#7a4f66', 0.4)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();
            if (ctx) {
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4) {
                    let x = (graph.X(xs) + graph.X(xf)) / 2;
                    ctx.lineWidth = 1;
                    ctx.shadowBlur = 3;
                    ctx.shadowColor = '#0a2540';

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
                    ctx.fillStyle = '#0a2540'

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
            graph.drawVerticalLine(xs, y, 0.13, '#7a4f66', 0.7)
            graph.drawVerticalLine(xf, y, 0.13, '#7a4f66', 0.4)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();
            if (ctx) {
                ctx.shadowBlur = 7;
                ctx.shadowColor = '#0a2540';
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4) {
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
                    ctx.fillStyle = '#0a2540'

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

            graph.drawVerticalLine(xs, y, 0.63, '#8c2f42', 0.5)
            graph.drawVerticalLine(xf, y, 0.63, '#8c2f42', 0.5)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();
            if (ctx) {
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4) {
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
                    ctx.fillStyle = '#0a2540'
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
                        ctx.strokeStyle = '#0a2540'; // oval border
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
                    '#1aa3bd',
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

        'TSS': createIon((graph, tgraph, xs, xf, y) => {
            drawCodonCylinder(graph, tgraph, xs, xf, y, 'start');
        }),
        'STOP': createIon((graph, tgraph, xs, xf, y) => {
            drawCodonCylinder(graph, tgraph, xs, xf, y, 'stop');
        }),
        'oligo': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#17a39a', 1, 'butt')

        }),
        'ProteinDomain': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            const FONT = '10px system-ui, -apple-system, Roboto, Arial, sans-serif';
            graph.drawLine(xs, y + 1, xf, y + 1, '#0099ff2f', 10, 'butt')

            const cx = (xs + xf) / 2;
            const name = annotation.name || '';
            // Stagger labels vertically so neighbouring domains' horizontal labels don't overlap:
            // measure the label's screen width and place it on the lowest "row" (leader length)
            // at this track's y that has no horizontal collision with a label already placed this
            // frame. Each extra row lengthens the leader by ~one text height, keeping them readable.
            const ctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
            let sx = graph.X(cx), halfW = 24;
            if (ctx) { ctx.font = FONT; halfW = ctx.measureText(name).width / 2 + 6; }
            const spans = (graph.__domainLabelSpans = graph.__domainLabelSpans || []);
            let row = 0;
            while (spans.some(s => s.row === row && Math.abs(s.y - y) < 1e-6 && !(sx + halfW < s.x0 || sx - halfW > s.x1))) row++;
            spans.push({ row, y, x0: sx - halfW, x1: sx + halfW });

            // Stagger the label UPWARD on screen (away from the track), whatever the track's
            // world-Y orientation. An mRNA track runs its world Y the other way, so keying the
            // direction off labelY's sign fanned the labels DOWNWARD and let them overlap. Derive
            // the direction from the actual screen mapping, and separate rows by a consistent
            // per-row SCREEN gap so they never collide regardless of track type.
            const upSign = (graph.Y(y + 1) <= graph.Y(y)) ? 1 : -1;   // world sign that moves the label UP on screen
            let step = 0.02, baseGap = 0.03;
            try { if (graph.worldHeight) { step = Math.abs(graph.worldHeight(13)); baseGap = Math.abs(graph.worldHeight(18)); } } catch (e) { }
            const labelY = Math.abs(y + upSign * (baseGap + row * step));   // further up for higher rows

            // Leader from the domain bar up to its (staggered) label so it stays associated.
            // graph.drawLine(cx, y, cx, labelY, 'rgba(168,107,62,0.6)', 1, 'butt');
            // graph.drawString(name, cx, labelY, '#0a2540', FONT)
            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 1.5 && screencell > 0.1) {
                if (annotation.description != null && annotation.description.length > 0) {
                    // graph.drawString(annotation.description, cx, labelY + upSign * step, '#0a2540', FONT)
                }

            }
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
                graph.drawString(annotation.name, xs, y + annotation.labelY - 1, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

            }
        }),
        'Intron': createIon((graph, tgraph, xs, xf, y) => {

            graph.drawZigZag(xs, y, xf, y, '#b0533f', 2)

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
            graph.drawVerticalLine(xs, y, 0.08, '#1aa3bd', 1)
            graph.drawVerticalLine(xf + 1, y, 0.08, '#1aa3bd', 1)

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
            graph.drawZigZag(xs, y, xf, y, '#b0533f', 4, 'round')
            graph.drawVerticalLine(xs, y, 0.2, '#0a2540')
            graph.drawVerticalLine(xf, y, 0.2, '#0a2540')

        }),
        'snp': createIon((graph, tgraph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs, y, xf, y, '#6e4560', 20, 'round')
            graph.drawVerticalLine(xs, y, 0.2, '#0a2540')
            graph.drawVerticalLine(xf, y, 0.2, '#0a2540')

        }), 'Query': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#6e4560', 12, 'round')
            graph.drawVerticalLine(xs, y, 0.2, '#0a2540')
            graph.drawVerticalLine(xf, y, 0.2, '#0a2540')

        }), 'Query-Target': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#b0533f', 12, 'round')
            graph.drawVerticalLine(xs, y, 0.2, '#0a2540')
            graph.drawVerticalLine(xf, y, 0.2, '#0a2540')

        }),
        'biological_region': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#7a4f66', 5)
            graph.drawVerticalLine(xs, y, 0.2, '#7a4f66')
            graph.drawVerticalLine(xf, y, 0.2, '#7a4f66')

        }),
        'region': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#7f96a8', 2, 'butt')
            graph.drawVerticalLine(xs, y, 0.1, '#7f96a8')
            graph.drawVerticalLine(xf, y, 0.1, '#7f96a8')

        }),
        'polyA': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#1aa3bd', 25, 'round')
            graph.drawVerticalLine(xs, y, 1.1, 'rgba(120,130,145,0.45)')
            graph.drawVerticalLine(xf, y, 1.1, 'rgba(120,130,145,0.45)')

        }),
        'lncRNA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {

            let screencell = graph.screenWidth((1))

            graph.drawLine(xs, y + 0.3, xf, y + 0.3, '#1aa3bd', 25, 'round')
            graph.drawVerticalLine(xs, y + 0.3, 1.1, '#7a4f66')
            graph.drawVerticalLine(xf, y + 0.3, 1.1, '#7a4f66')
            let name = 'lncRNA'
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }
            let r = 0.35;
            graph.drawString(name, xs, y + 1 + r, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'miRNA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, 0.3, xf, 0.3, '#2bb0bf', 20, 'round')
            graph.drawVerticalLine(xs, 0.3, 1.1, '#9fe0e8')
            graph.drawVerticalLine(xf, 0.3, 1.1, '#8c2f42')
            let name = 'miRNA'
            let screencell = graph.screenWidth((1))
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
                graph.drawLine(xs, 0.3, xs, tgraph.Y(annotation.labelY), '#0a2540', 1, 'round')

            }
            graph.drawString(name, xs, tgraph.Y(annotation.labelY), '#0a2540', '12px system-ui, -apple-system, Roboto, Arial, sans-serif')
        }),
        'miRNA_primary_transcript': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, 0.3, xf, 0.3, '#a86b3e', 10, 'round')
            graph.drawVerticalLine(xs, 0.3, 1.1, '#7a4f66')
            graph.drawVerticalLine(xf, 0.3, 1.1, '#7a4f66')
            let name = 'miRNA'
            let screencell = graph.screenWidth((1))
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
                graph.drawLine(xs, 0.3, xs, y, '#0a2540', 1, 'round')

            }

            graph.drawString(name, xs, y, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'processed_pseudogene': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, y + 0.3, xf, y + 0.3, 'rgba(78,157,105,0.55)', 155, 'round')
            graph.drawVerticalLine(xs, y + 0.3, 1.1, '#7a4f66')
            graph.drawVerticalLine(xf, y + 0.3, 1.1, '#7a4f66')
            let name = 'Pseudogene'

            let screencell = graph.screenWidth((1))

            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }

            let r = 0.3;
            graph.drawString(name, xs, y + 1 + r, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'snRNA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, y + 0.3, xf, y + 0.3, '#a86b3e', 155, 'round')
            graph.drawVerticalLine(xs, y + 0.3, 1.1, '#7a4f66')
            graph.drawVerticalLine(xf, y + 0.3, 1.1, '#7a4f66')
            let name = 'snRNA'

            let screencell = graph.screenWidth(tgraph.screenWidth(1))

            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }

            let r = 0.3;
            graph.drawString(name, xs, y + 1 + r, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),

    }

}
