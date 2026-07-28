function (platetrack, formula) {
    return new Promise(async (resolve, reject) => {

        let Folder = class Folder {
            name;
            x = 0;
            y = 0;
            w = 0.0000000000000001;
            h = 0.0000000000000001;
            type = 'folder';
            color = '#d9b44a';
            tabColor = '#e6c15a';
            strokeColor = 'black';
            comment = '';
            hl = false;

            constructor(name, x, y) {
                this.name = name;
                this.x = x;
                this.y = y;
            }

            setColor(color) {
                this.color = color;
            }

            setTabColor(color) {
                this.tabColor = color;
            }

            setStrokeColor(color) {
                this.strokeColor = color;
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

            drawFolderPath(ctx, x, y, w, h) {
                let tabW = w * 0.32;
                let tabH = h * 0.22;
                let tabX = x + w * 0.08;

                ctx.beginPath();
                ctx.moveTo(x, y + tabH);
                ctx.lineTo(tabX, y + tabH);
                ctx.lineTo(tabX + tabW * 0.18, y);
                ctx.lineTo(tabX + tabW, y);
                ctx.lineTo(tabX + tabW + w * 0.06, y + tabH);
                ctx.lineTo(x + w, y + tabH);
                ctx.lineTo(x + w, y + h);
                ctx.lineTo(x, y + h);
                ctx.closePath();
            }

            draw(graph, ctx) {

                let x = graph.X(this.x);
                let y = graph.Y(this.y);
                let w = graph.screenWidth(this.w);
                let h = graph.screenHeight(this.h);

                if (w < 0) {
                    x = x + w;
                    w = Math.abs(w);
                }
                if (h < 0) {
                    y = y + h;
                    h = Math.abs(h);
                }

                let fillColor = this.color;
                let tabColor = this.tabColor;
                let strokeColor = this.strokeColor;

                if (this.hl) {
                    strokeColor = 'red';
                }

                if (ctx) {
                    ctx.save();

                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = 'black';
                    ctx.strokeStyle = strokeColor;

                    this.drawFolderPath(ctx, x, y, w, h);
                    ctx.fillStyle = fillColor;
                    ctx.fill();
                    ctx.stroke();

                    let tabW = w * 0.32;
                    let tabH = h * 0.22;
                    let tabX = x + w * 0.08;

                    ctx.beginPath();
                    ctx.moveTo(tabX, y + tabH);
                    ctx.lineTo(tabX + tabW * 0.18, y);
                    ctx.lineTo(tabX + tabW, y);
                    ctx.lineTo(tabX + tabW + w * 0.06, y + tabH);
                    ctx.closePath();
                    ctx.fillStyle = tabColor;
                    ctx.fill();
                    ctx.stroke();

                    ctx.restore();
                } else {
                    let c = graph.canvas.getCTX();
                    if (!c) {
                        return;
                    }

                    c.save();

                    c.lineWidth = 2;
                    c.shadowBlur = 4;
                    c.shadowColor = 'black';
                    c.strokeStyle = strokeColor;

                    this.drawFolderPath(c, x, y, w, h);
                    c.fillStyle = fillColor;
                    c.fill();
                    c.stroke();

                    let tabW = w * 0.32;
                    let tabH = h * 0.22;
                    let tabX = x + w * 0.08;

                    c.beginPath();
                    c.moveTo(tabX, y + tabH);
                    c.lineTo(tabX + tabW * 0.18, y);
                    c.lineTo(tabX + tabW, y);
                    c.lineTo(tabX + tabW + w * 0.06, y + tabH);
                    c.closePath();
                    c.fillStyle = tabColor;
                    c.fill();
                    c.stroke();

                    c.restore();

                    if (this.hl) {
                        c.save();
                        c.lineWidth = 4;
                        c.strokeStyle = 'red';
                        c.shadowBlur = 0;
                        this.drawFolderPath(c, x, y, w, h);
                        c.stroke();
                        c.restore();
                    }

                    if (this.comment) {
                        let xt = this.w * Math.cos(0.4) + this.x - this.w / 5;
                        let yt = this.h / 2 * Math.sin(0.4) + this.y - this.h / 5;
                        let string_wx = (xt + this.w / 2);
                        let string_hx = (yt + this.h / 2);

                        graph.drawDaignalLine(xt, yt, string_wx, string_hx, 'gray', 1, 'butt');
                        graph.drawString(this.comment, string_wx, string_hx, 'blue');
                    }
                }
            }
        }

        resolve(Folder)
    })

}
