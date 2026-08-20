function (server, graph, genegraph_panel_layout, context, presetQuery) {
    return new Promise(async (resolve, reject) => {
        const PY = server + '/py/sequence/prompt-action.py';
        context = context || 'general';

        // ---- per-button prompt history (a running log, persisted) ----------
        const HKEY = 'promptHistory:' + context;
        const loadHistory = () => {
            try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; }
        };
        const saveHistory = (h) => {
            try { localStorage.setItem(HKEY, JSON.stringify(h.slice(-100))); } catch (e) { }
        };
        let history = loadHistory();
        let histIndex = history.length;   // past-the-end == a fresh, empty input
        const remember = (q) => {
            q = ('' + (q || '')).trim();
            if (!q) return;
            if (history[history.length - 1] !== q) { history.push(q); saveHistory(history); }
            histIndex = history.length;
        };

        // ---- undo / redo for annotation edits -----------------------------
        // Attach the machinery to the graph once so it persists across modal
        // invocations and can be driven by the global Ctrl+Z / Ctrl+Y handler.
        if (!graph.doAnnotUndo) {
            graph.__annotUndo = graph.__annotUndo || [];
            graph.__annotRedo = graph.__annotRedo || [];
            const UNDO_MAX = 30;
            const shallowFields = (o) => {
                const f = {};
                if (!o) return f;
                for (const k in o) {
                    try { if (Object.prototype.hasOwnProperty.call(o, k) && typeof o[k] !== 'function') f[k] = o[k]; } catch (e) { }
                }
                return f;
            };
            const applyFields = (o, f) => { if (o && f) { for (const k in f) { try { o[k] = f[k]; } catch (e) { } } } };
            graph.snapshotAnnotations = () => (graph.track || []).map((t) => ({
                track: t,
                annotations: (t.annotations || []).slice(),
                snpindels: (t.snpindels || []).slice(),
                layers: (t.track_layers || []).slice(),
                annFields: (t.annotations || []).map(shallowFields),
                snpFields: (t.snpindels || []).map(shallowFields)
            }));
            graph.restoreAnnotations = (snap) => {
                for (const e of (snap || [])) {
                    const t = e.track;
                    if (!t) continue;
                    t.annotations = e.annotations.slice();
                    t.snpindels = e.snpindels.slice();
                    if (e.layers) t.track_layers = e.layers.slice();
                    e.annotations.forEach((a, i) => applyFields(a, e.annFields[i]));
                    e.snpindels.forEach((s, i) => applyFields(s, e.snpFields[i]));
                    t.showSnpIndels = true;
                }
            };
            graph.pushAnnotUndo = () => {
                graph.__annotUndo.push(graph.snapshotAnnotations());
                if (graph.__annotUndo.length > UNDO_MAX) graph.__annotUndo.shift();
                graph.__annotRedo.length = 0;   // a new edit invalidates the redo stack
            };
            graph.doAnnotUndo = () => {
                if (!graph.__annotUndo.length) { graph.setMessage(' Nothing to undo.'); return false; }
                graph.__annotRedo.push(graph.snapshotAnnotations());
                graph.restoreAnnotations(graph.__annotUndo.pop());
                graph.setMessage(' Undone (' + graph.__annotUndo.length + ' more).');
                try { graph.rescale(); } catch (e) { }
                return true;
            };
            graph.doAnnotRedo = () => {
                if (!graph.__annotRedo.length) { graph.setMessage(' Nothing to redo.'); return false; }
                graph.__annotUndo.push(graph.snapshotAnnotations());
                graph.restoreAnnotations(graph.__annotRedo.pop());
                graph.setMessage(' Redone.');
                try { graph.rescale(); } catch (e) { }
                return true;
            };
        }

        // Bind Ctrl+Z / Ctrl+Y (Cmd on macOS) once, globally, targeting the
        // current graph. Text fields keep their own native undo.
        try { window.__annotGraph = graph; } catch (e) { }
        if (typeof window !== 'undefined' && !window.__annotKeysBound) {
            window.__annotKeysBound = true;
            const onKey = (e) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                const g = window.__annotGraph;
                if (!g || !g.doAnnotUndo) return;
                const tag = ((e.target && e.target.tagName) || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
                const k = ('' + (e.key || '')).toLowerCase();
                if (k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); g.doAnnotUndo(); }
                else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); e.stopPropagation(); g.doAnnotRedo(); }
            };
            try { window.addEventListener('keydown', onKey, true); } catch (e) { }
        }

        const pushUndo = () => graph.pushAnnotUndo();
        const doUndo = () => graph.doAnnotUndo();
        const doRedo = () => graph.doAnnotRedo();

        // ---- track/graph helpers (grounded in the real API) ----------------
        const findTrack = (needle) => {
            needle = ('' + (needle || '')).toUpperCase();
            if (!needle || !graph.track) return null;
            for (let t of graph.track) {
                const fields = [t.transcriptID, t.geneID, t.name, t.description, t.species];
                for (let f of fields) {
                    if (f && ('' + f).toUpperCase().indexOf(needle) >= 0) return t;
                }
            }
            return null;
        };

        // A track reference is a 1-based number (as the user says "track 2") or a name.
        const resolveTrack = (ref) => {
            if (ref == null || !graph.track) return null;
            if (typeof ref === 'number' || /^\d+$/.test('' + ref)) {
                const idx = parseInt(ref, 10) - 1;
                return (idx >= 0 && idx < graph.track.length) ? graph.track[idx] : null;
            }
            return findTrack(ref);
        };

        const animateToTrack = (t) => {
            if (!t || !t.tgraph) return false;
            const xi = t.tgraph.xi, w = t.tgraph.width, off = w / 6;
            try { graph.animateTo(xi - off, xi + w + off,
                t.tgraph.yi - Math.abs(t.tgraph.height) - 10,
                t.tgraph.yi + t.tgraph.height + 10); } catch (e) { }
            graph.setMouseMode('navigate');
            return true;
        };

        const fitTracks = (tracks) => {
            tracks = (tracks || []).filter(Boolean);
            if (!tracks.length) return false;
            let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
            for (let t of tracks) {
                if (!t.tgraph) continue;
                minx = Math.min(minx, t.tgraph.xi);
                maxx = Math.max(maxx, t.tgraph.xi + t.tgraph.width);
                miny = Math.min(miny, t.tgraph.yi - Math.abs(t.tgraph.height));
                maxy = Math.max(maxy, t.tgraph.yi + Math.abs(t.tgraph.height));
            }
            if (minx === Infinity) return false;
            const w = (maxx - minx) || 1, off = w / 12;
            try { graph.animateTo(minx - off, maxx + off, miny - 5, maxy + 5); } catch (e) { }
            graph.setMouseMode('navigate');
            return true;
        };

        const fitAll = () => fitTracks(graph.track || []);

        // All tracks whose gene/transcript/name/description matches.
        const findTracks = (needle) => {
            needle = ('' + (needle || '')).toUpperCase();
            const out = [];
            if (!needle || !graph.track) return out;
            for (let t of graph.track) {
                const fields = [t.transcriptID, t.geneID, t.name, t.description, t.species];
                if (fields.some(f => f && ('' + f).toUpperCase().indexOf(needle) >= 0)) out.push(t);
            }
            return out;
        };

        const zoomInOut = (dir) => {
            const g = (fn) => { try { return graph[fn] ? graph[fn]() : null; } catch (e) { return null; } };
            let xmin = g('getxmin'), xmax = g('getxmax'), ymin = g('getymin'), ymax = g('getymax');
            if (!(typeof xmin === 'number' && typeof xmax === 'number' && xmax > xmin)) { fitAll(); return; }
            const c = (xmin + xmax) / 2, w = xmax - xmin;
            const nw = (dir === 'in') ? w / 2 : w * 2;
            try { graph.animateTo(c - nw / 2, c + nw / 2, ymin, ymax); } catch (e) { }
        };

        // Resolve a feature name ("3utr", "cds", "exon 3", "intron 2", "tss", a
        // named annotation, ...) to a {xi,xf} range in the track's LOCAL coords.
        const featRange = (list) => {
            if (!list || !list.length) return null;
            let xi = Infinity, xf = -Infinity;
            for (let a of list) {
                const lo = Math.min(a.xi, a.xf), hi = Math.max(a.xi, a.xf);
                if (lo < xi) xi = lo; if (hi > xf) xf = hi;
            }
            return (xi === Infinity) ? null : { xi, xf };
        };
        const annsOfType = (track, type) => {
            if (track.getAnnotations) { try { return track.getAnnotations(type) || []; } catch (e) { } }
            return (track.annotations || []).filter(a => a && a.type === type);
        };
        const nthRange = (list, n) => {
            if (!list || n < 1 || n > list.length) return null;
            const a = list[n - 1];
            return { xi: Math.min(a.xi, a.xf), xf: Math.max(a.xi, a.xf) };
        };
        const isPlusStrand = (track) => (track.strand === 1 || track.strand === '+' || track.strand > 0);
        // Direct UTR annotations (GFF gives type 'three_prime_UTR' / 'five_prime_UTR').
        const utrAnns = (track, which) => {
            const word = which === 5 ? 'five' : 'three';
            const digit = which === 5 ? '5' : '3';
            const anns = (track.annotations || []).filter(a => {
                const ty = ('' + (a && a.type || '')).toLowerCase();
                return ty.indexOf('utr') >= 0 && (ty.indexOf(word) >= 0 || ty.indexOf(digit) >= 0);
            });
            return featRange(anns);
        };
        const utrRange = (track, which) => {
            const cds = featRange(annsOfType(track, 'CDS'));
            if (!cds) return null;
            const exons = track.getExons ? track.getExons() : annsOfType(track, 'Exon');
            let tx = featRange(exons);
            if (!tx) tx = { xi: 0, xf: (track.sequence ? track.sequence.length : Math.abs(track.xf - track.xi)) };
            const plus = isPlusStrand(track);
            if (which === 5) return plus ? { xi: tx.xi, xf: cds.xi } : { xi: cds.xf, xf: tx.xf };
            return plus ? { xi: cds.xf, xf: tx.xf } : { xi: tx.xi, xf: cds.xi };   // 3'UTR
        };
        const resolveFeatureRange = (track, feature) => {
            const f = ('' + (feature || '')).toLowerCase().trim();
            if (!f) return null;
            let m = f.match(/exon\s*(\d+)/);
            if (m) return nthRange(track.getExons ? track.getExons() : annsOfType(track, 'Exon'), parseInt(m[1], 10));
            m = f.match(/intron\s*(\d+)/);
            if (m) return nthRange(track.getIntrons ? track.getIntrons(0) : [], parseInt(m[1], 10));
            if (f.indexOf('exon') >= 0) return featRange(track.getExons ? track.getExons() : annsOfType(track, 'Exon'));
            if (f.indexOf('intron') >= 0) return featRange(track.getIntrons ? track.getIntrons(0) : []);
            if (f.indexOf('cds') >= 0 || f.indexOf('coding') >= 0) return featRange(annsOfType(track, 'CDS'));
            if (f.indexOf('utr') >= 0) {
                // "5/five prime UTR" -> 5, otherwise (incl. "three prime", "3'") -> 3.
                const which = (f.indexOf('5') >= 0 || f.indexOf('five') >= 0) ? 5 : 3;
                // Prefer the real UTR annotations; fall back to computing from CDS.
                return utrAnns(track, which) || utrRange(track, which);
            }
            if (f.indexOf('tss') >= 0 || f.indexOf('start') >= 0) return featRange(annsOfType(track, 'TSS'));
            if (f.indexOf('stop') >= 0) return featRange(annsOfType(track, 'STOP'));
            // named annotation match
            const named = (track.annotations || []).find(a => a && a.name && ('' + a.name).toLowerCase().indexOf(f) >= 0);
            if (named) return { xi: Math.min(named.xi, named.xf), xf: Math.max(named.xi, named.xf) };
            return null;
        };

        // Zoom to a feature within a track (or the whole track when no feature).
        const zoomToFeature = (track, feature) => {
            if (!track) return false;
            if (!feature) { animateToTrack(track); graph.setMessage(' Zoomed to ' + (track.name || 'track')); return true; }
            const range = resolveFeatureRange(track, feature);
            if (!range || !isFinite(range.xi) || !isFinite(range.xf)) {
                graph.setMessage(' Could not find "' + feature + '" on ' + (track.name || 'the track') + '.');
                return false;
            }
            let a, b;
            try { a = track.tgraph.X(range.xi); b = track.tgraph.X(range.xf); } catch (e) { a = range.xi; b = range.xf; }
            const x1 = Math.min(a, b), x2 = Math.max(a, b);
            const pad = (x2 - x1) * 0.25 || 10;
            try {
                graph.animateTo(x1 - pad, x2 + pad,
                    track.tgraph.yi - Math.abs(track.tgraph.height) - 10,
                    track.tgraph.yi + track.tgraph.height + 10);
            } catch (e) { }
            graph.setMouseMode('navigate');
            graph.setMessage(' Zoomed to ' + feature + ' on ' + (track.name || 'track'));
            return true;
        };

        const removeTrack = (which, value) => {
            if (!graph.track || !graph.track.length) return false;
            which = ('' + (which || '')).toLowerCase();
            if (which === 'all') {
                try { if (graph.clearTracks) { graph.clearTracks(); return true; } } catch (e) { }
                graph.track.length = 0;
                return true;
            }
            let idx = -1;
            if (which === 'last') idx = graph.track.length - 1;
            else if (which === 'first') idx = 0;
            else if (which === 'name') { const t = findTrack(value); idx = t ? graph.track.indexOf(t) : -1; }
            else if (value != null && /^\d+$/.test('' + value)) idx = parseInt(value, 10) - 1;
            else if (which === 'index') idx = (parseInt(value, 10) || 1) - 1;
            if (idx < 0 || idx >= graph.track.length) return false;
            try { graph.removeTrack(idx); } catch (e) { graph.track.splice(idx, 1); }
            return true;
        };

        // Annotation feature-type names as stored on annotation.type.
        const mapAnnType = (type) => {
            const t = ('' + (type || '')).toLowerCase();
            if (t.indexOf('intron') === 0) return 'Intron';
            if (t.indexOf('exon') === 0) return 'Exon';
            if (t === 'cds') return 'CDS';
            if (t === 'tss' || t.indexOf('start') === 0) return 'TSS';
            if (t === 'stop') return 'STOP';
            if (t.indexOf('donor') === 0) return 'Donor-Splice-Site';
            if (t.indexOf('acceptor') === 0) return 'Acceptor-Splice-Site';
            return type;
        };

        const selectAnnotations = (track, type) => {
            if (!track) return 0;
            const want = mapAnnType(type);
            let count = 0;
            if (track.annotations) {
                for (let a of track.annotations) {
                    if (a && a.type && ('' + a.type).toLowerCase() === want.toLowerCase()) {
                        if (a.select) a.select();
                        count++;
                    }
                }
            }
            // Built-in highlighter (also handles introns, which are computed on the fly).
            try {
                if (track.highlightFeature) {
                    track.highlightFeature('annotations', want === 'Intron' ? 'Introns' : want);
                }
            } catch (e) { }
            return count;
        };

        const loadOne = async (item) => {
            if (!item || !item.id) return false;
            const label = item.id + (item.gene ? ' (' + item.gene + ')' : '');
            graph.setMessage(' Loading ' + label + ' ...');
            let track = null;
            try { track = await graph.add(item.id, null, null, null); }
            catch (e) { track = null; }
            if (!track) { graph.setMessage(' Failed to load ' + label + ' — data service unavailable.'); return false; }
            return true;
        };

        // ---- annotation helpers -------------------------------------------
        const fixChr = (c) => {
            c = ('' + (c || '')).trim();
            if (/^(chr)?x$/i.test(c)) return 'X';
            if (/^(chr)?y$/i.test(c)) return 'Y';
            if (/^(chr)?mt?$/i.test(c)) return 'MT';
            return c.replace(/^chr/i, '');
        };
        // The currently-visible genomic range of a track (coords are genomic).
        const visibleGenomicRange = (t) => {
            let r = null;
            try { if (t.gitVisibleTrackRange) r = t.gitVisibleTrackRange(graph); } catch (e) { }
            let start = (r && isFinite(r.start)) ? r.start : t.xi;
            let end = (r && isFinite(r.end)) ? r.end : t.xf;
            if (start > end) { const s = start; start = end; end = s; }
            return { start: Math.floor(start), end: Math.floor(end) };
        };
        // Tracks currently in the viewport. Prefer the app's own getViewport()
        // (deduped, since it also appends trackRef tracks); fall back to a manual
        // vertical-overlap test against the grid, then to all tracks.
        const visibleTracks = () => {
            try {
                const vp = graph.getViewport && graph.getViewport();
                const vt = vp && vp.viewport && vp.viewport.track;
                if (vt && vt.length) return vt.filter((t, i) => t && vt.indexOf(t) === i);
            } catch (e) { }
            try {
                const g = graph.graph && graph.graph.grid;
                if (g && (graph.track || []).length) {
                    const out = (graph.track || []).filter((t) => {
                        if (!t || !t.tgraph) return true;
                        const y0 = t.tgraph.yi, y1 = t.tgraph.yi + Math.abs(t.tgraph.height || 1);
                        return y1 >= g.ymin && y0 <= g.ymax;
                    });
                    if (out.length) return out;
                }
            } catch (e) { }
            return graph.track || [];
        };
        // Clinical significance can be free text ("Pathogenic", "Likely_pathogenic",
        // "Pathogenic/Likely_pathogenic") OR numeric ClinVar CLNSIG codes that some
        // VCFs use. Normalize both to words so substring tests work either way.
        const CLNSIG_CODE = {
            '0': 'uncertain', '1': 'not_provided', '2': 'benign', '3': 'benign',
            '4': 'pathogenic', '5': 'pathogenic', '6': 'drug_response',
            '7': 'histocompatibility', '255': 'other'
        };
        const clinsigText = (raw) => {
            let s = ('' + (raw == null ? '' : raw)).toLowerCase().trim();
            if (!s) return '';
            const toks = s.split(/[^a-z0-9_]+/i).filter(Boolean);
            return toks.map((tk) => (/^\d+$/.test(tk) && CLNSIG_CODE[tk]) ? CLNSIG_CODE[tk] : tk).join(' ');
        };
        const clinsigMatches = (raw, term) => clinsigText(raw).indexOf(term) >= 0;
        let _SnpIndel = null, _Annotation = null;
        const getSnpIndel = async () => {
            if (!_SnpIndel) { try { _SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { } }
            return _SnpIndel;
        };
        const getAnnotation = async () => {
            if (!_Annotation) { try { _Annotation = await exec('flexigraph/annotation.js'); } catch (e) { } }
            return _Annotation;
        };
        const annTrackOrFirst = (ref) =>
            resolveTrack(ref) || ((graph.track && graph.track.length) ? graph.track[0] : null);

        // Ops that add/remove tracks or move/zoom the canvas — disallowed in the
        // Annotate context, which must only edit annotations on existing tracks.
        const CANVAS_TRACK_OPS = {
            load_transcript: 1, add_track: 1, remove_track: 1,
            zoom_track: 1, zoom_fit: 1, navigate: 1, compare_tracks: 1
        };

        // ---- layer-removal menu -------------------------------------------
        // Lists every layer across every track as a clickable button; clicking
        // one removes it and re-renders the (now shorter) menu.
        const layerLabel = (L) => {
            let n = (L && L.name) ? ('' + L.name) : '';
            if (!n) n = (L && L.polygon_type) ? (L.polygon_type + ' layer') : 'layer';
            if (n.indexOf('__show_') === 0) n = 'highlight lasso';
            return n.length > 40 ? n.slice(0, 38) + '…' : n;
        };
        const showLayerMenu = () => {
            const items = [];
            (graph.track || []).forEach((t, ti) => {
                (t.track_layers || []).forEach((L) => { items.push({ ti, t, L }); });
            });

            const buttons = items.map((it) => ({
                label: 'T' + (it.ti + 1) + ' · ' + layerLabel(it.L),
                background: '#ffffff', color: '#000000', borderColor: '#c8ced6',
                ionFunction: createIonFunction(() => {
                    try { it.t.track_layers = (it.t.track_layers || []).filter((x) => x !== it.L); } catch (e) { }
                    try { graph.rescale(); } catch (e) { }
                    graph.setMessage(' Removed layer.');
                    showLayerMenu();
                })
            }));
            buttons.push({
                label: 'Close', ionFunction: createIonFunction(() => { hideAllModal(); resolve(null); })
            });

            showModal({
                wid: 'card',
                componentRef: 'bottomPanel',
                data: {
                    height: '800px',
                    cards: [[
                        {
                            'title': items.length
                                ? ('Click a layer to remove it (' + items.length + ' total)')
                                : 'No layers on any track.',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: items.length ? '' : '<i style="color:#888;">There are no layers to remove.</i>'
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': { wid: 'mt-button', data: { buttons: buttons } }
                        }
                    ]]
                }
            });
        };

        // ---- track picker: select a track's whole sequence -----------------
        // Shows a side menu of every track; clicking one selects its entire
        // sequence (markstart..markend) via the track's selectTrackAndSeq().
        const selectWholeSequence = (t) => {
            if (!t) return;
            try {
                if (t.selectTrackAndSeq) { t.selectTrackAndSeq(); return; }
                if (t.select) t.select();
                const len = (t.sequence && t.sequence.length) ? t.sequence.length : Math.abs((t.xf || 0) - (t.xi || 0));
                t.markstart = t.xi;
                t.markend = t.xi + len;
            } catch (e) { }
        };
        const showTrackSeqMenu = () => {
            const tracks = graph.track || [];
            if (!tracks.length) { graph.setMessage(' No tracks available.'); return; }
            const items = tracks.map((t, i) => ({
                label: (t.name || t.transcriptID || t.geneID || ('track ' + (i + 1))),
                click: () => {
                    graph.showSideMenu(null);
                    selectWholeSequence(t);
                    try { graph.rescale(); } catch (e) { }
                    graph.setMessage(' Selected the entire sequence of ' + (t.name || 'track ' + (i + 1)) + '.');
                },
                move: () => { }
            }));
            graph.setMessage(' Pick a track to select its whole sequence:');
            graph.showSideMenu(items);
        };

        // ---- execute one step ---------------------------------------------
        const runStep = async (step) => {
            if (!step || !step.op) return;
            if (context === 'annotate' && CANVAS_TRACK_OPS[step.op]) {
                graph.setMessage(' Annotate only edits annotations — it does not add/remove tracks or move the view.');
                return;
            }
            switch (step.op) {
                case 'remove_layer_menu': { showLayerMenu(); return; }
                case 'undo': { doUndo(); return; }
                case 'redo': { doRedo(); return; }

                case 'load_transcript': {
                    for (let it of (step.transcripts || [])) await loadOne(it);
                    return;
                }
                case 'add_track': {
                    if (step.id) { await loadOne({ id: step.id }); }
                    else {
                        await exec('baja/data/prompt-load-transcript.js', server, graph,
                            genegraph_panel_layout, step.query || '');
                    }
                    return;
                }
                case 'remove_track': {
                    const ok = removeTrack(step.which, step.value);
                    graph.setMessage(ok ? ' Removed track.' : ' No matching track to remove.');
                    return;
                }
                case 'zoom_track': {
                    const t = resolveTrack(step.track);
                    if (t) { animateToTrack(t); graph.setMessage(' Zoomed to ' + (t.name || 'track')); }
                    else graph.setMessage(' Track "' + step.track + '" not found.');
                    return;
                }
                case 'zoom_fit': {
                    if (step.tracks && step.tracks.length) {
                        const ts = step.tracks.map(resolveTrack).filter(Boolean);
                        if (!fitTracks(ts)) fitAll();
                    } else fitAll();
                    return;
                }
                case 'select_track': {
                    const t = resolveTrack(step.track);
                    if (t && t.select) { t.select(); graph.setMessage(' Selected ' + (t.name || 'track')); }
                    else graph.setMessage(' Track "' + step.track + '" not found.');
                    return;
                }
                case 'select_track_sequence': {
                    // Select a whole track's sequence. If a track is named, do it
                    // directly; otherwise show the picker menu.
                    if (step.track != null && step.track !== '') {
                        const t = resolveTrack(step.track);
                        if (!t) { graph.setMessage(' Track "' + step.track + '" not found.'); return; }
                        selectWholeSequence(t);
                        graph.setMessage(' Selected the entire sequence of ' + (t.name || 'track') + '.');
                    } else {
                        showTrackSeqMenu();
                    }
                    return;
                }
                case 'deselect_all': {
                    graph.deselectAllTracks();
                    return;
                }
                case 'select_annotations': {
                    const t = resolveTrack(step.track);
                    if (t) {
                        const n = selectAnnotations(t, step.type);
                        graph.setMessage(' Selected ' + n + ' ' + (step.type || 'feature')
                            + '(s) on ' + (t.name || 'track'));
                    } else graph.setMessage(' Track "' + step.track + '" not found.');
                    return;
                }
                case 'select_snps': {
                    const t = resolveTrack(step.track);
                    if (t && t.snpindels && t.snpindels.length) {
                        for (let sn of t.snpindels) sn.highlight = true;
                        graph.setMessage(' Selected ' + t.snpindels.length + ' SNPs on ' + (t.name || 'track'));
                    } else graph.setMessage(' No SNPs on track "' + step.track + '".');
                    return;
                }
                case 'compare_tracks': {
                    const ts = (step.tracks || []).map(resolveTrack).filter(Boolean);
                    if (ts.length >= 2) {
                        graph.deselectAllTracks();
                        for (let t of ts) if (t.select) t.select();
                        fitTracks(ts);
                        graph.setMessage(' Comparing ' + ts.map(t => t.name || '?').join('  vs  '));
                    } else graph.setMessage(' Need at least two matching tracks to compare.');
                    return;
                }
                case 'set_mode': {
                    graph.setMouseMode(step.mode || 'navigate');
                    graph.setMessage(' Mode: ' + (step.mode || 'navigate'));
                    return;
                }
                case 'navigate': {
                    const tgt = step.target || {};
                    if (tgt.zoom === 'reset' || tgt.zoom === 'fit' || tgt.zoom === 'all') { fitAll(); return; }

                    const feature = tgt.feature || tgt.region || null;

                    // Explicit track reference: a 1-based number ("track 2") or a name.
                    if (tgt.track != null && tgt.track !== '') {
                        const t = resolveTrack(tgt.track);
                        if (!t) { graph.setMessage(' Track "' + tgt.track + '" not found.'); return; }
                        zoomToFeature(t, feature);
                        return;
                    }

                    const needle = tgt.transcript || tgt.gene || tgt.name;

                    // Pure zoom in/out with no target track.
                    if (!needle && (tgt.zoom === 'in' || tgt.zoom === 'out')) { zoomInOut(tgt.zoom); return; }

                    // Feature-only ("zoom into exon 2" with no track/gene): among all
                    // tracks that have this feature, zoom into the one whose feature is
                    // nearest the current screen center.
                    if (!needle && feature) {
                        let centerWorld = null;
                        try {
                            const g = graph.graph && graph.graph.grid;
                            if (g && isFinite(g.xmin) && isFinite(g.xmax)) centerWorld = (g.xmin + g.xmax) / 2;
                        } catch (e) { }

                        let best = null, bestDist = Infinity;
                        for (const t of (graph.track || [])) {
                            const r = resolveFeatureRange(t, feature);
                            if (!r || !isFinite(r.xi) || !isFinite(r.xf)) continue;
                            let cw;
                            try { cw = (t.tgraph.X(r.xi) + t.tgraph.X(r.xf)) / 2; } catch (e) { cw = (r.xi + r.xf) / 2; }
                            const d = (centerWorld == null) ? 0 : Math.abs(cw - centerWorld);
                            if (d < bestDist) { bestDist = d; best = t; }
                        }
                        if (!best) { graph.setMessage(' Could not find "' + feature + '" on any track.'); return; }
                        zoomToFeature(best, feature);
                        return;
                    }

                    if (!needle) { graph.setMessage(' Could not determine where to navigate.'); return; }

                    const matches = findTracks(needle);
                    if (!matches.length) {
                        graph.setMessage(' No loaded track matches "' + needle + '".');
                        return;
                    }
                    if (matches.length === 1) { zoomToFeature(matches[0], feature); return; }

                    // Multiple matching tracks — let the user pick one.
                    const menu = matches.map((t) => ({
                        label: (t.name || t.transcriptID || 'track') + (feature ? '  → ' + feature : ''),
                        click: () => { graph.showSideMenu(null); zoomToFeature(t, feature); },
                        move: () => { log(''); }
                    }));
                    graph.setMessage(' ' + matches.length + ' tracks match "' + needle + '"'
                        + (feature ? ' — pick one to zoom to its ' + feature : ' — choose one') + ':');
                    graph.showSideMenu(menu);
                    return;
                }
                case 'fetch_annotations': {
                    const src = step.source || 'ensembl';
                    const filter = step.filter || '';
                    const tracks = (graph.track || []).filter(t => t && t.chr != null && t.chr !== '');
                    if (!tracks.length) { graph.setMessage(' No tracks with a chromosome to annotate.'); return; }

                    const regions = tracks.map((t, i) => {
                        const rr = visibleGenomicRange(t);
                        return { chr: fixChr(t.chr), start: rr.start, end: rr.end, track: i };
                    });
                    graph.setMessage(' Fetching ' + (filter ? filter + ' ' : '')
                        + 'variants for ' + regions.length + ' visible region(s)...');

                    let em = new EngineMonitor((m) => { log(m); });
                    let res = null;
                    try { res = await exec(server + '/py/annotations/fetch-region.py', em, regions, src, filter); }
                    catch (e) { graph.setMessage(' Fetch failed: ' + (e && e.message ? e.message : e)); return; }

                    let results = [];
                    try { results = JSON.parse(res.results); } catch (e) { results = []; }

                    const SnpIndel = await getSnpIndel();
                    if (!SnpIndel) { graph.setMessage(' Could not load the variant type.'); return; }

                    let added = 0, mapped = 0;
                    for (let r of results) {
                        const t = tracks[r.track];
                        if (!t) continue;
                        if (!t.snpindels) t.snpindels = [];

                        // Index existing SNPs so a fetched variant MAPS onto the best
                        // matching existing annotation (by rsID, else by genomic
                        // position within a small tolerance) instead of duplicating it.
                        const byId = {}, byPos = {};
                        for (const s of t.snpindels) {
                            if (s && s.id != null) byId[('' + s.id).toLowerCase()] = s;
                            if (s && s.xi != null) byPos[Math.round(s.xi)] = s;
                        }
                        const bestMap = (v) => {
                            if (v.id && byId[('' + v.id).toLowerCase()]) return byId[('' + v.id).toLowerCase()];
                            if (v.start != null) {
                                for (let d = 0; d <= 2; d++) {
                                    if (byPos[v.start + d]) return byPos[v.start + d];
                                    if (byPos[v.start - d]) return byPos[v.start - d];
                                }
                            }
                            return null;
                        };

                        for (let v of (r.variants || [])) {
                            const clinsig = (v.clinical_significance || []).join(', ');
                            const hit = bestMap(v);
                            if (hit) {
                                // Map the fetched significance onto the existing SNP.
                                try {
                                    if (clinsig) hit.clinsig = clinsig;
                                    if (v.consequence) hit.clindn = v.consequence;
                                    if ((hit.id == null || hit.id === '') && v.id) hit.id = v.id;
                                } catch (e) { }
                                mapped++;
                            } else {
                                const ref = (v.alleles && v.alleles[0]) || 'N';
                                const alt = (v.alleles && v.alleles.length > 1) ? v.alleles.slice(1).join(',') : 'N';
                                let snp = null;
                                try { snp = new SnpIndel('snp', v.start, ref, alt, 1, t.strand, v.id); } catch (e) { snp = null; }
                                if (!snp) continue;
                                try { snp.clinsig = clinsig; snp.clindn = v.consequence || ''; } catch (e) { }
                                if (t.addsnpindel) t.addsnpindel(snp); else t.snpindels.push(snp);
                                if (v.start != null) byPos[Math.round(v.start)] = snp;
                                if (v.id) byId[('' + v.id).toLowerCase()] = snp;
                                added++;
                            }
                            t.showSnpIndels = true;
                        }
                    }
                    graph.setMessage((added || mapped)
                        ? ' ' + (filter ? filter + ' ' : '') + 'variants: added ' + added + ' new, mapped ' + mapped + ' onto existing.'
                        : ' No ' + (filter ? filter + ' ' : '') + 'variants found in the visible region(s).');
                    return;
                }

                case 'add_annotation': {
                    const t = annTrackOrFirst(step.track);
                    if (!t) { graph.setMessage(' No track to annotate.'); return; }
                    const Annotation = await getAnnotation();
                    if (!Annotation) { graph.setMessage(' Could not load the annotation type.'); return; }
                    const type = step.type || 'region';
                    const name = step.name || type;
                    let start = step.start, end = step.end;
                    if (start == null || end == null) {
                        if (t.markstart > 0 && t.markend > t.markstart) { start = t.markstart; end = t.markend; }
                        else { const rr = visibleGenomicRange(t); start = rr.start; end = rr.end; }
                    }
                    try {
                        t.add(new Annotation(type, name, Math.floor(start), Math.floor(end), t.strand));
                        if (t.generateORF) { try { t.generateORF(); } catch (e) { } }
                        graph.setMessage(' Added ' + type + ' "' + name + '" to ' + (t.name || 'track'));
                    } catch (e) { graph.setMessage(' Failed to add annotation.'); }
                    return;
                }

                case 'remove_annotation': {
                    const t = annTrackOrFirst(step.track);
                    if (!t) { graph.setMessage(' No track.'); return; }
                    if (step.all === true || ('' + (step.name || step.type || '')).toLowerCase() === 'all') {
                        if (t.annotations) t.annotations.length = 0;
                        graph.setMessage(' Removed all annotations from ' + (t.name || 'track'));
                    } else if (step.type) {
                        const ty = mapAnnType(step.type);
                        if (t.removeAnnotationByType) t.removeAnnotationByType(ty);
                        else if (t.annotations) t.annotations = t.annotations.filter(a => !(a && a.type === ty));
                        graph.setMessage(' Removed ' + step.type + ' annotations from ' + (t.name || 'track'));
                    } else if (step.name) {
                        const a = (t.annotations || []).find(x => x && x.name
                            && ('' + x.name).toLowerCase().indexOf(('' + step.name).toLowerCase()) >= 0);
                        if (a && t.removeAnnotation) { t.removeAnnotation(a); graph.setMessage(' Removed annotation "' + step.name + '"'); }
                        else graph.setMessage(' Annotation "' + step.name + '" not found.');
                    } else graph.setMessage(' Specify what to remove (type, name, or all).');
                    if (t.generateORF) { try { t.generateORF(); } catch (e) { } }
                    return;
                }

                case 'edit_annotation': {
                    const t = annTrackOrFirst(step.track);
                    if (!t) { graph.setMessage(' No track.'); return; }
                    const a = (t.annotations || []).find(x => x && x.name
                        && ('' + x.name).toLowerCase().indexOf(('' + (step.name || '')).toLowerCase()) >= 0);
                    if (!a) { graph.setMessage(' Annotation "' + (step.name || '') + '" not found.'); return; }
                    if (step.newName) a.name = step.newName;
                    if (step.color && a.setColor) a.setColor(step.color);
                    if (step.start != null && a.setI) a.setI(Math.floor(step.start));
                    if (step.end != null && a.setF) a.setF(Math.floor(step.end));
                    if (t.generateORF) { try { t.generateORF(); } catch (e) { } }
                    graph.setMessage(' Updated annotation "' + a.name + '"');
                    return;
                }

                case 'filter_snps': {
                    // Deterministic keep/remove of variants (SnpIndel objects) by
                    // clinical significance, over every VISIBLE track. Each track's
                    // full snpindels list is searched; e.g. "remove all non-pathogenic
                    // snps" arrives as keep:"pathogenic" (keep only pathogenic).
                    const keep = step.keep ? ('' + step.keep).toLowerCase().trim() : null;
                    const remove = step.remove ? ('' + step.remove).toLowerCase().trim() : null;
                    if (!keep && !remove) { graph.setMessage(' Specify what to keep or remove (e.g. pathogenic).'); return; }
                    const tracks = visibleTracks();
                    const seen = {};
                    let scanned = 0;
                    // Plan removals per track first (don't mutate yet), and tally the
                    // distinct significance values so we can diagnose a no-match wipe.
                    const plan = [];
                    for (const t of tracks) {
                        if (!t || !t.snpindels || !t.snpindels.length) continue;
                        const doomed = [];
                        for (const s of t.snpindels) {
                            const raw = s && s.clinsig;
                            const k = (raw == null || raw === '') ? '(none)' : ('' + raw);
                            seen[k] = (seen[k] || 0) + 1;
                            scanned++;
                            const match = keep ? clinsigMatches(raw, keep) : clinsigMatches(raw, remove);
                            const drop = keep ? !match : match;   // keep -> drop non-matches
                            if (drop) doomed.push(s);
                        }
                        plan.push({ t: t, doomed: doomed });
                    }
                    const totalDoomed = plan.reduce((a, p) => a + p.doomed.length, 0);
                    // Safety: a KEEP that would delete EVERY variant almost always means
                    // the significance values aren't in the expected format — report the
                    // values present instead of destroying the data.
                    if (keep && scanned > 0 && (scanned - totalDoomed) === 0) {
                        const vals = Object.keys(seen).slice(0, 8).map((v) => v + '×' + seen[v]).join(', ');
                        graph.setMessage(' Nothing matched "' + keep + '" — nothing removed. Significance values present: ' + vals);
                        return;
                    }
                    let removed = 0, kept = 0;
                    for (const p of plan) {
                        for (const s of p.doomed) { if (p.t.removesnp) { try { p.t.removesnp(s); } catch (e) { } } }
                        if (p.doomed.length) {
                            const dead = new Set(p.doomed);
                            p.t.snpindels = p.t.snpindels.filter((s) => !dead.has(s));
                        }
                        removed += p.doomed.length;
                        kept += p.t.snpindels.length;
                    }
                    graph.setMessage(' Searched ' + scanned + ' variant(s) across ' + tracks.length
                        + ' visible track(s) — kept ' + kept + ', removed ' + removed
                        + (keep ? ' (kept only "' + keep + '")' : ' (removed "' + remove + '")') + '.');
                    return;
                }

                case 'show': {
                    // "show me X" — select the matching object(s) and draw a
                    // lasso-style outline (TrackLayer polygon) around them.
                    const TrackLayer = await exec('baja/bio/track-layer.js');
                    // Clear any previous show-lassos so highlights don't stack.
                    for (const t of (graph.track || [])) {
                        if (t.track_layers) t.track_layers = t.track_layers.filter(l => !(l && ('' + l.name).indexOf('__show_') === 0));
                    }
                    let counter = 0;
                    const drawLasso = (track, xi, xf, color) => {
                        if (!TrackLayer || !track || !isFinite(xi) || !isFinite(xf)) return;
                        const lo = Math.min(xi, xf), hi = Math.max(xi, xf);
                        try {
                            const layer = new TrackLayer('__show_' + (counter++), lo, 0, hi, 1);
                            layer.polygon_type = 'line';   // outline, like a freehand lasso
                            layer.addPolygonPoint(lo, 0);
                            layer.addPolygonPoint(lo, 1);
                            layer.addPolygonPoint(hi, 1);
                            layer.addPolygonPoint(hi, 0);
                            layer.addPolygonPoint(lo, 0);
                            if (layer.setColor) layer.setColor(color || '#2f6feb');
                            track.addLayer(layer);
                        } catch (e) { }
                    };

                    const feature = step.feature || null;
                    const typ = step.type ? mapAnnType(step.type) : null;
                    const filter = step.filter ? ('' + step.filter).toLowerCase() : null;
                    const wantSnps = !!filter
                        || (step.type && (('' + step.type).toLowerCase().indexOf('snp') >= 0
                            || ('' + step.type).toLowerCase().indexOf('variant') >= 0));

                    let targetTracks = [];
                    if (step.track != null) { const tt = resolveTrack(step.track); if (tt) targetTracks = [tt]; }
                    else if (step.gene) { targetTracks = findTracks(step.gene); }
                    else targetTracks = (graph.track || []);
                    if (!targetTracks.length) { graph.setMessage(' Nothing matches to show.'); return; }

                    let shown = 0;
                    for (const t of targetTracks) {
                        if (feature && !wantSnps) {
                            const r = resolveFeatureRange(t, feature);
                            if (r) {
                                const rlo = Math.min(r.xi, r.xf), rhi = Math.max(r.xi, r.xf);
                                for (const a of (t.annotations || [])) {
                                    if (a && Math.max(a.xi, a.xf) >= rlo && Math.min(a.xi, a.xf) <= rhi) { if (a.select) a.select(); }
                                }
                                drawLasso(t, rlo, rhi); shown++;
                            }
                        } else if (wantSnps) {
                            const matching = (t.snpindels || []).filter(s => !filter || (('' + (s.clinsig || '')).toLowerCase().indexOf(filter) >= 0));
                            if (matching.length) {
                                let lo = Infinity, hi = -Infinity;
                                for (const s of matching) { s.highlight = true; lo = Math.min(lo, s.xi); hi = Math.max(hi, s.xf || s.xi); }
                                t.showSnpIndels = true;
                                if (isFinite(lo)) { drawLasso(t, lo, hi, '#c0392b'); shown++; }
                            }
                        } else if (typ) {
                            const anns = (t.annotations || []).filter(a => a && a.type === typ);
                            if (anns.length) {
                                let lo = Infinity, hi = -Infinity;
                                for (const a of anns) { if (a.select) a.select(); lo = Math.min(lo, Math.min(a.xi, a.xf)); hi = Math.max(hi, Math.max(a.xi, a.xf)); }
                                if (isFinite(lo)) { drawLasso(t, lo, hi); shown++; }
                            }
                        } else {
                            if (t.select) t.select();
                            drawLasso(t, t.xi, t.xf); shown++;
                        }
                    }
                    graph.setMessage(shown ? ' Highlighted ' + shown + ' region(s).' : ' Nothing to show.');
                    return;
                }

                case 'design_gapmer': {
                    // Gapmer = a DNA gap flanked by modified wings, PS (phosphorothioate)
                    // backbone by default. "3-10-3 cET" => 3 cET wing / 10 DNA gap / 3 cET
                    // wing. The gap is always PS ('sp') unless a backbone is specified.
                    const wing5 = parseInt(step.wing5 != null ? step.wing5 : (step.wing != null ? step.wing : 3), 10) || 3;
                    const wing3 = parseInt(step.wing3 != null ? step.wing3 : (step.wing != null ? step.wing : wing5), 10) || wing5;
                    const gap = parseInt(step.gap != null ? step.gap : 10, 10) || 10;
                    const wingChem = ('' + (step.wingChem || step.chem || 'moe')).toLowerCase();
                    const gapChem = ('' + (step.gapChem || 'd')).toLowerCase();      // DNA gap
                    const bb = ('' + (step.backbone || 'sp')).toLowerCase();         // PS default
                    const gapBb = ('' + (step.gapBackbone || bb)).toLowerCase();     // gap PS unless specified

                    // Build the per-position list, then the template. Each position is
                    // "<sugar>()<backbone>"; the final 3' position carries no backbone.
                    const positions = [];
                    for (let i = 0; i < wing5; i++) positions.push({ s: wingChem, b: bb });
                    for (let i = 0; i < gap; i++) positions.push({ s: gapChem, b: gapBb });
                    for (let i = 0; i < wing3; i++) positions.push({ s: wingChem, b: bb });
                    const L = positions.length;
                    if (L < 3) { graph.setMessage(' Gapmer too short.'); return; }
                    const template = positions.map((p, i) => p.s + '()' + (i < L - 1 ? p.b : '')).join('.');

                    const label = wing5 + '-' + gap + '-' + wing3 + ' ' + wingChem.toUpperCase() + ' gapmer';
                    const chemObj = { type: 'gapmer', template: template, name: label };

                    const t = annTrackOrFirst(step.track);
                    if (!t) { graph.setMessage(' No track to design on.'); return; }

                    // Create the oligo at a genomic start (L bases from there).
                    const placeGapmer = async (start) => {
                        let seq = '';
                        try { seq = (t.getSequenceRange(start, start + L) || ''); } catch (e) { }
                        if (!seq || seq.length < L) { graph.setMessage(' Not enough sequence there for a ' + L + '-mer.'); return false; }
                        seq = seq.substring(0, L);
                        try {
                            const Biopolymer = await exec('baja/chem/biopolymer.js');
                            Biopolymer.createOligoFromTemplateUseSeqIn(chemObj, t, start, seq, 0.2, '');
                        } catch (e) { graph.setMessage(' Design failed: ' + (e && e.message ? e.message : e)); return false; }
                        try { graph.rescale(); } catch (e) { }
                        return true;
                    };
                    // Rough Tm for a long oligo (GC formula).
                    const tmOf = (s) => {
                        if (!s || !s.length) return -Infinity;
                        let gc = 0; for (const c of ('' + s).toUpperCase()) if (c === 'G' || c === 'C') gc++;
                        return 64.9 + 41 * (gc - 16.4) / s.length;
                    };

                    // Explicit placement -> just place it (highlight, else visible start).
                    if (step.place === true) {
                        let start;
                        if (t.markstart >= 0 && t.markend > t.markstart) start = Math.floor(t.markstart);
                        else { const rr = visibleGenomicRange(t); start = rr.start; }
                        if (await placeGapmer(start)) graph.setMessage(' Placed ' + label + ' at ' + start + ' on ' + (t.name || 'track') + '.');
                        return;
                    }

                    // Otherwise: offer targeting options rather than placing automatically.
                    const menu = [
                        {
                            label: '1) Click track — pick 5′ position', move: () => { },
                            click: () => {
                                graph.showSideMenu(null);
                                graph.setMessage(' Click on ' + (t.name || 'the track') + ' where the gapmer 5′ end starts…');
                                graph.clearMouseListeners();
                                graph.addMouseDownListener(async (xwc, ywc) => {
                                    let start;
                                    try { start = Math.round(t.tgraph.Xwc(xwc)); } catch (e) { start = Math.round(xwc); }
                                    graph.clearMouseListeners();
                                    if (await placeGapmer(start)) graph.setMessage(' Placed ' + label + ' at ' + start + ' on ' + (t.name || 'track') + '.');
                                    try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
                                });
                            }
                        },
                        {
                            label: '2) Selected sequence', move: () => { },
                            click: async () => {
                                graph.showSideMenu(null);
                                let start = null;
                                if (t.markstart >= 0 && t.markend > t.markstart) start = Math.floor(t.markstart);
                                if (start == null) { graph.setMessage(' Highlight a region first, then choose "Selected sequence".'); return; }
                                if (await placeGapmer(start)) graph.setMessage(' Placed ' + label + ' on the selected sequence (' + start + ').');
                            }
                        },
                        {
                            label: '3) Optimal Tm', move: () => { },
                            click: async () => {
                                graph.showSideMenu(null);
                                const rr = visibleGenomicRange(t);
                                const span = rr.end - rr.start;
                                if (span < L) { graph.setMessage(' Zoom to a region at least ' + L + ' nt wide.'); return; }
                                const stepBp = Math.max(1, Math.floor(span / 400));
                                let best = null, bestTm = -Infinity;
                                for (let p = rr.start; p + L <= rr.end; p += stepBp) {
                                    let s = '';
                                    try { s = t.getSequenceRange(p, p + L) || ''; } catch (e) { }
                                    if (!s || s.length < L) continue;
                                    const tm = tmOf(s);
                                    if (tm > bestTm) { bestTm = tm; best = p; }
                                }
                                if (best == null) { graph.setMessage(' No suitable window in the visible region.'); return; }
                                if (await placeGapmer(best)) graph.setMessage(' Placed ' + label + ' at the optimal-Tm window ' + best + ' (Tm ≈ ' + bestTm.toFixed(1) + '°C).');
                            }
                        },
                        { label: 'Cancel', move: () => { }, click: () => graph.showSideMenu(null) },
                    ];
                    graph.setMessage(' ' + label + ' — choose how to target it: ');
                    graph.showSideMenu(menu);
                    return;
                }

                case 'compare_sequences': {
                    // Draw the best-match alignment as a TrackLink. Two shapes:
                    //  (a) ONE feature across TWO tracks:  {feature:"exon 5", tracks:[1,2]}
                    //  (b) TWO features on ONE track:      {track:N, features:["exon 1","exon 3"]}
                    let TrackLink = null;
                    try { TrackLink = await exec('baja/bio/track-link'); } catch (e) { }
                    if (!TrackLink) { graph.setMessage(' Could not load the comparison drawer.'); return; }

                    // Runs find-subseq, draws the cross-region link, reports the score.
                    // Runs find-subseq, draws the cross-region link, returns the % identity.
                    const drawCompare = async (qTrack, qRange, tTrack, tRange, shortseq, longseq, label, quiet) => {
                        if (!quiet) graph.setMessage(' Comparing ' + label + '...');
                        let r = null;
                        try { r = await exec('py/baja/sequence-space/find-subseq.py', shortseq, longseq); }
                        catch (e) { if (!quiet) graph.setMessage(' Comparison failed: ' + (e && e.message ? e.message : e)); return null; }
                        if (!r) { if (!quiet) graph.setMessage(' Comparison returned no result.'); return null; }
                        // Percent identity: matching bases / length of the shorter feature.
                        const denom = (shortseq && shortseq.length) ? shortseq.length : 1;
                        const pct = Math.max(0, Math.min(100, Math.round(100 * (r.score || 0) / denom)));
                        const ta1 = { track: qTrack, xi: qRange.xi, xf: qRange.xf, y: 0 };
                        const tb1 = { track: tTrack, xi: tRange.xi + (r.start || 0), xf: tRange.xi + (r.end || 0), y: 0 };
                        try {
                            const tl = new TrackLink(ta1, tb1);
                            tl.mode = 'rect';
                            tl.alpha = pct / 100;
                            tl.color = 'rgb(116,245,163,0.5)';
                            tl.label = pct + '%';
                            if (tl.setValue) tl.setValue(pct);
                            if (graph.appendLayers) graph.appendLayers([tl]);
                            if (!quiet) graph.setMessage(' Compared ' + label + ' — ' + pct + '% identity');
                        } catch (e) { if (!quiet) graph.setMessage(' Failed to draw the comparison.'); return null; }
                        return pct;
                    };

                    const seqOf = (tk, rg) => { try { return tk.getSequenceRange(rg.xi, rg.xf) || ''; } catch (e) { return ''; } };
                    // Compare one feature across two tracks, shorter as query. Returns % identity.
                    const compareFeatureAcross = async (tA, tB, feat, quiet) => {
                        const rA = resolveFeatureRange(tA, feat), rB = resolveFeatureRange(tB, feat);
                        if (!rA || !rB) return null;
                        const sA = seqOf(tA, rA), sB = seqOf(tB, rB);
                        if (!sA || !sB) return null;
                        const lbl = feat + ' between ' + (tA.name || 'track 1') + ' and ' + (tB.name || 'track 2');
                        return (sA.length <= sB.length)
                            ? await drawCompare(tA, rA, tB, rB, sA, sB, lbl, quiet)
                            : await drawCompare(tB, rB, tA, rA, sB, sA, lbl, quiet);
                    };

                    const twoTracks = Array.isArray(step.tracks) && step.tracks.length >= 2;
                    const singleFeature = step.feature || (Array.isArray(step.features) && step.features.length === 1 ? step.features[0] : null);

                    // ---- (a0) ALL exons / introns across two tracks ---------------
                    const featStr = ('' + (singleFeature || '')).toLowerCase();
                    // A repeatable feature type (exon/intron), in any form — plural
                    // ("introns"), adjective ("intronic"), or bare ("intron") — with
                    // NO specific ordinal number means "compare them all, pairwise".
                    const typeWord = /\b(exons?|introns?|exonic|intronic)\b/.test(featStr);
                    const hasOrdinal = /\d/.test(featStr);
                    const allMode = step.all === true
                        || /\ball\b|\bevery\b|\beach\b/.test(featStr)
                        || (typeWord && !hasOrdinal);
                    if (allMode) {
                        let tA, tB;
                        if (twoTracks) { tA = resolveTrack(step.tracks[0]); tB = resolveTrack(step.tracks[1]); }
                        else { tA = (graph.track || [])[0]; tB = (graph.track || [])[1]; }
                        if (!tA || !tB) { graph.setMessage(' Need two tracks to compare.'); return; }
                        const kind = featStr.indexOf('intron') >= 0 ? 'intron' : 'exon';
                        const listA = kind === 'intron' ? (tA.getIntrons ? tA.getIntrons(0) : []) : (tA.getExons ? tA.getExons() : []);
                        const listB = kind === 'intron' ? (tB.getIntrons ? tB.getIntrons(0) : []) : (tB.getExons ? tB.getExons() : []);
                        const n = Math.min((listA || []).length, (listB || []).length);
                        if (!n) { graph.setMessage(' No ' + kind + 's to compare on both tracks.'); return; }
                        graph.setMessage(' Comparing ' + n + ' ' + kind + ' pairs between '
                            + (tA.name || 'track 1') + ' and ' + (tB.name || 'track 2') + '...');
                        const pcts = [];
                        for (let i = 1; i <= n; i++) {
                            const p = await compareFeatureAcross(tA, tB, kind + ' ' + i, true);
                            if (p != null) pcts.push(p);
                        }
                        try { graph.rescale(); } catch (e) { }
                        if (!pcts.length) { graph.setMessage(' Could not compare any ' + kind + ' pairs.'); return; }
                        const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
                        graph.setMessage(' Compared ' + pcts.length + ' ' + kind + ' pairs between '
                            + (tA.name || 'track 1') + ' and ' + (tB.name || 'track 2') + ' — avg ' + avg + '% identity');
                        return;
                    }

                    // Whole track sequence — prefer an active highlight, else the full sequence.
                    const wholeSeq = (tk) => {
                        try {
                            if (tk.markstart >= 0 && tk.markend > tk.markstart && tk.getHighlightedSequence) {
                                const hs = tk.getHighlightedSequence() || '';
                                if (hs) return { seq: hs, range: { xi: tk.markstart, xf: tk.markend } };
                            }
                        } catch (e) { }
                        // getSequenceRange expects GENOMIC coords; the whole track spans tk.xi..tk.xf.
                        const gi = tk.xi, gf = (tk.xf != null && tk.xf > tk.xi)
                            ? tk.xf : (tk.xi + ((tk.sequence && tk.sequence.length) || 0));
                        let seq = tk.sequence || '';
                        if (!seq) { try { seq = tk.getSequenceRange ? (tk.getSequenceRange(gi, gf) || '') : ''; } catch (e) { } }
                        return { seq: seq, range: { xi: gi, xf: gf } };
                    };

                    const twoFeatures = (Array.isArray(step.features) && step.features.length >= 2)
                        || (step.featureA && step.featureB);

                    // ---- (a) one feature (or whole sequence) across two tracks ----
                    if (!twoFeatures) {
                        let tA, tB;
                        if (twoTracks) { tA = resolveTrack(step.tracks[0]); tB = resolveTrack(step.tracks[1]); }
                        else { tA = (graph.track || [])[0]; tB = (graph.track || [])[1]; }
                        if (!tA || !tB) { graph.setMessage(' Need two tracks to compare.'); return; }

                        const feat = singleFeature || (Array.isArray(step.features) && step.features[0]) || null;
                        // "sequence" / "whole" / no feature => compare the entire track sequences.
                        const isWhole = !feat
                            || (/(sequence|whole|full|entire|complete|cdna|transcript)/.test(featStr)
                                && !/(exon|intron|utr|cds|tss|stop)/.test(featStr));

                        if (isWhole) {
                            const wA = wholeSeq(tA), wB = wholeSeq(tB);
                            if (!wA.seq || !wB.seq) { graph.setMessage(' No sequence available on both tracks.'); return; }
                            const label = 'sequence between ' + (tA.name || 'track 1') + ' and ' + (tB.name || 'track 2');
                            if (wA.seq.length <= wB.seq.length) await drawCompare(tA, wA.range, tB, wB.range, wA.seq, wB.seq, label);
                            else await drawCompare(tB, wB.range, tA, wA.range, wB.seq, wA.seq, label);
                            return;
                        }

                        const rA = resolveFeatureRange(tA, feat);
                        const rB = resolveFeatureRange(tB, feat);
                        if (!rA) { graph.setMessage(' Could not find "' + feat + '" on ' + (tA.name || 'track 1') + '.'); return; }
                        if (!rB) { graph.setMessage(' Could not find "' + feat + '" on ' + (tB.name || 'track 2') + '.'); return; }
                        const seqA = seqOf(tA, rA), seqB = seqOf(tB, rB);
                        if (!seqA || !seqB) { graph.setMessage(' No sequence available for "' + feat + '" on both tracks.'); return; }
                        const label = feat + ' between ' + (tA.name || 'track 1') + ' and ' + (tB.name || 'track 2');
                        if (seqA.length <= seqB.length) await drawCompare(tA, rA, tB, rB, seqA, seqB, label);
                        else await drawCompare(tB, rB, tA, rA, seqB, seqA, label);
                        return;
                    }

                    // ---- (b) two features, one track ------------------------------
                    const t = annTrackOrFirst(step.track);
                    if (!t) { graph.setMessage(' No track.'); return; }
                    const feats = step.features || [step.featureA, step.featureB].filter(Boolean);
                    if (!feats || feats.length < 2) {
                        graph.setMessage(' Specify two features to compare (e.g. "exon 1" and "exon 3").'); return;
                    }
                    const rA = resolveFeatureRange(t, feats[0]);
                    const rB = resolveFeatureRange(t, feats[1]);
                    if (!rA) { graph.setMessage(' Could not find "' + feats[0] + '" on ' + (t.name || 'track') + '.'); return; }
                    if (!rB) { graph.setMessage(' Could not find "' + feats[1] + '" on ' + (t.name || 'track') + '.'); return; }
                    const seqA = seqOf(t, rA), seqB = seqOf(t, rB);
                    if (!seqA || !seqB) { graph.setMessage(' No sequence available for those features.'); return; }
                    const label = feats[0] + ' vs ' + feats[1] + ' on ' + (t.name || 'track');
                    if (seqA.length <= seqB.length) await drawCompare(t, rA, t, rB, seqA, seqB, label);
                    else await drawCompare(t, rB, t, rA, seqB, seqA, label);
                    return;
                }

                case 'run_code': {
                    // AI-generated JavaScript that operates on the tracks. Runs with
                    // bindings: graph, tracks (array), log, SnpIndel, Annotation.
                    const code = ('' + (step.code || '')).trim();
                    if (!code) { graph.setMessage(' No code was generated.'); return; }
                    const tracks = graph.track || [];
                    const SnpIndel = await getSnpIndel();
                    const Annotation = await getAnnotation();
                    try {
                        const fn = new Function('graph', 'tracks', 'log', 'SnpIndel', 'Annotation', code);
                        fn(graph, tracks, (typeof log !== 'undefined' ? log : function () { }), SnpIndel, Annotation);
                        graph.setMessage(step.description ? ' ' + step.description : ' Applied.');
                    } catch (e) {
                        console.error('run_code failed:', e, code);
                        graph.setMessage(' Generated code failed: ' + (e && e.message ? e.message : e));
                    }
                    return;
                }

                case 'annotate': {
                    if (step.note) graph.setMessage(' ' + step.note);
                    let script = 'baja/manchester/menu/annotation/annotation-tools2.js';
                    if (('' + (step.kind || '')).toLowerCase() === 'mutations') {
                        script = 'baja/manchester/menu/variant-tools-finder.js';
                    }
                    try { await exec(script, graph, genegraph_panel_layout); }
                    catch (e) { graph.setMessage(' Annotation tool failed.'); }
                    return;
                }
                case 'message':
                default:
                    graph.setMessage(' ' + (step.message || 'Nothing to do.'));
                    return;
            }
        };

        // ---- run: prompt -> python (Anthropic) -> steps -> execute --------
        const run = async (rawQuery) => {
            const query = ('' + (rawQuery || '')).trim();
            if (!query) { resolve(null); return; }
            remember(query);

            // Deterministic: "remove/delete/clear layer(s)" opens a click-to-remove
            // menu of every layer across all tracks (no need to hit the model).
            if (/\b(remove|delete|clear)\b[\s\S]*\blayers?\b/i.test(query)) {
                showLayerMenu();
                return;
            }

            // Deterministic: "select sequence" — pick a track from a menu, then
            // select its whole sequence. (Not annotation/feature selection.)
            {
                const q = query.toLowerCase();
                if (/\bselect\b/.test(q) && /\bsequence\b/.test(q)
                    && !/(intron|exon|annotation|cds|utr|tss|stop|snp|variant|donor|acceptor)/.test(q)) {
                    showTrackSeqMenu();
                    return;
                }
            }

            // Deterministic: "compare all exons/introns between the tracks" — iterate
            // over EVERY exon/intron pair. The model sometimes returns a single
            // feature ("intron 1"), which only compares one; handle it here instead.
            {
                const q = query.toLowerCase();
                const kind = /intron/.test(q) ? 'all introns' : (/exon/.test(q) ? 'all exons' : null);
                const allish = /\ball\b|\bevery\b|\beach\b|introns|exons|intronic|exonic/.test(q);
                if (/\bcompare\b/.test(q) && kind && allish) {
                    const nums = (q.match(/track\s*(\d+)/g) || []).map((s) => parseInt(s.replace(/\D/g, ''), 10));
                    const tracks = nums.length >= 2 ? nums.slice(0, 2) : undefined;
                    await runStep({ op: 'compare_sequences', feature: kind, tracks: tracks });
                    try { graph.rescale(); } catch (e) { }
                    resolve([{ op: 'compare_sequences', feature: kind }]);
                    return;
                }
            }

            // Deterministic: pathogenicity SNP filtering. The model occasionally
            // routes this to run_code (which has removed everything before); force
            // the deterministic filter_snps op for the common phrasings.
            {
                const q = query.toLowerCase();
                if (/\b(snp|snps|variant|variants|mutation|mutations)\b/.test(q)) {
                    let step = null;
                    if (/(non[-\s]?pathogenic|not\s+pathogenic)/.test(q) && /\b(remove|delete|drop|keep|only|filter)\b/.test(q)) {
                        step = { op: 'filter_snps', keep: 'pathogenic' };
                    } else if (/\b(keep|only)\b[\s\S]*\bpathogenic\b/.test(q)) {
                        step = { op: 'filter_snps', keep: 'pathogenic' };
                    } else if (/\b(remove|delete|drop)\b[\s\S]*\bbenign\b/.test(q)) {
                        step = { op: 'filter_snps', remove: 'benign' };
                    }
                    if (step) {
                        if (context === 'annotate') pushUndo();
                        await runStep(step);
                        try { graph.rescale(); } catch (e) { }
                        resolve([step]);
                        return;
                    }
                }
            }

            let em = new EngineMonitor((m) => { log(m); });
            graph.setMessage(' Thinking... ');

            let res = null;
            try { res = await exec(PY, em, query, context); }
            catch (e) {
                graph.setMessage(' Action failed: ' + (e && e.message ? e.message : e));
                resolve(null); return;
            }

            let steps = [];
            try { steps = JSON.parse(res.steps); } catch (e) { steps = []; }
            if (res && res.error) console.warn('prompt-action note:', res.error);

            if (!steps.length) { graph.setMessage(' Nothing to do.'); resolve(null); return; }

            // Snapshot for undo before any editing step (not for undo/redo/message).
            if (context === 'annotate') {
                const editing = steps.some(s => s && s.op
                    && s.op !== 'undo' && s.op !== 'redo' && s.op !== 'message' && s.op !== 'show');
                if (editing) pushUndo();
            }

            for (let s of steps) { await runStep(s); }
            try { graph.rescale(); } catch (e) { }
            resolve(steps);
        };

        if (presetQuery && ('' + presetQuery).trim()) { await run(presetQuery); return; }

        // ---- context-specific modal copy ----------------------------------
        const COPY = {
            track: {
                title: 'What should I do with the tracks?',
                hint: `e.g. "add human, mouse and rat KRAS", "remove last track", "remove layers", "zoom into track 1", "compare track 2 and 1", "select all introns on track 2"`
            },
            navigate: {
                title: 'Where do you want to go?',
                hint: `e.g. "go to FGFR3", "zoom to track 2", or "reset the view"`
            },
            annotate: {
                title: 'What should I annotate?',
                hint: `e.g. "highlight splice sites", "find mutations", or "show ORFs"`
            },
            general: {
                title: 'What would you like to do?',
                hint: `Describe an action in plain language.`
            }
        };
        const copy = COPY[context] || COPY.general;

        // ---- prompt modal --------------------------------------------------
        let v = null;

        const setBox = (val) => {
            try { if (v && v.updateValue) v.updateValue(val); else if (v) v.value = val; } catch (e) { }
        };
        const prevPrompt = () => {
            if (!history.length) return;
            histIndex = Math.max(0, histIndex - 1);
            setBox(history[histIndex] || '');
        };
        const nextPrompt = () => {
            if (!history.length) return;
            histIndex = Math.min(history.length, histIndex + 1);
            setBox(histIndex < history.length ? history[histIndex] : '');
        };
        const esc = (s) => ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const logHtml = () => {
            if (!history.length) return '<i style="color:#888;">No previous prompts yet.</i>';
            const items = history.slice(-15).reverse().map((p) =>
                '<div style="padding:2px 6px;border-bottom:1px solid #eee;font-size:0.8rem;'
                + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
                + esc(p) + '</div>'
            ).join('');
            return '<div style="max-height:150px;overflow:auto;border:1px solid #e3e7ec;border-radius:6px;">'
                + items + '</div>';
        };

        let describe = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'title': copy.title,
                            'width': '100%',
                            'component': {
                                wid: 'input-textarea-editor',
                                data: {
                                    'showButton': false,
                                    'title': 'Command',
                                    'ionHookFunction': createIonFunction((input_box) => { v = input_box; })
                                }
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': { wid: 'html', data: copy.hint }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: '◀', background: '#ffffff', color: '#000000', borderColor: '#c8ced6',
                                            ionFunction: createIonFunction(() => { prevPrompt(); })
                                        },
                                        {
                                            label: '▶', background: '#ffffff', color: '#000000', borderColor: '#c8ced6',
                                            ionFunction: createIonFunction(() => { nextPrompt(); })
                                        },
                                        {
                                            label: 'OK', ionFunction: createIonFunction(async () => {
                                                let query = '';
                                                try {
                                                    query = (v && v.getWidgetValue) ? v.getWidgetValue()
                                                        : (v && v.value ? v.value : '');
                                                } catch (e) { }
                                                hideAllModal();
                                                setTimeout(() => { run(query); }, 200);
                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                                resolve(null);
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

        showModal(describe);
    });
}
