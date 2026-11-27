function (graph, selectedTrack, genegraph_panel_layout) {

    // "Selected Sequence" menu — the counterpart to the selected-TRACK menu, opened by
    // clicking inside an existing selection.
    //
    // SHOWN IN PLACE, beside the selection. This used to go to showSideMenu, which collapses
    // to an orange chip in the top-left corner -- so the options for a stretch of sequence
    // down at the track appeared as far from it as the window allows, behind a second click.
    // The full-screen list (showWindowMenu) is no better on a desktop: it covers the very
    // sequence the menu is about. So it is a small panel at the pointer, in the editor's own
    // navy, and popup-menu.js hands a PHONE back to the full-screen list where a thumb wants
    // it. Same shape (Layers / Data / Models / Design /
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

        // HOW MANY RESIDUES THE SELECTION HOLDS, or 0 if it holds none. Worked out here so the
        // Fold entry can say the count in its label and be left out entirely when the span
        // carries no coding bases -- an entry whose only answer is "that is outside the ORF"
        // is a worse answer than not being there.
        //
        // Read off the ORF, not off the bases: a selection is a span of NUCLEOTIDES, and
        // whatever three-frame translation falls out of it is not the protein the track
        // draws. getPeptideFromORF walks orf.cdsi, so the residues are the track's own.
        // ...and only when the folding host is actually up. Same cached verdict the track menu
        // reads; unknown counts as down.
        let __afUp = false;
        try {
            const __af = await exec('baja/manchester/menu/alphafold-available.js', graph, { waitMs: 1200 });
            __afUp = !!(__af && __af.up === true);
        } catch (e) { __afUp = false; }
        const __foldAa = !__afUp ? 0 : (() => {
            try {
                if (!(t.orf && t.orf.cdsi && t.orf.cdsi.length)) return 0;
                const r = (typeof t.selectedRange === 'function') ? t.selectedRange() : null;
                if (!r) return 0;
                return ('' + (t.getPeptideFromORF(r.start, r.end) || '')).trim().length;
            } catch (e) { return 0; }
        })();

        // Every leaf closes the side menu first, then runs, and reports its own failure rather
        // than throwing out of the menu handler and leaving the canvas half-configured.
        // Where the menu opens: beside the selection rather than in a corner. Worked out
        // once, from the marks, and reused by every level so a submenu does not jump.
        const __where = () => {
            try {
                const g = graph.graph || graph;
                const mid = (t.markstart + t.markend) / 2;
                const sx = (typeof g.X === 'function') ? g.X(t.tgraph ? t.tgraph.X(mid) : mid) : null;
                const sy = (typeof g.Y === 'function') ? g.Y(t.tgraph ? t.tgraph.Y(0) : 0) : null;
                if (Number.isFinite(sx) && Number.isFinite(sy)) return { x: Math.round(sx), y: Math.round(sy) };
            } catch (e) { }
            return { x: 120, y: 140 };
        };
        const show = (list, sx, sy) => {
            const at = (Number.isFinite(sx) && Number.isFinite(sy)) ? { x: sx, y: sy } : __where();
            try { graph.showSideMenu(null); } catch (e) { }      // never two menus at once
            // In place, beside the selection. popup-menu.js hands a PHONE back to the
            // full-screen list, which is the right shape for a thumb and the wrong one for a
            // pointer -- on a desktop the full-screen list covers the sequence the menu is
            // about.
            try {
                Promise.resolve(exec('baja/manchester/menu/popup-menu.js', graph, list, at.x, at.y, {
                    title: (t.name || 'Sequence'),
                    subtitle: len.toLocaleString() + ' nt selected'
                })).catch(() => { try { graph.showWindowMenu(list, at.x, at.y, 260); } catch (e) { } });
            } catch (e) {
                try { graph.showWindowMenu(list, at.x, at.y, 260); } catch (e2) { }
            }
        };

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
            click: async (sx, sy) => { show(items, sx, sy); }
        });

        // ---- Navigate -----------------------------------------------------------------
        // track-flexi exposes .grid, track.js exposes .tgraph. Both are MGrids with the same
        // X()/Y() track-world -> graph-world mapping, but a helper that reaches for only one of
        // them works on half the tracks in the app, so resolve whichever this track has.
        const axisOf = () => (t && (t.grid || t.tgraph)) || null;

        // animateTo takes GRAPH-world coordinates; start/end are TRACK-world (the same space
        // getSequenceRange uses), so both axes go through the grid's X()/Y().
        const zoomToSpan = (a, b, padFrac) => {
            const ax = axisOf();
            if (!ax) { say(' That track has no coordinate axis to navigate. '); return; }
            const lo = Math.min(a, b), hi = Math.max(a, b);
            const span = Math.max(1, hi - lo);
            const pad = Math.max(2, span * (padFrac == null ? 0.25 : padFrac));
            try {
                // y spans the track band (grid ymin/ymax are -1.5..1.5) rather than a single
                // row, so the sequence and anything drawn above or below it stay in frame.
                graph.animateTo(ax.X(lo - pad), ax.X(hi + pad), ax.Y(-1.2), ax.Y(1.2));
                if (graph.wake) graph.wake();
            } catch (e) { say(' Could not navigate: ' + e + ' '); }
        };

        // ---- ML ------------------------------------------------------------------------
        //
        // The models that take a SPAN, run on this one. Every entry hands the track and the
        // selected range to the tool the Models library already uses, so a model reached
        // from here and the same model reached from the library are the same run drawing the
        // same layer, not two code paths that agree until one of them is changed.
        //
        // Intron retention is deliberately absent: BajaIR scores whole introns off the
        // track's gene model, so a selection is not a thing it can be scoped to, and an
        // entry here that quietly ignored the selection would be worse than no entry.
        // Variants over the marked region: autoUseSelection with this track in the list skips
        // the scope prompt, which is the whole reason for having these here rather than in
        // the toolbar.
        const loadVariants = (db, label) => exec('baja/data/load-variants.js',
            window['env']['apiUrl'], graph, genegraph_panel_layout, db, label, true, [t]);
        // A /bd/ interval set onto this track. bed-hits reads the whole transcript's hits,
        // the layer is then on the track and the selection frames it; saying that in the
        // label would be noise, saying it here is not: this is the one Data entry whose
        // scope is the TRACK and not the range.
        const loadBed = async (key) => {
            const SETS = await exec('baja/data/layer-sets.js');
            const cfg = SETS[key];
            if (!cfg) { graph.setMessage(' No such layer set: ' + key + ' '); return; }
            return exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, cfg, t);
        };

        const mlItems = [
            { label: (t.name || 'track') + '  ' + len.toLocaleString() + ' nt', header: true },
            // The question this answers is 'what binds here', which is the one you have
            // when you have selected a stretch and do not yet know what is on it. First
            // because it is the only entry that needs no parameter chosen first.
            go('Which RBP binds this? (BajaCLIP)\u2026', async () =>
                exec('baja/bio/rbp/rbp-competition.js', graph, genegraph_panel_layout, t, range)),
            go('RBP binding profile (BajaCLIP)\u2026', async () =>
                exec('baja/bio/rbp/rbp-profile.js', graph, genegraph_panel_layout, t, range, null)),
            go('Splice-site strength (SpliceNet)\u2026', async () =>
                exec('baja/bio/splicing/splicing-profile.js', graph, genegraph_panel_layout, t, range, 'sites')),
            go('Exon inclusion, PSI (PSINet)\u2026', async () =>
                exec('baja/bio/splicing/splicing-profile.js', graph, genegraph_panel_layout, t, range, 'psi')),
            // Sequence-only, so it is the one entry here that needs no model and no server:
            // canonical seed matches, scanned on the MESSAGE rather than on the strand the
            // track stores. It says in its own result that it finds sites rather than
            // predicting targets, and that the set it scans is the de-targeting list.
            go('microRNA sites (seed scan)\u2026', async () =>
                exec('baja/bio/mirna/mirna-sites.js', graph, t, range))
        ];

        // ---- DATA ----------------------------------------------------------------------
        //
        // The same datasets the Data toolbar loads, scoped to THIS track and THIS range.
        // Reached from the toolbar they all begin by asking which track, which is a question
        // already answered by the time this menu is open: bed-hits takes the track as an
        // argument, and load-variants takes a track list plus autoUseSelection, which makes
        // it load over the marked region instead of prompting for a scope.
        //
        // One definition of what each layer IS, from baja/data/layer-sets.js, which the
        // toolbar and the ?layer= deep link also read: a second copy here would be a second
        // answer to what mirtarbase10_strong means.
        const dataItems = [
            { label: 'Into ' + (t.name || 'track') + ', over ' + len.toLocaleString() + ' nt', header: true },
            go('Variants here: ClinVar\u2026', async () => loadVariants('clinvar', 'ClinVar')),
            go('Variants here: dbSNP\u2026', async () => loadVariants('dbsnp', 'dbSNP')),
            go('Variants here: gnomAD\u2026', async () => loadVariants('gnomad', 'gnomAD')),
            go('Variants here: COSMIC\u2026', async () => loadVariants('cosmic', 'COSMIC')),
            go('Validated miRNA sites (miRTarBase, strong)\u2026', async () => loadBed('mirtarbase10_strong')),
            go('Validated miRNA sites (miRTarBase, all tiers)\u2026', async () => loadBed('mirtarbase10_all')),
            go('Patented ASO / siRNA / gene therapy sites\u2026', async () => loadBed('aso_sirna_gt')),
            go('RNASeq library\u2026', async () =>
                exec('baja/data/rnaseq-library.js', graph, genegraph_panel_layout))
        ];

        const navItems = [
            { label: (t.name || 'track') + '  ' + start + '–' + end, header: true },
            go('Zoom to selection', async () => zoomToSpan(start, end, 0.25)),
            go('Zoom to selection (tight)', async () => zoomToSpan(start, end, 0.02)),
            go('Zoom in to read the sequence', async () => {
                // Sequence letters only render above ~30 screen pixels per base, so framing a
                // long selection can never show them. Frame what the canvas can actually
                // resolve, centerd on the selection, instead of pretending to zoom to it.
                let cw = 1200;
                try { cw = (graph.canvas && graph.canvas.width) || (graph.graph && graph.graph.canvas && graph.graph.canvas.width) || cw; } catch (e) { }
                const fits = Math.max(12, Math.floor(cw / 34));
                if (len <= fits) { zoomToSpan(start, end, 0.05); return; }
                const mid = Math.floor((start + end) / 2);
                const half = Math.floor(fits / 2);
                zoomToSpan(mid - half, mid + half, 0.02);
                say(' Showing ' + fits + ' nt of the ' + len + ' nt selection — the most the canvas can render as letters. ');
            }),
            go('Zoom to whole track', async () => {
                const ax = axisOf();
                if (!ax) { say(' That track has no coordinate axis to navigate. '); return; }
                zoomToSpan(ax.xmin, ax.xmax, 0.02);
            })
        ];

        // WHICH TRACK TO SCAN. On its own track the question is "is this repeated"; against
        // another it is the one people actually have with two genes on the canvas -- does my
        // site exist over there, did the paralogue keep it. Asked only when there is more
        // than one track with sequence, so the common case is still one press.
        //
        // AND HOW MUCH OF IT AT A TIME. The whole selection laid over the track in one
        // block is the default and the right question for a short selection. For a long
        // one it is the wrong question: a 3 kb UTR sharing one conserved 60 nt patch with
        // another gene agrees at 25% as a block and comes back as nothing, while the same
        // comparison run in a 60 nt window finds the patch at its real identity. So the
        // size is asked for, with the whole selection first and already the answer, and
        // only sizes shorter than the selection offered -- a window as long as what it
        // slides along is the block case under another name.
        const pickWindow = async () => {
            if (len < 24) return 0;                       // nothing to slide along
            const sizes = [500, 200, 100, 60, 30].filter((w) => w < len && w >= 8).slice(0, 4);
            if (!sizes.length) return 0;
            const chosen = await new Promise((resolve) => {
                let done = false;
                const once = (v) => { if (!done) { done = true; resolve(v); } };
                exec('baja/lib/pick-list.js', {
                    title: 'How much of the ' + len.toLocaleString() + ' nt at a time',
                    subtitle: 'the whole selection is one comparison · a window is slid along it '
                        + 'in steps of half its length and every position compared, which finds a '
                        + 'short conserved patch that the whole selection averages away',
                    items: [{
                        label: 'The whole selection  (' + len.toLocaleString() + ' nt)',
                        sub: 'one block, laid over the track at every offset',
                        ref: 0
                    }].concat(sizes.map((w) => ({
                        label: w + ' nt windows',
                        sub: Math.ceil(Math.max(0, len - w) / Math.max(1, Math.floor(w / 2))) + 1
                            + ' windows · each hit says which part of the selection matched',
                        ref: w
                    }))),
                    onPick: (it) => once(it ? it.ref : null),
                    onClose: () => once(null)
                }).then((x) => { if (x === null) once(null); });
            });
            return chosen;                                // null means they closed it
        };

        const compareAcross = async (min) => {
            const usable = ((graph && graph.track) || []).filter((x) => {
                try { return !!x && ('' + (x.sequence || '')).length >= 20; } catch (e) { return false; }
            });
            const others = usable.filter((x) => x !== t);
            if (!others.length) {
                const w0 = await pickWindow();
                if (w0 === null) { say(' Nothing was compared. '); return; }
                return exec('baja/bio/compare/selection-similarity.js', graph, t, range,
                    { min: min, window: w0 || null });
            }
            const pick = await new Promise((resolve) => {
                let done = false;
                const once = (v) => { if (!done) { done = true; resolve(v); } };
                exec('baja/lib/pick-list.js', {
                    title: 'Compare the selected ' + len.toLocaleString() + ' nt against',
                    subtitle: 'at ' + Math.round(min * 100) + '% or better, both strands \u00b7 the '
                        + 'matches are drawn on the track that is scanned',
                    items: [{
                        label: (t.name || 'this track') + '  (itself)',
                        sub: 'where else on it does this stretch occur',
                        ref: t
                    }].concat(others.map((x) => ({
                        label: x.name || '(unnamed)',
                        sub: ('' + (x.sequence || '')).length.toLocaleString() + ' nt'
                            + (x.species ? (' \u00b7 ' + x.species) : '')
                            + (x.chr ? (' \u00b7 ' + x.chr) : ''),
                        ref: x
                    }))),
                    onPick: (it) => once(it && it.ref),
                    onClose: () => once(null)
                }).then((x) => { if (x === null) once(null); });
            });
            if (!pick) { say(' Nothing to compare against was chosen. '); return; }
            const win = await pickWindow();
            if (win === null) { say(' Nothing was compared. '); return; }
            return exec('baja/bio/compare/selection-similarity.js', graph, t, range,
                { min: min, against: pick, window: win || null });
        };

        const seqItems = [
            go('Details...', async () => exec('baja/manchester/menu/show-selected-sequence-details.js', t, graph, genegraph_panel_layout)),
            go('Selected-sequence tools...', async () => exec('baja/manchester/menu/selected-sequence-tools.js', graph, genegraph_panel_layout, t)),
            go('Find motif...', async () => exec('baja/manchester/menu/motif-tools.js', graph)),
            // WHERE ELSE DOES THIS STRETCH OCCUR. The question behind "is this repeated",
            // "is there another copy of my site", "did the paralogue keep it" -- and until
            // now the answer was to copy the sequence out and run something else on it. The
            // threshold is in the label because it is the whole result: at 50% a 20-mer is
            // noise and a 500-mer is a real relative, and the user is the one who knows
            // which they have.
            go('Compare across a track (\u226550%)...', async () => compareAcross(0.5)),
            go('Compare across a track (\u226570%)...', async () => compareAcross(0.7)),
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
        ];

        // Deselect: drop the marked range and hand the canvas back. Lives at the TOP level —
        // it is the one action you reach for when the selection itself is what is in the way,
        // so burying it in a submenu was wrong. markstart/markend are set to -1, which is the
        // "no selection" value every renderer and hit-test already tests for.
        const deselect = () => {
            try {
                t.markstart = -1;
                t.markend = -1;
            } catch (e) { }
            // Clear it everywhere, not just on this track: a stale mark on another track would
            // keep the selection panel and the Sequence menu entry alive after a deselect.
            try {
                if (graph.deselectAllTracks) graph.deselectAllTracks();
            } catch (e) { }
            try { graph.showSideMenu(null); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            say(' Selection cleared. ');
        };

        // The design menu already REQUIRES a selection and designs against
        // getSequenceRange(markstart, markend), so it is correct as-is for this menu.
        const items = [
            // The headline entry ACTS: it zooms to the selection, the same as Navigate ▸ Zoom to
            // selection. It used to be a label with an empty click, which read as a button that
            // did nothing.
            go(' Zoom to: ' + start + '–' + end + '  (' + len + ' nt)', async () => zoomToSpan(start, end, 0.25)),
            sub('Navigate ▸', navItems),
            go('Deselect sequence', async () => deselect()),
            // Layers ▸ Data | Models, matching the selected-TRACK menu: anything that puts a
            // new band under the track lives under Layers, whether it comes from a dataset or
            // from a model. Both branches are already scoped to THIS sequence on THIS track --
            // the data loaders honour markstart..markend, and the models are handed (t, range) --
            // so the layers land over the selected span rather than the whole track.
            sub('Layers ▸', [
                { label: 'Layers on ' + (t.name || 'track'), header: true },
                { label: '  ' + start + '–' + end + '  (' + len + ' nt)', header: true },
                // Data opens the Data Resources Library directly rather than expanding a short
                // list of shortcuts to it. The library is the catalogue -- RNASeq, public data,
                // your own uploads -- so a submenu naming three of its shelves was a second,
                // narrower index of the same thing. Labelled '...' not '▸': it opens a panel,
                // it is not a submenu.
                go('Data ▸', async () => exec('baja/data/data-resources-library.js', graph, genegraph_panel_layout)),
                // Models opens the ML Models Library, the same way Data opens the Data Resources
                // Library. The library is the catalogue -- what each model predicts, what it was
                // measured against and what it cannot tell you -- and running it from there is
                // one click further but starts from the documentation rather than a bare name.
                // The runners resolve the track from the SELECTION when they are not handed one,
                // so a model launched from the library still lands on this track.
                go('Models ▸', async () => exec('baja/ml/models-library.js', graph, genegraph_panel_layout)),
                go('Remove layers over this range', async () => {
                    // Only layers that fall INSIDE the selection: a layer spanning the whole
                    // track is not "a layer over this range" and dropping it here would delete
                    // work the user did somewhere else on the same track.
                    const before = (t.track_layers || []).length;
                    t.track_layers = (t.track_layers || []).filter((l) => {
                        try {
                            const a = Math.min(+l.xi, +l.xf), b = Math.max(+l.xi, +l.xf);
                            if (!isFinite(a) || !isFinite(b)) return true;
                            return !(a >= start && b <= end);
                        } catch (e) { return true; }
                    });
                    const gone = before - t.track_layers.length;
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    say(' Removed ' + gone + ' layer' + (gone === 1 ? '' : 's') + ' over ' + start + '–' + end + '. ');
                })
            ]),
            // MODIFY. Say what should happen to the selected span -- "delete the ATG", "insert
            // a stop codon after the third codon", "make this a Kozak sequence" -- and it is
            // rewritten in place. The description is the interface; what works it out is not
            // the user's problem and is not mentioned.
            //
            // In place, with the change pushed onto the history stack first, so one Undo puts
            // the sequence back. A length change shifts every annotation downstream of the
            // selection, the same way the repeat expansion does -- an exon the edit sits
            // inside gets longer or shorter, which is what an insertion or a deletion means.
            // MODIFY. Say what should happen to the selected span -- "delete the ATG",
            // "insert a stop codon after the third codon", "make this a Kozak sequence" --
            // and it is rewritten in place. The description is the interface.
            //
            // The work is in modify-sequence-tool.js, which the TRACK menu uses too with no
            // range at all, meaning the whole track. One implementation, so the two cannot
            // drift: the same checks on what comes back, the same confirmation of what will
            // change, the same single Undo.
            go('Modify\u2026', async () => {
                await exec('baja/manchester/menu/modify-sequence-tool.js', graph, t,
                    { start: t.markstart, end: t.markend });
            }),
            // FOLD WHAT IS SELECTED. The same tool the track menu uses; it reads the
            // selection off the track itself, so the two cannot disagree about which
            // residues are meant. Only offered when the span actually holds some.
            ...(__foldAa ? [go('Fold selected peptide (AlphaFold, ' + __foldAa + ' aa)\u2026', async () =>
                exec('baja/manchester/menu/alphafold-track.js', graph, genegraph_panel_layout, t))] : []),
            sub('ML ▸', mlItems),
            sub('Data ▸', dataItems),
            sub('Sequence ▸', seqItems),
            go('Design ▸', async () => exec('baja/manchester/menu/track-design-menu.js', graph, t, genegraph_panel_layout)),
            go('Off-targets...', async () => exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout)),
            go('Export...', async () => exec('baja/manchester/menu/track-export-menu.js', graph, genegraph_panel_layout, t)),
            go('Synthesis cost', async () => exec('baja/manchester/menu/synthesis-cost.js', graph, t, genegraph_panel_layout))
        ];

        show(items);
        return graph;
    })();
}
