function (graph, genegraph_panel_layout, selectedTrack) {
    return new Promise(async (resolve) => {
        // Label the CURRENTLY selected sequence: draw a translucent box around the
        // selection and prompt for the label. Does NOT change/clear the selection.
        let st = selectedTrack;
        const valid = (t) => t && t.markstart >= 0 && t.markend > t.markstart && t.tgraph;
        if (!valid(st)) {
            try { st = (graph.track || []).find(valid); } catch (e) { }
        }
        if (!valid(st)) {
            graph.setMessage(' Select a sequence on a track first, then choose Label region.');
            resolve(null);
            return;
        }

        // Selection region in graph-world coords (mirrors the track's own selection draw:
        // xStart = tgraph.X(markstart); screen = graph.X(xStart)).
        const x0 = st.tgraph.X(st.markstart);
        const x1 = st.tgraph.X(st.markend);
        const yMin = st.tgraph.getymin();
        const yMax = st.tgraph.getymax();
        const yA = st.tgraph.Y(yMax);
        const yB = st.tgraph.Y(yMin);
        const pad = Math.abs(yA - yB) * 0.12;   // a little breathing room above/below

        const bx = Math.min(x0, x1);
        const bw = Math.abs(x1 - x0);
        const by = Math.max(yA, yB) + pad;
        const bh = Math.abs(yA - yB) + pad * 2;

        let HighlightBox = await exec('flexigraph/shapes/highlight-box.js');
        let box = new HighlightBox('label', bx, by);
        box.w = bw;
        box.h = bh;
        graph.currentShape = box;   // render the box while the user types the label
        if (graph.wake) graph.wake();

        let panel;
        const __nameHook = createIonFunction((hook) => { panel = hook; });
        let modal = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [[
                    {
                        'title': ' ', 'body': `Label for the selected sequence region.`, 'width': '90%',
                        'component': { wid: 'input-param-items', refCallback: __nameHook, data: { 'input_labels': ['Label'] } }
                    },
                    {
                        'title': '', 'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Save', ionFunction: createIonFunction(() => {
                                            try { box.comment = panel.get('Label'); } catch (e) { }
                                            graph.saveCurrentShape();     // adds the box to graph.shapes
                                            graph.currentShape = null;
                                            hideAllModal();
                                            if (graph.wake) graph.wake();  // selection is left intact
                                            resolve(true);
                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                            graph.currentShape = null;
                                            hideAllModal();
                                            if (graph.wake) graph.wake();
                                            resolve(null);
                                        })
                                    }
                                ]
                            }
                        }
                    }
                ]]
            }
        };
        showModal(modal);
    });
}
