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
        let structure = isDuplex
            ? ('RNA1{' + strandHelms[0] + '}|RNA2{' + strandHelms[1] + '}$$$$')
            : ('RNA1{' + strandHelms[0] + '}$$$$');
        try { structure = Biopolymer.normalizeStructure(structure); } catch (e) { }

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
                    structure = Biopolymer.normalizeStructure('' + refined.helm);
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
        const trackSeq = revComp(synthSeq);                                // the TARGET (reverse-complement of the synthesis sequence)
        let t;
        try { t = graph.createTrack(trackName, 0, trackSeq.length, 1); } catch (e) { t = new Track(trackName, 0, trackSeq.length, 2, 1); try { graph.addTrack(t); } catch (e2) { } }
        try { if (t.setSequence) t.setSequence(trackSeq); else t.sequence = trackSeq; } catch (e) { t.sequence = trackSeq; }
        // Mark this as a clinical-compound track: the renderer suppresses direction arrows,
        // genomic/cDNA coordinate tags and annotations for this type (see baja/bio/track.js).
        try { t.track_type = 'clincial_compound'; } catch (e) { }

        const xi = t.xi;
        const xf = t.xi + trackSeq.length;
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
        say(' Loaded ' + trackName + (unknownList.length ? ' (chemistry AI-mapped)' : '') + '. ');
        const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
        try {
            await sleep(2000);                                  // wait 2s after loading
            if (graph.viewAllTracks) await graph.viewAllTracks();   // view all
            await sleep(500);
            if (graph.zoomToTrack) await graph.zoomToTrack(t);      // then zoom into the compound
        } catch (e) { }
        return graph;
    })();
}
