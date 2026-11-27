function (graph, track, options) {

    // WHAT THE VARIANTS DO TO THE SEQUENCE ELEMENTS AROUND THEM.
    //   await exec('baja/bio/rna/nucleotide-motif-impact.js', graph, track)
    //   await exec('baja/bio/rna/nucleotide-motif-impact.js', graph, track,
    //              { variants: [snp, snp], window: 30 })
    //
    // The nucleotide half of the motif impact question. The protein half asks what a
    // substitution does to the ELM motifs of the translation; this asks what it does to
    // the elements in the message itself -- a polyadenylation signal, an AU-rich element,
    // a Pumilio site, a cryptic splice donor -- which is the only half that exists at all
    // for a variant in a UTR, and UTR variants are most of what gets loaded here.
    //
    // HOW IT IS DONE. For each variant, the stretch around it is taken twice: as the
    // reference and with the substitution applied. Both are scanned with
    // baja/bio/rna/nucleotide-motif-catalog.js and the two lists are subtracted. A pattern
    // in the second and not the first is GAINED; the other way round is LOST. Everything
    // the reference already carried in those windows is reported as PRESENT, so the two
    // claims are read against a background rather than against nothing.
    //
    // ON THE MESSAGE, NOT THE GENOME. reference and alternate are written on the plus
    // strand, so the substitution is applied there and the window is turned round
    // afterwards on a minus-strand gene. Scanning the stored strand would find elements
    // that do not exist in the transcript and miss the ones that do.
    //
    // NO SCORES, ON PURPOSE. There is no model behind these patterns, and a made-up number
    // beside a motif name is read as evidence. The output carries score: null and the
    // caveats say what that means, which is also why the window matters: these are
    // patterns, and over a whole transcript they match constantly. A difference at a
    // variant is a question worth asking; the bare list is not.

    return (async () => {
        const o = options || {};
        const W = Math.max(8, Math.min(200, Math.floor(+o.window || 30)));
        const say = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        const name = ('' + ((track && track.name) || 'this track'));

        const CAT = await exec('baja/bio/rna/nucleotide-motif-catalog.js');
        const RC = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
        const rc = (s) => s.split('').reverse().map((b) => RC[b] || 'N').join('');

        const minus = (+((track && track.strand) || 0) < 0);
        const lo = Math.round(Math.min(+track.xi, +track.xf));
        const hi = Math.round(Math.max(+track.xi, +track.xf));

        let wanted = (o.variants && o.variants.length) ? o.variants.slice()
            : ((track && track.snpindels) || []).slice();
        wanted = wanted.filter(Boolean);
        if (!wanted.length) {
            say(name + ' carries no variants, so there is nothing to compare the sequence '
                + 'against. Load some first.');
            return { ok: false, why: 'no variants' };
        }

        const vLabel = (v) => {
            const r = ('' + (v.reference || v.ref || '')).toUpperCase();
            const a = ('' + (v.alternate || v.alt || '')).toUpperCase();
            const at = Math.round(+v.xi);
            return (v.id ? (v.id + ' ') : '') + 'g.' + at + (r && a ? (' ' + r + '>' + a) : '');
        };

        const gained = [], lost = [], present = [];
        const seenPresent = {};
        const skipped = [];
        let used = 0;

        for (const v of wanted) {
            const at = Math.round(+v.xi);
            const r = ('' + (v.reference || v.ref || '')).toUpperCase().replace(/[^ACGTN]/g, '');
            const a = ('' + (v.alternate || v.alt || '')).toUpperCase().replace(/[^ACGTN]/g, '');
            if (!isFinite(at) || at < lo || at > hi) { skipped.push(vLabel(v) + ' (outside the track)'); continue; }
            if (!r || !a) { skipped.push(vLabel(v) + ' (no reference or alternate base)'); continue; }

            const a0 = Math.max(lo, at - W), a1 = Math.min(hi, at + r.length - 1 + W);
            let plus = '';
            try { plus = ('' + (track.getSequenceRange(a0, a1) || '')).toUpperCase(); } catch (e) { plus = ''; }
            plus = plus.replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
            if (plus.length < 8) { skipped.push(vLabel(v) + ' (no sequence here)'); continue; }

            const i = at - a0;
            const refHere = plus.slice(i, i + r.length);
            if (refHere !== r) {
                // THE REFERENCE BASE MUST MATCH or everything downstream is a comparison
                // against a sequence this track does not have. Reported, never guessed at.
                skipped.push(vLabel(v) + ' (the track reads ' + (refHere || '?') + ' there, not ' + r + ')');
                continue;
            }
            const alt = plus.slice(0, i) + a + plus.slice(i + r.length);

            // Back to track coordinates. On a minus-strand gene the message runs the other
            // way, so the END of a match is the lower coordinate.
            const refMsg = minus ? rc(plus) : plus;
            const altMsg = minus ? rc(alt) : alt;
            const backRef = (s, e) => minus ? [a0 + (plus.length - e), a0 + (plus.length - s)]
                : [a0 + s - 1, a0 + e - 1];
            const backAlt = (s, e) => minus ? [a0 + (alt.length - e), a0 + (alt.length - s)]
                : [a0 + s - 1, a0 + e - 1];

            const inRef = CAT.scan(refMsg), inAlt = CAT.scan(altMsg);
            // Keyed on what a reader would call the same element: the same pattern in the
            // same place. The substitution can shift a position by an indel's length, so
            // the key is taken in message space on each side and the offset allowed for.
            const shift = alt.length - plus.length;
            const keyRef = (h) => h.motif + '@' + h.start + ':' + h.end;
            const keyAlt = (h) => h.motif + '@' + (h.start - (h.start > i ? shift : 0))
                + ':' + (h.end - (h.end > i ? shift : 0));
            const refKeys = {}, altKeys = {};
            for (const h of inRef) refKeys[keyRef(h)] = h;
            for (const h of inAlt) altKeys[keyAlt(h)] = h;

            const rec = (h, back, variant) => {
                const [x1, x2] = back(h.start, h.end);
                return { elm: h.motif, site: h.site, start: Math.round(x1), end: Math.round(x2),
                    peptide: h.match, score: null, blurb: h.blurb, variant: variant };
            };
            for (const h of inAlt) { if (!refKeys[keyAlt(h)]) gained.push(rec(h, backAlt, vLabel(v))); }
            for (const h of inRef) { if (!altKeys[keyRef(h)]) lost.push(rec(h, backRef, vLabel(v))); }
            for (const h of inRef) {
                const k = keyRef(h) + '#' + a0;
                if (seenPresent[k]) continue;
                seenPresent[k] = 1;
                present.push(rec(h, backRef, ''));
            }
            used++;
        }

        if (!used) {
            say(name + ': none of the ' + wanted.length + ' variants could be compared. '
                + skipped.slice(0, 4).join('; ') + (skipped.length > 4 ? '; and more' : '') + '.');
            return { ok: false, why: 'nothing comparable', skipped: skipped };
        }

        const caveats = [
            'These are PATTERN MATCHES from a catalogue of ' + CAT.size + ' named sequence '
                + 'elements, not sites. Short patterns match constantly by chance, which is why '
                + 'this reports the DIFFERENCE a variant makes rather than the bare list.',
            'Nothing here is scored. There is no model behind these patterns and a number '
                + 'beside one would be read as evidence that does not exist.',
            'Only the ' + W + ' nt either side of each variant was looked at, so a match '
                + 'listed as already present is present IN THOSE WINDOWS, not necessarily '
                + 'unique on the track.',
            'The catalogue is deliberately small. Elements whose consensus is really a weight '
                + 'matrix or a structure are left out, so a variant with nothing listed here '
                + 'may still change something this does not know about.'
        ];
        if (minus) caveats.push('This gene is on the minus strand, so the scan is on the message: '
            + 'the substitution is applied on the plus strand, where reference and alternate '
            + 'are written, and the window is turned round afterwards.');
        if (skipped.length) caveats.push(skipped.length + ' variant(s) were not compared -- '
            + skipped.slice(0, 6).join('; ') + (skipped.length > 6 ? '; and more' : '') + '.');

        return {
            ok: true, error: '',
            motifs: present, gained: gained, lost: lost,
            meta: {
                scoring: 'pattern', classes: CAT.size, length: (hi - lo + 1), origin: lo,
                units: 'nt', min_score: 0, cutoff_rule: 'none (every match in the windows)',
                conservation: false, accession: '',
                variants: wanted.map(vLabel), window: W, compared: used, skipped: skipped,
                caveats: caveats
            }
        };
    })();
}
