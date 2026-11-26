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
                + 'Frame here is a property of this exon’s own length. It says what would '
                + 'happen to the reading frame if the exon were skipped, not that anything is '
                + 'wrong with the transcript as it stands.</div>'
        });
        return true;
    })();
}
