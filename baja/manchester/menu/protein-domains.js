function (graph, genegraph_panel_layout, presetTrack) {
    // Protein Domains: prompt the user to SELECT A TRACK, then derive the ORF/CDS of that
    // track, run a CDD domain search on the translated protein, and draw the protein-domain
    // graphic (ProteinDomain + functional-site AA annotations) mapped back onto the track's
    // genomic coordinates. If the selected track has no ORF/protein (not protein coding), tell
    // the user it is not a protein coding transcript.
    return (async () => {
        const Annotation = await exec('flexigraph/annotation.js');

        const reArmHover = () => {
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        // Map CDD protein domains onto one track's protein sequence.
        const runDomains = async (t) => {
            if (!t) { graph.setMessage(' No track selected. '); return; }

            // Build the ORF and the exon-aware CDS translation. cds.codonPos[i] is the genomic
            // coordinate of residue i+1's codon (0-based), used to place the domain annotations.
            try {
                for (let as of (t.annotations || [])) { if (as.type === 'NMD') t.removeAnnotation(as); }
                t.generateORF();
            } catch (e) { }
            // Decide "protein coding?" as robustly as possible: a track is protein coding iff it
            // yields a protein sequence. Try the exon-aware CDS first, then the ORF's per-codon
            // list (t.orf.cdsi, built by generateORF), then the track's own protein-sequence
            // method. Only if NONE produce a protein do we call it non-coding.
            let cds = null;
            try { cds = t.getCDS(); } catch (e) { }
            const _hasCds = (o) => o && o.protein && ('' + o.protein).length >= 3 && Array.isArray(o.codonPos) && o.codonPos.length;
            if (!_hasCds(cds)) {
                try {
                    const cdsi = (t.orf && Array.isArray(t.orf.cdsi)) ? t.orf.cdsi : [];
                    if (cdsi.length) {
                        const prot = [], cpos = [];
                        for (const e of cdsi) {
                            if (e && (e.ci === 0 || e.ci === '0')) { prot.push(e.aa || 'X'); cpos.push(e.index); }
                        }
                        if (prot.length >= 3) cds = { protein: prot.join(''), codonPos: cpos };
                    }
                } catch (e) { }
            }
            let proteinSeq = ('' + ((cds && cds.protein) || '')).toString();
            if (proteinSeq.length < 3) {
                try { proteinSeq = ('' + (t.getProteinSequence ? t.getProteinSequence() : '')).toString(); } catch (e) { }
                if (proteinSeq.length >= 3) cds = { protein: proteinSeq, codonPos: (cds && cds.codonPos) || [] };
            }

            // Not protein coding only when there is genuinely no protein sequence at all.
            if (proteinSeq.length < 3) {
                graph.setMessage(' ' + (t.name || 'This track') + ' is not a protein coding transcript. ');
                return;
            }

            graph.setMessage(' Finding protein domains (CDD) for ' + (t.name || 'the track') + '… ');

            // 1-based residue -> genomic coordinate of that residue's codon.
            const getNucleotideIndex = (aa) => (aa >= 1 && aa <= cds.codonPos.length) ? cds.codonPos[aa - 1] : -1;

            const parseDomains = (index, output) => {
                let domains = [];
                for (let i = index; i < output.length; i++) {
                    const line = output[i];
                    if (line.startsWith('ENDDOMAINS')) return domains;
                    const tline = line.split('\t');
                    domains.push({ type: tline[2], start: tline[4], end: tline[5], evalue: tline[6], id: tline[8], name: tline[9] });
                }
                return domains;
            };
            const parseSites = (index, output) => {
                let sites = [];
                for (let i = index; i < output.length; i++) {
                    const line = output[i];
                    if (line.startsWith('ENDSITES')) return sites;
                    const tline = line.split('\t');
                    sites.push({ name: tline[3], sites: tline[4] });
                }
                return sites;
            };

            // --- CDD functional-site vocabulary -------------------------------------------------
            // Resolve a CDD site title (e.g. "GEF interaction site", "GTP/Mg2+ binding site",
            // "pyridoxal 5'-phosphate binding site") to a drawing style {color, icon, tag, label}.
            // Each entry gets a family colour+icon and a short TAG code so even same-icon families
            // stay distinguishable on the canvas. Rules are tested top→bottom (specific first).
            const CDD_FAM = {
                active:       ['#e11d48', 'circledot'],
                catalytic:    ['#ea580c', 'star'],
                substrate:    ['#0d9488', 'triangle'],
                nucleotide:   ['#7c3aed', 'diamond'],
                gtpase:       ['#4f46e5', 'chevron'],
                metal:        ['#ca8a04', 'hexagon'],
                cofactor:     ['#c026d3', 'pentagon'],
                nucleic:      ['#2563eb', 'square'],
                interface:    ['#475569', 'doublecircle'],
                modification: ['#d97706', 'cross'],
                structural:   ['#0f766e', 'smallsquare'],
                inhibitor:    ['#9f1239', 'triangledown'],
                cleavage:     ['#1f2937', 'notch'],
                transport:    ['#0891b2', 'smallsquare'],
                other:        ['#6b7280', 'circle'],
            };
            const CDD_RULES = [
                // GTPase regulatory / interaction sites (small-GTPase feature vocabulary)
                [/\bgef\b|guanine.?nucleotide exchange/, 'gtpase', 'GEF'],
                [/\bgap\b|gtpase[- ]activating/, 'gtpase', 'GAP'],
                [/\bgdi\b|dissociation inhibitor/, 'gtpase', 'GDI'],
                [/switch\s*(i\b|1\b|one)/, 'gtpase', 'SwI'],
                [/switch\s*(ii|2|two)/, 'gtpase', 'SwII'],
                [/\bg1\b|g-?1 box|\bp-?loop\b|walker[- ]?a|phosphate[- ]binding loop/, 'gtpase', 'G1'],
                [/\bg2\b|g-?2 box/, 'gtpase', 'G2'],
                [/\bg3\b|g-?3 box|\bdxxg\b/, 'gtpase', 'G3'],
                [/\bg4\b|g-?4 box|\bnkxd\b/, 'gtpase', 'G4'],
                [/\bg5\b|g-?5 box|\bsak\b/, 'gtpase', 'G5'],
                // Post-translational modification sites
                [/phosphoryl/, 'modification', 'P'],
                [/n-?linked|n-?glycosyl/, 'modification', 'NGly'],
                [/o-?linked|o-?glycosyl/, 'modification', 'OGly'],
                [/glycosyl/, 'modification', 'Gly'],
                [/acetyl/, 'modification', 'Ac'],
                [/methyl/, 'modification', 'Me'],
                [/ubiquitin/, 'modification', 'Ub'],
                [/sumoyl/, 'modification', 'SUMO'],
                [/myristoyl/, 'modification', 'Myr'],
                [/palmitoyl/, 'modification', 'Palm'],
                [/prenyl|farnesyl|geranylgeranyl/, 'modification', 'Pren'],
                [/hydroxyl/, 'modification', 'OH'],
                [/lipid[- ](attach|bind|anchor)/, 'modification', 'Lip'],
                // Cleavage / processing
                [/autocleav|autolytic|autoprocess/, 'cleavage', 'aCLV'],
                [/cleav|proteolytic|processing site|scissile/, 'cleavage', 'CLV'],
                // Structural
                [/disulf|cystine|cys.*(bond|bridge)/, 'structural', 'S-S'],
                [/salt bridge/, 'structural', 'SB'],
                [/zinc finger|\bznf\b|zn[- ]?finger|ring finger/, 'structural', 'ZnF'],
                [/iron.?sulfur|iron-?sulphur|\d?fe-?\d?s|\bfes\b cluster/, 'structural', 'FeS'],
                // Cofactors
                [/heme|haem|porphyrin/, 'cofactor', 'HEME'],
                [/\bfad\b|flavin adenine/, 'cofactor', 'FAD'],
                [/\bfmn\b|flavin mononucleotide/, 'cofactor', 'FMN'],
                [/nadp/, 'cofactor', 'NADP'],
                [/\bnad\b|nicotinamide/, 'cofactor', 'NAD'],
                [/pyridoxal|\bplp\b/, 'cofactor', 'PLP'],
                [/biotin/, 'cofactor', 'BIO'],
                [/thiamine|\btpp\b/, 'cofactor', 'TPP'],
                [/cobalamin|\bb12\b/, 'cofactor', 'B12'],
                [/molybdopterin|\bmoco\b|molybdenum cofactor/, 'cofactor', 'MPT'],
                [/s-?adenosyl|\bsam\b/, 'cofactor', 'SAM'],
                [/coenzyme a|\bcoa\b/, 'cofactor', 'CoA'],
                [/cofactor/, 'cofactor', 'COF'],
                // Nucleotides (GTP wins over Mg for "GTP/Mg2+ binding")
                [/\bgtp\b/, 'nucleotide', 'GTP'],
                [/\batp\b/, 'nucleotide', 'ATP'],
                [/\badp\b/, 'nucleotide', 'ADP'],
                [/\bgdp\b/, 'nucleotide', 'GDP'],
                [/\bc?amp\b/, 'nucleotide', 'AMP'],
                [/walker[- ]?b/, 'nucleotide', 'WkB'],
                [/nucleotide|nucleoside|\bntp\b|purine|pyrimidine/, 'nucleotide', 'NTP'],
                // Metals / ions
                [/magnesium|\bmg2?\+?\b/, 'metal', 'Mg'],
                [/manganese|\bmn2?\+?\b/, 'metal', 'Mn'],
                [/\bzinc\b|\bzn2?\+?\b/, 'metal', 'Zn'],
                [/calcium|\bca2?\+?\b/, 'metal', 'Ca'],
                [/\biron\b|\bfe2?\+?\b/, 'metal', 'Fe'],
                [/copper|\bcu2?\+?\b/, 'metal', 'Cu'],
                [/nickel|\bni2?\+?\b/, 'metal', 'Ni'],
                [/cobalt|\bco2?\+?\b/, 'metal', 'Co'],
                [/potassium|\bk\+/, 'metal', 'K'],
                [/sodium|\bna\+/, 'metal', 'Na'],
                [/metal/, 'metal', 'M'],
                // Nucleic-acid binding
                [/dna[- ]?bind|dna binding|major groove|minor groove/, 'nucleic', 'DNA'],
                [/rna[- ]?bind|rna binding/, 'nucleic', 'RNA'],
                [/nucleic acid/, 'nucleic', 'NA'],
                // Transport / channels
                [/selectivity filter/, 'transport', 'FIL'],
                [/\bpore\b/, 'transport', 'POR'],
                [/\bgate\b|gating/, 'transport', 'GATE'],
                [/ion[- ]?(bind|channel|coordinat)/, 'transport', 'ION'],
                // Oligomer interfaces
                [/homodimer/, 'interface', 'HD'],
                [/heterodimer/, 'interface', 'HTD'],
                [/tetramer/, 'interface', 'TET'],
                [/trimer/, 'interface', 'TRI'],
                [/oligomer|multimer/, 'interface', 'OLG'],
                [/dimer|dimeriz/, 'interface', 'DIM'],
                [/interface|subunit/, 'interface', 'IF'],
                // Inhibitor
                [/inhibitor/, 'inhibitor', 'INH'],
                // Binding pockets: substrate / ligand / effector / allosteric / peptide
                [/substrate/, 'substrate', 'SUB'],
                [/allosteric/, 'substrate', 'ALL'],
                [/effector/, 'gtpase', 'EFF'],
                [/product bind/, 'substrate', 'PRD'],
                [/ligand/, 'substrate', 'LIG'],
                [/peptide bind|polypeptide|protein[- ]?bind/, 'substrate', 'PEP'],
                // Catalytic / active-site residues
                [/oxyanion/, 'catalytic', 'OXH'],
                [/proton accept/, 'catalytic', 'H+A'],
                [/proton donor/, 'catalytic', 'H+D'],
                [/nucleophile/, 'catalytic', 'NUC'],
                [/catalytic triad|charge relay/, 'catalytic', 'TRI3'],
                [/catalyt/, 'catalytic', 'CAT'],
                [/active/, 'active', 'AS'],
                // Generic interaction / binding fallbacks (kept last)
                [/interact/, 'gtpase', 'INT'],
                [/binding/, 'substrate', 'BND'],
            ];
            const cddSiteStyle = (raw) => {
                const title = ('' + (raw || '')).trim();
                const n = title.toLowerCase();
                let fam = 'other', tag = '';
                for (const [re, f, t] of CDD_RULES) { if (re.test(n)) { fam = f; tag = t; break; } }
                const [color, icon] = CDD_FAM[fam] || CDD_FAM.other;
                return { color, icon, tag, label: title || 'site', family: fam };
            };

            let nDomains = 0, nSites = 0;
            const drawResult = (value) => {
                if (!value || !value['file'] || value['file'].length < 1) return;
                const output = ('' + value['file']).split('\n');
                let domains = [], sites = [];
                for (let idx = 0; idx < output.length; idx++) {
                    if (output[idx].startsWith('DOMAIN')) domains = parseDomains(idx + 1, output);
                    if (output[idx].startsWith('SITES')) sites = parseSites(idx + 1, output);
                }
                for (let d of domains) {
                    const istart = getNucleotideIndex(+d.start);
                    const iend = getNucleotideIndex(+d.end);
                    if (istart < 0 || iend < 0) continue;
                    // codonPos runs 3'->5' on the minus strand, so order the span.
                    const alo = Math.min(istart, iend);
                    const ahi = Math.max(istart, iend) + 2;   // include the last codon
                    const an = new Annotation('ProteinDomain', d.name, alo, ahi);
                    an.labelY = Math.random() + 2;
                    t.add(an);
                    nDomains++;
                }
                for (let s of sites) {
                    const name = s.name;
                    const list = s.sites;
                    if (!list || list.length < 1) continue;
                    const positions = (list.indexOf(',') > 0) ? list.split(',') : [list];
                    for (let p of positions) {
                        const aa = +('' + p).substring(1).trim();
                        const start = getNucleotideIndex(aa);
                        if (start >= 0) {
                            // Resolve the site's CDD title to its glyph style and attach it, so
                            // gene-draw.js's 'cdd-site' shape draws the right icon/colour/tag.
                            const style = cddSiteStyle(name);
                            const an = new Annotation('cdd-site', name, start - 2, start + 1);
                            an.__cdd = style;
                            an.color = style.color;
                            t.add(an);   // add() assigns a label lane so nearby sites don't collide
                            nSites++;
                        }
                    }
                }
            };

            // Chunk the protein (CDD handles big inputs) and search each chunk.
            const chunkSize = 10000000;
            let chunks = [];
            for (let i = 0; i < proteinSeq.length; i += chunkSize) chunks.push(proteinSeq.substring(i, i + chunkSize));
            for (let chunk of chunks) {
                try {
                    // Local self-hosted CDD (rpsblast+ / rpsbproc) when installed, else NCBI CD-Search.
                    const result = await exec('py/cdd/domains.py', chunk);
                    if (result && result['file'] != null) drawResult(result);
                } catch (e) { console.warn('protein-domains: CDD chunk failed', e); }
            }

            // Collapse runs of the same functional site sitting next to each other into a single
            // region annotation (e.g. consecutive "active site" residues → one "active site").
            try { if (t.mergeAdjacentAnnotations) t.mergeAdjacentAnnotations('cdd-site'); } catch (e) { }

            try { if (t.fitYAxis) t.fitYAxis(); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }

            if (nDomains === 0 && nSites === 0) {
                // Coding transcript, but CDD found nothing to map.
                graph.setMessage(' No protein domains found for ' + (t.name || 'this track') + '. ');
            } else {
                graph.setMessage(' Added ' + nDomains + ' protein domain(s)' + (nSites ? ' and ' + nSites + ' functional site(s)' : '') + ' to ' + (t.name || 'the track') + '. ');
            }
        };

        // Auto path: a caller handed us a track directly (e.g. auto-load on track add) — map
        // its domains without the click prompt. runDomains() no-ops on non-coding tracks.
        if (presetTrack) {
            try { await runDomains(presetTrack); } catch (e) { }
            return;
        }

        if (!graph.track || graph.track.length === 0) {
            graph.setMessage(' Load a track first, then choose Protein Domains. ');
            return;
        }

        // Cursor prompt: click a track, then map its protein domains onto its sequence.
        graph.setMessage(' Select a track to map its protein domains… ');
        try { graph.clearMouseListeners(); } catch (e) { }
        try { graph.setMouseMode('msg: Click a track to map its protein domains.'); } catch (e) { }
        graph.addMouseDownListener(async (x, y) => {
            const ti = graph.getTrack(x, y);
            if (ti < 0) return;
            const t = graph.track[ti];
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { await runDomains(t); } catch (e) { graph.setMessage(' Protein domain lookup failed: ' + (e && e.message ? e.message : e)); }
            reArmHover();
        });
    })();
}
