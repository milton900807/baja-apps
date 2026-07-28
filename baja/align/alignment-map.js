function () {

    return new Promise(async (resolve, reject) => {

        let AlignmentMap = class AlignmentMap {
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

            draw(y, tgraph, graph) {
                this.sequence.sort((a, b) => {
                    return a.matches - b.matches;
                });

                for (let s of this.sequence) {

                    let match = s.matches;
                    if ( match > 0 ){

                    }
                    let pos = s.position;
                    if (pos >= 0) {

                        if (match) {

                            graph.drawLine(tgraph.X(pos), y - 0.1, tgraph.X(pos), y + 0.3, 'green', 1, 'round')

                        }
                        else

                            graph.drawString('X', tgraph.X(pos), y)

                        index++;
                    }
                }

            }
        }
        return resolve(AlignmentMap)
    });

}
