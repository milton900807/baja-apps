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
                summary: 'Deselect every variant.',
                needs: 'variants', params: {},
                run: () => { selectVariants([]); result('Variant selection cleared.'); }
            },
            {
                name: 'select_compounds',
                summary: 'Select the compounds (ASOs, siRNAs) matching a filter on score band, the '
                    + "scorer's own flags, score, GC, Tm, length, modality or name.",
                needs: 'compounds',
                params: {
                    band: { type: 'enum', values: ['red', 'amber', 'notred', 'green'], about: 'red is flagged, amber is red or orange, green is best' },
                    faults: { type: 'enum[]', values: F.FAULTS.map((f) => f.key), about: 'flagged for any of these: ' + F.FAULTS.map((f) => f.key + ' (' + f.label + ')').join(', ') },
                    score_min: { type: 'number' }, score_max: { type: 'number' },
                    gc_min: { type: 'number', about: 'percent' }, gc_max: { type: 'number', about: 'percent' },
                    tm_min: { type: 'number', about: 'degrees C' }, tm_max: { type: 'number', about: 'degrees C' },
                    len_min: { type: 'number', about: 'nt' }, len_max: { type: 'number', about: 'nt' },
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
                preview: (a) => 'select the compounds: ' + F.describe(a)
            },
            {
                name: 'remove_compounds',
                summary: 'DELETE the compounds matching that same filter from the tracks.',
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
                preview: (a) => 'delete the compounds: ' + F.describe(a)
            },
            {
                name: 'clear_compound_selection',
                summary: 'Deselect every compound.',
                needs: 'compounds', params: {},
                run: () => {
                    try { graph.deselectAllCompounds(); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result('Compound selection cleared.');
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
            if (c.needs === 'selection') {
                if (!selTracks().length) return 'no sequence is selected: drag across a track first';
                if (!oneSelTrack()) return 'more than one track has a selection: this runs on one';
            }
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
            return {
                ok: true, capability: c, args: v.args, text: text, count: n,
                blocker: blocker(c), destructive: !!c.destructive,
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

        return {
            list: LIST, byName: byName, validate: validate, preview: preview,
            blocker: blocker, catalogue: catalogue,
            vhits: vhits, vrows: vrows, crows: crows, selectVariants: selectVariants,
            selTracks: selTracks, oneSelTrack: oneSelTrack, tracks: tracks, rangeOf: rangeOf,
            VS: VS, F: F
        };
    })();
}
