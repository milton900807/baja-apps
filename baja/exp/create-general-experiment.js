function (library, folder) {
    let type = 'general'
    exec('lib/msgraph').then(async MSGraph => {
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All']
        }

        let titleHook;
        let descHook;

        if (typeof library === 'string' && library.startsWith('/')) {

            let user = getUser();
            let html = {
                'wid': 'html',
                'data': '> <img src="/assets/img/icons/png/plus.png"> <b>' + getUser() + '</b> <hr> ' +
                    ' Author: ' + getUser ()
            }

            showWidget(html).then(async (_t) => {
                let html2 = {
                    'wid': 'html',
                    'data': '<h4> New experiment </h4>'
                }
                await showWidget(html2);
                let title_text = {
                    'wid': 'input-textfield',
                    'title': 'Experiment Folder Name ',

                    'data': {
                        'blocking': false,
                        'show-button': false,
                        'ionHookFunction': createIonFunction((w) => {
                            titleHook = w
                        }),
                        'ionfunction': createIonFunction((title) => {
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
                title = title.replace(/[^a-zA-Z0-9]/g, '_');
                descv = descHook.getWidgetValue();

                let jsonobj = {
                    "key": "user",
                    "user": getUser(),
                    "spath": library+'/'+title,
                }

                let host_ = window['env']['apiUrl']
                if ( descv == null || descv.length <= 0){
                    infoPrompt  ( " Please provide a description ")
                    return;
                }
                if ( title == null || title.length <= 0){
                    infoPrompt  ( " Please provide a title ")
                    return;
                }

                let rs = await POSTJSON(jsonobj, host_ + '/save-user-dir');
                let results = await exec('py/db/new-experiment.py', user, title, descv, library+''+title)
                showModal({
                    wid: 'json',
                    data: JSON.stringify(results)
                })
                progress.status = 'complete'
                clear();

            })

        }
        else {
            MSGraph.getClient(sharepoint_config).then(client => {
                client.api('/me').get().then(async (user) => {
                    let folderinfo = await client.api(`/drives/${library.id}/items/${folder.id}`).get();
                    let email = user['userPrincipalName']
                    email = email.substring(0, email.indexOf('@'));
                    let titleHook;
                    let descHook;
                    let html = {
                        'wid': 'html',
                        'data': '> <img src="/assets/img/icons/png/plus.png"> <b>' + folderinfo.name + '</b> <hr> ' +
                            ' Author: ' + user['displayName'] + ' (' + user['userPrincipalName'] + ')'
                    }
                    showWidget(html).then(async (_t) => {
                        let html2 = {
                            'wid': 'html',
                            'data': '<h4> New experiment </h4>'
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
                        let djson = {
                            'summary': descv,
                            'title': title,
                            'author': author
                        }
                        if ( descv == null || descv.length <= 0){
                            infoPrompt  ( " Please provide a description ")
                            return;
                        }
                        if ( title == null || title.length <= 0){
                            infoPrompt  ( " Please provide a title ")
                            return;
                        }
                        console.log('debubg');

                        let db = await exec ('baja/lib/db.js', library.id);

                        let directory = await db.mkTargetDirectory(folder.id, title);
                        let experimentObject = await exec('baja/exp/create-experiment.js', library.id, directory.id, type, djson)

                        progress.status = 'complete'
                        let experimentFolder = await client.api(`/drives/${library.id}/items/${experimentObject.parentReference.id}`).get();
                        await exec('baja/eln/init.js', library, experimentFolder, experimentObject)
                        progress.status = 'complete'
                    })
                })
            })
        }
    })
}
