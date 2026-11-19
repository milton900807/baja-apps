function (graph, genegraph_panel_layout) {

    // BOOKMARKS -- named places on the canvas, saved and returned to.
    //   const BM = await exec('baja/lib/bookmarks.js', graph, layout);
    //   BM.save('dua')   -> save the view as it is now, under that name
    //   BM.go(bm)        -> put the camera back where it was
    //   BM.list()        -> every bookmark, newest first
    //   BM.open()        -> the panel: all of them, each with GO and Delete
    //
    // WHAT A BOOKMARK HOLDS. The camera rectangle exactly as the grid reports it (the same
    // four numbers demo.js snapshots and restores), AND the track and track-local position at
    // the centre of that view. Both, because they fail in different places: world coordinates
    // are exact while the canvas is laid out as it was, but adding or removing a track moves
    // every track's world position, and a rectangle saved before that lands somewhere else.
    // So going back prefers the TRACK: centre on the saved position, keep the saved width, and
    // take the vertical band from the track as it sits now. Only when that track is no longer
    // open does it fall back to the raw rectangle, which is better than refusing.
    //
    // Stored in localStorage, per browser, the way manchester/demos-library.js stores demos.
    // Not on the graph: a bookmark that disappeared on reload would not be a bookmark.

    return (async () => {
        const LS_KEY = 'baja.bookmarks.v1';
        const PANEL_ID = 'baja-bookmarks';

        const H = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const fmt = (n) => (+n || 0).toLocaleString();
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const tracks = () => ((graph && graph.track) || []).filter(Boolean);
        const uid = () => 'bm-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);

        const load = () => {
            try { const s = localStorage.getItem(LS_KEY); if (s) { const a = JSON.parse(s); if (Array.isArray(a)) return a; } } catch (e) { }
            return [];
        };
        const store = (arr) => { try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); return true; } catch (e) { return false; } };
        const list = () => load().slice().sort((a, b) => (b.at || 0) - (a.at || 0));

        // ------------------------------------------------------------ the camera ------------
        // grid first (what demo.js reads), then the graph itself: open-screen-m.js calls these
        // straight on graph, so both shapes are in use.
        const camNow = () => {
            const src = [(graph && graph.graph && graph.graph.grid), graph];
            for (const g of src) {
                if (!g) continue;
                try {
                    const x0 = (typeof g.getxmin === 'function') ? g.getxmin() : g.xmin;
                    const x1 = (typeof g.getxmax === 'function') ? g.getxmax() : g.xmax;
                    const y0 = (typeof g.getymax === 'function') ? g.getymax() : g.ymax;   // top
                    const y1 = (typeof g.getymin === 'function') ? g.getymin() : g.ymin;   // bottom
                    if ([x0, x1, y0, y1].every((v) => typeof v === 'number' && isFinite(v)) && x1 !== x0) {
                        return { x0: x0, x1: x1, y0: y0, y1: y1 };
                    }
                } catch (e) { }
            }
            return null;
        };

        // The track this view is "on": the selected one when it is open, else the one whose
        // drawn band is nearest the middle of the view, else the only one there is.
        const trackAtCentre = (cam) => {
            const all = tracks();
            if (!all.length) return null;
            try { if (graph.selectedTrack && all.indexOf(graph.selectedTrack) >= 0) return graph.selectedTrack; } catch (e) { }
            if (all.length === 1) return all[0];
            if (!cam) return all[0];
            const mid = (cam.y0 + cam.y1) / 2;
            let best = all[0], bestD = Infinity;
            for (const t of all) {
                try {
                    const g = t.tgraph; if (!g || typeof g.Y !== 'function') continue;
                    const band = g.Y(g.yi + (g.height || 0) / 2);
                    const d = Math.abs(band - mid);
                    if (isFinite(d) && d < bestD) { bestD = d; best = t; }
                } catch (e) { }
            }
            return best;
        };

        // Where the track sits in world coordinates right now: the x of one track-local position,
        // and the middle of its drawn band. Recorded at save time and compared at go time, so a
        // canvas that has not been re-laid-out restores the EXACT rectangle rather than a
        // re-centred approximation of it.
        const bandCentre = (g) => {
            try {
                const top = g.Y(typeof g.getymax === 'function' ? g.getymax() : (g.yi + (g.height || 0)));
                const bot = g.Y(typeof g.getymin === 'function' ? g.getymin() : g.yi);
                if (isFinite(top) && isFinite(bot)) return (top + bot) / 2;
            } catch (e) { }
            return null;
        };
        const anchorOf = (t, pos) => {
            try {
                const g = t && t.tgraph;
                if (!g || typeof g.X !== 'function' || pos == null) return null;
                const wx = g.X(pos), wy = bandCentre(g);
                if (isFinite(wx)) return { wx: wx, wy: (wy == null ? null : wy) };
            } catch (e) { }
            return null;
        };

        const localAt = (t, worldX) => {
            try {
                const g = t && t.tgraph;
                if (g && typeof g.Xwc === 'function') { const p = g.Xwc(worldX); if (isFinite(p)) return Math.round(p); }
            } catch (e) { }
            return null;
        };

        const matchTrack = (name) => {
            const want = ('' + (name || '')).trim().toLowerCase();
            if (!want) return null;
            const all = tracks(), nm = (t) => ('' + (t.name || '')).toLowerCase();
            return all.find((t) => nm(t) === want) || all.find((t) => nm(t).indexOf(want) === 0) || null;
        };

        // ------------------------------------------------------------ save ------------------
        const save = (name) => {
            const nm = ('' + (name == null ? '' : name)).trim();
            if (!nm) return { error: 'A bookmark needs a name: try "bookmark this site dua".' };
            const cam = camNow();
            if (!cam) return { error: 'Could not read the current view, so there is nothing to bookmark yet.' };
            const t = trackAtCentre(cam);
            const pos = t ? localAt(t, (cam.x0 + cam.x1) / 2) : null;
            let gpos = null;
            try { if (t && pos != null && typeof t.genomicAt === 'function') { const g = t.genomicAt(pos); if (g != null && isFinite(g)) gpos = Math.round(g); } } catch (e) { }
            const bm = {
                id: uid(), name: nm, at: Date.now(), cam: cam,
                track: t ? (t.name || '') : '', pos: pos, gpos: gpos, anchor: anchorOf(t, pos),
                span: Math.round(Math.abs(cam.x1 - cam.x0) * 1000) / 1000,
                open: tracks().map((x) => x.name || '').filter(Boolean)
            };
            const all = load();
            // A name used again REPLACES the old one rather than leaving two identical rows:
            // "bookmark this site dua" twice means the second one.
            const i = all.findIndex((b) => b && ('' + b.name).toLowerCase() === nm.toLowerCase());
            let replaced = false;
            if (i >= 0) { bm.id = all[i].id; all[i] = bm; replaced = true; } else { all.push(bm); }
            if (!store(all)) return { error: 'Could not save the bookmark: this browser is not allowing local storage.' };
            return { bm: bm, replaced: replaced };
        };

        const find = (name) => {
            const want = ('' + (name || '')).trim().toLowerCase();
            if (!want) return [];
            const all = list();
            const exact = all.filter((b) => ('' + b.name).toLowerCase() === want);
            if (exact.length) return exact;
            const pre = all.filter((b) => ('' + b.name).toLowerCase().indexOf(want) === 0);
            if (pre.length) return pre;
            return all.filter((b) => ('' + b.name).toLowerCase().indexOf(want) >= 0);
        };

        const remove = (id) => {
            const all = load().filter((b) => b && b.id !== id);
            return store(all);
        };

        // ------------------------------------------------------------ go ---------------------
        const go = async (bm) => {
            if (!bm || !bm.cam) return false;
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            for (let i = 0; graph.animating && i < 60; i++) await sleep(60);
            let { x0, x1, y0, y1 } = bm.cam;
            const t = bm.track ? matchTrack(bm.track) : null;
            // The track is open: re-derive the rectangle from where it sits NOW, so a bookmark
            // still lands on its own position after tracks were added or removed.
            if (t && bm.pos != null) {
                try {
                    const g = t.tgraph;
                    // Unmoved: the saved rectangle still means what it meant, so restore it as it is.
                    const now = anchorOf(t, bm.pos);
                    const same = now && bm.anchor && Math.abs(now.wx - bm.anchor.wx) < 1e-6
                        && (now.wy == null || bm.anchor.wy == null || Math.abs(now.wy - bm.anchor.wy) < 1e-6);
                    if (g && typeof g.X === 'function' && !same) {
                        const c = g.X(bm.pos);
                        if (isFinite(c)) {
                            const half = Math.abs(x1 - x0) / 2;
                            x0 = c - half; x1 = c + half;
                            const cy = bandCentre(g);
                            if (cy != null) {
                                // Keep the saved vertical SPAN, centred on the track as it is now.
                                const span = Math.abs(bm.cam.y0 - bm.cam.y1);
                                if (span > 0) { y0 = cy + span / 2; y1 = cy - span / 2; }
                            }
                        }
                    }
                    try { graph.selectedTrack = t; } catch (e) { }
                } catch (e) { }
            }
            try { graph.animating = false; } catch (e) { }
            try { if (graph.zoomRect) await graph.zoomRect(x0, x1, y0, y1, 420); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            return true;
        };

        const where = (b) => {
            const bits = [];
            if (b.track) bits.push(b.track);
            if (b.pos != null) bits.push('position ' + fmt(b.pos));
            if (b.gpos != null) bits.push('g.' + fmt(b.gpos));
            return bits.join(' · ') || 'the canvas';
        };
        const when = (b) => { try { return new Date(b.at).toLocaleString(); } catch (e) { return ''; } };

        // ------------------------------------------------------------ the panel --------------
        const open = () => {
            try { const o = document.getElementById(PANEL_ID); if (o) o.remove(); } catch (e) { }
            const panel = document.createElement('div');
            panel.id = PANEL_ID;
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#e8f0fb;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            panel.innerHTML =
                '<div style="display:flex;align-items:center;gap:16px;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.08);background:#0b2545;">'
                + '<div><div style="font:700 18px Arial;">Bookmarks</div>'
                + '<div id="bm-sub" style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;"></div></div>'
                + '<button id="bm-close" style="margin-left:auto;cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#e8f0fb;">Close</button></div>'
                + '<div id="bm-list" style="flex:1 1 auto;overflow:auto;padding:14px 24px 24px;"></div>';
            document.body.appendChild(panel);
            const q = (s) => panel.querySelector(s);
            const close = () => { try { panel.remove(); } catch (e) { } try { document.removeEventListener('keydown', onKey, true); } catch (e) { } };
            const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
            document.addEventListener('keydown', onKey, true);
            q('#bm-close').onclick = close;

            const draw = () => {
                const all = list();
                q('#bm-sub').textContent = all.length
                    ? (all.length + ' bookmark' + (all.length === 1 ? '' : 's') + ' · saved in this browser')
                    : 'none yet';
                if (!all.length) {
                    q('#bm-list').innerHTML = '<div style="font:13px Arial;color:#9fb3c8;line-height:1.7;padding:10px 0;">'
                        + 'No bookmarks yet. Put the view where you want it, then type '
                        + '<b style="color:#e8f0fb;">bookmark this site &lt;name&gt;</b> in the Ask box — '
                        + 'for example <b style="color:#e8f0fb;">bookmark this site dua</b>.</div>';
                    return;
                }
                const gone = (b) => b.track && !matchTrack(b.track);
                q('#bm-list').innerHTML = all.map((b, i) =>
                    '<div style="display:flex;align-items:center;gap:14px;padding:12px 10px;border-top:1px solid rgba(255,255,255,0.06);">'
                    + '<div style="min-width:0;flex:1 1 auto;">'
                    + '<div style="font:700 14px Arial;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + H(b.name) + '</div>'
                    + '<div style="font:11.5px Arial;color:#9fb3c8;margin-top:3px;">' + H(where(b)) + ' · ' + H(when(b))
                    + (gone(b) ? ' <span style="color:#fbbf24;">· that track is not open now</span>' : '') + '</div></div>'
                    + '<button data-go="' + i + '" style="cursor:pointer;border-radius:8px;padding:7px 16px;font:700 12px Arial;'
                    + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;flex:0 0 auto;">GO</button>'
                    + '<button data-rm="' + i + '" style="cursor:pointer;border-radius:8px;padding:7px 12px;font:700 12px Arial;'
                    + 'border:1px solid rgba(255,255,255,0.18);background:transparent;color:#9fb3c8;flex:0 0 auto;">Delete</button></div>').join('');
                q('#bm-list').querySelectorAll('button[data-go]').forEach((btn) => {
                    btn.onclick = async () => {
                        const b = all[+btn.getAttribute('data-go')];
                        close();
                        await go(b);
                        say('Bookmark · ' + b.name + ' (' + where(b) + ').');
                    };
                });
                q('#bm-list').querySelectorAll('button[data-rm]').forEach((btn) => {
                    btn.onclick = () => { remove(all[+btn.getAttribute('data-rm')].id); draw(); };
                });
            };
            draw();
            return 1;
        };

        return { list: list, save: save, go: go, find: find, remove: remove, open: open, where: where, when: when };
    })();
}
