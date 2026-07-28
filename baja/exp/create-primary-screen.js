function (library, folderid) {
    let type = 'primary-screen'
    let libraryid = library.id;
    exec('lib/msgraph').then(async MSGraph => {
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All']
        }
        MSGraph.getClient(sharepoint_config).then(client => {
            client.api('/me').get().then(async (user) => {

                let folderinfo = await client.api ( `/drives/${libraryid}/items/${folderid}`).get ();
                let email = user['userPrincipalName']
                email = email.substring(0, email.indexOf('@'));
                let titleHook;
                let descHook;
                let html = {
                    'wid': 'html',
                    'data': '> <img src="/assets/img/icons/png/plus.png"> <b>' + folderinfo.name  + '</b> <hr>' +
                    'Author: ' + user['displayName'] + ' (' + user['userPrincipalName'] + ')'
                }
                showWidget(html).then(async (_t) => {
                    let html2 = {
                        'wid': 'html',
                        'data': '<h4> New primary screen experiment </h4>'
                    }
                    await showWidget(html2);

                    let title_text = {
                        'wid': 'input-textfield',
                        'title': ' Title ',
                        'data': {
                            'blocking': false,
                            'show-button': false,
                            'ionHookFunction': createIonFunction((w) => {
                                titleHook = w
                            }),
                            'ionfunction': createIonFunction((title) => {
                                console.log(" title " + title);
                            })
                        }
                    }
                    await showWidget(title_text)
                    let desc = {
                        'wid': 'input-textarea-editor',
                        'title': 'Experiment Description',
                        'data': {
                            'ionHookFunction': createIonFunction((w) => {
                                descHook = w
                            }),
                            'button-label': 'Create experiment',
                            'ionFunction': createIonFunction((description) => {
                                console.log(" description " + description);
                            })
                        }
                    }
                    await showWidget(desc)
                    let progress = await showWidget({ wid: 'working' })
                    title = titleHook.getWidgetValue();
                    descv = descHook.getWidgetValue();
                    let author = user['userPrincipalName'].split('@')[0]
                    if ( descv == null || descv.length <= 0){
                        infoPrompt  ( " Please provide a description ")
                        return;
                    }
                    if ( title == null || title.length <= 0){
                        infoPrompt  ( " Please provide a title ")
                        return;
                    }
                    let experimentObject = await exec('baja/exp/create-experiment.js', libraryid, folderid, type, title, descv)
                    progress.status = 'complete'
                    clear();

                    await exec('baja/screens/open-screen-editor.js', library, folderid, experimentObject['values'][0][0])

                })
            })

        })
    })

}
