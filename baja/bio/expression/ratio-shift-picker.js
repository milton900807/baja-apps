function (graph, opts) {

    // CHOOSING THE TWO TRACKS FOR A RATIO SHIFT, AND THEN RUNNING IT.
    //   exec('baja/bio/expression/ratio-shift-picker.js', graph, { up: t, down: t, top: 8 });
    //
    // The model takes a pair with a DIRECTION: one transcript is raised and the other has
    // its local translation taken away, and swapping them is a different experiment with a
    // different answer. Guessing that from what happens to be selected is the one thing this
    // must not do, so it is asked, in two steps, in the order the sentence runs: raise this
    // one, lower that one.
    //
    // Either end can be passed in by a caller that already knows it, and only the missing
    // half is asked. Tracks with no sequence are not offered at all, because the model
    // refuses them and an option that leads to a refusal is worse than one that is absent.

    return (async () => {
        const o = opts || {};
        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };

        const usable = ((graph && graph.track) || []).filter((t) => {
            try { return !!t && ('' + (t.sequence || '')).length >= 40; } catch (e) { return false; }
        });
        if (usable.length < 2) {
            say('Ratio shift is a model of a PAIR: it needs two transcripts with sequence on the '
                + 'canvas, and there ' + (usable.length === 1 ? 'is one' : 'are none')
                + '. Load the second one, or cut the two 3’ UTRs out first.');
            return false;
        }

        const label = (t) => ('' + (t.name || '(unnamed)'));
        const sub = (t) => {
            const n = ('' + (t.sequence || '')).length;
            const bits = [n.toLocaleString() + ' nt'];
            if (t.species) bits.push('' + t.species);
            if (t.chr) bits.push('' + t.chr);
            if (+(t.strand || 0) < 0) bits.push('minus strand');
            return bits.join(' · ');
        };
        // pick-list reports through a callback, so the two questions are awaited one at a
        // time rather than both being thrown up at once. onClose resolves to nothing when
        // the list is dismissed: without it, closing the first question would leave this
        // waiting for ever and the command would appear to have been swallowed.
        const pick = (title, subtitle, list) => new Promise((resolve) => {
            let done = false;
            const once = (v) => { if (!done) { done = true; resolve(v); } };
            exec('baja/lib/pick-list.js', {
                title: title, subtitle: subtitle,
                items: list.map((t) => ({ label: label(t), sub: sub(t), ref: t })),
                onPick: (item) => once((item && item.ref) || null),
                onClose: () => once(null)
            }).then((r) => { if (r === null) once(null); });   // nothing to show at all
        });

        let up = o.up || null;
        if (!up) {
            up = await pick('Ratio shift · which transcript to RAISE',
                'Its repression is what gets blocked. ' + usable.length + ' transcripts with sequence',
                usable);
            if (!up) { say('Ratio shift: no transcript chosen to raise.'); return false; }
        }
        let down = o.down || null;
        if (!down) {
            const rest = usable.filter((t) => t !== up);
            if (!rest.length) { say('Ratio shift: there is no second transcript to lower.'); return false; }
            down = await pick('Ratio shift · which transcript to LOWER',
                'Its transport and local translation are what get blocked, with ' + label(up) + ' raised',
                rest);
            if (!down) { say('Ratio shift: no transcript chosen to lower.'); return false; }
        }
        if (up === down) { say('Ratio shift: those are the same track, so there is no ratio to shift.'); return false; }

        say('Ratio shift: scanning ' + label(up) + ' for repression to relieve and '
            + label(down) + ' for transport to block…');
        const m = await exec('baja/bio/expression/ratio-shift-model.js',
            { up: up, down: down, top: (o.top != null) ? +o.top : 8,
              footprint: (o.footprint != null) ? +o.footprint : 20 });
        return exec('baja/bio/expression/ratio-shift-view.js', graph, m, { up: up, down: down });
    })();
}
