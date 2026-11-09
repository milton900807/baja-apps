function (graph, genegraph_panel_layout, tracks, options) {

    // SHORT LINEAR MOTIFS AS A LAYER, on every track that has a protein, and what a
    // variant does to them.
    //   await exec('baja/bio/protein/slim-motif-layer.js', graph, L, tracks)
    //   await exec('baja/bio/protein/slim-motif-layer.js', graph, L, tracks,
    //              { variants: ['R578C'], minScore: 0.6, redo: true })
    //
    // The sibling of baja/bio/protein/cdd-domain-layer.js, and built the same way: a
    // LAYER rather than annotations, so it toggles, reorders and deletes in one go and
    // the track's own annotations are left alone. Same idempotence rule, same silent
    // skip for tracks with no protein.
    //
    // WHAT IS DIFFERENT, and why it gets its own file rather than a flag on that one:
    //
    //   A domain is a claim about structure, found by homology, and a CDD hit with
    //   E <= 0.01 is usually real. A motif is a REGEX MATCH. A 1300-residue protein
    //   carries hundreds of them and almost all are noise. So this layer does two
    //   things the domain layer never has to: it hides most of what it finds behind a
    //   score threshold, and it says in its own label that the score is an ordering
    //   rather than a probability.
    //
    //   Three layers, not one. Motifs present in the protein; motifs a variant CREATES;
    //   motifs a variant DESTROYS. They are different claims and a reader who cannot
    //   tell them apart at a glance has been given the wrong picture. Gained is the
    //   interesting one and is drawn to be noticed.
    //
    // THE GAINED SCORE IS AN UPPER BOUND and the layer says so, out loud, in the
    // callout and not only in the help. Conservation belongs to the wild-type residue;
    // a gained motif inherits numbers earned by the residue that was replaced. The
    // backend marks every gained record with score_is_upper_bound and this file refuses
    // to draw one without carrying the warning.
    //
    // VARIANTS ARE NOT TRANSLATED HERE. options.variants are PROTEIN-space strings
    // ('R578C'). Annotations on the track are read only where they already carry a
    // protein consequence. Deriving a protein change from a genomic one is a different
    // job with its own failure modes, and guessing it silently would paint a motif at a
    // residue nobody asked about. The backend independently refuses a variant whose
    // wild-type residue does not match the sequence, so a numbering mismatch between
    // UniProt and the track's own translation surfaces as a note rather than a picture.

    const o = options || {};
    const list = (Array.isArray(tracks) ? tracks : (tracks ? [tracks] : [])).filter(Boolean);

    const MOTIF_SUFFIX = '_motifs';
    const GAIN_SUFFIX = '_motifs_gained';
    const LOSS_SUFFIX = '_motifs_lost';
    const DATA_TYPE = 'SLIM';

    return (async () => {
        const TrackLayer = await exec('baja/bio/track-layer.js');
        const quiet = !!o.quiet;
        const say = (m) => {
            if (quiet) return;
            try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } }
        };
        const tick = (m) => { if (quiet) return; try { graph.setMessageCenter(m); } catch (e) { } };
        const clearTick = () => { if (quiet) return; try { graph.setMessageCenter(''); } catch (e) { } };

        if (!list.length) { say('No tracks to map motifs onto.'); return { done: 0, skipped: 0, empty: 0 }; }

        const minScore = (o.minScore == null) ? 0.5 : +o.minScore;

        // ---- the track's protein, and where each residue sits on the genome --------------
        // The same three routes as cdd-domain-layer.js, for the same reason: one of them
        // failing does not make the track non-coding. codonPos[i] is the genomic coordinate
        // of residue i+1's codon, which is the only reason a protein-space hit can be drawn
        // in genome space at all.
        const proteinOf = (t) => {
            try {
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
            if (!Array.isArray(cds.codonPos) || !cds.codonPos.length) return null;
            return cds;
        };

        // Protein-space variants already recorded on the track. Only ones that ALREADY
        // carry a protein consequence in the shape R578C; nothing is translated.
        const HGVS = /\b([A-Z])(\d+)([A-Z])\b/;
        const THREE = {
            ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E',
            GLY: 'G', HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F',
            PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V'
        };
        const variantsOf = (t) => {
            const out = [];
            const push = (v) => { if (v && out.indexOf(v) < 0) out.push(v); };
            for (const v of (o.variants || [])) push(('' + v).trim().toUpperCase());
            try {
                for (const a of (t.annotations || [])) {
                    const s = '' + ((a && (a.protein || a.hgvsp || a.p || a.aa_change)) || '');
                    if (!s) continue;
                    // p.Arg578Cys and p.R578C both appear in the wild
                    const three = s.toUpperCase().match(/P\.?\s*([A-Z]{3})(\d+)([A-Z]{3})/);
                    if (three && THREE[three[1]] && THREE[three[3]]) {
                        push(THREE[three[1]] + three[2] + THREE[three[3]]); continue;
                    }
                    const one = s.toUpperCase().replace(/^P\.?/, '').match(HGVS);
                    if (one) push(one[1] + one[2] + one[3]);
                }
            } catch (e) { }
            return out;
        };

        const hasLayer = (t, suffix) => {
            try {
                return (t.track_layers || []).some((l) => l && ('' + l.name).indexOf(suffix) >= 0
                    && ('' + l.data_type) === DATA_TYPE);
            } catch (e) { return false; }
        };
        const dropLayer = (t, suffix) => {
            try {
                t.track_layers = (t.track_layers || []).filter((l) => !(l && ('' + l.name).indexOf(suffix) >= 0
                    && ('' + l.data_type) === DATA_TYPE));
            } catch (e) { }
        };

        // A colour per motif CLASS, stable everywhere, so the same class reads the same on
        // every track. Gained and lost do not use it: they are one colour each, because
        // what matters about them is that they are gained or lost, not which class they are.
        const hueOf = (name) => {
            let h = 0; const s = '' + (name || '');
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            return h % 360;
        };
        const colorOf = (name, alpha) => 'hsla(' + hueOf(name) + ',58%,48%,' + alpha + ')';

        const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

        // Lay spans out into lanes so overlapping motifs stack instead of overprinting.
        // Packed here rather than through getYByOverlapCount, which searches its own
        // ladder and cannot find a lane among y values it did not choose.
        const lanes = (layer, spans, base, step, color, labelOf) => {
            spans.sort((p, q) => p.x1 - q.x1);
            const laneEnd = [];
            for (const sp of spans) {
                let lane = 0;
                while (lane < laneEnd.length && laneEnd[lane] > sp.x1) lane++;
                laneEnd[lane] = sp.x2;
                const y = base + lane * step;
                const label = labelOf ? labelOf(sp) : sp.nm;
                layer.addInterval(sp.x1, sp.x2, y, label);
                try { layer.setIntervalColor(sp.x1, sp.x2, y, label, color(sp)); } catch (e) { }
            }
            return (layer.intervals || []).length;
        };

        let done = 0, skipped = 0, empty = 0, already = 0, failed = 0;
        const per = [];

        for (let n = 0; n < list.length; n++) {
            const t = list[n];
            const label = (t && t.name) || ('track ' + (n + 1));

            if (!o.redo && hasLayer(t, MOTIF_SUFFIX)) { already++; continue; }

            const cds = proteinOf(t);
            if (!cds) { skipped++; continue; }

            const protein = '' + cds.protein;
            const posOf = (aa) => (aa >= 1 && aa <= cds.codonPos.length) ? cds.codonPos[aa - 1] : -1;
            // A residue is three bases; +2 takes in the rest of the last codon. codonPos
            // runs 3'->5' on a minus-strand track, so the span is ordered rather than assumed.
            const spanOf = (a, b) => {
                const x = posOf(a), y = posOf(b);
                if (x < 0 || y < 0) return null;
                return { x1: Math.min(x, y), x2: Math.max(x, y) + 2 };
            };

            const vars = variantsOf(t);
            tick('Linear motifs · ' + label + '   ' + (n + 1) + '/' + list.length);

            let res = null;
            try {
                const host = (window['env'] && window['env']['apiUrl']) ? window['env']['apiUrl'] : '';
                res = await exec(host + '/py/bio/protein/slim-scan.py',
                    protein, vars.join(','), '' + minScore, '' + (o.accession || ''));
                if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e) { } }
            } catch (e) { console.warn('[slim-motif-layer]', label, e); }

            if (!res || typeof res !== 'object') { failed++; continue; }
            if (res.error) {
                // A host without the ELM tables is a deployment problem, not a quiet nothing.
                console.warn('[slim-motif-layer]', label, res.error);
                say('Linear motifs: ' + res.error);
                failed++; continue;
            }
            const J = (k, d) => { try { return JSON.parse(res[k]); } catch (e) { return d; } };
            const motifs = J('motifs', []), gained = J('gained', []), lost = J('lost', []);
            const meta = J('meta', {});

            if (o.redo) { dropLayer(t, MOTIF_SUFFIX); dropLayer(t, GAIN_SUFFIX); dropLayer(t, LOSS_SUFFIX); }
            if (!motifs.length && !gained.length && !lost.length) { empty++; continue; }

            const lo = Math.min(t.xi, t.xf), hi = Math.max(t.xi, t.xf);
            const mk = (suffix, color, barPx) => {
                const layer = new TrackLayer(label + suffix, lo, 0, hi, 1);
                layer.type = 'TrackLayer';
                layer.data_type = DATA_TYPE;
                layer.drawStyle = 'interval';
                layer.color = color; layer.fillstyle = color;
                try { layer.setLabelFont('10px Arial'); } catch (e) { }
                // A motif map is worth having with a whole gene in view, which is two orders
                // of magnitude below the default label threshold. Same reason as the domains:
                // this layer's whole content IS its labels.
                layer.labelZoomThreshold = 0;
                layer.avoidLabelOverlap = true;
                layer.barHeightPx = barPx;
                return layer;
            };

            // ---- motifs present in the protein --------------------------------------------
            let nM = 0, mlayer = null;
            if (motifs.length) {
                mlayer = mk(MOTIF_SUFFIX, 'rgba(120,130,150,0.18)', 9);
                mlayer.laneStep = 0.18;
                const spans = [];
                for (const m of motifs) {
                    const s = spanOf(m.start, m.end);
                    if (s) spans.push({ x1: s.x1, x2: s.x2, nm: m.elm, score: m.score, pep: m.peptide, a: m.start, b: m.end });
                }
                nM = lanes(mlayer, spans, 0.46, 0.18,
                    (sp) => colorOf(sp.nm, 0.22), (sp) => sp.nm);
                if (nM) { try { t.addLayer(mlayer); } catch (e) { } }
            }

            // ---- motifs the variant CREATES -----------------------------------------------
            // Drawn loud, on its own row above the rest, because it is the only thing on this
            // track that is a claim about the variant rather than about the protein.
            let nG = 0, glayer = null;
            if (gained.length) {
                glayer = mk(GAIN_SUFFIX, 'rgba(176,53,43,0.42)', 13);
                glayer.laneStep = 0.20;
                const spans = [];
                for (const m of gained) {
                    const s = spanOf(m.start, m.end);
                    if (s) spans.push({ x1: s.x1, x2: s.x2, nm: m.elm, v: m.variant, score: m.score });
                }
                nG = lanes(glayer, spans, 1.02, 0.20,
                    () => 'rgba(176,53,43,0.42)',
                    (sp) => (sp.v ? (sp.v + ' → ') : '') + sp.nm);
                if (nG) { try { t.addLayer(glayer); } catch (e) { } }
            }

            // ---- motifs the variant DESTROYS ----------------------------------------------
            let nL = 0, llayer = null;
            if (lost.length) {
                llayer = mk(LOSS_SUFFIX, 'rgba(60,110,170,0.34)', 13);
                llayer.laneStep = 0.20;
                const spans = [];
                for (const m of lost) {
                    const s = spanOf(m.start, m.end);
                    if (s) spans.push({ x1: s.x1, x2: s.x2, nm: m.elm, v: m.variant });
                }
                nL = lanes(llayer, spans, 0.80, 0.20,
                    () => 'rgba(60,110,170,0.34)',
                    (sp) => (sp.v ? (sp.v + ' ✕ ') : '') + sp.nm);
                if (nL) { try { t.addLayer(llayer); } catch (e) { } }
            }

            // ---- the label above the track, and the "?" behind it -------------------------
            // meta.caveats comes from the backend and is copied in whole. The point of
            // sending them with the numbers is that no screen can show the numbers without
            // them; dropping them here would defeat that.
            const anchor = mlayer || glayer || llayer;
            if (anchor) {
                const all = [].concat(
                    (mlayer && mlayer.intervals) || [], (glayer && glayer.intervals) || [],
                    (llayer && llayer.intervals) || []);
                const span = all.length ? [Math.min(...all.map((v) => v.x1)), Math.max(...all.map((v) => v.x2))] : null;
                const rows = [];
                if (nG) rows.push(['gained (red)', plural(nG, 'motif') + ' that the variant CREATES. '
                    + 'Their scores are an upper bound: conservation belongs to the residue that was replaced.']);
                if (nL) rows.push(['lost (blue)', plural(nL, 'motif') + ' that the variant DESTROYS.']);
                rows.push(['grey bars', plural(nM, 'motif') + ' in the protein scoring at least ' + minScore
                    + ', out of ' + (res.n || 0) + ' candidate instances found.']);
                rows.push(['what a bar is', 'A regex match from the ELM catalogue, placed on the codons that encode it. '
                    + 'Overlapping matches stack upward, one lane each.']);
                rows.push(['the score', 'An ordering among candidates, not a probability that a motif is real. '
                    + (meta.scoring === 'model' ? 'Scored by the trained model.'
                        : 'NO MODEL ON THIS HOST: ordered by pattern rarity alone, which is much weaker.')]);
                for (const c of (meta.caveats || [])) rows.push(['', '' + c]);
                anchor.decor = {
                    callout: {
                        text: 'Linear motifs: ' + plural(nM, 'motif')
                            + (nG ? ('  ·  ' + nG + ' gained (score is an upper bound)') : '')
                            + (nL ? ('  ·  ' + nL + ' lost') : ''),
                        x0: span ? span[0] : lo, x1: span ? span[1] : hi,
                        color: nG ? 'rgba(176,53,43,0.95)' : 'rgba(90,100,120,0.95)'
                    },
                    help: {
                        title: 'Linear motifs: short recognition tags in this protein',
                        rows: rows,
                        note: 'Source: the ELM catalogue of experimentally validated motif classes, '
                            + 'matched against this track\'s own translation and re-ranked by slimrank. '
                            + 'A match means the sequence fits a known pattern. It does not show the motif '
                            + 'is used, and most matches in any protein are not.'
                    }
                };
            }

            per.push({ track: label, motifs: nM, gained: nG, lost: nL, variants: vars });
            done++;
        }

        clearTick();
        const totG = per.reduce((a, p) => a + p.gained, 0);
        const totL = per.reduce((a, p) => a + p.lost, 0);
        say('Linear motifs: ' + done + ' track' + (done === 1 ? '' : 's')
            + (totG ? (' · ' + totG + ' gained') : '')
            + (totL ? (' · ' + totL + ' lost') : '')
            + (already ? (' · ' + already + ' already mapped') : '')
            + (skipped ? (' · ' + skipped + ' without a protein') : '')
            + (failed ? (' · ' + failed + ' failed') : ''));
        return { done: done, skipped: skipped, empty: empty, already: already, failed: failed, per: per };
    })();
}
