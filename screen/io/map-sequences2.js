function (s, graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {

        let Biopolymer = await exec('baja/chem/biopolymer.js');
        const dnaPattern = /[ATCG]{10,150}/g;
        const dnaSequences = [];
        let match;
        while ((match = dnaPattern.exec(s)) !== null) {
            dnaSequences.push(match[0]);
        }
        const regex = /([ATCG]{10,200})\s(\d+)/g;
        let matches;
        let results = [];
        while ((matches = regex.exec(s)) !== null) {
            results.push({ id: uuid(), dna: matches[1], number: parseInt(matches[2]) });
        }
        if (results.length > 0) {
            loadInhibitionList(results, graph)
        } else {
            if (dnaSequences != null && dnaSequences.length > 0) {
                graph.setMessage("Attempting to map " + dnaSequences.length + " sequences ")
                let seqlist = []
                let index = 1;
                for (let i of dnaSequences) {
                    seqlist.push([index, i])
                    index++;
                }

                let pasteSequences = async (seqlist) => {
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

                                            let compound = Biopolymer.generateDNAOligo(r[0], synthesis, bioObject)
                                            let seq = t.getSequenceRange(compound.xi, compound.xf);
                                            compound.sequence = seq;
                                            compound.highlight(10000, 'purple')
                                            t.addOligo(compound);
                                            mapped++;

                                            graph.setMessageCenter(' Mapped ' + compound.sequence, 40)

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
                pasteSequences(seqlist);

            }
        }
        return resolve ();
    })

}
