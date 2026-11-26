function (graph, model, opts) {

    // THE RATIO SHIFT MODEL, SHOWN: a window of what to block, and the sites marked.
    //   await exec('baja/bio/expression/ratio-shift-view.js', graph, model, { up: tA, down: tB });
    //
    // Two columns, because the two arms are different claims and merging them into one
    // ranked table would read as one list of equally good ideas. Raising is relieving
    // repression; lowering is taking local translation away, which changes where a protein
    // is made rather than how much there is. The verdict and the limits are above the
    // shortlist rather than under it: a table of sites with sequences in it reads as a
    // finished design, and the reader who stops after the table is the one this is for.

    return (async () => {
        const o = opts || {};
        const m = model || {};
        const say = (t) => { try { graph.setResultMessage(' ' + t + ' '); } catch (e) { try { graph.setMessage(' ' + t + ' '); } catch (e2) { } } };
        if (!m.ok) { say('Ratio shift: ' + (m.reason || 'nothing came back.')); return false; }

        const OV = await exec('baja/lib/canvas-overlay-panel.js');
        const C = OV.colors;
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const n = (v) => (+v || 0).toLocaleString();

        const COLOR = { mirna: 'rgba(74,222,128,0.60)', rbp: 'rgba(167,139,250,0.60)' };

        const column = (arm, side) => {
            const head = (side === 'up')
                ? ('Raise ' + esc(arm.track) + ': relieve repression')
                : ('Lower ' + esc(arm.track) + ': take away local translation');
            const rows = (arm.candidates || []).map((r) => {
                const sel = r.selective
                    ? ('<span style="color:' + C.ok + '">' + r.mismatches + ' mismatches from '
                        + 'the other transcript</span>')
                    : ('<span style="color:' + C.warm + '">only ' + r.mismatches + ' mismatches from '
                        + 'the other transcript, so a blocker here would probably hit both</span>');
                return '<tr>'
                    + '<td style="padding:7px 10px;vertical-align:top;white-space:nowrap;color:' + C.title + ';font-weight:600">'
                    + esc(r.label) + (r.ambiguous ? ' <span style="color:' + C.warm + ';font-weight:400">(cuts both ways)</span>' : '')
                    + '</td>'
                    + '<td style="padding:7px 10px;vertical-align:top;white-space:nowrap;color:' + C.dim + '">'
                    + n(r.start) + '–' + n(r.end) + '</td>'
                    + '<td style="padding:7px 10px;vertical-align:top">'
                    + esc(r.detail || '')
                    + '<div style="margin-top:4px;font-size:12px;color:' + C.dim + '">' + sel + '</div>'
                    + '<div style="margin-top:4px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:'
                    + C.accent + '">' + esc(r.footprint) + '</div>'
                    + '<div style="font-size:11px;color:' + C.dim + '">the ' + ('' + r.footprint).length
                    + '-mer a blocker would cover, ' + n(r.footprintStart) + '–' + n(r.footprintEnd)
                    + ', written as the message reads</div>'
                    + '</td></tr>';
            }).join('');

            return '<div style="flex:1 1 0;min-width:320px">'
                + '<div style="font:700 14px ' + C.font + ';color:' + C.title + ';margin:0 0 6px">' + head + '</div>'
                + '<div style="font-size:12px;color:' + C.dim + ';margin:0 0 10px">'
                + n(arm.all) + ' site' + (arm.all === 1 ? '' : 's') + ' found, ' + n(arm.selective)
                + ' of them blockable without matching the other transcript'
                + (arm.minus ? ' · minus strand, scanned on the message' : '')
                + (arm.missing && arm.missing.length
                    ? (' · the model has no head for ' + arm.missing.map(esc).join(', ')
                        + ', so nothing was looked for there')
                    : '')
                + '</div>'
                + (rows
                    ? ('<table style="border-collapse:collapse;width:100%;font-size:13px">' + rows + '</table>')
                    : ('<div style="color:' + C.warm + '">Nothing to aim at on this arm.</div>'))
                + '</div>';
        };

        // ONE SEQUENCE THAT DOES BOTH, ABOVE THE TWO ARMS. It is a different design, not a
        // better candidate: one molecule where the arms need two, and the two effects then
        // arrive together at one dose. That is worth the top of the window when it exists,
        // and worth saying plainly when it does not, because "no dual sequence" is an
        // answer to the question that was asked and an empty section is not.
        const dualBlock = (() => {
            const list = m.dual || [];
            if (!list.length) {
                return '<div style="border:1px solid ' + C.rule + ';border-radius:10px;padding:12px 14px;margin:0 0 14px">'
                    + '<div style="font:700 13px ' + C.font + ';color:' + C.accent + ';letter-spacing:.04em;margin-bottom:4px">ONE SEQUENCE THAT DOES BOTH</div>'
                    + '<div style="color:' + C.dim + '">None. No stretch is shared closely enough by both '
                    + 'messages while also sitting over something repressive on ' + esc(m.up.track)
                    + ' and over transport or local initiation on ' + esc(m.down.track)
                    + ', so the two arms below need an oligo each.</div></div>';
            }
            const rows = list.map((d) => ''
                + '<tr>'
                + '<td style="padding:8px 10px;vertical-align:top;font-family:ui-monospace,Menlo,monospace;'
                + 'font-size:13px;color:' + C.accent + ';white-space:nowrap">' + esc(d.footprint)
                + '<div style="font-size:11px;color:' + C.dim + ';font-family:' + C.font + '">read off '
                + esc(d.writtenFor === 'up' ? m.up.track : m.down.track) + ', '
                + (d.mismatches === 0
                    ? 'identical in both'
                    : (d.mismatches + ' mismatch' + (d.mismatches === 1 ? '' : 'es') + ' against the other, which costs affinity there'))
                + '</div></td>'
                + '<td style="padding:8px 10px;vertical-align:top">'
                + '<div><span style="color:' + C.ok + '">raises</span> ' + esc(m.up.track) + ': over '
                + esc(d.raises.label) + ' at ' + n(d.upStart) + '\u2013' + n(d.upEnd) + '</div>'
                + '<div><span style="color:' + C.warm + '">lowers</span> ' + esc(m.down.track) + ': over '
                + esc(d.lowers.label) + ' at ' + n(d.downStart) + '\u2013' + n(d.downEnd) + '</div>'
                + '<div style="font-size:12px;color:' + C.dim + ';margin-top:3px">covers ' + n(d.covered)
                + ' nt of the far site \u00b7 ' + esc(d.lowers.detail || '') + '</div>'
                + '</td></tr>').join('');
            return '<div style="border:1px solid ' + C.outline + ';border-radius:10px;padding:12px 14px;margin:0 0 14px">'
                + '<div style="font:700 13px ' + C.font + ';color:' + C.accent + ';letter-spacing:.04em;margin-bottom:6px">ONE SEQUENCE THAT DOES BOTH</div>'
                + '<div style="font-size:12px;color:' + C.dim + ';margin-bottom:8px">Shared by both messages, '
                + 'repressive on ' + esc(m.up.track) + ' and transport or local initiation on '
                + esc(m.down.track) + '. One blocker raises the first and strands the second, so the '
                + 'two effects arrive together and cannot be dosed apart.</div>'
                + '<table style="border-collapse:collapse;width:100%;font-size:13px">' + rows + '</table></div>';
        })();

        const body = ''
            // THE VERDICT FIRST, and it is a direction, never a ratio: nothing in the model
            // measures either message.
            + '<div style="border:1px solid ' + C.outline + ';border-radius:10px;padding:12px 14px;margin:0 0 14px">'
            + '<div style="font:700 13px ' + C.font + ';color:' + C.accent + ';letter-spacing:.04em;margin-bottom:4px">WHAT THE PAIR SUPPORTS</div>'
            + '<div>' + esc(m.verdict || '') + '</div></div>'
            + dualBlock
            + '<div style="display:flex;gap:22px;flex-wrap:wrap">' + column(m.up, 'up') + column(m.down, 'down') + '</div>'
            + '<div style="margin-top:18px;border-top:1px solid ' + C.rule + ';padding-top:12px">'
            + '<div style="font:700 13px ' + C.font + ';color:' + C.accent + ';letter-spacing:.04em;margin-bottom:6px">WHAT THIS IS NOT</div>'
            + '<ul style="margin:0;padding-left:18px;color:' + C.text + ';font-size:13px;line-height:1.5">'
            + (m.limits || []).map((x) => '<li style="margin-bottom:4px">' + esc(x) + '</li>').join('')
            + '</ul></div>';

        OV.open({
            id: 'baja-ratio-shift',
            title: 'Ratio shift · raise ' + (m.up.track || '') + ', lower ' + (m.down.track || ''),
            body: body,
            maximized: true
        });

        // ---- the same sites, on the tracks ------------------------------------------------
        // The window says what to block; the layer says where, beside the sequence it is a
        // claim about. A table of coordinates read away from the track is how a blocker ends
        // up drawn against the wrong end of a UTR.
        const TrackLayer = await exec('baja/bio/track-layer.js');
        // A 20-MER IS NOT VISIBLE ON A TRANSCRIPT. Drawn true to size it is a hairline at any
        // zoom that shows a whole 3' UTR and nothing at all on a gene, so the layer read as
        // empty: WHERE is the one thing this layer exists to say. Bands narrower than this
        // are widened to it, every label and help row carries the real span, and the note
        // says the widening happened, because a band wider than its oligo is a lie about
        // coordinates unless it is declared.
        const minWidth = (track) => {
            try {
                const span = Math.abs((+track.xf) - (+track.xi));
                // A track that does not say how wide it is gets no widening at all: a made
                // up minimum would draw bands at a size with nothing behind it.
                if (!isFinite(span) || span <= 0) return 1;
                return Math.max(1, Math.round(span / 300));
            } catch (e) { return 1; }
        };
        const mark = async (arm, track, side, otherArm) => {
            if (!track || !arm || !(arm.candidates || []).length) return;
            const MIN = minWidth(track);
            const widen = (a, b) => {
                if ((b - a + 1) >= MIN) return [a, b];
                const pad = Math.floor((MIN - (b - a + 1)) / 2);
                return [a - pad, b + pad];
            };
            // Where a blocker aimed at the OTHER track would also land on this one. These
            // are coordinates on this track, so this is where they belong.
            const strays = ((otherArm && otherArm.candidates) || []).filter(
                (r) => !r.selective && r.otherStart != null);
            const pts = [];
            for (const r of arm.candidates) pts.push(r.footprintStart, r.footprintEnd);
            for (const r of strays) pts.push(r.otherStart, r.otherEnd);
            for (const d of (m.dual || [])) {
                const a0 = (side === 'up') ? d.upStart : d.downStart;
                const b0 = (side === 'up') ? d.upEnd : d.downEnd;
                if (a0 != null && b0 != null) pts.push(a0, b0);
            }
            const L = new TrackLayer((track.name || 'track') + '_RATIO_' + (side === 'up' ? 'raise' : 'lower'),
                Math.min.apply(null, pts) - MIN, 0, Math.max.apply(null, pts) + MIN, 1);
            L.type = 'RatioShift';
            L.labelColor = '#eaf6f9';
            L.fixedIntervalDepth = 12;
            L.allowStackedIntervals = true;
            const lanes = [0.7, 0.45, 0.2];
            let i = 0;
            const rowsHelp = [];
            for (const r of arm.candidates) {
                const a = Math.min(r.footprintStart, r.footprintEnd), b = Math.max(r.footprintStart, r.footprintEnd);
                const d = widen(a, b);
                L.addInterval(d[0], d[1], lanes[i % lanes.length],
                    r.label + ' \u00b7 ' + (b - a + 1) + ' nt' + (r.selective ? '' : ' \u00b7 hits both'),
                    r.selective ? COLOR[r.kind] : 'rgba(159,196,212,0.35)');
                i++;
                rowsHelp.push([r.label + ' ' + a + '\u2013' + b,
                    (r.detail || '') + ' \u00b7 ' + r.mismatches + ' mismatches from the other transcript \u00b7 '
                    + r.footprint]);
            }
            // THE DUAL SEQUENCES, ON BOTH TRACKS. The same oligo is a band on each, which is
            // the claim made visible: one stretch, two jobs. Drawn in its own colour because
            // it is not a better version of the candidates around it but a different design.
            for (const d of (m.dual || [])) {
                const a0 = (side === 'up') ? d.upStart : d.downStart;
                const b0 = (side === 'up') ? d.upEnd : d.downEnd;
                if (a0 == null || b0 == null) continue;
                const a = Math.min(a0, b0), b = Math.max(a0, b0);
                const dd = widen(a, b);
                L.addInterval(dd[0], dd[1], lanes[i % lanes.length],
                    'one sequence: raises ' + d.raises.label + ', lowers ' + d.lowers.label,
                    'rgba(79,208,230,0.65)');
                i++;
                rowsHelp.push(['one sequence, ' + a + '\u2013' + b,
                    'the same blocker over ' + d.raises.label + ' on ' + m.up.track + ' and '
                    + d.lowers.label + ' on ' + m.down.track + ' \u00b7 ' + d.footprint
                    + ' \u00b7 ' + (d.mismatches === 0 ? 'identical in both'
                        : (d.mismatches + ' mismatches against the other message'))]);
            }

            // A CANDIDATE CALLED UNSELECTIVE IS A STATEMENT ABOUT THIS TRACK: the sequence
            // it would also match is here. Said only as a mismatch count in a table, it
            // leaves the reader to find the place by eye.
            for (const r of strays) {
                const a = Math.min(r.otherStart, r.otherEnd), b = Math.max(r.otherStart, r.otherEnd);
                const d = widen(a, b);
                L.addInterval(d[0], d[1], lanes[i % lanes.length],
                    r.label + ' blocker would also bind here', 'rgba(248,113,113,0.45)');
                i++;
                rowsHelp.push(['a blocker aimed at ' + r.label + ' on ' + (r.otherTrack || 'the other track')
                    + ' would also bind ' + a + '\u2013' + b,
                    'only ' + r.mismatches + ' mismatches from its ' + ('' + r.footprint).length
                    + '-mer, which is why that site is not offered as selective']);
            }
            L.decor = {
                help: {
                    title: (side === 'up' ? 'Block to raise ' : 'Block to lower ') + (track.name || ''),
                    rows: rowsHelp,
                    note: 'Each band is where a steric blocker would sit, not a measurement. '
                        + (side === 'up'
                            ? 'Blocking a repressive site should raise output only where the repressor is present and using it.'
                            : 'Blocking a transport or local-initiation site changes where the protein is made more than how much of it there is.')
                        + ' A band drawn pale matches the other transcript closely enough that '
                        + 'one blocker would act on both, and a red band is where a blocker '
                        + 'aimed at the other transcript would also land on this one.'
                        + ' Bands narrower than ' + MIN + ' bases at this zoom are drawn at that '
                        + 'width so they can be seen; the length in every label and row is the '
                        + 'real one.'
                }
            };
            L.ratioShift = arm.candidates;
            try { track.addLayer(L); } catch (e) { try { (track.track_layers || []).push(L); } catch (e2) { } }
            // Pulsed on arrival: a new layer on a track that already carries several is
            // otherwise one more row to find.
            try { if (L.setTimedHighlight) L.setTimedHighlight(10000); } catch (e) { }
        };
        await mark(m.up, o.up, 'up', m.down);
        await mark(m.down, o.down, 'down', m.up);
        try { if (graph.rescale) graph.rescale(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        say('Ratio shift: ' + (m.dual && m.dual.length
            ? (m.dual.length + ' sequence' + (m.dual.length === 1 ? '' : 's')
                + ' would do both ends at once; ')
            : 'no single sequence does both ends; ')
            + m.up.selective + ' selective site' + (m.up.selective === 1 ? '' : 's')
            + ' to raise ' + m.up.track + ' and ' + m.down.selective + ' to lower ' + m.down.track
            + ', drawn on each track and listed in the window. These are proposals from sequence '
            + 'alone: nothing here measures either message or says a site is used.');
        return true;
    })();
}
