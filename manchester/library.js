
return new Promise(async (resolve, reject) => {

    let path_j = '.'
    let commands = await exec('manchester/controls/cmds')
    let userfiles = {
        wid: 'pdf-bookshelf',
        title: 'RNA Therapeutics Library',
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
                let host_ = window['env']['apiUrl']
                const user = getUser();
                const key = 'library';
                const pdfUrl = `${host_}/load-pdf?path=${encodeURIComponent(element.path)}&key=${encodeURIComponent(key)}&user=${encodeURIComponent(user)}`;
                window.open(pdfUrl, "_blank", "noopener,noreferrer");
            }),
            "ionfunction.openfile": createIonFunction(async (file, text) => { }),
            "ionfunction.path": createIonFunction(async (path) => { path_j = path; })
        }
    }
    const tu = { wid: 'card', height: '100%', width: '100%', data: { cards: [[{ 'component': userfiles, 'width': '100%' }]] } };
    clear();
    showWidget(tu);

    // Close (✕), top-right, matching every other full-screen application.
    //
    // It used to sit on the LEFT and call history.back(). Two changes, for two reasons.
    // The position now matches the design editors and the chromosome view, so the way out
    // is in the same place everywhere. And it goes to the home screen rather than back
    // through history: arriving here by URL, or from a screen that has since been cleared,
    // left history.back() with nowhere useful to go.
    //
    // NO CONFIRMATION, deliberately. This is a read-only shelf of reference documents.
    // Nothing here is unsaved, and a dialog warning that work will be lost would be
    // telling the reader something untrue.
    try {
        const prev = document.getElementById('baja-lib-close');
        if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
        const xb = document.createElement('div');
        xb.id = 'baja-lib-close';
        xb.title = 'Close the library';
        xb.setAttribute('role', 'button');
        xb.setAttribute('tabindex', '0');
        xb.setAttribute('aria-label', 'Close the library');
        xb.textContent = '✕';
        xb.style.cssText = 'position:fixed;top:44px;right:14px;z-index:2147483000;'
            + 'width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
            + 'background:#0b2545;color:#fff;font:700 15px Arial;cursor:pointer;user-select:none;'
            + 'box-shadow:0 4px 12px rgba(0,0,0,0.32);border:1px solid rgba(255,255,255,0.18);';
        xb.onmouseenter = () => { try { xb.style.filter = 'brightness(1.25)'; } catch (e) { } };
        xb.onmouseleave = () => { try { xb.style.filter = ''; } catch (e) { } };
        const goHome = async () => {
            try { if (xb.parentNode) xb.parentNode.removeChild(xb); } catch (e) { }
            try { await exec('baja/init'); }
            catch (e) { console.log('[library] returning to the home screen failed: ' + e); }
        };
        xb.onclick = goHome;
        xb.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } };
        document.body.appendChild(xb);
    } catch (e) { }

})