function (libid) {

    return new Promise(async (resolve, reject) => {
        let MGrid = await exec('flexigraph/grid.js');

        let perc2color = (perc, min, max) => {
            var base = (max - min);

            if (base == 0.00) { perc = 100; }
            else {
                perc = (perc - min) / base * 100;
            }
            var r, g, b = 0;
            if (perc < 50) {
                r = 255;
                g = Math.round(5.1 * perc);
            }
            else {
                g = 255;
                r = Math.round(510 - 5.10 * perc);
            }
            var h = r * 0x10000 + g * 0x100 + b * 0x1;
            return '#' + ('000000' + h.toString(16)).slice(-6);
        }

        let GenericWell = class GenericWell {
            name = 'unknown';
            score;
            obj;

            constructor(name) {
                this.name = name;
            }
            setObj(obj) {
                this.obj = obj;
            }
            getObj() {
                return this.obj;
            }
            draw(grid, ctx, min, max, x, y) {
                if (!ctx) {
                    return;
                }
                if (this.score) {
                    let color = perc2color(this.score, min, max)
                    ctx.fillStyle = color;
                    ctx.fillRect(grid.X(x), grid.Y(y + 1), grid.screenWidth(1), grid.screenHeight(1));
                    ctx.stroke();

                }

                let temp = ctx.fillStyle;
                ctx.fillStyle = 'black';
                if (this.score)
                    ctx.fillText(this.score, grid.X(x) + 10, grid.Y(y) - 15);
                if (this.obj && this.obj.type)
                    ctx.fillText(this.obj.type, grid.X(x) + 10, grid.Y(y) - 15);

                ctx.fillText(this.name, grid.X(x) + 10, grid.Y(y) - 5);
                ctx.stroke();
                ctx.fillStyle = temp;
            }
        }

        let Well = class Well {

        }

        let graphListener, mouseDownListener, mouseUpListener, mouseMoveListener, controlPanelCallback, controlPanelListener;

        mouseDownListener = (item) => {

        }

        let Plate = class Plate {
            grid;
            canvas;

            xmax = 24;
            ymax = 16;
            wells = Array.from(Array(this.xmax), () => new Array(this.ymax));
            plateID;
            plateType;

            mousex;
            mousey;
            selectedObject;

            constructor(width, height) {
                this.xmax = width;
                this.ymax = height;

                for (let x = 0; x < this.xmax; x++) {
                    for (let y = 0; y < this.ymax; y++) {
                        this.wells[x][y] = new GenericWell(this.getAlph(this.ymax - y - 1) + (1 + x));
                    }
                }
            }

            getAlph(i) {
                let char = String.fromCharCode(65 + i);
                return char;
            }

            setData(well, min, max) {
                this.min = min;
                this.max = max;

                for (let w of well) {
                    let well_address = w[0]
                    this.setWell(well_address, w[1])
                }
            }

            appendWell ( well ){
                for (let col = 0; col < this.wells.length; col++) {
                    for (let row = 0; row < this.wells[col].length; row++) {
                        if (this.wells[col][row] === null) {
                            this.wells[col][row] = well;
                        }
                    }
                }
            }

            setWell(address, value) {
                let search = address.search(/\d/)
                if (search > 0) {
                    let chr = address.substring(0, search);
                    let col_index = (+address.substring(search)) - 1;
                    let row_index = chr.charCodeAt(0) - 65;
                    let row_i = +(this.grid.getymax() - row_index - 1);
                    if (row_i >= 0 && col_index >= 0) {

                        let w = this.wells[col_index][this.grid.getymax() - row_index - 1];
                        console.log(' w name ' + w.name + ' colin dex ' + col_index + ' row ' + row_i);
                        this.wells[col_index][row_i].score = value;

                    }
                }
            }

            setWellID(address, id) {
                let search = address.search(/\d/)
                if (search > 0) {
                    let chr = address.substring(0, search);
                    let col_index = (+address.substring(search)) - 1;
                    let row_index = chr.charCodeAt(0) - 65;
                    let row_i = +(this.grid.getymax() - row_index - 1);
                    if (row_i >= 0 && col_index >= 0) {
                        let w = this.wells[col_index][this.grid.getymax() - row_index - 1];
                        this.wells[col_index][row_i].id = id;
                    }
                }
            }
            setWellObj(col, row, obj) {
                this.wells[col][this.ymax - 1 - row].obj = obj;
            }

            setWellIDByIndex(col, row, id) {
                this.wells[col][this.ymax - 1 - row].id = id;
            }

            async createPlateComponent(pixwidth, pixheight, graph) {
                return new Promise(async (res, rej) => {
                    let Menu = await exec('flexigraph/menu.js')
                    let idt = await exec('baja/chem/structure/idt/idt-format.js')
                    this.mx;
                    this.my;
                    this.mousedown = false;
                    this.grid = new MGrid(0, 0, pixwidth, pixheight);
                    this.grid.setxmax(this.xmax);
                    this.grid.setymax(this.ymax);
                    this.grid.setxmin(0);
                    this.grid.setymin(0);
                    this.grid.rescale();
                    let menuList = [

                    ]
                    menuList.push({
                        label: `Show compound`,
                        click: (xwc, ywc) => {
                            let wy = Math.floor(this.my)
                            let wx = Math.floor(this.mx)
                            let well = this.wells[wx][wy];
                            this.selectedObject = well.obj;
                            showModal({
                                'wid': 'json',
                                data: JSON.stringify(this.selectedObject)
                            })
                            structureGraph.setObj(this.selectedObject);

                        },
                        move: () => {
                        }
                    });

                    menuList.push({
                        label: `Show target`,
                        click: (xwc, ywc) => {
                            let wy = Math.floor(this.my)
                            let wx = Math.floor(this.mx)
                            let well = this.wells[wx][wy];
                            this.selectedObject = well.obj;

                        },
                        move: () => {
                        }
                    });

                    menuList.push({
                        label: `Export all (IDT)`,
                        click: (xwc, ywc) => {

                            let idtlist = []

                            let index = 0;
                            let hlist = []
                            for (let w of this.wells) {
                                if (w && w.length > 0) {
                                    for (let y = 0; y < w.length; y++) {
                                        let item = w[y]
                                        if (item && item.obj) {

                                            hlist.push(item.obj.structure);
                                        }

                                    }
                                }
                                index++;
                            }

                            idtlist = idt.formatLJLList(hlist);
                            let str = ''
                            for (let id of idtlist) {
                                str += id + '\n'
                            }

                            showModal({
                                wid: 'text-editor',
                                height: '600px',
                                data: {
                                    editorOptions: { language: 'text', automaticLayout: true },
                                    code:str

                                }
                            }
                            )
                        },
                        move: () => {
                        }
                    });
                    menuList.push({
                        label: `Delete cell`,
                        click: async (xwc, ywc) => {

                            let deleteItem = {
                                wid: 'card',
                                data: {
                                    height: '600px',
                                    cards: [
                                        [
                                            {
                                                'title': ' ', 'body': ``
                                                ,
                                                'width': '90%',
                                                'component':
                                                {
                                                    wid: 'html',
                                                    data: '<font color=red> Are you sure you want to remove this compound? </font>'
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
                            showModal(deleteItem)
                        },
                        move: () => {
                        }
                    });

                    this.menu = new Menu(menuList, 0, 100)
                    this.menu.menu_width = 200;
                    let structureGraph;

                    let innerComponentCallback = createIonFunction((innerComponent) => {
                        this.canvas = innerComponent;
                        setInterval(() => {
                            this.drawPlate()
                        }, 500)
                    });
                    let side_PanelCallback = createIonFunction((innerComponent) => {
                        if (controlPanelCallback)
                            controlPanelCallback(innerComponent);
                    });

                    await showWidget({
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        'title': ' ',
                                        'width': '100%',
                                        'body': `
                    `                   , 'component':
                                        {

                                            wid: 'html',
                                            refCallback: side_PanelCallback,
                                            data: ''
                                        }
                                    }
                                ]]
                        }
                    })

                    let button_canvas = {
                        wid: 'button-canvas',
                        data: {
                            'title': 'controls',
                            'height': 20,
                            'width': 320,
                            'grid': {
                                xmin: 0,
                                xmax: 30,
                                ymin: -0.01,
                                ymax: 1,
                                xinset: 0,
                                yinset: 0
                            },
                            'buttons': [
                                {
                                    x: 0, y: 0, label: 'Left', ionFunction: createIonFunction(() => {
                                        let l = (graph.getxmax() - graph.getxmin()) / 4;
                                        let ly = (graph.getymax() - graph.getymin()) / 4;
                                        graph.zoom(graph.getxmin() - l, graph.getxmax() - l);
                                    })
                                },
                                {
                                    x: 23, y: 0, label: 'Delete object', ionFunction: createIonFunction(async () => {
                                        exec('baja/screens/editor/remove-items.js', graph)
                                    })

                                },
                            ]
                        }
                    }

                    res(
                        {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            width: '100%',
                                            'component': {
                                                wid: 'canvas',
                                                refCallback: innerComponentCallback,
                                                data: {
                                                    height: pixheight,
                                                    width: pixwidth + 400,
                                                    'mouseListener': createIonFunction((scx, scy) => {
                                                        if (this.menu) {
                                                            this.menu.mouseMove(this.grid, scx, scy)
                                                        }
                                                        if (graphListener) {
                                                            graphListener(this.grid.Xwc(scx), this.grid.Ywc(scy));
                                                        }
                                                    }),
                                                    'mouseDownListener': createIonFunction((scx, scy) => {
                                                        if (!this.mouseDown) {
                                                            this.mouseDown = true;
                                                            this.mx = this.grid.Xwc(scx);
                                                            this.my = this.grid.Ywc(scy);
                                                        } else {

                                                            let mmx = this.grid.Xwc(scx);
                                                            let mmy = this.grid.Ywc(scy);
                                                            if (this.menu) {
                                                                this.menu.mouseDown(this.grid, mmx, mmy)
                                                            }

                                                            this.mouseDown = false;
                                                        }
                                                        if (mouseDownListener) {
                                                            this.grid.rescale();
                                                            mouseDownListener(this.grid.Xwc(scx), this.grid.Ywc(scy));
                                                        }
                                                    }),
                                                    'mouseUpListener': createIonFunction((scx, scy) => {
                                                        if (this.mousoeDown) {
                                                            let mmx = this.grid.Xwc(scx);
                                                            let mmy = this.grid.Ywc(scy);
                                                            if (this.menu) {
                                                                this.menu.mouseUp(this.grid, mmx, mmy)
                                                            }
                                                        }
                                                        if (mouseUpListener) {
                                                            this.grid.rescale();
                                                            mouseUpListener(this.grid.Xwc(scx), this.grid.Ywc(scy));
                                                        }
                                                    }),
                                                    'mouseMoveListener': createIonFunction((scx, scy) => {
                                                        let mmx = this.grid.Xwc(scx);
                                                        let mmy = this.grid.Ywc(scy);
                                                        if (this.menu) {
                                                            this.menu.mouseMove(this.grid, mmx, mmy)
                                                        }
                                                        if (mouseMoveListener) {
                                                            this.grid.rescale();
                                                            mouseMoveListener(this.grid.Xwc(scx), this.grid.Ywc(scy));
                                                        }
                                                    })
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ',
                                            'width': '100%',
                                            'component': button_canvas
                                        }

                                    ]]
                            }
                        })
                })
            }
            rescale = () => {
                this.grid.rescale();
            }
            setColor = (color) => {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    ctx.fillStyle = color;
                }
            }
            async drawPlate() {

                await this.drawBackdrop();
                await this.rescale();
                this.drawWells();

                for (let x = this.getxmin(); x < this.getxmax(); x++) {
                    this.drawLine(x, this.getymin(), x, this.getymax(), 'lightGray', 2);
                    for (let y = this.getymin(); y < this.getymax(); y++) {
                        this.drawLine(this.getxmin(), y, this.getxmax(), y, 'lightGray', 2);
                    }
                }
                this.drawLine(this.getxmin(), this.getymin(), this.getxmin(), this.getymax(), 'black', 5);
                this.drawLine(this.getxmax(), this.getymin(), this.getxmax(), this.getymax(), 'black', 5);
                this.drawLine(this.getxmin(), this.getymin(), this.getxmax(), this.getymin(), 'black', 5);
                this.drawLine(this.getxmin(), this.getymax(), this.getxmax(), this.getymax(), 'black', 5);
                if (this.mouseDown) {
                    await this.drawMenu()
                }
            }

            drawMenu() {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    this.menu.x = this.mx;
                    this.menu.y = this.my;
                    this.menu.draw(ctx, this.grid)
                }

            }

            drawEllipse = (x, y) => {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();

                    let w = 2;
                    let h = 2;
                    var kappa = .5522848,
                        ox = (w / 2) * kappa,
                        oy = (h / 2) * kappa,
                        xe = x + w,
                        ye = y + h,
                        xm = x + w / 2,
                        ym = y + h / 2;

                    ctx.beginPath();
                    ctx.moveTo(x, ym);
                    ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                    ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                    ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                    ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                    ctx.stroke();
                }
            }

            drawWells = () => {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    ctx.shadowBlur = 0;
                    for (let x = 0; x < this.xmax; x++) {
                        for (let y = 0; y < this.ymax; y++) {
                            this.wells[x][y].draw(this.grid, ctx, this.min, this.max, x, y);
                        }
                    }
                }
            }

            drawYs = (color) => {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    if (!color) {
                        color = 'black'
                    }
                    let ymin = this.grid.getymin();
                    let ymax = this.grid.getymax();
                    let xmin = this.grid.getxmin();
                    let xmax = this.grid.getxmax();
                    ctx.fillStyle = color;
                    for (let y = 0; y < ymax; y++) {
                        ctx.fillText('[' + y + ']', this.grid.xi, this.grid.Y(y) - 5);
                    }
                    ctx.stroke();

                }
            }

            drawString(str, x, y, color) {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    if (!color) {
                        color = 'black'
                    }
                    ctx.fillStyle = color;
                    ctx.fillText(str, this.grid.X(x), this.grid.Y(y) - 5);
                    ctx.stroke();
                }
            }

            drawStart = (color) => {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    if (!color) {
                        color = 'black'
                    }
                    let ymin = this.grid.getymin();
                    let ymax = this.grid.getymax();
                    let xmin = this.grid.getxmin();
                    let xmax = this.grid.getxmax();
                    ctx.fillStyle = color;
                    ctx.fillText(Math.floor(xmin), this.grid.X(this.grid.getxmin()) + 50, this.grid.Y(ymax) + 5);
                    ctx.stroke();
                }
            }

            drawEnd = (color) => {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    if (!color) {
                        color = 'black'
                    }
                    let ymin = this.grid.getymin();
                    let ymax = this.grid.getymax();
                    let xmin = this.grid.getxmin();
                    let xmax = this.grid.getxmax();
                    ctx.fillStyle = color;
                    ctx.fillText(Math.floor(xmax), this.grid.X(this.grid.getxmax()) - 50, this.grid.Y(ymax) + 5);
                    ctx.stroke();
                }
            }

            drawLine = (xi, yi, xf, yf, color, lineSize, lineCap) => {
                if (this.canvas) {

                    var ctx = this.canvas.getCTX();

                    ctx.shadowBlur = 0;

                    if (color != null) {
                        ctx.strokeStyle = color;
                    }
                    if (lineSize == null) {
                        lineSize = 2;
                    }
                    if (lineCap == null) {
                        ctx.lineCap = lineCap;
                    }
                    else {
                        ctx.lineCap = 'butt';
                    }
                    ctx.beginPath();
                    ctx.moveTo(this.grid.X(xi), this.grid.Y(yi));
                    ctx.lineTo(this.grid.X(xf), this.grid.Y(yf));
                    ctx.lineWidth = lineSize;
                    ctx.stroke();
                }
            }

            drawBar = (xi, yi, value, color) => {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    if (color != null) {
                        ctx.strokeStyle = color;
                    }

                    ctx.rect(this.grid.X(xi), this.grid.Y(yi), 20, this.grid.screenHeight(value));
                    ctx.fill()
                }
            }
            drawVerticalLine = (x, y, vlength, color, lineWidth) => {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    if (color != null) {
                        ctx.strokeStyle = color;
                    } else {
                        ctx.strokeStyle = 'orange'
                    }
                    if (!lineWidth) {
                        lineWidth = 2;
                    }
                    ctx.lineWidth = lineWidth;

                    ctx.beginPath();
                    ctx.moveTo(this.grid.X(x), this.grid.Y(y - vlength / 2));
                    ctx.lineTo(this.grid.X(x), this.grid.Y(y + (vlength / 2)));
                    ctx.stroke();
                }
            }

            drawZigZag = (xi, yi, xf, yf, color, lineWidth) => {
                if (this.canvas) {

                    if (!lineWidth) {
                        lineWidth = 2
                    }
                    let split = Math.abs(xf - xi) / 3;

                    var ctx = this.canvas.getCTX();
                    if (color != null) {
                        ctx.strokeStyle = color;
                    } else {
                        ctx.strokeStyle = 'orange'

                    }
                    ctx.lineWidth = lineWidth;
                    ctx.beginPath();
                    let count = 0;
                    for (let index = xi; index < xf; index += split) {
                        if (count == 0) {
                            ctx.moveTo(this.grid.X(index), this.grid.Y(yi));
                            ctx.lineTo(this.grid.X(index + split), this.grid.Y(yi + 0.1));
                        }
                        else if ((count % 2) === 0) {
                            ctx.moveTo(this.grid.X(index), this.grid.Y(yi - 0.1));
                            if ((index + split) >= xf) {
                                ctx.lineTo(this.grid.X(index + split), this.grid.Y(yi));
                            } else {
                                ctx.lineTo(this.grid.X(index + split), this.grid.Y(yi + 0.1));
                            }
                            ctx.lineWidth = lineWidth;
                            ctx.stroke();
                        } else {
                            ctx.moveTo(this.grid.X(index), this.grid.Y(yi + 0.1));
                            if ((index + split) >= xf) {
                                ctx.lineTo(this.grid.X(index + split), this.grid.Y(yi));
                            } else {
                                ctx.lineTo(this.grid.X(index + split), this.grid.Y(yi - 0.1));
                            }
                            ctx.lineWidth = lineWidth;
                            ctx.stroke();
                        }

                        count++;
                    }
                }
            }

            X = (sc) => {
                return this.grid.X(sc)
            }
            Y = (sc) => {
                return this.grid.Y(sc)
            }
            Xwc = (sc) => {
                return this.grid.Xwc(sc)
            }
            Ywc = (sc) => {
                return this.grid.Ywc(sc)
            }

            zoom = (min, max) => {
                this.grid.setxmin(min);
                this.grid.setxmax(max);
                this.grid.rescale();
            }

            drawBackdrop = () => {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    if (ctx) {
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'black';

                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                    }
                }
            }

            setSize = async (w, h) => {
                if (this.canvas) {
                    await this.canvas.setSize(w, h);
                    await this.grid.setSize(w, h);
                    await this.grid.rescale();
                }
            }
            getxmin = () => {
                return this.grid.getxmin();
            }
            getxmax = () => {
                return this.grid.getxmax();
            }
            getymin = () => {
                return this.grid.getymin();
            }
            getymax = () => {
                return this.grid.getymax();
            }

            setxmin = (xmin) => {
                this.grid.setxmin(xmin);
                this.grid.rescale();
            }
            setxmax = (xmax) => {
                this.grid.setxmax(xmax);
                this.grid.rescale();
            }
            setymin = (ymin) => {
                this.grid.setymin(ymin);
                this.grid.rescale();
            }
            setymax = (ymax) => {
                this.grid.setymax(ymax);
                this.grid.rescale();
            }
            plot = (xf, xy) => {
                if (this.canvas) {
                    this.drawEllipse(this.grid.X(xf), this.grid.Y(xy));
                }
            }

            line = (xs, ys, xf, yf) => {
                if (this.canvas) {
                    this.drawEllipse(this.grid.X(xf), this.grid.Y(xy));
                }
            }

        }
        resolve(Plate)
    })
}
