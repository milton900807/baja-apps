function (libraryid, folderid, setpt, updateStatsPanel, paint_panel) {

    return new Promise(async (resolve, reject) => {
        let PlateTrack = await exec('baja/plate/plate-track.js')
        let MGrid = await exec('flexigraph/grid.js');
        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')
        let TransferFunction = await exec('baja/plate/transfer-functions.js')

        let db = await exec('baja/lib/db.js', libraryid);
        let MSGraph = await exec('lib/msgraph.js')
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All']
        }

        let workingpanel;

        mkdir = async (foldername, praentpath) => {
            praentpath = praentpath + '/children'
            foldername = foldername.trim();
            let client = await MSGraph.getClient(sharepoint_config);
            try {
                let new_exp_dir = {
                    "name": foldername,
                    "folder": {
                    },
                    "@microsoft.graph.conflictBehavior": "fail"
                }
                let folder = await client.api(praentpath)
                    .post(new_exp_dir)
                    .catch(error => {
                        log("Folder already exists in this location...  Error creating experiment, please send the following output to informatics:")
                        let cs = JSON.stringify(error);
                        let jsonv = {
                            'wid': 'json',
                            'data': cs
                        }
                        showModal(jsonv);
                    })
                return folder;
            } catch (exception) {
                console.log(exception)
            }
        }

        let plates_panel;
        let platePanel = createIonFunction((p) => {
            plates_panel = p;
        })

        let loadedPlate = null;

        let loadPlates = (obj) => {
            let ps = [];
            for (let a of obj) {
                let p = Object.assign(new Plate(), a)
                if (p.plates && p.plates.length > 0) {
                    let pa = loadPlates(p.plates)
                    p.plates = pa;
                }
                p.grid = Object.assign(new MGrid(), p.grid)
                let ww = []
                let rows = a.wells;
                for (let r of rows) {
                    let _row = []
                    for (let w of r) {
                        _row.push(Object.assign(new GenericWell(), w))
                    }
                    ww.push(_row);
                }
                p.wells = ww;

                ps.push(p)
            }
            return ps;
        }

        let updateStatsPanel__dep = async (fs, filename) => {
            let ht = ' '
            ht += `Load: ${filename}  plate name: <font color="blue">${fs.name} </font>`
            if (plates_panel) {
                plates_panel.setHTML(ht);
            }
            let mgrid = Object.assign(new MGrid(), fs.grid);
            let ffs = Object.assign(new PlateTrack(), fs)
            let transfunctions = []
            let fr = fs.transferFunctions;
            if (fr != null && fr.length > 0) {
                for (let tr of fr) {
                    let vv = Object.assign(new TransferFunction(), tr);
                    if (vv.fun != null && vv.fun.startsWith('function')) {
                        vv.fun = eval(vv.fun);
                    }
                    transfunctions.push(vv);

                }
            }
            ffs.transferFunctions = transfunctions;
            ffs.root = loadPlates(ffs.root);

            for (let t of ffs.transferFunctions) {

                for (let f of ffs.root) {
                    let pl = f.getPlateWithUID(t.to.uid)
                    if (pl)
                        t.to = pl;
                    let pl2 = f.getPlateWithUID(t.from.uid)
                    if (pl2)
                        t.from = pl2;
                }
            }

            ffs.grid = mgrid;
            loadedPlate = ffs;
            loadedPlate.init();
        }

        let canLoad = false;
        let working = createIonFunction((wp) => {
            workingpanel = wp;
            workingpanel.status = 'complete'

        });

        resolve({
            wid: 'card',
            data: {
                cards: [
                    [

                        {
                            width: '100%',
                            'component': {
                                wid: 'folder-browser',
                                data: {
                                    path: `/drives/${libraryid}/items/${folderid}`, 'ionfunction.path': createIonFunction(async (file) => {
                                    }),
                                    'ionfunction.path': createIonFunction(async (file) => {
                                        canLoad = false;
                                        if (file['name'].endsWith('.json') || file['name'].endsWith('.plate-template')) {
                                            workingpanel.status = 'working'

                                            if (libraryid != null && file != null) {
                                                window.history.pushState({ libid: libraryid }, 'Screen',
                                                    `app/baja/plate/views/plate-layout-editor?libid=${libraryid}&fid=${file.id}`);
                                            }

                                            let fs = await db.loadJSONFile(libraryid, file.id);
                                            await updateStatsPanel(fs, file);
                                            canLoad = true;
                                            workingpanel.status = 'complete'

                                            setpt(loadedPlate);

                                            hideAllModal();
                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', paint_panel);

                                        }
                                    }),
                                    folderDialogFunction: createIonFunction((path) => {
                                        showModal({
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: ['Name'],
                                                buttons: [{
                                                    'label': 'Create', 'function': createIonFunction((button_label, input_params) => {

                                                        let foldername = input_params['Name'];
                                                        if (foldername || foldername.length === 0) {
                                                            alert(" Please provide a folder name ")
                                                            return;
                                                        }
                                                        foldername = foldername.trim();

                                                        hideAllModal();
                                                    })
                                                }]
                                            }
                                        })
                                    })
                                }
                            }
                        },
                        {
                            width: '100%', 'component': {
                                'wid': 'working',
                                refCallback: working,
                                'data': {
                                    'message': ``
                                }
                            }
                        },
                        {
                            width: '100%',
                            'component':
                            {
                                wid: 'html',
                                refCallback: platePanel,
                                data: ''
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Load', ionFunction: createIonFunction(async (button) => {
                                                if (canLoad) {
                                                    setpt(loadedPlate);
                                                    hideAllModal();
                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', paint_panel);
                                                }
                                            })
                                        }, {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', paint_panel);

                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        })
    })
}
