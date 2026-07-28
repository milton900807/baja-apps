function (graph) {

    return new Promise(async (resolve, reject) => {

        function filterDuplicatesByAttribute(arr, attribute) {
            const uniqueAttributeValues = new Set();
            const uniqueObjects = [];

            for (const obj of arr) {
              const attributeValue = obj[attribute];
              if (!uniqueAttributeValues.has(attributeValue)) {
                uniqueAttributeValues.add(attributeValue);
                uniqueObjects.push(obj);
              }
            }

            return uniqueObjects;
          }
        let removeDuplicateObjects = (arr) => {
            const uniqueJSONStrings = new Set();
            const uniqueObjects = [];

            for (const obj of arr) {
                const jsonString = JSON.stringify(obj);
                if (!uniqueJSONStrings.has(jsonString)) {
                    uniqueJSONStrings.add(jsonString);
                    uniqueObjects.push(obj);
                }
            }

            return uniqueObjects;
        }

        let removeObjectWithIdEqualTo2 = (arr) => {
            return arr.filter(obj => obj.sequence.indexOf ( 'GGGG')>=0);
          }

        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        graph.selectOff();
        graph.setMessage("Click on a track... ")
        const nameHook = createIonFunction((editor) => {
            ed = editor;
        })
        let menuList = [];
        menuList.push({
            label: "Remove duplicates",
            click: async (x, y) => {
                if (selectedTrack) {
                    selectedTrack.track_layers = filterDuplicatesByAttribute ( selectedTrack.track_layers, "name" )
                }
            },
            move: () => {
            }
        },
        {
            label: 'Clear all',
            click: async (xwc, ywc) => {
                let zoom_to = {
                    wid: 'card',
                    componentRef: 'bottomPanel',
                    data: {
                        height: '800px',
                        cards: [
                            [
                                {
                                    'title': ' ', 'body': ``
                                    ,
                                    'width': '90%',
                                    'component':
                                    {
                                        wid: 'html',
                                        data: '<font color=red> Are you sure you want to remove all plots? </font>'
                                    }
                                },
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Yes', ionFunction: createIonFunction(() => {

                                                        let c = 0;
                                                        for (let t of graph.track) {
                                                            t.plots = []
                                                        }
                                                        graph.setMessage(" Plots removed from all tracks.");
                                                        hideAllModal();
                                                    })
                                                },
                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                        hideAllModal();
                                                    })
                                                }
                                            ]
                                        }
                                    }
                                }
                            ]]
                    }
                }
                showModal(zoom_to)
            },
            move: () => {
                log('')
            }
        },

        );

        graph.addMouseMoveListener(async (x, y) => {
            let p_trackIndex = graph.getTrack(x, y);
            if (p_trackIndex >= 0) {
                graph.deselectAllTracks();
                if (graph.track[p_trackIndex])
                    graph.track[p_trackIndex].showResizeBar = true;
                return;
            }
        }
        )
        graph.addMouseDownListener(async (x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
            }
            if (selectedTrack)
                graph.showMenu(menuList, x, y)
        });

    })

}
