function () {

    return new Promise(async (resolve, reject) => {

        let Expression = await exec('baja/expression/expression-plot.js')

        let Match = class Match {
            search;
            target;
            link;
            expression;

            constructor(search, target, relationship, expressionPlot) {
                this.search = search;
                this.target = target;
                this.link = relationship;
                this.expression = expressionPlot;
            }

            mlength() {
                if (this.search.sequence.length > this.target.sequence.length) {
                    return this.search.sequence.length;
                }
                else {
                    return this.target.sequence.length;
                }
            }
            draw(y, tgraph, graph) {

                if (this.target.ensembl && this.expression) {
                    this.expression.setGene(this.target.ensembl);
                }

                let i = 0;
                for (let s of this.target.sequence) {
                    graph.drawString(s, tgraph.X(i++), tgraph.Y(y))
                }
                let matchindex = 1;
                for (let s of this.link.sequence) {
                    if (s.matches > this.search.sequence.length - 3) {
                        let position = s.position;
                        let index = position;
                        for (let q of this.search.sequence) {
                            if (index >= 0) {
                                let target_c = this.target.sequence.substring(index, index + 1)
                                if (target_c != q) {
                                    graph.drawString('X', tgraph.X(index), tgraph.Y(y - 0.3))
                                } else {
                                    graph.drawString('|', tgraph.X(index), tgraph.Y(y - 0.3))
                                }

                                graph.drawString(q, tgraph.X(index), tgraph.Y(y - 0.6))
                            }
                            index++;
                        }
                        matchindex++;
                    }
                }

                if (this.expression && graph.canvas) {
                    this.expression.draw(y, tgraph, graph, graph.canvas);
                }

            }
        }
        return resolve(Match)
    })
}
