function () {

    return new Promise(async (resolve, reject) => {

        let SeqObject = class SeqObject {
            sequence;
            start;
            end;
            strand;
            chromosome;
            genome;
            type;
            name;
            tgraph;
            ensembl;
            searching = false;
            symbol;

            constructor(seq) {
                this.sequence = seq;
            }

            setTrack(g) {
                tgraph = g;
            }

            draw(y, tgraph, graph) {

                if (this.start && this.end) {

                    graph.drawString(this.genome, tgraph.X(0), tgraph.Y(y+0.1), 'blue', "11px Arial")
                    graph.drawString(this.strand + ' ' + this.chromosome + ':' + this.start + '..' + this.end, tgraph.X(0), tgraph.Y(y-0.2), 'green', "11px Arial")
                    if (this.ensembl) {
                        graph.drawString(this.ensembl, tgraph.X(0), tgraph.Y(y - 0.5), 'blue', "11px Arial")
                    }
                    if (this.symbol) {
                        graph.drawString(this.symbol, tgraph.X(10), tgraph.Y(y - 0.5), 'blue', "11px Arial")
                    }

                    if (!this.ensembl && (!this.searching)) {
                        let str = this.strand;

                        if (this.strand === '+') {
                            str = '';
                        }
                        this.searching = true;

                        GETJSON(`/genome/ensembl/get_id?coordinates=${str}${this.chromosome}:${this.start}..${this.end}`).then(r => {
                            if (r) {
                                let names = r.gene_names;
                                let symbols = r.gene_symbol;
                                if (names && names.length > 0 ) {
                                    this.ensembl = names.trim()
                                }
                                if( symbols && symbols.length > 0 )
                                {
                                    this.symbol = symbols.trim();
                                }
                            }
                        })
                        this.searching = true;

                    }

                }
                let i = 20;
                if (this.sequence)
                    for (let s of this.sequence) {
                        let color = 'black'
                        if (s === 'X') {
                            color = 'red'
                        } else if (s === '-')
                            color = 'blue'

                        graph.drawString(s, tgraph.X(i++), tgraph.Y(y), color, "11px Arial")
                    }

            }
        }
        return resolve(SeqObject)
    });

}
