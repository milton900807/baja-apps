function (graph) {
    graph.clearMouseListeners();
    graph.setMouseMode("msg:Click and drag on canvas")
    graph.selectOff();
    let md = false;
    graph.addMouseDownListener(async (x, y) => {
        let Oval = await exec('flexigraph/shapes/sketch-oval.js')
        md = true;
        graph.currentShape = new Oval('test', x, y);
    })
    graph.addMouseMoveListener((x, y) => {
        if (!md) {
            graph.currentShape = null;
        }
        if (graph.currentShape)
            graph.currentShape.update(x, y);
    });
    graph.addMouseUpListener(async (x, y) => {
        function extractFirstUrl(text) {

            const urlPattern = /https?:\/\/[^\s/$.?#].[^\s]*/g;
            const match = text.match(urlPattern);

            return match ? match[0] : null;
        }
        function extractPubmedId(url) {
            const pubmedUrlPattern = /https?:\/\/pubmed.ncbi.nlm.nih.gov\/(\d+)\//;
            const match = url.match(pubmedUrlPattern);

            if (match && match[1]) {
                return match[1];
            } else {
                return null;
            }
        }

        if (graph.currentShape) {
            // Navy demo-style comment dialog (was a wid modal). Paste a PubMed/DOI link to auto-fetch.
            const c = await exec('baja/manchester/menu/comment-dialog.js', 'Add a comment', 'Write a note for this annotation. Paste a PubMed or DOI link to auto-fetch the citation.');
            if (c === null) {
                graph.currentShape = null;
            } else {
                graph.pushOntoHistory();
                let url = extractFirstUrl(c);
                if (url) {
                    let pubmedid = extractPubmedId(url);
                    let res = await exec('py/baja/pubmed.py', pubmedid);
                    graph.currentShape.comment = '' + (res['Title'] + '\n' + res['Authors']) + '\n' + c;
                } else {
                    graph.currentShape.comment = c;
                }
                graph.saveCurrentShape();
            }
            // Item added (or cancelled) → return to navigate + mouse-over-highlight.
            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
            graph.setMouseMode('navigate');
        }
        md = false;

    })

}
