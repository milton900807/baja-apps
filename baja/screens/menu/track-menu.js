function () {
    return new Promise(async (resolve, reject) => {
        let TrackMenu = class TrackMenu {
            name;
            x = 0;
            y = 0;
            color = 'black';
            list = []
            mx = -1;
            my = -1;
            highlight = -2;
            mheight = 25;
            xoffset = 0;
            yoffset = 0;
            menu_width = 550;
            title = ''
            show = false;

            constructor(list, x, y) {
                this.x = x;
                this.y = y;
                this.list = list;
            }

            isIn(xsc, ysc) {
                let xin = xsc + this.xoffset;
                let yin = ysc + this.yoffset;
                let xot = this.x
                let yot = this.y;
                if (xin > xot && xin < (xot + this.menu_width) &&
                    yin > yot - this.mheight && yin < (yot + (this.mheight * this.list.length))) {
                    this.show = true;
                    return true;
                }else {
                    this.show = false;
                }

            }

            dehighlight() {
                this.highlight = -1;
            }

            mouseUp(x, y) {
                let xsc = x;
                let ysc = y;
                let diff = Math.abs(this.y - ysc);
                let d = Math.floor(diff / this.mheight)
                if (this.list[d] && this.list[d].click) {
                    return this.list[d].click(x, y);
                }
            }
            mouseDown(x, y) {
                let xsc = x;
                let ysc = y;
                let diff = Math.abs(this.y - ysc + 5);
                let d = Math.floor(diff / this.mheight)
                if (this.list[d] && this.list[d]) {
                    return this.list[d].click(x, y);
                }
            }
            mouseMove(x, y) {
                let xsc = x;
                let ysc = y;
                let diff = Math.abs(this.y - ysc + 5);
                this.highlight = Math.floor(diff / this.mheight);
            }
            draw(ctx, grid) {
                let ymin = grid.getymin();
                let ymax = grid.getymax();
                let xmin = grid.getxmin();
                let xmax = grid.getxmax();

                if (this.title) {
                    ctx.font = "12px Arial";
                    ctx.fillStyle = "white";

                    ctx.fillStyle = "darkGray";
                    ctx.fillRect(this.x + this.xoffset + 4, this.y - this.mheight + 4, this.menu_width, this.mheight);
                    ctx.stroke();
                    ctx.fillStyle = "darkblue";
                    ctx.fillRect(this.x + this.xoffset, this.y - this.mheight, this.menu_width, this.mheight);
                    ctx.stroke();
                    ctx.font = "12px Arial";
                    ctx.fillStyle = "white";
                    ctx.fillText(this.title, this.x + this.menu_width / 2 - 25, this.y - this.mheight / 5 - 10);
                }
                if (this.show) {
                    for (var i = 0; i < this.list.length; i++) {
                        var menuItem = this.list[i];
                        let xin = this.mx;
                        let yin = this.my;
                        let xot = this.x
                        let yot = this.y + (i * this.mheight);
                        ctx.fillStyle = "darkGray";
                        ctx.font = "12px Arial";
                        ctx.fillStyle = "white";
                        ctx.fillText(menuItem.label, sx + 7, sy + (i * mheight) + 17);

                        ctx.fillRect(this.x + this.xoffset + 4, this.y + 4 + this.yoffset + (i * this.mheight), this.menu_width, this.mheight);
                        ctx.stroke();

                        if (this.highlight == i) {
                            ctx.fillStyle = "gray";
                        } else
                            ctx.fillStyle = "darkGray";

                        ctx.fillRect(this.x + this.xoffset, this.y + this.yoffset + (i * this.mheight), this.menu_width, this.mheight);
                        ctx.stroke();
                        ctx.font = "12px Arial";
                        ctx.fillStyle = "white";
                        ctx.fillText(menuItem?.label, this.x + this.xoffset + this.mheight / 2, this.y + (i * this.mheight) + this.yoffset + 14);
                        ctx.stroke();

                    }
                }
            }
        }
        resolve(TrackMenu)
    })
}
