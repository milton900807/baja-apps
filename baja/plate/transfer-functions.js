function () {

    return new Promise(async (resolve, reject) => {

        let FunFactory = await exec('baja/plate/views/fun-factory')
        class TransferFunction {
            from = [];
            to = [];
            type = 'direct'
            x = 0;
            y = 0;
            w = 0.5;
            h = 0.4;
            fun;
            selected = false;
            visible = false;
            complete = false;
            screenWidth = 100;

            constructor(from, to, type) {
                this.from = from;
                this.to = to;
                this.type = type;
                this.adjustPosition();
            }
            adjustPosition() {
                if (this.to && this.from) {
                    this.x = this.to.grid.xi + this.to.grid.width / 2 + ((this.from.grid.xi + this.from.grid.width / 2) - (this.to.grid.xi + this.to.grid.width / 2)) / 2 - this.w / 2;

                    this.y = (this.to.grid.yi + this.to.grid.height) + (this.from.grid.yi - (this.to.grid.yi + this.to.grid.height)) / 2;
                }
            }
            addSource(source) {
                this.from.push(source);
            }
            addDestination(dest) {
                this.to.push(dest);
            }
            deselectIt() {
                this.selected = false;
            }
            setComplete ( complete )
            {
                this.complete = complete;
            }

            selectIt() {
                this.selected = true;
            }
            async exec() {
                if (this.fun) {
                    if (typeof this.fun === 'string' && this.fun.startsWith('(from, to)')) {
                        this.fun = eval(this.fun)
                    } else if (typeof this.fun === 'string' && this.fun.startsWith('All->Well address')) {
                        this.fun = await FunFactory.create(this.type);
                    }
                    this.fun(this.from, this.to);
                }
                else {
                    this.fun = await FunFactory.create(this.type);
                    if (this.fun) {
                        this.fun(this.from, this.to);
                    }
                    else {
                        console.log(" we do not have a function for this type : " + this.type)
                    }
                }
            }
            draw(grid, ctx) {
                let screenwidth = grid.screenWidth(1)
                this.adjustPosition();
                if (this.to && this.from) {
                    let x = grid.X(this.x);
                    let y = grid.Y(this.y);
                    let w = grid.screenWidth(this.w)
                    let h = grid.screenHeight(this.h) + 10;

                    ctx.lineWidth = 0;

                    if (this.selected) {
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = "red";

                        if (this.from.grid && this.to.grid) {
                            ctx.beginPath();
                            ctx.moveTo(grid.X(this.from.grid.xi + 0.5), grid.Y(this.from.grid.yi));
                            ctx.lineTo(grid.X(this.to.grid.xi + 0.5), grid.Y(this.to.grid.yi + 1));
                            ctx.stroke();
                        }

                        let tr = grid.screenWidth(1);
                        if (tr > 100) {

                            let mssg = '' + this.type
                            var width = ctx.measureText(mssg).width;
                            w = width + 15;
                            this.screenWidth = width + 15;

                            ctx.shadowBlur = 0;
                            ctx.shadowColor = 'white';
                            ctx.fillStyle = 'white';
                            ctx.strokeStyle = 'red';
                            ctx.lineWidth = 0;
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

                            ctx.fill();
                            ctx.restore();
                            ctx.fillStyle = 'black';
                            ctx.shadowBlur = 0;
                            ctx.font = "8pt Arial";
                            ctx.fillText(mssg, xm - width / 2 + 2, ym)
                        }
                    } else {

                        if (this.complete) {
                            ctx.lineWidth = 1
                            ctx.setLineDash([10, 3]);
                            ctx.strokeStyle = "lightBlue";

                        } else {
                            ctx.lineWidth = 1;
                            ctx.setLineDash([]);

                            ctx.strokeStyle = "orange";
                        }
                        if (this.from.grid && this.to.grid) {
                            ctx.beginPath();
                            ctx.moveTo(grid.X(this.from.grid.xi + 0.5), grid.Y(this.from.grid.yi));
                            ctx.lineTo(grid.X(this.to.grid.xi + 0.5), grid.Y(this.to.grid.yi + 1));
                            ctx.stroke();
                        }

                        let tr = grid.screenWidth(1);
                        if (tr > 100) {

                            let mssg = '' + this.type
                            var width = ctx.measureText(mssg).width;
                            w = width + 15;
                            this.screenWidth = width + 15;

                            ctx.shadowBlur = 0;
                            ctx.shadowColor = 'white';
                            ctx.fillStyle = 'white';
                            ctx.strokeStyle = 'lightGray';
                            ctx.lineWidth = 0;
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

                            ctx.fill();
                            ctx.restore();
                            ctx.fillStyle = 'black';
                            ctx.shadowBlur = 0;
                            ctx.font = "8pt Arial";
                            ctx.fillText(mssg, xm - width / 2 + 2, ym)
                        }
                    }

                }
            }
        }
        resolve(TransferFunction)
    })

}
