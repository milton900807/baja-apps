
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

    // Close (✕) button pinned to the upper-left → navigates back to the previous screen.
    try {
        const prev = document.getElementById('baja-lib-close');
        if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
        const xb = document.createElement('div');
        xb.id = 'baja-lib-close';
        xb.title = 'Back';
        xb.textContent = '✕';
        xb.style.cssText = 'position:fixed;top:44px;left:12px;z-index:2147483000;'
            + 'width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
            + 'background:#0b2545;color:#fff;font:700 15px Arial;cursor:pointer;'
            + 'box-shadow:0 4px 12px rgba(0,0,0,0.32);border:1px solid rgba(255,255,255,0.18);';
        xb.onmouseenter = () => { try { xb.style.filter = 'brightness(1.2)'; } catch (e) { } };
        xb.onmouseleave = () => { try { xb.style.filter = ''; } catch (e) { } };
        xb.onclick = () => {
            try { if (xb.parentNode) xb.parentNode.removeChild(xb); } catch (e) { }
            try { window.history.back(); } catch (e) { }
        };
        document.body.appendChild(xb);
    } catch (e) { }

})