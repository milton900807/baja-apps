let complete_button = {
    wid: 'card',
    data: {
        cards: [
            [
                {
                    'title': ' ', 'body': ``,
                    'width': '100%',
                    'component':
                    {
                        wid: 'mt-button', data: {
                            buttons: [

                                {
                                    label: 'Raw results', ionFunction: createIonFunction(async () => {
                                        let backtog = {
                                            wid: 'card',
                                            data: {
                                                cards: [
                                                    [
                                                        {
                                                            'title': ' ', 'body': ``,
                                                            'width': '100%',
                                                            'component':
                                                            {
                                                                wid: 'mt-button', data: {
                                                                    buttons: [

                                                                        {
                                                                            label: 'Return to design', ionFunction: createIonFunction(async () => {
                                                                                let button_canvas = await exec('screen/controls/navigation-panel.js', graph)
                                                                                CurrentLayout.clearComponent('mainPanel')
                                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                                CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                                            })
                                                                        }
                                                                    ]
                                                                }
                                                            }
                                                        },
                                                        {

                                                            'title': ' ', 'body': ``,
                                                            'width': '100%',
                                                            'component': {
                                                                wid: 'json',
                                                                data: JSON.stringify(r)
                                                            }
                                                        },
                                                    ]
                                                ]
                                            }
                                        }

                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', backtog);
                                    })
                                }, {
                                    label: 'Download ', ionFunction: createIonFunction(async () => {
                                        function jsonToCSV(json) {
                                            const array = typeof json !== 'object' ? JSON.parse(json) : json;
                                            let str = `id,gid,hits,hits_0,hits_1,synthesisSequence,chr,contigmatch,editdistance,end,genome_offtarget,gglyph,qglyph,sglyph,start,strand\r\n`;
                                            function escapeCSV(data) {
                                                return `"${String(data).replace(/"/g, '""')}"`;
                                            }
                                            array.oligoQuery.forEach(oligo => {
                                                oligo.genomes.forEach(genome => {
                                                    oligo.offtarget.forEach(offtarget => {
                                                        const line = [
                                                            oligo.id,
                                                            genome.gid,
                                                            genome.hits,
                                                            genome.hits_0,
                                                            genome.hits_1,
                                                            oligo.synthesisSequence,
                                                            offtarget.chr,
                                                            offtarget.contigmatch,
                                                            offtarget.editdistance,
                                                            offtarget.end,
                                                            offtarget.genome,
                                                            offtarget.gglyph,
                                                            offtarget.qglyph,
                                                            offtarget.sglyph,
                                                            offtarget.start,
                                                            offtarget.strand
                                                        ].map(escapeCSV).join(',');

                                                        str += line + '\r\n';
                                                    });
                                                });
                                            });
                                            const blob = new Blob([str], { type: 'text/csv' });
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.setAttribute('hidden', '');
                                            a.setAttribute('href', url);
                                            a.setAttribute('download', 'download.csv');
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                        }
                                        jsonToCSV(r);
                                    })
                                }
                            ]
                        }
                    }
                },
            ]
        ]
    }
}

if (r != null && r['oligoQuery'] != null) {

    let oq = r['oligoQuery'];

    for (let o of oligos) {
        for (let off of oq) {
            if (o.id + '' == '' + off.id) {
                o.offtarget = off.offtarget;
                console.log('debubg');
            }
        }
    }
}

CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
CurrentLayout.setComponent('buttonMenuPanel', complete_button);
