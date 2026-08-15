function (graph, library, folder, phasetarget) {
    graph.setMessage('Select a track to add vcf...')

    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let start = -1;
    let end = -1;
    let ywc = -1;
    let highlight = false;
    let highlight_label = 'Highlight'
    let selectedTrack = null;
    let resizeTrack = false;

    graph.addMouseMoveListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);

        if (trackIndex >= 0) {
            let cselectedTrack = graph.track[trackIndex]
            if (cselectedTrack && selectedTrack != cselectedTrack) {
                if (selectedTrack)
                    selectedTrack.showResizeBar = false;
            }
            selectedTrack = cselectedTrack;
            if (selectedTrack)
                selectedTrack.showResizeBar = true;
        } else {
            graph.selectOff();
            selectedTrack = null;
        }
    })

    graph.addMouseDownListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        ywc = y;
        if (highlight && selectedTrack) {
            if (start < 0) {
                let xsc = graph.X(x);
                selectedTrack.tgraph.rescale();
                console.log(xsc + ' xi : ' + selectedTrack.tgraph.xi);
                let t = selectedTrack.tgraph.xi;
                start = selectedTrack.tgraph.Xwc(x - t * 2);
                selectedTrack.markstart = start;
            }
            else if (start > 0 && end < 0) {
                let t = selectedTrack.tgraph.xi;
                end = selectedTrack.tgraph.Xwc(x - t * 2);
                selectedTrack.markend = end;
            }
            highlight_label = 'Clear highlight'

        } else {
            highlight_label = 'Highlight'
        }

        let menuList = [];

        if (selectedTrack) {
            menuList.push(
                {
                    label: 'Add VCF',
                    click: async() => {

                        function showfolder () {
                            return new Promise(async (resolve, reject) => {
                                let currentPath = null;

                                showModal({
                                    wid: 'folder-browser',
                                    width: '100%',
                                    data: {
                                        width: '80%',
                                        path: `/drives/${library.id}/items/${folder.id}`,
                                        "ionfunction.path": createIonFunction(async (path, nodes) => {
                                            currentPath = path;
                                            if (path.name.toUpperCase().endsWith('.VCF')) {
                                                let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
                                                let MSGraph = await exec('lib/msgraph.js')
                                                let client = await MSGraph.getClient(sharepointConfig);
                                                let fileobject = await client.api(`/drives/${library.id}/items/${path.id}`).get();
                                                let text = await GETXT(fileobject['@microsoft.graph.downloadUrl']);
                                                resolve(text);
                                            }
                                        })
                                    }
                                })
                            })
                        }

                        showfolder().then(vcfString => {
                                hideAllModal();
                                exec('baja/manchester/annotation/vcf-parse.js', selectedTrack, vcfString)

                                .then( () => {
                                    if (phasetarget) {
                                        exec('baja/manchester/annotation/set-targeted-variant.js', selectedTrack)
                                    } else {
                                    }
                                })
                                .catch(() => {
                                });
                        });
                    },
                    move: () => {
                    },

                },
            );
        }
        graph.showMenu(menuList, x, y);
    })
}
