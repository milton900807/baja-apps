function (options) {

    // THE APPLICATION LAUNCHER, as a widget.
    //
    // Every application in the platform that can be opened cold, grouped by what a user is
    // trying to do:
    //
    //     Design      Oligo  ·  Neoantigen  ·  mRNA  ·  Assay
    //     Explore     Chromosomes  ·  Library
    //     Programme   Project  ·  Analytics
    //
    // Returned rather than shown, so the caller decides where it goes. The home screen puts
    // it above the file browser.
    //
    //   const apps = await exec('baja/applications.js');
    //   showWidget(apps);
    //
    // WHAT IS DELIBERATELY NOT HERE. The models library and the clinical compound library
    // are real and shipped, but both take a graph and write onto its tracks -- they are
    // track-level tools reached from inside an editor, not applications that can be opened
    // against nothing. Putting them on a launcher would produce a tile that opens an error.
    // They stay where they work, on the editor's menus.

    return (async () => {

        const o = options || {};
        const cfg = () => ({ silent: true, user: getUser(), mode: 'editor' });

        // Navigation is the same for every tile: clear, push a real URL so the back button
        // and a reload both land on the application rather than back here, then run it. The
        // push happens BEFORE the exec because several editors rewrite the URL themselves
        // and would otherwise have their own entry overwritten a moment later.
        const open = (path, url, args) => createIonFunction(async () => {
            try { clear(); } catch (e) { }
            try { window.history.pushState({ app: path }, path, url || ('/app/' + path)); } catch (e) { }
            await exec.apply(null, [path].concat(args || []));
        });

        const GROUPS = [
            {
                name: 'Design',
                blurb: 'Three modalities over one sequence layer.',
                apps: [
                    {
                        label: 'Oligo Design',
                        description: 'Antisense, siRNA, steric-blocking and allele-selective compounds against a transcript, with per-residue chemistry and off-target screening.',
                        icon: 'icons/svg/oligo-design',
                        path: 'manchester/editor',
                        args: ['', { mode: 'editor' }]
                    },
                    {
                        label: 'Neoantigen Design',
                        description: 'Peptides a tumour’s mutations present on the patient’s own HLA, ranked through antigen processing and assembled into a cassette.',
                        icon: 'icons/svg/neoantigen-design',
                        path: 'liverpool/editor'
                    },
                    {
                        label: 'mRNA Design',
                        description: 'The transcript itself: codon choice, half-life engineering, cap and nucleoside chemistry, and self-amplifying architectures.',
                        icon: 'icons/svg/mrna-design',
                        path: 'tottenham/editor'
                    },
                    {
                        label: 'Assay Design',
                        description: 'The short path through the same problem: pick a target, get a compound set, without the full screening canvas.',
                        icon: 'icons/svg/assay-design',
                        path: 'manchester/assay-design'
                    }
                ]
            },
            {
                name: 'Explore',
                blurb: 'Reference material and the genome it all sits on.',
                apps: [
                    {
                        label: 'Chromosomes',
                        description: 'Every chromosome of a genome at one true scale. Load a VCF, filter genome-wide, then open a region as tracks in the editor.',
                        icon: 'icons/svg/chromosomes',
                        path: 'manchester/karyotype'
                    },
                    {
                        label: 'Library',
                        description: 'The RNA therapeutics reference shelf — chemistry and modality references, read in place.',
                        icon: 'icons/svg/library-shelf',
                        path: 'manchester/library'
                    }
                ]
            },
            {
                name: 'Programme',
                blurb: 'The work around the science.',
                apps: [
                    {
                        label: 'Project',
                        description: 'Development timelines, milestones, budget assumptions and capital models, built from plain-language descriptions.',
                        icon: 'icons/svg/programme',
                        path: 'cpd/baja-project',
                        args: ['', cfg(), '/app/cpd/baja-project']
                    },
                    {
                        label: 'Analytics',
                        description: 'Experimental data: tables with a formula engine, dose-response, plate layouts and mechanism figures.',
                        icon: 'icons/svg/analytics',
                        path: 'cpd/baja-analytics',
                        args: ['', cfg(), '/app/cpd/baja-analytics']
                    }
                ]
            }
        ];

        // An icon store that is unreachable must not cost the user their launcher. A tile
        // with no picture is still a working button; a row that threw is nothing at all.
        const rows = [];

        rows.push({
            'width': '100%',
            'component': {
                wid: 'html',
                data: '<div style="padding:16px 4px 2px;font-family:Arial,Helvetica,sans-serif;">'
                    + '<div style="font:600 11px Arial;letter-spacing:.14em;text-transform:uppercase;color:#5b7d86;">RNA Therapeutics</div>'
                    + '<div style="font:700 20px Arial;color:#12242c;margin-top:4px;">Applications</div>'
                    + '<div style="font:13px/1.5 Arial;color:#5b6b7a;margin-top:3px;max-width:74ch;">'
                    + 'Open one to start, or pick up saved work from your files below.</div></div>'
            }
        });

        for (const g of GROUPS) {
            const buttons = [];
            for (const a of g.apps) {
                let svg = null;
                try { svg = await exec(a.icon); } catch (e) { svg = null; }
                const b = {
                    label: a.label,
                    description: a.description,
                    ionfunction: open(a.path, a.url, a.args)
                };
                if (svg) b.svg = svg;
                buttons.push(b);
            }
            rows.push({
                'width': '100%',
                'component': {
                    wid: 'html',
                    data: '<div style="padding:14px 4px 0;font-family:Arial,Helvetica,sans-serif;">'
                        + '<span style="font:700 12px Arial;letter-spacing:.06em;text-transform:uppercase;color:#12242c;">'
                        + g.name + '</span>'
                        + '<span style="font:12.5px Arial;color:#7b8b96;margin-left:10px;">' + g.blurb + '</span></div>'
                }
            });
            rows.push({
                'width': '100%',
                'component': {
                    wid: 'radio-buttons',
                    data: {
                        description: '',
                        type: g.name,
                        unchecked: true,
                        button_size: (typeof o.button_size === 'number') ? o.button_size : 260,
                        buttons: buttons
                    }
                }
            });
        }

        rows.push({
            'width': '100%',
            'component': {
                wid: 'html',
                data: '<div style="padding:18px 4px 2px;font-family:Arial,Helvetica,sans-serif;">'
                    + '<hr style="border:0;border-top:1px solid #d8e0e4;margin:0 0 12px;">'
                    + '<div style="font:600 11px Arial;letter-spacing:.14em;text-transform:uppercase;color:#5b7d86;">Your files</div></div>'
            }
        });

        return {
            wid: 'card',
            width: '100%',
            componentRef: o.componentRef || 'applicationsRow',
            data: { cards: [rows] }
        };
    })();
}
