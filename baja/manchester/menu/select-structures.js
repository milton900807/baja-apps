function (graph, genegraph_panel_layout) {

    let m = {
        'label': 'Select compounds...', 'ionfunction': createIonFunction(async () => {
            graph.setMessage(" Click and draw around compounds... ")
            graph.clearMouseListeners(null);
            await exec('baja/manchester/select-compounds.js', graph, genegraph_panel_layout)

        })
    }
    return m;
}
