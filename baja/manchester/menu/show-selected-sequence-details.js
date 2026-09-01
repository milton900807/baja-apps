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
        if (!sequence || !('' + sequence).trim()) {
            try { graph.setMessage(' No sequence is selected on ' + (selectedTrack.name || 'this track') + '. '); } catch (e) { }
            return resolve(graph);
        }
        let stats = summarizeSequence(sequence);

        // ---- Maximised, themed, closeable window ---------------------------------------
        //
        // This used to mount a 1500px card into mainPanel, which meant it replaced the editor,
        // scrolled inside a fixed-height box, and closed by re-mounting a layout by hand. It is
        // now the same overlay the libraries and pickers use -- navy pane, pinned header, one
        // Close -- so it reads as part of the app rather than a page that took it over, and the
        // canvas is untouched underneath.
        //
        // The numbers are unchanged: everything below comes from summarizeSequence().
        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const len = stats.length || 0;
        const c = stats.counts || { A: 0, C: 0, G: 0, T: 0, U: 0, N: 0, other: 0 };
        const pct = (n) => len ? formatPercent(100 * n / len, 1) : '0.0%';
        const warnings = synthesisWarnings(stats);
        const maxHomo = Math.max.apply(null, Object.values(stats.longest_homopolymers || { A: 0 }));

        // The four numbers a designer looks at first, called out as cards above the tables.
        // Length, GC, Tm and complexity are what decide whether a sequence is worth carrying
        // forward; everything else is detail you consult after those pass.
        const headline = [
            { k: 'Length', v: len + ' nt' },
            { k: 'GC', v: formatPercent(stats.gc_percent, 1) },
            { k: 'Tm (GC approx)', v: formatFloat(stats.tm_gcapprox_c, 1) + ' °C' },
            { k: 'Complexity', v: formatFloat(stats.entropy_bits, 2) + ' bits' }
        ].map((x) => '<div style="flex:1 1 140px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);'
            + 'border-radius:10px;padding:12px 14px;">'
            + '<div style="font:11px Arial;letter-spacing:1.2px;text-transform:uppercase;color:#8fa9c4;">' + esc(x.k) + '</div>'
            + '<div style="font:700 22px Arial;margin-top:4px;">' + esc(x.v) + '</div></div>').join('');

        const rows = (pairs) => '<table style="width:100%;border-collapse:collapse;font:13px Arial;">'
            + pairs.map((p2) => '<tr>'
                + '<td style="padding:6px 10px;color:#9fb3c8;width:46%;vertical-align:top;">' + esc(p2[0]) + '</td>'
                + '<td style="padding:6px 10px;vertical-align:top;">' + p2[1] + '</td></tr>').join('')
            + '</table>';

        const section = (title, body) => '<div style="margin-top:18px;">'
            + '<div style="font:700 12px Arial;letter-spacing:1.4px;text-transform:uppercase;color:#7f9bb8;'
            + 'border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:6px;margin-bottom:8px;">' + esc(title) + '</div>'
            + body + '</div>';

        const topDinucs = topNEntries(stats.dinucleotide_counts || {}, 10).map((e) => e[0] + ':' + e[1]).join(', ') || '<i>n/a</i>';
        const orfHtml = (stats.orfs && stats.orfs.length)
            ? '<ul style="margin:4px 0 0 18px;font:13px Arial;">' + stats.orfs.map((o) => '<li>Frame ' + o.frame + ', ' + o.aa + ' aa (nt ' + o.start + '–' + o.stop + ')</li>').join('') + '</ul>'
            : '<i style="color:#9fb3c8;">None detected (or RNA / non-DNA input)</i>';
        // Flags are the one section that should catch the eye, so they are amber rather than
        // another grey table -- they are the reason to NOT order this sequence.
        const warnHtml = warnings.length
            ? '<ul style="margin:4px 0 0 18px;font:13px Arial;color:#ffd98a;">' + warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>'
            : '<i style="color:#7fd6a8;">No major heuristic flags</i>';

        const body = ''
            + '<div style="display:flex;gap:12px;flex-wrap:wrap;">' + headline + '</div>'
            + section('Composition', rows([
                ['A', c.A + ' (' + pct(c.A) + ')'], ['C', c.C + ' (' + pct(c.C) + ')'],
                ['G', c.G + ' (' + pct(c.G) + ')'], ['T', c.T + ' (' + pct(c.T) + ')'],
                ['U', c.U + ' (' + pct(c.U) + ')'], ['N', c.N + ' (' + pct(c.N) + ')'],
                ['Other IUPAC / unknown', c.other + ' (' + pct(c.other) + ')'],
                ['Ambiguous / non-canonical', '' + stats.ambiguous],
                ['Type', esc(stats.type)]
            ]))
            + section('Stability & structure', rows([
                ['GC clamp (last ' + stats.gc_clamp.k + ')', stats.gc_clamp.gc + '/' + stats.gc_clamp.k + ' (' + formatPercent(stats.gc_clamp.pct, 0) + ')'],
                ['Longest homopolymer', maxHomo + '  (A:' + stats.longest_homopolymers.A + ' C:' + stats.longest_homopolymers.C
                    + ' G:' + stats.longest_homopolymers.G + ' T:' + stats.longest_homopolymers.T + ' U:' + stats.longest_homopolymers.U + ')'],
                ['Max base fraction', formatPercent(100 * stats.max_base_fraction, 1)],
                ['k-mer diversity (k=4)', formatPercent(100 * stats.kmer_diversity_k4, 0)],
                ['Palindromes (k=6)', '' + stats.palindromes_k6],
                ['Tm (Wallace, crude)', formatFloat(stats.tm_wallace_c, 1) + ' °C']
            ]))
            + section('Motifs', rows([
                ['Poly-A (≥8)', stats.polyA_8 ? 'Yes' : 'No'],
                ['Poly-T (≥8)', stats.polyT_8 ? 'Yes' : 'No'],
                ['Poly-U (≥8)', stats.polyU_8 ? 'Yes' : 'No'],
                ['Top dinucleotides', esc(topDinucs)]
            ]))
            + section('ORFs (DNA only, ≥30 aa)', orfHtml)
            + section('Lab / synthesis flags', warnHtml)
            + section('Sequence', '<pre style="white-space:pre-wrap;word-break:break-all;font:12px monospace;'
                + 'background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px;margin:0;">'
                + esc(stats.seq) + '</pre>')
            + section('Reverse complement', '<pre style="white-space:pre-wrap;word-break:break-all;font:12px monospace;'
                + 'background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px;margin:0;">'
                + esc(reverseComplement(stats.seq)) + '</pre>');

        try {
            const ID = 'baja-seq-details';
            const old = document.getElementById(ID);
            if (old && old.parentNode) old.parentNode.removeChild(old);

            const overlay = document.createElement('div');
            overlay.id = ID;
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483350;background:rgba(6,14,26,0.72);'
                + 'display:flex;align-items:stretch;justify-content:center;padding:22px;font-family:Arial,Helvetica,sans-serif;';

            const pane = document.createElement('div');
            pane.style.cssText = 'width:100%;max-width:900px;height:100%;display:flex;flex-direction:column;'
                + 'background:#0b2545;color:#e8f0fb;border:1px solid rgba(255,255,255,0.14);border-radius:12px;'
                + 'box-shadow:0 24px 60px rgba(0,0,0,0.5);overflow:hidden;';

            const head = document.createElement('div');
            head.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:14px 20px;'
                + 'border-bottom:1px solid rgba(255,255,255,0.12);';
            head.innerHTML = '<div><div style="font:700 17px Arial;">Selected sequence</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;">' + esc(selectedTrack.name || 'track')
                + ' · ' + len + ' nt · ' + esc(stats.type) + '</div></div>';
            const x = document.createElement('button');
            x.textContent = '✕ Close';
            x.style.cssText = 'margin-left:auto;cursor:pointer;border-radius:8px;padding:8px 14px;font:700 12.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;';
            head.appendChild(x);

            const scroll = document.createElement('div');
            scroll.style.cssText = 'flex:1 1 auto;overflow:auto;padding:18px 20px 26px;';
            scroll.innerHTML = body;

            let onKey = null;
            const close = () => {
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
                // Hand the canvas back the way everything else does.
                try { graph.clearMouseListeners(); } catch (e) { }
                try { graph.setMouseMode('navigate'); } catch (e) { }
                try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
            };
            onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
            x.onclick = close;
            overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
            document.addEventListener('keydown', onKey, true);

            pane.appendChild(head); pane.appendChild(scroll);
            overlay.appendChild(pane);
            document.body.appendChild(overlay);
        } catch (e) {
            try { graph.setMessage(' Could not show the sequence details: ' + e + ' '); } catch (e2) { }
        }

        return resolve(graph);
    });
}
