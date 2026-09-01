function (graph, genegraph_panel_layout, oligos) {

    // Cross-species check: does each compound also match MOUSE and RAT?
    //   exec('baja/manchester/menu/compound-cross-species.js', graph, layout, oligos)
    //
    // The question this answers is whether a compound designed against human can be used in the
    // animal models, which decides whether the tox and efficacy work can use the same molecule
    // or needs a surrogate. It is asked here at edit distance 0: a single mismatch is enough to
    // cost an oligo most of its activity, so "close" is not the same answer as "matches".
    //
    // Runs against the same indexes and the same endpoint as the off-target tool
    // (GET /genomes, POST /off-targets-file) rather than a species-specific service -- the
    // mouse_* and rat_* transcriptome indexes are already there.

    return (async () => {
        const list = (Array.isArray(oligos) ? oligos : []).filter(Boolean);
        if (!list.length) { try { graph.setMessage(' No compounds to check. '); } catch (e) { } return; }

        const server = (window['env'] && (window['env']['apiUrl'] || window['env']['offtarget'])) || '';
        const say = (m) => { try { graph.setMessage(m); } catch (e) { } };
        const status = (m) => {
            try {
                window.__workStatus = m || '';
                if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
            } catch (e) { }
        };

        // The species this asks about, and how their indexes are named. Matched on patterns
        // rather than exact names because the indexes are named by whoever built them
        // (mouse_cdna, rat_premrna, Macaca_mulatta…), and a new one should be picked up without
        // editing this list again.
        const SPECIES = [
            { key: 'mouse', label: 'mouse', re: /(^|[^a-z])(mouse|mus_?musculus|grcm)/i },
            { key: 'rat', label: 'rat', re: /(^|[^a-z])(rat|rattus|mratbn)/i },
            { key: 'dog', label: 'dog', re: /(^|[^a-z])(dog|canis|cfam|ros_?cfam)/i },
            { key: 'monkey', label: 'monkey', re: /(^|[^a-z])(monkey|macaca|macaque|rhesus|cyno|mmul)/i },
        ];

        // Which indexes actually exist. Asked rather than assumed, and -- importantly -- the
        // species with NO index are reported separately below. "No dog match" and "dog was never
        // searched" are different findings, and showing the second as the first would be a
        // fabricated negative.
        let names = [];
        try {
            const g = await GETJSON(server + '/genomes');
            names = Array.isArray(g) ? g.map((n) => '' + n) : Object.keys(g || {});
        } catch (e) { names = []; }

        const searched = [];      // species with at least one index
        const missing = [];       // species this server cannot answer for
        let genomes = [];
        for (const sp of SPECIES) {
            const idx = names.filter((n) => sp.re.test(n));
            if (idx.length) { searched.push(sp); genomes = genomes.concat(idx); }
            else missing.push(sp);
        }

        if (!genomes.length) {
            say(' None of mouse, rat, dog or monkey have an off-target index on this server, so cross-species cannot be checked. ');
            return;
        }

        const seqOf = (o) => ('' + ((o && (o.sequence || o.synthesisSequence)) || ''))
            .toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');

        const hits = [];
        let checked = 0;
        for (let i = 0; i < list.length; i++) {
            const o = list[i];
            const seq = seqOf(o);
            const name = '' + ((o && (o.name || o.id)) || ('compound ' + (i + 1)));
            if (seq.length < 12) continue;      // below the index minimum; a hit would be noise
            checked++;
            status('Cross-species · ' + name + ' (' + (i + 1) + ' of ' + list.length + ') · mouse + rat…');
            try {
                const r = await POSTJSON({
                    editDistance: 0,
                    strand: '+-',
                    genomes: genomes,
                    sequences: [seq],
                    runMode: 'summary'
                }, server + '/off-targets-file');
                // The response shape varies by runMode; count anything that looks like a hit
                // rather than assuming one field.
                let n = 0;
                try {
                    const raw = (r && (r.hits || r.results || r.matches)) || [];
                    const arr = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                    n = Array.isArray(arr) ? arr.length : 0;
                } catch (e) { n = 0; }
                const species = {};
                try {
                    const raw = (r && (r.hits || r.results || r.matches)) || [];
                    const arr = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                    for (const h of (Array.isArray(arr) ? arr : [])) {
                        const g = '' + ((h && (h.genome || h.index || h.db || h.chr)) || '');
                        for (const sp of searched) if (sp.re.test(g)) species[sp.key] = true;
                    }
                } catch (e) { }
                hits.push({ name: name, n: n, species: species });
                // Mark the compound so the answer is visible on the track, not only in a list.
                try { o.highlight__ = n ? '#22c55e' : false; } catch (e) { }
            } catch (e) {
                hits.push({ name: name, n: -1, species: {} });
            }
        }
        status('');
        try { if (graph.wake) graph.wake(); } catch (e) { }

        if (!checked) { say(' No compound had a sequence long enough to search (12 nt minimum). '); return; }

        const conserved = hits.filter((h) => h.n > 0);
        const failed = hits.filter((h) => h.n < 0);

        // Report as a list rather than a one-line summary: which compounds carry over is the
        // actual output, and it is what the next decision is made from.
        const namesOf = (h) => searched.filter((sp) => h.species && h.species[sp.key]).map((sp) => sp.label);
        const items = hits.map((h) => {
            const got = namesOf(h);
            return {
                label: h.name,
                sub: h.n < 0 ? 'search failed'
                    : (got.length ? got.join(' + ') : 'human only'),
                ref: h
            };
        });

        const searchedLabel = searched.map((sp) => sp.label).join(', ');
        // Named explicitly so the reader knows what the answer covers. A compound reported as
        // "human only" is only human-only among the species that were actually searched.
        const missingNote = missing.length
            ? ('  ·  not searched (no index): ' + missing.map((sp) => sp.label).join(', '))
            : '';
        try {
            await exec('baja/lib/pick-list.js', {
                title: 'Cross-species matches',
                subtitle: conserved.length + ' of ' + checked + ' match ' + searchedLabel
                    + (failed.length ? (' · ' + failed.length + ' failed') : '') + missingNote,
                items: items,
                onPick: () => { }
            });
        } catch (e) { }

        say(' Cross-species: ' + conserved.length + ' of ' + checked
            + ' compound' + (checked === 1 ? '' : 's') + ' also match ' + searchedLabel
            + ' at edit distance 0.' + (missing.length ? (' No index for ' + missing.map((sp) => sp.label).join(' or ') + ', so those were not checked.') : '') + ' ');
    })();
}
