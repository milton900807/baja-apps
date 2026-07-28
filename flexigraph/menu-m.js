function () {
    return new Promise(async (resolve, reject) => {
        let Menu = class Menu {
            name;
            x = 0;
            y = 0;
            color = 'black';
            list = []
            mx = -1;
            my = -1;
            highlight = -2;
            mheight = 45;
            xoffset = 0;
            yoffset = 0;
            menu_width = 250;
            title = ''

            constructor(list, x, y) {
                this.x = x;
                this.y = y;
                this.list = list;
            }

            isIn(graph, xwc, ywc) {
                let xin = graph.X(xwc) + this.xoffset;
                let yin = graph.Y(ywc) + this.yoffset;

                let xot = graph.X(this.x)
                let yot = graph.Y(this.y);
                if (xin > xot && xin < (xot + this.menu_width) &&
                    yin > yot && yin < (yot + (this.mheight * this.list.length))) {
                    return true;

                }
                return false;
            }
            dehighlight() {
                this.highlight = -1;
            }

            mouseUp(graph, x, y) {
                let ysc = graph.Y(y);
                let diff = Math.abs(graph.Y(this.y) - ysc + 5);

                if (this.highlight >= 0) {
                    return this.list[this.highlight].click(x, y);
                } else {

                }

            }
            mouseDown(graph, x, y) {

            }
            mouseMove(graph, x, y) {

                let xsc = graph.X(x);
                let ysc = graph.Y(y);
                let diff = Math.abs(graph.Y(this.y) - ysc + 5);
                this.highlight = Math.floor(diff / this.mheight);

            }
            async draw(ctx, grid) {

                if (this.list === undefined || this.list === undefined) {
                    return;
                }

                let menu_height = this.mheight * this.list.length;
                if ((grid.Y(this.y) + 14 + menu_height) > grid.height) {
                    this.y = grid.Ywc(grid.yi + grid.height - menu_height);
                }

                if (this.title) {
                    ctx.fillStyle = "darkGray";
                    ctx.fillRect(grid.X(this.x) + this.xoffset + 4, grid.Y(this.y) - 50, this.menu_width, this.mheight);
                    ctx.stroke();
                    ctx.fillStyle = "darkBlue";

                    ctx.fillRect(grid.X(this.x) + this.xoffset, grid.Y(this.y), this.menu_width, this.mheight);
                    ctx.stroke();
                    ctx.font = "11px Arial";
                    ctx.fillStyle = "white";
                    ctx.fillText(this.title, grid.X(this.x) + this.mheight / 2, grid.Y(this.y) + 14);
                    ctx.stroke();
                    ctx.shadowBlur = 0;

                }

                if (this.list)
                    for (var i = 0; i < this.list.length; i++) {
                        var menuItem = this.list[i];

                        ctx.fillStyle = "darkGray";
                        ctx.shadowBlur = 2;
                        ctx.shadowColor = 'lightBlue';

                        ctx.fillRect(grid.X(this.x) + this.xoffset + 4, grid.Y(this.y) + 4 + this.yoffset + (i * this.mheight), this.menu_width, this.mheight);
                        ctx.stroke();

                        ctx.shadowColor = 'black';

                        if (this.highlight == i) {
                            ctx.fillStyle = "lightBlue";
                        } else
                            ctx.fillStyle = "navy";

                        ctx.fillRect(grid.X(this.x) + this.xoffset, grid.Y(this.y) + this.yoffset + (i * this.mheight), this.menu_width, this.mheight);
                        ctx.font = "11px Arial";
                        ctx.fillStyle = "white";
                        ctx.fillText(menuItem.label, grid.X(this.x) + this.xoffset + this.mheight / 2, grid.Y(this.y) + (i * this.mheight) + this.yoffset + 14);
                        ctx.stroke();

                    }
                ctx.shadowBlur = 0;

            }
        }
        resolve(Menu)
    })
}
