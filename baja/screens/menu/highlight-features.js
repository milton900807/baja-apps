function ( graph, io) {

    let m = {
        'label': 'Highlight gene features', 'ionfunction': createIonFunction(() => {
            if (!graph) {
                return;
            }
            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
            graph.selectOff();
            graph.addMouseDownListener((x, y) => {
                let structures = graph.getStructure(x, y)
                graph.showMenu([

                    {
                        label: 'Clear highlights',
                        click: () => {
                            let trackIndex = graph.getTrack(x, y)
                            if (trackIndex >= 0) {
                                let track = graph.track[trackIndex]
                                if (track) {
                                    graph.setMessage('Clearing highlights...')
                                    track.clearHighlights()
                                }

                            }
                        },
                        move: () => {

                        }

                    }, {
                        label: 'Exons',
                        click: () => {
                            let trackIndex = graph.getTrack(x, y)
                            if (trackIndex >= 0) {
                                let track = graph.track[trackIndex]
                                graph.setMessage('Highlighting exons')
                                console.log('debubg');
                                if (track)
                                    track.highlightFeature('annotations', 'Exon')

                            }
                        },
                        move: () => {

                        }

                    },
                    {
                        label: 'Introns',
                        click: () => {
                            let trackIndex = graph.getTrack(x, y)
                            if (trackIndex >= 0) {
                                let track = graph.track[trackIndex]
                                graph.setMessage('Highlighting exons')
                                console.log('debubg');
                                if (track)
                                    track.highlightFeature('annotations', 'Introns')

                            }
                        },
                        move: () => {

                        }

                    },

                    {
                        label: 'SNPs',
                        click: () => {
                            let trackIndex = graph.getTrack(x, y)
                            if (trackIndex >= 0) {
                                let track = graph.track[trackIndex]
                                graph.setMessage('SNPs...')
                                if (track)
                                    track.highlightFeature('annotations', 'snp')
                            }
                        },
                        move: () => {

                        }

                    }, {
                        label: 'Mutations',
                        click: () => {
                            let trackIndex = graph.getTrack(x, y)
                            if (trackIndex >= 0) {
                                let track = graph.track[trackIndex]
                                graph.setMessage('Mutations...')
                                if (track)
                                    track.highlightFeature('annotations', 'annotations.mutation-annotation')
                            }
                        },
                        move: () => {

                        }

                    }

                ], x, y)

            })
        })
    }
    return m;
}
