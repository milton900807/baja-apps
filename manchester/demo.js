function (script, config) {

    // demo.js — a scripted, "driverless" version of manchester/editor.js.
    //
    // It builds the same gene-graph canvas the editor uses, then DRIVES the application from a
    // script instead of the user's mouse. Launch it like the editor, passing a script:
    //
    //   exec('manchester/demo.js', <script>, { stepDelayMs: 900 })
    //
    // <script> may be:
    //   • an ARRAY of command objects            [{cmd:'load', value:'ENST00000357033'}, …]
    //   • a JSON string of that array
    //   • a newline "cmd arg1 arg2" text block   (one command per line; # starts a comment)
    //   • a URL / path to a .json/.demo file      (fetched with GETXT)
    //
    // Command vocabulary (object form | line form):
    //   load  <id>                    graph.add(id)  — Ensembl/RefSeq id, gene symbol or free text
    //   sequence <ACGT…> [name]       add a raw sequence as a track      {cmd:'sequence',sequence,name}
    //   zoom  [track] [from] [to]     zoom to a track (default: last), or a region
    //   variants <sig> [track]        load ClinVar variants by significance via points-of-interest
    //                                 sig = pathogenic | likely_pathogenic | benign | likely_benign |
    //                                       uncertain | all
    //   tour  [track] [dwellMs]       focus + zoom each mutation on a track in turn
    //   message <text…>               show a status message
    //   wait  <ms>                    pause
    //   fit                           rescale / fit the view
    //   exec  <module> [args…]        run any lionscript module: exec(module, graph, layout, …args)
    //   js    <code>                  run arbitrary code with (graph, exec, layout, Track, sleep, say)
    //
    // Nothing here gates on a subscription — it's an automation/demo harness.

    return (async () => {

        // ---- 1) Build the editor-like environment (mirrors editor.js's core setup) -----------
        const progressBar = () => { };                       // gene.js progress callback (no-op)
        const graph = await exec('flexigraph/gene.js', progressBar);
        const { Track } = await exec('baja/bio/track.js');

        const geneGraph = await graph.createComponent();
        geneGraph.height = '100%';

        const genegraph_panel_layout = {
            wid: 'card',
            componentRef: 'geneGraphPanel',
            data: { cards: [[{ 'width': '100%', 'height': '100%', 'component': geneGraph }]] }
        };
        graph.genegraph_panel_layout = genegraph_panel_layout;

        const main_layout = {
            wid: 'card', height: '100%', componentRef: 'mainPanel',
            data: { cards: [[{ 'width': '100%', 'height': '100%', 'component': genegraph_panel_layout }]] }
        };
        try { clear(); } catch (e) { }
        showWidget(main_layout);
        try { CurrentLayout.stash('mainPanel', main_layout); } catch (e) { }

        // Default interactive mode (so hover/selection still works between scripted steps).
        try { graph.setMouseMode('navigate'); } catch (e) { }
        try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }

        // ---- 2) Helpers ---------------------------------------------------------------------
        const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, +ms || 0)));
        const say = (m) => { try { graph.setMessage('' + m); } catch (e) { } try { log('' + m); } catch (e) { } };
        const lastTrack = () => (graph.track && graph.track.length ? graph.track.length - 1 : 0);
        const trackAt = (i) => (graph.track && graph.track[i]) ? graph.track[i] : null;

        // ---- 3) Normalize the script into an array of command objects -----------------------
        const parseLine = (line) => {
            const parts = ('' + line).trim().split(/\s+/);
            const cmd = (parts.shift() || '').toLowerCase();
            return { cmd, args: parts, raw: ('' + line).trim() };
        };
        async function normalizeScript(s) {
            if (s == null) return [];
            if (Array.isArray(s)) return s;
            if (typeof s === 'object' && Array.isArray(s.script)) return s.script;
            let text = ('' + s).trim();
            // URL / path → fetch its text.
            if (/^https?:\/\//i.test(text) || /\.(json|demo|txt)$/i.test(text)) {
                try { if (typeof GETXT === 'function') text = await GETXT(text); } catch (e) { }
            }
            // JSON array/object?
            try { const j = JSON.parse(text); return Array.isArray(j) ? j : (Array.isArray(j.script) ? j.script : []); } catch (e) { }
            // Line format.
            return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map(parseLine);
        }

        // ---- 4) Command interpreter ---------------------------------------------------------
        async function runCommand(c) {
            if (typeof c === 'string') c = parseLine(c);
            const cmd = ('' + (c.cmd || '')).toLowerCase();
            const a = c.args || [];
            switch (cmd) {
                case 'load': case 'add': case 'transcript': case 'gene': {
                    const id = ('' + (c.value != null ? c.value : (c.id != null ? c.id : a.join(' ')))).trim();
                    if (!id) break;
                    say('Loading ' + id + ' …');
                    await graph.add(id, 10, 10);
                    break;
                }
                case 'sequence': case 'seq': {
                    const seq = ('' + (c.sequence || c.value || a.join(''))).toUpperCase().replace(/[^ACGTUN]/g, '');
                    if (!seq) break;
                    const name = c.name || 'sequence';
                    const t = new Track(name, 0, seq.length, 1, 1); t.sequence = seq; graph.addTrack(t);
                    say('Added sequence "' + name + '" (' + seq.length + ' nt)');
                    break;
                }
                case 'zoom': {
                    const ti = (c.track != null ? +c.track : (a[0] != null && a[0] !== '' ? +a[0] : lastTrack()));
                    const from = (c.from != null ? +c.from : (a[1] != null ? +a[1] : null));
                    const to = (c.to != null ? +c.to : (a[2] != null ? +a[2] : null));
                    if (from != null && to != null) graph.zoomToTrack(ti, from, to);
                    else {
                        const t = trackAt(ti); const len = (t && t.sequence ? t.sequence.length : 1000);
                        graph.zoomToTrack(ti, -len * 0.2, len * 1.2);
                    }
                    break;
                }
                case 'variants': case 'clinvar': {
                    const sig = ('' + (c.significance || c.sig || a[0] || 'pathogenic')).toLowerCase();
                    const ti = (c.track != null ? +c.track : (a[1] != null ? +a[1] : lastTrack()));
                    const t = trackAt(ti); if (!t) { say('variants: no track'); break; }
                    say('Loading ' + sig + ' ClinVar variants …');
                    await exec('baja/manchester/menu/points-of-interest.js', graph, genegraph_panel_layout, t, sig);
                    break;
                }
                case 'tour': {
                    const ti = (c.track != null ? +c.track : (a[0] != null && a[0] !== '' ? +a[0] : lastTrack()));
                    const dwell = +(c.dwell || a[1] || 3000);
                    const t = trackAt(ti); if (!t) break;
                    const snps = (t.snpindels || []).slice().sort((x, y) => (x.xi || 0) - (y.xi || 0));
                    say('Touring ' + snps.length + ' mutation(s)…');
                    for (const s of snps) {
                        try { await exec('baja/manchester/menu/focus-mutation.js', graph, s, dwell); } catch (e) { }
                        try { const w = 30; graph.zoomToTrack(ti, s.xi - w, s.xi + w); } catch (e) { }
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                        await sleep(dwell);
                    }
                    break;
                }
                case 'exec': {
                    const mod = c.module || a[0]; if (!mod) break;
                    const extra = c.execArgs || (c.module ? (c.args || []) : a.slice(1));
                    await exec(mod, graph, genegraph_panel_layout, ...(extra || []));
                    break;
                }
                case 'message': case 'msg': case 'say': { say(c.text || c.value || a.join(' ')); break; }
                case 'wait': case 'sleep': { await sleep(c.ms != null ? c.ms : (a[0] || 1000)); break; }
                case 'fit': {
                    try { if (graph.fitYAxis) graph.fitYAxis(); } catch (e) { }
                    try { if (graph.rescale) graph.rescale(); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    break;
                }
                case 'js': case 'eval': {
                    const code = c.code || c.value || c.raw || '';
                    const fn = new Function('graph', 'exec', 'layout', 'Track', 'sleep', 'say',
                        'return (async () => { ' + code + ' })();');
                    await fn(graph, exec, genegraph_panel_layout, Track, sleep, say);
                    break;
                }
                default: say('demo: unknown command "' + cmd + '"');
            }
        }

        // ---- 5) Run the script --------------------------------------------------------------
        const cmds = await normalizeScript(script);
        const gap = (config && config.stepDelayMs != null) ? +config.stepDelayMs : 900;
        graph.__demoScript = cmds;   // exposed for inspection / re-run

        if (!cmds.length) {
            say('demo: no script given. Pass an array of commands, JSON, "cmd arg" lines, or a URL.');
            return graph;
        }

        say('Demo: running ' + cmds.length + ' step(s)…');
        for (let i = 0; i < cmds.length; i++) {
            try { await runCommand(cmds[i]); }
            catch (e) { say('Step ' + (i + 1) + ' failed: ' + (e && e.message ? e.message : e)); }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            await sleep(gap);
        }
        say('Demo complete — ' + cmds.length + ' step(s).');
        return graph;
    })();
}
