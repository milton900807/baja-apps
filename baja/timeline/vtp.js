function () {

    return new Promise(async (resolve, reject) => {
        let ca = null;
        let innerComponentCallback = createIonFunction((panel) => {
            ca = panel;
        })
        let pixheight = 800;
        let pixwidth = 300;
        let VerticalTimeline = await exec('baja/timeline/vtimeline.js')
        let v = new VerticalTimeline('2024-04-15', '2025-04-15');
        v.addEvent('2024-05-01', 'MYH7 Project review');
        v.addEvent('2024-08-11', 'Design review');
        v.addEvent('2024-05-01', 'In Vivo review');

        v.addEvent('2024-11-01', 'Lead identification');

        v.addEvent('2025-02-20', 'GLP Tox');
        v.addEvent('2025-04-01', 'Clinical team');

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

                                        let va = await prompt("", ["MSG"], { "MSG": '' }, 300, 300)
                                        let m = va['MSG']
                                        if (m === null) {

                                        } else {
                                            let wstr = v.screenToDateTime(scy ).toISOString().slice(0, 10)
                                            v.addEvent(wstr, m);
                                        }
                                    }),
                                    'mouseMoveListener': createIonFunction((scx, scy) => {
                                        v.setMessage ( v.screenToDateTime(scy ).toISOString().slice(0, 10), v.grid.Ywc(scy))

                                    })
                                }
                            }
                        },
                    ]]
            }
        }

        setInterval(() => {
            v.drawTimeline(ca)
        }, 200)

        showWidget(t)

        resolve(t)
    })

}
