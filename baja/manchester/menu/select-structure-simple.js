function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.deselectAllTracks();

    let structures = null;

    graph.addMouseDownListener((x, y) => {
        structures = graph.getStructure(x, y)
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        console.log(JSON.stringify(structures))
        if (!structures || structures.length <= 0) {
            graph.hideMenu();
            return
        }

        for (let str of structures) {
            if (str && str.length > 0) {
                for (let s of str) {

                    if (s.highlight)
                        s.highlight(400);
                }
            }
        }

        let jpanel = null;
        let jsonBench = createIonFunction((panel) => {
            jpanel = panel
        })

        graph.showMenu([
            {
                label: 'Edit...',
                click: () => {
                    let strs = []
                    for (let row of structures) {
                        if (row && row.length > 0) {
                            strs.push(row)
                        }
                    }
                    let structure_view = {
                        wid: 'card',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'width': '100%',
                                        'height': '800px',
                                        refCallback: jsonBench,
                                        'component': {
                                            wid: 'json',
                                            data: JSON.stringify(strs)
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
                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        })
                                                    },
                                                    {
                                                        label: 'Apply', ionFunction: createIonFunction(() => {

                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        })
                                                    },
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', structure_view);

                },
                move: () => {

                }

            },
            {
                label: 'Edit Sequence',
                click: () => {
                    let strs = '';
                    for (let row of structures) {
                        for (let s of row) {
                            strs += s.sequence + '\n'
                        }
                    }
                    showModal({
                        wid: 'text-editor',
                        data: {
                            width: '700px',
                            'text': strs
                        }
                    })
                },
                move: () => {

                }

            },
            {
                label: 'Show/Hide Off-targets',
                click: () => {
                    if (selectedTrack) {
                        let os = selectedTrack.oligos;
                        selectedTrack.showOfftargets = (!selectedTrack.showOfftargets)
                        console.log('debubg');
                        for (let o of os) {
                            o.showOfftargets = (!o.showOfftargets);
                            console.log(" show off targets " + o.showOfftargets)
                        }
                    }
                }

            },
            {
                label: 'View Off-targets',
                click: () => {

                    let strs = '';
                    for (let row of structures) {
                        for (let s of row) {
                            strs += 'seq:' + s.sequence + '\n' + s.offtarget + '\n'
                        }
                    }

                    let zoom_to = {
                        wid: 'card',
                        componentRef: 'bottomPanel',
                        height: '100%',
                        data: {
                            height: '100%',
                            cards: [
                                [
                                    {
                                        'title': '',
                                        'width': '100%',
                                        "height": '800px',
                                        'component': {
                                            wid: 'json',
                                            data: JSON.stringify(structures)

                                        }
                                    },

                                    {
                                        'title': '',
                                        'width': '100%',
                                        height: '100%',

                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'OK', ionFunction: createIonFunction(() => {

                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                            hideAllModal();

                                                        })
                                                    },
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }

                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', zoom_to);

                },
                move: () => {

                }

            },
            // {
            //     label: 'Oligo Editor',
            //     click: async () => {
            //         let monomers = await exec('baja/chem/monomers.js')
            //         let fixStructure = (struc) => {
            //             if (struc.indexOf('{') > 0) {
            //                 return struc;
            //             }

            //             let helmstring = '';
            //             let t1 = struc.indexOf('[');
            //             let t2 = struc.indexOf('(')

            //             if (t1 < 0 && t2 > 0) {
            //                 let spt = struc.split('.')
            //                 let nh = 'RNA1{';
            //                 let previouslinker = '';
            //                 for (let s of spt) {

            //                     let iparen = s.indexOf('(')
            //                     let eparen = s.indexOf(')')
            //                     let sug = s.substring(0, iparen);
            //                     let base = s.substring(iparen + 1, eparen)
            //                     let linker = s.substring(eparen + 1)

            //                     if (sug.length > 1) {
            //                         sug = '[' + sug + ']'
            //                     }
            //                     if (base.length > 1) {
            //                         base = '[' + base + ']'
            //                     }
            //                     if (linker.length > 1) {
            //                         linker = '[' + linker + ']'
            //                     }
            //                     nh += previouslinker + sug + '(' + base + ')'
            //                     previouslinker = linker + '.';
            //                 }
            //                 nh += '}$$$$'
            //                 helmstring = nh;

            //             }
            //             else
            //                 if (struc.indexOf('[') === 0) {

            //                     let spt = struc.split('.')
            //                     let nh = 'RNA1{';
            //                     for (let s of spt) {
            //                         s = s.trim();
            //                         let li = s.indexOf(']')
            //                         if (li > 0) {
            //                             let si = s.indexOf('[')
            //                             if (si === 0) {
            //                                 let base = s.substring(si + 1, li)
            //                                 let sug = s.substring(li + 1)
            //                                 base = base.trim();
            //                                 sug = sug.trim();

            //                                 if (sug.length > 1) {
            //                                     sug = '[' + sug + ']'
            //                                 }
            //                                 if (base.length > 1) {
            //                                     base = '[' + base + ']'
            //                                 }

            //                                 nh += sug + '(' + base + ')'
            //                             } else {
            //                                 let linker = s.substring(0, si)
            //                                 let base = s.substring(si + 1, li)
            //                                 let sug = s.substring(li + 1)
            //                                 linker = linker.trim();
            //                                 sug = sug.trim();
            //                                 base = base.trim();

            //                                 if (sug.length > 1) {
            //                                     sug = '[' + sug + ']'
            //                                 }
            //                                 if (base.length > 1) {
            //                                     base = '[' + base + ']'
            //                                 }
            //                                 if (linker.length > 1) {
            //                                     linker = '[' + linker + ']'
            //                                 }

            //                                 nh += linker + '.' + sug + '(' + base + ')'

            //                             }
            //                         } else {
            //                             s = s.trim();
            //                             if (s.length > 0) {
            //                                 s = '[' + s + ']'
            //                             }
            //                             nh += s + '.';
            //                         }
            //                     }
            //                     nh += '}$$$$'
            //                     helmstring = nh;

            //                 }
            //             return helmstring;
            //         }
            //         let strs = '';
            //         let selectedOligo = null;
            //         console.log('debubg');
            //         for (let row of structures) {
            //             for (let s of row) {
            //                 selectedOligo = s;
            //                 strs += fixStructure(s.structure);
            //                 break;
            //             }
            //         }
            //         strs = strs.trim();
            //         let medchemEditor = null;
            //         let js = {
            //             "wid": "medchem",
            //             "data": {
            //                 "helm": strs,
            //                 "structure": selectedOligo,
            //                 monomers: monomers['monomers'], listener: createIonFunction((_medchemEditor) => {
            //                     medchemEditor = _medchemEditor;
            //                 })
            //             },
            //             "title": 'medchemeditor'
            //         }

            //         let meditor = {
            //             wid: 'card',
            //             componentRef: 'bottomPanel',
            //             data: {
            //                 height: '800px',
            //                 cards: [
            //                     [
            //                         {
            //                             'title': '',
            //                             'width': '100%',
            //                             'component': js
            //                         },

            //                         {
            //                             'title': '',
            //                             'width': '100%',
            //                             'component': {
            //                                 wid: 'mt-button', data: {
            //                                     buttons: [
            //                                         {
            //                                             label: 'Apply', ionFunction: createIonFunction(() => {

            //                                                 if (medchemEditor != null) {
            //                                                     let helm = medchemEditor.getHELM();
            //                                                     selectedOligo.structure = helm;

            //                                                 }

            //                                                 CurrentLayout.clearComponent('mainPanel')
            //                                                 CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            //                                             })
            //                                         },
            //                                         {
            //                                             label: 'Cancel', ionFunction: createIonFunction(() => {
            //                                                 CurrentLayout.clearComponent('mainPanel')
            //                                                 CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            //                                             })
            //                                         }
            //                                     ]
            //                                 }
            //                             }
            //                         }
            //                     ]]
            //             }
            //         }
            //         CurrentLayout.clearComponent('mainPanel')
            //         CurrentLayout.setComponent('mainPanel', meditor);
            //     },
            //     move: () => {
            //     }

            // },

            {
                label: 'Move vertical',
                click: () => {
                    exec('baja/manchester/menu/move-oligos-vertical.js', graph)
                },
                move: () => {

                }

            },
            {
                label: 'Delete',
                click: () => {

                    let track = null;
                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        track = graph.track[trackIndex]
                    }
                    for (let row of structures) {
                        for (let col of row) {

                            if (track != null) {
                                const id = track.oligos.indexOf(col);
                                if (id > -1) {
                                    track.oligos.splice(id, 1);
                                }
                            } else {
                                console.log(' track not found ')
                            }
                        }
                    }
                },
                move: () => {

                }

            }, {
                label: 'Set ref sequence',
                click: () => {

                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        track = graph.track[trackIndex]
                        for (let o of track.oligos) {
                            let sequence = track.sequence.substring(Math.floor(o.xi - track.xi), Math.floor(o.xf - track.xi));
                            o.sequence = sequence;

                            if (sequence.length < 10) {
                                console.log('debubg');
                            }

                        }
                    }

                },
                move: () => {

                }

            },
            {
                label: 'Clear all compounds',
                click: () => {

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
                                            data: '<font color=red> Are you sure you want to remove all compounds? </font>'
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

                                                            let trackIndex = graph.getTrack(x, y)
                                                            if (trackIndex >= 0) {
                                                                track = graph.track[trackIndex]
                                                                track.oligos = []
                                                            }
                                                            graph.setMessage(" Compounds removed from all tracks.");
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

                }
            },

        ], x, y)
    })
}
