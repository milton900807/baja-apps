function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMessage(" Select a track... ")

    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })

    function parseAminoAcidNotation(notation) {

        const regex = /p\.([A-Za-z]+)(\d+)([A-Za-z]+)/;
        const match = notation.match(regex);

        if (match) {
            return {
                originalAminoAcid: match[1],
                position: parseInt(match[2], 10),
                newAminoAcid: match[3]
            };
        } else {
            return null;
        }
    }

    function parseMutationNotation(notation) {

        const regex = /^(c\.)(\d+)([ACGT])>([ACGT])$/;
        const match = notation.match(regex);

        if (!match) return null;

        const [, prefix, position, originalNucleotide, mutatedNucleotide] = match;

        return {
            prefix,
            position: parseInt(position, 10),
            originalNucleotide,
            mutatedNucleotide
        };
    }

    const notation = "c.35G>A";
    const parsed = parseMutationNotation(notation);

    if (parsed) {
        console.log(`Prefix: ${parsed.prefix}`);
        console.log(`Position: ${parsed.position}`);
        console.log(`Original Nucleotide: ${parsed.originalNucleotide}`);
        console.log(`Mutated Nucleotide: ${parsed.mutatedNucleotide}`);
    } else {
        console.log("Invalid mutation notation.");
    }

    let host_ = window['env']['apiUrl']
    let selectedTrack = null;
    let menuList = []
    function parseMutation(mutation) {
        const regex = /^([A-Z])(\d+)([A-Z])$/;
        const match = mutation.match(regex);

        if (!match) {
            return null;
        }

        return {
            originalAminoAcid: match[1],
            position: parseInt(match[2], 10),
            newAminoAcid: match[3]
        };
    }

    function countMismatchedCharacters(str1, str2) {

        let mismatchCount = 0;

        if (str1.length !== str2.length) {
            return "Strings must have the same length.";
        }
        for (let i = 0; i < str1.length; i++) {
            if (str1[i] !== str2[i]) {
                mismatchCount++;
            }
        }
        return mismatchCount;
    }

    menuList.push({
        label: 'AA mutation',
        click: async (xwc, ywc) => {
            let Mutation = await exec('flexigraph/mutation-annotation.js');
            if (selectedTrack) {
                let va = await prompt("Enter mutation syntax", ["Mutation"], { "Mutation": "" }, 300, 330)
                let tm = va['Mutation']
                let obj = parseMutation(tm)
                console.log(" object " + obj)
                let index = selectedTrack.ORFIndexToGenomicIndex(parseInt(obj.position));
                let v = await exec('baja/var/aa-to-na-mutations.js', tm, obj['originalAminoAcid'], obj['newAminoAcid'])
                for (let i of v) {
                    if (selectedTrack.strand <= 0) {
                        i = i.split("").reverse().join("");
                        selectedTrack.addsnpindel(new Mutation('mutation-annotation', index + 1,
                            index + 4, tm + ': ' + i, 0, selectedTrack.strand));

                    } else {
                        selectedTrack.addsnpindel(new Mutation('mutation-annotation', index - 3,
                            index, tm + ': ' + i, 0, selectedTrack.strand));
                    }
                    graph.zoom(selectedTrack.tgraph.X(index - 10), selectedTrack.tgraph.X(index + 10))
                }
            }
        }
    })

    menuList.push({
        label: 'Point AA mutation',
        click: async (xwc, ywc) => {
            let SnpIndel = await exec('flexigraph/snpindel.js')
            console.log('debubg');
            if (selectedTrack) {
                let value = Math.floor(selectedTrack.tgraph.Xwc(xd))
                let tm = selectedTrack.getNearestAA(value);
                if (tm != null) {
                    let va = await prompt("Entera mutation syntax", ["Mutation"], { "Mutation": tm.aa + (tm.codon_index + 1) }, 300, 300)
                    let m = va['Mutation']
                    let obj = parseMutation(m)
                    let v = await exec('baja/var/aa-to-na-mutations.js', tm.codon, obj['originalAminoAcid'], obj['newAminoAcid'])
                    for (let i of v) {
                        let s = new SnpIndel('snp', tm.index - 2, tm.codon, i, 0, selectedTrack.strand)
                        s.reference0 = tm.codon;
                        s.alternate0 = i;
                        selectedTrack.addsnpindel(s)
                    }
                }

            }
        }
    })

    graph.addMouseMoveListener((x, y) => {
        let p_trackIndex = graph.getTrack(x, y);
        if (p_trackIndex >= 0) {
            graph.deselectAllTracks();
            if (graph.track[p_trackIndex])
                graph.track[p_trackIndex].showResizeBar = true;
            return;
        }
    }
    )
    graph.addMouseDownListener(async (x, y) => {

        xd = x;
        yd = y;
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        let editor;
        let typeAhead;

        if (selectedTrack)
            graph.showMenu(menuList, x, y)
    });

}
