function (graph, genegraph_panel_layout, onlyTrack) {

    // VARIANT DESIGNER -- every variant on the canvas, ranked by how far the sequence around it
    // has diverged from the reference, with the compounds already tiled over each one and a GO
    // that takes the view to it.
    //   exec('baja/manchester/menu/variant-designer.js', graph, layout)          all tracks
    //   exec('baja/manchester/menu/variant-designer.js', graph, layout, track)   one track
    //
    // DIVERGENCE IN A WINDOW. For a variant at p and a window of W nt centred on it, divergence is
    // the share of those W bases that differ from the reference once every variant overlapping
    // the window is applied:
    //   a SNP or MNV  counts the bases it changes (ref and alt compared position by position)
    //   an indel      counts the length it adds or removes (at least 1)
    // Each distinct change (position, ref, alt) counts ONCE: the same variant carried by ten
    // samples is one difference from the reference, not ten. "Same phase only" counts just the
    // variants on the ranked variant's own phase -- one haplotype, as the track draws them --
    // instead of every variant in the window regardless of which chromosome copy it is on.
    //
    // COMPOUNDS TILED ON IT: the compounds on the same track whose span [xi, xf) overlaps the
    // variant's own span, which is the set whose sequence the variant changes.
    //
    // Settings (window, phase mode, track, sort) live on graph.__variantDesigner so GO -> look ->
    // "Back to Variant designer" reopens it exactly as it was left.

    return (async () => {
        const ID = 'baja-variant-designer';
        const BACK_ID = 'baja-variant-designer-back';
        try { const o = document.getElementById(ID); if (o) o.remove(); } catch (e) { }
        try { const b = document.getElementById(BACK_ID); if (b) b.remove(); } catch (e) { }

        const H = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const fmt = (n) => (+n || 0).toLocaleString();
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };

        const allTracks = () => ((graph && graph.track) || []).filter((t) => t && Array.isArray(t.snpindels) && t.snpindels.length);
        if (!allTracks().length) { say('No variants on the canvas: load some first, then open the Variant designer.'); return 0; }

        const S = graph.__variantDesigner || (graph.__variantDesigner = { W: 50, samePhase: false, track: null, sort: 'divergence', scroll: 0 });
        if (onlyTrack) S.track = onlyTrack;
        if (S.track && allTracks().indexOf(S.track) < 0) S.track = null;

        // ------------------------------------------------------------ the arithmetic ---------
        const up = (x) => ('' + (x == null ? '' : x)).toUpperCase();
        const phaseOf = (v) => (v && v.phase != null && v.phase !== '' && Number.isFinite(+v.phase)) ? +v.phase : null;
        // Bases this change makes different from the reference.
        const diffBases = (ref, alt) => {
            if (ref.length === alt.length) {
                let d = 0;
                for (let i = 0; i < ref.length; i++) if (ref[i] !== alt[i]) d++;
                return Math.max(1, d);
            }
            return Math.max(1, Math.abs(ref.length - alt.length));
        };
        const spanOf = (v) => Math.max(1, up(v.reference).length || 1);

        // Per track: its distinct changes sorted by position, for windowed sums.
        const changesOf = (t) => {
            const by = new Map();
            for (const v of t.snpindels) {
                if (!v || !Number.isFinite(+v.xi)) continue;
                const ref = up(v.reference), alt = up(v.alternate);
                const k = Math.round(+v.xi) + '|' + ref + '|' + alt + '|' + (phaseOf(v) == null ? '' : phaseOf(v));
                if (!by.has(k)) by.set(k, { xi: Math.round(+v.xi), span: spanOf(v), d: diffBases(ref, alt), phase: phaseOf(v) });
            }
            return Array.from(by.values()).sort((a, b) => a.xi - b.xi);
        };
        // Index of the first change at or after x.
        const lowerBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].xi < x) lo = m + 1; else hi = m; } return lo; };

        const compoundsOn = (t, lo, hi) => {
            let n = 0;
            for (const o of (t.oligos || [])) {
                if (!o) continue;
                const a = Math.min(+o.xi, +o.xf), b = Math.max(+o.xi, +o.xf);
                if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
                if (a < hi && Math.max(b, a + 1) > lo) n++;
            }
            return n;
        };

        const label = (v) => v.name || v.id || (up(v.reference) + '>' + up(v.alternate));
        const rank = () => {
            const W = Math.max(1, Math.round(+S.W || 50));
            const rows = [];
            for (const t of (S.track ? [S.track] : allTracks())) {
                const ch = changesOf(t);
                // The longest change bounds how far left of the window an overlapping one can start.
                const maxSpan = ch.reduce((m, c) => Math.max(m, c.span), 1);
                // One row per distinct change, carrying its first variant object for GO / select.
                const seen = new Map();
                for (const v of t.snpindels) {
                    if (!v || !Number.isFinite(+v.xi)) continue;
                    const p = Math.round(+v.xi);
                    const ref = up(v.reference), alt = up(v.alternate), ph = phaseOf(v);
                    const key = p + '|' + ref + '|' + alt + '|' + (ph == null ? '' : ph);
                    if (seen.has(key)) { seen.get(key).copies++; continue; }
                    const lo = p - Math.floor(W / 2), hi = lo + W;
                    let diff = 0, nIn = 0;
                    for (let i = lowerBound(ch, lo - maxSpan); i < ch.length && ch[i].xi < hi; i++) {
                        const c = ch[i];
                        if (c.xi + c.span <= lo) continue;
                        if (S.samePhase && ph != null && c.phase !== ph) continue;
                        diff += c.d; nIn++;
                    }
                    const row = {
                        v: v, t: t, pos: p, ref: ref, alt: alt, phase: ph, copies: 1,
                        name: label(v), type: '' + (v.type || ''), clinsig: ('' + (v.clinsig || '')).replace(/_/g, ' '),
                        diff: diff, nIn: nIn, pct: Math.min(100, diff / W * 100),
                        compounds: compoundsOn(t, p, p + spanOf(v))
                    };
                    seen.set(key, row);
                    rows.push(row);
                }
            }
            const by = {
                divergence: (a, b) => (b.pct - a.pct) || (b.compounds - a.compounds) || (a.pos - b.pos),
                compounds: (a, b) => (b.compounds - a.compounds) || (b.pct - a.pct) || (a.pos - b.pos),
                position: (a, b) => ((a.t.name || '') < (b.t.name || '') ? -1 : (a.t.name || '') > (b.t.name || '') ? 1 : 0) || (a.pos - b.pos)
            }[S.sort] || ((a, b) => b.pct - a.pct);
            rows.sort(by);
            return { rows: rows, W: W };
        };

        // ------------------------------------------------------------ GO --------------------
        // Letter resolution, as go_to_position frames it: the track draws its bases above ~30
        // screen px per base, so the window is sized from the canvas width at 44 px per base.
        const zoomTo = async (r) => {
            const t = r.t, g = t && t.tgraph;
            try { for (const x of allTracks()) for (const v of x.snpindels) { try { if (v.deselect) v.deselect(); } catch (e) { } } } catch (e) { }
            try { if (r.v.select) r.v.select(); } catch (e) { }
            try { graph.selectedTrack = t; } catch (e) { }
            if (!g || typeof g.X !== 'function' || !graph.zoomRect) return;
            const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
            for (let i = 0; graph.animating && i < 60; i++) await sleep(60);
            let cw = 1200, ch = 800;
            try { cw = (graph.canvas && graph.canvas.width) || cw; ch = (graph.canvas && graph.canvas.height) || ch; } catch (e) { }
            const half = Math.max(Math.max(6, Math.floor(cw / 44)), spanOf(r.v) * 1.15) / 2;
            const mid = r.pos + spanOf(r.v) / 2;
            let ymin, ymax;
            try {
                const top = g.Y(typeof g.getymax === 'function' ? g.getymax() : (g.yi + (g.height || 0)));
                const bot = g.Y(typeof g.getymin === 'function' ? g.getymin() : g.yi);
                if (isFinite(top) && isFinite(bot) && Math.abs(top - bot) > 0) {
                    const cy = (top + bot) / 2, ySpan = Math.max(1.0001, Math.abs(top - bot) * (ch / 100));
                    ymin = cy - ySpan / 2; ymax = cy + ySpan / 2;
                }
            } catch (e) { }
            if (ymin == null) { const yb = g.yi + (g.height || 0); ymin = yb - 0.51; ymax = yb + 0.51; }
            try { await graph.zoomRect(g.X(mid - half), g.X(mid + half), ymin, ymax, 400); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
        };

        // A way back: GO closes the designer to show the canvas, so leave a pill that reopens it
        // exactly as it was.
        const backPill = () => {
            const b = document.createElement('button');
            b.id = BACK_ID;
            b.textContent = '‹ Variant designer';
            b.style.cssText = 'position:fixed;top:14px;right:16px;z-index:2147482990;cursor:pointer;border-radius:999px;'
                + 'padding:8px 14px;font:700 12.5px Arial;border:1px solid #12c2e0;background:#0b2545;color:#e8f0fb;'
                + 'box-shadow:0 8px 22px rgba(0,0,0,0.35);';
            b.onclick = () => { b.remove(); exec('baja/manchester/menu/variant-designer.js', graph, genegraph_panel_layout); };
            document.body.appendChild(b);
        };

        // ------------------------------------------------------------ the panel -------------
        const panel = document.createElement('div');
        panel.id = ID;
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#e8f0fb;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
        const ctl = 'background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:7px 10px;font:13px Arial;';
        const seg = (on) => 'cursor:pointer;border-radius:8px;padding:7px 12px;font:700 12px Arial;border:1px solid '
            + (on ? '#12c2e0;background:#12c2e0;color:#04202a;' : 'rgba(255,255,255,0.16);background:#0a1e3a;color:#c9d7e6;');
        const trackOpts = ['<option value="">All tracks (' + allTracks().length + ')</option>']
            .concat(allTracks().map((t, i) => '<option value="' + i + '"' + (S.track === t ? ' selected' : '') + '>'
                + H(t.name || ('track ' + (i + 1))) + ' (' + fmt(t.snpindels.length) + ')</option>')).join('');
        panel.innerHTML =
            '<div style="display:flex;align-items:center;gap:16px;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.08);background:#0b2545;">'
            + '<div style="min-width:0;"><div style="font:700 18px Arial;">Variant designer</div>'
            + '<div id="vd-sub" style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;"></div></div>'
            + '<button id="vd-close" style="margin-left:auto;cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
            + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#e8f0fb;">Close</button></div>'
            + '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:14px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">'
            + '<label style="font:600 12px Arial;color:#9fb3c8;">Window <input id="vd-w" type="number" min="1" max="100000" step="1" value="' + H(S.W)
            + '" style="' + ctl + 'width:84px;margin-left:6px;"> nt</label>'
            + '<span id="vd-presets" style="display:flex;gap:6px;">' + [20, 50, 100, 200, 500].map((w) =>
                '<button data-w="' + w + '" style="' + seg(+S.W === w) + '">' + w + '</button>').join('') + '</span>'
            + '<label style="font:600 12px Arial;color:#9fb3c8;display:flex;align-items:center;gap:6px;cursor:pointer;">'
            + '<input id="vd-phase" type="checkbox"' + (S.samePhase ? ' checked' : '') + ' style="accent-color:#12c2e0;width:15px;height:15px;"> Same phase only</label>'
            + '<label style="font:600 12px Arial;color:#9fb3c8;">Track <select id="vd-track" style="' + ctl + 'margin-left:6px;max-width:260px;">' + trackOpts + '</select></label>'
            + '<label style="font:600 12px Arial;color:#9fb3c8;">Rank by <select id="vd-sort" style="' + ctl + 'margin-left:6px;">'
            + [['divergence', 'Divergence'], ['compounds', 'Compounds tiled'], ['position', 'Position']].map(([k, l]) =>
                '<option value="' + k + '"' + (S.sort === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>'
            + '</div>'
            + '<div style="padding:10px 24px 0;font:12px Arial;color:#6b8299;line-height:1.5;">Divergence: the share of the window’s bases '
            + 'that differ from the reference, counting every distinct variant that overlaps it (a SNP its changed bases, an indel '
            + 'the length it adds or removes). Compounds tiled: compounds on the track whose span covers the variant.</div>'
            + '<div id="vd-list" style="flex:1 1 auto;overflow:auto;padding:10px 24px 24px;"></div>';
        document.body.appendChild(panel);
        const q = (s) => panel.querySelector(s);

        const close = () => { try { S.scroll = q('#vd-list').scrollTop; } catch (e) { } try { panel.remove(); } catch (e) { } try { document.removeEventListener('keydown', onKey, true); } catch (e) { } };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        q('#vd-close').onclick = close;

        const MAX_ROWS = 600;
        const col = 'display:grid;grid-template-columns:44px minmax(160px,1.6fr) minmax(110px,1fr) 92px minmax(170px,1.3fr) 92px 98px 74px;'
            + 'align-items:center;gap:12px;';
        const draw = () => {
            const { rows, W } = rank();
            const shown = rows.slice(0, MAX_ROWS);
            const withC = rows.filter((r) => r.compounds > 0).length;
            q('#vd-sub').textContent = fmt(rows.length) + ' distinct variants on ' + (S.track ? (S.track.name || 'the track') : (allTracks().length + ' track' + (allTracks().length === 1 ? '' : 's')))
                + ' · window ' + fmt(W) + ' nt' + (S.samePhase ? ' · same phase only' : '')
                + ' · ' + fmt(withC) + ' with compounds tiled on them';
            const head = '<div style="' + col + 'padding:8px 10px;font:700 11px Arial;color:#6b8299;text-transform:uppercase;letter-spacing:0.04em;'
                + 'position:sticky;top:0;background:#071a30;z-index:1;">'
                + '<div>#</div><div>Variant</div><div>Track</div><div>Position</div><div>Divergence</div><div>In window</div><div>Compounds</div><div></div></div>';
            const body = shown.map((r, i) => {
                const hot = r.pct >= 10 ? '#f97316' : (r.pct >= 4 ? '#fbbf24' : '#12c2e0');
                return '<div style="' + col + 'padding:10px;border-top:1px solid rgba(255,255,255,0.06);border-radius:8px;" '
                    + 'onmouseover="this.style.background=\'#0b2545\'" onmouseout="this.style.background=\'transparent\'">'
                    + '<div style="font:700 13px Arial;color:#6b8299;">' + (i + 1) + '</div>'
                    + '<div style="min-width:0;"><div style="font:700 13px Arial;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + H(r.name) + '</div>'
                    + '<div style="font:11.5px Arial;color:#9fb3c8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
                    + H([(r.ref || '-') + '>' + (r.alt || '-'), r.type, r.phase != null ? ('phase ' + r.phase) : '', r.clinsig, r.copies > 1 ? ('×' + r.copies) : ''].filter(Boolean).join(' · ')) + '</div></div>'
                    + '<div style="font:12.5px Arial;color:#c9d7e6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + H(r.t.name || 'track') + '</div>'
                    + '<div style="font:12.5px Arial;color:#c9d7e6;">' + fmt(r.pos) + '</div>'
                    + '<div><div style="display:flex;align-items:center;gap:8px;"><div style="flex:1 1 auto;height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;">'
                    + '<div style="height:100%;width:' + Math.max(2, r.pct).toFixed(1) + '%;background:' + hot + ';"></div></div>'
                    + '<div style="font:700 12.5px Arial;min-width:46px;text-align:right;">' + (r.pct >= 10 ? r.pct.toFixed(0) : r.pct.toFixed(1)) + '%</div></div>'
                    + '<div style="font:11px Arial;color:#6b8299;margin-top:3px;">' + fmt(r.diff) + ' of ' + fmt(W) + ' nt differ</div></div>'
                    + '<div style="font:12.5px Arial;color:#c9d7e6;">' + fmt(r.nIn) + ' variant' + (r.nIn === 1 ? '' : 's') + '</div>'
                    + '<div><span style="display:inline-block;min-width:26px;text-align:center;padding:3px 9px;border-radius:999px;font:700 12px Arial;'
                    + (r.compounds ? 'background:rgba(34,197,94,0.16);color:#86efac;border:1px solid rgba(34,197,94,0.45);' : 'background:transparent;color:#6b8299;border:1px solid rgba(255,255,255,0.12);')
                    + '">' + fmt(r.compounds) + '</span></div>'
                    + '<div><button data-go="' + i + '" style="cursor:pointer;border-radius:8px;padding:7px 14px;font:700 12px Arial;'
                    + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">GO</button></div></div>';
            }).join('');
            q('#vd-list').innerHTML = head + body + (rows.length > MAX_ROWS
                ? ('<div style="padding:12px 10px;font:12px Arial;color:#9fb3c8;">Showing the top ' + MAX_ROWS + ' of ' + fmt(rows.length)
                    + '. Pick one track to narrow it.</div>') : '');
            q('#vd-list').querySelectorAll('button[data-go]').forEach((b) => {
                b.onclick = async () => {
                    const r = shown[+b.getAttribute('data-go')];
                    close();
                    backPill();
                    await zoomTo(r);
                    say('Variant designer · ' + r.name + ' on ' + (r.t.name || 'the track') + ': ' + (r.pct >= 10 ? r.pct.toFixed(0) : r.pct.toFixed(1))
                        + '% divergent over ' + fmt(W) + ' nt, ' + r.compounds + ' compound' + (r.compounds === 1 ? '' : 's') + ' tiled on it.');
                };
            });
        };

        const setW = (w) => {
            const n = Math.round(+w);
            if (!Number.isFinite(n) || n < 1) return;
            S.W = Math.min(100000, n);
            q('#vd-w').value = S.W;
            q('#vd-presets').querySelectorAll('button').forEach((b) => { b.style.cssText = seg(+b.getAttribute('data-w') === S.W); });
            draw();
        };
        q('#vd-w').onchange = () => setW(q('#vd-w').value);
        q('#vd-w').onkeydown = (e) => { if (e.key === 'Enter') setW(q('#vd-w').value); };
        q('#vd-presets').querySelectorAll('button').forEach((b) => { b.onclick = () => setW(b.getAttribute('data-w')); });
        q('#vd-phase').onchange = () => { S.samePhase = !!q('#vd-phase').checked; draw(); };
        q('#vd-track').onchange = () => { const v = q('#vd-track').value; S.track = v === '' ? null : allTracks()[+v]; draw(); };
        q('#vd-sort').onchange = () => { S.sort = q('#vd-sort').value; draw(); };

        draw();
        try { q('#vd-list').scrollTop = S.scroll || 0; } catch (e) { }
        return 1;
    })();
}
