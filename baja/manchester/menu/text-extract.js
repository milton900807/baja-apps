function (graph, genegraph_panel_layout, presetText, presetEntities) {
    // Read text (pasted) OR a set of pre-extracted entities (from a file upload) with ,
    // extract genes / mutations / ASOs, load the appropriate gene tracks (pre-mRNA), map
    // mutations to their Ensembl-resolved genomic positions, map each ASO to its target
    // location, then TOUR the mutations — zoom into each and dwell 3s until the last.
    return new Promise(async (resolve) => {
        const Annotation = await exec('flexigraph/annotation.js');
        const SnpIndel = await exec('flexigraph/snpindel.js');
        const RectangleText = await exec('flexigraph/shapes/Rect-text.js');
        let v = null;   // paste editor widget
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        const showInMainPanel = (comp) => {
            try { CurrentLayout.clearComponent('mainPanel'); CurrentLayout.setComponent('mainPanel', comp); } catch (e) { }
        };
        const showEditorCanvas = () => {
            showInMainPanel((graph && graph.genegraph_panel_layout) || genegraph_panel_layout);
        };

        const revcomp = (s) => {
            const c = { A: 'T', T: 'A', G: 'C', C: 'G' };
            let o = '';
            for (let i = s.length - 1; i >= 0; i--) o += (c[s[i]] || 'N');
            return o;
        };

        const loaded = {};   // geneSymbol(lower) -> track
        let trMap = {};      // geneSymbol(lower) -> real Ensembl transcript id (from step 2)

        const stripV = (x) => ('' + (x || '')).split('.')[0].toUpperCase().trim();
        // Is a track for this transcript/gene already on the canvas? Match by transcript id
        // (or gene id), else by the gene symbol appearing in the track name.
        const findLoadedTrack = (tid, symbol) => {
            const tt = stripV(tid);
            const sym = ('' + (symbol || '')).toLowerCase().trim();
            for (const t of (graph.track || [])) {
                if (!t) continue;
                if (tt && (stripV(t.transcriptID) === tt || stripV(t.id) === tt || stripV(t.geneID) === tt)) return t;
                if (sym && ('' + (t.name || '')).toLowerCase().indexOf(sym) >= 0) return t;
            }
            return null;
        };

        const loadGene = async (symbol, species) => {
            const key = ('' + (symbol || '')).toLowerCase().trim();
            if (!key) return null;
            if (loaded[key]) return loaded[key];
            // Prefer the authoritative Ensembl transcript id resolved server-side (step 2);
            // only fall back to the natural-language resolver if we don't have one.
            let tid = trMap[key] || null;
            if (!tid) {
                const sp = ('' + (species || 'human')).toLowerCase();
                const q = 'canonical ' + symbol + (sp && sp !== 'human' ? ' in ' + sp : '');
                try { window.__workStatus = 'Looking up the ' + symbol + ' gene structure…'; } catch (e) { }
                let em = new EngineMonitor(() => { });
                let res = null;
                try { res = await exec('/py/sequence/prompt-to-transcript.py', em, q); } catch (e) { return null; }
                let list = [];
                try { list = JSON.parse(res.transcripts); } catch (e) { list = []; }
                if (list.length) { const pick = list.find(x => x.canonical) || list[0]; tid = pick && pick.id; }
            }
            if (!tid) return null;
            // Already loaded on the canvas? Reuse it instead of loading it again.
            const existing = findLoadedTrack(tid, symbol);
            if (existing) {
                loaded[key] = existing;
                try { if (existing.select) existing.select(); if (graph.addTrackToSelection) graph.addTrackToSelection(existing); } catch (e) { }
                return existing;
            }
            let track = null;
            try { track = await graph.add(tid, null, null, null); } catch (e) { track = null; }
            if (!track) return null;   // Ensembl id not found -> skip it.
            // A transcript not found locally can come back as an empty shell -> skip + remove.
            const hasContent = (('' + (track.sequence || '')).length > 0)
                || (Array.isArray(track.annotations) && track.annotations.length > 0);
            if (!hasContent) {
                try { if (graph.track) graph.track = graph.track.filter((x) => x !== track); } catch (e) { }
                return null;
            }
            loaded[key] = track;
            try { if (track.select) track.select(); if (graph.addTrackToSelection) graph.addTrackToSelection(track); } catch (e) { }
            try { if (graph._autoLoadDomains) graph._autoLoadDomains(track); } catch (e) { }   // auto protein domains for coding tracks
            return track;
        };

        const placePoint = (track, gi, gf, label, note, color) => {
            const an = new Annotation('PointOfInterest', label, gi, gf, track.strand);
            an.color = color; an.description = note; an.comment = note;
            an.labelY = 0.45 + Math.random() * 0.5;
            track.add(an);
        };

        // Find where an ASO hybridises on the target track's (pre-mRNA) sequence. An antisense
        // oligo matches the reverse-complement of the sense sequence; try sense too as a fallback.
        const mapAso = (track, aso) => {
            const seq = ('' + (track.sequence || '')).toUpperCase().replace(/U/g, 'T');
            const a = ('' + (aso.sequence || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
            if (a.length < 8 || seq.length < a.length) return null;
            let idx = seq.indexOf(revcomp(a)); let orient = 'antisense';
            if (idx < 0) { idx = seq.indexOf(a); orient = 'sense'; }
            if (idx < 0) return null;
            const gi = Math.floor(track.xi) + idx;
            return { gi: gi, gf: gi + a.length, orient: orient };
        };

        // Build the spliced transcript from the track's exon annotations (introns removed),
        // reusing the track's own genomic->sequence indexing so junction bases are exact.
        // Returns { S: splicedSeq, segs:[{gLo, sStart, len}] } or null. Cached on the track.
        const buildSpliced = (track) => {
            if (track.__spliced !== undefined) return track.__spliced;
            let exons = [];
            try {
                for (const an of (track.annotations || [])) {
                    if (('' + (an.type || '')) === 'Exon') {
                        const lo = Math.min(an.xi, an.xf), hi = Math.max(an.xi, an.xf);
                        if (isFinite(lo) && isFinite(hi) && hi > lo) exons.push([Math.floor(lo), Math.floor(hi)]);
                    }
                }
            } catch (e) { }
            if (exons.length < 2) { track.__spliced = null; return null; }
            exons.sort((a, b) => a[0] - b[0]);
            // Collapse overlapping exons (multiple transcripts' exons) into a non-overlapping model.
            let merged = [exons[0].slice()];
            for (let i = 1; i < exons.length; i++) {
                const last = merged[merged.length - 1];
                if (exons[i][0] <= last[1]) last[1] = Math.max(last[1], exons[i][1]);
                else merged.push(exons[i].slice());
            }
            if (merged.length < 2) { track.__spliced = null; return null; }
            let S = '', segs = [], cursor = 0;
            for (const seg of merged) {
                let piece = '';
                try { piece = ('' + track.getSequenceRange(seg[0], seg[1])).toUpperCase().replace(/U/g, 'T'); } catch (e) { piece = ''; }
                if (!piece) continue;
                segs.push({ gLo: seg[0], sStart: cursor, len: piece.length });
                S += piece; cursor += piece.length;
            }
            track.__spliced = (segs.length >= 2) ? { S: S, segs: segs } : null;
            return track.__spliced;
        };

        // Map an ASO that spans an exon-exon junction: search the spliced transcript, then
        // project the spliced match back to (1-2+) genomic intervals across the exons.
        const mapAsoSpliced = (track, aso) => {
            const sp = buildSpliced(track);
            if (!sp || !sp.S) return null;
            const a = ('' + (aso.sequence || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
            if (a.length < 8) return null;
            const cands = [{ seq: a, orient: 'sense' }, { seq: revcomp(a), orient: 'antisense' }];
            for (const c of cands) {
                const idx = sp.S.indexOf(c.seq);
                if (idx < 0) continue;
                const ss = idx, se = idx + c.seq.length;
                let intervals = [];
                for (const g of sp.segs) {
                    const gsEnd = g.sStart + g.len;
                    const os = Math.max(ss, g.sStart), oe = Math.min(se, gsEnd);
                    if (oe > os) intervals.push([g.gLo + (os - g.sStart), g.gLo + (oe - g.sStart)]);
                }
                if (intervals.length) return { intervals: intervals, orient: c.orient };
            }
            return null;
        };

        // Zoom the view to a genomic window on a specific track (mirrors gene.js goToTrackLocus
        // but takes the track object directly so it doesn't depend on track-name matching).
        const goToLocus = async (track, xi, xf) => {
            try {
                const g = graph.graph;          // FlexiGraph
                const tg = track && track.tgraph;
                if (!g || !tg || !tg.X) return;
                if (g.rescale) g.rescale();
                const gi = tg.X(xi), gf = tg.X(xf);
                const wx = 5;
                // Reserve generous vertical room (biased up) so the SNP lollipop — a fixed
                // ~30–150px stem/head/label that pops UP from the track — stays on screen.
                const cy = (tg.yi + (tg.yi + (tg.height || 0))) / 2;
                const span = Math.abs(tg.height || 0) || 0.1;
                const topExt = span * 3.6, botExt = span * 2.2;
                if (graph.zoomRect) {
                    // Smooth animated zoom to each mutation (gene-view method).
                    await graph.zoomRect(gi - wx, gf + wx, cy + topExt, cy - botExt, 500);
                } else {
                    g.setxmin(gi - wx); g.setxmax(gf + wx);
                    g.setymin(cy + topExt); g.setymax(cy - botExt);
                }
                if (graph.wake) graph.wake();
            } catch (e) { }
        };

        // Shared processing: given the extracted entities, load tracks, map mutations + ASOs,
        // then tour each mapped mutation (zoom in, dwell 3s, until the last one).
        const process = async (ex) => {
            // Defer per-track protein-domain auto-load until AFTER all genes + mutations are in,
            // so the CDD lookups don't compete with / slow the primary loading. Fired at the end.
            try { graph.__suppressAutoDomains = true; } catch (e) { }
            const genes = (ex && ex.genes) || [];
            const muts = (ex && ex.mutations) || [];
            const asos = (ex && ex.asos) || [];
            if (!genes.length && !muts.length && !asos.length) {
                graph.setMessage(' No genes, mutations, or ASOs found' + (ex && ex.error ? ' (' + ex.error + ')' : '') + '. ');
                resolve(null); return;
            }

            // Step 2 result: gene symbol -> real Ensembl transcript id (loaded directly).
            trMap = {};
            for (const t of ((ex && ex.geneTranscripts) || [])) {
                if (t && t.gene && t.id) { const k = ('' + t.gene).toLowerCase(); if (!trMap[k]) trMap[k] = t.id; }
            }


            // Union of genes to load: explicit genes + mutation genes + ASO target genes.
            const toLoad = {};
            for (const g of genes) if (g && g.symbol) toLoad[g.symbol.toLowerCase()] = { symbol: g.symbol, species: g.species || 'human' };
            for (const m of muts) if (m && m.gene && !toLoad[m.gene.toLowerCase()]) toLoad[m.gene.toLowerCase()] = { symbol: m.gene, species: m.species || 'human' };
            for (const a of asos) if (a && a.target_gene && !toLoad[a.target_gene.toLowerCase()]) toLoad[a.target_gene.toLowerCase()] = { symbol: a.target_gene, species: a.species || 'human' };

            const gkeys = Object.keys(toLoad);
            let li = 0;
            for (const k of gkeys) {
                const g = toLoad[k];
                graph.setMessage(' Loading the ' + g.symbol + ' gene (' + (++li) + ' of ' + gkeys.length + ')… ');
                try { window.__workStatus = 'Loading the ' + g.symbol + ' gene…'; } catch (e) { }
                await loadGene(g.symbol, g.species);
            }

            // Hand the mouse to hover / mouse-over-highlight once tracks are in.
            try { graph.setMouseMode('navigate'); graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }

            // Mark each mutation as a SnpIndel on every loaded track whose extent spans its
            // genomic locus (variantWorldX -> null when the track doesn't hold it, so each
            // variant lands on its own gene). ref/alt/type come from the variant's HGVS.
            if (muts.length) graph.setMessage(' Marking the variants on the genes… ');
            const SNP_COLOR = '#dc2626';   // red for mutations
            const parseAllele = (m) => {
                const h = ('' + (m.hgvs || m.protein || '')).toUpperCase();
                const sub = h.match(/([ACGT])\s*>\s*([ACGT])/);
                if (sub) return { type: 'snp', ref: sub[1], sequence: sub[2] };
                if (/DELINS|INDEL/.test(h)) return { type: 'delins', ref: 'N', sequence: 'N' };
                if (/DEL/.test(h)) return { type: 'del', ref: 'N', sequence: '-' };
                if (/INS|DUP/.test(h)) return { type: 'ins', ref: '-', sequence: 'N' };
                return { type: 'snp', ref: (m.ref || 'N'), sequence: (m.sequence || 'N') };
            };
            // Map each loaded track back to its gene symbol so we can report how many mutations
            // landed on which genes.
            const trackSym = new Map();
            for (const k of gkeys) if (loaded[k]) trackSym.set(loaded[k], toLoad[k].symbol);
            const perGene = new Map();   // gene symbol -> mutations added

            // A CDS (protein + per-residue genomic codon positions) for each loaded track, cached
            // and shared across the genomic + protein passes below.
            const cdsCache = new Map();
            const getTrackCds = (t) => {
                if (cdsCache.has(t)) return cdsCache.get(t);
                let cds = null;
                try { t.generateORF(); cds = t.getCDS(); } catch (e) { }
                if (!(cds && cds.protein && Array.isArray(cds.codonPos) && cds.codonPos.length)) cds = null;
                cdsCache.set(t, cds);
                return cds;
            };
            // Is this an amino-acid (PEPTIDE) mutation — a protein substitution like p.Arg521Cys
            // / R521C (NOT a frameshift / indel / splice change)?
            const isPeptideMut = (m) => {
                const s = ('' + (m.protein || '')).replace(/^p\.?/i, '').replace(/[()]/g, '').trim();
                if (!s) return false;
                if (/fs|del|ins|dup|frameshift|splice|ext/i.test(s)) return false;
                return /(^|[^A-Za-z])([A-Za-z]{3}|[A-Za-z])\s*\d{1,6}\s*([A-Za-z]{3}|[A-Za-z]|\*)([^A-Za-z]|$)/.test(s);
            };
            // The 3 genomic bases of the codon that contains genomic position `g` on track `t`,
            // so a peptide mutation can HIGHLIGHT THE WHOLE CODON. Returns {lo, codon} or null.
            const codonSpanAt = (t, g) => {
                try {
                    const cds = getTrackCds(t);
                    if (!cds || !Array.isArray(cds.cdsi)) return null;
                    let ci = null;
                    for (const e of cds.cdsi) { if (e && Math.round(e.index) === Math.round(g)) { ci = e.codon_index; break; } }
                    if (ci == null) return null;
                    const idxs = []; let codon = '';
                    for (const e of cds.cdsi) { if (e && e.codon_index === ci) { idxs.push(e.index); if (!codon) codon = ('' + (e.codon || '')).toUpperCase(); } }
                    if (idxs.length !== 3) return null;
                    codon = codon.replace(/[^ACGTUN]/g, '').replace(/U/g, 'T').slice(0, 3);
                    return { lo: Math.min.apply(null, idxs), codon: (codon.length === 3 ? codon : 'NNN') };
                } catch (e) { return null; }
            };
            // Standard genetic code (codon -> 1-letter AA) + the reference amino acid parsed from a
            // peptide nomenclature (the FIRST residue, e.g. G for "G93A" / Gly93Ala). Used to VERIFY
            // that the codon a peptide mutation lands on actually codes for that reference residue —
            // if it does not, the placement is wrong and the mutation must NOT be plotted there.
            const _CODON2AA = {
                TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L', CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
                ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M', GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
                TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S', CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
                ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T', GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
                TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*', CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
                AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K', GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
                TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W', CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
                AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R', GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G'
            };
            const _AA3to1 = {
                ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G',
                HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S',
                THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V', TER: '*', STOP: '*'
            };
            const translateCodon = (c) => _CODON2AA[('' + (c || '')).toUpperCase().replace(/U/g, 'T')] || '';
            // The reference (wildtype) amino acid — the FIRST residue in the nomenclature.
            const peptideRefAA = (m) => {
                const s = ('' + (m.protein || m.hgvs || m.label || '')).replace(/^p\.?/i, '').replace(/[()]/g, '').trim();
                let mm = s.match(/([A-Za-z]{3})\s*\d{1,6}\s*([A-Za-z]{3}|\*)/);
                if (mm && _AA3to1[mm[1].toUpperCase()]) return _AA3to1[mm[1].toUpperCase()];
                mm = s.match(/\b([A-Za-z])\s*\d{1,6}\s*[A-Za-z\*]\b/);
                return mm ? mm[1].toUpperCase() : '';
            };

            const mappedSnps = [];
            const unresolved = [];   // variants with no usable genomic position -> 3rd-pass (protein->track)
            let mMapped = 0, mUnres = 0;
            for (const m of muts) {
                if (!(m.resolved && +m.start > 0)) { mUnres++; unresolved.push(m); continue; }
                const g0 = Math.floor(+m.start);
                const mp = parseAllele(m);          // { type, ref, sequence }
                const ref = mp.ref;
                let placed = false, placedGene = null;
                for (const k of gkeys) {
                    const t = loaded[k];
                    if (!t || !t.variantWorldX) continue;
                    let gi = t.variantWorldX(m.chr, g0);   // track world-x, or null if not held
                    if (gi == null) continue;
                    if (mp.type === 'del' && t.strand !== -1) gi = gi + 1;
                    // Already on this track (same position + ref)? Reuse it — don't add a
                    // duplicate; only variants not yet present get added to the existing track.
                    const dupe = (t.snpindels || []).find((x) => x && Math.round(x.xi) === Math.round(gi)
                        && ('' + (x.reference || '')).toUpperCase() === ('' + ref).toUpperCase());
                    if (dupe) {
                        t.showSnpIndels = true;
                        mappedSnps.push({ track: t, snp: dupe, mut: m });
                        placed = true;
                        if (!placedGene) placedGene = trackSym.get(t) || t.name;
                        continue;
                    }
                    // Amino-acid (peptide) mutation → HIGHLIGHT THE WHOLE CODON (span 3 nt) and mark
                    // it a peptide mutation; snpindel.js then never shows a nucleotide change for it
                    // (the exact base is degenerate / just one of 3).
                    let sxi = gi, sref = ref, salt = mp.sequence, stype = mp.type, isPep = false;
                    if (isPeptideMut(m)) {
                        isPep = true; stype = 'AA';   // amino-acid mutation type (NOT a deletion)
                        const cs = codonSpanAt(t, gi);
                        // CORRECTNESS: only reject when we can CONFIRM the codon codes for a DIFFERENT
                        // amino acid than the reference (first) residue in the nomenclature (e.g. the
                        // codon translates to Ala for a "G93A"). If the codon can't be confirmed, still
                        // create the amino-acid mutation (unknown nucleotide) as before.
                        const refAA = peptideRefAA(m);
                        const codonAA = (cs && cs.codon && cs.codon !== 'NNN') ? translateCodon(cs.codon) : '';
                        if (refAA && codonAA && codonAA !== refAA) continue;
                        // Span the WHOLE codon (3 nt) at the frame-aligned codon start.
                        if (cs) { sxi = cs.lo; sref = cs.codon; salt = cs.codon; }
                        else { sref = 'NNN'; salt = 'NNN'; }
                    }
                    const snp = new SnpIndel(stype, sxi, sref, salt, 0, t.strand, SNP_COLOR);
                    try { snp.color = SNP_COLOR; } catch (e) { }
                    try { if (isPep) snp.peptide = true; } catch (e) { }
                    try {
                        let nm = m.label || m.id || 'variant';
                        if (isPep) {
                            // Peptide mutations: label with the protein change ONLY — strip the
                            // leading gene symbol from a "GENE X###Y" style label.
                            let pn = ('' + (m.label || '')).trim();
                            if (m.gene) pn = pn.replace(new RegExp('^\\s*' + ('' + m.gene).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s:_.\\-]*', 'i'), '').trim();
                            if (!pn) pn = ('' + (m.protein || '')).replace(/^p\.?/i, '').replace(/[()]/g, '').trim();
                            nm = pn || m.id || 'variant';
                        }
                        snp.name = nm;
                    } catch (e) { }
                    try { snp.comment = (m.id ? m.id + ' — ' : '') + (m.comment || ''); } catch (e) { }
                    t.addsnpindel(snp);
                    t.showSnpIndels = true;
                    mappedSnps.push({ track: t, snp: snp, mut: m });
                    placed = true;
                    if (!placedGene) placedGene = trackSym.get(t) || t.name;
                }
                if (placed) { mMapped++; if (placedGene) perGene.set(placedGene, (perGene.get(placedGene) || 0) + 1); }
                else { mUnres++; unresolved.push(m); }
            }

            // PROTEIN-SEQUENCE PASS — any variant still unresolved (no rs number / genomic hit)
            // that is a PROTEIN MISSENSE change is placed as an AMINO-ACID mutation: find the
            // transcript whose translated protein carries the reference amino acid at the stated
            // position and drop it on that codon. Runs whenever variants remain unresolved (NOT
            // only when nothing mapped), so peptide mutations are created whenever there is no rsID.
            if (unresolved.length && Object.keys(loaded).length) {
                graph.setMessage(' Locating variants by protein sequence… ');
                // Search order: the mutation's own gene first (if it names one loaded), then the rest.
                const orderedTracks = (geneHint) => {
                    const g = ('' + (geneHint || '')).toLowerCase().trim();
                    const list = [];
                    if (g && loaded[g]) list.push(loaded[g]);
                    for (const k of gkeys) { const t = loaded[k]; if (t && list.indexOf(t) < 0) list.push(t); }
                    return list;
                };
                for (const m of unresolved) {
                    try {
                        // Delegate to the reusable protein-mutation -> track PROCESS: it parses the
                        // missense change, finds the track whose WILDTYPE peptide matches at that
                        // residue (the "correct peptide at 521"), and drops a degenerate SnpIndel.
                        const r = await exec('baja/manchester/menu/protein-mutation-to-track.js',
                            graph, genegraph_panel_layout,
                            { protein: m.protein, hgvs: m.hgvs, label: m.label, gene: m.gene, id: m.id, comment: m.comment },
                            { tracks: orderedTracks(m.gene), gene: m.gene, color: SNP_COLOR });
                        if (!r || !r.snp) continue;
                        mappedSnps.push({ track: r.track, snp: r.snp, mut: m });
                        mMapped++; mUnres = Math.max(0, mUnres - 1);
                        const gname = trackSym.get(r.track) || r.track.name;
                        if (gname) perGene.set(gname, (perGene.get(gname) || 0) + 1);
                    } catch (e) { }
                }
                if (mMapped > 0) { for (const k of gkeys) { const tr = loaded[k]; try { if (tr && tr.fitYAxis) tr.fitYAxis(); } catch (e) { } } }
            }

            // Map ASOs onto their target gene track by sequence search.
            let aMapped = 0, aUnmapped = 0;
            for (const a of asos) {
                const track = loaded[('' + (a.target_gene || '')).toLowerCase()];
                if (!track) { aUnmapped++; continue; }
                // 1) Contiguous match against the pre-mRNA (exon-internal / intron targets).
                const hit = mapAso(track, a);
                if (hit) {
                    const label = 'ASO' + (a.name ? ' ' + a.name : '');
                    const note = 'ASO (' + hit.orient + ') target' + (a.comment ? ' — ' + a.comment : '');
                    placePoint(track, hit.gi, hit.gf, label, note, 'rgba(10,120,200,0.9)');
                    aMapped++;
                    continue;
                }
                // 2) Fallback: spliced-mRNA search for exon-exon junction-spanning ASOs.
                const sh = mapAsoSpliced(track, a);
                if (sh) {
                    const parts = sh.intervals.length;
                    let pi = 0;
                    for (const iv of sh.intervals) {
                        pi++;
                        const label = 'ASO' + (a.name ? ' ' + a.name : '') + (parts > 1 ? ' (junction ' + pi + '/' + parts + ')' : '');
                        const note = 'ASO (' + sh.orient + ', spliced junction) target' + (a.comment ? ' — ' + a.comment : '');
                        placePoint(track, iv[0], iv[1], label, note, 'rgba(120,80,200,0.9)');
                    }
                    aMapped++;
                } else { aUnmapped++; }
            }

            for (const k of gkeys) { const tr = loaded[k]; try { if (tr && tr.fitYAxis) tr.fitYAxis(); } catch (e) { } }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            // Report what ACTUALLY loaded (not just what was attempted), and name any gene that
            // could not be resolved/loaded — otherwise a gene that Ensembl can't resolve makes the
            // whole load silently "do nothing" while the message still claims success.
            const nLoaded = Object.keys(loaded).length;
            const failedGenes = gkeys.filter((k) => !loaded[k]).map((k) => toLoad[k].symbol);
            // Per-gene mutation breakdown, e.g. "3 on SMN1, 1 on TP53".
            const perGeneStr = Array.from(perGene.entries()).map(([g, n]) => n + ' on ' + g).join(', ');
            const _showResult = (m) => { try { (graph.setResultMessage ? graph.setResultMessage : graph.setMessage).call(graph, m); } catch (e) { try { graph.setMessage(m); } catch (e2) { } } };
            if (nLoaded === 0 && gkeys.length > 0) {
                graph.setError && graph.setError(' Could not load ' + (gkeys.length === 1 ? 'the gene' : 'any gene')
                    + ' (' + failedGenes.join(', ') + ') — no Ensembl transcript was found for it. ');
            } else if (mMapped > 0) {
                // A clear, professional summary of what was actually added to the workbench.
                _showResult(' Added ' + mMapped + ' mutation' + (mMapped === 1 ? '' : 's')
                    + (perGeneStr ? ' (' + perGeneStr + ')' : '')
                    + ' across ' + nLoaded + ' gene' + (nLoaded === 1 ? '' : 's')
                    + (aMapped ? ' and ' + aMapped + ' ASO' + (aMapped === 1 ? '' : 's') : '')
                    + (mUnres ? '; ' + mUnres + ' variant' + (mUnres === 1 ? '' : 's') + ' could not be mapped' : '')
                    + (failedGenes.length ? '; could not load: ' + failedGenes.join(', ') : '') + '. ');
            } else {
                _showResult(' Loaded ' + nLoaded + ' gene' + (nLoaded === 1 ? '' : 's')
                    + (mUnres ? '; ' + mUnres + ' variant' + (mUnres === 1 ? '' : 's') + ' could not be mapped' : '')
                    + (aMapped ? '; ' + aMapped + ' ASO' + (aMapped === 1 ? '' : 's') + ' mapped' : '')
                    + (failedGenes.length ? '; could not load: ' + failedGenes.join(', ') : '') + '. ');
            }

            // Title of the paper: a RectangleText added ABOVE all the tracks and added LAST
            // (so it renders on top). World coords: span the tracks' x-extent and sit just
            // above the topmost track (world Y increases upward, so the top track is max yi).
            if (ex && ex.title) {
                try {
                    let xLo = Infinity, xHi = -Infinity, yMin = Infinity;
                    for (const t of (graph.track || [])) {
                        const g = t && t.tgraph;
                        if (!g || !isFinite(g.xi)) continue;
                        xLo = Math.min(xLo, g.xi);
                        xHi = Math.max(xHi, g.xi + (g.width || 0));
                        yMin = Math.max(yMin, g.yi);   // topmost track (smaller y = top of canvas)
                    }
                    if (isFinite(xLo) && isFinite(xHi) && isFinite(yMin)) {
                        const h = 1.4;
                        // Sit ABOVE the top track (smaller y). Box spans [y, y+h].
                        const rt = new RectangleText('paper-title', xLo, yMin - 0.4 - h);
                        rt.w = Math.max(1, xHi - xLo); rt.h = h;
                        rt.setText(ex.title);
                        rt.setColor('white');               // white foreground text
                        rt.backgroundColor = '#0b1f3a';     // dark background
                        rt.rectColor = '#0b1f3a';
                        rt.borderWhenSelectedOnly = true;   // no border unless selected
                        rt.autoScaleText = true;
                        if (!graph.shapes) graph.shapes = [];
                        graph.shapes.push(rt);   // added last -> drawn above the tracks
                    }
                } catch (e) { }
            }


            // Added at the very end: a fixed-screen-size arrow above each variant so the SNP
            // locations stay visible even when the whole gene is zoomed out to fit. The arrow
            // draws in screen pixels (independent of zoom) and points down at the marker.
            if (!graph.shapes) graph.shapes = [];
            for (const s of mappedSnps) {
                try {
                    const t = s.track, snp = s.snp;
                    if (!t || !t.tgraph || snp == null || snp.xi == null) continue;
                    graph.shapes.push({
                        x: snp.xi, y: t.tgraph.yi, type: 'SnpArrow', color: SNP_COLOR,
                        isIn: () => false,
                        draw: function (g) {
                            try {
                                const ctx = g && g.canvas && g.canvas.getCTX();
                                if (!ctx) return;
                                const sx = g.X(this.x), sy = g.Y(this.y);
                                const H = 20, W = 13, STEM = 12;   // fixed screen px
                                ctx.save();
                                ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
                                ctx.strokeStyle = this.color; ctx.lineWidth = 2;
                                ctx.beginPath(); ctx.moveTo(sx, sy - H - STEM); ctx.lineTo(sx, sy - 1); ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(sx, sy);                 // tip at the variant
                                ctx.lineTo(sx - W / 2, sy - H);
                                ctx.lineTo(sx + W / 2, sy - H);
                                ctx.closePath();
                                ctx.fillStyle = this.color; ctx.fill();
                                ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.stroke();
                                ctx.restore();
                            } catch (e) { }
                        }
                    });
                } catch (e) { }
            }

            try { if (graph.wake) graph.wake(); } catch (e) { }

            // Everything is in — genes, mutations (genomic pass + the protein->track 3rd pass)
            // and ASOs — so wait ~1s then zoom OUT to view ALL tracks. This runs at the top level
            // (NOT inside the background clinical-enrichment loop) so it fires immediately, rather
            // than after every per-variant  clinical call has resolved.
            await sleep(1000);
            try { if (graph.viewAllTracks) await graph.viewAllTracks(); else alert(' why ') } catch (e) {
            }
            for (const s of mappedSnps) { try { if (s && s.snp) s.snp.highlight = true; } catch (e) { } }
            try { if (graph.wake) graph.wake(); } catch (e) { }

            // Build the list of zoom targets — one per mutation actually placed on a track.
            // Prefer the SnpIndels we added; fall back to re-deriving each resolved mutation's
            // position on a loaded track (so the menu still appears if placement was skipped).
            const zoomTargets = [];
            const _seen = new Set();
            const _pushTarget = (track, xi, label, snp) => {
                if (!track || xi == null) return;
                const ti = (graph.track ? graph.track.indexOf(track) : 0);
                const key = ti + ':' + Math.round(xi);
                if (_seen.has(key)) return; _seen.add(key);
                zoomTargets.push({ track, xi, label, snp: snp || null });
            };
            for (const s of mappedSnps) {
                if (!s || !s.snp || s.snp.xi == null) continue;
                const g = (s.track && (trackSym.get(s.track) || s.track.name)) || '';
                const nm = (s.snp.name || s.snp.comment) || 'variant';
                _pushTarget(s.track, s.snp.xi, (g ? g + ' — ' : '') + nm, s.snp);
            }
            if (!zoomTargets.length) {
                for (const m of muts) {
                    if (!(m.resolved && +m.start > 0)) continue;
                    const g0 = Math.floor(+m.start);
                    for (const k of gkeys) {
                        const t = loaded[k]; if (!t || !t.variantWorldX) continue;
                        const gi = t.variantWorldX(m.chr, g0); if (gi == null) continue;
                        _pushTarget(t, gi, toLoad[k].symbol + ' — ' + (m.label || m.id || 'variant'));
                        break;
                    }
                }
            }

            // Prompt the user (side menu) to jump to / tour the mutations that were just added.
            const zoomTo = async (tg) => {
                try { if (tg && tg.xi != null) { const w = 30; await goToLocus(tg.track, tg.xi - w, tg.xi + w); if (tg.snp) { try { exec('baja/manchester/menu/focus-mutation.js', graph, tg.snp, 10000); } catch (e) { } } } } catch (e) { }
            };
            // Interactive tour: zoom to each mutation, dwell ~10s (auto-advance), with a side
            // menu of Previous / Next / Done so the user can step through at their own pace.
            const runTour = () => {
                let i = 0, cancelled = false, timer = null;
                const clearT = () => { if (timer) { clearTimeout(timer); timer = null; } };
                const finish = () => { cancelled = true; clearT(); try { graph.showSideMenu(null); } catch (e) { } };
                const go = async () => {
                    clearT();
                    if (cancelled) return;
                    if (i < 0) i = 0;
                    if (i >= zoomTargets.length) { finish(); return; }
                    const tg = zoomTargets[i];
                    try { await zoomTo(tg); } catch (e) { }
                    if (cancelled) return;
                    const menu = [
                        { label: 'Tour  ' + (i + 1) + ' / ' + zoomTargets.length + ':  ' + (tg.label || ''), move: () => { }, click: () => { clearT(); go(); } },
                        { label: '‹ Previous', move: () => { }, click: () => { clearT(); i = Math.max(0, i - 1); go(); } },
                        { label: 'Next ›', move: () => { }, click: () => { clearT(); i++; go(); } },
                        { label: '✓ Done', move: () => { }, click: () => { finish(); } },
                    ];
                    try { graph.showSideMenu(menu); } catch (e) { }
                    timer = setTimeout(() => { i++; go(); }, 10000);   // auto-advance after 10s
                };
                go();
            };
            const buildTourMenu = () => {
                const gotoItems = zoomTargets.map((tg) => ({ label: tg.label, click: () => { zoomTo(tg); } }));
                return [
                    { label: 'Go to  ▸', click: () => { try { graph.showSideMenu(gotoItems); } catch (e) { } } },
                    { label: 'Tour…', click: () => { runTour(); } },
                ];
            };
            if (zoomTargets.length && graph.showSideMenu) {
                // Show AFTER the load flow's async re-init of the navigate handlers (line ~216
                // re-execs mouse-over-highlight, which reinstalls listeners) — otherwise this
                // menu can be torn down right after it opens. Re-assert once for robustness.
                const _openTourMenu = () => { try { graph.showSideMenu(buildTourMenu()); if (graph.wake) graph.wake(); } catch (e) { } };
                setTimeout(_openTourMenu, 3000);
                setTimeout(_openTourMenu, 3500);   // re-assert in case the load flow tore it down
            } else if (graph.setResultMessage) {
                graph.setResultMessage(' No mutations could be placed on a track to navigate to. ');
            }

            // Genes + mutations are in and the view is settled — NOW load protein domains for the
            // coding tracks, in the background (fire-and-forget, one CDD lookup per track). This
            // deliberately runs last so it never slows the gene/mutation loading above.
            try {
                graph.__suppressAutoDomains = false;
                setTimeout(() => {
                    for (const k of gkeys) {
                        const t = loaded[k];
                        try { if (t && graph._autoLoadDomains) graph._autoLoadDomains(t); } catch (e) { }
                    }
                }, 600);
            } catch (e) { }

            // Enrich each placed variant with CLINICAL detail (in the BACKGROUND, one per variant,
            // so it never slows the load). The summary is stored on the SnpIndel's `annotation`
            // field and rendered as a leader-line + text on the marker (snpindel.js).
            setTimeout(() => {
                (async () => {
                    for (const ms of mappedSnps) {
                        try {
                            const snp = ms.snp, t = ms.track, m = ms.mut || {};
                            if (!snp || snp.__clinFetched) continue;
                            snp.__clinFetched = true;
                            const gsym = (trackSym.get(t) || (t && t.name) || m.gene || '');
                            const chr = ('' + (m.chr != null ? m.chr : (t && t.chr != null ? t.chr : ''))).replace('chr', '');
                            const pos = ('' + (m.start != null ? Math.floor(+m.start) : ''));
                            let r = null;
                            try { r = await exec('py/snps/snp_info_claude.py', JSON.stringify(snp), gsym, chr, pos); } catch (e) { }
                            const para = r && (r.mutation_paragraph || r.paragraph || r.summary);
                            let ptxt = ('' + (para || '')).trim();
                            // Never show the phrase "corresponds to the" (also handled in the prompt).
                            ptxt = ptxt.replace(/\bcorresponds to the\b/gi, 'is the').replace(/\s{2,}/g, ' ').trim();
                            if (ptxt && !/^no (additional|specific)/i.test(ptxt)) {
                                snp.annotation = ptxt;
                                try { if (graph.wake) graph.wake(); } catch (e) { }
                            }
                        } catch (e) { }
                    }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                })();
            }, 900);

            resolve({ genes: gkeys.length, mutations: mMapped, asos: aMapped });
        };

        const run = async (rawText) => {
            const txt = ('' + (rawText || '')).trim();
            if (!txt) { resolve(null); return; }
            showEditorCanvas();
            graph.setMessage(' Reading text — finding genes & mutations… ');
            try { window.__workStatus = 'Reading text — finding genes & mutations…'; } catch (e) { }
            let em = new EngineMonitor(() => { });
            // If it's slow (>20s), let the user know the analysis can take up to 2 minutes.
            let slow = setTimeout(() => {
                graph.setMessage(' Analyzing… this can take up to 2 minutes. ');
                try { window.__workStatus = 'Analyzing… this can take up to 2 minutes.'; } catch (e) { }
            }, 20000);
            let ex = null;
            try { ex = await exec('/py/sequence/extract-entities.py', em, txt); }
            catch (e) { clearTimeout(slow); graph.setMessage(' Extraction failed: ' + (e && e.message ? e.message : e)); resolve(null); return; }
            clearTimeout(slow);
            await process(ex);
        };

        // A caller can hand us already-extracted entities (e.g. from a file upload) — skip the
        //  text call and the paste modal and go straight to loading + mapping + touring.
        if (presetEntities) {
            showEditorCanvas();
            try { await process(presetEntities); }
            catch (e) { try { graph.setMessage(' Load failed: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { } }
            finally { try { if (graph.wake) graph.wake(); } catch (e) { } resolve(null); }
            return;
        }

        // A preset text (from a caller) skips the modal.
        if (presetText && ('' + presetText).trim()) { await run(presetText); return; }

        // Otherwise show a paste card in the mainPanel.
        const card = {
            wid: 'card',
            componentRef: 'mainPanel',
            data: {
                height: '100%', card_padding: '28px', padding: '10px',
                cards: [[
                    {
                        'title': 'Paste text — genes, mutations (rsIDs) and ASOs will be extracted and mapped',
                        'width': '100%',
                        'component': {
                            wid: 'text-editor',
                            refCallback: createIonFunction((p) => { v = p; }),
                            data: {
                                height: '320px', showButton: false,
                                editorOptions: {
                                    value: '', language: 'text', automaticLayout: true, fontSize: 15,
                                    lineNumbers: 'off', wordWrap: 'on', minimap: { enabled: false },
                                    suggestOnTriggerCharacters: false, quickSuggestions: false,
                                    fontFamily: 'Courier New, monospace',
                                    placeholder: 'Paste an abstract, clinical note, ASO datasheet, or variant list…'
                                }
                            }
                        }
                    },
                    {
                        'title': '', 'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Extract & Map', ionFunction: createIonFunction(async () => {
                                            let txt = '';
                                            try {
                                                txt = (v && v.getContent) ? v.getContent()
                                                    : (v && v.getWidgetValue ? v.getWidgetValue() : (v && v.value ? v.value : ''));
                                            } catch (e) { }
                                            await run(txt);
                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => { showEditorCanvas(); resolve(null); })
                                    }
                                ]
                            }
                        }
                    }
                ]]
            }
        };
        card.componentRef = 'mainPanel';
        showInMainPanel(card);
    });
}
