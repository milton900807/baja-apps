function (library, folder) {
    let type = 'general'
    exec('lib/msgraph').then(async MSGraph => {
        let user = getUser();

        let html = {
            'wid': 'html',
            'data': '> <img src="/assets/img/icons/png/plus.png"> <b>' + getUser() + '</b> <hr> ' +
                ' Author: ' + getUser()
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
            if (folder) {
                MSGraph.getClient(sharepoint_config).then(client => {
                    client.api('/me').get().then(async (user) => {
                        let folderinfo = await client.api(`/drives/${library.id}/items/${folder.id}`).get();
                        let email = user['userPrincipalName']
                        email = email.substring(0, email.indexOf('@'));
                        await exec('baja/eln/init.js', library, experimentFolder, experimentObject)
                    })
                })
            } else {
                let jsonobj = {
                    "key": "user",
                    "user": getUser(),
                    "spath": library + '/' + title,
                }
                let host_ = window['env']['apiUrl']
                let rs = await POSTJSON(jsonobj, host_ + '/save-user-dir');
                let results = await exec('py/db/new-experiment.py', user, title, descv, library + '' + title)
                showModal({
                    wid: 'json',
                    data: JSON.stringify(results)
                })
                progress.status = 'complete'
                clear();
                await exec('manchester/fb', library + '/' + title )

            }
        })
    })
}
