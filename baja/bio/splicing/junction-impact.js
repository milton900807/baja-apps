function (graph, track, junction, options) {

    // WHAT THIS ARC WOULD DO TO THE PROTEIN.
    //   await exec('baja/bio/splicing/junction-impact.js', graph, track, j)
    //
    // An arc on a sashimi plot is the most informative mark on the track and was the one
    // thing on it that could not be asked a question. It stands for a splice that either
    // happens or is predicted to, and what matters about it is what the transcript becomes
    // if it does: an exon dropped, an edge moved, a frame shifted, a stop arriving early.
    // Until now the way to find out was to work out which exon the arc belonged to and
    // open that exon instead.
    //
    // THE ISOFORM THE ARC IMPLIES. The arc spans from a donor to an acceptor, so what it
    // says is: everything between those two points is spliced out. Each exon is then kept
    // whole, trimmed to the part outside the span, or dropped entirely, and the result is
    // translated. An arc that changes nothing is the transcript as annotated, which is a
    // real answer and is said as one.
    //
    // ONE TRANSLATOR. baja/bio/orfs/exon-removal-impact.js in raw mode supplies the walk
    // and the NMD rules, the same ones behind the exon menu and the exon map, so an arc and
    // an exon cannot disagree about what a frameshift or a PTC is.
    //
    // WHAT IT IS NOT. A prediction about an isoform, not a measurement of this transcript
    // in a cell. How OFTEN the splice happens is the arc's own magnitude, which is carried
    // through here and never mixed with the consequence: a junction used in 3% of
    // transcripts and one used in 97% have the same consequence and are not the same
    // finding.

    return (async () => {
        const o = options || {};
        const j = junction || {};
        const say = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        const name = ('' + ((track && track.name) || 'this track'));

        const d = +j.d, a = +j.a;
        if (!isFinite(d) || !isFinite(a)) {
            say('That arc carries no coordinates, so there is nothing to work out.');
            return { ok: false, why: 'no coordinates' };
        }
        const lo = Math.min(d, a), hi = Math.max(d, a);

        let M = null;
        try { M = await exec('baja/bio/orfs/exon-removal-impact.js', track, null, { raw: true }); }
        catch (e) { M = null; }
        if (!M || !M.ok) {
            say(name + ': ' + ((M && M.reason) || 'there is no reading frame to translate from')
                + ', so an arc cannot be read as a protein change.');
            return { ok: false, why: (M && M.reason) || 'no reading frame' };
        }

        const translate = M.translate, nmdOf = M.nmdOf, plus = M.plus;
        const exons = (M.exons || []).slice()
            .filter((e) => e && isFinite(+e.xi) && isFinite(+e.xf))
            .sort((x, y) => Math.min(+x.xi, +x.xf) - Math.min(+y.xi, +y.xf));
        if (!exons.length) {
            say(name + ' has no annotated exons to rearrange.');
            return { ok: false, why: 'no exons' };
        }
        const numberOf = (e, i) => (plus ? (i + 1) : (exons.length - i));

        // The span is an INTRON in the isoform the arc describes: what it covers is gone.
        // An exon it covers entirely is dropped; one it covers in part is trimmed to what
        // is left, which is what a cryptic donor or acceptor does.
        const after = [];
        const dropped = [], trimmed = [];
        exons.forEach((e, i) => {
            const elo = Math.min(+e.xi, +e.xf), ehi = Math.max(+e.xi, +e.xf);
            const n = numberOf(e, i);
            if (ehi <= lo || elo >= hi) { after.push(e); return; }          // clear of the span
            if (elo >= lo && ehi <= hi) { dropped.push(n); return; }        // swallowed whole
            // Partly covered: keep the piece outside the span.
            const keepLo = (elo < lo) ? elo : hi;
            const keepHi = (ehi > hi) ? ehi : lo;
            if (keepHi - keepLo < 1) { dropped.push(n); return; }
            trimmed.push({ exon: n, was: ehi - elo + 1, now: keepHi - keepLo + 1 });
            after.push({ xi: keepLo, xf: keepHi });
        });

        if (!dropped.length && !trimmed.length) {
            // THE CANONICAL JUNCTION IS AN ANSWER. An arc over an intron the transcript
            // already splices out changes nothing, and saying "no impact" without saying
            // why reads as a calculation that failed.
            say(name + ': this arc is the transcript as it is already annotated — the '
                + 'stretch it spans is an intron, so splicing it makes the protein this track '
                + 'already carries. Nothing changes.');
            return { ok: true, outcome: 'unchanged', nmd: null, dropped: [], trimmed: [],
                headline: 'This is the transcript as annotated: the arc spans an intron, so '
                    + 'the protein is unchanged.', lines: [] };
        }

        const before = M.before;
        const t = translate(after);
        const lines = [];
        const fmt = (v) => (Math.round(+v) || 0).toLocaleString();

        if (dropped.length) {
            lines.push('exon' + (dropped.length === 1 ? ' ' : 's ') + dropped.join(', ')
                + ' spliced out entirely');
        }
        for (const tr of trimmed) {
            lines.push('exon ' + tr.exon + ' trimmed from ' + fmt(tr.was) + ' to ' + fmt(tr.now) + ' nt');
        }

        let outcome = 'frameshift', nmd = null, headline = '';
        const oldLen = (before && before.protein) ? before.protein.length : 0;
        if (!t) {
            outcome = 'start-lost';
            headline = 'The start codon is not in this isoform, so nothing is translated from it.';
        } else if (!t.stop) {
            outcome = 'no-stop';
            headline = 'Translation runs to the end of the transcript without a stop codon '
                + '(non-stop decay).';
        } else {
            const newLen = (t.protein || '').length;
            const nt = nmdOf(t);
            nmd = nt && nt.call;
            const lost = oldLen - newLen;
            // IN FRAME IS NOT THE SAME CLAIM AS UNCHANGED. The frame surviving says the
            // protein continues; what it loses is the question after that.
            const framed = ((dropped.concat([])).length || trimmed.length)
                && (((after.reduce((s, e) => s + (Math.abs(+e.xf - +e.xi) + 1), 0))
                    - (exons.reduce((s, e) => s + (Math.abs(+e.xf - +e.xi) + 1), 0))) % 3 === 0);
            outcome = framed ? 'in-frame-deletion' : 'frameshift';
            headline = (framed
                ? ('In frame: ' + fmt(newLen) + ' aa (was ' + fmt(oldLen) + '), '
                    + fmt(Math.abs(lost)) + ' residue' + (Math.abs(lost) === 1 ? '' : 's')
                    + (lost >= 0 ? ' lost' : ' gained') + '.')
                : ('Frameshift: a stop codon falls after ' + fmt(newLen) + ' aa (was '
                    + fmt(oldLen) + ').'));
            if (nmd === 'nmd') {
                headline += ' That stop is a premature termination codon and the mRNA is '
                    + 'predicted to undergo NMD: little protein expected.';
            } else if (nmd === 'nmd-maybe-escape') {
                headline += ' That stop is a premature termination codon; NMD is predicted but '
                    + 'may be incomplete, so some altered protein could be made.';
            } else if (nmd === 'escapes') {
                headline += ' The mRNA escapes NMD (' + ((nt && nt.why) || 'last exon')
                    + '), so the altered protein is expected to be made.';
            }
            if (nt && isFinite(nt.dist)) {
                lines.push('the stop is ' + fmt(nt.dist) + ' nt from the last exon junction'
                    + (nt.call === 'escapes' ? ', inside the 55 nt that escapes NMD' : ''));
            }
        }

        // HOW OFTEN, kept separate from WHAT. The same consequence at 3% and at 97% is not
        // the same finding, and a number for one read as the other is the mistake this is
        // arranged to prevent.
        const mag = (typeof j.mag === 'number') ? j.mag : null;
        const rate = (mag == null) ? null
            : ((j.__magMax && j.__magMax !== 1) ? (mag / j.__magMax) : mag);

        const out = {
            ok: true, outcome: outcome, nmd: nmd, headline: headline, lines: lines,
            dropped: dropped, trimmed: trimmed, kind: ('' + (j.kind || 'junction')),
            annotated: (j.annotated !== false), rate: rate,
            span: { start: lo, end: hi },
            oldLength: oldLen, newLength: (t && t.protein) ? t.protein.length : 0
        };
        if (o.quiet) return out;

        // ---- THE WINDOW -----------------------------------------------------------------
        const OV = await exec('baja/lib/canvas-overlay-panel.js');
        const K = OV.colors;
        const esc = (x) => ('' + (x == null ? '' : x)).replace(/&/g, '&amp;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const tone = (nmd === 'nmd') ? K.warm : (outcome === 'in-frame-deletion' ? K.ok : K.accent);
        const row = (k, v) => '<tr><td style="padding:4px 18px 4px 0;color:' + K.dim
            + ';white-space:nowrap;vertical-align:top;">' + esc(k) + '</td>'
            + '<td style="padding:4px 0;color:' + K.text + ';">' + v + '</td></tr>';
        const rows = [];
        rows.push(row('junction', esc(('' + (j.kind || 'junction')).replace(/-/g, ' '))
            + (j.annotated === false ? ' · not in the annotation' : '')
            + ' · ' + fmt(lo) + '–' + fmt(hi)));
        if (rate != null) {
            rows.push(row('how often', (rate <= 1 ? Math.round(rate * 100) + '%' : fmt(rate))
                + ' <span style="color:' + K.dim + '">of transcripts, as this plot measures it</span>'));
        }
        rows.push(row('consequence', '<span style="color:' + tone + ';font-weight:700;">'
            + esc(outcome.replace(/-/g, ' ')) + '</span>'
            + (nmd ? (' · ' + esc(('' + nmd).replace(/-/g, ' '))) : '')));
        rows.push(row('protein', fmt(out.newLength) + ' aa, was ' + fmt(oldLen) + ' aa'));
        if (track && track.name) rows.push(row('track', esc(track.name)));

        OV.open({
            id: 'baja-junction-impact',
            title: 'If this junction is used',
            body: '<table style="border-collapse:collapse;font:13px ' + K.font + ';">'
                + rows.join('') + '</table>'
                + '<div style="margin-top:16px;padding:12px 14px;background:rgba(255,255,255,0.04);'
                + 'border-left:3px solid ' + tone + ';border-radius:6px;font:13px/1.65 ' + K.font
                + ';color:' + K.text + ';max-width:640px;">' + esc(headline)
                + (lines.length ? ('<div style="margin-top:8px;color:' + K.dim + ';font-size:12.5px;">'
                    + lines.map((l) => esc(l)).join('<br>') + '</div>') : '')
                + '</div>'
                + '<div style="margin-top:12px;color:' + K.dim + ';font:12px/1.6 ' + K.font
                + ';max-width:640px;">This is the isoform the arc implies: the stretch it spans '
                + 'is spliced out, the rest is translated from this transcript’s own start '
                + 'codon, and the usual NMD rules of thumb are applied. It is a prediction about '
                + 'that isoform. How often the splice happens is the number above it, which is a '
                + 'separate question: the same consequence at 3% and at 97% is not the same '
                + 'finding.</div>'
        });
        return out;
    })();
}
