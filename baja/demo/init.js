function (slideShow) {

    let slidePath = slideShow;
    if (!slidePath || slidePath.length <= 0) {
        slidePath = 'baja/demo/slides.js';
    }

    mouseMode = 'structures'
    exec('flexigraph/gene.js').then(async (graph) => {
        let io;
        let tracks;
        graph.showChapters = true;
        graph.showDisplay = false;
        graph.showNavigationControl = false;
        graph.maxwidth = 500;

        let slides = await exec(slidePath)
        let Icon = await exec('flexigraph/shapes/icon.js')

        let slideIndex = 0;
        let currentChapter = null;

        let forward = async () => {
            graph.fadeOut((-0.20));
            slides = await exec(slidePath)
            let slide = slides[slideIndex]
            slideIndex++;

            if (slideIndex >= slides.length) {
                slideIndex = slides.length - 1;
            }
            if (slideIndex < 0) {
                slideIndex = 0;
            }

            if (currentChapter != slide.path) {
                setTimeout(async () => {
                    await graph.loadChapter(slide.path)

                    await graph.loadBookmark(slide.title);
                    graph.fadeIn(0.05);
0
                    currentChapter = slide.path;
               }, 1000);
                return;
            } else {

                setTimeout(async () => {
                    await graph.loadBookmark(slide.title);
                    graph.fadeIn(0.05);
                }, 500);
            }

        }
        let reverse = async () => {
            graph.fadeOut();
            slides = await exec(slidePath)
            let slide = slides[slideIndex]
            slideIndex--;

            if (slideIndex >= slides.length) {
                slideIndex = slides.length - 1;
            }
            if (slideIndex < 0) {
                slideIndex = 0;
            }

            if (currentChapter != slide.path) {
                setTimeout(async () => {

                    await graph.loadChapter(slide.path)
                    await graph.loadBookmark(slide.title);
                    currentChapter = slide.path;
                    graph.fadeIn();

                }, 1000);
                return;
            } else {
                setTimeout(async () => {
                    await graph.loadBookmark(slide.title);
                    setTimeout(async () => {
                        graph.fadeIn();
                    }, 200)
                }, 500);

            }
        }

        window.addEventListener('paste', (e) => {
            if (e.clipboardData == false) return false;
            var imgs = e.clipboardData.items;
            let loaded = false;
            var img = new Image();
            if (imgs == undefined) return false;
            for (var i = 0; i < imgs.length; i++) {
                if (imgs[i].type.indexOf("image") == -1) continue;
                var imgObj = imgs[i].getAsFile();
                var url = window.URL || window.webkitURL;
                let src = url.createObjectURL(imgObj);
                img.onload = function (e) {
                    loaded = true;
                };
                img.src = src;
            }
            graph.clearMouseListeners();
            graph.selectOff();
            let ed;
            const nameHook = createIonFunction((editor) => {
                ed = editor;
            })
            graph.addMouseMoveListener((x, y) => {

                if (loaded && img)
                    graph.drawImage(img, x, y, graph.worldWidth(img.width), graph.worldHeight(img.height));

            })
            graph.addMouseUpListener(async (x, y) => {
                if (loaded) {
                    let ic = new Icon('test', img, x, y, graph.worldWidth(img.width), graph.worldHeight(img.height));
                    graph.shapes.push(ic);
                    loaded = false;
                    img = null;

                }
            })

        });

        graph.addListener((_tracks) => {
            tracks = _tracks;

            let index = 0;
            let s = 0;
            let f = 10000;
            for (let t of tracks) {
                if (index === 0) {
                    s = t.xi;
                    f = t.xf;
                }
                if (s > t.xi) {
                    s = t.xi;
                }
                if (f < t.xf) {
                    f = t.xf
                }
            }

        });

        let add = (str) => {
            if (str.startsWith('>')) {
                graph.fasta(str.trim());
            }
            else {
                graph.add(str)
            }
        }
        let zoom = (xi, xf) => {
            graph.zoom(xi, xf)
        }

        let track_items = []
        let working = await showWidget({
            wid: 'working'
        })

        track_items.push({
            'label': 'Set Track', ionfunction: createIonFunction(() => {
                exec('baja/screens/modal/set-track.js', graph)
            })
        })
        track_items.push({
            'label': 'Drag Track', ionfunction: createIonFunction(() => {
                exec('baja/screens/modal/clear-tracks.js', graph)

            })
        })
        track_items.push({
            'label': 'Resize Track', ionfunction: createIonFunction(async () => {
                await exec('baja/screens/menu/resize-track.js', graph, io)

            })
        })
        track_items.push({
            'label': 'Move Track', ionfunction: createIonFunction(async () => {
                await exec('baja/screens/menu/translate-track.js', graph, io)

            })
        })

        track_items.push({
            'label': 'Left Justify all tracks', 'ionfunction': createIonFunction(() => {
                let tracks = graph.getTracks();
                for (let t of tracks) {
                    t.setTrackCoordinates(1, -1);
                }
            })
        })
        track_items.push({
            'label': 'Clear All', 'ionfunction': createIonFunction(() => {
                exec('baja/screens/modal/clear-tracks.js', graph)
            })
        })

        track_items.push({
            'label': 'Add+', 'ionfunction': createIonFunction(() => {
                exec('baja/screens/add-track.js', graph)
            })
        })
        let exptracks = {
            'label': 'Tracks', 'items': track_items
        }

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 25,
                'grid': {
                    xmin: 0,
                    xmax: 40,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },

                'buttons': [
                    {
                        x: 0, y: 0, label: 'Left', ionFunction: createIonFunction(async () => {

                            if (this.dr === 'f') {
                                slideIndex -= 2;
                            }
                            await reverse();
                            this.dr = 'r'
                        }), icon: '/assets/img/icons/png/sleft.png'
                    },
                    {
                        x: 2, y: 0, label: 'Right', ionFunction: createIonFunction(async () => {

                            if (this.dr === 'r') {
                                if (slideIndex === 0) {
                                    slideIndex = 1;
                                } else
                                    slideIndex += 2;
                            }

                            await forward();
                            this.dr = 'f'

                        }), icon: '/assets/img/icons/png/sright.png'
                    },

                    {
                        x: 8, y: 0, label: 'Zoom out', ionFunction: createIonFunction( async () => {
                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            let ly = (graph.getymax() - graph.getymin()) / 20;
                            await graph.zoomXY(graph.getxmin() - l, graph.getxmax() + l, graph.getymin() - ly, graph.getymax() + ly);
                        }), icon: '/assets/img/icons/png/zoom-out.png'
                    },
                    {
                        x: 10, y: 0, label: 'zoom in', ionFunction: createIonFunction(async () => {

                            let l = (graph.getxmax() - graph.getxmin()) / 4;
                            let ly = (graph.getymax() - graph.getymin()) / 20;
                            await graph.zoomXY(graph.getxmin() + l, graph.getxmax() - l, graph.getymin() + ly, graph.getymax() - ly);

                        }), icon: '/assets/img/icons/png/zoom-in.png'
                    },

                    {
                        x: 5, y: 0, label: 'Bookmark', ionFunction: createIonFunction(async () => {

                            if (graph.showBookmarks)
                                graph.showBookmarks = false;
                            else
                                graph.showBookmarkMenu();

                        }), icon: '/assets/img/icons/png/bookmark.png'

                    }

                ]

            }
        }

        let geneGraph = await graph.createComponent();
        let main_layout = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': button_canvas
                        },
                        {
                            'width': '100%',
                            'component': geneGraph
                        }
                    ]]
            }
        }

        await showWidget(
            main_layout
        );

        working.status = 'complete'

        slides = await exec('baja/demo/slides.js')
        await forward();

    })

}
