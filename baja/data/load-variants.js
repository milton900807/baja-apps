function (server, graph, genegraph_panel_layout, db, dbLabel, autoUseSelection) {
    // Load variants from a major variant database (ClinVar / dbSNP / gnomAD / COSMIC).
    // A center menu first asks for the scope: load over an ENTIRE track (click a track),
    // or over a SELECTED SEQUENCE (click-and-drag a region on a track). Variants come back
    // from the server's /variants/region proxy and are dropped on the track as SnpIndels,
    // colored by database (ClinVar by clinical significance). Failsafe.
    //
    // When autoUseSelection is true (the "Load more SNPs" menu), skip the scope prompt if
    // the user already has a sequence selected on one or more tracks: load those selected
    // regions directly. Only when nothing is selected do we fall back to the scope prompt.
    const label = dbLabel || db;

    const restoreHover = () => {
        try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
    };

    const colorFor = (clinsig) => {
        const d = ('' + db).toLowerCase();
        if (d === 'clinvar' || (clinsig && clinsig.length)) {
            const s = (clinsig || []).join(' ').toLowerCase();
            if (s.indexOf('pathogenic') >= 0) return '#d1342f';                        // red
            if (s.indexOf('benign') >= 0) return '#2e9e44';                            // green
            if (s.indexOf('uncertain') >= 0 || s.indexOf('conflicting') >= 0) return '#e0a400'; // amber
            return '#d1342f';
        }
        if (d === 'cosmic') return '#9b3fb5';   // purple  (somatic)
        if (d === 'gnomad') return '#0c9e9e';   // teal    (population)
        return '#2a6fd6';                        // blue    (dbSNP)
    };

    // Load variants onto `track`. forceWhole=true ignores any sequence selection and uses
    // the whole track; otherwise a current selection (markstart/markend) scopes the query.
    const loadRegion = async (track, forceWhole) => {
        graph.clearMouseListeners();
        graph.setMouseMode('navigate');
        try {
            if (!track || !track.chr) {
                graph.setMessage(' That track has no chromosome for a variant lookup. ');
                restoreHover(); return;
            }
            const species = ('' + (track.species || 'human')).toLowerCase();
            const chr = ('' + track.chr).replace(/^chr/, '');

            // Region: the selected sequence range (unless forced whole) else the whole track.
            // Child (cDNA / mRNA) tracks render in LOCAL coordinates (0..len), so their tgraph
            // bounds are not genomic — query the track's genomic span (gxi/gxf), and the
            // variants get mapped back onto the exons by variantWorldX().
            const tg = track.tgraph;
            const isChild = !!(track.isChildCDNATrack && track.isChildCDNATrack());
            let tlo, thi;
            if (isChild && track.gxi != null && track.gxf != null) {
                tlo = Math.min(track.gxi, track.gxf);
                thi = Math.max(track.gxi, track.gxf);
            } else if (tg && tg.xmin != null && tg.xmax != null) {
                tlo = Math.min(tg.xmin, tg.xmax);
                thi = Math.max(tg.xmin, tg.xmax);
            } else {
                tlo = Math.min(track.xi, track.xf);
                thi = Math.max(track.xi, track.xf);
            }
            const hasSel = !forceWhole && (track.markstart > 0 && track.markend > track.markstart);
            let gStart, gEnd;
            if (hasSel) {
                let s = Math.min(track.markstart, track.markend);
                let e = Math.max(track.markstart, track.markend);
                if (isChild && track.genomicAt) {
                    // Selection is in LOCAL coords on a child track — map to genomic.
                    let gs = track.genomicAt(s), ge = track.genomicAt(e);
                    if (gs != null && ge != null) { gStart = Math.min(gs, ge); gEnd = Math.max(gs, ge); }
                    else { gStart = tlo; gEnd = thi; }
                } else {
                    gStart = Math.max(tlo, s);
                    gEnd = Math.min(thi, e);
                }
            } else {
                gStart = tlo;
                gEnd = thi;
            }
            gStart = Math.floor(gStart); gEnd = Math.ceil(gEnd);
            if (!(gEnd > gStart)) { graph.setMessage(' Could not determine a region for ' + (track.name || 'track') + '. '); restoreHover(); return; }

            const url = server + '/variants/region?species=' + encodeURIComponent(species)
                + '&region=' + encodeURIComponent(chr + ':' + gStart + '-' + gEnd)
                + '&db=' + encodeURIComponent(db) + '&limit=500';

            // Animated loading indicator — the plain status message auto-clears after ~5s,
            // so a longer fetch would look idle. Re-post a spinner frame every ~350ms (which
            // also resets that timeout) so it's clearly still working until the fetch returns.
            const spinFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
            let spinN = 0;
            const region = 'chr' + chr + ':' + gStart + '-' + gEnd + (hasSel ? ' (selection)' : ' (whole track)');
            const loadingMsg = () => ' ' + spinFrames[spinN++ % spinFrames.length] + ' Loading ' + label + ' variants — ' + region + '… ';
            graph.setMessage(loadingMsg());
            const spinner = setInterval(() => { try { graph.setMessage(loadingMsg()); } catch (e) { } }, 350);

            let resp = null;
            try {
                // Locally-hosted databases (ClinVar) are read straight from the reference VCF
                // via the exec() python (py/bio/read-vcf-variants.py). Everything else (and any
                // failure) goes through the /variants/region HTTP endpoint.
                if (db === 'clinvar') {
                    try {
                        let em = new EngineMonitor(function (m) { try { log(m); } catch (e) { } });
                        let r = await exec(server + '/py/bio/read-vcf-variants.py', em, 'clinvar', '' + chr, '' + gStart, '' + gEnd, 'clinvar');
                        let vs = [];
                        try { vs = JSON.parse(r.variants); } catch (e) { vs = []; }
                        if (vs.length || (r && !r.error)) resp = { variants: vs, source: 'local-exec', total: (r && r.count) || vs.length, truncated: false };
                    } catch (e) { resp = null; }
                }
                if (!resp) resp = await GETJSON(url);   // fallback / non-local dbs
            }
            catch (e) { resp = null; }
            finally { clearInterval(spinner); }
            const list = (resp && resp.variants) || [];
            if (!list.length) {
                graph.setMessage(' No ' + label + ' variants found' + (resp && resp.error ? ' (' + resp.error + ')' : '')
                    + ' for chr' + chr + ':' + gStart + '-' + gEnd + '. ');
                restoreHover(); return;
            }

            graph.setMessage(' ' + spinFrames[0] + ' Placing ' + list.length + ' ' + label + ' variant' + (list.length === 1 ? '' : 's') + '… ');

            let SnpIndel = null;
            try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { }
            if (!SnpIndel) { graph.setMessage(' Variant support unavailable. '); restoreHover(); return; }

            const MAX_ALLELE = 50;   // skip structural variants (giant ref/alt)
            let added = 0, skippedSv = 0;
            for (const v of list) {
                if (!v || v.start == null) continue;
                if (v.chr && ('' + v.chr).replace(/^chr/, '') !== chr) continue;
                // Structural variant guard — alleles this large aren't point markers.
                if (('' + (v.ref || '')).length > MAX_ALLELE || ('' + (v.alt || '')).length > MAX_ALLELE) { skippedSv++; continue; }
                const wx = track.variantWorldX ? track.variantWorldX(v.chr || chr, v.start) : null;
                if (wx == null) continue;

                let ref = ('' + (v.ref || 'N')).toUpperCase();
                let alt = ('' + (v.alt || 'N')).toUpperCase();
                if (!/^[ACGTN]+$/.test(ref)) ref = 'N';
                if (!/^[ACGTN]+$/.test(alt)) alt = 'N';
                let type = 'snp';
                if (ref.length === 1 && alt.length === 1) type = 'snp';
                else if (alt.length > ref.length) type = 'ins';
                else if (ref.length > alt.length) type = 'del';

                // Deletions are anchored one base before the deleted run on the + strand.
                let placeXi = wx;
                if (type === 'del' && track.strand !== -1) placeXi = wx + 1;

                const clinsig = v.clinsig || [];
                const snp = new SnpIndel(type, placeXi, ref, alt, 0, track.strand,
                    (v.id || label), null, colorFor(clinsig));
                try {
                    snp.name = v.id || label;
                    if (clinsig.length) snp.clinsig = clinsig.join(', ');
                    if (v.af != null) { snp.quality = 'AF=' + v.af; snp.af = +v.af; }
                    if (v.consequence) snp.structure = v.consequence;
                    snp.source = v.source || label;   // filterable: dbSNP / ClinVar / gnomAD / COSMIC
                } catch (e) { }
                track.addsnpindel(snp);
                track.showSnpIndels = true;
                added++;
            }

            if (graph.wake) graph.wake();
            if (!added) {
                // Server returned variants but none mapped onto the track's extent.
                graph.setMessage(' ' + list.length + ' ' + label + ' variant' + (list.length === 1 ? '' : 's')
                    + ' returned for chr' + chr + ':' + gStart + '-' + gEnd
                    + ' but none fall within this track (' + chr + ':' + Math.floor(tlo) + '-' + Math.ceil(thi) + '). ');
                restoreHover(); return;
            }
            const capNote = (resp && resp.truncated) ? ' (capped at ' + list.length + (resp.total ? ' of ' + resp.total : '') + ' — select a smaller range for the rest)' : '';
            graph.setMessage(' Loaded ' + added + ' of ' + list.length + ' ' + label + ' variant' + (list.length === 1 ? '' : 's') + capNote
                + ' onto ' + (track.name || 'track') + '. ');
        } catch (e) {
            graph.setMessage(' Variant load error: ' + e + ' ');
        }
        restoreHover();
    };

    // Scope 1: load over an entire track — click a track.
    const armEntireTrack = () => {
        graph.clearMouseListeners();
        graph.setMouseMode('msg: Click a track to load ' + label + ' over the whole track.');
        graph.addMouseDownListener(async (x, y) => {
            const ti = graph.getTrack(x, y);
            if (ti < 0) return;
            await loadRegion(graph.track[ti], true);
        });
    };

    // Scope 2: load over a selected sequence — click and drag a region on a track.
    const armSelectSequence = () => {
        graph.clearMouseListeners();
        graph.setMouseMode('msg: Click and drag on a track to select where to load ' + label + '.');
        let track = null, start = 0, end = 0, dragging = false;
        graph.addMouseDownListener((x, y) => {
            const ti = graph.getTrack(x, y);
            if (ti < 0) return;
            track = graph.track[ti];
            try { track.select(); } catch (e) { }
            start = Math.ceil(track.tgraph.Xwc(x - 2 * track.tgraph.xi));
            end = start; dragging = true;
        });
        graph.addMouseMoveListener((x, y) => {
            if (!dragging || !track || !track.tgraph) return;
            end = Math.ceil(track.tgraph.Xwc(x - 2 * track.tgraph.xi));
            try { track.highlight(Math.min(start, end), Math.max(start, end)); } catch (e) { }
        });
        graph.addMouseUpListener(async (x, y) => {
            if (!dragging || !track) return;
            dragging = false;
            end = Math.ceil(track.tgraph.Xwc(x - 2 * track.tgraph.xi));
            const a = Math.min(start, end), b = Math.max(start, end);
            if (!(b > a)) { graph.setMessage(' Empty selection — drag to select a region. '); restoreHover(); return; }
            try { track.markstart = a; track.markend = b; track.highlight(a, b); } catch (e) { }
            await loadRegion(track, false);
        });
    };

    graph.clearMouseListeners();
    CurrentLayout.clearComponent('mainPanel');
    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

    // Auto-scope: if the user already has a sequence selected on one or more tracks,
    // load the variants straight onto those selected regions (no scope prompt). Only
    // when nothing is selected do we prompt below (select a sequence / click a track).
    if (autoUseSelection) {
        const selectedTracks = (graph.track || []).filter((t) => {
            try { return t && t.markstart != null && t.markend != null && t.markend > t.markstart; }
            catch (e) { return false; }
        });
        if (selectedTracks.length) {
            (async () => {
                for (const t of selectedTracks) {
                    try { await loadRegion(t, false); } catch (e) { }   // false -> honor the selection
                }
            })();
            return;
        }
        graph.setMessage(' No sequence selected — select a sequence or click a track to load ' + label + '. ');
        // fall through to the scope prompt below
    }

    // Center menu: choose where to load the variant data.
    graph.showMenu([
        {
            label: 'Entire track', move: () => { },
            click: () => { if (graph.hideMenu) graph.hideMenu(); armEntireTrack(); }
        },
        {
            label: 'Select a sequence', move: () => { },
            click: () => { if (graph.hideMenu) graph.hideMenu(); armSelectSequence(); }
        }
    ]);
}
