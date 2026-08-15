function () {
    let sharepoint_config = {
        'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
            'Sites.ReadWrite.All']
    }
    MSGraph.getClient(sharepoint_config).then(client => {
        client.api('/me').get().then(async (user) => {
            let createFolder = async (did, name) => {
                return new Promise(async (resolve, reject) => {
                    let folder = null;
                    if (did == null || did.length <= 0) {
                        alert(" Drive id is not correct " + did);
                        return;
                    }
                    log("Creating doc repository : " + did);
                    let new_exp_dir = {
                        "name": did,
                        "folder": {
                        },
                        "@microsoft.graph.conflictBehavior": "fail"
                    }
                })
            }

            let email = user['userPrincipalName']
            email = email.substring(0, email.indexOf('@'));
            let titleHook;
            let descHook;
            let html = {
                'wid': 'html',
                'data': ' ' + user['displayName'] + ' (' + user['userPrincipalName'] + ')'
            }
            showWidget(html).then(async (_t) => {
                let html2 = {
                    'wid': 'html',
                    'data': '<h4> New doc tracker</h4>'
                }
                await showWidget(html2);
                let folder;
                let file_drop_object = null;
                showWidget({
                    wid: 'file-drop',
                    data: {
                        'showUploadButton': false,
                        'getUploadFolder': createIonFunction(() => {
                            return `/drives/${constants.DRIVE_ID}/items/${folder['id']}:`
                        }),
                        'getRef': createIonFunction((ref) => {
                            file_drop_object = ref;
                        }),
                        'onDropFunction': createIonFunction(async (file) => {
                            let author = user['userPrincipalName']
                            author = author.substring(0, author.indexOf('@'));

                            let doc_id = await exec('MT-doc/next-id.js', file.name, author, constants.DRIVE, 'admin', 'initializing')
                            let repo_id = doc_id['id']
                            folder = await createFolder(doc_id['id'], file.name);

                            showWidget({
                                wid: 'button',
                                data: {
                                    label: 'Upload',
                                    ionfunction: createIonFunction(async () => {
                                        log("Uploading doc into " + repo_id + ',' + folder['name'])
                                        let responses = await file_drop_object.upload();

                                        if (responses != null && responses.length > 0) {
                                            let file_id = responses[0].id;
                                            exec('MT-doc/update-file-id-for-trac.js', doc_id['id'], file_id);
                                        }

                                        exec('MT-doc/folder-view.js', repo_id, folder['id'])
                                    })
                                }
                            })
                        })
                    }
                })
            })
        })
    })
}
