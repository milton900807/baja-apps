
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

})