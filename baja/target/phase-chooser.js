function (graph, track, structures) {
    return new Promise(async (resolve, reject) => {
        let Biopolymer = await exec('ljl/chem/biopolymer.js')

        let xi = -1;
        let xf = -1;

        for (let str of structures) {
            if (str && str.length > 0) {
                for (let c of str) {

                    if (xi < 0) {
                        xi = c.xi;
                        xf = c.xf;
                    }

                    if (xi > c.xi) {
                        xi = c.xi;
                    }
                    if (xf < c.xf) {
                        xf = c.xf;
                    }
                }
            }
        }

        let snps = track.getSnpindelsInRange(xi, xf, graph)

        console.log(' xi ' + xi);
        console.log(' xf ' + xf)

        let phase0 = []
        let phase1 = []
        for (let s of snps) {
            if (s.phase === 0) {
                phase0.push(s)
            } else if (s.phase === 1) {
                phase1.push(s);
            }
        }
        let select = (v) => {

            for (let str of structures) {
                if (str && str.length > 0) {
                    for (let c of str) {

                        console.log('debubg');
                        let se = track.getSequenceRange(c.xi, c.xf);
                        if (v === 0) {
                            for (let p of phase0) {
                                let i = Math.abs (c.xi - p.xi);
                                let f = c.xf - p.xf-1;

                                var txt2 = se.substring(0, i) + p.alternate0  + se.substring (i+p.alternate0.length);

                                c.sequence = txt2;
                                Biopolymer.refactorTargetSequence ( c, txt2, track.strand );
                            }
                        } else {

                            for (let p of phase1) {
                                let i = Math.abs (c.xi - p.xi);
                                let f = Math.abs ( c.xf - p.xi);
                                let substring = se.substring ( i, f);

                                se = se.replace ()
                                console.log(' i ' + i + ' f ' + f);
                            }

                        }
                    }
                }
            }
        }

        let p = [];
        if (phase0.length > 0) {
            p.push(
                {
                    button: {
                        'label': 'Phase 0', 'ionFunction': createIonFunction(async () => {
                            select(0);
                        })
                    }
                }
            );
        }
        if (phase1.length > 0) {
            p.push(
                {
                    button: {
                        'label': 'Phase 1', 'ionFunction': createIonFunction(async () => {
                            select(1);
                        })
                    }
                }
            );
        }

        let c1 = {
            wid: 'card',
            data: {

                'style.padding-left': '12px',
                cards: [
                    [
                        {

                            width: '100%',

                            'component':
                            {
                                wid: 'html', data:`<hr> Apply mutations to target sequence (i.e. Phase 1 or 0)`
                            }
                        },

                        {

                            width: '100%',

                            'component':
                            {
                                wid: 'table', data: {
                                    width: '25%',
                                    height: "100px",

                                    padding_top: '0px',
                                    showHeader: false,
                                    rows: p
                                }
                            }
                        }, {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        }

                    ], [

                    ]
                ]
            }
        }
        resolve(c1)
    })
}
