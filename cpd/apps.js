function (path, config) {
    if (!config) {
        config = {
            mode: "editor"
        }
    }
    config.mode = 'editor'
    config.app = 'Generate'

    const EditorState = class EditorState {
        paste_to_graph = true;
    }
    let eeditor_state = new EditorState();

    let htmlP;

    let user = getUser();
    if (!user || user.length <= 0) {
        if (path != null && path.length > 0) {
            let t = decodeURIComponent(path)

            const emailPattern = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
            const match = t.match(emailPattern);
            if (match && match[0] != null) {
                pathuser = match[0]
            }
        } else
            return exec('baja/nogo.js', path, 'bajabio-project')
    }

    showWidget({
        wid: 'html',
        data: '<hr>  '
    }).then(async working => {

        console.log(" HML ")
        let HM = await exec('baja/history/HM')
        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let PlateTrack = await exec('baja/plate/plate-track.js')
        let MGrid = await exec('flexigraph/grid.js')

        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')

        console.log(" step ")

        let current_mousex
        let current_mousey
        let tracks = []
        let mouseMoveListener;
        let mouseUpListener;
        let mouseDownListener;

        let draw;
        let currentShape = {
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            visible: false
        };

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

        clear();
        await showWidget(w)

        progressBar(0);
        path = decodeURIComponent(path)
        let obs = path;
        path = path.trim();
        if (config != null && config.user != null) {
            let parts = path.split('/');
            if (parts[0] === '') {
                parts[1] = '' + getUser();
            } else {
                parts[0] = getUser();
            }
            obs = parts.join('/');

        }
        mouseMode = 'structures'
        let PlateManager = class PlateManager {
            plateTrack;
            selectedPanel;
            selectedPoint;
            app;
            constructor() {
                this.plateTrack = new PlateTrack(path);

                this.plateTrack.init();
                this.setPlateTrack(this.plateTrack)
            }
            getPlateTrack() {
                return this.plateTrack;
            }
            updateEvents() {
                let e = LJScript.getEvents();
                if (e && e.length > 1 && htmlP) {
                    htmlP.setHTML(` <font color="blue">${e[e.length - 1]}</font>`)
                }
            }
            setPlateTrack(plateTrack) {
                this.plateTrack = plateTrack;

                this.plateTrack.addSelectionListener(async (sel) => {

                    if (!sel) {
                        this.selectedPanel = null;
                        setTimeout(async () => {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, sel)
                            CurrentLayout.setComponent('selectedPanel', button_canvas2)

                        }, 200);

                    }
                    else if (this.selectedPanel === sel) {
                        let comp = CurrentLayout.getComponent('selectedPanel')
                        if (comp && comp.components && comp.components[0]) {
                            if (comp.components[0].card_items_list) {
                                this.selectedPanel = sel;

                                if (config.mode === 'viewer') {
                                    let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2-viewer.js', pm, sel)
                                    CurrentLayout.setComponent('selectedPanel', button_canvas2)
                                } else {
                                    let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, sel)
                                    CurrentLayout.setComponent('selectedPanel', button_canvas2)
                                }
                            }
                        }

                    }
                    else {
                        this.selectedPanel = sel;
                        if (config.mode === 'viewer') {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2-viewer.js', pm, sel)
                            CurrentLayout.setComponent('selectedPanel', button_canvas2)
                        } else {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, sel)
                            CurrentLayout.setComponent('selectedPanel', button_canvas2)
                        }
                        if (sel) {
                            if (sel.name) {
                                pm.plateTrack.setMessage(`  ${sel.name} menu...`, 8)
                            } else if (sel.shape) {
                                pm.plateTrack.setMessage(`  ${sel.shape.type} menu...`, 8)
                            }
                        }

                    }
                })
                this.plateTrack.addPointListener(async (sel) => {
                    if (sel && Array.isArray(sel)) {
                        let m = await this.plateTrack.selectedPlate.getContextMenuItems(this.plateTrack);
                        let sp = []
                        for (let s of sel) {
                            sp.push(
                                {
                                    label: `${s.name}`,
                                    click: async (scx, scy) => {
                                        this.selectedPoint = s;
                                        const point = s;
                                        const pt = this.plateTrack;
                                        let screen_ptheight = pt.grid.worldHeight(pt.grid.height);
                                        let screen_ptwidth = pt.grid.worldWidth(pt.grid.width);
                                        let screen_x = pt.grid.Xwc(this.plateTrack.selectedPlate.grid.X(point.x));
                                        let screen_y = pt.grid.Ywc(this.plateTrack.selectedPlate.grid.Y(0));
                                        let small_width = screen_ptwidth;
                                        let small_height = screen_ptheight;

                                        if (point.startX) {
                                            screen_x = pt.grid.Xwc(this.plateTrack.selectedPlate.grid.X(point.startX));
                                            let endX = pt.grid.Xwc(this.plateTrack.selectedPlate.grid.X(point.x))
                                            let rect_x = Math.abs(endX - screen_x)
                                            let rect_y = screen_y - small_height / 2;

                                            await pt.zoomto(screen_x, rect_y, rect_x, small_height);

                                        } else {
                                            let rect_x = screen_x - small_width / 2;
                                            let rect_y = screen_y - small_height / 2;
                                            await pt.zoomto(rect_x, rect_y, small_width, small_height);
                                        }

                                        if (!this.selectedPoint) {
                                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2-viewer.js', pm, this.selectedPanel, null)
                                            CurrentLayout.setComponent('selectedPanel', button_canvas2)
                                            return;
                                        }
                                        if (config.mode === 'viewer') {
                                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2-viewer.js', pm, this.selectedPanel, s)
                                            CurrentLayout.setComponent('selectedPanel', button_canvas2)
                                        } else {
                                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, this.selectedPanel, s)
                                            CurrentLayout.setComponent('selectedPanel', button_canvas2)
                                        }
                                    }
                                }
                            )
                        }

                        let menuItm = {
                            wid: 'menu',
                            data: {
                                cmd: createIon(async (str, panel) => {
                                }),
                                menus: [
                                    {
                                        'label': `${this.plateTrack.selectedPlate.name}`, 'items': m
                                    },
                                    {
                                        'label': `[Time Points]`, 'items': sp
                                    },

                                ]
                            }
                        }
                        CurrentLayout.setComponent('selectedPanel', menuItm)
                    } else {
                        this.selectedPoint = sel;
                        if (!this.selectedPoint) {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2-viewer.js', pm, this.selectedPanel, null)
                            CurrentLayout.setComponent('selectedPanel', button_canvas2)
                            return;
                        }

                        if (config.mode === 'viewer') {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2-viewer.js', pm, this.selectedPanel, sel)
                            CurrentLayout.setComponent('selectedPanel', button_canvas2)
                        } else {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, this.selectedPanel, sel)
                            CurrentLayout.setComponent('selectedPanel', button_canvas2)
                        }
                    }
                })
            }
        }
        let pm = new PlateManager()
        if (config && config.app)
            pm.app = config.app;
        exec('flexigraph/gene2plates.js', pm, progressBar).then(async (graph) => {
            cacheOn()
            let io;
            let tracks;
            let genegraph_panel_layout;

            const spath = '/baja/templates/tables';
            const load_file = async (path, name) => {
                let jsonobj = {
                    'spath': path,
                    'rule_name': name,
                    'user': getUser()
                }
                let host_ = window['env']['apiUrl']
                let rs = await POSTJSON(jsonobj, host_ + '/get-script');
                return rs;
            }
            function removeLastFileNode(p) {
                if (typeof p !== 'string') return '';

                const hadBackslashes = /\\/.test(p);
                let s = p.replace(/\\/g, '/');

                const unc = s.match(/^\/\/[^/]+\/[^/]+/);
                const drive = s.match(/^[A-Za-z]:\//);
                const rootLen = unc ? unc[0].length : drive ? 3 : s.startsWith('/') ? 1 : 0;

                while (s.length > rootLen && s.endsWith('/')) s = s.slice(0, -1);

                const idx = s.lastIndexOf('/');
                if (idx < 0) s = '';
                else if (idx < rootLen) s = s.slice(0, rootLen);
                else s = s.slice(0, idx);

                return hadBackslashes ? s.replace(/\//g, '\\') : s;
            }

            setTimeout(async () => {
                var result = await verifyUserPath('/cpd/editor', 'bajabio-Project');
                if (!result.allowed) {
                    await exec('baja/datayak/ljlcheckout.js', result)
                }
            }, 10 * 60);

            let { Track, TrackRef } = await exec('baja/bio/track-flexi.js')

            if (path.endsWith('.bjb')) {
                let host_ = window['env']['apiUrl']
                let index = path.lastIndexOf('/')
                if ((config != null && config.user != null) || path.startsWith('/myfiles/')) {
                    let jsonobj = {
                        'path': path,
                        'key': 'user',
                        'user': getUser()
                    }
                    let rs = await POSTJSON(jsonobj, host_ + '/load-file');
                    if (rs.shared_from) {
                        jsonobj.path = rs.shared_from;
                        if (!jsonobj.path.startsWith('/')) {
                            jsonobj.path = '/' + jsonobj.path;
                        }
                        rs = await POSTJSON(jsonobj, host_ + '/load-file');
                        if (rs.plateTrack)
                            rs.plateTrack.file = path;
                        let p = decodeURIComponent(path).substring(index + 1)

                        if (rs.msg) {
                            clear();
                            log(rs.msg + ' ' + p)
                            return;
                        } else {
                            if (rs && rs.ptracks && rs.formulas) {
                                pm.plateTrack.copyFromJSON(rs)
                                graph.file = p;
                            }
                            await graph.update(rs);
                            graph.file = p;
                        }

                    } else {

                        if (rs.plateTrack) {
                            rs.plateTrack.file = path;

                        }
                        let p = decodeURIComponent(path).substring(index + 1)

                        if (rs.msg) {
                            clear();
                            log(rs.msg + ' ' + p)
                            return;
                        } else {
                            if (rs && rs.ptracks && rs.formulas) {
                                pm.plateTrack.copyFromJSON(rs)
                                graph.file = p;
                            }
                            await graph.update(rs);
                            graph.file = p;
                        }
                    }
                    progressBar(45)
                } else {

                    let jsonobj = {
                        'path': path,
                        'user': getUser()
                    }
                    let rs = await POSTJSON(jsonobj, host_ + '/load-file');
                    progressBar(45)
                    let p = decodeURIComponent(path).substring(index + 1)
                    if (rs.msg && rs.msg.length) {

                        clear();
                        showWidget({
                            wid: 'html',
                            data: "<hr> " + rs.msg
                        })
                        return;

                    } else {
                        await graph.update(rs);
                        graph.file = p;
                    }
                }

            }
            let Icon = await exec('flexigraph/shapes/icon.js')
            graph.folder = path;
            function handleShiftClick(event) {

                if (event.shiftKey && event.type === 'mousedown') {
                    console.log('Shift + Click detected');
                    if (pm.plateTrack && pm.plateTrack.selectedPlate) {
                        pm.plateTrack.selectedPlate.selectContiguousRange();
                    }
                }
            }
            function attachShiftClickListener(element = document) {
                element.addEventListener('mousedown', handleShiftClick);
            }
            attachShiftClickListener();
            window.addEventListener('keydown', async function (event) {
                if (event.ctrlKey && event.key === 'z') {
                }
            });
            function parseFasta(fastaString) {
                const lines = fastaString.split('\n');
                let sequence = '';
                let description = '';

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();

                    if (line.startsWith('>')) {

                        description = line.substring(1).trim();
                    } else {

                        sequence += line;
                    }
                }

                sequence = sequence.replace(/[^a-zA-Z]/g, '').toUpperCase();

                return {
                    description: description,
                    sequence: sequence,
                };
            }

            document.addEventListener('keydown', async (event) => {

                if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
                    event.preventDefault();
                    await handleUndo();
                }
                if ((event.ctrlKey) && event.key === 'Z') {
                    event.preventDefault();
                    handleRedo();
                }
                if (event.key === 'Tab') {

                }
            });
            function findObjectWithUid(objects, uidValue) {
                function scan(obj) {
                    if (obj && typeof obj === 'object') {

                        if ('uid' in obj && obj.uid === uidValue) {
                            return obj;
                        }
                        for (let key in obj) {
                            if (obj.hasOwnProperty(key)) {
                                let result = scan(obj[key]);
                                if (result) {
                                    return result;
                                }
                            }
                        }
                    }
                    return null;
                }

                if (Array.isArray(objects)) {
                    for (let item of objects) {
                        let result = scan(item);
                        if (result) {
                            return result;
                        }
                    }
                } else {

                    return scan(objects);
                }

                return null;
            }

            function reconstituteObject(originalObject, jsonObject) {
                for (let key in jsonObject) {
                    if (jsonObject.hasOwnProperty(key)) {
                        const originalValue = originalObject[key];
                        const jsonValue = jsonObject[key];

                        if (jsonValue === null || typeof jsonValue !== 'object') {
                            if (originalValue !== jsonValue) {
                                originalObject[key] = jsonValue;
                            }
                        } else if (typeof jsonValue === 'object' && originalValue && typeof originalValue === 'object') {
                            if (key === 'grid' && originalValue instanceof MGrid) {

                                Object.assign(originalValue, jsonValue);
                            } else if (key === 'wells' && Array.isArray(jsonValue)) {

                                for (let col = 0; col < jsonValue.length; col++) {
                                    if (!originalValue[col]) {
                                        originalValue[col] = [];
                                    }

                                    for (let row = 0; row < jsonValue[col].length; row++) {
                                        const jsonWell = jsonValue[col][row];
                                        if (originalValue[col][row] instanceof GenericWell) {
                                            Object.assign(originalValue[col][row], jsonWell);
                                        } else {
                                            originalValue[col][row] = new GenericWell(
                                                jsonWell.name,
                                                jsonWell.value,
                                                jsonWell.obj,
                                                jsonWell.group
                                            );
                                            Object.assign(originalValue[col][row], jsonWell);
                                        }
                                    }

                                    if (originalValue[col].length > jsonValue[col].length) {
                                        originalValue[col].length = jsonValue[col].length;
                                    }
                                }

                                if (originalValue.length > jsonValue.length) {
                                    originalValue.length = jsonValue.length;
                                }
                            } else {
                                reconstituteObject(originalValue, jsonValue);
                            }
                        }
                    }
                }
            }

            let redo = []
            let handleUndo = async () => {
                let gs;
                gs = await popHistory()
                if (!gs) {
                    return;
                }
                if (gs.root) {
                    graph.updatePlateTracks(gs)
                } else {
                    if (pm.plateTrack && pm.plateTrack.selectedTrack)
                        pm.plateTrack.selectedTrack.pushAnyPreviousHistory()
                    if (gs.uid) {
                        let ob = findObjectWithUid([pm], gs.uid)
                        if (ob) {
                            redo.push(HM(ob))
                            reconstituteObject(ob, gs)
                        }
                    }
                }
            }

            let handleRedo = () => {
                if (redo.length > 0) {
                    let gs = JSON.parse(redo.pop());
                    if (gs.root) {
                        graph.updatePlateTracks(gs)
                    } else {
                        if (gs.uid) {
                            let ob = findObjectWithUid([pm], gs.uid)
                            if (ob) {
                                pushHistory(HM(ob))
                                reconstituteObject(ob, gs)
                            }
                        }
                    }

                }
            }

            window.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            window.addEventListener('drop', (e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        let base64String = event.target.result.split(',')[1];
                        let fileBuffer = new TextDecoder('utf-8').decode(new Uint8Array([...base64String].map(char => char.charCodeAt(0))));
                        let binaryString = atob(fileBuffer);
                        if (binaryString.startsWith('>')) {
                            let seqo = parseFasta(binaryString)
                            graph.setMessage(seqo.description + " track from  fasta")
                            let sequence = seqo.sequence;

                            let t = new Track(seqo.description, 0, sequence.length, 1, 1)
                            t.sequence = sequence;
                            pm.plateTrack.m_plots.push(t)

                            setTimeout(() => {
                                let length = graph.track[graph.track.length - 1].sequence.length;
                                graph.zoomToTrack(graph.track.length - 1, (length * (-0.2)),
                                    length + (length * 0.2))
                            }, 2000)
                        }
                    };
                    reader.readAsDataURL(file);
                }
            });

            let smenu = null;
            let setMenu = async (__smenu) => {
                if (!smenu) {
                    return;
                }
                currentWorkbench = null;
                smenu = __smenu;
                mousePriority = false;
                mouseDownListener = (x, y) => {
                };
                mouseMoveListener = (x, y) => {
                    if (!smenu) {
                        console.log(" no menu ")
                    }
                    let mmx = pm.plateTrack.grid.Xwc(x);
                    let mmy = pm.plateTrack.grid.Ywc(y);
                    if (smenu && smenu.isIn(pm.plateTrack.grid, mmx, mmy)) {
                        smenu.mouseMove(pm.plateTrack.grid, mmx, mmy)
                    }
                }
                mouseUpListener = async (x, y) => {
                    let mmx = pm.plateTrack.grid.Xwc(x);
                    let mmy = pm.plateTrack.grid.Ywc(y);
                    if (smenu && smenu.isIn(pm.plateTrack.grid, mmx, mmy)) {
                        await smenu.mouseUp(pm.plateTrack.grid, mmx, mmy)

                    }
                }
            }

            let zoomin = async () => {
                AnimateGrid.INTERUPT = true;
                pm.plateTrack.grid.rescale();
                smenu = null;
                mousePriority = false;
                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;
                let xdf = Math.abs((xmax - xmin) / 3);
                let ydf = Math.abs((ymax - ymin) / 3);
                ymax -= ydf;
                ymin += ydf;
                xmax -= xdf;
                xmin += xdf;
                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);
                pm.plateTrack.grid.rescale();
            }

            let zoomout = async () => {
                AnimateGrid.INTERUPT = true;

                pm.plateTrack.grid.rescale();
                smenu = null;
                mousePriority = false;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;
                let xdf = Math.abs((xmax - xmin) / 2);
                let ydf = Math.abs((ymax - ymin) / 2);

                ymax += ydf;
                ymin -= ydf;
                xmax += xdf;
                xmin -= xdf;
                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);
                pm.plateTrack.grid.rescale();
            }

            let shiftLeft = async (left_distance) => {
                AnimateGrid.INTERUPT = true;
                pm.plateTrack.grid.rescale();
                smenu = null;
                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                xmin -= left_distance;
                xmax -= left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let shiftDown = async (left_distance) => {
                pm.plateTrack.grid.rescale();
                smenu = null;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                ymin -= left_distance;
                ymax -= left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let shiftUp = async (left_distance) => {
                AnimateGrid.INTERUPT = true;

                pm.plateTrack.grid.rescale();
                smenu = null;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                ymin += left_distance;
                ymax += left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let shiftRight = async (left_distance) => {
                AnimateGrid.INTERUPT = true;

                pm.plateTrack.grid.rescale();
                smenu = null;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                xmin += left_distance;
                xmax += left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let zoomtofitplates = () => {
                AnimateGrid.INTERUPT = true;
                pm.plateTrack.zoomtfit()
            }
            let px = 0;
            let py = 0;
            let mouse_down = false;

            let dragnavigate = () => {
                draw = null;
                menuManager = null;
                smenu = null;
                currentWorkbench = null;
                smenu = null;
                mouseMoveListener = null;
                mouseUpListener = null;
                mouseDownListener = null;
                draw = null;
                keydown = null;
                px = 0;
                px = 0;

                let t = {
                    id: 'drag-navigate',
                    priority: true,
                    mouseUpListener: (scx, scy) => {
                        px = 0;
                        py = 0;
                        mouse_down = false;
                    },
                    mouseDownListener: (scx, scy) => {
                        mouse_down = true;
                    },
                    mouseMoveListener: (scx, scy) => {
                        if (smenu) {
                            return;
                        }
                        if (mouse_down) {
                            if (px === 0) {
                                px = pm.plateTrack.grid.Xwc(scx);
                                py = pm.plateTrack.grid.Ywc(scy);
                            }
                            else {
                                let xd = px - pm.plateTrack.grid.Xwc(scx);
                                let yd = py - pm.plateTrack.grid.Ywc(scy);
                                pm.plateTrack.grid.setxmin(pm.plateTrack.grid.getxmin() + xd);
                                pm.plateTrack.grid.setymin(pm.plateTrack.grid.getymin() + yd);
                                pm.plateTrack.grid.setxmax(pm.plateTrack.grid.getxmax() + xd);
                                pm.plateTrack.grid.setymax(pm.plateTrack.grid.getymax() + yd);
                                pm.plateTrack.grid.rescale();
                            }
                        } else {
                            let new_selected = pm.plateTrack.getPlate(pm.plateTrack.grid.Xwc(scx), pm.plateTrack.grid.Ywc(scy))
                            if (new_selected) {
                                if (new_selected != pm.plateTrack.grid.selectedPlate || !pm.plateTrack.selectedPlate) {
                                }
                            }
                        }
                    }
                }
                wb(t)
            }

            let currentWorkbench = null;
            let wb = (wbset) => {
                if (!wbset) {
                    if (currentWorkbench && currentWorkbench.id && currentWorkbench.id === 'drag-navigate') {
                        return;
                    }
                    if (currentWorkbench != null && currentWorkbench.close) {
                        currentWorkbench.close();
                    }
                    currentWorkbench = null;
                    smenu = null;
                    mouseMoveListener = null;
                    mouseUpListener = null;
                    mouseDownListener = null;
                    touchStart = null;
                    touchEnd = null;
                    touchMove = null;
                    draw = null;
                    menuManager = null;
                    keydown = null;
                    mouse_down = false;
                    dragnavigate();
                    return;
                } else {

                    if (currentWorkbench != null && currentWorkbench.close) {
                        currentWorkbench.close();
                    }
                    currentWorkbench = wbset;
                    pm.plateTrack.wbid = currentWorkbench.id;
                }
                if (wbset.buttons) {
                    panel.setButtons(wbset.buttons)
                }
                if (wbset.msg) {
                    message = wbset.msg;
                    setTimeout(() => {
                        message = null;
                    }, 5000)
                }
                mouseMoveListener = wbset.mouseMoveListener;
                mouseUpListener = wbset.mouseUpListener;
                mouseDownListener = wbset.mouseDownListener;
                draw = wbset.draw;
                smenu = wbset.smenu;
                menuManager = wbset.menuManager;
                if (wbset.init) {
                    wbset.init(current_mousex, current_mousey, pm);
                }

            }

            let default_dbclick = (scx, scy) => {

            }

            let default_wheel = (dy) => {

            }

            let resize_plate_width = (plate, scx, scy) => {
                let xi = scx;
                let yi = scy;

                pushHistory(HM(plate))
                let origWidth = pm.plateTrack.grid.screenWidth(plate.getWidth());
                let diffx = 0
                mouse_down = true;
                let t = {
                    id: 'resize-width',
                    priority: true,
                    mouseDownListener: (async (x, y) => {
                        mouse_down = true;
                        xi = x;
                        if (pm.plateTrack && plate && plate.grid) {
                            yi = y + pm.plateTrack.grid.Y(plate.getHeight());
                            plate.__resizing = true;
                            pm.plateTrack.grid.rescale();
                            origWidth = pm.plateTrack.grid.screenWidth(plate.getWidth());
                        }
                    }),
                    mouseMoveListener: ((x, y) => {
                        pm.plateTrack.grid.rescale()
                        if (mouse_down) {
                            diffx = x - xi
                            let sw = (origWidth + diffx);
                            if (sw < 10) {
                                sw = 10;
                            }
                            plate.__resizing = true;
                            plate.visible_cell_aspect_ratio_min = null;
                            plate.visible_cell_aspect_ratio_max = null;

                            let gw = pm.plateTrack.grid.worldWidth(sw);
                            plate.setWidth(gw);
                            plate.grid.rescale();
                        }
                        else if (!pm.plateTrack.selectedPlate.onRightEdge(x, y, pm.plateTrack)) {
                            plate.__resizing = false;
                            plate.resizable = false;
                            plate.clk_drag(pm.plateTrack)
                        }

                    }),
                    mouseUpListener: ((x, y) => {
                        if (plate) {
                            plate.__resizing = false;
                            plate.resizable = false;
                        }
                        setTimeout(() => {
                            wb(null)
                        }, 199);

                    })
                }
                wb(t)
            }

            let resize_plate = (plate, scx, scy) => {

                let xi = scx;
                let yi = scy;
                let origWidth = pm.plateTrack.grid.screenWidth(plate.getWidth());
                let origHeight = pm.plateTrack.grid.screenHeight(plate.getHeight());
                mouse_down = true;

                const rhm = HM(plate)
                pushHistory(rhm)
                let t = {
                    id: 'resize',
                    priority: true,
                    mouseDownListener: (async (x, y) => {
                        mouse_down = true;
                        xi = x;
                        if (pm.plateTrack && plate && plate.grid) {
                            pm.plateTrack.grid.rescale();
                            plate.grid.rescale();
                            plate.last_touched = new Date();

                            plate.__resizing = true;
                            origWidth = pm.plateTrack.grid.screenWidth(plate.getWidth());
                            origHeight = pm.plateTrack.grid.screenHeight(plate.getHeight());
                            originyi = plate.grid.yi;
                        }
                    }),
                    mouseMoveListener: ((x, y) => {
                        pm.plateTrack.grid.rescale();

                        if (mouse_down) {
                            plate.__resizing = true;
                            plate.last_touched = new Date();

                            const diffx = x - xi;
                            const diffy = (y - yi);

                            let sw = origWidth + diffx;
                            let sh = origHeight + diffy;

                            plate.visible_cell_aspect_ratio_min = null;
                            plate.visible_cell_aspect_ratio_max = null;

                            if (sw < 0 || sh < 0) {
                                sw = origWidth;
                                sh = origHeight;
                            } else {

                                if (sw < 10) sw = 10;
                                if (sh < 10) sh = 10;
                            }

                            const gw = (pm.plateTrack.grid.worldWidth(sw));
                            const gh = (pm.plateTrack.grid.worldHeight(sh));

                            if (plate.setWidth) {
                                plate.setWidth(gw);
                            }

                            if (plate.setHeight) {
                                plate.setHeight(gh);
                            } else {
                                plate.grid.height = gh;
                            }
                            plate.grid.yi = pm.plateTrack.grid.Ywc(y);

                            plate.grid.rescale();
                        }

                    }),

                    mouseUpListener: ((x, y) => {
                        mouse_down = false;
                        plate.last_touched = new Date();
                        plate.__resizing = false;
                        plate.resizable = false;
                        plate.__resizing = false;
                        setTimeout(() => {
                            wb(null)

                        }, 10)
                    })
                }
                wb(t)
            }

            let resize_plot = (plot, scx, scy) => {
                plot.highlight();
                plot.resizing = true;
                let xi = scx;
                let yi = scy;
                mouse_down = true;
                let origWidth = pm.plateTrack.grid.screenWidth(plot.w);
                let origHeight = pm.plateTrack.grid.screenHeight(plot.h);
                let diffx = 0
                let diffy = 0
                let t = {
                    id: 'resize_plot',
                    mouseDownListener: (async (x, y) => {
                        mouse_down = true;
                        xi = x;
                        yi = y;
                        pm.plateTrack.grid.rescale();
                        plot.grid.rescale();
                        origWidth = pm.plateTrack.grid.screenWidth(plot.w);
                        origHeight = pm.plateTrack.grid.screenHeight(plot.h);
                    }),
                    mouseMoveListener: ((x, y) => {
                        pm.plateTrack.grid.rescale()
                        if (mouse_down) {
                            diffx = x - xi;
                            diffy = y - yi;
                            plot.w = Math.abs(pm.plateTrack.grid.worldWidth((origWidth + (diffx))))
                            plot.h = Math.abs(pm.plateTrack.grid.worldHeight((origHeight + (diffy))))
                        }
                    }),
                    mouseUpListener: ((x, y) => {
                        setTimeout(() => {
                            wb(null)
                        }, 499);
                    })
                }
                wb(t)
            }

            let default_mousedownListener = async (scx, scy) => {
                AnimateGrid.INTERUPT = true;
                mouse_down = true;
                let mmx = pm.plateTrack.grid.Xwc(scx);
                let mmy = pm.plateTrack.grid.Ywc(scy);
                if (smenu && !smenu.isIn(pm.plateTrack.grid, mmx, mmy)) {
                    if (smenu && smenu.close)
                        smenu.close();
                    smenu = null;
                    pm.plateTrack.wb(null)
                    return; ''
                } else if (smenu) {
                    return;
                }
                if (pm.plateTrack.menu) {
                    return;
                }

                if (pm.plateTrack.isTextActive()) {
                    pm.plateTrack.setTextActive(false);
                    return;
                }
                if (pm.plateTrack.__redo_stack_menu && pm.plateTrack.__redo_stack_menu.mouseUp && pm.plateTrack.__redo_stack_menu.isIn(pm.plateTrack.grid,
                    pm.plateTrack.grid.Xwc(scx), pm.plateTrack.grid.Ywc(scy))) {
                    this.__redo_stack_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    return;
                }
                let plate_selected = pm.plateTrack.selectedPlate;
                if (!plate_selected) {
                    plate_selected = pm.plateTrack.onResizeLocation(scx, scy)
                } else {
                    if ((currentWorkbench === null) || (currentWorkbench && currentWorkbench.id === 'drag-navigate')) {
                        let new_selected = pm.plateTrack.getPlate(pm.plateTrack.grid.Xwc(scx), pm.plateTrack.grid.Ywc(scy))
                        if (new_selected) {
                            pm.plateTrack.setSelected(new_selected)
                            if (pm.plateTrack.clk_drag)
                                pm.plateTrack.clk_drag(pm.plateTrack)
                        }
                    }

                }
                if (!smenu && pm.plateTrack) {
                    await pm.plateTrack.mouseDown(scx, scy)
                }
                if (pm.plateTrack && pm.plateTrack.menu) {
                    return;
                }
                if (pm.plateTrack && pm.plateTrack.isInAnyMenu) {
                    if (pm.plateTrack.isInAnyMenu(scx, scy))
                        return;
                }

                if (mouseDownListener) {
                    mouseDownListener(scx, scy)
                }

                if (plate_selected && plate_selected.inButtons) {
                    if (plate_selected.inButtons(scx, scy, pm.plateTrack)) {
                        return;
                    }
                }

                if (!isMobile()) {
                    if (plate_selected && plate_selected.inResize && plate_selected.inResize(scx, scy, pm.plateTrack)) {
                        if (plate_selected && plate_selected.typeof && plate_selected.typeof === 'plot') {
                            return resize_plot(plate_selected, scx, scy)
                        } else {
                            return resize_plate(plate_selected, scx, scy);
                        }
                    }
                    if (plate_selected && plate_selected.onRightEdge && plate_selected.onRightEdge(scx, scy, pm.plateTrack)) {
                        return resize_plate_width(plate_selected, scx, scy);

                    }
                }

                mouse_down = true;
            }

            let default_mouseUpListener = async (scx, scy) => {
                px = 0;
                py = 0;
                mouse_down = false;
                if (!smenu && pm.plateTrack) {
                    pm.plateTrack.mouseUp(scx, scy)
                }
                if (pm.plateTrack && pm.plateTrack.menu) {
                    pm.plateTrack.mouseUp(scx, scy)
                    return;
                }
                if (pm.plateTrack && pm.plateTrack.isInAnyMenu) {
                    if (pm.plateTrack.isInAnyMenu(scx, scy))
                        return;
                }
                let plate_selected = pm.plateTrack.selectedPlate;
                if (plate_selected && plate_selected.__resizing) {
                    plate_selected.__resizing = false;
                }
                mouse_down = false;
                if (mouseUpListener && !pm.plateTrack.IsInTableMenu(scx, scy)) {
                    await mouseUpListener(scx, scy)
                }
            }

            let getPlate = (x, y) => {
                return pm.plateTrack.getPlate(x, y)
            }

            let getObject = (scx, scy) => {
                let mmx = scx;
                let mmy = scy;

                let p = getPlate(mmx, mmy);
                if (p != null) {
                    return p;
                }
                for (let connection of pm.plateTrack.connections) {
                    if (connection.isOnCircle((scx), (scy), pm.plateTrack.grid)) {
                        if (connection != null) {
                            return connection;
                        }
                    } else if (connection.isOnTriangle(scx, scy, pm.plateTrack.grid)) {
                        if (connection != null) {
                            return connection;
                        }
                    }
                }
                let l = getPlot(mmx, mmy)
                if (l != null) {
                    return l;

                }
                return null;
            }

            let hold_key_nav = true;

            let default_keydownListener = async (event) => {

                if (event.key === 'ArrowLeft') {
                    pm.plateTrack.navigate('left')
                } else if (event.key === 'ArrowRight') {
                    pm.plateTrack.navigate('right')
                } else if (event.key === 'ArrowDown') {
                    console.log("ymax before: " + pm.plateTrack.grid.ymax);
                    pm.plateTrack.navigate('down')
                    console.log('Down arrow pressed, scale adjusted');
                } else if (event.key === 'ArrowUp') {
                    console.log("ymax before: " + pm.plateTrack.grid.ymax);
                    pm.plateTrack.navigate('up')
                    console.log('Down arrow pressed, scale adjusted');
                }
                if (currentWorkbench && currentWorkbench.keydown) {
                    return currentWorkbench.keydown(event)
                }
                let plate_selected = pm.plateTrack.selectedPlate;
                if (plate_selected && plate_selected.handleKeyDown) {
                    plate_selected.handleKeyDown(pm.plateTrack, event)
                }
            }

            let default_mousemoveListener = async (scx, scy) => {
                if (pm.plateTrack.isTextActive()) {
                    return null
                }

                current_mousex = scx;
                current_mousey = scy;
                pm.plateTrack.__menu__ = smenu;
                if (pm.plateTrack) {
                    pm.plateTrack.mouseMove(scx, scy)
                    if (pm.plateTrack.isDraggingScrollbar) {
                        return;
                    }
                    if (pm.plateTrack && pm.plateTrack.selectedPlate && pm.plateTrack.selectedPlate.viewWell) {
                        pm.plateTrack.selectedPlate.viewWell(scx, scy, pm.plateTrack)
                    }
                }
                if (pm.plateTrack && pm.plateTrack.isInAnyMenu) {
                    if (pm.plateTrack.isInAnyMenu(scx, scy))
                        return;
                }

                if (currentWorkbench && currentWorkbench.mouseMoveListener) {
                    return currentWorkbench.mouseMoveListener(scx, scy)
                }
            }

            let getPlot = (scx, scy) => {
                let pt = pm.plateTrack;

                for (let plot of pt.m_plots) {
                    if (plot._highlight === true && plot.inside(pt.grid, scx, scy)) {
                        return plot;
                    }
                }

                for (let plot of pt.m_plots) {
                    if (plot._highlight !== true && plot.inside(pt.grid, scx, scy)) {
                        return plot;
                    }
                }

                return null;
            };

            let drawPlateTracks = (ctx) => {
                if (pm.plateTrack && !pm.plateTrack.wb) {
                    pm.plateTrack.setWorkbench(wb);
                }

                if (config && config.mode)
                    pm.plateTrack.mode = config.mode;

                if (ctx != null) {
                    pm.plateTrack.draw(ctx);

                    if (draw) {
                        draw(pm.plateTrack.grid, ctx);
                    }
                    if (currentShape && currentShape.draw != null) {
                        currentShape.draw(pm.plateTrack.grid, ctx)
                    }
                    if (ctx && smenu && pm.plateTrack != null) {
                        ctx.fillStyle = 'rgba(255,255,255,0.83)'
                        ctx.fillRect(pm.plateTrack.grid.xi, pm.plateTrack.grid.yi, pm.plateTrack.grid.width, pm.plateTrack.grid.height)
                        smenu.draw(ctx, pm.plateTrack.grid)
                    }
                }
            }
            graph.post_graphics_modifications = drawPlateTracks;

            window.addEventListener('dragover', (event) => {
                event.preventDefault();
            })
            window.addEventListener('drop', async (event) => {
                event.preventDefault();

                function parseExcelFile(file) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = function (e) {
                            try {
                                const data = new Uint8Array(e.target.result);
                                const workbook = XLSX.read(data, { type: 'array' });

                                const tables = {};

                                workbook.SheetNames.forEach(sheetName => {
                                    const worksheet = workbook.Sheets[sheetName];

                                    const table = [];

                                    const range = XLSX.utils.decode_range(worksheet['!ref']);
                                    for (let rowNum = range.s.r; rowNum <= range.e.r; rowNum++) {
                                        const row = [];

                                        for (let colNum = range.s.c; colNum <= range.e.c; colNum++) {
                                            const cellAddress = XLSX.utils.encode_cell({ r: rowNum, c: colNum });
                                            const cell = worksheet[cellAddress];

                                            if (cell) {
                                                const cellData = {
                                                    value: cell.v || "",
                                                    formula: cell.f || ""
                                                };
                                                row.push(cellData);
                                            } else {
                                                row.push({ value: "", formula: "" });
                                            }
                                        }
                                        table.push(row);
                                    }

                                    tables[sheetName] = table;
                                });

                                resolve(tables);
                            } catch (error) {
                                reject(`Error parsing Excel file: ${error.message}`);
                            }
                        };

                        reader.onerror = function (error) {
                            reject(`File read error: ${error}`);
                        };

                        reader.readAsArrayBuffer(file);
                    });
                }

                const file = event.dataTransfer.files[0];
                if (file && file.name.endsWith('.xlsx')) {

                    const reader = new FileReader();

                    reader.onload = async function (e) {
                        try {

                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const plates = [];
                            workbook.SheetNames.forEach(sheetName => {
                                const worksheet = workbook.Sheets[sheetName];
                                const table = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

                                let xmax = 0;
                                let ymax = 0;

                                table.forEach((row, rowIndex) => {
                                    const nonEmptyCols = row.filter(cell => cell !== null && cell !== "").length;
                                    if (nonEmptyCols > 0) {
                                        xmax = Math.max(xmax, rowIndex + 1);
                                        ymax = Math.max(ymax, nonEmptyCols);
                                    }
                                });

                                const trimmedTable = table.slice(0, xmax).map(row => row.slice(0, ymax));

                                const wells = trimmedTable.map((row, rowIndex) => {
                                    return row.map((cellValue, colIndex) => {
                                        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
                                        const cell = worksheet[cellAddress] || {};
                                        const well = new GenericWell(
                                            `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`,
                                            cell.v || cellValue,
                                            null,
                                            null
                                        );
                                        well.properties = {
                                            value: cell.v || cellValue || null,
                                            formula: cell.f || null,
                                            type: cell.t || null,
                                            raw: cell.w || null
                                        };
                                        return well;
                                    });
                                });

                                const plate = new Plate(sheetName, xmax, ymax);
                                plate.setWells(wells);
                                plates.push(plate);
                            });

                            let index = 1;
                            let prev = null;
                            for (let t of plates) {
                                if (prev != null) {

                                }
                                pm.plateTrack.appendPlate(t);
                                pm.plateTrack.wb(null)
                                prev = t;
                                index++;
                            }
                            pm.plateTrack.zoomtfit()
                            pm.plateTrack.wb(null)

                        } catch (error) {
                            alert(`Error parsing Excel file: ${error.message}`);
                        }
                    };

                    reader.readAsArrayBuffer(file);

                }
                else
                    if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = function (e) {
                            const img = new Image();
                            img.onload = function () {
                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                            };
                            img.src = e.target.result;
                        };

                        reader.readAsDataURL(file);
                    } else {

                    }
            })

            window.addEventListener('keydown', async (event) => {

                if (pm.plateTrack.isTextActive()) {
                    if (event.key === 'Escape') {
                        pm.plateTrack.setTextActive(false)
                        return;
                    }
                    return pm.plateTrack.handleKeyDown(event)
                }

                function arrayToExcelString(wells) {

                    const maxLength = Math.max(...wells.map(col => col.length));
                    wells.forEach(col => {
                        while (col.length < maxLength) {
                            col.push({ value: "" });
                        }
                    });
                    const trimmedWells = wells.filter(col => col.some(cell => cell.value !== "" && cell.value !== null && cell.value !== undefined));
                    const transposed = trimmedWells[0].map((_, rowIndex) => trimmedWells.map(col => col[rowIndex] || { value: "" }));
                    return transposed.map(row =>
                        row.map(cell => {

                            let cellText = String(cell.value).replace(/"/g, '""');

                            if (/[",\n\t]/.test(cellText)) {
                                cellText = `"${cellText}"`;
                            }
                            return cellText;
                        }).join('\t')
                    ).join('\n');
                }
                if (event.ctrlKey && event.key === 'c') {
                    console.log('Control + C was pressed');
                    event.preventDefault();
                    if (pm.plateTrack) {
                        let se = pm.plateTrack.getSelectedWells()

                        let v = arrayToExcelString(se)
                        pm.plateTrack.setMessage("Copy")
                        LJScript.add(pm.plateTrack.name, `copy canvas`)

                        navigator.clipboard.writeText(v).then(() => {
                            console.log("Object copied to clipboard!");
                        }).catch(err => {
                            console.error("Failed to copy object to clipboard: ", err);
                        });
                    }
                } else
                    if (event.ctrlKey && event.key === 'x') {
                        console.log('Control + C was pressed');
                        event.preventDefault();
                        if (pm.plateTrack) {
                            let se = await pm.plateTrack.getSelectedWellsInOrder()
                            pm.plateTrack.setMessage("Copied")
                            navigator.clipboard.writeText(JSON.stringify(se)).then(() => {
                                console.log("Object copied to clipboard!");
                            }).catch(err => {
                                console.error("Failed to copy object to clipboard: ", err);
                            });
                        }
                    } else
                        if (event.key === 'Delete') {

                        } else
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                if (pm.plateTrack && pm.plateTrack.selectedPlate && pm.plateTrack.selectedPlate.textActive) {

                                    pm.plateTrack.selectedPlate.textActive = false;

                                }
                                else
                                    if (pm.plateTrack) {
                                        let se = await pm.plateTrack.getSelectedWellsInOrder()
                                        for (let s of se) {
                                            if (s.value != null && s.value.length > 0) {
                                                pushHistory(HM(s))
                                                s.value = ''
                                            }
                                        }
                                    }
                            }
            });

            const loadImageToCanvas = async (image) => {
                let b64 = await getBase64Image(image.src);
                image.src = b64;
                let xw = pm.plateTrack.grid.Xwc(100)
                let yw = pm.plateTrack.grid.Ywc(100)
                let ic = new Icon('base64', image, xw, yw, pm.plateTrack.grid.worldWidth(image.width), pm.plateTrack.grid.worldHeight(image.height));
                ic.b64 = b64;
                loaded = true;

                let plate = new Plate(generateNautName(), 1, 1);
                plate.plateType = 'annotation'
                plate.completeNullValues();
                plate.setWellType(0, 0, 'ICON')
                plate.wells[0][0].icon = ic;
                plate.grid.width = pm.plateTrack.grid.worldWidth(image.width);
                plate.grid.height = pm.plateTrack.grid.worldHeight(image.height);
                pm.plateTrack.addNextAvailableX(plate)

                image.onload = () => {
                    pm.plateTrack.setMessage(" Image added ")
                }
            }

            window.addEventListener('paste', async (e) => {
                if (e.localName && e.localName.indexOf('text') >= 0) {
                    return;
                }
                if (e.target && e.target.localName.toString().indexOf('text') >= 0) {
                    return;
                }
                if (e.target && e.target.localName.toString().indexOf('input') >= 0) {
                    return;
                }

                if (eeditor_state.paste_to_graph) {
                    if (e.clipboardData == false) return false;
                    const items = e.clipboardData.items;

                    function isLikelySvg(str) {
                        if (typeof str !== 'string') return false;
                        const trimmed = str.trim();
                        if (!trimmed.startsWith('<')) return false;
                        return /^<svg[\s>]/i.test(trimmed) ||
                            /^<\?xml[^>]*>\s*<svg[\s>]/i.test(trimmed);
                    }

                    for (let i = 0; i < items.length; i++) {
                        let item = items[i];

                        if (item.type === 'text/plain') {

                            try {
                                item.getAsString(async (text) => {
                                    try {

                                        if (isLikelySvg(text)) {
                                            try {
                                                let Shape = await exec('flexigraph/shapes/shape.js')
                                                const Glyph = await exec('baja/draw/glyph.js');
                                                const shape = Shape.fromSvgString(text);
                                                const glyph = new Glyph(shape);
                                                pm.plateTrack.addGlyph(glyph);

                                                return;
                                            } catch (svgErr) {
                                                console.error('Failed to import SVG as Glyph:', svgErr);

                                            }
                                        }

                                        function isLikelyPythonScript(code) {
                                            if (typeof code !== 'string' || code.trim() === '') return false;
                                            const pythonKeywords = [
                                                'def ', 'class ', 'import ', 'from ', 'return', 'if ', 'elif ', 'else:',
                                                'for ', 'while ', 'try:', 'except', 'with ', 'as ', 'print(', 'lambda'
                                            ];
                                            const hasKeyword = pythonKeywords.some(kw => code.includes(kw));
                                            const lines = code.split('\n');
                                            const colonLine = lines.some(line => line.trim().endsWith(':'));
                                            const indentedLine = lines.some(line => line.startsWith('    '));
                                            return hasKeyword && colonLine && indentedLine;
                                        }

                                        function replaceMainWithParams(pyCode) {
                                            const mainRegex = /def\s+main\s*\(([^)]*)\)\s*:/;
                                            const match = pyCode.match(mainRegex);

                                            if (!match) {
                                                return pyCode;
                                            }

                                            const params = match[1]
                                                .split(',')
                                                .map(p => p.trim())
                                                .filter(p => p.length > 0);

                                            const paramLines = ['from ion import works'];
                                            params.forEach((param, idx) => {
                                                paramLines.push(`${param} = works.param(${idx + 1})`);
                                            });

                                            const lines = pyCode.split('\n');
                                            const newLines = [];
                                            const mainBodyLines = [];
                                            const importLines = [];

                                            let inMain = false;
                                            let mainIndent = null;
                                            let inIfMain = false;

                                            for (let i = 0; i < lines.length; i++) {
                                                const line = lines[i];

                                                if (/^\s*import\s+|^\s*from\s+\w+/.test(line)) {
                                                    importLines.push(line);
                                                    continue;
                                                }

                                                if (!inMain && mainRegex.test(line)) {
                                                    inMain = true;
                                                    mainIndent = line.match(/^(\s*)/)[1];
                                                    continue;
                                                }

                                                if (inMain) {
                                                    const indentMatch = line.match(/^(\s*)/);
                                                    const currentIndent = indentMatch ? indentMatch[1] : '';

                                                    if (line.trim() === '' || currentIndent.length > mainIndent.length) {
                                                        mainBodyLines.push(line.slice(mainIndent.length));
                                                        continue;
                                                    } else {
                                                        inMain = false;
                                                        i--;
                                                        continue;
                                                    }
                                                }

                                                if (/if\s+__name__\s*==\s*["']__main__["']\s*:/.test(line)) {
                                                    inIfMain = true;
                                                    continue;
                                                }

                                                if (inIfMain) {
                                                    if (/^\s+/.test(line)) continue;
                                                    inIfMain = false;
                                                }

                                                newLines.push(line);
                                            }

                                            let lastVar = null;
                                            for (let i = mainBodyLines.length - 1; i >= 0; i--) {
                                                const line = mainBodyLines[i].trim();
                                                if (/^\w+\s*=/.test(line)) {
                                                    lastVar = line.split('=')[0].trim();
                                                    break;
                                                }
                                            }

                                            if (lastVar) {
                                                mainBodyLines.push(`works.resolve(${lastVar})`);
                                            }

                                            return [
                                                ...importLines,
                                                '',
                                                ...paramLines,
                                                '',
                                                ...mainBodyLines,
                                                '',
                                                ...newLines
                                            ].join('\n');
                                        }

                                        function isStructuredDataStrifacng(input) {
                                            if (/^\s*\w+\s*=\s*{/.test(input)) {
                                                return true;
                                            }
                                            else
                                                return false;
                                        }

                                        if (isStructuredDataStrifacng(text)) {
                                            return await exec('baja/plate/data/import-python-table-structure-data.js', text, pm.plateTrack, genegraph_panel_layout)
                                        } else if (isLikelyPythonScript(text)) {
                                            text = replaceMainWithParams(text)

                                            let namev = await prompt("Script name: ", ["Name"], { "Name": '' }, 500, 300)
                                            let name = namev['Name']
                                            if (!name.endsWith('.py')) {
                                                name = name + '.py'
                                            }
                                            let host_ = window['env']['apiUrl']
                                            let jsonobj = {
                                                "name": name,
                                                "key": "wd",
                                                "spath": 'py/baja/templates',
                                                "value": text,
                                                "user": getUser()
                                            }
                                            let rs = await POSTJSON(jsonobj, host_ + '/save-script');
                                            if (rs['status']) {
                                                infoPrompt(rs['status'])
                                            }
                                            return;
                                        }

                                        const parsed = JSON.parse(text);
                                        if (parsed) {

                                            function parsePlotObject(jsonString) {
                                                try {

                                                    const obj = JSON.parse(jsonString);
                                                    if (
                                                        obj.name && typeof obj.name === 'string' &&
                                                        obj.startDate && !isNaN(Date.parse(obj.startDate)) &&
                                                        obj.endDate && !isNaN(Date.parse(obj.endDate)) &&
                                                        obj.scatterData && Array.isArray(obj.scatterData.points) &&
                                                        obj.config_script && obj.config_script.plot &&
                                                        obj.grid && obj.grid.xmin !== undefined &&
                                                        obj.grid.xmax !== undefined &&
                                                        obj.grid.ymin !== undefined &&
                                                        obj.grid.ymax !== undefined
                                                    ) {
                                                        return Plot.fromJSON(jsonString)
                                                    } else {
                                                        throw new Error("Invalid plot object structure");
                                                    }
                                                } catch (error) {

                                                    console.error("Error parsing JSON or invalid structure:", error);
                                                    return null;
                                                }
                                            }

                                            let Plot = await exec('flexigraph/plot')
                                            if (parsed.type === 'timeline') {
                                                let plt = Plot.fromJSON(parsed)
                                                pm.plateTrack.grid.rescale();
                                                plt.grid.xi = pm.plateTrack.grid.Xwc(0);
                                                plt.grid.yi = pm.plateTrack.grid.Ywc(0);

                                                pm.plateTrack.m_plots.push(plt)
                                                setTimeout(() => {

                                                }, 1000)
                                                return;
                                            }
                                            if (parsed.objectType && parsed.objectType === 'array_of_objects') {
                                                let lastep = null;
                                                for (let obj of parsed.objects) {
                                                    if (obj.plateType && obj.wells) {
                                                        const pw = Plate.buildPlateFromJSON(obj);
                                                        pm.plateTrack.root.push(pw)
                                                        lastep = pw;
                                                    }
                                                }
                                                pm.plateTrack.generateTables();
                                                if (lastep) {
                                                    setTimeout(() => {
                                                        pm.plateTrack.zoomintoplate(lastep)
                                                    }, 1000);
                                                }
                                                return;

                                            } else if (parsed.plateType && parsed.wells) {
                                                const pw = Plate.buildPlateFromJSON(parsed);
                                                pm.plateTrack.addNextAvailableX(pw)
                                                setTimeout(() => {
                                                    pm.plateTrack.zoomintoplate(pw)
                                                }, 1000);
                                                return;
                                            } else if (parsed.plateType && parsed.plateType === 'package') {
                                                const pl = Plate.buildPlateFromJSON(parsed)
                                                pm.plateTrack.addNextAvailableX(pl)
                                                setTimeout(() => {
                                                    pm.plateTrack.zoomintoplate(pl)
                                                }, 1000)

                                            } else if (parsed.plate_track) {
                                                let confirm = await exec('baja/lib/confirm.js', 'Copy formula into the canvas.  This could overwrite some existing formulas', async () => {
                                                    pm.plateTrack.copyFromJSON(parsed.plate_track)
                                                })
                                                await showModal(confirm)
                                                return;
                                            } else {
                                                await exec('baja/plate/data/import-data.js', text, pm.plateTrack, genegraph_panel_layout)
                                            }
                                        }
                                    } catch (exception_e) {
                                        await exec('baja/plate/data/import-data.js', text, pm.plateTrack, genegraph_panel_layout)
                                    }

                                });
                            } catch (exception) {
                                console.log(" exception meessage " + exception.message)
                            }

                            return;

                        }

                        else if (item.kind === 'file' && item.type === 'text/plain') {
                            const blob = item.getAsFile();
                            const reader = new FileReader();
                            reader.onload = async (e) => {
                                const text = e.target.result;

                                if (isLikelySvg(text)) {
                                    try {
                                        let Shape = await exec('flexigraph/shapes/shape.js')
                                        const Glyph = await exec('baja/draw/glyph.js');
                                        const shape = Shape.fromSvgString(text);
                                        const glyph = new Glyph(shape);
                                        pm.plateTrack.addGlyph(glyph);

                                        return;
                                    } catch (svgErr) {
                                        console.error('Failed to import SVG file as Glyph:', svgErr);

                                    }
                                }

                                await exec('baja/plate/data/import-data.js', text, pm.plateTrack, genegraph_panel_layout)
                            };
                            reader.readAsText(blob);
                            return;

                        } else if (item.kind === 'file' && item.type === 'image/png') {

                            if (items[0] && items[0].type === 'text/plain') {
                                return;
                            }

                            const file = item.getAsFile();
                            const img = new Image();
                            img.onload = () => loadImageToCanvas(img);
                            img.src = URL.createObjectURL(file);

                        } else if (item.type.startsWith('image/') && items.length === 1) {

                            const file = item.getAsFile();
                            const img = new Image();
                            img.onload = () => loadImageToCanvas(img);
                            img.src = URL.createObjectURL(file);

                        }
                    }
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

            let priority = false;

            const default_touchStart = (x, y) => {

            }
            const default_touchEnd = (x, y) => {

            }
            const default_touchMove = (x, y) => {

            }

            let mdel = {
                'mouseUp': default_mouseUpListener,
                'mouseDown': default_mousedownListener,
                'mouseMove': default_mousemoveListener,
                'keyDown': default_keydownListener,
                'touchstart': default_touchStart,
                'touchend': default_touchEnd,
                'touchmove': default_touchMove,

                'wheel': default_wheel,
                'getPriority': () => {
                    return priority;
                }
            }
            let geneGraph = await graph.createComponent(mdel);

            let plates_panel;
            let platePanel = createIonFunction((p) => {
                updateStatsPanel();
                plates_panel = p;
            })
            progressBar(50);

            function truncateString(str) {
                const maxLength = 50;
                if (str.length > maxLength) {
                    return str.slice(0, maxLength) + "...";
                }
                return str;
            }

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
                        plates_panel.setHTML(truncateString(ht));
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

            progressBar(55);

            let htmlT = ''
            if (htmlT) {
                htmlT = JSON.stringify(htmlT)
            } else {
                htmlT = ''
            }

            let refChem = createIonFunction((d) => {
                htmlP = d
            })

            let buttonMenuPanel = {}

            const MSGraph = await exec('lib/msgraph.js')

            if (isMobile()) {
                button_canvas = await exec('manchester/controls/navigation-panel-plates-mobile.js', pm)
            } else {
                button_canvas = await exec('manchester/controls/navigation-panel-plates.js', pm)
            }
            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm)

            buttonMenuPanel = {
                wid: 'card',
                componentRef: 'staticPanel',
                data: {

                    cards: [
                        [
                            {
                                'title': '',
                                'component': {
                                    wid: 'card',
                                    componentRef: 'selectedPanel',
                                    data: {
                                        cards: [
                                            [
                                                {
                                                    'title': '',
                                                    'component': button_canvas2
                                                },
                                            ]]
                                    }
                                }
                            },
                            {
                                'title': '',
                                'component': {
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
                            },
                        ]]
                }
            }

            progressBar(60);
            let saveSaveScreen = async () => {
                await exec('manchester/io/save-obj-tp.js', graph, genegraph_panel_layout, path)
            }
            let saveAsSaveScreen = async () => {
                await exec('manchester/io/save-as-obj-tp.js', graph, genegraph_panel_layout, path)
            }
            let openWF = async () => {
                let v = await exec('baja/table/io/open-nautilus', pm)
                showModal(v)
            }
            let openSaveScreen = async () => {
                let v = await exec('baja/table/io/open-yakro', graph, pm, '/app/cpd/editor')
                showModal(v)
            }
            let importSaveScreen = async () => {
                let v = await exec('baja/table/io/import-yakro', graph)
                showModal(v)
            }

            let publicPublish = async () => {
                let canvas = CurrentLayout.getStashed('graph-canvas');
                if (canvas.canvas) {
                    canvas = canvas.canvas;
                }

                let domCanvas = canvas.getElement ? canvas.getElement() : canvas;

                let pngBase64 = domCanvas.nativeElement.toDataURL('image/png');

                console.log(pngBase64);

                let im = pngBase64.replace(/^data:image\/png;base64,/, '');
                if (pm.plateTrack && im) {
                    await exec('manchester/io/save-as-obj-tp-public.js', graph, genegraph_panel_layout, path, '/app/cpd/editor', im)
                } else {
                    await exec('manchester/io/save-as-obj-tp-public.js', graph, genegraph_panel_layout, path, '/app/cpd/editor')
                }
            }
            progressBar(80);

            let ai_create_file_items = []
            let file_items = []

            if (MSGraph.isLoggedIn()) {

                ai_create_file_items.push({
                    'label': 'Historical Milestones', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = 'Give me a timeline that describes key milestones for the discovery vaccines and add to this specific milestones for the discovery of the covid vaccine. ';
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 100);
                        }, 50);

                        let sequence_input = {
                            wid: 'card',
                            "height": "500px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "200px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create.  (BCE currently not supported)</font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build timeline', ionFunction: createIonFunction(async () => {

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                                setTimeout(async () => {

                                                                    let interval = null;
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    let content = sequenceTextEditor.getContent();
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let model = await exec('py/openai/milestones.py', em, content)
                                                                    pm.plateTrack.killSprite()
                                                                    if (model && model.milestones) {
                                                                        if (model.milestones.length === 0) {
                                                                            infoPrompt("No milestones found")
                                                                            return;
                                                                        }

                                                                        let MPlot = await exec('flexigraph/plot.js')
                                                                        const plot = new MPlot({ points: model.milestones });

                                                                        function jdnFromYMD(y, m, d) {
                                                                            const a = Math.floor((14 - m) / 12);
                                                                            const y2 = y + 4800 - a;
                                                                            const m2 = m + 12 * a - 3;
                                                                            return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4)
                                                                                - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
                                                                        }

                                                                        function parseProlepticDate(isoString) {
                                                                            if (typeof isoString !== "string") return new Date(NaN);

                                                                            isoString = isoString.replace(/\u2212|−/g, "-").trim();

                                                                            const m = isoString.match(
                                                                                /^([+-]?\d{1,6})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
                                                                            );
                                                                            if (!m) {

                                                                                const d = new Date(isoString);
                                                                                return isNaN(d) ? new Date(NaN) : d;
                                                                            }

                                                                            const year = parseInt(m[1], 10);
                                                                            const month1 = parseInt(m[2], 10);
                                                                            const day = parseInt(m[3], 10);
                                                                            const hour = m[4] ? parseInt(m[4], 10) : 0;
                                                                            const minute = m[5] ? parseInt(m[5], 10) : 0;
                                                                            const second = m[6] ? parseInt(m[6], 10) : 0;

                                                                            if (
                                                                                month1 < 1 || month1 > 12 ||
                                                                                day < 1 || day > 31 ||
                                                                                hour < 0 || hour > 23 ||
                                                                                minute < 0 || minute > 59 ||
                                                                                second < 0 || second > 59
                                                                            ) return new Date(NaN);

                                                                            const jdn = jdnFromYMD(year, month1, day);
                                                                            const epochJDN = 2440588;
                                                                            const secondsSinceEpoch = (jdn - epochJDN) * 86400 + (hour * 3600 + minute * 60 + second);
                                                                            const ms = secondsSinceEpoch * 1000;

                                                                            return new Date(ms);
                                                                        }

                                                                        plot.startDate = parseProlepticDate(model.window.start);
                                                                        plot.endDate = parseProlepticDate(model.window.end);

                                                                        let xs = model.milestones.map(p => p.x);

                                                                        const xMin = Math.min(...xs);
                                                                        const xMax = Math.max(...xs);
                                                                        plot.grid.zoom(xMin, xMax, 0, 1);
                                                                        plot.w = 800;
                                                                        plot.h = 400;
                                                                        plot.type = 'timeline'
                                                                        plot.name = generateNautName();
                                                                        plot.x_axis_label = "Time (Years)";
                                                                        plot.y_axis_label = "Sample Metric";
                                                                        plot.fitScaleToData = false;
                                                                        plot.grid.rescale();

                                                                        await pm.plateTrack.panToNextSpot(800)

                                                                        pm.plateTrack.setPlotCenter(plot)

                                                                    } else {
                                                                        infoPrompt(" Failed to build the model")
                                                                    }
                                                                }, 1000)

                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })

                ai_create_file_items.push({
                    'label': 'Scientific Publications Timeline', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = 'Give me a timeline that describes key milestones for the discovery vaccines and add to this specific milestones for the discovery of the covid vaccine. ';
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 100);
                        }, 50);

                        let sequence_input = {
                            wid: 'card',
                            "height": "500px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "300px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build timeline', ionFunction: createIonFunction(async () => {

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                                setTimeout(async () => {

                                                                    let interval = null;
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    let content = sequenceTextEditor.getContent();
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let model = await exec('py/openai/sci-pub-milestones.py', em, content)
                                                                    pm.plateTrack.killSprite()

                                                                    if (model && model.results.milestones && model.results.milestones.length > 0) {
                                                                        let MPlot = await exec('flexigraph/plot.js')
                                                                        const plot = new MPlot({ points: model.results.milestones });
                                                                        function jdnFromYMD(y, m, d) {
                                                                            const a = Math.floor((14 - m) / 12);
                                                                            const y2 = y + 4800 - a;
                                                                            const m2 = m + 12 * a - 3;
                                                                            return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4)
                                                                                - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
                                                                        }

                                                                        function parseProlepticDate(isoString) {
                                                                            if (typeof isoString !== "string") return new Date(NaN);

                                                                            isoString = isoString.replace(/\u2212|−/g, "-").trim();

                                                                            const m = isoString.match(
                                                                                /^([+-]?\d{1,6})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
                                                                            );
                                                                            if (!m) {

                                                                                const d = new Date(isoString);
                                                                                return isNaN(d) ? new Date(NaN) : d;
                                                                            }

                                                                            const year = parseInt(m[1], 10);
                                                                            const month1 = parseInt(m[2], 10);
                                                                            const day = parseInt(m[3], 10);
                                                                            const hour = m[4] ? parseInt(m[4], 10) : 0;
                                                                            const minute = m[5] ? parseInt(m[5], 10) : 0;
                                                                            const second = m[6] ? parseInt(m[6], 10) : 0;

                                                                            if (
                                                                                month1 < 1 || month1 > 12 ||
                                                                                day < 1 || day > 31 ||
                                                                                hour < 0 || hour > 23 ||
                                                                                minute < 0 || minute > 59 ||
                                                                                second < 0 || second > 59
                                                                            ) return new Date(NaN);

                                                                            const jdn = jdnFromYMD(year, month1, day);
                                                                            const epochJDN = 2440588;
                                                                            const secondsSinceEpoch = (jdn - epochJDN) * 86400 + (hour * 3600 + minute * 60 + second);
                                                                            const ms = secondsSinceEpoch * 1000;

                                                                            return new Date(ms);
                                                                        }

                                                                        plot.startDate = parseProlepticDate(model.window.start);
                                                                        plot.endDate = parseProlepticDate(model.window.end);

                                                                        let xs = model.results.milestones.map(p => p.x);
                                                                        const xMin = Math.min(...xs);
                                                                        const xMax = Math.max(...xs);
                                                                        plot.grid.zoom(xMin, xMax, 0, 1);
                                                                        plot.w = 800;
                                                                        plot.h = 400;
                                                                        plot.type = 'timeline'
                                                                        plot.name = generateNautName();
                                                                        plot.x_axis_label = "Time (Years)";
                                                                        plot.y_axis_label = "Sample Metric";
                                                                        plot.fitScaleToData = false;
                                                                        plot.grid.rescale();
                                                                        await pm.plateTrack.panToNextSpot(800)

                                                                        pm.plateTrack.killSprite()
                                                                        pm.plateTrack.setPlotCenter(plot)

                                                                    } else {
                                                                        infoPrompt(" Failed to build the model")
                                                                    }
                                                                }, 1000)

                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })

                ai_create_file_items.push({
                    label: 'Gantt Chart', ionfunction: createIonFunction(async () => {

                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `
1. target discovery 4 months
2. target validation 1 month
3. mechanism validation 2 months
4. drug candidate screening 3 months
5. lead identification and validation 1 week
6. in vitro toxicology 1 week
7.  Invivo toxicology 13 weeks
8. Pk/PD 5 weeks
9. Large animal toxicology  20 weeks
 `;
                        let initalText = true;
                        let i = 0;

                        let currentText = '';

                        const interval = setInterval(() => {

                            currentText += txt[i];
                            if (!initalText) {
                                sequenceTextEditor.setContent('');
                                clearInterval(interval)
                                return;
                            }
                            sequenceTextEditor.setContent(currentText);
                            i++;

                            if (i >= txt.length) {
                                clearInterval(interval);
                            }
                        }, 40);

                        let sequence_input = {
                            wid: 'card',
                            "height": "500px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "500px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `

                                                <H4>
  <font color="navy">

                                                Write out items to add to the gantt chart, one on each line.  Click on the sample text below to start:
                                                </font> </h4>
                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "400px",
                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor.setContent("")
                                                        initalText = false;
                                                    }),

                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build', ionFunction: createIonFunction(async () => {
                                                                pm.plateTrack.setMessage("AI mode...", 5)

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                let interval = null;
                                                                let em = new EngineMonitor((msg) => {
                                                                    pm.plateTrack.updateSprite(msg)
                                                                });
                                                                em.addProgressListener(async (v) => {
                                                                    if (v >= 100) {
                                                                    }
                                                                })
                                                                let content = sequenceTextEditor.getContent();
                                                                user_prompt = content;
                                                                pm.plateTrack.setMessage("Building model", 5)
                                                                let model = await exec('py/openai/timeline.py', em, content)
                                                                pm.plateTrack.killSprite()

                                                                showModal({
                                                                    wid: 'json',
                                                                    data: JSON.stringify(model)
                                                                })

                                                                let MPlot = await exec('flexigraph/plot.js')
                                                                const plot = new MPlot({ points: model.intervals });
                                                                plot.startDate = new Date(model.window.start);
                                                                plot.endDate = new Date(model.window.end);
                                                                const xMin = Math.min(...model.intervals.map(p => p.startX));
                                                                const xMax = Math.max(...model.intervals.map(p => p.x));
                                                                plot.grid.zoom(xMin, xMax, 0, 1);
                                                                plot.w = 800;
                                                                plot.h = 300;
                                                                plot.type = 'timeline'
                                                                plot.name = 'test-timeline';
                                                                plot.x_axis_label = "Time (Years)";
                                                                plot.y_axis_label = "Sample Metric";
                                                                plot.fitScaleToData = false;
                                                                plot.grid.rescale();
                                                                pm.plateTrack.setPlotCenter(plot)

                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    }

                    )
                })

                const pnl_timeline = () => {

                    const templates = [
                        {
                            label: 'Tables', click: (async () => {
                                try {
                                    let tree = await exec('baja/table/datayak-analytics-tables', pm, graph)
                                    let treeStack = []
                                    const renderTree = async (nodeList, panelName = 'mainPanel') => {
                                        nodeList = nodeList.filter(node => node !== null)
                                        if (!Array.isArray(nodeList) || nodeList.length === 0) return;
                                        let localNodeList = [...nodeList];
                                        if (treeStack.length > 0) {
                                            localNodeList.push(
                                                {
                                                    'label': 'Back...',
                                                    click: () => {
                                                        if (treeStack.length > 0) {
                                                            setTimeout(async () => {
                                                                tree = treeStack.pop();
                                                                await renderTree(tree, panelName);
                                                                return;
                                                            }, 500)
                                                        }
                                                    }
                                                })

                                        }

                                        localNodeList.push(
                                            {
                                                'label': 'Close',
                                                click: async () => {
                                                    CurrentLayout.reset(panelName);
                                                }
                                            })
                                        const buildDesc = async (items) => {
                                            let descl = {}

                                            for (let i of items) {
                                                if (i.path) {
                                                    try {

                                                        let pp = removeLastFileNode(i.path)

                                                        let r = await load_file('/baja/templates/' + pp, i.label + '.desc');
                                                        if (r && r.rule_value)
                                                            i.desc = r.rule_value;
                                                    } catch (exception) { }
                                                    if (i && i.desc) {
                                                        descl[i.label] = i.desc
                                                    }
                                                }
                                            }
                                            return descl;
                                        }
                                        localNodeList = cleanTree(localNodeList)
                                        let its = await buildDesc(localNodeList)

                                        let component = {
                                            wid: 'selection-list',
                                            data: {
                                                single_selection: true,
                                                show_button: false,
                                                singleSelect: true,
                                                contentItems: its,
                                                listItems: localNodeList.map(item => item.label),
                                                button_function: createIonFunction(async (items) => {
                                                    let selectedLabel = items[0];
                                                    let selectedItem = localNodeList.find(item => item.label === selectedLabel);

                                                    if (selectedItem.click) {
                                                        await selectedItem.click();
                                                    }
                                                    CurrentLayout.reset(panelName);
                                                    if (selectedItem.children && selectedItem.children.length > 0) {
                                                        treeStack.push(nodeList);

                                                        tree = selectedItem.children.filter(node => node !== null)
                                                        tree = cleanTree(tree);
                                                        await renderTree(tree, panelName);
                                                    } else {

                                                    }
                                                })
                                            }
                                        };
                                        CurrentLayout.clearComponent(panelName);
                                        CurrentLayout.setComponent(panelName, component);
                                    }

                                    setTimeout(async () => {
                                        tree = cleanTree(tree);
                                        await renderTree(tree)
                                    }, 200)
                                } catch (exception) { }

                            })
                        },

                        {
                            label: 'Models', click: (async () => {
                                try {
                                    let tree = await exec('baja/table/datayak-analytics-models', pm, graph)
                                    let treeStack = []
                                    const renderTree = async (nodeList, panelName = 'mainPanel') => {
                                        nodeList = nodeList.filter(node => node !== null)
                                        if (!Array.isArray(nodeList) || nodeList.length === 0) return;
                                        let localNodeList = [...nodeList];

                                        if (treeStack.length > 0) {
                                            localNodeList.push(
                                                {
                                                    'label': 'Back...',
                                                    click: () => {
                                                        if (treeStack.length > 0) {
                                                            setTimeout(async () => {
                                                                tree = treeStack.pop();
                                                                await renderTree(tree, panelName);
                                                                return;
                                                            }, 500)
                                                        }
                                                    }
                                                })

                                        }

                                        localNodeList.push(
                                            {
                                                'label': 'Close',
                                                click: async () => {
                                                    CurrentLayout.reset(panelName);
                                                }
                                            })
                                        const buildDesc = async (items) => {
                                            let descl = {}

                                            for (let i of items) {
                                                if (i.path) {
                                                    try {

                                                        let pp = removeLastFileNode(i.path)

                                                        let r = await load_file('/baja/templates/' + pp, i.label + '.desc');
                                                        if (r && r.rule_value)
                                                            i.desc = r.rule_value;
                                                    } catch (exception) { }
                                                    if (i && i.desc) {
                                                        descl[i.label] = i.desc
                                                    }
                                                }
                                            }
                                            return descl;
                                        }
                                        localNodeList = cleanTree(localNodeList)
                                        let its = await buildDesc(localNodeList)

                                        let component = {
                                            wid: 'selection-list',
                                            data: {
                                                single_selection: true,
                                                show_button: false,
                                                singleSelect: true,
                                                contentItems: its,
                                                listItems: localNodeList.map(item => item.label),
                                                button_function: createIonFunction(async (items) => {
                                                    let selectedLabel = items[0];
                                                    let selectedItem = localNodeList.find(item => item.label === selectedLabel);

                                                    if (selectedItem.click) {
                                                        await selectedItem.click();
                                                    }

                                                    CurrentLayout.reset(panelName);

                                                    if (selectedItem.children && selectedItem.children.length > 0) {
                                                        treeStack.push(nodeList);

                                                        tree = selectedItem.children.filter(node => node !== null)
                                                        tree = cleanTree(tree);
                                                        await renderTree(tree, panelName);
                                                    } else {

                                                    }
                                                })
                                            }
                                        };
                                        CurrentLayout.clearComponent(panelName);
                                        CurrentLayout.setComponent(panelName, component);
                                    }

                                    setTimeout(async () => {
                                        tree = cleanTree(tree);
                                        await renderTree(tree)
                                    }, 200)
                                } catch (exception) { }

                            })
                        },
                    ]
                    graph.showWindowMenu(templates, 10, 10, 400)

                    const pt = pm.plateTrack;
                    pt.setMessage("Generating Timeline...", 5)
                    setTimeout(async () => {
                        ls = [
                        ]
                        for (let p of pm.plateTrack.root) {
                            ls.push(p.toValueUID())
                        }
                        let model5 = await exec('py/openai/cash-in-hand-vs-time-for-timeline.py', ls)
                        let v = await exec('baja/draw/data-model-to-tables-gpt', pt, model5, 'hidden')
                        const plotFactory = await exec('flexigraph/plot.js', MGrid);
                        const MPlot = (await plotFactory) || plotFactory;
                        pt.killSprite();
                        const getWellsFromJSON = (root, data) => {
                            const wellsList = Array.isArray(data?.wells) ? data.wells : [];
                            if (!Array.isArray(root) || !root.length) return [];
                            const plateMap = new Map();
                            for (const plate of root) {
                                const name = plate?.name || plate?.plate || plate?.id;
                                if (name) plateMap.set(String(name), plate);
                            }
                            const out = [];
                            for (const w of wellsList) {
                                const plateName = w?.plate;
                                const plate = plateMap.get(plateName);
                                if (!plate || !Array.isArray(plate.wells)) continue;

                                const col = Number(w?.x) - 1;
                                const row = Number(w?.y) - 1;

                                if (row > 0) {

                                    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

                                    const colArr = plate.wells[col];
                                    if (!Array.isArray(colArr)) continue;

                                    const well = colArr[row];

                                    const rightColArr = plate.wells[col + 1][row];
                                    const right = Array.isArray(rightColArr) ? rightColArr[row] : null;

                                    if (well) {
                                        out.push(well);
                                        out.push(rightColArr);
                                    }
                                }
                            }

                            return out;
                        }

                        let wells = getWellsFromJSON(pm.plateTrack.root, model5)
                        for (let w of wells) {
                            w.selectIt();
                        }
                        pm.plateTrack.zoomouttoFit();
                        setTimeout(() => {
                            pm.plateTrack.setMessage("This is not a complete model but a good start...", 1)
                            setTimeout(() => {
                                pm.plateTrack.layoutCompactTetris();
                                setTimeout(() => {
                                    pm.plateTrack.setMessage("Green arrows are input contros. NOTE: Not all are used... ", 1)
                                    setTimeout(async () => {

                                        let MPlot = await exec('flexigraph/plot.js');

                                        function addMonths(date, months) {
                                            const d = new Date(date.getTime());
                                            d.setMonth(d.getMonth() + months);
                                            return d;
                                        }

                                        function toMillis(x) { return ensureDateUTC(x).getTime(); }
                                        function ensureDateUTC(x) {
                                            if (x instanceof Date) return new Date(x.getTime());
                                            if (x && typeof x === "object" && typeof x.date === "string")
                                                return parseHistoricalISOToDate(x.date);
                                            return typeof x === "string" ? parseHistoricalISOToDate(x) : new Date(x);
                                        }

                                        function millisToYear(ms) {
                                            return ms / (365.2425 * 24 * 3600 * 1000);
                                        }

                                        function formatTimeLabel(x, xMin, xMax, start, end) {

                                            const year = millisToYear(x);
                                            const yInt = Math.trunc(year);
                                            const absYear = Math.abs(yInt);
                                            const era = yInt < 0 ? " BCE" : "";
                                            return absYear + era;
                                        }

                                        function timeToX(time, xMin, xMax, start, end) {
                                            const totalCanvasRange = xMax - xMin;
                                            const startMs = toMillis(start);
                                            const endMs = toMillis(end);
                                            const totalTimeRange = endMs - startMs;
                                            const t = toMillis(time);
                                            const normalized = (t - startMs) / totalTimeRange;
                                            return xMin + normalized * totalCanvasRange;
                                        }
                                        function jdnFromYMD(y, m, d) {
                                            const a = Math.floor((14 - m) / 12);
                                            const y2 = y + 4800 - a;
                                            const m2 = m + 12 * a - 3;
                                            return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4)
                                                - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
                                        }

                                        function parseProlepticDate(isoString) {
                                            if (typeof isoString !== "string") return new Date(NaN);

                                            isoString = isoString.replace(/\u2212|−/g, "-").trim();

                                            const m = isoString.match(
                                                /^([+-]?\d{1,6})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
                                            );
                                            if (!m) {

                                                const d = new Date(isoString);
                                                return isNaN(d) ? new Date(NaN) : d;
                                            }

                                            const year = parseInt(m[1], 10);
                                            const month1 = parseInt(m[2], 10);
                                            const day = parseInt(m[3], 10);
                                            const hour = m[4] ? parseInt(m[4], 10) : 0;
                                            const minute = m[5] ? parseInt(m[5], 10) : 0;
                                            const second = m[6] ? parseInt(m[6], 10) : 0;

                                            if (
                                                month1 < 1 || month1 > 12 ||
                                                day < 1 || day > 31 ||
                                                hour < 0 || hour > 23 ||
                                                minute < 0 || minute > 59 ||
                                                second < 0 || second > 59
                                            ) return new Date(NaN);

                                            const jdn = jdnFromYMD(year, month1, day);
                                            const epochJDN = 2440588;
                                            const secondsSinceEpoch = (jdn - epochJDN) * 86400 + (hour * 3600 + minute * 60 + second);
                                            const ms = secondsSinceEpoch * 1000;

                                            return new Date(ms);
                                        }

                                        const startDate = parseProlepticDate(model5.window.startDate);
                                        const endDate = parseProlepticDate(model5.window.endDate);

                                        const generateMilestones = (count = 20, callback, _formula) => {
                                            if (count <= 0) return [];
                                            let xmin = 0;
                                            let xmax = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
                                            const nMax = Math.max(1, count);
                                            const startMs0 = startDate.getTime();
                                            const endMs0 = endDate.getTime();
                                            const startMs = Math.min(startMs0, endMs0);
                                            const endMs = Math.max(startMs0, endMs0);
                                            const totalMs = endMs - startMs;
                                            if (totalMs === 0) {
                                                const xDate = new Date(startMs);
                                                return [{
                                                    x: timeToX(xDate, xmin, xmax, startDate, endDate),
                                                    date: xDate,
                                                    formula: _formula,
                                                    y: 1,
                                                    t: 0,
                                                    type: "milestone",
                                                    name: formatTimeLabel(xDate)
                                                }];
                                            }
                                            const MS_PER_DAY = 24 * 60 * 60 * 1000;
                                            const wholeDays = Math.floor(totalMs / MS_PER_DAY);
                                            let n;
                                            let stepMs;
                                            if (wholeDays + 1 <= nMax) {
                                                n = wholeDays + 1;
                                                stepMs = MS_PER_DAY;
                                            } else {
                                                n = nMax;
                                                stepMs = totalMs / (n - 1);
                                            }
                                            const points = [];
                                            for (let i = 0; i < n; i++) {
                                                const xDate = new Date(startMs + stepMs * i);
                                                const y = 1
                                                points.push({
                                                    x: timeToX(xDate, xmin, xmax, startDate, endDate),
                                                    date: xDate,
                                                    formula: _formula,
                                                    y,
                                                    t: n === 1 ? 0 : i / (n - 1),
                                                    type: "milestone",
                                                    name: y + ''
                                                });
                                            }
                                            return points;
                                        };
                                        const milestones = generateMilestones(50, (point, plot, pt) => {
                                            if (point.formula) {

                                                let f = point.formula.replace(/eval\s*\[\s*t_years\s*\]/gi, point.x);
                                                exec('baja/plate/ops/frun-object.js', f, pt).then((v) => {
                                                    point.y = v;
                                                })
                                                return v;
                                            }
                                            return 0.01001;
                                        }, model5.formulas["Cash_vs_Time[1:1][1:1]"])
                                        const plot = new MPlot({ points: milestones });
                                        plot.type = 'timeline';
                                        plot.name = generateNautName();
                                        plot.startDate = startDate;
                                        plot.endDate = endDate;
                                        const xs = milestones.map(p => p.x);
                                        const xMin = xs.length ? Math.min(...xs) : startDate.getTime();
                                        const xMax = xs.length ? Math.max(...xs) : endDate.getTime();
                                        plot.points = milestones;
                                        const ys = milestones.map(p => p.y).filter(v => Number.isFinite(v));
                                        const yMin = ys.length ? Math.min(...ys) : 0;
                                        const yMax = ys.length ? Math.max(...ys) : 1;
                                        const yPad = (yMax - yMin) * 0.1 || 1;
                                        plot.grid.zoom(xMin, xMax, yMin - yPad, yMax + yPad);
                                        plot.grid.rescale();
                                        const baseYMin = ys.length ? Math.min(...ys) : 0;
                                        const baseYMax = ys.length ? Math.max(...ys) : 1;
                                        plot.grid.zoom(xMin, xMax, baseYMin - yPad, baseYMax + yPad);
                                        plot.setWidth(pt.grid.worldWidth(400))
                                        plot.setHeight(pt.grid.worldHeight(200))
                                        plot.name = generateNautName();
                                        plot.x_axis_label = "Time (quarters from start)";
                                        plot.y_axis_label = "Cashflow";
                                        plot.fitScaleToData = false;
                                        plot.grid.rescale();
                                        await pm.plateTrack.panToNextSpot(pt.grid.screenWidth(800))
                                        await pm.plateTrack.setPlotCenter(plot)
                                        pt.updateCalculations();
                                        await pt.layoutCompactTetris();
                                        pm.plateTrack.setMessage("Green arrows are input controls. NOTE: Not all are used...", 1);
                                    })
                                }, 4000)

                            }, 1000)

                        }, 1000)

                    }, 200)

                }

                ai_create_file_items.push({
                    'label': 'Profit and Loss', 'ionfunction': createIonFunction(async () => {
                        const plate_graph = pm;
                        const pt = pm.plateTrack;
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });
                        const txt = 'I want to create a small therapeutics company with two commercial products for rare disease indications. ';
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 450);

                        let sequence_input = {
                            wid: 'card',
                            "height": "500px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "500px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `

                                                <H4>
  <font color="navy">

                                                Describe the model you want to create below:
                                                </font> </h4>
                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "600px",
                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor.setContent("")
                                                        initalText = false;
                                                    }),

                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build', ionFunction: createIonFunction(async () => {

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                let interval = null;
                                                                let em = new EngineMonitor((msg) => {
                                                                    plate_graph.plateTrack.updateSprite(msg)
                                                                });
                                                                em.addProgressListener(async (v) => {
                                                                    if (v >= 100) {
                                                                    }
                                                                })
                                                                let content = sequenceTextEditor.getContent();
                                                                const user_prompt = content;
                                                                plate_graph.plateTrack.setMessage("Generating Assumptions...", 5)
                                                                let model = await exec('py/openai/assumptions.py', em, getUser(), content);
                                                                exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model).then(async r => {
                                                                    plate_graph.plateTrack.setMessage(null)
                                                                    plate_graph.plateTrack.setMessage("These are the Assumptions! You will edit these.", 1)
                                                                    setTimeout(() => {
                                                                        plate_graph.plateTrack.killSprite()
                                                                        let pr = []
                                                                        let formula = []
                                                                        for (let p of plate_graph.plateTrack.root) {
                                                                            pr.push(p.toValueFormulaJSON())
                                                                            formula.push({ 'Table': p.name, 'HAS these assignments': p.getFormula() })
                                                                        }

                                                                        let g = CurrentLayout.getStashed('graph')
                                                                        if (g)
                                                                            g.touchMe();

                                                                        pt.updateCalculations();
                                                                        setTimeout(async () => {
                                                                            let t = plate_graph.plateTrack.getTableByName('Assumptions')
                                                                            plate_graph.plateTrack.setMessage('PnL', 5)
                                                                            let ts = (t.toValueFormulaJSON())
                                                                            let pnl = await exec('py/openai/pnl.py', user_prompt, ts)

                                                                            let r = await exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, pnl)
                                                                            plate_graph.plateTrack.setMessage("Profit and Loss formulas added ---formulas that use the assumptions", 1)

                                                                            setTimeout(async () => {
                                                                                let pr = []
                                                                                let formula = []
                                                                                for (let p of plate_graph.plateTrack.root) {
                                                                                    pr.push(p.toValueFormulaJSON())
                                                                                    formula.push({ 'Table': p.name, 'HAS these assignments': p.getFormula() })
                                                                                }
                                                                                let g = CurrentLayout.getStashed('graph')
                                                                                if (g)
                                                                                    g.touchMe();
                                                                                let items = []
                                                                                plate_graph.plateTrack.updateCalculations();
                                                                                let WellDisplay = await exec('baja/plate/views/well-display-factory')

                                                                                setTimeout(async () => {

                                                                                    let ls = [
                                                                                    ]
                                                                                    for (let p of plate_graph.plateTrack.root) {
                                                                                        ls.push(p.toValueFormulaJSON())
                                                                                    }

                                                                                    let g = CurrentLayout.getStashed('graph')
                                                                                    if (g)
                                                                                        g.touchMe();

                                                                                    pt.layoutCompactTetris();
                                                                                    plate_graph.plateTrack.setMessage("Timeline...", 5)

                                                                                    let model3 = await exec('py/openai/time-money.py', ls)
                                                                                    let rrr = await exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model3);
                                                                                    pt.killSprite();
                                                                                    pt.zoomouttoFit();

                                                                                    pt.layoutCompactTetris();

                                                                                    plate_graph.plateTrack.updateCalculations();
                                                                                    for (let p of plate_graph.plateTrack.root) {
                                                                                        ls.push(p.toValueFormulaJSON())
                                                                                    }

                                                                                    for (let p of plate_graph.plateTrack.root) {
                                                                                        p.selectWellsByString('[1:][1:]')
                                                                                        const se = p.getSelectedWellsInOrder();
                                                                                        for (let w of se) {
                                                                                            items.push({
                                                                                                id: w.uid,
                                                                                                value: w.value,
                                                                                                fields: Object.keys(w.group),
                                                                                                wtype: ''
                                                                                            })
                                                                                        }
                                                                                    }

                                                                                    plate_graph.plateTrack.updateCalculations();
                                                                                    pt.separatePlatesOverTime({
                                                                                        spacing: 0,
                                                                                        durationMs: 5_000,
                                                                                        iterationsPerFrame: 8,
                                                                                        explodeFrac: 0.13,
                                                                                        explodeStep: 1,
                                                                                        wanderStep: 0.5,
                                                                                        jitterReseedRate: 0.25,
                                                                                        keepStrictCenter: true
                                                                                    });

                                                                                    setTimeout(async () => {
                                                                                        ls = [
                                                                                        ]
                                                                                        for (let p of pm.plateTrack.root) {
                                                                                            ls.push(p.toValueUID())
                                                                                        }
                                                                                        let model4 = await exec('py/openai/find-waterfall-plot-wells.py', getUser(), ls)
                                                                                        let model5 = await exec('py/openai/quarterly-report.py', getUser(), ls)
                                                                                        const plotFactory = await exec('flexigraph/plot.js', MGrid);
                                                                                        const MPlot = (await plotFactory) || plotFactory;

                                                                                        const getWellsFromJSON = (root, data) => {
                                                                                            const wellsList = Array.isArray(data?.wells) ? data.wells : [];
                                                                                            if (!Array.isArray(root) || !root.length) return [];
                                                                                            const plateMap = new Map();
                                                                                            for (const plate of root) {
                                                                                                const name = plate?.name || plate?.plate || plate?.id;
                                                                                                if (name) plateMap.set(String(name), plate);
                                                                                            }
                                                                                            const out = [];
                                                                                            for (const w of wellsList) {
                                                                                                const plateName = w?.plate;
                                                                                                const plate = plateMap.get(plateName);
                                                                                                if (!plate || !Array.isArray(plate.wells)) continue;

                                                                                                const col = Number(w?.x) - 1;
                                                                                                const row = Number(w?.y) - 1;

                                                                                                if (row > 0) {

                                                                                                    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

                                                                                                    const colArr = plate.wells[col];
                                                                                                    if (!Array.isArray(colArr)) continue;

                                                                                                    const well = colArr[row];

                                                                                                    const rightColArr = plate.wells[col + 1][row];
                                                                                                    const right = Array.isArray(rightColArr) ? rightColArr[row] : null;

                                                                                                    if (well) {
                                                                                                        out.push(well);
                                                                                                        out.push(rightColArr);
                                                                                                    }
                                                                                                }
                                                                                            }

                                                                                            return out;
                                                                                        }

                                                                                        let wells = getWellsFromJSON(pm.plateTrack.root, model4)
                                                                                        for (let w of wells) {
                                                                                            w.selectIt();
                                                                                        }
                                                                                        const points = MPlot.buildWaterfallFromGroups(wells)
                                                                                        pm.plateTrack.deselectAll();
                                                                                        const scatterData = { points };
                                                                                        const plot = new MPlot(scatterData, MGrid);
                                                                                        plot.type = 'waterfall';
                                                                                        const maxX = Math.max(...scatterData.points.map(p => p.x));
                                                                                        const maxY = Math.max(...scatterData.points.map(p => p.y));
                                                                                        plot.grid.setxmax(maxX);
                                                                                        plot.grid.setymax(maxY);
                                                                                        plot.errorBarColor = 'gray';
                                                                                        plot.fitScaleToData = false;
                                                                                        plot.grid.setxmin(0); plot.name = 'Income Statement – Waterfall';
                                                                                        plot.x_axis_label = '';
                                                                                        plot.y_axis_label = 'USD';
                                                                                        plot.setWidth(pt.grid.worldWidth(300))
                                                                                        plot.setHeight(pt.grid.worldHeight(250))

                                                                                        pm.plateTrack.zoomouttoFit();

                                                                                        setTimeout(() => {
                                                                                            pm.plateTrack.setMessage("This is not a complete model but a good start...", 1)
                                                                                            pt.addNextAvailableX(plot);
                                                                                            setTimeout(() => {
                                                                                                pm.plateTrack.layoutCompactTetris();
                                                                                                setTimeout(() => {
                                                                                                    pm.plateTrack.setMessage("Green arrows are input contros. NOTE: Not all are used... ", 1)

                                                                                                    setTimeout(async () => {

                                                                                                        pt.killSprite();

                                                                                                        let pnl = pt.getTableByName("PnL")
                                                                                                        if (pnl) {

                                                                                                            pnl.addActionGlyph(pt, 'Click here to plot timeline vs cash', pnl_timeline)
                                                                                                            setTimeout(() => {
                                                                                                                pnl.actionGlyph = null
                                                                                                            }, 25000)
                                                                                                        }

                                                                                                        pm.plateTrack.setMessage("Green arrows are input contros. NOTE: Not all are used... ", 1)

                                                                                                    }, 10000)

                                                                                                }, 4000)

                                                                                            }, 1000)

                                                                                        }, 1000)

                                                                                    }, 200)

                                                                                }, 400)
                                                                            }, 100)
                                                                            plate_graph.plateTrack.___formula_integrity_report = pnl;
                                                                        }, 1000)
                                                                    }, 3000)
                                                                    plate_graph.plateTrack.___formula_integrity_report = model;
                                                                })
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)

                    })
                })

                ai_create_file_items.push({
                    'label': 'P&L With Capital', 'ionfunction': createIonFunction(async () => {
                        const plate_graph = pm;
                        const pt = pm.plateTrack;
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });
                        const txt = 'I want to create a small therapeutics company with two commercial products for rare disease indications. ';
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 450);

                        let sequence_input = {
                            wid: 'card',
                            "height": "500px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "500px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `

                                                <H4>
  <font color="navy">

                                                Describe the model you want to create below:
                                                </font> </h4>
                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "600px",
                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor.setContent("")
                                                        initalText = false;
                                                    }),

                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build', ionFunction: createIonFunction(async () => {

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                let interval = null;
                                                                let em = new EngineMonitor((msg) => {
                                                                    plate_graph.plateTrack.updateSprite(msg)
                                                                });
                                                                em.addProgressListener(async (v) => {
                                                                    if (v >= 100) {
                                                                    }
                                                                })
                                                                let content = sequenceTextEditor.getContent();
                                                                const user_prompt = content;
                                                                plate_graph.plateTrack.setMessage("Generating Assumptions...", 5)
                                                                let model = await exec('py/openai/assumptions.py', em, content)
                                                                let model_captial = await exec('py/openai/capital-assumptions.py', em, getUser(), content)
                                                                await exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model_captial)

                                                                exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model).then(async r => {
                                                                    plate_graph.plateTrack.setMessage(null)
                                                                    plate_graph.plateTrack.setMessage("These are the Assumptions! You will edit these.", 1)
                                                                    setTimeout(() => {
                                                                        plate_graph.plateTrack.killSprite()
                                                                        let pr = []
                                                                        let formula = []
                                                                        for (let p of plate_graph.plateTrack.root) {
                                                                            pr.push(p.toValueFormulaJSON())
                                                                            formula.push({ 'Table': p.name, 'HAS these assignments': p.getFormula() })
                                                                        }

                                                                        let g = CurrentLayout.getStashed('graph')
                                                                        if (g)
                                                                            g.touchMe();

                                                                        pt.updateCalculations();
                                                                        setTimeout(async () => {
                                                                            let t = plate_graph.plateTrack.getTableByName('Assumptions')
                                                                            plate_graph.plateTrack.setMessage('PnL', 5)
                                                                            let ts = (t.toValueFormulaJSON())
                                                                            let pnl = await exec('py/openai/pnl.py', user_prompt, ts)
                                                                            let r = await exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, pnl)
                                                                            plate_graph.plateTrack.setMessage("Profit and Loss formulas added ---formulas that use the assumptions", 1)

                                                                            setTimeout(async () => {
                                                                                let pr = []
                                                                                let formula = []
                                                                                for (let p of plate_graph.plateTrack.root) {
                                                                                    pr.push(p.toValueFormulaJSON())
                                                                                    formula.push({ 'Table': p.name, 'HAS these assignments': p.getFormula() })
                                                                                }
                                                                                let g = CurrentLayout.getStashed('graph')
                                                                                if (g)
                                                                                    g.touchMe();
                                                                                let items = []
                                                                                plate_graph.plateTrack.updateCalculations();
                                                                                setTimeout(async () => {
                                                                                    let ls = [
                                                                                    ]
                                                                                    for (let p of plate_graph.plateTrack.root) {
                                                                                        ls.push(p.toValueFormulaJSON())
                                                                                    }

                                                                                    let g = CurrentLayout.getStashed('graph')
                                                                                    if (g)
                                                                                        g.touchMe();

                                                                                    pt.layoutCompactTetris();
                                                                                    plate_graph.plateTrack.setMessage("Timeline...", 5)

                                                                                    let model4 = await exec('py/openai/time-money.py', ls)
                                                                                    plate_graph.plateTrack.updateCalculations();
                                                                                    let __d = await exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model4);

                                                                                    let model3 = await exec('py/openai/capital-required.py', ls)
                                                                                    let rrr = await exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model3);
                                                                                    pt.killSprite();
                                                                                    pt.zoomouttoFit();

                                                                                    pt.layoutCompactTetris();

                                                                                    plate_graph.plateTrack.updateCalculations();
                                                                                    for (let p of plate_graph.plateTrack.root) {
                                                                                        ls.push(p.toValueFormulaJSON())
                                                                                    }

                                                                                    for (let p of plate_graph.plateTrack.root) {
                                                                                        p.selectWellsByString('[1:][1:]')
                                                                                        const se = p.getSelectedWellsInOrder();
                                                                                        for (let w of se) {
                                                                                            items.push({
                                                                                                id: w.uid,
                                                                                                value: w.value,
                                                                                                fields: Object.keys(w.group),
                                                                                                wtype: ''
                                                                                            })
                                                                                        }
                                                                                    }

                                                                                    plate_graph.plateTrack.updateCalculations();
                                                                                    pt.separatePlatesOverTime({
                                                                                        spacing: 0,
                                                                                        durationMs: 5_000,
                                                                                        iterationsPerFrame: 8,
                                                                                        explodeFrac: 0.13,
                                                                                        explodeStep: 1,
                                                                                        wanderStep: 0.5,
                                                                                        jitterReseedRate: 0.25,
                                                                                        keepStrictCenter: true
                                                                                    });

                                                                                    setTimeout(async () => {
                                                                                        ls = [
                                                                                        ]
                                                                                        for (let p of pm.plateTrack.root) {
                                                                                            ls.push(p.toValueUID())
                                                                                        }
                                                                                        let model4 = await exec('py/openai/find-waterfall-plot-wells.py', getUser(), ls)
                                                                                        const plotFactory = await exec('flexigraph/plot.js', MGrid);
                                                                                        const MPlot = (await plotFactory) || plotFactory;

                                                                                        const getWellsFromJSON = (root, data) => {
                                                                                            const wellsList = Array.isArray(data?.wells) ? data.wells : [];
                                                                                            if (!Array.isArray(root) || !root.length) return [];
                                                                                            const plateMap = new Map();
                                                                                            for (const plate of root) {
                                                                                                const name = plate?.name || plate?.plate || plate?.id;
                                                                                                if (name) plateMap.set(String(name), plate);
                                                                                            }
                                                                                            const out = [];
                                                                                            for (const w of wellsList) {
                                                                                                const plateName = w?.plate;
                                                                                                const plate = plateMap.get(plateName);
                                                                                                if (!plate || !Array.isArray(plate.wells)) continue;

                                                                                                const col = Number(w?.x) - 1;
                                                                                                const row = Number(w?.y) - 1;

                                                                                                if (row > 0) {

                                                                                                    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

                                                                                                    const colArr = plate.wells[col];
                                                                                                    if (!Array.isArray(colArr)) continue;

                                                                                                    const well = colArr[row];

                                                                                                    const rightColArr = plate.wells[col + 1][row];
                                                                                                    const right = Array.isArray(rightColArr) ? rightColArr[row] : null;

                                                                                                    if (well) {
                                                                                                        out.push(well);
                                                                                                        out.push(rightColArr);
                                                                                                    }
                                                                                                }
                                                                                            }

                                                                                            return out;
                                                                                        }

                                                                                        let wells = getWellsFromJSON(pm.plateTrack.root, model4)
                                                                                        for (let w of wells) {
                                                                                            w.selectIt();
                                                                                        }
                                                                                        const points = MPlot.buildWaterfallFromGroups(wells)
                                                                                        pm.plateTrack.deselectAll();
                                                                                        const scatterData = { points };
                                                                                        const plot = new MPlot(scatterData, MGrid);
                                                                                        plot.type = 'waterfall';
                                                                                        const maxX = Math.max(...scatterData.points.map(p => p.x));
                                                                                        const maxY = Math.max(...scatterData.points.map(p => p.y));
                                                                                        plot.grid.setxmax(maxX);
                                                                                        plot.grid.setymax(maxY);
                                                                                        plot.errorBarColor = 'gray';
                                                                                        plot.fitScaleToData = false;
                                                                                        plot.grid.setxmin(0); plot.name = 'Income Statement – Waterfall';
                                                                                        plot.x_axis_label = '';
                                                                                        plot.y_axis_label = 'USD';
                                                                                        plot.setWidth(pt.grid.worldWidth(300))
                                                                                        plot.setHeight(pt.grid.worldHeight(250))

                                                                                        pm.plateTrack.zoomouttoFit();

                                                                                        pt.killSprite();

                                                                                        setTimeout(() => {
                                                                                            pm.plateTrack.setMessage("This is not a complete model but a good start...", 1)
                                                                                            pt.addNextAvailableX(plot);
                                                                                            setTimeout(() => {
                                                                                                pm.plateTrack.layoutCompactTetris();
                                                                                                setTimeout(() => {
                                                                                                    pm.plateTrack.setMessage("Green arrows are input contros. NOTE: Not all are used... ", 1)

                                                                                                }, 4000)

                                                                                            }, 1000)

                                                                                        }, 1000)

                                                                                    }, 200)

                                                                                }, 400)
                                                                            }, 100)
                                                                            plate_graph.plateTrack.___formula_integrity_report = pnl;
                                                                        }, 1000)
                                                                    }, 3000)
                                                                    plate_graph.plateTrack.___formula_integrity_report = model;
                                                                })
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)

                    })
                })

                ai_create_file_items.push({
                    'label': 'Budget Assumptions', 'ionfunction': createIonFunction(async () => {
                        const plate_graph = pm;
                        const pt = pm.plateTrack;
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });
                        const txt = 'I want to create a podcast on youtube.  Give me variables and default values for this project. ';
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 150);

                        let sequence_input = {
                            wid: 'card',
                            "height": "300px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "200px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `

                                                <H4>
  <font color="navy">

                                                Write a paragraph that describes the project:
                                                </font> </h4>
                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "600px",
                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor.setContent("")
                                                        initalText = false;
                                                    }),

                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build', ionFunction: createIonFunction(async () => {

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                                plate_graph.plateTrack.setMessage("Generating Assumptions...", 5)

                                                                let interval = null;
                                                                let em = new EngineMonitor((msg) => {
                                                                    plate_graph.plateTrack.updateSprite(msg)
                                                                });
                                                                em.addProgressListener(async (v) => {
                                                                    if (v >= 100) {
                                                                    }
                                                                })
                                                                let content = sequenceTextEditor.getContent();
                                                                let model = await exec('py/openai/assumptions.py', em, content)

                                                                exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model).then(async r => {
                                                                    plate_graph.plateTrack.setMessage(null)
                                                                    plate_graph.plateTrack.setMessage("These are the Assumptions! You can edit/add these.", 1)
                                                                    setTimeout(async () => {

                                                                        let t = plate_graph.plateTrack.getTableByName('Assumptions')
                                                                        let ts = t.toValueFormulaJSON()

                                                                        plate_graph.plateTrack.updateCalculations();
                                                                        plate_graph.plateTrack.killSprite()
                                                                    }, 3000)
                                                                    plate_graph.plateTrack.___formula_integrity_report = model;
                                                                })
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)

                    })
                })

                ai_create_file_items.push(
                    {
                        'label': 'Templates', 'ionfunction': createIonFunction(async () => {
                            const templates = [
                                {
                                    label: 'Tables', click: (async () => {
                                        try {
                                            let tree = await exec('baja/table/datayak-analytics-tables', pm, graph)
                                            let treeStack = []
                                            const renderTree = async (nodeList, panelName = 'mainPanel') => {
                                                nodeList = nodeList.filter(node => node !== null)
                                                if (!Array.isArray(nodeList) || nodeList.length === 0) return;
                                                let localNodeList = [...nodeList];
                                                if (treeStack.length > 0) {
                                                    localNodeList.push(
                                                        {
                                                            'label': 'Back...',
                                                            click: () => {
                                                                if (treeStack.length > 0) {
                                                                    setTimeout(async () => {
                                                                        tree = treeStack.pop();
                                                                        await renderTree(tree, panelName);
                                                                        return;
                                                                    }, 500)
                                                                }
                                                            }
                                                        })

                                                }

                                                localNodeList.push(
                                                    {
                                                        'label': 'Close',
                                                        click: async () => {
                                                            CurrentLayout.reset(panelName);
                                                        }
                                                    })
                                                const buildDesc = async (items) => {
                                                    let descl = {}

                                                    for (let i of items) {
                                                        if (i.path) {
                                                            try {

                                                                let pp = removeLastFileNode(i.path)

                                                                let r = await load_file('/baja/templates/' + pp, i.label + '.desc');
                                                                if (r && r.rule_value)
                                                                    i.desc = r.rule_value;
                                                            } catch (exception) { }
                                                            if (i && i.desc) {
                                                                descl[i.label] = i.desc
                                                            }
                                                        }
                                                    }
                                                    return descl;
                                                }
                                                localNodeList = cleanTree(localNodeList)
                                                let its = await buildDesc(localNodeList)

                                                let component = {
                                                    wid: 'selection-list',
                                                    data: {
                                                        single_selection: true,
                                                        show_button: false,
                                                        singleSelect: true,
                                                        contentItems: its,
                                                        listItems: localNodeList.map(item => item.label),
                                                        button_function: createIonFunction(async (items) => {
                                                            let selectedLabel = items[0];
                                                            let selectedItem = localNodeList.find(item => item.label === selectedLabel);

                                                            if (selectedItem.click) {
                                                                await selectedItem.click();
                                                            }
                                                            CurrentLayout.reset(panelName);
                                                            if (selectedItem.children && selectedItem.children.length > 0) {
                                                                treeStack.push(nodeList);

                                                                tree = selectedItem.children.filter(node => node !== null)
                                                                tree = cleanTree(tree);
                                                                await renderTree(tree, panelName);
                                                            } else {

                                                            }
                                                        })
                                                    }
                                                };
                                                CurrentLayout.clearComponent(panelName);
                                                CurrentLayout.setComponent(panelName, component);
                                            }

                                            setTimeout(async () => {
                                                tree = cleanTree(tree);
                                                await renderTree(tree)
                                            }, 200)
                                        } catch (exception) { }

                                    })
                                },

                                {
                                    label: 'Models', click: (async () => {
                                        try {
                                            let tree = await exec('baja/table/datayak-analytics-models', pm, graph)
                                            let treeStack = []
                                            const renderTree = async (nodeList, panelName = 'mainPanel') => {
                                                nodeList = nodeList.filter(node => node !== null)
                                                if (!Array.isArray(nodeList) || nodeList.length === 0) return;
                                                let localNodeList = [...nodeList];

                                                if (treeStack.length > 0) {
                                                    localNodeList.push(
                                                        {
                                                            'label': 'Back...',
                                                            click: () => {
                                                                if (treeStack.length > 0) {
                                                                    setTimeout(async () => {
                                                                        tree = treeStack.pop();
                                                                        await renderTree(tree, panelName);
                                                                        return;
                                                                    }, 500)
                                                                }
                                                            }
                                                        })

                                                }

                                                localNodeList.push(
                                                    {
                                                        'label': 'Close',
                                                        click: async () => {
                                                            CurrentLayout.reset(panelName);
                                                        }
                                                    })
                                                const buildDesc = async (items) => {
                                                    let descl = {}

                                                    for (let i of items) {
                                                        if (i.path) {
                                                            try {

                                                                let pp = removeLastFileNode(i.path)

                                                                let r = await load_file('/baja/templates/' + pp, i.label + '.desc');
                                                                if (r && r.rule_value)
                                                                    i.desc = r.rule_value;
                                                            } catch (exception) { }
                                                            if (i && i.desc) {
                                                                descl[i.label] = i.desc
                                                            }
                                                        }
                                                    }
                                                    return descl;
                                                }
                                                localNodeList = cleanTree(localNodeList)
                                                let its = await buildDesc(localNodeList)

                                                let component = {
                                                    wid: 'selection-list',
                                                    data: {
                                                        single_selection: true,
                                                        show_button: false,
                                                        singleSelect: true,
                                                        contentItems: its,
                                                        listItems: localNodeList.map(item => item.label),
                                                        button_function: createIonFunction(async (items) => {
                                                            let selectedLabel = items[0];
                                                            let selectedItem = localNodeList.find(item => item.label === selectedLabel);

                                                            if (selectedItem.click) {
                                                                await selectedItem.click();
                                                            }

                                                            CurrentLayout.reset(panelName);

                                                            if (selectedItem.children && selectedItem.children.length > 0) {
                                                                treeStack.push(nodeList);

                                                                tree = selectedItem.children.filter(node => node !== null)
                                                                tree = cleanTree(tree);
                                                                await renderTree(tree, panelName);
                                                            } else {

                                                            }
                                                        })
                                                    }
                                                };
                                                CurrentLayout.clearComponent(panelName);
                                                CurrentLayout.setComponent(panelName, component);
                                            }

                                            setTimeout(async () => {
                                                tree = cleanTree(tree);
                                                await renderTree(tree)
                                            }, 200)
                                        } catch (exception) { }

                                    })
                                },
                            ]
                            console.log(" show menu ")
                            graph.showWindowMenu(templates, 10, 10, 400)

                        })
                    })

                file_items.push({
                    'label': 'New...', 'ionfunction': createIonFunction(async () => {
                        let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete all and start over?', async () => {
                            pm.plateTrack.reset('/app/cpd/editor');

                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, null)
                            CurrentLayout.setComponent('selectedPanel', button_canvas2)
                        })
                        showModal(confirm)
                    })
                })
                file_items.push({
                    'label': 'Copy All', 'ionfunction': createIonFunction(async () => {
                        const currentstate = await pm.plateTrack.capturePlateState();
                        try {
                            navigator.clipboard.writeText(currentstate).then(() => {
                                console.log("Object copied to clipboard!");
                                pm.plateTrack.setMessage(" Copied ")
                            }).catch(err => {
                                console.error("Failed to copy object to clipboard: ", err);
                            });
                            console.log('JSON plate state written to clipboard as plain text.');
                        } catch (err) {
                            console.error('Failed to write JSON plate state to clipboard:', err);
                        }

                    })
                })
                file_items.push({
                    'label': 'Open', 'ionfunction': createIonFunction(openSaveScreen)
                })

                file_items.push({
                    'label': 'Save as', 'ionfunction': createIonFunction(saveAsSaveScreen)
                })
                file_items.push({
                    'label': 'Publish Viewer (public access)', 'ionfunction': createIonFunction(publicPublish)
                })
                file_items.push({
                    'label': 'Download SVG', 'ionfunction': createIonFunction(() => {
                        graph.setMessage(" Generating SVG... ")
                        graph.saveToSVG();
                    })
                })

            }

            let editor;
            let innerComponentCallback__ = createIon((_panel) => {
                editor = _panel;
                if (editor) {
                    editor.setContent('')

                }
            })
            let editor2;
            let innerComponentCallback2 = createIon((_panel) => {
                editor2 = _panel;
            })

            function isArrayofArrays(variable) {
                return Array.isArray(variable) && variable.every(Array.isArray);
            }
            let new_plate_panel;
            let __nameHook___ = createIonFunction((ed) => {
                new_plate_panel = ed;
            });
            let new_type_panel;
            let __nameHook2 = createIonFunction((ed) => {
                new_type_panel = ed;
            });

            let yakfoldernames = [
                {
                    'label': 'Package current workspace', 'click': async () => {
                        graph.graph.canvas.canvas.nativeElement.focus();
                        const a = await exec('baja/package/trackpackyak', graph, pm.plateTrack);
                    }
                },
                {
                    'label': 'Cancel', 'click': async () => {
                        CurrentLayout.reset('mainPanel');
                    }
                }

            ]
            const cleanTree = (tree) => {
                if (!Array.isArray(tree)) return [];

                return tree
                    .filter(node => node !== null && node !== 'null' && typeof node === 'object')
                    .map(node => {
                        if (Array.isArray(node.children)) {
                            node.children = cleanTree(node.children);
                        }
                        return node;
                    })
                    .filter(node => {

                        return !(Array.isArray(node.children) && node.children.length === 0);
                    });
            };
            let top_menubar = {
            }
            if (file_items.length === 0 || ai_create_file_items.length === 0) {
                ai_create_file_items.push({
                    'label': 'Sign up to unlock', 'ionfunction': createIonFunction(async () => {
                        signup();
                    })
                })
                file_items.push({
                    'label': 'Sign up to unlock', 'ionfunction': createIonFunction(async () => {
                        signup();
                    })
                })
            }

            top_menubar = {
                'width': '100%',
                'component': {
                    wid: 'menu',
                    data: {

                        menus: [
                            {
                                'label': 'File', 'items': file_items
                            },
                            {
                                'label': 'Build', 'items': ai_create_file_items
                            },

                            {
                                label: 'Draw',
                                items: [

                                    {
                                        label: 'Timeline', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/timeline', pm)

                                            graph.setMessageCenter('Click and drag a box... ', 40)

                                        })
                                    },
                                    {
                                        label: 'Table', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/table-selection-list', pm)
                                            graph.setMessageCenter('Click and drag a box... ', 40)

                                        })
                                    },

                                    {
                                        label: 'Postit Note', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-postit.js', pm.plateTrack)

                                            graph.setMessageCenter('Click on the spot you want to post a note... ', 40)

                                        })
                                    },
                                    {
                                        label: 'Simple Arrow', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-arrow.js', pm.plateTrack)
                                            graph.setMessageCenter('Click and drag the arrow... ', 40)

                                        })
                                    },
                                    {
                                        label: 'Notebook', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-simple-note.js', pm.plateTrack)
                                            graph.setMessageCenter('Click on the spot you want to post a note... ', 40)

                                        })
                                    },
                                    {
                                        label: 'Arrow Note (left)', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'left')
                                            graph.setMessageCenter('Click on the spot you want to post a note... ', 40)

                                        })
                                    },
                                    {
                                        label: 'Arrow Note (right)', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'right')
                                            graph.setMessageCenter('Click on the spot you want to post a note... ', 40)

                                        })
                                    },
                                    {
                                        label: 'Arrow Note (Up)', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'up')
                                            graph.setMessageCenter('Click on the spot you want to post a note... ', 40)

                                        })
                                    },
                                    {
                                        label: 'Arrow Note (Down)', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'down')
                                            graph.setMessageCenter('Click on the spot you want to post a note... ', 40)

                                        })
                                    },
                                ]
                            },

                            {
                                'label': 'Style', 'items': [

                                    {
                                        label: 'Themes & Backgrounds', ionfunction: createIonFunction(async () => {
                                            const scenes = await exec('baja/plate/plate-track-backgrounds')
                                            const names = Object.keys(scenes).filter(name => name !== '');

                                            names.push('Close')
                                            let t = {
                                                wid: 'selection-list',
                                                data: {
                                                    single_selection: true,
                                                    show_button: false,
                                                    singleSelect: true,
                                                    listItems: names,
                                                    button_function: createIonFunction(async (items) => {
                                                        let selectedLabel = items[0];
                                                        pm.plateTrack.background_function = scenes[selectedLabel]
                                                        CurrentLayout.reset('mainPanel')
                                                        hideAllModal();

                                                    })
                                                }
                                            };

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', t);

                                        })
                                    },

                                    {
                                        label: 'Resize Tables to defaults', ionfunction: createIonFunction(async () => {
                                            pm.plateTrack.resizePlatesToEqualizeCellSize();
                                        })
                                    },
                                    {
                                        label: 'Distribute Tables evenly', ionfunction: createIonFunction(async () => {

                                            pm.plateTrack.layoutCompactTetris();
                                        })
                                    },

                                    {
                                        label: 'Display Preferences', ionfunction: createIonFunction(async () => {

                                            const names = [
                                            ]
                                            let targetObject = pm.plateTrack;

                                            Object.keys(targetObject).forEach(key => {
                                                if (typeof targetObject[key] === 'boolean' && key.startsWith('attr__')) {
                                                    const label = key.replace(/^attr__/i, '').replace(/([A-Z])/g, ' $1').toLowerCase();
                                                    const formattedLabel = label.charAt(0).toUpperCase() + label.slice(1);
                                                    const actionLabel = targetObject[key] ? `Disable ${formattedLabel}` : `Enable ${formattedLabel}`;
                                                    names.push({ key, label: actionLabel });
                                                }
                                            });

                                            names.push({
                                                "label": "Close", "click": () => {
                                                    CurrentLayout.reset('mainPanel')
                                                    hideAllModal();
                                                }
                                            });

                                            let t = {
                                                wid: 'selection-list',
                                                data: {
                                                    single_selection: true,
                                                    show_button: false,
                                                    singleSelect: true,
                                                    listItems: names.map(item => item.label),
                                                    button_function: createIonFunction(async (items) => {
                                                        let selectedLabel = items[0];
                                                        let selectedItem = names.find(item => item.label === selectedLabel);

                                                        if (selectedItem) {
                                                            targetObject[selectedItem.key] = !targetObject[selectedItem.key];
                                                        }
                                                        CurrentLayout.reset('mainPanel')
                                                        hideAllModal();

                                                    })
                                                }
                                            };

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', t);

                                        })
                                    }

                                ]
                            },
                            {
                                'label': 'Ops', 'items': [
                                    {
                                        label: 'View workflow Stream...', ionfunction: createIonFunction(async () => {
                                            await exec('baja/table/show-flow', pm)

                                        })
                                    },
                                    {
                                        label: 'Open workflow', ionfunction: createIonFunction(async () => {
                                            let rs = await exec('manchester/io/open-workstream.js', pm)
                                            await exec('baja/table/show-flow-editor', rs)

                                        })
                                    },
                                    {
                                        label: 'Folders', ionfunction: createIonFunction(async () => {

                                            try {
                                                setTimeout(async () => {

                                                    let t = {
                                                        wid: 'selection-list',
                                                        data: {
                                                            single_selection: true,
                                                            show_button: false,
                                                            singleSelect: true,
                                                            listItems: yakfoldernames.map(item => item.label),
                                                            button_function: createIonFunction(async (items) => {
                                                                let selectedLabel = items[0];
                                                                let selectedItem = yakfoldernames.find(item => item.label === selectedLabel);

                                                                CurrentLayout.reset('mainPanel');
                                                                selectedItem.click()

                                                            })
                                                        }
                                                    };

                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', t);

                                                }, 1000)
                                            } catch (exception) { }

                                        })
                                    },
                                    {
                                        label: 'Publish', ionfunction: createIonFunction(async () => {
                                            try {
                                                setTimeout(async () => {
                                                    const plateTrack__ = pm.plateTrack;
                                                    let Plate = await exec('baja/plate/plate.js');
                                                    let attr_window = ''
                                                    let va = await prompt("Publish name: ", ["Name"], { "Name": attr_window }, 500, 300)
                                                    let HM = await exec('baja/history/HM')

                                                    let m = va['Name']
                                                    let plate = new Plate(m, 1, 1);
                                                    plate.plateType = 'package'
                                                    plate.completeNullValues();
                                                    let index = 0;

                                                    plate.setWellValue(0, index, m)
                                                    const stringData = compressbinaryData(compressString(HM(plateTrack__)))
                                                    plateTrack__.reset();
                                                    const rectWidth = plateTrack__.grid.worldWidth(200);
                                                    const rectHeight = plateTrack__.grid.worldHeight(100);

                                                    plate.wells[0][0].properties['package'] = stringData;
                                                    plate.setWellType(0, index, 'PACKAGE')
                                                    plate.grid.width = (rectWidth);
                                                    plate.grid.height = (rectHeight);
                                                    plate.grid.xi = (plateTrack__.grid.Xwc(plateTrack__.grid.width / 2) - rectWidth);
                                                    plate.grid.yi = plateTrack__.grid.Ywc(plateTrack__.grid.height / 2);
                                                    setTimeout(() => {
                                                        plateTrack__.root.push(plate);
                                                        pm.plateTrack.zoomintoplate(plate)
                                                    }, 1000);

                                                }, 100)
                                            } catch (exception) { }

                                        })
                                    },
                                    {
                                        label: 'Add Formula', ionfunction: createIonFunction(async () => {
                                            pm.plateTrack.addFormulaUI();
                                        })
                                    },
                                    {
                                        label: 'Fix tables', ionfunction: createIonFunction(async () => {
                                            for (let r of pm.plateTrack.root) {
                                                r.attr__displayMenuButtons = false;
                                                r.attr__ShowTableName = true;
                                                r.attr__displayNumberValues = false;
                                                r.attr__RowAddRemoveButtons = false;
                                                r.attr__ShowFishEyeLense = false;
                                                r.attr__displayCellButtons = false;

                                            }

                                        })
                                    },
                                    {
                                        label: 'Un-fix tables', ionfunction: createIonFunction(async () => {
                                            for (let r of pm.plateTrack.root) {
                                                r.attr__displayMenuButtons = true;
                                                r.attr__ShowTableName = true;
                                                r.attr__displayNumberValues = true;
                                                r.attr__RowAddRemoveButtons = true;
                                                r.attr__ShowFishEyeLense = true;
                                                r.attr__displayCellButtons = true;

                                            }

                                        })
                                    },
                                    {
                                        label: 'Import DM (advanced)', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/data-model-to-tables', pm.plateTrack)
                                        })
                                    },
                                    {
                                        label: 'Prune DM (advanced)', ionfunction: createIonFunction(async () => {
                                            let r = pm.plateTrack.root;
                                            r = r.filter((obj, index, self) =>
                                                index === self.findIndex(o => o.name === obj.name)
                                            );
                                            pm.plateTrack.root = r;

                                        })
                                    },

                                    {
                                        label: 'Run', ionfunction: createIonFunction(async () => {
                                            await exec('baja/table/show-flow-editor')
                                        })
                                    },
                                ]

                            },

                        ]
                    }
                }

            }

            genegraph_panel_layout = {
                wid: 'card',
                componentRef: 'geneGraphPanel',
                data: {
                    cards: [
                        [
                            top_menubar,
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
                                'height': '100vh',
                                'component': genegraph_panel_layout
                            }
                        ]]
                }
            }
            clear();
            showWidget(
                main_layout
            );
            CurrentLayout.stash('mainPanel', genegraph_panel_layout)

            working.status = 'complete'
            let m = window['env']['theme']
            if (!m) {
                m = 'bajabio'
            }
            graph.setMessageCenter(m, 40)
            setTimeout(() => {
                graph.isPreviousState().then(r => {
                    if (r) {
                    }
                })
                if (wb)
                    wb(null)

                graph.setMessage('')
                graph.setMessageCenter(' bajabio ', 40)
                pm.plateTrack.__canvas__ = graph.graph.canvas;
                CurrentLayout.stash('graph-canvas', graph.graph.canvas)
                CurrentLayout.stash('plate-track', pm)
                CurrentLayout.stash('graph', graph)
            }, 1000)
        })

    })

}
