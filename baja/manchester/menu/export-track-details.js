function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseDownListener(async (x, y) => {
        let si = graph.getTrack(x, y);
        let selectedTrack = graph.track[si]

        graph.showMenu([
            {
                'label': 'Peptide ORF sequence', click: async () => {

                    if ( selectedTrack ) {
                        let orf = selectedTrack.orf
                        showModal ( {
                            wid:'json',
                            data:JSON.stringify ( orf )
                        })
                    }

                }
            },
            {
                'label': 'Nucleotide Sequence', click: async () => {
                }
            }

        ], x, y)

    })
}
