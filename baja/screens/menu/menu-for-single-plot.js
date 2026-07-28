function (plot, graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let registered = false;

        let resize = (plot) => {
            plot.highlight();
            graph.clearMouseListeners();
            graph.selectOff();
            let resize_it = false;
            let xi = 0;
            let yi = 0
            let origWidth = 0;
            let diffx = 0
            graph.addMouseDownListener(async (x, y) => {
                xi = x;
                yi = y;
                origWidth = graph.screenWidth(plot.w);

                if (plot.inside(graph, graph.X(x), graph.Y(y))) {
                    plot.highlight();
                }

                if (plot.inResize(graph.X(x), graph.Y(y))) {
                    plot.highlight();
                    resize_it = true;

                } else {
                    plot.unhighlight();
                }
            })
            graph.addMouseMoveListener((x, y) => {
                if (plot.inside(graph, graph.X(x), graph.Y(y))) {
                    plot.highlight();
                }
                if (resize_it) {
                    diffx = x - xi
                    plot.w = graph.worldWidth(origWidth + (diffx))
                    plot.grid.height = plot.grid.width;
                }
            });
            graph.addMouseUpListener((x, y) => {
                resize_it = false;
                plot.unhighlight();
                graph.setMouseMode('navigate')

            })
        }

        let labelPan = {
            wid: 'html',
            data: `${plot.name}`
        }
        let butPan = {
            wid: 'menu',
            width: 300,
            data: {
                title: '  ',
                style: 'sub-container',
                menus: [
                    {
                        'label': 'Data', 'items': [
                            {
                                'label': 'Lasso pts', "ionfunction": createIonFunction(async () => {
                                    graph.setMouseMode('menu')
                                    await exec('baja/bio/annotation-layer-plot-lasso.js', plot, graph, genegraph_panel_layout)

                                })
                            },
                            {
                                'label': 'Label pts', "ionfunction": createIonFunction(async () => {

                                    function getRandomColor() {
                                        const r = Math.floor(Math.random() * 256);
                                        const g = Math.floor(Math.random() * 256);
                                        const b = Math.floor(Math.random() * 256);
                                        return `rgb(${r},${g},${b},1)`;
                                    }
                                    let va = await prompt("RegEX", ["RegEX"], { "RegEX": '' }, 300, 300)
                                    let m = va['RegEX']
                                    if (m === null) {
                                        return;
                                    } else {
                                        plot.highlightPatterns.push({ "pattern": m, color: getRandomColor() })

                                    }

                                    graph.setMouseMode('navigate')
                                })

                            },
                            {
                                'label': 'Add track layer', 'ionfunction': createIonFunction(async (scx, scy) => {
                                    graph.setMouseMode('menu')
                                    let menuList = [
                                    ]
                                    for (let t of graph.track) {
                                        menuList.push({
                                            label: `${t.name}`,
                                            click: async () => {
                                                await exec('baja/screens/menu/cluster-objects-on-tracklayers-plot-panel.js', graph, graph.genegraph_panel_layout, plot, t)
                                            }
                                        })

                                    }
                                    graph.showWindowMenu(menuList, 10, 10, 200);

                                })
                            },
                            {
                                'label': 'Hide unlabeled pts', 'ionfunction': createIonFunction(async (scx, scy) => {

                                    plot.hideUnhighlighted();
                                    graph.setMouseMode('navigate')

                                })
                            },
                            {
                                'label': 'Show all pts', 'ionfunction': createIonFunction(async (scx, scy) => {

                                    plot.showUnhighlighted();
                                    graph.setMouseMode('navigate')

                                })
                            }
                        ]
                    }, {

                        'label': 'Edit', 'items': [
                            {
                                'label': 'Move', 'ionfunction': createIonFunction(async () => {
                                    graph.clearMouseListeners();
                                    graph.selectOff();
                                    plot.unhighlight();

                                    let move = false;
                                    xi = 0;
                                    yi = 0
                                    let diffx = 0
                                    let diffy = 0
                                    graph.addMouseDownListener(async (x, y) => {
                                        move = true;
                                        xi = x;
                                        yi = y;
                                        plot.x = x + (plot.x - x);
                                        diffx = (plot.x - x);
                                        diffy = (plot.y - y);

                                        if (plot.inside(graph, graph.X(x), graph.Y(y))) {
                                            plot.highlight();
                                        } else {
                                            plot.unhighlight();
                                        }

                                    })
                                    graph.addMouseMoveListener((x, y) => {
                                        if (move) {
                                            plot.x = x + diffx;
                                            plot.y = y + diffy
                                            console.log(" x y " + x + " y " + y)
                                        }
                                    });
                                    graph.addMouseUpListener((x, y) => {
                                        move = false;
                                        plot.unhighlight();
                                    })
                                })
                            },
                            {
                                'label': 'Resize', 'ionfunction': createIonFunction(async () => {

                                    resize(plot);
                                })
                            },
                            {
                                'label': 'Delete', 'ionfunction': createIonFunction(async () => {
                                    graph.setMessage(" Are you sure you want to remove this? ")

                                    let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete this?', async () => {
                                        const index = graph.plots.indexOf(plot);
                                        if (index !== -1) {
                                            graph.plots.splice(index, 1);
                                        }
                                        graph.setMouseMode('navigate')

                                    })
                                })
                            }

                        ]
                    }

                ]
            }
        }

        setTimeout(() => {

            CurrentLayout.clearComponent('buttonMenuPanel')
            CurrentLayout.setComponent('buttonMenuPanel', butPan);

        }, 100)

        resolve()
    })

}
