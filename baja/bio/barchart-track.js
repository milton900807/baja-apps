function () {
    let Barchart = class Barchart {
        name;
        x;
        color = 'gray'
        reference_color = 'darkGray'
        value;
        detail_ffont6 = "10px Arial";
        show = true;
        showLabel = true
        reference_value = -1;
        percent_difference = -1;
        showPercentDiff = false;

        constructor(name, x, value, color) {
            this.name = name;
            this.x = x;
            this.value = value;
            this.color = color;
            this.show = true;

        }
        setColor(color) {
            this.color = color;
        }
        async draw(graph, tgraph) {
            let screencell = Math.abs(graph.screenWidth(1))

            if (!this.show) {

            } else {

                if (this.showPercentDiff) {

                    if (this.reference_value > 0) {
                        const absoluteDifference = Math.abs(this.reference_value - this.value);
                        const average = (this.value + this.reference_value) / 2;
                        this.percent_difference = (absoluteDifference / average);

                    }

                    if (this.percent_difference > 0) {

                        if (screencell < 1) {
                            await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.percent_difference), this.color, 1, 'round')
                        } else
                            if (screencell < 2) {
                                await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.percent_difference), this.color, 7, 'round')
                            }
                            else if (screencell < 7) {
                                await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.percent_difference), this.color, 10, 'round')
                            }
                            else {
                                await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.percent_difference), this.color, 15, 'round')
                            }
                        if (this.showLabel) {
                            if (screencell > 15)
                                await graph.drawString(this.percent_difference.toFixed(2) + '', tgraph.X(this.x) + 1, tgraph.Y(this.percent_difference), 'black', this.detail_ffont6)
                            else {

                            }
                        }
                    }
                } else {

                    if (screencell < 1) {
                        if (this.reference_value > 0) {
                            await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.reference_value), this.reference_color, 1, 'round')
                        }
                        await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.value), this.color, 1, 'round')
                    } else
                        if (screencell < 2) {
                            if (this.reference_value > 0) {
                                await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.reference_value), this.reference_color, 6, 'round')
                            }
                            await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.value), this.color, 7, 'round')
                        }
                        else if (screencell < 7) {
                            if (this.reference_value > 0) {
                                await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.reference_value), this.reference_color, 8, 'round')
                            }
                            await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.value), this.color, 10, 'round')
                        }
                        else {
                            if (this.reference_value > 0) {
                                await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.reference_value), this.reference_color, 12, 'round')
                            }
                            await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.value), this.color, 15, 'round')
                        }
                    if (this.showLabel) {
                        if (screencell > 1)
                            await graph.drawString(this.value.toFixed(2) + '', tgraph.X(this.x) + 1, tgraph.Y(this.value/2), 'black', this.detail_ffont6)
                        else {

                        }
                    }
                }
            }
        }
    }
    return Barchart;
}
