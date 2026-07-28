function (selected_rule) {

    if (selected_rule === null || selected_rule === undefined) {
        log(" Please select a rule to install ")
        return;
    } else {

        return new Promise(async (resolve, reject) => {
            exec('lib/msgraph.js').then(async MSGraph => {
                let sharepoint_config = {
                    'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite',
                        'Files.ReadWrite.All', 'Sites.Read.All', 'Sites.ReadWrite.All', 'https://graph.microsoft.com/Sites.ReadWrite.All']
                };
                let client = await MSGraph.getClient(sharepoint_config);
                let verify = async (path) => {
                    console.log(" path " + path);
                    let ps = path.split('/')
                    let pth = ''
                    let f = null;
                    for (let p of ps) {
                        pth += '/' + p
                        f = await mkdirs(pth)
                    }

                    return f;
                }
                let mkdirs = async (path) => {
                    client = await MSGraph.getClient(sharepoint_config);
                    try {
                        if (path == null || path.length <= 0) {
                            return null;
                        }
                        if (path.startsWith('/')) {
                            path = path.substring(1);
                        }

                        path = path.trim();

                        let filepath = `/drives/${libid}/root:/bajabio-xfiles/${path}`;
                        let f = await client.api(filepath).get();
                        return f;
                    } catch (e) {
                        try {
                            let folderpath = `/drives/${libid}/root:/bajabio-xfiles/${path}:/children`;

                            let foldername = path.substring(path.lastIndexOf('/') + 1)
                            let parentfolder = path.substring(0, path.lastIndexOf('/'))
                            parentfolder = `/drives/${libid}/root:/bajabio-xfiles/${parentfolder}:/children`

                            let new_exp_dir = {
                                "name": foldername,
                                "folder": {
                                },
                                "@microsoft.graph.conflictBehavior": "fail"
                            }

                            console.log('debubg');
                            let folder = await client.api(parentfolder)
                                .post(new_exp_dir)
                                .catch(error => {
                                    console.log(error)

                                })

                            return folder;

                        } catch (ee) {
                            console.log('debubg');
                            let parent = path.substring(0, path.lastIndexOf('/'))
                            return verify(parent);
                        }
                    }
                }

            })
        })

    }
