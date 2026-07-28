function () {
    return new Promise(async (resolve, reject) => {
        let ChapterMenu = class ChapterMenu {
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
            menu_width = 330;
            title = ''
            show = true;

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
                } else {

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

                if (this.title) {
                    ctx.fillStyle = "yellow";
                    ctx.shadowBlur = 6;
                    ctx.shadowColor = 'black';
                    ctx.fillRect(this.x + this.xoffset, this.y - this.mheight, this.menu_width, this.mheight);
                    ctx.stroke();
                    ctx.shadowBlur = 1;
                    ctx.font = "25px Arial";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillStyle = "#000000";
                    let rectHeight = this.mheight;
                    let rectWidth = this.menu_width;
                    let rectX = this.x + this.xoffset;
                    let rectY = this.y - this.mheight;
                    ctx.fillText(this.title, rectX + (rectWidth / 2), rectY + (rectHeight / 2));
                    ctx.stroke();
                }

                for (var i = 0; i < this.list.length; i++) {
                    var menuItem = this.list[i];
                    let xin = this.mx;
                    let yin = this.my;
                    let xot = this.x
                    let yot = this.y + (i * this.mheight);
                    ctx.fillStyle = "lightYellow";

                    if (this.highlight == i) {
                        ctx.fillStyle = "gray";
                    } else
                        ctx.fillStyle = "yellow";
                    ctx.shadowBlur = 3;
                    ctx.shadowColor = 'black';
                    ctx.fillRect(this.x + this.xoffset, this.y + this.yoffset + (i * this.mheight), this.menu_width, this.mheight);
                    ctx.stroke();
                    ctx.font = "20px Arial";
                    ctx.shadowBlur = 1;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillStyle = "#000000";
                    let rectHeight = this.mheight;
                    let rectWidth = this.menu_width;
                    let rectX = this.x + this.xoffset;
                    let rectY = this.y + this.yoffset + (i * this.mheight);
                    ctx.fillText(menuItem.label, rectX + (rectWidth / 2), rectY + (rectHeight / 2));
                    ctx.stroke()

                }
            }
        }
        resolve(ChapterMenu)
    })
}
