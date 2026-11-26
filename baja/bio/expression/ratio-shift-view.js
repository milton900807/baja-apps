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

        const body = ''
            // THE VERDICT FIRST, and it is a direction, never a ratio: nothing in the model
            // measures either message.
            + '<div style="border:1px solid ' + C.outline + ';border-radius:10px;padding:12px 14px;margin:0 0 14px">'
            + '<div style="font:700 13px ' + C.font + ';color:' + C.accent + ';letter-spacing:.04em;margin-bottom:4px">WHAT THE PAIR SUPPORTS</div>'
            + '<div>' + esc(m.verdict || '') + '</div></div>'
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
        const mark = async (arm, track, side) => {
            if (!track || !arm || !(arm.candidates || []).length) return;
            const lo = Math.min.apply(null, arm.candidates.map((r) => r.footprintStart));
            const hi = Math.max.apply(null, arm.candidates.map((r) => r.footprintEnd));
            const L = new TrackLayer((track.name || 'track') + '_RATIO_' + (side === 'up' ? 'raise' : 'lower'),
                Math.min(lo, hi), 0, Math.max(lo, hi), 1);
            L.type = 'RatioShift';
            L.labelColor = '#eaf6f9';
            L.fixedIntervalDepth = 12;
            L.allowStackedIntervals = true;
            const lanes = [0.7, 0.45, 0.2];
            let i = 0;
            const rowsHelp = [];
            for (const r of arm.candidates) {
                const a = Math.min(r.footprintStart, r.footprintEnd), b = Math.max(r.footprintStart, r.footprintEnd);
                L.addInterval(a, b, lanes[i % lanes.length], r.label + (r.selective ? '' : ' (hits both)'),
                    r.selective ? COLOR[r.kind] : 'rgba(159,196,212,0.35)');
                i++;
                rowsHelp.push([r.label + ' ' + a + '–' + b,
                    (r.detail || '') + ' · ' + r.mismatches + ' mismatches from the other transcript · '
                    + r.footprint]);
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
                        + 'one blocker would act on both.'
                }
            };
            L.ratioShift = arm.candidates;
            try { track.addLayer(L); } catch (e) { try { (track.track_layers || []).push(L); } catch (e2) { } }
        };
        await mark(m.up, o.up, 'up');
        await mark(m.down, o.down, 'down');
        try { if (graph.rescale) graph.rescale(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        say('Ratio shift: ' + m.up.selective + ' selective site' + (m.up.selective === 1 ? '' : 's')
            + ' to raise ' + m.up.track + ' and ' + m.down.selective + ' to lower ' + m.down.track
            + ', drawn on each track and listed in the window. These are proposals from sequence '
            + 'alone: nothing here measures either message or says a site is used.');
        return true;
    })();
}
