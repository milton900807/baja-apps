function () {

    let order = {
        'oligos': [

        ]
    }

    exec('flexigraph/grid.js').then(async (MGrid) => {
        let Plate = await exec('baja/plate/plate.js')
        let Oligo = await exec('flexigraph/oligo.js')

        let selected_node = null;
        let mode = 'add'

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
            draw(graph, grid, ctx, min, max, x, y) {
                if (!ctx) {
                    return;
                }
                if (this.score) {
                    let color = perc2color(this.score, min, max)
                    ctx.fillStyle = color;
                    ctx.fillRect(graph.X(grid.X(x)), graph.Y(grid.Y(y + 1)), graph.screenWidth(grid.screenWidth(1)), graph.screenHeight(grid.screenHeight(1)));
                    ctx.stroke();
                }
                let temp = ctx.fillStyle;
                ctx.fillStyle = 'black';
                if (this.score)
                    ctx.fillText(this.score, graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) - 15);
                if (this.obj && this.obj.type)
                    ctx.fillText(this.obj.type, graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) - 15);
                ctx.fillText(this.name, graph.X(grid.X(x)), graph.Y(grid.Y(y)) + 10);
                ctx.stroke();
                ctx.fillStyle = temp;
            }
        }

        let PlateTrack = class PlateTrack {
            name;
            color = 'gray'
            levels = [[]]
            grid;
            ctx;
            constructor(name) {
                this.name = name;
                this.grid = new MGrid(0, 0, 100, 100);
                this.grid.setxmax(2);
                this.grid.setymax(2);
                this.grid.setxmin(0);
                this.grid.setymin(0);
                this.grid.setInset(0, 0)
                this.grid.rescale();
            }

            mouseDown(scx, scy) {
                let x = this.grid.Xwc(scx);
                let y = this.grid.Ywc(scy);
                for (let r = 0; r < this.levels.length; r++) {
                    let row = this.levels[r];
                    if (row) {
                        for (let c = 0; c < row.length; c++) {
                            let cell = row[c];
                            if (cell) {
                                cell.mouseDown(this.grid, x, y);
                                if (cell.inside(this.grid, x, y)) {
                                    cell.select(this.grid, x, y);
                                    return cell;
                                }
                            }
                        }
                    }
                }
            }
            mouseOver(scx, scy) {
                let x = this.grid.Xwc(scx);
                let y = this.grid.Ywc(scy);
                for (let r = 0; r < this.levels.length; r++) {
                    let row = this.levels[r];
                    if (row) {
                        for (let c = 0; c < row.length; c++) {
                            let cell = row[c];
                            if (cell) {
                                cell.mouseOver(this.grid, x, y);
                            }
                        }
                    }
                }
            }

            select(scx, scy) {
                this.grid.rescale();
                let x = this.grid.Xwc(scx);
                let y = this.grid.Ywc(scy);
                console.log('debubg');
                for (let r = 0; r < this.levels.length; r++) {
                    let row = this.levels[r];
                    if (row) {
                        for (let c = 0; c < row.length; c++) {
                            let cell = row[c];
                            if (cell) {
                                if (cell.inside(this.grid, x, y)) {
                                    cell.select(this.grid, x, y);
                                    return cell;
                                }
                            }
                        }
                    }
                }
            }

            draw(ctx) {
                this.ctx = ctx;
                this.grid.width = ctx.canvas.width;
                this.grid.height = ctx.canvas.height;
                this.grid.rescale();
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, this.grid.width, this.grid.height);
                ctx.stroke();
                let x = ((this.grid.getxmax() - this.grid.getxmin()) / 2) - 0.5;
                let y = this.grid.getymax();
                let increment = 1;
                for (let r = 0; r < this.levels.length; r++) {
                    let row = this.levels[r];
                    if (row) {
                        for (let c = 0; c < row.length; c++) {
                            let cell = row[c];
                            if (cell) {
                                let l = row.length;
                                let displacement = (this.grid.getxmax() - this.grid.getxmin()) / (increment * row.length);
                                let x = (c) * (displacement) + displacement / 2.0 - increment / 2;
                                cell.draw(this.grid, ctx)
                            }
                        }
                    }
                }
                for (let r = 0; r < this.levels.length; r++) {
                    let row = this.levels[r];
                    if (row) {
                        for (let c = 0; c < row.length; c++) {
                            let cell = row[c];
                            if (cell) {
                                cell.drawConnections(this.grid, ctx)
                            }
                        }
                    }
                }

            }

            drawLine = (ctx, xi, yi, xf, yf, color, lineSize, lineCap) => {
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
        let pt = new PlateTrack('test')

        let ctx;
        let innerComponentCallback = createIonFunction((innerComponent) => {
            let ivc = setInterval(() => {
                ctx = innerComponent.getCTX();
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
                        }
                        pt.draw(ctx);
                    }
                }
            }, 500)
        });

        let px = 0;
        let py = 0;

        let lineage_card = {
            wid: 'card',
            data: {
                'style.padding-left': '5px',
                'style.padding-top': '0px',
                cards: [
                    [
                        {
                            'width': '85%',
                            'height': '100%',
                            'body': `
                `                   , 'component':
                            {
                                wid: 'canvas',
                                refCallback: innerComponentCallback,
                                data: {

                                    'height': 500,
                                    'mouseListener': createIonFunction((scx, scy) => {
                                        if (mode == 'navigate') {
                                            if (px === 0) {
                                                px = pt.grid.Xwc(scx);
                                                py = pt.grid.Ywc(scy);
                                            } else if (mode === 'select') {

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

                                        px = pt.grid.Xwc(scx);
                                        py = pt.grid.Ywc(scy);

                                    }),
                                    'mouseDownListener': createIonFunction((scx, scy) => {
                                        px = pt.grid.Xwc(scx);
                                        py = pt.grid.Ywc(scy);
                                        if (mode === 'select') {
                                            selected_node = pt.select(scx, scy);
                                        }
                                        else {
                                            selected_node = pt.mouseDown(scx, scy);
                                        }
                                    }),
                                    'mouseUpListener': createIonFunction((scx, scy) => {
                                        if (mode === 'select') {
                                            if (selected_node) {
                                                second_selected_node = pt.select(scx, scy);
                                                selected_node.add(second_selected_node);
                                            }
                                        }
                                    }),
                                    'mouseMoveListener': createIonFunction((scx, scy) => {
                                        pt.mouseOver(scx, scy);
                                    })
                                }

                            }
                        },
                    ]]
            }
        }
        await showWidget(lineage_card)
        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 30,
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
                        x: 0, y: 0, label: 'zoom out', ionFunction: createIonFunction(() => {
                            mode = 'add'
                        }), icon: '/assets/img/icons/png/plus-3x.png'
                    },
                    {
                        x: 3, y: 0, label: 'zoom out', ionFunction: createIonFunction(() => {

                            mode = 'select'

                        }), icon: '/assets/img/icons/png/random-3x.png'

                    },
                    {
                        x: 6, y: 0, label: 'zoom out', ionFunction: createIonFunction(() => {
                            mode = 'navigate'
                            let l = (pt.grid.getymax() - pt.grid.getymin()) / 8;
                            pt.grid.setymax(pt.grid.getymax() + l);
                            pt.grid.setymin(pt.grid.getymin() + l);

                        }), icon: '/assets/img/icons/png/caret-top-3x.png'
                    },
                    {
                        x: 9, y: 0, label: 'zoom out', ionFunction: createIonFunction(() => {
                            mode = 'navigate'
                            let l = (pt.grid.getymax() - pt.grid.getymin()) / 8;
                            pt.grid.setymax(pt.grid.getymax() - l);
                            pt.grid.setymin(pt.grid.getymin() - l);
                        }), icon: '/assets/img/icons/png/caret-bottom-3x.png'
                    },
                    {
                        x: 12, y: 0, label: 'zoom out', ionFunction: createIonFunction(() => {

                            let lx = (pt.grid.getxmax() - pt.grid.getxmin()) / 10;
                            let ly = (pt.grid.getymax() - pt.grid.getymin()) / 10;
                            pt.grid.zoom(pt.grid.getxmin() - lx, pt.grid.getxmax() + lx,
                                pt.grid.getymin() - ly, pt.grid.getymax() + ly);
                        }), icon: '/assets/img/icons/png/zoom-out-3x.png'
                    },
                    {
                        x: 15, y: 0, label: 'zoom in', ionFunction: createIonFunction(() => {
                            pt.grid.setInset(0, 0)
                            pt.grid.rescale();
                            let lx = (pt.grid.getxmax() - pt.grid.getxmin()) / 10;
                            let ly = (pt.grid.getymax() - pt.grid.getymin()) / 10;
                            pt.grid.zoom(pt.grid.getxmin() + lx, pt.grid.getxmax() - lx, pt.grid.getymin() + ly, pt.grid.getymax() - ly);

                        }), icon: '/assets/img/icons/png/zoom-in-3x.png'
                    },
                    {
                        x: 18, y: 0, label: 'expand up', ionFunction: createIonFunction(() => {

                            let l = (pt.grid.getymax() - pt.grid.getymin()) / 8;
                            pt.grid.setymax(pt.grid.getymax() + l);

                        }), icon: '/assets/img/icons/png/expand-up-3x.png'
                    },
                    {
                        x: 21, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {

                            let l = (pt.grid.getymax() - pt.grid.getymin()) / 8;
                            pt.grid.setymax(pt.grid.getymax() - l);

                        }), icon: '/assets/img/icons/png/expand-down-3x.png'
                    }

                ]
            }
        }
        await showWidget(button_canvas)
        setTimeout(() => {
            pt.addRootPlate('');
        }, 1000)

    })

}
