function (server, graph, genegraph_panel_layout, db, dbLabel, autoUseSelection, tracks, filter) {
    // Load variants from a major variant database (ClinVar / dbSNP / gnomAD / COSMIC).
    // A center menu first asks for the scope: load over an ENTIRE track (click a track),
    // or over a SELECTED SEQUENCE (click-and-drag a region on a track). Variants come back
    // from the server's /variants/region proxy and are dropped on the track as SnpIndels,
    // colored by database (ClinVar by clinical significance). Failsafe.
    //
    // When autoUseSelection is true (the "Load more SNPs" menu), skip the scope prompt if
    // the user already has a sequence selected on one or more tracks: load those selected
    // regions directly. Only when nothing is selected do we fall back to the scope prompt.
    //
    // `filter` narrows what actually lands on the track -- the variant CLASS chosen in the
    // Variants library (SNVs only, indels, ClinVar pathogenic, ...):
    //     { label: 'SNVs only', types: ['snp'], clinsig: { any: ['pathogenic'], not: ['conflicting'] } }
    // It is applied here rather than in the query because /variants/region has no class
    // parameter. That makes the counts below matter: a filtered load must say how many it
    // dropped, or "6 loaded" from a source holding 900 reads as an almost empty database.
    // WHICH MESSAGES ARE ACTUALLY DRAWN.
    //
    // graph.setMessage() is the TRANSIENT status line -- the canvas deliberately does not
    // paint it, so that "Loading…" and spinner frames do not pile up as toasts. Only
    // setError (orange) and setResultMessage (cyan) are drawn.
    //
    // Every OUTCOME here was reported with setMessage, so a load that found nothing said so
    // to a surface nobody sees: the run simply ended. That is the whole of "loading variants
    // fails silently". Outcomes now go to setResultMessage, failures to setError, and only
    // genuine in-progress chatter stays on setMessage.
    const say = (m) => { try { graph.setResultMessage(m); } catch (e) { try { graph.setMessage(m); } catch (e2) { } } };
    const fail = (m) => { try { graph.setError(m); } catch (e) { try { graph.setMessage(m); } catch (e2) { } } };

    const label = dbLabel || db;
    const FILTER = filter || null;
    const filterNote = (FILTER && FILTER.label) ? ' [' + FILTER.label + ']' : '';
    // A CONDITION FILTER MATCHES AGAINST CLINVAR'S OWN DISEASE NAMES (CLNDN), which is the
    // only way "the variants relevant to coronary heart disease" can mean anything more than
    // "every variant in this window". The typed words rarely equal ClinVar's wording --
    // "coronary heart disease" against "Coronary artery disease" -- so match on content
    // words rather than on the whole phrase, with the words that carry no meaning of their
    // own removed. A term of one content word is a wide net and that is intended: the
    // alternative is a filter that silently matches nothing.
    const STOPWORDS = ('a an and or of the for with to in on related associated risk variant '
        + 'variants mutation mutations gene genes disease diseases disorder disorders '
        + 'condition conditions syndrome type form familial hereditary').split(' ');
    const contentWords = (phrase) => ('' + phrase).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
        .split(/\s+/).filter((w) => w.length > 3 && STOPWORDS.indexOf(w) < 0);
    // The terms the user asked for, each reduced to its content words. A variant matches when
    // ANY term has ALL of its content words present in ANY of that variant's condition names.
    const CONDITION_TERMS = (FILTER && Array.isArray(FILTER.conditions))
        ? FILTER.conditions.map(contentWords).filter((w) => w.length) : [];
    const passesConditions = (conditions) => {
        if (!CONDITION_TERMS.length) return true;
        const names = (conditions || []).map((c) => ('' + c).toLowerCase());
        if (!names.length) return false;   // no disease recorded cannot match a disease asked for
        return CONDITION_TERMS.some((words) => names.some((n) => words.every((w) => n.indexOf(w) >= 0)));
    };

    // AN OMIM PHENOTYPE ID IS THE SAME QUESTION WITHOUT THE GUESSWORK. The condition filter
    // above matches wording against wording, which is the best that can be done with a phrase
    // someone typed. When the disease has been resolved to OMIM phenotype numbers, the records
    // carry those numbers themselves (CLNDISDB), so the test is whether this record was filed
    // against that phenotype -- not whether two ways of writing a disease name overlap.
    const MIM_SET = (FILTER && Array.isArray(FILTER.mims) && FILTER.mims.length)
        ? new Set(FILTER.mims.map((m) => ('' + m).toUpperCase())) : null;
    const passesMims = (mims) => {
        if (!MIM_SET) return true;
        for (const m of (mims || [])) { if (MIM_SET.has(('' + m).toUpperCase())) return true; }
        return false;
    };

    const passesFilter = (type, clinsig, conditions, mims) => {
        if (!FILTER) return true;
        // The ids win when there are ids: a phenotype resolved to a number has already said
        // precisely what it means, and re-testing its NAME against the same record can only
        // throw away records that the number matched.
        if (MIM_SET) { if (!passesMims(mims)) return false; }
        else if (!passesConditions(conditions)) return false;
        if (Array.isArray(FILTER.types) && FILTER.types.length && FILTER.types.indexOf(type) < 0) return false;
        const cs = FILTER.clinsig;
        if (cs) {
            const s = (clinsig || []).join(' ').toLowerCase();
            // An unclassified variant cannot satisfy a significance filter. Letting it through
            // would put variants of unknown meaning in the "pathogenic" set.
            if (!s) return false;
            // `not` first: ClinVar's "Conflicting_interpretations_of_pathogenicity" CONTAINS
            // the word pathogenic, and a plain substring test would file every conflicting
            // call under pathogenic -- the one mistake this filter must not make.
            if (Array.isArray(cs.not) && cs.not.some((w) => s.indexOf(('' + w).toLowerCase()) >= 0)) return false;
            if (Array.isArray(cs.any) && cs.any.length
                && !cs.any.some((w) => s.indexOf(('' + w).toLowerCase()) >= 0)) return false;
        }
        return true;
    };

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
                fail(' That track has no chromosome for a variant lookup. ');
                restoreHover(); return;
            }
            const species = ('' + (track.species || 'human')).toLowerCase();
            const chr = ('' + track.chr).replace(/^chr/, '');

            // An alt-contig transcript (SMN2-231 on HSCHR5_1_CTG1_1, an SMN1 copy on a haplotype
            // contig) carries coordinates on that contig, but track.chr was reduced to the
            // chromosome number, so the query went to chr5 at the contig's numbers and found an
            // empty stretch. The variant databases are on the primary assembly and Ensembl has
            // no mapping for these contigs, so there is nothing to place: say that, and name
            // the way out, instead of "No ClinVar variants found for chr5:274951-302936".
            if (track.altContig || (track.contig && !/^(chr)?([0-9]{1,2}|X|Y|MT?|W|Z)$/i.test('' + track.contig))) {
                fail(' ' + (track.name || 'This track') + ' is on the alternate contig '
                    + (track.contig || track.chr) + ', not on chr' + chr + '. ' + label + ' coordinates are on the '
                    + 'primary assembly and this contig cannot be mapped to it, so no variants can be placed. '
                    + 'Load the primary-assembly transcript of the gene instead. ');
                restoreHover(); return;
            }

            // Region: the selected sequence range (unless forced whole) else the whole track.
            // Child (cDNA / mRNA) tracks render in LOCAL coordinates (0..len), so their tgraph
            // bounds are not genomic — query the track's genomic span (gxi/gxf), and the
            // variants get mapped back onto the exons by variantWorldX().
            const tg = track.tgraph;
            const isChild = !!(track.isChildCDNATrack && track.isChildCDNATrack());

            // THE GENOMIC SPAN COMES FROM THE EXONS.
            //
            // A track's tgraph is in whatever frame the track was laid out in. For a pre-mRNA
            // track built from a transcript that frame is LOCAL -- SMN2 came out as
            // 274951..302936 -- and asking ClinVar for chr5:274951-302936 is a real query
            // about the wrong megabase. It answers 0 variants with no error, so the load
            // failed silently and looked like "this gene has no variants".
            //
            // Each exon annotation carries gxi/gxf, the genomic coordinates of that exon, and
            // variantWorldX() maps a returned variant back onto the track THROUGH those same
            // fields. So the exon-derived span is not just more correct than the tgraph bounds,
            // it is exactly the range whose hits can be placed. On a track already laid out in
            // genomic coordinates the two agree, so this is not a special case for spliced
            // tracks -- it is the right question in both.
            const exonGenomicSpan = () => {
                try {
                    let lo = Infinity, hi = -Infinity;
                    for (const a of (track.getExons() || [])) {
                        const gi = +a.gxi, gf = +a.gxf;
                        if (!isFinite(gi) || !isFinite(gf)) continue;
                        lo = Math.min(lo, gi, gf);
                        hi = Math.max(hi, gi, gf);
                    }
                    return (isFinite(lo) && isFinite(hi) && hi > lo) ? { lo: lo, hi: hi } : null;
                } catch (e) { return null; }
            };

            let tlo, thi;
            const __ex = exonGenomicSpan();
            if (__ex) {
                tlo = __ex.lo; thi = __ex.hi;
            } else if (isChild && track.gxi != null && track.gxf != null) {
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
                // The track's own selectedRange() resolves world-coordinate marks and offset
                // marks to one absolute span; genomicAt maps a spliced track's local span out
                // to genomic, walking the exons, which is right whichever way the track runs.
                //
                // min/max are taken AFTER mapping: on a minus-strand track the higher local
                // index maps to the LOWER genomic position, so the pair comes back the other
                // way round and using the raw ends would invert the window.
                const sel = (track.selectedRange && track.selectedRange()) || null;
                let s0 = sel ? sel.start : Math.min(track.markstart, track.markend);
                let e0 = sel ? sel.end : Math.max(track.markstart, track.markend);
                const inGenomicSpan = (v) => (v >= tlo && v <= thi);
                if (!(inGenomicSpan(s0) && inGenomicSpan(e0)) && track.genomicAt) {
                    const gs = track.genomicAt(s0 - track.xi), ge = track.genomicAt(e0 - track.xi);
                    if (gs != null && ge != null && isFinite(gs) && isFinite(ge)) {
                        gStart = Math.min(gs, ge); gEnd = Math.max(gs, ge);
                    } else { gStart = tlo; gEnd = thi; }
                } else if (isChild && track.genomicAt) {
                    const gs = track.genomicAt(s0 - track.xi), ge = track.genomicAt(e0 - track.xi);
                    if (gs != null && ge != null) { gStart = Math.min(gs, ge); gEnd = Math.max(gs, ge); }
                    else { gStart = tlo; gEnd = thi; }
                } else {
                    gStart = Math.max(tlo, s0);
                    gEnd = Math.min(thi, e0);
                }
            } else {
                gStart = tlo;
                gEnd = thi;
            }
            gStart = Math.floor(gStart); gEnd = Math.ceil(gEnd);
            if (!(gEnd > gStart)) { fail(' Could not determine a region for ' + (track.name || 'track') + '. '); restoreHover(); return; }

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
                        // Accept the exec result only when it actually carries a variants field.
                        // A malformed or truncated resolution came back as a bare object with no
                        // fields, which the old test read as "ran fine, found nothing" and
                        // reported "No ClinVar variants" instead of asking the HTTP route, which
                        // serves the same local VCF.
                        let vs = null;
                        if (r && typeof r.variants === 'string') {
                            try { vs = JSON.parse(r.variants); } catch (e) { vs = null; }
                        }
                        if (Array.isArray(vs) && (vs.length || !r.error)) {
                            resp = { variants: vs, source: 'local-exec', total: r.count || vs.length, truncated: false };
                        }
                    } catch (e) { resp = null; }
                }
                if (!resp) resp = await GETJSON(url);   // fallback / non-local dbs
            }
            catch (e) { resp = null; }
            finally { clearInterval(spinner); }
            const list = (resp && resp.variants) || [];
            if (!list.length) {
                say(' No ' + label + ' variants found' + (resp && resp.error ? ' (' + resp.error + ')' : '')
                    + ' for chr' + chr + ':' + gStart + '-' + gEnd + '. ');
                restoreHover(); return 0;
            }

            graph.setMessage(' ' + spinFrames[0] + ' Placing ' + list.length + ' ' + label + ' variant' + (list.length === 1 ? '' : 's') + '… ');

            let SnpIndel = null;
            try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { }
            if (!SnpIndel) { fail(' Variant support unavailable. '); restoreHover(); return; }

            const MAX_ALLELE = 50;   // skip structural variants (giant ref/alt)
            let added = 0, skippedSv = 0, skippedFilter = 0;
            const __placed = [];   // the SnpIndels made here, for the gene-mechanism pass below
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

                const clinsig = v.clinsig || [];
                if (!passesFilter(type, clinsig, v.conditions, v.mims)) { skippedFilter++; continue; }

                // Deletions are anchored one base before the deleted run on the + strand.
                let placeXi = wx;
                if (type === 'del' && track.strand !== -1) placeXi = wx + 1;

                const snp = new SnpIndel(type, placeXi, ref, alt, 0, track.strand,
                    (v.id || label), null, colorFor(clinsig));
                try {
                    snp.name = v.id || label;
                    // EVERY ANNOTATION THE RECORD CARRIES, through the class's own parser, so
                    // the detail box, the ClinDN column and a saved-and-reopened file all see
                    // the same thing they would see for a variant loaded any other way.
                    // First, because setAnnotation() derives clinsig and clindn from the raw
                    // fields and the normalised values below are the ones to keep.
                    if (Array.isArray(v.annotations) && v.annotations.length) {
                        try { snp.setAnnotation(v.annotations); } catch (e) { }
                    }
                    if (clinsig.length) snp.clinsig = clinsig.join(', ');
                    if (v.af != null) { snp.quality = 'AF=' + v.af; snp.af = +v.af; }
                    if (v.consequence) snp.structure = v.consequence;
                    // What this variant was filed against. The class already has a field for
                    // it -- clindn, which setAnnotation() fills from a VCF CLNDN entry -- and
                    // the ClinDN column, the hover line and the variant finder all read that
                    // one. Writing it anywhere else would put the disease on the track and
                    // leave every surface that shows diseases blank.
                    if (v.conditions && v.conditions.length) {
                        snp.clindn = v.conditions.join('; ');
                    }
                    snp.source = v.source || label;   // filterable: dbSNP / ClinVar / gnomAD / COSMIC
                    // WHICH PHENOTYPE THIS RECORD IS HERE FOR. A record filed under several
                    // conditions should name the one the track was loaded for -- a CFTR
                    // variant filed under cystic fibrosis, CFTR-related disorder and "not
                    // specified" says cystic fibrosis when cystic fibrosis is what was asked
                    // for. Without a phenotype filter there is nothing to prefer and the
                    // record's first named condition stands.
                    if (MIM_SET) snp.focusMims = FILTER.mims;
                    // SHOWN FOR PATHOGENIC AND LIKELY PATHOGENIC ONLY.
                    //
                    // Every variant gets its callout TEXT composed -- the detail box and the
                    // hover line read it, and a variant the reader clicks should have
                    // something to say whatever its classification. What is switched on by
                    // default is the subset worth reading without being asked for: a region of
                    // USH2A holds four hundred variants of uncertain significance and eleven
                    // that are pathogenic, and drawing four hundred callouts to surface eleven
                    // is not annotation, it is a wall.
                    //
                    // MATCH THE WHOLE TERM, NOT A SUBSTRING OF IT.
                    // "Conflicting_classifications_of_pathogenicity" contains the word
                    // pathogenic, and a substring test files every conflicting call under
                    // pathogenic -- the one mistake this must not make. The reader has already
                    // split CLNSIG on its separators, so each element is one whole term and an
                    // exact comparison is both simpler and safe. "Pathogenic/Likely_pathogenic"
                    // arrives as two elements and matches; "Pathogenic,_low_penetrance" keeps
                    // its Pathogenic element and matches too.
                    snp.showAnnotation = clinsig.some((c) => {
                        const t = ('' + c).trim().toLowerCase();
                        return t === 'pathogenic' || t === 'likely pathogenic';
                    });
                } catch (e) { }
                track.addsnpindel(snp);
                track.showSnpIndels = true;
                __placed.push(snp);
                added++;
            }

            if (graph.wake) graph.wake();
            // ---- what these variants DO -------------------------------------------------
            // ClinVar says what a variant IS and how it was classified. It does not say what
            // it does, and "loss of function", "truncating", "splicing" is the thing a reader
            // is actually after. Half of it is on the record already -- the molecular
            // consequence, which snpindel.js turns into a phrase without asking anyone. The
            // other half is a property of the GENE, so it is asked ONCE PER GENE: three
            // thousand variants across four genes is four questions, not three thousand.
            //
            // Failsafe on purpose. The variants are on the track before this runs and stay
            // there if it fails; all that is lost is the mechanism clause.
            try {
                // Only the genes with a callout on show. A gene whose every record here is
                // uncertain has nothing to put a mechanism sentence on, and asking about it
                // is a question paid for and thrown away.
                const __genes = [];
                for (const s of __placed) {
                    if (!s.showAnnotation) continue;
                    let g = '';
                    try { g = s.geneSymbol ? s.geneSymbol() : ''; } catch (e) { g = ''; }
                    if (g && __genes.indexOf(g) < 0) __genes.push(g);
                }
                if (__genes.length) {
                    const __em = new EngineMonitor((m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } });
                    const __r = await exec(server + '/py/bio/gene-mechanism.py', __em, JSON.stringify(__genes.slice(0, 40)));
                    let __mech = {};
                    try { __mech = JSON.parse((__r && __r.genes) || '{}') || {}; } catch (e) { __mech = {}; }
                    if (Object.keys(__mech).length) {
                        for (const s of __placed) {
                            try {
                                const g = s.geneSymbol ? s.geneSymbol() : '';
                                if (g && __mech[g] && s.applyGeneMechanism) s.applyGeneMechanism(__mech[g]);
                            } catch (e) { }
                        }
                        if (graph.wake) graph.wake();
                    }
                }
            } catch (e) { }
            if (!added) {
                // Two different nothings, and they need different answers: the class filter
                // matched none of them (widen the class), or the region genuinely holds none.
                if (skippedFilter) {
                    say(' None of the ' + list.length + ' ' + label + ' variant'
                        + (list.length === 1 ? '' : 's') + ' over this region are '
                        + ((FILTER && FILTER.label) ? FILTER.label.toLowerCase() : 'of that class')
                        + '. Try a wider class from the Variants library. ');
                    restoreHover(); return;
                }
                // Server returned variants but none mapped onto the track's extent.
                say(' ' + list.length + ' ' + label + ' variant' + (list.length === 1 ? '' : 's')
                    + ' returned for chr' + chr + ':' + gStart + '-' + gEnd
                    + ' but none fall within this track (' + chr + ':' + Math.floor(tlo) + '-' + Math.ceil(thi) + '). ');
                restoreHover(); return;
            }
            const capNote = (resp && resp.truncated) ? ' (capped at ' + list.length + (resp.total ? ' of ' + resp.total : '') + ' — select a smaller range for the rest)' : '';
            say(' Loaded ' + added + ' of ' + list.length + ' ' + label + ' variant' + (list.length === 1 ? '' : 's')
                + filterNote + capNote
                + (skippedFilter ? ' (' + skippedFilter + ' outside that class)' : '')
                + ' onto ' + (track.name || 'track') + '. ');
            restoreHover();
            return added;
        } catch (e) {
            fail(' Variant load error: ' + e + ' ');
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
            if (!(b > a)) { fail(' Empty selection — drag to select a region. '); restoreHover(); return; }
            try { track.markstart = a; track.markend = b; track.highlight(a, b); } catch (e) { }
            await loadRegion(track, false);
        });
    };

    graph.clearMouseListeners();
    // An explicit track list means there is nothing to choose: load onto each and stop.
    //
    // Before the panel swap below, deliberately. That swap exists to give the user something
    // to look at while they pick a track, and the editor stashes its own layout under
    // mainPanel -- mounting over it with no click coming is what blanked the canvas behind
    // the menu in patents.js.
    if (Array.isArray(tracks) && !tracks.length) {
        // The opener passed a track list and it was empty -- e.g. a menu that resolves to
        // `selectedTrack ? [selectedTrack] : []` with nothing selected. Falling through to
        // the scope prompt is right, but say why, or the click reads as having done nothing.
        say(' No track selected — click a track to load ' + label + '. ');
    }
    if (Array.isArray(tracks) && tracks.length) {
        const list = tracks.filter(Boolean);
        return (async () => {
            try { window.__bajaApplyAllTracks = false; } catch (e) { }
            try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
            try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
            const status = (m) => {
                try {
                    window.__workStatus = m || '';
                    if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                } catch (e) { }
            };
            let done = 0, placed = 0;
            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                status(label + ' · ' + ((t && t.name) || ('track ' + (i + 1))) + ' · ' + (i + 1) + ' of ' + list.length + '…');
                // forceWhole false: loadRegion reads the track's own selected range when it
                // has one, so a track with a selection gets variants over that only.
                //
                // COUNT WHAT LANDED, not how many calls returned. `done++` on a call that
                // completed treated "found nothing" as a success, and the summary below then
                // overwrote loadRegion's own "No ClinVar variants found" with "loaded onto 1 of
                // 1 track" -- which is how a load of zero variants came to look like a load
                // that worked.
                try {
                    const n = await loadRegion(t, false);
                    if (n > 0) { done++; placed += n; }
                } catch (e) { }
            }
            status('');
            // DO NOT OVERWRITE A REASON WITH A TALLY.
            //
            // loadRegion has already said the precise thing for each track -- "SMN2-231 is on
            // the alternate contig HSCHR5_1_CTG1_1", "none of the 9 are somatic", "no ClinVar
            // variants found for chr5:...". On a ONE-track load a roll-up adds nothing and
            // lands a moment later, so all the reader ever sees is "no variants found on that
            // track" and the answer to why is gone. The tally is only worth posting when it
            // says something the per-track message could not: several tracks, or a count.
            if (placed) {
                say(' ' + label + ': ' + placed + ' variant' + (placed === 1 ? '' : 's')
                    + ' onto ' + done + ' of ' + list.length + ' track' + (list.length === 1 ? '' : 's') + '. ');
            } else if (list.length > 1) {
                say(' ' + label + ': no variants found on any of the ' + list.length + ' tracks. ');
            }
            return graph;
        })();
    }

    // Going back to the editor is CurrentLayout.reset('mainPanel'), not a clear + set.
    //
    // reset() remounts the layout manchester/editor.js stashed under 'mainPanel' -- the whole
    // editor. clear + setComponent(genegraph_panel_layout) mounts only the panel object this
    // module was handed, which is not the same thing: the clear ran and the canvas never came
    // back, so the message and the scope menu below were drawn onto nothing and picking a
    // variant class looked like it did nothing at all. editor.js also PATCHES reset() so
    // returning to mainPanel re-arms mouse-over-highlight.
    //
    // The clear + set stays as a fallback for a host that stashed nothing.
    // Same fix as baja/bio/rbp/rbp-profile.js, for the same reason.
    (() => {
        try {
            if (CurrentLayout.getStashed && CurrentLayout.getStashed('mainPanel')) {
                CurrentLayout.reset('mainPanel');
                return;
            }
        } catch (e) { }
        try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
        try { if (genegraph_panel_layout) CurrentLayout.setComponent('mainPanel', genegraph_panel_layout); } catch (e) { }
    })();

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
        say(' No sequence selected — select a sequence or click a track to load ' + label + '. ');
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
