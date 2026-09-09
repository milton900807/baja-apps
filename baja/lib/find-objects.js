function (graph, genegraph_panel_layout) {

    // FIND — keyword search across everything currently on the canvas, with a click to
    // zoom to whatever you pick.
    //
    //   await exec('baja/lib/find-objects.js', graph, genegraph_panel_layout)
    //
    // Navigate could already take you to a TRACK. It could not take you to the thing you
    // actually had in mind -- an exon, a designed oligo, a variant, a layer -- because
    // nothing enumerated them. This walks the tracks once, flattens what they hold into
    // one list, and filters that list as you type.
    //
    // Deliberately the same navy as baja/lib/shelf.js (#071a30 ground, #0b2545 cards,
    // #12c2e0 focus) rather than a dialog of its own: Find opens FROM the Navigate shelf,
    // and a differently-styled window would read as a different application.
    //
    // What it searches, per track: the track itself (name, gene id, description, type),
    // its annotations (exons, UTRs, features), its oligos (ASOs, primers, amplicons) and
    // its variants. Each result carries the range it occupies, so zooming is the same
    // operation for all of them.

    return (async () => {
        const esc = (s) => ('' + (s == null ? '' : s))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const id = 'baja-find-objects';

        const tracks = ((graph && graph.track) || []).filter((t) => t && t.tgraph);
        if (!tracks.length) {
            try { graph.setMessage(' Load a track first — Find searches what is on the canvas. '); } catch (e) { }
            return 0;
        }

        // ---- 1) Flatten the canvas into one searchable list --------------------------
        // xi/xf are TRACK-LOCAL sequence indices; the track is carried alongside so the
        // zoom can map them through that track's own axis.
        const items = [];
        const push = (o) => { if (o && o.label) items.push(o); };

        for (const t of tracks) {
            const tname = t.name || 'track';
            const annot = t.description || t.geneID
                || (Array.isArray(t.annotations) && t.annotations[0] && t.annotations[0].name)
                || t.track_type || '';

            push({
                kind: 'Track', track: t, whole: true,
                label: tname,
                detail: annot,
                hay: [tname, t.geneID, t.description, t.track_type].filter(Boolean).join(' '),
            });

            for (const a of (t.annotations || [])) {
                if (!a) continue;
                push({
                    kind: (a.type ? ('' + a.type) : 'Feature'), track: t,
                    xi: a.xi, xf: (a.xf != null ? a.xf : a.xi),
                    label: a.name || ('' + (a.type || 'feature')),
                    detail: tname + (a.description ? ' · ' + a.description : ''),
                    hay: [a.name, a.type, a.description, tname].filter(Boolean).join(' '),
                });
            }

            for (const o of (t.oligos || [])) {
                if (!o) continue;
                push({
                    kind: (o.type ? ('' + o.type).toUpperCase() : 'Oligo'), track: t,
                    xi: o.xi, xf: (o.xf != null ? o.xf : o.xi),
                    label: o.name || o.id || 'oligo',
                    detail: tname + (o.synthesisSequence ? ' · ' + o.synthesisSequence : ''),
                    hay: [o.name, o.id, o.type, o.synthesisSequence, tname].filter(Boolean).join(' '),
                });
            }

            for (const v of (t.snpindels || [])) {
                if (!v) continue;
                push({
                    kind: 'Variant', track: t,
                    xi: v.xi, xf: (v.xf != null ? v.xf : v.xi),
                    label: v.name || 'variant',
                    detail: tname + (v.annotation ? ' · ' + v.annotation : ''),
                    hay: [v.name, v.annotation, v.clinsig, tname].filter(Boolean).join(' '),
                });
            }

            for (const L of (t.layers || [])) {
                if (!L) continue;
                push({
                    kind: 'Layer', track: t, whole: true,
                    label: L.name || L.data_type || 'layer',
                    detail: tname + (L.data_type ? ' · ' + L.data_type : ''),
                    hay: [L.name, L.data_type, tname].filter(Boolean).join(' '),
                });
            }
        }
        for (const it of items) it.hay = ('' + it.hay).toLowerCase();

        // ---- 2) Zoom to a result -----------------------------------------------------
        // A whole track has its own helper. Anything narrower is a range on that track's
        // axis, framed the way points-of-interest.js frames a locus so the track is not
        // left as a hairline at the bottom of the view.
        const goTo = async (it) => {
            try {
                if (it.whole || it.xi == null) {
                    if (graph.zoomToTrack) await graph.zoomToTrack(it.track);
                    return true;
                }
                const g = graph.graph, tg = it.track && it.track.tgraph;
                if (!g || !tg || !tg.X) {
                    if (graph.zoomToTrack) await graph.zoomToTrack(it.track);
                    return true;
                }
                if (g.rescale) g.rescale();
                const a = Math.min(it.xi, it.xf), b = Math.max(it.xi, it.xf);
                const pad = Math.max(20, Math.round((b - a) * 0.35));
                const gi = tg.X(a - pad), gf = tg.X(b + pad);
                const cy = tg.yi + ((tg.height || 0) / 2);
                const span = Math.abs(tg.height || 0) || 0.1;
                if (graph.zoomRect) await graph.zoomRect(gi, gf, cy + span * 3.6, cy - span * 2.2, 500);
                else { g.setxmin(gi); g.setxmax(gf); g.setymin(cy + span * 3.6); g.setymax(cy - span * 2.2); }
                if (graph.wake) graph.wake();
                return true;
            } catch (e) { return false; }
        };

        // ---- 3) The window -----------------------------------------------------------
        try { const old = document.getElementById(id); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

        const header = document.createElement('div');
        header.style.cssText = 'flex:0 0 auto;padding:16px 22px;background:#0b2545;'
            + 'border-bottom:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;gap:16px;'
            + 'box-shadow:0 6px 20px rgba(0,0,0,0.35);';
        header.innerHTML = ''
            + '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">'
            + '<div style="font:700 19px Arial;">Find</div>'
            + '<div id="find-sub" style="font:12.5px Arial;color:#9fb3c8;">'
            + esc(items.length + ' object' + (items.length === 1 ? '' : 's') + ' on '
                + tracks.length + ' track' + (tracks.length === 1 ? '' : 's'))
            + '</div></div>'
            + '<input id="find-q" placeholder="Search tracks, features, oligos, variants…" '
            + 'style="flex:1;max-width:420px;margin-left:auto;background:#0a1e3a;color:#e8f0fb;'
            + 'border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:9px 16px;font:13px Arial;"/>'
            + '<button id="find-x" style="cursor:pointer;flex:0 0 auto;border-radius:8px;padding:9px 16px;'
            + 'font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">✕ Close</button>';

        const list = document.createElement('div');
        list.style.cssText = 'flex:1 1 auto;overflow:auto;padding:22px;display:grid;'
            + 'grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;align-content:start;';

        overlay.appendChild(header); overlay.appendChild(list);
        document.body.appendChild(overlay);

        let onKey = null;
        const close = () => {
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
            try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        const MAX = 300;   // a keyword that matches everything must not paint 50k cards
        const render = (q) => {
            const needle = ('' + (q || '')).trim().toLowerCase();
            const terms = needle ? needle.split(/\s+/) : [];
            const hits = terms.length
                ? items.filter((it) => terms.every((w) => it.hay.indexOf(w) >= 0))
                : items;
            const shown = hits.slice(0, MAX);

            list.innerHTML = '';
            const sub = header.querySelector('#find-sub');
            if (sub) {
                sub.textContent = terms.length
                    ? (hits.length + ' match' + (hits.length === 1 ? '' : 'es')
                        + (hits.length > MAX ? ' — showing the first ' + MAX : ''))
                    : (items.length + ' object' + (items.length === 1 ? '' : 's') + ' on '
                        + tracks.length + ' track' + (tracks.length === 1 ? '' : 's'));
            }

            if (!shown.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'grid-column:1/-1;color:#9fb3c8;font:13px Arial;padding:8px 2px;';
                empty.textContent = 'Nothing on the canvas matches “' + needle + '”.';
                list.appendChild(empty);
                return;
            }

            for (const it of shown) {
                const card = document.createElement('button');
                card.style.cssText = 'text-align:left;background:#0b2545;color:#fff;'
                    + 'border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:14px 16px;'
                    + 'box-shadow:0 6px 18px rgba(0,0,0,0.28);cursor:pointer;display:flex;'
                    + 'flex-direction:column;gap:6px;font-family:inherit;';
                card.onmouseenter = () => { card.style.borderColor = '#12c2e0'; };
                card.onmouseleave = () => { card.style.borderColor = 'rgba(255,255,255,0.12)'; };
                card.innerHTML = ''
                    + '<div style="display:flex;align-items:center;gap:8px;">'
                    + '<span style="font:700 10.5px Arial;letter-spacing:.06em;text-transform:uppercase;'
                    + 'padding:3px 9px;border-radius:999px;background:rgba(18,194,224,0.14);color:#8fe6f6;">'
                    + esc(it.kind) + '</span>'
                    + '<span style="font:700 14px Arial;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
                    + esc(it.label) + '</span></div>'
                    + (it.detail ? '<div style="font:12px Arial;color:#9fb3c8;overflow:hidden;'
                        + 'text-overflow:ellipsis;white-space:nowrap;">' + esc(it.detail) + '</div>' : '')
                    + (it.xi != null ? '<div style="font:11.5px Arial;color:#7f96ad;">'
                        + esc(Math.min(it.xi, it.xf) + ' – ' + Math.max(it.xi, it.xf)) + '</div>' : '');
                // Zooming ends the search: the point of the click was to look at the thing.
                card.onclick = async () => {
                    close();
                    const ok = await goTo(it);
                    try {
                        (graph.setResultMessage || graph.setMessage).call(graph,
                            ok ? (' ' + it.kind + ' · ' + it.label + ' ')
                               : (' Could not zoom to ' + it.label + '. '));
                    } catch (e) { }
                };
                list.appendChild(card);
            }
        };

        const q = header.querySelector('#find-q');
        header.querySelector('#find-x').onclick = close;
        onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
        document.addEventListener('keydown', onKey, true);
        if (q) {
            q.oninput = () => render(q.value);
            // Enter on a single match goes straight there, so an exact name is one gesture.
            q.onkeydown = (e) => {
                if (e.key !== 'Enter') return;
                const first = list.querySelector('button');
                if (first) first.click();
            };
            try { q.focus(); } catch (e) { }
        }
        render('');
        return items.length;
    })();
}
