function () {
    return new Promise(async (resolve, reject) => {

        let DashedRectangle = class DashedRectangle {
            name;
            x;
            y;
            w = 1;
            h = 1;
            type = 'rect';
            color = 'black';
            comment = '';
            type = 'Rectangle';
            font = "Arial";
            font_size = '20px';
            showRect = true;
            hl = false;

            constructor(name, x, y) {
                this.x = x;
                this.y = y;
            }
            setColor(color) {
                this.color = color;
            }
            highlight(v) {
                this.hl = v;
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
            update(x, y) {
                this.w = x - this.x;
                this.h = this.y - y;
            }
            async draw(graph) {
                let screen_height = graph.screenHeight(this.h);
                let screen_width = graph.screenWidth(this.w);
                if ( screen_height < 10 || screen_width < 10 ){
                    return;
                }
                graph.thinDashedRect(graph.X(this.x), graph.Y(this.y), graph.screenWidth(this.w), graph.screenHeight(this.h), 'red');
                if (this.hl)
                    graph.thinDashedRect(graph.X(this.x), graph.Y(this.y), graph.screenWidth(this.w), graph.screenHeight(this.h), 'lightRed');
                if (this.comment) {
                    let xt = this.w * Math.cos(0.4) + this.x - this.w / 5
                    let yt = this.h / 2 * Math.sin(0.4) + this.y - this.h / 5
                    let string_wx = (xt + this.w / 2)
                    let string_hx = (yt + this.h / 2);
                    graph.drawDaignalLine(xt, yt, string_wx, string_hx, 'gray', 1, 'butt');
                    graph.drawString(this.comment, string_wx, string_hx, 'blue');
                }

            }
        }
        resolve(DashedRectangle)
    })
}
