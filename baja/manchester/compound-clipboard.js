function (graph, genegraph_panel_layout) {
    // CTRL+C / CTRL+V FOR THE SELECTED COMPOUNDS.
    //   exec('baja/manchester/compound-clipboard.js', graph, genegraph_panel_layout)
    //
    // Copy puts every selected compound on the system clipboard as JSON; paste puts them
    // back, onto the selected track when there is one. Distinct from
    // baja/manchester/graph-clipboard.js, which copies the WHOLE GRAPH: that text starts
    // with '{"graph"' and the editor's own paste listener claims it. This one is tagged
    // '{"bajaCompounds"' so the two can live on the same clipboard without either one
    // trying to read the other's text.
    //
    // WHY A WINDOW LISTENER IN THE CAPTURE PHASE. Same reason as layer-row-press.js and
    // chem-part-press.js: the graph's own key handling does not run while a menu or the
    // selection window is up, which is exactly when compounds are selected and a user
    // reaches for Ctrl+C.
    //
    // WHAT IT MUST NOT DO is steal Ctrl+C from ordinary text. A copy is left alone when
    // the focus is in an input, a textarea or anything contenteditable, and when the user
    // has a real text selection on the page -- copying the words you highlighted must keep
    // working while a compound happens to be selected on the canvas.
    //
    // FOR DEBUGGING: window.__bajaCompoundClipInfo().
    return (async () => {
        const BUFFER_KEY = 'baja.compoundCopyBuffer';
        const TAG = 'bajaCompounds';

        const S = window.__bajaCompoundClip = window.__bajaCompoundClip || { installed: false, last: null, copies: 0, pastes: 0 };
        S.graph = graph; S.layout = genegraph_panel_layout;
        if (S.installed) return true;

        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };
        const fail = (m) => { try { graph.setError(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };
        const repaint = () => { try { if (graph.wake) graph.wake(); } catch (e) { } };

        // Typing beats the canvas, always.
        const inTextField = () => {
            try {
                const a = document.activeElement;
                if (!a) return false;
                const tag = (a.tagName || '').toUpperCase();
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
                if (a.isContentEditable) return true;
            } catch (e) { }
            return false;
        };
        const hasTextSelection = () => {
            try { const s = window.getSelection(); return !!(s && !s.isCollapsed && ('' + s).trim().length); } catch (e) { return false; }
        };

        // Every selected compound, however it came to be selected. `o.selected` is the
        // source of truth the selection window itself reconciles against, so it is the one
        // to read -- the lasso list is a view of it and can lag a click.
        const selectedCompounds = (g) => {
            const out = [];
            try {
                for (const t of ((g && g.track) || [])) {
                    for (const o of ((t && t.oligos) || [])) if (o && o.selected) out.push({ oligo: o, track: t });
                }
            } catch (e) { }
            if (!out.length) {
                try {
                    for (const s of ((g && g.__lassoSelection) || [])) {
                        if (s && s.ref && (s.kind === 'oligo' || s.kind === 'amplicon')) out.push({ oligo: s.ref, track: s.track });
                    }
                } catch (e) { }
            }
            return out;
        };

        // Strip the things that must not travel: the canvas-frame caches the renderer
        // rebuilds every frame, and the per-session selection state. Everything else --
        // sequence, structure, chemistry, scores, coordinates -- is plain data and is
        // exactly what a paste needs.
        const TRANSIENT = /^(__|_)/;
        const cleanse = (o) => {
            const out = {};
            for (const k of Object.keys(o || {})) {
                if (TRANSIENT.test(k)) continue;
                if (k === 'selected' || k === 'highlight__' || k === 'shapeFunction' || k === 'detailedShapeFunction') continue;
                const v = o[k];
                if (typeof v === 'function') continue;
                out[k] = v;
            }
            return out;
        };

        const doCopy = async (g) => {
            const sel = selectedCompounds(g);
            if (!sel.length) { say('Nothing to copy — no compound is selected.'); return false; }
            const payload = {};
            payload[TAG] = sel.map((s) => ({
                track: (s.track && (s.track.name || s.track.id)) || null,
                oligo: cleanse(s.oligo),
            }));
            payload.count = sel.length;
            payload.copiedAt = new Date().toISOString();
            const text = JSON.stringify(payload);
            let onClipboard = false;
            try { await navigator.clipboard.writeText(text); onClipboard = true; } catch (e) { onClipboard = false; }
            try { localStorage.setItem(BUFFER_KEY, text); } catch (e) { }
            S.copies++;
            S.last = { action: 'copy', n: sel.length, onClipboard: onClipboard, at: Date.now() };
            say('Copied ' + sel.length + ' compound' + (sel.length === 1 ? '' : 's')
                + (onClipboard ? ' to the clipboard' : " to this browser's copy buffer only")
                + '. Ctrl+V to paste.');
            return true;
        };

        const looksLikeCompounds = (s) => typeof s === 'string' && s.indexOf('"' + TAG + '"') > 0;

        const doPaste = async (g) => {
            let text = null, from = '';
            try { const t = await navigator.clipboard.readText(); if (looksLikeCompounds(t)) { text = t; from = 'clipboard'; } } catch (e) { }
            if (!text) { try { const t = localStorage.getItem(BUFFER_KEY); if (looksLikeCompounds(t)) { text = t; from = 'copy buffer'; } } catch (e) { } }
            if (!text) { say('Nothing to paste: no copied compounds on the clipboard or in the copy buffer.'); return false; }

            let payload = null;
            try { payload = JSON.parse(text); } catch (e) { fail('The copied compounds could not be read.'); return false; }
            const list = payload && payload[TAG];
            if (!Array.isArray(list) || !list.length) { say('Nothing to paste.'); return false; }

            const Oligo = await exec('flexigraph/oligo.js');
            // Onto the selected track when there is one, so copying a compound from one
            // track to another is a click and two keystrokes. Otherwise back onto the track
            // it came from, matched by name; failing that, the first track there is.
            const tracks = (g && g.track) || [];
            if (!tracks.length) { fail('No track to paste onto.'); return false; }
            const byName = {};
            for (const t of tracks) { const n = t && (t.name || t.id); if (n != null) byName['' + n] = t; }
            const target = g.selectedTrack || null;

            let n = 0;
            const landed = [];
            for (const entry of list) {
                const src = entry && entry.oligo;
                if (!src) continue;
                const t = target || byName['' + entry.track] || tracks[0];
                if (!t || !t.addOligo) continue;
                let o = null;
                try { o = (Oligo && Oligo.copy) ? Oligo.copy(src) : Object.assign({}, src); } catch (e) { o = Object.assign({}, src); }
                if (!o) continue;
                // A pasted compound is a NEW compound. Carrying the original's id would let
                // a later save treat the two as one record, and an unchanged name gives two
                // indistinguishable rows in every list that shows them.
                try {
                    delete o.id;
                    const base = '' + (src.name || src.id || 'compound');
                    o.name = /\(copy( \d+)?\)$/.test(base) ? base : base + ' (copy)';
                    o.selected = false;
                    o.highlight__ = false;
                } catch (e) { }
                try { t.addOligo(o); n++; landed.push(t.name || t.id || 'track'); } catch (e) { }
            }
            S.pastes++;
            S.last = { action: 'paste', n: n, from: from, at: Date.now() };
            repaint();
            if (!n) { fail('Could not paste those compounds onto any track.'); return false; }
            const where = target ? ('onto ' + (target.name || 'the selected track'))
                : ('onto ' + (landed.length === 1 ? landed[0] : landed.length + ' tracks'));
            say('Pasted ' + n + ' compound' + (n === 1 ? '' : 's') + ' ' + where + ' (from the ' + from + ').');
            return true;
        };

        const onKey = async (e) => {
            try {
                if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
                const k = ('' + (e.key || '')).toLowerCase();
                if (k !== 'c' && k !== 'v') return;
                if (inTextField()) return;                       // typing wins
                const g = S.graph;
                if (!g) return;
                if (k === 'c') {
                    if (hasTextSelection()) return;              // copying highlighted words wins
                    if (!selectedCompounds(g).length) return;    // nothing of ours: let the page have it
                    e.preventDefault(); e.stopImmediatePropagation();
                    await doCopy(g);
                    return;
                }
                // Paste: only claim the keystroke when our own text is what is waiting,
                // otherwise the editor's image/graph paste handlers must still see it.
                let ours = false;
                try { ours = looksLikeCompounds(await navigator.clipboard.readText()); } catch (err) { ours = false; }
                if (!ours) { try { ours = looksLikeCompounds(localStorage.getItem(BUFFER_KEY)); } catch (err) { ours = false; } }
                if (!ours) return;
                e.preventDefault(); e.stopImmediatePropagation();
                await doPaste(g);
            } catch (err) { console.warn('[compound clipboard]', err); }
        };

        window.addEventListener('keydown', onKey, true);
        S.installed = true;
        try { console.info('[compound clipboard] installed — Ctrl+C / Ctrl+V for selected compounds'); } catch (e) { }

        // Exposed so a menu item can do the same thing without the keyboard.
        S.copy = () => doCopy(S.graph);
        S.paste = () => doPaste(S.graph);

        window.__bajaCompoundClipInfo = () => {
            const g = S.graph;
            let buffered = null;
            try { const t = localStorage.getItem(BUFFER_KEY); buffered = t ? (JSON.parse(t).count || 0) : 0; } catch (e) { }
            return {
                installed: S.installed,
                selected: selectedCompounds(g).map((s) => '' + (s.oligo.name || s.oligo.id || 'compound')),
                selectedTrack: (g && g.selectedTrack && (g.selectedTrack.name || g.selectedTrack.id)) || null,
                inCopyBuffer: buffered, copies: S.copies, pastes: S.pastes, last: S.last,
            };
        };
        return true;
    })();
}
