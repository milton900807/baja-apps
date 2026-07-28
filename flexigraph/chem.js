function () {
    return new Promise(async (resolve, reject) => {
        let shapes = await exec('flexigraph/chem-draw.js')
        let ChemTemplate = class ChemTemplate {
            name;
            type;
            regex;
            color;
            shapeFunction = null;

            constructor(type, name, regex) {
                this.name = name;
                this.regex = regex;
                this.type = type;
                this.shapeFunction = getIon(shapes[this.type])
            }

            setColor(color) {
                this.color = color;
            }
            async draw(graph, x, y) {
                if (this.shapeFunction) {
                    this.shapeFunction(graph, x, y, this.color);
                } else {
                    await graph.drawLine(x, y, this.xf, y, this.color, 1, 'round')
                }
            }
        }

        resolve(ChemTemplate)
    })

}
