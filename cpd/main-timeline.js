function (path, config) {
    if (!config) {
        config = {
            mode: "editor"
        }
        config.mode = 'editor'
    } else if (!config.mode) {
        config.mode = 'editor'
    }
    const EditorState = class EditorState {
        paste_to_graph = true;
    }
    let eeditor_state = new EditorState();
    function parseENSTWords(str) {
        const words = str.split(/\s+/);
        const enstWords = words.filter(word => word.toUpperCase().startsWith('ENST'));
        return enstWords;
    }
    function hasMultipleENSTWords(str) {
        const words = str.split(/\s+/);
        const enstWords = words.filter(word => word.toUpperCase().startsWith('ENST'));
        return enstWords.length > 1;
    }

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
            return exec('baja/nogo.js', path, 'baja-analytics')
    }

    showWidget({
        wid: 'html',
        data: '<hr> Loading... '
    }).then(async working => {

        let HM = await exec('baja/history/HM')
        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let PlateTrack = await exec('baja/plate/plate-track.js')
        let MGrid = await exec('flexigraph/grid.js')

        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')
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

                    }
                    else if (this.selectedPanel === sel) {
                        let comp = CurrentLayout.getComponent('selectedPanel')
                        if (copm && comp.components && comp.components[0]) {
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
        exec('flexigraph/gene2plates.js', pm, progressBar).then(async (graph) => {
            cacheOn()
            let io;
            let tracks;
            let genegraph_panel_layout;

            if (window['env']['auth'] === 'b2c') {

                const jsonobj = {
                    email: getUser()
                };
                let __path = path;
                let host_ = window['env']['apiUrl']
                let rs = await POSTJSON(jsonobj, host_ + '/verify-user');
                if (rs.tempFiles) {
                    const currentState = rs.tempFiles.find(file => file.endsWith('bajabio'));
                    if (currentState) {
                        __path = path;
                        path = `/myfiles/.temp/${getPathAfterTemp(currentState)}`
                    }
                }

            }

            let { Track, TrackRef } = await exec('baja/bio/track.js')
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
                        window.history.pushState({ 'rna-screen': path }, 'yak', `/app/cpd/yak?path=${__path}`);

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
                        window.history.pushState({ 'rna-screen': path }, 'yak', `/app/cpd/yak?path=${__path}`);
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

                if (rs.tempFiles) {
                    let importFile = rs.tempFiles.find(file => file.includes('_import'));
                    if (importFile && pm.plateTrack.ifun) {
                        if (importFile) {
                            let tempIndex = importFile.indexOf('.temp');
                            if (tempIndex !== -1) {
                                importFile = importFile.substring(tempIndex + '.temp'.length + 1);
                            }
                        }
                        try {
                            pm.plateTrack.ifun = eval('(' + pm.plateTrack.ifun + ')');
                            await pm.plateTrack.ifun(pm.plateTrack, importFile)
                        } catch (exception) {
                            console.log(" Failed to execute the import funciton ");

                        }

                        rmUserTempFile('calendar_import.calendar_import')
                        rmUserTempFile('calendar_request.calendar_request')
                        rmUserTempFile('current_state.bjb')

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
                    event.preventDefault();
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
                            graph.addTrack(t);
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
                if (config && config.mode === 'viewer') {
                    if (wbset != null && wbset.id === 'drag-navigate') {

                    } else {
                        wbset = null;
                    }
                }
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
                    setTimeout(() => {
                        dragnavigate();
                    }, 100);
                    return;
                } else {
                    if (currentWorkbench && currentWorkbench.id && currentWorkbench.id === wbset.id) {
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
                            plate.clk_drag(pm.plateTrack)
                        }
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
                pushHistory(HM(plate))
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
                        pm.plateTrack.deselectAll();
                        plate.__resizing = false;
                        plate.resizable = false;
                        plate.__resizing = false;
                        plate.clk_drag(pm.plateTrack)
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
                }

                if (plate_selected && plate_selected.inResize && plate_selected.inResize(scx, scy, pm.plateTrack)) {
                    if (plate_selected.typeof && plate_selected.typeof === 'plot') {
                        return resize_plot(plate_selected, scx, scy)
                    } else {
                        return resize_plate(plate_selected, scx, scy);
                    }
                }

                if (plate_selected && plate_selected.onRightEdge && plate_selected.onRightEdge(scx, scy, pm.plateTrack)) {
                    return resize_plate_width(plate_selected, scx, scy);

                }
                if (!smenu && pm.plateTrack) {
                    await pm.plateTrack.mouseDown(scx, scy)
                }
                if (mouseDownListener) {
                    mouseDownListener(scx, scy)
                }

                if (plate_selected) {
                    plate_selected.last_touched = new Date();
                    if (plate_selected.selectIt)
                        plate_selected.selectIt(pm.plateTrack);
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
                if (!mouse_down) {
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
                    for (let i = 0; i < items.length; i++) {
                        let item = items[i]
                        if (item.type === 'text/plain') {

                            try {
                                item.getAsString(async (text) => {
                                    try {

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

                                            } else
                                                if (parsed.plateType && parsed.wells) {
                                                    const pw = Plate.buildPlateFromJSON(parsed);
                                                    pm.plateTrack.addNextAvailableX(pw)
                                                    setTimeout(() => {
                                                        pm.plateTrack.zoomintoplate(pw)
                                                    }, 1000);
                                                    return;
                                                } else
                                                    if (parsed.plateType && parsed.plateType === 'package') {
                                                        const pl = Plate.buildPlateFromJSON(parsed)
                                                        pm.plateTrack.addNextAvailableX(pl)
                                                        setTimeout(() => {
                                                            pm.plateTrack.zoomintoplate(pl)
                                                        }, 1000)

                                                    } else
                                                        if (parsed.plate_track) {
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

                        } else if (item.kind === 'file' && item.type === 'text/plain') {
                            const blob = item.getAsFile();
                            const reader = new FileReader();
                            reader.onload = async (e) => {
                                const text = e.target.result;
                                await exec('baja/plate/data/import-data.js', text, pm.plateTrack, genegraph_panel_layout)
                            };
                            reader.readAsText(blob);
                            return;
                        } else if (item.kind === 'file' && item.type === 'image/png') {
                            const file = item.getAsFile();
                            const img = new Image();
                            img.onload = () => loadImageToCanvas(img);
                            img.src = URL.createObjectURL(file);

                        }
                        else if (item.type.startsWith('image/') && items.length === 1) {

                            const file = item.getAsFile();
                            const img = new Image();
                            img.onload = () => loadImageToCanvas(img);
                            img.src = URL.createObjectURL(file);

                        }
                    }
                }
            })
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

            let priority = false;

            const default_touchStart = (x, y) => {

                alert(' test ')

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
            if (MSGraph.isLoggedIn()) {

                if (isMobile()) {
                    button_canvas = await exec('manchester/controls/navigation-panel-plates-mobile.js', pm)
                } else {
                    button_canvas = await exec('manchester/controls/navigation-panel-plates-cpd.js', pm)
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
            } else {
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
                                                        'component': {
                                                            wid: 'html',
                                                            data: ''
                                                        }
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
                                                        'component': {
                                                            wid: 'html',
                                                            data: ''
                                                        }
                                                    },
                                                ]]
                                        }
                                    }
                                },
                            ]]
                    }
                }
            }

            progressBar(60);
            let saveSaveScreen = async () => {
                await exec('manchester/io/save-obj-tp.js', graph, genegraph_panel_layout, path, '/app/cpd/yak')
            }
            let saveAsSaveScreen = async () => {
                await exec('manchester/io/save-as-obj-tp.js', graph, genegraph_panel_layout, path, '/app/cpd/yak')
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

                    await exec('manchester/io/save-as-obj-tp-public.js', graph, genegraph_panel_layout, path, '/app/cpd/yak', im)
                } else {
                    await exec('manchester/io/save-as-obj-tp-public.js', graph, genegraph_panel_layout, path, '/app/cpd/yak')
                }
            }
            let openSaveScreen = async () => {
                let v = await exec('baja/table/io/open-yakro', graph, pm, '/app/cpd/yak')
                showModal(v)
            }
            progressBar(80);

            let file_items = []
            if (user != null && user.length > 0) {
                file_items.push({
                    'label': 'New...', 'ionfunction': createIonFunction(async () => {
                        let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete all and start over?', async () => {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, null)
                            CurrentLayout.setComponent('selectedPanel', button_canvas2)
                            pm.plateTrack.reset('/app/cpd/main-timeline');
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
                    'label': 'Save', 'ionfunction': createIonFunction(saveSaveScreen)
                })
                file_items.push({
                    'label': 'Save as', 'ionfunction': createIonFunction(saveAsSaveScreen)
                })
                file_items.push({
                    'label': 'Viewer', 'ionfunction': createIonFunction(() => {
                        exec('cpd/view', path, config)
                    })
                })
                file_items.push({
                    'label': 'Publish Viewer (public access)', 'ionfunction': createIonFunction(publicPublish)
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

            function arrayOfArraysToTable(arr) {
                if (!Array.isArray(arr) || !arr.every(Array.isArray)) {
                    throw new Error('Input must be an array of arrays');
                }

                const maxRows = Math.max(...arr.map(innerArr => innerArr.length));

                let table = '';

                for (let row = 0; row < maxRows; row++) {
                    let rowString = '';

                    for (let col = 0; col < arr.length; col++) {
                        const value = arr[col][row] !== undefined ? arr[col][row] : '';
                        rowString += value + '\t';
                    }

                    table += rowString.trim() + '\n';
                }

                return table;
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
            let m__ = [
                {
                    label: `Bookmarks`,
                    click: (xwc, ywc) => {
                        const pt = pm.plateTrack;

                        let keys = Object.keys(pt.bookmarks);
                        let bm = []

                        for (let key of keys) {
                            bm.push({
                                label: `${key}`,
                                click: (xwc, ywc) => {

                                    setTimeout(() => {
                                        pt.setMessage(key)
                                        pt.goToBookmark(pt.bookmarks[key])
                                    }, 1000)
                                    CurrentLayout.reset('mainPanel')
                                }
                            })
                        }
                        graph.showWindowMenu(bm, 10, 10, 400)
                    }
                },
                {
                    label: `Tables`,
                    click: (xwc, ywc) => {
                        const pt = pm.plateTrack;
                        let bm = []
                        const vp = pt.getTablesAndPlots();
                        for (let v of vp) {
                            if (v.wells && v.wells.length > 0) {
                                bm.push({
                                    label: `${v.name}`,
                                    click: (xwc, ywc) => {
                                        setTimeout(() => {
                                            pt.zoomintoplate(v)
                                            pt.setSelected(v);
                                            pt.menu_vis = false;
                                        }, 100)
                                    },
                                }
                                )

                            } else {
                            }
                        }
                        graph.showWindowMenu(bm, 10, 10, 400)
                    }
                },
                {
                    label: `Timeline`,
                    click: (xwc, ywc) => {
                        const pt = pm.plateTrack;
                        let bm = []
                        const vp = pt.getTablesAndPlots();
                        for (let v of vp) {
                            if (v.type && v.type === 'timeline') {
                                bm.push({
                                    label: `${v.name}`,
                                    click: (xwc, ywc) => {
                                        setTimeout(() => {
                                            pt.zoomintoplate(v)
                                            pt.setSelected(v);
                                            pt.menu_vis = false;
                                        }, 100)
                                    },
                                }
                                )

                            } else {
                            }
                        }
                        graph.showWindowMenu(bm, 10, 10, 400)
                    }
                },

                {
                    label: 'Box-zoom', click: (async () => {
                        let currentShape = null;
                        const plate_graph = graph;
                        let Rectangle = await exec('flexigraph/shapes/rect.js')
                        let md = false;
                        pm.plateTrack.setMessage(" click and drag a rectangle ")
                        let mouseDownListener = async (x, y) => {

                            currentShape = new Rectangle('test', plate_graph.plateTrack.grid.Xwc(x), plate_graph.plateTrack.grid.Ywc(y));
                            currentShape.visible = true;
                            md = true;
                        }
                        let mouseMoveListener = (x, y) => {
                            if (!md) {
                                currentShape = null;
                                return;
                            }
                            if (currentShape) {
                                currentShape.update(plate_graph.plateTrack.grid.Xwc(x), plate_graph.plateTrack.grid.Ywc(y))
                            }
                        }
                        let mouseUpListener = async (x, y) => {
                            if (currentShape) {
                                let sw = plate_graph.plateTrack.grid.screenWidth(currentShape.w);
                                let sh = plate_graph.plateTrack.grid.screenHeight(currentShape.h);
                                if (sw < 20 || sh < 20) {
                                    currentShape = null;
                                    plate_graph.plateTrack.wb(null)
                                    return;
                                }

                                AnimateGrid.INTERUPT = false;
                                let ag = new AnimateGrid(plate_graph.plateTrack.grid);
                                await ag.animateTo((currentShape.x), currentShape.x + currentShape.w,
                                    currentShape.y - currentShape.h, currentShape.y, 10)

                                setTimeout(async () => {

                                    plate_graph.plateTrack.wb(null)

                                }, 1000)

                            }
                            currentShape = null;
                            md = false;
                        }
                        let t = {
                            id: 'override-box' + uuid(),
                            priority: true,
                            close: () => {
                                console.log("box done ")

                            },
                            mouseMoveListener: mouseMoveListener,
                            mouseUpListener: mouseUpListener,
                            mouseDownListener: mouseDownListener,
                            draw: (grid, ctx) => {
                                if (currentShape && currentShape.draw != null) {
                                    currentShape.draw(grid, ctx)
                                }

                            },
                        }
                        plate_graph.plateTrack.wb(t)
                        plate_graph.plateTrack.wb(t)
                    }), icon: '/assets/img/icons/png/box-zoom.svg', draw: (grid, ctx, mo, md, img) => {
                        drawRoundedRectIcon(12, grid, ctx, mo, md, img)

                    }

                },

                {
                    label: `Zoom out`,
                    click: (xwc, ywc) => {
                        zoomout();
                    }
                },
                {
                    label: `Zoom in`,
                    click: (xwc, ywc) => {
                        zoomin();
                    }
                },

            ]

            let interpreter = await exec('baja/engine/interpreter.js', pm.plateTrack)
            const top_menubar = {
                'width': '100%',
                'component': {
                    wid: 'menu',
                    data: {
                        cmd: createIon(async (str, panel) => {

                            let fal = await interpreter.executeCommand(str);
                            panel.setText('');
                        }),
                        menus: [
                            {
                                'label': 'File', 'items': file_items
                            },

                            {
                                label: 'Time',
                                items: [
                                    {
                                        label: 'Timelines', ionfunction: createIonFunction(async () => {
                                            try {
                                                let tree = await exec('baja/table/timelines-workbench-object-tree-single-use.js', pm)
                                                function renderTree(nodeList, panelName = 'mainPanel') {
                                                    nodeList = nodeList.filter(node => node !== null)
                                                    if (!Array.isArray(nodeList) || nodeList.length === 0) return;
                                                    let localNodeList = [...nodeList];
                                                    localNodeList.push(
                                                        {
                                                            'label': 'Close',
                                                            click: async () => {
                                                                CurrentLayout.reset(panelName);
                                                            }
                                                        })
                                                    const buildDesc = (items) => {
                                                        let descl = {}
                                                        for (let i of items) {
                                                            if (i && i.desc) {
                                                                descl[i.label] = i.desc
                                                            }
                                                        }
                                                        return descl;
                                                    }
                                                    localNodeList = cleanTree(localNodeList)
                                                    let component = {
                                                        wid: 'selection-list',
                                                        data: {
                                                            single_selection: true,
                                                            show_button: false,
                                                            singleSelect: true,
                                                            contentItems: buildDesc(localNodeList),
                                                            listItems: localNodeList.map(item => item.label),
                                                            button_function: createIonFunction(async (items) => {
                                                                let selectedLabel = items[0];
                                                                let selectedItem = localNodeList.find(item => item.label === selectedLabel);
                                                                if (selectedItem.click) {
                                                                    selectedItem.click();
                                                                }

                                                                CurrentLayout.reset(panelName);

                                                                if (selectedItem.children && selectedItem.children.length > 0) {
                                                                    tree = selectedItem.children.filter(node => node !== null)
                                                                    tree = cleanTree(tree);
                                                                    renderTree(tree, panelName);
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
                                                    renderTree(tree)
                                                }, 1000)
                                            } catch (exception) { }

                                        })
                                    },

                                    {
                                        label: 'Datasets', ionfunction: createIonFunction(async () => {
                                            try {
                                                let tree = await exec('baja/table/datayak-workbench-tables-tree', pm, graph)
                                                function renderTree(nodeList, panelName = 'mainPanel') {
                                                    nodeList = nodeList.filter(node => node !== null)

                                                    if (!Array.isArray(nodeList) || nodeList.length === 0) return;
                                                    let localNodeList = [...nodeList];
                                                    localNodeList.push(
                                                        {
                                                            'label': 'Close',
                                                            click: async () => {
                                                                CurrentLayout.reset(panelName);
                                                            }
                                                        })
                                                    const buildDesc = (items) => {
                                                        let descl = {}
                                                        for (let i of items) {
                                                            if (i && i.desc) {
                                                                descl[i.label] = i.desc
                                                            }
                                                        }
                                                        return descl;
                                                    }
                                                    localNodeList = cleanTree(localNodeList)

                                                    let component = {
                                                        wid: 'selection-list',
                                                        data: {
                                                            single_selection: true,
                                                            show_button: false,
                                                            singleSelect: true,
                                                            contentItems: buildDesc(localNodeList),
                                                            listItems: localNodeList.map(item => item.label),
                                                            button_function: createIonFunction(async (items) => {
                                                                let selectedLabel = items[0];
                                                                let selectedItem = localNodeList.find(item => item.label === selectedLabel);

                                                                if (selectedItem.click) {
                                                                    selectedItem.click();
                                                                }

                                                                CurrentLayout.reset(panelName);

                                                                if (selectedItem.children && selectedItem.children.length > 0) {
                                                                    tree = selectedItem.children.filter(node => node !== null)
                                                                    tree = cleanTree(tree);
                                                                    renderTree(tree, panelName);
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
                                                    renderTree(tree)
                                                }, 1000)
                                            } catch (exception) { }

                                        })
                                    },

                                ]
                            },
                            {
                                'label': 'Draw', 'items': [
                                    {
                                        label: 'Textbox', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-rectangle', pm.plateTrack)
                                        })
                                    },
                                    {
                                        label: 'Textarea', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/text.js', pm.plateTrack, "SIMPLE_TEXT")
                                        })
                                    },

                                    {
                                        label: 'Folder', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/folder.js', pm.plateTrack)
                                        })
                                    },
                                    {
                                        label: 'Arrow', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-arrow.js', pm.plateTrack)
                                        })
                                    },
                                    {
                                        label: 'Postit', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-postit.js', pm.plateTrack)
                                        })
                                    },
                                    {
                                        label: 'Loose leaf note', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-simple-note.js', pm.plateTrack)

                                        })
                                    },
                                    {
                                        label: 'Arrow Note (left)', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'left')

                                        })
                                    },
                                    {
                                        label: 'Arrow Note (right)', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'right')

                                        })
                                    },
                                    {
                                        label: 'Arrow Note (Up)', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'up')

                                        })
                                    },
                                    {
                                        label: 'Arrow Note (Down)', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'down')

                                        })
                                    },

                                    {
                                        label: 'Timeline', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/timeline', pm)
                                        })
                                    },

                                    {
                                        label: 'Table', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/table-selection-list', pm)
                                        })
                                    },
                                ]

                            },
                            {
                                label: 'Nav', 'items': m__
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
                                        label: 'Functions', ionfunction: createIonFunction(async () => {
                                            await exec('baja/table/show-function-editor', pm)

                                        })
                                    },
                                    {
                                        label: 'Preferences', ionfunction: createIonFunction(async () => {
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
                                            function __handleClick(mode) {
                                                setTimeout(() => {
                                                    switch (mode) {
                                                        case 'viewer':
                                                        case 'editor':
                                                            pm.plateTrack.setMessage(mode)
                                                            CurrentLayout.stash('mode', mode);
                                                    }
                                                }, 2000)
                                            }
                                            names.push({ label: 'Viewer', "click": () => __handleClick('viewer') });
                                            names.push({ label: 'Editor', "click": () => __handleClick('editor') });
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

                                                        if (selectedItem && selectedItem.key) {
                                                            targetObject[selectedItem.key] = !targetObject[selectedItem.key];
                                                        } else if (selectedItem && selectedItem.click) {
                                                            selectedItem.click();
                                                        }
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
                                        label: 'Run', ionfunction: createIonFunction(async () => {
                                            await exec('baja/table/show-flow-editor')
                                        })
                                    },
                                ]

                            },
                            {
                                'label': 'Style', 'items': [

                                    {
                                        label: 'Display', ionfunction: createIonFunction(async () => {

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
                                    },
                                    {
                                        label: 'Background', ionfunction: createIonFunction(async () => {

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
                                        label: 'Timeline style', ionfunction: createIonFunction(async () => {

                                        })
                                    },
                                    {
                                        label: 'Table style', ionfunction: createIonFunction(async () => {

                                        })
                                    },
                                ]
                            }

                        ]
                    }
                }
            }

            if (MSGraph.isLoggedIn()) {

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

            } else {
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
                                            cmd: createIon(async (str, panel) => {

                                                let fal = await interpreter.executeCommand(str);
                                                panel.setText('');
                                            }),
                                            menus: [
                                                {
                                                    'label': 'Operations', 'items': [
                                                        {
                                                            label: 'Reset', ionfunction: createIonFunction(async () => {
                                                                await exec('baja/table/yakgen', path, config, '/app/cpd/yak')
                                                            })
                                                        },
                                                    ]

                                                }

                                            ]
                                        }
                                    }
                                },
                                {
                                    'width': '100%',
                                    'component': geneGraph
                                }

                            ]]
                    }
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
