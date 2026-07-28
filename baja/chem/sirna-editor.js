function (file, lib) {
    let monomerComponent = null;
    let sense = `r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()`;
    let antisense = `r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()`;
    let aso_template = `moe()sp.moe()sp.moe()sp.moe()sp.moe()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.moe()sp.moe()sp.moe()sp.moe()sp.moe()`
    let tabSelect = null;

    exec('baja/chem/monomers.js').then(async (monomers) => {
        let molObject;
        if (file && file['@microsoft.graph.downloadUrl']) {
            molObject = await GETJSON(file['@microsoft.graph.downloadUrl'])
        } else if (file.sense && file.antisense) {
            molObject = file;
        }

        if (molObject) {
            if (molObject.moltype && molObject.moltype === 'aso') {
                aso_template = molObject.antisense;
                tabSelect = 'ASO';
            } else {

                if (molObject['sense']) {
                    sense = molObject['sense']
                }
                if (molObject['antisense']) {
                    antisense = molObject['antisense']
                }
            }
        } else {
            molObject = {}
            molObject.sense = sense;
            molObject.antisense = antisense;
        }

        let __monomerComponentCallback = (ref) => {
            monomerComponent = ref;
        }

        let structures = [];

        let highlight_structure = (editorComponent, e) => {
            if (!editorComponent) {
                return;
            }
            let column = e.position.column;
            let lines = editorComponent.getLines();
            let top = lines.split('\n');
            top_str = top[0].trim();

            let temp = top_str.substring(0, column);
            let li = temp.lastIndexOf('.');
            let lf = temp.lastIndexOf(')')
            let lb = temp.lastIndexOf('(')
            if (lf > li)
                li = lf;
            if (lb > li)
                li = lb;

            let end = top_str.indexOf('(', column - 1)
            let end2 = top_str.indexOf('.', column - 1)
            let end3 = top_str.indexOf(')', column - 1)
            if (end2 > 0 && end2 < end) {
                end = end2;
            }
            if (end3 > 0 && end3 < end) {
                end = end3;
            }
            if (end < 0) {
                end = top_str.length;
            }

            let monomer = top_str.substring(li + 1, end);
            console.log(monomer);
            console.log('debubg');
            updateCalculation(monomer)

        }

        class MolecularCompoundInputs {
            mol_type = 'siRNA';
            senseSIInput;
            antisenseSIInput;
            sense_start = 0;
            antisense_start = 0;
        }
        let ib = new MolecularCompoundInputs();

        let template_ref = (ref) => {
            ib.antisenseSIInput = ref;
        }
        let innerComponentCallback = (ref) => {
            ib.senseSIInput = ref;
        }

        let updateCalculation = (symb) => {

            for (let m of monomers.monomers) {
                if (m.symbol === symb) {
                    monomerComponent.setMonomer(m)
                }
            }
        }
        let asoEditor = await exec('baja/chem/aso-editor.js')
        let SIRNAStruct = await exec('baja/chem/si-rna-struct.js')
        let structureGraph = null;
        let save_menu = null;

        let ch = {
            async chainSelected(chain) {
                let chainEditor = await exec('baja/chem/chain-editor.js', chain.structure, chain.label, (new_chain) => {

                    if (chain.label.toUpperCase() === 'ANTISENSE')
                        structureGraph.setAntisense(new_chain);
                    else
                        structureGraph.setSense(new_chain);

                }, highlight_structure)
                CurrentLayout.setComponent('siRNAEditor', chainEditor)
            }
        }
        let createComponent = async (jsonObject) => {
            let innerComponentCallback = createIonFunction( async (innerComponent) => {
                structureGraph = new SIRNAStruct(jsonObject, innerComponent)
                structureGraph.setMode('chain_select')
                structureGraph.addListener(ch)
                structures.push(structureGraph)
                save_menu = await exec('baja/chem/template-editor-menu.js', structureGraph, lib)

                CurrentLayout.setComponent('save_menu', save_menu)

            });
            let side_PanelCallback = createIonFunction((innerComponent) => {
                controlPanelCallback(innerComponent);
            });

            let card = {
                wid: 'canvas',
                refCallback: innerComponentCallback,
                data: {
                    'height': 60,
                    'mouseListener': createIonFunction((scx, scy) => {
                    }),
                    'mouseDownListener': createIonFunction((scx, scy) => {
                        if (structures && structures.length > 0) {
                            for (let str of structures) {

                                str.mouseDown(scx, scy)
                                ib.sense_start = str.sense_start;
                                ib.antisense_start = str.antisense_start;
                            }
                        }
                    }),
                    'mouseUpListener': createIonFunction((scx, scy) => {
                    }),
                    'mouseMoveListener': createIonFunction((scx, scy) => {
                    })
                }
            }
            return card;
        }

        let c1 = {
            wid: 'card',
            componentRef: 'siRNATab',
            data: {
                cards: [
                    [
                        {
                            wid: 'html',
                            height: '10px',
                            width: '100%',
                            data: "<p>"
                        }
                        ,
                        {
                            'title': '', 'body': ` `,
                            'width': '100%',
                            'padding_left': '50px',
                            'height': '50px',
                            'component': { wid: 'html', componentRef: 'save_menu', data: '' }
                        },
                    ],
                    [
                        {
                            'title': '', 'body': ``,
                            'width': '100%',
                            'height': '100px',
                            'component': await createComponent(molObject)

                        },

                        {
                            'title': '', 'body': ` `,
                            'width': '100%',
                            'height': '100px',
                            'component': { wid: 'html', componentRef: 'siRNAEditor', data: 'Select a chain above...' }
                        },
                        {
                            'title': '', 'body': ``,
                            'width': '100%',
                            'height': '500px',
                            'component': {
                                wid: 'mol-editor',
                                componentRef: 'mol-editor',
                                refCallback: createIonFunction(__monomerComponentCallback),
                                data: {
                                    monomers: monomers
                                }
                            }
                        },
                    ]

                ]
            }
        }

        showWidget({
            wid: 'html',
            data: '<h6> Oligo chemistry template editor </h6>'
        });
        showWidget({
            wid: 'tabs',
            data: {
                selectTab: tabSelect,
                overflow: 'hidden',
                cards: [
                    [

                        {
                            'title': 'siRNA', 'body': `
                        `, 'component': c1
                        },
                        {
                            'title': 'ASO ', 'body': `
                        `, 'component': asoEditor
                        },
                        {
                            'title': ' microRNA ', 'body': ` Chemistry modifications, monomers and backbone templates
                `, 'component': {
                                wid: 'table',
                                showHeader: false,
                                data: {
                                    rows: [
                                    ]
                                }
                            }
                        }

                    ]]
            }
        });

    })

}
