function (graph, genegraph_panel_layout, oligoList) {

    // Export the given oligos — their identity, genomic coordinates and every
    // off-target hit — as a CSV the browser downloads. Called from the "Download
    // off-targets (CSV)" menu item next to "Run off-targets"; oligoList is either
    // the selected oligos or (when nothing is selected) all oligos on the tracks.

    const list = Array.isArray(oligoList) ? oligoList.filter(Boolean) : [];
    if (!list.length) {
        try { graph.setMessage(' No oligos to export. '); } catch (e) { }
        return;
    }

    // ---- helpers --------------------------------------------------------------

    // Find the track that owns an oligo (oligos don't reliably back-reference
    // their track), so we can read chr/strand and map to genomic coordinates.
    const trackOf = (o) => {
        try {
            for (const t of (graph.track || [])) {
                if ((t.oligos || []).indexOf(o) >= 0) return t;
            }
        } catch (e) { }
        return null;
    };

    // Best-effort transcript(local) → genomic mapper for a track, built from its
    // Exon annotations (each carries transcript xi/xf and genomic gxi/gxf). Returns
    // null when the track has no usable exon map, in which case genomic columns
    // are left blank and only transcript coordinates are exported.
    const localToGenomicFor = (track) => {
        if (!track) return null;
        const exons = (track.annotations || []).filter(
            (a) => a && a.type === 'Exon' && a.gxi != null && a.gxf != null && a.xi != null && a.xf != null);
        if (!exons.length) return null;
        return (x) => {
            for (const e of exons) {
                const lo = Math.min(e.xi, e.xf), hi = Math.max(e.xi, e.xf);
                if (x >= lo && x <= hi) {
                    const span = (e.xf - e.xi);
                    if (span === 0) return Math.round(e.gxi);
                    return Math.round(e.gxi + (e.gxf - e.gxi) * ((x - e.xi) / span));
                }
            }
            return null;
        };
    };

    // Distinct off-target GENE count (same gene across many isoforms counts once),
    // matching the on-canvas badge.
    const geneCount = (o) => {
        const v = o && o.offtarget;
        if (v == null) return 0;
        if (Array.isArray(v)) {
            const n = new Set(v.map((h) => h && h.symbol).filter(Boolean)).size;
            if (n) return n;
            return (o.offtargetsymbols && o.offtargetsymbols.length) || v.length;
        }
        // String count (hit list was too large to enumerate).
        if (o.offtargetsymbols && o.offtargetsymbols.length) return o.offtargetsymbols.length;
        const p = parseInt(v, 10);
        return isNaN(p) ? 0 : p;
    };

    const seqOf = (o) => (o && (o.synthesisSequence || o.sequence || o.guide || o.sense)) || '';
    const nameOf = (o) => (o && (o.name || o.id)) || 'oligo';

    const esc = (d) => {
        if (d == null) return '';
        const s = '' + d;
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    // ---- build rows -----------------------------------------------------------

    const header = [
        'oligo_name', 'track', 'transcript_id', 'chr', 'strand',
        'oligo_start_tx', 'oligo_end_tx', 'oligo_start_genomic', 'oligo_end_genomic',
        'sequence', 'offtarget_gene_count', 'offtarget_symbols',
        'hit_chr', 'hit_start', 'hit_end', 'hit_strand', 'hit_editdistance', 'hit_gene',
    ];
    const rows = [header.map(esc).join(',')];

    let totalHits = 0, oligosWithHits = 0;

    for (const o of list) {
        const track = trackOf(o);
        const toGen = localToGenomicFor(track);
        const txLo = Math.min(o.xi, o.xf), txHi = Math.max(o.xi, o.xf);
        const gA = toGen ? toGen(o.xi) : null;
        const gB = toGen ? toGen(o.xf) : null;
        const gLo = (gA != null && gB != null) ? Math.min(gA, gB) : (gA != null ? gA : gB);
        const gHi = (gA != null && gB != null) ? Math.max(gA, gB) : gLo;

        const base = [
            nameOf(o),
            (track && track.name) || '',
            (track && track.transcriptID) || '',
            (track && track.chr) || o.chr || '',
            (track ? track.strand : (o.strand != null ? o.strand : '')),
            txLo, txHi,
            (gLo != null ? gLo : ''), (gHi != null ? gHi : ''),
            seqOf(o),
            geneCount(o),
            (o.offtargetsymbols && o.offtargetsymbols.length ? o.offtargetsymbols.join('; ') : ''),
        ];

        const off = o.offtarget;
        if (Array.isArray(off) && off.length) {
            oligosWithHits++;
            for (const h of off) {
                totalHits++;
                rows.push(base.concat([
                    (h && h.chr) || '',
                    (h && h.start != null) ? h.start : '',
                    (h && h.end != null) ? h.end : '',
                    (h && h.strand) || '',
                    (h && h.editdistance != null) ? h.editdistance : '',
                    (h && h.symbol) || '',
                ]).map(esc).join(','));
            }
        } else if (typeof off === 'string' && off) {
            // Too many hits to enumerate — record the count, no per-hit rows.
            oligosWithHits++;
            rows.push(base.concat(['', '', '', '', '', '> ' + off + ' hits (not enumerated)']).map(esc).join(','));
        } else {
            // Searched clean (offtarget == null but was run) or never run — one row,
            // blank hit columns.
            rows.push(base.concat(['', '', '', '', '', '']).map(esc).join(','));
        }
    }

    // ---- download -------------------------------------------------------------

    const csv = rows.join('\r\n') + '\r\n';
    try {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', 'off-targets_' + list.length + '-oligos.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        graph.setMessage(' Exported ' + list.length + ' oligo(s), ' + totalHits + ' off-target hit(s) across ' + oligosWithHits + ' oligo(s). ');
    } catch (e) {
        graph.setMessage(' Could not export CSV: ' + e);
    }
}
