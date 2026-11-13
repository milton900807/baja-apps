function (graph, genegraph_panel_layout, track, range) {
    // WHICH RBP WINS THIS STRETCH. rbp-profile.js answers "where does TARDBP bind";
    // this answers "what binds here at all", by ranking the model's 170 heads against
    // each other over a selected span and naming the one with the strongest claim.
    //
    //   exec('baja/bio/rbp/rbp-competition.js', graph, genegraph_panel_layout, track, range)
    //
    // It is one forward pass. The model emits all 170 heads per window anyway, so the
    // competition costs what profiling a single protein costs.
    //
    // The result is a ranked list, not a verdict. A winner is only named out loud when it
    // beats the field by a distance: on a background with no site at all the top protein
    // still wins a few windows, so "the top hit was X" said unconditionally would be a
    // confident answer to a question the sequence did not answer. The list is offered
    // either way, and clicking an entry draws that protein's profile with the existing
    // tool, so the ranking leads somewhere rather than just being read.
    return (async () => {
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const t = track;
        if (!t) { say('No track selected.'); return graph; }

        const lo = range ? Math.min(+range.start, +range.end) : null;
        const hi = range ? Math.max(+range.start, +range.end) : null;
        let seq = '';
        try {
            seq = ('' + ((range ? t.getSequenceRange(lo, hi) : t.getSequenceRange(t.xi, t.xf)) || ''))
                .toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
        } catch (e) { seq = ''; }
        if (!seq.length) { say(((t.name || 'That track') + ' has no sequence to scan.')); return graph; }
        // Said here rather than discovered at the far end of a model load: the window is
        // 64 nt wide, so a shorter selection has nothing to score and would come back
        // empty, which reads as "nothing binds here".
        if (seq.length < 64) {
            say('BajaCLIP scores 64 nt windows, and this selection is ' + seq.length
                + ' nt. Select at least 64 nt.');
            return graph;
        }

        const xi = Math.round(range ? lo : +t.xi);
        const strand = '' + (t.strand != null ? t.strand : 1);
        const where = (t.name || 'track') + ' · ' + seq.length.toLocaleString()
            + (range ? ' nt selection' : ' nt');
        const status = (phase) => {
            try {
                exec('baja/lib/work-status.js',
                    'BajaCLIP · which RBP binds → ' + where + (phase ? ('  ·  ' + phase) : ''));
            } catch (e) { }
        };
        status('ranking 170 proteins');
        say('Ranking RNA-binding proteins over ' + seq.length.toLocaleString() + ' nt…');

        let data = null;
        try {
            const em = new EngineMonitor((m) => { try { log(m); say('' + m); status('' + m); } catch (e) { } });
            data = await exec(window['env']['apiUrl'] + '/py/bio/rbp/rbp-competition.py',
                em, seq, '' + xi, strand, '8', '12', 'reliable');
        } catch (e) {
            say('RBP competition failed: ' + (e && e.message ? e.message : e));
            try { exec('baja/lib/work-status.js', ''); } catch (e2) { }
            return graph;
        }
        try { exec('baja/lib/work-status.js', ''); } catch (e) { }

        if (data && data.error) { say('RBP competition: ' + data.error); return graph; }
        let ranked = [];
        try { ranked = JSON.parse((data && data.ranked) || '[]'); } catch (e) { ranked = []; }
        if (!ranked.length) {
            say('No protein scored anywhere in this selection. Nothing in the reliable set '
                + 'clears the floor here, which is an answer: this stretch looks unbound.');
            return graph;
        }

        const windows = +(data.windows || 0), scored = +(data.scored || 0);
        const first = ranked[0], second = ranked[1] || null;
        // THE JUDGEMENT, in one place. A win counts as decisive when it takes at least
        // three windows and at least twice what the runner-up takes. Both halves matter:
        // twice-of-one is noise, and three windows that everything else also reaches is
        // not a claim on the sequence.
        const decisive = (+first.called >= 3)
            && (!second || +first.called >= 2 * Math.max(1, +second.called));

        const pct = (x) => Math.round(100 * (+x || 0)) + '%';
        const headline = decisive
            ? ('Top hit: ' + first.rbp + ', winning ' + first.called + ' of ' + windows
                + ' windows' + (second ? (' against ' + second.rbp + '’s ' + second.called) : '')
                + ' (peak specificity ' + pct(first.specificity) + ', raw ' + first.raw
                + ', at ' + first.at + ').')
            : ('No protein stands out: ' + first.rbp + ' leads with only ' + first.called
                + ' of ' + windows + ' windows'
                + (second ? (', ' + second.rbp + ' taking ' + second.called) : '')
                + '. On sequence with no real site the leader still takes a few, so treat '
                + 'this as unbound rather than as a weak hit.');
        say(headline);
        try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + headline + ' '); } catch (e) { }

        // The ranking leads somewhere: each row draws that protein's own profile over the
        // same span, using the existing tool rather than a second drawing path.
        const rows = ranked.map((r, i) => ({
            label: (i === 0 && decisive ? '★ ' : '  ')
                + r.rbp + '   ' + r.called + '/' + windows + ' windows · ' + pct(r.specificity)
                + ' · raw ' + r.raw,
            move: () => { },
            click: async () => {
                try { graph.showSideMenu(null); } catch (e) { }
                try {
                    await exec('baja/bio/rbp/rbp-profile.js', graph, genegraph_panel_layout,
                        t, (range ? { start: lo, end: hi } : null), r.rbp);
                } catch (e) { say('Could not profile ' + r.rbp + ': ' + (e && e.message ? e.message : e)); }
            }
        }));
        // Captions, not rows: header: true draws them as captions and leaves them
        // unclickable, where a no-op click draws a button that does nothing.
        const menu = [
            { label: 'Which RBP binds this ' + seq.length.toLocaleString() + ' nt', header: true },
            { label: scored + ' of ' + windows + ' windows scored at all', header: true }
        ].concat(rows);
        if (graph.openMenuAtPointer) graph.openMenuAtPointer(menu, 'BajaCLIP');
        else graph.showSideMenu(menu);
        return graph;
    })();
}
