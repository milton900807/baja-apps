function () {

    return new Promise(async (resolve, reject) => {

        let AlignmentMapGlyph = class AlignmentMapGlyph {
            sequence;
            start;
            end;
            strand;
            chromosome;
            type;
            name;
            tgraph;

            constructor(seq) {
                this.sequence = seq;
            }

            setTrack(g) {
                tgraph = g;
            }

            setTrack(g) {
                tgraph = g;
            }

            draw(y, tgraph, graph) {

                let i = 20;
                if (this.sequence) {
                    for (let s of this.sequence) {
                        let color = 'gray'
                        if (s === 'X') {
                            color = 'red'
                        } else if (s === '-')
                            color = 'blue'
                        graph.drawString(s, tgraph.X(i++), tgraph.Y(y), color, "11px Arial")
                    }
                }
                else {
                    console.log('debubg');
                }
            }

        }
        return resolve(AlignmentMapGlyph)
    });

}
