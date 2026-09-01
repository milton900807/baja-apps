function (graph, selectedTrack, genegraph_panel_layout) {

    // "Selected Sequence" side menu — the counterpart to the selected-TRACK menu, opened by
    // clicking inside an existing selection. Same shape (Layers / Data / Models / Design /
    // Sequence / Export), but every operation is scoped to markstart..markend instead of the
    // whole track: layers cover only the selected span, models are run on the selected
    // sub-sequence, and oligo design uses the selected range as its target.
    //   exec('baja/manchester/menu/selected-sequence-menu.js', graph, selectedTrack, genegraph_panel_layout)

    return (async () => {
        const t = selectedTrack;
        const say = (m) => { try { graph.setMessage('' + m); } catch (e) { } };
        if (!t || !(t.markend > t.markstart) || t.markstart < 0) { say(' No sequence selected. '); return graph; }

        const start = Math.floor(t.markstart), end = Math.ceil(t.markend);
        const len = end - start;
        const range = { start: start, end: end };
        const dna = (x) => ('' + (x || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
        const seqOf = () => { try { return dna(t.getSequenceRange(t.markstart, t.markend)); } catch (e) { return ''; } };
        const revComp = (x) => x.split('').reverse().map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b] || 'N')).join('');
        const copy = async (txt, what) => {
            try {
                if (navigator.clipboard) await navigator.clipboard.writeText(txt);
                say(' Copied ' + what + ' (' + txt.length + ' nt). ');
            } catch (e) { say(' Could not copy: ' + e + ' '); }
        };

        // Every leaf closes the side menu first, then runs, and reports its own failure rather
        // than throwing out of the menu handler and leaving the canvas half-configured.
        const go = (label, fn) => ({
            label: label, move: () => { },
            click: async () => {
                try { graph.showSideMenu(null); } catch (e) { }
                try { await fn(); }
                catch (e) { say(' ' + label + ' failed: ' + (e && e.message ? e.message : e) + ' '); }
            }
        });
        const sub = (label, items) => ({
            label: label, move: () => { },
            click: async (sx, sy) => { try { graph.showSideMenu(items, sx, sy); } catch (e) { } }
        });

        const dataItems = [
            // rnaseq-library already scopes its load to the selection when one exists, so the
            // dataset lands over markstart..markend only — see baja/data/rnaseq-library.js.
            go('RNASeq Library...', async () => exec('baja/data/rnaseq-library.js', graph, genegraph_panel_layout)),
            go('RNASeq browse (species) ...', async () => exec('baja/data/rnaseq-hierarchy-menu.js', graph, genegraph_panel_layout)),
            go('Data Resources...', async () => exec('baja/data/data-resources-library.js', graph, genegraph_panel_layout)),
            go('My data...', async () => exec('baja/data/my-data.js', graph, genegraph_panel_layout))
        ];

        const modelItems = [
            // presetTrack + presetRange make these run on the SELECTED sub-sequence straight
            // away, instead of prompting for a track click and profiling the whole thing.
            go('RNA Binding (selection)', async () => exec('baja/bio/rbp/rbp-profile.js', graph, genegraph_panel_layout, t, range)),
            go('Splicing (selection)', async () => exec('baja/bio/splicing/splicing-profile.js', graph, genegraph_panel_layout, t, range)),
            go('Peptide', async () => say(' Peptide model — coming soon. '))
        ];

        const seqItems = [
            go('Details...', async () => exec('baja/manchester/menu/show-selected-sequence-details.js', t, graph, genegraph_panel_layout)),
            go('Selected-sequence tools...', async () => exec('baja/manchester/menu/selected-sequence-tools.js', graph, genegraph_panel_layout, t)),
            go('Find motif...', async () => exec('baja/manchester/menu/motif-tools.js', graph)),
            go('Mutate from sequence...', async () => exec('baja/manchester/menu/mutation-from-track-sequence.js', graph, genegraph_panel_layout, true)),
            go('Copy sequence', async () => copy(seqOf(), 'selection')),
            go('Copy reverse complement', async () => copy(revComp(seqOf()), 'reverse complement')),
            go('Composition (GC%)', async () => {
                const q = seqOf();
                if (!q.length) { say(' No sequence in the selection. '); return; }
                const gc = (q.match(/[GC]/g) || []).length;
                const n = (q.match(/N/g) || []).length;
                say(' Selection: ' + q.length + ' nt — GC ' + ((gc / q.length) * 100).toFixed(1) + '%' + (n ? (' — ' + n + ' N') : '') + '. ');
            }),
            go('Clear selection', async () => {
                try { t.markstart = -1; t.markend = -1; if (graph.wake) graph.wake(); say(' Selection cleared. '); } catch (e) { }
            })
        ];

        // The design menu already REQUIRES a selection and designs against
        // getSequenceRange(markstart, markend), so it is correct as-is for this menu.
        const items = [
            { label: 'Selected Sequence', move: () => { }, click: () => { } },
            { label: '  ' + start + '–' + end + '  (' + len + ' nt)', move: () => { }, click: () => { } },
            sub('Data ▸', dataItems),
            sub('Models ▸', modelItems),
            sub('Sequence ▸', seqItems),
            go('Design ▸', async () => exec('baja/manchester/menu/track-design-menu.js', graph, t, genegraph_panel_layout)),
            go('Off-targets...', async () => exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout)),
            go('Export...', async () => exec('baja/manchester/menu/track-export-menu.js', graph, genegraph_panel_layout, t)),
            go('Synthesis cost', async () => exec('baja/manchester/menu/synthesis-cost.js', graph, t, genegraph_panel_layout))
        ];

        try { graph.showSideMenu(items); } catch (e) { }
        return graph;
    })();
}
