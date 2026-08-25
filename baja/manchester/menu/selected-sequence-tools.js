function (graph, genegraph_panel_layout, selectedTrack) {
    // Annotation tools available for the currently selected sequence. Shown after a
    // sequence selection (click-and-drag or box-drag).
    try { graph.showSideMenu(null); } catch (e) { }

    // Resolve a selected track if one wasn't passed.
    let st = selectedTrack;
    if (!st) {
        try {
            const sel = graph.__lassoSelection || [];
            const tsel = sel.find(s => s.kind === 'track');
            if (tsel) st = tsel.ref;
        } catch (e) { }
    }
    if (!st) {
        try { st = (graph.track || []).find(t => t && t.markstart >= 0 && t.markend > t.markstart); } catch (e) { }
    }

    const items = [
        {
            label: 'Sequence Details', move: () => { log(''); }, click: () => {
                graph.showSideMenu(null);
                if (st) exec('baja/manchester/menu/show-selected-sequence-details.js', st, graph, genegraph_panel_layout);
                else graph.setMessage(' Select a sequence on a track first.');
            }
        },
        {
            label: 'Edit sequence', move: () => { log(''); }, click: () => {
                graph.showSideMenu(null);
                if (!st) { graph.setMessage(' Select a sequence on a track first. '); return; }
                // Open the sequence editor for the selected track (edits update the CDS live).
                exec('baja/manchester/menu/edit-track-sequence-panel.js', st, graph, genegraph_panel_layout);
            }
        },
        {
            label: 'Annotate (exon / mutation / sites)', move: () => { log(''); }, click: () => {
                graph.showSideMenu(null);
                exec('baja/manchester/menu/annotation/annotation-tools2.js', graph, genegraph_panel_layout);
            }
        },
        {
            label: 'Protein sequence', move: () => { log(''); }, click: () => {
                graph.showSideMenu(null);
                exec('baja/manchester/menu/protein-annotation-tools.js', graph, genegraph_panel_layout);
            }
        },
        {
            label: 'Annotate by description...', move: () => { log(''); }, click: async () => {
                graph.showSideMenu(null);
                await exec('baja/data/prompt-action.js', window['env']['apiUrl'], graph, genegraph_panel_layout, 'annotate');
            }
        },
        {
            label: 'Label region', move: () => { log(''); }, click: () => {
                graph.showSideMenu(null);
                // Box + label the CURRENT selection (does not deselect).
                exec('baja/manchester/menu/label-selected-region.js', graph, genegraph_panel_layout, st);
            }
        },
        {
            label: 'Highlight region', move: () => { log(''); }, click: () => {
                graph.showSideMenu(null);
                exec('baja/manchester/menu/draw-highlight-action.js', graph);
            }
        },
        {
            label: 'Filter SNPs (pathogenic, etc.)', move: () => { log(''); }, click: () => {
                // Cascading SNP filter (Type / Source / Clinical relevance / …) scoped to the
                // selected region — only SNPs inside the lasso/box selection are considered.
                graph.showSideMenu(null);
                if (!st) { graph.setMessage(' Select a sequence on a track first. '); return; }
                let range = null;
                try {
                    if (st.markstart != null && st.markend != null && st.markend > st.markstart) {
                        range = { lo: Math.min(st.markstart, st.markend), hi: Math.max(st.markstart, st.markend) };
                    }
                } catch (e) { }
                exec('baja/manchester/menu/edit-snps-filter-menu.js', graph, genegraph_panel_layout, st, range);
            }
        },
        {
            label: 'Remove SNPs / indels', move: () => { log(''); }, click: () => {
                graph.showSideMenu(null);
                if (!st) { graph.setMessage(' Select a sequence on a track first. '); return; }
                let range = null;
                try {
                    if (st.markstart != null && st.markend != null && st.markend > st.markstart) {
                        range = { lo: Math.min(st.markstart, st.markend), hi: Math.max(st.markstart, st.markend) };
                    }
                } catch (e) { }
                // Standard removal menu (Remove all in selection / Remove by attribute filter).
                exec('baja/manchester/menu/remove-snps-menu.js', graph, genegraph_panel_layout, st, range);
            }
        }
    ];

    graph.setMessage(' Annotation tools for the selected sequence:');
    graph.showSideMenu(items);
}
