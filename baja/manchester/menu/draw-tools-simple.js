function (graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        let panel = null;
        let __nameHook = createIonFunction((name) => {
            panel = name;
        })
        let bpanel = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            width: '100%',
                            'component': {
                                wid: 'menu',
                                data: {
                                    title: '  ',
                                    style: 'sub-container',
                                    menus: [
                                        {
                                            'label': 'Draw', 'items': [
                                                {
                                                    'label': 'Rectangle', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-rect-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Oval', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-oval-action.js', graph)

                                                    })
                                                },
                                                {
                                                    'label': 'Folder', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-folder.js', graph)

                                                    })
                                                },
                                                {
                                                    'label': 'Text', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/text-box-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Arrow', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-line-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Highlight region', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-highlight-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Text label', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-label-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Note', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-note-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Protein Domains', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/protein-domains.js', graph, genegraph_panel_layout)
                                                    })
                                                },
                                                {
                                                    'label': 'Extract from Text', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/text-extract.js', graph, genegraph_panel_layout)
                                                    })
                                                }
                                            ]
                                        },

                                        {
                                            'label': 'Edit', 'items': [
                                                {
                                                    'label': 'Object', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/edit-drawing.js', graph, genegraph_panel_layout);
                                                    })
                                                },
                                                {
                                                    'label': 'Clear all', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/clear-drawings.js', graph)
                                                    })

                                                }
                                            ]
                                        }
                                    ]
                                }
                            }
                        },

                    ]
                ]
            }
        }
        // The buttonMenuPanel slot was removed — render the SAME menu as an on-canvas SIDE MENU
        // (Draw ▸ / Edit ▸), reusing each item's existing ionfunction via getIonFunction().
        try {
            const menus = bpanel.data.cards[0][0].component.data.menus;
            const close = () => { try { graph.showSideMenu(null); } catch (e) { } };
            const runIon = (ref) => { close(); try { const fn = getIonFunction(ref); if (typeof fn === 'function') fn(); } catch (e) { } };
            let showMain;
            const back = { label: '‹ Back', move: () => { }, click: () => { showMain(); } };
            const groupMenu = (grp) => (grp.items || []).map((it) => ({ label: it.label, move: () => { }, click: () => { runIon(it.ionfunction); } })).concat([back]);
            showMain = () => {
                const main = (menus || []).map((grp) => ({ label: (grp.label || '') + ' ▸', move: () => { }, click: () => { try { graph.showSideMenu(groupMenu(grp)); } catch (e) { } } }));
                main.push({ label: 'Close', move: () => { }, click: () => { close(); } });
                try { graph.showSideMenu(main); } catch (e) { }
            };
            showMain();
        } catch (e) { try { graph.setMessage(' Could not open draw tools. '); } catch (e2) { } }

        resolve();
    })

}
