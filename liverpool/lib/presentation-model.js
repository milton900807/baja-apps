function () {

    // TRAINED MHC CLASS I PRESENTATION, IN THE BROWSER.
    //
    // WHAT THIS IS. A gradient-boosted model trained on IEDB mass-spectrometry eluted
    // ligands against length-matched decoys drawn from the human proteome: 3.8 million
    // class I examples over 134 alleles, scoring 0.959 AUROC on held-out source proteins.
    // It replaces the hand-built anchor-motif screen in hla.js, which covers 19 alleles
    // and describes 8 of them as weak.
    //
    // WHAT IT IS NOT. It predicts PRESENTATION -- whether a peptide is displayed on the
    // surface -- not immunogenicity. Whether a T cell then responds is a different and
    // much harder question that this model does not answer, and the module is careful
    // never to claim it does. See the whitepaper in liverpool/model/README.md.
    //
    // WHY IT RUNS HERE AND NOT ON THE SERVER. The server has numpy and nothing else: no
    // lightgbm, no torch, no GPU. So the trees ship as JSON and are walked here. That
    // also keeps the work off the shared python bridge, which runs six jobs site-wide
    // for every user at once. Scoring a few thousand peptides is a few million
    // comparisons, which the browser does in well under a second.
    //
    // HOW IT PLUGS IN. hla.js already has the seam: setExternalPredictor(fn). This
    // registers there, and every failure path falls back to the motif screen with
    // `source` on each row saying which engine produced the number. Nothing here is
    // allowed to break a design.

    const AAS = 'ACDEFGHIKLMNPQRSTVWY';
    const FRAME = 9;            // class I peptides are scored on a 9-slot groove frame
    const PSEUDO_LEN = 34;      // the groove contact residues
    const LENGTHS = [8, 9, 10, 11];
    const NFEAT = FRAME * 20 + LENGTHS.length + PSEUDO_LEN * 20;   // 864
    const ASSET_DIR = 'liverpool/model';

    // Class II is a separate model with a separate feature layout, because the groove is
    // open at both ends: only a 9-residue core sits in the cleft and the rest of the
    // peptide hangs out. The core's position is not recorded anywhere, so every register
    // is scored and the best one wins.
    const CORE = 9, FLANK = 3;
    const NFEAT2 = CORE * 20 + 2 * FLANK * 20 + 3 + PSEUDO_LEN * 20;   // 983

    let MODEL = null, ALLELES = null, BG = null, BL = null;
    let MODEL2 = null, ALLELES2 = null, BG2 = null, BL2 = null;
    let loadingPromise = null, lastError = null;

    // ---- assets ---------------------------------------------------------------------
    // Served by the app's own /script route, the same one that hands out lionscript
    // modules. It returns {rule_value: "<file text>"}, and leaves a name alone when it
    // already carries an extension.
    const fetchAsset = async (file) => {
        const url = '/script?spath=' + encodeURIComponent(ASSET_DIR) +
            '&rule_name=' + encodeURIComponent(file);
        const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' loading ' + file);
        const j = await r.json();
        if (!j || typeof j.rule_value !== 'string') throw new Error('no content for ' + file);
        return JSON.parse(j.rule_value);
    };

    const load = async () => {
        if (MODEL) return true;
        if (loadingPromise) return loadingPromise;
        loadingPromise = (async () => {
            const [m, a, b] = await Promise.all([
                fetchAsset('presentation-model.json'),
                fetchAsset('presentation-alleles.json'),
                fetchAsset('presentation-bg.json')
            ]);
            if (!m || !Array.isArray(m.trees) || !m.blosum62) throw new Error('model file is not usable');
            if (m.feature_spec && m.feature_spec.n_features !== NFEAT) {
                throw new Error('model expects ' + m.feature_spec.n_features +
                    ' features, this scorer builds ' + NFEAT);
            }
            MODEL = m; ALLELES = a; BG = b; BL = m.blosum62;

            // Class II is optional. If its files are absent or unusable the class I path
            // still works and class II peptides keep going to the motif screen, which is
            // what they did before this model existed.
            try {
                const [m2, a2, b2] = await Promise.all([
                    fetchAsset('classii-model.json'),
                    fetchAsset('classii-alleles.json'),
                    fetchAsset('classii-bg.json')
                ]);
                if (m2 && Array.isArray(m2.trees) && m2.blosum62
                    && m2.feature_spec && m2.feature_spec.n_features === NFEAT2) {
                    MODEL2 = m2; ALLELES2 = a2; BG2 = b2; BL2 = m2.blosum62;
                }
            } catch (e) { /* class I alone is a complete, useful result */ }
            return true;
        })();
        try {
            return await loadingPromise;
        } catch (e) {
            lastError = e; MODEL = null;
            throw e;
        } finally {
            loadingPromise = null;
        }
    };

    // ---- the 9-slot frame -------------------------------------------------------------
    // The same assumption hla.js makes in coreMap: a peptide of any length 8-11 binds the
    // groove with its anchors at the same ends, so the first four residues and the last
    // four keep their slots and whatever lies between is a bulge. Slot 5 takes the middle
    // of the bulge; an 8-mer has none, so slot 5 is a gap and scores zero.
    const frame9 = (pep) => {
        const L = pep.length;
        if (L === FRAME) return pep;
        const out = new Array(FRAME).fill('-');
        const n = Math.min(4, L);
        for (let i = 0; i < n; i++) out[i] = pep[i];
        for (let i = 0; i < n; i++) out[8 - i] = pep[L - 1 - i];
        if (L > FRAME) out[4] = pep[4 + ((L - FRAME) >> 1)];
        return out.join('');
    };

    // ---- features ---------------------------------------------------------------------
    // BLOSUM62 rows for the nine frame slots, a length one-hot, then BLOSUM62 rows for the
    // 34 groove residues. Exactly the order the exporter recorded in feature_spec.
    const peptideBlock = (pep, out) => {
        const f = frame9(pep);
        for (let j = 0; j < FRAME; j++) {
            const row = BL[f[j]];
            if (!row) continue;                       // a gap or a non-standard residue
            const base = j * 20;
            for (let k = 0; k < 20; k++) out[base + k] = row[k];
        }
        const li = LENGTHS.indexOf(pep.length);
        if (li >= 0) out[FRAME * 20 + li] = 1;
    };

    const grooveBlock = (groove, out) => {
        const base0 = FRAME * 20 + LENGTHS.length;
        for (let j = 0; j < PSEUDO_LEN; j++) {
            const row = BL[groove[j]];
            if (!row) continue;
            const base = base0 + j * 20;
            for (let k = 0; k < 20; k++) out[base + k] = row[k];
        }
    };

    // ---- the ensemble --------------------------------------------------------------------
    // Nodes are {f: feature, t: threshold, l, r} and leaves {v: value}; go left when the
    // feature is <= the threshold, which is LightGBM's numeric convention.
    const walk = (node, x) => {
        while (node.f !== undefined) node = (x[node.f] <= node.t) ? node.l : node.r;
        return node.v;
    };

    const rawScore = (x) => {
        const trees = MODEL.trees;
        let s = 0;
        for (let i = 0; i < trees.length; i++) s += walk(trees[i], x);
        return s;
    };

    const sigmoid = (z) => 1 / (1 + Math.exp(-z));

    // ---- score to %rank -------------------------------------------------------------------
    // BG holds, per allele and length, the score at each of a set of percentiles of a
    // natural-peptide background, descending. A %rank of 0.5 means the peptide scores
    // above 99.5% of random peptides of that length for that allele, which is the
    // convention the rest of the module already uses for its bands.
    const rankOf = (allele, len, score) => {
        const perA = BG && BG.alleles && BG.alleles[allele];
        const arr = perA && perA[String(len)];
        const pcts = BG && BG.percentiles;
        if (!arr || !pcts || !arr.length) return null;
        if (score >= arr[0]) return pcts[0];
        for (let i = 1; i < arr.length; i++) {
            if (score >= arr[i]) {
                // interpolate in log space: the grid is dense near 0.01 and coarse near 100
                const hi = arr[i - 1], lo = arr[i];
                const f = (hi === lo) ? 0 : (hi - score) / (hi - lo);
                const a = Math.log10(pcts[i - 1]), b = Math.log10(pcts[i]);
                return Math.pow(10, a + f * (b - a));
            }
        }
        return 100;
    };

    // ---- class II: one feature row per 9-mer register --------------------------------------
    // Layout, matching the exporter exactly: the core, then three flanking residues on
    // each side nearest-first, then how much peptide hangs off each end and its overall
    // length, then the groove. Flanks matter: class II binding is measurably affected by
    // what sits outside the cleft, not only by the nine residues inside it.
    const registerRow = (pep, off, out) => {
        const L = pep.length;
        out.fill(0, 0, CORE * 20 + 2 * FLANK * 20 + 3);
        for (let j = 0; j < CORE && off + j < L; j++) {
            const row = BL2[pep[off + j]];
            if (!row) continue;
            for (let k = 0; k < 20; k++) out[j * 20 + k] = row[k];
        }
        const nb = CORE * 20;
        for (let j = 0; j < FLANK; j++) {
            const i = off - 1 - j;
            if (i < 0) break;
            const row = BL2[pep[i]];
            if (!row) continue;
            for (let k = 0; k < 20; k++) out[nb + j * 20 + k] = row[k];
        }
        const cb = nb + FLANK * 20;
        for (let j = 0; j < FLANK; j++) {
            const i = off + CORE + j;
            if (i >= L) break;
            const row = BL2[pep[i]];
            if (!row) continue;
            for (let k = 0; k < 20; k++) out[cb + j * 20 + k] = row[k];
        }
        const b3 = cb + FLANK * 20;
        out[b3] = Math.min(off, 9) / 9;
        out[b3 + 1] = Math.min(L - off - CORE, 9) / 9;
        out[b3 + 2] = Math.min(L, 30) / 30;
    };

    const walk2 = (node, x) => {
        while (node.f !== undefined) node = (x[node.f] <= node.t) ? node.l : node.r;
        return node.v;
    };

    const binFor = (L) => {
        const bins = (BG2 && BG2.bins) || [];
        for (const b of bins) {
            const m = /^(\d+)-(\d+)$/.exec(b);
            if (m && L >= +m[1] && L <= +m[2]) return b;
        }
        return bins.length ? (L < 11 ? bins[0] : bins[bins.length - 1]) : null;
    };

    const rankOf2 = (allele, len, sc) => {
        const perA = BG2 && BG2.alleles && BG2.alleles[allele];
        const arr = perA && perA[binFor(len)];
        const pcts = BG2 && BG2.percentiles;
        if (!arr || !pcts || !arr.length) return null;
        if (sc >= arr[0]) return pcts[0];
        for (let i = 1; i < arr.length; i++) {
            if (sc >= arr[i]) {
                const hi = arr[i - 1], lo = arr[i];
                const f = (hi === lo) ? 0 : (hi - sc) / (hi - lo);
                const a = Math.log10(pcts[i - 1]), b = Math.log10(pcts[i]);
                return Math.pow(10, a + f * (b - a));
            }
        }
        return 100;
    };

    const groove2For = (allele) => {
        const e = ALLELES2 && ALLELES2[allele];
        return e ? (typeof e === 'string' ? e : e.g) : null;
    };
    const trainedOn2 = (allele) => {
        const e = ALLELES2 && ALLELES2[allele];
        return !!(e && typeof e === 'object' && e.t === 1);
    };

    const scoreII = (allele, peptides) => {
        if (!MODEL2) return null;
        const groove = groove2For(allele);
        if (!groove || groove.length !== PSEUDO_LEN) return null;

        const x = new Float64Array(NFEAT2);
        const gbase = CORE * 20 + 2 * FLANK * 20 + 3;
        for (let j = 0; j < PSEUDO_LEN; j++) {          // the groove never changes
            const row = BL2[groove[j]];
            if (!row) continue;
            for (let k = 0; k < 20; k++) x[gbase + j * 20 + k] = row[k];
        }
        const trees = MODEL2.trees;
        const src = 'presentation-model-II';
        const conf = trainedOn2(allele) ? 'trained' : 'pan-allele';
        const minL = (MODEL2.feature_spec && MODEL2.feature_spec.min_len) || 9;
        const maxL = (MODEL2.feature_spec && MODEL2.feature_spec.max_len) || 30;

        const out = [];
        for (let i = 0; i < peptides.length; i++) {
            const pep = ('' + peptides[i]).toUpperCase();
            if (pep.length < minL || pep.length > maxL
                || /[^ACDEFGHIKLMNPQRSTVWY]/.test(pep)) {
                out.push({ peptide: pep, score: 0, rank: 100, core: pep, offset: 0,
                           source: src, confidence: conf });
                continue;
            }
            // Every register, best one wins. The winning core is reported so a user can
            // see which nine residues the number is actually about.
            const last = Math.max(0, pep.length - CORE);
            let bestRaw = -Infinity, bestOff = 0;
            for (let off = 0; off <= last; off++) {
                registerRow(pep, off, x);
                let sRaw = 0;
                for (let t = 0; t < trees.length; t++) sRaw += walk2(trees[t], x);
                if (sRaw > bestRaw) { bestRaw = sRaw; bestOff = off; }
            }
            const s = 1 / (1 + Math.exp(-bestRaw));
            const r = rankOf2(allele, pep.length, s);
            out.push({
                peptide: pep, score: s, rank: (r == null ? 100 : r),
                core: pep.substr(bestOff, CORE), offset: bestOff,
                source: src, confidence: conf
            });
        }
        return out;
    };

    // ---- the public call -------------------------------------------------------------------
    const supports = (allele) => !!((ALLELES && ALLELES[allele]) || (ALLELES2 && ALLELES2[allele]));
    const grooveFor = (allele) => {
        const e = ALLELES && ALLELES[allele];
        return e ? (typeof e === 'string' ? e : e.g) : null;
    };
    // An allele the model actually trained on, as against one scored purely from the
    // similarity of its groove to alleles it did see. Both are legitimate -- that is what
    // a pan-allele model is for -- but the report should not pretend they are the same.
    const wasTrainedOn = (allele) => {
        const e = ALLELES && ALLELES[allele];
        return !!(e && typeof e === 'object' && e.t === 1);
    };

    // The exact vector handed to the trees. Exposed so verify_browser_scorer.js can diff
    // it against the python side index by index: when the two languages disagree this is
    // the first thing worth looking at, and guessing is slower than checking.
    const featuresFor = (allele, pep) => {
        const groove = grooveFor(allele);
        if (!groove) return null;
        const x = new Float64Array(NFEAT);
        grooveBlock(groove, x);
        peptideBlock(('' + pep).toUpperCase(), x);
        return x;
    };

    // score(allele, peptides) -> [{peptide, score, rank}] or null when the allele is not
    // covered. Returning null is the signal hla.js uses to fall back to the motif screen.
    const score = (allele, peptides) => {
        // Class II first: an allele is in one table or the other, never both.
        if (ALLELES2 && ALLELES2[allele]) return scoreII(allele, peptides);
        if (!MODEL) return null;
        const groove = grooveFor(allele);
        if (!groove || groove.length !== PSEUDO_LEN) return null;

        const x = new Float64Array(NFEAT);
        grooveBlock(groove, x);                       // constant across the whole list
        const peptideWidth = FRAME * 20 + LENGTHS.length;
        const src = 'presentation-model';
        const conf = wasTrainedOn(allele) ? 'trained' : 'pan-allele';

        const out = [];
        for (let i = 0; i < peptides.length; i++) {
            const pep = ('' + peptides[i]).toUpperCase();
            if (pep.length < 8 || pep.length > 11 || /[^ACDEFGHIKLMNPQRSTVWY]/.test(pep)) {
                out.push({ peptide: pep, score: 0, rank: 100, source: src, confidence: conf });
                continue;
            }
            x.fill(0, 0, peptideWidth);               // only the peptide block changes
            peptideBlock(pep, x);
            const s = sigmoid(rawScore(x));
            const r = rankOf(allele, pep.length, s);
            out.push({
                peptide: pep, score: s, rank: (r == null ? 100 : r),
                source: src, confidence: conf
            });
        }
        return out;
    };

    // The function hla.js wants: (allele, peptides) -> [{rank, score}], same length as the
    // input, or anything else to make it fall back.
    const predictor = async (allele, peptides) => {
        if (!MODEL) {
            try { await load(); } catch (e) { return null; }
        }
        return score(allele, peptides);
    };

    // Register with hla.js. Returns false when the assets will not load, leaving the
    // motif screen in place: a design is never blocked on this model being available.
    const install = async (HLA) => {
        if (!HLA || typeof HLA.setExternalPredictor !== 'function') return false;
        try {
            await load();
        } catch (e) {
            lastError = e;
            return false;
        }
        HLA.setExternalPredictor(predictor);
        return true;
    };

    const info = () => {
        if (!MODEL) return { loaded: false, error: lastError ? ('' + lastError.message) : null };
        const names = Object.keys(ALLELES || {});
        return {
            loaded: true,
            format: MODEL.format, trained: MODEL.trained,
            trees: MODEL.n_trees, features: NFEAT,
            alleles: names.length,
            trainedAlleles: names.filter(wasTrainedOn).length,
            task: MODEL.task,
            classII: MODEL2 ? {
                trees: MODEL2.n_trees, features: NFEAT2,
                alleles: Object.keys(ALLELES2 || {}).length,
                trainedAlleles: Object.keys(ALLELES2 || {}).filter(trainedOn2).length
            } : null
        };
    };

    return {
        load: load, install: install, predictor: predictor, score: score,
        supports: supports, wasTrainedOn: wasTrainedOn, info: info,
        featuresFor: featuresFor, scoreII: scoreII,
        frame9: frame9, rankOf: rankOf,
        get lastError() { return lastError; }
    };
}
