function (graph, genegraph_panel_layout, selectedTrack) {
    // Edit-snps sub-menu: Filter | Download | Add snps  (for the given track).
    const track = selectedTrack;

    // Download the track's SNPs (respecting the current filter — hidden SNPs are left
    // out) as a CSV so a filter -> download workflow yields just the matching set.
    const downloadSnps = () => {
        const snps = ((track && track.snpindels) || []).filter((s) => s && !s.hidden);
        if (!snps.length) { graph.setMessage(' No SNPs to download on this track. '); return; }
        const esc = (c) => { c = (c == null ? '' : '' + c); return (/[",\n]/.test(c)) ? '"' + c.replace(/"/g, '""') + '"' : c; };
        const rows = [['id', 'type', 'chr', 'pos', 'ref', 'alt', 'clinsig', 'source', 'af', 'consequence']];
        for (const s of snps) {
            rows.push([
                s.name || s.id || '', s.type || '', track.chr || '', Math.round(s.xi),
                s.reference || '', s.alternate || '', (s.clinsig || '').replace(/,/g, '; '),
                s.source || '', (s.af != null ? s.af : ''), (s.structure || s.consequence || '')
            ]);
        }
        const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
        const safe = ('' + (track.name || 'track')).replace(/[^A-Za-z0-9._-]+/g, '_');
        try {
            downloadAsText(csv, safe + '_snps.csv');
            graph.setMessage(' Downloaded ' + snps.length + ' SNP' + (snps.length === 1 ? '' : 's') + ' as ' + safe + '_snps.csv. ');
        } catch (e) { graph.setMessage(' Download failed: ' + e + ' '); }
    };

    graph.showMenu([
        {
            label: 'Filter', move: () => { }, click: () => {
                // Cascading filter menus (Type / Source / Clinical significance / Consequence /
                // Allele frequency), each listing the distinct values present with counts.
                exec('baja/manchester/menu/edit-snps-filter-menu.js', graph, genegraph_panel_layout, track);
            }
        },
        {
            label: 'Download', move: () => { }, click: () => {
                if (graph.hideMenu) graph.hideMenu();
                downloadSnps();
            }
        },
        {
            label: 'Add snps', move: () => { }, click: () => {
                if (graph.hideMenu) graph.hideMenu();
                // Description prompt -> Claude resolves the variant -> loads the first match
                // onto the track(s) it fits (or reports that none was found).
                exec('baja/data/prompt-variant.js', window['env']['apiUrl'], graph, genegraph_panel_layout);
            }
        }
    ]);
}
