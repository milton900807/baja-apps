function (graph, track) {

    let editor;
    let __nameHook = createIonFunction((ref) => {
        editor = ref;
    })

    let trackProperties = {
        'chr': track.chr,
        'name': track.name,
        'geneID': track.geneID,
        'xi': track.xi,
        'xf': track.xf,
        'strand': track.strand,
        'color': track.color,
        'species': track.species,
        'track_type': track.track_type
    }

    let json_display = {
        wid: 'card',
        data: {
            cards: [
                [
                    {
                        'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `,
                        'width': '100%',
                        'component':
                        {
                            wid: 'html',
                            data: '<font color="red"> Editing properties is currently not available </font> '
                        }
                    },
                    {
                        'title': ' ', 'body': `
                                            `,
                        'width': '100%',
                        'component':
                        {
                            wid: 'json',
                            data: JSON.stringify(trackProperties),
                            refCallback: __nameHook
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
                                        })
                                    },
                                    {
                                        label: 'Apply', ionFunction: createIonFunction(async () => {
                                            if (editor) {
                                                let c = editor.data;
                                                try {
                                                    let t = JSON.parse(c.trim())
                                                    track.chr = t.chr;
                                                    track.name = t.name;
                                                    track.geneID = t.geneID;
                                                    track.xi = t.xi;
                                                    track.xf = t.xf;
                                                    track.strand = t.strand;
                                                    track.color = t.color;
                                                    track.species = t.species;
                                                    track.track_type = t.track_type;
                                                }
                                                catch (exception) {
                                                    graph.setMessage(' Not a valid  structure.. failed to save the new track object.  ')

                                                }
                                            }
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
    showModal(json_display)

}
