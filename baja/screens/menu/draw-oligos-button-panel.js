function (graph, selSeq, nav_canvas) {

    return new Promise(async (resolve, reject) => {
        let Biopolymer = await exec('baja/chem/biopolymer.js')
        let chemistryObject = graph.props.selected_chemistry;

        let ed; const nameHook = createIonFunction((editor) => {
            ed = editor;
        })

        let currentSeq = null;
        selSeq.setListener((seq) => {
            ed.init_text_value = seq;
            currentSeq = seq;
        })

        let selectedColor = 'magenta'
        let colors = [
            'cyan',
            'blue',
            'green',
            'maroon',
            'magenta',
            'purple',
            'yellow',
            'black'
        ]
        let buttons__ = []
        let index = 1
        for (let t of colors) {
            buttons__.push({
                x: index++, y: 0, label: '', ionFunction: createIonFunction(async (button) => {
                    selectedColor = t;

                }), background: t
            })
        }
        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 20,
                'width': 200,
                'grid': {
                    xmin: 0,
                    xmax: colors.length,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons__

            }
        }

        let find_panel = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '20px',
                width: '1100px',
                cards: [
                    [
                        {
                            'title': '', 'body': ``,
                            'width': '20%',
                            'component':
                            {
                                wid: 'input-textfield',
                                refCallback: nameHook,
                                'data': {
                                    'blocking': false,
                                    'show-button': false,
                                    'ionHookFunction': createIonFunction((w) => {

                                    }),
                                    'ionfunction': createIonFunction((title) => {
                                        console.log(" title " + title);
                                    })
                                }
                            }
                        },
                        {
                            'title': '', 'body': ``,
                            'width': '210px',
                            'component':
                                button_canvas
                        },

                        {
                            'title': '',
                            'width': '400px',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Mark sequence', ionFunction: createIonFunction(async () => {
                                                let Annotation = await exec('flexigraph/annotation.js')
                                                let value = ed.value;
                                                if (value === null) {
                                                    value = ed.init_text_value;
                                                }
                                                if (value === null || value.length <= 0) {
                                                    value = currentSeq;
                                                }
                                                let t = graph.track;
                                                for (let ti of t) {
                                                    if (ti.isSelected()) {
                                                        let sequence = ti.sequence;
                                                        var searchStrLen = value.trim().length;
                                                        if (searchStrLen <= 2) {
                                                            alert(' Search string must be more than two characters ')
                                                            return;

                                                        }

                                                        var startIndex = 0, index, indices = [];

                                                        while ((index = sequence.indexOf(value, startIndex)) > -1) {
                                                            indices.push(index);
                                                            startIndex = index + searchStrLen;
                                                        }
                                                        let TrackLayer = await exec('baja/bio/track-layer.js')

                                                        let layer = new TrackLayer('' + value.trim(), ti.tgraph.xmin, 0, ti.tgraph.xmax, 1)
                                                        for (let ind of indices) {
                                                            let ab = new Annotation('highlight', 'highlight', ti.tgraph.xmin + ind, ti.tgraph.xmin + ind + searchStrLen, ti.strand)
                                                            ab.color = selectedColor;
                                                            layer.addAnnotation(ab);
                                                        }
                                                        ti.addLayer(layer);

                                                    }
                                                }
                                            })
                                        }
                                        ,
                                        {
                                            label: 'Apply compound to marked areas', ionFunction: createIonFunction(async () => {
                                                let t = graph.track;
                                                for (let ti of t) {
                                                    if (ti.isSelected()) {

                                                        for (let layer of ti.track_layers) {
                                                            for (let a of layer.annotations) {
                                                                if (a.type.toLowerCase() === 'highlight') {
                                                                    let currentSequence = ti.getSequenceRange(a.xi, a.xf);
                                                                    let bioObject = {
                                                                        'targetSequence': currentSequence,
                                                                        'trackName': ti.name,
                                                                        'startIndex': a.xi,
                                                                        'strand': ti.strand,
                                                                        'endIndex': (a.xf),
                                                                        'y': 0.2
                                                                    }
                                                                    console.log(" --------generating the compounds --------------- ")
                                                                    let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                                                    if (compound)
                                                                        ti.addOligo(compound)
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            })
                                        }

                                    ]
                                }
                            }
                        },
                        {
                            'title': '',
                            'width': '300px',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {

                                            label: 'Apply compound', ionFunction: createIonFunction(async () => {
                                                let t = graph.track;

                                                for (let ti of t) {
                                                    if (ti.isSelected()) {

                                                        let currentSequence = ti.getHighlightedSequence();
                                                        if (currentSequence == null || currentSequence.length <= 0) {
                                                            console.log('debubg');
                                                        } else {
                                                            let bioObject = {
                                                                'targetSequence': currentSequence,
                                                                'trackName': ti.name,
                                                                'startIndex': ti.markstart,
                                                                'strand': ti.strand,
                                                                'endIndex': ti.markend,
                                                                'y': 0.2
                                                            }
                                                            console.log(" --------generating the compounds --------------- ")
                                                            let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                                            if (compound)
                                                                ti.addOligo(compound)
                                                        }
                                                    }
                                                }

                                            })
                                        }

                                    ]
                                }
                            }
                        }

                    ],

                ]
            }
        }
        return resolve(find_panel);
    })

}
