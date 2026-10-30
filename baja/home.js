function () {

    // THE HOME SCREEN: three doors, and nothing else to read first.
    //
    //   Funds      start a campaign, or open one already running
    //   Design     the design and analysis tools
    //   My Files   the file browser, which is what this page used to be
    //
    // WHY THIS IS A PAGE AND NOT A STRIP ABOVE THE FILE LIST. It was that first: the
    // launcher was handed to manchester/fb.js as a header row. The browser's layout gives
    // that row almost no height and draws the file list over it, so all anyone ever saw of
    // it was about twenty pixels of white -- which is also why the nine-tile launcher that
    // lived there for months was invisible. Setting a height on the row did not move it.
    // A page of our own has no such argument with the layout, and the choice between
    // raising money and designing a drug is worth a screen anyway.
    //
    // My Files opens the browser exactly as it was, with no header passed to it.
    return (async () => {
        try { clear(); } catch (e) { }
        try { window.history.pushState({}, '', '/app/baja/init'); } catch (e) { }

        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const who = ('' + ((typeof getUser === 'function' ? getUser() : '') || '')).trim();

        // Everything that can be opened cold. Fundraising is not in here: it has a door.
        const APPS = [
            { label: 'Oligo Design', icon: 'icons/svg/oligo-design', path: 'manchester/editor', args: ['', { mode: 'editor' }],
              note: 'Antisense, siRNA, steric-blocking and allele-selective compounds against a transcript.' },
            { label: 'Neoantigen Design', icon: 'icons/svg/neoantigen-design', path: 'liverpool/editor',
              note: 'Peptides a tumour’s mutations present on the patient’s own HLA, assembled into a cassette.' },
            { label: 'mRNA Design', icon: 'icons/svg/mrna-design', path: 'tottenham/editor',
              note: 'The transcript itself: codon choice, half-life engineering, cap and nucleoside chemistry.' },
            { label: 'Assay Design', icon: 'icons/svg/assay-design', path: 'manchester/assay-design',
              note: 'The short path: pick a target, get a compound set, without the full screening canvas.' },
            { label: 'Genome Viewer', icon: 'icons/svg/chromosomes', path: 'manchester/karyotype',
              note: 'Every chromosome at one true scale. Load a VCF, then open a region as tracks.' },
            { label: 'Library', icon: 'icons/svg/library-shelf', path: 'manchester/library',
              note: 'The RNA therapeutics reference shelf, read in place.' },
            { label: 'Project', icon: 'icons/svg/programme', path: 'cpd/baja-project', args: ['', { silent: true, user: who, mode: 'editor' }, '/app/cpd/baja-project'],
              note: 'Development timelines, milestones and capital models from plain-language descriptions.' },
            { label: 'Analytics', icon: 'icons/svg/analytics', path: 'cpd/baja-analytics', args: ['', { silent: true, user: who, mode: 'editor' }, '/app/cpd/baja-analytics'],
              note: 'Experimental data: tables with a formula engine, dose-response and plate layouts.' },
            { label: 'Financial Modeling', icon: 'icons/svg/financial-modeling', path: 'cpd/baja-analytics', args: ['', { silent: true, user: who, mode: 'editor' }, '/app/cpd/baja-analytics'],
              note: 'Assumptions, profit-and-loss and capital models, with a formula engine and timelines.' },
        ];
        // An icon store that cannot be reached must not cost anyone the page.
        for (const a of APPS) { try { a.svg = await exec(a.icon); } catch (e) { a.svg = null; } }

        const open = async (path, url, args) => {
            try { clear(); } catch (e) { }
            try { if (url) window.history.pushState({}, '', url); } catch (e) { }
            try { await exec.apply(null, [path].concat(args || [])); }
            catch (e) { try { if (url) window.location.href = url; } catch (e2) { } }
        };

        const door = (k, label, line, accent) => '<button data-door="' + k + '" style="flex:1 1 260px;cursor:pointer;'
            + 'text-align:left;border:1px solid #cfdbe2;border-top:4px solid ' + accent + ';background:#fff;border-radius:14px;'
            + 'padding:20px 22px;box-shadow:0 3px 14px rgba(16,40,56,0.09);">'
            + '<div style="font:800 23px Arial;color:#12242c;">' + esc(label) + '</div>'
            + '<div style="font:13.5px Arial;color:#6b8793;margin-top:5px;">' + esc(line) + '</div></button>';

        const tile = (a, i) => '<button data-app="' + i + '" style="flex:1 1 300px;max-width:430px;cursor:pointer;text-align:left;'
            + 'display:flex;gap:12px;align-items:flex-start;border:1px solid #dbe4ea;background:#fff;border-radius:10px;padding:13px 15px;">'
            + (a.svg ? '<img src="' + esc(a.svg) + '" alt="" width="40" height="40" style="flex:0 0 auto;"/>' : '')
            + '<span style="min-width:0;"><span style="display:block;font:700 15px Arial;color:#12242c;">' + esc(a.label) + '</span>'
            + '<span style="display:block;font:12.5px/1.45 Arial;color:#6b8793;margin-top:2px;">' + esc(a.note) + '</span></span></button>';

        const FUNDS = '<div style="display:flex;gap:14px;flex-wrap:wrap;">'
            + '<button data-fund="new" style="flex:1 1 300px;cursor:pointer;text-align:left;border:1px solid #16a34a;'
            + 'background:#16a34a;color:#fff;border-radius:12px;padding:16px 18px;">'
            + '<span style="display:block;font:800 16px Arial;">Start a new campaign</span>'
            + '<span style="display:block;font:13px Arial;opacity:.93;margin-top:4px;">A total, a goal and a link to share. '
            + 'No charge to run it, and no share of what you raise.</span></button>'
            + '<button data-fund="mine" style="flex:1 1 300px;cursor:pointer;text-align:left;border:1px solid #cfdbe2;'
            + 'background:#fff;border-radius:12px;padding:16px 18px;">'
            + '<span style="display:block;font:800 16px Arial;color:#12242c;">Campaigns already running</span>'
            + '<span style="display:block;font:13px Arial;color:#6b8793;margin-top:4px;">Open one to edit it, see what it has '
            + 'raised, or pull in donations.</span></button></div>';

        const DESIGN = '<div style="display:flex;gap:12px;flex-wrap:wrap;">' + APPS.map(tile).join('') + '</div>';

        const ID = 'baja-home';
        const html = '<div id="' + ID + '" style="font-family:Arial,Helvetica,sans-serif;max-width:1180px;margin:0 auto;padding:26px 18px 40px;">'
            + '<div style="font:800 26px Arial;color:#12242c;">' + (who ? 'Welcome back' : 'Welcome') + '</div>'
            + '<div style="font:14px Arial;color:#6b8793;margin:6px 0 20px;">' + esc(who) + '</div>'
            + '<div style="display:flex;gap:14px;flex-wrap:wrap;">'
            + door('funds', 'Funds', 'Raise money for a rare disease', '#16a34a')
            + door('design', 'Design', 'The tools for designing a therapy', '#0f6e7a')
            + door('files', 'My Files', 'Everything you have saved', '#5b7d86')
            + '</div>'
            + '<div data-panel style="display:none;margin-top:18px;padding:18px;border:1px solid #e1e8ed;'
            + 'border-radius:14px;background:#f7fafc;"></div></div>';

        showWidget({
            wid: 'card', width: '100%', height: '100%',
            data: { cards: [[{ 'width': '100%', 'height': '100%', 'component': { wid: 'html', data: html } }]] }
        });

        // Wired once the framework has put it on the page. Polled because there is no
        // callback to hang this on, and given up on quietly after ten seconds: a home
        // screen with dead buttons is bad, but it still has the menus at the top of the
        // window, which open everything these doors do.
        const wire = () => {
            const root = document.getElementById(ID);
            if (!root) return false;
            const panel = root.querySelector('[data-panel]');
            let openDoor = '';
            const paint = () => {
                for (const b of root.querySelectorAll('[data-door]')) {
                    const on = b.getAttribute('data-door') === openDoor;
                    b.style.background = on ? '#eef6fb' : '#fff';
                    b.style.boxShadow = on ? '0 4px 18px rgba(16,40,56,0.16)' : '0 3px 14px rgba(16,40,56,0.09)';
                }
                panel.style.display = openDoor ? '' : 'none';
            };
            const wireInner = () => {
                for (const b of panel.querySelectorAll('[data-app]')) {
                    const a = APPS[+b.getAttribute('data-app')];
                    if (a) b.onclick = () => open(a.path, '/app/' + a.path, a.args);
                }
                const nw = panel.querySelector('[data-fund="new"]');
                if (nw) nw.onclick = () => open('fundraise/console', '/app/fundraise/console');
                const mine = panel.querySelector('[data-fund="mine"]');
                if (mine) mine.onclick = () => open('fundraise/admin', '/app/fundraise/admin');
            };
            for (const b of root.querySelectorAll('[data-door]')) {
                b.onclick = async () => {
                    const k = b.getAttribute('data-door');
                    // My Files is the file browser, which is a page of its own: this door
                    // goes there rather than opening a panel.
                    if (k === 'files') { await open('manchester/fb.js', '/app/baja/fb'); return; }
                    openDoor = (k === openDoor) ? '' : k;
                    panel.innerHTML = openDoor === 'funds' ? FUNDS : (openDoor === 'design' ? DESIGN : '');
                    paint();
                    if (openDoor) wireInner();
                };
            }
            paint();
            return true;
        };
        let tries = 0;
        const tick = () => { if (wire() || ++tries > 100) return; setTimeout(tick, 100); };
        setTimeout(tick, 0);
        return true;
    })();
}
