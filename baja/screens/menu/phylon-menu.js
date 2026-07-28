function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let sub = [
            {
                label: 'Phy Score Details',
                click: async (xwc, ywc) => {
                    if (!selectedTrack) {
                        graph.setMessage(" No track selected ");
                        return;
                    }
                    let info = annotation.name + '\n\n';
                    let diff = annotation.gxf - annotation.gxi;
                    if (diff % 3 === 0) {
                        info += ' Exon is in frame. \n'

                    } else {
                        info += ' Exon is out of frame. \n'
                    }

                    info += ' Total length is ' + diff + ' nt\n'

                    showModal({
                        'wid': 'text-editor',
                        'data': {
                            'text': info
                        }
                    })
                }
                ,
                move: () => {
                    log('')
                }
            },
            {
                label: 'Convert to Exon',
                click: async (xwc, ywc) => {
                    if (!selectedTrack) {
                        graph.setMessage(" No track selected ");
                        return;
                    }
                    annotation.type = 'Exon'
                    graph.showSideMenu(null)
                }
                ,
                move: () => {
                    log('')
                }
            },
            {
                label: 'Filter',
                click: async (xwc, ywc) => {

                    if (!selectedTrack) {
                        graph.setMessage(" No track selected ");
                        return;
                    }
                    let tt = [
                        {
                            label: 'Remove others',
                            click: async (xwc, ywc) => {
                                if (!selectedTrack) {
                                    graph.setMessage(" No track selected ");
                                    return;
                                }

                                const clickedAnnotation = this;

                                selectedTrack.annotations = selectedTrack.annotations.filter(
                                    a => a === clickedAnnotation
                                );

                                graph.showSideMenu(null);
                            }

                        },
                        {
                            label: 'Remove < score',
                            click: async (xwc, ywc) => {
                                if (!selectedTrack) {
                                    graph.setMessage(" No track selected ");
                                    return;
                                }

                                const score = annotation?.annotations ?? 0;

                                const va = await prompt(
                                    "Remove all that are less than: ",
                                    ["Score"],
                                    { "Score": score },
                                    300,
                                    300
                                );

                                const raw = va?.["Score"];
                                if (raw === null || raw === undefined) {
                                    graph.showSideMenu(null);
                                    return;
                                }

                                const m =
                                    typeof raw === 'number'
                                        ? raw
                                        : typeof raw === 'string'
                                            ? Number(raw.trim())
                                            : NaN;

                                if (!Number.isFinite(m)) {
                                    infoPrompt("Please enter a valid numeric score.");
                                    return;
                                }

                                selectedTrack.annotations = (selectedTrack.annotations || []).filter(a => {

                                    if (a?.type !== 'Phylon') return true;

                                    const rawScore = a?.annotations;
                                    const s =
                                        typeof rawScore === 'number'
                                            ? rawScore
                                            : typeof rawScore === 'string'
                                                ? Number(rawScore.trim())
                                                : NaN;
                                    return s >= m;
                                });

                                graph.showSideMenu(null);
                            }
                        },

                    ]
                    graph.showSideMenu(tt)
                }
                ,
                move: () => {
                    log('')
                }
            },

            {
                label: 'Delete',
                click: async (xwc, ywc) => {
                    if (!selectedTrack) {
                        graph.setMessage(" No track selected ");
                        return;

                    }
                    selectedTrack.removeAnnotation(annotation)
                    graph.showSideMenu(null)
                }
                ,
                move: () => {
                    log('')
                }
            },

            {
                label: 'LJSplice',
                click: async (xwc, ywc) => {
                    if (!selectedTrack) {
                        graph.setMessage(" No track selected ");
                        return;
                    }

                    graph.setMouseMode('none')
                    graph.setMessage("Click on a track to plot attributes")
                    await exec('baja/bio/splicing/splicing-attributions.js', graph, genegraph_panel_layout)

                }
                ,
                move: () => {
                    log('')
                }
            },

        ]
        return resolve ( sub );

    })

}
