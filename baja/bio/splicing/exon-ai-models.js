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
                            // THE SAME MODEL, READ FOR BRAIN. PSINet already predicts a PSI
                            // per GTEx tissue; the ordinary PSI entry averages all of them,
                            // which is right for a general question and wrong for a neural
                            // target: an exon in brain and out elsewhere averages to
                            // mid-range and reads as unreliable when in brain it is a clean
                            // decision. No retraining, just the head that was always there.
                            //
                            // GTEx brain is BULK brain, neurons and glia and vessels
                            // together, so the label says brain and not neurons. Sorted
                            // neurons are not in this training set and no reading of this
                            // model can produce them.
                            label: 'Exon inclusion in BRAIN, PSI (PSINet)',
                            click: () => run('baja/bio/splicing/splicing-profile.js', null, 'psi', 'brain'),
                            move: () => log('')
                        },
                        {
                            // Reads the PSI run already on the track rather than re-running
                            // the model: the per-exon reliability is computed during that run
                            // and kept on the layer, so ranking is free once PSI has been done
                            // and impossible before it. Saying which is better than silently
                            // running a model the user did not ask for.
                            label: 'Rank exons by how unreliably they splice',
                            click: () => {
                                try { graph.showSideMenu(null); } catch (e) { }
                                const esc2 = (t) => ('' + (t == null ? '' : t))
                                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                const L = (selectedTrack.track_layers || []).filter((x) => x
                                    && x.magnitudeMode === 'psi'
                                    && Array.isArray(x.exonStability) && x.exonStability.length).pop();
                                if (!L) {
                                    showModal({ wid: 'card', data: { cards: [[{ 'width': '100%', 'component': { wid: 'html', data:
                                        '<div style="padding:8px 4px;font-weight:700;">Rank exons by reliability</div>'
                                        + '<div style="padding:0 4px 8px 4px;font-size:12.5px;">Run <b>Exon inclusion, '
                                        + 'PSI (PSINet)</b> on this track first. The reliability of each exon is worked '
                                        + 'out during that run and kept with the layer, so there is nothing to rank '
                                        + 'until it has been done.</div>' } }]] } });
                                    return;
                                }
                                // Untrusted exons last: rank is null for them, and
                                // `b.rank - a.rank` on a null is NaN, which leaves the order
                                // to chance and can float a blended label to the top.
                                const rows = L.exonStability.slice().sort((a, b) => {
                                    if (!a.untrusted !== !b.untrusted) return a.untrusted ? 1 : -1;
                                    return (b.rank || 0) - (a.rank || 0);
                                });
                                const COL = { 'constitutive': '#15803d', 'rarely in': '#2563eb',
                                              'variable': '#d97706', 'unstable': '#c0392b' };
                                let html = '<div style="padding:8px 4px;font-weight:700;">Exons ranked by how '
                                    + 'unreliably they splice <span style="font-weight:400;color:#5b6b7c;">\u00b7 '
                                    + esc2(selectedTrack.name || 'track') + '</span></div>'
                                    + '<div style="padding:0 4px 8px 4px;font-size:12.5px;color:#5b6b7c;">'
                                    + 'Reliability is distance from the nearest extreme: an exon at 99% and one at 2% '
                                    + 'are both reliable, one reliably in and one reliably out, and one at 50% is '
                                    + 'neither. '
                                    + (L.exonStabilityHasContext
                                        ? 'Weighted up by conservation and by annotated functional sites inside the '
                                          + 'exon, so an unreliable exon that carries a binding site outranks an '
                                          + 'equally unreliable one that carries nothing.'
                                        : 'No conservation or domain layer is loaded on this track, so this is '
                                          + 'reliability alone; load either and run PSI again to weight it.')
                                    + '</div>'
                                    + '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
                                    + '<tr style="text-align:left;border-bottom:1px solid #ccd;"><th>#</th><th>exon</th>'
                                    + '<th>inclusion</th><th>reliability</th><th>conservation</th><th>sites</th>'
                                    + '<th>score</th></tr>';
                                rows.forEach((e, i) => {
                                    html += '<tr style="border-bottom:1px solid #eef;">'
                                        + '<td>' + (i + 1) + '</td>'
                                        + '<td>e' + esc2(e.exon) + '</td>'
                                        + '<td>' + (e.measured
                                            // THE DISAGREEMENT STAYS ON SCREEN. On the exon
                                            // there is room for one number and it should be
                                            // the measured one; here there is room for both,
                                            // and the gap between them is the finding -- for
                                            // SMN2 exon 7, a tenth measured against the 96%
                                            // the model learned from a blended label.
                                            ? ('<span style="color:#6d28d9;font-weight:600;">~'
                                               + Math.round(100 * e.measured.psi) + '% measured</span>'
                                               + (e.psiPredicted == null ? ''
                                                  : ('<br><span style="color:#8a94a0;">model said '
                                                     + Math.round(100 * e.psiPredicted) + '%</span>')))
                                            : e.untrusted ? '\u2013' : (Math.round(100 * e.psi) + '%')) + '</td>'
                                        + '<td style="color:' + (e.measured ? '#6d28d9'
                                            : e.untrusted ? '#475569' : (COL[e.word] || '#0b1a2b'))
                                        + ';font-weight:600;">' + esc2(e.word) + '</td>'
                                        + '<td>' + (e.conservation == null ? '\u2013' : e.conservation.toFixed(2)) + '</td>'
                                        + '<td>' + esc2(e.sites == null ? 0 : e.sites) + '</td>'
                                        + '<td>' + (e.rank == null ? '' : e.rank.toFixed(3)) + '</td></tr>';
                                });
                                html += '</table>';
                                // WHETHER MAPPABILITY WAS CHECKED AT ALL. Without this line the
                                // two cases that matter are indistinguishable: no untrusted exons
                                // because the locus is clean, and no untrusted exons because no
                                // interval file is configured and nothing was ever looked up.
                                // WHERE A MEASURED NUMBER CAME FROM. A figure with no
                                // traceable source looks like evidence without being any, so
                                // the citation travels with it rather than living only in the
                                // table file on the server.
                                const meas = rows.filter((e) => e.measured);
                                if (meas.length) {
                                    html += '<div style="margin:8px 4px 0 4px;padding:7px;border-left:3px solid #6d28d9;'
                                        + 'background:#faf8ff;font-size:12.5px;"><b>' + meas.length + '</b> exon'
                                        + (meas.length === 1 ? ' carries' : 's carry')
                                        + ' a published measurement, shown in place of the prediction because '
                                        + 'the prediction is the part that cannot be trusted here. These are '
                                        + 'measurements, not corrected model output:<ul style="margin:4px 0 0 0;'
                                        + 'padding-left:18px;">';
                                    for (const e of meas) {
                                        const m = e.measured;
                                        html += '<li>e' + esc2(e.exon) + ' \u00b7 '
                                            + esc2(m.gene || '') + (m.exon ? (' exon ' + esc2(m.exon)) : '')
                                            + ' \u00b7 ~' + Math.round(100 * m.psi) + '%'
                                            + ((m.lo != null && m.hi != null)
                                               ? (' (' + Math.round(100 * m.lo) + '\u2013'
                                                  + Math.round(100 * m.hi) + '% across assays)') : '')
                                            + (m.assay ? (' \u00b7 ' + esc2(m.assay)) : '')
                                            + (m.source ? (' \u00b7 <span style="color:#5b6b7c;">'
                                                           + esc2(m.source) + '</span>') : '')
                                            + '</li>';
                                    }
                                    html += '</ul></div>';
                                }
                                const nU = rows.filter((e) => e.untrusted).length;
                                if (!L.untrustedSource) {
                                    html += '<div style="margin:8px 4px 0 4px;padding:7px;border-left:3px solid #94a3b8;'
                                        + 'background:#f8fafc;font-size:12.5px;">Mappability was <b>not checked</b>: no '
                                        + 'low-mappability interval file is configured on the server, so an exon whose '
                                        + 'PSI came from reads a paralog could equally have produced is ranked here as '
                                        + 'though the number were its own. Configure one with '
                                        + '<code>bajasplice config --untrusted-bed</code>.</div>';
                                } else if (nU) {
                                    html += '<div style="margin:8px 4px 0 4px;padding:7px;border-left:3px solid #475569;'
                                        + 'background:#f8fafc;font-size:12.5px;"><b>' + nU + '</b> exon'
                                        + (nU === 1 ? '' : 's') + ' sit in duplicated sequence. Their PSI was measured '
                                        + 'from reads that another locus could equally have produced, so the label is a '
                                        + 'blend and the prediction reproduces it faithfully: these are listed without a '
                                        + 'number and are not ranked, in either direction.</div>';
                                }
                                if (L.exonStabilityFit != null && L.exonStabilityFit < 0.6) {
                                    html += '<div style="margin:8px 4px 0 4px;padding:7px;border-left:3px solid #d97706;'
                                        + 'background:#fffaf0;font-size:12.5px;">Only '
                                        + Math.round(100 * L.exonStabilityFit) + '% of the arcs landed on an exon edge, '
                                        + 'so the exon numbering may not line up with the drawn exons here. Treat the '
                                        + 'order as indicative.</div>';
                                }
                                showModal({ wid: 'card', data: { cards: [[{ 'width': '100%',
                                    'component': { wid: 'html', data: html } }]] } });
                            },
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
