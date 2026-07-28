function () {

    return new Promise(async (resolve, reject) => {

        let MGrid = await exec('flexigraph/grid.js');

        class PolymerGlyph {
            canvas;
            obj;
            grid;
            sense = []
            antisense = []
            antisense_y_position = 0;
            antisense_start = 0;
            sense_start = 0;
            mode = 'align'
            listeners = [];

            constructor(obj, canvas) {
                this.canvas = canvas;
                this.obj = obj;
                this.grid = new MGrid(0, 0, this.canvas.width, this.canvas.height);
                this.grid.xinset = 10;
                this.grid.yinset = 10;
                this.grid.xmin = 0;
                this.grid.ymin = 0;
                this.grid.xmax = 1;
                this.grid.xmin = 0;
                if (obj && obj.antisense && obj.sense) {
                    this.grid.setymax(3);
                } else {
                    this.grid.setymax(2);
                }
                this.setObj(obj);
                setInterval(() => {
                    this.draw();
                }, 500)
            }

            addListener(listener) {
                this.listeners.push(listener);
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

            setMode(mode) {
                this.mode = mode;
            }

            selectChain(chain_selected) {
                for (let l of this.listeners) {
                    l.chainSelected(chain_selected);
                }
            }

            mouseDown(scx, scy) {
                let x = this.grid.Xwc(scx)
                let y = this.grid.Ywc(scy)

                if (this.mode === 'chain_select') {
                    if (y >= this.antisense_y_position) {
                        return this.selectChain({ label: 'antisense', structure: this.createTemplate(this.antisense) });
                    } else {
                        return this.selectChain({ label: 'sense', structure: this.createTemplate(this.sense) });
                    }
                } else {
                    if (y >= this.antisense_y_position) {
                        this.antisense_start = Math.floor(x);
                    } else {
                        this.sense_start = Math.floor(x);

                    }
                    if ((this.sense_start + this.sense.length) > this.grid.xmax) {
                        this.grid.xmax = this.sense.length + 1 + this.sense_start + 2;
                        this.grid.rescale();
                    }
                    if ((this.antisense_start + this.antisense.length) > this.grid.getxmax()) {
                        this.grid.xmax = this.antisense.length + 3 + this.antisense_start;
                        this.grid.rescale();
                    }
                }
            }

            setObj(obj) {
                this.obj = obj;

                if (obj && obj.sense) {

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

                if (obj && obj.antisense_start) {
                    this.antisense_start = obj.antisense_start;
                }
                if (obj && obj.sense_start) {
                    this.sense_start = obj.sense_start;
                }
                if (obj && obj.antisense) {
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

            }

            setSense(sense) {
                let t = sense.split('.')
                this.sense = [];
                for (let s of t) {
                    if (s.indexOf('()') >= 0) {
                        s = s.replace('(', '')
                        s = s.replace(')', ' ')
                    }
                    this.sense.push(s)
                }
            }
            setAntisense(antisense) {
                let t = antisense.split('.')
                this.antisense = [];
                for (let s of t) {
                    if (s.indexOf('()') >= 0) {
                        s = s.replace('(', '')
                        s = s.replace(')', ' ')
                    }
                    this.antisense.push(s)
                }
            }

            draw(y) {

                if (this.canvas) {
                    this.grid.setWidth(this.canvas.width);
                    this.grid.setHeight(this.canvas.height);
                    this.grid.rescale();
                    var ctx = this.canvas.getCTX();
                    ctx.fillStyle = 'lightGray';

                    ctx.fillRect(this.grid.X(0), this.grid.Y(this.grid.getymax()), this.grid.screenWidth(this.grid.getxmax() - this.grid.getxmin()), this.grid.screenHeight(this.grid.getymax() - this.grid.getymin()));

                    ctx.fillStyle = 'black';
                    ctx.fillText('AS:', 3, this.grid.Y(this.antisense_y_position) - 5);
                    ctx.stroke();
                    ctx.fillStyle = 'black';
                    ctx.fillText('SS:', 3, this.grid.Y(0) - 5);
                    ctx.stroke();
                    if (this.obj && this.obj.structure) {
                        if (this.obj.structure.indexOf('[') >= 0) {
                            let nucleotides = this.obj.structure.split ( '\.')

                            for (let base of nucleotides) {
                                this.drawString(this.obj.structure, 0, this.antisense_y_position, 'red')
                            }
                        } else {

                            for (let base of this.obj.structure) {
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

                            }
                        }

                    } else {

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

            createTemplate(strand) {
                let t = '';
                for (let i of strand) {
                    i = i.trim();
                    if (i.indexOf('(') > 0)
                        t += '.' + i;
                    else {
                        t += '.' + i.replace(' ', '()')
                    }
                }
                if (t.startsWith('.')) {
                    t = t.substring(1).trim();
                }
                if (t.endsWith('.')) {
                    t = t.substring(0, t.length - 1);
                }

                return t;
            }

            getSense() {
                return this.createTemplate(this.sense);
            }
            getAntisense() {
                return this.createTemplate(this.antisense);
            }
            getAntisenseStart() {
                return this.antisense_start;
            }
            getSenseStart() {
                return this.sense_start;
            }

        }
        return resolve(PolymerGlyph);
    })
}
