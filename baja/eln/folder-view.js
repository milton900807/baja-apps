function (libraryid, folderid, graph) {
    let sharepoint_config = {
        'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
            'Sites.ReadWrite.All']
    }

    function downloadFile(filePath){
        var link=document.createElement('a');
        link.href = filePath;
        link.download = filePath.substr(filePath.lastIndexOf('/') + 1);
        link.click();
    }

    exec('lib/msgraph.js').then(async MSGraph => {

        let client = await  MSGraph.getClient(sharepoint_config);

        showWidget({
            wid: 'folder-browser',
            data: {
                path: `/drives/${libraryid}/items/${folderid}`,
                'ionfunction.path': createIonFunction(async (file) => {

                    if (file['name'].endsWith('.docx') || file['name'].endsWith('.xlsx')) {
                        let f = await client.api(`/drives/${libraryid}/items/${file.id}`).get();

                        let url = f['webUrl'];
                        window.open(url, "_blank");
                    }else if ( file['name'].endsWith ( '.json')){
                        let url = f["@microsoft.graph.downloadUrl"]
                        downloadFile(url);
                    } else if (file['name'].endsWith ( '.screen') ){

                        window.open (`/app/baja/screens/open-screen?lib_id=${libraryid}&file_id=${file.id}`)
                    } else {

                    }

                }),
                'ionfunction.openfile': createIonFunction(async (file, text) => {
                })
            }
        })

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
                let html = {
                    'wid': 'html',
                    'data': ''
                }
                showWidget(html).then(async (_t) => {
                    let html2 = {
                        'wid': 'html',
                        'data': '<h4> </h4>'
                    }
                    await showWidget(html2);
                })
            })
        })
    })

}
