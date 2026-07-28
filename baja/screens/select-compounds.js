function (graph, genegraph_panel_layout, oligolist) {

    return new Promise(async (resolve, reject) => {

        let SIRNA = await exec('flexigraph/sirna.js')
        let Amplicon = await exec('flexigraph/amplicon.js')
        let Oligo = await exec('flexigraph/oligo.js')
        let Biopolymer = await exec('baja/chem/biopolymer.js');

        let pasteSequences = async (seqlist, olglist) => {

            for (let t of graph.track) {
                let sequence = t.sequence.trim();
                let ed = 1;
                console.log('debubg');
                if (seqlist.length <= 0) {
                    graph.setError('No compounds selected')
                    return;
                }
                let res = await exec('py/bio/map/le-map-sequences.py', sequence, seqlist, ed);
                if (res && res.length > 0) {
                    for (let gr of res) {
                        if (gr && gr.length > 0) {
                            for (let r of gr) {
                                if (r[2]) {
                                    let synthesis = r[1]
                                    for (let ob of olglist) {
                                        let oli = Oligo.copy(ob.o)
                                        oli.id = oli.id + '.0'
                                        console.log(' name ' + (t.name.toLowerCase() != ob.t.name.toLowerCase()))
                                        if (oli.synthesisSequence === synthesis && (t.name.toLowerCase() != ob.t.name.toLowerCase())) {
                                            oli.xi = t.tgraph.xmin + r[3]
                                            oli.xf = t.tgraph.xmin + r[3] + r[1].length
                                            t.addOligo(oli);
                                            oli.highlight(10000, 'purple')
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    graph.setMessage(' It appears there are no matches in the list provided')
                }
            }
        }
        let DashedRectangle = await exec('flexigraph/shapes/dashed-rect.js')
        let previousShape;
        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'height': 30,
                'grid': {
                    xmin: 0,
                    xmax: 10,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': [
                    {
                        x: 0, y: 0, label: 'Deselect', ionFunction: createIonFunction(() => {
                            graph.deselectAllCompounds();
                        })
                    },
                    {
                        x: 1, y: 0, label: 'Copy...', ionFunction: createIonFunction(async () => {
                            let list = [
                                {
                                    label: 'Copy compounds by sequence-mapping to other tracks', click: () => {
                                        if (graph.track.length <= 1) {
                                            graph.setError("There are no other tracks to copy to.... ");
                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                            return;
                                        }
                                        let seqlist = []
                                        let r = []
                                        let index = 0;

                                        console.log('debubg');
                                        for (let t of graph.track) {
                                            for (let o of t.oligos) {
                                                if (o.selected) {
                                                    r.push({ t: t, o: o })

                                                    if (!o.synthesisSequence) {
                                                        let target = o.sequence;
                                                        if (t.strand >= 0)
                                                            o.synthesisSequence = Biopolymer.comp(target)
                                                        else
                                                            o.synthesisSequence = Biopolymer.reverseComp(target)
                                                    }
                                                    seqlist.push([index, o.synthesisSequence])
                                                    index++;
                                                }
                                            }
                                        }

                                        pasteSequences(seqlist, r)

                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                    }
                                },
                                {
                                    label: 'Copy compounds to the clipboard', click: () => {
                                        let r = []
                                        for (let t of graph.track) {
                                            for (let o of t.oligos) {
                                                if (o.selected) {
                                                    r.push(Oligo.copy(o))
                                                }
                                            }
                                        }
                                        try {
                                            navigator.clipboard.writeText(JSON.stringify(r));
                                        } catch (exception) {
                                            graph.setError(exception)
                                        }

                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                    }
                                },
                                {
                                    label: 'Copy synthesis sequences ', click: () => {
                                        let r = []
                                        for (let t of graph.track) {
                                            for (let o of t.oligos) {
                                                if (o.selected) {
                                                    r.push(o.synthesisSequence)
                                                }
                                            }
                                        }
                                        try {
                                            navigator.clipboard.writeText(JSON.stringify(r));
                                        } catch (exception) {
                                            graph.setError(exception)
                                        }

                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                    }
                                },
                                {
                                    label: 'Copy targets sequences ', click: () => {
                                        let r = []
                                        for (let t of graph.track) {
                                            for (let o of t.oligos) {
                                                if (o.selected) {
                                                    r.push(o.sequence)
                                                }
                                            }
                                        }
                                        try {
                                            navigator.clipboard.writeText(JSON.stringify(r));
                                        } catch (exception) {
                                            graph.setError(exception)
                                        }

                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                    }
                                },

                            ]
                            let names = list.map(obj => obj.label);
                            let t = {
                                wid: 'selection-list',
                                data: {
                                    single_selection: true,
                                    show_button: false,
                                    singleSelect: true,
                                    listItems: names,
                                    button_function: createIonFunction(async (items) => {

                                        let name = items[0]
                                        for (let l of list) {
                                            if (l.label === name) {
                                                l.click()
                                            }
                                        }

                                    })
                                }
                            }

                            let design_params_panel_layout = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [
                                            {
                                                'width': '100%',
                                                'component': t
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(() => {
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }

                                        ]
                                    ]
                                }
                            }
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

                        })
                    }
                    ,
                    {
                        x: 2, y: 0, label: 'Delete', ionFunction: createIonFunction(async () => {
                            let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                for (let t of graph.track) {
                                    let r = []
                                    for (let o of t.oligos) {
                                        if (o.selected) {
                                            r.push(o);
                                        }
                                    }
                                    for (let o of r) {
                                        t.removeOligo(o)
                                    }
                                }
                            })
                            showModal(confirm)
                        }),
                    },
                    {
                        x: 3, y: 0, label: 'Color', ionFunction: createIonFunction(async () => {

                            let color = 'black'

                            let color_panel = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [
                                            {
                                                'width': '100%',
                                                "style.padding-top": '4px',
                                                "style.border": '1px',
                                                'component':
                                                {
                                                    'wid': 'color-chooser',
                                                    "data": {
                                                        "selectionListener": createIonFunction((_color) => {

                                                            color = _color['rgb']
                                                        })
                                                    }
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'html',
                                                    data: `<hr>`
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();
                                                                })
                                                            },
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(() => {

                                                                    for (let t of graph.track) {
                                                                        let r = []
                                                                        for (let o of t.oligos) {
                                                                            if (o.selected) {
                                                                                o.color = 'rgba(' + color['r'] + ',' + color['g'] + ',' + color['b'] + ',' + color['a'] + ')';
                                                                            }
                                                                        }
                                                                    }
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }

                                        ]
                                    ]
                                }
                            }
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', color_panel);

                        }),
                    },
                    {
                        x: 4, y: 0, label: 'Filter', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            await exec('baja/screens/annotation/rule-application-wizard-min-selected-oligos.js', graph, genegraph_panel_layout)
                        }), mouseOver: createIonFunction(() => {
                            graph.setMessage('Run filter rules on all compounds.')

                        })
                    },

                    {
                        x: 5, y: 0, label: 'OT', ionFunction: createIonFunction(async () => {
                            let selected = []
                            for (let t of graph.track) {
                                for (let o of t.oligos) {
                                    if (o.selected) {
                                        o.showOfftargets = true;
                                        selected.push(o)
                                    }
                                }
                            }
                            await exec('baja/screens/menu/run-off-targets.js', graph, genegraph_panel_layout, selected)

                        }),
                        mouseOver: createIonFunction(() => {

                            graph.setMessage(" Off-target tool ")

                        }),
                    },
                    {
                        x: 6, y: 0, label: 'Move', ionFunction: createIonFunction(() => {

                            exec('baja/screens/select-compounds-move.js', graph, genegraph_panel_layout)
                        }),
                    },

                ]
            }
        }

        graph.clearMouseListeners();
        graph.selectOff();
        graph.setMouseMode(null)

        graph.addMouseDownListener(async (x, y) => {
            if (previousShape) {
                graph.removeShape(previousShape);
            }
            graph.currentShape = new DashedRectangle('test', x, y);
        });
        graph.addMouseMoveListener((x, y) => {
            if (graph.currentShape) {
                graph.currentShape.update(x, y)
            }
            if (graph.currentShape) {
                previousShape = graph.currentShape
            }
        })
        graph.addMouseUpListener(async (x, y) => {
            if (graph.currentShape) {
                previousShape = graph.currentShape

                let xisc = graph.X(previousShape.x);
                let xfsc = graph.X(previousShape.x + previousShape.w);
                let total_selected = []

                console.log('debubg');
                for (let selectedTrack of graph.track) {

                    let xi = selectedTrack.tgraph.Xwc(graph.Xwc(xisc) - selectedTrack.tgraph.xi * 2);
                    let xf = selectedTrack.tgraph.Xwc(graph.Xwc(xfsc) - selectedTrack.tgraph.xi * 2);
                    let yi = (selectedTrack.tgraph.Ywc(previousShape.y - previousShape.h - selectedTrack.tgraph.yi * 2))
                    let yf = (selectedTrack.tgraph.Ywc(previousShape.y - selectedTrack.tgraph.yi * 2))
                    let oligos = selectedTrack.getVisibleOligosXY(xi, xf, yi, yf);

                    for (let o of oligos) {
                        o.setSelected(true)
                    }
                    let count = 0
                    for (let o of selectedTrack.oligos) {
                        if (o.selected) {
                            total_selected.push({ 'o': o, 't': selectedTrack })
                            count++;
                        }
                    }
                }
                graph.currentShape = null;
                graph.setMessage('Selected:  ' + parseInt(total_selected.length));

                graph.setSelectedCompounds(total_selected)

            }

        });
        CurrentLayout.clearComponent('labelPanel')
        CurrentLayout.setComponent('labelPanel', button_canvas);

        resolve();

    });

}
