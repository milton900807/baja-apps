function () {

    // THE MODEL REGISTRY. This is the part of Tottenham designed to be replaced.
    //
    // Half-life, expression and innate sensing are all things people are actively building
    // trained models for, and any number this editor computes today is a placeholder for one
    // of those. So rather than bury the arithmetic in the UI, every prediction in the editor
    // comes from a MODEL object registered here, and adding a real one is a single call with
    // no change to the editor at all:
    //
    //     const M = await exec('tottenham/lib/models.js');
    //     M.register({
    //         id: 'halflife-xgb-2026',
    //         name: 'Half-life, gradient boosted (internal, v3)',
    //         kind: 'half-life',
    //         unit: 'hours',
    //         trained: true,
    //         provenance: 'trained on 8,412 transcripts, SLAM-seq, HEK293, held-out r = 0.71',
    //         needs: ['cds', 'utr3'],
    //         supersedes: 'halflife-composite',
    //         predict: async (ctx) => ({ value: 14.2, confidence: 'medium' })
    //     });
    //
    // `supersedes` is what makes the swap clean: the editor shows the superseding model as
    // the headline number and demotes the one it replaces to a comparison, so a baseline
    // stops being the answer the moment something better is present, without anyone editing
    // a template.
    //
    // Remote models get registerRemote(), which POSTs the construct to an endpoint. Same
    // interface from the editor's side.
    //
    // EVERY PREDICTION CARRIES trained: true|false, and the editor prints it next to the
    // number. The three models shipped in this file are NOT trained. They are transparent
    // additive scores over features that are individually well supported, and they exist so
    // the editor has something honest to show and so a real model has a baseline to beat.
    // They report a relative index on a stated scale and none of them reports hours, because
    // none of them knows hours.

    return (async () => {

        const GC = await exec('liverpool/lib/genetic-code.js');
        const EL = await exec('tottenham/lib/elements.js');
        const ST = await exec('tottenham/lib/structure.js');

        const registry = new Map();

        const KINDS = ['half-life', 'expression', 'innate-sensing', 'structure', 'other'];

        // ---- registration ----------------------------------------------------------------------
        const register = (spec) => {
            const s = spec || {};
            if (!s.id) throw new Error('a model needs an id');
            if (typeof s.predict !== 'function') throw new Error('model ' + s.id + ' has no predict()');
            if (s.kind && KINDS.indexOf(s.kind) < 0) {
                // Not fatal: an unknown kind is grouped under "other" rather than rejected, so
                // a model for something nobody thought of still appears.
                s.kind = 'other';
            }
            registry.set(s.id, {
                id: s.id,
                name: s.name || s.id,
                kind: s.kind || 'other',
                unit: s.unit || 'index',
                scale: s.scale || '',
                trained: !!s.trained,
                version: s.version || '',
                provenance: s.provenance || '',
                blurb: s.blurb || '',
                needs: Array.isArray(s.needs) ? s.needs : [],
                supersedes: s.supersedes || null,
                appliesTo: (typeof s.appliesTo === 'function') ? s.appliesTo : (() => true),
                predict: s.predict
            });
            return s.id;
        };
        const unregister = (id) => registry.delete(id);
        const has = (id) => registry.has(id);
        const get = (id) => registry.get(id) || null;

        // Everything except predict(), for display.
        const list = (kind) => Array.from(registry.values())
            .filter((m) => !kind || m.kind === kind)
            .map((m) => ({
                id: m.id, name: m.name, kind: m.kind, unit: m.unit, scale: m.scale,
                trained: m.trained, version: m.version, provenance: m.provenance,
                blurb: m.blurb, needs: m.needs, supersedes: m.supersedes
            }))
            // Trained models first, then by name: the list is a menu of what to believe.
            .sort((a, b) => (b.trained - a.trained) || a.name.localeCompare(b.name));

        // A model that is superseded by another REGISTERED model. The editor demotes these.
        const supersededIds = () => {
            const out = new Set();
            for (const m of registry.values()) if (m.supersedes && registry.has(m.supersedes)) out.add(m.supersedes);
            return out;
        };

        // ---- running -------------------------------------------------------------------------------
        //
        // A model is third-party code by design. It is wrapped: a throw becomes a reported
        // error rather than a broken editor, a missing input is reported as "not applicable"
        // rather than a wrong number, and a model that hangs is cut off.
        const TIMEOUT_MS = 15000;

        const run = async (id, ctx) => {
            const m = registry.get(id);
            if (!m) return { id: id, ok: false, error: 'no model registered as ' + id };
            for (const need of m.needs) {
                const v = ctx ? ctx[need] : null;
                if (!v || !('' + v).length) {
                    return { id: id, name: m.name, ok: false, notApplicable: true, error: 'needs ' + need + ', which this construct does not have' };
                }
            }
            try {
                if (!m.appliesTo(ctx)) return { id: id, name: m.name, ok: false, notApplicable: true, error: 'not applicable to this construct' };
            } catch (e) {
                return { id: id, name: m.name, ok: false, error: 'appliesTo() threw: ' + (e && e.message ? e.message : e) };
            }
            const started = Date.now();
            try {
                const res = await Promise.race([
                    Promise.resolve(m.predict(ctx)),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + TIMEOUT_MS + ' ms')), TIMEOUT_MS))
                ]);
                if (!res || typeof res.value === 'undefined') {
                    return { id: id, name: m.name, ok: false, error: 'predict() returned no value' };
                }
                return {
                    id: id, name: m.name, kind: m.kind, ok: true,
                    value: res.value,
                    unit: res.unit || m.unit,
                    scale: res.scale || m.scale,
                    confidence: res.confidence || 'unstated',
                    contributions: Array.isArray(res.contributions) ? res.contributions : [],
                    explanation: res.explanation || '',
                    trained: m.trained,
                    provenance: m.provenance,
                    ms: Date.now() - started
                };
            } catch (e) {
                return { id: id, name: m.name, ok: false, error: (e && e.message) ? e.message : ('' + e), ms: Date.now() - started };
            }
        };

        const runAll = async (kind, ctx) => {
            const out = [];
            for (const m of registry.values()) {
                if (kind && m.kind !== kind) continue;
                out.push(await run(m.id, ctx));
            }
            return out;
        };

        // ---- a remote model ----------------------------------------------------------------------
        //
        // POSTs the construct to an endpoint and expects {value, unit?, confidence?,
        // contributions?, explanation?} back. The context is trimmed to the sequence fields:
        // a scan result is this editor's internal shape and is not something a service should
        // have to understand.
        const registerRemote = (spec) => {
            const s = spec || {};
            if (!s.url) throw new Error('a remote model needs a url');
            return register(Object.assign({}, s, {
                predict: async (ctx) => {
                    const body = {
                        utr5: ctx.utr5 || '', cds: ctx.cds || '', utr3: ctx.utr3 || '',
                        polyA: ctx.polyA || 0, capType: ctx.capType || '',
                        nucleoside: ctx.nucleoside || '', architecture: ctx.architecture || '',
                        protein: ctx.protein || ''
                    };
                    const r = await fetch(s.url, {
                        method: 'POST',
                        headers: Object.assign({ 'Content-Type': 'application/json' }, s.headers || {}),
                        body: JSON.stringify(body)
                    });
                    if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + s.url);
                    return await r.json();
                }
            }));
        };

        // ==========================================================================================
        //  The baseline models. NOT trained. Transparent on purpose.
        // ==========================================================================================

        // A logistic squash so no single feature can dominate and the index stays on 0-100.
        const squash = (x) => 100 / (1 + Math.exp(-x));

        register({
            id: 'halflife-composite',
            name: 'Half-life index (feature composite)',
            kind: 'half-life',
            unit: 'index',
            scale: '0-100, higher is more stable. RELATIVE only: it is not hours and does not convert to hours.',
            trained: false,
            version: '1',
            provenance: 'Hand-weighted composite of published cis-element effects. No training data. '
                + 'Each contribution below is separately supported; the weights that combine them are a judgement call.',
            blurb: 'Adds up the destabilising and stabilising elements in the untranslated regions, '
                + 'the m6A consensus density, CpG burden and poly(A) length. Decomposed, so you can '
                + 'see which feature moved it and disagree with the weight.',
            needs: ['cds'],
            predict: async (ctx) => {
                const c = [];
                let x = 0.9;                       // intercept: a plain construct sits a bit above the middle

                const scan = ctx.scan || EL.scanConstruct({ utr5: ctx.utr5, cds: ctx.cds, utr3: ctx.utr3 });
                const u3 = scan.regions.utr3 || { length: 0, cpg: {}, areClusters: [] };
                const cds = scan.regions.cds || { length: 0, cpg: {} };

                const add = (delta, feature, why) => { x += delta; if (delta) c.push({ feature: feature, delta: delta, why: why }); };

                // AU-rich elements, weighted by cluster strength rather than raw pentamer count.
                let areLoad = 0;
                for (const cl of (u3.areClusters || [])) areLoad += (cl.strength === 'strong' ? 1.0 : (cl.strength === 'medium' ? 0.5 : 0.2));
                const nonamers = scan.findings.filter((f) => f.id === 'are-nonamer').length;
                areLoad += nonamers * 1.2;
                if (areLoad) add(-1.1 * Math.min(3, areLoad), 'AU-rich elements in the 3ʹ UTR',
                    nonamers + ' nonamer(s) and ' + (u3.areClusters || []).length + ' pentamer cluster(s). The best-established destabilising class.');

                const gre = scan.findings.filter((f) => f.id === 'gre').length;
                if (gre) add(-0.5 * Math.min(3, gre), 'GU-rich elements', gre + ' full-length GRE(s), read by CELF1.');

                const pre = scan.findings.filter((f) => f.id === 'pre').length;
                if (pre) add(-0.25 * Math.min(4, pre), 'Pumilio sites', pre + ' site(s). Degenerate motif, so treat a single hit lightly.');

                const mir = (scan.mirnas || []).filter((m) => m.region === 'utr3');
                if (mir.length) add(-0.45 * Math.min(4, mir.length), 'miRNA target sites',
                    mir.length + ' site(s): ' + mir.map((m) => m.name).filter((v, i, a) => a.indexOf(v) === i).join(', ')
                    + '. Destabilising by design if you put them there.');

                const stab = scan.findings.filter((f) => f.id === 'pcbp').length;
                if (stab) add(+0.8 * Math.min(2, stab), 'Pyrimidine-rich stabilising element',
                    'The alpha-complex element that protects the poly(A) tail from deadenylation.');

                // m6A consensus density, relative to the ~16 per kb a random sequence carries.
                const drachKb = cds.drachPerKb || 0;
                if (drachKb) add(-0.9 * Math.max(-1, Math.min(1.5, (drachKb - 16) / 16)), 'm6A consensus density',
                    drachKb.toFixed(1) + ' DRACH per kb in the coding sequence against about 16 per kb by chance.');

                // CpG, as observed over expected: 1.0 is what the base composition predicts,
                // and the human transcriptome sits well below it.
                const oe = (cds.cpg && cds.cpg.oe != null) ? cds.cpg.oe : null;
                if (oe != null) add(-1.2 * Math.max(-0.8, Math.min(1.2, oe - 0.35)), 'CpG burden',
                    'Observed/expected ' + oe.toFixed(2) + ' in the coding sequence. ZAP binds CpG-rich RNA; human transcripts sit near 0.25-0.4.');

                const pa = ctx.polyA || 0;
                if (pa < 60) add(-1.0, 'Poly(A) tail', pa + ' nt is short; PABP occupancy and protection from exonucleases both fall off.');
                else if (pa >= 100) add(+0.5, 'Poly(A) tail', pa + ' nt is in the usual range.');

                if (ctx.nucleoside && ctx.nucleoside !== 'unmodified') {
                    add(+1.0, 'Modified nucleoside', ctx.nucleoside + ' reduces sensing, so less interferon and less RNase L. '
                        + 'The effect on FUNCTIONAL half-life in a responsive cell is large.');
                }
                if (ctx.capType === 'cap1') add(+0.35, 'Cap 1', 'A 2ʹ-O-methylated cap avoids IFIT1 and reads as self.');
                else if (ctx.capType === 'cap0') add(-0.35, 'Cap 0', 'Cap 0 is recognised by IFIT1 and is sensed as non-self.');

                const polyU = scan.findings.filter((f) => f.id === 'polyu').length;
                if (polyU) add(-0.15 * Math.min(4, polyU), 'Poly(U) tracts', polyU + ' run(s) of five or more U.');

                return {
                    value: Math.round(squash(x)),
                    contributions: c,
                    confidence: 'low',
                    explanation: 'A relative index, not a duration. Compare two designs with it; do not quote it.'
                };
            }
        });

        register({
            id: 'initiation-baseline',
            name: 'Initiation index (feature composite)',
            kind: 'expression',
            unit: 'index',
            scale: '0-100, higher initiates better. Relative only.',
            trained: false,
            version: '1',
            provenance: 'Kozak context, cap-proximal hairpin stability and upstream AUG count. No training data.',
            blurb: 'How easily a 43S subunit loads and finds the start codon. Dominated by upstream '
                + 'AUGs and by structure in the first 40 bases, which are the two things that reliably matter.',
            needs: ['cds'],
            predict: async (ctx) => {
                const c = [];
                let x = 0.6;
                const add = (d, f, w) => { x += d; if (d) c.push({ feature: f, delta: d, why: w }); };

                const u5 = GC.cleanNt(ctx.utr5 || '');
                const uaug = (u5.match(/ATG/g) || []).length;
                if (uaug) add(-1.4 * Math.min(3, uaug), 'Upstream AUG',
                    uaug + ' AUG(s) in the 5ʹ UTR. A scanning ribosome initiates at the first one it reaches.');

                const full = u5 + GC.cleanNt(ctx.cds || '');
                const st = ST.analyse({ sequence: full, cdsFrom: u5.length });
                if (st.capWindow && st.capWindow.dg != null) {
                    const dg = st.capWindow.dg;
                    add(-0.16 * Math.max(0, -dg - 4), 'Cap-proximal structure',
                        'Most stable hairpin in the first 40 bases: ' + dg.toFixed(1) + ' kcal/mol.');
                }
                if (st.startWindow && st.startWindow.dg != null && st.startWindow.dg <= -12) {
                    add(-0.7, 'Structure over the start codon', st.startWindow.dg.toFixed(1) + ' kcal/mol across the initiation site.');
                }

                // Kozak: position -3 (a purine) and +4 (a G) carry nearly all of the effect.
                const cds = GC.cleanNt(ctx.cds || '');
                const m3 = (u5.length >= 3) ? u5[u5.length - 3] : '';
                const p4 = cds[3] || '';
                const strong = (m3 === 'A' || m3 === 'G') && p4 === 'G';
                const adequate = (m3 === 'A' || m3 === 'G') || p4 === 'G';
                add(strong ? +0.9 : (adequate ? +0.25 : -0.8), 'Kozak context',
                    'Position -3 is ' + (m3 || 'absent') + ' and +4 is ' + (p4 || 'absent') + '. '
                    + (strong ? 'Strong context.' : (adequate ? 'Adequate; one of the two key positions is right.' : 'Weak; leaky scanning past the start codon.')));

                if (u5.length && u5.length < 20) add(-0.5, 'Very short 5ʹ UTR', u5.length + ' nt leaves little room to load and scan.');
                if (u5.length > 200) add(-0.3, 'Long 5ʹ UTR', u5.length + ' nt; more chance of structure and of an upstream AUG.');

                const cai = cds.length ? GC.cai(cds) : 0;
                add((cai - 0.75) * 1.2, 'Codon adaptation', 'CAI ' + cai.toFixed(3) + '. Affects elongation rather than initiation, included here as an output proxy.');

                return { value: Math.round(squash(x)), contributions: c, confidence: 'low',
                    explanation: 'Relative. Upstream AUGs and cap-proximal structure dominate; everything else is a smaller correction.' };
            }
        });

        register({
            id: 'sensing-baseline',
            name: 'Innate sensing index (feature composite)',
            kind: 'innate-sensing',
            unit: 'index',
            scale: '0-100, higher means MORE sensing, which is worse for a protein-replacement construct and sometimes wanted in a vaccine.',
            trained: false,
            version: '1',
            provenance: 'CpG burden, uridine content, cap type, nucleoside modification and double-stranded byproduct risk. No training data.',
            blurb: 'How much the innate machinery is likely to notice. Note the sign: for a vaccine '
                + 'some sensing is the adjuvant, so a high number is not automatically bad.',
            needs: ['cds'],
            predict: async (ctx) => {
                const c = [];
                let x = -0.4;
                const add = (d, f, w) => { x += d; if (d) c.push({ feature: f, delta: d, why: w }); };

                const cds = GC.cleanNt(ctx.cds || '');
                const oe = EL.dinucleotideOE(cds, 'CG').oe;
                if (oe != null) add(1.3 * Math.max(-0.5, Math.min(1.2, oe - 0.35)), 'CpG burden', 'Observed/expected ' + oe.toFixed(2) + '.');
                const u = GC.uFraction(cds);
                add(4.0 * (u - 0.22), 'Uridine content', (u * 100).toFixed(1) + '% U. Uridine is what the sensors read and what the modified base replaces.');

                if (ctx.nucleoside && ctx.nucleoside !== 'unmodified') add(-1.8, 'Modified nucleoside', ctx.nucleoside + ' substantially reduces TLR and RIG-I activation.');
                else add(+0.6, 'Unmodified uridine', 'No nucleoside modification, so nothing is damping the sensors.');

                if (ctx.capType === 'cap0') add(+0.8, 'Cap 0', 'IFIT1 binds Cap 0 and blocks its translation.');
                if (ctx.architecture && ctx.architecture !== 'conventional') {
                    add(+1.6, 'Replicon architecture', 'A replicating RNA makes double-stranded intermediates, which MDA5 and PKR read. '
                        + 'This is intrinsic to amplification and cannot be designed away.');
                }
                const polyU = (cds.match(/TTTTT+/g) || []).length;
                if (polyU) add(+0.2 * Math.min(4, polyU), 'Poly(U) tracts', polyU + ' run(s).');

                return { value: Math.round(squash(x)), contributions: c, confidence: 'low',
                    explanation: 'Relative. Read it alongside what the construct is for: a vaccine may want this number high.' };
            }
        });

        return {
            KINDS: KINDS,
            register: register, registerRemote: registerRemote, unregister: unregister,
            has: has, get: get, list: list, supersededIds: supersededIds,
            run: run, runAll: runAll
        };
    })();
}
