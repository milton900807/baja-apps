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
        // The track a compound operation runs on: the one named or chosen, else the selected
        // one IF it carries compounds, else the first that does. A report on -- or a screen of
        // -- an empty track is not what was asked for, even when that track is the selected one.
        // ALREADY SCREENED -- AND THAT DEPENDS ON WHICH SCREEN. A full-strand run records
        // offtarget / _offtarget; a SEED run records mi_targets_transient_. Counting the
        // full-strand field for a seed screen calls every compound unscreened and offers to
        // rerun all of them, so the predicate follows the method. The two run tools apply the
        // same split when they filter, so the count here and the work there agree.
        const otScreened = (o, method) => (method === 'seed')
            ? !!(o && o.mi_targets_transient_ != null)
            : !!(o && (o.offtargetsRun || o.offtarget != null || o._offtarget != null));
        // WHICH COMPOUNDS THE REPORT COVERS. The selection when there is one, across the
        // canvas, because a selection is rarely confined to one track; otherwise the track's
        // own compounds. compound-editor.js offers the same two, so the box and the menu
        // report on the same sets.
        const reportSet = (a) => {
            const want = (a && a.scope) || '';
            const sel = Array.from(selectedCompoundSet());
            if (want === 'selected' || (!want && sel.length)) {
                return { list: sel, where: ' (the selection)' };
            }
            const t = compoundTrack(a);
            const list = t ? (t.oligos || []).filter(Boolean) : [];
            return { list: list, where: t ? (' on ' + (t.name || 'the track')) : '' };
        };

        const screenPool = (a) => {
            const t = compoundTrack(a);
            if (!t) return { t: null, list: [] };
            let list = (t.oligos || []).filter(Boolean);
            const sc = (a && a.scope) || 'all';
            const method = (a && a.method) || 'full';
            if (sc === 'selected') list = list.filter((o) => o.selected || o.highlight__);
            else if (sc === 'unscreened') list = list.filter((o) => !otScreened(o, method));
            return { t: t, list: list };
        };

        const compoundTrack = (a) => (a && a.__track)
            || (a && a.track ? matchTrack(a.track) : null)
            || ((oneTrack() && (oneTrack().oligos || []).length) ? oneTrack() : null)
            || tracks().find((x) => (x.oligos || []).length) || null;
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
        const frameBase = (t, pos) => frameRange(t, pos, pos + 1);
        // A stretch [lo, hi): shown whole, but never wider than it has to be -- anything shorter
        // than a screenful of readable bases is framed at letter resolution, centred.
        const frameRange = async (t, lo, hi) => {
            const g = t && t.tgraph;
            if (!g || typeof g.X !== 'function' || !graph.zoomRect) return;
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            for (let i = 0; graph.animating && i < 60; i++) await sleep(60);
            let cw = 1200, ch = 800;
            try { cw = (graph.canvas && graph.canvas.width) || cw; ch = (graph.canvas && graph.canvas.height) || ch; } catch (e) { }
            const PX_PER_BASE = 44;
            const L = Math.max(1, Math.abs(hi - lo));
            const half = Math.max(Math.max(6, Math.floor(cw / PX_PER_BASE)), L * 1.15) / 2;
            const mid = (Math.min(lo, hi) + Math.max(lo, hi)) / 2;
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
        // Named places on the canvas, saved in localStorage. Created once; list() re-reads the
        // store on every call, so preview() and choices() see bookmarks made since.
        const BM = await exec('baja/lib/bookmarks.js', graph, genegraph_panel_layout);

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
        // EVERY OBJECT ON THE CANVAS AS ONE LIST of { kind, track, lo, hi, label, detail, hay, ref }
        // for zoom_to_objects. Variants are searched through VS.recordOf, the same record the
        // variant search reads, so "pathogenic" finds them by clinical significance rather
        // than only by name. Every word of the query must appear somewhere in hay.
        const objectHits = (a) => {
            const words = ('' + ((a && a.query) || '')).toLowerCase().split(/\s+/).filter(Boolean);
            if (!words.length) return [];
            const kind = (a && a.kind) || 'any';
            const want = (k) => kind === 'any' || kind === k;
            const num = (x) => (Number.isFinite(+x) ? +x : null);
            // Collected first, matched after: WHOLE WORDS when that finds anything, so
            // "pathogenic" is not also "conflicting interpretations of pathogenicity";
            // substrings only when whole words find nothing, so "patho" still works.
            const all = [];
            const add = (o) => { if (o.lo != null && o.hi != null) all.push(o); };
            for (const t of tracks()) {
                const tn = t.name || 'track';
                if (want('tracks')) add({ kind: 'track', track: t, lo: num(t.xi), hi: num(t.xf), label: tn,
                    detail: 'the whole track', hay: [tn, t.geneID, t.description, t.track_type].filter(Boolean).join(' ') });
                if (want('variants')) for (const v of (t.snpindels || [])) {
                    if (!v) continue;
                    let rec = null; try { rec = VS.recordOf(v); } catch (e) { rec = null; }
                    const x = num(v.xi); if (x == null) continue;
                    const len = Math.max(1, ('' + (v.reference || '')).length);
                    const sig = rec && rec.clinsig ? rec.clinsig.replace(/_/g, ' ') : '';
                    add({ kind: 'variant', ref: v, track: t, lo: x, hi: x + len,
                        label: 'Variant ' + ((rec && rec.name) || v.name || v.id || ((v.reference || '') + '>' + (v.alternate || ''))),
                        detail: [tn, rec && rec.change, sig, rec && rec.condition].filter(Boolean).join(' \u00b7 '),
                        hay: ['variant snp', rec ? rec.all : (v.name || ''), tn].join(' ') });
                }
                if (want('compounds')) for (const o of (t.oligos || [])) {
                    if (!o) continue;
                    add({ kind: 'compound', ref: o, track: t, lo: num(o.xi), hi: num(o.xf != null ? o.xf : o.xi),
                        label: (o.type ? ('' + o.type).toUpperCase() + ' ' : 'Compound ') + (o.name || o.id || ''),
                        detail: tn + (o.synthesisSequence ? ' \u00b7 ' + o.synthesisSequence : ''),
                        hay: ['compound oligo', o.name, o.id, o.type, o.synthesisSequence, tn].filter(Boolean).join(' ') });
                }
                if (want('annotations')) for (const n of (t.annotations || [])) {
                    if (!n) continue;
                    const lo = num(Math.min(n.xi, n.xf != null ? n.xf : n.xi)), hi = num(Math.max(n.xi, n.xf != null ? n.xf : n.xi));
                    add({ kind: 'annotation', ref: n, track: t, lo: lo, hi: hi,
                        label: (n.type ? n.type + ' ' : '') + (n.name || ''),
                        detail: tn + (n.description ? ' \u00b7 ' + n.description : ''),
                        hay: ['annotation', n.name, n.type, n.description, tn].filter(Boolean).join(' ') });
                }
            }
            const toks = (o) => o.__toks || (o.__toks = new Set(o.hay.toLowerCase().split(/[^a-z0-9.*>+-]+/).filter(Boolean)));
            let out = all.filter((o) => words.every((w) => toks(o).has(w)));
            if (!out.length) out = all.filter((o) => { const h = o.hay.toLowerCase(); return words.every((w) => h.indexOf(w) >= 0); });
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
                // COPYING A TRACK IS AN ORDINARY THING TO WANT. Keep the original whole and
                // cut the copy down to the part being worked on, which is why the name
                // usually says what the copy is for ("pathogenic").
                name: 'copy_track',
                summary: 'COPY A TRACK to a new track with a name of its own, holding the same '
                    + 'sequence, annotations, variants, compounds and data layers. This is the '
                    + 'answer to "copy this track", "duplicate this track", "make a copy called '
                    + 'X", "save this as a new track". The copy is separate: editing it, or '
                    + 'deleting things from it, leaves the original untouched, which is the '
                    + 'whole reason to make one. It appears under the original and is selected.',
                needs: 'track',
                params: {
                    name: {
                        type: 'string',
                        about: 'what to call the copy, when the request says ("called pathogenic", '
                            + '"as pathogenic"). Omit it and the copy is named after the original '
                            + 'with _copy on the end'
                    },
                    track: {
                        type: 'string',
                        about: 'the track to copy, by name, as given in canvas_now. Omit it for '
                            + '"this track", "the selected track", or when only one is open'
                    }
                },
                run: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) { result('No single track matches that, so there is nothing to copy.'); return; }
                    return exec('baja/bio/copy-track.js', graph, t, a.name || '', genegraph_panel_layout)
                        .then((r) => { if (r && r.error) result(r.error); return r; });
                },
                preview: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    return 'copy ' + (t ? (t.name || 'that track') : ('\u201c' + (a.track || '') + '\u201d'))
                        + ' to a new track'
                        + (a.name ? (' called \u201c' + a.name + '\u201d') : '');
                },
                argBlocker: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) {
                        return a.track
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to copy: there is more than one open';
                    }
                    if (typeof t.copyTrack !== 'function') {
                        return (t.name || 'that track') + ' is not a kind of track that can be copied';
                    }
                    return '';
                }
            },

            {
                // "DESIGN ASOS" OPENS THE ASO DESIGNER. This used to go through
                // tile-oligos-design.js, which refuses outright unless a sequence is already
                // selected -- so with nothing selected, "design asos" put a hint in the status
                // line and opened nothing. It now opens track-design-menu.js, the same path as the
                // track's own Design menu: with a modality it goes straight to that designer's
                // Default / Advanced dialog (aso-design-dialog.js for the ASOs), designing over the
                // selection when there is one and the whole track when there is not. "ASOs" without
                // a kind offers Gapmer and Steric-blocking as a GO each, per track when several
                // are open; no modality at all opens the track's Design library.
                name: 'design_oligos',
                summary: 'DESIGN ASOs, gapmers, steric-blocking / splice-switching ASOs or siRNAs on a '
                    + 'track: "design asos", "design gapmers", "make siRNAs", "design splice-switching '
                    + 'oligos". Opens the design dialog (Default / Advanced) for that modality; the design '
                    + 'runs over the selected sequence, or the whole track when nothing is selected. It '
                    + 'does not design anything until the user presses Run.',
                needs: 'track', opens: true,
                params: {
                    modality: {
                        type: 'enum', values: ['aso', 'gapmer', 'steric', 'sirna'],
                        about: 'gapmer for a gapmer / RNase H ASO, steric for a steric-blocking or '
                            + 'splice-switching ASO, sirna for siRNA, aso when the request says ASOs '
                            + 'without saying which kind (the user is then offered both). Omit only '
                            + 'when no modality is named at all, to open the Design library'
                    },
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one' }
                },
                run: async (a) => {
                    const t = pickTrack(a);
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    const m = a.__modality !== undefined ? a.__modality : (a.modality === 'aso' ? 'gapmer' : (a.modality || null));
                    try { graph.selectedTrack = t; } catch (e) { }
                    return exec('baja/manchester/menu/track-design-menu.js', graph, t, genegraph_panel_layout, m);
                },
                preview: (a) => {
                    const t = pickTrack(a);
                    const m = a.__modality !== undefined ? a.__modality : a.modality;
                    const what = { aso: 'the ASO designer', gapmer: 'the gapmer ASO designer', steric: 'the steric-blocking ASO designer',
                        sirna: 'the siRNA designer' }[m] || 'the Design library';
                    return 'open ' + what + (t ? (' on ' + (t.name || 'the track')) : '')
                        + (t ? (hasSel(t) ? ', over the selected sequence' : ', over the whole track') : '');
                },
                // One GO per (kind, track): "ASOs" is two kinds, and several open tracks with none
                // selected is several targets.
                choices: (a) => {
                    if (a.__track && a.__modality !== undefined) return [];
                    const KIND = { gapmer: 'Gapmer ASO (RNase H)', steric: 'Steric-blocking / splice-switching ASO', sirna: 'siRNA' };
                    const kinds = a.modality === 'aso' ? ['gapmer', 'steric'] : [a.modality || null];
                    const one = a.__track || (a.track ? matchTrack(a.track) : oneTrack());
                    const ts = one ? [one] : tracks();
                    const out = [];
                    for (const t of ts) for (const k of kinds) {
                        out.push({
                            label: (k ? KIND[k] : 'Design library') + (ts.length > 1 ? (' · ' + (t.name || 'track')) : ''),
                            detail: (t.name || 'track') + ' · ' + (hasSel(t) ? 'over the selected sequence' : 'over the whole track'),
                            args: Object.assign({}, a, { __track: t, __modality: k })
                        });
                    }
                    return out;
                },
                choiceTitle: (a, ch) => (a.modality === 'aso' ? 'Design ASOs — which kind?' : 'Design — on which track?'),
                argBlocker: (a) => (a.track && !matchTrack(a.track))
                    ? ('no single track matches “' + a.track + '”: open tracks are ' + tracks().map((x) => x.name || '(unnamed)').join(', '))
                    : ''
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
                            + "annotations, batch, phase, side. phase is the variant's phase number (0, 1, 2, ...) "
                            + "and matches exactly: \"phase 1\" is phase:1. side is where its lollipop is drawn: "
                            + "side:top stands up above the track line, side:bottom hangs down below it. "
                            + "\"the top phase\", \"the upper ones\", \"the ones above the track\" are side:top; "
                            + "\"the bottom phase\", \"the lower ones\", \"below the track\" are side:bottom"
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
                // THE OFF-TARGET REPORT, from results already on the compounds. "show me the
                // off-target report" was refused as not something the editor does, though the
                // report itself has been in Compounds all along -- the catalogue could run a
                // screen and could fold off-targets into a design report, but had no way to
                // just show what the last screen found.
                name: 'show_offtarget_report',
                summary: 'SHOW THE OFF-TARGET REPORT for the compounds: which genes they hit, as two '
                    + 'tables -- by gene (which genes this set keeps running into) and by compound '
                    + '(what each one hits) -- with downloads. "show me the off-target report", "what '
                    + 'did the off-target screen find", "which genes do these hit", "off-target '
                    + 'results". It reads the results already stored on the compounds and runs '
                    + 'nothing; use run_offtarget_screen to actually screen them.',
                needs: 'compounds', opens: true,
                params: {
                    scope: {
                        type: 'enum', values: ['all', 'selected'],
                        about: 'selected for "these" or "the selected ones". Omit to report on the '
                            + 'selection when there is one and on every compound otherwise'
                    },
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one' }
                },
                count: (a) => reportSet(a).list.length,
                run: (a) => {
                    const { list } = reportSet(a);
                    if (!list.length) { result('No compounds to report on.'); return; }
                    return exec('baja/manchester/menu/selected-off-target-genes.js', graph, list);
                },
                preview: (a) => {
                    if (a.track && !matchTrack(a.track)) return 'show the off-target report for \u201c' + a.track + '\u201d';
                    const { list, where } = reportSet(a);
                    const n = list.filter((o) => o && o.offtargetsRun).length;
                    // How many have actually been screened is the thing worth knowing before
                    // opening it: a table of "not screened" is a different answer from a clean one.
                    return 'show the off-target report for ' + list.length + ' compound'
                        + (list.length === 1 ? '' : 's') + where
                        + ' \u00b7 ' + (n ? (n + ' screened') : 'none screened yet');
                },
                argBlocker: (a) => {
                    if (a.track && !matchTrack(a.track)) return 'no single track matches \u201c' + a.track + '\u201d';
                    const { list } = reportSet(a);
                    if (!list.length) {
                        return (a.scope === 'selected') ? 'no compounds are selected' : 'no compounds to report on';
                    }
                    return '';
                }
            },
            {
                // OFF-TARGET SCREENING FROM THE BOX. The screens have always been in Design >
                // Off-targets; nothing in the catalogue reached them, so "run off-targets on
                // compounds with no off-target values" came back as not something the editor
                // does. The "no off-target values" part is a scope the screens did not have
                // either: `unscreened` was added to them for this, so the compounds that have
                // never been screened can be screened without first selecting them by hand.
                name: 'run_offtarget_screen',
                summary: 'RUN AN OFF-TARGET SCREEN on the compounds of a track: "run off-targets", '
                    + '"screen these ASOs for off-targets", "run off-targets on compounds with no '
                    + 'off-target values", "screen the selected compounds". Results attach to the '
                    + 'compounds, so the design report and the off-target filters read them afterwards.',
                needs: 'compounds', opens: true,
                params: {
                    scope: {
                        type: 'enum', values: ['all', 'unscreened', 'selected'], default: 'all',
                        about: 'which compounds. unscreened is the ones that have NO off-target value '
                            + 'yet -- "compounds with no off-target values", "the ones that have not '
                            + 'been screened", "whatever is missing". selected is the ones currently '
                            + 'selected. all is every compound on the track'
                    },
                    method: {
                        type: 'enum', values: ['full', 'seed', 'fuzzy'], default: 'full',
                        about: 'full screens the whole antisense strand and is the default for an ASO. '
                            + 'seed screens positions 2-8 of the guide, which is what drives siRNA '
                            + 'off-target silencing. fuzzy is a tolerant edit-distance search that also '
                            + 'finds near-matches, and it always covers every compound on the track'
                    },
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one' }
                },
                count: (a) => screenPool(a).list.length,
                run: (a) => {
                    const { t, list } = screenPool(a);
                    if (!t) { result('No compounds on any open track to screen.'); return; }
                    const m = a.method || 'full';
                    if (m === 'fuzzy') {
                        return exec('baja/data/aso-offtarget.js', '', window['env']['apiUrl'],
                            graph, genegraph_panel_layout, t);
                    }
                    if (!list.length) { result('No compounds in that scope to screen.'); return; }
                    // true keeps the tools' original meaning of 'selected'; the word is the new scope.
                    const scope = (a.scope === 'selected') ? true
                        : (a.scope === 'unscreened' ? 'unscreened' : false);
                    return exec(m === 'seed'
                        ? 'baja/manchester/menu/run-off-target-tool-seed-seq.js'
                        : 'baja/manchester/menu/run-off-target-tool.js',
                        graph, genegraph_panel_layout, scope, t);
                },
                preview: (a) => {
                    if (a.track && !matchTrack(a.track)) return 'screen \u201c' + a.track + '\u201d for off-targets';
                    const { t, list } = screenPool(a);
                    const m = a.method || 'full';
                    const how = { full: 'the full antisense strand', seed: 'the seed region (positions 2-8)',
                        fuzzy: 'a fuzzy edit-distance search' }[m];
                    const what = (m === 'fuzzy') ? 'every compound'
                        : (list.length + ' ' + ({ unscreened: 'never-screened ', selected: 'selected ' }[a.scope] || '')
                            + 'compound' + (list.length === 1 ? '' : 's'));
                    return 'screen ' + what + (t ? (' on ' + (t.name || 'the track')) : '') + ' for off-targets, using ' + how;
                },
                argBlocker: (a) => {
                    if (a.track && !matchTrack(a.track)) {
                        return 'no single track matches \u201c' + a.track + '\u201d';
                    }
                    const { t, list } = screenPool(a);
                    if (!t) return 'no open track carries compounds';
                    // The fuzzy search takes no scope, so asking for one would run something
                    // other than what was asked for. Said before the button, not after it.
                    if ((a.method === 'fuzzy') && a.scope && a.scope !== 'all') {
                        return 'the fuzzy search screens every compound on the track; it cannot be limited to the '
                            + a.scope + ' ones. Use the full or seed screen for that';
                    }
                    if (!list.length) {
                        if (a.scope === 'unscreened') {
                            return 'every compound on ' + (t.name || 'that track') + ' has already been screened';
                        }
                        if (a.scope === 'selected') return 'no compounds are selected on ' + (t.name || 'that track');
                        return 'no compounds on ' + (t.name || 'that track');
                    }
                    return '';
                }
            },
            {
                // "generate aso report" came back as "not something the editor can do", though
                // Design > Therapeutics has written this report all along. The report itself is
                // unchanged; it is reachable from the box now.
                name: 'generate_design_report',
                summary: 'GENERATE THE DESIGN REPORT for the compounds on a track: "generate aso '
                    + 'report", "generate oligo report", "write the design report", "report on these '
                    + 'ASOs". It gathers the target, the layers, the compounds, their chemistry and '
                    + 'their off-targets and writes them up, and where the compounds are '
                    + 'allele-selective it adds a section ordering them by how far they diverge from '
                    + 'the reference. The report opens in a reader that can save it as PDF or markdown.',
                needs: 'compounds', opens: true,
                params: {
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one' }
                },
                run: (a) => {
                    const t = compoundTrack(a);
                    if (!t) { result('No compounds on any open track to report on.'); return; }
                    return exec('baja/manchester/menu/design-report.js', graph, genegraph_panel_layout, t);
                },
                preview: (a) => {
                    // A name that matches nothing must not read as a report on some other
                    // track: the blocker stops the run either way, but the line above it is
                    // what the user actually reads.
                    if (a.track && !matchTrack(a.track)) return 'write the design report for \u201c' + a.track + '\u201d';
                    const t = compoundTrack(a);
                    const n = t ? (t.oligos || []).length : 0;
                    return 'write the design report' + (t ? (' for ' + n + ' compound' + (n === 1 ? '' : 's')
                        + ' on ' + (t.name || 'the track')) : '');
                },
                // Several tracks carry compounds: the report covers ONE track, so which one is the
                // user's call rather than whichever comes first.
                choices: (a) => {
                    if (a.__track || a.track) return [];
                    const withC = tracks().filter((x) => (x.oligos || []).length);
                    if (withC.length < 2) return [];
                    return withC.map((t) => ({
                        label: t.name || '(unnamed track)',
                        detail: (t.oligos || []).length + ' compound' + ((t.oligos || []).length === 1 ? '' : 's')
                            + ((t.oligos || []).some((o) => o && o.alleleSelective) ? ' \u00b7 allele-selective' : ''),
                        args: Object.assign({}, a, { __track: t })
                    }));
                },
                choiceTitle: () => 'Design report \u2014 for which track?',
                argBlocker: (a) => (a.track && !matchTrack(a.track))
                    ? ('no single track matches \u201c' + a.track + '\u201d')
                    : ''
            },
            {
                // The Variant designer: every variant ranked by how far its window has diverged
                // from the reference, with the compounds tiled on each and a GO to it.
                name: 'open_variant_designer',
                summary: 'OPEN THE VARIANT DESIGNER: a ranked list of every variant by its divergence '
                    + 'from the reference over a window of bases around it, with the number of compounds '
                    + 'tiled on each and a GO to its location. "open the variant designer", "rank the '
                    + 'variants by divergence", "which variants diverge most from the reference", "which '
                    + 'variants have compounds on them".',
                needs: 'variants', opens: true,
                params: {
                    window: { type: 'number', about: 'the window size in nt when the request gives one ("over 100 bases"). Omit to keep the last one used (50 the first time)' },
                    track: { type: 'string', about: 'one track, by name, when the request names one. Omit for every track' }
                },
                run: (a) => {
                    try {
                        const S = graph.__variantDesigner || (graph.__variantDesigner = { W: 50, samePhase: false, track: null, sort: 'divergence', scroll: 0 });
                        if (a.window != null && +a.window >= 1) S.W = Math.round(+a.window);
                    } catch (e) { }
                    return exec('baja/manchester/menu/variant-designer.js', graph, genegraph_panel_layout, a.track ? (matchTrack(a.track) || null) : null);
                },
                preview: (a) => 'open the Variant designer' + (a.track ? (' on ' + a.track) : '')
                    + (a.window != null ? (', window ' + a.window + ' nt') : ''),
                argBlocker: (a) => (a.track && !matchTrack(a.track)) ? ('no single track matches \u201c' + a.track + '\u201d') : ''
            },
            {
                name: 'remove_variants',
                summary: 'DELETE the variants matching a search query from the tracks.',
                needs: 'variants', destructive: true,
                params: { query: { type: 'string', about: 'same search language as select_variants, fields included (phase:1 for phase 1, side:top / side:bottom for the top or bottom phase). Empty means every variant' } },
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
                // BOOKMARK THIS SITE. "bookmark this site dua" used to come back as "not something
                // the editor can do ... likely a browser or application-level feature", because
                // nothing in the catalogue saved a place. The name is whatever the user put after
                // the verb, which is the part the planner has to be told to keep.
                name: 'bookmark_site',
                summary: 'SAVE THE CURRENT VIEW as a named bookmark, to come back to later: "bookmark '
                    + 'this site dua", "bookmark this as the hotspot", "save this view as exon 7", '
                    + '"remember this place". It records where the camera is now and changes nothing '
                    + 'on the canvas.',
                needs: 'track',
                params: {
                    name: {
                        type: 'string', required: true,
                        about: "what to call it, taken from the request itself: in \"bookmark this site "
                            + "dua\" the name is \"dua\", in \"bookmark this as the hotspot\" it is \"the "
                            + "hotspot\". Use the user's own words, without the words bookmark / save / "
                            + "this site"
                    }
                },
                run: (a) => {
                    const r = BM.save(a.name);
                    if (r.error) { result(r.error); return; }
                    result('Bookmarked \u201c' + r.bm.name + '\u201d at ' + BM.where(r.bm)
                        + (r.replaced ? ' \u2014 replaced the earlier one of that name.'
                            : '. Say \u201cgo to ' + r.bm.name + '\u201d to come back.'));
                },
                preview: (a) => 'bookmark this view as \u201c' + a.name + '\u201d'
            },
            {
                name: 'go_to_bookmark',
                summary: 'GO BACK TO A SAVED BOOKMARK: "go to dua", "take me back to the hotspot", "go '
                    + 'to my bookmark". Puts the camera back where it was when the bookmark was saved. '
                    + 'With no name, or when several match, the bookmarks are offered to pick from. Use '
                    + 'this only for a name that was bookmarked; a position such as c.778 is '
                    + 'go_to_position, and a thing on the canvas is zoom_to_objects.',
                needs: 'track',
                params: {
                    name: { type: 'string', about: "the bookmark's name when the request names one. Omit to be offered every bookmark" }
                },
                run: async (a) => {
                    const b = a.__bm || (a.name ? (BM.find(a.name)[0] || null) : null);
                    if (!b) { result(a.name ? ('No bookmark called \u201c' + a.name + '\u201d.') : 'No bookmarks saved yet.'); return; }
                    await BM.go(b);
                    result('Bookmark \u00b7 ' + b.name + ' (' + BM.where(b) + ').');
                },
                preview: (a) => 'go to the bookmark' + (a.name ? (' \u201c' + a.name + '\u201d') : ''),
                choices: (a) => {
                    if (a.__bm) return [];
                    return (a.name ? BM.find(a.name) : BM.list()).map((b) => ({
                        label: b.name, detail: BM.where(b) + ' \u00b7 ' + BM.when(b),
                        args: Object.assign({}, a, { __bm: b })
                    }));
                },
                choiceTitle: () => 'Go to which bookmark?',
                argBlocker: (a) => {
                    if (a.__bm) return '';
                    const hits = a.name ? BM.find(a.name) : BM.list();
                    if (!hits.length) {
                        return a.name ? ('no bookmark called \u201c' + a.name + '\u201d')
                            : 'no bookmarks saved yet: say \u201cbookmark this site <name>\u201d first';
                    }
                    return '';
                }
            },
            {
                name: 'open_bookmarks',
                summary: 'OPEN THE BOOKMARKS PANEL: every saved bookmark, each with a GO and a Delete. '
                    + '"show my bookmarks", "list my bookmarks", "manage bookmarks".',
                opens: true, params: {},
                run: () => { BM.open(); },
                preview: () => 'open the bookmarks panel (' + BM.list().length + ' saved)'
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
                // ZOOM TO WHATEVER ON THE CANVAS MATCHES SOME WORDS. "zoom into the pathogenic
                // variant" names a thing by what it IS, not where it is, so this searches every
                // object the canvas holds -- variants by their whole record (clinical
                // significance, condition, consequence, gene, change), compounds, annotations
                // such as exons, and the tracks themselves -- and offers a GO per hit, each
                // zooming to letter resolution. One hit just goes there.
                name: 'zoom_to_objects',
                summary: 'FIND AND ZOOM TO objects on the canvas by keywords: "zoom into the pathogenic '
                    + 'variant", "take me to the ASO", "show me exon 7", "go to the frameshift", "where is '
                    + 'rs6025". Searches variants, compounds, annotations and tracks, and offers one GO per '
                    + 'match, each zooming in until the bases can be read. Use this when the request names '
                    + 'WHAT to look at; use go_to_position when it names a position such as c.778.',
                params: {
                    query: {
                        type: 'string', required: true,
                        about: 'the words that identify the object, as they would appear on it: '
                            + '"pathogenic", "frameshift", "rs6025", "exon 7", an oligo name. Spell them '
                            + 'correctly ("pathologic" means pathogenic). Every word must match. Leave out '
                            + 'the kind of object; that goes in kind'
                    },
                    kind: {
                        type: 'enum', values: ['any', 'variants', 'compounds', 'annotations', 'tracks'],
                        default: 'any',
                        about: 'what sort of object, when the request says ("the pathogenic VARIANT" is variants)'
                    }
                },
                run: async (a) => {
                    let h = a.__hit;
                    if (!h) {
                        const hits = objectHits(a);
                        if (!hits.length) { result('Nothing on the canvas matches \u201c' + a.query + '\u201d.'); return; }
                        if (hits.length > 1) { result(hits.length + ' objects match \u201c' + a.query + '\u201d: ask again and pick one.'); return; }
                        h = hits[0];
                    }
                    if (h.kind === 'variant') {
                        try { selectVariants([{ v: h.ref }]); } catch (e) { }
                    }
                    try { graph.selectedTrack = h.track; } catch (e) { }
                    try { await frameRange(h.track, h.lo, h.hi); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result(h.label + ' \u00b7 ' + (h.track.name || 'track') + '.');
                },
                count: (a) => objectHits(a).length,
                preview: (a) => {
                    const n = objectHits(a).length;
                    const what = (a.kind && a.kind !== 'any') ? a.kind : 'objects';
                    return n === 1 ? ('zoom to the one ' + what.replace(/s$/, '') + ' matching \u201c' + a.query + '\u201d')
                        : ('zoom to ' + what + ' matching \u201c' + a.query + '\u201d');
                },
                choices: (a) => {
                    if (a.__hit) return [];
                    return objectHits(a).map((h) => ({ label: h.label, detail: h.detail, args: Object.assign({}, a, { __hit: h }) }));
                },
                choiceTitle: (a, ch) => ch.length + ' match \u201c' + a.query + '\u201d \u2014 zoom to which?',
                argBlocker: (a) => objectHits(a).length ? '' : ('nothing on the canvas matches \u201c' + a.query + '\u201d')
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
                summary: 'HIGHLIGHT THE COMPOUNDS / show where they are: marks each one with a down '
                    + 'arrow over the track, so they can be seen at a view too wide to show the '
                    + 'compounds themselves. This is what "highlight compounds", "highlight all '
                    + 'compounds", "where are the compounds", "show me where the compounds are on the '
                    + 'transcript", "show me the locations" and "where do these sit" all mean. Marks '
                    + 'the selected ones when any are selected, unless the request asks for all.',
                needs: 'compounds',
                params: {
                    scope: {
                        type: 'enum', values: ['selected', 'all'],
                        about: 'use all when the request says all, every, the whole track or the whole '
                            + 'transcript -- "highlight all compounds", "where are all the compounds on '
                            + 'the transcript" -- which means every compound even when some are '
                            + 'selected. Use selected for "these" or "the selected ones". Omit to mark '
                            + 'the selection when there is one and everything otherwise'
                    },
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
                    // WHEN IT MARKED ONLY THE SELECTION, SAY SO. With 85 of 210 compounds
                    // selected, "highlight compounds" marks 85 and a bare count reads as though
                    // that were all of them. The line now says which it did and how to get the rest.
                    const sel = selectedCompoundSet();
                    const usedSel = (a.scope === 'selected') || (a.scope !== 'all' && sel.size > 0);
                    const total = crows().length;
                    result('Marked ' + r.marked + (usedSel ? ' selected' : '') + ' compound'
                        + (r.marked === 1 ? '' : 's') + ' on '
                        + r.tracks + ' track' + (r.tracks === 1 ? '' : 's')
                        + (r.noPosition ? ('. ' + r.noPosition + ' have no position and could not be placed.') : '.')
                        + ((usedSel && total > r.marked)
                            ? (' ' + total + ' compounds in all \u2014 say \u201chighlight all compounds\u201d for every one.')
                            : ''));
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
                choices: choices.length > 1 ? choices : null,
                choiceTitle: (choices.length > 1 && c.choiceTitle) ? c.choiceTitle(v.args, choices) : null
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
