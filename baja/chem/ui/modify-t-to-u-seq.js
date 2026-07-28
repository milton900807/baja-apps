function (graph, genegraph_panel_layout) {
    let menuList = [
        {
            label: 'T -> U',
            click: () => {

                function replaceTWithU(helmString) {
                    const regex = /\(T\)/g;
                    return helmString.replace(regex, '(U)');
                }

                for (let t of graph.track) {
                    for (let o of t.oligos) {
                        o.structure = replaceTWithU(o.structure)
                    }
                }

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            }
        },
    ]
    graph.showWindowMenu(menuList, 10, 10, 200);
}
