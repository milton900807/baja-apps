function (opts) {

    // THE RATIO SHIFT MODEL: PUSHING TWO MESSAGES IN OPPOSITE DIRECTIONS WITH BLOCKERS.
    //   const R = await exec('baja/bio/expression/ratio-shift-model.js',
    //                        { up: trackA, down: trackB, top: 8 });
    //
    // The question it answers is one about a PAIR, not about a transcript: can the ratio of
    // what these two make be moved, by relieving repression on one and taking local
    // translation away from the other, using steric blockers that change no sequence.
    //
    //   UP ARM    sites where something sits to hold the message down -- a microRNA seed
    //             match, a 3' UTR translational repressor -- so a blocker over the site
    //             should de-repress. More protein from the same message.
    //   DOWN ARM  sites for the proteins that carry a message out and translate it where it
    //             arrives -- transport granule components and local initiation factors -- so
    //             a blocker should leave the message in the soma. Less protein WHERE IT WAS
    //             GOING, which is not the same as less protein.
    //
    // THE WHOLE THING TURNS ON SELECTIVITY, and that is why this is a pair model rather than
    // two runs of a single-track tool. Paralogues are what anyone asks this of -- DNM1 and
    // DNM3, STMN2 and STMN3 -- and a 20-mer blocker drawn over a site in one 3' UTR that
    // also matches the other one moves both ends of the ratio the same way, which is the one
    // outcome the design is for. Every candidate here is therefore checked against the other
    // transcript, base by base, and a site that cannot be blocked selectively is reported as
    // such rather than quietly ranked below the rest.
    //
    // WHAT IT IS NOT. No reads, no expression data, no measurement of either message, and
    // nothing here says a site is used. A microRNA site matters only where that microRNA is
    // expressed; a BajaCLIP site is a sequence the model ranks highly for one protein among
    // its other heads, not an occupied site; and the microRNA set scanned is the small
    // de-targeting list rather than a catalogue, so the microRNA that actually represses a
    // given message will usually not be in it. The output is a shortlist to test, and the
    // caller is expected to say so where it is read.

    return (async () => {
        const o = opts || {};
        const up = o.up, down = o.down;
        const TOP = (o.top != null) ? Math.max(1, Math.min(25, +o.top)) : 8;
        const FOOT = (o.footprint != null) ? Math.max(12, Math.min(30, +o.footprint)) : 20;
        // How many mismatches over the footprint still count as "would bind the other one
        // too". A steric blocker tolerates a mismatch or two and keeps working, so the
        // cut-off is deliberately generous: being wrong in this direction loses a candidate,
        // being wrong in the other direction designs a blocker that hits both messages.
        const SAFE = (o.mismatches != null) ? Math.max(1, Math.min(8, +o.mismatches)) : 4;

        const fail = (reason) => ({ ok: false, reason: reason });
        if (!up || !down) return fail('The ratio shift model takes two tracks: one to raise and one to lower.');
        if (up === down) return fail('The two tracks are the same track, so there is no ratio to shift.');

        // ---- each track as its MESSAGE ----------------------------------------------------
        // Sites are features of the message. The track holds the genomic plus strand, so on a
        // minus-strand gene the message is its reverse complement: scanning the stored strand
        // finds sites that do not exist and misses the ones that do. mirna-sites.js does this
        // already; baja/bio/rbp/rbp-profile.js does NOT, and sends the stored strand whatever
        // the gene, which is worth knowing when comparing its layers with these positions.
        const RC = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
        const messageOf = (t) => {
            const lo = Math.floor(+t.xi), hi = Math.floor(+t.xf);
            let plus = '';
            try { plus = ('' + (t.sequence || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, ''); }
            catch (e) { plus = ''; }
            const minus = (+(t.strand || 0) < 0);
            const L = plus.length;
            const seq = minus ? plus.split('').reverse().map((b) => RC[b] || 'N').join('') : plus;
            return {
                track: t, name: t.name || 'track', seq: seq, length: L, minus: minus, lo: lo, hi: hi,
                // message [s,e) -> track [a,b]. On a minus-strand gene the END of a site is
                // the LOWER track coordinate.
                back: (s, e) => (minus ? [lo + (L - e), lo + (L - s) - 1] : [lo + s, lo + e - 1])
            };
        };
        const U = messageOf(up), D = messageOf(down);
        for (const m of [U, D]) {
            if (m.seq.length < 40) {
                return fail(m.name + ' has ' + m.seq.length + ' nt of sequence loaded, which is too '
                    + 'short to look for blocker sites in. Load the transcript, or cut the UTR from a '
                    + 'track that has its sequence.');
            }
        }

        // ---- what each protein would be blocked FOR ---------------------------------------
        // Only proteins BajaCLIP has a reliable head for can appear at all, so this table is
        // the intersection of two things: what the model can score, and what blocking would
        // mean for the arm it sits in. The role is what makes a site a candidate, and it is
        // written down here rather than inferred, because "an RBP binds here" is not a reason
        // to block anything.
        const ROLE = {
            // Repression of translation from the 3' UTR: blocking these should RAISE output.
            PUM1:    { arm: 'up', role: 'translational repressor', what: 'Pumilio represses from the 3’ UTR; a blocker over its site should de-repress' },
            FMR1:    { arm: 'both', role: 'repressor and transport granule', what: 'FMRP both silences a message and carries it; blocking the site can raise local output or strand the message, and which one wins is not predictable from sequence' },
            FXR2:    { arm: 'both', role: 'repressor and transport granule', what: 'the FMRP paralogue, in the same granules and with the same ambiguity' },
            PCBP1:   { arm: 'up', role: 'stability and translation', what: 'poly(C)-binding protein; generally stabilising, so blocking it is as likely to lower output as raise it' },
            // Transport, granules and local initiation: blocking these should lower what is
            // made AWAY FROM THE SOMA.
            TARDBP:  { arm: 'down', role: 'axonal transport granule', what: 'TDP-43 carries messages into the axon; a blocker over its site should keep this one in the soma' },
            FUS:     { arm: 'down', role: 'dendritic transport granule', what: 'FUS travels in transport granules to dendrites and synapses' },
            EWSR1:   { arm: 'down', role: 'FET family granule', what: 'the same family as FUS, in the same granules' },
            KHDRBS1: { arm: 'down', role: 'neuronal granule (Sam68)', what: 'Sam68 granules carry messages into dendrites' },
            DDX3X:   { arm: 'down', role: 'granule helicase, translation', what: 'stress and transport granules, and initiation on structured leaders' },
            EIF4G2:  { arm: 'down', role: 'local initiation scaffold', what: 'DAP5 initiates translation away from the cap, which is much of what local translation uses' },
            EIF4E:   { arm: 'down', role: 'cap-binding initiation', what: 'blocking it lowers translation wherever the message is, not only where it was going' }
        };
        const UP_RBPS = Object.keys(ROLE).filter((k) => ROLE[k].arm === 'up' || ROLE[k].arm === 'both');
        const DOWN_RBPS = Object.keys(ROLE).filter((k) => ROLE[k].arm === 'down' || ROLE[k].arm === 'both');

        // ---- the two scans ----------------------------------------------------------------
        const M = await exec('baja/bio/mirna/mirna-seeds.js');

        const rbpSites = async (m, names) => {
            // xi is sent as 0 and the positions mapped back here, because the service adds xi
            // to a MESSAGE index: on a minus-strand gene that lands every site at the mirror
            // of where it belongs.
            let em = null;
            try { em = new EngineMonitor(() => { }); } catch (e) { em = null; }
            let data = null;
            try {
                data = await exec(window['env']['apiUrl'] + '/py/bio/rbp/rbp-profile.py',
                    em, '' + m.seq, '0', '' + (m.minus ? -1 : 1), names.join(','), '8');
            } catch (e) {
                return { error: 'the RBP model could not be reached: ' + ((e && e.message) ? e.message : e) };
            }
            if (!data) return { error: 'the RBP model returned nothing for ' + m.name };
            if (data.error) return { error: 'the RBP model refused ' + m.name + ': ' + data.error };
            let by = {};
            try { by = JSON.parse(data.sitesByRbp || '{}') || {}; } catch (e) { by = {}; }
            return { by: by };
        };

        const [ru, rd] = await Promise.all([rbpSites(U, UP_RBPS), rbpSites(D, DOWN_RBPS)]);
        if (ru.error) return fail(ru.error);
        if (rd.error) return fail(rd.error);
        // WHICH OF THE PANEL THE MODEL ACTUALLY KNOWS. resolve_rbps drops a name it has no
        // head for without a word, so a protein missing from the answer is indistinguishable
        // from one with no sites unless the two lists are compared.
        const asked = (names, by) => names.filter((n) => !Object.prototype.hasOwnProperty.call(by, n));
        const missingUp = asked(UP_RBPS, ru.by), missingDown = asked(DOWN_RBPS, rd.by);

        // ---- selectivity: would this blocker hit the other message too? --------------------
        // Fewest mismatches of the footprint against any ungapped window of the other
        // message. Mismatch count rather than an alignment score, because that is what a
        // steric blocker's specificity is actually measured in, and because an aligner's
        // gaps describe a thing an oligo cannot do.
        const bestMismatch = (foot, other) => {
            const f = foot, n = f.length, s = other.seq, L = s.length;
            if (!n || L < n) return { mm: n, at: -1 };
            let best = n, at = -1;
            for (let i = 0; i + n <= L; i++) {
                let mm = 0;
                for (let k = 0; k < n; k++) {
                    if (s.charCodeAt(i + k) !== f.charCodeAt(k)) { mm++; if (mm >= best) break; }
                }
                if (mm < best) { best = mm; at = i; if (!best) break; }
            }
            return { mm: best, at: at };
        };

        // The blocker footprint: the site, centred, padded out to FOOT so that what is
        // checked for cross-reactivity is the oligo someone would actually make rather than
        // the six bases of a seed.
        const footprintOf = (m, s, e) => {
            const mid = Math.floor((s + e) / 2);
            let a = Math.max(0, mid - Math.floor(FOOT / 2));
            let b = Math.min(m.seq.length, a + FOOT);
            a = Math.max(0, b - FOOT);
            return { a: a, b: b, seq: m.seq.slice(a, b) };
        };

        const candidate = (m, other, kind, s, e, label, detail, strength, extra) => {
            const fp = footprintOf(m, s, e);
            const x = bestMismatch(fp.seq, other);
            const [ta, tb] = m.back(s, e);
            const [fa, fb] = m.back(fp.a, fp.b);
            // WHERE ELSE IT WOULD BIND. The mismatch count says a blocker is not selective;
            // this says where on the other transcript it would sit instead, which is the
            // thing anyone asks next and which can be drawn on that track beside its own
            // candidates.
            let oa = null, ob = null;
            if (x.at >= 0) {
                const back2 = other.back(x.at, x.at + fp.seq.length);
                oa = back2[0]; ob = back2[1];
            }
            // SELECTIVITY IS A COUNT, NOT A VERDICT: 0 mismatches is the same sequence in
            // both messages and cannot be blocked apart; at or below the cut-off is a
            // blocker that probably hits both.
            const selective = (x.mm > SAFE);
            return Object.assign({
                kind: kind, label: label, detail: detail,
                start: ta, end: tb, mstart: s, mend: e,
                footprint: fp.seq, footprintStart: fa, footprintEnd: fb,
                mismatches: x.mm, selective: selective,
                otherStart: oa, otherEnd: ob, otherTrack: other.name,
                strength: strength,
                // Ranked on the two things that decide whether a blocker is worth making:
                // how good the site is, and whether it can be aimed at one message. A site
                // that cannot be aimed keeps its strength and is pushed below every site
                // that can, rather than being dropped, because it is still the reason the
                // pair behaves the way it does.
                score: Math.round(1000 * strength * (selective ? 1 : 0.15)) / 1000
            }, extra || {});
        };

        const rows = (m, other, by, armRbps) => {
            const out = [];
            for (const name of Object.keys(by || {})) {
                const role = ROLE[name];
                if (!role || armRbps.indexOf(name) < 0) continue;
                for (const s of (by[name] || [])) {
                    const a = Math.max(0, Math.floor(+s[0])), b = Math.min(m.seq.length, Math.floor(+s[1]));
                    const sc = +s[2];
                    if (!(b > a)) continue;
                    out.push(candidate(m, other, 'rbp', a, b, name,
                        role.what, Math.max(0, Math.min(1, sc)),
                        { rbp: name, role: role.role, rbpScore: sc, ambiguous: (role.arm === 'both') }));
                }
            }
            return out;
        };

        // UP ARM: microRNA seed matches plus the repressive proteins.
        const upRows = [];
        for (const h of M.scan(U.seq)) {
            // 6mers are reported and ranked last: marginal on their own, and leaving them
            // out would be a quiet judgement rather than a measurement.
            const strength = { '8mer-1a': 1, '7mer-m8': 0.75, '7mer-A1': 0.65, '6mer': 0.3 }[h.cls] || 0.3;
            upRows.push(candidate(U, D, 'mirna', h.start, h.end, h.name,
                h.cls + ' site · ' + (h.use || '') + (h.tissue ? (' · ' + h.tissue) : ''),
                strength, { mirna: h.name, cls: h.cls, tissue: h.tissue }));
        }
        upRows.push.apply(upRows, rows(U, D, ru.by, UP_RBPS));
        upRows.sort((a, b) => b.score - a.score);

        // DOWN ARM: transport granules and local initiation.
        const downRows = rows(D, U, rd.by, DOWN_RBPS);
        downRows.sort((a, b) => b.score - a.score);

        // ---- ONE SEQUENCE THAT DOES BOTH ---------------------------------------------------
        // The two arms above are two oligos. The question underneath them is whether there
        // is ONE: a stretch that both messages carry, which is a repressive site on the one
        // to be raised and a transport or local-initiation site on the one to be lowered. A
        // single blocker over it would de-repress one and strand the other, which is the
        // ratio moved from both ends by one molecule.
        //
        // This is the opposite test from selectivity, run on the same numbers. A candidate
        // is only dual if the blocker MATCHES both messages closely enough to bind each --
        // so the sites that fail the selectivity check are exactly the ones eligible here --
        // and if what it lands on in the other message is itself a site with the right job.
        // Matching alone is not enough: a 20-mer that is shared but sits over nothing in the
        // second message blocks nothing there.
        //
        // COVERAGE IS A LENGTH, NOT AN OVERLAP FLAG. A blocker clipping two bases of a
        // seventy-base RBP footprint has touched it and not occupied it, so at least half
        // the oligo has to lie over the site before this will call it covered.
        const COVER = Math.max(6, Math.floor(FOOT / 2));
        const overlap = (a1, b1, a2, b2) => {
            const lo = Math.max(Math.min(a1, b1), Math.min(a2, b2));
            const hi = Math.min(Math.max(a1, b1), Math.max(a2, b2));
            return Math.max(0, hi - lo + 1);
        };
        const dualFrom = (list, otherRows, whose) => {
            const out = [];
            for (const r of list) {
                // Binds the other message at all? The selectivity cut-off is the same line:
                // above it the blocker is aimed at one transcript, at or below it, it acts
                // on both, which is a failure there and the whole point here.
                if (r.selective || r.otherStart == null) continue;
                for (const q of otherRows) {
                    const cov = overlap(r.otherStart, r.otherEnd, q.start, q.end);
                    if (cov < COVER) continue;
                    out.push({
                        // Written from the message it was read off, with the other end's
                        // mismatches stated, because an oligo made to one sequence is a
                        // mismatched oligo on the other and that costs affinity.
                        footprint: r.footprint, writtenFor: whose,
                        mismatches: r.mismatches, covered: cov,
                        raises: (whose === 'up') ? r : q,
                        lowers: (whose === 'up') ? q : r,
                        upStart: (whose === 'up') ? r.footprintStart : r.otherStart,
                        upEnd: (whose === 'up') ? r.footprintEnd : r.otherEnd,
                        downStart: (whose === 'up') ? r.otherStart : r.footprintStart,
                        downEnd: (whose === 'up') ? r.otherEnd : r.footprintEnd,
                        // Both halves have to be worth blocking, so the weaker one sets the
                        // score: a strong microRNA site over a barely-ranked RBP window is
                        // not a dual blocker, it is a single one with a story attached.
                        score: Math.round(1000 * Math.min(r.strength, q.strength)
                            * (1 - (r.mismatches / Math.max(1, FOOT)))) / 1000
                    });
                }
            }
            return out;
        };
        // Both directions are searched and then deduplicated by where they land, because the
        // same shared stretch is reachable from either message and would otherwise be listed
        // twice with the two sequences written out of the two transcripts.
        const dualRaw = dualFrom(upRows, downRows, 'up').concat(dualFrom(downRows, upRows, 'down'));
        const seen = {};
        const dual = [];
        for (const d of dualRaw.sort((x, y) => y.score - x.score)) {
            const key = Math.round(d.upStart / 10) + ':' + Math.round(d.downStart / 10);
            if (seen[key]) continue;
            seen[key] = true;
            dual.push(d);
        }

        const sel = (list) => list.filter((r) => r.selective);
        const result = {
            ok: true,
            up: {
                track: U.name, length: U.seq.length, minus: U.minus,
                candidates: upRows.slice(0, TOP), all: upRows.length,
                selective: sel(upRows).length, missing: missingUp
            },
            down: {
                track: D.name, length: D.seq.length, minus: D.minus,
                candidates: downRows.slice(0, TOP), all: downRows.length,
                selective: sel(downRows).length, missing: missingDown
            },
            dual: dual.slice(0, TOP),
            dualAll: dual.length,
            footprint: FOOT, mismatchCutoff: SAFE, coverage: COVER,
            mirnaSetSize: (M.MIRNA || []).length
        };

        // THE VERDICT IS A DIRECTION AND A COUNT, never a ratio. Nothing here measures either
        // message, so a number with a fold in it would be invented. What the model can say is
        // whether each arm has anything to aim at that would not also hit the other one.
        const a = result.up.selective, b = result.down.selective;
        // ONE SEQUENCE DOING BOTH IS THE HEADLINE WHEN THERE IS ONE, because it is a
        // different design: one molecule instead of two, and the two effects cannot then be
        // dosed apart. That last part is a cost, not a detail, so it is said here.
        result.verdict = (dual.length)
            ? (dual.length + ' sequence' + (dual.length === 1 ? '' : 's') + ' would do both: '
                + 'shared by the two messages, sitting over something repressive on ' + U.name
                + ' and over transport or local initiation on ' + D.name + '. One blocker '
                + 'there should raise the first and strand the second, which also means the '
                + 'two effects arrive together and cannot be dosed apart. '
                + ((a && b) ? ('Separately, ' + a + ' site' + (a === 1 ? '' : 's') + ' on '
                    + U.name + ' and ' + b + ' on ' + D.name + ' can each be blocked without '
                    + 'touching the other.')
                    : 'Neither arm has a selective site of its own, so this is the only route here.'))
            : (a && b)
            ? ('Both arms have somewhere to aim: ' + a + ' site' + (a === 1 ? '' : 's') + ' on '
                + U.name + ' that can be blocked without matching ' + D.name + ', and ' + b
                + ' on ' + D.name + ' that can be blocked without matching ' + U.name
                + '. The ratio can be pushed from both ends independently, which is the only '
                + 'thing this says.')
            : (!a && !b)
                ? ('No single sequence does both, and neither arm has a site that can be '
                    + 'blocked selectively either, so a blocker made against either message '
                    + 'would be expected to act on both and move the ratio very little.')
                : (a ? (D.name + ' has no transport or local-initiation site that can be blocked '
                    + 'without also matching ' + U.name + ', so only the raising arm is '
                    + 'available: this would raise one without lowering the other.')
                    : (U.name + ' has no repressive site that can be blocked without also '
                        + 'matching ' + D.name + ', so only the lowering arm is available.'));

        // Carried with the result so that whatever shows it cannot show the shortlist
        // without them.
        result.limits = [
            'Nothing here is a measurement. No reads, no expression data, and no site is '
                + 'known to be occupied: these are sequences two models rank highly.',
            'The microRNA set is the de-targeting list, ' + result.mirnaSetSize + ' microRNAs, not '
                + 'a catalogue. The microRNA that actually represses either message will '
                + 'usually not be in it, so an empty up arm says very little.',
            'A microRNA site only represses where that microRNA is expressed, so the tissue '
                + 'against each site matters as much as the site class.',
            'BajaCLIP scores a window by ranking one head against its other 169 at the same '
                + 'window. That finds sequence a protein prefers; it does not say the protein '
                + 'is there, in this cell, on this message.',
            'Blocking a transport site changes WHERE a protein is made more than how much of '
                + 'it there is. The readout for the lowering arm is localisation, not a '
                + 'Western blot of whole cells.',
            'A steric blocker over a 3’ UTR site can change stability and polyadenylation '
                + 'as well as the thing it was aimed at, in either direction.',
            'A sequence that does both rests on the same stretch having a different job in '
                + 'each message: repressive in one, transport or local initiation in the '
                + 'other. Both halves of that are predictions, and one blocker means the two '
                + 'effects cannot be given at different doses or at different times.',
            'Selectivity here is a mismatch count over a ' + FOOT + '-mer against the other '
                + 'transcript only. It is not a transcriptome-wide specificity check, which '
                + 'is a separate screen and is the one that decides whether an oligo is usable.'
        ];
        return result;
    })();
}
