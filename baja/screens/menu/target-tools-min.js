function (graph, genegraph_panel_layout) {
    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'title': 'controls',
            'height': 30,
            'width': 1200,
            'grid': {
                xmin: 0,
                xmax: 8,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': [
                {
                    x: 0, y: 0, label: 'OT', ionFunction: createIonFunction(async () => {
                        await exec('baja/screens/menu/run-off-target-tool.js', graph, genegraph_panel_layout)
                    })
                },
                {
                    x: 1, y: 0, label: 'Filter', ionFunction: createIonFunction(async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            let hasOligos = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                                if (t.oligos.length > 0) {
                                    hasOligos = 1;
                                }
                            }
                            if (hasOligos == 1) {
                                let needsOfftarget = null;
                                let needssynthesisSequence = null;
                                for (let t of graph.track) {
                                    for (let o of t.oligos) {
                                        if (!o.offtarget) {
                                            needsOfftarget = 1;
                                            o.highlight__ = true;
                                        }
                                        if (!o.synthesisSequence) {
                                            needssynthesisSequence = 1;
                                        }
                                    }
                                }
                                if (needsOfftarget) {
                                    graph.setMessage('Some oligos need offtarget information.');
                                    let confirm = await exec('baja/lib/confirm.js', 'Some oligos do not have offtargets.  Continue?', async () => {
                                        await exec('baja/screens/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout)
                                    })
                                    showModal(confirm)
                                } else
                                    await exec('baja/screens/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout)
                            } else {
                                graph.setMessage('No oligos and/or variants found')
                            }
                        }

                    })
                }
            ]
        }
    }
    return button_canvas

}
