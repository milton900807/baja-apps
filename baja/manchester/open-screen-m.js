function (lib_id, file_id) {

    clear();
    mouseMode = 'structures'
    exec('flexigraph/gene.js').then(async (graph) => {
        let io;
        let files;
        let tracks;
        let showMainScreen;
        let genegraph_panel_layout;

        let elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        }
        else if (elem.mozRequestFullScreen) {

            elem.mozRequestFullScreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {

            elem.msRequestFullscreen();
        }

        let working = await showWidget({
            wid: 'working'
        })
        showMainScreen = async () => {
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

        }

        let MSGraph = await exec('lib/msgraph.js')
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All']
        }

        let readonly = false;
        let cwrite = await MSGraph.canWriteToLib(lib_id)
        if (!cwrite) {
            readonly = true;
        }
        let client = await MSGraph.getClient(sharepoint_config);
        let me = await client.api('/me').get();

        let library = await client.api(`/drives/${lib_id}`).get();

        let Icon = await exec('flexigraph/shapes/icon.js')
        window.history.pushState({ libid: lib_id }, 'Screen', `/app/baja/manchester/open-screen-m.js?lib_id=${lib_id}&file_id=${file_id}`);

        let file = await client.api(`/drives/${lib_id}/items/${file_id}`).get();
        graph.file = file;
        let folder = await client.api(`/drives/${lib_id}/items/${file.parentReference.id}`).get();

        graph.folder = folder;
        if (file['folder']) {
            folder = file;
        }
        let MGrid = await exec('flexigraph/grid.js')

        window.addEventListener('paste', (e) => {
            if (e.clipboardData == false) return false;
            var imgs = e.clipboardData.items;
            let foundImage = false;
            for (var i = 0; i < imgs.length; i++) {
                if (imgs[i].type.indexOf("image") == -1) continue; else foundImage = true;
            }
            if (!foundImage) {
                let foundTxt = false;
                for (var i = 0; i < imgs.length; i++) {
                    if (imgs[i].type.indexOf("text/plain") >= 0) {
                        imgs[i].getAsString(async (s) => {
                            s = s.trim();
                            if (s != null && s.length > 0 && s.startsWith('{')) {
                                try {
                                    let jsonObject = JSON.parse(s);
                                    if (jsonObject['viewport']) {
                                        let objects = jsonObject['viewport']['shapes']
                                        let _tracks = jsonObject['viewport']['track']
                                        let _tgrid = jsonObject['viewport']['grid']
                                        let tgrid = Object.assign(new MGrid(), _tgrid);

                                        graph.graph.rescale();
                                        let gwidth = graph.graph.width;
                                        let gheight = graph.graph.height;
                                        if (gwidth <= 0) {
                                            console.log(" graph widht is zero ")
                                            return;
                                        }

                                        let tobjects = []
                                        for (let obj of objects) {
                                            let xsc = tgrid.X(obj.x);
                                            let ysc = tgrid.Y(obj.y);
                                            let wsc = tgrid.screenWidth(obj.w);
                                            let hsc = tgrid.screenHeight(obj.h);
                                            obj.x = graph.Xwc(xsc);
                                            obj.y = graph.Ywc(ysc);
                                            obj.w = graph.worldWidth(wsc);
                                            obj.h = graph.worldHeight(hsc);
                                            tobjects.push(obj)
                                        }
                                        graph.addObjects(tobjects);

                                        let ttracks = {}
                                        for (let t of _tracks) {
                                            let xsc = tgrid.X(t.tgraph.xi);
                                            let ysc = tgrid.Y(t.tgraph.yi);

                                            let wsc = tgrid.screenWidth(t.tgraph.width);
                                            let hsc = tgrid.screenHeight(t.tgraph.height);

                                            t.tgraph.xi = graph.Xwc(xsc);
                                            t.tgraph.yi = graph.Ywc(ysc);

                                            if (isFinite(t.tgraph.xi) && isFinite(t.tgraph.yi)) {

                                                t.tgraph.width = graph.worldWidth(wsc);
                                                t.tgraph.height = graph.worldHeight(hsc);
                                                ttracks[t.name] = t
                                            }

                                        }
                                        await graph.addTrackJSONObjects(ttracks);

                                    }

                                    if (jsonObject['tgraph']) {
                                        if (jsonObject.trackRef) {
                                            let diffx = jsonObject.trackRef.track.tgraph.xi - jsonObject.tgraph.xi;
                                            let diffy = jsonObject.trackRef.track.tgraph.yi - jsonObject.tgraph.yi;
                                            jsonObject.trackRef.track.tgraph.xi = graph.xwc - diffx;
                                            jsonObject.trackRef.track.tgraph.yi = graph.ywc - jsonObject.tgraph.height + diffy;
                                        }
                                        jsonObject.tgraph.xi = graph.xwc;
                                        jsonObject.tgraph.yi = graph.ywc - jsonObject.tgraph.height;
                                        graph.addTrackJSON(jsonObject);
                                    }
                                } catch (exception) {

                                }

                            }
                        })

                    }
                }
            } else {

                let loaded = false;
                var img = new Image();
                if (imgs == undefined) return false;
                for (var i = 0; i < imgs.length; i++) {
                    if (imgs[i].type.indexOf("image") == -1) continue;
                    var imgObj = imgs[i].getAsFile();
                    var url = window.URL || window.webkitURL;
                    let src = url.createObjectURL(imgObj);
                    img.onload = function (e) {
                        loaded = true;

                    };
                    img.src = src;
                }
                graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                graph.setMouseMode('navigate')

                graph.selectOff();
                let ed;
                const nameHook = createIonFunction((editor) => {
                    ed = editor;
                })
                graph.addMouseMoveListener((x, y) => {

                    if (loaded && img)
                        graph.drawImage(img, x, y, graph.worldWidth(img.width), graph.worldHeight(img.height));

                })
                graph.addMouseUpListener(async (x, y) => {
                    if (loaded) {
                        let b64 = await getBase64Image(img.src);
                        img.src = b64;
                        let ic = new Icon('base64', img, x, y, graph.worldWidth(img.width), graph.worldHeight(img.height));
                        ic.b64 = b64;
                        graph.shapes.push(ic);
                        loaded = false;
                        img = null;

                    }
                })
            }
        });

        let paste_sequences_panel = await exec('baja/chem/paste-sequences-w.js', library, folder.id, graph, graph.props)
        let showSavedScreens = async () => {

            if (!readonly) {
                let savedScreens = await exec('baja/manchester/my-saved-screens-w.js', library.id, folder.id, graph)
                showModal(savedScreens);
            } else {
                let mylibs = await exec('baja/manchester/my-libraries.js', graph)
                showModal(mylibs);

            }
        }

        let loadDesignParams = () => {
            let dp = {
                wid: 'card',

                componentRef: 'bottomPanel',
                data: {
                    height: '700px',
                    cards: [
                        [

                        ]]
                }
            }

            CurrentLayout.clearComponent('bottomPanel')
            CurrentLayout.setComponent('bottomPanel', dp);
            return dp;
        }
        graph.addMouseListener((x, y) => {
            io.print(x + ',' + y)
        });
        graph.addListener((_tracks) => {
            tracks = _tracks;

            let index = 0;
            let s = 0;
            let f = 10000;
            for (let t of tracks) {
                if (index === 0) {
                    s = t.xi;
                    f = t.xf;
                }
                if (s > t.xi) {
                    s = t.xi;
                }
                if (f < t.xf) {
                    f = t.xf
                }
            }

        });

        let add = (str) => {
            if (str.startsWith('>')) {
                graph.fasta(str.trim());
            }
            else {
                graph.add(str)
            }
        }
        let zoom = (xi, xf) => {
            graph.zoom(xi, xf)
        }

        let db = await exec('baja/lib/db.js');
        let track_items = []

        if (file && file['@microsoft.graph.downloadUrl']) {
            let jsonObject = await GETJSON(file['@microsoft.graph.downloadUrl'])
            await graph.update(jsonObject);
        }

        let screen_algo = [];

        screen_algo.push({
            label: 'My Algorithms',
            ionfunction: createIonFunction(async () => {

                let screen_algos = {};

                let algorithms = await exec('baja/manchester/load-algoithms.js')
                for (let a of algorithms) {
                    if (a['name']) {
                        let n = a['name']
                        if (n.endsWith('.js'))
                            n = n.substring(0, n.lastIndexOf('.js'))
                        screen_algos[[n]] = (async () => {
                            let f = await db.loadFunctionFile(a)

                            let ChemistryTemplateDB = await exec('baja/chem/chem-template-db.js')
                            let chemTemplateDB = new ChemistryTemplateDB();
                            let chem_template_list = await chemTemplateDB.load();
                            let wrapper = [
                                { "name": "screen", "object": graph.props },
                                { "name": "graph", "object": graph },
                                { "name": "io", "object": io },
                                { 'name': 'file', 'object': file },
                                { 'name': 'files', 'object': files },
                                { 'name': 'track', 'object': tracks },
                                { 'name': 'add', 'object': add },
                                { 'name': 'zoom', 'object': zoom },
                                {
                                    'name': 'logs', 'object': (sstr) => {
                                        io.log(sstr);
                                    }
                                },
                                { 'name': 'Biopolymer', 'object': Biopolymer },
                                { 'name': 'ChemistryTemplates', 'object': chem_template_list }

                            ];
                            console.log('debubg');
                            execObj(f.toString(), ...wrapper)

                        })

                    }
                }
                showList(screen_algos);

            })
        })

        let saveCode = (folderpath) => {
            let c = io.code;
            let title = '';
            let __nameComponent;
            let __nameHook = createIonFunction((ref) => {
                __nameComponent = ref;
            })
            let currentFolder = null;

            showModal(
                {
                    wid: 'card',
                    data: {
                        padding: "10px",
                        cards: [
                            [

                                {
                                    'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                `                   ,
                                    'width': '90%',
                                    'component':
                                    {
                                        wid: 'folder-browser',
                                        data: {
                                            height: '600px',
                                            path: folderpath,
                                            "ionfunction.folderadded": createIonFunction(async (folder) => {

                                            }),
                                            "ionfunction.openfile": createIonFunction(async (file, text) => {

                                            }),
                                            "ionfunction.path": createIonFunction(async (file, nodes) => {
                                                if (!file['folder']) {
                                                    title = file.name;
                                                    __nameComponent.input_param['Name'] = (title)
                                                } else {
                                                    currentFolder = file;
                                                }
                                            })
                                        }
                                    }
                                },
                                {
                                    'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `                   ,
                                    'width': '90%',
                                    'component':
                                    {
                                        wid: 'input-param-items',
                                        refCallback: __nameHook,
                                        data: {
                                            'input_labels': ['Name'

                                            ],
                                        }
                                    }
                                },

                                {
                                    'title': null, 'body': `
                                            `                   ,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'button',
                                        data: [
                                            {
                                                'label': 'Save', ionfunction: createIonFunction(async () => {
                                                    let code = io.code;
                                                    let MSGraph = await exec('lib/msgraph.js')
                                                    let client = await MSGraph.getClient(sharepoint_config);
                                                    let filename = __nameComponent.get('Name')
                                                    if (!filename) {
                                                        alert('Please provide a name')
                                                        return;
                                                    }
                                                    let ds = JSON.parse(code);
                                                    var blob = new Blob([JSON.stringify(ds, (key, value) => {
                                                        if (key == "img") {
                                                            let imgv = value;
                                                            let v = getBase64Image(imgv);
                                                            return v
                                                        } else if (key == 'canvas') {
                                                            return null;
                                                        } else if (key == 'trackRef') {
                                                            if (value != null && value.track != null) {
                                                                return "->:" + value.track.name + ':map:' + JSON.stringify(value.map) + ':showMismatches:' + value.showMismatches + ':';
                                                            }
                                                            return value;
                                                        }
                                                        else {
                                                            return value;
                                                        }
                                                    })], { type: 'application/json' });

                                                    if (!filename.endsWith('.ljlchem')) {
                                                        filename = filename + '.ljlchem'
                                                    }
                                                    let chemistry = `/drives/${library.id}/items/${currentFolder.id}:/${filename}:/content`
                                                    try {
                                                        await client.api(chemistry)
                                                            .put(blob);
                                                    } catch (exception) {
                                                        console.log(exception);
                                                    }

                                                    hideAllModal()
                                                }), disableAfterClick: false
                                            },
                                        ]
                                    }
                                }
                            ]]
                    }
                }

            )

        }

        track_items.push({
            'label': 'Add...', 'ionfunction': createIonFunction(() => {
                exec('baja/manchester/add-track.js', graph)
            })
        })

        track_items.push({
            'label': 'Layers...', 'ionfunction': createIonFunction(async () => {
                exec('baja/manchester/menu/track-layer-editor.js', graph)
            })
        })
        track_items.push({
            'label': 'Export...', 'ionfunction': createIonFunction(async () => {
                exec('baja/manchester/menu/export-track-details.js', graph)
            })
        })

        track_items.push({
            'label': 'Measure...', 'ionfunction': createIonFunction(() => {
                exec('baja/manchester/menu/measure-track.js', graph, library)
            })
        })
        track_items.push({
            'label': 'Stats...', ionfunction: createIonFunction(async () => {
                graph.setMessage("Click on a track to see stat menu for that track");
                await exec('baja/manchester/menu/track-stats.js', graph)
            })
        })

        track_items.push({
            'label': 'Show...', 'ionfunction': createIonFunction(async () => {
                exec('baja/manchester/menu/annotation/show-annotations-menu.js', graph)
            })
        })

        track_items.push({
            'label': 'Edit...', ionfunction: createIonFunction(async () => {
                graph.setMessage("Click on a track to see available edit options. ")
                await exec('baja/manchester/menu/edit-track.js', graph)
            })
        })

        track_items.push({
            'label': 'Clear All', 'ionfunction': createIonFunction(() => {
                let zoom_to = {
                    wid: 'card',
                    componentRef: 'bottomPanel',
                    data: {
                        height: '800px',
                        cards: [
                            [
                                {
                                    'title': ' ', 'body': ``
                                    ,
                                    'width': '90%',
                                    'component':
                                    {
                                        wid: 'html',
                                        data: '<font color=red> Are you sure you want to remove all compounds? </font>'
                                    }
                                },
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Yes', ionFunction: createIonFunction(() => {

                                                        graph.track = []

                                                        graph.setMessage(" All tracks removed.");
                                                        hideAllModal();
                                                    })
                                                },
                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                        hideAllModal();
                                                    })
                                                }
                                            ]
                                        }
                                    }
                                }
                            ]]
                    }
                }
                showModal(zoom_to)

            })
        })

        let exptracks = {
            'label': 'Track', 'items': track_items
        }
        let screenActions = {
            label: 'Compounds', 'items': [
                {
                    label: 'Tile...',
                    ionfunction: createIonFunction(async () => {
                        graph.setMessage('Select a point on a track')
                        exec('baja/manchester/menu/paint-oligos.js', graph)
                    })
                },
                {
                    label: 'Tile on track variants',
                    ionfunction: createIonFunction(async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if (hasSnpindel == 1) {
                                graph.setMessage('Choose variant to tile...')
                                await exec('baja/manchester/annotation/paint-oligos-snps.js', graph)
                            } else {
                                graph.setMessage('No variants found')
                            }
                        }
                    })

                },

                {
                    label: 'Draw',
                    ionfunction: createIonFunction(async () => {
                        if (!graph.props.selected_chemistry) {
                            graph.setMessage('No chemistry selected.')
                            return;
                        }
                        graph.setMessage('Select location on track')
                        exec('baja/manchester/menu/draw-oligos.js', graph)
                    })
                },
                {
                    label: 'Paste Sequences',
                    ionfunction: createIonFunction(async () => {

                        await showModal(paste_sequences_panel)

                    })
                },
                {

                    'label': 'Define synthesis sequence', 'ionfunction': createIonFunction(async () => {

                        if (graph.selectedCompounds && graph.selectedCompounds.length > 0) {
                            let seqMode = '';
                            let modify_sequence = {
                                wid: 'card',
                                data: {
                                    "style.padding-top": '10px',
                                    cards: [
                                        [
                                            {
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Cancel and return to Design', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();

                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                })
                                                            },
                                                        ]
                                                    }
                                                }
                                            },
                                            {
                                                'title': ' ', 'body': ` `,
                                                'width': '100%',
                                                'component':
                                                {
                                                    wid: 'html',
                                                    data: `
                                                     <font color="red"> NOTE: any modifications to synthesis sequence will require the re-registration </font>
                                                    <hr>
                                                    <h4>Select a sequence orientation for synthesis:</h4>
                                                    `
                                                }
                                            },
                                            {

                                                'title': ' ', 'body': ` `,
                                                'width': '100%',
                                                'component':
                                                {
                                                    wid: 'radio-buttons',
                                                    data: {
                                                        'selected': "0",
                                                        'buttons': [
                                                            {
                                                                'label': 'Target sequence', ionfunction: createIon(() => {
                                                                    seqMode = "Target sequence";
                                                                }
                                                                )
                                                            }, {
                                                                'label': 'Complement of target sequence', ionfunction: createIon(() => {
                                                                    seqMode = "Complement of target sequence";
                                                                }
                                                                ),
                                                            },
                                                            {
                                                                'label': 'Reverse complement of target sequence', ionfunction: createIon(() => {
                                                                    seqMode = "Reverse complement of target sequence";
                                                                }
                                                                )
                                                            }
                                                        ],
                                                    }
                                                }
                                            },

                                            {
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();

                                                                    await exec('baja/manchester/apply-synthesis-sequence', graph, seqMode)
                                                                    graph.setMessage("All modifications to chemistry and/or seqeunce will require structure registration.")

                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                })
                                                            },
                                                        ]
                                                    }
                                                }
                                            },

                                        ]]
                                }
                            }

                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', modify_sequence);

                        } else {
                            graph.setMessage(' No oligos are selected. ')
                        }
                    })
                },

                {
                    label: 'Move oligo (XY)',
                    ionfunction: createIonFunction(async () => {
                        graph.setMessage('Select a locus on a track')
                        exec('baja/manchester/menu/move-oligos.js', graph)
                    })
                },
                {
                    label: 'Move oligo (Y)',
                    ionfunction: createIonFunction(async () => {
                        graph.setMessage('Select a locus on a track')
                        exec('baja/manchester/menu/move-oligos-vertical.js', graph)
                    })
                },
                {
                    label: 'View oligo',
                    ionfunction: createIonFunction(async () => {
                        graph.setMessage('Select a track')
                        exec('baja/manchester/menu/find-oligos.js', graph)
                    })
                },
                {
                    label: 'Select all',
                    ionfunction: createIonFunction(async () => {

                        let total = []
                        for (let t of graph.track) {
                            for (let o of t.oligos) {
                                total.push({ 'o': o, 't': t })
                            }
                        }
                        graph.setSelectedCompounds(total)
                        graph.setMessage('Total selected: ' + total.length);
                        graph.currentShape = null;
                    })
                },
                {
                    label: 'Clear all',
                    ionfunction: createIonFunction(async () => {
                        let zoom_to = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [
                                    [
                                        {
                                            'title': ' ', 'body': ``
                                            ,
                                            'width': '90%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: '<font color=red> Are you sure you want to remove all compounds? </font>'
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Yes', ionFunction: createIonFunction(() => {

                                                                let c = 0;
                                                                for (let t of graph.track) {
                                                                    t.oligos = []
                                                                }
                                                                graph.setMessage(" Compounds removed from all tracks.");
                                                                hideAllModal();
                                                            })
                                                        },
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                hideAllModal();
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        showModal(zoom_to)

                    })
                },
                {
                    label: 'Apply compound filtering rule',
                    ionfunction: createIonFunction(async () => {
                        await exec('baja/manchester/annotation/dynamic-rule-application.js', library, folder.id, graph);
                    })
                }
            ]
        }
        let geneGraph = await graph.createComponent();
        let m = await exec('baja/manchester/modal/label-bookmark.js', graph);

        working.status = 'complete'

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 30,
                'grid': {
                    xmin: 0,
                    xmax: 40,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': [
                    {
                        x: 4, y: 0, label: 'expand up', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getymax() - graph.getymin()) / 8;
                            graph.setymax(graph.getymax() + l);
                            graph.setymin(graph.getymin() - l);

                        }), icon: '/assets/img/icons/png/contract-y.png'
                    },
                    {
                        x: 6, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getymax() - graph.getymin()) / 8;
                            graph.setymax(graph.getymax() - l);
                            graph.setymin(graph.getymin() + l);

                        }), icon: '/assets/img/icons/png/expand-y-up.png'
                    },
                    {
                        x: 8, y: 0, label: 'resize x', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            graph.zoom(graph.getxmin() - l, graph.getxmax() + l);
                        }), icon: '/assets/img/icons/png/contract-x2.png'
                    },
                    {
                        x: 10, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            graph.zoom(graph.getxmin() + l, graph.getxmax() - l);
                        }), icon: '/assets/img/icons/png/expand-x2.png'

                    },
                    {
                        x: 12, y: 0, label: 'Move options', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                        }), icon: '/assets/img/icons/png/move.png'

                    }, {
                        x: 14, y: 0, label: 'Box zoom', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMessage(" Drag a rectangle ")
                            graph.setMouseMode('none')
                            await exec('baja/manchester/menu/zoom-box.js', graph, io)
                        }), icon: '/assets/img/icons/png/nav.png'

                    },
                    {
                        x: 0, y: 0, label: 'Bookmark', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            showModal(m)
                        }), icon: '/assets/img/icons/png/bookmark.png'

                    },
                    {
                        x: 2, y: 0, label: 'Show Bookmark', ionFunction: createIonFunction(async () => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.showBookmarkMenu(true);
                        }), icon: '/assets/img/icons/png/show-bookmarks.png'

                    },
                    {
                        x: 16, y: 0, label: 'Show Tracks', ionFunction: createIonFunction(async () => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            graph.showTracksMenu();
                        }), icon: '/assets/img/icons/png/menu-bar.png'

                    },
                    {
                        x: 18, y: 0, label: 'Map Oligos', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                            graph.setMessage("Highlighting oligos")

                            let xstart = graph.graph.Xwc(0);
                            let ystart = graph.graph.Ywc(0);
                            let width = graph.graph.worldWidth(graph.graph.canvas.width)
                            let height = graph.graph.worldHeight(graph.graph.canvas.height)

                            let total = []
                            for (let t of graph.track) {
                                let twx = t.tgraph.Xwc(xstart)
                                let twxf = t.tgraph.Xwc(xstart + width)
                                oligos = t.getVisibleOligosXY(twx, twxf, ystart - height, ystart)
                                if (oligos)
                                    total = total.concat(oligos)
                            }
                            graph.highlight_features = true;

                            for (let o of total) {
                                if (o.highlight)
                                    o.highlight(10500, 'red')
                            }

                            setTimeout(() => {
                                graph.highlight_features = false;
                            }, 10500)

                        }), icon: '/assets/img/icons/png/map.png'

                    },

                ]
            }
        }
        let plates_panel;

        let updateStatsPanel = () => {
            if (graph) {
                let ht = ' '
                let index = 0;
                let sum = 0;
                if (graph && graph.track && graph.track.length > 0) {
                    for (let t of graph.track) {
                        ht += `Track${index}:  <font color="blue">${t.oligos.length}</font> <br>`
                        index++;
                        sum += t.oligos.length;
                    }
                }
                ht += ''

                let plates = Math.ceil(sum / 78)
                ht += `Plates: <font color="blue">${plates} </font>`
                if (plates_panel) {
                    plates_panel.setHTML(ht);
                }

            }
        }

        let Biopolymer = await exec('baja/chem/biopolymer.js');
        let CreateCompound = (chem_template_string, track, x, y, type_compoud) => {
            Biopolymer.createCompoundFromOligoScript(chem_template_string, track, x, y, type_compoud)
        }

        let innerComponentCallback = createIonFunction((editor) => {
            io = editor;
        })
        let submittedPanel = async (expid) => {
            return await exec('baja/manchester/my-submitted-screens-w.js', expid)
        }
        let dbFunctions = await db.loadFunctions();
        let folderPath = `/me/drive/root:/bajabio-screens/.algorithms:/`;

        let getCodePanel = async () => {
            let title = '';
            return {
                wid: 'card',

                data: {
                    cards: [
                        [

                            {
                                'width': '100%',
                                'component': {
                                    wid: 'menu',
                                    data: {
                                        menus: [
                                            {
                                                'label': 'Open', 'items': [
                                                    {
                                                        'label': 'Function', 'ionfunction': createIonFunction(() => {
                                                            let folderpath = `/drives/${library.id}/root:/bajabio-xfiles/.functions`

                                                            showModal({
                                                                wid: 'folder-browser',
                                                                data: {
                                                                    width: 800,
                                                                    height: '600px',
                                                                    path: folderpath,
                                                                    "ionfunction.folderadded": createIonFunction(async (folder) => {
                                                                        try {
                                                                            let filepath = `/drives/${library.id}/items/${currentPath.id}/children`;
                                                                            let new_exp_dir = {
                                                                                "name": `${folder.name}`,
                                                                                "folder": {
                                                                                },
                                                                                "@microsoft.graph.conflictBehavior": "fail"
                                                                            }
                                                                            let nfolder = await client.api(filepath)
                                                                                .post(new_exp_dir)
                                                                                .catch(error => {

                                                                                    let cs = JSON.stringify(error);
                                                                                    let jsonv = {
                                                                                        'wid': 'json',
                                                                                        'data': cs
                                                                                    }
                                                                                    showWidget(jsonv);
                                                                                })
                                                                        } catch (exception) {
                                                                            console.log(exception)
                                                                        }
                                                                    }),
                                                                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                                                                        alert(text)
                                                                    }
                                                                    ),
                                                                    "ionfunction.path": createIonFunction(async (path, nodes) => {
                                                                        currentPath = path;

                                                                    })
                                                                }
                                                            })
                                                        })
                                                    },
                                                    {
                                                        'label': 'Structure Template', 'ionfunction': createIonFunction(() => {
                                                            exec('baja/chem/open-structure-folder.js', library, io)
                                                        })
                                                    }, {
                                                        'label': 'Filter', 'ionfunction': createIonFunction(() => {

                                                        })
                                                    },
                                                ]
                                            },
                                            {
                                                'label': 'Save', 'items': [
                                                    {
                                                        'label': 'Structure Template', 'ionfunction': createIonFunction(() => {
                                                            let folderpath = `/drives/${library.id}/root:/bajabio-xfiles/.chem`
                                                            saveCode(folderpath);
                                                        })
                                                    }, {
                                                        'label': 'Filter', 'ionfunction': createIonFunction(() => {

                                                        })
                                                    }

                                                ],
                                            },

                                        ]
                                    }
                                }
                            }, {

                            },

                            {
                                'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `,
                                'width': '100%',
                                'height': '100%',
                                'component':
                                {
                                    wid: 'text-editor',
                                    refCallback: innerComponentCallback,
                                    height: '900px',
                                    data: {
                                        mode: 'simple',
                                        folderPath: folderPath,
                                        editorOptions: { language: 'javascript', automaticLayout: true },
                                        libs: [
                                            { 'name': 'core', 'path': 'genome/lib/core.js' },
                                            { 'name': 'sample', 'path': 'genome/sample-gff.js' }
                                        ],
                                        keybinding: {
                                            'Ctrl+Enter': createIonFunction(async (content, lineNumber, selectionLines, col) => {

                                                let ChemistryTemplateDB = await exec('baja/chem/chem-template-db.js', library.id)
                                                let chemTemplateDB = new ChemistryTemplateDB();
                                                let chem_template_list = await chemTemplateDB.load();

                                                let wrapper = [
                                                    { "name": "screen", "object": graph.props },
                                                    { "name": "graph", "object": graph },
                                                    { "name": "io", "object": io },
                                                    { 'name': 'file', 'object': file },
                                                    { 'name': 'files', 'object': files },
                                                    { 'name': 'track', 'object': tracks },
                                                    { 'name': 'add', 'object': add },
                                                    { 'name': 'zoom', 'object': zoom },

                                                    {
                                                        'name': 'logs', 'object': (sstr) => {
                                                            io.log(sstr);
                                                        }
                                                    },
                                                    { 'name': 'Biopolymer', 'object': Biopolymer },
                                                    { 'name': 'ChemistryTemplates', 'object': chem_template_list }

                                                ];
                                                let keys = Object.keys(dbFunctions);
                                                for (let functionKey of keys) {
                                                    selectionLines = selectionLines.replaceAll(functionKey + '()', dbFunctions[functionKey])

                                                }

                                                if (selectionLines != null && selectionLines.length > 0) {
                                                    execObj(selectionLines, ...wrapper)
                                                } else {
                                                    let line = content.trim();
                                                    if (content.indexOf('\n') > 0) {
                                                        let sp = content.split('\n')
                                                        line = sp[lineNumber - 1]
                                                    }
                                                    if (line != null && line.length > 0) {
                                                        execObj(selectionLines, ...wrapper)

                                                        if (line.startsWith('io.')) {

                                                        }
                                                    }
                                                }
                                            })
                                        },
                                    }
                                }
                            },
                            {
                                'title': null, 'body': `
                                            `,
                                'width': '100%',
                                'component':
                                {
                                    wid: 'button',
                                    data: [
                                        {
                                            'label': '[Exec all]', ionfunction: createIonFunction(() => {
                                                editor.exec({ "name": "graph", "object": graph }, { "name": "io", "object": io }, { 'name': 'file', 'object': file },
                                                    { 'name': 'files', 'object': files }, { 'name': 'track', 'object': tracks }, { 'name': 'add', 'object': add }, { 'name': 'zoom', 'object': zoom });
                                            }), disableAfterClick: false
                                        },
                                        {
                                            'label': '[Exec line]', ionfunction: createIonFunction(() => {
                                                editor.exec({ "name": "graph", "object": graph }, { "name": "io", "object": io }, { 'name': 'file', 'object': file },
                                                    { 'name': 'files', 'object': files }, { 'name': 'track', 'object': tracks }, { 'name': 'add', 'object': add }, { 'name': 'zoom', 'object': zoom });
                                            }), disableAfterClick: false
                                        }
                                    ]
                                }
                            }
                        ]]
                }
            }
        }
        let select_display = createIonFunction((ref) => {
            select_display_html = ref;
        })

        let molecule_type_html_render = await exec('baja/manchester/render-moltype.js')

        let display = {
            wid: 'html',
            refCallback: select_display,
            data: {
                ionFunction: createIonFunction(() => {
                    return ` Selected chemistry template: ` +
                        molecule_type_html_render(graph.props.selected_chemistry)
                })
            }
        }

        let selectMethod = async (v) => {

            graph.props.selected_chemistry = v;

        }
        let myChem = await exec('baja/chem/my-chem-w.js', lib_id, selectMethod, graph.props)

        let buttonMenuPanel = {
            wid: 'card',
            componentRef: 'buttonMenuPanel',
            data: {
                cards: [
                    [
                        {
                            'title': '',
                            'component': button_canvas
                        },
                    ]]
            }
        }

        let showSaveScreen = async () => {

            let t2 = await exec('baja/manchester/my-saved-screens-w.js', library.id, folder.id, graph, 'save', genegraph_panel_layout)

            if (readonly)
                t2 = await exec('baja/manchester/my-libraries', graph, 'save', genegraph_panel_layout)

            let save_tab = {
                wid: 'card',
                data: {
                    "style.padding-top": '10px',
                    cards: [
                        [
                            {
                                'width': '100%',
                                'component': t2
                            }
                        ]]
                }
            }

            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', save_tab);
        }

        let tools_menu = []
        tools_menu.push({
            'label': 'Navigation', 'ionfunction': createIonFunction(async () => {
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
            })
        })

        let available_tools = `/drives/${library.id}/root:/bajabio-xfiles/.config/.ui/Tools`
        try {
            let filepath = `/drives/${library.id}/items/${folder.id}:/gene-graph.xlsx`;
            let fileobj = await client.api(filepath).get();
            let objectid = fileobj.id
            let sheet_path = `/drives/${library.id}/items/${objectid}/workbook/worksheets/Tools`;
            let sheetObject = await client.api(sheet_path).get();
            if (sheetObject != null) {
                let sheet_id = sheetObject['id']
                let res = await client.api(`/drives/${library.id}/items/${objectid}/workbook/worksheets/${sheet_id}/range(address='A1:B10')`).get();

                let res_values = res['values']
                for (let r of res_values) {
                    if (r[0] && r[0].length > 0) {
                        let tre = {
                            'label': r[0], 'ionfunction': createIonFunction(async () => {
                                let hl = await exec(r[1], graph)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        }
                        tools_menu.push(tre)
                    }
                }
            }
        } catch (exception) {
            console.log(" exception " + exception);

            if (me) {

                if (me.userPrincipalName.endsWith('lajollalabs.com')) {
                    tools_menu = [
                        {
                            'label': 'VCF/BED/Bigwig', 'ionfunction': createIonFunction(async () => {

                                let hl = await exec('baja/manchester/menu/data-tools.js', graph)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        },
                        {
                            'label': 'Navigation', 'ionfunction': createIonFunction(async () => {
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                            })
                        },

                        {
                            'label': 'Variants', 'ionfunction': createIonFunction(async () => {

                                let hl = await exec('baja/manchester/menu/variant-tools.js', graph)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        },

                        {
                            'label': 'Highlight', 'ionfunction': createIonFunction(async () => {
                                await exec(`baja/manchester/search/find-in-visible-screen.js`, graph)
                            })
                        },
                        {
                            'label': 'Off-targets', 'ionfunction': createIonFunction(async () => {
                                let genomes = await exec('baja/chem/structure/off-target-config.js', lib_id)
                                let off_targets = {
                                    wid: 'button-canvas',
                                    data: {
                                        'title': 'controls',
                                        'height': 24,
                                        'grid': {
                                            xmin: 0,
                                            xmax: 2,
                                            ymin: -0.01,
                                            ymax: 1,
                                            xinset: 0,
                                            yinset: 0
                                        },
                                        'buttons': [
                                            {
                                                x: 0, y: 0, label: 'Selected Compounds', ionFunction: createIonFunction(async () => {
                                                    graph.setMessage('Select a compound to run off-target ')
                                                    await exec('baja/manchester/menu/select-compound-for-offtarget.js', library.id, graph, showMainScreen, genomes)
                                                })
                                            },
                                            {
                                                x: 1, y: 0, label: 'Selected Track', ionFunction: createIonFunction(() => {
                                                })
                                            }
                                        ]
                                    }
                                }

                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', off_targets);
                            })
                        },

                        {
                            'label': 'Assay design', 'ionfunction': createIonFunction(async () => {

                                let hl = await exec('baja/manchester/menu/assay-tools.js', graph)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        },
                        {
                            'label': 'Primer-probes', 'ionfunction': createIonFunction(async () => {
                                let hl = await exec('baja/manchester/menu/primer-probe-menu.js', graph)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        },
                        {
                            'label': 'Comparative Genomics', 'ionfunction': createIonFunction(async () => {

                                let hl = await exec('baja/manchester/menu/comparative-tools.js', graph)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        },
                        {
                            'label': 'Secondary Structure', 'ionfunction': createIonFunction(async () => {

                                let hl = await exec('baja/manchester/menu/secondary-structure-tools.js', graph)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        },

                        {
                            'label': 'Annotation ', 'ionfunction': createIonFunction(async () => {
                                let hl = await exec('baja/manchester/menu/annotation-tools.js', graph, library.id, folder.id)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        },
                        {
                            'label': 'Targets', 'ionfunction': createIonFunction(async () => {

                                let hl = await exec('baja/manchester/menu/target-tools.js', graph, library, folder, genegraph_panel_layout)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        },

                        {
                            'label': 'Splicing', 'ionfunction': createIonFunction(async () => {

                                let hl = await exec('baja/manchester/menu/splicing/splicing-tools.js', graph, library, folder)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);

                            })
                        },

                    ]

                } else {

                    tools_menu = [

                        {
                            'label': 'Navigation', 'ionfunction': createIonFunction(async () => {
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                            })
                        },

                        {
                            'label': 'Variants', 'ionfunction': createIonFunction(async () => {

                                let hl = await exec('baja/manchester/menu/variant-tools.js', graph)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        },

                        {
                            'label': 'Highlight', 'ionfunction': createIonFunction(async () => {
                                await exec(`baja/manchester/search/find-in-visible-screen.js`, graph)
                            })
                        },

                        {
                            'label': 'Splicing', 'ionfunction': createIonFunction(async () => {
                                let hl = await exec('baja/manchester/menu/splicing/splicing-tools.js', graph, library, folder)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);

                            })
                        },

                        {
                            'label': 'Off-targets', 'ionfunction': createIonFunction(async () => {
                                let genomes = await exec('baja/chem/structure/off-target-config.js', lib_id)
                                let off_targets = {
                                    wid: 'button-canvas',
                                    data: {
                                        'title': 'controls',
                                        'height': 24,
                                        'grid': {
                                            xmin: 0,
                                            xmax: 2,
                                            ymin: -0.01,
                                            ymax: 1,
                                            xinset: 0,
                                            yinset: 0
                                        },
                                        'buttons': [
                                            {
                                                x: 0, y: 0, label: 'Selected Compounds', ionFunction: createIonFunction(async () => {
                                                    graph.setMessage('Select a compound to run off-target ')
                                                    await exec('baja/manchester/menu/select-compound-for-offtarget.js', library.id, graph, showMainScreen, genomes)
                                                })
                                            },
                                            {
                                                x: 1, y: 0, label: 'Selected Track', ionFunction: createIonFunction(() => {
                                                })
                                            }
                                        ]
                                    }
                                }

                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', off_targets);
                            })
                        },
                        {
                            'label': 'Targets', 'ionfunction': createIonFunction(async () => {

                                let hl = await exec('baja/manchester/menu/target-tools.js', graph, library, folder, genegraph_panel_layout)
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                            })
                        },

                    ]

                }

            }
        }

        let synthesis_menu = [
            {

                'label': 'Export IDT', 'ionfunction': createIonFunction(async () => {
                    let idt = await exec('baja/chem/structure/idt/idt-format.js');
                    let explist = []

                    for (let t of graph.track) {
                        let row = 0;
                        let __index = 0;
                        for (let o of t.oligos) {
                            if (__index > 12) {
                                __index = 0;
                            }
                            let well = String.fromCharCode(65 + 8 - __index) + '' + row

                            if (o && o.structure && o.id)
                                explist.push({
                                    'well': well,
                                    'id': o.id,
                                    'idt': idt.format(o.structure)
                                })
                        }
                    }
                    if (explist === null || explist.length <= 0) {
                        showModal({
                            wid: 'title',
                            data: '<h2> No oligos to export </h2>'
                        })
                        return;
                    }

                    downloadAsCsv(explist, 'idt.csv')

                })

            },
            {

                'label': 'Export IDT Plate Manifest', 'ionfunction': createIonFunction(async () => {
                    let hlist = []

                    let trackName = '';
                    for (let t of graph.track) {
                        trackName += t.name + '__';
                        for (let o of t.oligos) {
                            hlist.push(o)
                        }
                    }
                    let idt = await exec('baja/compound-registration/reg-db.js',
                        library.id, hlist, graph);

                    downloadAsCsv(idt, trackName + '_idt.csv')
                })

            }

        ]

        if (me.userPrincipalName.endsWith('lajollalabs.com') || me.userPrincipalName.endsWith('nlorem.org') || me.userPrincipalName.includes('nlorem.org')) {
            synthesis_menu.push({
                'label': 'Export Ionis', 'ionfunction': createIonFunction(async () => {
                    let idt = await exec('baja/chem/structure/idt/idt-format.js');
                    let hlist = []

                    let explist = []

                    for (let t of graph.track) {
                        for (let o of t.oligos) {

                            if (o && o.structure && o.id)
                                explist.push({
                                    'id': o.id,
                                    'sequence': o.synthesisSequence,

                                    'idt': await idt.formatUsingIONISCODES(o.structure)
                                })
                        }
                    }
                    await exec('baja/util/copy-template.js', library.id, 'oligo-synthesis.xlsx', folder.id);
                    await exec('lib/msgraph.js').then(async (MSGraph) => {
                        let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
                        let client = await MSGraph.getClient(sharepointConfig);
                        let library_id = `/drives/${library.id}/items/${folder.id}/children`;
                        let res = await client.api(library_id).get();
                        let res_values = res['value']

                        for (let r of res_values) {
                            if (r['name'] === 'oligo-synthesis.xlsx') {

                                let _values = explist.map((o) => [o.id, o.sequence, o.idt])
                                let workbookRange = { values: _values };

                                let oligon = _values.length + 1;

                                let filepath = `/drives/${library.id}/items/${r['id']}/workbook/worksheets/Sheet1/range(address='A2:C${oligon}')`;
                                await client.api(filepath).update(workbookRange);
                            }
                        }
                    });

                })
            })

        }

        let toolbar_menus = {

            'width': '100%',
            'component': {
                wid: 'menu',
                data: {
                    menus: [

                        {
                            'label': 'File', 'items': [
                                {
                                    'label': 'My Files', 'ionfunction': createIonFunction(async () => {
                                        await exec('manchester/fb.js');
                                    })
                                },
                                {
                                    'label': 'Open', 'ionfunction': createIonFunction(showSavedScreens)
                                },
                                {
                                    'label': 'Save', 'ionfunction': createIonFunction(showSaveScreen)
                                },
                                {
                                    'label': 'Bookmarks', 'ionfunction': createIonFunction(async () => {
                                        graph.showBookmarkMenu();
                                    })
                                }, {
                                    'label': 'Bookmarks to slideshow', 'ionfunction': createIonFunction(async () => {

                                        let m = await exec('baja/manchester/modal/slide-show-path-text.js', graph, genegraph_panel_layout);
                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', m);
                                    })
                                },
                            ]
                        },
                        {
                            label: 'Library',
                            items: [

                                {
                                    label: 'Browse library',
                                    ionfunction: createIonFunction(async () => {


                                        let path_j = '.'
                                        let userFiles_panel;
                                        let userFilesRef = createIonFunction((panel) => {
                                            userFiles_panel = panel;
                                        })
                                        let commands = await exec('manchester/controls/cmds')

                                        let userfiles = {
                                            wid: 'simple-file-browser',
                                            width: '100%',
                                            height: '100%',
                                            refCallback: userFilesRef,
                                            data: {
                                                width: '100%',
                                                drive: 'wd',
                                                user: getUser(),
                                                root: 'library',
                                                columns: 3,
                                                showSearch: true,
                                                "ionfunction.cmd": createIonFunction((element) => {
                                                    commands.go(path_j, element.cmd);
                                                }),
                                                "ionfunction.fileClick": createIonFunction(async (element) => {
                                                    path_j = element.path;

                                                    let host_ = window['env']['apiUrl']
                                                    const user = getUser();
                                                    const key = 'library';

                                                    const pdfUrl =
                                                        `${host_}/load-pdf` +
                                                        `?path=${encodeURIComponent(element.path)}` +
                                                        `&key=${encodeURIComponent(key)}` +
                                                        `&user=${encodeURIComponent(user)}`;

                                                    window.open(pdfUrl, "_blank", "noopener,noreferrer");
                                                }),
                                                "ionfunction.openfile": createIonFunction(async (file, text) => {

                                                }
                                                ),
                                                "ionfunction.path": createIonFunction(async (path) => {
                                                    path_j = path;
                                                })
                                            }
                                        }
                                        const tu = {
                                            wid: 'card',
                                            height: '100%',
                                            width: '100%',
                                            data: {
                                                cards: [
                                                    [
                                                        {
                                                            'component': userfiles,
                                                            'width': '100%'
                                                        }
                                                    ]
                                                ]
                                            }

                                        };


                                        clear();
                                        showWidget(tu);
                                    })
                                },
                                {
                                    'label': 'Upload', 'ionfunction': createIonFunction(async () => {
                                        let menu = await exec('ljl/ml/upload-large-file.js', graph, genegraph_panel_layout);
                                        graph.showWindowMenu(menu, 10, 10, 400)
                                    })
                                },
                                {
                                    label: 'Delete file',
                                    ionfunction: createIonFunction(() => {
                                        mode = 'delete'

                                    })
                                },
                            ]
                        },
                        {
                            'label': 'Layers', 'items': [
                                {
                                    'label': 'Clear All', 'ionfunction': createIonFunction(() => {

                                        graph.layers = [];

                                    })
                                },
                            ]
                        },
                        exptracks,
                        {
                            'label': 'Tools', 'icon': 'more_vert', 'items': tools_menu
                        },
                        {
                            'label': 'Select', 'items': [
                                await exec('baja/manchester/menu/select-structure.js', library.id, graph, showMainScreen),
                                await exec('baja/manchester/menu/select-structures.js', library.id, graph, showMainScreen),
                                await exec('baja/manchester/menu/select-gene.js', graph, io),
                                await exec('baja/manchester/menu/select-track.js', graph, io),
                                await exec('baja/manchester/menu/select-tracks.js', library.id, graph, button_canvas),
                                await exec('baja/manchester/menu/select-annotation.js', graph, io),
                                await exec('baja/manchester/menu/track-reference.js', graph),
                                await exec('baja/manchester/menu/sequence.js', graph, io)
                            ],
                        },

                        screenActions,
                        {
                            'label': 'Chemistry', 'items': [

                                {
                                    'label': 'Select Library Templates', 'ionfunction': createIonFunction(async () => {

                                        let chemistry_tab = {
                                            wid: 'card',
                                            data: {
                                                "style.padding-top": '10px',
                                                cards: [
                                                    [
                                                        {
                                                            'width': '100%',
                                                            'component': display
                                                        },
                                                        {
                                                            'width': '100%',
                                                            'component': myChem
                                                        },
                                                        {
                                                            'title': '',
                                                            'width': '100%',
                                                            'component': {
                                                                wid: 'mt-button', data: {
                                                                    buttons: [
                                                                        {
                                                                            label: 'Close', ionFunction: createIonFunction(() => {

                                                                                hideAllModal();
                                                                            })
                                                                        }
                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    ]]
                                            }
                                        }
                                        showModal(chemistry_tab, 600, 300)

                                    })
                                },
                                {
                                    'label': 'Structure for selected compounds', 'ionfunction': createIonFunction(async () => {
                                        let chemistry_tab = {
                                            wid: 'card',
                                            data: {
                                                "style.padding-top": '10px',
                                                cards: [
                                                    [
                                                        {
                                                            'width': '100%',
                                                            'component': display
                                                        },
                                                        {
                                                            'width': '100%',
                                                            'component': myChem
                                                        },
                                                        {
                                                            'title': '',
                                                            'width': '100%',
                                                            'component': {
                                                                wid: 'mt-button', data: {
                                                                    buttons: [
                                                                        {
                                                                            label: 'Close', ionFunction: createIonFunction(() => {

                                                                                hideAllModal();
                                                                            })
                                                                        },
                                                                        {
                                                                            label: 'Apply', ionFunction: createIonFunction(() => {
                                                                                let st = []

                                                                                let selected_chemistry = graph.props.selected_chemistry;
                                                                                if (selected_chemistry) {
                                                                                    for (let s of graph.selectedCompounds) {
                                                                                        let __oligo = s['o']
                                                                                        let __oligo_track = s['t']
                                                                                        let structure = Biopolymer.generateStructure(selected_chemistry,
                                                                                            __oligo, __oligo_track);

                                                                                        st.push({ 'o': __oligo.structure, 'n': structure })
                                                                                        __oligo.structure = structure;
                                                                                    }
                                                                                }
                                                                                hideAllModal();
                                                                            })
                                                                        }

                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    ]]
                                            }
                                        }
                                        showModal(chemistry_tab, 600, 400)

                                    })
                                }

                            ]
                        },

                        {
                            'label': 'Registration', 'items': [

                                {
                                    'label': 'Register All Compounds', 'ionfunction': createIonFunction(async () => {

                                        let gwcxs = graph.graph.Xwc(0);
                                        let ymax = graph.graph.Ywc(0);
                                        let ymin = graph.graph.Ywc(graph.graph.grid.height);

                                        if (!gwcxs)
                                            return;
                                        let gwcxf = graph.graph.Xwc(0 + graph.graph.grid.width);
                                        if (!gwcxf)
                                            return;
                                        let o = []
                                        for (let t of graph.track) {
                                            let twcxs = t.tgraph.Xwc(gwcxs - 2 * t.tgraph.xi);
                                            let twcxf = t.tgraph.Xwc(gwcxf - 2 * t.tgraph.xi);

                                            let vo = t.oligos;

                                            o = o.concat(vo)
                                        }

                                        let chemistry_tab = {
                                            wid: 'card',
                                            data: {
                                                "style.padding-top": '10px',
                                                cards: [
                                                    [
                                                        {
                                                            'width': '100%',
                                                            'component': {
                                                                wid: 'html',
                                                                data: `  Register ${o.length} compounds?`
                                                            }
                                                        },
                                                        {
                                                            'title': '',
                                                            'width': '100%',
                                                            'component': {
                                                                wid: 'mt-button', data: {
                                                                    buttons: [
                                                                        {
                                                                            label: 'Cancel', ionFunction: createIonFunction(() => {

                                                                                hideAllModal();
                                                                            })
                                                                        },
                                                                        {
                                                                            label: 'Register', ionFunction: createIonFunction(async () => {
                                                                                hideAllModal();
                                                                                await exec('baja/compound-registration/simple-reg.js', library.id, o, graph)
                                                                            })
                                                                        },
                                                                        {
                                                                            label: 'Force Registration', ionFunction: createIonFunction(async () => {
                                                                                hideAllModal();
                                                                                await exec('baja/compound-registration/force-reg.js', library.id, o, graph)
                                                                            })
                                                                        }
                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    ]]
                                            }
                                        }
                                        showModal(chemistry_tab, 600, 500)

                                    })
                                },

                                {
                                    'label': 'Reset compounds', 'ionfunction': createIonFunction(async () => {
                                        let gwcxs = graph.graph.Xwc(0);
                                        if (!gwcxs)
                                            return;
                                        let gwcxf = graph.graph.Xwc(0 + graph.graph.grid.width);
                                        if (!gwcxf)
                                            return;
                                        for (let t of graph.track) {
                                            for (let vo of t.oligos) {
                                                vo.id = null;
                                                vo.libID = null;
                                            }
                                        }
                                        graph.setMessage('ID reset for structures')
                                    })
                                }

                            ]
                        },
                        {
                            'label': 'Synthesis', 'items': synthesis_menu
                        },

                        {
                            'label': 'Draw', 'items': [
                                await exec('baja/manchester/menu/draw-oval.js', graph, io),
                                await exec('baja/manchester/menu/draw-rect.js', graph, io),
                                await exec('baja/manchester/menu/text-box.js', graph, io),
                                await exec('baja/manchester/menu/draw-line.js', graph, io),
                                await exec('baja/manchester/menu/draw-citation.js', graph, io),
                                await exec('baja/manchester/menu/edit-citation.js', graph),

                                {
                                    'label': 'Remove Drawing', 'ionfunction': createIonFunction(async () => {
                                        exec('baja/manchester/editor/remove-items.js', graph)
                                    })
                                },
                                {
                                    'label': 'Copy items in current view', 'ionfunction': createIonFunction(async () => {
                                        exec('baja/manchester/menu/copy-all-objects-in-view.js', graph)
                                    })
                                },
                                await exec('baja/manchester/menu/highlight-features.js', library.id, graph, io),
                                {
                                    'label': 'Edit Drawing ', 'ionfunction': createIonFunction(async () => {
                                        await exec('baja/manchester/menu/edit-drawing.js', graph);
                                    })
                                },

                            ],
                        },

                        {
                            'label': 'Navigate', 'items': [

                                {
                                    'label': 'Drag Navigate', 'ionfunction': createIonFunction(() => {
                                        graph.clearMouseListeners();

                                        graph.setMouseMode('navigate')
                                    })
                                },
                                {
                                    'label': 'ZoomX', 'ionfunction': createIonFunction(() => {
                                        let start = 0;
                                        graph.select();
                                        graph.clearMouseListeners();
                                        graph.addMouseDownListener((x, y) => {
                                            start = x;
                                        })
                                        graph.addMouseUpListener((x, y) => {
                                            if (start < x)
                                                graph.zoomToSelection();
                                        })
                                    })
                                },
                                {
                                    'label': 'ZoomXY', 'ionfunction': createIonFunction(async () => {
                                        await exec('baja/manchester/menu/zoom-box.js', graph, io)
                                    })
                                },
                                {
                                    'label': 'Reset view', 'ionfunction': createIonFunction(() => {
                                        graph.resetView();

                                    })
                                },
                                {
                                    'label': 'Go to track coordinate', 'ionfunction': createIonFunction(async () => {
                                        graph.setMessage(" Click on the track you want to navigate.")
                                        console.log(" navigate ")
                                        await exec('baja/manchester/menu/navigate-track.js', graph)
                                    })
                                },
                                {
                                    'label': 'Track Navigation Tools', 'ionfunction': createIonFunction(async () => {
                                        let script_canvas = await exec('baja/manchester/menu/annotation-navigation-tools.js', graph)
                                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                        CurrentLayout.setComponent('buttonMenuPanel', script_canvas);
                                    })
                                },

                                {
                                    label: 'Show Bookmark', ionfunction: createIonFunction(async () => {
                                        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                        graph.showBookmarkMenu();
                                    })
                                },

                            ],
                        },

                    ],
                    // Until a sequence track is on the canvas, block every top-level menu
                    // except File and Track; highlight the Track menu in sunset orange to
                    // point the user at how to load one.
                    // "empty canvas" = no track that actually carries a sequence (track
                    // objects without a loaded sequence don't count).
                    guard: createIonFunction(() => {
                        let tr = graph.track || [];
                        for (let t of tr) { if (t && t.sequence && ('' + t.sequence).length > 0) return false; }
                        return true;
                    }),
                    guardAllow: ['File', 'Track', 'Library'],
                    guardHighlight: ['Track'],
                    onBlocked: createIonFunction(() => {
                        // Prominent warning popup + status-bar message.
                        try { infoPrompt(' ⚠  Load a sequence track first — use the Track menu to add one. '); } catch (e) { }
                        try { graph.setMessage(' You must first load a sequence track — use the Track menu. '); } catch (e) { }
                    })
                }
            }

        }

        const width = window.innerWidth || document.documentElement.clientWidth ||
            document.body.clientWidth;
        const height = window.innerHeight || document.documentElement.clientHeight ||
            document.body.clientHeight;

        let file_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 12,
                'grid': {
                    xmin: 0,
                    xmax: 50,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': [
                    {
                        x: 0, y: 0, label: 'File test ', ionFunction: createIonFunction(() => {
                        }), icon: 'assets/img/icons/png/caret-left-2x.png'
                    },
                    {
                        x: 1, y: 0, label: 'File test ', ionFunction: createIonFunction(() => {
                        }), icon: 'assets/img/icons/png/caret-left-2x.png'
                    },
                    {
                        x: 2, y: 0, label: 'File test ', ionFunction: createIonFunction(() => {
                        }), icon: 'assets/img/icons/png/caret-left-2x.png'
                    },
                    {
                        x: 3, y: 0, label: 'File test ', ionFunction: createIonFunction(() => {
                        }), icon: 'assets/img/icons/png/caret-left-2x.png'
                    },

                ]
            }
        }

        genegraph_panel_layout = {
            wid: 'card',
            height: '100%',

            componentRef: 'geneGraphPanel',
            data: {
                cards: [
                    [
                        toolbar_menus,
                        {
                            'component': geneGraph
                        },

                    ],
                    [
                        {
                            'width': '100%',
                            'component': button_canvas
                        }

                    ],
                    [
                        {
                            'width': '100%',
                            'component': file_canvas
                        }

                    ]

                ]
            }

        }

        let main_layout = {
            wid: 'card',
            componentRef: 'mainPanel',
            data: {
                cards: [
                    [

                        {
                            'component': genegraph_panel_layout
                        },

                    ]
                    ,
                    [

                    ]

                ]
            }
        }

        await showWidget(
            main_layout
        );

        working.status = 'complete'

    })

}
