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
    // Tracks are nucleotide, so the protein comes from the track's OWN reading frame
    // via getCDS() — exon-aware and splice-correct. The ORF is the only source: with a
    // sequence selected, the run scores the ORF inside that selection, and a selection
    // holding no ORF scores nothing rather than widening to the whole track. Raw bases
    // are never translated here, because a guessed frame would draw a confident curve
    // on the wrong reading frame and run straight through introns.
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

        // The protein to score, and where each residue sits in track coordinates.
        //
        // The ORF is the only source. A selection is intersected with it: a codon counts
        // when its first base falls inside the selected range. If the selection holds no
        // ORF, the run stops — it does not widen to the whole track and it does not fall
        // back to translating raw bases, because a frame guessed off an arbitrary start
        // would put a confident-looking curve on the wrong reading frame.
        //
        // Returns { protein, posMap, source } or { error } describing why there is nothing
        // to score. posMap[i] is the track coordinate of residue i.
        const proteinFor = (track, range) => {
            let cds = null;
            try { cds = track.getCDS ? track.getCDS() : null; } catch (e) { cds = null; }
            if (!cds || !cds.protein || !cds.protein.length
                || !cds.codonPos || cds.codonPos.length !== cds.protein.length) {
                return { error: 'no-orf' };
            }
            if (!range) {
                if (cds.protein.length < MIN_RESIDUES) {
                    return { error: 'short-orf', n: cds.protein.length };
                }
                return {
                    protein: cds.protein, posMap: cds.codonPos.slice(),
                    source: "the track's ORF"
                };
            }
            const lo = Math.min(+range.start, +range.end);
            const hi = Math.max(+range.start, +range.end);
            const aa = [], pos = [];
            for (let i = 0; i < cds.protein.length; i++) {
                const p = +cds.codonPos[i];
                if (p >= lo && p <= hi) { aa.push(cds.protein[i]); pos.push(p); }
            }
            if (!aa.length) return { error: 'no-orf-in-selection' };
            if (aa.length < MIN_RESIDUES) return { error: 'short-selection', n: aa.length };
            return {
                protein: aa.join(''), posMap: pos,
                source: 'the ORF within the selection, ' + aa.length + ' residues'
            };
        };

        const runOnTrack = async (track, range) => {
            try {
                const got = proteinFor(track, range);
                const who = (track && track.name) || 'that track';
                if (!got || got.error) {
                    const why = {
                        'no-orf': 'There is no ORF on ' + who + ', so there is no protein to score.',
                        'short-orf': 'The ORF on ' + who + ' is ' + (got && got.n)
                            + ' residues; the model needs ' + MIN_RESIDUES + '.',
                        'no-orf-in-selection': 'That selection on ' + who + ' contains no ORF, '
                            + 'so nothing was scored.',
                        'short-selection': 'That selection covers ' + (got && got.n)
                            + ' ORF residues; the model needs ' + MIN_RESIDUES + '.'
                    }[(got && got.error) || 'no-orf'];
                    done(why);
                    try { exec('baja/lib/work-status.js', null); } catch (e) { }
                    restoreHover(); return false;
                }

                const __where = (track.name || 'track')
                    + (range ? (' · selection') : ' · whole track');
                const __say = (phase) => {
                    try { exec('baja/lib/work-status.js', 'Secretion · ' + __where + (phase ? ('  ·  ' + phase) : '')); } catch (e) { }
                };
                __say('scoring ' + got.posMap.length.toLocaleString() + ' residues');
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
                    '' + WINDOW_AA, '' + STEP_AA, '' + POLY_DEGREE, '1', MODEL);

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
                const firstX = at(prof[0][0]), lastX = at(prof[prof.length - 1][0]);
                curve.addPolygonPoint(lo, 0);
                if (firstX > lo) curve.addPolygonPoint(firstX, 0);
                for (const p of prof) curve.addPolygonPoint(at(p[0]), Math.max(0, Math.min(1, +p[1])));
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
                    for (const p of poly) fit.addPolygonPoint(at(p[0]), Math.max(0, Math.min(1, +p[1])));
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
                const verdict = (data && data.p_whole != null && +data.p_whole >= th)
                    ? 'secreted' : 'not secreted';
                const __msg = ' Secretion profile on ' + (track.name || 'track') + ' from ' + got.source
                    + ': whole sequence ' + pw + ' (' + verdict + '), peak '
                    + ((peak && peak.value != null) ? (+peak.value).toFixed(2) : '?')
                    + ' at residue ' + ((peak && peak.residue) || '?') + '. ';
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
