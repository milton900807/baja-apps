function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let canvas = null;
        let innerComponentCallback = createIonFunction((panel) => {
            canvas = panel;
        })

        let ml = new MLCanvas ( )

        let pixheight = 800;
        let pixwidth = 300;
        let t = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            width: '100%',
                            'component': {
                                wid: 'html',
                                data: `<hr>
                                `
                            }
                        },
                        {
                            width: '100%',
                            'component': {
                                wid: 'canvas',
                                refCallback: innerComponentCallback,
                                data: {
                                    height: pixheight,
                                    width: pixwidth + 400,
                                    'mouseListener': createIonFunction((scx, scy) => {
                                    }),
                                    'mouseDownListener': createIonFunction((scx, scy) => {
                                    }),
                                    'mouseUpListener': createIonFunction( async(scx, scy) => {
                                    }),
                                    'mouseMoveListener': createIonFunction((scx, scy) => {
                                    })
                                }
                            }
                        },
                    ]]
            }
        }
        setInterval(() => {
            ml.draw ( canvas );
        }, 200)
        showWidget(t)
        resolve(t)
    })
}
