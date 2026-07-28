function () {

    let createSIRNAGlyph = async () => {
        let MGrid = await exec('flexigraph/grid.js');

        class SIRNAGlyph {
            canvas;
            grid;
            polymers = []

            constructor(canvas) {
                this.canvas = canvas;
                this.grid = new MGrid(0, 0, this.canvas.width, this.canvas.height);
                this.grid.xinset = 20;
                this.grid.yinset = 10;
                this.grid.xmin = 0;
                this.grid.ymin = 0;
                this.grid.xmax = 1;
                this.grid.xmin = 0;
                setInterval(() => {
                    this.draw();
                }, 500)
            }

            async parseChain(chain) {
                let polymer = await exec('baja/chem/parse-polymer.js', chain)
                this.polymers.push(polymer)
            }

            drawString(str, x, y, color) {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX();
                    if (!color) {
                        color = 'black'
                    }
                    ctx.fillStyle = color;
                    ctx.font = '13px serif';

                    ctx.fillText(str, this.grid.X(x), this.grid.Y(y) - 5);
                    ctx.stroke();
                }
            }

            mouseDown(scx, scy) {
                let x = this.grid.Xwc(scx)
                let y = this.grid.Ywc(scy)

            }

            draw() {
                if (this.canvas) {
                    this.grid.setWidth(this.canvas.width);
                    this.grid.setHeight(this.canvas.height);
                    this.grid.rescale();
                    let ctx = this.canvas.getCTX();
                    if (ctx) {
                        ctx.fillStyle = '#FEFEFE';

                        ctx.fillRect(this.grid.X(0), this.grid.Y(this.grid.getymax()), this.grid.screenWidth(this.grid.getxmax() - this.grid.getxmin()), this.grid.screenHeight(this.grid.getymax() - this.grid.getymin()));

                        ctx.fillStyle = 'black';

                        for (let polymer of this.polymers) {
                            polymer.draw(0, 0.5, this.canvas.width, this.canvas.height, ctx);
                        }
                    }
                }

            }
        }
        return (SIRNAGlyph)
    }

    let createComponent = async () => {

        return new Promise(async (resolve, reject) => {
            let SIRNAGlyph = await createSIRNAGlyph();

            let sigly = null;
            let innerComponentCallback = createIonFunction((innerComponent) => {
                sigly = new SIRNAGlyph(innerComponent)
                resolve(sigly)
            });
            let mode = 'new_chain'

            let card = {
                wid: 'canvas',
                refCallback: innerComponentCallback,
                data: {
                    'height': 360,
                    'mouseListener': createIonFunction((scx, scy) => {
                    }),
                    'mouseDownListener': createIonFunction(async (scx, scy) => {

                        if (mode === 'new_chain') {
                            let chain = 'r(G)p.m(a)p.r(G)p.m(a)p.r(A)p.m(u)p.r(A)p.m(u)p.r(U)p.m(u)p.r(C)p.m(a)p.r(C)p.m(c)p.r(C)p.m(u)p.r(U)p.m(c)p.r(A)'
                            let polymer = await exec('baja/chem/db/parse-polymer.js', chain);
                            sigly.polymers.push(polymer);

                        }

                    }),
                    'mouseUpListener': createIonFunction((scx, scy) => {
                    }),
                    'mouseMoveListener': createIonFunction((scx, scy) => {
                    })
                }
            }
            showWidget(card);
        })
    }
    structures = createComponent();

}
