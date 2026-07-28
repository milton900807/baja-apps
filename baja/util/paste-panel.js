function (text__, graph, genegraph_panel_layout, e) {

    return new Promise(async (resolve, reject) => {

        console.log('debubg');

        e.paste_panel = false;

        let jsonPanel = null;
        let cb = createIonFunction((___panel) => {
            jsonPanel = ___panel;
        })

        function removeColumn(text, columnIndex) {

            const lines = text.split('\n');

            const linesWithoutColumn = lines.map(line => {

                const columns = line.split(/\s+/);

                columns.splice(columnIndex - 1, 1);

                return columns.join(' ');
            });

            return linesWithoutColumn.join('\n');
        }

        function parseAndExpandDNASequences(text) {
            const sequenceObjects = [];

            const regex = /([atgcATGC]+) \(SEQ ID NOs: (.*?)\);/g;
            let match;

            while ((match = regex.exec(text)) !== null) {
                const sequence = match[1];
                const idsPart = match[2];

                const idParts = idsPart.split(/,\s*|\s+or\s+/).filter(part => part.trim());

                idParts.forEach(part => {

                    if (part.includes('to')) {

                        const [start, end] = part.split('to').map(Number);
                        for (let id = start; id <= end; id++) {
                            sequenceObjects.push({ sequence, id });
                        }
                    } else {

                        const id = Number(part);
                        sequenceObjects.push({ sequence, id });
                    }
                });
            }

            return sequenceObjects;
        }

        function concatenateStrings(aggregate, array) {
            const result = [];
            for (let i = 0; i < array.length; i += aggregate) {
                let concatenatedString = '';

                for (let j = i; j < i + aggregate && j < array.length; j++) {
                    concatenatedString += array[j];
                }
                result.push(concatenatedString.toUpperCase());
            }

            return result;
        }

        function parseDNALikeStrings(text) {

            const regex = /\b([aAcCgGtT]{10}\s?){1,4}\b/g;
            const matches = text.match(regex) || [];

            const validMatches = matches.map(match => match.replace(/\s/g, '').toUpperCase())
                .filter(match => match.length >= 10 && match.length <= 40);
            return validMatches;
        }

        let loadInhibitionList = async (dnaSequences, graph) => {
            let Barchart = await exec('baja/bio/barchart-track.js')
            let Biopolymer = await exec('baja/chem/biopolymer.js');
            if (dnaSequences != null && dnaSequences.length > 0) {
                graph.setMessage("Attempting to map " + dnaSequences.length + " sequences ")
                let seqlist = []
                for (let i of dnaSequences) {
                    let s = i.dna;
                    let val = i.number;
                    let uid = i.id;
                    seqlist.push([uid, s, val])
                }
                let mapped = 0;
                for (let t of graph.track) {
                    let sequence = t.sequence.trim();
                    let ed = 1;
                    let res = await exec('py/bio/map/le-map-sequences.py', sequence, seqlist, ed);
                    let index__ = 0;
                    if (res && res.length > 0) {
                        for (let gr of res) {
                            if (gr && gr.length > 0) {
                                for (let r of gr) {
                                    if (r[2]) {
                                        let synthesis = r[1]
                                        let bioObject = {
                                            'trackName': t.name,
                                            'startIndex': t.xi + r[3],
                                            'strand': t.strand,
                                            'endIndex': t.xi + r[3] + r[2].length,
                                            'y': (t.tgraph.ymax - 0.2)
                                        }
                                        if (r[0].length === 0) {
                                            r[0] = '' + index__++;
                                        }
                                        console.log(" adding oligo " + r[1])
                                        let compound = Biopolymer.generateDNAOligo(r[0], synthesis, bioObject)
                                        let seq = t.getSequenceRange(compound.xi, compound.xf);
                                        compound.id = r[0];
                                        compound.sequence = seq;
                                        compound.highlight(10000, 'purple')
                                        t.addOligo(compound);
                                        mapped++;
                                        console.log('debubg');

                                        let vorl = seqlist.find(obj => obj[0] === compound.id)
                                        if (vorl[2]) {
                                            let percent = parseFloat(vorl[2]);
                                            percent = Math.max(0, Math.min(100, percent));
                                            const red = Math.floor((100 - percent) * 255 / 100);
                                            const green = Math.floor(percent * 255 / 100);
                                            const color = '#' + componentToHex(red) + '00' + componentToHex(green);
                                            percent = percent / 100;
                                            let bc = new Barchart(vorl[0], compound.xi, percent, color)
                                            compound.y = percent
                                            t.plots.push(bc)

                                        }
                                    }

                                }
                            }
                        }
                    } else {
                        graph.setMessage(' It appears there are no matches in the list provided')
                    }
                }
                let total = seqlist.length;
                showModal({
                    wid: 'json',
                    data: JSON.stringify({
                        'Mapped': mapped,
                        'Total': total
                    })
                })
            }

        }

        const PRIMER_PROBE = 'FORWARD PRIMER | PROBE | REVERSE PRIMER'
        const PRIMER_PROBE_ct = 'FORWARD PRIMER | PROBE | REVERSE PRIMER | CT'
        const SEQUENCE_ID_INHIBITION_TABLE = 'ID | Sequence | %inhibition'
        const SEQUENCE_ID_TABLE = 'ID | Sequence'
        const SEQUENCE = 'SEQUENCE list'
        const ID_INHIBITION = 'ID | %inhibition'

        resolve();
    })

}
