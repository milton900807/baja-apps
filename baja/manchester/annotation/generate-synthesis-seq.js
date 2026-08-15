function (graph) {
    let tname = ['GGGG', 'GC content']
    let selectP;
    let selectPanel = createIonFunction(async (_panel) => {
        selectP = _panel;
    });

    let t = {
        wid: 'selection-list',
        data: {
            single_selection: true,
            button_label: 'Apply',
            listItems: tname,

            button_function: createIonFunction(async (items) => {
                for (let track of graph.track) {
                    for (let o of track.oligos) {

                    }
                }
            })
        }
    }
    showModal(t)

}
