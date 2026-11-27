function (graph, options) {

    // THE PLAIN THINGS YOU DO TO A LAYER, in one place so a prompt and a menu press mean
    // the same thing.
    //   await exec('baja/bio/layers/layer-ops.js', graph,
    //              { action: 'hide', match: 'RBP', track: 'DNM3_3utr' })
    //   await exec('baja/bio/layers/layer-ops.js', graph, { action: 'list' })
    //   await exec('baja/bio/layers/layer-ops.js', graph,
    //              { action: 'color', match: 'SIM', color: '#ffb4a2' })
    //
    // ACTIONS
    //   list                    what layers exist, per track, in draw order
    //   hide | show             stop drawing them | draw them again
    //   hide_all | show_all     every layer on the tracks in scope
    //   color                   one colour onto every match
    //   rename                  a new name (one match only: two layers with the same
    //                           name is a list nobody can read)
    //   front | back | forward | backward      draw order
    //   remove                  off the track altogether
    //
    // HIDING IS NOT GREYING AND NEITHER IS REMOVING. Greying keeps a layer drawn, faint,
    // so something else can be read over it (baja/bio/layers/focus-layer.js). Hiding
    // stops it being drawn and keeps it in the list. Removing takes it off the track and
    // it has to be computed again. Three different things, so they are three different
    // actions and this file refuses to guess between them.
    //
    // A MATCH THAT HITS NOTHING IS REPORTED, by name, with what was there instead. The
    // silent no-op is the worst outcome here: the user asked for something, the screen
    // did not change, and nothing said why.

    const o = options || {};
    const act = ('' + (o.action || 'list')).toLowerCase();
    const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) {
        try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };
    const wake = () => { try { if (graph.wake) graph.wake(); } catch (e) { } };

    const nameOf = (l) => ('' + ((l && (l.name || l.data_type || l.attribution_type)) || 'layer'));
    const trackName = (t) => ('' + ((t && t.name) || 'track'));

    return (async () => {
        const all = ((graph && graph.track) || []).filter(Boolean);
        if (!all.length) { say('There are no tracks open, so there are no layers to work on.'); return { ok: false, why: 'no tracks' }; }

        // WHICH TRACKS. A named track, or all of them. A name that matches nothing is an
        // error and not "all of them": the user named a track for a reason.
        let tracks = all;
        if (o.track) {
            const q = ('' + o.track).trim().toLowerCase();
            tracks = all.filter((t) => trackName(t).toLowerCase().indexOf(q) >= 0);
            if (!tracks.length) {
                say('No track here is called ' + o.track + '. Open: '
                    + all.map(trackName).join(', ') + '.');
                return { ok: false, why: 'no such track' };
            }
        }

        const layersOf = (t) => ((t && t.track_layers) || []).filter(Boolean);

        if (act === 'list') {
            const lines = [];
            for (const t of tracks) {
                const ls = layersOf(t).slice().reverse();      // front first, as the rows read
                lines.push(trackName(t) + ' (' + ls.length + '): '
                    + (ls.length
                        ? ls.map((l) => nameOf(l) + (l.visible === false ? ' [hidden]' : '')
                            + (l.muted ? ' [greyed]' : '')).join(', ')
                        : 'no layers'));
            }
            say(lines.join('   ·   '));
            return { ok: true, tracks: tracks.map((t) => ({ track: trackName(t),
                layers: layersOf(t).slice().reverse().map((l) => ({
                    name: nameOf(l), hidden: l.visible === false, greyed: !!l.muted })) })) };
        }

        const everything = (act === 'hide_all' || act === 'show_all');
        const q = ('' + (o.match || '')).trim().toLowerCase();
        if (!everything && !q) {
            say('Which layer? Name it, or part of its name. ' + act + ' needs to know what to '
                + 'act on, and acting on every layer is hide_all or show_all, which say so.');
            return { ok: false, why: 'no match given' };
        }

        const hits = [];
        for (const t of tracks) {
            for (const l of layersOf(t)) {
                if (everything || nameOf(l).toLowerCase().indexOf(q) >= 0) hits.push({ t: t, l: l });
            }
        }
        if (!hits.length) {
            const had = [];
            for (const t of tracks) for (const l of layersOf(t)) had.push(nameOf(l));
            say('No layer here is called ' + (o.match || '') + '. '
                + (had.length ? ('On ' + tracks.map(trackName).join(', ') + ': '
                    + had.slice(0, 12).join(', ') + (had.length > 12 ? ', and more' : '') + '.')
                    : 'Those tracks carry no layers at all.'));
            return { ok: false, why: 'no match', matched: 0 };
        }

        const names = hits.map((h) => nameOf(h.l));
        const summary = (verb) => verb + ' ' + hits.length + ' layer' + (hits.length === 1 ? '' : 's')
            + ': ' + names.slice(0, 8).join(', ') + (names.length > 8 ? ', and more' : '') + '.';

        if (act === 'hide' || act === 'hide_all' || act === 'show' || act === 'show_all') {
            const on = (act === 'show' || act === 'show_all');
            for (const h of hits) h.l.visible = on;
            wake();
            say(summary(on ? 'Showing' : 'Hiding')
                + (on ? '' : ' They are still on the track and still in the list; '
                    + 'greying them instead keeps them drawn, faint.'));
            return { ok: true, matched: hits.length, names: names };
        }

        if (act === 'color' || act === 'colour') {
            const col = ('' + (o.color || o.colour || '')).trim();
            if (!col) { say('What colour? Give one, as a name or as #rrggbb.'); return { ok: false, why: 'no colour' }; }
            for (const h of hits) {
                h.l.color = col;
                // Some painters read a per-interval colour and never look at the layer's,
                // so the intervals are painted too or the change is half applied.
                try { for (const iv of (h.l.intervals || [])) { if (iv) iv.c = col; } } catch (e) { }
            }
            wake();
            say(summary('Coloured') + ' ' + col);
            return { ok: true, matched: hits.length, names: names, color: col };
        }

        if (act === 'rename') {
            const nn = ('' + (o.name || '')).trim();
            if (!nn) { say('What should it be called?'); return { ok: false, why: 'no name' }; }
            if (hits.length > 1) {
                // Renaming several layers to one name makes a list nobody can read, and
                // every later match by name ambiguous.
                say(o.match + ' matches ' + hits.length + ' layers (' + names.slice(0, 6).join(', ')
                    + '). Renaming them all to one name would leave a list that cannot be told '
                    + 'apart; name one of them exactly.');
                return { ok: false, why: 'ambiguous', matched: hits.length, names: names };
            }
            const was = nameOf(hits[0].l);
            hits[0].l.name = nn;
            wake();
            say('Renamed ' + was + ' to ' + nn + ' on ' + trackName(hits[0].t) + '.');
            return { ok: true, matched: 1, names: [nn], was: was };
        }

        if (act === 'front' || act === 'back' || act === 'forward' || act === 'backward') {
            // track_layers is drawn in array order, so the LAST is in front. The rows
            // under the track name list the front one first.
            for (const h of hits) {
                const a = (h.t.track_layers = h.t.track_layers || []);
                const i = a.indexOf(h.l);
                if (i < 0) continue;
                let j = i;
                if (act === 'front') j = a.length - 1;
                else if (act === 'back') j = 0;
                else if (act === 'forward') j = Math.min(a.length - 1, i + 1);
                else j = Math.max(0, i - 1);
                if (j === i) continue;
                a.splice(i, 1);
                a.splice(j, 0, h.l);
            }
            wake();
            say(summary(act === 'front' ? 'Moved to the front,'
                : (act === 'back' ? 'Moved to the back,' : ('Moved ' + act + ','))));
            return { ok: true, matched: hits.length, names: names };
        }

        if (act === 'remove' || act === 'delete') {
            for (const h of hits) {
                const a = (h.t.track_layers = h.t.track_layers || []);
                const i = a.indexOf(h.l);
                if (i >= 0) a.splice(i, 1);
            }
            wake();
            say(summary('Removed') + ' Removing is not hiding: these are off the track and '
                + 'would have to be computed again.');
            return { ok: true, matched: hits.length, names: names };
        }

        say('There is no layer action called ' + act + '. There is list, hide, show, '
            + 'hide_all, show_all, color, rename, front, back, forward, backward and remove.');
        return { ok: false, why: 'no such action' };
    })();
}
