function (graph, props) {

    return new Promise(async (resolve, reject) => {

        props.selected_chemistry = { "type": "DNA", "template": "[(?)d.p.]{n-1}[(?)d]{1}", "shapeFunction": "baja/shapes/myshapefunction.js" }

        let molecule_type_html_render = await exec('baja/manchester/render-moltype.js')
        let Biopolymer = await exec('baja/chem/biopolymer.js')

        let display = {
            wid: 'html',
            data: { ionFunction: createIonFunction(() => { return ` Selected template: ` + molecule_type_html_render(props.selected_chemistry) }) }
        }

        let ChemistryTemplateDB = await exec('baja/chem/chem-template-repo.js')

        let selectMethod = async (v) => {
            let cdb = await new ChemistryTemplateDB();
            let dataobject = await cdb.loadChem(v);
            dataobject['name'] = v.name;
            props.selected_chemistry = dataobject;
        }

        function componentToHex(c) {
            const hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }

        let le = await exec('baja/math/le-distance.js')
        let Barchart = await exec('baja/bio/barchart-track.js')
        function generateColor(percent) {

            percent = Math.max(0, Math.min(100, percent));

            const red = Math.floor((100 - percent) * 255 / 100);
            const green = Math.floor(percent * 255 / 100);

            const color = '#' + componentToHex(red) + '00' + componentToHex(green);

            return color;
        }

        let runsequenceSearch = async (in_seq, ledistance, percent, name) => {

            return new Promise(async (resolve, reject) => {
                function sleepIt(ms) {
                    return new Promise(resolve => setTimeout(resolve, ms));
                }

                for (let t of graph.track) {
                    let seq = in_seq;
                    let len = seq.length;
                    let sequence = t.sequence.trim();
                    for (let i = 0; i < sequence.length - len; i++) {
                        let seq_slice = sequence.substring(i, i + len);

                        let distance = 0;
                        if (ledistance === 0 && (seq === seq_slice)) {
                            distance = 0;
                        } else {
                            distance = le(seq, seq_slice);
                        }

                        if (distance <= ledistance) {
                            let xcoord = t.xi + i;
                            console.log('debubg');

                            if ( percent <= 0 ){
                                percent = 0.00001;
                            }
                            let bc = new Barchart(name, xcoord, percent, generateColor(percent * 100))
                            t.plots.push(bc)
                            let chemistryObject = props.selected_chemistry;
                            let bioObject = {
                                'targetSequence': in_seq,
                                'trackName': t.name,
                                'startIndex': t.xi + i,
                                'strand': t.strand,
                                'endIndex': t.xi + i + in_seq.length,
                                'y': (t.tgraph.ymax - 0.2)
                            }
                            let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                            t.addOligo(compound);

                        } else {

                            let seq = Biopolymer.reverseComp(in_seq)
                            let distance = 0;
                            if (ledistance === 0 && (seq === seq_slice)) {
                                distance = 0;
                            } else {
                                distance = le(seq, seq_slice);
                            }

                            if (distance <= ledistance) {

                                let xcoord = t.xi + i;
                                let bc = new Barchart(name, xcoord, percent, generateColor(percent * 100))
                                t.plots.push(bc)
                                let chemistryObject = props.selected_chemistry;
                                let bioObject = {
                                    'targetSequence': in_seq,
                                    'trackName': t.name,
                                    'startIndex': t.xi + i,
                                    'strand': t.strand,
                                    'endIndex': t.xi + i + in_seq.length,
                                    'y': (t.tgraph.ymax - 0.2)
                                }
                                let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                t.addOligo(compound);
                            }
                        }
                        sleepIt(100)
                    }
                }
                resolve();
            })
        }
        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        let runsequence = async (in_seq, ledistance, ops, percent) => {
            if (ledistance == undefined) {
                ledistance = 0;
            }
            for (let t of graph.track) {
                let sp = in_seq.split('\t')
                let seq = '';
                let start = -1;
                let idv;

                if (sp && sp.length === 3) {
                    idv = sp[0]
                    seq = sp[1]
                    start = +sp[2] + 1
                }
                else
                    if (sp && sp.length > 1) {
                        start = +sp[1] + 1
                        seq = sp[0]
                    } else {
                        seq = in_seq;
                    }
                if (ops) {
                    seq = ops(seq);
                }
                let len = seq.length;
                if (start > 0) {
                    let selected_chemistry = props.selected_chemistry;
                    Biopolymer.createOligoFromTemplateUseSeqIn(selected_chemistry, t, start, seq, 0.2, idv)
                } else {
                    let sequence = t.sequence.trim();
                    if (le === 0) {
                        const dnaLength = sequence.length;
                        for (let i = 0; i <= dnaLength - len; i++) {
                            const forwardWindow = dnaSequence.slice(i, i + len);

                            if (seq == forwardWindow) {
                                matches.push({
                                    gene: forwardWindow,
                                    startIndex: i,
                                    endIndex: i + len - 1,
                                    direction: "forward",
                                });
                            }
                        }
                    } else {
                        for (let i = 0; i < sequence.length - len; i++) {
                            let seq_slice = sequence.substring(i, i + len);

                            let distance = le(seq, seq_slice);
                            if (ledistance < 0) {
                                ledistance = 0;
                            }

                            if (distance <= ledistance) {
                                let xcoord = t.xi + i;
                                let bc = new Barchart('' + i + ' ' + percent, xcoord, percent, 'lightBlue')
                                t.plots.push(bc)
                                let chemistryObject = props.selected_chemistry;
                                let bioObject = {
                                    'targetSequence': in_seq,
                                    'trackName': t.name,
                                    'startIndex': t.xi + i,
                                    'strand': t.strand,
                                    'endIndex': t.xi + i + in_seq.length,
                                    'y': (t.tgraph.ymax - 0.2)
                                }
                                let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                t.addOligo(compound);

                            }
                        }
                    }
                }
            }

        }

        await hideAllModal();
        let sequenceTextEditor;
        let descHook = createIonFunction((p) => {
            sequenceTextEditor = p;
        });
        let leDistance;
        let mode = 'forward'
        let sequence_input = {
            wid: 'card',
            data: {
                "style.padding-top": '1px',
                "style.border": '1px',
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': {
                                wid: 'text-editor',
                                refCallback: descHook,
                                height: 800,
                                data: {
                                    showButton: false,
                                    editorOptions: { language: 'text', automaticLayout: true },
                                    keybinding: {
                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                        })
                                    },
                                    height: '800px'
                                }
                            }
                        },
                        {
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Search all tracks', ionFunction: createIonFunction(async () => {

                                                let p = new Promise(async (resolve, reject) => {

                                                    await hideAllModal();
                                                    let progressBar;
                                                    let w = {
                                                        wid: 'progress',
                                                        componentRef: 'progressBar',
                                                        data: {
                                                            'progress': 1,
                                                            'progressBar': createIonFunction((progessBar) => {
                                                                progressBar = progessBar;
                                                            })
                                                        }
                                                    }
                                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                    CurrentLayout.setComponent('buttonMenuPanel', w);

                                                    let seqlist = sequenceTextEditor.getActiveTabContent().split('\n')
                                                    let ledistance = 0;
                                                    let percent_utc = 0;
                                                    let index = 0;
                                                    for (let in_seq of seqlist) {
                                                        in_seq = in_seq.trim();
                                                        percent_utc = 0;
                                                        let name = index + '';
                                                        in_seq = in_seq.replace(/\s\s+/g, ' ');
                                                        in_seq = in_seq.replace(/\t\t+/g, ' ');
                                                        if (in_seq.indexOf(' ') > 0) {
                                                            let sp = in_seq.split(' ')
                                                            if (sp.length === 3) {
                                                                in_seq = sp[1]
                                                                percent_utc = parseInt(sp[2])
                                                            }
                                                            name = sp[0]
                                                        }
                                                        in_seq = in_seq.trim();
                                                        let percent = percent_utc / 100;
                                                        if (in_seq != null && in_seq.length > 0) {
                                                            await runsequenceSearch(in_seq, ledistance, percent, name);
                                                        }
                                                        await sleep(500);

                                                        progressBar((index + 1) / seqlist.length * 100);
                                                        index++;
                                                    }
                                                    resolve();
                                                })
                                                p.then(r => {
                                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')

                                                })

                                            })
                                        }]
                                }
                            }
                        }
                    ]]
            }
        }

        resolve(sequence_input)

    })

}
