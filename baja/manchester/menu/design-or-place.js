function (graph, selectedTrack, kind) {

    // DESIGN THE SITE, OR CHOOSE THE SITE YOURSELF.
    //   const how = await exec('baja/manchester/menu/design-or-place.js', graph, track, 'steric');
    //   // 'design' -> the caller runs its own dialog;  anything else -> nothing more to do
    //
    // The design dialog answers "where should this go", by scoring every start position. That
    // is the right question most of the time and the wrong one when the site is already
    // decided: a published compound being reproduced, a site a collaborator named, a window
    // picked off a splicing profile. Then the whole ranking is noise and what is wanted is a
    // compound of a chosen chemistry, placed where it is clicked.
    //
    // Both were reachable before, from different menus, and nothing said they were
    // alternatives. Asked here, at the point the design is about to run, because this is
    // where the choice actually gets made.
    return (async () => {
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const result = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        const isGapmer = ('' + (kind || '')).toLowerCase().indexOf('gap') >= 0;

        // CHEMISTRIES THAT ALREADY EXIST IN THIS CODEBASE, not invented ones. The template
        // grammar is `residue()linkage.` and the only monomers written anywhere here are
        // `moe` and `d` (baja/chem/aso-editor.js, baja/plate/views/templates/aso.js), with
        // `sp.` for the phosphorothioate linkage. Offering LNA or cEt would mean guessing a
        // code, and a chemistry that draws wrong is worse than one that is not on the list.
        const RES = (m, n) => {
            const out = [];
            for (let i = 0; i < n; i++) out.push(m + '()');
            return out;
        };
        const join = (parts) => parts.join('sp.');          // every linkage phosphorothioate
        const gapmerTemplate = (wing, gap) => join(RES('moe', wing).concat(RES('d', gap), RES('moe', wing)));
        const uniformTemplate = (n) => join(RES('moe', n));
        const dnaTemplate = (n) => join(RES('d', n));

        const CHEMS = isGapmer
            ? [
                { label: "Gapmer 5-10-5, 2'-MOE wings, full PS (20 nt)", len: 20, t: () => gapmerTemplate(5, 10) },
                { label: "Gapmer 5-8-5, 2'-MOE wings, full PS (18 nt)", len: 18, t: () => gapmerTemplate(5, 8) },
                { label: 'Plain DNA, full PS (20 nt)', len: 20, t: () => dnaTemplate(20) }
            ]
            : [
                { label: "Uniform 2'-MOE, full PS (20 nt)", len: 20, t: () => uniformTemplate(20) },
                { label: "Uniform 2'-MOE, full PS (18 nt)", len: 18, t: () => uniformTemplate(18) },
                { label: 'Plain DNA, full PS (20 nt)', len: 20, t: () => dnaTemplate(20) }
            ];

        const current = graph.props && graph.props.selected_chemistry;
        const currentName = current && (current.name || current.type);

        const place = (chem) => {
            try {
                graph.props.selected_chemistry = chem;
            } catch (e) { result('Could not set the chemistry: ' + e); return; }
            say('Click and drag along the track to place the compound.');
            try {
                // draw-oligos.js is the existing click-and-drop tool; it reads the chemistry
                // off graph.props and takes the length from it, so setting both here is the
                // whole of the handover.
                Promise.resolve(exec('baja/manchester/menu/draw-oligos.js', graph)).catch((e) => {
                    result('Could not start placing: ' + (e && e.message ? e.message : e));
                });
            } catch (e) { result('Could not start placing: ' + e); }
        };

        return await new Promise((resolve) => {
            let done = false;
            const finish = (v) => { if (!done) { done = true; resolve(v); } };

            const chemMenu = () => {
                const items = [
                    { label: 'Chemistry for the compound you place', move: () => { }, click: () => { } }
                ];
                if (current) {
                    items.push({
                        label: 'Use the current chemistry' + (currentName ? (' (' + currentName + ')') : ''),
                        move: () => { },
                        click: () => { try { graph.showSideMenu(null); } catch (e) { } place(current); finish('place'); }
                    });
                }
                for (const c of CHEMS) {
                    items.push({
                        label: '  ' + c.label,
                        move: () => { },
                        click: () => {
                            try { graph.showSideMenu(null); } catch (e) { }
                            place({
                                type: 'DNA', name: c.label, length: c.len,
                                template: c.t(), shapeFunction: 'baja/shapes/myshapefunction.js'
                            });
                            finish('place');
                        }
                    });
                }
                items.push({
                    label: '‹ Back', move: () => { },
                    click: () => { try { graph.showSideMenu(null); } catch (e) { } top(); }
                });
                if (graph.openMenuAtPointer) graph.openMenuAtPointer(items, 'Chemistry');
                else graph.showSideMenu(items);
            };

            const top = () => {
                const items = [
                    { label: (isGapmer ? 'Gapmer' : 'Steric-blocking') + ' ASO', move: () => { }, click: () => { } },
                    {
                        label: 'Place one by hand — choose a chemistry, then click the site',
                        move: () => { },
                        click: () => { try { graph.showSideMenu(null); } catch (e) { } chemMenu(); }
                    },
                    {
                        label: 'Design across the target — scoring, tiling or allele-selective',
                        move: () => { },
                        click: () => { try { graph.showSideMenu(null); } catch (e) { } finish('design'); }
                    },
                    {
                        label: '‹ Cancel', move: () => { },
                        click: () => { try { graph.showSideMenu(null); } catch (e) { } finish(null); }
                    }
                ];
                if (graph.openMenuAtPointer) graph.openMenuAtPointer(items, 'Design');
                else graph.showSideMenu(items);
            };
            top();
        });
    })();
}
