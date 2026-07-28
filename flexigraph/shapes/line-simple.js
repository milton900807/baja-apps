function () {
    return new Promise(async (resolve, reject) => {

        let Line = class Line {
            name;
            x;
            y;
            xf;
            yf;
            color = 'black';
            type = 'line';
            w;
            h;
            comment = '';
            hl = false;
            arrowDirect = 'start'
            linewidth = 2;
            displayThreshold = 25;

            constructor(name, x, y) {
                this.x = x;
                this.y = y;
            }
            setColor(color) {
                this.color = color;
            }
            move(x, y) {
                if (!x || !y) {
                    return;
                }
                this.x = x;
                this.y = y;
            }
            isIn(x, y) {

                if (x >= this.x && x < (this.x + this.w) &&
                    y < this.y && y > this.y + this.h) {
                    this.hl = true;
                    return true;
                }
                this.hl = false;
                return false;
            }
            highlight(v) {
                this.hl = v;
            }

            angle(cx, cy, ex, ey) {
                var dy = cy - ey;
                var dx = cx - ex;
                var theta = Math.atan2(dy, dx);

                return theta;
            }
            angle360(cx, cy, ex, ey) {
                var theta = this.angle(cx, cy, ex, ey);
                if (theta < 0) theta = 360 + theta;
                return theta;
            }

            update(x, y) {
                this.xf = x;
                this.yf = y;
                this.w = this.xf - this.x;
                this.h = this.yf - this.y;
            }

            invertX() {
                this.arrowDirect = 'end'
                let tx = this.x;
                this.x = this.xf;
                this.xf = tx;
                this.w = this.xf - this.x;
                this.invertY();

            }
            invertY() {
                let ty = this.y;
                this.y = this.yf;
                this.yf = ty;
                this.h = this.yf - this.y;

            }

            async draw(graph) {

                let screenHeight = graph.screenHeight(this.h);
                let screenWidth = graph.screenWidth(this.w);
                if (screenHeight < this.displayThreshold && screenWidth < this.displayThreshold) {
                    return;
                }

                let xi = graph.X(this.x);
                let yi = graph.Y(this.y);
                let xf = graph.X(this.xf);
                let yf = graph.Y(this.yf);

                if (yf && yi && xi && xf) {
                    if (this.hl)
                        graph.drawLine(this.x, this.y, this.xf, this.yf, 'red', this.linewidth);
                    else
                        graph.drawLine(this.x, this.y, this.xf, this.yf, 'red', this.linewidth);

                }
            }

        }
        resolve(Line)
    })
}
