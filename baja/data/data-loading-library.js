function (graph, genegraph_panel_layout) {

    // The Data Loading Library — a REFERENCE ROOM for the datasets, not a loader.
    //   exec('baja/data/data-loading-library.js', graph, genegraph_panel_layout)
    //
    // Nothing here loads anything onto a track. The Data Resources Library does that; this
    // describes what each source IS, where it comes from and what it will not tell you, so the
    // choice can be made before a layer lands on the board.
    //
    // Same register as the Institute of Machine Learning Models next door, in a different
    // colour so the two reading rooms are not mistaken for each other.

    return (async () => {
        const restoreHover = () => {
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const SOURCES = [
            {
                name: 'RNASeq coverage',
                field: 'Expression',
                headline: 'Per-base read coverage from bigWig, drawn under the track.',
                whatItIs: 'GTEx and project bigWigs held server-side under BIG_DATA, read over the track\'s '
                    + 'own locus and drawn as a coverage polygon. A dataset chosen from the library lands on '
                    + 'every track on the board at once.',
                readIt: 'Coverage is depth, not expression: it is not length-normalised and not comparable '
                    + 'between samples unless they were sequenced and processed the same way. Use it to see '
                    + 'WHERE reads fall — exon usage, an intron that is not empty, a 3\' bias — rather than '
                    + 'to compare magnitudes.',
                refs: [['GTEx Portal', 'https://gtexportal.org/home/']]
            },
            {
                name: 'Public data',
                field: 'Reference tracks',
                headline: 'bigWig and VCF endpoints read over the visible region.',
                whatItIs: 'Public resources indexed server-side and queried for the track\'s span, so only '
                    + 'the region on screen is fetched rather than a whole genome-scale file.',
                readIt: 'These are third-party assemblies and calls. Coordinates follow the source build — '
                    + 'check it matches the track before drawing conclusions from an overlap.',
                refs: []
            },
            {
                name: 'My data',
                field: 'Your files',
                headline: 'Your own BED and coverage files, from your user folder.',
                whatItIs: 'Files you have uploaded, loaded as interval or coverage layers on the selected '
                    + 'track. BED intervals keep their name and score columns, which drive the label and '
                    + 'colour of each drawn interval.',
                readIt: 'Nothing validates the build or chromosome naming of an uploaded file. A BED on a '
                    + 'different assembly will still draw — silently, in the wrong place.',
                refs: [['BED format', 'https://genome.ucsc.edu/FAQ/FAQformat.html#format1']]
            },
            {
                name: 'Variants',
                field: 'Variation',
                headline: 'ClinVar, dbSNP, gnomAD and COSMIC over the track region.',
                whatItIs: 'Variant records for the visible locus, drawn as lollipops that can be opened for '
                    + 'the underlying record.',
                readIt: 'Clinical significance is an assertion by a submitter, not a fact about the variant, '
                    + 'and gnomAD frequency is ancestry-dependent. A variant absent from gnomAD is not '
                    + 'thereby rare — it may simply be unobserved in those cohorts.',
                refs: [['ClinVar', 'https://www.ncbi.nlm.nih.gov/clinvar/'], ['gnomAD', 'https://gnomad.broadinstitute.org/'],
                       ['COSMIC', 'https://cancer.sanger.ac.uk/cosmic']]
            },
            {
                name: 'Off-target indexes',
                field: 'Search',
                headline: 'Transcriptome and pre-mRNA indexes an oligo can be searched against.',
                whatItIs: 'Local 2-bit + seed indexes, one per reference: human, mouse, rat, dog and monkey '
                    + '(cynomolgus and rhesus), as cDNA and — for most — unspliced pre-mRNA, plus a viral '
                    + 'set. Searched at Levenshtein distance ≤ 3 on both strands.',
                readIt: 'A cDNA index cannot find an intronic hit; that needs the pre-mRNA index for the '
                    + 'same species. Dog and monkey have both. Absence of a hit means absence from THAT '
                    + 'index, which is not the same as absence from the genome.',
                refs: [['Ensembl', 'https://www.ensembl.org/'], ['GENCODE', 'https://www.gencodegenes.org/']]
            },
            {
                name: 'Annotation',
                field: 'Structure',
                headline: 'GENCODE / Ensembl gene models behind every track.',
                whatItIs: 'The exon, intron and CDS structure a track is drawn from, served from tabix-indexed '
                    + 'GFF3 for human, mouse, rat, dog and yeast.',
                readIt: 'Isoform choice matters: a site present on one transcript may be absent from the one '
                    + 'a track happens to display. Where a tool reports a transcript id, that is the isoform '
                    + 'the answer belongs to.',
                refs: [['GENCODE', 'https://www.gencodegenes.org/'], ['Ensembl', 'https://www.ensembl.org/']]
            }
        ];

        const card = (p) => ''
            + '<article style="break-inside:avoid;border:1px solid #ccd6dd;border-top:3px solid #0b5d8a;'
            + 'background:#fbfdff;padding:18px 20px;margin:0 0 16px;">'
            + '<div style="font:11px/1 Arial;letter-spacing:2px;text-transform:uppercase;color:#6d8291;">' + esc(p.field) + '</div>'
            + '<h3 style="margin:6px 0 2px;font:700 22px Georgia,\'Times New Roman\',serif;color:#12212b;">' + esc(p.name) + '</h3>'
            + '<p style="margin:0 0 12px;font:italic 15px Georgia,serif;color:#4a5a66;">' + esc(p.headline) + '</p>'
            + '<dl style="margin:0;font:13.5px/1.6 Arial,Helvetica,sans-serif;color:#22303a;">'
            + '<dt style="font:700 11px Arial;letter-spacing:1.4px;text-transform:uppercase;color:#0b5d8a;margin-top:10px;">What it is</dt>'
            + '<dd style="margin:3px 0 0;">' + esc(p.whatItIs) + '</dd>'
            + '<dt style="font:700 11px Arial;letter-spacing:1.4px;text-transform:uppercase;color:#0b5d8a;margin-top:10px;">How to read it</dt>'
            + '<dd style="margin:3px 0 0;">' + esc(p.readIt) + '</dd>'
            + '</dl>'
            + (p.refs.length
                ? ('<div style="margin-top:12px;padding-top:10px;border-top:1px solid #e6eef3;font:12.5px Arial;">'
                    + p.refs.map((r) => '<a href="' + esc(r[1]) + '" target="_blank" rel="noopener noreferrer" '
                        + 'style="color:#0b5d8a;text-decoration:none;margin-right:14px;">' + esc(r[0]) + ' ↗</a>').join('')
                    + '</div>')
                : '')
            + '</article>';

        try {
            const ID = 'baja-data-loading-library';
            const old = document.getElementById(ID);
            if (old && old.parentNode) old.parentNode.removeChild(old);

            const overlay = document.createElement('div');
            overlay.id = ID;
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483350;background:rgba(8,18,26,0.72);'
                + 'display:flex;align-items:stretch;justify-content:center;padding:22px;font-family:Arial,Helvetica,sans-serif;';

            const pane = document.createElement('div');
            pane.style.cssText = 'width:100%;max-width:1000px;height:100%;display:flex;flex-direction:column;'
                + 'background:#f4f8fb;color:#12212b;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,0.5);overflow:hidden;';

            const head = document.createElement('div');
            head.style.cssText = 'flex:0 0 auto;display:flex;align-items:flex-end;gap:16px;padding:20px 26px 16px;'
                + 'background:#0b5d8a;color:#fff;';
            head.innerHTML = '<div style="min-width:0;">'
                + '<div style="font:700 27px Georgia,\'Times New Roman\',serif;letter-spacing:0.3px;">The Data Loading Library</div>'
                + '<div style="font:12.5px Arial;opacity:0.9;margin-top:4px;">'
                + SOURCES.length + ' data sources · reference only — nothing here loads or changes a track</div>'
                + '</div>';
            const x = document.createElement('button');
            x.textContent = '✕ Close';
            x.style.cssText = 'margin-left:auto;flex:0 0 auto;cursor:pointer;border-radius:6px;padding:8px 15px;'
                + 'font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.5);background:transparent;color:#fff;';
            head.appendChild(x);

            const scroll = document.createElement('div');
            scroll.style.cssText = 'flex:1 1 auto;overflow:auto;padding:22px 26px 30px;';
            scroll.innerHTML = ''
                + '<p style="max-width:70ch;font:15px/1.65 Georgia,serif;color:#33454f;margin:0 0 20px;">'
                + 'Each source is described together with how to read it — what the numbers are, and the '
                + 'inference they do not support. A track drawn from data you have not characterised is a '
                + 'picture, not evidence.</p>'
                + SOURCES.map(card).join('');

            let onKey = null;
            const close = () => {
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
                restoreHover();
            };
            onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
            x.onclick = close;
            overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
            document.addEventListener('keydown', onKey, true);

            pane.appendChild(head); pane.appendChild(scroll);
            overlay.appendChild(pane);
            document.body.appendChild(overlay);
        } catch (e) {
            try { graph.setMessage(' Could not open the data library: ' + e + ' '); } catch (e2) { }
        }
        return graph;
    })();
}
