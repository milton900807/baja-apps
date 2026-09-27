function (graph, genegraph_panel_layout, tracks, options) {

    // CDD PROTEIN DOMAINS AS A LAYER, on every track that has a protein.
    //   await exec('baja/bio/protein/cdd-domain-layer.js', graph, L, tracks)
    //   await exec('baja/bio/protein/cdd-domain-layer.js', graph, L, tracks, { redo: true })
    //
    // baja/manchester/menu/protein-domains.js already maps CDD onto a track, but it maps onto
    // the track's ANNOTATIONS -- the domains become ProteinDomain/cdd-site annotations mixed in
    // with the exons, the UTRs and the variants. That is fine for one look and wrong for
    // keeping: they cannot be hidden without hiding real annotations, they cannot be removed
    // without picking them back out one at a time, and they are saved into the document as
    // though someone had drawn them.
    //
    // A LAYER is the thing this codebase already has for "a set of intervals over the track,
    // from somewhere else": it toggles, it reorders, it deletes in one go, and the layer menu
    // already knows how to do all three. So the domains go in a layer of their own, the sites
    // in a second one, and the track's own annotations are left alone.
    //
    // IDEMPOTENT. "Make sure they are mapped" has to be safe to run twice: a track that
    // already carries its domain layer is skipped, not searched again and stacked on top of
    // itself. `redo: true` forces a fresh search.
    //
    // Tracks with no protein are SKIPPED SILENTLY, not reported as failures. Running this over
    // a board is a sweep, and the snRNAs and lncRNAs on it are not errors.

    const o = options || {};
    const list = (Array.isArray(tracks) ? tracks : (tracks ? [tracks] : [])).filter(Boolean);

    const DOMAIN_SUFFIX = '_domains';
    const SITE_SUFFIX = '_sites';

    return (async () => {
        const TrackLayer = await exec('baja/bio/track-layer.js');
        // QUIET for the automatic pass. Every coding track gets its domains as it loads, and a
        // toast per track -- over a board being restored, a dozen of them -- is noise about
        // something nobody asked for. Run from a menu it says what it did; run on load it says
        // nothing and just draws.
        const quiet = !!o.quiet;
        const say = (m) => {
            if (quiet) return;
            try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } }
        };
        const tick = (m) => { if (quiet) return; try { graph.setMessageCenter(m); } catch (e) { } };
        const clearTick = () => { if (quiet) return; try { graph.setMessageCenter(''); } catch (e) { } };

        if (!list.length) { say('No tracks to map domains onto.'); return { done: 0, skipped: 0, empty: 0 }; }

        // ---- the track's protein, and where each residue sits on the genome ---------------
        //
        // Lifted from protein-domains.js, which learned the hard way that ONE of these three
        // routes failing does not mean the track is non-coding: the exon-aware CDS is the best
        // answer, the per-codon list is the fallback, and getProteinSequence is the last word.
        // codonPos[i] is the genomic coordinate of residue i+1's codon, which is the only
        // reason a protein-space hit can be drawn in genome space at all.
        const proteinOf = (t) => {
            try {
                for (const a of (t.annotations || [])) { if (a && a.type === 'NMD') t.removeAnnotation(a); }
                if (!(t.orf && t.orf.cdsi && t.orf.cdsi.length)) t.generateORF();
            } catch (e) { }

            let cds = null;
            try { cds = t.getCDS(); } catch (e) { }
            const ok = (c) => c && c.protein && ('' + c.protein).length >= 3
                && Array.isArray(c.codonPos) && c.codonPos.length;
            if (!ok(cds)) {
                try {
                    const cdsi = (t.orf && Array.isArray(t.orf.cdsi)) ? t.orf.cdsi : [];
                    if (cdsi.length) {
                        const prot = [], pos = [];
                        for (const e of cdsi) {
                            if (e && (e.ci === 0 || e.ci === '0')) { prot.push(e.aa || 'X'); pos.push(e.index); }
                        }
                        if (prot.length >= 3) cds = { protein: prot.join(''), codonPos: pos };
                    }
                } catch (e) { }
            }
            if (!ok(cds)) {
                let p = '';
                try { p = ('' + (t.getProteinSequence ? t.getProteinSequence() : '')).toString(); } catch (e) { }
                if (p.length >= 3) cds = { protein: p, codonPos: (cds && cds.codonPos) || [] };
            }
            if (!cds || !cds.protein || ('' + cds.protein).length < 3) return null;
            if (!Array.isArray(cds.codonPos) || !cds.codonPos.length) return null;   // nothing to map onto
            return cds;
        };

        const hasLayer = (t, suffix) => {
            try {
                return (t.track_layers || []).some((l) => l && ('' + l.name).indexOf(suffix) >= 0
                    && ('' + l.data_type) === 'CDD');
            } catch (e) { return false; }
        };
        const dropLayer = (t, suffix) => {
            try {
                const keep = (t.track_layers || []).filter((l) => !(l && ('' + l.name).indexOf(suffix) >= 0
                    && ('' + l.data_type) === 'CDD'));
                t.track_layers = keep;
            } catch (e) { }
        };

        // ---- CDD output --------------------------------------------------------------------
        const parseBlock = (out, head, tail, make) => {
            const rows = [];
            for (let i = 0; i < out.length; i++) {
                if (!out[i].startsWith(head)) continue;
                for (let j = i + 1; j < out.length; j++) {
                    if (out[j].startsWith(tail)) return rows;
                    const c = out[j].split('\t');
                    const r = make(c);
                    if (r) rows.push(r);
                }
            }
            return rows;
        };

        // A colour per domain, stable for a given name, so the same domain is the same colour
        // on every track it appears on and two domains side by side are never the same.
        const hueOf = (name) => {
            let h = 0;
            const s = '' + (name || '');
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            return h % 360;
        };
        const colorOf = (name, alpha) => 'hsla(' + hueOf(name) + ',62%,46%,' + alpha + ')';

        let done = 0, skipped = 0, empty = 0, already = 0;
        const per = [];

        for (let n = 0; n < list.length; n++) {
            const t = list[n];
            const label = (t && t.name) || ('track ' + (n + 1));

            if (!o.redo && hasLayer(t, DOMAIN_SUFFIX)) { already++; continue; }

            const cds = proteinOf(t);
            if (!cds) { skipped++; continue; }          // no protein: not an error, just not this track

            const protein = '' + cds.protein;
            const posOf = (aa) => (aa >= 1 && aa <= cds.codonPos.length) ? cds.codonPos[aa - 1] : -1;

            tick('Protein domains (CDD) · ' + label + '   ' + (n + 1) + '/' + list.length);

            let out = null;
            try {
                const res = await exec('py/cdd/domains.py', protein);
                if (res && res['file'] != null) out = ('' + res['file']).split('\n');
            } catch (e) { console.warn('[cdd-domain-layer]', label, e); }
            if (!out) { empty++; continue; }

            const domains = parseBlock(out, 'DOMAIN', 'ENDDOMAINS',
                (c) => (c.length > 9 ? { start: +c[4], end: +c[5], evalue: c[6], id: c[8], name: c[9] } : null));
            const sites = parseBlock(out, 'SITES', 'ENDSITES',
                (c) => (c.length > 4 ? { name: c[3], sites: c[4] } : null));

            if (o.redo) { dropLayer(t, DOMAIN_SUFFIX); dropLayer(t, SITE_SUFFIX); }

            // ---- the domains ---------------------------------------------------------------
            const lo = Math.min(t.xi, t.xf), hi = Math.max(t.xi, t.xf);
            let nD = 0;
            if (domains.length) {
                const layer = new TrackLayer(label + DOMAIN_SUFFIX, lo, 0, hi, 1);
                layer.type = 'TrackLayer';
                layer.data_type = 'CDD';
                layer.drawStyle = 'interval';
                layer.color = 'rgba(43,176,191,0.35)';
                layer.fillstyle = 'rgba(43,176,191,0.35)';
                try { layer.setLabelFont('10px Arial'); } catch (e) { }
                // NAME THE DOMAINS AT ANY ZOOM. The default threshold (0.4 px per base) means
                // labels only appear once the track is zoomed in near enough to read the
                // sequence -- and a whole gene in view, which is where a domain map is worth
                // having, is two orders of magnitude below that. The domains drew as unlabelled
                // slivers. This is the one layer whose whole content IS its labels.
                layer.labelZoomThreshold = 0;
                // Labels are drawn to the RIGHT of their bar, so on a gene whose domains sit
                // end to end -- EGFR's four do -- each name lands on the next domain's name and
                // the row reads "Recep_L_doFurin-likeeep_L_domain". avoidLabelOverlap drops a
                // label that would land on one already placed instead of overprinting it: the
                // bar is still there and the hover panel still has the name.
                layer.avoidLabelOverlap = true;

                // THE BAR HEIGHT IS int.y. The renderer reads y as both the top of the bar and
                // its depth (fillRect(x, Y(y), w, screenHeight(y))), so the lane numbers
                // getYByOverlapCount hands out -- 0.05, 0.13, ... -- are not just lanes, they
                // are bars 1.8px tall on a 35px band. Which is why the layer was there, correct,
                // and invisible. Domains get a real height, and overlaps stack upward from it.
                //
                // Lanes are packed here rather than through getYByOverlapCount, because that
                // helper searches its own 0.05/0.08 ladder and cannot find a lane among y values
                // it did not choose.
                const BASE = 0.50, STEP = 0.22;
                const spans = [];
                for (const d of domains) {
                    const a = posOf(d.start), b = posOf(d.end);
                    if (a < 0 || b < 0) continue;
                    // codonPos runs 3'->5' on a minus-strand track, so the span is ordered here
                    // rather than assumed; +2 takes in the last codon's remaining two bases.
                    spans.push({
                        x1: Math.min(a, b), x2: Math.max(a, b) + 2,
                        nm: ('' + (d.name || d.id || 'domain')).trim() || 'domain'
                    });
                }
                spans.sort((p, q) => p.x1 - q.x1);
                const laneEnd = [];   // rightmost x2 placed in each lane so far
                for (const sp of spans) {
                    let lane = 0;
                    while (lane < laneEnd.length && laneEnd[lane] > sp.x1) lane++;
                    laneEnd[lane] = sp.x2;
                    const y = BASE + lane * STEP;
                    // A "transcription..." hit is a broad superfamily-level match that spans most of the
                    // protein: as a full-strength labelled bar it drowns the specific domains inside
                    // it. It is kept, very faint and unlabelled; the hover panel still names it.
                    const faint = /transcript/i.test(sp.nm);
                    layer.addInterval(sp.x1, sp.x2, y, sp.nm);
                    try { layer.setIntervalColor(sp.x1, sp.x2, y, sp.nm, colorOf(sp.nm, faint ? 0.06 : 0.42)); } catch (e) { }
                    if (faint) {
                        const iv = (layer.intervals || []).find((v) => v.x1 === sp.x1 && v.x2 === sp.x2);
                        if (iv) iv.noLabel = true;
                    }
                }
                // COUNT WHAT IS IN THE LAYER, not how many times addInterval was called: it
                // drops a span it already holds, so counting calls overstated the result --
                // EGFR reported 88 sites while carrying 67. The number said out loud has to be
                // the number a user can go and count.
                nD = (layer.intervals || []).length;
                if (nD) { try { t.addLayer(layer); } catch (e) { } }
            }

            // ---- the functional sites, in their own layer ----------------------------------
            // Separate because they are a different kind of claim at a different scale: a
            // domain is a region of a hundred residues, a site is one. In one layer the sites
            // vanish under the domain bars.
            let nS = 0;
            const SITE_BASE = 0.30, SITE_STEP = 0.10;
            if (sites.length) {
                const slayer = new TrackLayer(label + SITE_SUFFIX, lo, 0, hi, 1);
                slayer.type = 'TrackLayer';
                slayer.data_type = 'CDD';
                slayer.drawStyle = 'interval';
                slayer.color = 'rgba(190,60,60,0.55)';
                slayer.fillstyle = 'rgba(190,60,60,0.55)';
                try { slayer.setLabelFont('10px Arial'); } catch (e) { }
                slayer.avoidLabelOverlap = true;   // 67 sites, most of them called "active site"
                // A SITE IS ONE RESIDUE -- three bases -- which across a whole gene is well
                // under a pixel. So this layer holds itself back until the view is close
                // enough for a site to mean something, and then makes sure it can be seen:
                //
                //   drawZoomThreshold  nothing below ~0.05 px per base. On a 1200px canvas
                //                      that is a view of about 25 kb, which is a gene or an
                //                      exon rather than a chromosome. Above it the sites come
                //                      in; below it they would be 67 sub-pixel slivers over
                //                      the domains.
                //   minIntervalPx      3 px, so a three-base site is a tick you can actually
                //                      see and click once it is drawn at all.
                //   bar height         the same fix the domains needed: int.y is the bar's
                //                      depth as well as its position, so the 0.05 lanes drew
                //                      hairlines. Sites sit LOWER than the domains (0.30
                //                      against 0.50) so the two read as separate rows rather
                //                      than one bar hiding the other.
                //
                // Labels stay on the default threshold: the ticks say where, and the names
                // arrive when there is room to read them.
                slayer.drawZoomThreshold = 0.05;
                slayer.minIntervalPx = 3;

                for (const s of sites) {
                    const raw = '' + (s.sites || '');
                    if (!raw) continue;
                    const parts = (raw.indexOf(',') > 0) ? raw.split(',') : [raw];
                    for (const p of parts) {
                        // "K123" -> residue 123; the leading letter is the residue itself.
                        const aa = +('' + p).substring(1).trim();
                        if (!isFinite(aa) || aa < 1) continue;
                        const g = posOf(aa);
                        if (g < 0) continue;
                        const nm = ('' + (s.name || 'site')).trim() || 'site';
                        // Lanes from the helper, then mapped onto a visible band: sites at one
                        // residue rarely overlap, so lane 0 is the usual answer and SITE_BASE
                        // is what decides whether anything is seen at all.
                        const lane = Math.max(0, Math.round((slayer.getYByOverlapCount(g, g + 2) - 0.05) / 0.08));
                        const y = SITE_BASE + lane * SITE_STEP;
                        slayer.addInterval(g, g + 2, y, nm);
                        try { slayer.setIntervalColor(g, g + 2, y, nm, colorOf(nm, 0.6)); } catch (e) { }
                    }
                }
                nS = (slayer.intervals || []).length;   // stored, not attempted (see above)
                if (nS) { try { t.addLayer(slayer); } catch (e) { } }
            }

            if (!nD && !nS) { empty++; continue; }
            done++;
            per.push(label + ': ' + nD + ' domain' + (nD === 1 ? '' : 's')
                + (nS ? (', ' + nS + ' site' + (nS === 1 ? '' : 's')) : ''));
            try { if (t.fitYAxis) t.fitYAxis(); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
        }

        clearTick();
        try { if (graph.wake) graph.wake(); } catch (e) { }

        // WHAT HAPPENED TO EVERY TRACK, not just the ones that worked. A sweep that reports
        // only its successes leaves "why is there nothing on that one?" unanswered.
        const bits = [];
        if (done) bits.push(done + ' track' + (done === 1 ? '' : 's') + ' mapped');
        if (already) bits.push(already + ' already had the layer');
        if (empty) bits.push(empty + ' with no domains found');
        if (skipped) bits.push(skipped + ' with no protein');
        say('Protein domains (CDD): ' + (bits.length ? bits.join(', ') : 'nothing to do')
            + (per.length ? ('  —  ' + per.slice(0, 4).join('; ') + (per.length > 4 ? '…' : '')) : '') + '.');

        return { done: done, already: already, empty: empty, skipped: skipped, per: per };
    })();
}
