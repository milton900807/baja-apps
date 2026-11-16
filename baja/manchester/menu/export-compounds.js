function (graph, opts) {

    // EXPORT COMPOUNDS TO A FILE.
    //   const r = await exec('baja/manchester/menu/export-compounds.js', graph,
    //                        { format: 'idt', scope: 'selected' });
    //
    // format: 'idt'   the IDT order codes, through baja/chem/structure/idt/idt-format.js
    //         'csv'   the design table: sequence, chemistry, score, GC, Tm, off-targets
    //         'fasta' sequences only
    // scope:  'selected' | 'all'   (selected, when anything is)
    //
    // Returns { wrote, skipped, reasons, file } and writes the file.
    //
    // IT REPORTS WHAT IT COULD NOT WRITE. The IDT path needs a compound's structure, and
    // the existing export dropped anything without one and said nothing: ask for 47 and
    // get a 31-row order file, with no indication which sixteen went missing or why. For
    // a file someone orders oligos from that is the worst possible failure, because the
    // output looks complete. So every compound left out is counted, with its reason, and
    // the caller is handed both numbers.
    return (async () => {
        const F = await exec('baja/bio/compound-filter.js');
        const o = opts || {};
        const format = ('' + (o.format || 'csv')).toLowerCase();

        const tracks = (graph.track || []).filter(Boolean);
        const all = [];
        for (const t of tracks) for (const c of (t.oligos || [])) all.push({ o: c, t: t });

        // The same union the rest of the editor uses: a compound picked with the lasso and
        // one picked by a filter are both "selected", and a person looking at a selection
        // does not know which store it went into.
        const selectedSet = () => {
            const s = new Set();
            for (const e of (graph.__lassoSelection || [])) { if (e && e.kind === 'oligo' && e.ref) s.add(e.ref); }
            for (const e of (graph.selectedCompounds || [])) { if (e && e.o) s.add(e.o); }
            return s;
        };
        const sel = selectedSet();
        const wantSelected = (o.scope === 'selected') || (o.scope !== 'all' && sel.size > 0);
        const rows = wantSelected ? all.filter((r) => sel.has(r.o)) : all;

        if (!rows.length) {
            return { wrote: 0, skipped: 0, reasons: {}, file: null,
                note: wantSelected ? 'nothing is selected' : 'there are no compounds to export' };
        }

        const stem = ('' + (graph.file || (tracks[0] && tracks[0].name) || 'compounds'))
            .replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-') || 'compounds';
        const seqOf = (c) => ('' + (c.sequence || c.seq || '')).trim();
        const nameOf = (c, i) => ('' + (c.name || c.id || ('compound-' + (i + 1)))).trim();

        const skipped = {};
        const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };

        // CSV WRITTEN HERE RATHER THAN THROUGH downloadAsCsv. That helper joins fields with
        // commas and quotes nothing, so one flag_reason of "GC outside preferred range, Long
        // G run" silently shifts every later column of that row. For a table someone reads
        // numbers off, or feeds to a synthesis order, a column shifted by one is worse than
        // no file at all, because it still parses.
        const cell = (v) => {
            if (v == null) return '';
            const t = '' + v;
            return /[",\r\n]/.test(t) ? ('"' + t.replace(/"/g, '""') + '"') : t;
        };
        const toCsv = (list) => {
            const keys = Object.keys(list[0]);
            return keys.join(',') + '\n'
                + list.map((r) => keys.map((k) => cell(r[k])).join(',')).join('\n') + '\n';
        };
        const writeCsv = (list, name) => { downloadAsText(toCsv(list), name); return name; };

        let wrote = 0, file = null;

        if (format === 'idt') {
            const idt = await exec('baja/chem/structure/idt/idt-format.js');
            const out = [];
            let n = 0;
            for (const r of rows) {
                const c = r.o;
                // A plate well per compound, filled down the columns the way a 96-well plate
                // is filled: A1..H1, then A2. The old export counted to 12 and reset, which
                // numbered the ROW and lettered the COLUMN, so a 96-well order came back
                // transposed.
                const well = String.fromCharCode(65 + (n % 8)) + (Math.floor(n / 8) + 1);
                if (!c.structure) { skip('no chemistry on the compound'); continue; }
                // formatStrict, not format: it refuses a sugar it has no code for instead of
                // falling through to the bare base. That fall-through is how a 2'-OMe/2'-F
                // siRNA was exporting as an unmodified oligo, in a file that looked complete.
                let code = '', why = null;
                try {
                    const res = idt.formatStrict(c.structure);
                    code = (res && res.idt) || '';
                    if (res && res.problems && res.problems.length) why = res.problems[0];
                } catch (e) { why = 'the chemistry could not be read'; }
                if (why) { skip(why); continue; }
                if (!code) { skip('the chemistry produced no IDT codes'); continue; }
                out.push({ well: well, name: nameOf(c, n), id: c.id || '', sequence: seqOf(c), idt: code });
                n++; wrote++;
            }
            if (out.length) { file = writeCsv(out, 'idt-' + stem + '.csv'); }
        } else if (format === 'fasta') {
            const lines = [];
            for (let i = 0; i < rows.length; i++) {
                const c = rows[i].o, s = seqOf(c);
                if (!s) { skip('no sequence on the compound'); continue; }
                lines.push('>' + nameOf(c, i).replace(/\s+/g, '_') + '\n' + s);
                wrote++;
            }
            if (lines.length) { file = stem + '-compounds.fasta'; downloadAsText(lines.join('\n') + '\n', file); }
        } else {
            // The design table. Read through compound-filter's accessors, so a column here
            // and the criterion you filtered by are the same number: a CSV saying GC 48
            // beside a filter that called it 52 would be two answers to one question.
            const out = [];
            for (let i = 0; i < rows.length; i++) {
                const c = rows[i].o, t = rows[i].t;
                const sites = F.offtargetSitesOf(c), genes = F.offtargetGenesOf(c);
                out.push({
                    name: nameOf(c, i),
                    track: (t && t.name) || '',
                    sequence: seqOf(c),
                    length: F.lenOf(c),
                    modality: F.modalityOf(c) || '',
                    chemistry: ('' + (c.structure || '')),
                    score: F.scoreOf(c),
                    gc_percent: F.gcOf(c),
                    tm_c: F.tmOf(c),
                    // EMPTY, NOT 0, WHEN THE SCREEN WAS NEVER RUN. A zero in an off-target
                    // column of a file someone reads later is a claim that the compound is
                    // clean, and nobody checked.
                    offtarget_screened: F.screenedOf(c) ? 'yes' : 'no',
                    offtarget_sites: sites == null ? '' : sites,
                    offtarget_genes: genes == null ? '' : genes,
                    flagged: F.isRed(c) ? 'yes' : 'no',
                    flag_reason: ('' + (c.flagReason || '')).replace(/\s+/g, ' ').trim()
                });
                wrote++;
            }
            if (out.length) { file = writeCsv(out, stem + '-compounds.csv'); }
        }

        const skippedTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
        return { wrote: wrote, skipped: skippedTotal, reasons: skipped, file: file,
            scope: wantSelected ? 'selected' : 'all', total: rows.length };
    })();
}
