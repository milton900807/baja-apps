function (graph) {

    return new Promise(async (resolve, reject) => {

        exec('baja/manchester/modal/label-bookmark.js', graph).then(async m => {

            graph.setMouseMode("navigate")

            let xmac_ = 40
            let height = 24;
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
                            graph.showMenu(null)
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
                            const direction = 'right';
                            graph.panGridSlide(direction, { fromScreen: { x: graph.graph.grid.width / 2, y: graph.graph.grid.height / 2 } })

                        }), icon: await exec('icons/svg/left'), mouseOver: createIonFunction(() => {
                            graph.setMessage(" Move left ")
                        })
                    },
                    {
                        x: 2, y: 0, label: 'Right', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            graph.setMessage(" Drag a rectangle ")
                            graph.setMouseMode('none')

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            const direction = 'left';
                            graph.panGridSlide(direction, { fromScreen: { x: graph.graph.grid.width / 2, y: graph.graph.grid.height / 2 } })
                        }), icon: await exec('icons/svg/right'), mouseOver: createIonFunction(() => {
                            graph.setMessage(" Move right ")
                        })
                    },
                    {
                        x: 4, y: 0, label: 'Up', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            const direction = 'down';
                            graph.panGridSlide(direction, { fromScreen: { x: graph.graph.grid.width / 2, y: graph.graph.grid.height / 2 } })

                        }), icon: await exec('icons/svg/up'), mouseOver: createIonFunction(() => {
                            graph.setMessage(" Move up ")
                        })
                    },
                    {
                        x: 6, y: 0, label: 'Down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            const direction = 'up';
                            graph.panGridSlide(direction, { fromScreen: { x: graph.graph.grid.width / 2, y: graph.graph.grid.height / 2 } })

                        }), icon: await exec('icons/svg/down'), mouseOver: createIonFunction(() => {
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
                        }), icon: await exec('icons/svg/zoomout'), mouseOver: createIonFunction(() => {
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

                        }), icon: await exec('icons/svg/zoomin'), mouseOver: createIonFunction(() => {
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

                        }), icon: await exec('icons/svg/contractY'), mouseOver: createIonFunction(() => {
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
                        }), icon: await exec('icons/svg/expandY'), mouseOver: createIonFunction(() => {
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
                        }), icon: await exec('icons/svg/contract')
                    },
                    {
                        x: 18, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Expand in the x direction ')

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            graph.zoom(graph.getxmin() + l, graph.getxmax() - l);
                        }), icon: await exec('icons/svg/expand')
                    },

                    {
                        x: 28, y: 0, label: 'Bookmark', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Create a bookmark')

                            showModal(m)
                        }), icon: await exec('icons/svg/bookmark'), mouseOver: createIonFunction(() => {
                            graph.setMessage("Create a bookmark ")
                        })

                    },
                    {
                        x: 30, y: 0, label: 'Show Bookmark', ionFunction: createIonFunction(async () => {

                            graph.setMessage('Show bookmark menu')

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.showBookmarkMenu();
                        }), icon: await exec('icons/svg/bookmarks'), mouseOver: createIonFunction(() => {
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

                            const ssubmenu = [
                                {
                                    label: `Draw text`,
                                    click: async () => {
                                        await exec('baja/manchester/menu/text-box-action.js', graph)
                                        graph.showSideMenu(null);
                                    }
                                },
                                {
                                    label: `Rectangle`,
                                    click: async () => {
                                        await exec('baja/manchester/menu/draw-rect-action.js', graph)
                                        graph.showSideMenu(null);
                                    }
                                }, {
                                    label: `Oval`,
                                    click: async () => {
                                        await exec('baja/manchester/menu/draw-oval-action.js', graph)
                                        graph.showSideMenu(null);
                                    }
                                },
                                {
                                    label: `Arrow`,
                                    click: async () => {
                                        await exec('baja/manchester/menu/draw-line-action.js', graph)
                                        graph.showSideMenu(null);
                                    }
                                },
                                {
                                    label: `Highlight Compounds`,
                                    click: async () => {
                                        graph.setMessage(" Highlight compounds ")
                                        for (let t of graph.track) {
                                            t.quickHighlightOligos();
                                        }
                                        graph.showSideMenu(null);
                                    }
                                }
                            ];

                            graph.showMenu(ssubmenu)
                            graph.showSideMenu(null);
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

                        })

                    }, {
                        x: 24, y: 0, label: 'Move options', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            graph.setMessage('Move the window by clicking and dragging')
                            graph.showMenu(null)
                            graph.showSideMenu(null);

                        }), icon: await exec('icons/svg/panxy'), mouseOver: createIonFunction(() => {
                            graph.setMessage(" Mouse move canvas ")
                        })

                    }, {
                        x: 26, y: 0, label: 'Box zoom', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMessage("Zoom:  Drag a rectangle ")
                            graph.setMouseMode('none')
                            graph.showMenu(null)
                            graph.showSideMenu(null);

                            await exec('baja/manchester/menu/zoom-box.js', graph)

                        }), icon: await exec('icons/svg/rect'), mouseOver: createIonFunction(() => {
                            graph.setMessage(" Drag a box to zoom  ")
                        })

                    },
                    {
                        x: 32, y: 0, label: 'Lasso things', ionFunction: createIonFunction(() => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('none')
                            graph.setMessage("Lasso things.")
                            let lassoPolygon = [];
                            let isDrawing = false;
                            graph.showMenu(null)
                            graph.showSideMenu(null);

                            let lasso = {
                                id: 'lasso-select-table',
                                priority: true,
                                mouseMoveListener: (x, y) => {
                                    if (!isDrawing) return;
                                    lassoPolygon.push({ x: graph.X(x), y: graph.Y(y) });
                                },
                                mouseUpListener: (x, y) => {
                                    if (!isDrawing) {
                                        return;
                                    }
                                    isDrawing = false;
                                    setTimeout(() => {
                                        lassoPolygon.push({ x: graph.X(x), y: graph.Y(y) });
                                        if (lassoPolygon.length > 1) {
                                            lassoPolygon.push({ x: lassoPolygon[0].x, y: lassoPolygon[0].y });
                                        }
                                        let scPolygon = lassoPolygon.map(point => {
                                            return {
                                                x: graph.Xwc(point.x),
                                                y: graph.Ywc(point.y)
                                            };
                                        });
                                        let mef = []
                                        for (let selectedTrack of graph.track) {
                                            let features = selectedTrack.getFeaturesWithinPolygon(scPolygon)
                                            mef = mef.concat(graph.buildMenuFromFeatures(features, scPolygon))
                                        }
                                        graph.showSideMenu(mef)
                                        setTimeout(() => {
                                            graph.clearMouseListeners();
                                            graph.setMouseMode("navigate")

                                        }, 1000)

                                        graph.currentShape = {
                                            draw: (graph) => {
                                                const ctx = graph.canvas.getCTX();
                                                if (!lassoPolygon || lassoPolygon.length === 0) return;

                                                const t = performance.now() * 0.004;
                                                const pulse01 = 0.5 + 0.5 * Math.sin(t);

                                                const baseLineWidth = 2;
                                                const pulseLineWidth = baseLineWidth + pulse01 * 2;
                                                const glowBlur = 6 + pulse01 * 10;

                                                const strokeAlpha = 0.55 + pulse01 * 0.35;
                                                const fillAlpha = 0.10 + pulse01 * 0.10;

                                                const glowColor = `rgba(0, 180, 255, ${strokeAlpha})`;
                                                const coreColor = `rgba(255, 255, 255, ${Math.min(1, strokeAlpha + 0.15)})`;
                                                const fillColor = `rgba(0, 180, 255, ${fillAlpha})`;

                                                ctx.save();
                                                ctx.beginPath();
                                                ctx.moveTo(lassoPolygon[0].x, lassoPolygon[0].y);
                                                for (let i = 1; i < lassoPolygon.length; i++) {
                                                    ctx.lineTo(lassoPolygon[i].x, lassoPolygon[i].y);
                                                }

                                                const shouldClose = !isDrawing;
                                                if (shouldClose) ctx.closePath();

                                                if (shouldClose) {
                                                    ctx.fillStyle = fillColor;
                                                    ctx.fill();
                                                }

                                                ctx.strokeStyle = glowColor;
                                                ctx.lineWidth = pulseLineWidth;
                                                ctx.lineJoin = "round";
                                                ctx.lineCap = "round";
                                                ctx.shadowColor = glowColor;
                                                ctx.shadowBlur = glowBlur;
                                                ctx.stroke();

                                                ctx.shadowBlur = 0;
                                                ctx.strokeStyle = coreColor;
                                                ctx.lineWidth = Math.max(1, baseLineWidth);
                                                ctx.stroke();

                                                ctx.restore();
                                            }
                                        };
                                    }, 100)

                                },
                                mouseDownListener: (x, y) => {
                                    isDrawing = true;
                                    lassoPolygon = [{ x: graph.X(x), y: graph.Y(y) }];
                                },
                                draw: (graph) => {
                                    const ctx = graph.canvas.getCTX();
                                    ctx.strokeStyle = 'black';
                                    ctx.lineWidth = 2;
                                    if (lassoPolygon && lassoPolygon.length > 0) {
                                        ctx.beginPath();
                                        ctx.moveTo((lassoPolygon[0].x), (lassoPolygon[0].y));
                                        for (let i = 1; i < lassoPolygon.length; i++) {
                                            let lx = (lassoPolygon[i].x);
                                            let ly = (lassoPolygon[i].y);
                                            ctx.lineTo(lx, ly);
                                        }
                                        if (!isDrawing)
                                            ctx.closePath();
                                        ctx.stroke();
                                    }
                                },
                            }
                            graph.addMouseDownListener(lasso.mouseDownListener)
                            graph.addMouseUpListener(lasso.mouseUpListener)
                            graph.addMouseMoveListener(lasso.mouseMoveListener)
                            graph.currentShape = lasso;

                        }), icon: '/assets/img/icons/png/lasso.svg'

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
                    'buttons': buttons,
                    'background': 'white'
                }
            }

            // Expose the raw button list so callers (e.g. the menubar) can render
            // these controls as icon buttons without re-parsing the canvas widget.
            button_canvas.buttons = buttons;

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
                        'buttons': bbuttons,
                        'background': 'white'
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

                // Flat list of all mobile controls, for menubar rendering.
                buttonMenuPanel.buttons = buttons.concat(bbuttons);

                return resolve(buttonMenuPanel)
            }
        })

    })
}
