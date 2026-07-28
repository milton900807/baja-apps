function () {
    return new Promise(async (resolve, reject) => {

        let Citation = class Citation {
            name;
            x;
            y;
            w = 1;
            h = 1;
            color = 'gray';
            comment = '';
            type = 'Citation';
            hl = false;
            url = [];

            constructor(name, x, y) {
                this.x = x;
                this.y = y;
            }
            addURL ( url )
            {
                this.url.push ( url );
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
                    y < this.y && y > this.y - this.h) {
                    this.hl = true;
                    return true;
                }
                this.hl = false;
                return false;
            }
            highlight(v) {
                this.hl = v;
            }

            update(x, y) {
                this.w = x - this.x;
                this.h = this.y - y;
            }
            async draw(graph) {
                let scw = graph.screenWidth(this.w);
                if (this.hl) {
                    this.color = 'red';
                } else {
                    this.color = 'gray'
                }
                if (scw > 10 && scw < 400) {
                    graph.drawOval(graph.X(this.x), graph.Y(this.y), graph.screenWidth(this.w), graph.screenHeight(this.h), this.color, 2);
                    if (this.hl && this.comment) {
                        let xt = this.w * Math.cos(0.4) + this.x - this.w / 10
                        let yt = this.h / 2 * Math.sin(0.4) + this.y - this.h / 10
                        let string_wx = (xt + this.w / 2)
                        let string_hx = (yt + this.h / 2);
                        graph.drawDaignalLine(xt, yt, string_wx, string_hx, this.color, 3, 'butt');
                        if (this.url) {
                            graph.drawurl(this.comment, this.url, string_wx, string_hx, 'darkBlue')
                        } else {
                            graph.drawString(this.comment, string_wx, string_hx, 'darkBlue');

                        }
                    }
                }
            }
        }
        resolve(Oval)
    })
}
