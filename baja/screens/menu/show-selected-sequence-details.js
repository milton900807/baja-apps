function (selectedTrack, graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        function normalizeSeq(seq) {
            if (!seq) return '';

            if (typeof seq !== 'string') seq = seq.sequence || seq.seq || seq.bases || `${seq}`;
            return seq.toUpperCase().replace(/\s+/g, '');
        }

        function baseCounts(seq) {
            const counts = { A: 0, C: 0, G: 0, T: 0, U: 0, N: 0, other: 0 };
            for (const ch of seq) {
                if (counts[ch] !== undefined) counts[ch]++;
                else if ("RYSWKMBDHV".includes(ch)) counts.other++;
                else counts.other++;
            }
            return counts;
        }

        function guessType(counts) {
            if (counts.U > 0 && counts.T === 0) return "RNA";
            if (counts.T > 0 && counts.U === 0) return "DNA";
            if (counts.T > 0 && counts.U > 0) return "Mixed (T+U)";
            return "Unknown";
        }

        function gcPercent(counts, len) {
            const gc = counts.G + counts.C;
            return len ? (100 * gc / len) : 0;
        }

        function longestHomopolymers(seq) {
            const bases = ["A", "C", "G", "T", "U", "N"];
            const res = {};
            for (const b of bases) res[b] = 0;

            let currentChar = null, run = 0;
            for (const ch of seq) {
                if (ch === currentChar) run++;
                else { currentChar = ch; run = 1; }
                if (res[currentChar] !== undefined) res[currentChar] = Math.max(res[currentChar], run);
            }
            return res;
        }

        function gcClamp(seq, k = 5) {
            const tail = seq.slice(-k);
            let gc = 0;
            for (const ch of tail) if (ch === "G" || ch === "C") gc++;
            return { k, gc, pct: tail.length ? (100 * gc / tail.length) : 0 };
        }

        function shannonEntropy(seq) {
            const len = seq.length;
            if (!len) return 0;
            const counts = baseCounts(seq);
            const keys = ["A", "C", "G", "T", "U", "N"];
            let H = 0;
            for (const k of keys) {
                const p = counts[k] / len;
                if (p > 0) H -= p * Math.log2(p);
            }
            return H;
        }

        function reverseComplement(seq) {

            const map = { A: 'T', T: 'A', U: 'A', C: 'G', G: 'C', N: 'N' };
            return seq.split('')
                .reverse()
                .map(b => map[b] || 'N')
                .join('');
        }

        function palindromeCount(seq, k = 6) {
            let count = 0;
            for (let i = 0; i <= seq.length - k; i++) {
                const sub = seq.slice(i, i + k);
                if (sub === reverseComplement(sub)) count++;
            }
            return count;
        }

        function tmWallace(counts) {

            return 2 * (counts.A + counts.T + counts.U) + 4 * (counts.G + counts.C);
        }

        function tmGCApprox(gcPct) {

            return 64.9 + 41 * (gcPct / 100 - 0.16);
        }

        function maxBaseFraction(counts, len) {
            if (!len) return 0;
            return Math.max(counts.A, counts.C, counts.G, counts.T, counts.U) / len;
        }

        function kmerDiversity(seq, k = 4) {
            if (seq.length < k) return 0;
            const set = new Set();
            for (let i = 0; i <= seq.length - k; i++) set.add(seq.slice(i, i + k));
            return set.size / (seq.length - k + 1);
        }

        function dinucleotideCounts(seq) {
            const map = {};
            for (let i = 0; i < seq.length - 1; i++) {
                const d = seq.slice(i, i + 2);
                map[d] = (map[d] || 0) + 1;
            }
            return map;
        }

        function topNEntries(obj, n = 10) {
            return Object.entries(obj)
                .sort((a, b) => b[1] - a[1])
                .slice(0, n);
        }

        function hasPolyRun(seq, base, min = 8) {
            return seq.includes(base.repeat(min));
        }

        function findORFs(seq, minAA = 30) {

            const starts = ["ATG"];
            const stops = ["TAA", "TAG", "TGA"];
            const orfs = [];

            for (let frame = 0; frame < 3; frame++) {
                for (let i = frame; i < seq.length - 2; i += 3) {
                    if (starts.includes(seq.slice(i, i + 3))) {
                        for (let j = i + 3; j < seq.length - 2; j += 3) {
                            if (stops.includes(seq.slice(j, j + 3))) {
                                const lenAA = (j - i) / 3;
                                if (lenAA >= minAA) orfs.push({ frame, start: i, stop: j + 3, aa: lenAA });
                                break;
                            }
                        }
                    }
                }
            }
            return orfs;
        }

        function formatPercent(x, digits = 1) {
            return `${x.toFixed(digits)}%`;
        }

        function formatFloat(x, digits = 2) {
            return Number.isFinite(x) ? x.toFixed(digits) : `${x}`;
        }

        function synthesisWarnings(stats) {
            const warnings = [];
            const maxHomo = Math.max(...Object.values(stats.longest_homopolymers || { A: 0, C: 0, G: 0, T: 0, U: 0, N: 0 }));
            if (stats.gc_percent < 25 || stats.gc_percent > 75) warnings.push("Extreme GC content (<25% or >75%)");
            if (stats.entropy_bits < 1.5) warnings.push("Low sequence complexity (entropy < 1.5)");
            if (maxHomo >= 8) warnings.push("Long homopolymer run (≥ 8)");
            if (stats.palindromes_k6 > 0) warnings.push("Contains palindromic 6-mers (hairpin risk heuristic)");
            if (stats.ambiguous > 0) warnings.push("Contains ambiguous / non-canonical bases");
            return warnings;
        }

        function summarizeSequence(seqRaw) {
            const seq = normalizeSeq(seqRaw);
            const len = seq.length;
            const counts = baseCounts(seq);
            const type = guessType(counts);
            const gc = gcPercent(counts, len);
            const clamp = gcClamp(seq, 5);
            const homos = longestHomopolymers(seq);
            const entropy = shannonEntropy(seq);
            const canonical = counts.A + counts.C + counts.G + counts.T + counts.U;
            const ambiguous = Math.max(0, len - canonical);
            const maxBaseFrac = maxBaseFraction(counts, len);
            const kdiv4 = kmerDiversity(seq, 4);
            const pal6 = palindromeCount(seq, 6);
            const dinucs = dinucleotideCounts(seq);

            const tm_wallace = tmWallace(counts);
            const tm_gc = tmGCApprox(gc);

            const orfs = (counts.U === 0) ? findORFs(seq, 30) : [];

            return {
                seq,
                length: len,
                type,
                counts,
                ambiguous,
                gc_percent: gc,
                gc_clamp: clamp,
                longest_homopolymers: homos,
                entropy_bits: entropy,
                max_base_fraction: maxBaseFrac,
                kmer_diversity_k4: kdiv4,
                palindromes_k6: pal6,
                tm_wallace_c: tm_wallace,
                tm_gcapprox_c: tm_gc,
                polyA_8: hasPolyRun(seq, "A", 8),
                polyT_8: hasPolyRun(seq, "T", 8),
                polyU_8: hasPolyRun(seq, "U", 8),
                dinucleotide_counts: dinucs,
                orfs
            };
        }

        function renderSummaryHTML(stats) {
            const len = stats.length || 0;
            const c = stats.counts || { A: 0, C: 0, G: 0, T: 0, U: 0, N: 0, other: 0 };

            const pct = (n) => len ? formatPercent(100 * n / len, 1) : "0.0%";
            const row = (label, value) =>
                `<tr><td style="padding:4px 10px; vertical-align:top;"><b>${label}</b></td><td style="padding:4px 10px; vertical-align:top;">${value}</td></tr>`;

            const topDinucs = topNEntries(stats.dinucleotide_counts || {}, 10)
                .map(([k, v]) => `${k}:${v}`)
                .join(', ') || '<i>n/a</i>';

            const maxHomo = Math.max(...Object.values(stats.longest_homopolymers || { A: 0, C: 0, G: 0, T: 0, U: 0, N: 0 }));
            const warnings = synthesisWarnings(stats);

            const rc = reverseComplement(stats.seq);
            const orfHtml = (stats.orfs && stats.orfs.length)
                ? `<ul style="margin:6px 0 0 18px;">${stats.orfs.map(o => `<li>Frame ${o.frame}, ${o.aa} aa (nt ${o.start}–${o.stop})</li>`).join('')
                }</ul>`
                : `<i>None detected (or RNA / non-DNA input)</i>`;

            const warnHtml = warnings.length
                ? `<ul style="margin:6px 0 0 18px;">${warnings.map(w => `<li>${w}</li>`).join('')}</ul>`
                : `<i>No major heuristic flags</i>`;

            return `
    <h6>Sequence properties</h6>
    <table style="width:100%; border-collapse:collapse;">
      ${row("Length", `${len} nt`)}
      ${row("GC%", formatPercent(stats.gc_percent, 1))}
      ${row("A", `${c.A} (${pct(c.A)})`)}
      ${row("C", `${c.C} (${pct(c.C)})`)}
      ${row("G", `${c.G} (${pct(c.G)})`)}
      ${row("T", `${c.T} (${pct(c.T)})`)}
      ${row("U", `${c.U} (${pct(c.U)})`)}
      ${row("N", `${c.N} (${pct(c.N)})`)}
      ${row("Other IUPAC/unknown", `${c.other} (${pct(c.other)})`)}
      ${row("Ambiguous / non-canonical total", `${stats.ambiguous}`)}
    </table>

    <h6 style="margin-top:14px;">Stability & structure heuristics</h6>
    <table style="width:100%; border-collapse:collapse;">
      ${row(`GC clamp (last ${stats.gc_clamp.k})`, `${stats.gc_clamp.gc}/${stats.gc_clamp.k} (${formatPercent(stats.gc_clamp.pct, 0)})`)}
      ${row("Longest homopolymer run", `${maxHomo} (A:${stats.longest_homopolymers.A}, C:${stats.longest_homopolymers.C}, G:${stats.longest_homopolymers.G}, T:${stats.longest_homopolymers.T}, U:${stats.longest_homopolymers.U})`)}
      ${row("Complexity (Shannon entropy)", `${formatFloat(stats.entropy_bits, 2)} bits/symbol`)}
      ${row("Max base fraction", formatPercent(100 * stats.max_base_fraction, 1))}
      ${row("k-mer diversity (k=4)", formatPercent(100 * stats.kmer_diversity_k4, 0))}
      ${row("Palindromes (k=6)", `${stats.palindromes_k6}`)}
      ${row("Tm (Wallace, crude)", `${formatFloat(stats.tm_wallace_c, 1)} °C`)}
      ${row("Tm (GC approx, crude)", `${formatFloat(stats.tm_gcapprox_c, 1)} °C`)}
    </table>

    <h6 style="margin-top:14px;">Motifs</h6>
    <table style="width:100%; border-collapse:collapse;">
      ${row("Poly-A (≥8)", stats.polyA_8 ? "Yes" : "No")}
      ${row("Poly-T (≥8)", stats.polyT_8 ? "Yes" : "No")}
      ${row("Poly-U (≥8)", stats.polyU_8 ? "Yes" : "No")}
      ${row("Top dinucleotides", topDinucs)}
    </table>

    <h6 style="margin-top:14px;">ORFs (DNA only, ≥30 aa)</h6>
    ${orfHtml}

    <h6 style="margin-top:14px;">Lab / synthesis flags</h6>
    ${warnHtml}

    <h6 style="margin-top:14px;">Reverse complement</h6>
    <pre style="white-space:pre-wrap; word-break:break-word; font-size:11px; padding:8px; border:1px solid #ddd; border-radius:6px;">${rc}</pre>
  `;
        }

        let sequence = selectedTrack.getHighlightedSequence();
        let stats = summarizeSequence(sequence);
        let summaryHtml = renderSummaryHTML(stats);

        let html = `<hr><h5>Sequence summary...</h5>${summaryHtml}`;

        let wg = {
            wid: 'card',
            componentRef: 'bt',
            data: {
                height: '1500px',
                cards: [
                    [

                        {
                            title: '',
                            width: '100%',
                            component: {
                                wid: 'mt-button',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Close',
                                            ionFunction: createIonFunction(() => {
                                                CurrentLayout.clearComponent('mainPanel');
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            title: '',
                            width: '100%',
                            component: { wid: 'html', data: `${html}` }
                        },
                        {
                            title: '',
                            width: '100%',
                            component: {
                                wid: 'mt-button',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Close',
                                            ionFunction: createIonFunction(() => {
                                                CurrentLayout.clearComponent('mainPanel');
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                ]
            }
        };

        graph.setMouseMode("navigate");
        CurrentLayout.clearComponent('mainPanel');
        CurrentLayout.setComponent('mainPanel', wg);

    })

}
