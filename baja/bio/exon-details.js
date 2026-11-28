function (graph, track, annotation) {

    // WHAT THIS EXON IS, in the editor's standard result window.
    //   await exec('baja/bio/exon-details.js', graph, selectedTrack, annotation);
    //
    // It was the host's showModal with wid 'text-editor', so the answer to "what is this
    // exon" arrived as four lines of plain text in a white sheet with line numbers down the
    // side, as though it were a file being edited. canvas-overlay-panel.js is the window
    // every other result uses, and its own notes say why it exists: the alternative came
    // out "a white sheet with no header, no Close button, and a close path that had to
    // reach for .cdk-overlay-backdrop".
    //
    // ONE OF THIS, TOO. Two menus carried their own copy and the copies disagreed: one
    // measured the exon as gxf - gxi and the other as abs(gxf - gxi) + 1, so the same exon
    // was 121 nt in one menu and 122 nt in the other, and since the two differ by one, an
    // exon could be reported IN frame by one and OUT of frame by the other. An exon's
    // length is inclusive of both ends, which is the second of those.

    return (async () => {
        const a = annotation || {};
        const gi = +a.gxi, gf = +a.gxf;
        const xi = +a.xi, xf = +a.xf;
        const haveG = isFinite(gi) && isFinite(gf);
        const haveX = isFinite(xi) && isFinite(xf);
        if (!haveG && !haveX) {
            try { graph.setMessage(' That exon has no coordinates to describe. '); } catch (e) { }
            return null;
        }
        // Genomic where the annotation carries it, track coordinates otherwise; both count
        // the first and last base, which is where the two old copies parted company.
        const len = haveG ? (Math.abs(gf - gi) + 1) : (Math.abs(xf - xi) + 1);
        const inFrame = (len % 3 === 0);
        const name = ('' + (a.name || '')).trim();
        const num = (v) => (Math.round(+v) || 0).toLocaleString();

        const OV = await exec('baja/lib/canvas-overlay-panel.js');
        const K = OV.colors;
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const line = (k, v) => '<tr><td style="padding:4px 18px 4px 0;color:' + K.dim
            + ';white-space:nowrap;vertical-align:top;">' + esc(k) + '</td>'
            + '<td style="padding:4px 0;color:' + K.text + ';">' + v + '</td></tr>';

        const rows = [];
        rows.push(line('length', num(len) + ' nt'));
        rows.push(line('reading frame', inFrame
            ? ('<span style="color:' + K.ok + ';font-weight:700;">in frame</span> · a multiple '
                + 'of three, so skipping it would leave the frame intact')
            : ('<span style="color:' + K.warm + ';font-weight:700;">out of frame</span> · '
                + (len % 3) + ' base' + ((len % 3) === 1 ? '' : 's') + ' over a multiple of three, '
                + 'so skipping it alone would shift the frame')));
        // ---- WHAT SKIPPING IT WOULD ACTUALLY DO ----------------------------------------
        // "Out of frame" is a fact about the exon's length and stops exactly where the
        // reader's question begins: a shifted frame runs to some stop codon, and whether
        // that stop is read as a premature one decides between a truncated protein and
        // almost no protein at all. The editor already works that out for the exon menu's
        // "what would removing this do", so asking it here is a call rather than a second
        // answer: baja/bio/orfs/exon-removal-impact.js translates the skip isoform from the
        // same start codon and applies the same NMD rules.
        //
        // Only for an out-of-frame exon. In frame, the skip is an internal deletion and the
        // page already says so; running it anyway would put a paragraph of consequence
        // under every exon somebody clicks.
        let impact = null;
        if (!inFrame && track) {
            try {
                impact = await exec('baja/bio/orfs/exon-removal-impact.js', track, a);
            } catch (e) { impact = null; }
        }
        if (impact && impact.ok) {
            const tone = (impact.nmd === 'nmd') ? K.warm
                : (impact.nmd === 'escapes' ? K.ok : K.accent);
            rows.push(line('if it were skipped',
                '<span style="color:' + tone + ';font-weight:700;">'
                + esc(('' + (impact.outcome || 'frameshift')).replace(/-/g, ' ')) + '</span>'
                + (impact.nmd ? (' \u00b7 ' + esc(('' + impact.nmd).replace(/-/g, ' '))) : '')));
        } else if (!inFrame && track) {
            // THE REFUSAL IS PART OF THE ANSWER. A transcript with no start codon to work
            // from cannot be translated, and saying nothing here leaves the reader thinking
            // the question was not worth asking.
            rows.push(line('if it were skipped',
                '<span style="color:' + K.dim + ';">not worked out: '
                + esc((impact && impact.reason) || 'this track has no reading frame to translate from')
                + '</span>'));
        }
        if (haveG) rows.push(line('genomic', num(Math.min(gi, gf)) + ' – ' + num(Math.max(gi, gf))));
        if (haveX) rows.push(line('on the track', num(Math.min(xi, xf)) + ' – ' + num(Math.max(xi, xf))));
        if (a.index != null) rows.push(line('exon', '' + a.index));
        if (track && track.name) rows.push(line('track', esc(track.name)));

        OV.open({
            id: 'baja-exon-details',
            title: name || ('Exon' + (a.index != null ? (' ' + a.index) : '')),
            body: '<table style="border-collapse:collapse;font:13px ' + K.font + ';">'
                + rows.join('') + '</table>'
                // WHAT "OUT OF FRAME" DOES AND DOES NOT SAY. It is a property of the exon's
                // length, not of this transcript: an exon can be out of frame and perfectly
                // ordinary, since it is the ones either side of it that keep the reading
                // frame. It matters when the exon is SKIPPED, which is the question people
                // are usually holding when they open this.
                + '<div style="margin-top:16px;padding:12px 14px;background:rgba(79,208,230,0.08);'
                + 'border-left:3px solid ' + K.accent + ';border-radius:6px;font:13px/1.65 '
                + K.font + ';color:' + K.text + ';max-width:620px;">'
                + 'Frame here is a property of this exon\u2019s own length. It says what would '
                + 'happen to the reading frame if the exon were skipped, not that anything is '
                + 'wrong with the transcript as it stands.</div>'
                // The consequence, in the words the exon menu uses for the same calculation,
                // with what it rests on said plainly underneath: these are rules of thumb
                // applied to a translation, not a measurement of this transcript in a cell.
                + (impact && impact.ok
                    ? ('<div style="margin-top:12px;padding:12px 14px;background:rgba(255,255,255,0.04);'
                        + 'border-left:3px solid ' + ((impact.nmd === 'nmd') ? K.warm : K.accent)
                        + ';border-radius:6px;font:13px/1.65 ' + K.font + ';color:' + K.text
                        + ';max-width:620px;">'
                        + '<div style="font-weight:700;margin-bottom:6px;">If this exon were skipped</div>'
                        + esc(impact.headline || '')
                        + ((impact.lines && impact.lines.length)
                            ? ('<div style="margin-top:8px;color:' + K.dim + ';font-size:12.5px;">'
                                + impact.lines.map((l) => esc(l)).join('<br>') + '</div>')
                            : '')
                        + '<div style="margin-top:8px;color:' + K.dim + ';font-size:12px;">'
                        + 'Worked out by translating the skip isoform from this transcript\u2019s own '
                        + 'start codon and applying the usual NMD rules of thumb (the 50 to 55 nt '
                        + 'rule, start-proximal and long-exon exceptions). It is a prediction about '
                        + 'the isoform, not a measurement of how often the skip happens.</div>'
                        + '</div>')
                    : '')
        });
        return true;
    })();
}
