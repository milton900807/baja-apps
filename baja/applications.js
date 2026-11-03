function (options) {

    // THE HOME SCREEN'S THREE DOORS, as a widget: Funds, Design, My Files.
    //
    // It was a grid of nine application tiles above the file list, which asked a visitor to
    // read nine descriptions before doing anything, and buried the one thing a family
    // arriving at gene.clinic came for among eight tools for designing drugs. Three doors
    // ask one question instead:
    //
    //     Funds      start a campaign, or open one already running
    //     Design     the design and analysis tools, as the nine tiles
    //     My Files   the file list, which is the rest of this page
    //
    // My Files is not a panel. The file browser is ALREADY underneath this widget -- it is
    // the page -- so that door simply closes whatever panel is open and leaves the files
    // showing, which is also the state the page opens in.
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
                name: '_',
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
                        description: 'Peptides a tumor’s mutations present on the patient’s own HLA, ranked through antigen processing and assembled into a cassette.',
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
                        label: 'Genome Viewer',
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
                    },
                    {
                        label: 'Financial Modeling',
                        description: 'The table editor: assumptions, profit-and-loss and capital models built from plain-language descriptions, with a formula engine and timelines.',
                        icon: 'icons/svg/financial-modeling',
                        path: 'cpd/baja-analytics',
                        args: ['', cfg(), '/app/cpd/baja-analytics']
                    },
                    {
                        label: 'Fundraise Campaign',
                        description: 'A campaign total and a goal, on a public display the room can read. Enter gifts as they land and the screen moves on its own.',
                        icon: 'icons/svg/fundraise',
                        path: 'fundraise/console'
                    }
                ]
            }
        ];

        const rows = [];

        // Icons first: an icon store that is unreachable must not cost the user the page.
        // A tile with no picture is still a working button; a row that threw is nothing.
        const tiles = [];
        for (const g of GROUPS) {
            for (const a of g.apps) {
                // Fundraising has a door of its own now, so it is not also a tile behind
                // the Design one: the same thing in two places makes a visitor wonder
                // whether they are the same thing.
                if (a.path === 'fundraise/console') continue;
                let svg = null;
                try { svg = await exec(a.icon); } catch (e) { svg = null; }
                tiles.push({ app: a, group: g, svg: svg });
            }
        }

        // One html widget for the whole thing, wired up after it is mounted. The platform's
        // button widgets draw a grid of equals, and this needs three doors and a panel that
        // changes underneath them.
        const ID = 'baja-home-doors';
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const DOORS = [
            { key: 'funds', label: 'Funds', line: 'Raise money for a rare disease', accent: '#16a34a' },
            { key: 'design', label: 'Design', line: 'The tools for designing a therapy', accent: '#0f6e7a' },
            { key: 'files', label: 'My Files', line: 'Everything you have saved', accent: '#5b7d86' },
        ];
        const doorHtml = (d) => '<button data-door="' + d.key + '" style="flex:1 1 220px;cursor:pointer;text-align:left;'
            + 'border:1px solid #cfdbe2;border-left:5px solid ' + d.accent + ';background:#fff;border-radius:12px;'
            + 'padding:16px 18px;box-shadow:0 2px 10px rgba(16,40,56,0.07);">'
            + '<div style="font:800 19px Arial;color:#12242c;">' + esc(d.label) + '</div>'
            + '<div style="font:13px Arial;color:#6b8793;margin-top:3px;">' + esc(d.line) + '</div></button>';

        const tileHtml = (t) => '<button data-open="' + esc(t.app.path) + '" data-i="' + tiles.indexOf(t) + '" '
            + 'style="flex:1 1 300px;max-width:420px;cursor:pointer;text-align:left;display:flex;gap:12px;align-items:flex-start;'
            + 'border:1px solid #dbe4ea;background:#fff;border-radius:10px;padding:12px 14px;">'
            + (t.svg ? '<img src="' + esc(t.svg) + '" alt="" width="40" height="40" style="flex:0 0 auto;"/>' : '')
            + '<span style="min-width:0;"><span style="display:block;font:700 14.5px Arial;color:#12242c;">' + esc(t.app.label) + '</span>'
            + '<span style="display:block;font:12.5px/1.45 Arial;color:#6b8793;margin-top:2px;">' + esc(t.app.description) + '</span></span>'
            + '</button>';

        const fundsHtml = '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
            + '<button data-fund="new" style="flex:1 1 280px;cursor:pointer;text-align:left;border:1px solid #16a34a;'
            + 'background:#16a34a;color:#fff;border-radius:10px;padding:14px 16px;">'
            + '<span style="display:block;font:800 15px Arial;">Start a new campaign</span>'
            + '<span style="display:block;font:12.5px Arial;opacity:.92;margin-top:3px;">A total, a goal and a link to share. '
            + 'No charge, and no share of what you raise.</span></button>'
            + '<button data-fund="mine" style="flex:1 1 280px;cursor:pointer;text-align:left;border:1px solid #cfdbe2;'
            + 'background:#fff;border-radius:10px;padding:14px 16px;">'
            + '<span style="display:block;font:800 15px Arial;color:#12242c;">Campaigns already running</span>'
            + '<span style="display:block;font:12.5px Arial;color:#6b8793;margin-top:3px;">Open one to edit it, see what it has '
            + 'raised, or pull in donations.</span></button></div>';

        const designHtml = '<div style="display:flex;gap:12px;flex-wrap:wrap;">' + tiles.map(tileHtml).join('') + '</div>';

        rows.push({
            'width': '100%',
            'component': {
                wid: 'html',
                data: '<div id="' + ID + '" style="padding:10px 4px 2px;font-family:Arial,Helvetica,sans-serif;">'
                    + '<div style="display:flex;gap:12px;flex-wrap:nowrap;">' + DOORS.map(doorHtml).join('') + '</div>'
                    + '</div>'
            }
        });

        // The widget is rendered by the framework, so the handlers are attached once it is
        // actually on the page. Polled rather than assumed: the file browser mounts this
        // header as part of its own render and there is no callback to hang this on.
        const PANEL_ID = ID + '-panel';
        const wire = () => {
            const root = document.getElementById(ID);
            if (!root) return false;
            // THE PANEL IS NOT IN THE ROW. This header is one row of a layout that gives
            // each row a fixed height, and a panel that grows would be clipped by it or
            // drawn over by the file list below. So it is attached to the page itself and
            // positioned under the doors, like a menu, and the row's height never changes.
            try { const stale = document.getElementById(PANEL_ID); if (stale && stale.parentNode) stale.parentNode.removeChild(stale); } catch (e) { }
            const panel = document.createElement('div');
            panel.id = PANEL_ID;
            panel.style.cssText = 'position:fixed;z-index:2147482000;display:none;box-sizing:border-box;'
                + 'background:#f7fafc;border:1px solid #cfdbe2;border-radius:12px;padding:14px;'
                + 'box-shadow:0 18px 50px rgba(16,40,56,0.28);font-family:Arial,Helvetica,sans-serif;'
                + 'max-height:70vh;overflow:auto;';
            document.body.appendChild(panel);
            const place = () => {
                try {
                    const r = root.getBoundingClientRect();
                    panel.style.left = Math.max(8, r.left) + 'px';
                    panel.style.top = (r.bottom + 6) + 'px';
                    panel.style.width = Math.max(320, Math.min(r.width, window.innerWidth - 16)) + 'px';
                } catch (e) { }
            };
            let openDoor = '';
            const paint = () => {
                for (const b of root.querySelectorAll('[data-door]')) {
                    const on = b.getAttribute('data-door') === openDoor;
                    b.style.background = on ? '#eef6fb' : '#fff';
                    b.style.boxShadow = on ? '0 2px 14px rgba(16,40,56,0.14)' : '0 2px 10px rgba(16,40,56,0.07)';
                }
                panel.style.display = openDoor ? '' : 'none';
                if (openDoor) place();
            };
            const wireInner = () => {
                for (const b of panel.querySelectorAll('[data-open]')) {
                    const t = tiles[+b.getAttribute('data-i')];
                    if (t) b.onclick = () => open(t.app.path, t.app.url, t.app.args).__ion();
                }
                const nw = panel.querySelector('[data-fund="new"]');
                if (nw) nw.onclick = () => open('fundraise/console', '/app/fundraise/console').__ion();
                const mine = panel.querySelector('[data-fund="mine"]');
                if (mine) mine.onclick = () => open('fundraise/admin', '/app/fundraise/admin').__ion();
            };
            for (const b of root.querySelectorAll('[data-door]')) {
                b.onclick = () => {
                    const k = b.getAttribute('data-door');
                    // My Files is the page itself, so its door closes the panel rather than
                    // filling it, and pressing an open door closes it again.
                    openDoor = (k === 'files' || k === openDoor) ? '' : k;
                    panel.innerHTML = openDoor === 'funds' ? fundsHtml : (openDoor === 'design' ? designHtml : '');
                    paint();
                    if (openDoor) wireInner();
                };
            }
            // A panel pinned to the page has to follow the page: reposition while it is
            // open, and close it when the user's attention goes elsewhere.
            const follow = () => { if (openDoor) place(); };
            try {
                window.addEventListener('resize', follow);
                window.addEventListener('scroll', follow, true);
                document.addEventListener('keydown', (e) => {
                    if (e && e.key === 'Escape' && openDoor) { openDoor = ''; paint(); }
                }, true);
                document.addEventListener('mousedown', (e) => {
                    if (!openDoor) return;
                    const t = e && e.target;
                    if (panel.contains(t) || root.contains(t)) return;
                    openDoor = ''; paint();
                }, true);
            } catch (e) { }
            paint();
            return true;
        };
        // Up to ten seconds, then give up quietly: the three doors would be dead, but the
        // file list under them is untouched and the menus still open everything.
        let tries = 0;
        const tick = () => { if (wire() || ++tries > 100) return; setTimeout(tick, 100); };
        setTimeout(tick, 0);

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
            // Read by manchester/fb.js, which reserves this much room for the header rather
            // than laying the file list over it.
            headerHeight: 104,
            componentRef: o.componentRef || 'applicationsRow',
            data: { cards: [rows] }
        };
    })();
}
