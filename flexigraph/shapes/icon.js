function () {
    return new Promise(async (resolve, reject) => {

        let Icon = class Icon {
            name;
            x;
            y;
            w = 1;
            h = 1;
            color = 'red';
            comment = '';
            type = 'icon';
            img;
            ar = -1
            bsf;

            xrange = 1;
            yrange = 1;
            hl = false;
            drawShadow = false;

            constructor(name, img, x, y, w, h) {
                this.x = x;
                this.y = y;
                this.img = img;

                this.name = name;
                this.w = w;
                this.h = h;
                this.xrange = w / 10;
                this.yrange = h / 10;

            }

            highlight(v) {
                this.hl = v;
            }
            move(x, y) {
                if (!x || !y) {
                    return;
                }
                this.x = x;
                this.y = y;
            }
            setColor(color) {
                this.color = color;
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
            }

            async toOCR() {
                return new Promise((resolve, reject) => {
                    if (this.img) {
                        Tesseract.recognize(this.img, 'eng', {
                        }).then(({ data: { text } }) => {
                            resolve ( text )
                        })
                    }
                })
            }

            draw(graph, ctx) {
                if (this.img.src == undefined || this.img === 'b64') {
                    this.img = new Image();
                    this.img.src = this.bsf;

                }
                if (graph.inFrame && !graph.inFrame(this.x, this.y, this.w, this.h)) {
                    return;
                }
                if (this.ar < 0) {
                    this.ar = (graph.screenWidth(this.w) / graph.screenHeight(this.h));
                }
                if (this.hl) {
                    graph.drawRect(graph.X(this.x), graph.Y(this.y), graph.screenWidth(this.w), graph.screenHeight(this.h), 'red');
                }

                let range = (graph.getxmax() - graph.getxmin());

                let width = graph.screenWidth(this.w);
                let height = graph.screenHeight(this.h);

                if (this.img && width > 10 && height > 10 && width < 15000 && height < 15000) {
                    if (ctx) {
                        ctx.shadowColor = "#000000";
                        ctx.shadowBlur = 2;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.drawImage(this.img, graph.X(this.x), graph.Y(this.y), graph.screenWidth(this.w), graph.screenHeight(this.h));
                    }
                    else
                        graph.drawImageSc(this.img, graph.X(this.x), graph.Y(this.y), this.drawShadow);

                }
                if (this.comment) {
                    let xt = this.w * Math.cos(0.4) + this.x - this.w / 5
                    let yt = this.h / 2 * Math.sin(0.4) + this.y - this.h / 5
                    let string_wx = (xt + this.w / 2)
                    let string_hx = (yt + this.h / 2);

                }

            }

            toJSON() {
                return {
                    name: this.name,
                    x: this.x,
                    y: this.y,
                    w: this.w,
                    h: this.h,
                    color: this.color,
                    comment: this.comment,
                    type: this.type,
                    ar: this.ar,
                    bsf: this.bsf,
                    xrange: this.xrange,
                    yrange: this.yrange,
                    hl: this.hl,
                    drawShadow: this.drawShadow,
                    imgSrc: this.img ? this.img.src : null
                };
            }

            static buildFromJSON(obj) {
                const img = new Image();
                if (obj.imgSrc) {
                    img.src = obj.imgSrc;
                }

                const icon = new Icon(obj.name, img, obj.x, obj.y, obj.w, obj.h);
                icon.color = obj.color;
                icon.imgSrc = obj.imgSrc;
                icon.comment = obj.comment;
                icon.type = obj.type;
                icon.ar = obj.ar;
                icon.bsf = obj.bsf;
                icon.xrange = obj.xrange;
                icon.yrange = obj.yrange;
                icon.hl = obj.hl;
                icon.drawShadow = obj.drawShadow;
                return icon;
            }

        }
        resolve(Icon)
    })
}
