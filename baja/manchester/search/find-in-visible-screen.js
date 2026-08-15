function (graph) {

    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })

    graph.setMessage ( "Highlight sequence motifs on tracks.")

    let selectedColor = 'magenta'

    let colors = [
        'red',
        'blue',
        'green',
        'maroon',
        'magenta',
        'purple',
        'yellow',
        'black'
    ]
    let buttons__ = []
    let index = 1
    for (let t of colors) {
        buttons__.push({
            x: index++, y: 0, label: '', ionFunction: createIonFunction(async (button) => {
                selectedColor = t;

            }), background: t
        })
    }
    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'title': 'controls',
            'height': 20,
            'width': 900,

            'grid': {
                xmin: 0,
                xmax: colors.length,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': buttons__

        }
    }

    let find_panel = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            cards: [
                [
                    {
                        'title': '', 'body': ``,
                        'width': '100px',
                        'component':
                        {
                            wid: 'html',
                            data:" Sequence Motif: "
                        }
                    },
                ],[
                    {
                        'title': '', 'body': ``,
                        'width': '300px',
                        'component':
                        {
                            wid: 'input-textfield',
                            refCallback: nameHook,
                            'data': {
                                'blocking': false,
                                'show-button': false,
                                'ionHookFunction': createIonFunction((w) => {

                                }),
                                'ionfunction': createIonFunction((title) => {
                                    console.log(" title " + title);
                                })
                            }
                        }
                    },

                    {
                        'title': '', 'body': ``,
                        'width': '300px',
                        'component':
                            button_canvas
                    },

                    {
                        'title': '',
                        'width': '50%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Find sequence', ionFunction: createIonFunction(async () => {

                                            let Annotation = await exec('flexigraph/annotation.js')

                                            let value = ed.value;
                                            let t = graph.track;
                                            for (let ti of t) {
                                                let sequence = ti.sequence;
                                                var searchStrLen = value.trim().length;
                                                if (searchStrLen <= 2) {
                                                    alert(' Search string must be more than two characters ')
                                                    return;

                                                }

                                                var startIndex = 0, index, indices = [];

                                                while ((index = sequence.indexOf(value, startIndex)) > -1) {
                                                    indices.push(index);
                                                    startIndex = index + searchStrLen;
                                                }

                                                let TrackLayer = await exec('baja/bio/track-layer.js')

                                                let layer = new TrackLayer('' + value.trim(), ti.tgraph.xmin, 0, ti.tgraph.xmax, 1)
                                                for (let ind of indices) {
                                                    let ab = new Annotation('highlight', 'highlight', ti.tgraph.xmin + ind, ti.tgraph.xmin + ind + searchStrLen, ti.strand)
                                                    ab.color = selectedColor;
                                                    layer.addAnnotation(ab);

                                                }
                                                ti.addLayer(layer);

                                            }

                                        })
                                    },

                                    {
                                        label: 'Find reverse sequence', ionFunction: createIonFunction(async () => {

                                            let reverseString = (str) => {
                                                return str.split("").reverse().join("");
                                            }

                                            let Annotation = await exec('flexigraph/annotation.js')

                                            let value = ed.value;
                                            value = reverseString ( value )
                                            let t = graph.track;
                                            for (let ti of t) {
                                                let sequence = ti.sequence;
                                                var searchStrLen = value.trim().length;
                                                if (searchStrLen <= 2) {
                                                    alert(' Search string must be more than two characters ')
                                                    return;

                                                }

                                                var startIndex = 0, index, indices = [];

                                                while ((index = sequence.indexOf(value, startIndex)) > -1) {
                                                    indices.push(index);
                                                    startIndex = index + searchStrLen;
                                                }

                                                let TrackLayer = await exec('baja/bio/track-layer.js')
                                                let layer = new TrackLayer('' + value.trim(), ti.tgraph.xmin, 0, ti.tgraph.xmax, 1)
                                                for (let ind of indices) {
                                                    let ab = new Annotation('highlight', 'highlight', ti.tgraph.xmin + ind, ti.tgraph.xmin + ind + searchStrLen, ti.strand)
                                                    ab.color = selectedColor;
                                                    layer.addAnnotation(ab);

                                                }
                                                ti.addLayer(layer);

                                            }

                                        })
                                    },

                                ]
                            }
                        }
                    }

                ],

            ]
        }
    }

    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
    CurrentLayout.setComponent('buttonMenuPanel', find_panel);

}
