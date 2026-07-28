function () {

    async function drawTrainingLayer(graph) {
        let FlexiGraph = await exec('flexigraph.js');
        let graphInstance = new FlexiGraph();
        await graphInstance.init();

        let canvasComponent = graphInstance.createComponent('trainingLayerCanvas', (ctx) => {

            graphInstance.drawBackdrop();

            let trainingObjects = graph.track;
            let startX = 10;
            let startY = 10;
            let boxWidth = 100;
            let boxHeight = 50;
            let padding = 20;

            trainingObjects.forEach((obj, index) => {
                let x = startX + (index % 5) * (boxWidth + padding);
                let y = startY + Math.floor(index / 5) * (boxHeight + padding);

                graphInstance.drawRect(x, y, boxWidth, boxHeight, 'blue', 2);

                let text = `Object ${index + 1}`;
                graphInstance.drawTextInRectangle(text, x + 5, y + 5, boxWidth - 10, 12, 'Arial', 'black');
            });

            trainingObjects.forEach((obj, index) => {
                if (index < trainingObjects.length - 1) {
                    let x1 = startX + (index % 5) * (boxWidth + padding) + boxWidth / 2;
                    let y1 = startY + Math.floor(index / 5) * (boxHeight + padding) + boxHeight / 2;
                    let x2 = startX + ((index + 1) % 5) * (boxWidth + padding) + boxWidth / 2;
                    let y2 = startY + Math.floor((index + 1) / 5) * (boxHeight + padding) + boxHeight / 2;

                    graphInstance.drawLine(x1, y1, x2, y2, 'black', 1);
                }
            });
        });

    }

    }
