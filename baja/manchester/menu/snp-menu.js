function (graph, track, snp) {

    return new Promise(async (resolve, reject) => {
        let menuList = []
        let editor;

        const genegraph_panel_layout = CurrentLayout.getStashed('mainPanel')

        r = createIonFunction((p) => {
            editor = p;
        })

        // FRAME THE VARIANT. One definition, because two menu items ask for it and a
        // second copy of the numbers is a second thing to keep in step.
        //
        // Not awaited by the caller that wants to get on with something else: the camera
        // moving and a lookup running are independent, and making the lookup wait for the
        // animation would add a second of nothing to every question asked about a variant.
        const frameSnp = () => {
            try {
                // animateTo returns immediately when `animating` is already true -- that is
                // how a second drag cancels the first. Here it means the camera silently
                // does not move, and for More information that is the whole failure: the
                // annotation callout only draws once a base is wider than 2.5 px, so an
                // answer about a variant that is still off screen renders as nothing at
                // all. A stale flag is left behind by any animation that did not reach its
                // own end, so it is cleared rather than trusted.
                try { graph.animating = false; } catch (e) { }
                return Promise.resolve(graph.animateTo(
                    track.tgraph.X(snp.xi) - 10, track.tgraph.X(snp.xf) + 10,
                    track.tgraph.yi - 5, track.tgraph.yi + 1, 1000))
                    .then(() => {
                        try { exec('baja/manchester/menu/focus-mutation.js', graph, snp, 10000); } catch (e) { }
                    })
                    .catch(() => { });
            } catch (e) { return Promise.resolve(); }
        };

        menuList = []
        menuList.push(
            {
                label: "Zoom into snp",
                click: async (scx, scy) => {
                    setTimeout(() => { frameSnp(); }, 200)
                    graph.showSideMenu(null)
                },
                move: () => {
                }
            });

        menuList.push(
            {
                label: "More information",
                click: async (scx, scy) => {
                    graph.showSprite = true;
                    // GO THERE WHILE IT LOOKS. The lookup is a round trip to the server and
                    // a model call after it -- several seconds -- and until now the canvas
                    // sat wherever it was, so the answer arrived about a variant that was
                    // not on screen.
                    //
                    // Deferred to a later tick, exactly as Zoom into snp does, and never
                    // awaited. Called inline it ran while this click was still unwinding --
                    // before the menu that launched it had finished closing -- and an
                    // animation starting inside a handler that is mid-teardown is the one
                    // ordering the working item deliberately avoids. The camera and the
                    // lookup are independent either way.
                    setTimeout(() => { try { frameSnp(); } catch (e) { } }, 200);
                    // Gene symbol (from the track description "GENE;transcript") and genomic
                    // locus for the  prompt, so the summary is specific to this variant.
                    let geneSymbol = '';
                    try { geneSymbol = ('' + (track.description || '')).split(';')[0].trim(); } catch (e) { }
                    if (!geneSymbol) geneSymbol = track.geneID || track.name || '';
                    let pos = snp.xi;
                    try {
                        if (track.isChildCDNATrack && track.isChildCDNATrack() && track.genomicAt) {
                            const g = track.genomicAt(snp.xi);
                            if (g != null) pos = g;
                        }
                    } catch (e) { }
                    let r = await exec('py/snps/snp_info_claude.py', JSON.stringify(snp), geneSymbol, ('' + (track.chr || '')), ('' + pos));
                    // If the variant datastructure carried an rs number, re-key the SnpIndel to it
                    // ("convert the snpindel using this rs number").
                    try { if (r && r.rsid) { snp.name = r.rsid; snp.id = r.rsid; } } catch (e) { }
                    // Store the clinical summary AS THE VARIANT'S ANNOTATION (rendered on-canvas as
                    // a leader-line callout by snpindel.js). Never show the phrase "corresponds to the".
                    let para = r && (r['mutation_paragraph'] || r['paragraph'] || r['summary']);
                    let ptxt = ('' + (para || '')).replace(/\bcorresponds to the\b/gi, 'is the').replace(/\s{2,}/g, ' ').trim();
                    // If the model had nothing specific but the rs lookup returned ClinVar/dbSNP
                    // clinical data, surface that raw clinical info instead.
                    if (!(ptxt && !/^no (additional|specific)/i.test(ptxt))) {
                        const cs = ((r && r.clinsig) || []).join(', ');
                        const ph = ((r && r.phenotypes) || []).join('; ');
                        const fb = [cs, ph].filter(Boolean).join(' — ');
                        if (fb) ptxt = fb;
                    }
                    // THE PANEL OPENS EITHER WAY.
                    //
                    // A variant with nothing recorded is an ANSWER -- most variants in a
                    // germline VCF have never been submitted to ClinVar -- and it used to
                    // be delivered as a status line that scrolls away. So a click that took
                    // ten seconds to look something up appeared to do nothing at all, which
                    // is indistinguishable from broken. The panel says what was searched and
                    // what came back, and it says it in the same place as a positive answer.
                    const __known = !!(ptxt && !/^no (additional|specific)/i.test(ptxt));
                    if (__known) {
                        // The callout stays: it is what marks the variant on the canvas
                        // afterwards, and it is why the camera was sent there. Only for a
                        // real finding -- annotating a marker with "nothing is known" would
                        // clutter the canvas with non-answers.
                        snp.annotation = ptxt;
                        snp.showAnnotation = true;
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                    }

                    const __meta = [
                        geneSymbol,
                        (track.chr ? ('chr' + track.chr + ':' + (+pos).toLocaleString()) : ''),
                        ((snp.reference && snp.alternate) ? (snp.reference + '>' + snp.alternate) : ''),
                        (r && r.rsid) || '',
                        ((r && r.clinsig) || []).join(', '),
                    ].filter(Boolean).join('  ·  ');

                    const __sections = [];
                    if (!r || r.error) {
                        __sections.push({
                            heading: 'Lookup failed',
                            text: 'The variant could not be looked up'
                                + ((r && r.error) ? (': ' + r.error) : '.')
                                + ' The record below is what this session holds about it.',
                        });
                    } else if (__known) {
                        __sections.push({ heading: 'Clinical summary', text: ptxt });
                    } else {
                        __sections.push({
                            heading: 'Nothing recorded',
                            text: 'No clinical significance is recorded for this exact variant. '
                                + 'It was looked for by rs number and by position and alleles in '
                                + 'ClinVar, and neither found it. That is common: most variants in '
                                + 'a germline VCF have never been submitted.',
                        });
                    }
                    const __ph = ((r && r.phenotypes) || []).filter(Boolean);
                    if (__ph.length) {
                        __sections.push({ heading: 'Associated conditions', text: __ph.join('; ') });
                    }
                    __sections.push({
                        heading: 'Source',
                        text: (r && r.clinsource === 'ClinVar')
                            ? 'ClinVar, matched by position and alleles at this locus.'
                            : (r && r.clinsource === 'dbSNP')
                                ? 'dbSNP/ClinVar, matched by rs number.'
                                : 'No match in ClinVar by rs number or by position.',
                    });

                    try {
                        await exec('baja/lib/model-panel.js', {
                            id: 'baja-snp-more-info',
                            title: 'Variant information',
                            subtitle: 'assembled from public knowledge, not from a curated database',
                            cards: [{
                                title: (r && r.rsid) || snp.name || snp.id || 'This variant',
                                meta: __meta,
                                sections: __sections,
                            }],
                        });
                    } catch (e) {
                        graph.setMessage(' The information panel could not open: '
                            + (e && e.message ? e.message : e) + ' ');
                    }
                    graph.showSprite = false;
                    graph.showSideMenu(null)
                },
                move: () => {
                }
            });

        menuList.push(
            {
                label: "Toggle annotations on selected variants",
                click: async (scx, scy) => {
                    // The "selected" variants are the highlighted ones (select() sets .highlight);
                    // gather them across every track, falling back to just this variant. If ANY are
                    // currently showing their annotation, hide them all; otherwise show them all.
                    let targets = [];
                    try {
                        for (const t of (graph.track || [])) {
                            for (const s of (t.snpindels || [])) {
                                if (s && s.highlight) targets.push(s);
                            }
                        }
                    } catch (e) { }
                    if (!targets.length && snp) targets = [snp];
                    let anyShown = false;
                    for (const s of targets) { if (s && s.annotation && s.showAnnotation !== false) { anyShown = true; break; } }
                    const show = !anyShown;
                    for (const s of targets) { if (s) s.showAnnotation = show; }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    try { graph.setMessage(' ' + (show ? 'Showing' : 'Hiding') + ' annotations on ' + targets.length + ' selected variant' + (targets.length === 1 ? '' : 's') + '. '); } catch (e) { }
                    graph.showSideMenu(null)
                },
                move: () => {
                }
            });


        menuList.push(
            {
                label: "Properties",
                click: async (scx, scy) => {

                    showModal(
                        {
                            wid: 'json',
                            data: JSON.stringify(snp)
                        }
                    )
                },
                move: () => {
                }
            });
        menuList.push(
            {
                label: "SNP/Indel Tools",
                click: async (scx, scy) => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    const hl = await exec('baja/manchester/menu/variant-tools-finder.js', graph)
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', hl);
                },
                move: () => {
                }
            });
        menuList.push(
            {
                label: "Mutate",
                click: async (scx, scy) => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    const hl = await exec('baja/manchester/menu/variant-tools-finder.js', graph)
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', hl);
                    track.mutateTrackWithSingleMutation(snp)
                    track.generateORF();
                    infoPrompt(" Track sequence has changed. ")
                },
                move: () => {
                }
            });

        menuList.push(
            {
                label: 'Allele selective ASOs',
                click: async (x, y) => {
                    graph.showSideMenu(null);

                    // WHICH VARIANTS. A lasso selection of SNPs is a deliberate statement
                    // that all of them are wanted -- designing against one of five that
                    // were selected together answers a question nobody asked -- so the
                    // selection wins when there is one, and the clicked variant is the
                    // fallback for the ordinary case of right-clicking a single SNP.
                    const lassoed = (graph.__lassoSelection || [])
                        .filter((e) => e && e.kind === 'snp' && e.ref);
                    const targets = lassoed.length
                        ? lassoed.map((e) => ({
                            snp: e.ref, track: e.track || track,
                            label: e.label || 'variant'
                        }))
                        : (snp ? [{
                            snp: snp, track: track,
                            label: (snp.id || snp.name || 'the variant')
                        }] : []);
                    if (!targets.length) {
                        graph.setMessage(' Click closer to a variant. ');
                        return;
                    }
                    // The chemistry catalogue and the phase choice live in one place, so
                    // this menu and the selection library's SNPs / Indels shelf cannot
                    // drift apart.
                    try {
                        await exec('baja/manchester/menu/allele-selective-chemistry.js',
                            graph, targets);
                    } catch (e) {
                        graph.setMessage(' Could not open the chemistry library: '
                            + (e && e.message ? e.message : e) + ' ');
                    }
                },
                move: () => {
                },
            },
        );

        // Delete this variant from the track. Destructive, so it CONFIRMS first, and pushes
        // onto the history stack before touching anything so an accepted delete is undoable.
        menuList.push(
            {
                label: "Delete",
                click: async (scx, scy) => {
                    const label = ('' + (snp.name || snp.id
                        || ([snp.ref, snp.alt].filter(Boolean).join('>')) || 'this variant'));
                    const where = (track && track.name) ? (' from ' + track.name) : ' from the track';
                    const doDelete = () => {
                        try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                        try { track.removesnp(snp); } catch (e) { }
                        try { graph.showSideMenu(null); } catch (e) { }
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                        try { if (graph.rescale) graph.rescale(); } catch (e) { }
                        try { graph.setMessage(' Deleted ' + label + where + '. Undo restores it. '); } catch (e) { }
                    };
                    try {
                        const c = await exec('baja/lib/confirm.js',
                            'Delete ' + label + where + '? This removes the variant from the track.',
                            () => { doDelete(); }, 'Delete');
                        showModal(c);
                    } catch (e) {
                        // No confirmation dialog available: do NOT delete silently.
                        try { graph.setMessage(' Could not open the confirmation: ' + e + ' '); } catch (e2) { }
                    }
                },
                move: () => {
                }
            }
        );

        resolve(menuList)
    })
}
