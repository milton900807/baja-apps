function (graph, genegraph_panel_layout, tracks) {

    // Same contract as the ML Models Library: `tracks` is the set this library loads onto,
    // handed down from whoever opened it rather than decided here.
    //
    // Data Resources — the shelf the user lands on from a track's Layers menu. Each card is a
    // class of data that can be added to the board as track layers.
    //   exec('baja/data/data-resources-library.js', graph, genegraph_panel_layout, tracks)
    //
    // EVERY sub-resource here is another LIBRARY, never a side menu. Variants opens a library
    // of databases; a database opens a library of variant classes; only that leaf loads. The
    // shelf (baja/lib/shelf.js) walks in and out of those levels inside the one overlay, with a
    // breadcrumb and a Back, so the idiom never changes underfoot: you are looking at a library
    // right up until the moment something is actually put on a track.
    //
    // This file used to carry its own copy of the overlay markup and dropped into
    // graph.showSideMenu for the two resources that had a choice to offer -- so picking RNASeq
    // gave you a full-screen library and picking Variants gave you a small popup list in the
    // corner. Same question, two different interfaces. It is one interface now.

    return (async () => {

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const host = () => (window['env'] && window['env']['apiUrl']) || window.location.origin;
        // Normalised once: a single track, an array, or nothing.
        const __targets = () => (Array.isArray(tracks) ? tracks.filter(Boolean) : (tracks ? [tracks] : []));

        // Every leaf loads onto the track it sits UNDER, and no other.
        //
        // Opened from a track's menu the track IS the parent and comes in as `tracks`. Opened
        // from the library menu nothing does, and each loader fell through to
        // baja/lib/for-each-track.js, which honours the board-wide flag the Layers button sets
        // on its way in -- so one click put a dataset on every track on the canvas. The
        // Design Library and the ML Models library answer this by putting the tracks in as a
        // level to walk through; this is the same idiom, so the track is a node on the path
        // above the leaf rather than a flag set elsewhere.
        //
        // The flag is consumed here, before anything downstream can read it.
        //
        // `run(list)` is the loader itself, handed the tracks to load onto. `title` names the
        // level of track cards, so the path reads "Data > Variants > ClinVar > MALAT1".
        const __onParentTrack = async (title, run) => {
            try { window.__bajaApplyAllTracks = false; } catch (e) { }
            const explicit = __targets();
            if (explicit.length) return run(explicit);
            const all = ((graph && graph.track) || []).filter(Boolean);
            if (!all.length) {
                const msg = ' Load a track first — ' + title + ' loads onto one. ';
                try { graph.setResultMessage(msg); } catch (e) { try { graph.setMessage(msg); } catch (e2) { } }
                return false;
            }
            // One track: it is the only possible parent, and a level holding a single card is
            // a click that asks nothing.
            if (all.length === 1) return run([all[0]]);
            return exec('baja/lib/shelf.js', {
                id: 'baja-data-resources-tracks',
                title: title,
                subtitle: 'Pick the track to load onto — the layer goes on that track only',
                graph: graph,
                onClose: restoreHover,
                books: all.map((t, i) => ({
                    title: t.name || ('track ' + (i + 1)),
                    badge: (t.track_type || 'Track'),
                    blurb: 'Load ' + title + ' onto ' + (t.name || 'this track')
                        + ((() => { try { return (t.selectedRange && t.selectedRange()) ? ', over its selected sequence' : ''; } catch (e) { return ''; } })())
                        + '.',
                    open: () => run([t])
                }))
            });
        };

        // ---- Variants: databases, then classes ------------------------------------------
        //
        // Two levels because they are two genuinely separate decisions. WHICH database is a
        // question about provenance -- clinical assertions, population frequencies, somatic
        // calls -- and WHICH class is a question about what you are looking for in it. Asked
        // together they would be one list of two dozen combinations.
        const VARIANT_SOURCES = [
            {
                db: 'clinvar', label: 'ClinVar', badge: 'Clinical',
                clinical: true,
                blurb: 'Clinically asserted variation with submitter evidence. Colored by '
                    + 'significance on the track: red pathogenic, green benign, amber uncertain.'
            },
            {
                db: 'dbsnp', label: 'dbSNP', badge: 'Reference',
                blurb: 'The reference catalogue of short variation — the broadest set here, and '
                    + 'the one that says nothing about whether a variant matters.'
            },
            {
                db: 'gnomad', label: 'gnomAD', badge: 'Population',
                blurb: 'Population allele frequencies. Each variant carries its AF, which is how '
                    + 'you tell a common polymorphism from something rare at your target site.'
            },
            {
                db: 'cosmic', label: 'COSMIC', badge: 'Somatic',
                blurb: 'Somatic mutations catalogued in cancer — acquired, not inherited, so read '
                    + 'them as tumour observations rather than germline variation.'
            }
        ];

        // The classes offered for one database. `open` is the LEAF: this is where loading
        // finally happens, and nothing above it touches a track.
        const variantClasses = (src) => {
            const load = (f) => __onParentTrack(src.label + ' variants', (list) =>
                exec('baja/data/load-variants.js', host(), graph, genegraph_panel_layout,
                    // autoUseSelection true: on a track carrying a selected sequence the variants are
                    // fetched over that range rather than over the whole track.
                    src.db, src.label, true, list, f));
            const books = [
                {
                    title: 'All variants', badge: 'Everything',
                    blurb: 'Every variant ' + src.label + ' reports over the region, unfiltered.',
                    open: () => load(null)
                },
                {
                    title: 'SNVs only', badge: 'Substitution',
                    blurb: 'Single-base substitutions — one reference base for one alternate. Often '
                        + 'the class a design cares about, since they leave the coordinate frame intact.',
                    open: () => load({ label: 'SNVs', types: ['snp'] })
                },
                {
                    title: 'Insertions', badge: 'Indel',
                    blurb: 'Variants that add bases relative to the reference.',
                    open: () => load({ label: 'insertions', types: ['ins'] })
                },
                {
                    title: 'Deletions', badge: 'Indel',
                    blurb: 'Variants that remove bases relative to the reference.',
                    open: () => load({ label: 'deletions', types: ['del'] })
                },
                {
                    title: 'Indels (both)', badge: 'Indel',
                    blurb: 'Insertions and deletions together, without the substitutions — the '
                        + 'variants that shift everything downstream of them.',
                    open: () => load({ label: 'indels', types: ['ins', 'del'] })
                }
            ];
            // Significance is a ClinVar question. dbSNP, gnomAD and COSMIC carry no clinical
            // assertion, so offering the filter there would return an empty layer every time and
            // read as the load being broken.
            if (src.clinical) {
                books.push({
                    title: 'Pathogenic', badge: 'Significance',
                    blurb: 'Pathogenic and likely pathogenic assertions only. Conflicting '
                        + 'interpretations are excluded rather than counted here.',
                    open: () => load({ label: 'pathogenic', clinsig: { any: ['pathogenic'], not: ['conflicting'] } })
                });
                books.push({
                    title: 'Benign', badge: 'Significance',
                    blurb: 'Benign and likely benign assertions only.',
                    open: () => load({ label: 'benign', clinsig: { any: ['benign'], not: ['conflicting'] } })
                });
                books.push({
                    title: 'Uncertain / conflicting', badge: 'Significance',
                    blurb: 'Variants of uncertain significance and those with conflicting '
                        + 'submissions — the ones an assertion has not settled.',
                    open: () => load({ label: 'uncertain or conflicting', clinsig: { any: ['uncertain', 'conflicting'] } })
                });
            }
            return books;
        };

        const variantSourceBooks = () => VARIANT_SOURCES.map((src) => ({
            title: src.label,
            badge: src.badge,
            blurb: src.blurb,
            subtitle: 'Pick the class of ' + src.label + ' variant to load',
            books: () => variantClasses(src)
        })).concat([{
            // Not a database: a described change placed on the loaded track. The model only
            // reads the description; the base is derived from and checked against the track's
            // own coding sequence (baja/data/variant-from-prompt.js).
            title: 'Describe a variant', badge: 'Variants',
            blurb: 'Type a change in words — K27M, p.Arg175His, c.83A>T — and it is placed on the '
                + 'loaded track as a mutation, at the position the track\'s own coding sequence '
                + 'says it belongs. Nothing new is loaded.',
            open: () => __onParentTrack('Describe a variant', (list) => exec('baja/data/variant-from-prompt.js', host(), graph, genegraph_panel_layout, list))
        }]);

        // ---- microRNA: the two evidence sets, as their own shelf -------------------------
        const mirnaBooks = async () => {
            const SETS = await exec('baja/data/layer-sets.js');
            return [
                {
                    title: SETS.mirtarbase10_strong.label, badge: 'Strong evidence',
                    blurb: 'Sites confirmed by reporter assay, western blot or qPCR — the smaller, '
                        + 'higher-confidence set.',
                    open: () => __onParentTrack(SETS.mirtarbase10_strong.label, (list) => exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, SETS.mirtarbase10_strong, list))
                },
                {
                    title: SETS.mirtarbase10_all.label, badge: 'All reported',
                    blurb: 'Everything reported including CLIP-derived sites. Broader, and much of '
                        + 'it is a binding observation rather than a demonstrated effect.',
                    open: () => __onParentTrack(SETS.mirtarbase10_all.label, (list) => exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, SETS.mirtarbase10_all, list))
                }
            ];
        };

        // ---- Patents: the IP datasets, as their own shelf --------------------------------
        // Two genuinely different sets, and the difference matters: the full patent index is
        // everything sequence-matched over 2020-2025, while the ASO / siRNA / gene-therapy set
        // is the subset whose claims are about oligonucleotide therapeutics. Loading the first
        // when you wanted the second buries the handful of hits you care about.
        const patentBooks = async () => {
            const SETS = await exec('baja/data/layer-sets.js');
            return [
                {
                    title: SETS.aso_sirna_gt.label + ' patents', badge: 'Therapeutic IP',
                    blurb: 'The subset whose claims are about oligonucleotide therapeutics — ASO, '
                        + 'siRNA and gene therapy — carrying the assignee behind each hit.',
                    open: () => __onParentTrack(SETS.aso_sirna_gt.label, (list) => exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, SETS.aso_sirna_gt, list))
                },
                {
                    title: SETS.assay_panel_patents.label, badge: 'Assay IP',
                    // Named for what the hits are, not for the search that found them: 8,853
                    // sequences from 12 patents (9 families) spread about one per transcript
                    // across 6,017 of them, most at 25-59 nt. Detection chemistry, not
                    // therapeutic sequence -- which is the distinction a designer needs.
                    blurb: 'Primer and probe sequences claimed as diagnostic panels — 8,853 hits '
                        + 'from 12 patents across 6,017 transcripts, each carrying its assignee. '
                        + 'Check here before publishing an assay, not a therapeutic.',
                    open: () => __onParentTrack(SETS.assay_panel_patents.label, (list) => exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, SETS.assay_panel_patents, list))
                }
            ];
        };

        // ---- My data: what KIND of file, then the file browser ---------------------------
        // Each card arms the track click and drops straight into the browser for that type
        // (my-data.js `preAction`), rather than clicking a track and being asked the same
        // question again in a popup menu.
        const myDataBooks = () => [
            {
                title: 'Browse all my files', badge: 'File browser',
                blurb: 'Your whole space in the file browser — everything, not only the three types '
                    + 'above. Opening a file there loads it into the app.',
                open: () => exec('manchester/fb.js', getUser() + '/')
            }
        ];

        // ---- The top shelf ---------------------------------------------------------------
        // `ready:false` cards are shown greyed with a note instead of being hidden, so the
        // catalogue reads as complete rather than silently short.
        const RESOURCES = [
            {
                title: 'RNASeq',
                badge: 'Coverage',
                blurb: 'Per-base read depth from the RNASeq reference tree, organised by species and tissue. '
                    + 'Choosing a dataset adds it as a coverage layer to every track on the board.',
                open: () => __onParentTrack('RNASeq', (list) => exec('baja/data/rnaseq-library.js', graph, genegraph_panel_layout, list))
            },
            {
                title: 'Variants',
                badge: 'SNP / Indel',
                subtitle: 'Pick a variant database',
                blurb: 'Known variation over the track, from the major databases. Opens a library of '
                    + 'sources, then the classes within one; a track with a selected sequence gets '
                    + 'only the variants inside it.',
                books: variantSourceBooks
            },
            {
                title: 'Conservation',
                badge: 'Comparative',
                // Not ready: there are no phyloP / phastCons bigwigs in BIG_DATA on this
                // deployment, so opening it gave an empty file browser. The loader itself
                // works and is left wired below -- flip this back to true once the data is
                // installed and nothing else needs changing.
                ready: false,
                blurb: 'Cross-species conservation score as a coverage layer, for judging whether a '
                    + 'target site is under selective constraint. Coming soon: awaiting the '
                    + 'phyloP / phastCons data.',
                open: () => __onParentTrack('Conservation', (list) => exec('baja/data/conservation-data.js', graph, genegraph_panel_layout, list))
            },
            {
                title: 'microRNA target sites',
                badge: 'miRTarBase',
                subtitle: 'Pick an evidence set',
                blurb: 'Experimentally reported miRNA target sites from miRTarBase 10, keyed by '
                    + 'transcript. Adds them as an interval layer carrying the miRNA, the evidence '
                    + 'type and the PMIDs behind each site.',
                books: mirnaBooks
            },
            {
                title: 'Patents',
                badge: 'IP',
                subtitle: 'Pick an IP dataset',
                blurb: 'Sequence-matched patent hits from the transcript-keyed index. Adds the hits '
                    + 'as an interval layer, stacked into lanes, so published IP claims sit '
                    + 'alongside the region you are designing against.',
                books: patentBooks
            },
            {
                title: 'My data',
                badge: 'Your uploads',
                subtitle: 'Pick the kind of file',
                blurb: 'The bigWig, VCF and BED files you have uploaded into your own space. Pick a '
                    + 'kind and the file browser opens on it, or browse everything you have.',
                books: myDataBooks
            },
            {
                title: 'Public data',
                badge: 'Reference',
                blurb: 'Shared public reference tracks configured for this deployment.',
                // NB: public-data.js takes (graph, layout, presetResource, presetTracks). The
                // track list goes in the FOURTH slot: in the third it made presetResource
                // truthy, and the card skipped its own list and tried to arm the track array
                // as a resource.
                open: () => __onParentTrack('Public data', (list) => exec('baja/data/public-data.js', graph, genegraph_panel_layout, null, list))
            }
        ];

        await exec('baja/lib/shelf.js', {
            id: 'baja-data-resources',
            title: 'Data & Operations',
            // Say what a load will land on. It used to promise "all tracks on the workbench",
            // which is exactly what no longer happens from here.
            subtitle: (() => {
                const ts = __targets();
                let marked = 0;
                try { marked = ts.filter((t) => t && t.selectedRange && t.selectedRange()).length; } catch (e) { }
                if (marked) return '...applied to the selected sequence on ' + marked + ' track' + (marked === 1 ? '' : 's');
                if (ts.length) return '...applied to ' + ts.length + ' track' + (ts.length === 1 ? '' : 's');
                return '...applied to the track you pick';
            })(),
            books: RESOURCES,
            graph: graph,
            onClose: restoreHover
        });
    })();
}
