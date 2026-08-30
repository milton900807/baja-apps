function (libid, graph, showMainPanel) {

    let selectedTrack = null;
    let m = {
        'label': 'Compound', 'ionfunction': createIonFunction(() => {
            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
            graph.selectOff();
            graph.addMouseDownListener((x, y) => {
                let structures = graph.getStructure(x, y)
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

                graph.showMenu([

                    {
                        label: 'View/Edit Structure',
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
                                                'title': '',
                                                'width': '100%',
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
                                                                    hideAllModal();
                                                                })
                                                            },
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(() => {
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

                            showModal(structure_view, 500, 400)
                        },
                        move: () => {

                        }

                    },
                    {
                        label: 'View Sequence',
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
                                    'code': strs
                                }
                            })
                        },
                        move: () => {

                        }

                    },
                    {
                        label: 'View Off-target',
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

                                                                    showMainPanel()
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
                    {
                        label: 'Register',
                        click: async () => {

                        },
                        move: () => {
                        }
                    },
                    // {
                    //     label: 'Oligo Editor',
                    //     click: async () => {

                    //         let monomers = await exec('baja/chem/monomers.js', libid)

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
                    //                     nh += previouslinker  + sug + '(' + base + ')'
                    //                     previouslinker = linker+ '.';
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

                    //                                                 showMainPanel();
                    //                                             })
                    //                                         },
                    //                                         {
                    //                                             label: 'Cancel', ionFunction: createIonFunction(() => {
                    //                                                 showMainPanel();
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
                        label: 'Target phase...',
                        click: async () => {

                            let phase_chooser = await exec('baja/target/phase-chooser.js', graph, selectedTrack, structures)
                            showModal(phase_chooser)

                        },
                        move: () => {

                        }

                    },

                    {
                        label: 'Structure templates...',
                        click: async () => {
                            let ChemTemplateDB = await exec('baja/chem/chem-template-db.js', libid)
                            let chemdb = new ChemTemplateDB();

                            let selectMethod = async (v) => {
                                let dataobject = await chemdb.loadChem(v);
                                console.log(" data object " + JSON.stringify(dataobject))
                                hideModal();

                                showModal({
                                    wid: 'json',
                                    data: JSON.stringify(dataobject)
                                })

                            }
                            let myChem = await exec('baja/chem/my-chem-w.js', libid, selectMethod)
                            showModal(myChem)

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

                    },

                ], x, y)

            })
        })

    }
    return m;
}
