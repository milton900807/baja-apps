function (selectedTrack, graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let descHook = null;
        let desc = {
            'wid': 'text-editor',
            'title': 'Experiment Description',
            refCallback: createIonFunction((w) => {
                descHook = w
            }),
            'data': {

                code: selectedTrack.getHighlightedSequence(),
                'showButton': false,
                'ionFunction': createIonFunction((description) => {
                    alert(' replace text ')
                })
            }
        }

        let replaceSubstring = (inputString, markStart, markEnd, newSequence) => {
            const startIndex = inputString.indexOf(markStart);
            const endIndex = inputString.indexOf(markEnd);
            if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
                return inputString;
            }
            const endOfSubstring = endIndex + markEnd.length;
            const replacedString = inputString.substring(0, startIndex) + newSequence + inputString.substring(endOfSubstring);
            return replacedString;
        }

        let html = `<hr> <h5> Edit the sequence...  </h5>`
        let wg = {
            wid: 'card',
            componentRef: 'bt',
            data: {
                height: '1500px',
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `${html}`
                            }
                        }, {
                            'title': '',
                            'width': '100%',
                            'component': desc
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Apply', ionFunction: createIonFunction(async () => {

                                                let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                                    let newvalue = descHook.getActiveTabContent();
                                                    if (selectedTrack) {

                                                        graph.runfun(() => {

                                                            let m = {
                                                                'reference': selectedTrack.getHighlightedSequence(),
                                                                'sequence': newvalue,
                                                                'alternate': newvalue,
                                                                'xi': selectedTrack.markstart,
                                                                'xf': selectedTrack.markend,
                                                            }
                                                            selectedTrack.mutateTrackWithSingleMutation(m)
                                                            selectedTrack.generateORF();

                                                        })
                                                    }

                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                })
                                                showModal(confirm)

                                            })
                                        }

                                    ]
                                }
                            }
                        }
                    ]]
            }
        }

        graph.setMouseMode("navigate")
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', wg);

    })

}
