function (graph) {

    return new Promise(async (resolve, reject) => {

        exec('baja/manchester/modal/label-bookmark.js', graph).then(async m => {

            graph.setMouseMode("navigate")

            let xmac_ = 40
            let height = 26;
            let buttons = []
            let bbuttons = []

            if (isMobile()) {
                buttons = [
                    {
                        x: 0, y: 0, label: 'Left', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            let ly = (graph.getymax() - graph.getymin()) / 4;
                            graph.zoom(graph.getxmin() - l, graph.getxmax() - l);
                        }), icon: '/assets/img/icons/pn/left.svg'
                    },
                    {
                        x: 2, y: 0, label: 'Right', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            graph.setMessage(" Drag a rectangle ")
                            graph.setMouseMode('none')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            graph.zoom(graph.getxmin() + l, graph.getxmax() + l);
                        }), icon: '/assets/img/icons/png/right.svg'
                    },
                    {
                        x: 4, y: 0, label: 'Up', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getymax() - graph.getymin()) / 8;
                            graph.clearMouseListeners();
                            graph.setMessage(" Drag a rectangle ")
                            graph.setMouseMode('none')

                            graph.setymax(graph.getymax() + l);
                            graph.setymin(graph.getymin() + l);

                        }), icon: '/assets/img/icons/png/up.svg'
                    },
                    {
                        x: 6, y: 0, label: 'Down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getymax() - graph.getymin()) / 8;
                            graph.setymax(graph.getymax() - l);
                            graph.setymin(graph.getymin() - l);
                        }), icon: '/assets/img/icons/png/down.svg'
                    },
                    {
                        x: 8, y: 0, label: 'Zoom out', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            let ly = (graph.getymax() - graph.getymin()) / 20;
                            await graph.zoomXY(graph.getxmin() - l, graph.getxmax() + l, graph.getymin() - ly, graph.getymax() + ly);
                        }), icon: '/assets/img/icons/png/zoom-out.svg'
                    },

                    {
                        x: 10, y: 0, label: 'zoom in', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            let ly = (graph.getymax() - graph.getymin()) / 20;
                            await graph.zoomXY(graph.getxmin() + l, graph.getxmax() - l, graph.getymin() + ly, graph.getymax() - ly);

                        }), icon: '/assets/img/icons/png/zoom-in.svg'
                    },
                    {
                        x: 12, y: 0, label: 'expand up', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getymax() - graph.getymin()) / 8;
                            graph.setymax(graph.getymax() + l);
                            graph.setymin(graph.getymin() - l);

                        }), icon: '/assets/img/icons/png/yless.svg'
                    },
                    {
                        x: 14, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getymax() - graph.getymin()) / 8;
                            graph.setymax(graph.getymax() - l);
                            graph.setymin(graph.getymin() + l);

                        }), icon: '/assets/img/icons/png/ymore.svg'
                    },

                    {
                        x: 16, y: 0, label: 'Bookmark', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Create a bookmark')

                            showModal(m)
                        }), icon: '/assets/img/icons/png/bookmark.svg'

                    },
                    {
                        x: 18, y: 0, label: 'Show Bookmark', ionFunction: createIonFunction(async () => {

                            graph.setMessage('Show bookmark menu')

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.showBookmarkMenu();
                        }), icon: '/assets/img/icons/png/bookmarks.svg'

                    },
                ]
                bbuttons = [
                    {
                        x: 0, y: 0, label: 'Show Tracks', ionFunction: createIonFunction(async () => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Click on the tracks menu below')

                            graph.showTracksMenu();
                        }), icon: '/assets/img/icons/png/menu-bar.svg'

                    },
                    {
                        x: 2, y: 0, label: 'Map Oligos', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                            graph.setMessage("Highlighting oligos")
                            graph.setMessage('Highlight the compounds on all tracks')

                            let xstart = graph.graph.Xwc(0);
                            let ystart = graph.graph.Ywc(0);
                            let width = graph.graph.worldWidth(graph.graph.canvas.width)
                            let height = graph.graph.worldHeight(graph.graph.canvas.height)

                            let total = []
                            for (let t of graph.track) {
                                t.showOligoMap = true;
                            }

                            setTimeout(() => {
                                for (let t of graph.track) {
                                    t.showOligoMap = false;
                                }
                            }, 10500)

                        }), icon: '/assets/img/icons/png/highlight.svg'

                    },
                    {
                        x: 4, y: 0, label: 'Move options', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Move the window by clicking and dragging')

                        }), icon: '/assets/img/icons/png/pan.svg'

                    }, {
                        x: 6, y: 0, label: 'Box zoom', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMessage("Zoom:  Drag a rectangle ")
                            graph.setMouseMode('none')
                            await exec('baja/manchester/menu/zoom-box.js', graph)
                        }), icon: '/assets/img/icons/png/box-zoom.svg'

                    },

                    {
                        x: 8, y: 0, label: 'resize x', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Contract in x direction')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            graph.zoom(graph.getxmin() - l, graph.getxmax() + l);
                        }), icon: '/assets/img/icons/png/collapse.svg'
                    },
                    {
                        x: 10, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Expand in the x direction ')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            graph.zoom(graph.getxmin() + l, graph.getxmax() - l);
                        }), icon: '/assets/img/icons/png/expand.svg'
                    }
                    ,
                    {
                        x: 12, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('none')
                        }), icon: '/assets/img/icons/png/pan.svg'

                    }
                    ,

                ]
            } else {
                buttons = [
                    {
                        x: 0, y: 0, label: 'Left', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            let ly = (graph.getymax() - graph.getymin()) / 4;
                            graph.zoom(graph.getxmin() - l, graph.getxmax() - l);
                        }), icon: '/assets/img/icons/png/left.svg', mouseOver: createIonFunction(() => {
                        })
                    },
                    {
                        x: 2, y: 0, label: 'Right', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            graph.setMessage(" Drag a rectangle ")
                            graph.setMouseMode('none')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            graph.zoom(graph.getxmin() + l, graph.getxmax() + l);
                        }), icon: '/assets/img/icons/png/right.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage(" Move right ")
                        })
                    },
                    {
                        x: 4, y: 0, label: 'Up', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getymax() - graph.getymin()) / 8;
                            graph.clearMouseListeners();
                            graph.setMessage(" Drag a rectangle ")
                            graph.setMouseMode('none')

                            graph.setymax(graph.getymax() + l);
                            graph.setymin(graph.getymin() + l);

                        }), icon: '/assets/img/icons/png/up.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage(" Move up ")
                        })
                    },
                    {
                        x: 6, y: 0, label: 'Down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getymax() - graph.getymin()) / 8;
                            graph.setymax(graph.getymax() - l);
                            graph.setymin(graph.getymin() - l);
                        }), icon: '/assets/img/icons/png/down.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage(" Move down ")
                        })
                    },
                    {
                        x: 8, y: 0, label: 'Zoom out', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            let ly = (graph.getymax() - graph.getymin()) / 20;
                            await graph.zoomXY(graph.getxmin() - l, graph.getxmax() + l, graph.getymin() - ly, graph.getymax() + ly);
                        }), icon: '/assets/img/icons/png/zoom-out.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage(" Zoom out")
                        })
                    },
                    {
                        x: 10, y: 0, label: 'zoom in', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            let ly = (graph.getymax() - graph.getymin()) / 20;
                            await graph.zoomXY(graph.getxmin() + l, graph.getxmax() - l, graph.getymin() + ly, graph.getymax() - ly);

                        }), icon: '/assets/img/icons/png/zoom-in.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage(" Zoom in ")
                        })
                    },
                    {
                        x: 12, y: 0, label: 'expand up', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let l = (graph.getymax() - graph.getymin()) / 8;
                            graph.setymax(graph.getymax() + l);
                            graph.setymin(graph.getymin() - l);

                        }), icon: '/assets/img/icons/png/yless.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage(" Contract Y direction ")
                        })
                    },
                    {
                        x: 14, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            let l = (graph.getymax() - graph.getymin()) / 8;
                            graph.setymax(graph.getymax() - l);
                            graph.setymin(graph.getymin() + l);
                        }), icon: '/assets/img/icons/png/ymore.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage(" Expand Y direction ")
                        })
                    },

                    {
                        x: 16, y: 0, label: 'resize x', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Contract in x direction')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            graph.zoom(graph.getxmin() - l, graph.getxmax() + l);
                        }), icon: '/assets/img/icons/png/collapse.svg'
                    },
                    {
                        x: 18, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Expand in the x direction ')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            graph.zoom(graph.getxmin() + l, graph.getxmax() - l);
                        }), icon: '/assets/img/icons/png/expand.svg'
                    },

                    {
                        x: 28, y: 0, label: 'Bookmark', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Create a bookmark')

                            showModal(m)
                        }), icon: '/assets/img/icons/png/bookmark.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage("Create a bookmark ")
                        })

                    },
                    {
                        x: 30, y: 0, label: 'Show Bookmark', ionFunction: createIonFunction(async () => {

                            graph.setMessage('Show bookmark menu')

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.showBookmarkMenu();
                        }), icon: '/assets/img/icons/png/bookmarks.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage("Show bookmarks")
                        })

                    },
                    {
                        x: 20, y: 0, label: 'Show Tracks', ionFunction: createIonFunction(async () => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Click on the tracks menu below')

                            graph.showTracksMenu();
                        }), icon: '/assets/img/icons/png/menu-bar.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage("Show track menu  ")
                        })

                    },
                    {
                        x: 22, y: 0, label: 'Map Oligos', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                            graph.setMessage("Highlighting oligos")
                            graph.setMessage('Highlight the compounds on all tracks')

                            let xstart = graph.graph.Xwc(0);
                            let ystart = graph.graph.Ywc(0);
                            let width = graph.graph.worldWidth(graph.graph.canvas.width)
                            let height = graph.graph.worldHeight(graph.graph.canvas.height)
                            let total = []
                            for (let t of graph.track) {
                                t.showOligoMap = true;
                            }

                            setTimeout(() => {
                                for (let t of graph.track) {
                                    t.showOligoMap = false;
                                }
                            }, 10500)

                        }), icon: '/assets/img/icons/png/highlight.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage(" Highlight oligos ")
                        })

                    }, {
                        x: 24, y: 0, label: 'Move options', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Move the window by clicking and dragging')

                        }), icon: '/assets/img/icons/png/pan.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage(" Mouse move canvas ")
                        })

                    }, {
                        x: 26, y: 0, label: 'Box zoom', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMessage("Zoom:  Drag a rectangle ")
                            graph.setMouseMode('none')
                            await exec('baja/manchester/menu/zoom-box.js', graph)
                        }), icon: '/assets/img/icons/png/box-zoom.svg', mouseOver: createIonFunction(() => {
                            graph.setMessage(" Drag a box to zoom  ")
                        })

                    },

                    {
                        x: 32, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('none')
                            graph.setMessage("Freeze canvas.")
                        }), icon: '/assets/img/icons/png/front-hand.svg'

                    },

                ]
            }

            let button_canvas = {
                wid: 'button-canvas',
                data: {
                    'title': 'controls',
                    'height': height,
                    'grid': {
                        xmin: 0,
                        xmax: xmac_,
                        ymin: -0.01,
                        ymax: 1,
                        xinset: 0,
                        yinset: 0
                    },
                    'buttons': buttons
                }
            }

            if (!isMobile()) {
                resolve(button_canvas)
            } else {

                let bottom_button_canvas = {
                    wid: 'button-canvas',
                    data: {
                        'title': 'controls',
                        'height': height,
                        'grid': {
                            xmin: 0,
                            xmax: xmac_,
                            ymin: -0.01,
                            ymax: 1,
                            xinset: 0,
                            yinset: 0
                        },
                        'buttons': bbuttons
                    }
                }

                let buttonMenuPanel = {
                    wid: 'card',
                    data: {
                        cards: [
                            [
                                {
                                    'title': '',
                                    'component': button_canvas
                                }
                                ,
                                {
                                    'title': '',
                                    'component': bottom_button_canvas

                                }
                            ]]
                    }
                }

                return resolve(buttonMenuPanel)
            }
        })

    })
}
