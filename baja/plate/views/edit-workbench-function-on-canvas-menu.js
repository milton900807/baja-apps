function (pt, selectedWB) {

    return new Promise(async (resolve, reject) => {
        let Menu = await exec('flexigraph/menu.js');
        let FunFactory = await exec('baja/plate/views/fun-factory.js')

        console.log('debubg');
        if (!selectedWB) {
            return;
        }

        let fun = selectedWB.fun;

        if (!selectedWB.type) {
            return;
        }
        let menuList = []

        fun = await FunFactory.create(selectedWB.type)
        if (!fun) {
            console.log(" failed to find the function object for this.... ")
            menuList.push(
                {
                    label: `Delete function`,
                    click: (scx, scy) => {

                        pt.removeWBFunction(selectedWB);

                    },
                    move: () => {
                    }
                });

            let menu = new Menu(menuList, 0, 100)
            resolve(menu)
        }

        let editor;
        r = createIonFunction((p) => {
            editor = p;
        })

        let md = false;
        let smenu;
        let world_x;
        let world_y;

        let fs = fun.toString();
        let start = fs.indexOf('(')
        let end = fs.indexOf(')')
        let argline = fs.substring(start + 1, end);
        let args = argline.split(',')
        for (let arg of args) {
            menuList.push(
                {
                    label: `` + arg,
                    click: async (scx, scy) => {
                        let workbenchUX = await FunFactory.createUI(arg, pt, selectedWB);
                        if (workbenchUX != null) {
                            pt.updateworkbench(workbenchUX)
                        } else {
                            pt.updateworkbench({
                                world_x,
                                world_y,

                                mouseDownListener: async (x, y) => {
                                    let xw = pt.grid.Xwc(x);
                                    let yw = pt.grid.Ywc(y);
                                    pt.deselectPlateRoots();
                                    let v = pt.getPlate(xw, yw);
                                    if (v) {
                                        console.log(' v name ' + v.name)
                                        if (v && selectedWB) {
                                            selectedWB.setSource(arg, v);
                                            v.selectIt();
                                        }
                                    }
                                    md = true;
                                },
                                mouseMoveListener: async (x, y) => {
                                    let xw = (pt.grid.Xwc(x));
                                    let yw = (pt.grid.Ywc(y));
                                    pt.deselectPlateRoots();
                                    let v = pt.getPlate(xw, yw);
                                    if (v)
                                        v.selectIt();
                                    if (md) {

                                    }
                                },
                                mouseUpListener: async (x, y) => {
                                    let mmx = pt.grid.Xwc(x + 10);
                                    let mmy = pt.grid.Ywc(y + 10);
                                    md = false;
                                    pt.deselectPlateRoots();

                                    let m = await exec('baja/plate/views/edit-workbench-function-on-canvas.js', pt)
                                    pt.updateworkbench({
                                        mouseMoveListener: m.mouseMoveListener,
                                        mouseUpListener: m.mouseUpListener,
                                        mouseDownListener: m.mouseDownListener,
                                        draw: m.draw,
                                        menuManager: m.menuManager
                                    })
                                }
                                ,
                                draw: (grid, ctx) => {
                                    if (world_x != undefined && world_y != undefined) {
                                        ctx.lineWidth = 1;
                                        ctx.strokeStyle = 'lightBlue';
                                        ctx.beginPath();
                                        ctx.rect(0, grid.Y(world_y), ctx.canvas.width, grid.screenHeight(1));
                                        ctx.stroke();
                                    }
                                },
                                menuManager: (pt, ctx) => {
                                    if (smenu) {
                                        smenu.draw(ctx, pt.grid)
                                    }
                                }

                            })
                        }

                    },
                    move: () => {
                    }
                });
        }

        menuList.push(

            {
                label: ` `,
                click: (scx, scy) => {
                },
                move: () => {
                }
            });

        if (!selectedWB.complete) {
            menuList.push(
                {
                    label: `Mark Complete`,
                    click: (scx, scy) => {
                        selectedWB.complete = true;
                    },
                    move: () => {
                    }
                });
        } else {
            menuList.push(
                {
                    label: `Reset`,
                    click: (scx, scy) => {
                        selectedWB.complete = false;
                        selectedWB.removePlots();

                    },
                    move: () => {
                    }
                });

        }

        menuList.push(
            {
                label: `Edit function`,
                click: (scx, scy) => {
                    let v;

                    let export_sequence = {
                        wid: 'card',
                        componentRef: 'bottomPanel',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'width': '100%',
                                        'component': {
                                            wid: 'input-textarea-editor',
                                            data: {
                                                'text': selectedWB.fun.toString(),
                                                'showButton': false,
                                                'title': 'ID',

                                                'ionHookFunction': createIonFunction((input_box) => {
                                                    v = input_box;
                                                })
                                            }
                                        }
                                    },
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Save', ionFunction: createIonFunction(async () => {
                                                            hideAllModal();
                                                        })
                                                    },
                                                    {
                                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }
                    showModal(export_sequence)

                },
                move: () => {
                }
            });
        menuList.push(
            {
                label: `Delete function`,
                click: (scx, scy) => {

                    pt.removeWBFunction(selectedWB);

                },
                move: () => {
                }
            });

        menuList.push(

            {
                label: `Run`,
                click: async (scx, scy) => {
                    let data = await selectedWB.exec(pt);

                    const xValues = [];
                    const yValues = [];
                    const yLine = []

                    function generateData(eq, points) {
                        eq = eq.replace('x', '*x')
                        for (let p of points) {
                            xValues.push(p[0])
                            let x = p[0]
                            yLine.push(eval(eq))
                            yValues.push(p[1])
                        }
                    }
                    function glabels(points) {
                        return Object.keys(points)
                    }
                    function gvalues(points, index) {
                        let keys = Object.keys(points)
                        let gv = []
                        for (let p of keys) {
                            let v = points[p];
                            gv.push ( v[index])
                        }
                        return gv;
                    }
                    let eq = data.regression.string;
                    let points = data.regression.points;
                    let drawPointLabels = data.data;
                    points = points.sort(function (a, b) { return parseFloat(a[0]) - parseFloat(b[0]) });
                    let r2 = data.regression.r2;
                    generateData(eq, points);

                    let x_label = glabels ( drawPointLabels )
                    x_label = x_label.sort(function (a, b) { return parseFloat(a) - parseFloat(b) });

                    console.log('debubg');

                    let y_label1 = gvalues ( drawPointLabels, 0 )
                    y_label1 = y_label1.sort(function (a, b) { return parseFloat(a) - parseFloat(b) });

                    let y_label2 = gvalues ( drawPointLabels, 1 )
                    y_label2 = y_label2.sort(function (a, b) { return parseFloat(a) - parseFloat(b) });

                    let FlexiGraph = await exec('flexigraph/graph.js');
                    let graph = new FlexiGraph();
                    let plot = await graph.createFloatingCanvas();
                    plot.setX(pt.grid.X(selectedWB.x) + 30)
                    plot.setY(pt.grid.Y(selectedWB.y))
                    plot.setDimension(400, 400);
                    pt.zoomto(selectedWB.x - 0.5, selectedWB.y - 1, 2, 2);
                    let Chart = require('Chart')
                    const plugin = {
                        id: 'customCanvasBackgroundColor',
                        beforeDraw: (chart, args, options) => {
                            const { ctx } = chart;
                            ctx.save();
                            ctx.globalCompositeOperation = 'destination-over';
                            ctx.fillStyle = options.color || '#99ffff';
                            ctx.fillRect(0, 0, chart.width, chart.height);
                            ctx.restore();
                        }
                    };

                    plot.setTitle(eq + '  r^2 [ '  + r2 + ' ] ')

                    let c = new Chart(plot.canvas, {
                        data: {
                            labels: x_label,
                            datasets: [
                                {
                                    type: 'scatter',
                                    label: 'fsys',
                                    pointRadius: 5,
                                    borderColor: 'rgb(75, 192, 192)',
                                    data: y_label1,
                                    backgroundColor: [
                                        'rgb(255, 99, 132)',
                                        'rgb(54, 162, 235)',
                                        'rgb(255, 205, 86)'
                                    ],
                                },
                                {
                                    type: 'scatter',
                                    label: 'Dat2a',
                                    pointRadius: 5,
                                    borderColor: 'rgb(75, 192, 192)',
                                    data: y_label2,
                                    backgroundColor: [
                                        'rgb(255, 99, 132)',
                                        'rgb(54, 162, 235)',
                                        'rgb(255, 205, 86)'
                                    ],
                                },
                                {
                                    type: 'line',
                                    fill: true,
                                    pointRadius: 10,
                                    borderColor: "rgba(2,0,0,0.5)",
                                    data: yLine
                                }

                            ]
                        },
                        options: {

                            responsive: false,
                            maintainAspectRatio: false,

                            plugins: {
                                legend: {
                                    display: true,
                                    labels: {
                                        color: 'rgb(255, 99, 132)'
                                    }
                                },
                                customCanvasBackgroundColor: {
                                    color: 'lightGreen',
                                },
                                title: {
                                    display: true,
                                    text: eq + ' [' + r2 + ']',
                                    fontSize: 16,
                                    padding: {
                                        top: 10,
                                        bottom: 30
                                    }
                                },
                                subtitle: {
                                    display: true,
                                    text: 'Custom Chart Subtitle'
                                }
                            }
                        },

                    })

                    selectedWB.attachPlot(plot);
                    selectedWB.setComplete(true)
                },
                move: () => {
                }
            });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)

    })

}
