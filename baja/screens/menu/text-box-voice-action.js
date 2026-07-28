function (graph, io) {

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let start = -1;
    let end = -1;
    let ywc = -1;
    let xwc = 0;
    graph.addMouseDownListener(async (x, y) => {
        if (graph.currentShape) {
        }
        let RectangleText = await exec('flexigraph/shapes/Rect-text.js')
        graph.currentShape = new RectangleText('', x, y);
    })
    graph.addMouseMoveListener((x, y) => {
        if (graph.currentShape)
            graph.currentShape.update(x, y);
    });
    graph.addMouseUpListener(async (x, y) => {
        if (graph.currentShape) {

            voiceToText(async (txt, status) => {
                graph.currentShape.comment = txt
                if (!status) {
                    let confirm = await exec('baja/lib/confirm.js', 'Save?', async () => {
                        graph.currentShape.showRect = false;
                        graph.saveCurrentShape();
                    })
                    showModal(confirm)
                }
            });
        }
    })
}
