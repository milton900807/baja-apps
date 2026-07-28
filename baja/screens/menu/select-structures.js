function (graph, genegraph_panel_layout) {

    let m = {
        'label': 'Select compounds...', 'ionfunction': createIonFunction(async () => {
            graph.setMessage(" Click and draw around compounds... ")
            graph.clearMouseListeners(null);
            await exec('baja/screens/select-compounds.js', graph, genegraph_panel_layout)

        })
    }
    return m;
}
