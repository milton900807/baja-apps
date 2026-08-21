function (graphListener, mouseDownListener, mouseUpListener, mouseMoveListener, controlPanelCallback, controlPanelListener, pinchListener, touchStart, touchend, touchmove, dblclick, wheel) {

    let FlexiGraph = class FlexiGraph {
        grid;
        canvas;
        mode = 'navigate'
        resizeWithCanvas = true;
        maxwidth = 15500;
        maxheight = 15500;
        md = false;
        flexigraphMouseMoveListeners = [];
        flexigraphMouseDownListeners = [];
        flexigraphMouseUpListeners = [];
        flexListenersOff = false;
        menu;

        mscx = 0;
        mscy = 0;

        async init() {
            let MGrid = await exec('flexigraph/grid.js');
            const xi = 0;
            const yi = 0;
            const wi = 900;
            const hi = 1000;
            this.grid = new MGrid(xi, yi, wi, hi);
            this.grid.setxmax(10000);
            this.grid.setymax(1);
            this.grid.setxmin(0);
            this.grid.setymin(0);
            this.grid.setInset(0, 0)
            this.grid.rescale();
        }

        setInset(xinset, yinset) {
            this.grid.setInset(xinset, yinset)
        }

        clearMouseListeners() {
            mouse_down = false;
        }

        createComponent(id, canvasListener, mdel) {
            let px = 0;
            let py = 0;
            let innerComponentCallback = createIonFunction((innerComponent) => {
                this.canvas = innerComponent;

                if (this.canvas) {

                }

            });
            if (!canvasListener) {
                canvasListener = (ctx) => {

                    mouse_down = false;
                }
            }

            if (!id || id.length <= 0) {
                id = Math.random() + '=-=-'
            }
            let width = 800;
            if (isMobile()) {
                width = 500
            }
            return (
                {

                    wid: 'canvas',

                    refCallback: innerComponentCallback,
                    componentRef: 'canvasPanel',
                    data: {
                        'width': width,
                        'id': id,
                        'keydown': createIonFunction((scx, scy) => {
                            if (mdel && mdel.keyDown) {
                                mdel.keyDown(scx, scy)
                                if (mdel.getPriority())
                                    return;
                            }
                        }),
                        'canvasListener': createIonFunction(canvasListener),
                        'mouseListener': createIonFunction((scx, scy) => {

                        }),
                        'mouseDownListener': createIonFunction((scx, scy) => {

                            if (mdel && mdel.mouseDown) {
                                mdel['mouseDown'](scx, scy)
                                if (mdel.getPriority())
                                    return;
                            }
                            if (mouseDownListener) {
                                this.grid.rescale();
                                mouseDownListener(this.grid.Xwc(scx), this.grid.Ywc(scy));
                            }

                            if (this.mode == 'navigate') {
                                px = this.grid.Xwc(scx);
                                py = this.grid.Ywc(scy);
                            }

                            mouse_down = true;

                            if (this.menu)
                                return;

                            if (this.flexigraphMouseDownListeners && (!this.flexListenersOff)) {
                                for (let flm of this.flexigraphMouseDownListeners) {
                                    try {
                                        flm(scx, scy);
                                    } catch (exception) {
                                        console.log(" Exception " + exception)
                                        const index = this.flexigraphMouseDownListeners.indexOf(flm);
                                        if (index !== -1) {
                                            this.flexigraphMouseDownListeners.splice(index, 1);
                                        }
                                    }
                                }
                            }
                        }),
                        'mouseUpListener': createIonFunction((scx, scy) => {

                            if (!Number.isFinite(scx) || (!Number.isFinite(scy))) {
                                return;
                            }

                            if (mdel && mdel.mouseUp) {
                                mdel.mouseUp(scx, scy)
                                if (mdel.getPriority())
                                    return;
                            }

                            px = 0;
                            py = 0;
                            mouse_down = false;
                            if (mouseUpListener) {
                                this.grid.rescale();
                                mouseUpListener(this.grid.Xwc(scx), this.grid.Ywc(scy));
                            }
                            if (this.menu)
                                return;

                            if (this.flexigraphMouseUpListeners && (!this.flexListenersOff)) {
                                for (let flm of this.flexigraphMouseUpListeners) {
                                    try {
                                        flm(scx, scy);
                                    } catch (exception) {
                                        const index = this.flexigraphMouseUpListeners.indexOf(flm);
                                        if (index !== -1) {
                                            this.flexigraphMouseUpListeners.splice(index, 1);
                                        }
                                    }
                                }
                            }

                        }),
                        'pinchListener': createIonFunction((evt) => {
                            this.flexListenersOff = true;
                            setTimeout(() => {
                                this.flexListenersOff = false;
                            }, 3)

                            if (pinchListener) {
                                pinchListener(evt);
                            }
                            if (this.menu)
                                return;

                        }),
                        'touchstart': createIonFunction((evt) => {
                            if (touchStart) {
                                touchStart(evt);
                            }

                        }),
                        'touchend': createIonFunction((evt) => {
                            if (touchend) {
                                touchend(evt);
                            }

                        }),
                        'touchmove': createIonFunction((evt) => {
                            if (touchmove) {
                                touchmove(evt);
                            }
                        }),

                        'dblclick': createIonFunction((scx, scy) => {
                            if (dblclick) {
                                dblclick(scx, scy);
                            }

                        })
                        ,
                        'wheelListener': createIonFunction((scx, scy) => {
                            if (wheel) {
                                wheel(scx, scy);
                            }

                        }),
                        'mouseLeaveListener': createIonFunction((evt) => {
                            mouse_down = false;

                        })
                        ,
                        'mouseMoveListener': createIonFunction((scx, scy) => {

                            this.mscx = scx;
                            this.mscy = scy;

                            if (mdel && mdel.mouseMove) {
                                mdel.mouseMove(scx, scy)
                                if (mdel.getPriority())
                                    return;
                            }
                            if (this.mode == 'navigate' && mouse_down) {
                                let xd = px - this.grid.Xwc(scx);
                                let yd = py - this.grid.Ywc(scy);
                                this.grid.setxmin(this.grid.getxmin() + xd);
                                this.grid.setxmax(this.grid.getxmax() + xd);
                                this.grid.setymin(this.grid.getymin() + yd);
                                this.grid.setymax(this.grid.getymax() + yd);
                                this.grid.rescale();
                            }

                            if (mouseMoveListener) {
                                this.grid.rescale();
                                mouseMoveListener(this.grid.Xwc(scx), this.grid.Ywc(scy));
                            }
                            if (this.menu)
                                return;

                            if (this.flexigraphMouseMoveListeners && (!this.flexListenersOff)) {
                                for (let flm of this.flexigraphMouseMoveListeners) {
                                    try {
                                        flm(scx, scy);
                                    } catch (exception) {
                                        console.log(" Exception " + exception)

                                        const index = this.flexigraphMouseMoveListeners.indexOf(flm);
                                        if (index !== -1) {
                                            this.flexigraphMouseMoveListeners.splice(index, 1);
                                        }
                                    }
                                }
                            }

                        })
                    }
                }
            )
        }

        removeMouseMotionListener(flm) {
            const index = this.flexigraphMouseMoveListeners.indexOf(flm);
            if (index !== -1) {
                this.flexigraphMouseMoveListeners.splice(index, 1);
            }
        }

        addMouseMotionListener(mouseMotionListener) {
            if (!this.flexigraphMouseMoveListeners.some((element) => isEqual(element, mouseMotionListener))) {
                this.flexigraphMouseMoveListeners.push(mouseMotionListener);
            }
        }
        removeMouseUpListener(flm) {
            const index = this.flexigraphMouseUpListeners.indexOf(flm);
            if (index !== -1) {
                this.flexigraphMouseUpListeners.splice(index, 1);
            }
        }
        removeMouseDownistener(flm) {
            const index = this.flexigraphMouseDownListeners.indexOf(flm);
            if (index !== -1) {
                this.flexigraphMouseDownListeners.splice(index, 1);
            }
        }

        addMouseUpListener(mouseUpListener) {
            if (!this.flexigraphMouseUpListeners.some((element) => isEqual(element, mouseUpListener))) {
                this.flexigraphMouseUpListeners.push(mouseUpListener);
            }
        }

        addMouseDownListener(mouseDownListener) {
            if (!this.flexigraphMouseDownListeners.some((element) => isEqual(element, mouseDownListener))) {
                this.flexigraphMouseDownListeners.push(mouseDownListener);
            }
        }

        isEqual(objA, objB) {
            const strA = JSON.stringify(objA);
            const strB = JSON.stringify(objB);
            return strA === strB;
        }

        async createFloatingCanvas(id, canvasListener) {

            return new Promise(async (res, rej) => {

                let FloatingCanvas = class FloatingCanvas {

                    canvas;
                    title;
                    x = 10;
                    y = 10;
                    constructor(canvas) {
                        this.canvas = canvas;
                        this.x = canvas.style.left;
                        this.y = canvas.style.top;
                    }

                    setTitle(title) {
                        this.title = title;
                    }

                    draw() {
                        if (this.canvas && this.title) {
                            var ctx = canvas.getContext('2d');
                            ctx.font = "15px Arial";
                            ctx.textAlign = "center";
                            let xmid = this.canvas.width / 2;
                            ctx.fillStyle = 'rgb(10,10,10)';
                            ctx.fillText(this.title, xmid, 20);
                            let width = canvas.width;
                            let height = canvas.height;
                            ctx.shadowBlur = 10;
                            ctx.shadowColor = "lightGray";

                        }
                    }

                    setVisible(val) {
                        if (val) {
                            this.canvas.removeAttribute('hidden')
                        } else {
                            this.canvas.setAttribute('hidden', 'hidden')
                        }
                    }
                    getX() {
                        return this.x;
                    }
                    getY() {
                        return this.y;
                    }
                    getWidth() {
                        return this.canvas.width;
                    }
                    getHeight() {
                        return this.canvas.height;
                    }

                    setX(x) {
                        this.x = x;
                        this.canvas.style.left = x + "px";
                    }
                    setY(y) {
                        this.y = y;
                        this.canvas.style.top = y + 'px';
                    }
                    setDimension(w, h) {
                        this.canvas.style.width = w + "px";
                        this.canvas.style.height = h + "px";
                        this.canvas.width = w
                        this.canvas.height = h
                    }
                };

                if (!id || id.length <= 0) {
                    id = Math.random() + '=-='
                }
                let canvas = document.createElement('canvas');
                canvas.style.position = 'absolute';
                canvas.style.top = "120px";
                canvas.style.left = "130px";
                canvas.style.width = "400px";
                canvas.style.height = "400px";
                canvas.width = 400;
                canvas.height = 400;

                canvas.setAttribute('z-index', 1);
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = 'rgb(255,0,0)';
                ctx.fillRect(0, 0, 100, 100);
                document.body.appendChild(canvas);
                res(new FloatingCanvas(canvas));
            })
        }
        toJSON() {
            return {
                grid: this.grid ? this.grid.toJSON() : null,
                canvas: this.canvas ? { width: this.canvas.width, height: this.canvas.height } : null,
                mode: this.mode,
                resizeWithCanvas: this.resizeWithCanvas,
                maxwidth: this.maxwidth,
                maxheight: this.maxheight,
                md: mouse_down,
                menu: this.menu ? this.menu.toJSON() : null,
            };
        }

        inFrame(vx, vy, vw, vh) {

            let sx = this.grid.X(vx);
            let st = this.grid.Ywc(vy);
            let sw = this.grid.screenWidth(vw);
            let sh = this.grid.screenHeight(vh);
            st = st + sh;
            sh = -1 * sh;

            if ((sx + sw > 0) && (sx < this.grid.width)) {
                return true;
            }
            if (st + sh < 0 || st + sh > this.grid.height) {
                return false;
            }

            return false;
        }

        measureText = (text) => {
            if (this.canvas) {
                let ctx = this.canvas.getCTX();
                return ctx.measureText(text);
            }
            return null;
        }

        rescale = () => {

            this.grid.rescale();
        }

        setColor = (color) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                ctx.fillStyle = color;
            }
        }

        drawImageSc = (src, x, y, drawShadow) => {
            if (this.canvas) {
                try {
                    var ctx = this.canvas.getCTX();
                    if (drawShadow) {
                        ctx.shadowColor = "#000000";
                        ctx.shadowBlur = 5;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.drawImage(src, x, y);
                    } else {
                        ctx.shadowColor = "#000000";
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.drawImage(src, x, y);
                    }
                    ctx.shadowColor = "#000000";
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;

                } catch (exception) {
                    console.log(' Image broken ')
                }
            }
        }

        drawImage = (src, x, y, w, h) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();

                // Guard against not-yet-loaded / invalid image sources so a single
                // bad layer or icon doesn't throw drawImage TypeErrors every frame.
                if (!src || typeof src !== 'object') return;
                if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
                    if (!src.complete || src.naturalWidth === 0) return;
                }

                ctx.shadowColor = "#000000";
                ctx.shadowBlur = 2;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                try {
                    ctx.drawImage(src, this.grid.X(x), this.grid.Y(y), this.grid.screenWidth(w), this.screenHeight(h));
                } catch (e) {
                    // image source not drawable yet
                }
            }
        }

        drawEllipse = (x, y) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();

                let w = 2;
                let h = 2;
                var kappa = .5522848,
                    ox = (w / 2) * kappa,
                    oy = (h / 2) * kappa,
                    xe = x + w,
                    ye = y + h,
                    xm = x + w / 2,
                    ym = y + h / 2;

                ctx.beginPath();
                ctx.moveTo(x, ym);
                ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                ctx.stroke();
            }
        }

        drawOval = (x, y, w, h, color, lineWidth) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (!color) {
                    color = 'black'
                }

                if (!lineWidth)
                    lineWidth = 2
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;

                var kappa = .5522848,
                    ox = (w / 2) * kappa,
                    oy = (h / 2) * kappa,
                    xe = x + w,
                    ye = y + h,
                    xm = x + w / 2,
                    ym = y + h / 2;

                ctx.beginPath();
                ctx.moveTo(x, ym);
                ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                ctx.stroke();
            }
        }

        drawYs = (color) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (ctx) {
                    if (!color) {
                        color = 'black'
                    }
                    let ymin = this.grid.getymin();
                    let ymax = this.grid.getymax();
                    let xmin = this.grid.getxmin();
                    let xmax = this.grid.getxmax();
                    ctx.fillStyle = color;

                    let yincrement = (ymax - ymin) / 10;
                    for (let y = ymin; y < ymax; y += yincrement) {

                        ctx.fillText('' + Math.floor(y) + '', this.grid.xi, this.grid.Y(y) - 5);
                    }
                    ctx.stroke();

                }
            }
        }

        drawurl(str, url, x, y, color, font) {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (!font) {
                    font = "10px Arial";
                }
                if (ctx) {
                    if (!color) {
                        color = 'black'
                    }
                    if (font) {
                        ctx.font = font;
                    } else {
                        ctx.font = '15px Arial'
                    }
                    ctx.fillStyle = color;
                    ctx.fillText('[' + str + ']', this.grid.X(x), this.grid.Y(y) - 5);

                    ctx.stroke();
                }
            }
        }

        drawScreenString(str, x, y, color, font) {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();

                if (!font) {
                    font = "12px Arial";
                }

                if (ctx) {
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'black';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';

                    if (!color) {
                        color = 'black'
                    }
                    if (font) {
                        ctx.font = font;
                    } else {
                        ctx.font = '15px Arial'
                    }
                    ctx.fillStyle = color;
                    ctx.fillText(str, x, y - 5);
                    ctx.stroke();
                }
            }
        }
        drawString(str, x, y, color, font) {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                if (!font) {
                    font = "15px Arial";
                }
                if (ctx) {
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'black';
                    if (!color) {
                        color = 'black'
                    }
                    if (font) {
                        ctx.font = font;
                    } else {
                        ctx.font = '15px Arial'
                    }
                    ctx.fillStyle = color;
                    let sx = this.grid.X(x);
                    let sy = this.grid.Y(y) - 5;

                    ctx.fillText(str, sx, sy);
                    ctx.stroke();
                }
            }

        }
        drawString45(str, x, y, color, font) {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                if (!font) {
                    font = "12px Arial";
                }
                if (ctx) {
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'black';
                    if (!color) {
                        color = 'black'
                    }
                    ctx.font = font;
                    ctx.fillStyle = color;

                    let sx = this.grid.X(x);
                    let sy = this.grid.Y(y) - 5;

                    ctx.save();

                    ctx.translate(sx, sy);

                    ctx.rotate(45 * Math.PI / 180);

                    ctx.fillText(str, 0, 0);

                    ctx.restore();

                    ctx.stroke();
                }
            }
        }

        drawurl(text, url, x, y, color) {
            this.drawString(text, x, y, color);
        }

        drawTextInRectangle(text, xs, ys, rectangleWidth, fontSize, fontName, color) {
            if (this.canvas) {

                fontSize = parseInt(fontSize)
                var context = this.canvas.getCTX();
                context.font = `${fontSize}px ${fontName}`;
                context.fillStyle = color;

                let words = text.split(' ');
                let currentLine = '';

                let x = this.grid.X(xs);
                let y = this.grid.Y(ys) + fontSize;

                words.forEach(word => {
                    let testLine = currentLine + word + ' ';
                    let metrics = context.measureText(testLine);
                    let testWidth = metrics.width;

                    if (testWidth > rectangleWidth && currentLine !== '') {
                        context.fillText(currentLine, x, y);
                        currentLine = word + ' ';
                        y += fontSize;
                    } else {
                        currentLine = testLine;
                    }
                });

                context.fillText(currentLine, x, y);
            }
        }

        drawMenuSC = (menu, ctx) => {
            if (!ctx && this.canvas) {
                ctx = this.canvas.getCTX();
            }
            if (ctx) {
                let mheight = 25;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                let sx = menu.x;
                let sy = menu.y;
                for (var i = 0; i < menu.list.length; i++) {
                    var menuItem = menu.list[i];
                    let yot = sy + (i * mheight);
                    if (menu.highlight == i) {
                        ctx.fillStyle = "gray";
                    } else
                        ctx.fillStyle = "black";

                    ctx.shadowBlur = 3;
                    ctx.shadowColor = 'black';

                    ctx.fillRect(sx, sy + (i * mheight), 200, mheight);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'black';

                    ctx.font = "12px Arial";
                    ctx.fillStyle = "white";
                    ctx.fillText(menuItem.label, sx + 7, sy + (i * mheight) + 17);
                    ctx.stroke();

                }

                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';

            }

        }

        drawMenu = (menu, ctx) => {
            if (!ctx && this.canvas) {
                ctx = this.canvas.getCTX();
            }
            if (!ctx || !menu) return;

            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;

            const itemsPerColumn = menu.getItemsPerColumn();
            const totalMenuHeight = itemsPerColumn * menu.mheight;

            const totalMenuWidth =
                menu.menu_width * menu.columns + (menu.columns - 1) * 20;

            const centerX = (canvasWidth - totalMenuWidth) / 2;
            const centerY = (canvasHeight - totalMenuHeight) / 2;

            menu.x = this.Xwc(centerX);
            menu.y = this.Ywc(centerY);

            if (menu.draw) {
                menu.draw(ctx, this.grid);
            }

            ctx.shadowBlur = 0;
            ctx.shadowColor = 'black';
        };

        drawRect = (x, y, w, h, color, lineSize, ctx) => {
            if (!ctx && this.canvas) {
                ctx = this.canvas.getCTX();
            }
            if (!color) {
                color = 'black'
            }
            ctx.lineWidth = "1";
            if (lineSize) {
                ctx.lineWidth = lineSize;
            }
            ctx.shadowBlur = 2;
            ctx.shadowColor = 'black';
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.stroke();
        }
        fillRect = (x, y, w, h, color, lineSize) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (!color) {
                    color = 'black'
                }
                ctx.lineWidth = "1";
                if (lineSize) {
                    ctx.lineWidth = lineSize;
                }
                ctx.shadowBlur = 2;
                ctx.shadowColor = 'black';
                ctx.strokeStyle = color;
                ctx.fillRect(x, y, w, h);
                ctx.stroke();
            }
        }
        fillTranslucentRect = (x, y, w, h) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                ctx.lineWidth = "1";
                ctx.shadowBlur = 2;
                ctx.shadowColor = 'black';
                ctx.fillStyle = 'RGBA(252,246,214,0.05)'
                ctx.strokeStyle = 'RGBA(252,246,214,0.05)'
                ctx.fillRect(x, y, w, h);
                ctx.fill();
            }
        }

        dashedRect = (x, y, w, h, color) => {

            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (!color) {
                    color = 'black'
                }
                ctx.lineWidth = "4";
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.setLineDash([5, 15]);
                ctx.beginPath();
                ctx.rect(x, y, w, h);

                ctx.stroke();
                ctx.setLineDash([]);

            }

        }

        thinDashedRect = (x, y, w, h, color) => {

            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (!color) {
                    color = 'black'
                }
                ctx.lineWidth = "2";
                ctx.strokeStyle = color;
                ctx.fillStyle = color;

                ctx.setLineDash([5, 15]);

                ctx.beginPath();
                ctx.rect(x, y, w, h);

                ctx.stroke();
                ctx.setLineDash([]);

            }

        }

        drawStart = (color) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (!color) {
                    color = 'black'
                }
                let ymin = this.grid.getymin();
                let ymax = this.grid.getymax();
                let xmin = this.grid.getxmin();
                let xmax = this.grid.getxmax();
                ctx.fillStyle = color;
                let xsc = this.grid.X(this.grid.getxmin()) + 50
                ctx.fillText(Math.floor(xmin), xsc, this.grid.Y(ymax) + 5);
                ctx.stroke();
            }
        }

        drawEnd = (color) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (!color) {
                    color = 'black'
                }
                let ymin = this.grid.getymin();
                let ymax = this.grid.getymax();
                let xmin = this.grid.getxmin();
                let xmax = this.grid.getxmax();
                ctx.fillStyle = color;
                ctx.fillText(Math.floor(xmax), this.grid.X(this.grid.getxmax()) - 250, this.grid.Y(ymax) + 5);
                ctx.stroke();
            }
        }

        drawScreenLine = (xi, yi, xf, yf, color, lineSize, lineCap) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (color != null) {
                    ctx.strokeStyle = color;
                }
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';
                if (lineSize == null) {
                    lineSize = 2;
                }
                if (lineCap == null) {
                    ctx.lineCap = lineCap;
                }
                else {
                    ctx.lineCap = 'butt';
                }

                ctx.beginPath();
                ctx.moveTo(xi, yi);
                ctx.lineTo(xf, yf);
                ctx.lineWidth = lineSize;
                ctx.stroke();
            }
        }

        drawSimpleArrowhead = (locx, locy, angle, sizex, sizey, color) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                var hx = sizex / 2;
                var hy = sizey / 2;
                ctx.strokeStyle = color;
                ctx.lineWidth = sizex;
                ctx.fillStyle = color;
                ctx.shadowBlur = 2;
                ctx.shadowColor = 'black';
                ctx.rotate(0);

                ctx.translate((locx), (locy));
                ctx.rotate(angle);
                ctx.translate(-hx, -hy);

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, 1 * sizey);
                ctx.lineTo(1 * sizex, 1 * hy);
                ctx.closePath();

                ctx.translate(hx, hy);
                ctx.rotate(-angle);
                ctx.translate(-locx, -locy);
                ctx.stroke();
            }
        }

        drawArrowhead = (locx, locy, angle, sizex, sizey, color) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                var hx = sizex / 2;
                var hy = sizey / 2;
                ctx.strokeStyle = color;
                ctx.lineWidth = sizex;
                ctx.fillStyle = color;
                ctx.shadowBlur = 2;
                ctx.shadowColor = 'black';
                ctx.rotate(0);

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
                ctx.stroke();
            }

        }

        drawSimpleLine = (xi, yi, xf, yf, color, lineSize, lineCap) => {
            if (this.canvas) {

                var ctx = this.canvas.getCTX();

                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';

                if (color != null) {
                    ctx.strokeStyle = color;
                }
                if (lineSize == null) {
                    lineSize = 2;
                }
                if (lineCap == null) {
                    ctx.lineCap = lineCap;
                }
                else {
                    ctx.lineCap = 'butt';
                }
                ctx.shadowColor = 'black';

                ctx.beginPath();
                ctx.moveTo(this.grid.X(xi), this.grid.Y(yi));
                ctx.lineTo(this.grid.X(xf), this.grid.Y(yf));
                ctx.lineWidth = lineSize;
                ctx.stroke();

            }
        }

        drawLine = (xi, yi, xf, yf, color, lineSize, lineCap) => {
            if (this.canvas) {

                var ctx = this.canvas.getCTX();
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';
                ctx.lineWidth = 2;

                if (color != null) {
                    ctx.strokeStyle = color;
                }
                if (lineSize == null) {
                    lineSize = 2;
                }
                if (lineCap == null) {
                    ctx.lineCap = lineCap;
                }
                else {
                    ctx.lineCap = 'butt';
                }
                ctx.shadowColor = 'black';
                ctx.lineWidth = lineSize;

                ctx.beginPath();
                ctx.moveTo(this.grid.X(xi), this.grid.Y(yi));
                ctx.lineTo(this.grid.X(xf), this.grid.Y(yf));
                ctx.stroke();

            }
        }

        drawRGBLine = (xi, yi, xf, yf, color, lineSize, lineCap) => {
            if (this.canvas) {

                var ctx = this.canvas.getCTX();
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';
                if (color != null) {
                    ctx.strokeStyle = color;
                }
                if (lineSize == null) {
                    lineSize = 2;
                }
                if (lineCap == null) {
                    ctx.lineCap = lineCap;
                }
                else {
                    ctx.lineCap = 'butt';
                }
                ctx.shadowColor = 'black';
                ctx.lineWidth = lineSize;

                ctx.beginPath();
                ctx.moveTo(this.grid.X(xi), this.grid.Y(yi));
                ctx.lineTo(this.grid.X(xf), this.grid.Y(yf));
                ctx.stroke();

            }
        }

        drawDashedLine = (xi, yi, xf, yf, color, lineSize, lineCap) => {
            if (this.canvas) {

                var ctx = this.canvas.getCTX();

                let previous = ctx.strokeStyle;
                ctx.shadowBlur = 2;
                ctx.shadowColor = 'black';

                if (color != null) {
                    ctx.strokeStyle = color;
                }
                if (lineSize == null) {
                    lineSize = 2;
                }
                if (lineCap == null) {
                    ctx.lineCap = lineCap;
                }
                else {
                    ctx.lineCap = 'butt';
                }
                ctx.shadowColor = 'black';

                ctx.setLineDash([5, 15]);
                ctx.lineWidth = lineSize;

                ctx.beginPath();

                ctx.moveTo(this.grid.X(xi), this.grid.Y(yi));
                ctx.lineTo(this.grid.X(xf), this.grid.Y(yf));
                ctx.stroke();
                ctx.setLineDash([]);

            }
        }

        drawStrokeLine = (xi, yi, xf, yf, color, lineSize, lineCap) => {
            if (this.canvas) {

                var ctx = this.canvas.getCTX();
                ctx.shadowBlur = 2;
                ctx.shadowColor = 'black';

                if (color != null) {
                    ctx.strokeStyle = color;
                    ctx.fileStyle = color;
                    ctx.color = color;
                }
                if (lineSize == null) {
                    lineSize = 2;
                }
                if (lineCap == null) {
                    ctx.lineCap = lineCap;
                }
                else {
                    ctx.lineCap = 'butt';
                }
                ctx.shadowColor = 'black';

                ctx.beginPath();
                ctx.moveTo(this.grid.X(xi), this.grid.Y(yi));
                ctx.lineTo(this.grid.X(xf), this.grid.Y(yf));
                ctx.lineWidth = lineSize;
                ctx.stroke();
            }
        }

        drawDaignalLine = (xi, yi, xf, yf, color, lineSize, lineCap) => {
            if (this.canvas) {

                var ctx = this.canvas.getCTX();

                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';
                ctx.lineWidth = 2;

                if (color != null) {
                    ctx.strokeStyle = color;
                }
                if (lineSize == null) {
                    lineSize = 2;
                }
                if (lineCap == null) {
                    ctx.lineCap = lineCap;
                }
                else {
                    ctx.lineCap = 'butt';
                }
                ctx.beginPath();
                ctx.moveTo(this.grid.X(xi), this.grid.Y(yi));
                ctx.lineTo(this.grid.X(xf), this.grid.Y(yf));
                ctx.lineWidth = lineSize;
                ctx.stroke();
            }
        }

        drawBar = (xi, yi, value, color) => {
            if (this.canvas) {
                this.grid.rescale();
                var ctx = this.canvas.getCTX();

                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';

                if (color != null) {
                    ctx.strokeStyle = color;
                }

                let height_bar = this.grid.screenHeight(value);

                ctx.rect(this.grid.X(xi), yi + this.grid.Y(value), 4, height_bar);
                ctx.fill()
            }
        }
        drawVerticalLine = (x, y, vlength, color, lineWidth) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';

                if (color != null) {
                    ctx.strokeStyle = color;
                } else {
                    ctx.strokeStyle = 'orange'
                }
                if (!lineWidth) {
                    ctx.lineWidth = 1;
                } else
                    ctx.lineWidth = lineWidth;
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';

                ctx.beginPath();
                ctx.moveTo(this.grid.X(x), this.grid.Y(y - vlength / 2));
                ctx.lineTo(this.grid.X(x), this.grid.Y(y + (vlength / 2)));
                ctx.stroke();
            }
        }
        drawVerticalLineScreen = (x, y, screenLength, color, lineWidth) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';

                if (color != null) {
                    ctx.strokeStyle = color;
                } else {
                    ctx.strokeStyle = 'orange'
                }
                if (!lineWidth) {
                    ctx.lineWidth = 1;
                } else
                    ctx.lineWidth = lineWidth;
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';

                ctx.beginPath();
                ctx.moveTo(x, y - screenLength);
                ctx.lineTo(x, y + screenLength);
                ctx.stroke();
            }
        }

        drawTrackPointer = (xi, xf, yi, yf, vlength, color, lineWidth, direction) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (color != null) {
                    ctx.strokeStyle = color;
                } else {
                    ctx.strokeStyle = 'orange'
                }
                if (!lineWidth) {
                    lineWidth = 2;
                }
                ctx.lineWidth = lineWidth;
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';

                ctx.beginPath();

                ctx.moveTo(this.grid.X(xi), this.grid.Y(yi));
                if (direction) {
                    ctx.lineTo(this.grid.X(xf), this.grid.Y(yf * 1.0));
                } else {
                    ctx.lineTo(this.grid.X(xf), this.grid.Y(yf * -1.0));
                }
                ctx.stroke();
            }
        }

        drawZigZag = (xi, yi, xf, yf, color, lineWidth) => {
            if (this.canvas) {

                if (!lineWidth) {
                    lineWidth = 1
                }
                let split = Math.abs(xf - xi) / 15;

                var ctx = this.canvas.getCTX();
                if (color != null) {
                    ctx.strokeStyle = color;
                } else {
                    ctx.strokeStyle = 'orange'

                }

                let amp = 0.001;
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';

                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                let count = 0;
                for (let index = xi; index < xf; index += split) {
                    if (count == 0) {
                        ctx.moveTo(this.grid.X(index), this.grid.Y(yi));
                        ctx.lineTo(this.grid.X(index + split), this.grid.Y(yi + amp));
                    }
                    else if ((count % 2) === 0) {
                        ctx.moveTo(this.grid.X(index), this.grid.Y(yi - amp));
                        if ((index + split) >= xf) {
                            ctx.lineTo(this.grid.X(index + split), this.grid.Y(yi));
                        } else {
                            ctx.lineTo(this.grid.X(index + split), this.grid.Y(yi + amp));
                        }
                        ctx.lineWidth = lineWidth;
                        ctx.stroke();
                    } else {
                        ctx.moveTo(this.grid.X(index), this.grid.Y(yi + amp));
                        if ((index + split) >= xf) {
                            ctx.lineTo(this.grid.X(index + split), this.grid.Y(yi));
                        } else {
                            ctx.lineTo(this.grid.X(index + split), this.grid.Y(yi - amp));
                        }
                        ctx.lineWidth = lineWidth;
                        ctx.stroke();
                    }

                    count++;
                }
            }
        }

        X = (sc) => {
            return this.grid.X(sc)
        }
        Y = (sc) => {
            return this.grid.Y(sc)
        }
        Xwc = (sc) => {
            return this.grid.Xwc(sc)
        }
        Ywc = (sc) => {
            return this.grid.Ywc(sc)
        }
        screenWidth(w) {
            return this.grid.screenWidth(w);
        }
        screenHeight(h) {
            return this.grid.screenHeight(h);
        }
        worldWidth(w) {
            return this.grid.worldWidth(w);
        }
        worldHeight(h) {
            return this.grid.worldHeight(h);
        }

        zoom = (min, max) => {

            let xw = this.xmax - this.xmin;
            let yw = this.ymax - this.ymin;
            let currentAspectRatio = xw / yw;
            if (currentAspectRatio < 10) {
                let targetAspectRatio = 10;
                let new_xw, new_yw;
                if (currentAspectRatio < targetAspectRatio) {
                    new_xw = yw * targetAspectRatio;
                    new_xw = Math.max(new_xw, Math.abs(xw));
                    this.xmin = (this.xmax + this.xmin) / 2 - new_xw / 2;
                    this.xmax = this.xmin + new_xw;
                } else {
                    new_yw = xw / targetAspectRatio;
                    new_yw = Math.max(new_yw, Math.abs(yw));
                    this.ymin = (this.ymax + this.ymin) / 2 - new_yw / 2;
                    this.ymax = this.ymin + new_yw;
                }
            } else {
                this.grid.setxmin(min);
                this.grid.setxmax(max);
            }
            if (this.canvas) {
                this.grid.setWidth(this.canvas.width)
                this.grid.setHeight(this.canvas.height)
            }
            this.grid.rescale();
        }

        drawBackdrop = () => {
            if (this.canvas) {

                let w = this.canvas.width;
                let h = this.canvas.height;
                if (w > this.maxwidth) {
                    w = this.maxwidth;
                }
                if (this.canvas.height > this.maxheight) {
                    h = this.maxheight;
                }
                this.grid.setWidth(w)
                this.grid.setHeight(h)
                this.grid.rescale();

                var ctx = this.canvas.getCTX();
                if (ctx) {
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'black';

                    let container = this.canvas.getContainer();
                    if (container != null && Math.abs(container.nativeElement.offsetWidth - this.canvas.width) > 20) {
                        if (container.nativeElement.offsetWidth > this.maxwidth)
                            this.canvas.width = this.maxwidth;
                        else
                            this.canvas.width = container.nativeElement.offsetWidth;

                    }
                    if (container != null && Math.abs(container.nativeElement.offsetHeight - this.canvas.height) > 20) {
                        if (container.nativeElement.offsetHeight > this.maxheight) {
                            this.canvas.height = this.maxheight;
                        } else {
                            this.canvas.height = container.nativeElement.offsetHeight;
                        }
                    }

                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
            }
        }

        setSize = async (w, h) => {
            if (this.canvas) {
                if (w > this.maxwidth) {
                    w = this.maxwidth;
                }
                if (h > this.maxheight) {
                    h = this.maxheight;
                }
                await this.canvas.setSize(w, h);
                await this.grid.setSize(w, h);
                await this.grid.rescale();
            }
        }
        getxmin = () => {
            return this.grid.getxmin();
        }
        getxmax = () => {
            return this.grid.getxmax();
        }
        getymin = () => {
            return this.grid.getymin();
        }
        getymax = () => {
            return this.grid.getymax();
        }

        setxmin = (xmin) => {
            this.grid.setxmin(xmin);
            this.grid.rescale();
        }
        setxmax = (xmax) => {
            this.grid.setxmax(xmax);
            this.grid.rescale();
        }
        setymin = (ymin) => {
            this.grid.setymin(ymin);
            this.grid.rescale();
        }
        setymax = (ymax) => {
            this.grid.setymax(ymax);
            this.grid.rescale();
        }
        plot = (xf, xy) => {
            if (this.canvas) {
                this.drawEllipse(this.grid.X(xf), this.grid.Y(xy));
            }
        }

        line = (xs, ys, xf, yf) => {
            if (this.canvas) {
                this.drawEllipse(this.grid.X(xf), this.grid.Y(xy));
            }
        }

    }
    return FlexiGraph;
}
