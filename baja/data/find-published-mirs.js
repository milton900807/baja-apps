function (graph, genegraph_panel_layout, targetTrack) {

    // FIND PUBLISHED miRNAs FOR THIS TRANSCRIPT, AND SAY WHAT IS KNOWN ABOUT THEM.
    //   exec('baja/data/find-published-mirs.js', graph, genegraph_panel_layout, track);
    //
    // Two halves, and which half does what is the whole design:
    //
    //   miRTarBase 10 says WHICH miRNAs are reported against this transcript, where their
    //   sites are, what evidence type each rests on and which PMIDs are behind it. That is
    //   measured data, read over the selected sequence when there is one and over the whole
    //   transcript when there is not.
    //
    //   The model says WHAT IS PUBLISHED about each pair -- what the miRNA does to this gene,
    //   in what tissue, how well established it is. It is given the list and writes about the
    //   entries in it by index; it supplies no miRNA, no site and no sequence.
    //
    // THE REASON FOR THAT LINE. A seed sequence or a target position recalled by a model and
    // drawn on a track is indistinguishable, once drawn, from one that was measured. So
    // nothing reaches the track from the model: the sites come from the dataset, through the
    // loader that already draws them correctly, and the model's contribution stays as text
    // beside the row it belongs to. What it names and the data does not have is shown in its
    // own section, labelled as a recollection to go and check.
    return (async () => {
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const result = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        const H = (s) => ('' + (s == null ? '' : s))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const track = targetTrack;
        if (!track) { say('Click a track first.'); return 0; }

        const SETS = await exec('baja/data/layer-sets.js');
        const CFG = SETS.mirtarbase10_strong;
        const ALL = SETS.mirtarbase10_all;
        if (!CFG) { say('The miRNA site dataset is not configured on this deployment.'); return 0; }

        // The same window bed-hits.js would ask for, worked out the same way: the selected
        // range in transcript coordinates when there is one, the whole transcript otherwise.
        // Kept identical on purpose -- the sites this lists and the sites the Add button
        // draws have to be the same sites, and two ways of deciding the window is how they
        // would come to differ.
        const tid = track.transcriptID || track.geneID || track.name || '';
        if (!tid) { say('That track has no transcript id to look up.'); return 0; }
        const seqLen = (track.sequence && track.sequence.length) || Math.abs(track.xf - track.xi);
        let t0 = 0, t1 = seqLen;
        const sel = (track.selectedRange && track.selectedRange()) || null;
        if (sel) {
            t0 = Math.max(0, Math.floor(sel.start - track.xi));
            t1 = Math.max(t0, Math.ceil(sel.end - track.xi));
        }
        const strand = '' + (track.strand != null ? track.strand : 1);
        const server = window['env']['apiUrl'];

        const read = async (cfg) => {
            const em = new EngineMonitor((m) => { try { log(m); say('' + m); } catch (e) { } });
            const res = await exec(server + '/py/data/read-bed-region.py', em, cfg.bed,
                '' + tid, '' + t0, '' + t1, strand, cfg.meta || '');
            let rv = [];
            try { rv = JSON.parse((res && res.values) || '[]'); } catch (e) { rv = []; }
            return rv;
        };

        say('Reading reported miRNA sites for ' + tid + '…');
        let rows = [];
        let usedSet = CFG;
        try { rows = await read(CFG); } catch (e) { rows = []; }
        // Fall back to the broader set rather than reporting nothing: "no strong-evidence
        // site in this window" and "no reported site at all" are different answers, and the
        // second one is the one that means stop looking.
        let fellBack = false;
        if (!rows.length && ALL) {
            try { rows = await read(ALL); usedSet = ALL; fellBack = rows.length > 0; } catch (e) { }
        }
        if (!rows.length) {
            result('No miRNA sites are reported for ' + tid
                + (sel ? ' in the selected sequence' : '') + ' in miRTarBase 10.');
            return 0;
        }

        // Pack: miRNA | Target gene | Evidence | Assays | PMIDs | miRTarBase
        const FIELDS = usedSet.fields || [];
        const idx = (re) => { for (let i = 0; i < FIELDS.length; i++) { if (re.test('' + FIELDS[i])) return i; } return -1; };
        const I_MI = Math.max(0, idx(/mirna/i)), I_EV = idx(/evidence/i), I_PM = idx(/pmid/i);

        const byMi = new Map();
        for (const v of rows) {
            if (!v) continue;
            const parts = ('' + (v[2] || '')).split('|');
            const name = ('' + (parts[I_MI] || '')).trim();
            if (!name) continue;
            if (!byMi.has(name)) byMi.set(name, { name: name, sites: 0, ev: new Set(), pm: new Set() });
            const e = byMi.get(name);
            e.sites++;
            const ev = (I_EV >= 0 ? ('' + (parts[I_EV] || '')).trim() : '');
            if (ev) for (const x of ev.split(/[;,/]+/)) { const y = x.trim(); if (y) e.ev.add(y); }
            const pm = (I_PM >= 0 ? ('' + (parts[I_PM] || '')).trim() : '');
            if (pm) for (const x of pm.split(/[^0-9]+/)) { if (x && x.length >= 5) e.pm.add(x); }
        }
        // Most evidence first: the question is which of these to read about, and a list in
        // alphabetical order answers a different one.
        const mirs = Array.from(byMi.values()).sort((a, b) =>
            (b.pm.size - a.pm.size) || (b.sites - a.sites) || a.name.localeCompare(b.name));

        const gene = track.geneID || track.name || tid;
        const payload = mirs.slice(0, 120).map((m, i) => ({
            i: i, mirna: m.name, sites: m.sites,
            evidence: Array.from(m.ev).slice(0, 6), pmids: m.pm.size
        }));

        say('Reading what is published about ' + mirs.length + ' miRNA' + (mirs.length === 1 ? '' : 's') + '…');
        let r = null;
        try {
            const em = new EngineMonitor((m) => { try { log(m); say('' + m); } catch (e) { } });
            r = await exec(server + '/py/bio/mirna/published-mirs.py', em, '' + gene,
                JSON.stringify(payload),
                JSON.stringify({ transcript: tid, selected: !!sel, length: t1 - t0, set: usedSet.label }), '');
        } catch (e) { r = null; }

        const parse = (v, d) => {
            if (v == null) return d;
            if (typeof v !== 'string') return v;
            try { return JSON.parse(v); } catch (e) { return d; }
        };
        const findings = (r && r.status === 'OK') ? (parse(r.findings, []) || []) : [];
        const missing = (r && r.status === 'OK') ? (parse(r.missing, []) || []) : [];
        const byIndex = new Map();
        for (const f of findings) byIndex.set(f.i, f);
        const readFailed = !r || r.status !== 'OK';

        // ------------------------------------------------------------------ the panel -----
        return new Promise((resolve) => {
            try { const old = document.getElementById('baja-published-mirs'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
            const panel = document.createElement('div');
            panel.id = 'baja-published-mirs';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            const btn = 'cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;';

            const SCOL = { established: '#86efac', reported: '#7fb0e8', weak: '#fbbf24', unknown: '#9fb3c8' };
            const SLAB = { established: 'established', reported: 'reported', weak: 'treat with care', unknown: 'not known to it' };

            const row = (m, i) => {
                const f = byIndex.get(i);
                const pm = Array.from(m.pm).slice(0, 6);
                const st = (f && f.strength) || 'unknown';
                return '<div style="padding:11px 13px;margin-bottom:7px;border-radius:9px;background:#0a1e3a;'
                    + 'border:1px solid rgba(255,255,255,0.12);">'
                    + '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">'
                    + '<div style="font:700 13.5px Arial;color:#e8f0fb;">' + H(m.name) + '</div>'
                    + '<div style="font:700 11px Arial;color:' + (SCOL[st] || '#9fb3c8') + ';">' + H(SLAB[st] || st) + '</div>'
                    + '<div style="font:11.5px Arial;color:#6b8299;">'
                    + m.sites + ' site' + (m.sites === 1 ? '' : 's')
                    + (m.pm.size ? (' · ' + m.pm.size + ' PMID' + (m.pm.size === 1 ? '' : 's')) : '')
                    + (m.ev.size ? (' · ' + H(Array.from(m.ev).slice(0, 3).join(', '))) : '')
                    + '</div></div>'
                    + (f && f.finding ? '<div style="font:12.5px Arial;color:#cfe0f2;margin-top:5px;line-height:1.65;">'
                        + H(f.finding) + '</div>' : '')
                    + (f && f.context ? '<div style="font:11.5px Arial;color:#9fb3c8;margin-top:3px;">'
                        + H(f.context) + '</div>' : '')
                    + (pm.length ? ('<div style="font:11.5px Arial;margin-top:5px;">'
                        + pm.map((p) => '<a href="https://pubmed.ncbi.nlm.nih.gov/' + H(p) + '/" target="_blank" '
                            + 'style="color:#7fb0e8;margin-right:9px;">PMID ' + H(p) + '</a>').join('')
                        + '</div>') : '')
                    + '</div>';
            };

            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);">'
                + '<div style="min-width:0;"><div style="font:700 20px Arial;">Published miRNAs for ' + H(gene) + '</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + mirs.length + ' reported in ' + H(usedSet.label)
                + (sel ? (' over the selected ' + (t1 - t0).toLocaleString() + ' nt')
                    : ' over the whole transcript')
                + (fellBack ? ' · nothing in the strong-evidence set here, so this is the broader one' : '')
                + '</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + '<button id="pm-add" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Add these sites to the track</button>'
                + '<button id="pm-close" style="' + btn + '">Close</button>'
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:20px 22px 32px;">'
                + '<div style="width:100%;max-width:860px;margin:0 auto;">'
                + (readFailed
                    ? '<div style="font:12.5px Arial;color:#fbbf24;margin-bottom:14px;">'
                        + 'The sites below are from miRTarBase. What is published about each could not be '
                        + 'read just now' + (r && r.error ? (': ' + H(r.error)) : '.') + '</div>'
                    : (r.summary ? '<div style="font:13px Arial;color:#cfe0f2;line-height:1.7;margin-bottom:16px;'
                        + 'padding:12px 14px;background:#0a1e3a;border-radius:9px;'
                        + 'border:1px solid rgba(255,255,255,0.12);">' + H(r.summary) + '</div>' : ''))
                + mirs.map(row).join('')
                + (missing.length
                    ? ('<div style="margin-top:20px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.12);">'
                        + '<div style="font:700 12px Arial;color:#fbbf24;letter-spacing:0.3px;">'
                        + 'NAMED BUT NOT IN THIS DATASET — nothing here measured these</div>'
                        + '<div style="font:11.5px Arial;color:#9fb3c8;margin:5px 0 10px;line-height:1.65;">'
                        + 'The model recalls these as published against ' + H(gene) + '. miRTarBase is keyed by '
                        + 'transcript, so a real interaction can be absent because its site falls outside this '
                        + 'transcript or outside the selection — and a recollection can simply be wrong. '
                        + 'Neither is drawn on the track.</div>'
                        + missing.map((m) => '<div style="padding:9px 11px;margin-bottom:6px;border-radius:9px;'
                            + 'background:#0a1e3a;border:1px dashed rgba(251,191,36,0.4);">'
                            + '<div style="font:700 12.5px Arial;color:#fcd34d;">' + H(m.mirna) + '</div>'
                            + (m.why ? '<div style="font:11.5px Arial;color:#9fb3c8;margin-top:3px;line-height:1.6;">'
                                + H(m.why) + '</div>' : '') + '</div>').join('')
                        + '</div>')
                    : '')
                + '</div></div>';
            document.body.appendChild(panel);

            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            const done = (n) => { close(); resolve(n || 0); };
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(0); });
            panel.querySelector('#pm-close').onclick = () => done(0);
            panel.querySelector('#pm-add').onclick = async () => {
                // THE EXISTING LOADER, not a second way of drawing the same thing. It folds
                // transcript coordinates back through the exons, splits at intron boundaries
                // and lane-packs the result; a copy of that here would be a second mapping to
                // keep right, and the sites drawn would be the ones it got wrong.
                done(mirs.length);
                try { await exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, usedSet, [track]); }
                catch (e) { result('Could not add the sites: ' + e); }
            };
        });
    })();
}
