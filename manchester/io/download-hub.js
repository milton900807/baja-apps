function (graph, layout) {

    // The Download library. A single bookshelf (baja/lib/shelf.js, the same idiom Navigate
    // uses) walked all the way down: the whole Workbench, then a track, then a class of
    // element (oligos, variants, annotations, the sequence), then a single oligo or variant.
    // Every level ends in a row of formats -- BED, JSON, CSV, XLSX, PDF -- and choosing one
    // downloads exactly the scope you are standing in.
    //
    // BED, JSON and CSV are plain text and are built and downloaded here. XLSX and PDF are
    // not, so the rows are posted to /export-table and the bytes come back base64 for the
    // browser to save. A scope that has no genomic coordinates (a bare sequence) hides BED.

    return (async () => {
        const host = window['env']['apiUrl'];

        // ---- small helpers --------------------------------------------------------------
        const safe = (s) => ('' + (s == null ? '' : s)).replace(/[^A-Za-z0-9_\- .]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'download';
        const num = (v) => (v == null || v === '' || isNaN(+v)) ? '' : +v;
        const trackChrom = (t) => (t && t.chr != null && ('' + t.chr) !== '') ? ('chr' + ('' + t.chr).replace(/^chr/i, '')) : '';
        const trackStrandSym = (t) => (t && t.strand == 1) ? '+' : (t && (t.strand == -1 || t.strand == 0) ? '-' : '.');

        // Download a text blob straight from the browser.
        const saveText = (text, filename, mime) => {
            try {
                const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8;' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch (e) { } }, 500);
            } catch (e) { try { graph.setError('Could not start the download: ' + e, 8); } catch (e2) { } }
        };
        // Rebuild a base64 payload from /export-table into a Blob and save it.
        const saveB64 = (b64, filename, mime) => {
            try {
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch (e) { } }, 500);
            } catch (e) { try { graph.setError('Could not save the file: ' + e, 8); } catch (e2) { } }
        };

        // Proper CSV: a value with a comma, quote or newline is quoted and its quotes doubled.
        const csvCell = (v) => {
            let s = (v == null) ? '' : (typeof v === 'object' ? JSON.stringify(v) : '' + v);
            if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
            return s;
        };
        const columnsOf = (rows) => {
            const seen = [];
            for (const r of rows) if (r && typeof r === 'object') for (const k of Object.keys(r)) if (seen.indexOf(k) < 0) seen.push(k);
            return seen;
        };
        const toCSV = (rows) => {
            const cols = columnsOf(rows);
            const head = cols.map(csvCell).join(',');
            const body = rows.map((r) => cols.map((c) => csvCell(r ? r[c] : '')).join(',')).join('\n');
            return head + '\n' + body;
        };
        // BED: chrom start end name score strand, one line per row that HAS a chrom + coords.
        const toBED = (bedRows) => bedRows
            .filter((b) => b && b.chrom && b.start !== '' && b.end !== '')
            .map((b) => [b.chrom, b.start, b.end, (b.name == null || b.name === '') ? '.' : ('' + b.name).replace(/\s+/g, '_'), (b.score == null || b.score === '') ? '.' : b.score, b.strand || '.'].join('\t'))
            .join('\n') + '\n';

        // ---- flatten the graph into rows / json / bed for a given scope -----------------
        const oligoRow = (t, o) => {
            const row = {
                track: t.name || '', chrom: trackChrom(t), strand: trackStrandSym(t),
                id: o.id != null ? o.id : '', name: o.name != null ? o.name : '',
                type: o.type != null ? o.type : '', start: num(o.xi), end: num(o.xf) !== '' ? num(o.xf) + 1 : '',
                structure: o.structure != null ? o.structure : '',
                sequence: o.sequence != null ? o.sequence : '',
                synthesisSequence: o.synthesisSequence != null ? o.synthesisSequence : ''
            };
            return row;
        };
        const oligoBed = (t, o) => ({
            chrom: trackChrom(t), start: num(o.xi), end: num(o.xf) !== '' ? num(o.xf) + 1 : '',
            name: (o.id != null ? o.id : (o.name || 'oligo')) + (o.synthesisSequence ? ('_' + o.synthesisSequence) : ''),
            score: '.', strand: trackStrandSym(t)
        });
        const snpRow = (t, v) => ({
            track: t.name || '', chrom: trackChrom(t), strand: trackStrandSym(t),
            id: v.id != null ? v.id : '', name: v.name != null ? v.name : '',
            type: v.type != null ? v.type : '', start: num(v.xi), end: num(v.xf) !== '' ? num(v.xf) : num(v.xi),
            ref: v.ref != null ? v.ref : '', alt: v.alt != null ? v.alt : '',
            clinsig: v.clinsig != null ? v.clinsig : '', condition: v.clindn != null ? v.clindn : '',
            gene: v.geneSymbol != null ? v.geneSymbol : ''
        });
        const snpBed = (t, v) => ({
            chrom: trackChrom(t), start: num(v.xi), end: num(v.xf) !== '' ? num(v.xf) : (num(v.xi) !== '' ? num(v.xi) + 1 : ''),
            name: (v.id || v.name || 'variant'), score: '.', strand: trackStrandSym(t)
        });
        const annRow = (t, a) => ({
            track: t.name || '', chrom: trackChrom(t), strand: trackStrandSym(t),
            name: a.name != null ? a.name : '', type: a.type != null ? a.type : '',
            start: num(a.gxi != null ? a.gxi : a.xi), end: num(a.gxf != null ? a.gxf : a.xf)
        });
        const annBed = (t, a) => ({
            chrom: trackChrom(t), start: num(a.gxi != null ? a.gxi : a.xi), end: num(a.gxf != null ? a.gxf : a.xf),
            name: (a.name || a.type || 'annotation'), score: '.', strand: trackStrandSym(t)
        });
        const trackSummaryRow = (t) => ({
            name: t.name || '', chrom: trackChrom(t), strand: trackStrandSym(t),
            track_type: t.track_type || '', gene: t.geneID || t.description || '',
            transcript: t.transcriptID || '',
            oligos: (t.oligos || []).length, variants: (t.snpindels || []).length,
            annotations: (t.annotations || []).length,
            sequence_length: (t.sequence || '').length
        });

        const tracks = () => (graph.track || []).filter(Boolean);

        // A "scope" is what a format row acts on: { base, title, hasCoords, rows(), bed(),
        // json(), sheets() }. rows/bed/json are computed lazily so opening the format row is
        // what walks the data, not building the shelf.
        const scopeWorkbench = () => ({
            base: safe((graph.file || 'workbench').replace(/\.baja$/i, '')) + '_all',
            title: 'Workbench — all tracks',
            hasCoords: true,
            json: () => ({ workbench: (graph.file || 'workbench'), tracks: tracks().map((t) => fullTrackJson(t)) }),
            rows: () => { const r = []; for (const t of tracks()) { for (const o of (t.oligos || [])) r.push(Object.assign({ level: 'oligo' }, oligoRow(t, o))); for (const v of (t.snpindels || [])) r.push(Object.assign({ level: 'variant' }, snpRow(t, v))); for (const a of (t.annotations || [])) r.push(Object.assign({ level: 'annotation' }, annRow(t, a))); } return r; },
            bed: () => { const b = []; for (const t of tracks()) { for (const o of (t.oligos || [])) b.push(oligoBed(t, o)); for (const v of (t.snpindels || [])) b.push(snpBed(t, v)); for (const a of (t.annotations || [])) b.push(annBed(t, a)); } return b; },
            sheets: () => [
                { name: 'Tracks', rows: tracks().map(trackSummaryRow) },
                { name: 'Oligos', rows: flat(tracks(), 'oligos', oligoRow) },
                { name: 'Variants', rows: flat(tracks(), 'snpindels', snpRow) },
                { name: 'Annotations', rows: flat(tracks(), 'annotations', annRow) }
            ]
        });
        const flat = (ts, key, fn) => { const r = []; for (const t of ts) for (const e of (t[key] || [])) r.push(fn(t, e)); return r; };
        const fullTrackJson = (t) => ({
            name: t.name || '', chr: t.chr, strand: t.strand, track_type: t.track_type || '',
            geneID: t.geneID || '', description: t.description || '', transcriptID: t.transcriptID || '',
            sequence: t.sequence || '',
            oligos: (t.oligos || []).map((o) => oligoRow(t, o)),
            variants: (t.snpindels || []).map((v) => snpRow(t, v)),
            annotations: (t.annotations || []).map((a) => annRow(t, a))
        });
        const scopeTrack = (t) => ({
            base: safe(t.name || 'track'), title: 'Track — ' + (t.name || ''), hasCoords: true,
            json: () => fullTrackJson(t),
            rows: () => { const r = []; for (const o of (t.oligos || [])) r.push(Object.assign({ level: 'oligo' }, oligoRow(t, o))); for (const v of (t.snpindels || [])) r.push(Object.assign({ level: 'variant' }, snpRow(t, v))); for (const a of (t.annotations || [])) r.push(Object.assign({ level: 'annotation' }, annRow(t, a))); return r; },
            bed: () => { const b = []; for (const o of (t.oligos || [])) b.push(oligoBed(t, o)); for (const v of (t.snpindels || [])) b.push(snpBed(t, v)); for (const a of (t.annotations || [])) b.push(annBed(t, a)); return b; },
            sheets: () => [
                { name: 'Track', rows: [trackSummaryRow(t)] },
                { name: 'Oligos', rows: (t.oligos || []).map((o) => oligoRow(t, o)) },
                { name: 'Variants', rows: (t.snpindels || []).map((v) => snpRow(t, v)) },
                { name: 'Annotations', rows: (t.annotations || []).map((a) => annRow(t, a)) }
            ]
        });
        const scopeList = (t, key, fn, bedFn, label) => ({
            base: safe((t.name || 'track') + '_' + label), title: (t.name || 'track') + ' — ' + label, hasCoords: !!bedFn,
            json: () => (t[key] || []).map((e) => fn(t, e)),
            rows: () => (t[key] || []).map((e) => fn(t, e)),
            bed: () => bedFn ? (t[key] || []).map((e) => bedFn(t, e)) : [],
            sheets: () => [{ name: label, rows: (t[key] || []).map((e) => fn(t, e)) }]
        });
        const scopeOne = (t, e, fn, bedFn, label, base) => ({
            base: safe(base), title: (t.name || 'track') + ' — ' + label, hasCoords: !!bedFn,
            json: () => fn(t, e), rows: () => [fn(t, e)], bed: () => bedFn ? [bedFn(t, e)] : [],
            sheets: () => [{ name: label, rows: [fn(t, e)] }]
        });
        const scopeSequence = (t) => ({
            base: safe((t.name || 'track') + '_sequence'), title: (t.name || 'track') + ' — sequence', hasCoords: false,
            fasta: () => '>' + (t.name || 'track') + (trackChrom(t) ? (' ' + trackChrom(t)) : '') + '\n' + ((t.sequence || '').match(/.{1,70}/g) || []).join('\n') + '\n',
            json: () => ({ track: t.name || '', chrom: trackChrom(t), strand: trackStrandSym(t), length: (t.sequence || '').length, sequence: t.sequence || '' }),
            rows: () => [{ track: t.name || '', chrom: trackChrom(t), length: (t.sequence || '').length, sequence: t.sequence || '' }],
            sheets: () => [{ name: 'Sequence', rows: [{ track: t.name || '', length: (t.sequence || '').length, sequence: t.sequence || '' }] }]
        });

        // ---- run a download for a scope + format ----------------------------------------
        const runFormat = async (scope, fmt) => {
            try {
                if (fmt === 'json') { saveText(JSON.stringify(scope.json(), null, 2), scope.base + '.json', 'application/json'); return; }
                if (fmt === 'csv') { saveText(toCSV(scope.rows()), scope.base + '.csv', 'text/csv'); return; }
                if (fmt === 'bed') {
                    if (scope.fasta) { saveText(scope.fasta(), scope.base + '.fasta', 'text/plain'); return; }
                    saveText(toBED(scope.bed()), scope.base + '.bed', 'text/plain'); return;
                }
                if (fmt === 'xlsx' || fmt === 'pdf') {
                    graph.setMessage(' Building the ' + fmt.toUpperCase() + '… ');
                    const payload = { format: fmt, filename: scope.base, title: scope.title, sheets: scope.sheets() };
                    const r = await POSTJSON(payload, host + '/export-table');
                    const body = (r && r.error && typeof r.error === 'object') ? r.error : r;
                    if (body && body.b64) { saveB64(body.b64, body.filename || (scope.base + '.' + fmt), body.mime); graph.setMessage(' ' + (body.filename || scope.base) + ' downloaded. '); }
                    else { graph.setError('Could not build the ' + fmt.toUpperCase() + ': ' + ((body && (body.error || body.message)) || 'server error'), 8); }
                    return;
                }
            } catch (e) { try { graph.setError('Download failed: ' + e, 8); } catch (e2) { } }
        };

        // Format leaves for a scope. A bare sequence has no genomic span, so its "BED" card is
        // relabelled FASTA (runFormat writes a FASTA when scope.fasta exists) and stays useful.
        const formatBooks = (scope) => {
            const books = [];
            if (scope.fasta) books.push({ title: 'FASTA', badge: '.fasta', leaf: true, blurb: 'The sequence in FASTA.', open: () => runFormat(scope, 'bed') });
            else if (scope.hasCoords) books.push({ title: 'BED', badge: '.bed', leaf: true, blurb: 'Genomic intervals, tab-separated.', open: () => runFormat(scope, 'bed') });
            books.push({ title: 'JSON', badge: '.json', leaf: true, blurb: 'The full structured record.', open: () => runFormat(scope, 'json') });
            books.push({ title: 'CSV', badge: '.csv', leaf: true, blurb: 'One row per item, comma-separated.', open: () => runFormat(scope, 'csv') });
            books.push({ title: 'Excel (XLSX)', badge: '.xlsx', leaf: true, blurb: 'A spreadsheet, one sheet per class.', open: () => runFormat(scope, 'xlsx') });
            books.push({ title: 'PDF', badge: '.pdf', leaf: true, blurb: 'A printable listing.', open: () => runFormat(scope, 'pdf') });
            return books;
        };

        // ---- build the shelf tree -------------------------------------------------------
        const trackChildren = (t) => {
            const kids = [
                { title: 'This track', badge: 'Summary', ready: true, blurb: 'The track and a count of everything on it.', books: () => formatBooks(scopeTrack(t)) }
            ];
            const nOl = (t.oligos || []).length, nV = (t.snpindels || []).length, nA = (t.annotations || []).length;
            if (nOl) kids.push({
                title: 'Oligos', badge: '' + nOl, ready: true, blurb: 'Every oligo on this track, or one at a time.',
                books: () => [{ title: 'All oligos', badge: '' + nOl, blurb: 'All ' + nOl + ' together.', books: () => formatBooks(scopeList(t, 'oligos', oligoRow, oligoBed, 'oligos')) }]
                    .concat((t.oligos || []).map((o, i) => ({ title: (o.id || o.name || ('oligo ' + (i + 1))), badge: (o.type || 'Oligo'), blurb: (o.sequence || o.structure || '').slice(0, 60) || 'A single oligo.', books: () => formatBooks(scopeOne(t, o, oligoRow, oligoBed, 'oligo', (t.name || 'track') + '_' + (o.id || ('oligo' + (i + 1))))) })))
            });
            if (nV) kids.push({
                title: 'Variants', badge: '' + nV, ready: true, blurb: 'SNPs and indels on this track, or one at a time.',
                books: () => [{ title: 'All variants', badge: '' + nV, blurb: 'All ' + nV + ' together.', books: () => formatBooks(scopeList(t, 'snpindels', snpRow, snpBed, 'variants')) }]
                    .concat((t.snpindels || []).map((v, i) => ({ title: (v.id || v.name || ('variant ' + (i + 1))), badge: (v.clinsig || v.type || 'Variant'), blurb: [v.ref, v.alt].filter(Boolean).join('>') || (v.clindn || 'A single variant.'), books: () => formatBooks(scopeOne(t, v, snpRow, snpBed, 'variant', (t.name || 'track') + '_' + (v.id || ('variant' + (i + 1))))) })))
            });
            if (nA) kids.push({
                title: 'Annotations', badge: '' + nA, ready: true, blurb: 'Features drawn on this track.',
                books: () => [{ title: 'All annotations', badge: '' + nA, blurb: 'All ' + nA + ' together.', books: () => formatBooks(scopeList(t, 'annotations', annRow, annBed, 'annotations')) }]
                    .concat((t.annotations || []).map((a, i) => ({ title: (a.name || a.type || ('annotation ' + (i + 1))), badge: (a.type || 'Feature'), blurb: 'A single annotation.', books: () => formatBooks(scopeOne(t, a, annRow, annBed, 'annotation', (t.name || 'track') + '_' + (a.name || ('annotation' + (i + 1))))) })))
            });
            if ((t.sequence || '').length) kids.push({ title: 'Sequence', badge: (t.sequence.length + ' nt'), ready: true, blurb: 'The track sequence as FASTA, JSON, CSV, XLSX or PDF.', books: () => formatBooks(scopeSequence(t)) });
            return kids;
        };

        // ---- compounds-only scope, and a detailed ASO report ----------------------------
        const allOligos = () => { const r = []; for (const t of tracks()) for (const o of (t.oligos || [])) r.push({ t: t, o: o }); return r; };
        const hasCompounds = () => tracks().some((t) => (t.oligos || []).length);
        const designBase = () => safe(('' + (graph.file || 'workbench')).replace(/\.baja$/i, ''));

        const scopeAllCompounds = () => ({
            base: designBase() + '_compounds',
            title: 'All compounds',
            hasCoords: true,
            json: () => allOligos().map((e) => oligoRow(e.t, e.o)),
            rows: () => allOligos().map((e) => oligoRow(e.t, e.o)),
            bed: () => allOligos().map((e) => oligoBed(e.t, e.o)),
            sheets: () => [{ name: 'Compounds', rows: allOligos().map((e) => oligoRow(e.t, e.o)) }]
        });

        // Off-target, summarised for a report cell. `offtarget` is an array of hits (its length
        // is the count), a raw count string for very large hit sets, or null; `offtargetsymbols`
        // names the genes hit; `offtargetsRun` says a search was actually done.
        const offSummary = (o) => {
            try {
                if (o.offtarget == null) return o.offtargetsRun ? 'run — 0 hits' : 'not run';
                if (Array.isArray(o.offtarget)) {
                    const syms = Array.isArray(o.offtargetsymbols) ? o.offtargetsymbols.filter(Boolean) : [];
                    const shown = syms.slice(0, 12).join(', ');
                    return o.offtarget.length + ' hit' + (o.offtarget.length === 1 ? '' : 's')
                        + (shown ? (' — ' + shown + (syms.length > 12 ? ', …' : '')) : '');
                }
                return '' + o.offtarget + ' hits';
            } catch (e) { return ''; }
        };
        const oligoAnnots = (o) => {
            try { return Array.isArray(o.annotations) ? o.annotations.map((a) => a && (a.name || a.type)).filter(Boolean).join('; ') : ''; }
            catch (e) { return ''; }
        };
        // One detailed row per ASO/compound, with everything a report wants to show.
        const asoReportRow = (t, o) => ({
            track: t.name || '', id: o.id != null ? o.id : '', name: o.name != null ? o.name : '',
            type: o.type || '', chrom: trackChrom(t), strand: trackStrandSym(t),
            start: num(o.xi), end: num(o.xf) !== '' ? num(o.xf) + 1 : '',
            length: (o.sequence || '').length || (num(o.xf) !== '' && num(o.xi) !== '' ? Math.abs(num(o.xf) - num(o.xi)) + 1 : ''),
            target_sequence: o.sequence != null ? o.sequence : '',
            synthesis_sequence: o.synthesisSequence != null ? o.synthesisSequence : '',
            chemistry: o.structure != null ? o.structure : '',
            off_target: offSummary(o),
            mismatches: (Array.isArray(o.mismatch) && o.mismatch.length) ? o.mismatch.join(', ') : '',
            annotations: oligoAnnots(o)
        });
        const downloadAsoReport = async () => {
            const rows = allOligos().map((e) => asoReportRow(e.t, e.o));
            if (!rows.length) { try { graph.setError('There are no compounds to report.', 6); } catch (e) { } return; }
            try { graph.setMessage(' Building the ASO report… '); } catch (e) { }
            const base = designBase() + '_ASO_report';
            const payload = { format: 'pdf', filename: base, title: 'ASO report — ' + designBase() + ' (' + rows.length + ' compound' + (rows.length === 1 ? '' : 's') + ')', sheets: [{ name: 'ASOs', rows: rows }] };
            try {
                const r = await POSTJSON(payload, host + '/export-table');
                const body = (r && r.error && typeof r.error === 'object') ? r.error : r;
                if (body && body.b64) { saveB64(body.b64, body.filename || (base + '.pdf'), body.mime); try { graph.setMessage(' ASO report downloaded. '); } catch (e) { } }
                else { try { graph.setError('Could not build the report: ' + ((body && (body.error || body.message)) || 'server error'), 8); } catch (e) { } }
            } catch (e) { try { graph.setError('Report failed: ' + e, 8); } catch (e2) { } }
        };

        const ts = tracks();
        const topBooks = [];
        if (hasCompounds()) {
            // Compounds are on the workbench, so put the downloads one click away: the format
            // cards for every compound sit at the top level, and a detailed ASO report beside
            // them. The whole-workbench-including-tracks-and-variants download stays available
            // as its own card below.
            topBooks.push({ title: 'Download all compounds', note: true });
            formatBooks(scopeAllCompounds()).forEach((b) => topBooks.push(b));
            topBooks.push({ title: 'Detailed ASO report', badge: '.pdf', ready: true, leaf: true, blurb: 'A per-ASO PDF: id, target and synthesis sequence, chemistry, off-target summary, mismatches, annotations and coordinates.', open: () => downloadAsoReport() });
            topBooks.push({ title: 'Everything (all tracks, variants, annotations)', badge: (ts.length + ' track' + (ts.length === 1 ? '' : 's')), ready: true, blurb: 'The whole canvas in one file, not just the compounds.', books: () => formatBooks(scopeWorkbench()) });
        } else {
            topBooks.push({ title: 'Whole workbench', badge: (ts.length + ' track' + (ts.length === 1 ? '' : 's')), ready: ts.length > 0, readyNote: 'Load a track first.', blurb: 'Everything on the canvas — all tracks and all their elements — in one file.', books: () => formatBooks(scopeWorkbench()) });
        }
        if (ts.length) topBooks.push({ title: 'By track', note: true });
        ts.forEach((t, i) => topBooks.push({
            title: (t.name || ('track ' + (i + 1))), badge: (t.track_type || 'Track'), ready: true,
            blurb: (t.geneID || t.description || t.transcriptID || '') + '  ·  '
                + [( (t.oligos || []).length + ' oligos'), ((t.snpindels || []).length + ' variants'), ((t.annotations || []).length + ' annotations')].join(', '),
            books: () => trackChildren(t)
        }));

        const __home = () => { try { graph.clearMouseListeners && graph.clearMouseListeners(); graph.setMouseMode && graph.setMouseMode('navigate'); exec('baja/manchester/menu/mouse-over-highlight.js', graph, layout); } catch (e) { } };
        await exec('baja/lib/shelf.js', {
            id: 'baja-download-library',
            title: 'Download',
            subtitle: 'Pick what to download, from the whole workbench down to a single item, then a format',
            graph: graph,
            onClose: () => { __home(); },
            books: topBooks
        });
    })();
}
