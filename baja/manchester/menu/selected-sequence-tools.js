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

    // Selected-region range (lo/hi) on the resolved track, if there is a selection.
    const selRange = () => {
        try {
            if (st && st.markstart != null && st.markend != null && st.markend > st.markstart) {
                return { lo: Math.min(st.markstart, st.markend), hi: Math.max(st.markstart, st.markend) };
            }
        } catch (e) { }
        return null;
    };

    // ── Level 3: choose a variant SOURCE to load SNPs from ────────────────────
    // Each source hands off to baja/data/load-variants.js, which asks for the load
    // scope (entire track / drag a selection) and drops the variants as SnpIndels,
    // colored by database. Failsafe: server derived from env.
    const showLoadSources = () => {
        const server = (window['env'] && window['env']['apiUrl']) || '';
        const loadFrom = (db, dbLabel) => {
            graph.showSideMenu(null);
            if (!st) { graph.setMessage(' Select a sequence on a track first. '); return; }
            try {
                exec('baja/data/load-variants.js', server, graph, genegraph_panel_layout, db, dbLabel);
            } catch (e) { graph.setMessage(' Could not open the ' + dbLabel + ' loader. '); }
        };
        graph.setMessage(' Load more SNPs — pick a source:');
        graph.showSideMenu([
            { label: '‹ Back', move: () => { log(''); }, click: () => showMutations() },
            { label: 'ClinVar', move: () => { log(''); }, click: () => loadFrom('clinvar', 'ClinVar') },
            { label: 'gnomAD', move: () => { log(''); }, click: () => loadFrom('gnomad', 'gnomAD') },
            { label: 'dbSNP', move: () => { log(''); }, click: () => loadFrom('dbsnp', 'dbSNP') },
            { label: 'COSMIC', move: () => { log(''); }, click: () => loadFrom('cosmic', 'COSMIC') }
        ]);
    };

    // ── Level 2: all SNP / mutation tools grouped together ────────────────────
    const showMutations = () => {
        graph.setMessage(' Mutation (SNP / indel) tools for the selected sequence:');
        graph.showSideMenu([
            { label: '‹ Back', move: () => { log(''); }, click: () => showMain() },
            {
                label: 'Load more SNPs (ClinVar / gnomAD / …) ▸', move: () => { log(''); },
                click: () => showLoadSources()
            },
            {
                label: 'Filter SNPs (pathogenic, etc.)', move: () => { log(''); }, click: () => {
                    // Cascading SNP filter (Type / Source / Clinical relevance / …) scoped to the
                    // selected region — only SNPs inside the lasso/box selection are considered.
                    graph.showSideMenu(null);
                    if (!st) { graph.setMessage(' Select a sequence on a track first. '); return; }
                    exec('baja/manchester/menu/edit-snps-filter-menu.js', graph, genegraph_panel_layout, st, selRange());
                }
            },
            {
                label: 'Remove SNPs / indels', move: () => { log(''); }, click: () => {
                    graph.showSideMenu(null);
                    if (!st) { graph.setMessage(' Select a sequence on a track first. '); return; }
                    // Standard removal menu (Remove all in selection / Remove by attribute filter).
                    exec('baja/manchester/menu/remove-snps-menu.js', graph, genegraph_panel_layout, st, selRange());
                }
            }
        ]);
    };

    // ── Level 1: the main annotation-tools menu ───────────────────────────────
    const showMain = () => {
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
                label: 'Mutations (SNPs / indels) ▸', move: () => { log(''); }, click: () => {
                    // All SNP tools — load more (by source), filter, and remove — in one submenu.
                    showMutations();
                }
            }
        ];

        graph.setMessage(' Annotation tools for the selected sequence:');
        graph.showSideMenu(items);
    };

    showMain();
}
