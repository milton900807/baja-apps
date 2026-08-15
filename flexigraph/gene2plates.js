function (plateManager, progress) {

    return new Promise(async (resolve, reject) => {
        if (progress) {
            progress(5)
        }

        let lastMouseMoveTime = Date.now();
        let isPaused = false;
        const INACTIVITY_LIMIT = 60 * 5000;

        let CanvasToSVGProxy = await exec('flexigraph/svg-canvas.js')
        let Oligo = await exec('flexigraph/oligo.js')
        let MGrid = await exec('flexigraph/grid.js')
        if (progress) {
            progress(7)
        }
        let shapes = await exec('flexigraph/gene-draw.js')

        let ChemTemplate = await exec('flexigraph/chem.js')
        let Menu;
        if (isMobile()) {
            Menu = await exec('flexigraph/menu-m.js')
        } else {
            Menu = await exec('flexigraph/menu.js')

        }

        let Annotation = await exec('flexigraph/annotation.js')
        if (progress) {
            progress(10)
        }

        let Glyph = await exec('baja/draw/glyph.js')

        let { Track, TrackRef } = await exec('baja/bio/track.js')
        if (progress) {
            progress(15)
        }
        let PCAPlot = await exec("flexigraph/pca-plot.js");
        let MPlot = await exec("flexigraph/plot.js");

        let TrackLayer = await exec('baja/bio/track-layer.js')
        if (progress) {
            progress(17)
        }

        let RectangleText = await exec('flexigraph/shapes/Rect-text.js')
        let Icon = await exec('flexigraph/shapes/icon.js')
        let Oval = await exec('flexigraph/shapes/oval.js')
        if (progress) {
            progress(20)
        }
        let Rectangle = await exec('flexigraph/shapes/rect.js')
        let Line = await exec('flexigraph/shapes/line.js')
        let { Citation, CitationItem } = await exec('flexigraph/shapes/citation.js')
        let TrackPlot = await exec('flexigraph/track-plot.js')

        if (progress) {
            progress(30)
        }
        if (progress) {
            progress(35)
        }
        class StateProps {
            selected_chemistry;
            filters = [];
            rules = [];
        }

        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let PlateTrack = await exec('baja/plate/plate-track.js')
        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')
        let TransferFunction = await exec('baja/plate/transfer-functions.js')
        let WorkbenchFunction = await exec('baja/plate/views/workbench-function')
        let Connection = await exec('baja/plate/connect')

        let staticImage = false;

        let GeneGraph = class GeneGraph {
            graph;
            fontSize = 12;
            file = null;
            folder = null;
            parentId = null;
            props = new StateProps();
            strand;
            coords;
            ycoords;
            track = [];
            layers = [];
            listener;
            mouseListener;
            graphListener;
            mouseDownListener;
            mouseUpListener;
            mouseMoveListener;
            pinchListener;
            touchStart;
            touchEnd;
            touchMove;
            dblclick;
            wheel;
            bookmarkMouseDownListener;
            bookmarkMouseUpListener;
            bookmarkMouseMoveListener;
            bookmarkhighlight = -1;
            chapterMouseDownListener;
            chapterMouseUpListener;
            chapterMouseMoveListener;
            elastic = true;
            mouseDown = false;
            select_ = false;
            mouseDownListeners = []
            mouseUpListeners = []
            mouseMoveListeners = []
            controlPanel;
            mode = 'gene'
            chem = [];
            plates = [];
            plots = []
            startX = 0;
            endX = 0;
            menu = null;
            bookmark_menu = null;
            currentShape;
            highlightObject;
            shapes = [];
            bookmarks = {}
            chapter_menu = null;
            showBookmarks = false;
            showChapters = false;
            xwc = -1;
            ywc = -1;
            initDwn;
            prev;
            message = null;
            preferences = {};
            selectedCompounds = []
            baseIndex = null;
            highlight_object;
            hx = 20;
            hy = 190;
            highlightmethod = null;
            showNavigationControl = true;
            showDisplay = true;
            highlight_feature = false;
            genegraph_panel_layout;
            initView = null;
            blick = '';
            messagex = 150;
            messagey = 25;
            error = null;
            md = false;
            paste_transient_;
            ts_transient_;
            animating = false;
            pauseDraw = false;
            post_graphics_modifications;
            plateTrack;

            nextTrackY() {
                if (!this.track || this.track.length === 0) {
                    return 0;
                }
                let maxy = this.track.reduce((maxObj, currentObj) => {
                    return (currentObj.y > maxObj.y) ? currentObj : maxObj;
                })
                return maxy.y + 2;
            }
            setSelectedCompounds(s) {
                this.selectedCompounds = s;
            }

            deselectAllCompounds() {
                for (let s of this.selectedCompounds) {
                    if (s.o.setSelected)
                        s.o.setSelected(false);
                }
                this.selectedCompounds = []
            }

            errortimeout;
            setError(m) {
                this.error = m;
                if (this.errortimeout) {
                    clearTimeout(this.errortimeout)
                }
                this.timerrortimeouteout = setTimeout(() => {
                    this.error = null;
                }, 15000)
            }

            toJSON() {
                return {
                    graph: this.graph ? this.graph.toJSON() : null,
                    fontSize: this.fontSize,
                    file: this.file,
                    folder: this.folder,
                    parentId: this.parentId,
                    props: this.props,
                    strand: this.strand,
                    coords: this.coords,
                    ycoords: this.ycoords,
                    track: this.track.map(t => t.toJSON()),
                    layers: this.layers.map(layer => layer.toJSON()),
                    chem: this.chem,
                    plates: this.plates,
                    plots: this.plots.map(p => p.toJSON()),
                    startX: this.startX,
                    endX: this.endX,
                    menu: this.menu ? this.menu.toJSON() : null,
                    currentShape: this.currentShape ? this.currentShape.toJSON() : null,
                    shapes: this.shapes.map(s => s.toJSON()),
                    bookmarks: this.bookmarks,
                    chapter_menu: this.chapter_menu ? this.chapter_menu.toJSON() : null,
                    showBookmarks: this.showBookmarks,
                    showChapters: this.showChapters,
                    xwc: this.xwc,
                    ywc: this.ywc,
                    message: this.message,
                    preferences: this.preferences,
                    selectedCompounds: this.selectedCompounds,
                    baseIndex: this.baseIndex,
                    highlight_object: this.highlight_object,
                    hx: this.hx,
                    hy: this.hy,
                    highlightmethod: this.highlightmethod,
                    showNavigationControl: this.showNavigationControl,
                    showDisplay: this.showDisplay,
                    highlight_feature: this.highlight_feature,
                    genegraph_panel_layout: this.genegraph_panel_layout,
                    initView: this.initView ? this.initView.toJSON() : null,
                    blick: this.blick,
                    messagex: this.messagex,
                    messagey: this.messagey,
                    error: this.error,
                    plateTrack: this.plateTrack ? this.plateTrack.toJSON() : null,
                }
            }

            timeout;
            setMessage(m, messagex, messagey) {
                this.centerMessage = false;
                this.message = m;
                if (messagex != null && messagex > 0) {
                    this.messagex = messagex;
                }
                if (messagey != null && messagey > 0) {
                    this.messagey = messagey;
                }
                if (this.timeout) {
                    clearTimeout(this.timeout)
                }
                this.timeout = setTimeout(() => {
                    this.message = null;
                    this.messagex = 150;
                    this.messagey = 25;
                }, 5000)
            }

            setMessageCenter(m, fontSize) {
                this.message = m;
                this.centerMessage = true;
                let originalFontSize = this.fontSize;
                this.fontSize = fontSize;
                if (this.timeout) {
                    clearTimeout(this.timeout)
                }
                this.timeout = setTimeout(() => {
                    this.message = null;
                    this.centerMessage = false;
                    this.fontSize = originalFontSize;
                }, 10000)
            }

            isConnected() {
                if (!this.graph) {
                    return false;
                }
                let ctx = this.graph.canvas.getCTX();
                if (ctx != null) {
                    return ctx.canvas.isConnected;
                }
                return false;
            }
            saveCurrentShape() {
                this.pushOntoHistory()

                if (this.currentShape.w <= 0 || this.graph.screenWidth(this.currentShape.w) <= 5) {
                    this.currentShape = null;
                    return;
                }
                this.shapes.push(this.currentShape);
                this.currentShape = null;
            }
            removeShape(shape) {
                let s = []
                for (let ss of this.shapes) {
                    if (ss != shape) {
                        s.push(ss)
                    }
                }
                this.shapes = s;
            }

            setPasteFunction(paste_function) {
                this.paste_transient_ = paste_function;
            }
            getPasteFunction() {
                return this.paste_transient_
            }

            pushCurrentShape() {
                if (this.currentShape.w <= 0 || this.graph.screenWidth(this.currentShape.w) <= 5) {
                    this.currentShape = null;
                    return;
                }
                this.shapes.push(this.currentShape);
                this.currentShape = null;
            }

            async showTracksMenu() {
                let m = []
                for (let l of this.track) {

                    let tname = l.description;
                    if (tname == null || tname.length < 1) {
                        tname = l.name;
                    }

                    m.push({
                        label: tname,
                        click: async (xwc, ywc) => {
                            let offset = l.tgraph.width / 6

                            this.graph.setymax(l.tgraph.yi + l.tgraph.height + 10)
                            this.graph.setymin(l.tgraph.yi - Math.abs(l.tgraph.height) - 10)
                            this.graph.setxmin(l.tgraph.xi - offset)
                            this.graph.setxmax(l.tgraph.xi + l.tgraph.width + offset)
                            this.graph.rescale();

                        },
                        move: () => {
                        }
                    })
                }

                let ChapterMenu;
                if (isMobile())
                    ChapterMenu = await exec('flexigraph/menu-chapter-m.js')
                else
                    ChapterMenu = await exec('flexigraph/menu-chapter.js')

                this.chapter_menu = new ChapterMenu(m, 0, 5, this.graph)
                this.chapter_menu.title = '';
                this.showChapters = true;
                this.showBookmarks = false;
            }

            async showMenuForAnnotation(title, annotation) {
                let m = []
                for (let l of this.track) {
                    for (let o of l.oligos) {
                        if (annotation === 'amplicon' && o.type === annotation) {
                            m.push({
                                label: o.left.xi + '...' + o.right.xi,
                                click: async (xwc, ywc) => {
                                    this.animateTo(l.tgraph.X(o.left.xi - 5), l.tgraph.X(o.right.xf + 5), l.tgraph.Y(o.left.y - 1), l.tgraph.Y(o.left.y + 1))

                                },
                                move: () => {
                                }
                            })

                        }
                    }

                }
                let ChapterMenu;
                if (!isMobile())
                    ChapterMenu = await exec('flexigraph/menu-chapter.js')
                else
                    ChapterMenu = await exec('flexigraph/menu-chapter-m.js')

                this.chapter_menu = new ChapterMenu(m, 0, 350, this.graph)
                this.chapter_menu.title = title;
                this.showChapters = true;
                this.showBookmarks = false;
            }

            updateObject(obj, newObject) {

                for (let o = 0; o < this.shapes.length; o++) {
                    if (this.shapes[o] === obj) {
                        this.shapes[o] = newObject;
                    }
                }
            }

            getViewport() {
                let vt = [];
                for (let v of this.track) {
                    if (
                        ((v.tgraph.xi + v.tgraph.width > this.graph.grid.xmin) && (v.tgraph.xi + v.tgraph.width < this.graph.grid.xmax) ||
                            (v.tgraph.xi < this.graph.grid.xmax && v.tgraph.xi > this.graph.grid.xmin) ||
                            v.tgraph.xi < this.graph.grid.xmin && v.tgraph.xi + v.tgraph.width > this.graph.grid.xmax ||
                            v.tgraph.xi > this.graph.grid.xmin && v.tgraph.xi + v.tgraph.width < this.graph.grid.xmax) &&
                        ((v.tgraph.yi + v.tgraph.height > this.graph.grid.ymin) && (v.tgraph.yi + v.tgraph.height < this.graph.grid.ymax) ||
                            (v.tgraph.yi < this.graph.grid.ymax && v.tgraph.yi > this.graph.grid.ymin) ||
                            v.tgraph.yi < this.graph.grid.ymin && v.tgraph.yi + v.tgraph.height > this.graph.grid.ymax ||
                            v.tgraph.yi > this.graph.grid.ymin && v.tgraph.yi + v.tgraph.height < this.graph.grid.ymax)
                    ) {
                        vt.push(v);
                        if (v.trackRef && v.trackRef.track) {
                            vt.push(v.trackRef.track)
                        }
                    }
                }
                let vo = []
                for (let v of this.shapes) {
                    if ((v.x + v.w > this.graph.grid.xmin) && (v.x + v.w < this.graph.grid.xmax) ||
                        (v.x < this.graph.grid.xmax && v.x > this.graph.grid.xmin) ||
                        v.x < this.graph.grid.xmin && v.x + v.w > this.graph.grid.xmax ||
                        v.x > this.graph.grid.xmin && v.x + v.w < this.graph.grid.xmax) {
                        vo.push(v);
                    }
                }
                let viewport = {
                    viewport: {
                        shapes: vo,
                        track: vt,
                        grid: this.graph.grid
                    }
                }

                return viewport;
            }

            async runfun(fun, track) {
                await fun(this, track)
            }
            async rungraph(fun) {
                await fun(this)
            }

            async show_chapters(chapters) {
                let list = Object.keys(chapters);
                let m = []
                for (let l of list) {
                    m.push({
                        label: l,
                        click: async (xwc, ywc) => {
                            if (this.lock)
                                return;
                            let bm = chapters[l]
                            this.lock = true;
                            await this.loadChapter(bm, false);
                            this.lock = false;
                            setTimeout(async () => {
                                if (this.bookmarks && Object.keys(this.bookmarks).length > 0) {
                                    let blist = Object.keys(this.bookmarks);

                                    await this.goToBookmark(this.bookmarks[blist[0]])
                                }
                            }, 3000)

                        },
                        move: () => {
                        }
                    })
                }

                let ChapterMenu;
                if (!isMobile())
                    ChapterMenu = await exec('flexigraph/menu-chapter.js')
                else
                    ChapterMenu = await exec('flexigraph/menu-chapter-m.js')

                this.chapter_menu = new ChapterMenu(m, 0, 50, this.graph)
                this.chapter_menu.title = 'Chapters';
                this.showChapters = true;
                this.showBookmarks = true;
            }

            async loadBookmark(title) {
                this.goToBookmark(this.bookmarks[title])
            }

            async loadChapter(path) {
                let obj = await exec(path)
                if (obj) {
                    await this.update(obj);
                }
                else {
                    alert(' Failed to find the chapter ' + title);
                }
            }

            setTrackOnTop(trackIndex) {
                let t = this.track[trackIndex]
                let newOrder = []
                newOrder.push(t);
                for (let i = 0; i < this.track.length; i++) {
                    if (i != trackIndex)
                        newOrder.push(this.track[i])
                }
                this.track = newOrder;

            }
            setTrackOnBottom(trackIndex) {
                let t = this.track[trackIndex]
                let newOrder = []
                for (let i = 0; i < this.track.length; i++) {
                    if (i != trackIndex)
                        newOrder.push(this.track[i])
                }
                newOrder.push(t);
                this.track = newOrder;

            }

            pushOntoHistory() {
                (async () => {
                    try {
                        var cache = [];
                        let gs = await JSON.stringify(this, function (key, value) {
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
                                if (value.showSnpIndels) {
                                }
                                cache.push(value);
                            }
                            return value;
                        });

                    } catch (error) {
                        console.error('Error:', error);
                    }
                })()
            }

            async update(graph, load_type) {
                if (load_type && load_type === 'readonly') {
                    PlateTrack = await exec('baja/plate/plate-track-view.js')
                    MPlot = await exec("flexigraph/plot-view")

                }
                if (graph.msg) {
                    log(graph.msg)
                    return;
                }
                this.shapes = [];
                this.menu = null;
                this.setMouseMode('navigate')
                this.track = [];
                this.chem = [];
                this.plates = [];
                this.startX = 0;
                this.endX = 0;

                try {
                    this.chem = graph.chem;
                    this.endX = graph.endx;
                } catch (exception) {
                    console.log(' exception ' + exception);
                }
                if (!graph || !graph.graph || !graph.graph.grid) {
                    return;
                }

                let temp_grid = Object.assign(new MGrid(), graph.graph.grid);

                temp_grid.width = this.graph.grid.width;
                temp_grid.height = this.graph.grid.height;
                this.graph.grid = temp_grid;
                this.elastic = graph.elastic;
                this.mode = graph.mode;
                if (graph.plots)
                    this.plots = graph.plots;
                this.plates = graph.plates;
                this.startX = graph.startX;
                this.track = [];
                let _tracks = graph.track;

                let TrackLink = await exec('baja/bio/track-link.js')

                if (this.plots) {
                    for (let i = 0; i < this.plots.length; i++) {
                        if (this.plots[i].lineColor != null) {

                            this.plots[i] = Object.assign(new MPlot(null, null), this.plots[i]);
                            this.plots[i].grid = Object.assign(new MGrid(), this.plots[i].grid)

                        } else {
                            this.plots[i] = Object.assign(new PCAPlot(null, null), this.plots[i]);
                            this.plots[i].grid = Object.assign(new MGrid(), this.plots[i].grid)
                        }
                    }
                }

                if (_tracks && _tracks.length > 0) {

                    for (let t of _tracks) {
                        await this.___setTrack(t);
                    }
                }

                let findTrack = (id) => {
                    for (let t of this.track) {
                        console.log(' t id ' + t.id)
                        if (t.id === id) {
                            return t;
                        }
                    }
                }

                let _layers = graph.layers;
                if (_layers && _layers.length > 0) {
                    for (let layer of _layers) {
                        let tp = Object.assign(new TrackLink(), layer);

                        let ftrack = findTrack(tp.track1.id);
                        if (ftrack) {
                            tp.track1.track = ftrack;
                        }
                        let rtrack = findTrack(tp.track2.id);
                        if (rtrack) {
                            tp.track2.track = rtrack;
                        }
                        if (tp.track1.track && tp.track2.track)
                            this.layers.push(tp)
                    }
                }

                let _shapes = graph.shapes;
                if (_shapes && _shapes.length > 0) {
                    for (let t of _shapes) {
                        if (t) {
                            if (t.type === 'Rectangle') {
                                var foo = Object.assign(new Rectangle(), t);
                                this.shapes.push(foo);
                            } else
                                if (t.type === 'oval') {
                                    var foo = Object.assign(new Oval(), t);
                                    this.shapes.push(foo);
                                } else if (t.type === 'line') {
                                    var foo = Object.assign(new Line(), t);
                                    this.shapes.push(foo);
                                } else if (t.type === 'icon') {
                                    var foo = Object.assign(new Icon(), t);
                                    let image = new Image()
                                    if (!t.b64) {
                                        image.src = t.img;
                                        foo.img = image;
                                    } else {
                                        image.src = t.b64;
                                        foo.img = image;
                                    }
                                    this.shapes.push(foo);
                                } else if (t.type === 'RectangleText') {
                                    var foo = Object.assign(new RectangleText(), t);
                                    this.shapes.push(foo);
                                } else if (t.type === 'Citation') {
                                    var foo = Object.assign(new Citation(), t);
                                    if (t.citations && t.citations > 0) {
                                        for (let c of t.citations) {
                                            let cfoo = Object.assign(new CitationItem(), c);
                                            foo.citations.push(cfoo);
                                        }
                                    }
                                    this.shapes.push(foo);
                                }
                        }
                    }
                }

                for (let pt of this.track) {
                    if (pt.trackRef && pt.trackRef.track && pt.trackRef.track.name) {
                        for (let t of this.track) {

                            if (pt.trackRef && pt.trackRef.name != null) {
                                if (pt.trackRef.name === t.name)
                                    pt.trackRef.track = t;
                            }
                        }
                    }
                }
                this.bookmarks = {}
                let _bookmarks = graph.bookmarks;
                let bookmark_keys = Object.keys(_bookmarks);
                for (let b of bookmark_keys) {
                    this.bookmarks[b] = Object.assign(new MGrid(), _bookmarks[b])
                }
                this.graph.grid.rescale();
                await this.buildBookmark();
                this.syncTrackRef();
                this.initView = Object.assign(new MGrid(), this.graph.grid)

                if (graph.plateTrack) {
                    this.updatePlateTracks(graph.plateTrack)
                }
            }
            async updateImport(fs) {
                let loadPlates = (obj) => {
                    let ps = [];
                    if (obj && obj.length > 0) {

                        for (let a of obj) {
                            let p = Object.assign(new Plate(), a)
                            if (p.plates && p.plates.length > 0) {
                                let pa = loadPlates(p.plates)
                                p.plates = pa;
                            }
                            p.grid = Object.assign(new MGrid(), p.grid)
                            let ww = []
                            let rows = a.wells;
                            if (rows)
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
                    }
                    return ps;
                }

                let ffs = Object.assign(new PlateTrack(), fs.plateTrack)
                const r = loadPlates(ffs.root);
                for (let i of r) {
                    plateManager.plateTrack.root.push(i)
                }
                plateManager.plateTrack.generateTableMenu();
            }

            updatePlateTracks(fs) {
                let loadPlates = (obj) => {
                    let ps = [];
                    for (let a of obj) {

                        let p = Plate.buildPlateFromJSON(a);
                        if (p.plates && p.plates.length > 0) {
                            let pa = loadPlates(p.plates)
                            p.plates = pa;
                        }
                        p.grid = Object.assign(new MGrid(), p.grid)
                        let ww = []
                        let rows = a.wells;
                        if (rows)
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

                ffs.attr__drawFormulaConnections = fs.attr__drawFormulaConnections;
                ffs.attr__tablesMenu = fs.attr__tablesMenu;
                ffs.attr__displayEvents = fs.attr__displayEvents;
                ffs.attr__AutoRunCalculation = fs.attr__AutoRunCalculation;
                ffs.attr__hideGrid = fs.attr__hideGrid;
                ffs.ifun = fs.ifun;
                ffs.background_function = fs.background_function;
                if (fs.background_function) {

                    function reconstituteFunction(jsonStr) {
                        const parsed = JSON.parse(jsonStr);
                        if (!parsed.__function__) {
                            throw new Error('No function string found');
                        }
                        const fnStr = parsed.__function__;
                        const revivedFn = eval('(' + fnStr + ')');
                        if (typeof revivedFn !== 'function') {
                            throw new Error('Reconstructed object is not a function');
                        }

                        return revivedFn;
                    }
                    ffs.background_function = reconstituteFunction(fs.background_function)
                }

                if (fs.actionGlyph) {
                    ffs.actionGlyph = Glyph.buildFromJSON(fs.actionGlyph)
                }

                ffs.type = fs.type;
                ffs.background = fs.background;

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
                if (fs.m_plots && fs.m_plots.length > 0) {
                    for (let p of fs.m_plots) {
                        let fp = MPlot.fromJSON(p)
                        plts.push(fp)
                    }
                }
                ffs.m_plots = plts;
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
                ffs.glyphs = []
                if (fs.glyphs) {
                    for (let g of fs.glyphs) {
                        let gg = Glyph.buildFromJSON(g)
                        if (gg) {
                            ffs.glyphs.push(gg)
                        }
                    }
                }

                ffs.trackFunctions = trackfunctions;
                ffs.grid = mgrid;
                if (fs.ptracks)
                    ffs.ptracks = fs.ptracks

                if (fs.ppath) {
                    ffs.ppath = fs.ppath;
                }

                this.plateTrack = ffs;
                this.plateTrack.selected_well = null;
                ffs.init();
                plateManager.setPlateTrack(this.plateTrack)
            }

            resetView() {
                this.graph.grid = Object.assign(new MGrid(), this.initView)
                this.graph.rescale();
            }

            createSubGrid(graphX, graphY) {
                let sw = this.graph.grid.screenHeight(10);
                let ww = this.graph.grid.worldWidth(sw);
                const grid = new MGrid(this.graph.grid.X(graphX), this.graph.grid.Y(graphY), this.graph.grid.screenWidth(ww), sw);
                return grid;
            }

            getHighlighted() {
                for (let s of this.shapes) {
                    if (s.hl) {
                        return s;
                    }
                }
            }

            addObjects(_shapes) {
                if (_shapes && _shapes.length > 0) {
                    for (let t of _shapes) {

                        if (t.type === 'Rectangle') {
                            var foo = Object.assign(new Rectangle(), t);
                            this.shapes.push(foo);
                        } else
                            if (t.type === 'oval') {
                                var foo = Object.assign(new Oval(), t);
                                this.shapes.push(foo);
                            } else if (t.type === 'line') {
                                var foo = Object.assign(new Line(), t);
                                this.shapes.push(foo);
                            } else if (t.type === 'icon') {
                                var foo = Object.assign(new Icon(), t);
                                let image = new Image()
                                image.src = foo.img;
                                foo.img = image;

                                this.shapes.push(foo);
                            } else if (t.type === 'RectangleText') {
                                var foo = Object.assign(new RectangleText(), t);
                                this.shapes.push(foo);
                            } else if (t.type === 'Citation') {
                                var foo = Object.assign(new Citation(), t);
                                if (t.citations && t.citations > 0) {
                                    for (let c of t.citations) {
                                        let cfoo = Object.assign(new CitationItem(), c);
                                        foo.citations.push(cfoo);
                                    }
                                }
                                this.shapes.push(foo);
                            }
                    }
                }
            }
            async addTrackJSONObjects(to) {
                let tokeys = Object.keys(to);
                for (let item of tokeys) {
                    await this.addTrackJSON(to[item]);
                }
            }

            addTrack(newTrack) {

                setTimeout(() => {
                    function overlap(track1, track2) {

                        if (track1 == track2) {
                            return false;
                        }
                        let track1Top = track1.tgraph.yi - track1.tgraph.height + 3;
                        let track1Bottom = track1.tgraph.yi;

                        let track2Top = track2.tgraph.yi - track2.tgraph.height;
                        let track2Bottom = track2.tgraph.yi;
                        if (track1Bottom < track2Top && track1Top > track2Bottom) {
                            return true;
                        }
                        return false;
                    }
                    while (this.track.some(existingTrack => overlap(existingTrack, newTrack))) {
                        newTrack.y += 3;
                        newTrack.tgraph.yi = newTrack.y;
                    }

                }, 200)
                this.track.push(newTrack);
            }

            trackExists(name) {
                for (let t of this.track) {
                    console.log(' track ' + t.name);
                    if (t.name && t.name.toUpperCase() === name.toUpperCase()) {
                        return true;
                    }
                }
                return false;
            }

            async addTrackJSON(jsonObject) {
                if (this.trackExists(jsonObject['name'])) {

                    return;
                }

                if (jsonObject.trackRef && jsonObject.trackRef.track) {

                    await this.addTrackJSON(jsonObject.trackRef.track);
                }
                let newTrack = await this.___setTrack(jsonObject);
                for (let pt of this.track) {
                    if (pt.trackRef && pt.trackRef.track && pt.trackRef.track.name) {
                        for (let t of this.track) {
                            if (pt.trackRef && pt.trackRef.track && pt.trackRef.track.name && pt.trackRef.track.name === t.name) {
                                pt.trackRef.track = t;
                            }
                        }
                    }
                }
                return newTrack;
            }

            markPosition(xi, xf) {
                for (let t of this.track) {
                    t.markstart = xi;
                    t.markend = xf;
                }
            }

            dehighlightAllSnps() {
                for (let t of this.track) {

                }
            }
            highlight(str, delay, color, highlight_object, hx, hy) {

            }

            clearMouseListeners(mo) {
                this.mouseDownListeners = []
                this.mouseMoveListeners = [];
                this.mouseUpListeners = [];
                this.graph.mode = 'none'
                this.highlightmethod = null;
                if (mo != null) {
                    exec(mo, this, this.genegraph_panel_layout)
                }
            }


            _drawCursorHint(ctx, text, mx, my) {
                const paddingX = 8;
                const paddingY = 6;
                const fontSize = isMobile() ? 12 : 15;
                const radius = 6;

                ctx.save();

                ctx.font = `${fontSize}px "Courier New", monospace`;
                ctx.textBaseline = 'top';
                ctx.textAlign = 'left'

                const metrics = ctx.measureText(text);
                const textWidth = metrics.width;
                const textHeight = Math.ceil(fontSize * 1.2);

                const boxW = Math.ceil(textWidth + paddingX * 2);
                const boxH = Math.ceil(textHeight + paddingY * 2);

                const clampPad = 6;
                const maxX = ctx.canvas.width - boxW - clampPad;
                const maxY = ctx.canvas.height - boxH - clampPad;

                let boxX = Math.max(clampPad, Math.min(mx - paddingX, maxX));
                let boxY = Math.max(clampPad, Math.min(my - paddingY, maxY));
                const textX = boxX + paddingX;
                const textY = boxY + paddingY;

                boxY -= 10;
                const liftedBoxY = Math.max(clampPad, boxY);

                const roundRect = (x, y, w, h, r) => {
                    const rr = Math.min(r, w / 2, h / 2);
                    ctx.beginPath();
                    ctx.moveTo(x + rr, y);
                    ctx.arcTo(x + w, y, x + w, y + h, rr);
                    ctx.arcTo(x + w, y + h, x, y + h, rr);
                    ctx.arcTo(x, y + h, x, y, rr);
                    ctx.arcTo(x, y, x + w, y, rr);
                    ctx.closePath();
                };

                ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
                ctx.shadowBlur = 14;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 6;

                roundRect(boxX, liftedBoxY, boxW, boxH, radius);
                ctx.fillStyle = 'rgba(14, 18, 14, 0.92)';
                ctx.fill();

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                roundRect(boxX, liftedBoxY, boxW, boxH, radius);
                ctx.strokeStyle = 'rgba(90, 255, 120, 0.35)';
                ctx.lineWidth = 1;
                ctx.stroke();

                roundRect(boxX + 1, liftedBoxY + 1, boxW - 2, boxH - 2, radius - 1);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.shadowColor = 'rgba(60, 255, 120, 0.55)';
                ctx.shadowBlur = 10;
                ctx.fillStyle = '#6CFF9A';
                ctx.fillText(text, textX, liftedBoxY + paddingY);

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.save();
                roundRect(boxX, liftedBoxY, boxW, boxH, radius);
                ctx.clip();
                ctx.globalAlpha = 0.07;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                for (let y = liftedBoxY; y < liftedBoxY + boxH; y += 3) {
                    ctx.beginPath();
                    ctx.moveTo(boxX, y);
                    ctx.lineTo(boxX + boxW, y);
                    ctx.stroke();
                }
                ctx.restore();

                ctx.restore();
            }

            setMouseMode(mode) {
                if (mode && mode === 'freeze') {
                    this.clearMouseListeners(null);
                    this.graph.mode = mode;

                } else {
                    this.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                    this.graph.mode = mode;
                }
            }

            setBaseIndex(b) {
                this.baseIndex = b;
            }

            addMouseDownListener(ml) {
                this.mouseDownListeners.push(ml);
            }
            addMouseUpListener(ml) {
                this.mouseUpListeners.push(ml);
            }
            addMouseMoveListener(ml) {
                this.mouseMoveListeners.push(ml);
            }

            updateMessagePanel(html) {
                if (this.controlPanel)
                    this.controlPanel.setHTML(html)
            }
            setTracks(tracks) {
                this.track = tracks;
                this.graph.setymax(this.track.length + 1)
                this.graph.setymin(-1.5)

            }
            dehighlightAllTracks() {
                for (let t of this.track) {
                    t.showResizeBar = false;
                }
            }

            deselectAllTracks() {
                this.currentShape = null;
                for (let t of this.track) {

                    t.markstart = -1;
                    t.markend = -1;
                    t.showResizeBar = false;
                    for (let o of t.oligos) {
                        o.setSelected(false)
                    }
                    for (let a of t.annotations) {
                        a.deselect();
                    }

                }
            }
            setBookmarks(_bookmarks) {
                this.bookmarks = _bookmarks;
                this.buildBookmark()
            }

            setBookmark(name) {
                this.bookmarks[name] = Object.assign(new MGrid(), this.graph.grid)
                this.buildBookmark();
            }
            addBookmark(name, grid) {
                this.bookmarks[name] = Object.assign(new MGrid(), grid)
                this.buildBookmark();
            }
            sleep = async (ms) => {
                return new Promise(resolve => setTimeout(resolve, ms));
            }

            async goToTrackLocus(trackName, xi, xf) {
                let selected = null;
                for (let l of this.track) {

                    if (l.name === trackName) {
                        selected = l
                    }
                }
                this.graph.rescale();

                if (selected) {
                    let grid_i = selected.tgraph.X(xi);
                    let grid_f = selected.tgraph.X(xf);

                    let wx = 5;
                    this.graph.setxmin(grid_i - wx);
                    this.graph.setxmax(grid_f + wx);

                    this.graph.setymin(selected.tgraph.yi + selected.tgraph.height)
                    this.graph.setymax(selected.tgraph.yi)
                }
            }

            async goToTrack(track) {
                return new Promise(async (resolve, reject) => {
                    let increment_ = 20;
                    let fromCx = (this.graph.grid.getxmax() - this.graph.grid.getxmin()) / 2;
                    let togrid = new MGrid(track.tgraph.xi - track.tgraph.xi * 0.01, track.tgraph.yi, track.tgraph.width, track.tgraph.height + track.tgraph.height * 0.01)

                    let toCx = (togrid.getxmax() - togrid.getxmin()) / 2;
                    let xdif = fromCx - toCx;
                    let translateMaxX = (this.graph.grid.getxmax() - togrid.getxmax()) / increment_;
                    let translateMinX = (this.graph.grid.getxmin() - togrid.getxmin()) / increment_;
                    let translateMaxY = (this.graph.grid.getymax() - togrid.getymax()) / increment_;
                    let translateMinY = (this.graph.grid.getymin() - togrid.getymin()) / increment_;
                    let yc = (this.graph.grid.getymax() - this.graph.grid.getymin()) / 2;
                    let ytc = (togrid.getymax() - togrid.getymin());
                    let ydif = ytc - yc;
                    let yincr = ydif / increment_;
                    for (let i = 0; i < increment_; i++) {
                        let max = this.graph.getxmax() - translateMaxX;
                        let min = this.graph.getxmin() - translateMinX;
                        if (max > min) {
                            this.graph.setxmin((min))
                            this.graph.setxmax((max))
                        } else {
                            this.graph.setxmin(togrid.getxmin());
                            this.graph.setxmax(togrid.getxmax());
                            i = increment_;
                        }

                        max = this.graph.getymax() - translateMaxY;
                        min = this.graph.getymin() - translateMinY;

                        if (max > min) {
                            this.graph.setymin(this.graph.getymin() - translateMinY)
                            this.graph.setymax(this.graph.getymax() - translateMaxY)
                        } else {
                            this.graph.setymin(togrid.getymin())
                            this.graph.setymax(togrid.getymax())
                            i = increment_;
                        }
                        this.graph.rescale();
                        await sleep(10)
                    }
                    this.graph.setxmin(togrid.getxmin());
                    this.graph.setxmax(togrid.getxmax());
                    this.graph.setymin(togrid.getymin())
                    this.graph.setymax(togrid.getymax())

                    this.graph.rescale();
                    return resolve();
                });
            }

            async goToBookmark(togrid) {
                if (togrid == null) {
                    console.log(' the goto grid is not defined ')
                    return;
                }
                return new Promise(async (resolve, reject) => {
                    let increment_ = 170;
                    let fromCx = (this.graph.grid.getxmax() - this.graph.grid.getxmin()) / 2;
                    let toCx = (togrid.getxmax() - togrid.getxmin()) / 2;
                    let xdif = fromCx - toCx;
                    let translateMaxX = (this.graph.grid.getxmax() - togrid.getxmax()) / increment_;
                    let translateMinX = (this.graph.grid.getxmin() - togrid.getxmin()) / increment_;
                    let translateMaxY = (this.graph.grid.getymax() - togrid.getymax()) / increment_;
                    let translateMinY = (this.graph.grid.getymin() - togrid.getymin()) / increment_;
                    let yc = (this.graph.grid.getymax() - this.graph.grid.getymin()) / 2;
                    let ytc = (togrid.getymax() - togrid.getymin());
                    let ydif = ytc - yc;
                    let yincr = ydif / increment_;
                    for (let i = 0; i < increment_; i++) {
                        let max = this.graph.getxmax() - translateMaxX;
                        let min = this.graph.getxmin() - translateMinX;
                        if (max > min) {
                            this.graph.setxmin((min))
                            this.graph.setxmax((max))
                        } else {
                            this.graph.setxmin(togrid.getxmin());
                            this.graph.setxmax(togrid.getxmax());
                            i = increment_;
                        }

                        max = this.graph.getymax() - translateMaxY;
                        min = this.graph.getymin() - translateMinY;

                        if (max > min) {
                            this.graph.setymin(this.graph.getymin() - translateMinY)
                            this.graph.setymax(this.graph.getymax() - translateMaxY)
                        } else {
                            this.graph.setymin(togrid.getymin())
                            this.graph.setymax(togrid.getymax())
                            i = increment_;
                        }
                        this.graph.rescale();
                        await sleep(10)
                    }
                    this.graph.setxmin(togrid.getxmin());
                    this.graph.setxmax(togrid.getxmax());
                    this.graph.setymin(togrid.getymin())
                    this.graph.setymax(togrid.getymax())
                    this.graph.rescale();
                    return resolve();

                });

            }

            async animateTo(xmin, xmax, ymin, ymax, incr) {

                if (this.animating) {

                    return;
                }

                this.animating = true;

                if (incr == null) {
                    incr = 150;
                }

                return new Promise(async (resolve, reject) => {
                    if (Math.abs(ymax - ymin) < 1) {
                        ymin = this.graph.grid.getymin();
                        ymax = this.graph.grid.getymax();
                    }

                    if (ymax < ymin) {
                        let t = ymin;
                        ymin = ymax;
                        ymax = t;
                    }

                    let xw = xmax - xmin;
                    let yw = ymax - ymin;
                    let currentAspectRatio = xw / yw;
                    if (currentAspectRatio < 10) {
                        let targetAspectRatio = 10;
                        let new_xw, new_yw;
                        if (currentAspectRatio < targetAspectRatio) {
                            new_xw = yw * targetAspectRatio;
                            new_xw = Math.max(new_xw, Math.abs(xw));
                            xmin = (xmax + xmin) / 2 - new_xw / 2;
                            xmax = xmin + new_xw;
                        } else {
                            new_yw = xw / targetAspectRatio;
                            new_yw = Math.max(new_yw, Math.abs(yw));
                            ymin = (ymax + ymin) / 2 - new_yw / 2;
                            ymax = ymin + new_yw;
                        }
                    }
                    if (currentAspectRatio > 5000) {
                        let targetAspectRatio = 5000;
                        let new_xw, new_yw;
                        if (currentAspectRatio < targetAspectRatio) {
                            new_xw = yw * targetAspectRatio;
                            new_xw = Math.max(new_xw, Math.abs(xw));
                            xmin = (xmax + xmin) / 2 - new_xw / 2;
                            xmax = xmin + new_xw;
                        } else {
                            new_yw = xw / targetAspectRatio;
                            new_yw = Math.max(new_yw, Math.abs(yw));
                            ymin = (ymax + ymin) / 2 - new_yw / 2;
                            ymax = ymin + new_yw;
                        }
                    }
                    let increment_ = incr;
                    let fromCx = (this.graph.grid.getxmax() - this.graph.grid.getxmin()) / 2;
                    let toCx = (xmax - xmin) / 2;
                    let xdif = fromCx - toCx;
                    let translateMaxX = (this.graph.grid.getxmax() - xmax) / increment_;
                    let translateMinX = (this.graph.grid.getxmin() - xmin) / increment_;
                    let translateMaxY = (this.graph.grid.getymax() - ymax) / increment_;
                    let translateMinY = (this.graph.grid.getymin() - ymin) / increment_;
                    for (let i = 0; i < increment_; i++) {
                        if (!this.animating) {
                            return resolve();
                        }

                        let Xmax = this.graph.getxmax() - translateMaxX;
                        let Xmin = this.graph.getxmin() - translateMinX;
                        let Ymax = this.graph.getymax() - translateMaxY;
                        let Ymin = this.graph.getymin() - translateMinY;
                        let xw = Xmin - Xmax;
                        let yw = Ymax - Ymin;
                        let currentAspectRatio = xw / yw;
                        if (currentAspectRatio < 10) {
                            let targetAspectRatio = 10;
                            let new_xw, new_yw;
                            if (currentAspectRatio < targetAspectRatio) {
                                new_xw = yw * targetAspectRatio;
                                new_xw = Math.max(new_xw, Math.abs(xw));
                                Xmin = (Xmax + Xmin) / 2 - new_xw / 2;
                                Xmax = Xmin + new_xw;
                            } else {
                                new_yw = xw / targetAspectRatio;
                                new_yw = Math.max(new_yw, Math.abs(yw));
                                Ymin = (Ymax + Ymin) / 2 - new_yw / 2;
                                Ymax = Ymin + new_yw;
                            }
                        }

                        if (Xmax > Xmin) {
                            this.graph.setxmin(Xmin);
                            this.graph.setxmax(Xmax);
                        }
                        if (Ymax > Ymin) {
                            this.graph.setymin(Ymin);
                            this.graph.setymax(Ymax);
                        } else {
                            this.graph.setymin(ymin);
                            this.graph.setymax(ymax);
                            i = increment_;
                        }
                        this.graph.rescale();
                        await sleep(1);
                    }

                    this.graph.setxmin(xmin);
                    this.graph.setxmax(xmax);
                    this.graph.setymin(ymin);
                    this.graph.setymax(ymax);

                    this.graph.rescale();
                    this.animating = false;

                    return resolve();

                });

            }

            addMouseListener(ml) {
                this.mouseListener = ml;
            }

            getTracks() {
                return this.track;
            }

            select() {
                this.select_ = true;
            }
            selectOff() {
                this.currentShape = null;
                this.select_ = false;
                this.deselectAllTracks();
                for (let s of this.shapes) {
                    if (s.highlight) {
                        s.highlight(false);
                    }
                }
            }
            async zoomToSelection() {
                await this.zoom(this.startX, this.endX)

            }
            setTrackCoordinates(trackIndex, start, end) {
                this.track[trackIndex].setTrackCoordinates(start, end);
            }
            async zoomTo(start, end) {
                this.startX = start;
                this.endX = end;
                await this.zoomToSelection();

            }

            zoomToTrack(trackindex, start, end) {
                let t = this.track[trackindex]
                let midpt = (-1 * t.tgraph.height / 2);
                let ht = (-1 * t.tgraph.height);
                let yi = t.tgraph.yi - ht;
                this.animateTo(t.tgraph.X(start), t.tgraph.X(end), yi - 0.5, yi + 0.5, 10);

            }

            async zoomToSelected() {
                await this.zoom(this.startX, this.endX)

            }

            getStructure(x, y) {
                let s = [];
                for (let t of this.track) {

                    let selected2 = t.getOligo(x, y, this.graph);
                    if (selected2 && selected2.length > 0)
                        s.push(selected2)
                }
                let shapes = []
                for (let sh of this.shapes) {
                    if (sh.isIn && sh.isIn(x, y)) {
                        shapes.push(sh)
                    }
                }
                s.push(shapes)

                return s;

            }

            getSNPs(x, y) {
                let gwcxs = this.graph.Xwc(0);
                if (!gwcxs)
                    return;
                let gwcxf = this.graph.Xwc(0 + this.graph.grid.width);
                if (!gwcxf)
                    return;
                let s = [];
                for (let t of this.track) {
                    let twcxs = t.tgraph.Xwc(gwcxs - 2 * t.tgraph.xi);
                    let twcxf = t.tgraph.Xwc(gwcxf - 2 * t.tgraph.xi);
                    let snps = t.getVisibleSNPs(twcxs, twcxf)

                    for (let snp of snps) {
                        if (snp != null && snp.over != null && this.graph != null) {
                            if (snp.over(x, y, this.graph, t.tgraph)) {
                                s.push(snp);
                            }
                        }
                    }

                }
                return s;
            }

            setymax(ymax) {
                this.graph.grid.ymax = ymax;
                this.graph.grid.rescale();
            }
            setymin(ymax) {
                this.graph.grid.ymin = ymax;
                this.graph.grid.rescale();

            }

            createChemTemplate(type, name, regex) {
                let c = new ChemTemplate(type, name, regex);
                this.chem.push(c);
                return c;
            }

            static async create(name, coords) {
                let sp = coords.split(':')
                let chrom = sp[0]
                let start = +sp[1].split('-')[0]
                let end = +sp[1].split('-')[1]
                return new Promise(async (resolve, reject) => {
                });
            }
            toGFF(str) {
                return new GFF(str);
            }
            addListener(listener) {
                this.listener = listener;

            }

            async loadEnsembleGene(obj, prefix) {
                let ajs = obj['Transcript']
                let ensembleId = obj['id']
                let index = 0;
                let startxi = 0;
                let startyi = 0;
                let endx = 220;
                let endy = 1;
                for (let js of ajs) {
                    let species = js['species']
                    let chromosome = js['seq_region_name']
                    let start = +js['start']
                    let end = +js['end']
                    let strand = js['strand']
                    let geneID = js['Parent']
                    let transcriptId = js['id']
                    let desc = js['display_name']

                    if (!desc) {
                        desc = ''
                    }

                    let biotype = js['biotype']
                    let display_name = js['display_name']

                    if (biotype == null) {
                        biotype = '';
                    }
                    if (display_name == null) {
                        display_name = '-';
                    }

                    let t = this.createTrack(display_name + '(' + transcriptId + ')' + biotype, start, end, strand);
                    t.transcriptID = transcriptId;
                    t.species = species;
                    t.chr = chromosome;
                    t.description = desc.toString();

                    t.geneID = geneID
                    t.tgraph.xi = 0;
                    this.graph.setymax(t.tgraph.yi + 1);
                    this.graph.setymin(t.tgraph.yi - 2);
                    let xm = 0.1 * t.tgraph.width
                    this.graph.setxmin(t.tgraph.xi - xm);
                    this.graph.setxmax(t.tgraph.xi + t.tgraph.width + xm);
                    let offset = t.tgraph.width / 2

                    if (index === 0) {
                        startxi = t.tgraph.xi - offset * 2;
                        startyi = t.tgraph.yi - Math.abs(t.tgraph.height) - 1;
                        endx = t.tgraph.xi + t.tgraph.width + offset;
                        endy = t.tgraph.yi + t.tgraph.height + 1;
                    }

                    if ((t.tgraph.xi + t.tgraph.width + offset) > endx) {
                        endx = t.tgraph.xi + t.tgraph.width + offset;
                    }
                    if (t.tgraph.yi + t.tgraph.height > endy) {
                        endy = t.tgraph.yi + t.tgraph.height + 1;
                    }
                    if (startyi > t.tgraph.yi - Math.abs(t.tgraph.height) - 1) {
                        startyi = t.tgraph.yi - Math.abs(t.tgraph.height) - 1;
                    }

                    this.graph.rescale();
                    let ensembl_sequence = prefix + `/sequence/id/${transcriptId}?content-type=text/plain`;
                    let fasta = await GETXT(ensembl_sequence)
                    fasta = fasta.trim();
                    if (t.strand < 0) {
                        let temp = '';
                        for (let c = fasta.length - 1; c > 0; c--) {
                            temp += fasta[c]
                        }
                        t.setSequence(temp)
                    } else {
                        t.setSequence(fasta)
                    }
                    index++;
                    this.buildENSEMBLAnnotations(t, js);
                    return t;
                }

                for (let t of this.track) {
                    t.showResizeBar = false;
                }

                setTimeout(() => {
                    this.animateTo(startxi, endx, startyi, endy)
                    this.setMouseMode('navigate')

                }, 1500)

            }

            createTrackFromLocal(js) {
                function adjustType(t) {
                    if (t === 'exon') {
                        return 'Exon'
                    }
                    else if (t === 'start_codon') {
                        return "TSS"
                    } else if (t === 'stop_codon') {
                        return "STOP"
                    } else if (t.startsWith('translation')) {
                        return 'Translation'
                    }
                    return t;
                }

                const annotations = js.map(item => {

                    let feature = item.feature;

                    let start = item.start;
                    let end = item.end;
                    let ID = item.attributes.ID;
                    let name__ = item.attributes.ID + "";
                    if (item.feature === 'exon') {
                        name__ = item.attributes.exon_id;
                    }
                    if (item.feature === 'CDS') {
                        name__ = item.attributes.ccdsid;
                    } else if (item.feature === "transcript") {
                        name__ = item.transcript_id;
                    }
                    if (!name__) {
                        name__ = feature;
                    }

                    let strand = item.strand;

                    let s = parseInt(start);
                    let e = parseInt(end);

                    let feature__ = adjustType(feature);

                    if (feature__ === 'Exon' || feature__ === "CDS"
                        || feature__.toLowerCase().startsWith('three_prime_utr')
                        || feature__.toLowerCase().startsWith('five_prime_utr')) {
                        ID = ID + s;
                    }

                    if (feature__.toLowerCase() === "transcript") {
                        ID = ""
                    }

                    if (feature__ === "TSS") {
                        e++;
                    }

                    let an = new Annotation(
                        adjustType(feature),
                        name__,
                        s,
                        e,
                        strand
                    );
                    an.shapeFunction = getIon(shapes[an.type])

                    return an;

                });

                return annotations;
            }

            getTracksInRange(start, end) {
                let sub = []
                for (let t of this.track) {
                    if (t.tgraph.xmin < start && start < t.tgraph.xmax || t.tgraph.xmin < end && end < t.tgraph.xmax) {
                        sub.push(t)
                    }
                }
                return sub;
            }

            async add(ensembleId, x, y, source) {
                ensembleId = ensembleId.trim();
                if (ensembleId.startsWith('NM_') || ensembleId.startsWith('NC_')) {
                    let mapped = await exec('py/ensembl/ncbi_to_ensembl.py', ensembleId)
                    if (mapped && mapped.length == 1) {
                        this.setMessage(" Loading..." + JSON.stringify(mapped))
                        return this.add(mapped[0], x, y, source)
                    }
                    return this.addNCBI(ensembleId)
                } else {
                    let prefix = null;
                    let genomes = ["HG19", "GRCH38"];
                    if (source && genomes.includes(source.toUpperCase())) {
                        prefix = `https://rest.ensembl.org`;

                    } else {
                        prefix = `https://rest.ensembl.org`;

                    }
                    if (ensembleId.indexOf('.') > 0) {
                        ensembleId = ensembleId.substring(0, ensembleId.indexOf('.'))
                    }
                    let js = {}
                    try {

                        if (ensembleId.toUpperCase().startsWith("ENST")) {

                            this.setMessage(' Loading... ' + ensembleId)
                            let host_ = window['env']['apiUrl']
                            let try_local = host_ + `/transcript/${ensembleId}`;
                            js = await GETJSON(try_local);

                            let jsm = js[0]
                            for (let jl of js) {
                                if (jl.feature === 'transcript') {
                                    jsm = jl
                                    break;
                                }
                            }

                            let desc = jsm.attributes.gene_name + ';' + jsm.attributes.transcript_name
                            let geneID = jsm.attributes.ID;

                            let start = parseInt(jsm['start'])
                            let end = parseInt(jsm['end'])

                            let strand = jsm['strand']
                            let chr = jsm['seqname']

                            if (strand === '+' || parseInt(strand) > 0) {
                                strand = 1;
                            } else {
                                strand = -1;
                            }

                            let t = this.createTrack(ensembleId, start, end, strand);
                            t.transcriptID = ensembleId;
                            t.species = 'Human';
                            t.chr = chr;
                            const regex = /\d+/;
                            const match = t.chr.match(regex);
                            if (match) {
                                t.chr = parseInt(match[0], 10);
                            }

                            console.log(" chromosome :" + t.chr);
                            t.description = desc;
                            t.geneID = geneID
                            if (x) {
                                t.tgraph.xi = x;
                            }
                            if (y) {
                                t.tgraph.yi = y;
                                this.graph.setymax(t.tgraph.yi + 1);
                                this.graph.setymin(t.tgraph.yi - 10);
                            } else {
                                this.graph.setymax(t.tgraph.yi + 2);
                                this.graph.setymin(t.tgraph.yi - 2);
                            }
                            let xm = 0.1 * t.tgraph.width
                            this.graph.setxmin(t.tgraph.xi - xm);
                            this.graph.setxmax(t.tgraph.xi + t.tgraph.width + xm);
                            let offset = t.tgraph.width / 6
                            setTimeout(() => {
                                this.animateTo(t.tgraph.xi - offset,
                                    t.tgraph.xi + t.tgraph.width + offset,
                                    t.tgraph.yi - Math.abs(t.tgraph.height) - 10,
                                    t.tgraph.yi + t.tgraph.height + 10)
                                this.setMouseMode('navigate')
                            }, 500)
                            this.graph.rescale();
                            let ensembl_sequence = prefix + `/sequence/id/${ensembleId}?content-type=text/plain`;
                            let fasta = await GETXT(ensembl_sequence)
                            fasta = fasta.trim();
                            if (t.strand < 0) {
                                let temp = '';
                                for (let c = fasta.length - 1; c > 0; c--) {
                                    temp += fasta[c]
                                }
                                t.setSequence(temp)
                            } else {
                                t.setSequence(fasta)
                            }
                            let annotations = this.createTrackFromLocal(js);
                            for (let an of annotations) {
                                t.add(an)
                            }
                            t.generateORF();
                            return;
                        } else {
                            js = await GETJSON(prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`);

                        }

                    } catch (exception) {
                        js = await GETJSON(prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`);

                    }

                    if (!js) {
                        console.log(" ensembl " + prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`)
                        js = await GETJSON(prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`);
                    }

                    if (js) {
                        if (js['object_type'] === 'Gene') {
                            let t = await this.loadEnsembleGene(js, prefix)
                            return t;
                        } else {

                            let species = js['species']
                            let chromosome = js['seq_region_name']
                            let start = +js['start']
                            let end = +js['end']
                            let strand = js['strand']
                            let geneID = js['Parent']
                            let desc = js['display_name']
                            let t = this.createTrack(ensembleId, start, end, strand);

                            t.transcriptID = ensembleId;
                            t.species = species;
                            t.chr = chromosome;
                            t.description = desc;
                            t.geneID = geneID
                            if (x) {
                                t.tgraph.xi = x;
                            }
                            if (y) {
                                t.tgraph.yi = y;
                                this.graph.setymax(t.tgraph.yi + 1);
                                this.graph.setymin(t.tgraph.yi - 10);
                            } else {
                                this.graph.setymax(t.tgraph.yi + 2);
                                this.graph.setymin(t.tgraph.yi - 2);
                            }
                            let xm = 0.1 * t.tgraph.width
                            this.graph.setxmin(t.tgraph.xi - xm);
                            this.graph.setxmax(t.tgraph.xi + t.tgraph.width + xm);
                            let offset = t.tgraph.width / 6
                            setTimeout(() => {
                                this.animateTo(t.tgraph.xi - offset,
                                    t.tgraph.xi + t.tgraph.width + offset,
                                    t.tgraph.yi - Math.abs(t.tgraph.height) - 10,
                                    t.tgraph.yi + t.tgraph.height + 10)
                                this.setMouseMode('navigate')
                            }, 500)
                            this.graph.rescale();
                            let ensembl_sequence = prefix + `/sequence/id/${ensembleId}?content-type=text/plain`;
                            let fasta = await GETXT(ensembl_sequence)
                            fasta = fasta.trim();
                            if (t.strand < 0) {
                                let temp = '';
                                for (let c = fasta.length - 1; c > 0; c--) {
                                    temp += fasta[c]
                                }
                                t.setSequence(temp)
                            } else {
                                t.setSequence(fasta)
                            }
                            this.buildENSEMBLAnnotations(t, js);
                            return t;
                        }
                    }
                }
            }

            addNCBI(ncbi, x, y) {

                exec('baja/ncbi/get-transcript.js', ncbi).then(async (js) => {
                    if (js) {
                        let start = +js['start']
                        let end = +js['end']
                        let strand = js['strand']
                        let t = this.createTrack(ncbi, start, end, strand);
                        if (x) {
                            t.tgraph.xi = x;
                        }
                        if (y) {
                            t.tgraph.yi = y;

                            this.graph.setymax(t.tgraph.yi + 1);
                            this.graph.setymin(t.tgraph.yi - 2);
                        } else {
                            this.graph.setymax(t.tgraph.yi + 1);
                            this.graph.setymin(t.tgraph.yi - 2);
                        }
                        let xm = 0.1 * t.tgraph.width
                        this.graph.setxmin(t.tgraph.xi - xm);
                        this.graph.setxmax(t.tgraph.xi + t.tgraph.width + xm);

                        this.graph.rescale();
                        let sequence = js['sequence']
                        sequence = sequence.trim();
                        t.setSequence(sequence)
                        this.buildNCBIAnnotations(t, js);
                    }
                })
            }
            removeTrack(index) {
                this.track.splice(index, 1);
            }

            removeAll(items) {
                this.currentShape = null;
                if (items != null && items.length > 0) {
                    for (let i of items) {
                        let index = 0;
                        let ns = []
                        for (let s of this.shapes) {
                            if (i == s) {
                            } else {
                                ns.push(s);
                            }
                            index++;
                        }
                        if (ns.length != this.shapes.length) {
                            this.shapes = ns;
                        }
                    }
                }
            }

            markTrack(trackIndex, start) {
                if (this.track[trackIndex])
                    this.track[trackIndex].markstart = start;
            }

            markTrackRange(trackIndex, start, end) {
                if (this.track[trackIndex].markstart) {
                    this.track[trackIndex].markstart = start;
                    this.track[trackIndex].markend = end;
                }
            }

            clearTracks() {
                this.track = [];
                this.notifyTrackListener();
            }

            getSelectedTracks() {
                let s = []
                for (let t of this.track) {
                    if (t.isSelected())
                        s.push(t)
                }
            }

            async ___setTrack(js) {
                return new Promise(async (resolve, reject) => {
                    let SnpIndel = await exec('flexigraph/snpindel.js')
                    let NMDAnnotation = await exec('baja/bio/splicing/nmd-annotation.js')
                    let RNASecondaryStructure = await exec('baja/structure/rna-secondary-structure-track.js')
                    let AttributionLayer = await exec('baja/bio/attribution-layer.js')
                    let MutationAnnotation = await exec('flexigraph/mutation-annotation.js')
                    let SIRNA = await exec('flexigraph/sirna.js')
                    let Amplicon = await exec('flexigraph/amplicon.js')
                    let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')

                    var foo = Object.assign(new Track(), js);
                    let Barchart = await exec('baja/bio/barchart-track.js')

                    if (js.sequence != null && js.sequence.length > 0) {

                        foo.sequence = js.sequence;
                    } else {
                        try {
                            let prefix = `https://rest.ensembl.org`;
                            let ensembl_sequence = prefix + `/sequence/id/${js.id}?content-type=text/plain`;
                            let fasta = GETXT(ensembl_sequence)
                            if (fasta && fasta.length > 0) {
                                fasta = fasta.trim();
                                if (foo.strand < 0) {
                                    let temp = '';
                                    for (let c = fasta.length - 1; c > 0; c--) {
                                        temp += fasta[c]
                                    }
                                    foo.sequence = temp.trim()
                                } else {
                                    foo.sequence = fasta
                                }
                            }
                        } catch (exception) {

                        }

                    }

                    if (js.track_layers != null && js.track_layers.length > 0) {
                        let tlayers = []
                        for (let tl of js.track_layers) {

                            console.log(" tl type : " + tl.attribution_type + " for name " + tl.name);
                            let track_layer = null;

                            if (!tl.attribution_type) {
                                track_layer = Object.assign(new TrackLayer(), tl)
                                track_layer.name = sanitizeName(track_layer.name)

                            }
                            else if (tl.attribution_type != null && tl.attribution_type.includes('attribution')) {
                                track_layer = Object.assign(new AttributionLayer(), tl)

                            } else
                                if (tl.gpts || tl.apts || tl.cpts || tl.tpts) {
                                    track_layer = Object.assign(new AttributionLayer(), tl)

                                } else

                                    if (tl.type === 'AttributionSushimiLayer') {
                                        track_layer = Object.assign(new AttributionSushimiLayer(), tl);
                                    }
                                    else {
                                        track_layer = Object.assign(new TrackLayer(), tl)
                                        track_layer.name = sanitizeName(track_layer.name)

                                    }
                            if (!track_layer) {
                                track_layer = Object.assign(new TrackLayer(), tl)
                                track_layer.name = sanitizeName(track_layer.name)

                            } else {
                                track_layer.svgs = []
                                if (tl.svgs && tl.svgs.length > 0) {
                                    for (let tli of tl.svgs) {
                                        track_layer.svgs.push(tli)
                                    }
                                }
                            }
                            track_layer.tgraph = Object.assign(new MGrid(), tl.tgraph)
                            let tann = []
                            if (tl.annotations && tl.annotations.length > 0) {
                                for (let __a of tl.annotations) {
                                    if (__a.type === 'NMD') {
                                        __a.shapeFunction = getIon(shapes[__a.type])
                                        tann.push(Object.assign(new NMDAnnotation(), __a))
                                    } else {
                                        __a.shapeFunction = getIon(shapes[__a.type])
                                        tann.push(Object.assign(new Annotation(), __a))
                                    }
                                }
                            }
                            track_layer.annotations = tann;
                            tlayers.push(track_layer)
                        }
                        foo.track_layers = tlayers;
                    }

                    let annn = []
                    if (js.annotations && js.annotations.length > 0) {
                        for (let a of js.annotations) {
                            if (a.type === 'NMD') {
                                a.shapeFunction = getIon(shapes[a.type])
                                annn.push(Object.assign(new NMDAnnotation(), a))
                            } else {
                                a.shapeFunction = getIon(shapes[a.type])
                                annn.push(Object.assign(new Annotation(), a))
                            }
                        }
                    }

                    let o = []
                    if (js.oligos && js.oligos.length > 0 && js.oligos[0]) {
                        for (let a of js.oligos) {
                            if (a != null) {
                                if (a.type === 'amplicon') {
                                    let leftOligo = Object.assign(new Oligo(), a['left'])
                                    let rightOligo = Object.assign(new Oligo(), a['right'])
                                    let midOligo = Object.assign(new Oligo(), a['mid'])
                                    let ampliconObject = Object.assign(new Amplicon(), a)
                                    ampliconObject.left = leftOligo;
                                    ampliconObject.mid = midOligo;
                                    ampliconObject.right = rightOligo;
                                    o.push(ampliconObject)
                                } else
                                    if (a.type === 'siRNA') {
                                        o.push(Object.assign(new SIRNA(), a))
                                    } else
                                        o.push(Object.assign(new Oligo(), a))
                            }
                        }
                    }

                    const dbhost = window["env"]["db"];
                    if (dbhost) {

                        if (o != null && o.length > 0) {
                            for (let i = 0; i < o.length; i += 20) {
                                let batch = o.slice(i, i + 20)
                                    .filter(_o => _o.synthesisSequence && _o.structure &&
                                        _o.synthesisSequence.length > 0 && _o.structure.length > 0)
                                    .map(_o => ({
                                        id: _o.id,
                                        name: _o.name,
                                        synthesisSequence: _o.synthesisSequence,
                                        structure: _o.structure
                                    }));

                                let r = await POSTJSON(batch, `${dbhost}/verify`);
                                let keys = Object.keys(r);

                                for (let k of keys) {
                                    for (let _o of o) {
                                        const key = `${_o.synthesisSequence}-${_o.structure}`;
                                        if (k === key && (r[k].id)) {
                                            _o.id = r[k].id
                                        }
                                    }
                                }
                            }

                        }
                    }
                    let sids = [];
                    if (js.snpindels && js.snpindels.length > 0 && js.snpindels[0]) {
                        for (let sid of js.snpindels) {
                            if (sid.type === 'mutation-annotation') {

                                let s = new MutationAnnotation(sid.type, sid.xi, sid.xf, sid.name, sid.phase, sid.transcriptStrand, sid.id, sid.phaseset)
                                if (s.setAnnotation)
                                    s.setAnnotation(sid.annotations);
                                sids.push(s);
                            } else {
                                let s = new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id, sid.phaseset)
                                s.setAnnotation(sid.annotations);
                                sids.push(s);
                            }
                        }
                    }

                    let struct = [];
                    if (js.structures && js.structures.length > 0 && js.structures[0]) {
                        for (let strc of js.structures) {
                            let rna = new RNASecondaryStructure(strc.name, strc.xi, strc.xf, strc.sequence, strc.strand);
                            rna.pos = strc.pos;
                            rna.tgraph.xi = strc.tgraph.xi;
                            rna.tgraph.yi = strc.tgraph.yi;
                            rna.anchorX = strc.anchorX;
                            rna.anchorY = strc.anchorY;
                            rna.xindex_start = strc.xindex_start;

                            if (strc.designs)
                                rna.designs = strc.designs;

                            let temp_grid = Object.assign(new MGrid(), strc.tgraph);
                            rna.tgraph = temp_grid;
                            struct.push(rna);
                        }
                    }

                    let plots = []
                    if (js.plots && js.plots.length > 0 && js.plots[0]) {
                        for (let a of js.plots) {
                            if (a.mg != null) {
                                let tp = Object.assign(new TrackPlot(), a)
                                let amg = Object.assign(new MGrid(), a.mg);
                                tp.mg = amg;
                                plots.push(tp)
                            } else {
                                let tp = Object.assign(new Barchart(), a)
                                plots.push(tp)
                            }
                        }
                    }
                    let temp_grid = Object.assign(new MGrid(), js.tgraph);
                    foo.tgraph = temp_grid;
                    foo.oligos = o;
                    foo.snpindels = sids;
                    foo.annotations = annn;
                    foo.plots = plots;
                    foo.structures = struct;
                    if (js.trackRef && js.trackRef.track && js.trackRef.track.name) {
                        let tra = await this.___setTrack(js.trackRef.track);
                        if (tra != null) {
                            foo.trackRef = new TrackRef(tra, js.trackRef.xi, js.trackRef.xf);
                        }
                    }
                    if (this.trackAlreadyNamed(foo.name)) {
                        foo.name = foo.name + '_'
                    }

                    this.track.push(foo);

                    return resolve(foo);
                });
            }

            trackAlreadyNamed(name) {

                if (name == null) {
                    return true

                }
                for (let t of this.track) {
                    if (t.name != null && t.name.toUpperCase() === name.toUpperCase()) {
                        return true;
                    }
                    return false;
                }

            }

            async setTrack(js) {
                let Amplicon = await exec('flexigraph/amplicon.js')

                var foo = Object.assign(new Track(), js);

                let annn = []
                if (foo.annotations && foo.annotations.length > 0) {
                    for (let a of foo.annotations) {
                        a.shapeFunction = getIon(shapes[a.type])
                        annn.push(Object.assign(new Annotation(), a))
                    }
                }
                let o = []
                if (foo.oligos && foo.oligos.length > 0 && foo.oligos[0]) {
                    for (let a of js.oligos) {
                        if (a != null) {

                            if (a.type === 'amplicon') {
                                let leftOligo = Object.assign(new Oligo(), a['left'])
                                let rightOligo = Object.assign(new Oligo(), a['right'])
                                let ampliconObject = Object.assign(new Amplicon(), a)
                                ampliconObject.left = leftOligo;
                                ampliconObject.right = rightOligo;
                                o.push(ampliconObject)
                            } else
                                o.push(Object.assign(new Oligo(), a))
                        }
                    }
                }

                const dbhost = window["env"]["db"];
                if (dbhost) {
                    if (o != null && o.length > 0) {
                        for (let i = 0; i < o.oligos.length; i += 20) {
                            let batch = o.slice(i, i + 20)
                                .filter(_o => _o.synthesisSequence && _o.structure &&
                                    _o.synthesisSequence.length > 0 && _o.structure.length > 0)
                                .map(_o => ({
                                    id: _o.id,
                                    name: _o.name,
                                    synthesisSequence: _o.synthesisSequence,
                                    structure: _o.structure
                                }));

                            let r = await POSTJSON(batch, `${dbhost}/verify`);
                            let keys = Object.keys(r);

                            for (let k of keys) {
                                for (let _o of batch) {
                                    const key = `${_o.synthesisSequence}-${_o.structure}`;
                                    if (k === key && (r[k].id)) {
                                        _o.id = r[k].id;
                                    }
                                }
                            }
                        }

                    }
                }
                foo.oligos = o;
                foo.annotations = annn;
                if (foo.y > this.graph.getymax()) {
                    this.graph.setymax(foo.y + 1)
                    this.graph.rescale();
                }
                this.track[foo.y] = foo;

                this.zoom(foo.xi - 10, foo.xf + 10);
                this.graph.setymax(this.track.length + 1)

                let tlayers = []
                if (foo.track_layers && foo.track_layers.length > 0) {
                    for (let foo of foo.track_layers) {
                        let tannn = []
                        let t = Object.assign(new TrackLayer(), foo)
                        t.name = sanitizeName(track_layer.name)

                        if (foo.annotations && foo.annotations.length > 0) {
                            for (let __a of foo.annotations) {
                                __a.shapeFunction = getIon(shapes[__a.type])
                                tannn.push(Object.assign(new Annotation(), __a))
                            }

                        }
                        t.annotations = tann;
                    }
                    tlayers.push(t);
                }
                this.track.track_layers = tlayers;

                this.notifyTrackListener();
            }

            notifyTrackListener() {
                if (this.listener) {
                    this.listener(this.track);
                }
            }

            addFASTA(fasta, x, y) {

                let lines = fasta.split('\n')
                let title = lines[0]
                let sequence = '';
                for (let i = 1; i < lines.length; i++) {
                    sequence += lines[i].trim();
                }
                let t = this.createTrack(title, 0, sequence.length, '+');
                t.setSequence(sequence)
                if (x) {
                    t.tgraph.xi = x;
                }
                if (y) {
                    t.tgraph.yi = y;
                }
                let xm = 0.1 * t.tgraph.width
                this.graph.setxmin(t.tgraph.xi - xm);
                this.graph.setxmax(t.tgraph.xi + t.tgraph.width + xm);
                this.graph.rescale();
            }

            fasta(fasta) {
                this.addFASTA(fasta)
            }

            getxmin = () => {
                return this.graph.getxmin();
            }
            getxmax = () => {
                return this.graph.getxmax();
            }
            getymin = () => {
                return this.graph.getymin();
            }
            getymax = () => {
                return this.graph.getymax();
            }
            async zoom(min, max) {
                if (this.animating) {
                    this.animating = false;
                    return;
                }
                await this.graph.zoom(min, max);
                this.graph.rescale();
            }
            async zoomRect(xmin, xmax, ymin, ymax, incr) {
                if (this.animating) {
                    this.animating = false;
                    return;
                }

                await this.animateTo(xmin, xmax, ymin, ymax, incr)
            }

            async zoomXY(xmin, xmax, ymin, ymax) {
                if (this.animating) {
                    this.animating = false;
                    return;
                }
                await this.zoomRect(xmin, xmax, ymin, ymax, 30)
            }
            rescale() {
                this.graph.rescale();
            }

            X(wc) {
                return this.graph.X(wc);
            }
            Y(wc) {
                return this.graph.Y(wc);
            }

            Xwc(x) {
                return this.graph.Xwc(x);
            }
            Ywc(y) {
                return this.graph.Ywc(y);
            }
            worldWidth(w) {
                return this.graph.worldWidth(w);
            }
            worldHeight(w) {
                return this.graph.worldHeight(w);
            }

            screenWidth(w) {
                return this.graph.grid.screenWidth(w);
            }
            screenHeight(h) {
                return this.graph.grid.screenHeight(h);
            }

            drawImage(src, x, y, w, h) {
                this.graph.drawImage(src, x, y, w, h);
            }

            showBookmarkMenu(expand) {
                this.showBookmarks = !this.showBookmarks;
            }

            lock = false;
            async buildBookmark() {
                let list = Object.keys(this.bookmarks);
                let m = []
                for (let l of list) {

                    let obj = this.bookmarks[l]
                    if (obj['path']) {

                        m.push({
                            label: l,
                            click: async (xwc, ywc) => {
                                if (this.lock)
                                    return;
                                let bm = this.bookmarks[l]
                                this.lock = true;
                                await this.loadChapter(obj['path'], true);
                                this.lock = false;

                                setTimeout(async () => {
                                    if (this.bookmarks && this.bookmarks.length > 0) {
                                        let list = Object.keys(this.bookmarks);
                                        await this.goToBookmark(this.bookmarks[list[0]])
                                    }

                                }, 1000)

                            },
                            move: () => {
                            }
                        })

                    } else {

                        m.push({
                            label: l,
                            click: async (xwc, ywc) => {
                                if (this.lock)
                                    return;
                                let bm = this.bookmarks[l]
                                this.lock = true;
                                await this.goToBookmark(bm);
                                this.lock = false;
                            },
                            move: () => {
                            }
                        })
                    }
                }
                let ChapterMenu;
                if (!isMobile())
                    ChapterMenu = await exec('flexigraph/menu-chapter.js')
                else
                    ChapterMenu = await exec('flexigraph/menu-chapter-m.js')

                this.bookmark_menu = new ChapterMenu(m, 0, 10, this.graph)
                this.bookmark_menu.title = ''
            }

            async buildMenuForType(type) {
                let m = []

                for (let t of this.track) {
                    for (let o of t.oligos) {

                        console.log(' oligo ' + JSON.stringify(o))
                        m.push({
                            label: l,
                            click: async (xwc, ywc) => {

                            },
                            move: () => {
                            }
                        })
                    }
                }
                let ChapterMenu;
                if (isMobile())
                    ChapterMenu = await exec('flexigraph/menu-chapter-m.js')
                else
                    ChapterMenu = await exec('flexigraph/menu-chapter.js')

                this.bookmark_menu = new ChapterMenu(m, 0, 10, this.graph)
                this.bookmark_menu.title = ''
            }

            buildENSEMBLAnnotations(t, js) {
                let orig = js['object_type'];
                if (js['object_type'] === 'Transcript' || orig === 'Gene') {

                    let exons = js['Exon'];
                    if (exons) {
                        for (let exon of exons) {
                            console.log(exon['object_type'])

                            t.add(new Annotation(exon['object_type'], exon['id'], exon['start'], exon['end']))

                        }
                    }

                    let tr = js['Translation'];
                    if (tr) {
                        let strand = t.strand;
                        let start = tr['start'];
                        let cend = tr['end']
                        if (strand > 0) {
                            let annotation = new Annotation('TSS', 'TSS', start, start + 3)
                            t.add(annotation)
                            t.add(new Annotation('Translation', 'Translation', start, cend))
                        }
                        else {
                            let annotation = new Annotation('TSS', 'TSS', cend - 2, cend + 1)
                            t.add(annotation)
                            t.add(new Annotation('Translation', 'Translation', cend + 1, start))

                        }

                    }
                }
                t.generateORF();
            }

            getState() {

                let name = '.current.baja'
                let currentPath = '.'
                const seenObjects = new WeakSet();

                let gs = JSON.stringify(this, function (key, value) {
                    if (key === 'canvas') {
                        return;
                    }
                    if (typeof value === 'object' && value !== null) {
                        if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                            return value;
                        } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                            return value;
                        }
                        else {
                            if (seenObjects.has(value)) {
                                return '[b_c]';
                            }
                            seenObjects.add(value);
                        }
                    }
                    return value;
                });
                return gs;
            }

            async setState(state) {
                for (let t of state.track) {
                    await this.___setTrack(t)
                    this.zoomRect(t.tgraph.xi - 100, t.tgraph.xi + t.tgraph.width + 100, t.tgraph.yi + 10, -1 * 10)
                }

            }

            buildNCBIAnnotations(t, js) {
                if (js['object_type'] === 'Transcript') {
                    let cds = js['CDS'];
                    if (!cds) {
                        cds = js['cds']
                    }
                    if (cds && cds.length > 0) {
                        for (let c of cds) {
                            t.add(new Annotation('CDS', c['id'], c['start'], c['end']))
                            let id = c['id']
                            if (id != null && (!isNaN(id))) {
                                id = id;
                            }

                            if (id === 1) {

                                let strand = t.strand;

                                let start = c['start'] + 1
                                let end = start + 3;
                                if (strand < 0) {
                                    end = c['start'] + 1
                                    start = end - 3;
                                }
                                let annotation = new Annotation('TSS', 'TSS', start, end)
                                if (strand > 0)
                                    t.add(new Annotation('Translation', 'Translation', start))
                                else
                                    t.add(new Annotation('Translation', 'Translation', end))

                                let sequence = t.getSequenceRange(annotation.xi, annotation.xf)
                                console.log(' sequence ' + sequence);
                                t.add(annotation)
                            }

                        }
                    }

                    let exons = js['Exon'];
                    if (exons) {
                        for (let exon of exons) {
                            console.log(exon['object_type'])

                            t.add(new Annotation(exon['object_type'], exon['id'], exon['start'], exon['end']))

                        }
                    }
                    let tr = js['Translation'];
                    if (tr) {
                        t.add(new Annotation(tr['object_type'], tr['id'], tr['start'], tr['end']))
                    }
                }
            }

            fade = false;

            autosave = false;
            saving = false;
            async saveState() {
                console.log(" Save state ")
                this.saving = true;
                let name = 'auto-save.bjb'
                let currentPath = '.'

                let gs = this.toJSON();

                if (!name.endsWith('.bjb')) {
                    name = name + '.bjb'
                }
                let host_ = window['env']['apiUrl']
                let jsonobj = {
                    "name": name,
                    "key": "user",
                    "user": getUser(),
                    "spath": '.',
                    "value": gs
                }
                if (currentPath === '.') {
                    currentPath = '/' + getUser();
                }
                let rs = await POSTJSON(jsonobj, host_ + '/save-user-data');
                this.saving = false;

            }

            async isPreviousState() {
                let host_ = window['env']['apiUrl']
                let rf = await GETJSON(host_ + '/get-folder?key=user&path=' + getUser() + '&filetype=.baja')
                let ch = rf.children;
                if (ch && ch.length > 0)
                    for (let i of ch) {
                        if (i && i.path.endsWith('/.current.baja')) {
                            return true;
                        }
                    }
                return false;
            }

            findNextPlotPosition(startx, starty, newPlotWidth, newPlotHeight, maxwidth) {
                let plots = this.plots;
                let margin = 10;

                let maxX = startx;
                let maxY = starty;

                plots.forEach(plot => {

                    let plotRightEdge = plot.grid.xi + plot.grid.width;
                    let plotBottomEdge = plot.grid.yi - plot.grid.height;

                    if (plotRightEdge > maxX) {
                        maxX = plotRightEdge;
                    }
                    if (plot.grid.yi > maxY) {
                        maxY = plot.grid.yi;
                    }
                });

                let newPlotX = maxX + margin;
                let newPlotY = maxY;

                let isOverlapping = (x, y, width, height) => {
                    return plots.some(plot => {
                        let plotRightEdge = plot.grid.xi + plot.grid.width;
                        let plotBottomEdge = plot.grid.yi - plot.grid.height;
                        return !(x + width < plot.grid.xi ||
                            x > plotRightEdge ||
                            y - height > plot.grid.yi ||
                            y < plotBottomEdge);
                    });
                };

                while (isOverlapping(newPlotX, newPlotY, newPlotWidth, newPlotHeight)) {

                    newPlotX += newPlotWidth + margin;

                    if (newPlotX + newPlotWidth > maxwidth) {
                        newPlotX = margin;
                        newPlotY -= newPlotHeight + margin;
                    }
                }

                return { x: newPlotX, y: newPlotY };
            }

            setPlateManager(_plateManager) {
                this.plateManager = _plateManager
            }

            monitorMouseLeaveCanvas() {
                const canvas = this.graph?.canvas?.canvas?.nativeElement;
                if (!canvas) return;

                canvas.addEventListener('mouseleave', () => {
                    this.pauseDraw = true;
                });

                canvas.addEventListener('mouseenter', () => {
                    this.pauseDraw = false;
                });
            }

            touchMe() {
                lastMouseMoveTime = Date.now();

            }

            async init() {
                this.bookmarkMouseDownListener = (xwc, ywc) => {
                    if (this.bookmark_menu && this.showBookmarks && this.bookmark_menu.isIn(this.graph.X(xwc), this.graph.Y(ywc))) {
                        if (isMobile())
                            this.showBookmarks = false;
                        return this.bookmark_menu.mouseDown(this.graph.X(xwc), this.graph.Y(ywc))
                    }
                }
                this.bookmarkMouseUpListener = (xwc, ywc) => {
                    if (this.bookmark_menu && this.showBookmarks && this.bookmark_menu.isIn(this.graph.X(xwc), this.graph.Y(ywc))) {
                        this.bookmark_menu.mouseUp(this.graph.X(xwc), this.graph.Y(ywc))
                        if (isMobile())
                            this.showBookmarks = false;
                    }

                }
                this.bookmarkMouseMoveListener = (xwc, ywc) => {

                    if (this.bookmark_menu && this.showBookmarks && this.bookmark_menu.isIn(this.graph.X(xwc), this.graph.Y(ywc))) {
                        this.setMouseMode('bookmark')
                        return this.bookmark_menu.mouseMove(this.graph.X(xwc), this.graph.Y(ywc))
                    } else {
                        if (this.bookmark_menu)
                            this.bookmark_menu.dehighlight();
                    }

                }

                this.chapterMouseDownListener = (xwc, ywc) => {
                    if (this.chapter_menu && this.showChapters && this.chapter_menu.isIn(this.graph.X(xwc), this.graph.Y(ywc))) {
                        return this.chapter_menu.mouseDown(this.graph.X(xwc), this.graph.Y(ywc))
                    }
                }
                this.chapterMouseUpListener = (xwc, ywc) => {
                    if (this.chapter_menu && this.showChapters && this.chapter_menu.isIn(this.graph.X(xwc), this.graph.Y(ywc))) {
                        this.chapter_menu.mouseUp(this.graph.X(xwc), this.graph.Y(ywc))
                    }
                }
                this.chapterMouseMoveListener = (xwc, ywc) => {
                    if (this.chapter_menu && this.showChapters && this.chapter_menu.isIn(this.graph.X(xwc), this.graph.Y(ywc))) {
                        return this.chapter_menu.mouseMove(this.graph.X(xwc), this.graph.Y(ywc))
                    } else {
                        if (this.chapter_menu)
                            this.chapter_menu.dehighlight();
                    }
                }

                this.graphListener = (xwc, ywc) => {
                    let annotations = []

                }

                this.pinchListener = (evt) => {

                    if (!this.prev) {
                        this.prev = evt
                    } else {

                        let xiw = plateManager.plateTrack.grid.Xwc(evt.xi);
                        let xfw = plateManager.plateTrack.grid.Xwc(evt.xf);
                        let diffii = (xfw - xiw);
                        let xip = plateManager.plateTrack.grid.Xwc(this.prev.xi);
                        let xfp = plateManager.plateTrack.grid.Xwc(this.prev.xf);
                        let diffpp = (xfp - xip);
                        let p = (diffpp - diffii);
                        if (this.prev.xf - this.prev.xi < 0) {
                            p = p * (-1)
                        }
                        let yiw = plateManager.plateTrack.grid.Ywc(evt.yi);
                        let yfw = plateManager.plateTrack.grid.Ywc(evt.yf);
                        let current_dif_y = (yfw - yiw);
                        let yip = plateManager.plateTrack.grid.Ywc(this.prev.yi);
                        let yfp = plateManager.plateTrack.grid.Ywc(this.prev.yf);
                        let prev_dif_y = yfp - yip;
                        let yv = (current_dif_y - prev_dif_y) * (-2);
                        let xfactor = p;
                        let distanceY = yv;
                        if (this.prev.yi - this.prev.yf < 0) {
                            distanceY *= (-1)
                        }

                        if (distanceY < 0 && xfactor < 0) {
                            let mind = Math.max(distanceY, xfactor)
                            plateManager.plateTrack.grid.setymin(plateManager.plateTrack.grid.getymin() - mind);
                            plateManager.plateTrack.grid.getymax(plateManager.plateTrack.grid.getymax() + mind);
                            plateManager.plateTrack.grid.setxmin(plateManager.plateTrack.grid.getxmin() - mind)
                            plateManager.plateTrack.grid.setxmax(plateManager.plateTrack.grid.getxmax() + mind)

                        } else {

                            let maxd = Math.min(distanceY, xfactor)
                            plateManager.plateTrack.grid.setymin(plateManager.plateTrack.grid.getymin() - maxd);
                            plateManager.plateTrack.grid.getymax(plateManager.plateTrack.grid.getymax() + maxd);
                            plateManager.plateTrack.grid.setxmin(plateManager.plateTrack.grid.getxmin() - maxd)
                            plateManager.plateTrack.grid.setxmax(plateManager.plateTrack.grid.getxmax() + maxd)
                        }
                        this.prev = evt;
                    }
                }

                this.mouseDownListener = async (xwc, ywc) => {
                    this.initDwn = { x: this.graph.X(xwc), y: this.graph.Y(ywc) };
                    this.prev = null;
                    this.xwc = xwc;
                    this.ywc = ywc;
                    let xs = this.graph.X(xwc);
                    let ys = this.graph.Y(ywc);
                    if (xs >= 10 && xs < 130 && ys >= 200 && ys < 245) {
                        if (this.highlight_object) {
                            let menuList = [
                                {
                                    label: 'View properties',
                                    click: async (x, y) => {
                                        showModal({
                                            wid: 'json',
                                            data: JSON.stringify(this.highlight_object)
                                        })
                                    },
                                    move: () => {
                                    },
                                },
                                {
                                    label: 'Delete',
                                    click: async (x, y) => {
                                    },
                                    move: () => {
                                    },
                                },
                            ]
                            this.showMenu(menuList, xwc, ywc, 200)
                        }
                        return;
                    }
                    if (!isMobile()) {
                        if (xs >= 10 && xs < 30 && ys >= 250 && ys < 270) {

                            this.bclick = 'zoom_in';
                            setTimeout(() => {
                                this.bclick = '';
                                this.setMouseMode('navigate')

                            }, 100);
                            this.graph.rescale();
                            let l = Math.abs(this.graph.getxmax() - this.graph.getxmin()) / 10;
                            let ly = Math.abs(this.graph.getymax() - this.graph.getymin()) / 10;
                            await this.zoomXY(this.graph.getxmin() + l, this.graph.getxmax() - l, this.graph.getymin() + ly, this.graph.getymax() - ly);
                            return;
                        }

                        if (xs >= 10 && xs < 30 && ys >= 285 && ys < 305) {
                            this.bclick = 'zoom_out';
                            setTimeout(() => {
                                this.bclick = '';
                                this.setMouseMode('navigate')
                            }, 100); 1
                            let l = Math.abs(this.graph.getxmax() - this.graph.getxmin()) / 10;
                            let ly = Math.abs(this.graph.getymax() - this.graph.getymin()) / 10;
                            await this.zoomXY(this.graph.getxmin() - l, this.graph.getxmax() + l, this.graph.getymin() - ly, this.graph.getymax() + ly);
                            return;
                        }
                        if (xs >= 10 && xs < 30 && ys >= 320 && ys < 350) {
                            this.bclick = 'navigate';
                            this.setMouseMode('navigate')
                            setTimeout(() => {
                                this.bclick = '';
                            }, 100);
                            return;
                        }
                        if (xs >= 10 && xs < 30 && ys >= 350 && ys < 390) {

                            this.setMouseMode('bpx')
                            this.bclick = 'bpx';
                            setTimeout(() => {
                                this.bclick = '';
                            }, 100);
                            this.setMessage(" Drag a rectangle ")
                            this.addMouseDownListener(async (x, y) => {
                                this.md = true;
                                this.currentShape = new Rectangle('test', x, y);
                                this.currentShape.w = 0;
                                this.currentShape.h = 0;
                            });
                            this.addMouseMoveListener((x, y) => {
                                if (!this.md) {
                                    this.currentShape = null;
                                    return;
                                }
                                if (this.currentShape != null) {
                                    this.currentShape.update(x, y)
                                }
                            })
                            this.addMouseUpListener(async (x, y) => {
                                if (this.currentShape != null) {
                                    let height = this.currentShape.y + this.currentShape.h - this.currentShape.y
                                    let width = this.currentShape.x + this.currentShape.w - this.currentShape.x
                                    let xs = this.graph.screenHeight(height);
                                    let ys = this.graph.screenWidth(width);
                                    if (xs < 10) {
                                        this.currentShape = null;
                                        this.md = false;
                                        return;
                                    }
                                    if (xs > 10 && ys > 10) {
                                        let xi = this.currentShape.x;
                                        let xf = this.currentShape.x + this.currentShape.w;
                                        let yi = this.currentShape.y;
                                        let yf = this.currentShape.y - this.currentShape.h
                                        this.currentShape = null;
                                        await this.zoomRect(xi, xf, yf, yi, 150)
                                    }
                                }
                                this.currentShape = null;
                                this.md = false;
                            });
                        }

                        if (xs > 19 && xs < 350 && ys < 99 && ys > 89) {

                        }

                    }

                    if (this.bookmark_menu && this.showBookmarks) {
                        this.bookmarkMouseDownListener(xwc, ywc);
                    }
                    if (this.chapter_menu && this.showChapters) {
                        this.chapterMouseDownListener(xwc, ywc);
                        this.showChapters = false;
                    }
                    if (this.select_) {
                        this.startX = xwc;
                    }
                    if (this.menu && this.menu.mouseDown && this.menuVisible()) {
                        return this.menu.mouseDown(this.graph, xwc, ywc)
                    }
                    mouse_down = true;
                    for (let mdl of this.mouseDownListeners) {
                        mdl(xwc, ywc);
                    }
                }
                this.mouseUpListener = async (xwc, ywc) => {
                    this.prev = null;
                    if (this.bookmark_menu && this.showBookmarks) {
                        this.bookmarkMouseUpListener(xwc, ywc);
                    }
                    if (this.chapter_menu && this.showChapters) {
                        this.chapterMouseUpListener(xwc, ywc);
                    }
                    if (this.select_) {
                        this.endX = xwc;
                    }

                    if (this.menuVisible()) {
                        await this.menu.mouseUp(this.graph, xwc, ywc)
                        this.menu = null;
                        if (isMobile()) {

                        }
                        return;
                    } else {
                        if (this.mode === 'menu') {
                            if (!this.menu) {
                                this.setMouseMode("navigate")
                            }
                        }
                    }
                    mouse_down = false;

                    if (!this.menu) {
                        for (let mul of this.mouseUpListeners) {
                            mul(xwc, ywc);
                        }
                    }

                }
                this.mouseMoveListener = (xwc, ywc) => {

                    lastMouseMoveTime = Date.now();
                    if (isPaused) {
                        isPaused = false;
                        console.log("Resumed due to mouse activity");
                    }

                    let xs = this.graph.X(xwc);
                    let ys = this.graph.Y(ywc);

                    if (xs >= 10 && xs < 30 && ys >= 250 && ys < 270) {
                        this.setMessage(" Zoom in ")
                    }
                    if (xs >= 10 && xs < 30 && ys >= 285 && ys < 305) {
                        this.setMessage(" Zoom out ")
                    }
                    if (this.select_ && mouse_down) {
                        this.endX = xwc;
                    }
                    if (this.menuVisible()) {
                        return this.menu.mouseMove(this.graph, xwc, ywc)
                    }

                    if (this.chapterMouseMoveListener) {
                        this.chapterMouseMoveListener(xwc, ywc);
                    }

                    if (this.bookmarkMouseMoveListener) {
                        this.bookmarkMouseMoveListener(xwc, ywc);
                    }

                    let inmenuShape = false;
                    for (let ct of this.shapes) {
                        if (ct.createMenu && ct.isIn(xwc, ywc)) {
                            this.menu = ct.createMenu();
                            inmenuShape = true;
                        }
                    }
                    for (let movel of this.mouseMoveListeners) {
                        try {
                            movel(xwc, ywc);
                        } catch (exception) {
                            const index = this.mouseMoveListeners.indexOf(movel);
                            if (index !== -1) {
                                this.mouseMoveListeners.splice(index, 1);
                            }
                            console.log(" exception " + exception)
                        }
                    }
                }
                let controlPanelRefCallback = (controlPanel) => {
                    this.controlPanel = controlPanel;
                    this.controlPanel.setHTML('')
                }

                this.touchStart = (event) => {
                    this.initDwn = event;
                }
                this.touchEnd = (event) => {

                }
                this.touchMove = (event) => {
                }

                this.dblclick = (scx, scy) => {
                    if (plateManager && plateManager.plateTrack) {

                    }
                }

                this.wheel = async (evt) => {
                    evt.preventDefault();

                    const dy = evt.deltaY;
                    const direction = dy > 0 ? 1 : -1;

                    const zoomStep = 10;

                    const grid = plateManager.plateTrack.grid;

                    grid.rescale();

                    let xmin = grid.xmin;
                    let xmax = grid.xmax;
                    let ymin = grid.ymin;
                    let ymax = grid.ymax;

                    const rect = evt.target.getBoundingClientRect();
                    const mx = (evt.clientX - rect.left) / rect.width;
                    const my = 1 - (evt.clientY - rect.top) / rect.height;

                    const cx = xmin + mx * (xmax - xmin);
                    const cy = ymin + my * (ymax - ymin);

                    const xdf = Math.abs((xmax - xmin) / zoomStep) * direction;
                    const ydf = Math.abs((ymax - ymin) / zoomStep) * direction;

                    xmin += xdf * mx;
                    xmax -= xdf * (1 - mx);

                    ymin += ydf * my;
                    ymax -= ydf * (1 - my);

                    if (xmax <= xmin || ymax <= ymin) return;

                    const ag = new AnimateGrid(grid);
                    await ag.animateTo(xmin, xmax, ymin, ymax, 4);

                    grid.rescale();
                };

                let controlPanelListener = () => {

                }

                let FlexiGraph = await exec('flexigraph/graph.js', this.graphListener, this.mouseDownListener, this.mouseUpListener,
                    this.mouseMoveListener, controlPanelRefCallback, controlPanelListener, this.pinchListener, this.touchStart, this.touchEnd, this.touchMove, this.dblclick, this.wheel);
                this.graph = new FlexiGraph();
                await this.graph.init();
                this.graph.resizeWithCanvas = this.elastic;
                this.graph.setymin(0);
                this.graph.setymin(-1.5)
                this.graph.setymax(this.track.length + 1);
                this.initView = Object.assign(new MGrid(), this.graph.grid)
                let save_index = 0;
                this.pauseDraw = false;

                let observer = null;

                this.monitorMouseLeaveCanvas();

                setInterval(async () => {

                    const now = Date.now();
                    const inactiveTime = now - lastMouseMoveTime;

                    if (inactiveTime > INACTIVITY_LIMIT) {
                        if (!isPaused) {
                            console.log("Paused due to inactivity");
                            isPaused = true;
                        }
                        return;
                    }

                    if (this.graph.grid.xmin > this.graph.grid.xmax) {
                        this.graph.setxmin(0);
                        this.graph.setxmax(this.track.length + 1)
                        this.graph.rescale();
                        this.graph.grid = Object.assign(new MGrid(), this.initView)
                        this.graph.rescale();
                    }
                    if (this.graph.grid.ymin > this.graph.grid.ymax) {

                        this.graph.setymin(-1.5)
                        this.graph.setymax(10);
                        this.graph.rescale();
                    }
                    if (!observer && this.graph.canvas) {
                        observer = new IntersectionObserver((entries) => {
                            entries.forEach((entry) => {
                                if (!entry.isIntersecting || document.hidden) {
                                    this.pauseDraw = true;
                                } else {
                                    this.pauseDraw = false;
                                }
                            });
                        });
                        if (observer && this.graph.canvas && this.graph.canvas.canvas)
                            observer.observe(this.graph.canvas.canvas.nativeElement);
                    }
                    if (document.hidden) {
                        this.pauseDraw = true;
                    } else {
                        this.pauseDraw = false;
                    }
                    if (!this.pauseDraw) {
                        this.redraw();

                    } else {
                        console.log(" pause.... ")
                    }

                }, 50)
                this.monitorMouseLeaveCanvas();
            }

            innerComponentCallback = (panl) => {

            }

            saveToSVG() {
                this.pauseDraw = true;

                const width = this.graph.canvas.width;
                const height = this.graph.canvas.height;

                const csvg = new CanvasToSVGProxy(width, height);
                const originalCanvas = this.graph.canvas;

                this.graph.canvas = csvg;

                const finish = async () => {
                    try {
                        const va = await prompt(
                            "Name",
                            ["Name"],
                            { Name: "snapshot.svg" },
                            300,
                            300
                        );

                        const m = va["Name"];

                        if (m === null) {

                        } else {
                            downloadAsText(csvg.getSVG(), m);
                        }

                        showModal(
                            {
                                wid: "text-editor",
                                refCallback: createIonFunction(this.innerComponentCallback),
                                data: {
                                    height: "550px",
                                    width: "550px",
                                    text: csvg.getSVG(),
                                    onKeyUp: createIonFunction((editor) => { }),
                                    editorOptions: {
                                        language: "xml",
                                        automaticLayout: true,
                                        lineHeight: 45,
                                        fontSize: 16,
                                        codeLens: false,
                                        lineNumbers: "off",
                                        glyphMargin: false,
                                        minimap: { enabled: false },
                                        scrollbar: {
                                            verticalScrollbarSize: 0,
                                            verticalHasArrows: false,
                                        },
                                        verticalHasArrows: false,
                                        height: "50px",
                                        colors: {
                                            "editorWidget.border": "2px",
                                            "editor.foreground": "#000000",
                                            "editor.background": "#EDF9FA",
                                            "editorCursor.foreground": "#8B0000",
                                            "editor.lineHighlightBackground": "#0000FF20",
                                            "editorLineNumber.foreground": "#008800",
                                            "editor.selectionBackground": "#88000030",
                                            "editor.inactiveSelectionBackground": "#88000015",
                                        },
                                    },
                                },
                            },
                            500,
                            500
                        );
                    } finally {

                        this.graph.canvas = originalCanvas;
                        this.pauseDraw = false;
                    }
                };

                try {
                    const result = this.redraw();

                    if (result && typeof result.then === "function") {

                        result
                            .then(() => finish())
                            .catch((err) => {
                                console.error("saveToSVG redraw failed (async):", err);
                                this.graph.canvas = originalCanvas;
                                this.pauseDraw = false;
                            });
                    } else {

                        finish().catch((err) => {
                            console.error("saveToSVG finish failed:", err);
                            this.graph.canvas = originalCanvas;
                            this.pauseDraw = false;
                        });
                    }
                } catch (err) {
                    console.error("saveToSVG redraw threw synchronously:", err);
                    this.graph.canvas = originalCanvas;
                    this.pauseDraw = false;
                }
            }

            getTrack(x, y) {
                this.graph.rescale();
                let scxx = this.graph.X(x);
                let scyy = this.graph.Y(y);
                for (let i = 0; i < this.track.length; i++) {
                    let t = this.track[i]
                    let scx = this.graph.X(t.tgraph.xi);
                    let scy = this.graph.Y(t.tgraph.yi)
                    let scw = this.graph.screenWidth(t.tgraph.width);
                    let sch = -1 * this.graph.screenHeight(t.tgraph.height);

                    let yheight = (scy + sch + 40)
                    let xwidth = (scx + scw + 40)

                    if (scyy > scy &&
                        scyy < yheight &&
                        scxx > scx &&
                        scxx < xwidth) {
                        return i;
                    }
                }
                return null;
            }

            getTrackAllowUnderneath(x, y) {
                this.graph.rescale();
                let scxx = this.graph.X(x);
                let scyy = this.graph.Y(y);
                for (let i = 0; i < this.track.length; i++) {
                    let t = this.track[i];
                    let scx = this.graph.X(t.tgraph.xi);

                    let scy = this.graph.Y(t.tgraph.yi - t.tgraph.yi * 0.1);
                    let scw = this.graph.screenWidth(t.tgraph.width);
                    let sch = -1 * this.graph.screenHeight(t.tgraph.height);
                    if (scyy > scy && scyy < (scy + sch + 40) && scxx > scx && scxx < (scx + scw + 40)) {
                        return i;
                    }
                }
                return null;
            }

            isReferenedByAnotherTrack(_track) {
                for (let tr of this.track) {

                    if (tr.trackRef && tr.trackRef.track && tr.trackRef.track.name === _track.name) {
                        return true;
                    }
                }
                return false;

            }

            getTrackFromIndex(trackIndex) {
                return this.track[trackIndex]
            }

            syncTrackRef() {
                for (let t of this.track) {
                    if (t.trackRef) {
                        for (let i of this.track) {
                            if (t.trackRef && t.trackRef.name && t.trackRef.name == i.name) {
                                t.trackRef = new TrackRef(i, i.xi, i.xf);
                            } else if (t.trackRef) {
                                let tstr = t.trackRef.toString();

                                if (tstr.startsWith('_900807_')) {
                                    let name = ''

                                    let mapindex = tstr.indexOf('_900807map_')
                                    if (mapindex > 0) {
                                        name = t.trackRef.substring(8, mapindex);
                                    } else {
                                        name = t.trackRef.substring(3);
                                    }
                                    for (let track_item of this.track) {
                                        if (track_item.name == name) {
                                            t.trackRef = new TrackRef(track_item, track_item.xi, track_item.xf);

                                            let mapindex = tstr.indexOf('_900807map_')
                                            if (mapindex >= 0) {
                                                let mindex_end = tstr.indexOf('_900807showMismatchesS_', mapindex)
                                                let mindex = tstr.substring(mapindex + 11, mindex_end)

                                                let mjob = JSON.parse(mindex)

                                                t.trackRef.map = mjob;
                                            }
                                            let showMismatchesIndexStart = tstr.indexOf('_900807showMismatchesS_')
                                            if (showMismatchesIndexStart > 0) {
                                                let showMismatchesIndexEnd = tstr.indexOf('_900807showMismatchesE_')
                                                let mm = tstr.substring(showMismatchesIndexStart + 23, showMismatchesIndexEnd)
                                                console.log(" show mismatches =? " + mm)
                                                t.trackRef.showMismatches = eval(mm)
                                            }

                                        }
                                    }
                                }
                            }
                        }
                    }
                }

            }

            async __deprecated__verifyNormalTracks() {
                let found_dups = false;
                for (let t of this.track) {
                    let items = this.track.filter(x => x.name === t.name);
                    if (items && items.length > 1) {
                        console.log(" we have multiple instances ")
                        found_dups = true;
                    }
                }
                if (found_dups) {
                    let t = {};
                    for (let s of this.track) {
                        if (s.name != null)
                            t[s.name] = s;
                    }
                    let to = Object.keys(t);
                    this.track = []
                    for (let tok of to) {
                        if (tok != null && tok.length > 0 && to[tok] != null)
                            this.track.push(t[tok])
                    }
                }

            }

            drawGraphLayers() {
                for (let l of this.layers) {
                    l.draw(this.graph);
                }
            }

            async drawTracks() {
                this.graph.resizeWithCanvas = this.elastic;
                if (this.graph && this.track) {

                    for (let tk of this.track) {
                        if (tk.trackRef && tk.trackRef.toString().startsWith('_900807_'))
                            this.syncTrackRef();
                        if (!this.isReferenedByAnotherTrack(tk))
                            await tk.draw(this.graph);
                    }

                    if (this.select_) {
                        let midpoint = (this.graph.getymax() - this.graph.getymin()) / 2;
                        this.graph.drawVerticalLine(this.startX, midpoint, 2 * (this.graph.getymax() - this.graph.getymin()), 'cyan', 12);
                        this.graph.drawVerticalLine(this.endX, midpoint, 2 * (this.graph.getymax() - this.graph.getymin()), 'cyan', 12);
                        this.graph.drawLine(this.startX, this.graph.getymin(), this.endX, this.graph.getymin(), 'darkGray', 1);

                    }
                } else {
                    console.log(this.graph + " Missing graph or tracks " + this.tracks)
                }

            }
            addChem(ch) {
                this.chem.push(ch);
            }
            showMenu(list, x, y) {
                let width = 320;
                if (isMobile()) {
                    exec('flexigraph/show-mobile-menu.js', x, y, list, this.graph, this.genegraph_panel_layout)
                } else {

                    if (this.menu && this.menu.list == list) {
                        this.setMouseMode('menu')
                        return;
                    }
                    this.menu = new Menu(list, x, y)
                    this.menu.menu_width = width;
                    this.graph.menu = this.menu;
                    this.setMouseMode("menu")

                }
            }
            showWindowMenu(list, x, y, width) {
                exec('flexigraph/show-mobile-menu.js', x, y, list, this.graph, this.genegraph_panel_layout, 'mainPanel')
            }

            menuVisible() {
                if (this.menu != null) {
                    return true;
                } else
                    return false;
            }
            hideMenu() {
                this.menu = null;
                this.setMouseMode("navigate")

            }
            setShadow(ctx, color, ox, oy, blur) {
                ctx.shadowColor = color;
                ctx.shadowOffsetX = ox;
                ctx.shadowOffsetY = oy;
                ctx.shadowBlur = blur;
            }

            drawDeselectButton(ctx) {
                ctx.font = "12pt Arial";
                ctx.fillStyle = "white";
                ctx.lineWidth = 2;
                let offset = 100;
                ctx.strokeStyle = "black";
                this.setShadow(ctx, "darkGray", 0, 0, 10);
                ctx.beginPath();
                ctx.arc(offset + 20, 335, 10, 0, Math.PI * 2, false);
                ctx.fill();
                ctx.fillStyle = "red";
                ctx.font = "11pt Arial";
                ctx.fillText('Deselect all (' + this.selectedCompounds.length + ') compounds', offset + 30, 360);
                ctx.stroke();
            }

            drawZoomButton(ctx) {
                if (this.bclick == 'zoom_in') {
                    return;
                }
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = "12pt Arial";
                ctx.fillStyle = "blue";
                ctx.lineWidth = 2;
                ctx.strokeStyle = "black";

                ctx.beginPath();
                ctx.arc(25, 260, 10, 0, Math.PI * 2, false);
                ctx.fill();
                ctx.fillStyle = "black";
                ctx.font = "15pt Arial";
                ctx.fillText('+', 25, 260);
                ctx.stroke();
            }

            move_icon = '/assets/img/icons/png/move-16.png'
            move_img = null;

            drawHLMoveButton(ctx) {
                ctx.fillStyle = "white";
                ctx.lineWidth = 0;
                ctx.strokeStyle = "black";
                this.setShadow(ctx, "darkGray", 0, 0, 10);
                ctx.beginPath();
                ctx.arc(25, 330, 10, 0, Math.PI * 2, false);
                ctx.fill();
                ctx.fillStyle = "lightGray";

                if (this.move_img) {
                    ctx.drawImage(this.move_img, 17, 322);
                } else {
                    this.move_img = new Image();
                    this.move_img.src = this.move_icon;

                    this.move_img.onload = (e) => {
                        ctx.drawImage(this.move_img, 17, 322);
                    };
                }
                ctx.stroke();
            }

            drawMoveButton(ctx) {
                if (this.bclick == 'navigate') {
                    this.currentShape = null;
                    return;
                }
                ctx.fillStyle = "white";
                ctx.lineWidth = 0;
                ctx.strokeStyle = "black";
                this.setShadow(ctx, "darkGray", 0, 0, 10);
                ctx.beginPath();
                ctx.arc(25, 330, 10, 0, Math.PI * 2, false);
                ctx.fill();
                ctx.fillStyle = "lightGray";

                if (this.move_img) {
                    ctx.drawImage(this.move_img, 17, 322);
                } else {
                    this.move_img = new Image();
                    this.move_img.src = this.move_icon;

                    this.move_img.onload = (e) => {
                        ctx.drawImage(this.move_img, 17, 322);
                    };
                }
                ctx.stroke();
            }

            drag_icon = '/assets/img/icons/png/nav-16.png'
            drag_img = null;

            drawBoxButton(ctx) {
                if (this.bclick === 'bpx') {
                    return;
                }
                ctx.fillStyle = "white";
                ctx.lineWidth = 0;
                ctx.shadowBlur = 10;
                ctx.strokeStyle = "black";
                this.setShadow(ctx, "darkGray", 0, 0, 2);
                ctx.beginPath();
                ctx.arc(25, 360, 10, 0, Math.PI * 2, false);
                ctx.fill();
                ctx.fillStyle = "black";

                if (this.drag_img) {
                    ctx.drawImage(this.drag_img, 17, 352);
                } else {
                    this.drag_img = new Image();
                    this.drag_img.src = this.drag_icon;

                    this.move_img.onload = (e) => {
                        ctx.drawImage(this.drag_img, 19, 352);
                    };
                }

                ctx.stroke();
            }

            drawBMButton(ctx) {
                if (this.bclick === 'bm') {
                    return;
                }
                ctx.textAlign = 'center';
                ctx.fillStyle = "lightYellow";
                ctx.strokeStyle = "black";
                ctx.lineWidth = 2;
                this.setShadow(ctx, "darkGray", 0, 0, 10);
                ctx.beginPath();
                ctx.arc(25, 100, 10, 0, Math.PI * 2, false);
                ctx.fill();
                ctx.fillStyle = "black";
                ctx.font = "11pt Arial";
                ctx.fillText('B', 25, 102);
                ctx.stroke();

            }

            drawZoomOutButton(ctx) {

                if (this.bclick === 'zoom_out') {
                    return;
                }

                ctx.textAlign = 'center';

                ctx.fillStyle = "lightYellow";
                ctx.strokeStyle = "black";
                ctx.lineWidth = 2;

                this.setShadow(ctx, "darkGray", 0, 0, 10);
                ctx.beginPath();
                ctx.arc(25, 295, 10, 0, Math.PI * 2, false);
                ctx.fill();
                ctx.fillStyle = "black";
                ctx.font = "20pt Arial";
                ctx.fillText('-', 25, 295);
                ctx.stroke();

            }

            alpha = 1
            delta = 0.059;

            fadeIn(d) {
                this.fade = true;
                this.delta = 0.15;
                if (d) {
                    this.delta = d;
                }
            }
            fadeOut(d) {
                this.fade = true;
                this.delta = -0.25;
                if (d) {
                    this.delta = d;
                }

            }

            appendLayers(la) {
                this.layers = this.layers.concat(la);
            }
            async exportHighResPNG(rect, scale = 4, opts = {}) {
                const {
                    download = true,
                    filename,
                    returnDataURL = true,
                } = opts;

                const originalCanvasWrapper = this.graph.canvas;

                const origWidth =
                    originalCanvasWrapper.width ||
                    (originalCanvasWrapper.canvas && originalCanvasWrapper.canvas.width);
                const origHeight =
                    originalCanvasWrapper.height ||
                    (originalCanvasWrapper.canvas && originalCanvasWrapper.canvas.height);

                if (!origWidth || !origHeight) {
                    console.error("exportHighResPNG: could not determine original canvas dimensions", originalCanvasWrapper);
                    return null;
                }

                let scaleX, scaleY, fileScaleTag;
                if (typeof scale === "number") {
                    scaleX = scaleY = scale;
                    fileScaleTag = `${scale}x`;
                } else if (scale && typeof scale === "object") {
                    const targetWidth = Number(scale.targetWidth);
                    const targetHeight = Number(scale.targetHeight);

                    if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
                        console.error("exportHighResPNG: invalid scale object", scale);
                        return null;
                    }

                    scaleX = targetWidth / origWidth;
                    scaleY = targetHeight / origHeight;
                    fileScaleTag = `${Math.round(targetWidth)}x${Math.round(targetHeight)}`;
                } else {
                    console.error("exportHighResPNG: invalid scale param", scale);
                    return null;
                }

                let clipX = rect?.x ?? 0;
                let clipY = rect?.y ?? 0;
                let clipW = rect?.width ?? origWidth;
                let clipH = rect?.height ?? origHeight;

                clipX = Math.max(0, clipX);
                clipY = Math.max(0, clipY);
                if (clipX + clipW > origWidth) clipW = origWidth - clipX;
                if (clipY + clipH > origHeight) clipH = origHeight - clipY;

                if (clipW <= 0 || clipH <= 0) {
                    console.error("exportHighResPNG: invalid clip rect", { clipX, clipY, clipW, clipH });
                    return null;
                }

                const scaledFullWidth = Math.max(1, Math.round(origWidth * scaleX));
                const scaledFullHeight = Math.max(1, Math.round(origHeight * scaleY));
                const scaledClipWidth = Math.max(1, Math.round(clipW * scaleX));
                const scaledClipHeight = Math.max(1, Math.round(clipH * scaleY));

                const offscreen = document.createElement("canvas");
                offscreen.width = scaledFullWidth;
                offscreen.height = scaledFullHeight;

                const offCtx = offscreen.getContext("2d");
                if (!offCtx) {
                    console.error("exportHighResPNG: could not get 2D context");
                    return null;
                }

                const nativeEl = {
                    offsetWidth: scaledFullWidth,
                    offsetHeight: scaledFullHeight,
                };
                const elementRefLike = { nativeElement: nativeEl };

                const tempCanvasWrapper = {
                    width: scaledFullWidth,
                    height: scaledFullHeight,
                    canvas: offscreen,

                    getCTX() {
                        return offCtx;
                    },

                    getContainer() {
                        return elementRefLike;
                    },
                };

                this.graph.canvas = tempCanvasWrapper;

                try {
                    const r = this.redraw();
                    if (r && typeof r.then === "function") await r;

                    if (this.graph.canvas.width !== offscreen.width || this.graph.canvas.height !== offscreen.height) {
                        offscreen.width = Math.max(1, Math.round(this.graph.canvas.width));
                        offscreen.height = Math.max(1, Math.round(this.graph.canvas.height));
                        nativeEl.offsetWidth = offscreen.width;
                        nativeEl.offsetHeight = offscreen.height;

                        const ctx2 = offscreen.getContext("2d");
                        if (!ctx2) throw new Error("lost 2D context after resize");
                        tempCanvasWrapper.getCTX = () => ctx2;

                        const r2 = this.redraw();
                        if (r2 && typeof r2.then === "function") await r2;
                    }

                    if (offscreen.width <= 0 || offscreen.height <= 0) {
                        console.error("exportHighResPNG: offscreen ended up 0x0", offscreen.width, offscreen.height);
                        return null;
                    }

                    const cropCanvas = document.createElement("canvas");
                    cropCanvas.width = scaledClipWidth;
                    cropCanvas.height = scaledClipHeight;

                    const cropCtx = cropCanvas.getContext("2d");
                    if (!cropCtx) {
                        console.error("exportHighResPNG: could not get crop ctx");
                        return null;
                    }

                    let srcX = Math.round(clipX * scaleX);
                    let srcY = Math.round(clipY * scaleY);
                    let srcW = scaledClipWidth;
                    let srcH = scaledClipHeight;

                    srcX = Math.max(0, srcX);
                    srcY = Math.max(0, srcY);
                    if (srcX + srcW > offscreen.width) srcW = offscreen.width - srcX;
                    if (srcY + srcH > offscreen.height) srcH = offscreen.height - srcY;
                    if (srcW <= 0 || srcH <= 0) {
                        console.error("exportHighResPNG: invalid source rect after clamp", { srcX, srcY, srcW, srcH });
                        return null;
                    }

                    cropCtx.drawImage(offscreen, srcX, srcY, srcW, srcH, 0, 0, cropCanvas.width, cropCanvas.height);

                    const dataURL = cropCanvas.toDataURL("image/png");
                    const base64 = dataURL.split(",")[1] || null;

                    if (download) {
                        const a = document.createElement("a");
                        a.href = dataURL;
                        a.download = filename || `snapshot-${fileScaleTag}-${clipX}-${clipY}-${clipW}x${clipH}.png`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    }

                    if (!returnDataURL) return base64;
                    return { base64, dataURL };
                } catch (err) {
                    console.error("exportHighResPNG failed:", err);
                    return null;
                } finally {
                    this.graph.canvas = originalCanvasWrapper;
                }
            }

            redraw() {
                this.graph.rescale();

                if (plateManager) {
                    plateManager.updateEvents()
                }

                if (this.graph.canvas) {
                    CurrentLayout.stash('graph-canvas', this.graph.canvas)
                    let ctx = this.graph.canvas.getCTX();
                    if (!ctx) {
                        return;
                    }
                    if (this.graph.canvas.style) {
                        if (this.graph.canvas.style.display === 'none' || getComputedStyle(this.graph.canvas).display === 'none') {
                            return
                        }

                        if (this.graph.canvas.style.visibility === 'hidden' || getComputedStyle(this.graph.canvas).visibility === 'hidden') {
                            return
                        }
                    }
                    ctx.globalAlpha = 1;
                    this.graph.drawBackdrop();

                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';

                    ctx.globalAlpha = this.alpha;
                    if (this.fade) {
                        this.alpha += this.delta;
                        if (this.alpha < 0) {
                            this.alpha = 0;
                            this.fade = false;
                        }
                        if (this.alpha > 1) {
                            this.alpha = 1;
                            this.fade = false;
                        }
                    }
                    if (this.track && this.track.length > 0) {
                        ctx.textAlign = 'left';
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'gray';
                        let font = `15px Arial`;
                        ctx.font = font;
                        ctx.fillStyle = 'lightGray';
                        let ocount = 0;
                        for (let t of this.track) {
                            if (t.oligos)
                                ocount += t.oligos.length;
                        }

                        if (this.folder && this.folder != undefined && this.folder.name != undefined) {
                            ctx.fillText('Folder: ' + this.folder.name, 20, 75);
                        }
                        if (this.file) {
                            ctx.fillText('File: ' + this.file, 20, 100);
                        } else {

                        }
                        if (this.showDisplay) {
                            ctx.textAlign = 'left';
                            ctx.shadowBlur = 0;
                            ctx.shadowColor = 'black';
                            ctx.font = 'bold 10px Arial';
                            ctx.fillStyle = 'navy';

                            let str = Math.floor((this.graph.grid.xmax - this.graph.grid.xmin) / (this.graph.grid.ymax - this.graph.grid.ymin)) + '';
                            ctx.fillText(str, 2, 10);
                            ctx.fillText('Tracks: ' + this.track.length, 2, 25);
                            ctx.fillText('Oligos: ' + ocount, 2, 40);
                            if (!this.props.selected_chemistry || (!this.props.selected_chemistry))
                                ctx.fillText('(No chemistry selected)', 2, 55);
                            else {

                                let t = this.props.selected_chemistry.name;

                                if (t != undefined && t.endsWith('.json')) {
                                    t = t.substring(0, t.indexOf('.json'))
                                }
                                if (t) {
                                    ctx.fillStyle = 'blue';
                                    ctx.fillText(t, 2, 185);
                                }
                            }
                        }

                        const style = this.graph?.canvas?.canvas?.nativeElement?.style;

                        if (style) {
                            const mode = this.graph?.mode;

                            if (mode === 'navigate') {
                                style.cursor = 'grab';
                            } else if (mode === 'select') {
                                style.cursor = 'context-menu';
                            } else if (mode === 'bpx' || mode === 'draw-rect') {
                                style.cursor = 'crosshair';
                            } else {
                                style.cursor = 'default';
                            }
                        }

                        if (this.highlight_text) {
                            ctx.fillStyle = 'gray';
                            if (this.highlight_color) {
                                ctx.fillStyle = this.highlight_color;
                            }

                            if (this.hx === null) {
                                this.hx = 20;
                            }
                            if (this.hy === null) {
                                this.hy = 200;
                            }

                            ctx.fillText(this.highlight_text, this.hx, this.hy);
                        }

                        if (this.coords && (!isNaN(this.coords))) {
                            ctx.fillStyle = 'lightBlue';
                            ctx.fillText('(' + this.coords + ', ' + this.ycoords + ')', 2, this.graph.canvas.height - 30);

                        }
                    }

                    this.drawGraphLayers();
                    this.drawTracks();
                    if (this.highlightmethod) {
                        this.highlightmethod(ctx, this);
                    }

                    if (this.message) {
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'black';
                        ctx.textBaseline = 'top';

                        let font = `${this.fontSize}px Arial`;
                        if (isMobile()) {
                            this.fontSize = 10;
                            font = `${this.fontSize}px Arial`;
                        } else {
                        }
                        ctx.font = font;
                        let mx = 250;
                        let my = 25;
                        if (this.messagex > 200 && this.messagex < this.graph.canvas.width) {
                            mx = this.messagex;
                        }
                        if (this.messagey > 20 && this.messagey < this.graph.canvas.height) {
                            my = this.messagey;
                        }
                        if (this.centerMessage) {
                            ctx.fillStyle = 'rgba(100, 100, 230, 0.2)';
                            var metrics = ctx.measureText(this.message);
                            var textWidth = metrics.width;
                            var x = (ctx.canvas.width - textWidth) / 2;
                            var y = (ctx.canvas.height + this.fontSize) / 2;

                            ctx.fillText(this.message, x, y);
                        } else {
                            let smallfontSize = 19;
                            ctx.fillStyle = 'maroon';
                            ctx.font = `${smallfontSize}px Arial`;
                            ctx.fillText(this.message, mx, my);
                        }
                    }
                    if (this.highlightObject && this.highlightObject.draw) {
                        this.highlightObject.draw(ctx, this);
                    }
                    if (this.error) {
                        ctx.shadowBlur = 2;
                        ctx.shadowColor = 'black';
                        let font = `${this.fontSize}px Arial`;
                        if (isMobile()) {
                            this.fontSize = 10;
                            font = `${this.fontSize}px Arial`;
                        } else {
                        }
                        ctx.font = font;
                        let mx = 15;
                        let my = 25;
                        let smallfontSize = 15;
                        ctx.fillStyle = 'red';
                        ctx.font = `${smallfontSize}px Arial`;
                        ctx.fillText(this.error, mx, my);
                    }

                    if (this.showNavigationControl && this.track.length > 0) {
                        this.drawZoomButton(ctx);
                        this.drawZoomOutButton(ctx);
                        this.drawMoveButton(ctx);
                        this.drawBoxButton(ctx);

                    }

                    ctx.fillStyle = "white";
                    ctx.lineWidth = 0;
                    ctx.strokeStyle = "black";
                    this.setShadow(ctx, "darkGray", 0, 0, 0);
                    ctx.textAlign = 'left';

                    if (this.shapes) {
                        for (let shape of this.shapes) {
                            shape.draw(this.graph)
                        }
                    }
                    ctx.textAlign = 'left';

                    if (this.menu) {
                        this.graph.drawMenu(this.menu, ctx)
                    }
                    ctx.textAlign = 'left';

                    if (this.bookmark_menu && this.showBookmarks) {
                        this.graph.drawMenu(this.bookmark_menu, ctx)
                    }
                    if (this.chapter_menu && this.showChapters) {
                        this.graph.drawMenu(this.chapter_menu, ctx)
                    }

                    if (!this.plateTrack || this.plateTrack.uid != plateManager.plateTrack.uid)
                        this.plateTrack = plateManager.plateTrack;
                    if (this.post_graphics_modifications) {
                        this.post_graphics_modifications(ctx)
                    }

                    if (this.graph.currentShape && this.graph.currentShape.draw != null) {
                        this.graph.currentShape.draw(plateManager.plateTrack.grid, ctx)
                    }
                    if (this.currentShape) {
                        this.currentShape.draw(this.graph)
                    }

                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'transparent';

                    if (isMobile()) {
                        this.showNavigationControl = false;
                    }


                    const mode = this.graph?.mode;
                    if (mode) {
                        if (mode.startsWith("msg:")) {
                            const mx = (this.graph.mscx) + 18;
                            const my = (this.graph.mscy) - 28;
                            this._drawCursorHint(ctx, mode.split(':')[1], mx, my);
                        }
                    }


                }

                if (!staticImage) {
                    const referrer = document.referrer;

                    if (referrer.includes('linkedin.com')) {

                        const canvas = document.getElementById('linkedinCanvas');
                        const ctx = canvas.getContext('2d');

                        const img = new Image();
                        img.src = '/assets/img/icons/png/yak.svg';
                        img.onload = function () {

                            ctx.fillStyle = "#f3f3f3";
                            ctx.fillRect(0, 0, canvas.width, canvas.height);

                            const yakSize = 150;
                            ctx.drawImage(img, 50, 50, yakSize, yakSize);

                            ctx.fillStyle = "#222";
                            ctx.font = "bold 48px Arial";
                            ctx.fillText("bajabio", 220, 120);

                            ctx.font = "24px Arial";
                            ctx.fillText("Generated on: " + new Date().toLocaleDateString(), 50, canvas.height - 50);

                            const imageData = canvas.toDataURL("image/png");
                            const link = document.createElement('a');
                            link.download = 'linkedin-post.png';
                            link.href = imageData;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }
                    }
                    staticImage = true;
                }

            }
            setTrack(track, trackIndex) {
                this.track[trackIndex] = track;
                this.notifyTrackListener();
                this.drawTracks();
            }

            getTrackByID(idValue) {
                return this.track.find(obj => obj.transcriptID === idValue);
            }

            highlightTrackCoords(x, y) {
                this.coords = null;
                this.ycoords = null;
                let t = this.getTrack(x, y);
                if (t >= 0) {
                    let track = this.track[t];
                    if (track)
                        if (track.tgraph) {
                            let c = track.tgraph.Xwc(x).toFixed(0)
                            this.coords = c;
                            track.highlightIndex = c;

                            this.ycoords = track.tgraph.Ywc(y).toFixed(2)
                        } else {
                            this.coords = c;
                        }

                }
            }

            createTrack(name, start, end, strand) {
                let t = new Track(name, start, end, 2, strand)

                this.addTrack(t)
                this.notifyTrackListener();
                t.tgraph.yi = this.track.length + 1;
                return t;
            }
            createTrackFromGFF(name, gff_text) {
                let gff = new GFF(gff_text);
                let range = gff.getRange();

                let strand = '-'
                this.graph.setymax(this.tracks.length + 1)
                let t = new Track(name, range['min'], range['max'], this.tracks.length, strand)

                this.graph.setxmax(t.tgraph.width)
                this.graph.setxmin(0)

                this.track.push(t)
                this.notifyTrackListener();

                this.drawTracks();
                return t;
            }

            getRange() {
                return {
                    start: this.getxmin(),
                    end: this.getxmax()
                }
            }

            createComponent(mdel) {
                return this.graph.createComponent(null, null, mdel);
            }

        }

        let g = new GeneGraph();
        await g.init();
        return resolve(g)
    })

}
