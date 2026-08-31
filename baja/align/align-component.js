function () {

    return new Promise(async (resolve, reject) => {

        let Amplicon = await exec('flexigraph/amplicon.js')
        let Oligo = await exec('flexigraph/oligo.js')
        let SIRNA = await exec('flexigraph/sirna.js')
        let SnpIndel = await exec('flexigraph/snpindel.js')
        let MutationAnnotation = await exec('flexigraph/mutation-annotation.js')
        let MGrid = await exec('flexigraph/grid.js')
        let shapes = await exec('flexigraph/gene-draw.js')
        let ChemTemplate = await exec('flexigraph/chem.js')
        let Menu = await exec('flexigraph/menu.js')
        let Annotation = await exec('flexigraph/annotation.js')
        let { Track, TrackRef } = await exec('baja/bio/track.js')
        let RectangleText = await exec('flexigraph/shapes/Rect-text.js')
        let Icon = await exec('flexigraph/shapes/icon.js')
        let Oval = await exec('flexigraph/shapes/oval.js')
        let Rectangle = await exec('flexigraph/shapes/rect.js')
        let Line = await exec('flexigraph/shapes/line.js')
        let { Citation, CitationItem } = await exec('flexigraph/shapes/citation.js')
        let RNASecondaryStructure = await exec('baja/structure/rna-secondary-structure-track.js')
        let AlignTrack = await exec('baja/align/align-track.js')
        let TrackPlot = await exec('flexigraph/track-plot.js')

        let AlignGraph = class AlignGraph {
            graph;
            strand;
            track = [];
            listener;
            mouseListener;
            graphListener;
            mouseDownListener;
            mouseUpListener;
            mouseMoveListener;
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
            startX = 0;
            endX = 0;
            menu = null;
            bookmark_menu = null;
            currentShape;
            shapes = [];
            bookmarks = {}
            chapter_menu = null;
            showBookmarks = false;
            showChapters = false;
            xwc = -1;
            ywc = -1;
            message = null;
            preferences = {};
            gridxmax = 115;

            runTest() {

            }

            async execute(sequence, editDistance, selected_tissues, genomes, mode) {
                this.track = []
                this.setMessage(' Executing with edit distance: ' + editDistance)
                let a = new AlignTrack('', 0, 100, 20000);
                let r = await a.exec(sequence, editDistance, selected_tissues, genomes, mode)
                this.track.push(a);
                this.mouseDownListeners.push(a.getMouseDownListener())
                this.mouseMoveListeners.push(a.getMouseMoveListener())
                this.mouseUpListeners.push(a.getMouseUpListener())
                if (r)
                    this.setMessage('Found ' + r.length + ' off-targets ')
                return r;
            }

            clear() {
                this.track = [];
            }

            setMessage(m) {
                this.message = m;
                setTimeout(() => {
                    this.message = null;
                }, 2000)
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
                    m.push({
                        label: l.name,
                        click: async (xwc, ywc) => {

                            let offset = l.tgraph.width / 6

                            this.graph.setymax(l.tgraph.yi + l.tgraph.height + 15)
                            this.graph.setymin(l.tgraph.yi - Math.abs(l.tgraph.height) - 4)
                            this.graph.setxmin(l.tgraph.xi - offset)
                            this.graph.setxmax(l.tgraph.xi + l.tgraph.width + offset)
                            this.graph.rescale();

                        },
                        move: () => {
                        }
                    })
                }
                let xsc = this.Xwc(2)
                let ysc = this.Ywc(100)
                let ChapterMenu = await exec('flexigraph/menu-chapter.js')
                this.chapter_menu = new ChapterMenu(m, 0, 350, this.graph)
                this.chapter_menu.title = 'Tracks';
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

                let ChapterMenu = await exec('flexigraph/menu-chapter.js')
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

            async update(graph) {
                this.shapes = [];
                this.menu = null;
                this.mode = 'gene'
                this.track = [];
                this.chem = [];
                this.plates = [];
                this.startX = 0;
                this.endX = 0;
                this.chem = graph.chem;
                this.endX = graph.endx;
                let temp_grid = Object.assign(new MGrid(), graph.graph.grid);

                temp_grid.width = this.graph.grid.width;
                temp_grid.height = this.graph.grid.height;
                this.graph.grid = temp_grid;
                this.elastic = graph.elastic;
                this.mode = graph.mode;
                this.plates = graph.plates;
                this.startX = graph.startX;
                this.track = [];
                let _tracks = graph.track;

                if (_tracks && _tracks.length > 0) {

                    for (let t of _tracks) {
                        await this.___setTrack(t);
                    }
                }

                let _shapes = graph.shapes;
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
                                image.src = t.b64;
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

                for (let pt of this.track) {
                    if (pt.trackRef && pt.trackRef.track && pt.trackRef.track.name) {
                        for (let t of this.track) {

                            if (pt.trackRef && pt.trackRef.name != null) {
                                console.log('debubg');
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

            trackExists(name) {
                for (let t of this.track) {
                    console.log(' track ' + t.name);
                    if (t.name.toUpperCase() === name.toUpperCase()) {
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
                await this.___setTrack(jsonObject);
                for (let pt of this.track) {
                    if (pt.trackRef && pt.trackRef.track && pt.trackRef.track.name) {
                        for (let t of this.track) {
                            if (pt.trackRef && pt.trackRef.track && pt.trackRef.track.name && pt.trackRef.track.name === t.name) {
                                pt.trackRef.track = t;
                            }
                        }
                    }
                }
            }

            clearMouseListeners() {
                this.mouseDownListeners = []
                this.mouseMoveListeners = [];
                this.mouseUpListeners = [];
                this.graph.mode = 'none'
            }

            setMouseMode(mode) {
                this.graph.mode = mode;
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

            deselectAllTracks() {
                this.currentShape = null;
                for (let t of this.track) {
                    t.markstart = null;
                    t.markend = null;
                    t.showResizeBar = false;
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
            zoomToSelected() {
                this.zoom(this.startX, this.endX)

            }

            getStructure(x, y) {
                let s = [];
                for (let t of this.track) {

                    let selected2 = t.getOligo(x, y, this.graph);
                    if (selected2 && selected2.length > 0)
                        s.push(selected2)
                }
                for (let sh of this.shapes) {
                    if (sh.isIn && sh.isIn(x, y)) {
                        s.push(sh)
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
                    let g = new AlignGraph();
                    await g.init(name, start, end, strand);
                    resolve(g);
                });
            }
            toGFF(str) {
                return new GFF(str);
            }
            addListener(listener) {
                this.listener = listener;

            }

            add(ensembleId, x, y, source) {
                if (ensembleId.startsWith('NM_') || ensembleId.startsWith('NC_')) {
                    return this.addNCBI(ensembleId)
                } else {
                    let prefix = null;
                    let genomes = ["HG19", "GRCH37"];
                    if (source && genomes.includes(source.toUpperCase())) {
                        prefix = `https://rest.ensembl.org`;
                    } else {
                        prefix = `https://rest.ensembl.org`;
                    }
                    console.log(source.toUpperCase())
                    console.log(prefix)
                    GETJSON(prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`).then(async (js) => {
                        if (js) {
                            let start = +js['start']
                            let end = +js['end']
                            let strand = js['strand']
                            let t = this.createTrack(ensembleId, start, end, strand);
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
                            let ensembl_sequence = prefix + `/sequence/id/${ensembleId}?content-type=text/plain`;

                            let fasta = await GETXT(ensembl_sequence)
                            fasta = fasta.trim();
                            if (t.strand < 0) {
                                let temp = '';
                                for (let c = fasta.length - 1; c >= 0; c--) {   // >= 0: c > 0 dropped fasta[0], leaving the minus-strand sequence one base short
                                    temp += fasta[c]
                                }
                                t.setSequence(temp)
                            } else {
                                t.setSequence(fasta)
                            }
                            this.buildAnnotations(t, js);
                        }
                    })
                }
            }

            addNCBI(ncbi, x, y) {

                exec('baja/ncbi/get-transcript.js', ncbi).then(async (js) => {
                    if (js) {
                        let start = +js['start']
                        let end = +js['end']
                        let strand = js['strand']
                        console.log('debubg');
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
                        console.log('debubg');
                        t.setSequence(sequence)
                        this.buildAnnotations(t, js);
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

            async ___setTrack(js) {
                return new Promise(async (resolve, reject) => {
                    var foo = Object.assign(new Track(), js);

                    if (js.sequence != null && js.sequence.length > 0) {

                        foo.sequence = js.sequence;
                    }

                    let annn = []
                    if (js.annotations && js.annotations.length > 0) {
                        for (let a of js.annotations) {
                            a.shapeFunction = getIon(shapes[a.type])
                            annn.push(Object.assign(new Annotation(), a))
                        }
                    }

                    let o = []
                    if (js.oligos && js.oligos.length > 0 && js.oligos[0]) {
                        for (let a of js.oligos) {
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

                    let sids = [];
                    if (js.snpindels && js.snpindels.length > 0 && js.snpindels[0]) {
                        for (let sid of js.snpindels) {
                            if (sid.type === 'mutation-annotation') {

                                sids.push(new MutationAnnotation(sid.type, sid.xi, sid.xf, sid.name, sid.phase, sid.transcriptStrand, sid.id, sid.phaseset))
                            } else
                                sids.push(new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id, sid.phaseset))
                        }
                    }

                    let struct = [];
                    if (js.structures && js.structures.length > 0 && js.structures[0]) {
                        for (let strc of js.structures) {
                            let rna = new RNASecondaryStructure(strc.name, strc.xi, strc.xf, strc.sequence, strc.strand);
                            rna.pos = strc.pos;
                            let temp_grid = Object.assign(new MGrid(), strc.tgraph);
                            rna.tgraph = temp_grid;
                            struct.push(rna);
                        }
                    }

                    let plots = []

                    if (js.plots && js.plots.length > 0 && js.plots[0]) {
                        for (let a of js.plots) {
                            let tp = Object.assign(new TrackPlot(), a)

                            if (a.mg != null) {
                                let amg = Object.assign(new MGrid(), a.mg);
                                tp.mg = amg;
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
                    console.log('debubg');
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

                for (let t of this.track) {
                    if (t.name.toUpperCase() === name.toUpperCase()) {
                        return true;
                    }
                    return false;
                }

            }

            setTrack(js) {
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
                foo.oligos = o;
                foo.annotations = annn;
                if (foo.y > this.graph.getymax()) {
                    this.graph.setymax(foo.y + 1)
                    this.graph.rescale();
                }
                this.track[foo.y] = foo;

                this.zoom(foo.xi - 10, foo.xf + 10);
                this.graph.setymax(this.track.length + 1)

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
            zoom(min, max) {
                this.graph.zoom(min, max);
                this.graph.rescale();

            }
            zoomRect(xmin, xmax, ymin, ymax) {
                this.graph.setxmin(xmin);
                this.graph.setxmax(xmax);
                this.graph.setymin(ymin);
                this.graph.setymax(ymax);
                this.graph.rescale();
            }

            zoomXY(xmin, xmax, ymin, ymax) {
                this.zoomRect(xmin, xmax, ymin, ymax)
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

            showBookmarkMenu() {
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
                let ChapterMenu = await exec('flexigraph/menu-chapter.js')
                this.bookmark_menu = new ChapterMenu(m, 0, 50, this.graph)
                this.bookmark_menu.title = 'Bookmarks'

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
                let ChapterMenu = await exec('flexigraph/menu-chapter.js')
                this.bookmark_menu = new ChapterMenu(m, 0, 50, this.graph)
                this.bookmark_menu.title = 'Bookmarks'
            }

            buildAnnotations(t, js) {
                if (js['object_type'] === 'Transcript') {
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
            async init() {

                this.bookmarkMouseDownListener = (xwc, ywc) => {
                    if (this.bookmark_menu && this.showBookmarks && this.bookmark_menu.isIn(this.graph.X(xwc), this.graph.Y(ywc))) {
                        return this.bookmark_menu.mouseDown(this.graph.X(xwc), this.graph.Y(ywc))
                    }
                }
                this.bookmarkMouseUpListener = (xwc, ywc) => {
                    if (this.bookmark_menu && this.showBookmarks && this.bookmark_menu.isIn(this.graph.X(xwc), this.graph.Y(ywc))) {
                        this.bookmark_menu.mouseUp(this.graph.X(xwc), this.graph.Y(ywc))
                    }

                }
                this.bookmarkMouseMoveListener = (xwc, ywc) => {

                    if (this.bookmark_menu && this.showBookmarks && this.bookmark_menu.isIn(this.graph.X(xwc), this.graph.Y(ywc))) {
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

                    if (this.track && this.track.length > 0) {
                        for (let t of this.track) {
                            if (t.getAnnotation) {
                                let annotation = t.getAnnotation(xwc, ywc);
                                annotations.push(annotation)
                            }
                        }
                    }

                }

                this.mouseDownListener = (xwc, ywc) => {

                    this.xwc = xwc;
                    this.ywc = ywc;

                    if (this.bookmark_menu && this.showBookmarks) {
                        this.bookmarkMouseDownListener(xwc, ywc);
                        this.showBookmarks = false;
                    }
                    if (this.chapter_menu && this.showChapters) {
                        this.chapterMouseDownListener(xwc, ywc);
                        this.showChapters = false;
                    }

                    if (this.select_) {
                        this.startX = xwc;
                    }
                    if (this.menu && this.menu.isIn(this.graph, xwc, ywc)) {
                        return this.menu.mouseDown(this.graph, xwc, ywc)
                    }

                    this.mouseDown = true;
                    for (let mdl of this.mouseDownListeners) {
                        mdl(xwc, ywc);
                    }

                }
                this.mouseUpListener = (xwc, ywc) => {
                    if (this.bookmark_menu && this.showBookmarks) {
                        this.bookmarkMouseUpListener(xwc, ywc);
                    }
                    if (this.chapter_menu && this.showChapters) {
                        this.chapterMouseUpListener(xwc, ywc);
                    }
                    if (this.select_) {
                        this.endX = xwc;
                    }
                    if (this.menu && this.menu.isIn(this.graph, xwc, ywc)) {
                        this.menu.mouseUp(this.graph, xwc, ywc)
                    }
                    this.menu = null;
                    this.mouseDown = false;

                    for (let mul of this.mouseUpListeners) {
                        mul(xwc, ywc);
                    }

                }
                this.mouseMoveListener = (xwc, ywc) => {
                    if (this.select_ && this.mouseDown) {
                        this.endX = xwc;
                    }
                    if (this.menu && this.menu.isIn(this.graph, xwc, ywc)) {
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
                        movel(xwc, ywc);
                    }

                }

                let controlPanelRefCallback = (controlPanel) => {
                    this.controlPanel = controlPanel;
                    this.controlPanel.setHTML('')

                }
                let controlPanelListener = (item) => {

                }
                let FlexiGraph = await exec('flexigraph/graph.js', this.graphListener, this.mouseDownListener, this.mouseUpListener,
                    this.mouseMoveListener, controlPanelRefCallback, controlPanelListener);
                this.graph = new FlexiGraph();
                this.graph.mode = "vertical_navigate"
                await this.graph.init();
                this.graph.resizeWithCanvas = this.elastic;
                this.graph.setymin(0);
                this.graph.setxmin(0)
                this.graph.setxmax(this.gridxmax)
                this.graph.setymax(10)

                setInterval(() => {
                    this.redraw();
                }, 300)
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
                    if (scyy > scy && scyy < (scy + sch + 40) && scxx > scx && scxx < (scx + scw + 40)) {
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
                                console.log('debubg');
                                let tstr = t.trackRef.toString();
                                if (tstr.startsWith('->:')) {
                                    let name = ''
                                    let mapindex = tstr.indexOf(':map')
                                    if (mapindex > 0) {
                                        name = t.trackRef.substring(3, mapindex);
                                    } else {
                                        name = t.trackRef.substring(3);
                                    }
                                    for (let track_item of this.track) {
                                        if (track_item.name == name) {
                                            t.trackRef = new TrackRef(track_item, track_item.xi, track_item.xf);

                                            let mapindex = tstr.indexOf(':map:')
                                            if (mapindex >= 0) {
                                                let mindex_end = tstr.indexOf(']:', mapindex)
                                                let mindex = tstr.substring(mapindex + 5, mindex_end + 1)

                                                let mjob = JSON.parse(mindex)

                                                console.log(' mjob ' + JSON.stringify(mjob))

                                                console.log('debubg');

                                                t.trackRef.map = mjob;
                                            }
                                            let showMismatchesIndexStart = tstr.indexOf(':showMismatches:')
                                            if (showMismatchesIndexStart > 0) {
                                                let showMismatchesIndexEnd = tstr.indexOf(showMismatchesIndexStart, ':')
                                                let mm = tstr.substring(showMismatchesIndexStart + 16, showMismatchesIndexEnd)
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

            async drawTracks() {
                this.graph.resizeWithCanvas = this.elastic;
                if (this.graph && this.track) {

                    await this.graph.drawBackdrop();
                    if (this.select_) {
                        let midpoint = (this.graph.getymax() - this.graph.getymin()) / 2;
                        this.graph.drawVerticalLine(this.startX, midpoint, 2 * (this.graph.getymax() - this.graph.getymin()), 'cyan', 2);
                        this.graph.drawVerticalLine(this.endX, midpoint, 2 * (this.graph.getymax() - this.graph.getymin()), 'cyan', 2);
                        this.graph.drawLine(this.startX, this.graph.getymin(), this.endX, this.graph.getymin(), 'darkGray', 1);

                    }
                    for (let t of this.track) {
                        t.draw(this.graph);
                    }
                } else {
                    console.log(this.graph + " Missing graph or tracks " + this.tracks)
                }
                if (this.shapes) {
                    for (let shape of this.shapes) {
                        await shape.draw(this.graph)
                    }
                }
                if (this.currentShape) {
                    await this.currentShape.draw(this.graph)
                }
                if (this.menu) {
                    this.graph.drawMenu(this.menu)
                }
                if (this.bookmark_menu && this.showBookmarks) {
                    this.graph.drawMenu(this.bookmark_menu)
                }
                if (this.chapter_menu && this.showChapters) {
                    this.graph.drawMenu(this.chapter_menu)
                }

            }
            addChem(ch) {
                this.chem.push(ch);
            }
            async drawChem() {
                await this.graph.drawBackdrop();
                for (let c of this.chem) {
                    await c.draw(this.graph);
                }
                if (this.select_) {
                    this.graph.drawVerticalLine(this.startX, this.graph.getymin(), this.graph.getymax(), 'black', 2);
                    this.graph.drawVerticalLine(this.endX, this.graph.getymin(), this.graph.getymax(), 'black', 2);
                    this.graph.drawLine(this.startX, this.graph.getymax(), this.endX, this.graph.getymax(), 'darkGray', 2);

                }
                if (this.menu) {
                    this.graph.drawMenu(this.menu)
                }

            }

            showMenu(list, x, y, width) {
                if (!width) {
                    width = 200;
                }
                this.menu = new Menu(list, x, y)
                this.menu.menu_width = width;
            }

            menuVisible() {
                if (this.menu) {
                    return true;
                } else
                    return false;
            }
            hideMenu() {
                this.menu = null;
            }

            async redraw() {

                this.graph.rescale();
                if (this.mode === 'chem')
                    this.drawChem();
                else
                    this.drawTracks();

                if (this.graph.canvas) {
                    let ctx = this.graph.canvas.getCTX();
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'black';

                    ctx.font = 'bold 10px serif';
                    ctx.fillStyle = 'gray';
                    let str = `${Math.round(this.graph.grid.xmax - this.graph.grid.xmin)} : ${Math.round(this.graph.grid.ymax - this.graph.grid.ymin)}`

                    ctx.fillText(str, 10, 10);
                }

                if (this.message) {
                    let ctx = this.graph.canvas.getCTX();
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'gray';
                    let font = 'bold 20px serif';
                    ctx.font = font;
                    ctx.fillStyle = 'black';
                    ctx.textBaseline = 'top';

                    ctx.fillStyle = '#f50';

                    var width = ctx.measureText(this.message).width;

                    ctx.fillRect(0, 0, width, parseInt(font, 10));

                    ctx.fillStyle = 'black';
                    ctx.fillText(this.message, 50, 25);

                }

            }

            setTrack(track, trackIndex) {
                this.track[trackIndex] = track;
                this.notifyTrackListener();
                this.drawTracks();
            }

            createTrack(name, start, end, strand) {
                let t = new Track(name, start, end, 2, strand)
                this.track.push(t)
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

            async createComponent() {
                return await this.graph.createComponent();
            }

        }

        let g = new AlignGraph();
        await g.init();
        resolve(g)
    })

}
