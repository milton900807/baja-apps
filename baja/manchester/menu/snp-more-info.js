function (graph, genegraph_panel_layout, picks) {
    // MORE INFORMATION on the selected variants, as a dossier rather than a sentence.
    //
    // The single-marker menu already asks for one short paragraph and puts it on the canvas
    // as a callout. This is the same question asked of a SELECTION, and answered at length:
    // what each change is, how it was classified, which conditions it appears in and how they
    // are inherited, who carries it, what it does to the protein, whether any of it is
    // actionable -- and, under its own heading, what is NOT established. That last one is not
    // decoration: a variant of uncertain significance with no functional data should say so
    // in the same breath as everything else, or the page reads as though it knows more than
    // it does.
    //
    // Everything the browser holds travels with the question -- locus, alleles, gene,
    // transcript, rsID, ClinVar significance and condition, molecular consequence, and the
    // raw record fields -- so the answer is about this variant at this position rather than
    // about its gene in general.
    const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

    return (async () => {
        const sel = (picks || []).filter((p) => p && p.ref);
        if (!sel.length) { say('No variants selected.'); return false; }
        const MAX = 12;
        const use = sel.slice(0, MAX);

        // The genomic position, not the track position. A cDNA child track indexes its own
        // spliced sequence, and chr7:412 is not a locus anyone can look anything up by.
        const locus = (p) => {
            const t = p.track, o = p.ref;
            let pos = (o && o.xi != null) ? o.xi : p.xi;
            try {
                if (t && t.isChildCDNATrack && t.isChildCDNATrack() && t.genomicAt) {
                    const g = t.genomicAt(pos);
                    if (g != null) pos = g;
                }
            } catch (e) { }
            return Math.floor(+pos);
        };
        const geneOf = (t) => {
            try {
                const d = '' + ((t && t.description) || '');
                return d.split(';')[0].trim() || (t && t.geneID) || (t && t.name) || '';
            } catch (e) { return (t && t.name) || ''; }
        };

        const payload = use.map((p, i) => {
            const o = p.ref, t = p.track;
            return {
                key: 'v' + (i + 1),
                name: o.name || o.id || p.label || ('variant ' + (i + 1)),
                gene: geneOf(t),
                transcript: (t && (t.transcriptID || '')) || '',
                chr: ('' + ((t && (t.contig || t.chr)) || p.chr || '')).replace(/^chr/i, ''),
                pos: locus(p),
                ref: o.reference0 != null ? o.reference0 : (o.reference || ''),
                alt: o.alternate0 != null ? o.alternate0 : (o.alternate || ''),
                type: o.type || '',
                rsid: (/^rs\d+$/i.test('' + (o.id || '')) ? o.id : (/^rs\d+$/i.test('' + (o.name || '')) ? o.name : '')),
                clinsig: o.clinsig || '',
                loh: o.loh || '',
                clindn: o.clindn || '',
                consequence: o.structure || '',
                annotations: Array.isArray(o.annotations) ? o.annotations.slice(0, 40) : '',
            };
        });

        let r = null;
        try {
            const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
            say('Looking up ' + use.length + ' variant' + (use.length === 1 ? '' : 's') + '…');
            r = await exec(window['env']['apiUrl'] + '/py/bio/variant-dossier.py', em, JSON.stringify(payload));
        } catch (e) { r = null; }

        let variants = [];
        try { variants = JSON.parse((r && r.variants) || '[]'); } catch (e) { variants = []; }
        if (!r || r.error || !variants.length) {
            say('No information could be retrieved' + ((r && r.error) ? ': ' + r.error : '') + '.');
            restoreHover();
            return false;
        }

        // ---- the report ---------------------------------------------------------------------
        try { const old = document.getElementById('baja-snp-info'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const panel = document.createElement('div');
        panel.id = 'baja-snp-info';
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

        const byKey = {};
        for (const p of payload) byKey[p.key] = p;

        // ---- THE VARIANT ITSELF, NOT ONLY WHAT IS KNOWN ABOUT IT ------------------------
        // This page is where someone decides what a variant is worth, which is exactly the
        // moment they want to mark it or be rid of it -- and until now the only way to do
        // either was to close the page, find the marker again on the canvas, and open its
        // menu. The two actions are the ones that follow from reading this: colour it so
        // it can be picked out among forty others, or delete it.
        const objByKey = {};
        use.forEach((pk, i) => { objByKey['v' + (i + 1)] = { snp: pk.ref, track: pk.track }; });
        const PALETTE = (() => {
            try {
                const C = use[0] && use[0].ref && use[0].ref.constructor;
                if (C && C.MARKER_COLORS && C.MARKER_COLORS.length) return C.MARKER_COLORS;
            } catch (e) { }
            // The same six the layer menus offer, so a variant and a layer coloured "amber"
            // are the same amber.
            return [['#4fd0e6', 'Cyan'], ['#ffaa3c', 'Amber'], ['#78e696', 'Green'],
                ['#f06e8c', 'Pink'], ['#b496ff', 'Violet'], ['#f5f5f5', 'White']];
        })();
        const meta = (p) => [
            p.gene, p.transcript,
            (p.chr ? 'chr' + p.chr + ':' + p.pos.toLocaleString() : ''),
            (p.ref && p.alt ? p.ref + '>' + p.alt : ''),
            p.rsid, p.clinsig, (p.loh ? 'LOH: ' + p.loh : ''),
        ].filter(Boolean).join('  ·  ');

        const card = (v) => {
            const p = byKey[v.key] || {};
            return '<div style="margin-bottom:22px;border-radius:10px;overflow:hidden;'
                + 'background:#0a1e3a;border:1px solid rgba(255,255,255,0.14);">'
                + '<div style="padding:14px 18px;background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);">'
                + '<div style="font:700 16px Arial;color:#e8f0fb;">' + esc(v.title) + '</div>'
                + (meta(p) ? '<div style="font:12px Arial;color:#9fb3c8;margin-top:4px;">' + esc(meta(p)) + '</div>' : '')
                + '</div>'
                + '<div style="padding:6px 18px 16px;">'
                + v.sections.map((s) =>
                    '<div style="margin-top:14px;">'
                    + '<div style="font:700 11px Arial;letter-spacing:0.06em;text-transform:uppercase;color:#7fb0e8;">'
                    + esc(s.heading) + '</div>'
                    + '<div style="font:13.5px/1.55 Arial;color:#dde8f6;margin-top:5px;">' + esc(s.text) + '</div>'
                    + '</div>').join('')
                + '</div>'
                + '<div data-act="' + v.key + '" style="padding:0 18px 16px;display:flex;'
                + 'align-items:center;gap:8px;flex-wrap:wrap;font:12px Arial;color:#9fb3c8;">'
                + '<span>Marker</span>'
                + PALETTE.map(([hex, nm], i) => '<button data-col="' + v.key + ':' + i + '" '
                    + 'title="' + esc(nm) + '" style="width:18px;height:18px;border-radius:50%;'
                    + 'cursor:pointer;border:1px solid rgba(255,255,255,0.35);background:'
                    + esc(hex) + ';"></button>').join('')
                + '<button data-col="' + v.key + ':auto" style="cursor:pointer;border-radius:6px;'
                + 'padding:3px 9px;font:12px Arial;border:1px solid rgba(255,255,255,0.22);'
                + 'background:transparent;color:#cfe0f0;">Automatic</button>'
                + '<span data-said="' + v.key + '" style="color:#7fb0e8;"></span>'
                + '<button data-del="' + v.key + '" style="margin-left:auto;cursor:pointer;'
                + 'border-radius:6px;padding:4px 12px;font:700 12px Arial;'
                + 'border:1px solid rgba(255,180,162,0.5);background:transparent;color:#ffb4a2;">'
                + 'Delete this variant</button>'
                + '</div></div>';
        };

        const skipped = sel.length - use.length;
        panel.innerHTML = ''
            + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
            + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
            + '<div style="min-width:0;"><div style="font:700 20px Arial;">Variant information</div>'
            + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
            + variants.length + ' variant' + (variants.length === 1 ? '' : 's')
            + (skipped ? ' · ' + skipped + ' more selected than can be looked up at once' : '')
            + ' · assembled from public knowledge, not from a curated database'
            + '</div></div>'
            + '<div style="margin-left:auto;display:flex;gap:10px;">'
            + '<button id="si-pdf" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
            + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Download PDF</button>'
            + '<button id="si-close" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
            + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Close</button>'
            + '</div></div>'
            + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
            + '<div style="width:100%;max-width:860px;margin:0 auto;">'
            + variants.map(card).join('')
            + '<div style="font:12px Arial;color:#7f97ad;margin-top:6px;">'
            + 'This is a summary of published knowledge about these variants. It is not a '
            + 'clinical interpretation and it is not a substitute for a report from a '
            + 'diagnostic laboratory.</div>'
            + '</div></div>';
        document.body.appendChild(panel);
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
            panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        }
        const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
        panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); restoreHover(); } });
        panel.querySelector('#si-close').onclick = () => { close(); restoreHover(); };

        // ---- COLOUR, AND DELETE -----------------------------------------------------------
        const redraw = () => {
            try { if (graph.wake) graph.wake(); } catch (e) { }
            try { if (graph.rescale) graph.rescale(); } catch (e) { }
        };
        const note = (key, text) => {
            try {
                const el = panel.querySelector('[data-said="' + key + '"]');
                if (el) el.textContent = text;
            } catch (e) { }
        };
        for (const b of panel.querySelectorAll('[data-col]')) {
            b.onclick = () => {
                const [key, which] = ('' + b.getAttribute('data-col')).split(':');
                const o = objByKey[key];
                if (!o || !o.snp) return;
                // The canvas is behind this page, so the change is not visible until it is
                // closed. Saying what was set is the only feedback there is.
                try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                if (which === 'auto') {
                    o.snp.markerColor = null;
                    note(key, 'marker colour: automatic');
                } else {
                    const pair = PALETTE[+which] || [];
                    o.snp.markerColor = pair[0] || null;
                    note(key, 'marker colour: ' + (pair[1] || pair[0] || ''));
                }
                redraw();
            };
        }
        for (const b of panel.querySelectorAll('[data-del]')) {
            let armed = false;
            b.onclick = () => {
                const key = '' + b.getAttribute('data-del');
                const o = objByKey[key];
                if (!o || !o.snp) return;
                // DELETING IS NOT COLOURING. It asks once, in place: the confirmation
                // dialog the canvas uses is mounted under this page and would not be seen,
                // and a delete that happens on the first press of a button sitting under a
                // paragraph somebody is reading is a delete nobody meant.
                if (!armed) {
                    armed = true;
                    b.textContent = 'Delete for real?  press again';
                    setTimeout(() => {
                        if (!armed) return;
                        armed = false;
                        b.textContent = 'Delete this variant';
                    }, 4000);
                    return;
                }
                armed = false;
                try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                let gone = false;
                try { o.track.removesnp(o.snp); gone = true; } catch (e) { gone = false; }
                if (!gone) {
                    try {
                        const a = (o.track.snpindels || []);
                        const i = a.indexOf(o.snp);
                        if (i >= 0) { a.splice(i, 1); gone = true; }
                    } catch (e) { gone = false; }
                }
                b.textContent = gone ? 'Deleted' : 'Could not delete';
                b.disabled = true;
                b.style.opacity = '0.6';
                if (gone) {
                    // The card stays, faded, rather than vanishing from under the reader:
                    // what they were reading is still what they were reading, and the page
                    // does not reshuffle around the gap.
                    try {
                        const row = panel.querySelector('[data-act="' + key + '"]');
                        if (row && row.parentNode) row.parentNode.style.opacity = '0.45';
                    } catch (e) { }
                    note(key, 'deleted from ' + ((o.track && o.track.name) || 'the track')
                        + ' \u00b7 undo restores it');
                    redraw();
                }
            };
        }
        panel.querySelector('#si-pdf').onclick = async () => {
            try {
                const P = await exec('baja/io/pdf-writer.js');
                const rows = [];
                for (const v of variants) {
                    for (const s of v.sections) rows.push([v.title, s.heading, s.text]);
                }
                P.download({
                    title: 'Variant information',
                    subtitle: variants.length + ' variant' + (variants.length === 1 ? '' : 's'),
                    meta: variants.map((v) => [v.title, meta(byKey[v.key] || {})]),
                    columns: ['Variant', 'Section', 'Detail'],
                    rows: rows,
                    filename: 'variant-information.pdf',
                });
            } catch (e) { say('The PDF could not be written: ' + (e && e.message ? e.message : e)); }
        };
        return true;
    })();
}
