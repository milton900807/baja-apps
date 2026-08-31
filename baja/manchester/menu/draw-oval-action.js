function (graph) {
    return new Promise(async (resolve) => {

        // Draw an oval annotation: press, drag to size it, release to comment on it.
        //   exec('baja/manchester/menu/draw-oval-action.js', graph)
        //
        // The shape class is loaded UP FRONT, before any listener is installed. It used to be
        // awaited INSIDE mousedown, which left a yield between the press and `md = true`: a
        // quick click could land its mouseup before the class resolved, so mouseup saw no
        // currentShape, skipped its whole cleanup block, and left the tool armed — then the
        // late mousedown built an oval that the still-live move listener stretched to follow
        // the cursor forever. That is the "won't release / stays on the graph" behaviour.
        const Oval = await exec('flexigraph/shapes/sketch-oval.js');

        graph.clearMouseListeners();
        graph.setMouseMode("msg:Click and drag on canvas");
        graph.selectOff();

        let md = false;

        function extractFirstUrl(text) {
            const urlPattern = /https?:\/\/[^\s/$.?#].[^\s]*/g;
            const match = text.match(urlPattern);
            return match ? match[0] : null;
        }
        function extractPubmedId(url) {
            const pubmedUrlPattern = /https?:\/\/pubmed.ncbi.nlm.nih.gov\/(\d+)\//;
            const match = url.match(pubmedUrlPattern);
            return (match && match[1]) ? match[1] : null;
        }

        // Put the tool away: stop drawing and hand the canvas back to navigate + hover.
        // setMouseMode() already clears the listener arrays and re-arms mouse-over-highlight,
        // so calling clearMouseListeners() as well would race a second hover install.
        const release = () => {
            md = false;
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
        };

        graph.addMouseDownListener((x, y) => {
            md = true;
            graph.currentShape = new Oval('test', x, y);
        });

        graph.addMouseMoveListener((x, y) => {
            if (!md) { graph.currentShape = null; return; }
            if (graph.currentShape) graph.currentShape.update(x, y);
        });

        graph.addMouseUpListener(async (x, y) => {
            const shape = graph.currentShape;

            // Release BEFORE awaiting the dialog. Previously the drawing listeners stayed
            // installed and md stayed true for as long as the comment dialog was open, so the
            // oval kept resizing to the pointer and was saved at whatever size the cursor
            // happened to leave it — not the size the user drew.
            release();
            if (!shape) return;

            // Normalize a right-to-left / bottom-to-top drag. update() makes w (and h)
            // negative in that direction and saveCurrentShape() discards anything with
            // w <= 0, so those drags silently vanished on release.
            if (shape.w < 0) { shape.x = shape.x + shape.w; shape.w = -shape.w; }
            if (shape.h < 0) { shape.y = shape.y - shape.h; shape.h = -shape.h; }

            // A stray click (or a drag too small to see) is not an annotation — drop it
            // rather than opening the comment dialog on a shape nobody meant to draw.
            if (graph.screenWidth(shape.w) <= 5 || graph.screenHeight(shape.h) <= 5) {
                graph.currentShape = null;
                try { if (graph.wake) graph.wake(); } catch (e) { }
                return;
            }

            // Keep it on screen while the dialog is up so there's something to comment on.
            graph.currentShape = shape;

            // Navy demo-style comment dialog. Paste a PubMed/DOI link to auto-fetch.
            const c = await exec('baja/manchester/menu/comment-dialog.js', 'Add a comment', 'Write a note for this annotation. Paste a PubMed or DOI link to auto-fetch the citation.');
            if (c === null) {
                graph.currentShape = null;
                try { if (graph.wake) graph.wake(); } catch (e) { }
                return;
            }

            let comment = c;
            // A failed lookup must not lose the annotation: fall back to the raw comment.
            // This used to run unguarded, so a pubmed.py error rejected the handler and the
            // oval was never saved AND never cleared.
            try {
                const url = extractFirstUrl(c);
                const pubmedid = url ? extractPubmedId(url) : null;
                if (pubmedid) {
                    const res = await exec('py/baja/pubmed.py', pubmedid);
                    if (res && res['Title']) comment = res['Title'] + '\n' + (res['Authors'] || '') + '\n' + c;
                }
            } catch (e) {
                try { graph.setMessage(' Citation lookup failed — saved your note as written. '); } catch (e2) { }
            }

            graph.currentShape = shape;
            graph.currentShape.comment = comment;
            graph.saveCurrentShape();   // pushes onto history, then clears currentShape
            try { if (graph.wake) graph.wake(); } catch (e) { }
        });

        resolve(graph);
    });
}
