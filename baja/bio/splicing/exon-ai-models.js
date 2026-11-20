function (graph, genegraph_panel_layout, selectedTrack, annotation) {
    // The Exon -> AI Models list, in one place.
    //
    //   const models = await exec('baja/bio/splicing/exon-ai-models.js',
    //                             graph, genegraph_panel_layout, selectedTrack, annotation);
    //   graph.showSideMenu(models);
    //
    // It lived inline in BOTH baja/manchester/menu/menu-factory.js and
    // manchester/editor.js, two copies of the same array. menu-factory.js was updated to
    // BajaSplice and editor.js was not, and since editor.js is the copy that actually
    // ships, the editor kept offering LJSplice v2 long after it was replaced. One
    // definition, so that cannot happen again.
    //
    // First entry is BajaSplice: the models in py/bajasplice-lib and py/bajair-lib run on
    // THIS exon, so nothing asks for a second click on the track. The old LJSplice v2
    // entry posted to /ljdonr TF-serving and is gone.
    return new Promise(async (resolve) => {

        async function runCrypticExonFinder({ graph, selectedTrack, annotation, exec, infoPrompt, scriptPath }) {
            if (!selectedTrack) {
                graph.setMessage(" No track selected ");
                return;
            }

            graph.showSideMenu(null);

            const xi = annotation.xi - 4;
            const xf = annotation.xf + 4;

            const r = await exec(
                scriptPath,
                selectedTrack.getSequenceRange(xi, xf),
                selectedTrack.chr,
                xi,
                xf,
                selectedTrack.strand
            );

            const cryptic_exons = await exec('baja/bio/splicing/cryptic-exons');
            const g = cryptic_exons.generateCrypticExons(r, { xiAnchor: xi });

            for (let cry of g) selectedTrack.add(cry);

            if (r && r.status === "file_downloading") {
                infoPrompt("Model building; this only needs to happen once but may take several minutes");
                return;
            }
        }

        const models = [
            {
                // The BajaSplice models (py/bajasplice-lib, py/bajair-lib), run on THIS
                // exon, in place of the old LJSplice v2 window. Each entry hands the track
                // and the exon to the same script the Models library runs, so nothing asks
                // for a second click on the track.
                label: 'BajaSplice \u25b8',
                click: async (xwc, ywc) => {
                    if (!selectedTrack) {
                        graph.setMessage(" No track selected ");
                        return;
                    }
                    const lo = Math.min(+annotation.xi, +annotation.xf);
                    const hi = Math.max(+annotation.xi, +annotation.xf);
                    // Which end is which flips with the strand (the same rule cis-attribution.js uses).
                    const plus = +selectedTrack.strand >= 0;
                    const acceptorAt = Math.round(plus ? +annotation.xi : +annotation.xf);
                    const donorAt = Math.round(plus ? +annotation.xf : +annotation.xi);
                    const run = (path, ...args) => {
                        try { graph.showSideMenu(null); } catch (e) { }
                        Promise.resolve(exec(path, graph, genegraph_panel_layout, selectedTrack, ...args))
                            .catch((e) => { try { graph.setMessage(' BajaSplice: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { } });
                    };
                    // FRAME, STATED BEFORE THE MODELS ARE RUN. Exon length mod 3 is the one
                    // NMD-relevant fact available without a server call, and it is the fact
                    // that decides whether the two forms of this exon can read in the same
                    // frame at all. Not a multiple of 3 and they cannot: one of inclusion or
                    // skipping carries a premature stop, which is what makes an exon worth
                    // an oligo. Which of the two it is depends on the frame the rest of the
                    // transcript is in and on where the stop falls relative to the last
                    // junction, neither of which length can tell you, so this says
                    // "potentially" and points at BajaNMD for the verdict.
                    //
                    // A caption is {label, header: true} with NO click. Giving it an empty
                    // click would render a button that does nothing when pressed.
                    const exonLen = hi - lo + 1;
                    const frameNote = (exonLen % 3 === 0)
                        ? exonLen + ' nt, a multiple of 3: including and skipping this exon read in the '
                          + 'same frame, so neither form is frameshifted. A premature stop is still '
                          + 'possible if the exon carries one in frame.'
                        : exonLen + ' nt, not a multiple of 3: including and skipping read in DIFFERENT '
                          + 'frames, so one of the two forms carries a premature stop. Potentially '
                          + 'NMD-causing; BajaNMD says which form and whether the stop is early enough '
                          + 'to trigger decay.';
                    graph.showSideMenu([
                        { label: frameNote, header: true },
                        {
                            label: 'Splice-site strength (SpliceNet)',
                            click: () => run('baja/bio/splicing/splicing-profile.js', { start: lo, end: hi }, 'sites'),
                            move: () => log('')
                        },
                        {
                            label: 'Exon inclusion, PSI (PSINet)',
                            click: () => run('baja/bio/splicing/splicing-profile.js', null, 'psi'),
                            move: () => log('')
                        },
                        {
                            label: 'Cis-regulatory windows at the acceptor',
                            click: () => run('baja/bio/splicing/cis-attribution.js', { site: acceptorAt, which: 'acceptor' }),
                            move: () => log('')
                        },
                        {
                            label: 'Cis-regulatory windows at the donor',
                            click: () => run('baja/bio/splicing/cis-attribution.js', { site: donorAt, which: 'donor' }),
                            move: () => log('')
                        },
                        {
                            label: 'Intron retention (BajaIR)',
                            click: () => run('baja/bio/splicing/intron-retention.js'),
                            move: () => log('')
                        }
                    ]);
                },
                move: () => log('')
            },

            {
                // BajaNMD (py/bajanmd-lib): the consequence of a cassette exon going in
                // or out, and the oligos that switch it. A sibling model family to
                // BajaSplice rather than one of its views, because the question is about
                // the TRANSCRIPT's fate, not about where the splice sites are.
                //
                // Runs on THIS exon, like the BajaSplice entries above: this menu is
                // titled with the exon's id, so handing back a list of the gene's exons
                // made the user hunt for the row they had already pointed at. The
                // annotation goes through, and bajanmd.js answers for it in both
                // directions, with the oligos one button away. Without an annotation it
                // still falls back to the gene-wide list.
                label: 'BajaNMD \u00b7 NMD consequence & ASOs',
                click: async () => {
                    if (!selectedTrack) {
                        graph.setMessage(" No track selected ");
                        return;
                    }
                    try { graph.showSideMenu(null); } catch (e) { }
                    Promise.resolve(exec('baja/bio/splicing/bajanmd.js',
                        graph, genegraph_panel_layout, selectedTrack, annotation))
                        .catch((e) => {
                            try { graph.setMessage(' BajaNMD: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
                        });
                },
                move: () => log('')
            },

            {
                label: 'Phylon',

                click: async (xwc, ywc) => {
                    const submenu = [
                        {
                            label: 'Human',
                            click: async () => {
                                await runCrypticExonFinder({
                                    graph,
                                    selectedTrack,
                                    annotation,
                                    exec,
                                    infoPrompt,
                                    scriptPath: 'py/splicing/cryptic-exon-finder.py'
                                });
                            },
                            move: () => log('')
                        },
                        {
                            label: 'Mouse',
                            click: async () => {
                                await runCrypticExonFinder({
                                    graph,
                                    selectedTrack,
                                    annotation,
                                    exec,
                                    infoPrompt,
                                    scriptPath: 'py/splicing/cryptic-exon-finder-mm9.py'
                                });
                            },
                            move: () => log('')
                        }
                    ];

                    graph.showSideMenu(submenu);
                },
                move: () => log('')
            },

            {
                label: 'Secondary structure',
                click: async (xwc, ywc) => {
                    if (!selectedTrack) {
                        infoPrompt(" No track selected ");
                        return;
                    }

                    if (selectedTrack != null) {
                        selectedTrack.markstart = annotation.xi;
                        selectedTrack.markend = annotation.xf;

                        let sequence = selectedTrack.getHighlightedSequence();
                        if (sequence.length > 7000) {
                            infoPrompt(" Sequence is too long for the prediction tool (>7kb)");
                            return;
                        }

                        let lb = null;
                        let engineMonitor = new EngineMonitor((msg) => {
                            lb.setHTML(msg);
                        });

                        CurrentLayout.setComponent('buttonMenuPanel', {
                            wid: 'html',
                            refCallback: createIon((p) => {
                                lb = p;
                            }),
                            data: '<font color="blue"> Generating secondary structure.... </font>'
                        });

                        let t = await selectedTrack.createSecondaryStructure(
                            selectedTrack.markstart,
                            selectedTrack.getHighlightedSequence(),
                            selectedTrack.name,
                            engineMonitor
                        );
                        t.anchorX = selectedTrack.markstart;
                        t.xindex_start = selectedTrack.markstart;
                        t.tgraph.yi = selectedTrack.tgraph.yi;
                        t.anchorY = selectedTrack.tgraph.yi;

                        setTimeout(async () => {
                            graph.showSideMenu(null);
                            graph.setCenterMessage(" Secondary structure is complete ");
                        }, 10000);
                    } else {
                        infoPrompt(" You need to highlight a sequence on a track first.");
                    }
                },
                move: () => log('')
            }
        ];

        resolve(models);
    });
}
