function (graph, genegraph_panel_layout, presetTrack, presetRange, presetModel) {
    // Secretion probability profile — send a track's protein to py/bio/protein/
    // secretion-profile.py and draw the score along the sequence, as a filled curve
    // with a smooth polynomial fitted over it.
    //
    // The model classifies WHOLE proteins, so a per-residue value has to be defined
    // rather than read off it. The curve is "if the protein began at this residue,
    // would it look secreted?" — which peaks over signal peptides and signal anchors.
    // It is secretory-signal strength, NOT a claim that the residue is exported, and it
    // does not separate secreted proteins from ER- or membrane-retained ones. The
    // python side returns those caveats in `notes` and they are shown to the user.
    //
    // Tracks are nucleotide, so the peptide comes from the track itself: this.orf.cdsi,
    // the codons the editor draws as the amino-acid row, read with the same rule as
    // track.getPeptideFromORF(). With a sequence selected the run scores the peptide
    // inside that selection; a selection holding no peptide scores nothing rather than
    // widening to the whole track. Raw bases are never translated on a guessed frame.
    return new Promise((resolve) => {

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const resetModelsToolbar = () => {
            try { exec('baja/ml/predictive-models-toolbar.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const restoreEditor = () => {
            try {
                if (CurrentLayout.getStashed && CurrentLayout.getStashed('mainPanel')) {
                    CurrentLayout.reset('mainPanel');
                    return;
                }
            } catch (e) { }
            try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
            try { if (genegraph_panel_layout) CurrentLayout.setComponent('mainPanel', genegraph_panel_layout); } catch (e) { }
        };

        // graph.setMessage() is SUPPRESSED while any error or result toast is on screen
        // (flexigraph/gene.js:1567), and a message without a trailing ellipsis also clears
        // the work badge. So progress goes through setMessage WITH an ellipsis, and every
        // outcome — including every early return — goes through setResultMessage, which
        // always draws. Reporting failures through setMessage is why this looked inert.
        const say = (m) => {
            try { log('[secretion] ' + m); } catch (e) { }
            try { graph.setMessage(' ' + m + '… '); } catch (e) { }
        };
        const done = (m) => {
            try { log('[secretion] ' + m); } catch (e) { }
            try { graph.setResultMessage(' ' + m + ' '); }
            catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } }
        };

        const MIN_RESIDUES = 30;   // the model's floor; shorter is not scored
        const WINDOW_AA = 70;      // residues per scored window
        const STEP_AA = 3;         // residues between windows
        const POLY_DEGREE = 8;     // degree of the smooth overlay
        const MODEL = ('' + (presetModel || 'light_hm')) || 'light_hm';

        const __presetList = Array.isArray(presetTrack)
            ? presetTrack.filter(Boolean)
            : (presetTrack ? [presetTrack] : []);

        const pickedTrack = () => {
            if (__presetList.length === 1) return __presetList[0];
            try {
                const sel = (graph.track || []).filter((t) => t && t.showResizeBar);
                if (sel.length === 1) return sel[0];
            } catch (e) { }
            return null;
        };
        // Each track's own selection. selectedRange() resolves both mark conventions;
        // reading markstart raw is right for one and silently wrong for the other.
        const ownRange = (t) => {
            try { return (t && t.selectedRange && t.selectedRange()) || null; } catch (e) { return null; }
        };
        const pickedRange = (t) => presetRange || ownRange(t);

        // The peptide to score, and where each residue sits in track coordinates.
        //
        // Source is the TRACK'S OWN peptide — this.orf.cdsi, the same codons the editor
        // draws as the amino-acid row and the same ones track.getPeptideFromORF() returns.
        // The selection rule is copied from that accessor exactly (a codon counts when its
        // third base falls inside the selected range, and START/STOP tokens are skipped),
        // so the layer scores the residues the user can see selected, not a separately
        // recomputed translation that could disagree with them.
        //
        // Positions come from the SAME codon entries, taking each codon's first base, so
        // the curve lands on the codon it was scored from even across exon boundaries.
        //
        // No selection scores the whole peptide. A selection holding no peptide scores
        // nothing. Raw bases are never translated on a guessed frame.
        //
        // Returns { protein, posMap, source } or { error }.
        const codonsOf = (track) => {
            let cdsi = null;
            try { cdsi = track && track.orf && track.orf.cdsi; } catch (e) { cdsi = null; }
            if (!cdsi || !cdsi.length) {
                // getPeptideFromORF() warns "run generateORF() first" and returns ''. A
                // track whose ORF has not been built yet is the ordinary case after a load,
                // so build it once rather than reporting the track has no peptide.
                try { if (track && track.generateORF) track.generateORF(); } catch (e) { }
                try { cdsi = track && track.orf && track.orf.cdsi; } catch (e) { cdsi = null; }
            }
            if (!cdsi || !cdsi.length) return null;
            // Group the per-base entries into codons: aa from the ci===2 entry, as
            // getPeptideFromORF reads it; x from the ci===0 entry where there is one.
            const first = {}, out = [];
            for (const c of cdsi) {
                if (!c) continue;
                if (c.ci === 0 && first[c.codon_index] == null) first[c.codon_index] = +c.index;
            }
            for (const c of cdsi) {
                if (!c || c.ci !== 2) continue;
                if (!c.aa || ('' + c.aa).length !== 1) continue;      // skips START / STOP
                const x = (first[c.codon_index] != null) ? first[c.codon_index] : +c.index;
                out.push({ aa: '' + c.aa, x: x, mark: +c.index });
            }
            return out.length ? out : null;
        };

        const proteinFor = (track, range) => {
            const codons = codonsOf(track);
            if (!codons) return { error: 'no-peptide' };
            let use = codons;
            if (range) {
                const lo = Math.min(+range.start, +range.end);
                const hi = Math.max(+range.start, +range.end);
                // Same test as getPeptideFromORF: the codon's own index inside the range.
                use = codons.filter((c) => c.mark >= lo && c.mark <= hi);
                if (!use.length) return { error: 'no-peptide-in-selection' };
            }
            if (use.length < MIN_RESIDUES) {
                return { error: range ? 'short-selection' : 'short-peptide', n: use.length };
            }
            return {
                protein: use.map((c) => c.aa).join(''),
                posMap: use.map((c) => c.x),
                source: range ? ('the peptide within the selection, ' + use.length + ' residues')
                              : "the track's peptide"
            };
        };

        const runOnTrack = async (track, range) => {
            try {
                const got = proteinFor(track, range);
                const who = (track && track.name) || 'that track';
                if (!got || got.error) {
                    const why = {
                        'no-peptide': 'There is no peptide on ' + who + ', so there is nothing to score.',
                        'short-peptide': 'The peptide on ' + who + ' is ' + (got && got.n)
                            + ' residues; the model needs ' + MIN_RESIDUES + '.',
                        'no-peptide-in-selection': 'That selection on ' + who + ' contains no peptide, '
                            + 'so nothing was scored.',
                        'short-selection': 'That selection covers ' + (got && got.n)
                            + ' residues of peptide; the model needs ' + MIN_RESIDUES + '.'
                    }[(got && got.error) || 'no-peptide'];
                    done(why);
                    try { exec('baja/lib/work-status.js', null); } catch (e) { }
                    restoreHover(); return false;
                }

                const __where = (track.name || 'track')
                    + (range ? (' · selection') : ' · whole track');
                const __say = (phase) => {
                    try { exec('baja/lib/work-status.js', 'Secretion · ' + __where + (phase ? ('  ·  ' + phase) : '')); } catch (e) { }
                };
                // A fixed 70-residue window over a 60-residue selection gives exactly one
                // window, i.e. a flat line and no profile at all. Shrink the window for
                // short runs so there is a curve to read, never below the model's floor.
                const n = got.posMap.length;
                const win = Math.max(MIN_RESIDUES, Math.min(WINDOW_AA, Math.floor(n / 2)));

                __say('scoring ' + n.toLocaleString() + ' residues');
                say('Secretion model on ' + (track.name || 'track') + ': scoring '
                    + got.posMap.length.toLocaleString() + ' residues');

                const server = window['env']['apiUrl'];
                let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); __say('' + m); } catch (e) { } });
                // xi is sent as 0 so the returned positions are 0-based RESIDUE offsets,
                // which are mapped to track coordinates here through posMap. Letting the
                // python side do the arithmetic would assume three bases per residue and
                // put every layer on a spliced track in the wrong place.
                const data = await exec(server + '/py/bio/protein/secretion-profile.py', em,
                    '' + got.protein, '0',
                    '' + win, '' + STEP_AA, '' + POLY_DEGREE, '1', MODEL);

                if (data && data.error) {
                    done('Secretion model: ' + data.error);
                    try { exec('baja/lib/work-status.js', null); } catch (e) { }
                    restoreHover(); return false;
                }
                let prof = [], poly = [], notes = [], peak = {}, thresholds = {};
                try { prof = JSON.parse((data && data.profile) || '[]'); } catch (e) { prof = []; }
                try { poly = JSON.parse((data && data.poly) || '[]'); } catch (e) { poly = []; }
                try { notes = JSON.parse((data && data.notes) || '[]'); } catch (e) { notes = []; }
                try { peak = JSON.parse((data && data.peak) || '{}'); } catch (e) { peak = {}; }
                try { thresholds = JSON.parse((data && data.thresholds) || '{}'); } catch (e) { thresholds = {}; }
                if (!prof.length) {
                    done('The secretion model returned no profile for that track.');
                    restoreHover(); return false;
                }

                // Residue offset -> track coordinate.
                const at = (i) => {
                    const k = Math.max(0, Math.min(got.posMap.length - 1, Math.floor(i)));
                    return +got.posMap[k];
                };

                // Introns. Consecutive codons sit 3 bases apart; a bigger jump in the codon
                // map is an intron the peptide skipped. Without this the polyline runs
                // straight across an intron at whatever height the flanking exons had,
                // drawing a confident score over sequence the model never saw.
                const gaps = [];
                {
                    const pm = got.posMap;
                    const plus = (+pm[pm.length - 1] >= +pm[0]);
                    for (let i = 1; i < pm.length; i++) {
                        const a = +pm[i - 1], b = +pm[i];
                        if (Math.abs(b - a) <= 3) continue;
                        const glo = plus ? (a + 3) : (b + 1);
                        const ghi = plus ? (b - 1) : (a - 3);
                        if (ghi > glo) gaps.push([glo, ghi]);
                    }
                }
                // Walk the points in x order and drop to the baseline across each intron.
                const withGaps = (pts) => {
                    if (!gaps.length) return pts;
                    const sorted = pts.slice().sort((u, v) => u[0] - v[0]);
                    const ordered = gaps.slice().sort((u, v) => u[0] - v[0]);
                    const out = [];
                    let g = 0;
                    for (const pt of sorted) {
                        while (g < ordered.length && ordered[g][1] < pt[0]) {
                            out.push([ordered[g][0], 0], [ordered[g][1], 0]);
                            g++;
                        }
                        // a point inside an intron cannot carry a score
                        if (g < ordered.length && pt[0] >= ordered[g][0] && pt[0] <= ordered[g][1]) continue;
                        out.push(pt);
                    }
                    for (; g < ordered.length; g++) out.push([ordered[g][0], 0], [ordered[g][1], 0]);
                    return out;
                };

                const TrackLayer = await exec('baja/bio/track-layer.js');
                const tg = track.tgraph;
                const lo = Math.min(tg.xmin, tg.xmax), hi = Math.max(tg.xmin, tg.xmax);

                // The layer's frame must be the WHOLE track, not the scored span, or it
                // does not line up with the bases underneath it.
                const curve = new TrackLayer((track.name || 'track') + '_secretion', lo, 0, hi, 1);
                curve.data_type = 'secretion';
                curve.polygon_type = 'fill';
                curve.color = 'rgba(38,120,180,0.16)';
                curve.fillstyle = 'rgba(38,120,180,0.28)';
                const curvePts = withGaps(prof.map((p) => [at(p[0]), Math.max(0, Math.min(1, +p[1]))]));
                const firstX = curvePts.length ? curvePts[0][0] : lo;
                const lastX = curvePts.length ? curvePts[curvePts.length - 1][0] : hi;
                curve.addPolygonPoint(lo, 0);
                if (firstX > lo) curve.addPolygonPoint(firstX, 0);
                for (const p of curvePts) curve.addPolygonPoint(p[0], p[1]);
                if (lastX < hi) curve.addPolygonPoint(lastX, 0);
                curve.addPolygonPoint(hi, 0);
                curve.sortPolygonPoints();
                track.addLayer(curve);

                // The polynomial, as a line over the same frame.
                if (poly.length > 2) {
                    const fit = new TrackLayer((track.name || 'track') + '_secretion_fit', lo, 0, hi, 1);
                    fit.data_type = 'secretion:poly';
                    fit.polygon_type = 'line';
                    fit.color = 'rgba(200,60,40,0.95)';
                    fit.fillstyle = 'rgba(200,60,40,0.95)';
                    for (const p of withGaps(poly.map((q) => [at(q[0]), Math.max(0, Math.min(1, +q[1]))])))
                        fit.addPolygonPoint(p[0], p[1]);
                    fit.sortPolygonPoints();
                    track.addLayer(fit);
                }

                // Mark the strongest window, which is the part a reader should look at.
                const th = (thresholds && thresholds.precision90 != null) ? +thresholds.precision90 : 0.9;
                if (peak && peak.value != null && +peak.value >= 0.5) {
                    const pr = Math.max(0, (+peak.residue || 1) - 1);
                    const x0 = at(pr), x1 = at(pr + Math.min(WINDOW_AA, got.posMap.length - 1 - pr));
                    curve.addInterval(Math.min(x0, x1), Math.max(x0, x1), +peak.value,
                        'secretion ' + (+peak.value).toFixed(2),
                        'rgba(38,120,180,' + (0.25 + 0.45 * +peak.value).toFixed(2) + ')');
                }
                if (curve.setTimedHighlight) curve.setTimedHighlight(8000);
                setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 8100);
                if (graph.wake) graph.wake();

                const pw = (data && data.p_whole != null) ? (+data.p_whole).toFixed(3) : '?';
                // "not secreted" for a 0.93 read as a contradiction. The threshold is the
                // one whose held-out precision was 90%, so say what the number is relative
                // to rather than turning a probability into a bare verdict.
                const verdict = (data && data.p_whole != null)
                    ? ((+data.p_whole >= th) ? 'above' : 'below') + ' the '
                        + (+th).toFixed(2) + ' high-confidence cut'
                    : 'no score';
                const __msg = ' Secretion profile on ' + (track.name || 'track') + ' from ' + got.source
                    + ': ' + pw + ', ' + verdict + '. Peak '
                    + ((peak && peak.value != null) ? (+peak.value).toFixed(2) : '?')
                    + ' at residue ' + ((peak && peak.residue) || '?') + '.'
                    + (nAnn ? (' Signal region annotated'
                        + (nAnn > 1 ? (' in ' + nAnn + ' exonic pieces') : '') + '.') : '')
                    + (gaps.length ? (' Drops to zero across ' + gaps.length + ' intron'
                        + (gaps.length === 1 ? '' : 's') + '.') : '') + ' ';
                try { graph.setResultMessage(__msg); } catch (e) { graph.setMessage(__msg); }
                // The caveats travel with the result rather than living only in the docs,
                // because a tall peak on a retained protein looks exactly like a secreted one.
                try { if (notes.length) log(notes.join('  ')); } catch (e) { }
                resetModelsToolbar();
                try { exec('baja/lib/work-status.js', null); } catch (e) { }
                restoreHover();
                return true;
            } catch (e) {
                done('Secretion model error: ' + e);
            }
            try { exec('baja/lib/work-status.js', null); } catch (e) { }
            restoreHover();
            return false;
        };

        const runAllTracks = (list) => {
            let all = [];
            try {
                all = (Array.isArray(list) && list.length ? list : (graph.track || []))
                    .filter((t) => t && (t.grid || t.tgraph));
            } catch (e) { }
            if (!all.length) { done('No tracks on the canvas to run on.'); return; }
            try { graph.pushOntoHistory(); } catch (e) { }
            (async () => {
                let done = 0;
                for (let i = 0; i < all.length; i++) {
                    try {
                        window.__workStatus = 'Secretion · ' + ((all[i] && all[i].name) || ('track ' + (i + 1)))
                            + ' · ' + (i + 1) + ' of ' + all.length + '…';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    } catch (e) { }
                    try { if (await runOnTrack(all[i], ownRange(all[i]))) done++; } catch (e) { }
                }
                try {
                    window.__workStatus = '';
                    if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                } catch (e) { }
                const __msg = ' Secretion profile applied to ' + done + ' of ' + all.length
                    + ' track' + (all.length === 1 ? '' : 's') + '. ';
                try { graph.setResultMessage(__msg); } catch (e) { graph.setMessage(__msg); }
            })();
        };

        const arm = () => {
            graph.clearMouseListeners();
            if (__presetList.length > 1) {
                try { graph.setMouseMode('navigate'); } catch (e) { }
                restoreEditor();
                try { window.__bajaApplyAllTracks = false; } catch (e) { }
                runAllTracks(__presetList);
                return;
            }
            let __all = false;
            try { __all = !!window.__bajaApplyAllTracks; window.__bajaApplyAllTracks = false; } catch (e) { }
            if (__all) { try { graph.setMouseMode('navigate'); } catch (e) { } restoreEditor(); runAllTracks(); return; }

            // restoreEditor() first, and only then arm the listener. editor.js patches
            // CurrentLayout.reset() to re-arm mouse-over-highlight, which REPLACES the
            // mouse-down listener; arming before restoring meant the click that was being
            // waited for went to the hover handler instead and the run never started. The
            // timeout lets the remount settle before the listener is put back.
            restoreEditor();

            const pt = pickedTrack();
            if (pt) {
                try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
                const pr = pickedRange(pt);
                say('Secretion model on ' + (pt.name || 'the selected track')
                    + (pr ? ' (selected sequence)' : ' (whole track)'));
                runOnTrack(pt, pr);
                return;
            }

            // Nothing selected: say so plainly and wait for a click. Silence here read as
            // "the button does nothing", because the prompt lives in the mouse-mode line
            // that a user who has just clicked a menu item is not looking at.
            done('Secretion profile: click a track to add the layer.');
            setTimeout(() => {
                try {
                    graph.clearMouseListeners();
                    graph.setMouseMode('msg: Click on a track to add a secretion profile');
                    graph.addMouseDownListener(async (x, y) => {
                        const ti = graph.getTrack(x, y);
                        if (ti < 0) return;
                        const track = graph.track[ti];
                        graph.clearMouseListeners();
                        graph.setMouseMode('navigate');
                        await runOnTrack(track, ownRange(track));
                    });
                } catch (e) { done('Secretion profile could not arm: ' + e); }
            }, 150);
        };

        // Proof of life. "Nothing happened" could not be told apart from "the module
        // never loaded", so the run says it started before it does anything else.
        try { log('[secretion] module loaded, ' + __presetList.length + ' preset track(s)'); } catch (e) { }

        // A throw in arm() would otherwise reject this promise into a caller that does not
        // catch, which is indistinguishable from the button doing nothing.
        try { arm(); } catch (e) { done('Secretion profile failed to start: ' + e); }
        resolve(true);
    });
}
