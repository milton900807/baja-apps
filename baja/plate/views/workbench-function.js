function () {

    return new Promise(async (resolve, reject) => {

        let FunFactory = await exec('baja/plate/views/fun-factory')
        class WorkbenchFunction {
            type = 'direct'
            x = 0;
            y = 0;
            w = 4;
            h = 2;
            fun;
            selected = false;
            highlight = false;
            param = {};
            complete = false;
            plot;

            constructor(type) {
                this.type = type;
            }
            setComplete(complete) {
                this.complete = complete;
            }
            deselectIt() {
                this.highlight = false;
            }
            setParam(p, value) {
                this.param[p] = value;
            }
            selectIt() {
                this.highlight = true;
            }

            attachPlot(plot) {
                this.plot = plot;
            }

            async exec(plate_track) {
                if (this.fun) {
                    if (typeof this.fun === 'string') {
                        this.fun = eval(this.fun)
                    }
                    let fs = this.fun.toString();
                    let start = fs.indexOf('(')
                    let end = fs.indexOf(')')
                    let argline = fs.substring(start + 1, end);
                    let args = argline.split(',')
                    let arglist = []
                    for (let a of args) {
                        a = a.trim();
                        let value = this.param[a]
                        arglist.push(value);
                    }
                    return this.fun(...arglist);
                }
                else {
                    this.fun = await FunFactory.create(this.type);
                    if (this.fun) {

                        let fs = this.fun.toString();
                        let start = fs.indexOf('(')
                        let end = fs.indexOf(')')
                        let argline = fs.substring(start + 1, end);
                        let args = argline.split(',')
                        let arglist = []
                        for (let a of args) {
                            a = a.trim();
                            let value = this.param[a]
                            arglist.push(value);
                        }
                        return this.fun(...arglist);
                    }
                    else {
                        console.log(" we do not have a function for this type : " + this.type)
                    }
                }
            }

            removePlots() {
                if (this.plot && this.plot.canvas)
                    this.plot.canvas.remove();
            }

            draw(grid, ctx) {
                let tr = grid.screenWidth(1);
                let x = grid.X(this.x);
                let y = grid.Y(this.y);

                let w = 10;
                let h = grid.screenHeight(0.7);

                if (this.plot && this.plot.getY) {
                    let scorx = (this.plot.getY()) - parseInt(ctx.canvas.offsetTop);
                    let scory = (this.plot.getY() + this.plot.getHeight() + 20)
                    if (tr < 200 ||
                        (this.plot.getX() + this.plot.getWidth()) > grid.width ||
                        ((scorx) < 0) ||
                        scory > parseInt(ctx.canvas.offsetTop + ctx.canvas.height)) {
                        this.plot.setVisible(false);
                    } else {
                        this.plot.setVisible(true);
                        this.plot.draw ( );
                    }
                }

                if (this.complete) {
                    ctx.setLineDash([5, 15]);
                    ctx.lineWidth = 5;
                    ctx.strokeStyle = "cyan";

                } else {
                    ctx.setLineDash([]);
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = "cyan";

                }
                ctx.font = "8pt Arial";

                for (let key of Object.keys(this.param)) {
                    let d = this.param[key]
                    if (typeof d === 'string') {

                    }
                    else if (Array.isArray(d)) {

                    }
                    else
                        if (d && d.getX() != null) {

                            if (tr > 200) {
                                let mssg = '(' + d.name + ')'
                                var width = ctx.measureText(mssg).width;
                                let lh = width + 1;
                                this.w = grid.worldWidth(width);
                                this.h = grid.worldWidth(lh);
                                let cx = x + (width / 2);
                                let cy = y + width / 2

                                ctx.beginPath();
                                ctx.moveTo(cx, cy);
                                ctx.lineTo(grid.X(d.getX()), grid.Y(d.getY()));
                                ctx.stroke();

                                let xd = (grid.X(d.getX()) + cx) / 2
                                let yd = (grid.Y(d.getY()) + cy) / 2

                                var kappa = .5522848,
                                    ox = (w / 2) * kappa,
                                    oy = (lh / 2) * kappa,
                                    xe = xd + w,
                                    ye = yd + lh,
                                    xm = xd + w / 2,
                                    ym = yd + lh / 2;

                                ctx.fillStyle = 'maroon';
                                ctx.shadowBlur = 0;
                                ctx.fillText(mssg, xm - width / 2 + 2, ym)

                                if (this.plot && this.plot.setX) {
                                    this.plot.setX(grid.X(this.x) + w)
                                    this.plot.setY(grid.Y(this.y))
                                }

                            }

                        }

                }

                if (this.complete) {
                    ctx.setLineDash([5, 15]);
                } else {
                    ctx.setLineDash([]);
                }
                if (this.highlight) {

                    let mssg = '' + this.type
                    var width = ctx.measureText(mssg).width;
                    w = width + 10;
                    h = width + 10;

                    var kappa = .5522848,
                        ox = (w / 2) * kappa,
                        oy = (h / 2) * kappa,
                        xe = x + w,
                        ye = y + h,
                        xm = x + w / 2,
                        ym = y + h / 2;

                    this.w = grid.worldWidth(width);
                    this.h = grid.worldWidth(h);

                    if (tr > 100) {

                        ctx.lineWidth = 1;
                        ctx.strokeStyle = "white";
                        ctx.shadowBlur = 16;
                        ctx.shadowColor = 'lightBlue';
                        ctx.fillStyle = 'cyan';
                        ctx.strokeStyle = 'lightGray';

                        ctx.beginPath();
                        ctx.moveTo(x, ym);
                        ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                        ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                        ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                        ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                        ctx.fill();

                        ctx.fillStyle = 'navy';
                        ctx.shadowBlur = 0;
                        ctx.font = "8pt Arial";
                        ctx.fillText(mssg, xm - width / 2 + 2, ym)
                        ym += 13
                        for (let key of Object.keys(this.param)) {
                            let d = this.param[key]
                            if (typeof d === 'string') {
                                ctx.fillText('[' + d + ']', xm - width / 2 + 2, ym)
                                ym += 13
                            }

                        }
                    }

                } else {

                    let mssg = '' + this.type
                    var width = ctx.measureText(mssg).width;
                    w = width + 1;
                    h = width + 1;

                    var kappa = .5522848,
                        ox = (w / 2) * kappa,
                        oy = (h / 2) * kappa,
                        xe = x + w,
                        ye = y + h,
                        xm = x + w / 2,
                        ym = y + h / 2;

                    this.w = grid.worldWidth(width);
                    this.h = grid.worldWidth(h);

                    if (tr > 200) {

                        ctx.lineWidth = 1;
                        ctx.strokeStyle = "white";
                        ctx.shadowBlur = 6;
                        ctx.shadowColor = 'darkGray';
                        ctx.fillStyle = 'white';
                        ctx.strokeStyle = 'lightGray';

                        ctx.beginPath();
                        ctx.moveTo(x, ym);
                        ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                        ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                        ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                        ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                        ctx.fill();

                        ctx.fillStyle = 'navy';
                        ctx.shadowBlur = 0;
                        ctx.font = "8pt Arial";
                        ctx.fillText(mssg, xm - width / 2 + 2, ym)
                        ym += 13
                        for (let key of Object.keys(this.param)) {
                            let d = this.param[key]
                            if (typeof d === 'string') {
                                ctx.fillText('[' + d + ']', xm - width / 2 + 2, ym)
                                ym += 13
                            }
                            else if (Array.isArray(d)) {

                                ctx.fillText('[' + d + ']', xm - width / 2 + 2, ym)
                                ym += 13
                            }

                        }

                    } else {

                    }

                }

            }
        }
        resolve(WorkbenchFunction)
    })
}
