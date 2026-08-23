function (graph, genegraph_panel_layout, presetResource) {
    // Public data resources browser — a selection list (like the chemistry list)
    // of the public resources available to load / search. Selecting one kicks off
    // its loader (per-resource handlers can be wired in loadResource below).
    // If presetResource is given, skip the list and arm that resource directly.
    return new Promise(async (resolve) => {

        // Only public data sources that carry GENOMIC COORDINATES (chr/start/end)
        // so they can be placed onto the tracks. Sources without genomic loci
        // (patents, protein/compound/pathway/literature DBs) are intentionally
        // excluded.
        const resources = [
            'RNASeq (GEO / expression)',
            'GWAS Catalog',
            'ClinVar (variants)',
            'dbSNP',
            'GTEx (eQTLs)',
            'TCGA (cancer genomics)',
            'ENCODE (regulatory)',
            '1000 Genomes',
            'gnomAD (population variants)',
            'RefSeq',
            'Ensembl',
            'GENCODE',
            'UCSC tracks',
            'Roadmap Epigenomics'
        ];

        // ---- coordinate helpers (genomic <-> track-local via Exon annotations) --
        const exonsOf = (track) => (track.annotations || []).filter(
            (a) => a && a.type === 'Exon' && a.gxi != null && a.gxf != null && a.xi != null && a.xf != null);

        // The track's genomic [start,end] — exon span for transcripts, else the
        // track's own coordinate range (a genomic-region track).
        const genomicRange = (track) => {
            const ex = exonsOf(track);
            if (ex.length) {
                let lo = Infinity, hi = -Infinity;
                for (const e of ex) { lo = Math.min(lo, e.gxi, e.gxf); hi = Math.max(hi, e.gxi, e.gxf); }
                return { start: Math.floor(lo), end: Math.ceil(hi) };
            }
            return { start: Math.floor(track.tgraph.xmin), end: Math.ceil(track.tgraph.xmax) };
        };

        // Map a genomic position to the track's local x. Returns null if the
        // position falls outside the track's exons (intronic).
        const genomicToLocal = (track, g) => {
            const ex = exonsOf(track);
            if (!ex.length) return g;   // genomic-region track: local == genomic
            for (const e of ex) {
                const glo = Math.min(e.gxi, e.gxf), ghi = Math.max(e.gxi, e.gxf);
                if (g >= glo && g <= ghi) {
                    const span = (e.gxf - e.gxi);
                    if (span === 0) return e.xi;
                    return e.xi + (e.xf - e.xi) * ((g - e.gxi) / span);
                }
            }
            return null;
        };

        const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

        // Read a bigWig / VCF endpoint over the track's region and drop the result
        // in as a polygon track layer (values = [[genomicPos, value], …], the same
        // shape view-bigwig.py returns).
        const loadEndpointAsLayer = async (track, name, cand, gr, chr) => {
            try {
                graph.setMessage(' Loading ' + (cand.label || name) + '… ');
                const server = window['env']['apiUrl'];
                // Surface backend messages (e.g. the first-time download/cache notice).
                let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
                // Backend service reads the chosen bigWig / VCF endpoint over the
                // region and returns track-layer values ([[pos, val], …]).
                const data = await exec(server + '/py/data/load-endpoint-layer.py', em, cand.url, '' + (cand.type || 'bigwig'), '' + chr, '' + gr.start, '' + gr.end);
                let rv = [];
                try { rv = JSON.parse((data && data.values) || '[]'); } catch (e) { rv = []; }
                if (!rv.length) {
                    graph.setMessage(' No data returned for ' + (cand.label || name) + '. ');
                    restoreHover(); return;
                }

                const TrackLayer = await exec('baja/bio/track-layer.js');
                const tg = track.tgraph;
                const layer = new TrackLayer((cand.label || name), tg.xmin, 0, tg.xmax, 1);
                layer.data_type = name;
                if (cand.type === 'vcf') {
                    layer.fillstyle = 'rgba(255,140,66,0.40)';
                } else {
                    // Give each RNASeq layer on this track its own color, alpha 0.2–0.7,
                    // so stacked coverage tracks stay distinguishable.
                    const PALETTE = [
                        [26, 163, 189], [224, 112, 59], [94, 84, 199], [46, 160, 102],
                        [201, 76, 140], [210, 160, 40], [70, 130, 180], [150, 90, 60]
                    ];
                    const idx = (track.track_layers || []).filter((l) => l && l.data_type === name).length;
                    const rgb = PALETTE[idx % PALETTE.length];
                    const alpha = +(0.2 + 0.5 * ((idx % 6) / 5)).toFixed(2);   // cycles 0.2..0.7
                    layer.fillstyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
                    layer.color = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + Math.min(1, alpha + 0.2) + ')';
                }

                // These tracks display in genomic coordinates (local x == genomic
                // position), so bigWig values are plotted at their genomic position
                // directly — the same convention as big-data.js. Introns are part of
                // the genomic locus and are shown as-is.
                // Vertical exaggeration so the coverage reads taller / easier to see
                // (peaks may extend a bit above the track box).
                const HEIGHT_GAIN = 1.8;
                let maxV = rv.reduce((m, p) => Math.max(m, (p && p[1]) || 0), -Infinity);
                if (!(maxV > 0)) maxV = 1.0;
                layer.addPolygonPoint(gr.start, 0);        // baseline at the left edge
                for (const p of rv) {
                    if (!p) continue;
                    let val = +p[1];
                    if (!isFinite(val)) val = 0;
                    layer.addPolygonPoint(+p[0], (val / maxV) * HEIGHT_GAIN);
                }
                layer.addPolygonPoint(gr.end, 0);          // baseline at the right edge
                layer.sortPolygonPoints();
                track.addLayer(layer);
                if (track.fitYAxis) { try { track.fitYAxis(); } catch (e) { } }
                graph.setMessage(' Loaded ' + (cand.label || name) + ' onto ' + (track.name || 'track') + '. ');
                if (graph.wake) graph.wake();
            } catch (e) {
                graph.setMessage(' Load error: ' + e);
            }
            restoreHover();
        };

        // Selecting a resource arms a track click: click a track, find its bigWig /
        // VCF endpoints, let the user pick one (if several), then load it as a layer.
        const armLoad = (name) => {
            if (!name) return;
            graph.clearMouseListeners();
            graph.setMouseMode("msg: Click on a track to load data.");
            CurrentLayout.clearComponent('mainPanel');
            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            graph.addMouseDownListener(async (x, y) => {
                const ti = graph.getTrack(x, y);
                if (ti < 0) return;
                const track = graph.track[ti];
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');   // done picking — back to navigate
                try {
                    const chr = track.chr || '';
                    // Tracks display in genomic coordinates (local x == genomic), so
                    // read over the track's full locus xi..xf — or the marked region
                    // if one is set — exactly like big-data.js.
                    let gr = { start: track.xi, end: track.xf };
                    if (track.markstart > 0 && track.markend > track.markstart) {
                        gr = { start: track.markstart, end: track.markend };
                    }
                    const genome = track.species || 'human';

                    graph.setMessage(' Finding ' + name + ' data files in BIG_DATA… ');
                    const server = window['env']['apiUrl'];
                    let em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
                    // List the matching bigWig / VCF files from the local BIG_DATA folder.
                    const res = await exec(server + '/py/data/list-big-data.py', em, name, '' + genome);
                    let candidates = [];
                    try { candidates = JSON.parse((res && res.candidates) || '[]'); } catch (e) { candidates = []; }

                    if (!candidates.length) {
                        graph.setMessage(' No ' + name + ' data files found in BIG_DATA: ' + ((res && res.error) || '') + ' ');
                        restoreHover();
                        return;
                    }
                    if (candidates.length === 1) {
                        await loadEndpointAsLayer(track, name, candidates[0], gr, chr);
                        return;
                    }
                    // Multiple candidates — prompt the user to pick the specific
                    // bigWig / VCF file.
                    const fileNameOf = (u) => { try { return decodeURIComponent(('' + u).split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || ''); } catch (e) { return ''; } };
                    const menu = candidates.map((c) => {
                        const fn = fileNameOf(c.url);
                        return {
                            label: '[' + (c.type || '?').toUpperCase() + '] ' + (c.label || '') + (fn ? '  —  ' + fn : ''),
                            move: () => { },
                            click: () => { try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { } loadEndpointAsLayer(track, name, c, gr, chr); }
                        };
                    });
                    graph.setMessage(' Pick a ' + name + ' file to load. ');
                    graph.showWindowMenu(menu, 10, 10, 420);
                } catch (e) {
                    graph.setMessage(' Load error: ' + e);
                    restoreHover();
                }
            });
        };
        const loadResource = (name) => armLoad(name);

        // Preset (e.g. the "RNASeq" toolbar item): arm that resource, no list.
        if (presetResource) {
            loadResource(presetResource);
            resolve(null);
            return;
        }

        const list = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: resources,
                button_function: createIonFunction((items) => {
                    loadResource(items && items[0]);
                })
            }
        };

        const panel = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: '<div style="padding:8px 4px;font-weight:700;">Public data resources</div>'
                            }
                        },
                        {
                            'width': '100%',
                            'component': list
                        },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'mt-button',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                CurrentLayout.clearComponent('mainPanel');
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                ]
            }
        };

        resolve(panel);
    }).then((panel) => {
        if (!panel) return;   // preset flow armed a resource directly, no list panel
        CurrentLayout.clearComponent('mainPanel');
        CurrentLayout.setComponent('mainPanel', panel);
    });
}
