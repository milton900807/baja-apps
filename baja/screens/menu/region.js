function (lib_id, graph, shomainScreen) {

    let m = {
        'label': 'Edit Compounds', 'ionfunction': createIonFunction(async () => {
            let previousShape;
            graph.setMessage(" Click and draw around compounds... ")
            let ChemTemplateDB = await exec('baja/chem/chem-template-db.js', lib_id);
            let Biopolymer = await exec('baja/chem/biopolymer.js')

            let htmlpanel;
            let __nameHook = createIonFunction( ( p )=> {
                htmlpanel=p;
            });

            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
            graph.selectOff();

            graph.addMouseDownListener(async (x, y) => {
                let DashedRectangle = await exec('flexigraph/shapes/dashed-rect.js')
                if (previousShape) {
                    graph.removeShape(previousShape);
                }
                graph.currentShape = new DashedRectangle('test', x, y);

            }); graph.addMouseMoveListener((x, y) => {
                if (graph.currentShape) {
                    graph.currentShape.update(x, y)
                }
            })
            graph.addMouseUpListener((x, y) => {

                let mode = '?';
                let oligos = []
                if (graph.currentShape) {
                    previousShape = graph.currentShape;
                    graph.pushCurrentShape();
                    graph.showMenu([
                        {
                            label: 'Apply Chemistry',
                            click: async () => {

                                let total = []
                                for (let t of graph.track) {
                                    let twx = t.tgraph.Xwc(previousShape.x)
                                    let twxf = t.tgraph.Xwc(previousShape.x + previousShape.w)
                                    oligos = t.getVisibleOligosXY(twx, twxf, previousShape.y - previousShape.h, previousShape.y)
                                    if (oligos)
                                        total = total.concat(oligos)
                                }
                                graph.setMessage(" Selected  " + total.length)
                                previousShape = null;
                                let panel;
                                let select_display = (p) => {
                                    panel = p;
                                }
                                let chemdb = new ChemTemplateDB();
                                let myChem = await exec('baja/chem/my-chem-w.js', lib_id, async (selected) => {
                                    let templateob = await chemdb.loadChem(selected);

                                    if (!mode || mode.length === 0) {

                                        alert(' Please select a chemistry template ')
                                        return;
                                    }
                                    for (let o of oligos) {
                                        let sequence = o.sequence;
                                        if (mode === 'reverse-complement') {
                                            let newsequence = Biopolymer.reverseComp(sequence)
                                            o.structure = Biopolymer.applySequenceToTemplate(templateob.template, newsequence)
                                        } else if (mode === "complement") {
                                            let newsequence = Biopolymer.comp(sequence)
                                            o.structure = Biopolymer.applySequenceToTemplate(templateob.template, newsequence)
                                        } else {
                                            alert(' please select a direction for the seequence ')
                                        }
                                    }

                                    shomainScreen();

                                }, graph.props)

                                let chemistry_tab = {
                                    wid: 'card',
                                    data: {
                                        "style.padding-top": '10px',
                                        cards: [
                                            [

                                                {
                                                    'title': ' ',
                                                    'width': '30%',
                                                    'component':
                                                    {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Reverse Complement', ionFunction: createIonFunction(async () => {
                                                                        mode = 'reverse-complement'

                                                                        htmlpanel.setHTML ( "<h3> Structures will be generated using the " + mode + " of the target sequence.</h3>")
                                                                    })

                                                                },
                                                                {
                                                                    label: 'Complement', ionFunction: createIonFunction(async () => {
                                                                        mode = 'complement'
                                                                        htmlpanel.setHTML ( "<h3> Structures will be generated using the " + mode + " of the target sequence.</h3>")
                                                                    })

                                                                }

                                                            ]
                                                        }
                                                    }
                                                },

                                                {
                                                    'title': ' ',
                                                    'width': '100%',
                                                    'component':
                                                    {
                                                        wid: 'html',
                                                        refCallback: __nameHook,
                                                        data: `<font color="red"> Select a direction for the sequence
                                                         Warning:  You are modifying registered oligos.  These will need to be re-registered.

                                                        <font>.`
                                                    }
                                                },

                                                {
                                                    'width': '100%',
                                                    'component': myChem
                                                },

                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Return to screen', ionFunction: createIonFunction(() => {
                                                                        shomainScreen();
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', chemistry_tab);

                            },
                            move: () => {
                            }
                        },

                    ], x, y)
                }
            });

        })
    }
    return m;
}
