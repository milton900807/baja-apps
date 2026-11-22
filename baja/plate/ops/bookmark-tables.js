function (pm, o) {

    // A BOOKMARK THAT FRAMES A TABLE, BY NAME.
    //   exec('baja/plate/ops/bookmark-tables.js', pm, { tables: 'assumptions' })
    //   exec('baja/plate/ops/bookmark-tables.js', pm, { tables: 'assumptions, flight_cost', name: 'costs' })
    //
    // "bookmark assumptions", typed into the command field, was two words, so it was taken
    // for a formula, and the formula engine threw "Invalid formula: bookmark assumptions.
    // Expected TableName[groups]" into the console where nobody was looking. The canvas has
    // had bookmarks all along (track.bookmarkObjects frames a set of objects and lists the
    // view under Bookmarks in the navigation bar); what it did not have was a way to ask for
    // one in words.
    //
    // A NAME THAT IS NEARLY RIGHT IS USED, AND SAID. "assumptionss" was typed straight after
    // "assumptions" and means the same table. One letter out, with only one table it could
    // be, is taken as that table and the message says which. Anything further off is not
    // guessed at: the reply lists the tables there are.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || !Array.isArray(pt.root)) { resolve({ error: 'there is no project open' }); return; }
            if (typeof pt.bookmarkObjects !== 'function') { resolve({ error: 'bookmarks are not available here' }); return; }
            const all = pt.root.filter((p) => p && p.name);

            const distance = (a, b) => {
                const m = a.length, n = b.length;
                if (Math.abs(m - n) > 2) return 9;
                let prev = []; for (let j = 0; j <= n; j++) prev.push(j);
                for (let i = 1; i <= m; i++) {
                    const cur = [i];
                    for (let j = 1; j <= n; j++) {
                        cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)));
                    }
                    prev = cur;
                }
                return prev[n];
            };
            const norm = (x) => ('' + x).trim().toLowerCase().replace(/[\s_-]+/g, '_');

            const asked = ('' + ((o && (o.tables || o.table)) || '')).split(/\s*,\s*|\s+and\s+/i)
                .map((x) => x.trim().replace(/^the\s+/i, '').replace(/\s+tables?$/i, '').replace(/^["'\u201c]+|["'\u201d]+$/g, ''))
                .filter(Boolean);

            let picked = [], corrected = [];
            if (!asked.length) {
                const sel = pt.selectedPlate || null;
                if (!sel || !sel.name) { resolve({ error: 'say which table to bookmark, or select it first' }); return; }
                picked = [sel];
            } else {
                for (const want of asked) {
                    const w = norm(want);
                    let hit = all.filter((p) => norm(p.name) === w);
                    if (!hit.length) {
                        const near = all.map((p) => ({ p: p, d: distance(norm(p.name), w) })).filter((x) => x.d <= (w.length > 5 ? 2 : 1))
                            .sort((a, b) => a.d - b.d);
                        if (near.length && (near.length === 1 || near[0].d < near[1].d)) {
                            hit = [near[0].p];
                            corrected.push('\u201c' + want + '\u201d read as ' + near[0].p.name);
                        }
                    }
                    if (!hit.length) {
                        resolve({ error: 'there is no table called \u201c' + want + '\u201d. The tables here are: '
                            + (all.map((p) => p.name).slice(0, 20).join(', ') || '(none)') });
                        return;
                    }
                    if (picked.indexOf(hit[0]) < 0) picked.push(hit[0]);
                }
            }

            const name = ('' + ((o && o.name) || '')).trim() || picked.map((p) => p.name).join(' + ');
            const replaced = !!(pt.bookmarks && pt.bookmarks[name]);
            const made = pt.bookmarkObjects(name, picked);
            if (!made) { resolve({ error: 'that could not be framed: ' + picked.map((p) => p.name).join(', ') + ' has no size on the canvas yet' }); return; }
            try { if (pt.wake) pt.wake(); } catch (e) { }
            try {
                pt.setMessage('Bookmarked ' + picked.map((p) => p.name).join(' and ') + (name !== picked.map((p) => p.name).join(' + ') ? (' as \u201c' + name + '\u201d') : '')
                    + (replaced ? ', replacing the bookmark of that name' : '')
                    + (corrected.length ? (' (' + corrected.join('; ') + ')') : '')
                    + '. It is under Bookmarks in the navigation bar', 8);
            } catch (e) { }
            resolve({ bookmark: name, tables: picked.map((p) => p.name), replaced: replaced || undefined,
                corrected: corrected.length ? corrected : undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
