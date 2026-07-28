function (pt, plate1, plate2) {
    return new Promise(async (resolve, reject) => {
        let selectionpanel = null;
        const selectPanel = createIon((pa) => {
            selectionpanel = pa;
        })
        let selectionpanel2 = null;
        const selectPanel2 = createIon((pa) => {
            selectionpanel2 = pa;
        })
        const tname = []
        for (let p = 0; p < plate1.wells.length; p++) {
            let col = 'Column #' + (p) + " Address: " + plate1.wells[p][0].position;
            for (let r = 0; r < 5; r++) {
                if (r < plate1.wells[p].length)
                    col += ', ' + plate1.wells[p][r].position
            }
            tname.push(col)
        }
        const dname = []
        for (let p = 0; p < plate2.wells.length; p++) {
            let col = 'Column #' + (p) + " Value: " + plate2.wells[p][0].value;
            for (let r = 0; r < 5; r++) {
                if (r < plate2.wells[p].length)
                    col += ', ' + plate2.wells[p][r].value
            }
            dname.push(col)
        }

        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [

                        {
                            width: '100%',
                            'body': ` `, 'component':
                            {
                                wid: 'html',
                                width: '100%',
                                data: `<h3> Select join (value) column below; The column that has address values in it`
                            }
                        },
                        {
                            'title': 'Value column.',
                            width: '100%',
                            'body': ` `, 'component':
                            {
                                wid: 'selection-list',
                                width: '100%',
                                refCallback: selectPanel2,
                                data: {
                                    listItems: dname
                                }
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                                CurrentLayout.reset('mainPanel')

                                            })
                                        },
                                        {
                                            label: 'Join', ionFunction: createIonFunction(() => {
                                                setTimeout(() => {
                                                    setTimeout(() => {

                                                        let dtext = selectionpanel2.selectedItems[0]
                                                        function parseColumnNumber(str) {
                                                            const match = str.match(/Column\s*#(\d+)/i);
                                                            return match ? parseInt(match[1], 10) : null;
                                                        }
                                                        const column_index = parseColumnNumber(dtext)
                                                        pt.joinOnAddress__(plate1, plate2, column_index)
                                                        setTimeout(() => {
                                                            plate1.deselectAll();
                                                            plate2.deselectAll();
                                                        }, 1000)
                                                    }, 1000)
                                                }, 100)
                                                CurrentLayout.reset('mainPanel')
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }

        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', zoom_to);

    });
}
