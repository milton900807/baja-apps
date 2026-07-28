function () {

    const xValues = [];
    const yValues = [];

    function generateData(value, i1, i2, step = 1) {
        for (let x = i1; x <= i2; x += step) {
            yValues.push(eval(value));
            xValues.push(x);
        }
    }

    exec('flexigraph/chart2.js').then(async r => {
        generateData("x * 2 + 7", 0, 10, 0.5);
        exec('flexigraph/graph.js').then(async (FlexiGraph) => {
            let graph = new FlexiGraph();
            await graph.init();
            graph.setymin(0);
            graph.setymin(-1.5)
            graph.setymax(10);
            let canvasListener = (ctx) => {
            }
            let geneGraph = await graph.createComponent("Chart", canvasListener);
            let canvas = await graph.createFloatingCanvas();
            canvas.setDimension(400, 400);

            let mathr = Math.random() * 1000;
            canvas.setY(mathr);
            canvas.setX(mathr);
            showWidget(geneGraph);
            let c = new Chart(canvas.canvas, {
                type: "scatter",
                data: {
                    label: 'My First Dataset',
                    labels: xValues,
                    datasets: [{
                        fill: false,

                        pointRadius: 10,
                        borderColor: "rgba(255,0,0,0.5)",
                        data: yValues
                    }]
                },
                options: {
                    responsive: false,
                    display: true,
                    lineHeight: 1.2,
                    weight: null
                },
                padding: 1,
                text: ' -- ',
                legend: { display: true },
                title: {
                    display: true,
                    text: "y = x * 2 + 7",
                    fontSize: 16
                }
            }
            );
        })

    })

}
