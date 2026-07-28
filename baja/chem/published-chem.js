function (lib) {

    clear();
    exec('baja/lib/db.js', lib).then(async (db) => {
        let MGrid = await exec('flexigraph/grid.js')
        let w = await showWidget({ wid: 'working' })

        let path = `/drives/${lib['id']}/root:/bajabio-xfiles/.chem/common-chem.xlsx`;
        let objectid = await db.getFileObjectID(path);
        let sheet = await db.loadSheet(lib['id'], objectid, 'siRNA', 'A1:C20')
        w.status = 'Complete'

        let chemistry = sheet.values;

        class Structure {
            canvas;
            obj;
            grid;
            sense = []
            antisense = []
            antisense_y_position = 0;
            antisense_start = 0;
            sense_start = 0;
            constructor(obj, canvas) {
                this.canvas = canvas;
                this.obj = obj;
                this.grid = new MGrid(0, 0, this.canvas.width, this.canvas.height);
                this.grid.xinset = 20;
                this.grid.yinset = 10;
                this.grid.xmin = 0;
                this.grid.ymin = 0;
                this.grid.xmax = 1;
                this.grid.xmin = 0;
                if (obj.antisense && obj.sense) {
                    this.grid.setymax(3);
                } else {
                    this.grid.setymax(2);
                }

                if (obj.sense) {

                    let t = obj.sense.split('.')
                    this.sense = [];
                    for (let s of t) {
                        if (s.indexOf('()') >= 0) {
                            s = s.replace('(', '')
                            s = s.replace(')', ' ')
                        }
                        this.sense.push(s)
                    }
                    if ((this.sense_start + this.sense.length) > this.grid.xmax) {
                        this.grid.xmax = this.sense.length + 1 + this.sense_start + 2;
                        this.grid.rescale();
                    }
                    this.antisense_y_position = 1;
                }
                if (obj.antisense_start) {
                    this.antisense_start = obj.antisense_start;
                }
                if (obj.sense_start) {
                    this.sense_start = obj.sense_start;
                }
                if (obj.antisense) {
                    let t = obj.antisense.split('.')
                    this.antisense = [];
                    for (let s of t) {
                        if (s.indexOf('()') >= 0) {
                            s = s.replace('(', '')
                            s = s.replace(')', ' ')
                        }
                        this.antisense.push(s)
                    }

                    if ((this.antisense_start + this.antisense.length) > this.grid.getxmax()) {
                        this.grid.xmax = this.antisense.length + 3 + this.antisense_start;
                        this.grid.rescale();
                    }
                }
                setInterval(() => {
                    this.draw();
                }, 500)
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

            draw() {
                if (this.canvas) {
                    this.grid.setWidth(this.canvas.width);
                    this.grid.setHeight(this.canvas.height);
                    this.grid.rescale();
                    var ctx = this.canvas.getCTX();
                    ctx.fillStyle = '#FEFEFE';

                    ctx.fillRect(this.grid.X(0), this.grid.Y(this.grid.getymax()), this.grid.screenWidth(this.grid.getxmax() - this.grid.getxmin()), this.grid.screenHeight(this.grid.getymax() - this.grid.getymin()));

                    ctx.fillStyle = 'gray';
                    ctx.fillText('AS:', 3, this.grid.Y(this.antisense_y_position) - 5);
                    ctx.stroke();
                    ctx.fillStyle = 'gray';
                    ctx.fillText('SS:', 3, this.grid.Y(0) - 5);
                    ctx.stroke();

                    if (this.antisense) {
                        let i = this.antisense_start;
                        for (let base of this.antisense) {
                            let tw = base.split(' ')
                            if (tw.length === 2) {
                                this.drawString(tw[0], i + 0.5, this.antisense_y_position, 'red')
                                if (tw[1].trim() === 'sp') {
                                    ctx.beginPath();
                                    ctx.arc(this.grid.X(i + 1.2), this.grid.Y(this.antisense_y_position + 0.5), 1, 1, 2 * Math.PI);
                                    ctx.stroke();

                                }
                            } else {
                                this.drawString(base, i + 0.5, this.antisense_y_position, 'red')
                            }
                            i++

                        }
                    }
                    if (this.sense) {
                        let i = this.sense_start;
                        for (let base of this.sense) {
                            let tw = base.split(' ')
                            if (tw.length === 2) {
                                this.drawString(tw[0], i + 0.5, 0, 'blue')
                                if (tw[1].trim() === 'sp') {
                                    ctx.beginPath();
                                    ctx.arc(this.grid.X(i + 1.2), this.grid.Y(0.5), 1, 1, 2 * Math.PI);
                                    ctx.stroke();
                                }
                            } else {
                                this.drawString(base, i + 0.5, 0, 'blue')
                            }
                            i++
                        }
                    }

                }

            }
        }

        let structures = [];
        let createComponent = async (jsonObject) => {
            let innerComponentCallback = createIonFunction((innerComponent) => {
                structures.push(new Structure(jsonObject, innerComponent))
            });
            let side_PanelCallback = createIonFunction((innerComponent) => {
                controlPanelCallback(innerComponent);
            });

            let card = {
                wid: 'canvas',
                refCallback: innerComponentCallback,
                data: {
                    'height': 70,
                    'mouseListener': createIonFunction((scx, scy) => {
                    }),
                    'mouseDownListener': createIonFunction((scx, scy) => {
                    }),
                    'mouseUpListener': createIonFunction((scx, scy) => {
                    }),
                    'mouseMoveListener': createIonFunction((scx, scy) => {
                    })
                }
            }
            return card;
        }

        let cards = [];
        let index = 0;
        for (let i of chemistry) {
            if (index > 0) {
                let jobject = JSON.parse(i[2])
                let comp = await createComponent(jobject);
                let header = {
                    wid: 'html',
                    data: `<h4> ${i[0]} </h4>
                        ${i[1]}

                    `
                }
                let buttonPanel = {
                    wid: 'mt-button',
                    data: {
                        buttons: [
                            {
                                'label': 'Design with this template...', ionfunction: createIonFunction(() => {
                                    console.log(' hello world ')
                                })
                            },
                            {
                                'label': 'Open in template editor', ionFunction: createIonFunction(() => {
                                    clear();
                                    exec('baja/chem/sirna-editor.js', jobject, lib)
                                })
                            },
                        ]
                    }
                }

                let c1 = {
                    wid: 'card',
                    data: {
                        'style.padding-top': '1px',
                        cards: [
                            [
                                {
                                    'component': header,
                                    width: '100%',

                                },
                                {
                                    'component': comp
                                },
                                {
                                    'component': buttonPanel,
                                    width: '100%'
                                }
                            ]]
                    }
                }
                await showWidget(c1);

            }
            index++;
        }

    });
}
