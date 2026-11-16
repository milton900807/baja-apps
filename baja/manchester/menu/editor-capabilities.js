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
            // ---------------------------------------------------------------- building ----
            {
                // THE SPLICED TRANSCRIPT, AS A TRACK. Both right-click menus have carried a
                // Create mRNA item all along; the catalogue is what a typed request can
                // reach, so "create mRNA from DNM1" found nothing.
                name: 'create_mrna',
                summary: 'BUILD THE mRNA (the spliced transcript) from a gene track and put it on '
                    + 'the canvas as a new track: the exons joined in transcription order, no '
                    + 'introns. This is the answer to "create mRNA from X", "make the mRNA", '
                    + '"splice this", "give me the transcript sequence". The new track is '
                    + 'selected, so the models and the designer can be run on it next.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string',
                        about: 'the gene track to build from, by name, as given in canvas_now. '
                            + 'Omit it when there is only one track or one is selected'
                    },
                    part: {
                        type: 'enum', values: ['mRNA', 'CDS', 'Exon'], default: 'mRNA',
                        about: 'mRNA for the whole spliced transcript, which is what is nearly '
                            + 'always meant. CDS builds the coding sequence alone; Exon builds '
                            + 'the exons as annotated'
                    }
                },
                run: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) { result('No single track matches that, so there is nothing to splice.'); return; }
                    const part = /^cds$/i.test(a.part || '') ? 'CDS'
                        : (/^exon$/i.test(a.part || '') ? 'Exon' : 'CDNA');
                    return exec('baja/bio/orfs/make-mrna.js', graph, t, part, genegraph_panel_layout)
                        .then((r) => { if (r && r.error) result(r.error); return r; });
                },
                preview: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    const what = /^cds$/i.test(a.part || '') ? 'the coding sequence'
                        : (/^exon$/i.test(a.part || '') ? 'the exons' : 'the mRNA');
                    return 'build ' + what + ' from ' + (t ? (t.name || 'that track') : ('\u201c' + (a.track || '') + '\u201d'))
                        + ' as a new track';
                },
                argBlocker: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) {
                        return a.track
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to build from: there is more than one open';
                    }
                    // Said before the button is pressed, not after a track appears that is the
                    // whole genomic span under another name.
                    if (!('' + (t.sequence || ''))) return (t.name || 'that track') + ' has no sequence loaded';
                    const ex = (typeof t.getExons === 'function') ? (t.getExons() || [])
                        : ((t.annotations || []).filter((x) => x && x.type === 'Exon'));
                    if (!ex.length) return (t.name || 'that track') + ' has no exons annotated, so there is nothing to splice';
                    return '';
                }
            },

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
                            + "field:word to restrict. Empty means every variant"
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
                params: { query: { type: 'string', about: 'same search language. Empty means every variant' } },
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
                name: 'select_sequence_region',
                summary: 'Select a named part of the transcript as the sequence selection: the '
                    + "5' UTR, the 3' UTR, the coding region, a numbered exon or intron, the whole "
                    + 'transcript, or an explicit coordinate range. This is the selection every '
                    + 'model and design runs on, so it is the step that comes before "which RBP '
                    + 'binds this" or "load variants over the selection" when the user names a '
                    + 'region instead of dragging one.',
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
                    const t = a.track ? matchTrack(a.track) : oneTrack();
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
                    const t = a.track ? matchTrack(a.track) : oneTrack();
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
                // Resolved before the button so "this transcript has 11 exons, so there is no
                // exon 14" is something the user reads instead of a run that does nothing.
                argBlocker: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) {
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
                opens: !!c.opens, answers: !!c.answers
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
