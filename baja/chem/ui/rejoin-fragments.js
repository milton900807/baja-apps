function () {
    // JOINING TWO ABUTTING COMPOUNDS BACK INTO ONE.
    //   const RJ = await exec('baja/chem/ui/rejoin-fragments.js');
    //   RJ.neighboursOf(graph, oligo, track)   -> [{ other, side }]   side = end of `oligo`
    //   RJ.rejoin(graph, oligo, other, side, track)  -> { ok, note } | { ok:false, error }
    //
    // One implementation, used by both the per-part chemistry menu and the compound menu.
    // It was written inline in the chemistry editor first; a second copy in the compound
    // menu would be two things to keep in step, and the bug that follows is the two
    // disagreeing about the join.
    //
    // `side` is which END OF `oligo` the other fragment sits on, and it decides the order
    // the monomer lists are concatenated in. Getting it backwards silently reverses the
    // molecule, which is the one mistake here that produces a plausible-looking wrong
    // answer rather than an error.
    const splitStructure = (structure) => {
        const s = '' + (structure || '');
        const open = s.indexOf('{');
        const close = open >= 0 ? s.indexOf('}', open) : -1;
        if (open < 0 || close < 0) return { head: 'RNA1{', body: s, tail: '}$$$$' };
        return { head: s.slice(0, open + 1), body: s.slice(open + 1, close), tail: s.slice(close) };
    };
    const parseUnits = (body) => {
        const out = [];
        for (const unit of ('' + (body || '')).split('.')) {
            const u = unit.trim();
            if (!u) continue;
            const m = u.match(/\[?([A-Za-z0-9\-]+)\]?\s*\(([^)]+)\)\s*(?:\[([^\]]+)\]|([A-Za-z0-9]+))?/);
            if (m) out.push({ sugar: ('' + (m[1] || '')).toLowerCase(), base: ('' + (m[2] || '')).toUpperCase(), linkage: ('' + (m[3] || m[4] || '')).toLowerCase() });
            else { const b = u.replace(/[^A-Za-z]/g, '').toUpperCase(); out.push({ sugar: '', base: b ? b[0] : '?', linkage: '' }); }
        }
        return out;
    };
    // Bracket a symbol iff it is longer than one character — the HELM rule.
    const tok = (sym) => (('' + sym).length > 1 ? '[' + sym + ']' : ('' + sym));
    const buildBody = (monos) => monos.map((m) => {
        const sug = m.sugar ? tok(m.sugar) : 'd';
        return sug + '(' + (m.base || 'N') + ')' + (m.linkage ? tok(m.linkage) : '');
    }).join('.');

    const monosOf = (o) => {
        const g = o && o.__chemGeom;
        if (g && Array.isArray(g.monos) && g.monos.length) {
            return g.monos.map((m) => ({ sugar: m.sugar || 'd', base: m.base || 'N', linkage: m.linkage || '' }));
        }
        return parseUnits(splitStructure(o && o.structure).body);
    };

    const PRETTY = { d: 'DNA', r: 'RNA', moe: "2'-MOE", m: "2'-OMe", ome: "2'-OMe", f: "2'-F", fana: "2'-F", fl2r: "2'-F", lna: 'LNA', cet: 'cEt', ena: 'ENA', pmo: 'PMO' };
    // Rebuild every field that claims to describe the chemistry, from the one monomer list,
    // so none of them can drift from the HELM.
    const writeBack = (oligo, monos, parts) => {
        const n = monos.length;
        oligo.structure = parts.head + buildBody(monos) + parts.tail;
        oligo.helm = oligo.structure;
        oligo.chemistryLayout = monos.map((m, k) => ({
            position: k, base: m.base,
            region: (oligo.chemistryLayout && oligo.chemistryLayout[k] && oligo.chemistryLayout[k].region) || null,
            sugar: PRETTY[m.sugar] || ('' + (m.sugar || '')).toUpperCase(),
            backbone_to_next: k < n - 1 ? ((m.linkage === 'p' || m.linkage === 'po') ? 'PO' : (m.linkage ? 'PS' : null)) : null,
        }));
        oligo.backbonePattern = monos.slice(0, n - 1).map((m) => ((m.linkage === 'p' || m.linkage === 'po') ? 'O' : 'S'));
        // The gap/wing summary only means anything for a clean wing–gap–wing layout; a join
        // can easily produce something that is not one, and a stale summary would state a
        // chemistry the molecule does not have.
        const sugars = monos.map((m) => m.sugar);
        const run = [];
        for (let k = 0; k < n; k++) if (sugars[k] === 'd' || sugars[k] === 'dna') run.push(k);
        const contiguous = run.length > 0 && (run[run.length - 1] - run[0] + 1) === run.length;
        if (contiguous && run[0] > 0 && run[run.length - 1] < n - 1) {
            oligo.gapStart = run[0]; oligo.gapEnd = run[run.length - 1]; oligo.gapSize = run.length;
            oligo.leftWingSize = run[0]; oligo.rightWingSize = n - 1 - run[run.length - 1];
            const wings = sugars.slice(0, run[0]).concat(sugars.slice(run[run.length - 1] + 1));
            const uniform = wings.length && wings.every((w) => w === wings[0]);
            oligo.wingModification = uniform ? (PRETTY[wings[0]] || wings[0]) : null;
        } else {
            oligo.gapStart = null; oligo.gapEnd = null; oligo.gapSize = null;
            oligo.leftWingSize = null; oligo.rightWingSize = null; oligo.wingModification = null;
        }
        oligo.__chemistryEdited = true;
    };

    const trackOf = (graph, oligo, track) => {
        if (track) return track;
        try {
            for (const t of ((graph && graph.track) || [])) {
                if (t && Array.isArray(t.oligos) && t.oligos.indexOf(oligo) >= 0) return t;
            }
        } catch (e) { }
        return (graph && graph.selectedTrack) || null;
    };

    return {
        // Compounds that start where this one ends, or end where it starts, on the same
        // track. Tolerance is half a residue: fragments cut from one chain share an exact
        // coordinate, and half a residue is far too small to reach the next compound along.
        neighboursOf: (graph, oligo, track) => {
            const out = [];
            try {
                const t = trackOf(graph, oligo, track);
                const n = Math.max(1, monosOf(oligo).length);
                const w = Math.abs((+oligo.xf) - (+oligo.xi)) / n;
                const tol = (isFinite(w) && w > 0 ? w : 1) * 0.5;
                for (const o of ((t && t.oligos) || [])) {
                    if (!o || o === oligo || !o.structure) continue;
                    if (Math.abs((+o.xi) - (+oligo.xf)) <= tol) out.push({ other: o, side: '3' });
                    else if (Math.abs((+oligo.xi) - (+o.xf)) <= tol) out.push({ other: o, side: '5' });
                }
            } catch (e) { }
            return out;
        },

        rejoin: (graph, oligo, other, side, track) => {
            try {
                if (!oligo || !other) return { ok: false, error: 'nothing to join' };
                const mine = monosOf(oligo), theirs = monosOf(other);
                if (!mine.length || !theirs.length) return { ok: false, error: 'a fragment has no chemistry to join' };
                const first = (side === '3') ? mine : theirs;
                const second = (side === '3') ? theirs : mine;
                // The bond being restored. Neither fragment carries it — that is what being
                // cut means — so take it from the chemistry either side of the join, and
                // fall back to phosphorothioate, which is what these compounds mostly are.
                const joinLink = (first.length > 1 && first[first.length - 2].linkage)
                    || (second.length > 1 && second[0].linkage) || 'sp';
                first[first.length - 1].linkage = joinLink;
                const joined = first.concat(second);

                const t = trackOf(graph, oligo, track);
                // Remove the other fragment FIRST: leaving it would draw the same residues
                // twice, so a join that cannot remove it is not a join and must not happen.
                if (!t || !t.removeOligo) return { ok: false, error: 'no track to remove the other fragment from' };
                const before = (t.oligos || []).length;
                t.removeOligo(other);
                if ((t.oligos || []).length === before) return { ok: false, error: 'could not remove the other fragment' };

                const parts = splitStructure(oligo.structure);
                oligo.xi = Math.min(+oligo.xi, +other.xi);
                oligo.xf = Math.max(+oligo.xf, +other.xf);
                const seq = joined.map((x) => x.base || 'N').join('');
                oligo.synthesisSequence = seq;
                if (oligo.sequence != null) oligo.sequence = seq;
                oligo.name = ('' + (oligo.name || 'compound')).replace(/\s*\((?:5′|3′) part\)\s*$/, '');
                // Both fragments' results described a different molecule from this one.
                oligo.offtarget = null; oligo.offtargetsRun = false;
                oligo.__chemSel = null;
                writeBack(oligo, joined, parts);
                try { if (graph && graph.wake) graph.wake(); } catch (e) { }
                return { ok: true, residues: joined.length, linkage: joinLink };
            } catch (e) {
                return { ok: false, error: (e && e.message) ? e.message : ('' + e) };
            }
        },
    };
}
