function () {
    return new Promise(async (resolve, reject) => {

        let CurvedArrow = class CurvedArrow {
            name;
            fromX;
            fromY;
            x;
            y;
            toX;
            toY;
            w = 1;
            h = 1;
            color = 'gray';
            comment = '';
            type = 'CurvedArrow';
            hl = false;
            font = 'Arial';
            font_size = '12px';

            constructor(name, x, y) {
                this.x = x;
                this.y = y;
                this.hl = true;
            }

            drawArrowhead(locx, locy, angle, sizex, sizey) {
                var hx = sizex / 2;
                var hy = sizey / 2;

                ctx.translate((locx), (locy));
                ctx.rotate(angle);
                ctx.translate(-hx, -hy);

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, 1 * sizey);
                ctx.lineTo(1 * sizex, 1 * hy);
                ctx.closePath();
                ctx.fill();

                ctx.translate(hx, hy);
                ctx.rotate(-angle);
                ctx.translate(-locx, -locy);
            }

            createMenu() {
                let l = [];
                for (let c of this.citations) {

                    l.push({
                        label: c.title + '\n' + c.authors,
                        click: () => {

                            window.open(c.url, '_blank')

                        },
                        move: () => {
                        }
                    })

                }

                return new CitationMenu(l, this.x, this.y);

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
                    this.color = 'lightBlue';
                } else {
                    this.color = 'lightGray'
                }
                ctx.beginPath();
                ctx.fillStyle = this.color;
                ctx.moveTo(graph.X(this.fromX), graph.Y(this.fromY));
                ctx.quadraticCurveTo(graph.X(this.x), graph.Y(this.y), graph.X(this.toX), graph.Y(this.toY));
                ctx.stroke();

                if (scw > 10 && scw < 400) {
                    graph.drawOval(graph.X(this.x), graph.Y(this.y), graph.screenWidth(this.w), graph.screenHeight(this.h), this.color, 2);
                    if (this.comment) {
                        let xt = this.w * Math.cos(0.4) + this.x - this.w / 10
                        let yt = this.h / 2 * Math.sin(0.4) + this.y - this.h / 10
                        let string_wx = (xt + this.w / 2)
                        let string_hx = (yt + this.h / 2);
                        graph.drawDaignalLine(xt, yt, string_wx, string_hx, this.color, 3, 'butt');
                        graph.drawString(this.comment, string_wx, string_hx, 'darkBlue', this.font_size + ' ' + this.font);
                    }
                }
            }
        }
        resolve(CurvedArrow)
    })
}
