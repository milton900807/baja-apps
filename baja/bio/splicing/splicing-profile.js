function (graph, genegraph_panel_layout) {
    // Splicing profile — pick a magnitude mode, then click a track to send its
    // sequence to the local bajasplice-lib models (py/bio/splice/splicing-profile.py,
    // run via exec rather than the old POSTJSON TF-serving call) and draw the
    // predicted splice junctions as a sashimi-plot layer.
    //
    //   sites : magnitude = splice-site strength (SpliceNet)
    //   psi   : magnitude = cassette-exon inclusion across 54 GTEx tissues (PSINet)
    return new Promise((resolve) => {

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        // Re-dock the predictive-models toolbar once the run finishes.
        const resetModelsToolbar = () => {
            try { exec('baja/ml/predictive-models-toolbar.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        const runOnTrack = async (track, mode) => {
            try {
                const seq = track && track.sequence;
                if (!seq || !seq.length) {
                    graph.setMessage(' That track has no sequence to profile. ');
                    restoreHover(); return;
                }
                const xi = (track.xi != null) ? track.xi : 0;
                const strand = '' + (track.strand != null ? track.strand : 1);

                // PSI mode needs real exon structure — send the track's annotated
                // exons (track-local [xi, xf], transcript order) if it has them.
                let exonsArg = '';
                if (mode === 'psi' && track.getExons) {
                    try {
                        const ex = (track.getExons() || [])
                            .map((e) => [+e.xi, +e.xf])
                            .filter((p) => isFinite(p[0]) && isFinite(p[1]))
                            .sort((a, b) => a[0] - b[0]);
                        if (ex.length) exonsArg = JSON.stringify(ex);
                    } catch (e) { }
                }

                graph.setMessage(' Running splicing model… ');
                const server = window['env']['apiUrl'];
                // Surface backend progress / messages (model load, scoring…).
                let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
                const data = await exec(server + '/py/bio/splice/splicing-profile.py', em, '' + seq, '' + xi, strand, '' + mode, exonsArg);

                if (data && data.error) {
                    graph.setMessage(' Splicing error: ' + data.error + ' ');
                    restoreHover(); return;
                }
                let junc = [];
                try { junc = JSON.parse((data && data.junctions) || '[]'); } catch (e) { junc = []; }
                if (!junc.length) {
                    graph.setMessage(mode === 'psi'
                        ? ' No cassette-exon events detected in that sequence. '
                        : ' No splice junctions predicted for that sequence. ');
                    restoreHover(); return;
                }

                // Build a base TrackLayer carrying the sashimi arcs as plain
                // `junctions` data. Rendering lives in TrackLayer.drawSashimi
                // (gated on arc_type), so the layer serializes and reloads as an
                // ordinary TrackLayer — no custom subclass to lose on load.
                const TrackLayer = await exec('baja/bio/track-layer.js');
                const tg = track.tgraph;
                const label = (track.name || 'track') + (mode === 'psi' ? '_psi_sashimi' : '_sashimi');
                const layer = new TrackLayer(label, tg.xmin, 0, tg.xmax, 1);
                layer.data_type = 'splicing';
                layer.arc_type = 'SpliceSashimi';
                layer.magnitudeMode = mode;
                // Distinct color scheme per magnitude model so the two are easy to
                // tell apart: site strength = indigo->green, PSI = teal->orange.
                if (mode === 'psi') {
                    layer.donorColor = 'rgba(26,163,189,0.95)';    // teal (donor)
                    layer.acceptorColor = 'rgba(224,112,59,0.95)'; // orange (acceptor)
                } else {
                    layer.donorColor = 'rgba(94,84,199,0.95)';     // indigo (donor)
                    layer.acceptorColor = 'rgba(46,160,102,0.95)'; // green (acceptor)
                }
                // Site strength is a probability in [0,1]; present it on a 0–2
                // scale. PSI stays 0–1. magMax tells the renderer the top of the
                // scale so arc weight / crest stay normalized either way.
                const magMax = (mode === 'psi') ? 1 : 2;
                layer.magMax = magMax;
                // Junctions arrive as { d, a, dp, ap, mag, kind }.
                layer.junctions = junc.map((j) => {
                    let baseMag = (typeof j.mag === 'number') ? j.mag : Math.min(+j.dp || 0, +j.ap || 0);
                    return {
                        d: +j.d, a: +j.a,
                        dp: +j.dp || 0, ap: +j.ap || 0,
                        mag: (mode === 'psi') ? baseMag : baseMag * 2,   // sites: 0..1 -> 0..2
                        kind: j.kind || 'junction'
                    };
                });
                track.addLayer(layer);

                if (graph.wake) graph.wake();
                const magLabel = (mode === 'psi') ? 'PSI inclusion' : 'site strength';
                graph.setMessage(' Sashimi plot added to ' + (track.name || 'track') +
                    ' — ' + junc.length + ' junctions, magnitude = ' + magLabel + '. ');
                // Model finished and the layer is added — bring the Models toolbar back.
                resetModelsToolbar();
            } catch (e) {
                graph.setMessage(' Splicing error: ' + e + ' ');
            }
            restoreHover();
        };

        // Arm a track click for the chosen magnitude mode.
        const armTrackClick = (mode) => {
            graph.clearMouseListeners();
            graph.setMouseMode('msg: Click on a track to build a splicing sashimi plot.');
            CurrentLayout.clearComponent('mainPanel');
            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            graph.addMouseDownListener(async (x, y) => {
                const ti = graph.getTrack(x, y);
                if (ti < 0) return;
                const track = graph.track[ti];
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                await runOnTrack(track, mode);
            });
        };

        // Ask which magnitude to visualize, then arm the track click.
        graph.showMenu([
            {
                label: 'Baja:SiteStrength:v1.0', move: () => { },
                click: () => { try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { } armTrackClick('sites'); }
            },
            {
                label: 'Baja:PSI:v1.1', move: () => { },
                click: () => { try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { } armTrackClick('psi'); }
            }
        ]);

        resolve(true);
    });
}
