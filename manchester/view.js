function (path, config) {

    showWidget({
        wid: 'html',
        data: '<hr> Loading... '
    }).then(async working => {
        let progressBar;
        let w = {
            wid: 'progress',
            componentRef: 'progressBar',
            data: {
                'progress': 1,
                'progressBar': createIonFunction((progessBar) => {
                    progressBar = progessBar;
                })
            }
        }
        await showWidget(w)
        progressBar(0);
        path = decodeURIComponent(path)
        let obs = path;
        if (config != null && config.user != null) {

            let parts = path.split('/');

            if (parts[0] === '') {

                parts[1] = 'myfiles';
            } else {

                parts[0] = 'myfiles';
            }
            obs = parts.join('/');
        }

        mouseMode = 'structures'
        exec('flexigraph/gene.js', progressBar).then(async (graph) => {
            let io;
            let tracks;
            let genegraph_panel_layout;

            if (path.endsWith('.baja')) {
                let host_ = window['env']['apiUrl']
                let index = path.lastIndexOf('/')
                if ((config != null && config.user != null) || path.startsWith('/myfiles/')) {
                    let rs = await GETJSON(host_ + '/load-file?path=' + path + "&key=user&user=" + getUser());

                    progressBar(45)
                    let p = decodeURIComponent(path).substring(index + 1)
                    log('Loading ' + p);
                    graph.update(rs);
                } else {

                    let rs = await GETJSON(host_ + '/load-file?path=' + path + '&user=public');

                    progressBar(45)
                    let p = decodeURIComponent(path).substring(index + 1)
                    log('Loading ' + p);
                    graph.update(rs);
                }
            }
            showMainScreen = async () => {
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            }
            let Icon = await exec('flexigraph/shapes/icon.js')

            graph.folder = path;
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

                        if (loaded && img && pasteObjectMode)
                            graph.drawImage(img, x, y, graph.worldWidth(img.width), graph.worldHeight(img.height));

                    })
                    graph.addMouseUpListener(async (x, y) => {

                        if (loaded && pasteObjectMode) {
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

            let geneGraph = await graph.createComponent();
            let button_canvas = await exec('manchester/controls/navigation-panel-view.js', graph)
            let plates_panel;
            let platePanel = createIonFunction((p) => {
                updateStatsPanel();
                plates_panel = p;
            })

            progressBar(50);

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

            progressBar(55);

            let selectMethod = async (v) => {
                graph.props.selected_chemistry = v;
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            }

            let myChem = await exec('baja/chem/my-chem-htsbio-w.js', selectMethod)

            let buttonMenuPanel = {
                wid: 'card',
                height: 100,
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

            progressBar(60);

            let showPastScreen = async () => {
                let ppanel;
                let nb = createIonFunction((_pan) => {
                    ppanel = _pan;
                });
                let modify_sequence = {
                    wid: 'card',
                    data: {
                        "style.padding-top": '10px',
                        cards: [
                            [

                                {
                                    'title': ' ', 'body': ` `,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'json',
                                        refCallback: nb,

                                        data: ''
                                    }
                                },
                                {
                                    'title': ' ', 'body': ` `,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'mt-button',
                                        data: {
                                            'buttons': [
                                                {
                                                    'label': 'Import', ionFunction: createIon(() => {
                                                        let data = ppanel.getData()
                                                        data = JSON.parse(data);
                                                        graph.update(data);
                                                        hideAllModal();

                                                    }
                                                    )
                                                }, {
                                                    'label': 'Cancel', ionFunction: createIon(() => {

                                                        hideAllModal();

                                                    }),
                                                },
                                            ],
                                        }
                                    }
                                },

                            ]]
                    }
                }
                showModal(modify_sequence, 800, 600);
            }

            let publishSaveScreen = async () => {
                let savedScreens = await exec('manchester/io/publish.js', graph, genegraph_panel_layout)
                showModal(savedScreens);
            }
            let saveSaveScreen = async () => {
                let savedScreens = await exec('manchester/io/save-obj.js', graph, genegraph_panel_layout)
                showModal(savedScreens);
            }
            let openSaveScreen = async () => {
                let savedScreens = await exec('manchester/io/open-obj.js', graph, genegraph_panel_layout)
                showModal(savedScreens);
            }

            let tools_menu = []
            tools_menu = [
                {
                    'label': 'Navigation', 'ionfunction': createIonFunction(async () => {
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                    })
                },
                {
                    'label': 'Draw', 'ionfunction': createIonFunction(async () => {

                        let hl = await exec('baja/manchester/menu/draw-editor.js', graph, genegraph_panel_layout)
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', hl);
                    })
                },
                {
                    'label': 'Layers', 'ionfunction': createIonFunction(async () => {
                        graph.setMessage(" Select a track to edit layers.")
                        let hl = await exec('baja/manchester/menu/select-track-action-layers.js', graph, genegraph_panel_layout);

                    })
                },
                {
                    'label': 'Plots', 'ionfunction': createIonFunction(async () => {
                        let hl = await exec('baja/manchester/menu/plot-editor.js', graph, genegraph_panel_layout)
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', hl);
                    })
                },
            ]
            progressBar(80);

            let data_menu = []
            let data_items = window['env']['data']
            for (let d of data_items) {
                data_menu.push({
                    'label': d.label, 'ionfunction': createIonFunction(async () => {
                        graph.clearMouseListeners();
                        graph.setMouseMode('navigate')
                        await exec(d.script, d.data, d.server, graph, genegraph_panel_layout)
                    })
                })
            }

            genegraph_panel_layout = {
                wid: 'card',
                componentRef: 'geneGraphPanel',
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
                                                label: 'Bookmarks',
                                                items: [
                                                    {
                                                        label: 'Show Bookmarks', ionfunction: createIonFunction(async () => {
                                                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                            graph.showBookmarkMenu();
                                                        })
                                                    }, {
                                                        label: 'Create Bookmark', ionfunction: createIonFunction(async () => {
                                                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                            let m = await exec('baja/manchester/modal/label-bookmark.js', graph);
                                                            showModal(m);
                                                            graph.setMouseMode('navigate')

                                                            graph.showBookmarkMenu();
                                                        })
                                                    },
                                                ]
                                            },
                                            {
                                                'label': 'Data', 'items': data_menu
                                            }

                                        ]
                                    }
                                }
                            },
                            {
                                'width': '100%',
                                'component': buttonMenuPanel
                            },
                            {
                                'width': '100%',
                                'component': geneGraph
                            }

                        ]]
                }
            }
            progressBar(100);
            graph.genegraph_panel_layout = genegraph_panel_layout;

            let main_layout = {
                wid: 'card',
                height: '100%',
                componentRef: 'mainPanel',
                data: {
                    cards: [
                        [

                            {
                                'width': '100%',
                                'height': '100%',
                                'component': genegraph_panel_layout
                            }
                        ]]
                }
            }
            clear();
            showWidget(
                main_layout
            );
            working.status = 'complete'
            setTimeout(() => {

                if (bookmark) {

                    graph.loadBookmark(bookmark);
                }

            }, 3000)

        })
    })

}
