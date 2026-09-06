function (graph, genegraph_panel_layout, action) {
    // Copy the whole graph to the copy buffer, or paste one back in.
    //
    //   copy  : serialize the graph exactly as saveState() does (same replacer, so the text
    //           is a .baja in all but compression) and put it on the system clipboard, with a
    //           same-origin localStorage copy as a fallback for a browser that refuses
    //           clipboard access.
    //   paste : read that text back -- clipboard first, then the fallback -- and hand it to
    //           graph.setState(), which rebuilds every track through ___setTrack() and APPENDS
    //           it to the current graph with a unique name. So pasting into another editor
    //           merges the copied tracks with whatever is already there rather than
    //           replacing it.
    //
    // The editor's window 'paste' listener already recognises this text (it starts with
    // '{"graph"') and does the same setState, so Ctrl+V on the canvas of another editor works
    // too; the menu entry exists for the case where the keyboard route is not available and
    // for the localStorage fallback.
    const BUFFER_KEY = 'baja.graphCopyBuffer';
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };

    const serialize = () => {
        const seen = new WeakSet();
        return JSON.stringify(graph, function (key, value) {
            if (key === 'canvas') return;
            if (typeof value === 'object' && value !== null) {
                if (Array.isArray(value) && value.every((e) => e && typeof e === 'object' && 'x' in e && 'y' in e)) return value;
                else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) return value;
                else { if (seen.has(value)) return '[a_c]'; seen.add(value); }
            }
            return value;
        });
    };
    const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';

    return (async () => {
        if (action === 'copy') {
            const n = (graph.track || []).length;
            if (!n) { say('Nothing to copy — the graph has no tracks.'); return false; }
            let text;
            try { text = serialize(); } catch (e) { say('Could not serialize the graph: ' + (e && e.message ? e.message : e)); return false; }
            let stored = false, onClipboard = false;
            try { localStorage.setItem(BUFFER_KEY, text); stored = true; } catch (e) { }
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); onClipboard = true; }
            } catch (e) { }
            if (!onClipboard && !stored) { say('Copy failed: the browser refused both the clipboard and local storage.'); return false; }
            say('Copied ' + n + ' track' + (n === 1 ? '' : 's') + ' (' + fmtSize(text.length) + ')'
                + (onClipboard ? ' to the clipboard' : ' to this browser\'s copy buffer only')
                + '. Paste with Track ▸ Paste graph, or Ctrl+V on another editor\'s canvas.');
            return true;
        }

        if (action === 'paste') {
            const looksLikeGraph = (s) => typeof s === 'string' && s.trim().startsWith('{"graph"');
            let text = null, from = '';
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const t = await navigator.clipboard.readText();
                    if (looksLikeGraph(t)) { text = t; from = 'clipboard'; }
                }
            } catch (e) { }
            if (!text) {
                try { const t = localStorage.getItem(BUFFER_KEY); if (looksLikeGraph(t)) { text = t; from = 'copy buffer'; } } catch (e) { }
            }
            if (!text) { say('Nothing to paste: no copied graph on the clipboard or in the copy buffer.'); return false; }
            let js;
            try { js = JSON.parse(text); } catch (e) { say('The copied graph could not be read: ' + (e && e.message ? e.message : e)); return false; }
            const incoming = Array.isArray(js.track) ? js.track.length : 0;
            if (!incoming) { say('The copied graph has no tracks.'); return false; }
            try { graph.pushOntoHistory(); } catch (e) { }
            say('Pasting ' + incoming + ' track' + (incoming === 1 ? '' : 's') + ' from the ' + from + '…');
            try { await graph.setState(js); } catch (e) { say('Paste failed: ' + (e && e.message ? e.message : e)); return false; }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            const total = (graph.track || []).length;
            const msg = ' Pasted ' + incoming + ' track' + (incoming === 1 ? '' : 's') + ' — ' + total + ' on the canvas now. ';
            try { graph.setResultMessage(msg); } catch (e) { say(msg); }
            return true;
        }
        say('Unknown clipboard action: ' + action);
        return false;
    })();
}
