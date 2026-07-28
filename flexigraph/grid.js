function () {

    class MGrid {

        static GP = null;

        xi = 0;
        yi = 0;

        width;

        height;

        xinset = 25;
        yinset = 25;

        yLength;

        xscale = 1;

        yscale = 1;

        xshift = 0;

        yshift = 0;

        xmin = 0;

        ymin = 0;

        xmax = 1;

        ymax = 1;

        constructor(_xi, _yi, _width, _height) {
            this.width = _width;
            this.height = _height;
            this.xi = _xi;
            this.yi = _yi;
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
            lgrid.incr = mgrid.incr || 100;
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
                incr: this.incr
            };
        }

        clone() {
            const newGrid = new MGrid(this.xi, this.yi, this.width, this.height);

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

        getSize() {
            return new Dimension(this.width, this.height);
        }

        point() {
            return new Point(this.xi, this.yi);
        }

        setDimension(_width, _height) {
            this.width = _width;
            this.height = _height;
        }
        setSize(_width, _height) {
            this.width = _width;
            this.height = _height;
        }

        setAspectRatioIteratively(aspectRatio, maxIterations) {

            let worldWidth = this.xmax - this.xmin;
            let worldHeight = this.ymax - this.ymin;

            let currentAspectRatio = worldWidth / worldHeight;

            let iteration = 0;

            const adjustWorldDimensions = () => {
                if (iteration >= maxIterations) {
                    return;
                }

                worldWidth = this.xmax - this.xmin;
                worldHeight = this.ymax - this.ymin;
                currentAspectRatio = worldWidth / worldHeight;

                if (currentAspectRatio > aspectRatio) {

                    let targetWidth = worldHeight * aspectRatio;
                    let widthChange = (worldWidth - targetWidth) / (maxIterations - iteration);
                    let centerX = (this.xmax + this.xmin) / 2;
                    this.xmin = centerX - (worldWidth - widthChange) / 2;
                    this.xmax = centerX + (worldWidth - widthChange) / 2;
                } else {

                    let targetHeight = worldWidth / aspectRatio;
                    let heightChange = (worldHeight - targetHeight) / (maxIterations - iteration);
                    let centerY = (this.ymax + this.ymin) / 2;
                    this.ymin = centerY - (worldHeight - heightChange) / 2;
                    this.ymax = centerY + (worldHeight - heightChange) / 2;
                }

                this.rescale();

                iteration++;
                sleep(1000)
                requestAnimationFrame(adjustWorldDimensions);
            };
            adjustWorldDimensions();
        }

        pinchX(maxIterations, pinchPercentage) {
            let iteration = 0;

            let initialWorldWidth = this.xmax - this.xmin;
            let targetWorldWidth = initialWorldWidth * (1 - pinchPercentage / 100);

            let widthStep = (initialWorldWidth - targetWorldWidth) / maxIterations;

            const adjustXDimensions = () => {
                if (iteration >= maxIterations) {
                    return;
                }

                let currentWorldWidth = this.xmax - this.xmin;
                let newWorldWidth = currentWorldWidth - widthStep;

                let centerX = (this.xmax + this.xmin) / 2;
                this.xmin = centerX - newWorldWidth / 2;
                this.xmax = centerX + newWorldWidth / 2;

                this.rescale();

                iteration++;
                requestAnimationFrame(adjustXDimensions);
            };

            adjustXDimensions();
        }

        pinchY(maxIterations, pinchPercentage) {
            let iteration = 0;

            let initialWorldHeight = this.ymax - this.ymin;
            let targetWorldHeight = initialWorldHeight * (1 - pinchPercentage / 100);

            let heightStep = (initialWorldHeight - targetWorldHeight) / maxIterations;

            const adjustYDimensions = () => {
                if (iteration >= maxIterations) {
                    return;
                }

                let currentWorldHeight = this.ymax - this.ymin;
                let newWorldHeight = currentWorldHeight - heightStep;
                if ( newWorldHeight < 0.101 ){
                    newWorldHeight=1;
                }

                let centerY = (this.ymax + this.ymin) / 2;
                this.ymin = centerY - newWorldHeight / 2;
                this.ymax = centerY + newWorldHeight / 2;

                this.rescale();

                iteration++;
                requestAnimationFrame(adjustYDimensions);
            };

            adjustYDimensions();
        }

        decreaseAspectratio(percentage, maxIterations) {

            let worldWidth = this.xmax - this.xmin;
            let worldHeight = this.ymax - this.ymin;

            let currentAspectRatio = worldWidth / worldHeight;

            let targetAspectRatio = currentAspectRatio * (1 - percentage / 100);

            let iteration = 0;

            const adjustWorldDimensions = () => {
                if (iteration >= maxIterations) {
                    return;
                }

                worldWidth = this.xmax - this.xmin;
                worldHeight = this.ymax - this.ymin;
                currentAspectRatio = worldWidth / worldHeight;

                if (currentAspectRatio > targetAspectRatio) {

                    let targetWidth = worldHeight * targetAspectRatio;
                    let widthChange = (worldWidth - targetWidth) / (maxIterations - iteration);
                    let centerX = (this.xmax + this.xmin) / 2;
                    this.xmin = centerX - (worldWidth - widthChange) / 2;
                    this.xmax = centerX + (worldWidth - widthChange) / 2;
                } else {

                    let targetHeight = worldWidth / targetAspectRatio;
                    let heightChange = (worldHeight - targetHeight) / (maxIterations - iteration);
                    let centerY = (this.ymax + this.ymin) / 2;
                    this.ymin = centerY - (worldHeight - heightChange) / 2;
                    this.ymax = centerY + (worldHeight - heightChange) / 2;
                }

                this.rescale();

                iteration++;
                requestAnimationFrame(adjustWorldDimensions);
            };

            adjustWorldDimensions();
        }

        setAspectRatio(aspectRatio) {

            let worldWidth = this.xmax - this.xmin;
            let worldHeight = this.ymax - this.ymin;

            let currentAspectRatio = worldWidth / worldHeight;

            if (currentAspectRatio > aspectRatio) {

                let newWorldWidth = worldHeight * aspectRatio;
                let centerX = (this.xmax + this.xmin) / 2;
                this.xmin = centerX - newWorldWidth / 2;
                this.xmax = centerX + newWorldWidth / 2;
            } else {

                let newWorldHeight = worldWidth / aspectRatio;
                let centerY = (this.ymax + this.ymin) / 2;
                this.ymin = centerY - newWorldHeight / 2;
                this.ymax = centerY + newWorldHeight / 2;
            }

            this.rescale();
        }

        setBounds(x, y, w, h) {
            this.width = w;
            this.height = h;
            this.xi = x;
            this.yi = y;
            this.rescale();
        }

        Xwc(xsc) {

            if (this.xscale == 0) {
                this.xscale = 0.0001;
            }
            let xwc = (((xsc - this.xinset + this.xi) / this.xscale)) - this.xshift;
            return xwc;
        }

        Ywc(ysc) {

            if (this.yscale == 0) {
                this.yscale = 0.0001;
            }
            let ywc = (this.yLength - ((ysc - this.yinset + this.yi) / this.yscale)) - this.yshift;
            return ywc;
        }

        X(xwc) {
            xwc = parseFloat(xwc);
            let xLength = this.xmax - this.xmin;
            let xsc = (((xwc + this.xshift)) * this.xscale + this.xinset) + this.xi;
            if (!xsc || xsc == NaN) {
                let t = (((xwc + this.xshift)))

                t = t * this.xscale + this.xinset;

            }

            return xsc;
        }

        Y(ywc) {
            let ysc = ((this.yLength - (ywc + this.yshift)) * this.yscale + this.yinset) + this.yi;

            return (ysc);
        }
         getWorldCenter() {
            const xCenter = (this.getxmin() + this.getxmax()) / 2;
            const yCenter = (this.getymin() + this.getymax()) / 2;
            return { x: xCenter, y: yCenter };
        }

        worldHeight(screenHeight) {
            return (1 / this.yscale) * screenHeight;
        }

        worldWidth(screenWidth) {
            return (1 / this.xscale) * screenWidth;
        }

        screenHeight(worldHeight) {
            return (this.yscale) * worldHeight;
        }

        screenWidth(worldWidth) {
            return (this.xscale) * worldWidth;
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
        async animateTo__(xmin, xmax, ymin, ymax, incr) {
            if (this.animating) {
                return;
            }
            this.animating = true;

            console.log(xmin + ' ' + xmax)
            console.log(ymin + ' ' + ymax)

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

        rescale() {

            let xlength = this.xmax - this.xmin;
            let ylength = this.ymax - this.ymin;

            this.__rescale(xlength, ylength);
        }

        __rescale(xAxisLength, yAxisLength) {
            this.yLength = yAxisLength;
            this.yscale = (this.height - (2 * this.yinset)) / (yAxisLength);
            this.xscale = (this.width - (2 * this.xinset)) / (xAxisLength);
            this.xshift = -this.xmin;
            this.yshift = -this.ymin;

        }

        rescaleY(ymin, ymax) {
            this.ymin = ymin;
            this.ymax = ymax;
            this.yLength = ymax - ymin;
            this.yscale = (this.height - (2 * this.yinset)) / (this.yLength);
            this.yshift = -this.ymin;
            return this.yscale;
        }

        rescaleX(xAxisLength) {
            this.xscale = (this.width - (2 * this.xinset)) / (xAxisLength);
            this.xshift = -this.xmin;
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

        resizeWorld(_xmin, _ymin, _xmax,
            _ymax) {
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
            return xi;
        }

        getYi() {
            return yi;
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
