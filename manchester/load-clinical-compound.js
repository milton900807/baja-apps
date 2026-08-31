function (graph, layout, compound) {

    // Load a clinical compound (from the Clinical Library) onto the canvas:
    //   1. map its per-residue sugar_by_position / linkage_by_position tokens to monomer symbols
    //      (deterministically via Biopolymer.mapMonomerSymbol; AI fallback for unknown tokens),
    //   2. build the HELM structure (RNA1 for a single strand; RNA1|RNA2 for a siRNA duplex),
    //   3. create a Track carrying the compound's base sequence, and drop the chemistry-annotated
    //      compound (Oligo / SIRNA) on top of that sequence.

    return (async () => {
        const say = (m) => { try { graph.setMessage('' + m); } catch (e) { } };
        // Reset/clear the toolbar panel and show a sunset "loading…" notice while the compound loads.
        try { if (typeof CurrentLayout !== 'undefined' && CurrentLayout.clearComponent) CurrentLayout.clearComponent('buttonMenuPanel|labelPanel'); } catch (e) { }
        try { if (graph.setSunsetMessage) graph.setSunsetMessage(' Loading ' + ('' + (compound && (compound.name || compound.compound_id) || 'compound')) + '… '); } catch (e) { }
        const Track = (await exec('baja/bio/track.js')).Track;
        const Oligo = await exec('flexigraph/oligo.js');
        const SIRNA = await exec('flexigraph/sirna.js');
        const Biopolymer = await exec('baja/chem/biopolymer.js');

        // ---- 1) Parse strands -----------------------------------------------------------
        const splitStrands = (s) => ('' + (s == null ? '' : s)).split('|').map((x) => x.trim()).filter((x) => x.length);
        const seqStrands = splitStrands(compound.sequence_5to3).map((s) => s.replace(/\s+/g, '').toUpperCase());
        const sugStrands = splitStrands(compound.sugar_by_position).map((s) => s.split(/\s+/).filter(Boolean));
        const lnkStrands = splitStrands(compound.linkage_by_position).map((s) => s.split(/\s+/).filter(Boolean));
        if (!seqStrands.length) { say(' This compound has no sequence to load. '); return graph; }

        // ---- 2) Token → monomer symbol --------------------------------------------------
        // Deterministic maps for this dataset's tokens; anything not covered is tried through the
        // library alias resolver, and if still unresolved is recorded for the AI pass.
        const SUGAR = { MOE: 'moe', mR: 'm', fR: 'f', dR: 'd', R: 'r', LR: 'lna', lLR: 'lna', 'H-LR': 'lna', cEtR: 'cet' };
        const LINK = { P: 'p', sP: 'sp', sP_Sp: 'sp', sP_Rp: 'sp', sP3_Sp: 'sp', pP: 'p' };
        const unknown = {};
        const valid = (m) => { try { return Biopolymer.isValidMonomer(m); } catch (e) { return true; } };
        const mapSugar = (tok) => {
            if (SUGAR[tok]) return SUGAR[tok];
            let m = Biopolymer.mapMonomerSymbol(('' + tok).replace(/R$/, ''), 'sugar'); if (valid(m)) return m;
            m = Biopolymer.mapMonomerSymbol(tok, 'sugar'); if (valid(m)) return m;
            unknown['sugar:' + tok] = 1; return 'r';   // safe fallback (RNA) so the structure still renders
        };
        const mapLink = (tok) => {
            if (LINK[tok]) return LINK[tok];
            let m = Biopolymer.mapMonomerSymbol(tok, 'linker'); if (valid(m)) return m;
            unknown['link:' + tok] = 1; return 'p';     // safe fallback (PO)
        };
        const br = (s) => (('' + s).length > 1 ? '[' + s + ']' : s);
        const buildStrand = (bases, sugars, links) => {
            const n = bases.length; const toks = [];
            for (let i = 0; i < n; i++) {
                let t = br(mapSugar(sugars[i] || 'R')) + '(' + bases[i] + ')';
                if (i < n - 1) t += br(mapLink(links[i] || 'P'));   // linkage FOLLOWS the residue; none after the 3' end
                toks.push(t);
            }
            return toks.join('.');
        };

        const isDuplex = seqStrands.length >= 2;
        const strandHelms = seqStrands.map((seq, si) => buildStrand(seq.split(''), sugStrands[si] || [], lnkStrands[si] || []));
        // Normalize each strand's tokens SEPARATELY — normalizeStructure treats the whole string as
        // one {...} wrapper, so a combined RNA1{…}|RNA2{…} duplex gets mangled at the boundary
        // ("}|[RNA2{m](C)…"). Wrap each strand as its own RNA1{…}, normalize, then extract the body.
        const normTokens = (toks) => {
            try {
                const n = Biopolymer.normalizeStructure('RNA1{' + toks + '}$$$$');
                const m = ('' + n).match(/\{([^}]*)\}/);
                return m ? m[1] : toks;
            } catch (e) { return toks; }
        };
        let structure = isDuplex
            ? ('RNA1{' + normTokens(strandHelms[0]) + '}|RNA2{' + normTokens(strandHelms[1]) + '}$$$$')
            : ('RNA1{' + normTokens(strandHelms[0]) + '}$$$$');

        // ---- 3) AI fallback for unresolved tokens (uses the monomer library) ------------
        const unknownList = Object.keys(unknown);
        if (unknownList.length) {
            say(' Mapping novel chemistry with AI… ');
            try {
                const monomers = await exec('baja/chem/monomers.js');
                const monomersStr = JSON.stringify(monomers);
                const em = (typeof getUser === 'function') ? (getUser() || '') : '';
                const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
                const prompt = 'Clinical oligonucleotide "' + (compound.name || compound.compound_id || '') + '" (' + (compound.modality || '') + '). '
                    + 'Annotated sequence: ' + (compound.annotated_sequence || '') + '. '
                    + 'Chemistry summary: ' + (compound.chemistry_summary || '') + '. '
                    + 'Per-residue sugars: ' + (compound.sugar_by_position || '') + '. Per-linkage: ' + (compound.linkage_by_position || '') + '. '
                    + 'The starting HELM approximates unresolved residues; correct EVERY residue to the right library monomer, '
                    + 'preserving bases and strand order. Unresolved tokens: ' + unknownList.join(', ') + '.';
                const refined = await exec(host + '/py/sequence/design-helm-chemistry.py', em, structure, prompt, monomersStr);
                if (refined && refined.helm && ('' + refined.helm).indexOf('{') >= 0) {
                    // Use the AI's HELM directly (it's already library-valid). Do NOT run it through
                    // normalizeStructure — that mangles an RNA1{…}|RNA2{…} duplex at the boundary.
                    structure = '' + refined.helm;
                }
            } catch (e) { /* keep the deterministic structure */ }
        }

        // ---- 4) Build the track (the TARGET sequence) + drop the compound on top ----------
        // The track shows the TARGET the compound binds — the reverse-complement of the compound's
        // SYNTHESIS sequence (the ASO/guide). The compound (its own antisense chemistry) sits on top.
        const rawName = (compound.name || compound.compound_id || 'compound');
        const trackName = ('' + rawName).replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
        const compoundSeq = seqStrands[0];                                  // the compound's own first strand
        const synthSeq = isDuplex ? (seqStrands[1] || seqStrands[0]) : compoundSeq;   // guide (antisense) / ASO
        const revComp = (s) => ('' + s).toUpperCase().replace(/U/g, 'T').split('').reverse().map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b] || 'N')).join('');
        const toDNA = (s) => ('' + (s || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');

        let t = null, xi = 0, xf = 0, onTarget = false;

        // ---- 4a) Preferred: load the REAL target and map the compound onto it ------------
        // target_gene is only set when the compound's own sequence matched the human
        // pre-mRNA / cDNA index exactly (see py/clinical/annotate-clinical-targets.py), so
        // the binding site is guaranteed to exist somewhere — but not necessarily on the
        // single transcript that gets loaded here (a pre-mRNA-only hit lives in an intron
        // the cDNA transcript does not carry). If we can't find the site we fall back to
        // the compound-only track below rather than dropping it at an arbitrary position.
        const targetGene = ('' + (compound.target_gene || '')).trim();

        // If the target is ALREADY on the board, drop the compound onto THAT track rather than
        // loading a second copy of the same gene. A candidate must actually contain the binding
        // site — that both proves it is the right target and gives the position in one step. A
        // track that also names the gene wins over one that merely contains the site.
        const findLoadedTarget = (gene) => {
            const g = ('' + gene).toUpperCase();
            const pats = [revComp(synthSeq), toDNA(synthSeq)].filter(Boolean);
            let named = null, any = null;
            for (const x of (graph.track || [])) {
                if (!x || !x.sequence) continue;
                if (x.track_type === 'clincial_compound') continue;   // a previous compound-only track
                const seq = toDNA(x.sequence);
                let at = -1;
                for (const pat of pats) { const k = seq.indexOf(pat); if (k >= 0) { at = k; break; } }
                // Same stored-offset fallback as the freshly-loaded path, but only for a track
                // that NAMES the gene — an offset from another transcript is meaningless on an
                // unrelated track that merely happens to be loaded.
                if (at < 0) {
                    const namesGene = [x.name, x.geneID, x.description].some((v) => {
                        const h = ('' + (v || '')).toUpperCase();
                        return h === g || h.split(/[^A-Z0-9]+/).indexOf(g) >= 0;
                    });
                    const stored = +compound.target_site;
                    if (namesGene && Number.isFinite(stored) && stored >= 0
                        && stored + toDNA(synthSeq).length <= seq.length) {
                        named = named || { track: x, at: stored };
                    }
                    continue;
                }
                // Word-split rather than a built regex: a symbol can carry characters that would
                // otherwise need escaping.
                const isNamed = [x.name, x.geneID, x.description].some((v) => {
                    const h = ('' + (v || '')).toUpperCase();
                    return h === g || h.split(/[^A-Z0-9]+/).indexOf(g) >= 0;
                });
                if (isNamed && !named) named = { track: x, at: at };
                else if (!any) any = { track: x, at: at };
            }
            return named || any;
        };

        // ---- 4a-i) Site lives only in the SPLICED cDNA -----------------------------------
        // /transcript always serves the unspliced pre-mRNA and has no override, so a
        // junction-spanning site (verify-target-transcripts.py marks these target_form
        // 'cdna') is absent from it. Build the track from the spliced sequence instead —
        // its coordinates match the recorded target_site exactly.
        if (targetGene && ('' + (compound.target_form || '')) === 'cdna' && compound.target_transcript) {
            try {
                const tid = '' + compound.target_transcript;
                say(' Loading ' + targetGene + ' (' + tid + ', spliced)… ');
                const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
                const raw = await GETXT(host + '/api/ensembl/sequence/' + encodeURIComponent(tid));
                const cdna = toDNA(raw);
                if (cdna && cdna.length > 20) {
                    let at = -1;
                    for (const pat of [revComp(synthSeq), toDNA(synthSeq)]) {
                        if (!pat) continue;
                        const k = cdna.indexOf(pat);
                        if (k >= 0) { at = k; break; }
                    }
                    if (at < 0 && Number.isFinite(+compound.target_site)) at = +compound.target_site;
                    if (at >= 0 && at + toDNA(synthSeq).length <= cdna.length) {
                        const nm = targetGene + ' (' + tid + ' mRNA)';
                        try { t = graph.createTrack(nm, 0, cdna.length, 1); }
                        catch (e) { t = new Track(nm, 0, cdna.length, 2, 1); try { graph.addTrack(t); } catch (e2) { } }
                        try { if (t.setSequence) t.setSequence(cdna); else t.sequence = cdna; } catch (e) { t.sequence = cdna; }
                        onTarget = true;
                        xi = t.xi + at;
                        xf = xi + (toDNA(synthSeq).length || 1);
                        // Spliced: no genomic annotations apply, so this carries sequence only.
                        say(' ' + rawName + ' placed on the spliced ' + targetGene + ' mRNA (no genomic annotations). ');
                    }
                }
            } catch (e) { }
            if (!onTarget) say(' Could not load the spliced ' + targetGene + ' mRNA — falling back. ');
        }

        if (targetGene && !onTarget) {
            const already = findLoadedTarget(targetGene);
            if (already) {
                t = already.track;
                onTarget = true;
                xi = t.xi + already.at;
                xf = xi + (toDNA(synthSeq).length || 1);
                say(' Adding ' + rawName + ' to the loaded ' + (t.name || targetGene) + ' track. ');
            }
        }
        if (targetGene && !onTarget) {
            try {
                // Prefer the PRECOMPUTED transcript. It is taken from the accession that
                // actually carried the binding site and is checked against the server's local
                // reference ahead of time (py/clinical/verify-target-transcripts.py), so the
                // click path needs no lookup at all. The resolver below stays only as a
                // fallback for a compound annotated before the index existed — it calls out
                // to the Anthropic API and is exactly the realtime failure this avoids.
                let id = ('' + (compound.target_transcript || '')).trim() || targetGene;
                const TX_RE = /^(ENS[A-Z]*T\d|N[MR]_|X[MR]_)/i;
                if (!TX_RE.test(id)) {
                    say(' Resolving ' + targetGene + ' → transcript… ');
                    const em = (typeof EngineMonitor !== 'undefined') ? new EngineMonitor((m) => { try { graph.setMessage('' + m); } catch (e) { } }) : null;
                    const res = em ? await exec('/py/sequence/prompt-to-transcript.py', em, id, 'human')
                        : await exec('/py/sequence/prompt-to-transcript.py', id, 'human');
                    let list = [];
                    try { list = JSON.parse(res && res.transcripts); } catch (e) { list = (res && Array.isArray(res.transcripts)) ? res.transcripts : []; }
                    if (Array.isArray(list) && list.length && list[0]) id = (list[0].id || list[0].transcript || list[0]) + '';
                }
                if (TX_RE.test(id)) {
                    say(' Loading target ' + targetGene + ' (' + id + ')… ');
                    const before = new Set((graph.track || []));
                    let cand = null;
                    try { cand = await graph.add(id, 10, 10); } catch (e) { }
                    // graph.add may resolve a track, the graph, or nothing — find what appeared.
                    if (!cand || !cand.sequence) {
                        const added = (graph.track || []).filter((x) => x && !before.has(x));
                        cand = added.length ? added[added.length - 1] : null;
                    }
                    if (cand && cand.sequence) {
                        // The compound binds the reverse complement of its synthesis strand.
                        // Targets were confirmed at edit distance 0, so an exact search is enough.
                        const tseq = toDNA(cand.sequence);
                        let at = -1;
                        for (const pat of [revComp(synthSeq), toDNA(synthSeq)]) {
                            if (!pat) continue;
                            const k = tseq.indexOf(pat);
                            if (k >= 0) { at = k; break; }
                        }
                        // No exact site on this isoform. verify-target-transcripts.py already
                        // located it by widening the edit distance and stored the offset, so use
                        // that rather than leaving the compound unplaceable. Bounds-checked in
                        // case the served sequence has moved since the index was built.
                        if (at < 0 && Number.isFinite(+compound.target_site)) {
                            const stored = +compound.target_site;
                            if (stored >= 0 && stored + toDNA(synthSeq).length <= tseq.length) {
                                at = stored;
                                const mm = +compound.target_site_mismatches || 0;
                                if (mm) say(' Binding site for ' + rawName + ' on ' + targetGene + ' has ' + mm + (mm === 1 ? ' mismatch' : ' mismatches') + '. ');
                            }
                        }
                        if (at >= 0) {
                            t = cand; onTarget = true;
                            xi = cand.xi + at;
                            xf = xi + (toDNA(synthSeq).length || 1);
                        }
                    }
                }
            } catch (e) { }
            if (!onTarget) say(' No binding site for ' + rawName + ' on ' + targetGene + ' — loading the compound on its own. ');
        }

        // ---- 4b) Fallback (and the no-target case): the compound's own target sequence ----
        if (!t) {
            const trackSeq = revComp(synthSeq);                            // the TARGET (reverse-complement of the synthesis sequence)
            try { t = graph.createTrack(trackName, 0, trackSeq.length, 1); } catch (e) { t = new Track(trackName, 0, trackSeq.length, 2, 1); try { graph.addTrack(t); } catch (e2) { } }
            try { if (t.setSequence) t.setSequence(trackSeq); else t.sequence = trackSeq; } catch (e) { t.sequence = trackSeq; }
            // Mark this as a clinical-compound track: the renderer suppresses direction arrows,
            // genomic/cDNA coordinate tags and annotations for this type (see baja/bio/track.js).
            // A real transcript track must NOT be marked this way — it needs its coordinates.
            try { t.track_type = 'clincial_compound'; } catch (e) { }
            xi = t.xi;
            xf = t.xi + trackSeq.length;
        }

        const yLane = (t.tgraph && t.tgraph.ymax != null) ? (t.tgraph.ymax - 0.2) : ((t.y || 0) + 0.5);

        let compoundObj = null;
        try {
            if (isDuplex) {
                const sense = seqStrands[0], antisense = seqStrands[1];
                compoundObj = new SIRNA('siRNA', antisense, sense, antisense, xi, xf, yLane, t.strand || 1, structure);
                compoundObj.sequence = sense;
                compoundObj.sense = sense;
                compoundObj.antisense = antisense;
                compoundObj.synthesisSequence = antisense;
                compoundObj.structure = structure;
            } else {
                const asoType = (/gapmer/i.test('' + (compound.aso_subtype || compound.architecture || ''))) ? 'gapmer' : 'aso';
                compoundObj = new Oligo(asoType, compoundSeq, structure, xi, xf, yLane);   // the ASO's OWN sequence
                compoundObj.synthesisSequence = compoundSeq;
                compoundObj.strand = t.strand || 1;
                compoundObj.structure = structure;
            }
            compoundObj.name = trackName;
            compoundObj.comment = (compound.chemistry_summary || '') + (compound.indications ? ('\nIndication: ' + compound.indications) : '');
            try { t.addOligo(compoundObj); compoundObj.__track = t; } catch (e) { }
        } catch (e) { say(' Could not build the compound: ' + (e && e.message ? e.message : e)); }

        // ---- 5) Frame: let the new track settle for 2s, then VIEW ALL and finally zoom
        //         INTO the compound.
        try { graph.setMouseMode('navigate'); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        say(' Loaded ' + trackName + (onTarget ? (' on ' + targetGene) : '') + (unknownList.length ? ' (chemistry AI-mapped)' : '') + '. ');
        const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
        try {
            await sleep(2000);                                  // wait 2s after loading
            if (graph.viewAllTracks) await graph.viewAllTracks();   // view all
            await sleep(500);
            if (onTarget) {
                // zoomToTrack would frame the whole transcript, which on a real gene leaves the
                // compound a few pixels wide — zoom to the binding site itself instead.
                const g = t.tgraph;
                const xpad = Math.max(4, (xf - xi) * 0.25);
                const yA = g ? g.yi : 0, yB = g ? (g.yi + (g.height || 0)) : 1;
                const cy = (yA + yB) / 2, span = Math.abs(yB - yA) || 1, yhalf = span * 1.6;
                if (graph.zoomRect) await graph.zoomRect(xi - xpad, xf + xpad, cy + yhalf, cy - yhalf, 340);
                else if (graph.zoomToTrack) await graph.zoomToTrack(t);
            } else if (graph.zoomToTrack) {
                await graph.zoomToTrack(t);                     // then zoom into the compound
            }
            // Magenta landing burst so it's obvious where the compound landed (visible zoomed out).
            try { if (compoundObj && compoundObj.landingBurst) compoundObj.landingBurst('magenta'); if (graph.wake) graph.wake(); } catch (e) { }
        } catch (e) { }
        return graph;
    })();
}
