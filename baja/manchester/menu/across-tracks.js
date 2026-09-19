function (graph, genegraph_panel_layout) {

    // ACROSS THE TRACKS — the tools that only mean something with two or more tracks loaded.
    //   exec('baja/manchester/menu/across-tracks.js', graph, genegraph_panel_layout)
    //
    // One track is a sequence with things on it. Two tracks are a COMPARISON, and the question
    // stops being "what is here" and becomes "what is the same, and what is not": a germline
    // track beside its tumour, sample A beside sample B. These draw that comparison onto the
    // board rather than describing it in a panel.
    //
    // The same variant on two tracks is matched on where it sits and what it changes -- the
    // track coordinate rounded to the base, with the reference and alternate alleles -- because
    // two tracks of one transcript share their coordinate system. A variant that only one track
    // carries is the interesting one, and it is counted and can be marked.

    return (async () => {
        const Line = await exec('flexigraph/shapes/line.js');
        const LINE_TAG = 'across-tracks';          // every line this draws is named with it
        const SHARED_COLOR = '#22c55e';
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const tracksOf = () => ((graph && graph.track) || []).filter((t) => t && (t.tgraph || t.grid));
        const boxOf = (t) => (t && (t.tgraph || t.grid)) || null;
        const label = (t, i) => ('' + (t.description || t.name || ('track ' + (i + 1)))).trim();
        const variantsOf = (t) => ((t && t.snpindels) || []).filter((s) => s && s.xi != null && isFinite(s.xi));
        // What makes two marks the same change: the base it sits on and the substitution.
        const keyOf = (s) => Math.round(+s.xi) + ':' + ('' + (s.reference0 || s.reference || '')).toUpperCase()
            + '>' + ('' + (s.alternate0 || s.alternate || '')).toUpperCase();
        const nameOf = (s) => ('' + (s.name || '')).trim() || (('' + (s.reference0 || '?')) + '>' + ('' + (s.alternate0 || '?')));

        // Every variant, by key, with the tracks carrying it.
        const index = () => {
            const ts = tracksOf(), by = new Map();
            ts.forEach((t, i) => {
                for (const s of variantsOf(t)) {
                    const k = keyOf(s);
                    let e = by.get(k);
                    if (!e) { e = { key: k, name: nameOf(s), on: [] }; by.set(k, e); }
                    if (!e.on.some((o) => o.i === i)) e.on.push({ i: i, track: t, snp: s });
                }
            });
            return { tracks: ts, by: by };
        };

        const clearLines = () => {
            let n = 0;
            try {
                const keep = (graph.shapes || []).filter((s) => {
                    const hit = s && ('' + (s.name || '')).indexOf(LINE_TAG) === 0;
                    if (hit) n++;
                    return !hit;
                });
                graph.shapes = keep;
            } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            return n;
        };

        // A line per pair of neighbouring tracks that both carry the variant: the eye follows a
        // ladder down the stack, and a variant missing from the middle track leaves a visible gap.
        const drawShared = (onlyHighlighted) => {
            const { tracks, by } = index();
            if (tracks.length < 2) return { drawn: 0, shared: 0 };
            clearLines();
            let drawn = 0, shared = 0;
            for (const e of by.values()) {
                if (e.on.length < 2) continue;
                if (onlyHighlighted && !e.on.some((o) => o.snp && o.snp.highlight)) continue;
                shared++;
                const on = e.on.slice().sort((a, b) => a.i - b.i);
                for (let k = 0; k + 1 < on.length; k++) {
                    const a = on[k], b = on[k + 1];
                    const ba = boxOf(a.track), bb = boxOf(b.track);
                    if (!ba || !bb) continue;
                    const x0 = +a.snp.xi, x1 = +b.snp.xi;
                    // The stack is drawn downwards, so the upper track's box sits at the higher
                    // y: join the bottom of one to the top of the next.
                    const ya = ba.yi, yb = bb.yi;
                    if (!isFinite(x0) || !isFinite(x1) || !isFinite(ya) || !isFinite(yb)) continue;
                    const line = new Line(LINE_TAG + ':' + e.key, x0, ya);
                    line.xf = x1;
                    line.yf = yb;
                    line.w = x1 - x0;
                    line.h = yb - ya;
                    line.setColor(SHARED_COLOR);
                    line.linewidth = 1.5;
                    line.arrowDirect = 'none';
                    line.comment = e.name + ' — on ' + on.length + ' tracks';
                    try { graph.shapes.push(line); drawn++; } catch (e2) { }
                }
            }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            return { drawn: drawn, shared: shared };
        };

        // Mark what only one track has: those are the differences a design is aimed at.
        const markPrivate = (on) => {
            const { tracks, by } = index();
            let n = 0;
            for (const e of by.values()) {
                if (e.on.length !== 1) continue;
                const s = e.on[0].snp;
                try { s.highlight = !!on; n++; } catch (e2) { }
            }
            try { if (graph.wake) graph.wake(); } catch (e2) { }
            return { n: n, tracks: tracks.length };
        };

        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };

        const ts = tracksOf();
        if (ts.length < 2) {
            say('Two tracks or more are needed: these tools compare one track against another.');
            return false;
        }

        const { by } = index();
        const shared = Array.from(by.values()).filter((e) => e.on.length > 1);
        const priv = Array.from(by.values()).filter((e) => e.on.length === 1);
        const drawnNow = (graph.shapes || []).filter((s) => s && ('' + (s.name || '')).indexOf(LINE_TAG) === 0).length;

        const books = [];
        books.push({ section: 'Across the tracks', note: true,
            title: ts.length + ' tracks: ' + ts.map(label).join(', ') + '. '
                + shared.length.toLocaleString() + ' change' + (shared.length === 1 ? '' : 's') + ' on more than one of them, '
                + priv.length.toLocaleString() + ' on one alone.' });
        books.push({ section: 'Across the tracks', accent: 'run', icon: 'timeline', ready: shared.length > 0,
            readyNote: 'nothing is shared between these tracks',
            title: 'Draw a line between the mutations that are the same',
            badge: shared.length ? shared.length + ' shared' : 'none',
            blurb: 'A line joins each change to the same change on the next track that carries it. A gap in the ladder is a track that does not have it.',
            open: () => { const r = drawShared(false); say(r.drawn ? ('Drew ' + r.drawn + ' line' + (r.drawn === 1 ? '' : 's') + ' over ' + r.shared + ' shared change' + (r.shared === 1 ? '' : 's') + '.') : 'Nothing is shared between these tracks.'); } });
        books.push({ section: 'Across the tracks', icon: 'star', ready: shared.some((e) => e.on.some((o) => o.snp && o.snp.highlight)),
            readyNote: 'no shared change is highlighted',
            title: 'Only the highlighted ones',
            blurb: 'The same lines, but only for changes you have highlighted.',
            open: () => { const r = drawShared(true); say(r.drawn ? ('Drew ' + r.drawn + ' line' + (r.drawn === 1 ? '' : 's') + '.') : 'No highlighted change is shared.'); } });
        books.push({ section: 'Across the tracks', icon: 'clear', ready: drawnNow > 0, readyNote: 'no lines are drawn',
            title: 'Take the lines off', badge: drawnNow ? String(drawnNow) : '',
            blurb: 'Removes every line this drew. Your own annotations are left alone.',
            open: () => { const n = clearLines(); say(n ? ('Removed ' + n + ' line' + (n === 1 ? '' : 's') + '.') : 'There were none.'); } });
        books.push({ section: 'What differs', icon: 'gps_fixed', ready: priv.length > 0, readyNote: 'every change is on every track',
            title: 'Highlight the changes only one track has', badge: priv.length ? priv.length + ' private' : 'none',
            blurb: 'The differences between these tracks — for an allele-selective design, these are the targets.',
            open: () => { const r = markPrivate(true); say('Highlighted ' + r.n + ' change' + (r.n === 1 ? '' : 's') + ' carried by one track alone.'); } });
        books.push({ section: 'What differs', icon: 'clear', ready: priv.length > 0,
            title: 'Take those highlights off',
            blurb: 'Clears the highlight this put on.',
            open: () => { const r = markPrivate(false); say('Cleared ' + r.n + ' highlight' + (r.n === 1 ? '' : 's') + '.'); } });

        // What is on which track, read as a list: the same numbers the lines draw.
        books.push({ section: 'The list', icon: 'list', ready: true, title: 'What each change sits on',
            badge: by.size + ' in all',
            blurb: 'Every change on these tracks and which of them carry it.',
            books: () => Array.from(by.values())
                .sort((a, b) => b.on.length - a.on.length || a.key.localeCompare(b.key))
                .slice(0, 300)
                .map((e) => ({
                    section: e.on.length > 1 ? 'On more than one track' : 'On one track alone',
                    title: e.name,
                    badge: e.on.length > 1 ? e.on.length + ' tracks' : label(e.on[0].track, e.on[0].i),
                    blurb: 'On: ' + e.on.map((o) => label(o.track, o.i)).join(', ') + '.',
                    ready: true,
                    open: () => { try { for (const o of e.on) o.snp.highlight = true; if (graph.wake) graph.wake(); } catch (e2) { } say('Highlighted ' + e.name + '.'); },
                })),
        });

        return exec('baja/lib/shelf.js', {
            id: 'baja-across-tracks', title: 'Across the tracks',
            subtitle: ts.length + ' tracks on the board — what they share, and what they do not',
            graph: graph, books: books,
        });
    })();
}
