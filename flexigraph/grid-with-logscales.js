function () {

    let MGrid = class MGrid {

        xi = 0;
        yi = 0;

        width;
        height;

        xinset = 25;
        yinset = 25;

        xscale = 1;

        yscale = 1;

        xshift = 0;
        yshift = 0;

        xmin = 0;
        ymin = 0;
        xmax = 1;
        ymax = 1;

        xLogScale = false
        yLogScale = false;
        xLogBase = 10;
        yLogBase = 10;

        constructor(_xi, _yi, _width, _height) {
            this.width = _width;
            this.height = _height;
            this.xi = _xi;
            this.yi = _yi;
        }

        getSize() {
            return new Dimension(this.width, this.height);
        }

        setBounds(x, y, w, h) {
            this.width = w;
            this.height = h;
            this.xi = x;
            this.yi = y;
            this.rescale();
        }

        setXLogScale(isLogScale, base = 10) {
            this.xLogScale = isLogScale;
            this.xLogBase = base;
            this.rescale();
        }

        setYLogScale(isLogScale, base = 10) {
            this.yLogScale = isLogScale;
            this.yLogBase = base;
            this.rescale();
        }

        rescale() {
            let xlength = this.xmax - this.xmin;
            let ylength = this.ymax - this.ymin;
            this.__rescale(xlength, ylength);
        }

        __rescale(xAxisLength, yAxisLength) {

            if (this.xmin === 0) {
                this.xmin = 1e-10;
            }
            if (this.ymin === 0) {
                this.ymin = 1e-10;
            }

            if (this.xLogScale) {
                xAxisLength = Math.log(this.xmax) / Math.log(this.xLogBase) - Math.log(this.xmin) / Math.log(this.xLogBase);

            }
            if (this.yLogScale) {
                yAxisLength = Math.log(this.ymax) / Math.log(this.yLogBase) - Math.log(this.ymin) / Math.log(this.yLogBase);

            }

            this.yscale = (this.height - (2 * this.yinset)) / yAxisLength;

            this.xscale = (this.width - (2 * this.xinset)) / xAxisLength;

            this.xshift = -this.xmin;
            this.yshift = -this.ymin;

            if (this.xLogScale) {
                this.xshift = -(Math.log(this.xmin) / Math.log(this.xLogBase));
            }
            if (this.yLogScale) {
                this.yshift = -(Math.log(this.ymin) / Math.log(this.yLogBase));
            }
        }

        static fromGrid(mgrid) {
            const lgrid = new MGrid(mgrid.xi, mgrid.yi, mgrid.width, mgrid.height);

            lgrid.xinset = mgrid.xinset;
            lgrid.yinset = mgrid.yinset;
            lgrid.width = mgrid.width;
            lgrid.height = mgrid.height;
            lgrid.xmin = mgrid.xmin;
            lgrid.ymin = mgrid.ymin;
            lgrid.xmax = mgrid.xmax;
            lgrid.ymax = mgrid.ymax;
            lgrid.animating = mgrid.animating || false;

            lgrid.rescale();
            return lgrid;
        }
        toJSON() {
            return {
                xi: this.xi,
                yi: this.yi,
                width: this.width,
                height: this.height,
                xinset: this.xinset,
                yinset: this.yinset,
                xscale: this.xscale,
                yscale: this.yscale,
                xshift: this.xshift,
                yshift: this.yshift,
                xmin: this.xmin,
                ymin: this.ymin,
                xmax: this.xmax,
                ymax: this.ymax,
                yLength: this.yLength,
                animating: this.animating,
                incr: this.incr,
                xLogBase: this.xLogBase,
                yLogBase: this.yLogBase

            };
        }

        clone() {
            const newGrid = new MGrid(this.xi, this.yi, this.width, this.height);
            newGrid.xi = this.xi;
            newGrid.yi = this.yi;
            newGrid.xinset = this.xinset;
            newGrid.yinset = this.yinset;
            newGrid.xscale = this.xscale;
            newGrid.yscale = this.yscale;
            newGrid.xshift = this.xshift;
            newGrid.yshift = this.yshift;
            newGrid.xmin = this.xmin;
            newGrid.ymin = this.ymin;
            newGrid.xmax = this.xmax;
            newGrid.ymax = this.ymax;
            newGrid.yLength = this.yLength;
            newGrid.animating = this.animating;
            newGrid.incr = this.incr;
            return newGrid;
        }

        screenWidth(worldWidth) {
            if (this.xLogScale) {

                let logMin = Math.log(this.xmin) / Math.log(this.xLogBase);
                let logWorldWidth = Math.log(worldWidth + this.xmin) / Math.log(this.xLogBase) - logMin;
                return logWorldWidth * this.xscale;
            } else {

                return worldWidth * this.xscale;
            }
        }

        screenHeight(worldHeight) {
            if (this.yLogScale) {

                let logMin = Math.log(this.ymin) / Math.log(this.yLogBase);
                let logWorldHeight = Math.log(worldHeight + this.ymin) / Math.log(this.yLogBase) - logMin;
                return logWorldHeight * this.yscale;
            } else {

                return worldHeight * this.yscale;
            }
        }

        X(xwc) {
            xwc = parseFloat(xwc);
            let xsc;
            if (this.xLogScale) {
                xsc = (((Math.log(xwc)-Math.log(this.xshift)) / Math.log(this.xLogBase)) * this.xscale) + (this.xi + this.width - 2 * this.xinset);
            } else {
                xsc = (((xwc + this.xshift)) * this.xscale + this.xinset) + this.xi;
            }

            return xsc;
        }

        Y(ywc) {
            let ysc;
            if (this.yLogScale) {

                if (ywc <= 0) {
                    ywc = 1e-10;
                }

                ysc = this.yi + this.height - (Math.log(ywc) / Math.log(this.yLogBase) - Math.log(this.ymin) / Math.log(this.yLogBase)) * this.yscale;
            } else {
                ysc = this.yi + this.height - (ywc - this.ymin) * this.yscale;
            }

            return ysc;
        }

        Xwc(xsc) {
            let xwc;

            if (this.xLogScale) {

                xwc = Math.pow(this.xLogBase, ((xsc - this.xinset + this.xi) / this.xscale)) - this.xshift;
            } else {
                xwc = (((xsc - this.xinset + this.xi) / this.xscale)) - this.xshift;
            }
            return xwc;
        }

        Ywc(ysc) {
            let ywc;
            if (this.yLogScale) {

                ywc = Math.pow(this.yLogBase, (Math.log(this.ymin) / Math.log(this.yLogBase) + (this.yi + this.height - ysc) / this.yscale)) - this.yshift;
            } else {
                ywc = this.ymin + (this.yi + this.height - ysc) / this.yscale;
            }
            return ywc;
        }

        setxmin(_xmin) {
            this.xmin = _xmin;
        }

        setymin(_ymin) {
            this.ymin = _ymin;
        }

        setxmax(_xmax) {
            this.xmax = _xmax;
        }

        setymax(_ymax) {
            this.ymax = _ymax;
        }

        zoom = (xmin, xmax, ymin, ymax) => {
            this.setxmin(xmin);
            this.setxmax(xmax);
            this.setymin(ymin);
            this.setymax(ymax);
            this.rescale();
        }

        animating = false;
        incr = 100;

        animateTo(grid, zoomFactor) {
            let xCenter = (grid.xmin + grid.xmax) / 2;
            let xRange = (grid.xmax - grid.xmin) / zoomFactor;
            grid.xmin = xCenter - xRange / 2;
            grid.xmax = xCenter + xRange / 2;

            let yCenter = (grid.ymin + grid.ymax) / 2;
            let yRange = (grid.ymax - grid.ymin) / zoomFactor;
            grid.ymin = yCenter - yRange / 2;
            grid.ymax = yCenter + yRange / 2;
        }

        animating = false;
        incr = 100;

        animateTo(grid, zoomFactor) {
            let xCenter = (grid.xmin + grid.xmax) / 2;
            let xRange = (grid.xmax - grid.xmin) / zoomFactor;
            grid.xmin = xCenter - xRange / 2;
            grid.xmax = xCenter + xRange / 2;

            let yCenter = (grid.ymin + grid.ymax) / 2;
            let yRange = (grid.ymax - grid.ymin) / zoomFactor;
            grid.ymin = yCenter - yRange / 2;
            grid.ymax = yCenter + yRange / 2;
        }

        async animateTo__(xmin, xmax, ymin, ymax, incr) {
            if (this.animating) {
                return;
            }
            this.animating = true;

            if (incr == null) {
                incr = 150;
            }

            return new Promise(async (resolve, reject) => {
                if (Math.abs(ymax - ymin) < 1) {
                    ymin = this.getymin();
                    ymax = this.getymax();
                }

                if (ymax < ymin) {
                    [ymin, ymax] = [ymax, ymin];
                }

                let xw = xmax - xmin;
                let yw = ymax - ymin;
                let currentAspectRatio = xw / yw;
                const targetAspectRatioMin = 10;
                const targetAspectRatioMax = 5000;

                if (currentAspectRatio < targetAspectRatioMin) {
                    let new_xw = yw * targetAspectRatioMin;
                    xmin = (xmax + xmin) / 2 - new_xw / 2;
                    xmax = xmin + new_xw;
                } else if (currentAspectRatio > targetAspectRatioMax) {
                    let new_yw = xw / targetAspectRatioMax;
                    ymin = (ymax + ymin) / 2 - new_yw / 2;
                    ymax = ymin + new_yw;
                }

                const translateMaxX = (this.getxmax() - xmax) / incr;
                const translateMinX = (this.getxmin() - xmin) / incr;
                const translateMaxY = (this.getymax() - ymax) / incr;
                const translateMinY = (this.getymin() - ymin) / incr;

                for (let i = 0; i < incr; i++) {
                    if (!this.animating) {
                        this.animating = false;
                        return resolve();
                    }

                    let Xmax = this.getxmax() - translateMaxX;
                    let Xmin = this.getxmin() - translateMinX;
                    let Ymax = this.getymax() - translateMaxY;
                    let Ymin = this.getymin() - translateMinY;

                    if (Xmax < Xmin || Ymax < Ymin) {
                        break;
                    }

                    this.setxmin(Xmin);
                    this.setxmax(Xmax);
                    this.setymin(Ymin);
                    this.setymax(Ymax);

                    this.rescale();
                    await sleep(10);
                }

                this.setxmin(xmin);
                this.setxmax(xmax);
                this.setymin(ymin);
                this.setymax(ymax);

                this.rescale();
                this.animating = false;

                return resolve();
            });
        }

        setxmin(_xmin) {
            this.xmin = _xmin;
        }

        setymin(_ymin) {
            this.ymin = _ymin;
        }

        setxmax(_xmax) {
            this.xmax = _xmax;
        }

        setymax(_ymax) {
            this.ymax = _ymax;
        }

        resizeWorld(_xmin, _ymin, _xmax, _ymax) {
            this.xmin = _xmin;
            this.ymin = _ymin;
            this.xmax = _xmax;
            this.ymax = _ymax;
        }

        setOrigin(_xmin, _ymin) {
            this.xmin = _xmin;
            this.ymin = _ymin;
        }

        setInset(_xinset, _yinset) {
            this.xinset = _xinset;
            this.yinset = _yinset;
        }

        setXInset(_xinset) {
            this.xinset = _xinset;
        }

        getXInset() {
            return this.xinset;
        }

        setYInset(_inset) {
            this.yinset = _inset;
        }

        getYInset() {
            return this.yinset;
        }

        getWidth() {
            return this.width;
        }

        getHeight() {
            return this.height;
        }

        getxmax() {
            return this.xmax;
        }

        getxmin() {
            return this.xmin;
        }

        getymin() {
            return this.ymin;
        }

        getymax() {
            return this.ymax;
        }

        setHeight(_height) {
            this.height = _height;
        }

        setWidth(_width) {
            this.width = _width;
        }

        getXi() {
            return this.xi;
        }

        getYi() {
            return this.yi;
        }

        setXi(_xi) {
            this.xi = _xi;
        }

        setYi(_yi) {
            this.yi = _yi;
        }

    }
    return MGrid;

}
