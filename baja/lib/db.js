function (libid__) {

    return new Promise(async (resolve, reject) => {

        let MSGraph = await exec('lib/msgraph.js')

        let sharepoint_config = { 'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All', 'Sites.ReadWrite.All', 'https://graph.microsoft.com/Sites.ReadWrite.All'] };
        let LibDB = class LibDB {
            lib = '/me/drive'
            libid;
            constructor(_lib) {
                if (_lib) {
                    this.lib = '/drives/' + _lib;
                    this.libid = _lib;
                }
            }

            xfileFolderExists = async (foldername) => {
                let MSGraph = await exec('lib/msgraph.js')
                let filepath = `${this.libid}/root:/${path}`;
                let client = await MSGraph.getClient(sharepoint_config);
                try {
                    let folder = await client.api(filepath).get();
                    if (folder['folder']) {
                        return folder;
                    }
                } catch (exception) {
                    console.log(exception)
                    return null;
                }
                return null;
            }

            folderExists = async (path) => {
                if (path.startsWith('/')) {
                    path = path.substring(1).trim();
                }
                let MSGraph = await exec('lib/msgraph.js')
                let filepath = `${this.lib}/root:/${path}`;
                let client = await MSGraph.getClient(sharepoint_config);
                try {
                    let folder = await client.api(filepath).get();
                    if (folder['folder']) {
                        return folder;
                    }
                } catch (exception) {
                    console.log(exception)
                    return null;
                }
                return null;
            }

            experiment = async (parentFolderId, name) => {
                try {
                    let directory = await this.mkTargetDirectory(parentFolderId, name);
                    if (directory) {
                        let MSGraph = await exec('lib/msgraph.js')
                        let client = await MSGraph.getClient(sharepoint_config);

                        let sheet_path = `${this.lib}/root:/bajabio-xfiles/experiments.xlsx`;

                        let sheetObject = await client.api(sheet_path).get();
                        let idvalue = sheetObject['id']
                        let sheetPath = `${this.lib}/items/${idvalue}/workbook/worksheets/Experiments/tables`
                        sheetObject = await client.api(sheetPath).get();
                        if (sheetObject['value'].length === 0) {
                            const workbookTable = {
                                name: 'Exp',
                                showTotals: true,
                                address: 'Experiments',
                                hasHeaders: true,
                                style: 'style-value'
                            };
                            sheetObject = await client.api(`${this.lib}/items/${idvalue}/workbook/tables/add`)
                                .post(workbookTable);
                            let workbookTableColumn = {
                                id: '0',
                                name: 'ExpID',
                                index: 0
                            };
                            await client.api(`${this.lib}/items/${idvalue}/workbook/tables/${sheetObject['id']}/columns`)
                                .post(workbookTableColumn);
                            workbookTableColumn = {
                                id: '1',
                                name: 'DirID',
                                index: 1
                            };
                            await client.api(`${this.lib}/items/${idvalue}/workbook/tables/${sheetObject['id']}/columns`)
                                .post(workbookTableColumn);
                        } else {
                            let sheetPath = `${this.lib}/items/${idvalue}/workbook/worksheets/Experiments/tables/Table1/range/lastRow`
                            sheetObject = await client.api(sheetPath).get();

                            let jb = sheetObject;
                            if (jb && jb.values && jb.values.length > 0) {
                                let r = jb.values[0]
                                if (r && !Number.isInteger(r)) {

                                    let v = r[0]
                                    let next = v + 1;
                                    sheetObject = await client.api(`${this.lib}/items/${idvalue}/workbook/tables/Table1/rows/add`).post({
                                        "values": [[next, directory['id']]]
                                    });
                                }
                            }
                        }
                        return sheetObject;

                    }
                } catch (exception) {
                    return null;
                }
            }
            experimentIncr = async () => {
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);

                let sheetObject = null;

                let sheet_path = `${this.lib}/root:/bajabio-xfiles/experiments.xlsx`;
                sheetObject = await client.api(sheet_path).get();

                let idvalue = sheetObject['id']
                let sheetPath = `${this.lib}/items/${idvalue}/workbook/worksheets/Experiments/tables`
                sheetObject = await client.api(sheetPath).get();
                if (sheetObject['value'].length === 0) {
                    const workbookTable = {
                        name: 'Exp',
                        showTotals: true,
                        address: 'Experiments',
                        hasHeaders: true,
                        style: 'style-value'
                    };
                    sheetObject = await client.api(`${this.lib}/items/${idvalue}/workbook/tables/add`)
                        .post(workbookTable);
                    let workbookTableColumn = {
                        id: '0',
                        name: 'ExpID',
                        index: 0
                    };
                    await client.api(`${this.lib}/items/${idvalue}/workbook/tables/${sheetObject['id']}/columns`)
                        .post(workbookTableColumn);
                    workbookTableColumn = {
                        id: '1',
                        name: 'DirID',
                        index: 1
                    };
                    await client.api(`${this.lib}/items/${idvalue}/workbook/tables/${sheetObject['id']}/columns`)
                        .post(workbookTableColumn);
                } else {
                    let sheetPath = `${this.lib}/items/${idvalue}/workbook/worksheets/Experiments/tables/Table1/rows`
                    sheetObject = await client.api(sheetPath).get();
                }
                return sheetObject;
            }

            list = async (path) => {
                let MSGraph = await exec('lib/msgraph.js')
                let filepath = `${this.lib}/root:/${path}:/children`;

                let client = await MSGraph.getClient(sharepoint_config);
                try {
                    let folder = await client.api(filepath).get();
                    return folder;

                } catch (exception) {
                    console.log(exception)
                    return null;
                }
                return null;
            }

            loadJSONFile = async (libraryid, fileid) => {
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                let eln_summary_doc = `/drives/${libraryid}/items/${fileid}`

                let gdoc = await client.api(eln_summary_doc).get();
                let url = gdoc['@microsoft.graph.downloadUrl']
                let json = await GETJSON(url)
                return json;
            }

            loadTextFile = async (fileid) => {
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                let eln_summary_doc = '/me/drive/items/' + fileid + '';
                console.log(' file path ' + eln_summary_doc);
                let gdoc = await client.api(eln_summary_doc).get();
                let url = gdoc['@microsoft.graph.downloadUrl']
                let txt = await GETXT(url)
                return txt;
            }

            updateVCFInstallation = async (tab, lib, folderid, fileid, filename, install_path) => {
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                try {
                    let sheet_path = `/drives/${lib}/items/${folderid}/workbook/worksheets/gene-graph`;
                    let sheetObject = await client.api(sheet_path).get();
                    let sheet_id = sheetObject['id']
                    let sheetpath = `/drives/${v.ELN_DRIVE_ID}/items/${objectid}/workbook/worksheets/${sheet_id}/range(address='A1:B${rowindex}')`;
                    let updateResponse = await client.api(sheetpath).update(j);

                    return;
                } catch (exception) {
                    console.log(exception);

                    return;

                }
            }

            load = async (experimentid) => {

            }

            mkrootdir = async (folder_name) => {
                let MSGraph = await exec('lib/msgraph.js')

                let client = await MSGraph.getClient(sharepoint_config);
                try {
                    let filepath = `/me/drive/root:/bajabio-screens:/children`;
                    let new_exp_dir = {
                        "name": folder_name,
                        "folder": {
                        },
                        "@microsoft.graph.conflictBehavior": "fail"
                    }
                    let folder = await client.api(filepath)
                        .post(new_exp_dir)
                        .catch(error => {
                            log("Folder already exists in this location...  Error creating experiment, please send the following output to informatics:")
                            let cs = JSON.stringify(error);
                            let jsonv = {
                                'wid': 'json',
                                'data': cs
                            }
                            showWidget(jsonv);
                        })
                    return folder;
                } catch (exception) {
                    console.log(exception)
                }
            }

            mkdir = async (path, foldername) => {
                let MSGraph = await exec('lib/msgraph.js')
                path = path.trim();

                let client = await MSGraph.getClient(sharepoint_config);
                let filepath = `/me/drive/root:/bajabio-screens/${path}:/children`;

                if (!foldername) {
                    if (path.indexOf('/') > 0) {
                        let i = path.lastIndexOf('/')
                        path = path.substring(0, i);
                        filename = path.substring(i + 1).trim();
                        filepath = `/me/drive/root:/bajabio-screens/${path}:/children`;
                    } else {
                        filepath = `/me/drive/root:/bajabio-screens:/children`;
                        foldername = path;
                    }
                }

                try {
                    let new_exp_dir = {
                        "name": foldername,
                        "folder": {
                        },
                        "@microsoft.graph.conflictBehavior": "fail"
                    }
                    let folder = await client.api(filepath)
                        .post(new_exp_dir)
                        .catch(error => {
                            log("Folder already exists in this location...  Error creating experiment, please send the following output to informatics:")
                            let cs = JSON.stringify(error);
                            let jsonv = {
                                'wid': 'json',
                                'data': cs
                            }
                            showWidget(jsonv);
                        })
                    return folder;
                } catch (exception) {
                    console.log(exception)
                }
            }

            mkrootdir = async () => {
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                try {
                    let filepath = `${this.lib}/root/children`;
                    console.log(' file path ' + filepath);
                    console.log('debubg');
                    let new_exp_dir = {
                        "name": 'bajabio-screens',
                        "folder": {
                        },
                        "@microsoft.graph.conflictBehavior": "fail"
                    }
                    let folder = await client.api(filepath)
                        .post(new_exp_dir)
                        .catch(error => {

                            let cs = JSON.stringify(error);
                            let jsonv = {
                                'wid': 'json',
                                'data': cs
                            }

                        })
                    return folder;
                } catch (exception) {
                    console.log(exception)
                }
            }

            mkTargetDirectory = async (parentId, folder_name) => {
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                try {
                    let filepath = `${this.lib}/items/${parentId}/children`;
                    let new_exp_dir = {
                        "name": folder_name,
                        "folder": {
                        },
                        "@microsoft.graph.conflictBehavior": "fail"
                    }
                    console.log('debubg');
                    let folder = await client.api(filepath)
                        .post(new_exp_dir)
                        .catch(error => {
                            log("Folder already exists in this location...  Error creating experiment, please send the following output to informatics:")
                            let cs = JSON.stringify(error);
                            let jsonv = {
                                'wid': 'json',
                                'data': cs
                            }
                            showWidget(jsonv);
                        })
                    return folder;
                } catch (exception) {
                    console.log(exception)
                }
            }

            mkTargetRootdir = async (folder_name) => {
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                try {
                    let filepath = `${this.lib}/root:/bajabio-screens:/children`;
                    let new_exp_dir = {
                        "name": folder_name,
                        "folder": {
                        },
                        "@microsoft.graph.conflictBehavior": "fail"
                    }
                    console.log('debubg');
                    let folder = await client.api(filepath)
                        .post(new_exp_dir)
                        .catch(error => {
                            log("Folder already exists in this location...  Error creating experiment, please send the following output to informatics:")
                            let cs = JSON.stringify(error);
                            let jsonv = {
                                'wid': 'json',
                                'data': cs
                            }
                            showWidget(jsonv);
                        })
                    return folder;
                } catch (exception) {
                    console.log(exception)
                }
            }

            mkdir = async (path, foldername) => {

                path = path.trim();
                foldername = foldername.trim();

                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                let filepath = `${this.lib}:/bajabio-screens/${path}:/children`;
                if (!foldername) {
                    if (path.indexOf('/') > 0) {
                        let i = path.lastIndexOf('/')
                        path = path.substring(0, i);
                        filename = path.substring(i + 1).trim();
                        filepath = `${this.lib}:/bajabio-screens/${path}:/children`;
                    } else {
                        filepath = `${this.lib}:/bajabio-screens:/children`;
                        foldername = path;
                    }
                }

                try {
                    let new_exp_dir = {
                        "name": foldername,
                        "folder": {
                        },
                        "@microsoft.graph.conflictBehavior": "fail"
                    }
                    let folder = await client.api(filepath)
                        .post(new_exp_dir)
                        .catch(error => {
                            log("Folder already exists in this location...  Error creating experiment, please send the following output to informatics:")
                            let cs = JSON.stringify(error);
                            let jsonv = {
                                'wid': 'json',
                                'data': cs
                            }
                            showWidget(jsonv);
                        })
                    return folder;
                } catch (exception) {
                    console.log(exception)
                }
            }

            getFileObjectID = async (path) => {
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                let fileobj = await client.api(path).get();
                let objectid = fileobj['id']
                return objectid;
            }

            loadSheet = async (libid, itemid, sheetname, range) => {
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                try {
                    let path = `/drives/${libid}/items/${itemid}`

                    let sheet_path = `${path}/workbook/worksheets/${sheetname}`;
                    let sheetObject = await client.api(sheet_path).get();
                    let sheet_id = sheetObject['id']
                    let workbookWorksheet = await client.api(`${path}/workbook/worksheets/${sheet_id}/range(address='${range}')`).get();
                    return workbookWorksheet;
                } catch (exception) {
                    console.log(exception)
                }
            }

            createExcel = (experimentid, filename, author) => {
                return new Promise(async (resolve, reject) => {
                    let r = await copyTemplate(filename, experimentid)
                    resolve(r);
                })
            }

            copyTemplate = async (template_name, experimentid) => {
                return new Promise(async (resolve, reject) => {
                    let MSGraph = await exec('lib/msgraph.js')

                    let templateObject = await exec('eln/templates/get-template', template_name)
                    let experiment_folder_id = await exec('eln/util/get-experiment-folder-id', experimentid)
                    const driveItem = {
                        parentReference: {
                            driveId: env.ELN_DRIVE_ID,
                            id: experiment_folder_id
                        },
                        name: template_name
                    };
                    let sharepoint_config = {
                        'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Mail.Send']
                    }
                    let client = await MSGraph.getClient(sharepoint_config);
                    let sheet_r = await client.api(`/drives/${v.ELN_TEMPLATE_DRIVE_ID}/items/${templateObject['id']}/copy`)
                        .post(driveItem);
                    resolve(sheet_r)
                })
            }
            mkdirs = async (libid, path) => {
                let client = await MSGraph.getClient(sharepoint_config);
                try {
                    if (path == null || path.length <= 0) {
                        return null;
                    }
                    if (path.startsWith('/')) {
                        path = path.substring(1);
                    }

                    let filepath = `/drives/${libid}/root:/bajabio-xfiles/${path}`;
                    let f = await client.api(filepath).get();
                    return f;
                } catch (e) {
                    console.log(' e ' + e)
                }
            }

            verify = async (libid, path) => {
                console.log(" path " + path);
                let ps = path.split('/')
                let pth = ''
                let f = null;
                for (let p of ps) {
                    pth += '/' + p
                    f = await this.mkdirs(libid, pth)
                }

                return f;
            }

            async loadFileAndViewVersionHistory(accessToken) {
                const graphApiEndpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/versions`;
                try {
                    const response = await axios.get(graphApiEndpoint, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`
                        }
                    });
                    console.log('File version history:', response.data);
                    return response.data;
                } catch (error) {
                    console.error('Error loading file or viewing version history:', error);
                }
            }

            async findVersionByDate(targetDate) {
                const versions = await loadFileAndViewVersionHistory();
                if (versions && versions.value) {
                    const targetDateTime = new Date(targetDate).toISOString();
                    const foundVersion = versions.value.find(version => version.lastModifiedDateTime.split('T')[0] === targetDateTime.split('T')[0]);

                    if (foundVersion) {
                        console.log(`Found version for date ${targetDate}:`, foundVersion);
                    } else {
                        console.log(`No version found for date ${targetDate}`);
                    }
                }
            }

            getStructure = (lib_id, o) => {
                return new Promise(async (resolve, reject) => {
                    let str = o.structure.replaceAll('[', '_')
                    o.status = "Sync...."
                    str = str.replaceAll(']', '_')
                    str = str.replaceAll('{', '_')
                    let filename = str + '.json'
                    let prefix = o.sequence.substring(0, 4)
                    let folder = await this.verify(lib_id, `reg/${o.type}/${prefix}/${o.sequence}`);
                    let folderid = folder.id;
                    let parentpath = `/drives/${lib_id}/items/${folderid}`
                    let p = parentpath + ':/' + filename + ':/content'
                    let client = await MSGraph.getClient(sharepoint_config);
                    let fo = await client.api(`${parentpath}`).get();
                    console.log(" fo :" + fo)
                    let searchQuery = `startswith(name, '${str}')`;
                    let searchResults = await client.api(`${parentpath}/children`).filter(searchQuery).get();

                    if (searchResults && searchResults.value.length > 0) {
                        let firstFile = searchResults.value[0];
                        let filePath = `${parentpath}:/${firstFile.name}:/content`;
                        console.log('Downloading content from: ' + filePath);

                        let fileContent = await client.api(filePath).get();
                        console.log('File content downloaded successfully.');

                        resolve(fileContent)

                    } else {
                        console.log('No matching files found.');
                    }
                    resolve(r)
                })

            }

            saveScreen = async (libraryid, folderid, ds, filename, saveStatusListener) => {
                if (!filename)
                    filename = 'graph.json'

                var blob = new Blob([JSON.stringify(ds, (key, value) => {
                    console.log(" key " + key);
                    if (key == "img") {
                        return 'b64';
                    }
                    else if (key == 'svgs') {
                        return value;
                    }
                    else if (key === 'track_layer_imgs') {
                        console.log(" Do not save the track_layer_images")
                    }
                    else if (key == 'canvas') {
                        return null;
                    } else if (key == 'trackRef') {
                        if (value != null && value.name != null) {
                            return "_900807_" + value.name + '_900807map_' + JSON.stringify(value.map) + '_900807showMismatchesS_' + value.showMismatches + '_900807showMismatchesE_';
                        }
                        return value;
                    }
                    else {
                        return value;
                    }
                })], { type: 'application/json' });
                let path = `/drives/${libraryid}/items/${folderid}`;
                try {
                    let MSGraph = await exec('lib/msgraph.js')
                    console.log(" Saving to " + path + " file size : " + blob.size);
                    let response = await MSGraph.saveLG(blob, filename, path, saveStatusListener)
                    console.log(" Save complete ")
                    return { fileid: response['_responseBody']['id'] }

                } catch (exception) {
                    console.log(exception);
                }
            }

            saveUserRequest = async (ds, saveStatusListener) => {
                try {

                    let jsonobj = {
                        'type': 'user',
                        'filename': 'test.json',
                        'data': ds,
                    }

                    const sendMail = {
                        message: {
                            subject: 'Meet for lunch?',
                            body: {
                                contentType: 'Text',
                                content: 'The new cafeteria is open.'
                            },
                            toRecipients: [
                                {
                                    emailAddress: {
                                        address: 'user@__.com'
                                    }
                                }
                            ],
                            ccRecipients: [
                                {
                                    emailAddress: {
                                        address: 'jeffmilto@gmail.com'
                                    }
                                }
                            ]
                        },
                        saveToSentItems: 'false'
                    };

                    let sharepoint_config = {
                        'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Mail.Send']
                    }
                    let client = await MSGraph.getClient(sharepoint_config);

                    await client.api('/users/jeff@hts.bio/sendMail')
                        .post(sendMail);

                    let r = await POSTJSON(jsonobj, environment)
                    if (r['status'] === 'success') {
                        console.log(" Success ")

                    } else {
                        console.log(" Failed ")
                    }

                    return { fileid: response['_responseBody']['id'] }
                } catch (exception) {
                    console.log(exception);
                }
            }

            loadFunctions = async (folder_name, functions_, path) => {
                if (!folder_name)
                    folder_name = '.functions'
                if (!functions_)
                    functions_ = {}
                if (!path)
                    path = folder_name;
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                let folder = await this.folderExists(`${folder_name}`);

                if (!folder) {
                    return;
                }
                let folderlist = '/me/drive/items/' + folder['id'] + '/children'
                let res = await client.api(folderlist).get();
                for (let r of res['value']) {
                    if (r['folder']) {
                    } else {
                        let f = await this.loadFunctionFile(r);
                        let spath = `${path}/${r['name']}`
                        if (spath.endsWith('.js')) {
                            spath = spath.substring(0, spath.length - 3)
                        }
                        if (spath.startsWith('/'))
                            spath = spath.substring(1).trim()
                        if (spath.startsWith('.'))
                            spath = spath.substring(1).trim()
                        spath = spath.replace(/\//g, '.').trim()

                        functions_[spath] = f;
                    }
                }
                return functions_;
            }
            loadFunctionFile = async (file) => {
                if (file && file['@microsoft.graph.downloadUrl']) {
                    let molObject = await GETXT(file['@microsoft.graph.downloadUrl'])
                    return molObject;
                }
            }

            saveExperimentIDFile = async () => {
                let MSGraph = await exec('lib/msgraph.js')
                let client = await MSGraph.getClient(sharepoint_config);
                let path = `${this.lib}/root:/bajabio-screens/.exp.xlsx:/workbook/worksheets/exps`;
                let j = [["test", "st"]]
                try {
                    let updateResponse = await client.api(path).update(j);
                    return;
                } catch (exception) {
                    console.log(exception);
                    return;
                }
            }
        }
        let ldb = new LibDB(libid__);
        resolve(ldb)
    })

}
