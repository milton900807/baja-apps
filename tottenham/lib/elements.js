function () {

    // THE CIS-REGULATORY ELEMENT CATALOGUE, and a scanner that knows WHERE it is looking.
    //
    // Almost everything that sets an mRNA's half-life is a short sequence that a protein or
    // a small RNA binds. This file is the list of those sequences, what binds them, which
    // direction they push half-life, and how confident the assignment is.
    //
    // REGION AWARENESS IS THE WHOLE POINT. An AUUUA pentamer in a 3ʹ UTR is an
    // AU-rich element and recruits the decay machinery. The same five bases inside a coding
    // sequence are three-quarters of a codon pair and mean nothing. A scanner that reports
    // both produces a page of findings that a designer learns to ignore, which is worse than
    // reporting nothing. So every element declares the regions it is real in, and is only
    // reported there.
    //
    // DIRECTION IS NOT ALWAYS "BAD". A miRNA site is destabilising, which is exactly why
    // people put them in on purpose -- a miR-142-3p site in the 3ʹ UTR is how you stop a
    // construct expressing in haematopoietic cells. The catalogue therefore records the
    // effect, not a verdict, and the scanner reports "you have this element here"; whether
    // that is a problem is the designer's call and the editor presents it that way.

    return (async () => {

        const GC = await exec('liverpool/lib/genetic-code.js');

        const REGIONS = ['utr5', 'cds', 'utr3'];

        // ---- the catalogue -----------------------------------------------------------------
        //
        // `re` is matched against the DNA form (T, not U). `effect` is the direction on
        // half-life or on output. `confidence` is how well established the motif->effect link
        // is, not how sure the regex is.
        const ELEMENTS = [

            // --- AU-rich elements: the best-characterised destabilising class ---------------
            {
                id: 'are-nonamer', name: 'ARE nonamer (UUAUUUAUU)', re: /TTATTTATT/g,
                regions: ['utr3'], effect: 'destabilising', strength: 'strong', confidence: 'high',
                binds: 'tristetraprolin (ZFP36), AUF1, KSRP',
                why: 'The canonical class II AU-rich element. Recruits deadenylases and drives '
                    + 'rapid poly(A) shortening, then decay. This is the single most reliable '
                    + 'destabilising motif in a 3ʹ UTR.'
            },
            {
                id: 'are-pentamer', name: 'ARE pentamer (AUUUA)', re: /ATTTA/g,
                regions: ['utr3'], effect: 'destabilising', strength: 'weak', confidence: 'medium',
                binds: 'ARE-binding proteins, context dependent',
                why: 'A lone pentamer in a non-U-rich context does little. It matters when several '
                    + 'overlap or when it sits in a U-rich stretch, which is what the cluster '
                    + 'finding below reports. Listed individually so the clusters can be built '
                    + 'from it, not because one pentamer is a problem.'
            },
            {
                id: 'gre', name: 'GU-rich element (UGUUUGUUUGU)', re: /TGTTTGTTTGT/g,
                regions: ['utr3'], effect: 'destabilising', strength: 'strong', confidence: 'medium',
                binds: 'CELF1 (CUGBP1)',
                why: 'The GU-rich counterpart of an ARE. Same outcome, different reader: CELF1 '
                    + 'recruits deadenylation.'
            },
            {
                id: 'gre-short', name: 'GU-rich half site (GUUUG)', re: /GTTTG/g,
                regions: ['utr3'], effect: 'destabilising', strength: 'weak', confidence: 'low',
                binds: 'CELF1, weakly',
                why: 'Only meaningful in tandem. Reported so repeats are visible; a single one is noise.'
            },
            {
                id: 'pre', name: 'Pumilio response element (UGUANAUA)', re: /TGTA.ATA/g,
                regions: ['utr3'], effect: 'destabilising', strength: 'medium', confidence: 'medium',
                binds: 'PUM1 / PUM2',
                why: 'Pumilio binding recruits deadenylase and represses translation. Eight bases '
                    + 'with one degenerate position, so it turns up by chance in long UTRs -- weigh '
                    + 'it by how many there are.'
            },

            // --- m6A -------------------------------------------------------------------------
            {
                id: 'drach', name: 'DRACH (m6A consensus)', re: /[AGT][AG]AC[ACT]/g,
                regions: ['utr3', 'cds'], effect: 'destabilising', strength: 'weak', confidence: 'medium',
                binds: 'METTL3/14 writes it; YTHDF2 reads it and routes the transcript to decay',
                why: 'The methylation consensus. Only a small fraction of DRACH sites are ever '
                    + 'methylated, and the motif is five bases with three degenerate positions, so '
                    + 'it occurs about once every 60 nt by chance. DENSITY is the signal, never a '
                    + 'single site -- which is why the editor shows sites per kilobase and not a list.'
            },

            // --- innate immune sensing ---------------------------------------------------------
            {
                id: 'cpg', name: 'CpG dinucleotide', re: /CG/g,
                regions: ['utr5', 'cds', 'utr3'], effect: 'destabilising', strength: 'weak', confidence: 'medium',
                binds: 'ZAP (ZC3HAV1), with KHNYN and the exosome',
                why: 'ZAP binds CpG-rich RNA and targets it for degradation. The human transcriptome '
                    + 'is CpG-poor and viral genomes that have been passaged in humans lose CpG, '
                    + 'which is the observation this is built on. One CpG is nothing; the number to '
                    + 'watch is the density relative to what mononucleotide content predicts, which '
                    + 'is what the observed-over-expected ratio below measures.'
            },
            {
                id: 'upa', name: 'UpA dinucleotide', re: /TA/g,
                regions: ['cds'], effect: 'destabilising', strength: 'weak', confidence: 'low',
                binds: 'RNase L preferentially cleaves UpA and UpU',
                why: 'Weaker and less well established than the CpG effect, and it is easy to '
                    + 'over-fit a sequence by chasing it. Reported as a density, never acted on '
                    + 'automatically.'
            },
            {
                id: 'polyu', name: 'Poly(U) run of 5 or more', re: /TTTTT+/g, overlap: false,
                regions: ['utr5', 'cds', 'utr3'], effect: 'destabilising', strength: 'medium', confidence: 'medium',
                binds: 'RIG-I recognises 5ʹ triphosphate and poly-U/UC motifs',
                why: 'U-rich tracts contribute to innate sensing and are a synthesis liability as '
                    + 'well. They are also where transcription slippage happens.'
            },

            // --- translation initiation --------------------------------------------------------
            {
                id: 'uaug', name: 'Upstream AUG', re: /ATG/g,
                regions: ['utr5'], effect: 'reduces output', strength: 'strong', confidence: 'high',
                binds: 'the scanning 43S preinitiation complex',
                why: 'A scanning ribosome initiates at the first AUG it reaches in a reasonable '
                    + 'context. An AUG in the 5ʹ UTR starts an upstream ORF and most ribosomes never '
                    + 'reach the real start. This is the highest-value single check on a 5ʹ UTR.'
            },
            {
                id: 'polya-signal', name: 'Poly(A) signal (AAUAAA)', re: /AATAAA/g,
                regions: ['utr5', 'cds'], effect: 'truncates', strength: 'strong', confidence: 'high',
                binds: 'CPSF',
                why: 'A cryptic polyadenylation signal inside the transcribed region truncates it. '
                    + 'Expected and harmless in a natural 3ʹ UTR, which is why this element is not '
                    + 'scanned there.'
            },
            {
                id: 'polya-signal-alt', name: 'Poly(A) signal, variant (AUUAAA)', re: /ATTAAA/g,
                regions: ['utr5', 'cds'], effect: 'truncates', strength: 'medium', confidence: 'high',
                binds: 'CPSF',
                why: 'The commonest variant signal. Same consequence as the canonical one, used less often.'
            },

            // --- stabilising --------------------------------------------------------------------
            {
                id: 'pcbp', name: 'Pyrimidine-rich / alpha-complex element', re: /[CT]{12,}/g, overlap: false,
                regions: ['utr3'], effect: 'stabilising', strength: 'medium', confidence: 'medium',
                binds: 'PCBP1/2 (alpha-CP)',
                why: 'The element that makes the alpha-globin 3ʹ UTR stabilising: a C-rich tract '
                    + 'bound by the alpha-complex, which protects the poly(A) tail from deadenylation. '
                    + 'This is why alpha-globin UTRs are in almost every mRNA therapeutic.'
            }
        ];

        const byId = {};
        for (const e of ELEMENTS) byId[e.id] = e;

        // ---- miRNA target sites ----------------------------------------------------------------
        //
        // A miRNA site is the reverse complement of the miRNA's seed, nucleotides 2-8. Two
        // site classes are worth distinguishing: the 7mer-m8 (the seed match alone) and the
        // 8mer (the seed match followed by an A opposite miRNA position 1), which is
        // consistently the more repressive.
        //
        // DUAL USE. These are listed so they can be REMOVED from a construct meant to express
        // everywhere, and equally so they can be ADDED on purpose. A miR-142-3p site in the
        // 3ʹ UTR is the standard way to switch a construct off in haematopoietic cells; a
        // miR-122 site switches it off in hepatocytes. The editor offers both directions.
        //
        // VERIFY THE SEEDS. These were written from the mature miRNA sequences and each one
        // should be checked against miRBase before a construct is ordered -- a seed one base
        // out silently targets nothing, or something else.
        const MIRNA = [
            { id: 'mir-122-5p', name: 'miR-122-5p', tissue: 'hepatocytes', site7: 'ACACTCC', verify: true, use: 'the standard liver de-targeting site' },
            { id: 'mir-142-3p', name: 'miR-142-3p', tissue: 'haematopoietic cells', site7: 'ACACTAC', verify: true, use: 'the standard way to silence a construct in immune cells, used to reduce clearance of transduced cells' },
            { id: 'mir-1', name: 'miR-1', tissue: 'cardiac and skeletal muscle', site7: 'ACATTCC', verify: true, use: 'muscle de-targeting' },
            { id: 'mir-133a', name: 'miR-133a', tissue: 'muscle', site7: 'GGACCAA', verify: true, use: 'muscle de-targeting' },
            { id: 'mir-126-3p', name: 'miR-126-3p', tissue: 'endothelium', site7: 'CGGTACG', verify: true, use: 'endothelial de-targeting' },
            { id: 'let-7a-5p', name: 'let-7a-5p', tissue: 'broad, high in differentiated tissue', site7: 'CTACCTC', verify: true, use: 'rarely added deliberately; worth removing if found by accident' },
            { id: 'mir-21-5p', name: 'miR-21-5p', tissue: 'broad, raised in many tumours', site7: 'ATAAGCT', verify: true, use: 'worth removing from a construct intended to work in tumour tissue' },
            { id: 'mir-155-5p', name: 'miR-155-5p', tissue: 'activated immune cells', site7: 'AGCATTA', verify: true, use: 'worth removing; also used for immune de-targeting' }
        ];

        // ---- scanning ----------------------------------------------------------------------------
        //
        // scan(seq, region) -> [{id, name, at, len, match, effect, strength, confidence, ...}]
        // Positions are 0-based within the region given.
        // OVERLAPPING BY DEFAULT. A run of AUUUAUUUAUUUA is four overlapping pentamers, and
        // counting it as two -- which is what a plain global regex does, because it resumes
        // after each match -- undercounts exactly the case that matters. Every fixed-length
        // motif is therefore matched at every position it starts at.
        //
        // Run-type patterns (poly-U, the pyrimidine tract) opt out with `overlap: false`:
        // there, one run is one finding, and reporting a run of eight U as four overlapping
        // findings would be nonsense.
        const scan = (seq, region) => {
            const s = GC.cleanNt(seq);
            const out = [];
            if (!s.length) return out;
            for (const e of ELEMENTS) {
                if (e.regions.indexOf(region) < 0) continue;
                const overlap = (e.overlap !== false);
                const re = new RegExp(e.re.source, 'g');
                let m;
                while ((m = re.exec(s)) !== null) {
                    out.push({
                        id: e.id, name: e.name, at: m.index, len: m[0].length, match: m[0],
                        effect: e.effect, strength: e.strength, confidence: e.confidence,
                        binds: e.binds, why: e.why, region: region
                    });
                    re.lastIndex = overlap ? (m.index + 1) : Math.max(re.lastIndex, m.index + 1);
                }
            }
            return out.sort((a, b) => a.at - b.at);
        };

        // miRNA sites, scanned separately because they are reported as a different KIND of
        // finding: not "a problem" but "this construct is repressed in this tissue".
        const scanMirna = (seq, region) => {
            const s = GC.cleanNt(seq);
            const out = [];
            for (const mi of MIRNA) {
                let i = s.indexOf(mi.site7);
                while (i >= 0) {
                    // 8mer = the 7mer-m8 followed by an adenosine. More repressive, and worth
                    // distinguishing because it is the difference between a partial and a near
                    // complete switch-off.
                    const eightmer = (s[i + mi.site7.length] === 'A');
                    out.push({
                        id: mi.id, name: mi.name, tissue: mi.tissue, at: i,
                        len: mi.site7.length + (eightmer ? 1 : 0),
                        kind: eightmer ? '8mer' : '7mer-m8',
                        verify: mi.verify, use: mi.use, region: region
                    });
                    i = s.indexOf(mi.site7, i + 1);
                }
            }
            return out.sort((a, b) => a.at - b.at);
        };

        // ---- density measures ------------------------------------------------------------------
        //
        // Observed over expected: the count of a dinucleotide divided by what the sequence's
        // own base composition predicts. This is the right way to ask "is this sequence
        // CpG-rich?" -- a raw count conflates CpG suppression with GC content, and a GC-rich
        // sequence with ordinary CpG suppression would look alarming on a raw count.
        const dinucleotideOE = (seq, dint) => {
            const s = GC.cleanNt(seq);
            const n = s.length;
            if (n < 2) return { observed: 0, expected: 0, oe: null, perKb: 0 };
            const a = dint[0], b = dint[1];
            let obs = 0, ca = 0, cb = 0;
            for (let i = 0; i < n; i++) {
                if (s[i] === a) ca++;
                if (s[i] === b) cb++;
                if (i < n - 1 && s[i] === a && s[i + 1] === b) obs++;
            }
            const expected = (ca * cb) / n;
            return {
                observed: obs,
                expected: expected,
                oe: expected > 0 ? (obs / expected) : null,
                perKb: (obs / n) * 1000
            };
        };

        // ARE CLUSTERS. A pentamer matters when it is in company. This finds windows where
        // several overlap or sit close together in a U-rich context, which is what the
        // literature actually describes as a class II ARE.
        const areClusters = (seq) => {
            const s = GC.cleanNt(seq);
            const hits = [];
            const re = /ATTTA/g;
            let m;
            while ((m = re.exec(s)) !== null) { hits.push(m.index); re.lastIndex = m.index + 1; }
            const clusters = [];
            let i = 0;
            while (i < hits.length) {
                let j = i;
                while (j + 1 < hits.length && hits[j + 1] - hits[j] <= 10) j++;
                const count = j - i + 1;
                if (count >= 2) {
                    const from = hits[i], to = hits[j] + 5;
                    const win = s.slice(Math.max(0, from - 5), Math.min(s.length, to + 5));
                    const uFrac = (win.match(/T/g) || []).length / Math.max(1, win.length);
                    clusters.push({
                        at: from, to: to, count: count, uFraction: uFrac,
                        // A cluster in a U-rich context is the real class II element; a cluster
                        // in an otherwise ordinary sequence is much weaker.
                        strength: (count >= 3 && uFrac >= 0.5) ? 'strong' : (count >= 2 && uFrac >= 0.4 ? 'medium' : 'weak')
                    });
                }
                i = j + 1;
            }
            return clusters;
        };

        // ---- one call for a whole construct ------------------------------------------------------
        //
        // regions is {utr5, cds, utr3} of DNA strings. Returns findings tagged by region with
        // positions translated into the full transcript as well, so the editor can point at a
        // place in the sequence the user is looking at.
        const scanConstruct = (regions) => {
            const r = regions || {};
            const parts = [
                { region: 'utr5', seq: GC.cleanNt(r.utr5 || '') },
                { region: 'cds', seq: GC.cleanNt(r.cds || '') },
                { region: 'utr3', seq: GC.cleanNt(r.utr3 || '') }
            ];
            let offset = 0;
            const findings = [], mirnas = [];
            const perRegion = {};
            for (const p of parts) {
                const f = scan(p.seq, p.region).map((x) => Object.assign({}, x, { absolute: offset + x.at }));
                const mi = scanMirna(p.seq, p.region).map((x) => Object.assign({}, x, { absolute: offset + x.at }));
                findings.push.apply(findings, f);
                mirnas.push.apply(mirnas, mi);
                perRegion[p.region] = {
                    length: p.seq.length,
                    cpg: dinucleotideOE(p.seq, 'CG'),
                    upa: dinucleotideOE(p.seq, 'TA'),
                    gc: GC.gc(p.seq),
                    u: GC.uFraction(p.seq),
                    areClusters: (p.region === 'utr3') ? areClusters(p.seq) : [],
                    drachPerKb: p.seq.length ? (scan(p.seq, p.region).filter((x) => x.id === 'drach').length / p.seq.length) * 1000 : 0
                };
                offset += p.seq.length;
            }
            return { findings: findings, mirnas: mirnas, regions: perRegion, totalLength: offset };
        };

        // Group findings for display: one row per element type per region with a count, rather
        // than 400 rows of DRACH. A list nobody can read is not a report.
        const summarise = (findings) => {
            const key = (f) => f.region + '|' + f.id;
            const by = new Map();
            for (const f of findings) {
                const k = key(f);
                if (!by.has(k)) by.set(k, { region: f.region, id: f.id, name: f.name, effect: f.effect, strength: f.strength, confidence: f.confidence, binds: f.binds, why: f.why, count: 0, positions: [] });
                const g = by.get(k);
                g.count++;
                if (g.positions.length < 40) g.positions.push(f.at);
            }
            const order = { strong: 0, medium: 1, weak: 2 };
            return Array.from(by.values()).sort((a, b) =>
                (order[a.strength] - order[b.strength]) || (b.count - a.count));
        };

        return {
            ELEMENTS: ELEMENTS, MIRNA: MIRNA, REGIONS: REGIONS, byId: byId,
            scan: scan, scanMirna: scanMirna, scanConstruct: scanConstruct,
            dinucleotideOE: dinucleotideOE, areClusters: areClusters, summarise: summarise
        };
    })();
}
