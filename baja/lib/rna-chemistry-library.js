function (graph, genegraph_panel_layout) {

    // "The Chemistry of RNA Therapeutics" — the PDF bookshelf of reference reading.
    //   exec('baja/lib/rna-chemistry-library.js', graph, genegraph_panel_layout)
    //
    // Extracted from manchester/editor.js, where the same block was written out TWICE (once
    // under File and once under Design) and the two copies had already drifted: one mounted
    // into the mainPanel and restored the editor on close, the other called clear() and
    // showWidget() with no way back to the canvas at all. One implementation now, and it is
    // the one that returns you to the editor.
    //
    // The shelf itself is the `pdf-bookshelf` widget — it lists the library folder and renders
    // the covers, which lionscript cannot do — so it is still mounted as a component. What is
    // matched to the other libraries is the CHROME: the same navy header bar, the same title
    // treatment and the same Close that hands the canvas back.

    return (async () => {
        const TITLE = 'The Chemistry of RNA Therapeutics';
        let path_j = '.';
        const commands = await exec('manchester/controls/cmds');

        const userfiles = {
            wid: 'pdf-bookshelf',
            title: TITLE,
            width: '100%',
            height: '100%',
            data: {
                width: '100%',
                drive: 'wd',
                user: getUser(),
                root: 'library',
                columns: 3,
                showSearch: true,
                "ionfunction.cmd": createIonFunction((element) => { commands.go(path_j, element.cmd); }),
                "ionfunction.fileClick": createIonFunction(async (element) => {
                    path_j = element.path;
                    const host_ = window['env']['apiUrl'];
                    const user = getUser();
                    const key = 'library';
                    const pdfUrl = `${host_}/load-pdf?path=${encodeURIComponent(element.path)}&key=${encodeURIComponent(key)}&user=${encodeURIComponent(user)}`;
                    window.open(pdfUrl, "_blank", "noopener,noreferrer");
                }),
                "ionfunction.openfile": createIonFunction(async (file, text) => { }),
                "ionfunction.path": createIonFunction(async (path) => { path_j = path; })
            }
        };

        const tu = { wid: 'card', height: '100%', width: '100%', data: { cards: [[{ 'component': userfiles, 'width': '100%' }]] } };
        try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
        try { CurrentLayout.setComponent('mainPanel', tu); } catch (e) { }

        // Header bar in the same navy language as baja/lib/shelf.js, with a Close that puts
        // the editor canvas back. The old version offered only a small ✕ puck with no title.
        try {
            const old = document.getElementById('baja-rna-chem-bar');
            if (old && old.parentNode) old.parentNode.removeChild(old);

            const bar = document.createElement('div');
            bar.id = 'baja-rna-chem-bar';
            bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;'
                + 'display:flex;align-items:center;gap:16px;padding:14px 22px;background:#0b2545;'
                + 'color:#e8f0fb;border-bottom:1px solid rgba(255,255,255,0.12);'
                + 'box-shadow:0 6px 20px rgba(0,0,0,0.35);font-family:Arial,Helvetica,sans-serif;';
            bar.innerHTML = ''
                + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;">'
                + '<div style="font:700 19px Arial;">' + TITLE + '</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;">Reference reading — click a title to open it</div>'
                + '</div>'
                + '<button id="baja-rna-chem-x" style="cursor:pointer;margin-left:auto;flex:0 0 auto;'
                + 'border-radius:8px;padding:9px 16px;font:700 13px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">✕ Close</button>';
            document.body.appendChild(bar);

            let onKey = null;
            const close = () => {
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (bar.parentNode) bar.parentNode.removeChild(bar); } catch (e) { }
                try { CurrentLayout.reset('mainPanel'); } catch (e) { }
                try {
                    CurrentLayout.clearComponent('mainPanel');
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                } catch (e) { }
            };
            onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
            document.addEventListener('keydown', onKey, true);   // Escape closes, as on the other shelves
            bar.querySelector('#baja-rna-chem-x').onclick = close;
        } catch (e) { }

        return graph;
    })();
}
