class SphericalGrid {
    constructor(xi, yi, width, height) {
        this.xi = xi;
        this.yi = yi;
        this.width = width;
        this.height = height;
        this.xinset = 25;
        this.yinset = 25;
    }

    Xwc(xsc) {
        let normalizedX = (xsc - this.xinset - this.xi) / (this.width - 2 * this.xinset);
        let phi = normalizedX * 2 * Math.PI;
        return phi;
    }

    Ywc(ysc) {
        let normalizedY = 1 - ((ysc - this.yinset - this.yi) / (this.height - 2 * this.yinset));
        let theta = normalizedY * Math.PI;
        return theta;
    }

    X(phi) {
        let normalizedPhi = phi / (2 * Math.PI);
        let xsc = normalizedPhi * (this.width - 2 * this.xinset) + this.xinset + this.xi;
        return xsc;
    }

    Y(theta) {
        let normalizedTheta = theta / Math.PI;
        let ysc = (1 - normalizedTheta) * (this.height - 2 * this.yinset) + this.yinset + this.yi;
        return ysc;
    }

    setSize(width, height) {
        this.width = width;
        this.height = height;
    }

    setInset(xinset, yinset) {
        this.xinset = xinset;
        this.yinset = yinset;
    }

    getXi() {
        return this.xi;
    }

    getYi() {
        return this.yi;
    }

    getWidth() {
        return this.width;
    }

    getHeight() {
        return this.height;
    }
}

export default SphericalGrid;
