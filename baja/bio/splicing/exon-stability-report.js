function (graph, genegraph_panel_layout, presetTracks, navigate) {
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

        // WHAT THE PSI RUN COUNTS AS AN EXON, not what looks like one here. The per-exon
        // reliability is only produced when splicing-profile.js finds exons through
        // getExons(); a track whose annotations say "Exon" but whose getExons() is empty
        // would be admitted by an annotations-only test, scored, and then yield nothing,
        // and the report would wait three minutes for a layer that was never coming.
        const exonCount = (t) => {
            let n = 0;
            try { n = ((t.getExons && t.getExons()) || []).length; } catch (e) { n = 0; }
            if (n) return n;
            try {
                return (t.annotations || []).filter(
                    (a) => a && ('' + a.type).toLowerCase() === 'exon').length;
            } catch (e) { return 0; }
        };
        const hasExons = (t) => exonCount(t) > 0;
        // The most recent PSI layer carrying per-exon reliability. `pop()` and not `find()`:
        // a track re-run after an edit holds both layers, and the answer is the last one.
        const psiLayer = (t) => {
            try {
                return (t.track_layers || []).filter((x) => x && x.magnitudeMode === 'psi'
                    && Array.isArray(x.exonStability) && x.exonStability.length).pop() || null;
            } catch (e) { return null; }
        };
        // A PSI LAYER OF ANY KIND IS THE COMPLETION SIGNAL, and the test for whether a run
        // is needed at all. Waiting for one that carries reliability conflates two
        // different things: a run that has not happened, and a run that happened and could
        // not match its arcs to the annotated exons. The second produces a layer with no
        // reliability on it, and waiting for reliability there meant re-running a track
        // that had already answered and then sitting out the full timeout per track, which
        // is a report that looks like it is doing nothing. The empty case is explained
        // below instead, by name.
        const anyPsi = (t) => {
            try {
                return (t.track_layers || []).some((x) => x && x.magnitudeMode === 'psi');
            } catch (e) { return false; }
        };

        let all = [];
        try {
            all = (Array.isArray(presetTracks) && presetTracks.length
                ? presetTracks : (graph.track || []))
                .filter((t) => t && (t.grid || t.tgraph) && hasExons(t));
        } catch (e) { all = []; }

        // A REPORT THAT RETURNS NOTHING IS INDISTINGUISHABLE FROM A CRASH. Every exit from
        // here opens the panel and says what happened. The first version closed on a
        // transient status line when it had no rows, which read as the tool doing nothing
        // at all -- and the reasons it can have no rows (no exons, a run that did not come
        // back, a layer with no reliability on it) are exactly what the user needs told.
        // THE PANEL OPENS FIRST AND FILLS IN. Scoring a canvas of transcripts takes real
        // time -- a forward pass per cassette exon, and another per variant on the track --
        // and the first version did all of it before showing anything, so the report was a
        // long silence ending in a window. Silence is the one thing a long job must not do:
        // there is no way to tell it from a crash, and the honest answer to "is it working"
        // was only available once it had finished working.
        //
        // So the window appears at once with every track listed, and each line changes as
        // its run finishes. The same panel then becomes the report, rather than a second
        // window replacing the first.
        let p = null;
        const paint = (title, html) => {
            try {
                if (!p) {
                    // OPENED MAXIMIZED. This panel is a chart plus a table of every exon on
                    // the canvas: fitted to the canvas rect it showed about ten rows of
                    // forty and clipped the chart, and the canvas underneath is not what
                    // the reader is looking at while reading it. Restore is in the header.
                    p = OV.open({ id: 'exon-stability-report', title: title, body: html,
                                  maximized: true });
                } else {
                    if (p.body) p.body.innerHTML = html;
                    // The title is the header's first child (canvas-overlay-panel.js builds
                    // it that way). Updated too, or the finished report stays titled
                    // "working..." and the panel contradicts itself.
                    const h1 = p.head && p.head.firstChild;
                    if (h1 && 'textContent' in h1) h1.textContent = '' + title;
                }
            } catch (e) {
                try { graph.setMessage(' ' + ('' + html).replace(/<[^>]+>/g, '').slice(0, 160) + ' '); } catch (e2) { }
            }
            return p;
        };
        const nothing = (why) => {
            paint('Exon stability report \u00b7 nothing to report',
                  '<div style="font:13px Arial;color:#eaf6f9;line-height:1.7;">' + why + '</div>');
            resolve(false);
        };

        if (!all.length) {
            const open = (graph.track || []).filter(Boolean).length;
            nothing(open
                ? ('None of the ' + open + ' track' + (open === 1 ? '' : 's') + ' on the canvas '
                   + 'has annotated exons. The report is per exon, and exon reliability is '
                   + 'worked out from the transcript\u2019s own exon structure, so a track '
                   + 'loaded as plain sequence has nothing to report. Load a transcript with '
                   + 'its exons annotated and run it again.')
                : 'There are no tracks on the canvas.');
            return;
        }

        // ---------------------------------------------------------------- running -------
        const missing = all.filter((t) => !anyPsi(t));
        const ran = [];
        const failed = [];

        // One line per track, with what is happening to it. "already scored" matters as
        // much as "running": a reader who cannot see which tracks needed work cannot tell
        // a fast report from a report that quietly skipped something.
        const state = {};
        const reason = {};
        for (const t of all) {
            state[t.name || 'track'] = (missing.indexOf(t) >= 0) ? 'queued' : 'already scored';
        }
        const GLYPH = { 'queued': '\u25cb', 'running': '\u25d0', 'done': '\u25cf',
                        'already scored': '\u25cf', 'no result': '\u2715' };
        const COLOUR = { 'queued': '#5d7f90', 'running': '#4fd0e6', 'done': '#22c55e',
                         'already scored': '#8fb8c8', 'no result': '#ffb4a2' };
        const t0All = Date.now();
        const progress = () => {
            const lines = all.map((t) => {
                const nm = t.name || 'track';
                const st = state[nm] || 'queued';
                const nx = exonCount(t);
                return '<div style="margin-top:5px;color:' + COLOUR[st] + ';">'
                    + GLYPH[st] + '&nbsp;&nbsp;<b style="color:#eaf6f9;">' + H(nm) + '</b>'
                    + ' <span style="color:#8fb8c8;">\u00b7 ' + nx + ' exon'
                    + (nx === 1 ? '' : 's') + ' \u00b7 ' + st + '</span>'
                    + (reason[nm]
                        ? ('<div style="margin:2px 0 0 22px;color:#ffb4a2;font-size:12px;">'
                           + H(reason[nm]) + '</div>')
                        : '')
                    + '</div>';
            }).join('');
            const left = all.filter((t) => {
                const st = state[t.name || 'track'];
                return st === 'queued' || st === 'running';
            }).length;
            return '<div style="font:13px Arial;color:#eaf6f9;line-height:1.6;">'
                + '<div style="color:#8fb8c8;">'
                + (left
                    ? ('Scoring ' + left + ' track' + (left === 1 ? '' : 's') + ' with PSINet. '
                       + 'Each is a forward pass per cassette exon, and another per variant on '
                       + 'the track, so a long transcript takes a little while.')
                    : 'Collecting the results\u2026')
                + '</div>' + lines
                + '<div style="margin-top:10px;color:#5d7f90;font-size:12px;">'
                + Math.round((Date.now() - t0All) / 1000) + 's elapsed</div></div>';
        };
        paint('Exon stability report \u00b7 working\u2026', progress());

        if (missing.length) {
            for (let i = 0; i < missing.length; i++) {
                const t = missing[i];
                const nm = (t.name || ('track ' + (i + 1)));
                state[nm] = 'running';
                paint('Exon stability report \u00b7 ' + (i + 1) + ' of ' + missing.length,
                      progress());
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
                // A REFUSAL ENDS THE WAIT AND CARRIES ITS REASON. splicing-profile.js
                // leaves track.psiRefusal when it declines a track -- a cDNA with no
                // introns to score, a track with no sequence, a backend error, nothing
                // over threshold -- and every one of those is known within a second.
                // Waiting the full two minutes for a layer that was never coming, and
                // then reporting a bare "no result", threw away an answer the run had
                // already given and made a known problem look like a hang.
                const t0 = Date.now();
                const got = await (async () => {
                    while (Date.now() - t0 < 120000) {
                        if (anyPsi(t)) return true;
                        try {
                            if (t.psiRefusal && +t.psiRefusal.at >= t0) return false;
                        } catch (e) { }
                        await new Promise((r) => setTimeout(r, 250));
                    }
                    return null;
                })();
                if (got) { ran.push(nm); state[nm] = 'done'; }
                else {
                    let why = '';
                    try { why = (t.psiRefusal && t.psiRefusal.why) || ''; } catch (e) { }
                    // Timing out and being refused are different failures and the reader
                    // needs them apart: one is a run still going somewhere, the other is a
                    // track this model cannot be asked about at all.
                    failed.push({ name: nm, why: why
                        || 'no result within two minutes, and the run reported nothing' });
                    state[nm] = 'no result';
                    reason[nm] = why;
                }
                paint('Exon stability report \u00b7 ' + (i + 1) + ' of ' + missing.length,
                      progress());
            }
            try { exec('baja/lib/work-status.js', null); } catch (e) { }
        }

        // ---------------------------------------------------------------- gathering -----
        const rows = [];
        const notes = { noContext: [], noMappability: [], untrusted: 0, measured: 0,
                        variants: 0, variantFailed: [] };
        for (const t of all) {
            const L = psiLayer(t);
            if (!L) continue;
            const nm = t.name || 'track';
            if (!L.exonStabilityHasContext) notes.noContext.push(nm);
            if (L.variantError) notes.variantFailed.push(nm + ': ' + L.variantError);
            if (!L.untrustedSource) notes.noMappability.push(nm);
            for (const e of L.exonStability) {
                const r = {
                    // lo/hi are the exon's own span on the track, carried because that is
                    // what navigation frames. Left out of the first version, which gave
                    // every row a click that went nowhere.
                    track: nm, tobj: t, exon: e.exon, lo: e.lo, hi: e.hi, psi: e.psi, score: e.score, word: e.word,
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
            const lines = all.map((t) => {
                const nm = t.name || 'track';
                const L = psiLayer(t);
                const f = failed.filter((x) => x.name === nm)[0];
                if (f) {
                    return '<li><b>' + H(nm) + '</b> \u2014 ' + H(f.why) + '</li>';
                }
                if (!L) {
                    return '<li><b>' + H(nm) + '</b> \u2014 no PSI layer, and the run produced '
                        + 'none.</li>';
                }
                return '<li><b>' + H(nm) + '</b> \u2014 a PSI layer is present but carries no '
                    + 'per-exon reliability. That happens when the arcs could not be matched '
                    + 'to the annotated exons, so there is nothing to rank.</li>';
            }).join('');
            nothing('No track produced exon reliability, so there is nothing to rank:'
                + '<ul style="margin:8px 0 0 0;padding-left:18px;">' + lines + '</ul>'
                + '<div style="margin-top:10px;color:#8fb8c8;">Running <b>Exon inclusion, PSI '
                + '(PSINet)</b> on one track by hand will show the error the run hit, which '
                + 'this report can only report as absence.</div>');
            return;
        }

        // UNTRUSTED EXONS SINK, whatever their score. Their PSI is a blend of two genes'
        // reads, so a rank computed from it is not about this exon at all, and letting one
        // float to the top of a report someone picks a target from is the failure the
        // whole mappability path exists to prevent.
        // SORTED BY RELIABILITY, which is the quantity the report is named for: distance
        // from the nearest extreme, so the exon that is neither reliably in nor reliably
        // out comes first. `rank` is that score WEIGHTED by conservation and functional
        // sites, which is a different and more opinionated ordering -- it is still a
        // column, and still one of the orders the headers offer, but it is not what
        // "sort by reliability" means and should not be the default silently.
        const SORTS = {
            reliability: (a, b) => (b.score || 0) - (a.score || 0),
            score: (a, b) => (b.rank || 0) - (a.rank || 0),
            inclusion: (a, b) => (a.psi || 0) - (b.psi || 0),
            track: (a, b) => ('' + a.track).localeCompare('' + b.track)
                             || ((+a.exon) - (+b.exon)),
            exon: (a, b) => ((+a.exon) - (+b.exon))
        };
        // UNTRUSTED EXONS SINK WHATEVER THE SORT, because every one of these orderings is
        // computed from a number those exons do not honestly have.
        const sortRows = (key) => {
            const f = SORTS[key] || SORTS.reliability;
            rows.sort((a, b) => {
                if (a.untrusted !== b.untrusted) return a.untrusted ? 1 : -1;
                return f(a, b);
            });
        };
        sortRows('reliability');

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
            // NAMED WITH ITS REASON. "No result" on its own sends the reader to look for
            // a problem the run already diagnosed, and the commonest one here is not a
            // failure at all: a track loaded as cDNA has had its introns removed, so there
            // is nothing for a splicing model to score and no amount of waiting will
            // produce any.
            body += '<div style="font:12.5px Arial;color:#ffb4a2;margin-bottom:8px;">'
                + 'No result for ' + failed.length + ' track' + (failed.length === 1 ? '' : 's')
                + ', so ' + (failed.length === 1 ? 'it is' : 'they are')
                + ' missing from the table below rather than reported as having no unstable '
                + 'exons:<ul style="margin:5px 0 0 0;padding-left:18px;">'
                + failed.map((f) => '<li><b>' + H(f.name) + '</b> \u2014 ' + H(f.why) + '</li>').join('')
                + '</ul></div>';
        }

        // ------------------------------------------------------------- the picture -----
        //
        // THE CHART IS THE REPORT; THE TABLE IS THE EVIDENCE. Reliability is distance from
        // the nearest extreme, which is an awkward quantity to read as a column of decimals:
        // 0.04 and 0.96 are a constitutive exon and a coin flip, and nothing about the
        // digits says which matters. Drawn, it is obvious -- every exon is a bar whose
        // HEIGHT is inclusion and whose COLOUR is reliability, so a transcript of tall
        // green bars with one amber stub in the middle tells the whole story before anyone
        // reads a number.
        //
        // One row per track, exons in transcript order rather than ranked, because the
        // order on the track is how the reader finds the exon again. The ranked table
        // below answers "which one first"; this answers "where is it and what is around
        // it", and those are different questions.
        //
        // Laid out with inline styles and no canvas: the panel body is HTML, this has to
        // survive being copied into a document, and a canvas would be a blank rectangle
        // there.
        // Declared before the chart, which uses it too: a bar is as good a thing to click
        // as a row, and on a long transcript it is the one the reader is already looking at.
        const navs = {};
        let navN = 0;
        const navId = (r) => {
            const id = 'esr-nav-' + (navN++);
            navs[id] = { t: r.tobj, lo: r.lo, hi: r.hi, label: r.track + ' e' + r.exon };
            return id;
        };

        const BAR_H = 54;
        const colourOf = (r) => {
            if (r.untrusted) return '#5d7f90';                 // no trustworthy number
            if (r.measured) return '#c4b5fd';                  // measured, not predicted
            if (r.variant) return '#ff6b6b';                   // a variant moves it
            if (r.score == null) return '#8fb8c8';
            return (r.score <= 0.15) ? '#22c55e'               // reliably in or reliably out
                : (r.score <= 0.45) ? '#ffd79a' : '#ff9f68';   // variable, then unstable
        };

        const byTrack = {};
        for (const r of rows) (byTrack[r.track] = byTrack[r.track] || []).push(r);

        body += '<div style="margin:4px 0 14px 0;">';
        for (const nm of Object.keys(byTrack)) {
            // Transcript order for the picture. rows arrived ranked, which is right for the
            // table and wrong here: a chart in rank order is a bar chart of numbers, not a
            // picture of a transcript.
            const es = byTrack[nm].slice().sort((a, b) => (+a.exon) - (+b.exon));
            const worst = es.filter((r) => !r.untrusted)
                .sort((a, b) => (b.rank || 0) - (a.rank || 0))[0];
            body += '<div style="margin-bottom:12px;">'
                + '<div style="font:600 12.5px Arial;color:#eaf6f9;margin-bottom:4px;">'
                + H(nm) + '<span style="color:#8fb8c8;font-weight:400;"> \u00b7 '
                + es.length + ' exon' + (es.length === 1 ? '' : 's')
                + (worst ? (' \u00b7 least reliable: e' + H(worst.exon)) : '') + '</span></div>'
                + '<div style="display:flex;align-items:flex-end;gap:3px;height:' + (BAR_H + 18)
                + 'px;padding:4px 2px;background:rgba(255,255,255,0.03);border-radius:6px;'
                + 'overflow-x:auto;">';
            for (const r of es) {
                // An untrusted exon has no inclusion to draw, so it is a hollow stub rather
                // than a bar of some invented height: height is the one thing on this chart
                // that means a number, and giving it one would be inventing the number the
                // rest of this work exists to withhold.
                const shown = r.untrusted ? null
                    : (r.measured ? +r.measured.psi : +r.psi);
                const h = (shown == null) ? 6 : Math.max(3, Math.round(BAR_H * Math.max(0, Math.min(1, shown))));
                const col = colourOf(r);
                const tip = nm + ' e' + r.exon + ' \u2014 '
                    + (r.untrusted ? ('no trustworthy inclusion: shares sequence with '
                                      + (r.untrustedWhy || 'another gene'))
                       : (r.measured ? ('~' + pc(r.measured.psi) + ' measured') : pc(r.psi))
                         + ', ' + r.word)
                    + (r.variant ? ('; ' + (r.variant.ref || '?') + '>' + (r.variant.alt || '?')
                                    + ' takes it to ' + pc(r.variant.psiAlt)) : '');
                body += '<div id="' + navId(r) + '" title="' + H(tip)
                    + ' \u2014 click to go there" style="flex:0 0 auto;width:26px;cursor:pointer;'
                    + 'display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">';
                // WHERE A VARIANT TAKES IT, drawn under the bar it starts from, so the drop
                // is a distance on the page rather than two numbers to subtract.
                if (r.variant && isFinite(+r.variant.psiAlt) && !r.untrusted) {
                    const ah = Math.max(2, Math.round(BAR_H * Math.max(0, Math.min(1, +r.variant.psiAlt))));
                    body += '<div style="position:relative;width:22px;height:' + h + 'px;">'
                        + '<div style="position:absolute;bottom:0;left:0;width:22px;height:' + h
                        + 'px;background:' + col + ';opacity:0.30;border-radius:3px 3px 0 0;"></div>'
                        + '<div style="position:absolute;bottom:0;left:0;width:22px;height:' + ah
                        + 'px;background:' + col + ';border-radius:3px 3px 0 0;"></div>'
                        + '</div>';
                } else {
                    body += '<div style="width:22px;height:' + h + 'px;background:' + col + ';'
                        + (r.untrusted ? 'opacity:0.45;' : '') + 'border-radius:3px 3px 0 0;"></div>';
                }
                body += '<div style="font:10px Arial;color:#8fb8c8;margin-top:3px;">'
                    + H(r.exon) + '</div></div>';
            }
            body += '</div></div>';
        }
        // The legend names every colour the chart can draw, including the two that mean
        // "this is not a prediction" -- a reader who takes a violet bar for a model output
        // has been misled by the picture.
        body += '<div style="font:11.5px Arial;color:#8fb8c8;display:flex;gap:14px;'
            + 'flex-wrap:wrap;margin-top:2px;">'
            + [['#22c55e', 'reliable (in or out)'], ['#ffd79a', 'variable'],
               ['#ff9f68', 'unstable'], ['#ff6b6b', 'moved by a variant'],
               ['#c4b5fd', 'measured, not predicted'], ['#5d7f90', 'no trustworthy number']]
                .map(([c, t]) => '<span><span style="display:inline-block;width:9px;height:9px;'
                    + 'background:' + c + ';border-radius:2px;margin-right:4px;"></span>' + t + '</span>')
                .join('')
            + '<span>bar height = inclusion</span></div>';
        body += '</div>';

        // EVERY ROW GOES TO ITS EXON. A report that names an exon and leaves the reader
        // to find it on the canvas has only half-answered: the point of ranking exons is
        // to go and look at the one that came first. Each row and each bar frames its own
        // exon on its own track, through the same navigation the editor uses elsewhere.
        const HEADS = [['', null], ['track', 'track'], ['exon', 'exon'],
                       ['inclusion', 'inclusion'], ['reliability', 'reliability'],
                       ['with variant', null], ['cons', null], ['sites', null],
                       ['score', 'score']];
        let sortKey = 'reliability';
        const tableHtml = () => {
            let h = '<table style="width:100%;border-collapse:collapse;font:12px Arial;">'
                + '<tr style="text-align:left;color:#8fb8c8;border-bottom:1px solid rgba(255,255,255,0.14);">';
            HEADS.forEach(([label, key], i) => {
                const on = (key && key === sortKey);
                h += '<th style="padding:4px 6px;font-weight:' + (on ? '700' : '400') + ';">'
                    + (key
                        ? ('<a href="#" id="esr-sort-' + key + '" style="color:'
                           + (on ? '#4fd0e6' : '#8fb8c8') + ';text-decoration:none;">'
                           + H(label) + (on ? ' \u25be' : '') + '</a>')
                        : H(label))
                    + '</th>';
            });
            h += '</tr>';
            rows.forEach((r, i) => {
                const incl = r.measured
                    ? ('<span style="color:#c4b5fd;">~' + pc(r.measured.psi) + ' measured</span>')
                    : r.untrusted ? '<span style="color:#8fb8c8;">\u2013</span>' : pc(r.psi);
                const vcell = r.variant
                    ? ('<span style="color:#ffb4a2;">' + pc(r.variant.psiAlt) + ' '
                       + H((r.variant.ref || '?') + '>' + (r.variant.alt || '?'))
                       + (+r.variant.canonicalSite > 0 ? ' \u00b7 site' : '') + '</span>')
                    : '<span style="color:#5d7f90;">\u2013</span>';
                h += '<tr id="' + navId(r) + '" title="go to ' + H(r.track + ' exon ' + r.exon)
                    + '" style="border-bottom:1px solid rgba(255,255,255,0.08);cursor:pointer;">'
                    + '<td style="padding:4px 6px;color:#8fb8c8;">' + (i + 1) + '</td>'
                    + '<td style="color:#4fd0e6;">' + H(r.track) + '</td>'
                    + '<td>e' + H(r.exon) + '</td>'
                    + '<td>' + incl + '</td>'
                    + '<td style="color:' + (r.untrusted ? '#8fb8c8' : (COL[r.word] || '#eaf6f9'))
                    + ';">' + H(r.word) + '</td>'
                    + '<td>' + vcell + '</td>'
                    + '<td>' + (r.conservation == null ? '\u2013' : (+r.conservation).toFixed(2)) + '</td>'
                    + '<td>' + H(r.sites == null ? 0 : r.sites) + '</td>'
                    + '<td>' + (r.rank == null ? '\u2013' : (+r.rank).toFixed(3)) + '</td></tr>';
            });
            return h + '</table>';
        };
        body += '<div id="esr-table">' + tableHtml() + '</div>';

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
        if (notes.variantFailed.length) {
            // An empty "with variant" column has two meanings and they are opposites.
            foot.push('Variant scoring FAILED on ' + H(notes.variantFailed.join('; '))
                + '. The inclusion numbers for '
                + (notes.variantFailed.length === 1 ? 'that track' : 'those tracks')
                + ' are unaffected, but an empty "with variant" cell there means it was '
                + 'not scored, not that nothing moved.');
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

        // The same panel that has been showing progress since the start becomes the
        // report: opening a second one here would leave the progress window behind it.
        paint('Exon stability report · ' + summary, body);

        // GOING TO AN EXON, and the sort. Both are wired after the panel exists, and
        // both are re-wired after a re-sort: the table is rebuilt, so every handler
        // attached to the old rows went with them.
        const goTo = async (id) => {
            const d = navs[id];
            if (!d || !d.t) return;
            try { graph.selectedTrack = d.t; } catch (e) { }
            if (typeof navigate === 'function') {
                try { await navigate(d.t, d.lo, d.hi); } catch (e) { }
            }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            try { graph.setMessage(' ' + d.label + ' '); } catch (e) { }
        };
        const wire = () => {
            try {
                for (const id of Object.keys(navs)) {
                    const el = p && p.body && p.body.querySelector('#' + id);
                    if (el) el.onclick = (e) => { try { e.preventDefault(); } catch (e2) { } goTo(id); };
                }
                for (const k of Object.keys(SORTS)) {
                    const a = p && p.body && p.body.querySelector('#esr-sort-' + k);
                    if (!a) continue;
                    a.onclick = (e) => {
                        try { e.preventDefault(); } catch (e2) { }
                        sortKey = k;
                        sortRows(k);
                        // The ids are handed out as the table is written, so a rebuild
                        // issues new ones; the old entries would otherwise accumulate and
                        // point at rows that no longer exist.
                        for (const id of Object.keys(navs)) {
                            if (/^esr-nav-/.test(id) && !(p.body.querySelector('#' + id))) delete navs[id];
                        }
                        const host = p.body.querySelector('#esr-table');
                        if (host) host.innerHTML = tableHtml();
                        wire();
                    };
                }
            } catch (e) { }
        };
        wire();

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
