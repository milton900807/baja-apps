function () {

    let ww = {
        wid: 'simple-file-browser',
        width: '100%',
        height: '100%',
        data: {
            width: '100%',
            drive: 'bigdata',
            user: getUser(),
            server: window['env']['apiUrl'],
            columns: 3,
            filetype: '.bw,.bigwig,.gz',
            root: '/rnaseq',
            "ionfunction.fileClick": createIonFunction(async (element) => {
            }),
            "ionfunction.openfile": createIonFunction(async (file, text) => {
            }
            ),
            "ionfunction.path": createIonFunction(async (path, nodes) => {
            })
        }
    }
    CurrentLayout.clearComponent('mainPanel')
    CurrentLayout.setComponent('mainPanel', ww);
}
