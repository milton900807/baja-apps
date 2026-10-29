function (graph, track, sequence, opts) {

    // THE MUTATIONS AN ALLELE-SELECTIVE DESIGN IS BUILT AROUND, as indexes into the sequence
    // the designer is about to be handed.
    //
    //   const m = await exec('baja/manchester/menu/design-mutation-sites.js',
    //                        graph, track, sequence, { offset: startIndex, selectedOnly: false });
    //   m.positions   [12, 480, …]   0-based into `sequence`, sorted, de-duplicated
    //   m.sites       [{ pos, label, type, ref, alt, selected }…] in the same order
    //   m.skipped     how many variants on the track fall outside `sequence`
    //   m.note        one line for the run's message
    //
    // Only the track's OWN variants: an allele-selective ASO is one that binds the sequence
    // this sample carries and not the other allele, so the mutations that matter are the ones
    // on the track being designed against. Variants on other tracks are the opposite question
    // -- sites to keep OFF -- and are handled by design-scope-from-workbench.js.
    //
    // A substitution contributes the one base it changes. An indel contributes the bases it
    // spans, so an oligo laid over any of them is over the junction. Coordinates follow the
    // same convention as the scope module: index = round(variant.xi) - offset.
    return (async () => {
        const o = opts || {};
        const offset = Math.max(0, Math.round(+o.offset || 0));
        const seq = '' + (sequence || '');
        const out = { positions: [], sites: [], skipped: 0, note: '', total: 0 };
        if (!track || !seq.length) return out;

        const num = (v) => { const n = +v; return isFinite(n) ? n : null; };
        const all = (track.snpindels || []).filter(Boolean);
        // A selection in the variant window means "these ones": designing around all of a
        // track's variants when five are selected answers a question nobody asked.
        const picked = o.selectedOnly
            ? all.filter((s) => s && (s.highlight || (s.isSelected && s.isSelected())))
            : all;
        out.total = picked.length;

        const seen = new Set();
        for (const s of picked) {
            const x = num(s.xi);
            if (x == null) continue;
            const ref = ('' + (s.reference0 != null ? s.reference0 : (s.reference || ''))).replace(/[^A-Za-z]/g, '').toUpperCase();
            const alt = ('' + (s.alternate0 != null ? s.alternate0 : (s.alternate || ''))).replace(/[^A-Za-z]/g, '').toUpperCase();
            const span = Math.max(1, ref.length || 1);
            const i0 = Math.round(x) - offset;
            let added = 0;
            for (let k = 0; k < span; k++) {
                const i = i0 + k;
                if (i < 0 || i >= seq.length) continue;
                if (seen.has(i)) { added++; continue; }
                seen.add(i);
                out.sites.push({
                    pos: i, label: ('' + (s.name || s.id || ((ref || '?') + '>' + (alt || '?')))),
                    type: ('' + (s.type || 'snp')).toLowerCase(), ref: ref, alt: alt,
                    selected: !!(s.highlight || (s.isSelected && s.isSelected())),
                });
                added++;
            }
            if (!added) out.skipped++;
        }
        out.sites.sort((a, b) => a.pos - b.pos);
        out.positions = out.sites.map((v) => v.pos);
        const n = out.positions.length;
        out.note = n
            ? (n + ' mutation' + (n === 1 ? '' : 's') + ' to design around'
                + (out.skipped ? ' (' + out.skipped + ' outside the designed region)' : ''))
            : (out.total ? 'none of this track\'s ' + out.total + ' variants fall inside the designed region'
                : 'this track carries no variants');
        return out;
    })();
}
