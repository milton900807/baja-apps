function (graph, genegraph_panel_layout) {

    // WHAT THE EDITOR CAN BE ASKED TO DO, DECLARED.
    //   const CAP = await exec('baja/manchester/menu/editor-capabilities.js', graph, layout);
    //   CAP.list        -> the catalogue, as plain JSON, for a model to choose from
    //   CAP.byName(n)   -> one entry, or null
    //   CAP.validate(step) -> { ok, capability, args, problem }
    //   CAP.preview(step)  -> one line saying what that step would actually do here
    //
    // This is the vocabulary the Ask box translates into, and the reason it is a HAND-WRITTEN
    // CATALOGUE rather than a reflection over the modules on disk. Every file under baja/ is
    // exec-able by path with arbitrary arguments; a model that could name a path and its
    // arguments would be a remote shell on someone's unsaved work, and no amount of checking
    // the sentence that produced it would change that. So the set of reachable operations is
    // enumerated here, each with the arguments it takes and the values those arguments may
    // hold, and anything outside this file is not reachable from the box at all.
    //
    // Each entry carries:
    //   name        the identifier a model returns
    //   summary     what it does, in the words someone would use asking for it
    //   params      { <arg>: { type, values?, required?, default?, about } }
    //               type is one of: enum, enum[], string, string[], number, boolean
    //   needs       what must be on the canvas: 'track' | 'selection' | 'variants' | 'compounds'
    //   destructive true when it deletes work. These never run without their own click.
    //   opens       true when it opens a dialog rather than finishing by itself, so the
    //               preview can say so instead of implying the work is done
    //   run         (args) => the actual call. Arguments arrive already validated.
    //
    // ARGUMENTS ARE VALIDATED AGAINST params, NOT TRUSTED. validate() drops unknown keys,
    // checks every enum against its own list, coerces numbers, and refuses a step whose
    // required argument is missing rather than substituting a plausible one. The same specs
    // are sent to the model, so the thing it is told it may say and the thing that is
    // enforced here cannot drift apart.

    return (async () => {
        const server = () => { try { return window['env']['apiUrl']; } catch (e) { return ''; } };
        const tracks = () => (graph.track || []).filter(Boolean);
        const hasSel = (t) => {
            try { return t && t.markstart != null && t.markend != null && t.markend > t.markstart && t.markstart >= 0; }
            catch (e) { return false; }
        };
        const selTracks = () => tracks().filter(hasSel);
        const rangeOf = (t) => ({ start: Math.floor(t.markstart), end: Math.ceil(t.markend) });
        // The track a single-track operation runs on: the one carrying a selection, else the
        // one the user last selected, else the only one there is. Null when that is genuinely
        // ambiguous, which the preview then says rather than picking for them.
        const oneTrack = () => {
            const s = selTracks();
            if (s.length === 1) return s[0];
            if (s.length > 1) return null;
            if (graph.selectedTrack && tracks().indexOf(graph.selectedTrack) >= 0) return graph.selectedTrack;
            const all = tracks();
            return (all.length === 1) ? all[0] : null;
        };
        const oneSelTrack = () => {
            const s = selTracks();
            return (s.length === 1) ? s[0] : null;
        };

        // One track from a name the user typed. Exact first, then a unique prefix, then a
        // unique substring: "DNM3" should find DNM3-201 without also claiming DNM3OS-201,
        // and two matches is not a match, because framing the wrong track looks like the
        // editor ignoring the request.
        const matchTrack = (name) => {
            const want = ('' + (name || '')).trim().toLowerCase();
            if (!want) return null;
            const all = tracks();
            const nm = (t) => ('' + (t.name || '')).toLowerCase();
            const exact = all.filter((t) => nm(t) === want);
            if (exact.length === 1) return exact[0];
            const pre = all.filter((t) => nm(t).indexOf(want) === 0);
            if (pre.length === 1) return pre[0];
            const sub = all.filter((t) => nm(t).indexOf(want) >= 0);
            return (sub.length === 1) ? sub[0] : null;
        };

        // The named regions of a transcript (UTRs, CDS, exons, introns), cached per track
        // because resolving them walks the annotation list.
        const __regions = new Map();
        const regionsOf = async (t) => {
            if (!t) return null;
            if (__regions.has(t)) return __regions.get(t);
            let R = null;
            try { R = await exec('baja/bio/track-regions.js', t); } catch (e) { R = null; }
            __regions.set(t, R);
            return R;
        };
        // Resolved synchronously once the module has been loaded for that track, so preview()
        // and argBlocker() can use it without becoming async.
        const regionsNow = (t) => (t ? (__regions.get(t) || null) : null);

        // ONE GO PER TRACK, NOT A REFUSAL. An operation that runs on one track and was given
        // no track name used to stop at "more than one track is open: name the one you mean".
        // Now it can offer the tracks it actually fits instead: choices(a) returns one entry per
        // such track, each carrying the track OBJECT in __track (two tracks can share a name),
        // and the Ask card shows a Go button for each. __track never comes from the model --
        // validate() drops any key that is not a declared parameter -- only from a choice.
        const pickTrack = (a) => (a && a.__track) || (a && a.track ? matchTrack(a.track) : oneTrack());
        const choicesOver = (a, fits) => {
            if (!a || a.__track || a.track) return [];
            return tracks().map((t) => {
                let r = null;
                try { r = fits(t); } catch (e) { r = null; }
                return (r && !r.error) ? { track: t, label: (t.name || '(unnamed track)'), detail: r.detail || '',
                    args: Object.assign({}, a, { __track: t }) } : null;
            }).filter(Boolean);
        };

        // FRAME ONE BASE CLOSE ENOUGH TO READ THE SEQUENCE. The track draws its letters only
        // above ~30 screen px per base (screencell in track-flexi.js), so the window is sized
        // from the canvas width to land well above that, centred on the base, with the track
        // about 100 px tall. Same arithmetic as load-clinical-compound.js, which was tuned on
        // the real canvas. zoomRect() returns immediately while another animation runs, so wait
        // for the graph to go idle first.
        const frameBase = async (t, pos) => {
            const g = t && t.tgraph;
            if (!g || typeof g.X !== 'function' || !graph.zoomRect) return;
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            for (let i = 0; graph.animating && i < 60; i++) await sleep(60);
            let cw = 1200, ch = 800;
            try { cw = (graph.canvas && graph.canvas.width) || cw; ch = (graph.canvas && graph.canvas.height) || ch; } catch (e) { }
            const PX_PER_BASE = 44;
            const half = Math.max(6, Math.floor(cw / PX_PER_BASE)) / 2;
            const mid = pos + 0.5;
            const x0 = g.X(mid - half), x1 = g.X(mid + half);
            let ymin, ymax;
            try {
                const top = g.Y(typeof g.getymax === 'function' ? g.getymax() : (g.yi + (g.height || 0)));
                const bot = g.Y(typeof g.getymin === 'function' ? g.getymin() : g.yi);
                if (isFinite(top) && isFinite(bot) && Math.abs(top - bot) > 0) {
                    const cy = (top + bot) / 2;
                    const ySpan = Math.max(1.0001, Math.abs(top - bot) * (ch / 100));
                    ymin = cy - ySpan / 2; ymax = cy + ySpan / 2;
                }
            } catch (e) { }
            if (ymin == null) { const yb = g.yi + (g.height || 0); ymin = yb - 0.51; ymax = yb + 0.51; }
            if (isFinite(x0) && isFinite(x1)) await graph.zoomRect(Math.min(x0, x1), Math.max(x0, x1), ymin, ymax, 400);
        };

        // Resolved up front for every open track. preview() and argBlocker() are synchronous
        // -- they run while a plan is being drawn -- so a cache filled only by run() would
        // mean the first plan never checks the region and "exon 14 of 11" is discovered after
        // the button rather than before it.
        for (const t of tracks()) { try { await regionsOf(t); } catch (e) { } }

        // The tracks a shelf should load onto: the ones carrying a selection when any do,
        // otherwise every open track. A shelf opened with no tracks asks the user to click
        // one, which is the right behaviour and not worth pre-empting.
        const scopeTracks = () => (selTracks().length ? selTracks() : tracks());

        // WHAT THE USER MEANS BY "SELECTED" -- and there are two stores, which is why this
        // exists rather than reading one of them.
        //
        //   graph.__lassoSelection   what the selection window holds, and what the toolbar's
        //                            Selection badge counts: a lasso, a shift-click, a pick
        //                            off a track. Entries are {kind, ref, track}.
        //   graph.selectedCompounds  what setSelectedCompounds holds, which is what the
        //                            compound filters here write to.
        //
        // The two are separate in the editor and neither is wrong, so a request to act on
        // "the selected compounds" takes the union: whatever the person is looking at as
        // selected, by either route, is what they mean.
        const lassoOf = (kind) => (graph.__lassoSelection || []).filter((s) => s && s.kind === kind && s.ref);
        const selectedCompoundSet = () => {
            const out = new Set();
            for (const s of lassoOf('oligo')) out.add(s.ref);
            for (const s of (graph.selectedCompounds || [])) { if (s && s.o) out.add(s.o); }
            return out;
        };
        const SEL_KINDS = {
            compounds: { kind: 'oligo', noun: 'compound', arr: 'oligos' },
            variants: { kind: 'snp', noun: 'variant', arr: 'snpindels' },
            annotations: { kind: 'ann', noun: 'annotation', arr: 'annotations' },
            primers: { kind: 'amplicon', noun: 'primer or probe', arr: null }
        };
        const selCountOf = (what) => {
            if (what === 'compounds') return selectedCompoundSet().size;
            const k = SEL_KINDS[what];
            return k ? lassoOf(k.kind).length : 0;
        };

        const LAYER_SETS = await (async () => { try { return await exec('baja/data/layer-sets.js'); } catch (e) { return {}; } })();
        const LAYER_KEYS = Object.keys(LAYER_SETS || {});

        // The two engines the selection verbs are built on, loaded once.
        const VS = await exec('baja/data/variant-search.js', graph, { engineOnly: true });
        const F = await exec('baja/bio/compound-filter.js');

        const vrows = () => {
            const out = [];
            for (const t of tracks()) for (const v of (t.snpindels || [])) out.push({ t: t, v: v, rec: VS.recordOf(v) });
            return out;
        };
        const crows = () => {
            const out = [];
            for (const t of tracks()) for (const o of (t.oligos || [])) out.push({ t: t, o: o });
            return out;
        };
        const selectVariants = (rows) => {
            const all = vrows();
            for (const r of all) { try { r.v.deselect(); } catch (e) { } }
            for (const r of (rows || [])) { try { r.v.select(); } catch (e) { } }
            try { if (graph.wake) graph.wake(); } catch (e) { }
        };
        const vhits = (query) => {
            const all = vrows();
            const q = VS.compileQuery(query);
            return q ? all.filter((r) => q(r.rec)) : all;     // no terms means all of them
        };
        const chits = (spec) => F.match(crows(), spec || {});
        // An off-target filter cannot judge a compound the screen was never run on, so it
        // leaves those out of BOTH sides of the answer. Said here, because "0 matches" and
        // "0 matches, and 38 of the 52 have never been screened" look identical on screen
        // and mean completely different things.
        const USES_OFFTARGET = ['offtarget_min', 'offtarget_max', 'offtarget_genes_min', 'offtarget_genes_max'];
        const offtargetNote = (a) => {
            if (!USES_OFFTARGET.some((k) => a && a[k] != null)) return '';
            const n = F.unscreened(crows());
            return n ? (' (' + n + ' never screened, so not counted either way)') : '';
        };
        const result = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };

        // Significance words as ClinVar writes them, which is what load-variants.js matches
        // against. "likely_pathogenic" is deliberately absent: ClinVar's own string for it
        // CONTAINS "pathogenic", so `any: ['pathogenic']` already covers both, and offering
        // the narrower word would imply a distinction this filter cannot make.
        const CLINSIG = ['pathogenic', 'benign', 'uncertain', 'conflicting'];

        const LIST = [
            // ---------------------------------------------------------------- loading ------
            {
                name: 'load_variants',
                summary: 'Fetch variants from a variant database (ClinVar, dbSNP, gnomAD or COSMIC) '
                    + 'and put them on the track. Runs over the selected sequence on each track '
                    + 'that has one, and over the whole track where there is no selection. '
                    + 'Filters narrow what actually lands: variant class, ClinVar significance, '
                    + 'and disease name.',
                needs: 'track',
                params: {
                    db: {
                        type: 'enum', values: ['clinvar', 'dbsnp', 'gnomad', 'cosmic'], required: true,
                        about: 'which database. clinvar for clinical significance, dbsnp for reference '
                            + 'rsIDs, gnomad for population frequency, cosmic for somatic cancer mutations'
                    },
                    types: {
                        type: 'enum[]', values: ['snp', 'ins', 'del'],
                        about: 'variant classes to keep. snp is a single-base substitution; ins and del '
                            + 'are the indels. Omit for every class. "snps and indels" is all three'
                    },
                    clinsig_any: {
                        type: 'enum[]', values: CLINSIG,
                        about: 'keep only variants whose ClinVar significance contains one of these. '
                            + 'ClinVar only; the other databases carry no clinical assertion'
                    },
                    clinsig_not: {
                        type: 'enum[]', values: CLINSIG,
                        about: 'and exclude any containing one of these. For "pathogenic" use '
                            + 'clinsig_any ["pathogenic"] with clinsig_not ["conflicting"], because '
                            + "ClinVar's conflicting-interpretation string contains the word pathogenic"
                    },
                    conditions: {
                        type: 'string[]',
                        about: 'keep only variants filed against a disease whose name matches one of '
                            + 'these, e.g. ["Rett syndrome"]. ClinVar only'
                    }
                },
                run: (a) => {
                    const f = {};
                    if (a.types && a.types.length) f.types = a.types;
                    if ((a.clinsig_any && a.clinsig_any.length) || (a.clinsig_not && a.clinsig_not.length)) {
                        f.clinsig = {};
                        if (a.clinsig_any && a.clinsig_any.length) f.clinsig.any = a.clinsig_any;
                        if (a.clinsig_not && a.clinsig_not.length) f.clinsig.not = a.clinsig_not;
                    }
                    if (a.conditions && a.conditions.length) f.conditions = a.conditions;
                    const bits = [];
                    if (f.types) bits.push(f.types.join('/'));
                    if (f.clinsig && f.clinsig.any) bits.push(f.clinsig.any.join('/'));
                    if (f.conditions) bits.push(f.conditions.join(', '));
                    if (bits.length) f.label = bits.join(' ');
                    const DBL = { clinvar: 'ClinVar', dbsnp: 'dbSNP', gnomad: 'gnomAD', cosmic: 'COSMIC' };
                    // The tracks with a selection when there are any, else every track: the
                    // same scope the Data menu uses, and load-variants honors each track's own
                    // selected range within it.
                    const list = selTracks().length ? selTracks() : tracks();
                    return exec('baja/data/load-variants.js', server(), graph, genegraph_panel_layout,
                        a.db, DBL[a.db] || a.db, true, list, Object.keys(f).length ? f : null);
                },
                preview: (a) => {
                    const list = selTracks().length ? selTracks() : tracks();
                    const where = selTracks().length
                        ? ('the selected sequence on ' + list.map((t) => t.name || 'a track').join(', '))
                        : ('the whole of ' + list.map((t) => t.name || 'a track').join(', '));
                    return 'load ' + (a.db || '?') + ' variants over ' + where;
                }
            },
            {
                name: 'load_layer_set',
                summary: 'Put a prepared interval layer on the track: published miRNA target sites, '
                    + 'known ASO and siRNA sequences, or oligo patent claim sets. Covers the whole '
                    + 'transcript, not just the selection.',
                needs: 'track',
                params: {
                    set: {
                        type: 'enum', values: LAYER_KEYS, required: true,
                        about: 'which prepared set: ' + LAYER_KEYS.join(', ')
                    }
                },
                run: async (a) => {
                    const t = oneTrack();
                    if (!t) { result('Which track? Click one first.'); return; }
                    const cfg = (LAYER_SETS || {})[a.set];
                    if (!cfg) { result('No such layer set: ' + a.set); return; }
                    return exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, cfg, t);
                },
                preview: (a) => {
                    const t = oneTrack();
                    return 'put the ' + a.set + ' layer on ' + (t ? (t.name || 'the track') : 'a track you pick');
                }
            },

            {
                name: 'load_by_name',
                summary: 'Put a GENE or a SAVED FILE on the canvas by name. Use this whenever the '
                    + 'request is "load X", "open X", "pull up X" or "bring in X" and X is a gene '
                    + 'symbol, an Ensembl id, or a file the person has saved. A bare name is '
                    + 'ambiguous, and the editor asks which it is rather than guessing, so passing '
                    + 'the name alone is the normal thing to do.',
                opens: true,
                params: {
                    name: {
                        type: 'string', required: true,
                        about: 'the gene symbol, Ensembl id or file name, exactly as the person '
                            + 'wrote it. Do not expand it, correct its spelling or add a species'
                    },
                    kind: {
                        type: 'enum', values: ['gene', 'file'],
                        about: 'only when the request SAYS which it is ("load the gene DNM1", '
                            + '"open my file DNM3-design"). Omit it otherwise and the editor asks'
                    }
                },
                run: (a) => exec('baja/manchester/menu/load-by-name.js', graph, genegraph_panel_layout, a),
                preview: (a) => {
                    if (a.kind === 'gene') return 'look up the gene ' + a.name + ' and pick a transcript';
                    if (a.kind === 'file') return 'find a saved file called “' + a.name + '”';
                    return 'load “' + a.name + '” — asks whether that is a gene or a file';
                }
            },

            // ---------------------------------------------------------------- models -------
            {
                name: 'rbp_competition',
                summary: 'Run BajaCLIP over the selected sequence and say which RNA binding protein '
                    + 'wins it, ranked by how specifically each one calls it against the others.',
                needs: 'selection', params: {},
                run: () => { const t = oneSelTrack(); return exec('baja/bio/rbp/rbp-competition.js', graph, genegraph_panel_layout, t, rangeOf(t)); }
            },
            {
                name: 'rbp_profile',
                summary: 'Run BajaCLIP over the selected sequence and draw the binding profile for '
                    + 'every RNA binding protein, rather than picking a winner.',
                needs: 'selection', params: {},
                run: () => { const t = oneSelTrack(); return exec('baja/bio/rbp/rbp-profile.js', graph, genegraph_panel_layout, t, rangeOf(t), null); }
            },
            {
                name: 'splice_site_strength',
                summary: 'Run SpliceNet over the selected sequence and draw donor and acceptor '
                    + 'site strength.',
                needs: 'selection', params: {},
                run: () => { const t = oneSelTrack(); return exec('baja/bio/splicing/splicing-profile.js', graph, genegraph_panel_layout, t, rangeOf(t), 'sites'); }
            },
            {
                name: 'exon_inclusion_psi',
                summary: 'Run PSINet over the selected sequence and draw predicted exon inclusion (PSI).',
                needs: 'selection', params: {},
                run: () => { const t = oneSelTrack(); return exec('baja/bio/splicing/splicing-profile.js', graph, genegraph_panel_layout, t, rangeOf(t), 'psi'); }
            },
            {
                name: 'mirna_sites',
                summary: 'Scan the selected sequence for canonical microRNA seed sites (6mer, 7mer-A1, '
                    + '7mer-m8, 8mer-1a) from the de-targeting miRNA set, and annotate the hits. '
                    + 'Sequence only, no model.',
                needs: 'selection', params: {},
                run: () => { const t = oneSelTrack(); return exec('baja/bio/mirna/mirna-sites.js', graph, t, rangeOf(t)); }
            },

            // ---------------------------------------------------------------- design -------
            {
                name: 'design_oligos',
                summary: 'Open the oligo tiling designer, which walks a modality across the target '
                    + 'and scores the candidates. Opens a dialog to set the parameters; it does not '
                    + 'design anything on its own.',
                needs: 'track', opens: true,
                params: {
                    modality: {
                        type: 'enum', values: ['gapmer', 'steric', 'sirna'],
                        about: 'which design ruleset to start on. gapmer for a gapmer ASO, steric for '
                            + 'a steric-blocking ASO, sirna for siRNA. Omit to let the dialog ask'
                    }
                },
                run: (a) => exec('baja/manchester/menu/tile-oligos-design.js', graph, genegraph_panel_layout,
                    a.modality || null, oneTrack() || null),
                preview: (a) => 'open the tiling designer' + (a.modality ? (' on ' + a.modality) : '')
            },

            {
                name: 'open_library',
                summary: 'OPEN A LIBRARY and let the user pick from it. This is the answer when the '
                    + 'request names a KIND of thing rather than one operation -- "show me the ML '
                    + 'options", "what data can I load", "what modalities are there" -- and when the '
                    + 'exact thing asked for is not an operation here but lives inside one of these '
                    + 'shelves. A shelf that lists the real choices beats refusing.',
                opens: true,
                params: {
                    library: {
                        type: 'enum',
                        values: ['ml_models', 'ml_models_reference', 'data', 'data_reference',
                            'design_modalities', 'chemistry', 'clinical_compounds', 'drawing',
                            'across_tracks', 'everything'],
                        required: true,
                        about: 'ml_models: the models as things to RUN on a track (BajaCLIP, BajaSplice, '
                            + 'BajaIR, djPrimer). ml_models_reference: what each model is, its evidence '
                            + 'and its limits, changing nothing. data: every dataset that can be loaded '
                            + 'as a layer. data_reference: what each data source is and what it does not '
                            + 'support. design_modalities: the design space as a map, every modality with '
                            + 'its precedent. chemistry: reference reading on oligonucleotide chemistry. '
                            + 'clinical_compounds: clinical RNA compounds with their trial records. '
                            + 'drawing: the drawing and annotation tools. across_tracks: operations '
                            + 'spanning several tracks. everything: the library of all the libraries, '
                            + 'for a request too broad to place'
                    }
                },
                run: (a) => {
                    const PATHS = {
                        ml_models: ['baja/ml/models-library.js', true],
                        ml_models_reference: ['baja/ml/institute-of-models-library.js', false],
                        data: ['baja/data/data-resources-library.js', true],
                        data_reference: ['baja/data/data-loading-library.js', false],
                        design_modalities: ['baja/lib/institute-rna-design.js', false],
                        chemistry: ['baja/lib/rna-chemistry-library.js', false],
                        clinical_compounds: ['manchester/clinical-library.js', false],
                        drawing: ['baja/manchester/menu/draw-tools-library.js', false],
                        across_tracks: ['baja/manchester/menu/across-tracks.js', false],
                        everything: ['baja/lib/library-of-libraries.js', false]
                    };
                    const e = PATHS[a.library];
                    if (!e) { result('No such library: ' + a.library); return; }
                    try { graph.showSideMenu(null); } catch (e2) { }
                    // The shelves that load onto a track take the set to load onto; the
                    // reading rooms take none and would ignore a third argument anyway.
                    // Passed explicitly rather than always, so a reading room cannot end up
                    // with a track list it was never written to read.
                    return e[1]
                        ? exec(e[0], graph, genegraph_panel_layout, scopeTracks())
                        : exec(e[0], graph, genegraph_panel_layout);
                },
                preview: (a) => {
                    const NAMES = {
                        ml_models: 'the machine learning models, to run one',
                        ml_models_reference: 'what each model is and what it is worth',
                        data: 'the data that can be loaded onto a track',
                        data_reference: 'what each data source is',
                        design_modalities: 'the design space, modality by modality',
                        chemistry: 'the RNA chemistry reading shelf',
                        clinical_compounds: 'the clinical compounds and their trials',
                        drawing: 'the drawing and annotation tools',
                        across_tracks: 'what can be done across several tracks',
                        everything: 'every library there is'
                    };
                    return 'open ' + (NAMES[a.library] || a.library);
                }
            },

            // ---------------------------------------------------------------- selecting ----
            {
                name: 'select_variants',
                summary: 'Select the variants matching a search query, anywhere on the canvas.',
                needs: 'variants',
                params: {
                    query: {
                        type: 'string',
                        about: "the editor's variant search language: words matched anywhere in the "
                            + "record, * and ? as wildcards against a whole field, -word to exclude, "
                            + "field:word to restrict. Empty means every variant. Fields: name, gene, "
                            + "clinsig, condition, consequence, source, type, ref, alt, change, pos, "
                            + "annotations, batch, phase. phase is the variant's phase number (0, 1, 2, ...) "
                            + "and matches exactly: \"phase 1\" is phase:1"
                    }
                },
                count: (a) => vhits(a.query).length,
                run: (a) => {
                    const hits = vhits(a.query);
                    selectVariants(hits);
                    result('Selected ' + hits.length + ' of ' + vrows().length + ' variants.');
                },
                preview: (a) => 'select the variants ' + (('' + (a.query || '')).trim()
                    ? ('matching “' + a.query + '”') : '(all of them)')
            },
            {
                name: 'remove_variants',
                summary: 'DELETE the variants matching a search query from the tracks.',
                needs: 'variants', destructive: true,
                params: { query: { type: 'string', about: 'same search language as select_variants, fields included (phase:1 for phase 1). Empty means every variant' } },
                count: (a) => vhits(a.query).length,
                run: (a) => {
                    const hits = vhits(a.query);
                    try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                    const doomed = new Set(hits.map((r) => r.v));
                    let n = 0;
                    for (const t of tracks()) {
                        if (!t.snpindels) continue;
                        const before = t.snpindels.length;
                        t.snpindels = t.snpindels.filter((v) => !doomed.has(v));
                        n += before - t.snpindels.length;
                    }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    try { if (graph.rescale) graph.rescale(); } catch (e) { }
                    result('Removed ' + n + ' variant' + (n === 1 ? '' : 's') + '. Undo restores them.');
                },
                preview: (a) => 'delete the variants ' + (('' + (a.query || '')).trim()
                    ? ('matching “' + a.query + '”') : '(all of them)')
            },
            {
                name: 'clear_variant_selection',
                summary: 'Deselect every variant: the highlighted SNPs and indels. Does not touch '
                    + 'a selected sequence range.',
                needs: 'variants', params: {},
                run: () => { selectVariants([]); result('Variant selection cleared.'); }
            },
            {
                name: 'select_compounds',
                summary: 'Select the compounds (ASOs, siRNAs) matching a FILTER on score band, the '
                    + "scorer's own flags, score, GC, Tm, length, off-target count, modality or name. "
                    + 'This describes compounds by their properties; it does not act on what is '
                    + 'already selected.',
                needs: 'compounds',
                params: {
                    band: { type: 'enum', values: ['red', 'amber', 'notred', 'green'], about: 'red is flagged, amber is red or orange, green is best' },
                    faults: { type: 'enum[]', values: F.FAULTS.map((f) => f.key), about: 'flagged for any of these: ' + F.FAULTS.map((f) => f.key + ' (' + f.label + ')').join(', ') },
                    score_min: { type: 'number' }, score_max: { type: 'number' },
                    gc_min: { type: 'number', about: 'percent' }, gc_max: { type: 'number', about: 'percent' },
                    tm_min: { type: 'number', about: 'degrees C' }, tm_max: { type: 'number', about: 'degrees C' },
                    len_min: { type: 'number', about: 'nt' }, len_max: { type: 'number', about: 'nt' },
                    offtarget_min: {
                        type: 'number',
                        about: 'fewest off-target SITES, counting places in the genome the oligo hits. '
                            + '"more than 10 off-targets" is offtarget_min 11'
                    },
                    offtarget_max: { type: 'number', about: 'most off-target sites. "under 5 off-targets" is 4' },
                    offtarget_genes_min: {
                        type: 'number',
                        about: 'fewest distinct off-target GENES, which is the smaller number. Use this '
                            + 'only when the request says genes; plain "off-targets" means sites'
                    },
                    offtarget_genes_max: { type: 'number', about: 'most distinct off-target genes' },
                    screened: {
                        type: 'boolean',
                        about: 'true keeps only compounds the off-target screen has been RUN on, false '
                            + 'only the ones it has not. A compound that was never screened has an '
                            + 'unknown count and matches no off-target range either way, so it is '
                            + 'never swept up by one'
                    },
                    modality: { type: 'enum', values: ['gapmer', 'steric', 'sirna'] },
                    allele_only: { type: 'boolean', about: 'only allele-selective compounds' },
                    name_contains: { type: 'string' }
                },
                count: (a) => chits(a).length,
                run: (a) => {
                    const hits = chits(a);
                    try {
                        graph.setSelectedCompounds(hits.map((r) => ({ o: r.o, t: r.t })));
                        graph.currentShape = null;
                    } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result('Selected ' + hits.length + ' of ' + crows().length + ' compounds.');
                },
                preview: (a) => 'select the compounds: ' + F.describe(a) + offtargetNote(a)
            },
            {
                name: 'remove_compounds',
                summary: 'DELETE the compounds matching that same FILTER from the tracks. For "delete '
                    + 'the selected compounds", which names no filter, use remove_selected instead.',
                needs: 'compounds', destructive: true,
                params: null,     // filled below: the same params as select_compounds
                count: (a) => chits(a).length,
                run: (a) => {
                    const hits = chits(a);
                    try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                    const doomed = new Set(hits.map((r) => r.o));
                    let n = 0;
                    for (const t of tracks()) {
                        if (!t.oligos) continue;
                        const before = t.oligos.length;
                        t.oligos = t.oligos.filter((o) => !doomed.has(o));
                        n += before - t.oligos.length;
                    }
                    try {
                        graph.setSelectedCompounds((graph.selectedCompounds || [])
                            .filter((s) => s && s.o && !doomed.has(s.o)));
                    } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result('Removed ' + n + ' compound' + (n === 1 ? '' : 's') + '. Undo restores them.');
                },
                preview: (a) => 'delete the compounds: ' + F.describe(a) + offtargetNote(a)
            },
            {
                // GOTO ONE POSITION, zoomed in far enough to read the bases. "goto c.778" was
                // read as select_sequence_region with start=end=778, which counted from the start
                // of the TRACK rather than the A of the ATG, refused outright whenever more than
                // one track was open, and framed a 1-nt selection with a margin of 8 -- nowhere
                // near letter resolution. With several tracks open and none named, this offers a
                // Go per track the position exists on: c.778 is a different place on each
                // transcript, and which one was meant is the user's call.
                name: 'go_to_position',
                summary: 'GO TO ONE POSITION on a track and zoom in until the bases can be read: '
                    + '"goto c.778", "go to c.-12", "jump to c.*30", "show me c.1234+5", "take me to '
                    + 'position 1520". Marks that base as the selection. Use this, not '
                    + 'select_sequence_region, whenever the request names a single position to go '
                    + 'to or look at.',
                needs: 'track',
                params: {
                    position: {
                        type: 'string', required: true,
                        about: 'the position exactly as written: HGVS coding notation (c.778, c.-12 in '
                            + "the 5' UTR, c.*30 after the stop, c.778+5 in an intron) or a plain number, "
                            + 'which is a coordinate counted from the start of the track'
                    },
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one: with several open, the user is offered each' }
                },
                run: async (a) => {
                    const t = pickTrack(a);
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    const R = await regionsOf(t);
                    if (!R) { result('Could not read the exons of ' + (t.name || 'that track') + '.'); return; }
                    const r = R.position(a.position);
                    if (r.error) { result(r.error); return; }
                    try { if (typeof graph.clearSequenceSelections === 'function') graph.clearSequenceSelections(); } catch (e) { }
                    t.markstart = r.pos;
                    t.markend = r.pos + 1;
                    t.showResizeBar = true;
                    try { graph.startX = t.tgraph.X(r.pos); graph.endX = t.tgraph.X(r.pos + 1); } catch (e) { }
                    try { graph.selectedTrack = t; } catch (e) { }
                    try { await frameBase(t, r.pos); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result((t.name || 'Track') + ' · ' + r.label
                        + (r.label.indexOf('position') === 0 ? '' : (' (track position ' + r.pos.toLocaleString() + ')')) + '.');
                },
                preview: (a) => {
                    const t = pickTrack(a);
                    const R = regionsNow(t);
                    const r = R ? R.position(a.position) : null;
                    return 'go to ' + a.position + (t ? (' on ' + (t.name || 'the track')) : '')
                        + ((r && !r.error) ? (' (track position ' + r.pos.toLocaleString() + ')') : '')
                        + ', zoomed in to the bases';
                },
                choices: (a) => choicesOver(a, (x) => {
                    const R = regionsNow(x); if (!R) return null;
                    const r = R.position(a.position); if (r.error) return r;
                    return { detail: r.label + ' is track position ' + r.pos.toLocaleString() };
                }),
                argBlocker: (a) => {
                    const t = pickTrack(a);
                    if (!t || (!a.track && !a.__track)) {
                        // No track named: fine when the position exists on at least one track.
                        const n = choicesOver(a, (x) => regionsNow(x) && regionsNow(x).position(a.position)).length;
                        if (n) return '';
                        if (!a.track && tracks().length > 1) {
                            const why = tracks().map((x) => { const R = regionsNow(x); const r = R && R.position(a.position); return r && r.error; }).find(Boolean);
                            return why || ('no open track has ' + a.position);
                        }
                    }
                    if (!t) {
                        return a.track
                            ? ('no single track matches “' + a.track + '”: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'which track? click one first';
                    }
                    const R = regionsNow(t);
                    if (!R) return '';
                    return R.position(a.position).error || '';
                }
            },
            {
                name: 'select_sequence_region',
                summary: 'Select a named part of the transcript as the sequence selection: the '
                    + "5' UTR, the 3' UTR, the coding region, a numbered exon or intron, the whole "
                    + 'transcript, or an explicit coordinate range. This is the selection every '
                    + 'model and design runs on, so it is the step that comes before "which RBP '
                    + 'binds this" or "load variants over the selection" when the user names a '
                    + 'region instead of dragging one. To GO TO a single position ("goto c.778") '
                    + 'use go_to_position instead.',
                needs: 'track',
                params: {
                    region: {
                        type: 'enum',
                        values: ['five_prime_utr', 'three_prime_utr', 'cds', 'transcript', 'exon', 'intron', 'coordinates'],
                        required: true,
                        about: "which part. cds is the coding sequence (also called the ORF or the "
                            + "translated region). Use exon or intron with index, and coordinates "
                            + "with start and end"
                    },
                    index: { type: 'number', about: 'which exon or intron, counting from 1 along the transcript' },
                    start: { type: 'number', about: 'with region=coordinates: the first base, counting from the start of the track' },
                    end: { type: 'number', about: 'with region=coordinates: the last base' },
                    track: { type: 'string', about: 'which track, by name. Omit when there is only one, or to use the selected one' }
                },
                run: async (a) => {
                    const t = pickTrack(a);
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    const R = await regionsOf(t);
                    if (!R) { result('Could not read the regions of ' + (t.name || 'that track') + '.'); return; }
                    const r = R.resolve(a);
                    if (r.error) { result(r.error); return; }
                    // Clear first: a second region selection should REPLACE the first, not leave
                    // a stale mark on another track that every later "over the selection" step
                    // would then silently include.
                    try {
                        if (typeof graph.clearSequenceSelections === 'function') graph.clearSequenceSelections();
                    } catch (e) { }
                    t.markstart = r.start;
                    t.markend = r.end;
                    t.showResizeBar = true;
                    // startX/endX are world coordinates and are what zoomToSelection reads; a
                    // selection made here should behave like one made by dragging. select_ is
                    // deliberately left alone: it marks a drag IN PROGRESS, and setting it would
                    // let the next mouse-up overwrite this.
                    try {
                        graph.startX = t.tgraph.X(r.start);
                        graph.endX = t.tgraph.X(r.end);
                    } catch (e) { }
                    // Frame it, with a margin. A selection off screen is not visibly a selection,
                    // and the next thing anyone does with a region is look at it.
                    try {
                        const tg = t.tgraph;
                        const pad = Math.max(8, (r.end - r.start) * 0.06);
                        const cy = tg.yi + (tg.height || 0) / 2, h = Math.abs(tg.height || 0) || 0.1;
                        if (graph.zoomRect) await graph.zoomRect(tg.X(r.start - pad), tg.X(r.end + pad),
                            cy + h * 3.6, cy - h * 2.2, 400);
                    } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result('Selected the ' + r.label + ' of ' + (t.name || 'the track') + ': '
                        + (r.end - r.start).toLocaleString() + ' nt, ' + r.start.toLocaleString()
                        + ' to ' + r.end.toLocaleString() + '.');
                },
                preview: (a) => {
                    const t = pickTrack(a);
                    const R = regionsNow(t);
                    const where = t ? (' of ' + (t.name || 'the track')) : '';
                    if (R) {
                        const r = R.resolve(a);
                        if (!r.error) return 'select the ' + r.label + where + ': '
                            + (r.end - r.start).toLocaleString() + ' nt';
                    }
                    const what = ('' + (a.region || '')).replace(/_/g, ' ')
                        + ((a.index != null) ? (' ' + a.index) : '');
                    return 'select the ' + what + where;
                },
                // Only when no single track is implied: a selection or a clicked track still
                // decides it, as before.
                choices: (a) => oneTrack() ? [] : choicesOver(a, (x) => {
                    const R = regionsNow(x); if (!R) return null;
                    const r = R.resolve(a); if (r.error) return r;
                    return { detail: r.label + ': ' + (r.end - r.start).toLocaleString() + ' nt, '
                        + r.start.toLocaleString() + ' to ' + r.end.toLocaleString() };
                }),
                // Resolved before the button so "this transcript has 11 exons, so there is no
                // exon 14" is something the user reads instead of a run that does nothing.
                argBlocker: (a) => {
                    const t = pickTrack(a);
                    if (!t) {
                        if (!a.track && choicesOver(a, (x) => regionsNow(x) && regionsNow(x).resolve(a)).length > 1) return '';
                        return a.track
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'more than one track is open: name the one you mean';
                    }
                    const R = regionsNow(t);
                    if (!R) return '';          // not loaded yet; run() resolves and reports
                    const r = R.resolve(a);
                    return r.error || '';
                }
            },
            {
                name: 'clear_sequence_selection',
                summary: 'Drop the selected sequence: the marked stretch on a track, made by '
                    + 'dragging across it. This is what "deselect", "deselect sequence", "clear '
                    + 'the selection" and "unselect the region" mean when a stretch of sequence '
                    + 'is marked. It does not touch selected variants or compounds.',
                needs: 'any_selection', params: {},
                count: () => selTracks().length,
                run: () => {
                    // gene.js owns this because clearing a range also has to reset the drag
                    // state that created it, or the next mouse-up re-applies the range just
                    // cleared. Falling back to clearing the marks here keeps the operation
                    // working against a gene.js that predates the method -- and the count is
                    // taken BEFORE, so a failure cannot report itself as "nothing was
                    // selected", which is the one wrong answer available here.
                    const before = selTracks().length;
                    let done = false;
                    if (typeof graph.clearSequenceSelections === 'function') {
                        try { graph.clearSequenceSelections(); done = true; } catch (e) { done = false; }
                    }
                    if (!done) {
                        for (const t of selTracks()) {
                            try { t.markstart = null; t.markend = null; t.showResizeBar = false; } catch (e) { }
                        }
                        try { graph.select_ = false; graph.startX = null; graph.endX = null; graph.__dragMark = null; } catch (e) { }
                    }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    const left = selTracks().length;
                    if (left) { result('Could not clear the selection on ' + left + ' track' + (left === 1 ? '' : 's') + '.'); return; }
                    result(before ? ('Cleared the selected sequence on ' + before + ' track' + (before === 1 ? '' : 's') + '.')
                        : 'No sequence was selected.');
                },
                preview: () => {
                    const s = selTracks();
                    return 'drop the selected sequence on ' + (s.length
                        ? s.map((t) => t.name || 'a track').join(', ') : 'any track that has one');
                }
            },
            {
                name: 'remove_selected',
                summary: 'DELETE whatever is currently selected, of one kind: the compounds, the '
                    + 'variants, the annotations or the primers. This is the one to use when the '
                    + 'request says "the selected ones" or "these", rather than describing them by '
                    + 'a filter.',
                destructive: true,
                params: {
                    kind: {
                        type: 'enum', values: ['compounds', 'variants', 'annotations', 'primers'],
                        required: true,
                        about: 'which kind of selected object to delete. compounds covers ASOs and '
                            + 'siRNAs; primers covers primer-probe sets'
                    }
                },
                count: (a) => selCountOf(a.kind),
                run: (a) => {
                    const k = SEL_KINDS[a.kind];
                    if (!k) { result('No such kind: ' + a.kind); return; }
                    const before = selCountOf(a.kind);
                    if (!before) { result('Nothing of that kind is selected.'); return; }
                    // The editor's own path first: it pushes history, keeps the rest of the
                    // selection intact, tidies the selection panel and rescales. Duplicating
                    // any of that here would be a second version of it to keep right.
                    const hadLasso = lassoOf(k.kind).length > 0;
                    if (hadLasso && typeof graph.removeSelectedByKind === 'function') {
                        try { graph.removeSelectedByKind(k.kind); } catch (e) { }
                    }
                    // Compounds can also be held in the OTHER store, which that method does not
                    // know about, so anything still on a track is removed here.
                    if (a.kind === 'compounds') {
                        const left = new Set();
                        for (const s of (graph.selectedCompounds || [])) { if (s && s.o) left.add(s.o); }
                        if (left.size) {
                            if (!hadLasso) { try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { } }
                            for (const t of tracks()) {
                                if (!t.oligos) continue;
                                t.oligos = t.oligos.filter((o) => !left.has(o));
                            }
                            try { graph.setSelectedCompounds([]); } catch (e) { }
                            try { if (graph.rescale) graph.rescale(); } catch (e) { }
                        }
                    }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    const after = selCountOf(a.kind);
                    const n = before - after;
                    result('Removed ' + n + ' selected ' + k.noun + (n === 1 ? '' : 's')
                        + '. Undo restores ' + (n === 1 ? 'it' : 'them') + '.');
                },
                preview: (a) => {
                    const k = SEL_KINDS[a.kind];
                    const n = selCountOf(a.kind);
                    return 'delete the ' + n + ' selected ' + (k ? (k.noun + (n === 1 ? '' : 's')) : a.kind);
                },
                argBlocker: (a) => (selCountOf(a.kind)
                    ? ''
                    : ('nothing of that kind is selected: pick some on the canvas first, or describe '
                        + 'them instead and they can be removed by filter'))
            },
            {
                name: 'clear_compound_selection',
                summary: 'Deselect every compound. Does not touch a selected sequence range.',
                needs: 'compounds', params: {},
                run: () => {
                    try { graph.deselectAllCompounds(); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result('Compound selection cleared.');
                }
            },

            {
                name: 'export_compounds',
                summary: 'Write the compounds to a file and download it: IDT order codes, the design '
                    + 'table as CSV, or plain FASTA sequences. Exports the SELECTED compounds when any '
                    + 'are selected, otherwise all of them.',
                needs: 'compounds',
                params: {
                    format: {
                        type: 'enum', values: ['idt', 'csv', 'fasta'], required: true,
                        about: 'idt: IDT order codes, one row per compound with its plate well, for '
                            + 'ordering synthesis. csv: the design table -- sequence, chemistry, score, '
                            + 'GC, Tm, off-target counts, flags. fasta: sequences only'
                    },
                    scope: {
                        type: 'enum', values: ['selected', 'all'],
                        about: 'omit to export the selection when there is one and everything when '
                            + 'there is not, which is what a bare "export the compounds" means'
                    }
                },
                count: (a) => {
                    const sel = selectedCompoundSet();
                    const useSel = (a.scope === 'selected') || (a.scope !== 'all' && sel.size > 0);
                    return useSel ? sel.size : crows().length;
                },
                run: async (a) => {
                    let r = null;
                    try { r = await exec('baja/manchester/menu/export-compounds.js', graph, a); }
                    catch (e) { result('Could not export: ' + (e && e.message ? e.message : e)); return; }
                    // THE SKIPPED ONES ARE NAMED. An order file short by sixteen rows and
                    // saying nothing is the failure this exists to prevent -- and so is
                    // "Nothing was exported." with no reason, which is what came back when
                    // EVERY compound failed, because the reasons were only read on the path
                    // where something had been written. The reasons are read first now, and
                    // the all-failed case is the one that most needs them.
                    const why = Object.keys(r && r.reasons || {})
                        .map((k) => r.reasons[k] + ' ' + k).join('; ');
                    if (!r || !r.wrote) {
                        result('Nothing was exported'
                            + (why ? (': ' + why + '.') : (r && r.note ? (': ' + r.note) : '.')));
                        return;
                    }
                    result('Wrote ' + r.wrote + ' compound' + (r.wrote === 1 ? '' : 's') + ' to ' + r.file
                        + (r.skipped ? ('. ' + r.skipped + ' left out: ' + why + '.') : '.'));
                },
                preview: (a) => {
                    const sel = selectedCompoundSet();
                    const useSel = (a.scope === 'selected') || (a.scope !== 'all' && sel.size > 0);
                    const n = useSel ? sel.size : crows().length;
                    const F2 = { idt: 'IDT order codes', csv: 'the design table as CSV', fasta: 'FASTA sequences' };
                    return 'export ' + n + ' ' + (useSel ? 'selected ' : '') + 'compound'
                        + (n === 1 ? '' : 's') + ' as ' + (F2[a.format] || a.format);
                },
                argBlocker: (a) => {
                    const sel = selectedCompoundSet();
                    if ((a.scope === 'selected') && !sel.size) return 'no compounds are selected';
                    return '';
                }
            },

            {
                name: 'show_compound_locations',
                summary: 'Mark where the compounds are with a down arrow over the track, so they can '
                    + 'be seen at a view too wide to show the compounds themselves. Answers "where '
                    + 'are the compounds", "show me the locations", "where do these sit". Marks the '
                    + 'selected ones when any are selected, otherwise all of them.',
                needs: 'compounds',
                params: {
                    scope: { type: 'enum', values: ['selected', 'all'], about: 'omit to mark the selection when there is one' },
                    clear: { type: 'boolean', about: 'true to take the arrows off again' }
                },
                count: (a) => {
                    if (a.clear) return null;
                    const sel = selectedCompoundSet();
                    const useSel = (a.scope === 'selected') || (a.scope !== 'all' && sel.size > 0);
                    return useSel ? sel.size : crows().length;
                },
                run: async (a) => {
                    let r = null;
                    try { r = await exec('baja/manchester/menu/mark-compound-locations.js', graph, a); }
                    catch (e) { result('Could not mark them: ' + (e && e.message ? e.message : e)); return; }
                    if (a.clear) { result('Took off ' + ((r && r.cleared) || 0) + ' marker' + (((r && r.cleared) || 0) === 1 ? '' : 's') + '.'); return; }
                    if (!r || !r.marked) {
                        result('Nothing was marked'
                            + (r && r.noPosition ? (': ' + r.noPosition + ' compounds have no position on the track.') : '.'));
                        return;
                    }
                    result('Marked ' + r.marked + ' compound' + (r.marked === 1 ? '' : 's') + ' on '
                        + r.tracks + ' track' + (r.tracks === 1 ? '' : 's')
                        + (r.noPosition ? ('. ' + r.noPosition + ' have no position and could not be placed.') : '.'));
                },
                preview: (a) => {
                    if (a.clear) return 'take the compound location arrows off';
                    const sel = selectedCompoundSet();
                    const useSel = (a.scope === 'selected') || (a.scope !== 'all' && sel.size > 0);
                    const n = useSel ? sel.size : crows().length;
                    return 'mark where ' + n + ' ' + (useSel ? 'selected ' : '') + 'compound'
                        + (n === 1 ? '' : 's') + ' sit, with an arrow over the track';
                }
            },

            // ---------------------------------------------------------------- the view -----
            {
                name: 'zoom_selection',
                summary: 'Frame whatever is currently selected.',
                needs: 'selection', params: {},
                run: async () => { try { await graph.zoomToSelection(); } catch (e) { } result('Framed the selection.'); }
            },
            {
                name: 'zoom_to_track',
                summary: 'Frame one track by name, filling the view with it.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string', required: true,
                        about: 'the track name, or enough of it to pick it out. Use the names given '
                            + 'in canvas_now'
                    }
                },
                // Resolved here rather than in the prompt: a name that matches nothing, or
                // matches two tracks, is a thing to say before the button is pressed.
                run: (a) => {
                    const t = matchTrack(a.track);
                    if (!t) { result('No single track matches “' + a.track + '”.'); return; }
                    return graph.zoomToTrack(t, 0.05);
                },
                preview: (a) => {
                    const t = matchTrack(a.track);
                    return t ? ('frame ' + (t.name || 'that track')) : ('frame the track “' + a.track + '”');
                },
                argBlocker: (a) => matchTrack(a.track) ? ''
                    : ('no single track matches “' + a.track + '”: open tracks are '
                        + tracks().map((t) => t.name || '(unnamed)').join(', '))
            },
            {
                name: 'fit',
                summary: 'Zoom out until every track is in view.',
                params: {},
                run: async () => { try { await graph.viewAllTracks(); } catch (e) { } result('Zoomed out to every track.'); }
            },

            // SPLICE A TRACK INTO AN mRNA. The track menu has offered this for a while
            // ("Convert to mRNA", in baja/manchester/menu/mouse-over-highlight.js); the box
            // could not, so "create mRNA track from DNM3" came back as not something the
            // editor can do. That was true as written: the planner is handed this file as its
            // whole vocabulary, so an operation absent from here is unreachable however
            // plainly it is asked for.
            //
            // THE PRECONDITIONS ARE THE MENU'S, not new ones. The menu answers them by not
            // drawing the item at all; argBlocker has to say them out loud instead, because
            // by then someone has already asked.
            //
            // The menu keeps its own copy of this logic rather than both calling one
            // function. Copied here deliberately rather than refactoring the menu from the
            // Ask box: these two will drift, and the right fix is one function both call.
            {
                name: 'convert_to_mrna',
                summary: 'Build a spliced mRNA track from a gene track that has introns, '
                    + 'carrying its variants, compounds and plots across. Use this for '
                    + '"make an mRNA from X", "splice X", "create an mRNA track from X".',
                needs: 'track',
                params: {
                    track: {
                        type: 'string', required: false,
                        about: 'the track name, or enough of it to pick it out. Use the names '
                            + 'given in canvas_now. Leave it out to use the selected track.'
                    }
                },
                run: (a) => {
                    const st = a.track ? matchTrack(a.track) : oneTrack();
                    if (!st) { result('No single track matches “' + (a.track || '') + '”.'); return; }
                    if (!st.sequence) { result('No sequence on ' + (st.name || 'that track') + ' to splice into mRNA.'); return; }
                    let track;
                    try { track = st.createTrackFromAnnotation('CDNA'); }
                    catch (e) { result('Could not build mRNA: ' + (e && e.message ? e.message : e)); return; }
                    if (!track) { result('Could not build the mRNA track.'); return; }
                    // Carried across exactly as the menu does it, each guarded on its own so a
                    // track with no compounds still gets its variants.
                    try { if (st.snpindels && st.snpindels.length > 0) { track.liftSnpindels(); track.targetPhase = st.targetPhase; } } catch (e) { }
                    try { if (st.oligos && st.oligos.length > 0) track.liftCompounds(); } catch (e) { }
                    try { if (st.plots && st.plots.length > 0) track.liftPlots(); } catch (e) { }
                    graph.track.push(graph.ensureUniqueTrackName ? graph.ensureUniqueTrackName(track) : track);
                    try { graph.deselectAllTracks(); } catch (e) { }
                    try { track.select(); } catch (e) { }
                    // grid || tgraph. createTrackFromAnnotation builds a track carrying a GRID
                    // (baja/bio/track-flexi.js), so reading .tgraph alone threw straight into
                    // the catch and the new track was created off screen with nothing said.
                    // The menu learned that the hard way; the same rule holds here.
                    try {
                        const ax = track.grid || track.tgraph;
                        if (ax) graph.animateTo(ax.xi - 100, ax.xi + ax.width + 100, ax.Y(-3), ax.Y(3));
                    } catch (e) { }
                    result('Created ' + (track.name || 'an mRNA track') + ' from ' + (st.name || 'track') + '.');
                },
                preview: (a) => {
                    const st = a.track ? matchTrack(a.track) : oneTrack();
                    return st ? ('splice ' + (st.name || 'that track') + ' into an mRNA track')
                              : ('splice the track “' + (a.track || '') + '” into an mRNA track');
                },
                argBlocker: (a) => {
                    const st = a.track ? matchTrack(a.track) : oneTrack();
                    if (!st) {
                        return a.track
                            ? ('no single track matches “' + a.track + '”: open tracks are '
                                + tracks().map((t) => t.name || '(unnamed)').join(', '))
                            : 'no single track is selected, so there is nothing to splice';
                    }
                    if (st.track_type === 'CDNA') return (st.name || 'that track') + ' is already an mRNA';
                    try {
                        if (!(st.containsIntrons && st.containsIntrons())) {
                            return (st.name || 'that track') + ' has no introns, so an mRNA of it would be a copy of it';
                        }
                    } catch (e) { }
                    if (!st.sequence) return (st.name || 'that track') + ' has no sequence to splice';
                    return '';
                }
            },

            // ---------------------------------------------------------------- answering ----
            {
                name: 'ask_variants',
                summary: 'ANSWER A QUESTION about the variants currently on screen, rather than '
                    + 'changing anything: whether any are pathogenic, which hit a splice site, what '
                    + 'they are. Use this whenever the request asks to be TOLD something.',
                needs: 'variants', answers: true,
                params: {
                    query: {
                        type: 'string',
                        about: 'optional terms narrowing which visible variants the question covers. '
                            + 'Empty, the usual case, means every variant on screen'
                    }
                }
            }
        ];

        // remove_compounds takes exactly the filter select_compounds takes. Shared rather
        // than copied: two filter vocabularies that drift apart would mean a request the
        // editor can select by and cannot remove by, for no reason a user could see.
        LIST.find((c) => c.name === 'remove_compounds').params =
            LIST.find((c) => c.name === 'select_compounds').params;

        const byName = (n) => LIST.find((c) => c.name === n) || null;

        // --------------------------------------------------------------------- validate ----
        const coerce = (spec, v) => {
            const T = spec.type;
            if (T === 'number') {
                if (v === '' || v == null) return { skip: true };
                const n = +v;
                return Number.isFinite(n) ? { value: n } : { bad: 'not a number' };
            }
            if (T === 'boolean') return { value: v === true || v === 'true' };
            if (T === 'string') {
                if (v == null) return { skip: true };
                return { value: ('' + v).slice(0, 300) };
            }
            if (T === 'string[]') {
                const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
                const out = arr.map((x) => ('' + x).trim()).filter(Boolean).slice(0, 20);
                return out.length ? { value: out } : { skip: true };
            }
            if (T === 'enum') {
                const s = ('' + (v == null ? '' : v)).trim().toLowerCase();
                if (!s) return { skip: true };
                const hit = (spec.values || []).find((x) => ('' + x).toLowerCase() === s);
                return hit ? { value: hit } : { bad: '“' + v + '” is not one of ' + (spec.values || []).join(', ') };
            }
            if (T === 'enum[]') {
                const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
                const out = [], bad = [];
                for (const x of arr) {
                    const s = ('' + x).trim().toLowerCase();
                    if (!s) continue;
                    const hit = (spec.values || []).find((y) => ('' + y).toLowerCase() === s);
                    if (hit) { if (out.indexOf(hit) < 0) out.push(hit); } else bad.push(x);
                }
                if (bad.length) return { bad: bad.join(', ') + ' not among ' + (spec.values || []).join(', ') };
                return out.length ? { value: out } : { skip: true };
            }
            return { bad: 'unknown parameter type' };
        };

        // A step is { capability, args }. Returns the capability and the arguments that will
        // actually be used, or a problem saying why not. A BAD ARGUMENT IS A REFUSAL, NOT A
        // SUBSTITUTION: silently dropping an unrecognised db and loading ClinVar instead
        // would do something the user did not ask for and tell them it was what they asked.
        const validate = (step) => {
            const name = ('' + ((step && step.capability) || '')).trim();
            const c = byName(name);
            if (!c) return { ok: false, problem: 'no such operation: ' + (name || '(none)') };
            const specs = c.params || {};
            const raw = (step && step.args && typeof step.args === 'object') ? step.args : {};
            const args = {};
            const dropped = [];
            for (const k of Object.keys(raw)) {
                if (!specs[k]) { dropped.push(k); continue; }
                const r = coerce(specs[k], raw[k]);
                if (r.bad) return { ok: false, capability: c, problem: k + ': ' + r.bad };
                if (!r.skip) args[k] = r.value;
            }
            for (const k of Object.keys(specs)) {
                if (specs[k].required && args[k] == null) {
                    return { ok: false, capability: c, problem: 'needs ' + k + ' and none was given' };
                }
                if (args[k] == null && specs[k].default != null) args[k] = specs[k].default;
            }
            return { ok: true, capability: c, args: args, dropped: dropped };
        };

        // What is missing on this canvas for a capability to mean anything, or '' when it can
        // run. Checked at preview time rather than at run time so the user is told before
        // they press the button, not after.
        const blocker = (c) => {
            if (!c) return '';
            if (c.needs === 'track' && !tracks().length) return 'no track is loaded';
            // 'selection' is a model or a scan, which runs on ONE marked stretch. 'any_selection'
            // only needs a mark to exist: clearing every selection across three tracks is not
            // ambiguous the way running SpliceNet on three of them would be.
            if (c.needs === 'selection') {
                if (!selTracks().length) return 'no sequence is selected: drag across a track first';
                if (!oneSelTrack()) return 'more than one track has a selection: this runs on one';
            }
            if (c.needs === 'any_selection' && !selTracks().length) return 'no sequence is selected';
            if (c.needs === 'variants' && !vrows().length) return 'there are no variants on the tracks';
            if (c.needs === 'compounds' && !crows().length) return 'there are no compounds on the tracks';
            return '';
        };

        const preview = (step) => {
            const v = validate(step);
            if (!v.ok) return { ok: false, text: v.problem };
            const c = v.capability;
            // Which tracks this step could run on, when it names none. One: it simply runs
            // there. Several: the card offers a Go for each rather than guessing.
            let choices = [];
            try { choices = c.choices ? (c.choices(v.args) || []) : []; } catch (e) { choices = []; }
            if (choices.length === 1) { v.args = choices[0].args; choices = []; }
            let text;
            try { text = c.preview ? c.preview(v.args) : c.summary.split('.')[0].toLowerCase(); }
            catch (e) { text = c.summary.split('.')[0].toLowerCase(); }
            let n = null;
            try { n = c.count ? c.count(v.args) : null; } catch (e) { n = null; }
            // A capability may also refuse on its arguments rather than on the canvas: a
            // track name matching nothing, or matching two tracks, is known here and is
            // worth saying before the button rather than after it.
            let b = blocker(c);
            if (!b && c.argBlocker) { try { b = c.argBlocker(v.args) || ''; } catch (e) { b = ''; } }
            return {
                ok: true, capability: c, args: v.args, text: text, count: n,
                blocker: b, destructive: !!c.destructive,
                opens: !!c.opens, answers: !!c.answers,
                choices: choices.length > 1 ? choices : null
            };
        };

        // The catalogue as it goes to the model: the declarations only, never the functions.
        const catalogue = () => LIST.map((c) => {
            const o = { name: c.name, summary: c.summary };
            if (c.needs) o.needs = c.needs;
            if (c.destructive) o.destructive = true;
            if (c.answers) o.answers_a_question = true;
            const specs = c.params || {};
            const ks = Object.keys(specs);
            if (ks.length) {
                o.params = {};
                for (const k of ks) {
                    const s = specs[k], d = { type: s.type };
                    if (s.values) d.values = s.values;
                    if (s.required) d.required = true;
                    if (s.about) d.about = s.about;
                    o.params[k] = d;
                }
            }
            return o;
        });

        // What regions each track actually has, for the request context: a model asked to
        // select exon 5 should know whether there are five, and that a non-coding track has
        // no UTRs to name.
        const regionInfo = (t) => {
            const R = regionsNow(t);
            if (!R) return null;
            try { return R.available(); } catch (e) { return null; }
        };

        return {
            list: LIST, byName: byName, validate: validate, preview: preview,
            regionInfo: regionInfo, regionsOf: regionsOf, selCountOf: selCountOf,
            blocker: blocker, catalogue: catalogue,
            vhits: vhits, vrows: vrows, crows: crows, selectVariants: selectVariants,
            selTracks: selTracks, oneSelTrack: oneSelTrack, tracks: tracks, rangeOf: rangeOf,
            VS: VS, F: F
        };
    })();
}
