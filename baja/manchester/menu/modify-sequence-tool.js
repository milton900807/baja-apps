function (graph, track, range) {
    // MODIFY A STRETCH OF SEQUENCE, described in words. Shared by the selected-sequence menu
    // (which passes the selection) and the track menu (which passes nothing, meaning all of
    // it), so the two cannot drift apart.
    //
    //   await exec('baja/manchester/menu/modify-sequence-tool.js', graph, track, {start, end})
    //   await exec('baja/manchester/menu/modify-sequence-tool.js', graph, track)   // whole track
    //
    // Returns { ok, applied, why }.
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const tell = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { say(m); } };
    const dna = (x) => ('' + (x || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
    const done = (ok, applied, why) => ({ ok: ok, applied: !!applied, why: why || '' });

    return (async () => {
        const t = track;
        if (!t || typeof t.sequence !== 'string' || !t.sequence.length) {
            say(' That track has no sequence to modify. ');
            return done(false, false, 'no sequence');
        }
        const xi = Number(t.xi) || 0;
        const whole = !range || !(Number(range.end) > Number(range.start));
        // The span, as offsets into the stored sequence. A selection is in the same
        // coordinates the marks are; the whole track is simply all of it.
        const from = whole ? 0 : Math.max(0, Math.floor(Number(range.start)) - xi);
        const to = whole ? t.sequence.length : Math.min(t.sequence.length, Math.ceil(Number(range.end)) - xi);
        if (!(to > from)) { say(' Nothing to modify. '); return done(false, false, 'empty span'); }

        const before = dna(t.sequence.slice(from, to));
        if (!before) { say(' Nothing to modify in that span. '); return done(false, false, 'no bases'); }
        const len = to - from;
        const gStart = xi + from, gEnd = xi + to;

        let va = null;
        try {
            va = await prompt('Modify ' + len.toLocaleString() + ' nt of ' + (t.name || 'this track')
                + (whole ? '' : '  (' + gStart + '–' + gEnd + ')'),
                ['Describe the modification'], { 'Describe the modification': '' }, 560, 260);
        } catch (e) { va = null; }
        const ask = va ? ('' + (va['Describe the modification'] || '')).trim() : '';
        if (!ask) { say(' No modification described. '); return done(false, false, 'cancelled'); }

        // The bases either side, so a change that depends on what the span sits between can be
        // made correctly. Context only -- never written back. The whole track has no flanks.
        const ctx = {
            gene: t.name || '', track: t.name || '', strand: t.strand,
            chr: t.contig || t.chr || '', start: gStart, end: gEnd,
            left: whole ? '' : dna(t.sequence.slice(Math.max(0, from - 60), from)),
            right: whole ? '' : dna(t.sequence.slice(to, Math.min(t.sequence.length, to + 60)))
        };

        say(' Working out the modification… ');
        const em = new EngineMonitor((m) => { try { say(m); } catch (e) { } });
        let r = null;
        try { r = await exec('/py/sequence/modify-sequence.py', em, before, ask, JSON.stringify(ctx)); }
        catch (e) { r = null; }
        if (!r || r.error || !r.ok) {
            const why = (r && r.error) || 'The modification could not be made.';
            say(' ' + why + ' ');
            return done(false, false, why);
        }
        const after = ('' + (r.sequence || '')).toUpperCase();
        if (!after) { say(' Nothing came back to apply. '); return done(false, false, 'empty reply'); }
        if (!r.changed || after === before) {
            say(' That leaves the sequence as it is — nothing was changed. ');
            return done(true, false, 'no change');
        }

        // SHOWN BEFORE IT IS APPLIED. What comes back can be checked for being a sequence and
        // for not running away in length; it cannot be checked against the DESCRIPTION --
        // asked to drop ten bases it may drop thirteen and say it dropped ten. So the change
        // is stated in the numbers that are certain and written only when accepted.
        const d0 = after.length - before.length;
        const howMany = (d0 === 0) ? 'the same length'
            : (d0 > 0 ? ('+' + d0 + ' nt longer') : (Math.abs(d0) + ' nt shorter'));
        // THE SPANS THAT CHANGE, NAMED. The reply is a list of positions to replace and
        // everything outside them is copied from the original, so naming them says exactly
        // what the edit does. Without it, "141 nt becomes 131 nt" leaves the reader to guess
        // where the ten went.
        let edits = [];
        try { edits = JSON.parse(r.edits || '[]'); } catch (e) { edits = []; }
        const cutTo = (x, n) => { x = '' + x; return x.length > n ? (x.slice(0, n) + '\u2026') : x; };
        const spans = edits.slice(0, 6).map((e) => {
            const at = gStart + (Number(e.start) || 1) - 1;
            const wasN = ('' + (e.was || '')).length, repN = ('' + (e.replacement || '')).length;
            if (!repN) return at + ': remove ' + wasN + ' nt';
            if (!wasN) return at + ': add ' + repN + ' nt';
            return at + ': ' + cutTo(e.was, 12) + ' \u2192 ' + cutTo(e.replacement, 12);
        }).join(';  ') + (edits.length > 6 ? ';  and ' + (edits.length - 6) + ' more' : '');
        const accepted = await new Promise((resolve) => {
            let settled = false;
            const fin = (v) => { if (!settled) { settled = true; resolve(v); } };
            try {
                Promise.resolve(exec('baja/lib/confirm.js',
                    (edits.length === 1 ? 'One change' : (edits.length + ' changes'))
                    + ' to ' + (t.name || 'this track') + ', leaving it ' + howMany + '.  '
                    + (spans ? spans + '.  ' : '')
                    + 'Nothing outside ' + (edits.length === 1 ? 'that span' : 'those spans')
                    + ' is altered.' + (r.note ? '  ' + r.note : ''),
                    () => fin(true), 'Replace'))
                    .then(() => { setTimeout(() => fin(false), 120000); })
                    .catch(() => fin(false));
            } catch (e) { fin(false); }
        });
        if (!accepted) { say(' Nothing was changed. '); return done(true, false, 'declined'); }

        // The span on the track has to still be the span that was sent, or the edit would land
        // on bases nobody looked at.
        const now = dna(t.sequence.slice(from, to));
        if (now !== before) {
            say(' The sequence changed while the modification was being worked out — nothing applied. ');
            return done(false, false, 'sequence moved');
        }
        // No history snapshot here: confirm.js pushes one before it calls back, and a second
        // would mean two Undos to get one edit back.
        const seq = '' + t.sequence;
        const delta = after.length - (to - from);
        t.sequence = seq.slice(0, from) + after + seq.slice(to);
        if (delta !== 0) {
            const at = xi + to;                 // everything past the span moves with it
            for (const an of (t.annotations || [])) {
                if (!an) continue;
                const ai = Number(an.xi), af = Number(an.xf);
                if (Number.isFinite(ai) && ai >= at) an.xi = ai + delta;
                if (Number.isFinite(af) && af >= at) an.xf = af + delta;
            }
            try { t.xf = (Number(t.xf) || (xi + seq.length)) + delta; } catch (e) { }
            try { if (t.tgraph && t.tgraph.setxmax) { t.tgraph.setxmax(t.xf); t.tgraph.rescale(); } } catch (e) { }
            try { if (Number.isFinite(t.markend) && t.markend >= at) t.markend = t.markend + delta; } catch (e) { }
        }
        try { t.__colFontCache = null; } catch (e) { }
        try { if (typeof t.generateORF === 'function') t.generateORF(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        const how = (delta === 0) ? 'same length' : (delta > 0 ? ('+' + delta + ' nt') : (delta + ' nt'));
        tell((t.name || 'Track') + ' ' + gStart + '–' + gEnd + ': ' + (r.note || 'modified')
            + ' (' + how + '). Undo puts it back.');
        return done(true, true, '');
    })();
}
