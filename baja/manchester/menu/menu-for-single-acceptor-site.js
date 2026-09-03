function (graph, oligo, genegraph_panel_layout) {
    hide_menu = false;

    return new Promise(async (resolve, reject) => {
        let registered = false;
        CurrentLayout.clearComponent('labelPanel')
        CurrentLayout.setComponent('labelPanel', {
            wid: 'html',
            data: `${oligo.sequence} loading...`
        });
        let me = [
            {
                'label': 'Model', 'items': [
                    {
                        'label': 'Cis-regulatory splice models', 'ionfunction': createIonFunction(async () => {
                        })
                    }, {
                        'label': 'Trans-splicing factor', 'ionfunction': createIonFunction(async () => {
                            let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                for (let t of graph.track) {
                                    for (let o of t.oligos) {
                                        if (o.id === oligo.id) {
                                            let count = t.countOligosOfType('amplicon')
                                            t.removeOligosOfType('amplicon')
                                            graph.setMessage(" Removed " + (count - 1) + " amplicons. ");
                                            t.addOligo(oligo)
                                        }
                                    }
                                }
                            }, " Are you sure you want to remove all amplicons except this one?")
                            showModal(confirm)
                        })
                    },
                    {
                        'label': 'Set probe', 'ionfunction': createIonFunction(async () => {
                            let attr_window = 20;
                            let va = await prompt("Length", ["Length"], { "Length": attr_window }, 300, 300)
                            let m = va['Length']
                            if (m === null) {
                                attr_window = 20
                            } else {
                                attr_window = parseInt(m);
                            }
                            graph.rungraph(async () => { await exec('baja/manchester/menu/probe-action.js', graph, genegraph_panel_layout, attr_window) })
                            CurrentLayout.setComponent('labelPanel', {
                                wid: 'html',
                                data: ' Click on a track to see menu options... '
                            })

                        })
                    },
                    {
                        'label': 'Move (Y)', 'ionfunction': createIonFunction(async () => {
                            exec('baja/manchester/menu/move-oligos-vertical.js', graph)
                        })
                    },
                ]

            },

            {
                'label': 'Off-target', 'items': [
                    {
                        'label': `Run off-target on ppset ${oligo.id}`, 'ionfunction': createIonFunction(async () => {
                            let l = oligo.left;
                            let r = oligo.right;
                            let m = oligo.mid;
                            if (l && r && m)
                                await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l, r, m])
                            else if (l && r) {
                                await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l, r])
                            }
                        })
                    },
                    {
                        'label': `Modify Chemistry on ppset ${oligo.id}`, 'ionfunction': createIonFunction(async () => {
                            let l = oligo.left;
                            let r = oligo.right;
                            let m = oligo.mid;
                            const set = [l, r, m].filter((x) => x);
                            if (set.length)
                                await exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout, set)
                        })
                    },
                    {
                        'label': `Run off-target on left primer only`, 'ionfunction': createIonFunction(async () => {
                            let l = oligo.left;
                            if (l) {
                                l.offtargetsymbols = null;
                                l.offtarget = null;
                                await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l])
                            }
                        })
                    },
                    {
                        'label': `Modify Chemistry on left primer only`, 'ionfunction': createIonFunction(async () => {
                            let l = oligo.left;
                            if (l) await exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout, l)
                        })
                    },
                    {
                        'label': `Run off-target on right primer only`, 'ionfunction': createIonFunction(async () => {
                            let l = oligo.right;
                            if (l) {
                                l.offtargetsymbols = null;
                                l.offtarget = null;
                                await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l])
                            }
                        })
                    },
                    {
                        'label': `Modify Chemistry on right primer only`, 'ionfunction': createIonFunction(async () => {
                            let l = oligo.right;
                            if (l) await exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout, l)
                        })
                    },
                    {
                        'label': `Run off-target on probe only`, 'ionfunction': createIonFunction(async () => {
                            let l = oligo.mid;
                            if (l) {
                                l.offtargetsymbols = null;
                                l.offtarget = null;
                                await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l])
                            } else {
                                infoPrompt(" No probe defined for this amplicon ")
                            }
                        })
                    },
                    {
                        'label': `Modify Chemistry on probe only`, 'ionfunction': createIonFunction(async () => {
                            let l = oligo.mid;
                            if (l) await exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout, l)
                            else infoPrompt(" No probe defined for this amplicon ")
                        })
                    },

                    {
                        'label': 'Analysis', 'ionfunction': createIonFunction(async () => {

                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');

                            console.log('debubg');
                            if (oligo.type === 'amplicon') {
                                let left = oligo.left;
                                let right = oligo.right;
                                let mid = oligo.mid;
                                let cards = []
                                if (left && left.offtarget) {
                                    let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(left.offtarget))
                                    let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs, " Left:  " + left.synthesisSequence);
                                    cards.push(component)
                                }
                                if (right && right.offtarget) {
                                    let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(right.offtarget))
                                    let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs, " Right:  " + right.synthesisSequence);
                                    cards.push(component)
                                }
                                if (mid && mid.offtarget) {
                                    let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(mid.offtarget))
                                    let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs, " Probe:  " + mid.synthesisSequence);
                                    cards.push(component)
                                }

                                if (cards && cards.length > 0) {

                                    let returnButton = {
                                        'title': ' ', 'body': ``,
                                        'width': '100%',
                                        'component':
                                        {
                                            wid: 'mt-button', data: {
                                                buttons: [

                                                    {
                                                        label: 'Return to design', ionFunction: createIonFunction(async () => {
                                                            let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout)
                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);

                                                            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }

                                    cards.push(returnButton)

                                    let backtog = {
                                        wid: 'card',
                                        data: {
                                            cards: [

                                                cards

                                            ]
                                        }
                                    }

                                    CurrentLayout.clearComponent('mainPanel')
                                    CurrentLayout.setComponent('mainPanel', backtog);
                                } else {

                                    infoPrompt("Run off-targets calculation first.")
                                    return;

                                }
                            } else {
                                let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', oligo)
                                let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs);
                                let cards = []
                                cards.push(component)
                                let backtog = {
                                    wid: 'card',
                                    data: {
                                        cards: [cards]
                                    }
                                }
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', backtog);
                            }

                        })
                    },
                    {
                        'label': 'Raw report', 'ionfunction': createIonFunction(async () => {
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
                                                                    let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout)
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);

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
                                                    data: JSON.stringify(oligo.offtarget)
                                                }
                                            },
                                        ]
                                    ]
                                }
                            }

                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', backtog);

                        })
                    },
                ]
            },
        ]

        me.push(
            {
                'label': 'Export', 'items': [{
                    'label': 'Download sequences', 'ionfunction': createIonFunction(async () => {
                        let o = oligo;

                        let csvContent = ''
                        let blob = null;
                        if (o.right && o.left && o.mid) {
                            let header = 'ID,left, probe, right\n'
                            csvContent = o.IO + ',' +
                                o.right.synthesisSequence + ',' +
                                o.mid.synthesisSequence + ',' + o.right.synthesisSequence + '\n'
                            blob = new Blob([header, csvContent], { type: 'text/csv;charset=utf-8;' });

                        } else {
                            let header = 'ID,left,  right\n'
                            csvContent = o.IO + ',' +
                                o.right.synthesisSequence +
                                ',' + o.right.synthesisSequence + '\n'
                            blob = new Blob([header, csvContent], { type: 'text/csv;charset=utf-8;' });
                        }
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = o.name + 'ppset.csv';
                        link.style.display = 'none';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        console.log("The input string is 'ASO sequences'.");
                    }),
                    move: () => {
                    }
                }]
            })

        let butPan = {
            wid: 'menu',
            width: 300,
            data: {
                title: '  ',
                style: 'sub-container',
                menus: me

            }
        }

        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', butPan);
        CurrentLayout.clearComponent('labelPanel')
        CurrentLayout.setComponent('labelPanel', labelPan);

        resolve();
    })

}
