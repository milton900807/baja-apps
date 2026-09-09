function () {

    // FROM A SHORTLIST TO AN mRNA.
    //
    // The cassette is a string of beads: an optional leader, the chosen epitopes separated
    // by linkers, an optional trailer. Assembling it is trivial. What is NOT trivial, and is
    // what this module actually exists for, is the three things assembly does to the
    // epitopes that were carefully chosen one at a time:
    //
    //   JUNCTIONS CREATE EPITOPES. Every seam between two beads is a stretch of sequence
    //   that exists in no protein anywhere. Some of those stretches bind the patient's own
    //   HLA. A junctional neoepitope competes with the real ones for presentation and for
    //   the T-cell response, and it is invisible unless something goes looking. This module
    //   goes looking, over the same alleles the design was built for.
    //
    //   CONTEXT CHANGES RELEASE. An epitope's C-terminal cut depends on the residue AFTER
    //   it, which in the cassette is the first residue of the next linker, not whatever
    //   followed it in the source protein. Put a proline there and the epitope is never
    //   released. Each epitope's cleavage score is therefore recomputed IN THE CASSETTE,
    //   and any epitope that scored well alone and badly in place is reported.
    //
    //   THE ORDER MATTERS. Since both effects depend on neighbours, the module can search
    //   orderings for one that minimises junctional binding while keeping release intact.
    //
    // Then the protein is reverse-translated (lib/genetic-code.js), the untranslated regions
    // and the tail are added, and the whole transcript is checked.

    return (async () => {

        const GC = await exec('liverpool/lib/genetic-code.js');
        const HLA = await exec('liverpool/lib/hla.js');
        const EP = await exec('liverpool/lib/epitope.js');
        const PRESETS = await exec('liverpool/lib/presets.js');

        const cleanAa = (s) => ('' + (s == null ? '' : s)).toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, '');

        // ---- assembling the protein cassette ------------------------------------------------
        //
        // Returns the protein and a SEGMENT MAP -- which residues came from which bead. Every
        // check below is expressed in terms of that map, so a report can always say what a
        // finding is about rather than just where it is.
        const assemble = (spec) => {
            const o = spec || {};
            const epitopes = (o.epitopes || []).map((e) => (typeof e === 'string')
                ? { peptide: cleanAa(e), name: cleanAa(e) }
                : { peptide: cleanAa(e.peptide), name: e.name || e.mutation || cleanAa(e.peptide), meta: e });
            const linkerAa = cleanAa(o.linker == null ? 'AAY' : o.linker);
            const leaderAa = cleanAa(o.leader || '');
            const trailerAa = cleanAa(o.trailer || '');

            const segments = [];
            let protein = '';
            const push = (kind, name, aa, meta) => {
                if (!aa || !aa.length) return;
                segments.push({ kind: kind, name: name, aa: aa, from: protein.length, to: protein.length + aa.length, meta: meta || null });
                protein += aa;
            };

            if (leaderAa) push('leader', o.leaderName || 'leader', leaderAa);
            epitopes.forEach((e, i) => {
                if (i > 0 && linkerAa) push('linker', o.linkerName || 'linker', linkerAa);
                push('epitope', e.name, e.peptide, e.meta);
            });
            if (trailerAa) { if (linkerAa && epitopes.length) push('linker', o.linkerName || 'linker', linkerAa); push('trailer', o.trailerName || 'trailer', trailerAa); }

            // A cassette must start with a methionine, because translation does. If the leader
            // already supplies one, nothing is added -- prepending a second M would put a
            // spurious residue in front of a signal peptide and change where it is cleaved.
            let addedMet = false;
            if (protein && protein[0] !== 'M') {
                protein = 'M' + protein;
                for (const s of segments) { s.from += 1; s.to += 1; }
                segments.unshift({ kind: 'start', name: 'initiator Met', aa: 'M', from: 0, to: 1, meta: null });
                addedMet = true;
            }

            return { protein: protein, segments: segments, addedMet: addedMet };
        };

        const segmentAt = (segments, i) => {
            for (const s of segments) if (i >= s.from && i < s.to) return s;
            return null;
        };

        // ---- junctional epitope scan ------------------------------------------------------
        //
        // Every window of the given lengths that touches MORE THAN ONE segment, scored
        // against the design's own alleles. A window entirely inside one epitope is not a
        // junction and is not reported here; a window inside the leader or the trailer is
        // reported separately, because those are real sequences from a real human protein and
        // a binder found in one is a self peptide, not a neoepitope -- a different problem
        // with a different answer.
        const scanJunctions = async (protein, segments, alleles, opts) => {
            const o = opts || {};
            const lengths = o.lengths || [8, 9, 10, 11];
            const classII = o.classIILengths || [15];
            const list = (alleles || []).map((a) => HLA.normalise(a)).filter(Boolean);
            if (!list.length) return { junctions: [], scanned: 0 };

            const windows = [];
            const allLengths = lengths.concat(classII);
            for (const L of allLengths) {
                for (let i = 0; i + L <= protein.length; i++) {
                    const first = segmentAt(segments, i), last = segmentAt(segments, i + L - 1);
                    if (!first || !last) continue;
                    if (first === last) continue;                        // inside one bead
                    const spans = [];
                    for (let j = i; j < i + L; j++) {
                        const s = segmentAt(segments, j);
                        if (s && spans.indexOf(s) < 0) spans.push(s);
                    }
                    // A window that only reaches into the initiator Met is not a junction of
                    // interest; the Met is one residue and part of whatever follows it.
                    const real = spans.filter((s) => s.kind !== 'start');
                    if (real.length < 2) continue;
                    windows.push({ peptide: protein.substr(i, L), at: i, length: L, spans: real.map((s) => s.kind + ':' + s.name) });
                }
            }
            if (!windows.length) return { junctions: [], scanned: 0 };

            const out = [];
            for (const allele of list) {
                const meta = HLA.info(allele);
                const cls = meta ? meta.cls : 1;
                const group = windows.filter((w) => (cls === 1) ? lengths.indexOf(w.length) >= 0 : classII.indexOf(w.length) >= 0);
                if (!group.length) continue;
                // Grouped by length, because predict() builds one background per length.
                const byLen = {};
                for (const w of group) (byLen[w.length] = byLen[w.length] || []).push(w);
                for (const L in byLen) {
                    const g = byLen[L];
                    const scored = await HLA.predict(allele, g.map((w) => w.peptide));
                    g.forEach((w, i) => {
                        const s = scored[i];
                        if (s.bind === 'none') return;                   // only binders are findings
                        out.push({
                            peptide: w.peptide, at: w.at, length: w.length, spans: w.spans,
                            allele: allele, rank: s.rank, band: s.bind, alleleClass: cls,
                            source: s.source
                        });
                    });
                }
            }
            out.sort((a, b) => a.rank - b.rank);
            return { junctions: out, scanned: windows.length };
        };

        // ---- does each epitope still get released? -------------------------------------------
        //
        // The C-terminal cut is recomputed with the residue that FOLLOWS the epitope in the
        // cassette. `alone` is what the same epitope scored during selection; the pair is
        // what makes the finding actionable -- an epitope that was always going to be hard to
        // release is not a linker problem.
        const contextCheck = (protein, segments) => {
            const out = [];
            for (const s of segments) {
                if (s.kind !== 'epitope') continue;
                const inContext = EP.cleavageScore(s.aa, protein, s.to < protein.length ? s.to : -1);
                const alone = EP.cleavageScore(s.aa, s.aa, -1);
                out.push({
                    name: s.name, peptide: s.aa, at: s.from,
                    following: (s.to < protein.length) ? protein[s.to] : '(cassette C-terminus)',
                    inCassette: inContext.score, alone: alone.score,
                    blocked: inContext.blocked, note: inContext.note,
                    // A drop of a third or more is worth a designer's attention. Below that the
                    // difference is inside the noise of a heuristic and flagging it would train
                    // people to ignore the flag.
                    degraded: inContext.score < alone.score * 0.67
                });
            }
            return out;
        };

        // ---- ordering ------------------------------------------------------------------------
        //
        // Junctional binding and release both depend on which epitope sits next to which, so
        // the order is a design variable. A greedy pass beats an exhaustive one here for the
        // honest reason that n! orderings of twenty epitopes is not a search anyone can run:
        // start from the highest-priority epitope and repeatedly append whichever remaining
        // epitope adds the least junctional binding, breaking ties on release.
        //
        // It is a heuristic and it is reported as one. The junction scan is run on the FINAL
        // cassette regardless, so what the report says is true of the construct that exists,
        // not of the search that produced it.
        const orderEpitopes = async (epitopes, spec, alleles, onProgress) => {
            const eps = epitopes.slice();
            if (eps.length < 3) return eps;
            const cost = async (a, b) => {
                // The seam between exactly two beads, scored on its own.
                const built = assemble(Object.assign({}, spec, { epitopes: [a, b], leader: '', trailer: '' }));
                const r = await scanJunctions(built.protein, built.segments, alleles, { lengths: [8, 9, 10, 11], classIILengths: [] });
                let c = 0;
                for (const j of r.junctions) c += (j.band === 'strong') ? 4 : 1;
                const ctx = contextCheck(built.protein, built.segments);
                for (const x of ctx) if (x.degraded) c += 2;
                return c;
            };
            const remaining = eps.slice(1);
            const order = [eps[0]];
            let step = 0;
            while (remaining.length) {
                let bestI = 0, bestC = Infinity;
                for (let i = 0; i < remaining.length; i++) {
                    const c = await cost(order[order.length - 1], remaining[i]);
                    if (c < bestC) { bestC = c; bestI = i; }
                    if (bestC === 0) break;
                }
                order.push(remaining.splice(bestI, 1)[0]);
                step++;
                if (typeof onProgress === 'function') { try { onProgress(Math.round(100 * step / eps.length)); } catch (e) { } }
            }
            return order;
        };

        // ---- the full transcript ----------------------------------------------------------
        const build = (protein, opts) => {
            const o = opts || {};
            const opt = GC.optimize(protein, {
                mode: o.mode || 'balanced',
                floor: o.floor,
                maxRun: o.maxRun,
                avoid: o.avoid
            });
            const utr5 = GC.cleanNt(o.utr5 || '');
            const utr3 = GC.cleanNt(o.utr3 || '');
            const kozak = (o.kozak === false) ? '' : PRESETS.OTHER.kozak.dna;
            const stops = (o.stops === false) ? '' : PRESETS.OTHER.stops.dna;
            const polyA = 'A'.repeat(Math.max(0, (typeof o.polyA === 'number') ? o.polyA : 120));
            const cds = opt.dna;
            const full = utr5 + kozak + cds + stops + utr3 + polyA;
            return {
                utr5: utr5, kozak: kozak, cds: cds, stops: stops, utr3: utr3, polyA: polyA,
                dna: full, rna: GC.toRna(full),
                optimisation: opt,
                // Where the coding sequence starts and ends inside the full transcript, so a
                // report can point at a position in the sequence people are looking at.
                cdsFrom: utr5.length + kozak.length,
                cdsTo: utr5.length + kozak.length + cds.length
            };
        };

        // ---- transcript QC --------------------------------------------------------------------
        //
        // Findings are severity-tagged. 'stop' means do not order this; 'warn' means a human
        // decides; 'note' is information that belongs on the record.
        const qc = (built, protein, opts) => {
            const o = opts || {};
            const f = [];
            const add = (sev, what, detail) => f.push({ severity: sev, what: what, detail: detail });

            const cds = built.cds;
            const full = built.dna;

            // Does the coding sequence still encode what was designed?
            const back = GC.translate(cds);
            if (back !== protein) {
                add('stop', 'The coding sequence does not translate back to the designed protein',
                    'This is a fault in the optimiser, not a design choice. Do not use this sequence.');
            }
            // An in-frame stop inside the CDS truncates everything after it.
            const internal = back.indexOf('*');
            if (internal >= 0 && internal < back.length - 1) {
                add('stop', 'In-frame stop codon inside the coding sequence at residue ' + (internal + 1),
                    'Everything after it is not translated.');
            }
            // A start codon in the 5ʹ UTR competes with the real one.
            const u5 = built.utr5;
            if (u5) {
                const aug = GC.findMotif(u5, 'ATG');
                if (aug.length) {
                    add('warn', 'Upstream AUG in the 5ʹ UTR (' + aug.length + ')',
                        'An upstream start codon initiates a short upstream ORF and reduces translation '
                        + 'of the real one. Positions: ' + aug.join(', ') + '.');
                }
            }
            if (!built.kozak && (o.kozak !== false)) add('note', 'No Kozak sequence', 'Translation initiation will be less efficient.');

            // Composition of the coding sequence.
            const g = GC.gc(cds), u = GC.uFraction(cds), cai = GC.cai(cds);
            add('note', 'Coding sequence composition',
                'GC ' + (g * 100).toFixed(1) + '%, U ' + (u * 100).toFixed(1) + '%, CAI ' + cai.toFixed(3) + ', ' + cds.length + ' nt.');
            if (g < 0.35) add('warn', 'Low GC in the coding sequence (' + (g * 100).toFixed(1) + '%)', 'AU-rich transcripts are less stable and translate less well.');
            if (g > 0.70) add('warn', 'High GC in the coding sequence (' + (g * 100).toFixed(1) + '%)', 'Above about 70% the sequence becomes hard to synthesise and structured enough to impede the ribosome.');

            // Windowed GC catches a local extreme a global figure hides.
            const wins = GC.gcWindows(cds, 50, 10);
            const hot = wins.filter((w) => w.gc > 0.80), cold = wins.filter((w) => w.gc < 0.25);
            if (hot.length) add('warn', 'GC above 80% in ' + hot.length + ' 50-nt window(s)', 'First at position ' + hot[0].at + ' of the coding sequence. Local GC extremes are the usual cause of a failed synthesis.');
            if (cold.length) add('warn', 'GC below 25% in ' + cold.length + ' 50-nt window(s)', 'First at position ' + cold[0].at + '.');

            // Anything the optimiser could not recode away.
            for (const un of (built.optimisation.unresolved || [])) {
                add('warn', 'Could not remove ' + un.what + ' at position ' + un.at + ' of the coding sequence',
                    un.why + '. No synonymous codon clears it -- the protein sequence itself would have to change.');
            }

            // Homopolymers across the whole transcript, excluding the poly(A) tail, which is
            // supposed to be a homopolymer.
            const body = built.dna.slice(0, built.dna.length - built.polyA.length);
            for (const b of ['A', 'C', 'G', 'T']) {
                const runs = GC.runsOf(body, b, 8);
                if (runs.length) add('warn', 'Run of ' + runs[0].len + ' consecutive ' + GC.toRna(b) + ' at position ' + runs[0].at,
                    'Long homopolymers slip during synthesis and during transcription.');
            }

            // A poly(A) signal inside the coding sequence truncates the transcript. Inside a
            // natural 3ʹ UTR it is expected and is not a finding.
            for (const sig of ['AATAAA', 'ATTAAA']) {
                for (const at of GC.findMotif(cds, sig)) {
                    add('warn', GC.toRna(sig) + ' inside the coding sequence at position ' + at, 'A cryptic polyadenylation signal truncates the transcript.');
                }
            }

            if (!built.polyA.length) add('warn', 'No poly(A) tail', 'The transcript will be rapidly degraded.');
            else if (built.polyA.length < 80) add('note', 'Poly(A) tail of ' + built.polyA.length + ' nt', 'Shorter than the 100-150 nt typically used.');

            add('note', 'Full transcript length', full.length + ' nt (' + built.cds.length + ' nt coding, ' + Math.round(protein.length) + ' residues).');
            if (full.length > 5000) add('warn', 'Transcript longer than 5 kb', 'Yield and integrity fall off with length in an in-vitro transcription run.');

            return f;
        };

        // ---- exports --------------------------------------------------------------------------
        const fasta = (name, seq, width) => {
            const w = width || 60;
            let out = '>' + name + '\n';
            for (let i = 0; i < seq.length; i += w) out += seq.substr(i, w) + '\n';
            return out;
        };

        return {
            assemble: assemble,
            segmentAt: segmentAt,
            scanJunctions: scanJunctions,
            contextCheck: contextCheck,
            orderEpitopes: orderEpitopes,
            build: build,
            qc: qc,
            fasta: fasta,
            GC: GC, HLA: HLA, EP: EP, PRESETS: PRESETS
        };
    })();
}
