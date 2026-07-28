function () {

    return new Promise(async (resolve, reject) => {

        let Expression = await exec('baja/expression/expression-plot.js')

        let SimpleMatch = class SimpleMatch {
            search;
            target;
            link;
            expression;

            constructor(search, target, relationship) {
                this.search = search;
                this.target = target;
                this.link = relationship;
            }
            mlength() {
                if (this.search.sequence.length > this.target.sequence.length) {
                    return this.search.sequence.length;
                }
                else {
                    return this.target.sequence.length;
                }
            }
            draw(expression_options, y, tgraph, graph) {
                if (this.expression == null && expression_options && graph.canvas && this.target && this.target.ensembl) {
                    this.expression = new Expression(this.target.ensembl, expression_options);
                }
                if (this.expression)
                    this.expression.draw(y, tgraph, graph, graph.canvas);
                graph.drawLine(tgraph.X(20), tgraph.Y(y), tgraph.X(20+ this.search.sequence.length), tgraph.Y(y), 'lightGray', 1, 'round')
                this.search.draw(y+0.2, tgraph, graph);
                this.link.draw(y+0.4, tgraph, graph);
                this.target.draw(y + 0.6, tgraph, graph);
            }
        }
        return resolve(SimpleMatch)
    })
}
