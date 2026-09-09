function (graph, genegraph_panel_layout, presetTrack, presetSite) {
    // Cis-regulatory attribution — pick the tool, click a point on a track, and get
    // the sequence around the nearest splice site scored window by window: which
    // stretches HOLD THE SITE UP and which PUSH IT DOWN.
    //
    //   exec('baja/bio/splicing/cis-attribution.js', graph, genegraph_panel_layout)
    //
    // Each window is scrambled with its dinucleotide composition preserved and the
    // site rescored (py/bio/splice/cis-profile.py -> bajasplice.cis). The bar is the
    // signed change in the site's log-odds:
    //
    //     up / teal   the native sequence there SUPPORTS the site
    //     down / red  the native sequence there SUPPRESSES it
    //
    // Drawn as a diverging interval layer: a bar's y is its signed impact and the
    // renderer anchors bars at the layer's y = 0, so a layer built with ymin = -1
    // gives a zero line through the middle of the track with no custom painter.
    return new Promise(async (resolve) => {

        // How far each side, in nt. The ctx-2000 model physically cannot see past
        // 1000 nt, so anything larger is clamped by the backend rather than drawn
        // as a flat line that would read as "no regulatory content out here".
        let cis_window = 500;
        let cis_bin = 50;

        const SUPPORT = [15, 110, 123];     // teal
        const SUPPRESS = [163, 64, 44];     // red

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const resetModelsToolbar = () => {
            try { exec('baja/ml/predictive-models-toolbar.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        // Put the tool away. setMouseMode() already clears the listener arrays and
        // re-arms hover, so clearMouseListeners() as well would race a second install.
        const release = () => {
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
        };

        // Which strand does a MINUS-strand track's string hold? Same two conventions
        // splicing-profile.js has to disambiguate: the server's pre-mRNA payload is the
        // plus-strand genomic slice ('plus'), while the older Ensembl loader stored the
        // coding strand laid out by ascending x ('coding'). Decided from the annotated
        // exon boundaries — at each intron the plus-strand text reads AC before the exon
        // and CT after it, the coding-strand text reads TG and GA.
        const orientationOf = (track, seq) => {
            if (!(+track.strand < 0) || !track.getExons || typeof seq !== 'string') return 'plus';
            try {
                let plusHits = 0, codingHits = 0;
                const at = (x) => {
                    const i = Math.floor(x) - Math.floor(+track.xi);
                    return (i >= 0 && i < seq.length) ? seq[i].toUpperCase() : '';
                };
                for (const e of (track.getExons() || [])) {
                    const lo = Math.min(+e.xi, +e.xf), hi = Math.max(+e.xi, +e.xf);
                    const donor = at(lo - 2) + at(lo - 1);
                    const acceptor = at(hi + 1) + at(hi + 2);
                    if (donor === 'AC') plusHits++; else if (donor === 'TG') codingHits++;
                    if (acceptor === 'CT') plusHits++; else if (acceptor === 'GA') codingHits++;
                }
                if (codingHits > plusHits) return 'coding';
            } catch (e) { }
            return 'plus';
        };

        // Only the sequence the model can actually reach needs sending, plus the window
        // itself: site +/- (receptive field + requested window). Sending a whole
        // chromosome-scale track would be pointless traffic, and cutting it too close
        // would silently pad the profile with N and report zero impact out there.
        const cutFor = (track, site, halfSpan) => {
            const lo = Math.min(+track.xi, +track.xf), hi = Math.max(+track.xi, +track.xf);
            const start = Math.max(lo, Math.floor(site) - halfSpan);
            const end = Math.min(hi, Math.ceil(site) + halfSpan);
            let seq = null;
            try { seq = track.getSequenceRange ? track.getSequenceRange(start, end) : null; } catch (e) { }
            if (!seq || !seq.length) {
                seq = track.sequence || '';
                return { seq: seq, xi: lo };
            }
            return { seq: seq, xi: start };
        };

        const runAt = async (track, site, which) => {
            try {
                // Ask BEFORE anything else, and release the tool first so the canvas is
                // not still armed while a modal dialog is open.
                const va = await prompt(
                    'Cis-regulatory window',
                    ['Window (nt each side)', 'Bin size (nt)'],
                    { 'Window (nt each side)': cis_window, 'Bin size (nt)': cis_bin },
                    360, 320);
                // Cancel resolves undefined. Running with the defaults instead would
                // start a scoring job the user just declined.
                if (!va) { graph.setMessage(' '); return false; }
                const w = parseInt(va['Window (nt each side)']);
                const b = parseInt(va['Bin size (nt)']);
                if (isFinite(w) && w > 0) cis_window = w;
                if (isFinite(b) && b >= 4) cis_bin = b;
                // Half the bin steps the windows, so neighbouring bars overlap and a
                // narrow element is not missed by falling between two bins.
                const step = Math.max(1, Math.floor(cis_bin / 2));

                const cut = cutFor(track, site, cis_window + 1100);
                if (!cut.seq || !cut.seq.length) {
                    graph.setMessage(' That track has no sequence to profile. ');
                    return false;
                }
                const strand = '' + (track.strand != null ? track.strand : 1);
                const orientation = orientationOf(track, cut.seq);

                const __where = (track.name || 'track') + ' · ' + which + ' at ' + site;
                const __say = (phase) => {
                    try {
                        exec('baja/lib/work-status.js',
                            'BajaSplice · cis-regulatory windows → ' + __where + (phase ? ('  ·  ' + phase) : ''));
                    } catch (e) { }
                };
                __say('scrambling ±' + cis_window + ' nt');

                graph.setMessage(' Running cis-regulatory model… ');
                const server = window['env']['apiUrl'];
                let em = new EngineMonitor((m) => {
                    try { log(m); graph.setMessage(' ' + m + ' '); __say('' + m); } catch (e) { }
                });
                const data = await exec(server + '/py/bio/splice/cis-profile.py', em,
                    '' + cut.seq, '' + cut.xi, strand, '' + site, which,
                    '' + cis_window, orientation, '' + cis_bin, '' + step, '6');

                if (data && data.error) {
                    graph.setMessage(' Cis-regulatory error: ' + data.error + ' ');
                    return false;
                }
                let windows = [];
                try { windows = JSON.parse((data && data.windows) || '[]'); } catch (e) { windows = []; }
                // Windows sitting in the pad past the end of a short track scrambled
                // nothing. They score exactly zero, which would draw as "no regulatory
                // content" when it means "no sequence" — so they are dropped, not plotted.
                const nRaw = windows.length;
                windows = windows.filter((w) => w && +w[4] > 0);
                try {
                    log('cis: ' + nRaw + ' windows returned, ' + windows.length
                        + ' with sequence, ref=' + (data && data.ref)
                        + ', site=' + site + ' ' + which);
                } catch (e) { }
                if (!windows.length) {
                    graph.setMessage(' No sequence within ±' + cis_window + ' nt of that site to profile. ');
                    return false;
                }

                // Drawn ON the sequence line: every bar is rooted at the layer's Y(0),
                // which is the y the track writes its bases at, so support rises off the
                // sequence and suppression hangs below it.
                const CisLayer = await exec('baja/bio/splicing/cis-layer.js');
                const tg = track.tgraph;
                const name = 'Cis:' + which + '@' + site;
                const layer = new CisLayer((track.name || 'track') + '_' + name,
                    tg.xmin, tg.xmax, site, which, track);
                layer.refScore = (data && data.ref != null) ? +data.ref : null;
                layer.color = 'rgba(' + SUPPORT.join(',') + ',0.25)';
                layer.fillstyle = layer.color;
                layer.supportRGB = SUPPORT;
                layer.suppressRGB = SUPPRESS;

                let nUp = 0, nDown = 0;
                for (const w of windows) {
                    const x0 = +w[0], x1 = +w[1], impact = +w[2], z = +w[3], covered = +w[4];
                    if (!isFinite(x0) || !isFinite(x1) || !isFinite(impact)) continue;
                    layer.addWindow(x0, x1, impact, z, covered);
                    if (Math.abs(z) >= 2) { if (impact > 0) nUp++; else nDown++; }
                }
                // Scale to the strongest window so the picture uses the track's height
                // whatever the site's absolute confidence. The numbers stay on the labels.
                layer.setPeak(Math.max.apply(null, windows.map((w) => Math.abs(+w[2]))) || 1);
                track.addLayer(layer);
                try {
                    log('cis: layer ' + layer.data_type + ' added to ' + (track.name || 'track')
                        + ' (' + layer.windows.length + ' windows, peak ' + layer.peak.toFixed(3)
                        + ', track now has ' + (track.track_layers || []).length + ' layers'
                        + ', showLayers=' + track.showLayers + ')');
                } catch (e) { }
                if (layer.setTimedHighlight) layer.setTimedHighlight(4000);
                setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 4100);
                if (graph.wake) graph.wake();

                const rf = data && data.receptive_field;
                const capped = (rf && cis_window > +rf)
                    ? ('  (clamped to the model\'s ±' + rf + ' nt receptive field)') : '';
                graph.setMessage(' ' + name + ': ' + windows.length + ' windows, '
                    + nUp + ' supporting, ' + nDown + ' suppressing'
                    + ' · site log-odds ' + (data && data.ref) + capped + ' ');
                resetModelsToolbar();
                try { exec('baja/lib/work-status.js', null); } catch (e) { }
                return true;
            } catch (e) {
                // Also to the console: setMessage writes to the status bar, which is easy
                // to miss, and a failure to load the layer module looked like silence.
                try { console.log('cis: FAILED ' + (e && e.stack ? e.stack : e)); } catch (e2) { }
                graph.setMessage(' Cis-regulatory error: ' + e + ' ');
            }
            try { exec('baja/lib/work-status.js', null); } catch (e) { }
            return false;
        };

        // A splice site is a boundary, not a base the user can hit exactly, so the click
        // offers the nearest annotated donor and acceptor as well as the raw position.
        // Which end of an exon is which flips with the strand.
        const sitesNear = (track, xwc) => {
            const out = [];
            let exons = [];
            try { exons = track.getExons() || []; } catch (e) { exons = []; }
            if (exons.length) {
                const plus = +track.strand >= 0;
                const nearestBy = (f) => exons.reduce((a, b) =>
                    Math.abs(f(a) - xwc) < Math.abs(f(b) - xwc) ? a : b);
                const accE = nearestBy(plus ? ((e) => +e.xi) : ((e) => +e.xf));
                const donE = nearestBy(plus ? ((e) => +e.xf) : ((e) => +e.xi));
                const accX = plus ? +accE.xi : +accE.xf;
                const donX = plus ? +donE.xf : +donE.xi;
                out.push({ label: 'Acceptor ' + (accE.name || '') + ' at ' + accX
                    + ' (' + Math.abs(Math.round(accX - xwc)) + ' nt away)',
                    site: Math.round(accX), which: 'acceptor' });
                out.push({ label: 'Donor ' + (donE.name || '') + ' at ' + donX
                    + ' (' + Math.abs(Math.round(donX - xwc)) + ' nt away)',
                    site: Math.round(donX), which: 'donor' });
            }
            out.push({ label: 'This position (' + Math.round(xwc) + ') as an acceptor',
                site: Math.round(xwc), which: 'acceptor' });
            out.push({ label: 'This position (' + Math.round(xwc) + ') as a donor',
                site: Math.round(xwc), which: 'donor' });
            return out;
        };

        // Launched from a menu that already knows the site: skip the click entirely.
        if (presetTrack && presetSite && isFinite(+presetSite.site)) {
            await runAt(presetTrack, Math.round(+presetSite.site),
                (presetSite.which === 'donor') ? 'donor' : 'acceptor');
            restoreHover();
            return resolve(true);
        }

        graph.clearMouseListeners();
        graph.setMouseMode('msg: Click a splice site on a track');
        graph.selectOff();

        graph.addMouseMoveListener((x, y) => {
            if (graph.menuVisible()) return;
            const i = graph.getTrack(x, y);
            if (i >= 0) {
                graph.deselectAllTracks();
                if (graph.track[i]) graph.track[i].showResizeBar = true;
            }
        });

        graph.addMouseDownListener(async (x, y) => {
            if (graph.menuVisible()) return;
            const i = graph.getTrack(x, y);
            const track = (i >= 0) ? graph.track[i] : null;
            if (!track) { graph.setMessage(' Click on a track. '); return; }

            const xwc = track.tgraph.Xwc(x - track.tgraph.xi * 2);
            const menuList = sitesNear(track, xwc).map((s) => ({
                label: s.label,
                click: async () => {
                    // Release BEFORE the dialog inside runAt, so the canvas is not still
                    // armed for a second pick while the user is typing a window size.
                    release();
                    await runAt(track, s.site, s.which);
                    restoreHover();
                },
                move: () => { log(''); }
            }));
            graph.showMenu(menuList, x, y, 340);
        });

        return resolve(true);
    });
}
