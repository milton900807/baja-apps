function (graph, genegraph_panel_layout, opts) {

    // "load dnm1" -- IS THAT A GENE OR A FILE?
    //   exec('baja/manchester/menu/load-by-name.js', graph, layout, { name: 'dnm1' });
    //
    // A bare name is genuinely ambiguous and the editor can do both, so this asks, with the
    // two things it can actually do as the two things to click. Guessing silently would be
    // wrong about half the time and the wrong half costs a wiped canvas.
    //
    // The shape of the name orders the options and nothing more: something ending in an
    // extension or carrying a slash is put forward as a file, a bare word as a gene. Both
    // are always offered, because the ordering is a hint and not a finding -- a gene called
    // C9orf72.1 is not a file, and a design saved as DNM1 is not a gene.
    //
    // opts: { name, kind } -- kind 'gene' or 'file' skips the question.
    return (async () => {
        const o = opts || {};
        const name = ('' + (o.name || '')).trim();
        const say = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        if (!name) { say('Nothing to load: no name was given.'); return 0; }

        const server = (function () { try { return window['env']['apiUrl']; } catch (e) { return ''; } })();

        const asGene = async () => {
            // prompt-load-transcript takes a preset query and already does the rest: it
            // resolves the symbol, lists the transcripts and lets the user pick one. The
            // clickable options for the gene case are its own, not a second set here.
            try { await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout, name); }
            catch (e) { say('Could not look up ' + name + ': ' + (e && e.message ? e.message : e)); }
        };
        const asFile = async () => {
            // There is no open-by-name on the drive, so this opens the browser rather than
            // pretending to search. Saying which name was being looked for is the useful
            // part, since the browser cannot be told.
            say('Looking for a file called “' + name + '” — pick it from your files.');
            try { await exec('manchester/fb.js'); }
            catch (e) { say('Could not open your files: ' + (e && e.message ? e.message : e)); }
        };

        const kind = ('' + (o.kind || '')).toLowerCase();
        if (kind === 'gene') { await asGene(); return 1; }
        if (kind === 'file') { await asFile(); return 1; }

        const looksLikeFile = /\.[A-Za-z0-9]{1,8}$/.test(name) || name.indexOf('/') >= 0;
        const geneRow = {
            label: 'Load ' + name.toUpperCase() + ' as a gene',
            move: () => { },
            click: async () => { try { graph.showSideMenu(null); } catch (e) { } await asGene(); }
        };
        const fileRow = {
            label: 'Find a file called “' + name + '”',
            move: () => { },
            click: async () => { try { graph.showSideMenu(null); } catch (e) { } await asFile(); }
        };
        const items = [
            { label: '“' + name + '” could be either', header: true }
        ].concat(looksLikeFile ? [fileRow, geneRow] : [geneRow, fileRow])
            .concat([{ label: '‹ Cancel', move: () => { }, click: () => { try { graph.showSideMenu(null); } catch (e) { } } }]);

        try { graph.openMenuAtPointer(items, 'Load'); }
        catch (e) { try { graph.showSideMenu(items, null, 'Load'); } catch (e2) { } }
        return 1;
    })();
}
