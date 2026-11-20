function (graph, genegraph_panel_layout, presetTracks) {
    // THE EXON STABILITY REPORT: every exon on the canvas, ranked by how unreliably it
    // splices, with everything the models already know about it folded in.
    //
    //   await exec('baja/bio/splicing/exon-stability-report.js', graph, layout);
    //
    // Nothing here computes anything of its own. The PSI run (baja/bio/splicing/
    // splicing-profile.js) already works out, per exon: inclusion from PSINet, a
    // reliability score weighted by conservation and annotated functional sites, whether
    // the exon sits in duplicated sequence and so cannot be believed, any published
    // measurement that replaces the prediction, and what each variant on the track does
    // to it. All of that is left on the layer. This gathers it across every track and
    // puts it in one place, which is the one thing the per-track views cannot do: the
    // ranking panel answers "which exon on THIS transcript", and the question in front of
    // someone choosing an ASO target is "which exon on the canvas".
    //
    // IT RUNS PSI WHERE IT IS MISSING, and that is a deliberate difference from the
    // ranking panel, which refuses to. Ranking is a second look at a run you asked for;
    // a report over the whole canvas IS the request, and offering an empty table with a
    // note that six tracks were never scored would be answering a different one. Which
    // tracks it had to run is said at the top.
    return new Promise(async (resolve) => {
        const OV = await exec('baja/lib/canvas-overlay-panel.js');
        const H = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const hasExons = (t) => {
            try {
                return ((t.annotations || []).filter(
                    (a) => a && ('' + a.type).toLowerCase() === 'exon').length) > 0;
            } catch (e) { return false; }
        };
        // The most recent PSI layer carrying per-exon reliability. `pop()` and not `find()`:
        // a track re-run after an edit holds both layers, and the answer is the last one.
        const psiLayer = (t) => {
            try {
                return (t.track_layers || []).filter((x) => x && x.magnitudeMode === 'psi'
                    && Array.isArray(x.exonStability) && x.exonStability.length).pop() || null;
            } catch (e) { return null; }
        };

        let all = [];
        try {
            all = (Array.isArray(presetTracks) && presetTracks.length
                ? presetTracks : (graph.track || []))
                .filter((t) => t && (t.grid || t.tgraph) && hasExons(t));
        } catch (e) { all = []; }

        if (!all.length) {
            graph.setMessage(' No track on the canvas has annotated exons to report on. ');
            resolve(false); return;
        }

        // ---------------------------------------------------------------- running -------
        const missing = all.filter((t) => !psiLayer(t));
        const ran = [];
        const failed = [];
        if (missing.length) {
            for (let i = 0; i < missing.length; i++) {
                const t = missing[i];
                const nm = (t.name || ('track ' + (i + 1)));
                try {
                    graph.setMessage(' Exon stability report · running PSINet on ' + nm
                        + ' (' + (i + 1) + ' of ' + missing.length + ')… ');
                    exec('baja/lib/work-status.js', 'Exon stability report · ' + nm
                        + ' · ' + (i + 1) + ' of ' + missing.length);
                } catch (e) { }
                try {
                    await exec('baja/bio/splicing/splicing-profile.js',
                        graph, genegraph_panel_layout, t, null, 'psi');
                } catch (e) { }
                // THE LAUNCH DOES NOT WAIT FOR THE RUN. splicing-profile.js resolves once it
                // has dispatched, not once the model has answered, so awaiting the exec above
                // proves only that it started. The layer appearing is the completion signal
                // there is, so that is what is waited on -- with a ceiling, because a run that
                // never lands must not hang the report.
                const got = await (async () => {
                    const t0 = Date.now();
                    while (Date.now() - t0 < 180000) {
                        const L = psiLayer(t);
                        if (L) return L;
                        await new Promise((r) => setTimeout(r, 250));
                    }
                    return null;
                })();
                if (got) ran.push(nm); else failed.push(nm);
            }
            try { exec('baja/lib/work-status.js', null); } catch (e) { }
        }

        // ---------------------------------------------------------------- gathering -----
        const rows = [];
        const notes = { noContext: [], noMappability: [], untrusted: 0, measured: 0, variants: 0 };
        for (const t of all) {
            const L = psiLayer(t);
            if (!L) continue;
            const nm = t.name || 'track';
            if (!L.exonStabilityHasContext) notes.noContext.push(nm);
            if (!L.untrustedSource) notes.noMappability.push(nm);
            for (const e of L.exonStability) {
                const r = {
                    track: nm, exon: e.exon, psi: e.psi, score: e.score, word: e.word,
                    conservation: e.conservation, sites: e.sites, rank: e.rank,
                    untrusted: !!e.untrusted, untrustedWhy: e.untrustedWhy || '',
                    measured: e.measured || null, psiPredicted: e.psiPredicted,
                    variant: e.variant || null,
                    fit: L.exonStabilityFit
                };
                if (r.untrusted) notes.untrusted++;
                if (r.measured) notes.measured++;
                if (r.variant) notes.variants++;
                rows.push(r);
            }
        }

        if (!rows.length) {
            graph.setMessage(' Nothing to report: no track produced exon reliability. ');
            resolve(false); return;
        }

        // UNTRUSTED EXONS SINK, whatever their score. Their PSI is a blend of two genes'
        // reads, so a rank computed from it is not about this exon at all, and letting one
        // float to the top of a report someone picks a target from is the failure the
        // whole mappability path exists to prevent.
        rows.sort((a, b) => {
            if (a.untrusted !== b.untrusted) return a.untrusted ? 1 : -1;
            return (b.rank || 0) - (a.rank || 0);
        });

        // ---------------------------------------------------------------- rendering ----
        const pc = (v) => (v == null || !isFinite(+v)) ? '–' : (Math.round(100 * +v) + '%');
        const COL = { 'constitutive': '#9fe8b5', 'rarely in': '#9ec9ff',
                      'variable': '#ffd79a', 'unstable': '#ffb4a2' };

        const summary = [
            rows.length + ' exon' + (rows.length === 1 ? '' : 's'),
            all.length + ' track' + (all.length === 1 ? '' : 's'),
            rows.filter((r) => !r.untrusted && r.score > 0.45).length + ' unstable',
            notes.variants + ' moved by a variant',
            notes.untrusted + ' not trustworthy'
        ].join(' · ');

        let body = '<div style="font:12.5px Arial;color:#8fb8c8;margin-bottom:10px;">'
            + H(summary) + '</div>';

        if (ran.length) {
            body += '<div style="font:12.5px Arial;color:#8fb8c8;margin-bottom:8px;">'
                + 'PSINet was run for this report on: ' + H(ran.join(', ')) + '.</div>';
        }
        if (failed.length) {
            body += '<div style="font:12.5px Arial;color:#ffb4a2;margin-bottom:8px;">'
                + 'No result came back for ' + H(failed.join(', ')) + ', so '
                + (failed.length === 1 ? 'that track is' : 'those tracks are')
                + ' missing from the table below rather than reported as having no unstable '
                + 'exons.</div>';
        }

        body += '<table style="width:100%;border-collapse:collapse;font:12px Arial;">'
            + '<tr style="text-align:left;color:#8fb8c8;border-bottom:1px solid rgba(255,255,255,0.14);">'
            + '<th style="padding:4px 6px;">#</th><th>track</th><th>exon</th><th>inclusion</th>'
            + '<th>reliability</th><th>with variant</th><th>cons</th><th>sites</th><th>score</th></tr>';

        rows.forEach((r, i) => {
            const incl = r.measured
                ? ('<span style="color:#c4b5fd;">~' + pc(r.measured.psi) + ' measured</span>')
                : r.untrusted ? '<span style="color:#8fb8c8;">–</span>' : pc(r.psi);
            const vcell = r.variant
                ? ('<span style="color:#ffb4a2;">' + pc(r.variant.psiAlt) + ' '
                   + H((r.variant.ref || '?') + '>' + (r.variant.alt || '?'))
                   + (+r.variant.canonicalSite > 0 ? ' · site' : '') + '</span>')
                : '<span style="color:#5d7f90;">–</span>';
            body += '<tr style="border-bottom:1px solid rgba(255,255,255,0.08);">'
                + '<td style="padding:4px 6px;color:#8fb8c8;">' + (i + 1) + '</td>'
                + '<td>' + H(r.track) + '</td>'
                + '<td>e' + H(r.exon) + '</td>'
                + '<td>' + incl + '</td>'
                + '<td style="color:' + (r.untrusted ? '#8fb8c8' : (COL[r.word] || '#eaf6f9'))
                + ';">' + H(r.word) + '</td>'
                + '<td>' + vcell + '</td>'
                + '<td>' + (r.conservation == null ? '–' : (+r.conservation).toFixed(2)) + '</td>'
                + '<td>' + H(r.sites == null ? 0 : r.sites) + '</td>'
                + '<td>' + (r.rank == null ? '–' : (+r.rank).toFixed(3)) + '</td></tr>';
        });
        body += '</table>';

        // WHAT THE NUMBERS DO NOT SAY. A report is read away from the screen that produced
        // it, so each caveat that applies has to travel with it: the ranking means something
        // different without conservation loaded, and "nothing flagged" means nothing at all
        // on a server with no mappability intervals configured.
        const foot = [];
        foot.push('Reliability is distance from the nearest extreme: an exon at 99% and one '
            + 'at 2% are both reliable, one reliably in and one reliably out, and one at 50% '
            + 'is neither.');
        if (notes.noContext.length) {
            foot.push('No conservation or domain layer is loaded on ' + H(notes.noContext.join(', '))
                + ', so for ' + (notes.noContext.length === 1 ? 'that track' : 'those tracks')
                + ' the score is reliability alone and is not comparable with the weighted rows.');
        }
        if (notes.noMappability.length) {
            foot.push('Mappability was not checked on ' + H(notes.noMappability.join(', '))
                + ': no interval file is configured, so an exon whose PSI came from reads a '
                + 'paralog could equally have produced is ranked here as though the number '
                + 'were its own.');
        }
        if (notes.untrusted) {
            foot.push(notes.untrusted + ' exon' + (notes.untrusted === 1 ? '' : 's')
                + ' sit in duplicated sequence. Their inclusion was measured from reads '
                + 'another locus could equally have produced, so they carry no number and '
                + 'are not ranked in either direction.');
        }
        if (notes.measured) {
            foot.push(notes.measured + ' exon' + (notes.measured === 1 ? ' carries' : 's carry')
                + ' a published measurement, shown in place of the prediction. '
                + 'These are measurements, not corrected model output.');
        }
        if (notes.variants) {
            foot.push('"with variant" is the model scored on the MUTATED sequence. An empty '
                + 'cell means every variant there moved inclusion by under five points, '
                + 'which is the usual answer: most pathogenic variants are pathogenic in the '
                + 'protein and leave splicing alone.');
        }
        const badFit = rows.filter((r) => r.fit != null && r.fit < 0.6);
        if (badFit.length) {
            foot.push('On some tracks fewer than 60% of arcs landed on an exon edge, so the '
                + 'exon numbering may not line up with the drawn exons. Treat those rows as '
                + 'indicative.');
        }
        body += '<div style="margin-top:12px;font:12px Arial;color:#8fb8c8;line-height:1.6;">'
            + foot.map((f) => '<div style="margin-top:6px;">' + f + '</div>').join('')
            + '</div>';

        body += '<div style="margin-top:12px;"><a href="#" id="esr-copy" '
            + 'style="color:#4fd0e6;font:12.5px Arial;">Copy as text</a>'
            + '<span id="esr-said" style="color:#8fb8c8;font:12.5px Arial;margin-left:8px;"></span></div>';

        const p = OV.open({
            id: 'exon-stability-report',
            title: 'Exon stability report · ' + summary,
            body: body
        });

        // Plain text for pasting into a document or a ticket. The overlay keeps event
        // handlers, unlike the host's showModal, so this can be wired directly.
        try {
            const a = p && p.body && p.body.querySelector('#esr-copy');
            if (a) {
                a.onclick = (e) => {
                    try { e.preventDefault(); } catch (e2) { }
                    const lines = ['exon stability report', summary, ''];
                    lines.push(['#', 'track', 'exon', 'inclusion', 'reliability',
                                'with variant', 'cons', 'sites', 'score'].join('\t'));
                    rows.forEach((r, i) => lines.push([
                        i + 1, r.track, 'e' + r.exon,
                        r.measured ? ('~' + pc(r.measured.psi) + ' measured')
                            : r.untrusted ? 'not trusted' : pc(r.psi),
                        r.word,
                        r.variant ? (pc(r.variant.psiAlt) + ' ' + (r.variant.ref || '?')
                            + '>' + (r.variant.alt || '?')) : '',
                        r.conservation == null ? '' : (+r.conservation).toFixed(2),
                        r.sites == null ? 0 : r.sites,
                        r.rank == null ? '' : (+r.rank).toFixed(3)
                    ].join('\t')));
                    lines.push('');
                    // The caveats go with it: a table pasted somewhere else without them is
                    // the same table with its qualifications quietly dropped.
                    for (const f of foot) lines.push('- ' + f.replace(/<[^>]+>/g, ''));
                    const txt = lines.join('\n');
                    const said = p.body.querySelector('#esr-said');
                    try {
                        navigator.clipboard.writeText(txt);
                        if (said) said.textContent = 'copied';
                    } catch (e2) {
                        if (said) said.textContent = 'could not reach the clipboard';
                    }
                };
            }
        } catch (e) { }

        try { graph.setMessage(' Exon stability report · ' + summary + ' '); } catch (e) { }
        resolve(true);
    });
}
