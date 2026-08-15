function (graph) {

    let Barchart = class Barchart {
        name;
        x;
        color = 'gray'
        value;

        constructor(name, x, value) {
            this.x = x;
            this.value = value;
        }
        setColor(color) {
            this.color = color;
        }
        async draw(graph, tgraph) {
            await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.value), 'lightBlue', 2, 'round')

        }
    }

    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })

    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'title': 'controls',
            'height': 30,
            'width': 1200,
            'grid': {
                xmin: 0,
                xmax: 8,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': [
                {
                    x: 0, y: 0, label: 'Edit distance for sequence', ionFunction: createIonFunction(() => {

                        let m = {
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
                                                wid: 'text-editor',
                                                refCallback: editor_function,
                                                height: '100%',
                                                data: {

                                                    editorOptions: { language: 'text', automaticLayout: true },
                                                    libs: [
                                                        { 'name': 'core', 'path': 'genome/lib/core.js' },
                                                        { 'name': 'sample', 'path': 'genome/sample-gff.js' }
                                                    ],
                                                }
                                            }
                                        },
                                        {
                                            'title': null, 'body': `
                                            `,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'button',
                                                data: [
                                                    {
                                                        'label': '[LE Distance]', ionfunction: createIonFunction(async () => {
                                                            let in_seq = editor_.getContent();
                                                            in_seq = in_seq.trim();
                                                            let le = await exec('baja/math/le-distance.js')
                                                            for (let t of graph.track) {
                                                                let sequence = t.sequence.trim();
                                                                let len = in_seq.length;
                                                                for (let i = 0; i < sequence.length - len; i++) {
                                                                    let seq_slice = sequence.substring(i, i + len);
                                                                    let distance = le(in_seq, seq_slice);
                                                                    let percent = (len - distance) / len
                                                                    if (percent > 0.5 || distance < 0.1) {

                                                                        if (percent > 0.8) {
                                                                            console.log('debubg');
                                                                            console.log(distance);
                                                                        }
                                                                        let bc = new Barchart('', t.xi + i, percent)
                                                                        t.plots.push(bc)
                                                                    }

                                                                }
                                                            }
                                                            hideAllModal();
                                                        }), disableAfterClick: false
                                                    },
                                                    {
                                                        'label': 'Cancel', ionfunction: createIonFunction(() => {
                                                            hideAllModal();

                                                        }), disableAfterClick: false
                                                    }
                                                ]
                                            }
                                        }
                                    ]]
                            }
                        }
                        showModal(m)
                    })
                },
                {
                    x: 1, y: 0, label: 'Primers-probe sites', ionFunction: createIonFunction(async () => {

                        graph.setMessage ( 'Select a track ' )
                        exec ( 'baja/manchester/menu/primer-probe-action.js', graph)
                    })

                },
                {
                    x: 2, y: 0, label: 'Variant primer-probe sites', ionFunction: createIonFunction(async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if ( hasSnpindel == 1 ) {
                                graph.setMessage ( 'Select a variant' )
                                await exec ( 'baja/manchester/annotation/variant-primer-probe-actions.js', graph)
                            } else {
                                graph.setMessage('No variants found')
                            }
                        }
                    })

                },
                {
                    x: 4, y: 0, label: 'P-p all variants one haplotype', ionFunction: createIonFunction( async () => {
                        if ( graph.track.length > 0 ) {
                            let hasSnpindel = 0;
                            for ( let t of graph.track ) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if ( hasSnpindel == 1 ) {
                                graph.setMessage ( 'Select a phase' )
                                await exec ( 'baja/manchester/annotation/variant-primer-probe-actions.js', graph, true);
                            } else {
                                graph.setMessage('No variants found')
                            }
                        }
                        hideAllModal();

                    })
                },
                {
                    x: 5, y: 0, label: 'Tile all variants one haplotype', ionFunction: createIonFunction( async () => {
                        if ( graph.track.length > 0 ) {
                            let hasSnpindel = 0;
                            for ( let t of graph.track ) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if ( hasSnpindel == 1 ) {
                                graph.setMessage ( 'Select a phase' )
                                await exec ( 'baja/manchester/annotation/paint-oligos-snps.js', graph, true);
                            } else {
                                graph.setMessage('No variants found')
                            }
                        }
                        hideAllModal();

                    })
                },
                {
                    x: 6, y: 0, label: 'Phase Sequence', ionFunction: createIonFunction( async () => {
                        if ( graph.track.length > 0 ) {
                            let hasSnpindel = 0;
                            for ( let t of graph.track ) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if ( hasSnpindel == 1 ) {
                                graph.setMessage ( 'Select a phase' )
                                await exec ( 'baja/manchester/annotation/variant-primer-probe-actions.js', graph, true, true);
                            } else {
                                graph.setMessage('No variants found')
                            }
                        }
                        hideAllModal();

                    })
                },
                {
                    x: 7, y: 0, label: 'Phase sequence surrounding variant', ionFunction: createIonFunction( async () => {
                        if ( graph.track.length > 0 ) {
                            let hasSnpindel = 0;
                            for ( let t of graph.track ) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if ( hasSnpindel == 1 ) {
                                graph.setMessage ( 'Select a phase' )
                                await exec ( 'baja/manchester/annotation/variant-primer-probe-actions.js', graph, false, true);
                            } else {
                                graph.setMessage('No variants found')
                            }
                        }
                        hideAllModal();

                    })
                },

            ]
        }
    }
    return button_canvas

}
