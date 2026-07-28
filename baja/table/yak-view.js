function (path) {

    return new Promise(async (resolve, reject) => {
        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let PlateTrack = await exec('baja/plate/plate-track.js')
        let MGrid = await exec('flexigraph/grid.js')
        let MPlot = await exec('flexigraph/plot.js')
        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')
        let TransferFunction = await exec('baja/plate/transfer-functions.js')
        let Menu = await exec('flexigraph/menu.js');
        let WorkbenchFunction = await exec('baja/plate/views/workbench-function')
        let pt = new PlateTrack('__')
        let Connection = await exec('baja/plate/connect')

        pt.init();
        let __file = null;
        let tracks = []
        let panel;
        let cb = createIonFunction((p) => {
            panel = p;
        })
        let message;
        let mouseMoveListener;
        let mouseUpListener;
        let mouseDownListener;
        let draw;
        let menuManager;
        let currentShape = {
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            visible: false
        };

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

        let setpt = (_pt) => {
            pt = _pt;

            let i = tracks.indexOf(pt);
            if (i >= 0) {
                tracks.splice(i, 1)
            }
            if (pt != null)
                tracks.push(pt)

        }

        let update = async (fs) => {
            if (!fs || !fs.grid) {
                return;
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
            let connect = []
            if (fs.connections) {
                for (let con of fs.connections) {
                    let fcon = Connection.buildConnectionFromJSON(con, ffs)
                    connect.push(fcon)
                }
            }
            ffs.connections = connect;

            let plts = []
            if (fs.plots && fs.plots.length > 0) {
                for (let p of fs.plots) {
                    let fp = MPlot.fromJSON(p)
                    plts.push(fp)
                }
            }
            ffs.plots = plts;

            let trackfunctions = []
            let tf = fs.trackFunctions;
            if (tf != null && tf.length > 0) {
                for (let t of tf) {
                    let vv = Object.assign(new WorkbenchFunction(), t)

                    let desti = {};
                    let dest = t.param;
                    if (dest != null) {
                        for (let sobj of Object.keys(dest)) {
                            let s = dest[sobj]
                            let pl2 = ffs.getPlateWithUID(s.uid)
                            if (pl2 === null) {
                                desti[sobj] = s
                            } else {
                                desti[sobj] = (pl2);
                            }
                        }
                    }
                    vv.param = desti;
                    trackfunctions.push(vv)

                }
            }
            ffs.trackFunctions = trackfunctions;

            ffs.grid = mgrid;
            pt = ffs;
            setpt(ffs);
            ffs.init();
        }

        let pushOntoHistory = async () => {
            try {
                var cache = [];
                let gs = await JSON.stringify(tracks, function (key, value) {
                    if (key != null) {
                        if (key === 'fun') {
                            if (value != null)
                                return value.toString();
                        }
                        if (key.toString().toLowerCase() === 'toplate' && value) {
                            return 'toPlate:' + value[key].uid
                        }
                        if (key.toString().toLowerCase() === 'fromplate' && value) {
                            return 'fromPlate:' + value[key].uid
                        }
                    }
                    if (key === 'centerMessage')
                        return null;
                    if (key === 'mouseUpListeners')
                        return null;
                    if (key === 'mouseMoveListeners')
                        return null;
                    if (key === 'mouseDownListeners')
                        return null;
                    if (key === 'canvas')
                        return null;
                    if (key === 'opener') {
                        return null;
                    }
                    if (key != null && key.toLocaleLowerCase().includes('_transient_')) {
                        return null;
                    }
                    if (key === 'orfhash') {
                        return null;
                    }
                    if (key === 'selectedTrack' || key === 'selectedTrack') {
                        return null;
                    }
                    if (typeof value === 'object' && value !== null) {
                        if (cache.indexOf(value) !== -1) {
                            return;
                        }
                        cache.push(value);
                    }
                    return value;
                });

            } catch (error) {
                console.error('Error:', error);
            }
        }

        if (path) {

            path = decodeURIComponent(path)

            setTimeout(() => {
                window.history.pushState({ path: path }, 'Yak', `app/baja/yak?path=${path}`);

            }, 5900);
            let host_ = window['env']['apiUrl']
            let index = path.lastIndexOf('/')
            if (path.startsWith('/myfiles/')) {
                let jsonobj = {
                    'path': path,
                    'key': 'user',
                    'user': getUser()
                }
                let rs = await POSTJSON(jsonobj, host_ + '/load-file');

                let p = decodeURIComponent(path).substring(index + 1)
                if (rs.msg) {
                    clear();
                    log(rs.msg + ' ' + p)
                    return;
                } else {
                    update(rs);
                    __file = p;
                }
            } else {
                let jsonobj = {
                    'path': path,
                    'user': getUser()
                }
                let rs = await POSTJSON(jsonobj, host_ + '/load-file');

                let p = decodeURIComponent(path).substring(index + 1)
                if (rs.msg && rs.msg.length) {
                    clear();
                    showWidget({
                        wid: 'html',
                        data: "<hr> " + rs.msg
                    })
                    return;

                } else {
                    await update(rs);
                    __file = p;
                }
            }
        }

        let mode = 'add'
        let md = false;
        let lineage_card = {}
        tracks.push(pt)
        let smenu = null;
        let px = 0;
        let py = 0;
        let dragnavigate = async () => {
            draw = null;
            menuManager = null;
            smenu = null;
            console.log(" drag ")
            mouseUpListener = (x, y) => {
                px = 0;
                py = 0;

                md = false;

            }

            mouseDownListener = (x, y) => {
                md = true;

            }
            mouseMoveListener = (scx, scy) => {
                if (md) {
                    if (px === 0) {
                        px = pt.grid.Xwc(scx);
                        py = pt.grid.Ywc(scy);
                    }
                    else {
                        let xd = px - pt.grid.Xwc(scx);
                        let yd = py - pt.grid.Ywc(scy);

                        pt.grid.setxmin(pt.grid.getxmin() + xd);
                        pt.grid.setymin(pt.grid.getymin() + yd);
                        pt.grid.setxmax(pt.grid.getxmax() + xd);
                        pt.grid.setymax(pt.grid.getymax() + yd);
                        pt.grid.rescale();
                    }
                }
            }
        }

        let setPTMenu = () => {

            mouseDownListener = (scx, scy) => {
                let mmx = pt.grid.Xwc(scx);
                let mmy = pt.grid.Ywc(scy);
                if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                    pt.menu.mouseDown(pt.grid, mmx, mmy)
                    return;
                }
                md = true;
            }
            mouseUpListener = (scx, scy) => {
                md = false;
                let mmx = pt.grid.Xwc(scx);
                let mmy = pt.grid.Ywc(scy);
                if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                    pt.menu.mouseUp(pt.grid, mmx, mmy)
                    pt.deselectAll();
                    return;
                } else if (pt.menu) {
                    if (pt.selectedPlate)
                        pt.selectedPlate.deselectAll();
                    pt.menu = false;
                    return;
                }
                let xw = pt.grid.Xwc(scx);
                let yw = pt.grid.Ywc(scy);
                let plate = pt.getPlate(xw, yw);
                if (plate) {
                    plate.selectWell(xw, yw);

                    pt.setSelected (plate);
                }
                pt.menu.x = mmx;
                pt.menu.y = mmy;

                md = false;
            }
            mouseMoveListener = (scx, scy) => {
                let mmx = pt.grid.Xwc(scx);
                let mmy = pt.grid.Ywc(scy);
                pt.deselectPlateRoots();
                let plate = pt.getPlate(mmx, mmy);
                if (plate != null) {
                    pt.setSelected (plate);
                    pt.selectedPlate.selectIt();
                }

                if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                    pt.menu.mouseMove(pt.grid, mmx, mmy)
                    return;
                }
                if (pt.root != null && pt.root.length > 0) {
                    if (md) {
                        let xw = pt.grid.Xwc(scx);
                        let yw = pt.grid.Ywc(scy);

                        if (plate)
                            plate.selectWell(xw, yw);
                    }
                }

            }
        }

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

                    return;
                }
                let mmx = pt.grid.Xwc(x);
                let mmy = pt.grid.Ywc(y);
                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    smenu.mouseMove(pt.grid, mmx, mmy)
                }
            }
            mouseUpListener = async (x, y) => {
                let mmx = pt.grid.Xwc(x);
                let mmy = pt.grid.Ywc(y);
                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    await smenu.mouseUp(pt.grid, mmx, mmy)

                }
            }
        }

        let setPlotListeners = async () => {
            mouseDownListener = (x, y) => {
            };
            mouseMoveListener = (x, y) => {
                let mmx = pt.grid.Xwc(x);
                let mmy = pt.grid.Ywc(y);
                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    smenu.mouseMove(pt.grid, mmx, mmy)
                }
            }
            mouseUpListener = async (x, y) => {
                let mmx = pt.grid.Xwc(x);
                let mmy = pt.grid.Ywc(y);
                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    await smenu.mouseUp(pt.grid, mmx, mmy)
                }
                smenu = null;

            }
        }

        let dragSelectWells = async () => {
            smenu = null;
            console.log('debubg');
            currentWorkbench = null;

            mouseMoveListener = null;
            mouseUpListener = null;
            mouseDownListener = null;
            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
            let m = await exec('baja/plate/views/drag-select-wells.js', pt)
            mouseMoveListener = m.mouseMoveListener;
            mouseUpListener = m.mouseUpListener;
            mouseDownListener = m.mouseDownListener;
            draw = m.draw;
            menuManager = m.menuManager;

        }

        let connectPlate = async () => {
            smenu = null;
            mouseMoveListener = null;
            mouseUpListener = null;
            mouseDownListener = null;
            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
            let m = await exec('baja/plate/views/plate-view-connect-plates.js', pt)
            mouseMoveListener = m.mouseMoveListener;
            mouseUpListener = m.mouseUpListener;
            mouseDownListener = m.mouseDownListener;
            draw = m.draw;
            menuManager = m.menuManager;

        }

        let connectPlateLayout = async () => {
            smenu = null;
            mouseMoveListener = null;
            mouseUpListener = null;
            mouseDownListener = null;
            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
            let m = await exec('baja/plate/views/plate-view-connect-plates.js', pt, 'layout and ids')
            mouseMoveListener = m.mouseMoveListener;
            mouseUpListener = m.mouseUpListener;
            mouseDownListener = m.mouseDownListener;
            draw = m.draw;
            menuManager = m.menuManager;

        }

        let editTransfer = async () => {
            smenu = null;
            mouseMoveListener = null;
            mouseUpListener = null;
            mouseDownListener = null;
            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
            let m = await exec('baja/plate/views/plate-edit-transfer.js', pt)
            mouseMoveListener = m.mouseMoveListener;
            mouseUpListener = m.mouseUpListener;
            mouseDownListener = m.mouseDownListener;
            draw = m.draw;
            menuManager = m.menuManager;

        }

        let viewLayout = async () => {
            smenu = null;
            currentWorkbench = null;

            mouseMoveListener = null;
            mouseUpListener = null;
            mouseDownListener = null;
            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
            let m = await exec('baja/plate/views/view-plate-layout.js', pt)
            mouseMoveListener = m.mouseMoveListener;
            mouseUpListener = m.mouseUpListener;
            mouseDownListener = m.mouseDownListener;
            draw = m.draw;
            menuManager = m.menuManager;

        }

        let applyLayout = async () => {
            smenu = null;
            currentWorkbench = null;

            mouseMoveListener = null;
            mouseUpListener = null;
            mouseDownListener = null;
            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
            let m = await exec('baja/plate/views/apply-plate-layout.js', pt)
            mouseMoveListener = m.mouseMoveListener;
            mouseUpListener = m.mouseUpListener;
            mouseDownListener = m.mouseDownListener;
            draw = m.draw;
            menuManager = m.menuManager;

        }

        let clearLayout = async () => {
            smenu = null;
            currentWorkbench = null;

            mouseMoveListener = null;
            mouseUpListener = null;
            mouseDownListener = null;
            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
            let m = await exec('baja/plate/views/clear-plate-layout.js', pt)
            mouseMoveListener = m.mouseMoveListener;
            mouseUpListener = m.mouseUpListener;
            mouseDownListener = m.mouseDownListener;
            draw = m.draw;
            menuManager = m.menuManager;

        }

        let editWellValues = async () => {
            smenu = null;
            currentWorkbench = null;

            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
            draw = null;
            menuManager = null;
            pt.menu = await exec('baja/plate/views/edit-well-menu.js', pt)

            mouseDownListener = (scx, scy) => {
                let mmx = pt.grid.Xwc(scx);
                let mmy = pt.grid.Ywc(scy);
                if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                    pt.menu.mouseDown(pt.grid, mmx, mmy)
                    return;
                }
                md = true;
            }
            mouseUpListener = (scx, scy) => {
                md = false;
                let mmx = pt.grid.Xwc(scx);
                let mmy = pt.grid.Ywc(scy);
                if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                    pt.menu.mouseUp(pt.grid, mmx, mmy)
                    pt.deselectAll();
                    return;
                } else if (pt.menu) {
                    if (pt.selectedPlate)
                        pt.selectedPlate.deselectAll();
                    pt.menu = false;
                    return;
                }
                let xw = pt.grid.Xwc(scx);
                let yw = pt.grid.Ywc(scy);
                let plate = pt.getPlate(xw, yw);
                if (plate) {
                    plate.selectWell(xw, yw);
                    pt.setSelected (plate);
                }
                pt.menu.x = mmx;
                pt.menu.y = mmy;

                md = false;
            }
            mouseMoveListener = (scx, scy) => {
                let mmx = pt.grid.Xwc(scx);
                let mmy = pt.grid.Ywc(scy);
                pt.deselectPlateRoots();
                let plate = pt.getPlate(mmx, mmy);
                if (plate != null) {
                    pt.setSelected (plate);
                    pt.selectedPlate.selectIt();
                }

                if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                    pt.menu.mouseMove(pt.grid, mmx, mmy)
                    return;
                }
                if (pt.root != null && pt.root.length > 0) {
                    if (md) {
                        let xw = pt.grid.Xwc(scx);
                        let yw = pt.grid.Ywc(scy);

                        if (plate)
                            plate.selectWell(xw, yw);
                    }
                }

            }

        }

        let PlateManager = class PlateManager {
            setShape(_currentShape) {
                cxurrentShape = _currentShape;
            }
            setMouseMode(str) {
                mouseMode = str;
            }
            clearMouseListeners() {
                mouseMoveListener = null;
                mouseUpListener = null;
                mouseDownListener = null;

            }
            addMouseDownListener(ref) {
                mouseDownListener = ref;

            }
            addMouseMoveListener(ref) {
                mouseMoveListener = ref;

            }
            addMouseUpListener(ref) {
                mouseUpListener = ref;
            }
        }

        let editLayout = () => {

            let menuList = [
            ]

            menuList.push({
                label: `Set dilution series`,
                click: (xwc, ywc) => {
                    showModal({
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        width: '100%',
                                        'component':
                                        {
                                            wid: 'html', data: 'Enter dilutions'
                                        }
                                    }, {
                                        width: '100%',
                                        'component': {
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: ['Start', 'Dilution factor'],
                                                buttons: [{
                                                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                        pt.menu = null;
                                                        pt.deselectAll();

                                                        hideAllModal();
                                                    })
                                                }, {
                                                    'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                                                        let value = +input_params['Start']
                                                        let factor = +input_params['Dilution factor']

                                                        let w = pt.selectedPlate.selectedWells
                                                        let group_name = 'STD'
                                                        for (let i of w) {
                                                            console.log(' value ' + value);
                                                            i.setGroup(group_name);
                                                            if (!selectedColor)
                                                                i.setColor(colorWells(group_name))
                                                            else
                                                                i.setColor(selectedColor)
                                                            i.setConcentration(value)
                                                            value = value / factor;
                                                        }
                                                        pt.menu = null;
                                                        pt.deselectAll();

                                                        hideAllModal();
                                                    })
                                                }]
                                            }
                                        }
                                    }
                                ]
                            ]
                        }
                    });

                },
                move: () => {
                }
            });

            menuList.push({
                label: `Positive CTRL`,
                click: (xwc, ywc) => {

                    showModal({
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        width: '100%',
                                        'component':
                                        {
                                            wid: 'html', data: 'Controls'
                                        }
                                    },
                                    {
                                        width: '100%',
                                        'component': button_canvas

                                    },
                                    {
                                        width: '100%',
                                        'component': {
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: [],
                                                buttons: [{
                                                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                        hideAllModal();
                                                        pt.menu_vis = false;
                                                        pt.deselectAll();

                                                    })
                                                }, {
                                                    'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                                                        let w = pt.selectedPlate.selectedWells
                                                        let group_name = 'POSCTRL'
                                                        for (let i of w) {

                                                            console.log(" -----selected color " + selectedColor)
                                                            i.setGroup(group_name);
                                                            if (!selectedColor)
                                                                i.setColor(colorWells(group_name))
                                                            else
                                                                i.setColor(selectedColor)

                                                        }
                                                        pt.menu_vis = false;
                                                        hideAllModal();
                                                        pt.deselectAll();

                                                    })
                                                }]
                                            }
                                        }
                                    }
                                ]
                            ]
                        }
                    });

                },
                move: () => {
                }
            });
            menuList.push({
                label: `Negative CTRL`,
                click: (xwc, ywc) => {

                    showModal({
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        width: '100%',
                                        'component':
                                        {
                                            wid: 'html', data: 'Negative Controls'
                                        }
                                    }
                                    ,
                                    {
                                        width: '100%',
                                        'component': button_canvas
                                    }, {
                                        width: '100%',
                                        'component': {
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: [],
                                                buttons: [{
                                                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                        hideAllModal();
                                                        pt.menu_vis = false;
                                                        pt.deselectAll();

                                                    })
                                                }, {
                                                    'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                                                        let w = pt.selectedPlate.selectedWells
                                                        let group_name = 'NEGCTRL'
                                                        for (let i of w) {
                                                            i.setGroup(group_name);
                                                            if (!selectedColor)
                                                                i.setColor(colorWells(group_name))
                                                            else
                                                                i.setColor(selectedColor)

                                                        }
                                                        pt.menu_vis = false;
                                                        hideAllModal();
                                                        pt.deselectAll();

                                                    })
                                                }]
                                            }
                                        }
                                    }
                                ]
                            ]
                        }
                    });

                },
                move: () => {
                }
            });

            menuList.push({
                label: `Untreated CTRL`,
                click: (xwc, ywc) => {

                    showModal({
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        width: '100%',
                                        'component':
                                        {
                                            wid: 'html', data: 'Controls'
                                        }
                                    },
                                    {
                                        width: '100%',
                                        'component': button_canvas
                                    },
                                    {
                                        width: '100%',
                                        'component': {
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: [],
                                                buttons: [{
                                                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                        hideAllModal();
                                                        pt.menu_vis = false;
                                                        pt.deselectAll();

                                                    })
                                                }, {
                                                    'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                                                        let w = pt.selectedPlate.selectedWells
                                                        let group_name = 'UTC'
                                                        for (let i of w) {
                                                            i.setGroup(group_name);
                                                            if (!selectedColor)
                                                                i.setColor(colorWells(group_name))
                                                            else
                                                                i.setColor(selectedColor)

                                                        }
                                                        pt.menu_vis = false;
                                                        hideAllModal();
                                                        pt.deselectAll();

                                                    })
                                                }]
                                            }
                                        }
                                    }
                                ]
                            ]
                        }
                    });
                },
                move: () => {
                }
            });

            menuList.push({
                label: `GRP`,
                click: async (xwc, ywc) => {

                    showModal({
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        width: '100%',
                                        'component':
                                        {
                                            wid: 'html', data: 'Controls'
                                        }
                                    }, {
                                        width: '100%',
                                        'component': {
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: ['Group Name'],
                                                buttons: [{
                                                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                        hideAllModal();
                                                        pt.menu_vis = false;
                                                        pt.deselectAll();

                                                    })
                                                }, {
                                                    'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                                                        let w = pt.selectedPlate.selectedWells
                                                        let group_name = input_params['Group Name']

                                                        if (group_name === undefined || group_name.length <= 0) {

                                                            alert(' enter a group name ')
                                                            return;

                                                        } else {

                                                            for (let i of w) {
                                                                i.setGroup(group_name);
                                                                if (!selectedColor)
                                                                    i.setColor(colorWells(group_name))
                                                                else
                                                                    i.setColor(selectedColor)
                                                            }
                                                            pt.menu_vis = false;
                                                            hideAllModal();

                                                            pt.deselectAll();

                                                        }
                                                    })
                                                }]
                                            }
                                        }
                                    }
                                ]
                            ]
                        }
                    });

                },
                move: () => {
                }
            });
            smenu = new Menu(menuList, 0, 100)
            smenu.menu_width = 200;
            mouseMoveListener = (scx, scy) => {
                let mmx = pt.grid.Xwc(scx);
                let mmy = pt.grid.Ywc(scy);
                if (pt.menu_vis && pt.menu.isIn(pt.grid, mmx, mmy)) {
                    pt.menu.mouseMove(pt.grid, mmx, mmy)
                    return;
                }
                if (pt.root != null && pt.root.length > 0) {
                    if (md && mode === 'select') {

                        let xw = pt.grid.Xwc(scx);
                        let yw = pt.grid.Ywc(scy);
                        let plate = pt.getPlate(xw, yw);
                        if (plate)
                            plate.selectWell(xw, yw);

                    }
                }
            }
            mouseUpListener = (scx, scy) => {
                md = false;
                let mmx = pt.grid.Xwc(scx);
                let mmy = pt.grid.Ywc(scy);

                if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                    pt.menu.mouseUp(pt.grid, mmx, mmy)
                    pt.menu = false;
                    pt.deselectAll();
                    return;
                }
                md = false;

            }
            mouseDownListener = (scx, scy) => {

                let mmx = pt.grid.Xwc(scx);
                let mmy = pt.grid.Ywc(scy);
                if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                    pt.menu.mouseDown(pt.grid, mmx, mmy)
                    return;
                } else if (pt.menu) {
                    pt.deselectAll();
                    mode = 'navigation'

                    return;
                }
                md = true;

            };
            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
        }

        let setZoomBox = () => {

            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            };

            currentShape.visible = true;
            mouseDownListener = (x, y) => {

                md = true;
                currentShape.x = x;
                currentShape.y = y;
            };
            mouseMoveListener = (x, y) => {
                if (!md) {
                    return;
                }

                if (currentShape) {
                    currentShape.w = x - currentShape.x;
                    currentShape.h = Math.abs(currentShape.y - y);
                }
            }
            mouseUpListener = (x, y) => {
                md = false;

                if (currentShape) {
                    pt.grid.rescale();
                    let xmin = pt.grid.Xwc(currentShape.x)
                    let ymin = pt.grid.Ywc(currentShape.y)
                    let xmax = pt.grid.Xwc(currentShape.x + currentShape.w)
                    let ymax = pt.grid.Ywc(currentShape.y + currentShape.h)
                    let ag = new AnimateGrid(pt.grid);

                    ag.animateTo(xmin, xmax, ymin, ymax);
                }
            };
        }

        let viewWells = async () => {

            let m = await exec('baja/plate/views/mouse-over-well-highlight-well-canvas.js', pt)
            mouseMoveListener = m.mouseMoveListener;
            mouseUpListener = m.mouseUpListener;
            mouseDownListener = m.mouseDownListener;
            draw = m.draw;
            menuManager = m.menuManager;
        }

        let editPlateProperties = async () => {
            let eb = async () => {
                wb(null);

                if (currentShape) currentShape.visible = false;

                let selectedPlate = null;
                let original_position = Object.assign(new MGrid(), pt.grid);

                const m = {
                    mouseDownListener: async (x, y) => {
                        let md = true;
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        pt.deselectPlateRoots();
                        let p = pt.getPlate(xw, yw);
                        if (p != null) {
                            selectedPlate = p;
                            selectedPlate.selectIt();
                            let __label = 'Plate: ' + selectedPlate.name + ' [' + selectedPlate.plateType + ']';

                            if (selectedPlate.location && selectedPlate.location.length > 0) {
                                __label += ' > ' + selectedPlate.location;
                            }

                            let v = [
                                {
                                    x: 0, y: 0, label: __label, ionFunction: createIonFunction(() => { })
                                },
                                {
                                    x: 7, y: 0, label: "Name", ionFunction: createIonFunction(() => {
                                        showModal({
                                            wid: 'card',
                                            data: {
                                                cards: [[{
                                                    width: '100%',
                                                    component: { wid: 'html', data: 'Name' }
                                                },
                                                {
                                                    title: ' ', body: ' ',
                                                    width: '90%',
                                                    component: {
                                                        wid: 'input-param-items',
                                                        data: {
                                                            input_labels: ['Name'],
                                                            buttons: [{
                                                                label: 'Apply', function: createIonFunction((button_label, input_params) => {
                                                                    let name = input_params['Name'];
                                                                    hideAllModal();
                                                                    if (name && name.length > 0) {
                                                                        selectedPlate.name = name;
                                                                        let ag = new AnimateGrid(pt.grid);
                                                                        ag.animateTo(original_position.xmin, original_position.xmax, original_position.ymin, original_position.ymax);
                                                                        if (panel) {
                                                                            panel.setButtons([]);
                                                                        }
                                                                    }
                                                                })
                                                            }]
                                                        }
                                                    }
                                                }]]
                                            }
                                        });
                                    })
                                },
                                {
                                    x: 8, y: 0, label: "Type", ionFunction: createIonFunction(() => {
                                        showModal({
                                            wid: 'card',
                                            data: {
                                                cards: [[{
                                                    width: '100%',
                                                    component: { wid: 'html', data: 'Name' }
                                                },
                                                {
                                                    title: ' ', body: ' ',
                                                    width: '90%',
                                                    component: {
                                                        wid: 'input-param-items',
                                                        data: {
                                                            input_labels: ['Location'],
                                                            buttons: [{
                                                                label: 'Apply', function: createIonFunction((button_label, input_params) => {
                                                                    let name = input_params['Location'];
                                                                    if (name && name.length > 0) {
                                                                        selectedPlate.location = name;
                                                                        hideAllModal();
                                                                        let ag = new AnimateGrid(pt.grid);
                                                                        ag.animateTo(original_position.xmin, original_position.xmax, original_position.ymin, original_position.ymax);
                                                                        if (panel) {
                                                                            panel.setButtons([]);
                                                                        }
                                                                    }
                                                                })
                                                            }]
                                                        }
                                                    }
                                                }]]
                                            }
                                        });
                                    })
                                }
                            ];

                            if (panel) {
                                panel.setButtons(v);
                            }
                        } else {
                            selectedPlate = null;
                            pt.deselectPlateRoots();
                        }

                        if (selectedPlate != null && selectedPlate.grid) {
                            if (pt != null && pt.grid.screenWidth(selectedPlate.grid.width) < 800) {
                                pt.zoomintoplate(selectedPlate);
                                return;
                            }
                        }
                    },
                    mouseMoveListener: (x, y) => {
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                    },
                    mouseUpListener: (x, y) => {

                    },
                    draw: () => {

                    },
                    menuManager: () => {

                    }
                };

                return {
                    id: 'edit-table',
                    priority: true,
                    mouseMoveListener: m.mouseMoveListener,
                    mouseUpListener: m.mouseUpListener,
                    mouseDownListener: m.mouseDownListener,
                    draw: m.draw,
                    menuManager: m.menuManager
                };
            };
            wb(eb)
        }

        let editPlateValues = async () => {
            currentShape.visible = false;
            let selectedPlate = null;
            smenu = null;
            mouseDownListener = async (x, y) => {
                md = true;
                if (selectedPlate != null && selectedPlate.grid) {
                    if (pt != null && pt.grid.screenWidth(selectedPlate.grid.width) < 500) {
                        pt.zoomintoplate(selectedPlate)
                    } else {
                        smenu = await exec('baja/plate/views/plate-view-plate-values-menu', pt, selectedPlate);
                        let mmx = pt.grid.Xwc(x + 10);
                        let mmy = pt.grid.Ywc(y + 10);
                        smenu.x = mmx;
                        smenu.y = mmy;

                    }
                } else {
                }
            };
            mouseMoveListener = (x, y) => {
                let xw = pt.grid.Xwc(x);
                let yw = pt.grid.Ywc(y);
                let p = pt.getPlate(xw, yw);
                if (p != null) {
                    selectedPlate = p;
                    let __label = 'Plate: ' + selectedPlate.name;
                    let v = [{
                        x: 0, y: 0, label: __label, ionFunction: createIonFunction(() => {
                        }), islabel: true
                    }]
                    if (panel) {
                        panel.setButtons(v);
                    }

                } else {
                    selectedPlate = null;
                }

                if (md) {
                    let mmx = pt.grid.Xwc(x + 10);
                    let mmy = pt.grid.Ywc(y + 10);
                    if (!menu) {
                        smenu.x = mmx;
                        smenu.y = mmy;
                    }
                    if (menu && smenu.isIn(pt.grid, mmx, mmy)) {
                        smenu.mouseMove(pt.grid, mmx, mmy)
                    }
                }
            }
            mouseUpListener = (x, y) => {
                let mmx = pt.grid.Xwc(x + 10);
                let mmy = pt.grid.Ywc(y + 10);
                if (!menu) {
                    smenu.x = mmx;
                    smenu.y = mmy;
                }
                if (menu && smenu.isIn(pt.grid, mmx, mmy)) {
                    smenu.mouseUp(pt.grid, mmx, mmy)
                    menu = null;
                }
                if (click_to_close_menu)
                    menu = null;
            };
        }

        let zoomin = async () => {
            AnimateGrid.INTERUPT = true;

            pt.grid.rescale();
            smenu = null;
            mousePriority = false;

            let xmax = pt.grid.xmax;
            let xmin = pt.grid.xmin;
            let ymax = pt.grid.ymax;
            let ymin = pt.grid.ymin;
            let xdf = Math.abs((xmax - xmin) / 7);
            let ydf = Math.abs((ymax - ymin) / 7);

            ymax -= ydf;
            ymin += ydf;
            xmax -= xdf;
            xmin += xdf;
            let ag = new AnimateGrid(pt.grid);
            await ag.animateTo(xmin, xmax, ymin, ymax);
            pt.grid.rescale();
        }

        let zoomout = async () => {
            AnimateGrid.INTERUPT = true;

            pt.grid.rescale();
            smenu = null;
            mousePriority = false;

            let xmax = pt.grid.xmax;
            let xmin = pt.grid.xmin;
            let ymax = pt.grid.ymax;
            let ymin = pt.grid.ymin;
            let xdf = Math.abs((xmax - xmin) / 2);
            let ydf = Math.abs((ymax - ymin) / 2);

            ymax += ydf;
            ymin -= ydf;
            xmax += xdf;
            xmin -= xdf;
            let ag = new AnimateGrid(pt.grid);
            await ag.animateTo(xmin, xmax, ymin, ymax);
            pt.grid.rescale();
        }

        let shiftLeft = async (left_distance) => {
            AnimateGrid.INTERUPT = true;

            pt.grid.rescale();
            smenu = null;

            let xmax = pt.grid.xmax;
            let xmin = pt.grid.xmin;
            let ymax = pt.grid.ymax;
            let ymin = pt.grid.ymin;

            xmin -= left_distance;
            xmax -= left_distance;

            let ag = new AnimateGrid(pt.grid);
            await ag.animateTo(xmin, xmax, ymin, ymax);

            pt.grid.rescale();
        }

        let shiftDown = async (left_distance) => {
            pt.grid.rescale();
            smenu = null;

            let xmax = pt.grid.xmax;
            let xmin = pt.grid.xmin;
            let ymax = pt.grid.ymax;
            let ymin = pt.grid.ymin;

            ymin -= left_distance;
            ymax -= left_distance;

            let ag = new AnimateGrid(pt.grid);
            await ag.animateTo(xmin, xmax, ymin, ymax);

            pt.grid.rescale();
        }

        let shiftUp = async (left_distance) => {
            AnimateGrid.INTERUPT = true;

            pt.grid.rescale();
            smenu = null;

            let xmax = pt.grid.xmax;
            let xmin = pt.grid.xmin;
            let ymax = pt.grid.ymax;
            let ymin = pt.grid.ymin;

            ymin += left_distance;
            ymax += left_distance;

            let ag = new AnimateGrid(pt.grid);
            await ag.animateTo(xmin, xmax, ymin, ymax);

            pt.grid.rescale();
        }

        let shiftRight = async (left_distance) => {
            AnimateGrid.INTERUPT = true;

            pt.grid.rescale();
            smenu = null;

            let xmax = pt.grid.xmax;
            let xmin = pt.grid.xmin;
            let ymax = pt.grid.ymax;
            let ymin = pt.grid.ymin;

            xmin += left_distance;
            xmax += left_distance;

            let ag = new AnimateGrid(pt.grid);
            await ag.animateTo(xmin, xmax, ymin, ymax);

            pt.grid.rescale();
        }

        let zoomtofitplates = () => {
            AnimateGrid.INTERUPT = true;
            pt.zoomtfit()
        }

        let currentWorkbench = null;
        let wb = (wbset) => {
            if (!wbset) {

                if (currentWorkbench != null && currentWorkbench.close) {
                    currentWorkbench.close();
                }

                currentWorkbench = null;
                smenu = null;
                mouseMoveListener = null;
                mouseUpListener = null;
                mouseDownListener = null;
                draw = null;
                menuManager = null;
                keydown = null;

                return;
            } else {
                if (currentWorkbench && currentWorkbench.id && currentWorkbench.id === wbset.id) {
                    return;

                } else {
                    if (currentWorkbench != null && currentWorkbench.close) {
                        currentWorkbench.close();
                    }
                    currentWorkbench = wbset;
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
                smenu = wbset.smenu;
                mouseMoveListener = wbset.mouseMoveListener;
                mouseUpListener = wbset.mouseUpListener;
                mouseDownListener = wbset.mouseDownListener;
                draw = wbset.draw;
                menuManager = wbset.menuManager;
            }
        }

        let setPlotMouseMan = async () => {

            smenu = null;
            mouseMoveListener = null;
            mouseUpListener = null;
            mouseDownListener = null;
            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
            let m = await exec('baja/plate/views/move-plot.js', pt)
            mouseMoveListener = m.mouseMoveListener;
            mouseUpListener = m.mouseUpListener;
            mouseDownListener = m.mouseDownListener;
            draw = m.draw;
            menuManager = m.menuManager;

        }

        let setMessage = (msg) => {
            message = msg;
            setTimeout(() => {
                message = null;
            }, 5000)
        }

        let observer;
        let pauseDraw = false;

        let holdTimeout;
        let isHeld = false;

        let menuTimeout = null;
        let click_to_close_menu = false;

        let move_plot = (plot, scx, scy) => {
            plot.highlight();
            let xi = scx;
            let yi = scy;
            let origWidth = pt.grid.X(plot.x);
            let origWY = pt.grid.Y(plot.y);
            let diffx = 0
            let diffy = 0
            freezFrame = true;

            mouseDownListener = (async (x, y) => {
                md = true;

                xi = x;
                yi = y;
                pt.grid.rescale();
                plot.grid.rescale();
            })
            mouseMoveListener = ((x, y) => {
                pt.grid.rescale()
                if (md) {
                    diffx = x - xi
                    diffy = y - yi

                    plot.x = pt.grid.Xwc((origWidth + (diffx)))
                    plot.y = pt.grid.Ywc((origWY + (diffy)))
                }
            });
            mouseUpListener = ((x, y) => {
                freezFrame = false;
                mousePriority = false;
                dragnavigate();
            })
        }

        let resize_plot = (plot, scx, scy) => {
            plot.highlight();
            let xi = scx;
            let yi = scy;
            let origWidth = pt.grid.screenWidth(plot.w);
            let diffx = 0
            freezFrame = true;
            wb(null)

            mouseDownListener = (async (x, y) => {
                md = true;
                xi = x;
                yi = y;
                pt.grid.rescale();
                plot.grid.rescale();
                origWidth = pt.grid.screenWidth(plot.w);
            })
            mouseMoveListener = ((x, y) => {
                pt.grid.rescale()
                if (md) {
                    diffx = x - xi

                    plot.w = pt.grid.worldWidth((origWidth + (diffx)))
                }
            });
            mouseUpListener = ((x, y) => {
                freezFrame = false;
                mousePriority = false;
                dragnavigate();
            })
        }

        let default_mouseListener = (scx, scy) => {
        }
        let default_mousedownListener = async (scx, scy) => {
            AnimateGrid.INTERUPT = true;
            this.initDwn = { x: scx, y: scy };

            md = true;
            let plot = getPlot(scx, scy)
            if (plot) {
                plot.highlight();
                if (plot.inResize(scx, scy)) {
                    resize_plot(plot, scx, scy);
                }
            }
            if (currentWorkbench && currentWorkbench.priority) {
                return currentWorkbench.mouseDownListener(scx, scy)
            }

            let plate_selected = pt.getPlate(pt.grid.Xwc(scx), pt.grid.Ywc(scy))
            if (!plate_selected) {
                pt.fromPlate = null;
                pt.toPlate = null;
            }
            if (pt.fromPlate) {
                let Connection = await exec('baja/plate/connect')
                if (plate_selected) {
                    pt.toPlate = plate_selected;
                    if (pt.toPlate != pt.fromPlate) {
                        setMessage('Connecting...')
                        console.log('debubg');
                        let connection = new Connection(pt.fromPlate.uid, pt.toPlate.uid);
                        pt.addConnection(connection);
                    }
                    pt.toPlate = null;
                    pt.fromPlate = null;
                    pt.menu_plate = null;
                }
            }

            if (mouseDownListener) {
                mouseDownListener(scx, scy)
            }
            md = true;
        }

        let freezFrame = false;
        let resetMouse = () => {
            freezFrame = null;
            freezFrame = false;
            mouseDownListener = null;
            mouseUpListener = null;
            mouseMoveListener = null;
            mousePriority = false;
            mousePriority = null;
            smenu = null;
        }

        let default_mouseUpListener = async (scx, scy) => {
            px = 0;
            py = 0;
            md = false;

            if (currentWorkbench && currentWorkbench.priority && currentWorkbench.mouseUpListener) {
                return currentWorkbench.mouseUpListener(scx, scy)
            }

            if (mouseUpListener) {
                mouseUpListener(scx, scy)
            }
            for (let connection of pt.connections) {
                connection.mouseUp(pt.grid, scx, scy)
            }
            md = false;
        }

        let hobject = null;

        let getPlate = (x, y) => {
            return pt.getPlate(x, y)
        }

        let default_keydownListener = async (event) => {
            if (event.key === 'ArrowLeft') {
                console.log('Left arrow pressed');
            } else if (event.key === 'ArrowRight') {
                console.log('Right arrow pressed');
            } else if (event.key === 'Enter') {
                console.log('Enter key pressed');
            }
            if (currentWorkbench && currentWorkbench.keydown) {
                return currentWorkbench.keydown(event)
            }
        }

        let default_mousemoveListener = async (scx, scy) => {
            pt.deselectAll();
            let mmx = pt.grid.Xwc(scx);
            let mmy = pt.grid.Ywc(scy);

            let object = getObject(mmx, mmy)
            if (object != null && object != hobject) {
                hobject = object;
                if (!md && object && object.getWB) {
                    let workbench = object.getWB();
                    if (workbench) {
                        wb(workbench)
                    }
                }
            }
            if (currentWorkbench && currentWorkbench.priority && currentWorkbench.mouseMoveListener) {
                return currentWorkbench.mouseMoveListener(scx, scy)
            }
            if (!md) {
                if (smenu) {
                    smenu.mouseMove(pt.grid, mmx, mmy)
                    return;
                }
                if (pt) {
                    let p = pt.getPlate(mmx, mmy);
                    if (p) {
                        p.selectIt();
                        smenu = await p.handleMouseOver(scx - 5, scy, pt)
                        if (smenu)
                            setMenu(smenu)
                    }
                }
                for (let plot of pt.m_plots) {
                    if (plot.inside(pt.grid, scx, scy)) {
                        plot.highlight();
                        plot.handleMouseOver(scx, scy, pt)
                    }
                }
                for (let connection of pt.connections) {
                    if (connection.isOnCircle((scx), (scy), pt.grid)) {
                        connection.analyzeRelationship(pt)
                    }
                    if (connection.isOnTriangle(scx, scy, pt.grid)) {
                        console.log(" fetching functions ")
                        connection.fetchFunctions(pt)
                    }
                }
            }

            if (mouseMoveListener) {
                mouseMoveListener(scx, scy)
            }

        }

        let getPlot = (scx, scy) => {
            for (let plot of pt.m_plots) {
                if (plot.inside(pt.grid, (scx), (scy))) {
                    return plot;
                }
            }
            return null;
        }

        let innerComponentCallback = createIonFunction((innerComponent) => {

            CurrentLayout.stash('mainPanel', paint_panel)

            let ivc = setInterval(async () => {
                for (let p of tracks) {
                    pt = p;
                    if (p != null)
                        p.setWorkbench(wb);
                }
                if (!observer && innerComponent.getCTX().canvas) {
                    observer = new IntersectionObserver((entries) => {
                        entries.forEach((entry) => {
                            if (!entry.isIntersecting || document.hidden) {
                                console.log('Canvas is not visible');
                                pauseDraw = true;

                            } else {
                                pauseDraw = false;
                            }
                        });
                    });
                    observer.observe(innerComponent.getCTX().canvas);
                }

                let ctx = innerComponent.getCTX();
                if (ctx != null) {
                    if (!ctx.canvas.isConnected)
                        clearInterval(ivc);
                    else {
                        if (ctx) {
                            let container = innerComponent.getContainer();
                            if (container != null && Math.abs(container.nativeElement.offsetWidth - innerComponent.width) > 20) {
                                innerComponent.width = container.nativeElement.offsetWidth;
                            }
                            if (container != null && Math.abs(container.nativeElement.offsetHeight - innerComponent.height) > 20) {
                                innerComponent.height = container.nativeElement.offsetHeight;
                            }
                            let canvas = ctx.canvas;
                            ctx.fillStyle = "rgba(0, 0, 0, 0)";
                            ctx.beginPath();

                            ctx.fillStyle = "white";
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.stroke();
                            ctx.fillStyle = 'rgba(0,100,250,0.3)';
                            ctx.shadowBlur = 0;
                            ctx.font = "18pt Arial";
                            ctx.textAlign = 'left'
                            ctx.textBaseline = 'top'
                            ctx.fillText('Mode: \u0394 \u0394 Ct & Standard Curves', 10, 30)

                            for (let p of tracks) {
                                if (p != null)
                                    p.draw(ctx);
                            }

                            if (menuManager) {
                                await menuManager(pt, ctx)
                            }

                            if (draw) {
                                await draw(pt.grid, ctx);
                            }

                            if (message) {
                                let lh = 10;
                                let xd = 10
                                let yd = 50
                                let mssg = message;
                                var width = ctx.measureText(mssg).width;
                                w = width + 15;
                                let xm = xd + w / 2,
                                    ym = yd + lh / 2;

                                ctx.fillStyle = 'maroon';
                                ctx.shadowBlur = 0;
                                ctx.font = "18pt Arial";
                                ctx.fillText(mssg, 200 + xm - width + 2, ym)
                            }
                            if (currentShape && currentShape.draw != null) {
                                currentShape.draw(pt.grid, ctx)
                            }

                            if (ctx && smenu && pt != null) {
                                await smenu.draw(ctx, pt.grid)
                            }

                        }
                    }
                }
            }, 100)
        });

        let pia = await exec('baja/nav/pinch-interaction')
        this.initDwn = {};

        let paint_panel = {
            wid: 'canvas',
            height: '100px',
            componentRef: 'mainPanel',
            refCallback: innerComponentCallback,
            data: {
                'mouseListener': createIonFunction(default_mouseListener),
                'mouseDownListener': createIonFunction(default_mousedownListener),
                'mouseUpListener': createIonFunction(default_mouseUpListener),
                'mouseMoveListener': createIonFunction(default_mousemoveListener),
                'pinchListener': createIonFunction((evt) => {

                    wb();
                    if (pia) {
                        pia(evt, pt.grid)
                    }
                }),
                'touchstart': createIonFunction(async (evt) => {

                }),
                'touchend': createIonFunction(async (evt) => {
                    this.initDwn = null;
                    pia(null, pt.grid)

                }),
                'keydown': createIonFunction(default_keydownListener),

            }
        }

        let updatePlateTracks = (pv) => {
            tracks = []
            let createPlate = (plo) => {
                let p = Object.assign(new Plate(), plo)
                p.grid = Object.assign(new MGrid(), p.grid)
                let wells = []
                for (let x = 0; x < p.grid.xmax; x++) {
                    for (let y = p.grid.ymax - 1; y >= 0; y--) {
                        if (p.well && p.well[x] && p.well[x][p.grid.ymax - y - 1])
                            wells[x][p.grid.ymax - y - 1] = Object.assign(new GenericWell(), p.well[x][p.grid.ymax - y - 1])
                    }
                }
                p.wells = wells;
                return p;
            }

            for (let i of pv) {
                let pt = Object.assign(new PlateTrack(), i);
                pt.grid = Object.assign(new MGrid(), i.grid)

                const selectedPlate__ = createPlate(i.selectedPlate);

                pt.setSelected ( selectedPlate__ );
                pt.selected_well = Object.assign(new GenericWell(), i.selected_well);
                pt.fromPlate = createPlate(i.fromPlate);
                pt.toPlate = createPlate(i.toPlate);

                let rootv = []
                for (let r of pt.root) {
                    let pl = createPlate(r);
                    rootv.push(pl)
                }
                pt.root = rootv;
                tracks.push(pt)
            }
        }

        window.addEventListener('keydown', async function (event) {
            if (event.ctrlKey && event.key === 'z') {
                let p = await popHistory();
                console.log('debubg');
                if (p != null) {
                    updatePlateTracks(p);
                }
            }
        });
        window.addEventListener('paste', async (e) => {
            await pushOntoHistory();
            e.preventDefault();
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                let item = items[i]
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();

                    const img = new Image();
                    const URL = window.URL || window.webkitURL;
                    const src = URL.createObjectURL(blob);
                    img.onload = function () {
                    };
                    img.src = src;
                } else if (item.type === 'text/plain') {
                    item.getAsString(async (text) => {
                        await exec('baja/plate/data/import-data.js', text, pt, paint_panel)

                    });
                } else if (item.kind === 'file' && item.type === 'text/plain') {

                    const blob = item.getAsFile();
                    const reader = new FileReader();

                    reader.onload = async (e) => {
                        const text = e.target.result;
                        await exec('baja/plate/data/import-data.js', text, pt, paint_panel)

                    };

                    reader.readAsText(blob);
                }
            }

        });

        let showSaveScreen = async () => {
            pt.fromPlate = null;
            pt.toPlate = null;
            let savedScreens = await exec('baja/table/io/save-yakro.js', pt, paint_panel)
            showModal(savedScreens);

        }

        let plateDimensions = 384;
        let currentType = 'Synthesis'
        let new_plate_panel;
        let __nameHook = createIonFunction((ed) => {
            new_plate_panel = ed;
        });

        let plateName = {
            wid: 'card',
            data: {
                'style.padding-left': '5px',
                'style.padding-top': '1px',
                cards: [
                    [
                        {
                            'width': '85%',
                            'body': ``,
                            'component':
                            {
                                wid: 'input-param-items',
                                refCallback: __nameHook,
                                data: {
                                    'input_labels': ['Name'],
                                }
                            },

                        }
                    ],
                    [

                        {
                            'width': '100%',
                            'component': {
                                wid: 'radio-buttons',
                                data: [
                                    {
                                        label: 'Synthesis',
                                        ionfunction: createIonFunction(
                                            () => {
                                                currentType = 'Synthesis'
                                            }
                                        )
                                    },
                                    {
                                        label: 'Lyophilized',
                                        ionfunction: createIonFunction(
                                            () => {
                                                currentType = 'Lyophilized'
                                            }
                                        )
                                    },

                                    {
                                        label: 'QC',
                                        ionfunction: createIonFunction(
                                            () => {
                                                currentType = 'QC'
                                            }
                                        )
                                    },
                                    {
                                        label: 'RNA',
                                        ionfunction: createIonFunction(() => {
                                            currentType = 'RNA'
                                        }
                                        )
                                    },
                                    {
                                        label: 'Treatment',
                                        ionfunction: createIonFunction(() => {
                                            currentType = 'Treatment'
                                        }
                                        )
                                    },
                                    {
                                        label: 'Excel',
                                        ionfunction: createIonFunction(() => {
                                            currentType = 'excel'
                                        }
                                        )
                                    },
                                    {
                                        label: 'Other',
                                        ionfunction: createIonFunction(() => {
                                            currentType = '---'
                                        }
                                        )
                                    },

                                ]
                            }

                        },

                    ],

                    [

                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Create plate', ionFunction: createIonFunction(async (button) => {
                                                let name = new_plate_panel.get('Name')
                                                pt.newRoot(name, currentType)
                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        },

                    ]
                ]
            }
        }

        let run_from_level = async () => {
            smenu = null;
            mouseMoveListener = null;
            mouseUpListener = null;
            mouseDownListener = null;
            currentShape = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                visible: false
            }
            let m = await exec('baja/plate/views/run-from-level.js', pt)
            mouseMoveListener = m.mouseMoveListener;
            mouseUpListener = m.mouseUpListener;
            mouseDownListener = m.mouseDownListener;
            draw = m.draw;
            menuManager = m.menuManager;

        }

        let menu = {
            wid: 'menu',
            data: {
                menus: [
                    {
                        'label': 'File', 'items': [

                            {
                                'label': 'New', 'ionfunction': createIonFunction(async () => {
                                    pt.reset();

                                })
                            },

                            {
                                'label': 'Save', 'ionfunction': createIonFunction(async () => {
                                    showSaveScreen();
                                })
                            },

                            {
                                'label': 'Paste', 'ionfunction': createIonFunction(async () => {
                                    await pushOntoHistory();
                                    const text = await navigator.clipboard.readText();
                                    await exec('baja/plate/data/import-data.js', text, pt, paint_panel)

                                })

                            }

                        ]
                    },

                    {
                        'label': 'Workbench', 'items': [

                            {
                                'label': 'Lasso select', 'ionfunction': createIonFunction(() => {
                                    lassoPolygon = [];
                                    this.isDrawing = false;
                                    let lasso = {
                                        id: 'lasso-select-table',
                                        priority: true,
                                        mouseMoveListener: (x, y) => {
                                            if (!isDrawing) return;
                                            lassoPolygon.push({ x: x, y: y });
                                        },
                                        mouseUpListener: (x, y) => {
                                            if (!isDrawing) {
                                                return;
                                            }

                                            isDrawing = false;
                                            lassoPolygon.push({ x: x, y: y });

                                            if (lassoPolygon.length > 1) {
                                                lassoPolygon.push({ x: lassoPolygon[0].x, y: lassoPolygon[0].y });
                                            }

                                            let scPolygon = lassoPolygon.map(point => {
                                                return {
                                                    x: (point.x),
                                                    y: (point.y)
                                                };
                                            });
                                            pt.lassoSelect(scPolygon, pt.grid);
                                        },
                                        mouseDownListener: (x, y) => {
                                            isDrawing = true;
                                            lassoPolygon = [{ x: x, y: y }];
                                        },
                                        draw: (grid, ctx) => {
                                            ctx.strokeStyle = 'black';
                                            ctx.lineWidth = 2;

                                            if (lassoPolygon && lassoPolygon.length > 0) {
                                                ctx.beginPath();
                                                ctx.moveTo((lassoPolygon[0].x), (lassoPolygon[0].y));
                                                for (let i = 1; i < lassoPolygon.length; i++) {
                                                    let lx = (lassoPolygon[i].x);
                                                    let ly = (lassoPolygon[i].y);
                                                    ctx.lineTo(lx, ly);
                                                }
                                                if (!isDrawing)
                                                    ctx.closePath();
                                                ctx.stroke();
                                            }
                                        },
                                        menuManager: null
                                    }
                                    wb(lasso)

                                })
                            },
                            {
                                'label': 'Deselect cells', 'ionfunction': createIonFunction(() => {
                                    pt.deselectWells();
                                })
                            },
                        ],
                    },

                    {
                        'label': 'View', 'items': [
                            {
                                'label': 'Nav', 'ionfunction': createIonFunction(async () => {
                                    dragnavigate();
                                })
                            },
                            {
                                'label': 'Zoom out', 'ionfunction': createIonFunction(async () => {
                                    zoomout();
                                    dragnavigate();
                                })
                            },
                            {
                                'label': 'View all plates', 'ionfunction': createIonFunction(async () => {
                                    zoomtofitplates();
                                    dragnavigate();

                                })
                            },

                        ],
                    },
                ]
            }
        }

        let button_canvas = {
            wid: 'button-canvas',
            refCallback: cb,
            componentRef: 'menu',
            data: {
                'title': '',
                'height': 20,
                'grid': {
                    xmin: 0,
                    xmax: 14,
                    ymin: 0.1,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': [

                ]
            }
        }

        let button_canvas_bottom = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 20,
                'grid': {
                    xmin: 0,
                    xmax: 45,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': [
                    {
                        x: 0, y: 0, label: 'Left', ionFunction: createIonFunction(() => {
                            shiftLeft(2);
                        }), icon: '/assets/img/icons/png/left.png'
                    },
                    {
                        x: 2, y: 0, label: 'Right', ionFunction: createIonFunction(() => {
                            shiftRight(2);
                        }), icon: '/assets/img/icons/png/right.png'
                    },
                    {
                        x: 4, y: 0, label: 'Up', ionFunction: createIonFunction(() => {
                            shiftUp(3);
                        }), icon: '/assets/img/icons/png/up.png'
                    },
                    {
                        x: 6, y: 0, label: 'Down', ionFunction: createIonFunction(() => {
                            shiftDown(3);
                        }), icon: '/assets/img/icons/png/down.png'
                    },
                    {
                        x: 10, y: 0, label: 'zoom in', ionFunction: createIonFunction(async () => {
                            await zoomin();

                        }), icon: '/assets/img/icons/png/zoom-in.png'

                    },

                    {
                        x: 8, y: 0, label: 'Zoom out', ionFunction: createIonFunction(() => {

                            zoomout();
                        }), icon: '/assets/img/icons/png/zoom-out.png'
                    },
                    {
                        x: 12, y: 0, label: 'Move options', ionFunction: createIonFunction(async () => {
                            wb(null)

                            dragnavigate();

                        }), icon: '/assets/img/icons/png/move.png'

                    },

                    {
                        x: 14, y: 0, label: 'Drag zoom', ionFunction: createIonFunction(async () => {
                            wb(null)
                            let Rectangle = await exec('flexigraph/shapes/rect.js')
                            mouseDownListener = async (x, y) => {
                                currentShape = new Rectangle('test', pt.grid.Xwc(x), pt.grid.Ywc(y));
                                currentShape.visible = true;
                                md = true;
                            }
                            mouseMoveListener = (x, y) => {
                                if (!md) {
                                    currentShape = null;
                                    return;
                                }
                                if (currentShape && !freezFrame) {
                                    currentShape.update(pt.grid.Xwc(x), pt.grid.Ywc(y))
                                }
                            }

                            mouseUpListener = async (x, y) => {
                                md = false;

                                if (currentShape) {
                                    let sw = pt.grid.screenWidth(currentShape.w);
                                    let sh = pt.grid.screenHeight(currentShape.h);
                                    if (sw < 20 || sh < 20) {
                                        return;
                                    }
                                    let ag = new AnimateGrid(pt.grid);
                                    await ag.animateTo((currentShape.x), currentShape.x + currentShape.w,
                                        currentShape.y - currentShape.h, currentShape.y, 10)
                                }

                                smenu = null;
                                currentShape = null;

                            }

                        }), icon: '/assets/img/icons/png/box-zoom.svg'

                    },

                    {
                        x: 16, y: 0, label: 'P', ionFunction: createIonFunction(async () => {
                            editPlateProperties();
                        })

                    },
                    {
                        x: 18, y: 0, label: 'W', ionFunction: createIonFunction(async () => {
                            viewWells();
                        })

                    },
                    {
                        x: 20, y: 0, label: 'F', ionFunction: createIonFunction(async () => {

                            smenu = null;
                            mouseMoveListener = null;
                            mouseUpListener = null;
                            mouseDownListener = null;
                            currentShape = {
                                x: 0,
                                y: 0,
                                w: 0,
                                h: 0,
                                visible: false
                            }
                            let m = await exec('baja/plate/views/edit-workbench-function-on-canvas.js', pt)
                            mouseMoveListener = m.mouseMoveListener;
                            mouseUpListener = m.mouseUpListener;
                            mouseDownListener = m.mouseDownListener;
                            draw = m.draw;
                            menuManager = m.menuManager;

                        })

                    },

                ]
            }
        }

        lineage_card = {
            wid: 'card',
            data: {
                'style.padding-right': '1px',
                'style.padding-left': '5px',
                'style.padding-top': '1px',
                'width': '100%',
                cards: [
                    [
                        {
                            'width': '100%',
                            'body': ``,
                            'component': menu
                        }
                    ],

                    [
                        {
                            'width': '85%',
                            'height': '100%',
                            'body': `
                `                   , 'component': button_canvas_bottom

                        },
                    ],

                    [
                        {
                            'width': '100%',
                            'height': '100%',
                            'body': `
                `                   , 'component': paint_panel

                        },
                    ],
                ]
            }
        }

        resolve(lineage_card)
    })

}
