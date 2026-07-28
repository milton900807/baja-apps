function () {
    return new Promise(async (resolve, reject) => {
        let CitationMenu = class CitationMenu {
            name;
            x = 0;
            y = 0;
            color = 'black';
            list = []
            mx = -1;
            my = -1;
            highlight = -2;
            mheight = 40;
            width = 360;
            xoffset = 50;
            yoffset = 30;

            constructor(list, x, y) {
                this.x = x;
                this.y = y;
                this.list = list;
            }

            isIn(graph, xwc, ywc) {
                let xin = graph.X(xwc);
                let yin = graph.Y(ywc);
                let xot = graph.X(this.x) +  this.xoffset
                let yot = graph.Y(this.y) + this.yoffset;
                if (xin > xot && xin < (xot + this.width) &&
                    yin > yot && yin < (yot + (this.mheight * this.list.length))) {
                    return true;
                }
            }
            dehighlight() {
                this.highlight = -1;
            }

            mouseUp(graph, x, y) {
                let xsc = graph.X(x);
                let ysc = graph.Y(y);
                let diff = Math.abs(graph.Y(this.y) + this.yoffset - ysc);
                let d = Math.floor(diff / this.mheight)
                if (this.list[d] && this.list[d].click) {
                    return this.list[d].click(x, y);
                }
            }
            mouseDown(graph, x, y) {

            }
            mouseMove(graph, x, y) {

                let xsc = graph.X(x);
                let ysc = graph.Y(y);
                let diff = Math.abs(graph.Y(this.y) + this.yoffset - ysc + 5);
                this.highlight = Math.floor(diff / this.mheight);

            }
            draw(ctx, grid) {
                let ymin = grid.getymin();
                let ymax = grid.getymax();
                let xmin = grid.getxmin();
                let xmax = grid.getxmax();

                let xmenu = grid.X(this.x) + this.xoffset
                let ymenu = grid.Y(this.y) + this.yoffset

                for (var i = 0; i < this.list.length; i++) {
                    var menuItem = this.list[i];

                    let xin = grid.X(this.mx);
                    let yin = grid.Y(this.my);
                    let xot = grid.X(this.x)
                    let yot = grid.Y(grid.Y(this.y) + (i * this.mheight));
                    ctx.shadowColor = 'lightGray';

                    ctx.shadowBlur = 10;

                    if (this.highlight == i) {
                        ctx.fillStyle = "lightBlue";
                    } else
                        ctx.fillStyle = "white";

                    ctx.fillRect(xmenu + 5, ymenu + (i * this.mheight), this.width, this.mheight);

                    ctx.stroke();

                    ctx.font = '20px serif';

                    ctx.shadowBlur = 0;

                    ctx.fillStyle = "black";

                    let tl = menuItem.label.split(/\n/)
                    let j = 0;

                    for (let t of tl) {
                        if (t.length > 60) {
                            t = t.substring(0, 60) + '...'
                        }

                        ctx.fillText(t, xmenu + 10, ymenu + ((i) * this.mheight) + ((this.mheight / tl.length) * j) + this.mheight / tl.length - 5);
                        ctx.stroke();
                        j++;
                    }
                }
            }
        }
        resolve(CitationMenu)
    })
}
