function (graph, genegraph_panel_layout, presetTrack) {

    // ClinVar variants that the splice-site model says change splicing, placed on the track.
    //   exec('baja/bio/splicing/clinvar-splice-variants.js', graph, genegraph_panel_layout [, track])
    //
    // Click a track; every ClinVar variant near an annotated splice site of that track's gene
    // is scored ref-vs-alt and the ones that move a splice site are drawn where they sit.
    //
    // WHAT THE COLOURS MEAN, and why there are two. A variant can move splicing in two
    // opposite ways and they are different problems:
    //   * it WEAKENS a site the transcript uses -> that exon starts being skipped
    //   * it CREATES a cryptic site -> a new junction competes with the real one
    // A single "splice score" hides that distinction, so losses and gains are coloured
    // separately and the label says which.
    //
    // THE POINT OF THE TOOL is the variants ClinVar has NOT already called splice variants.
    // A variant annotated splice_donor_variant scoring high is a restatement; a synonymous
    // or deep-intronic variant labelled "uncertain significance" scoring high is a finding.
    // Those are marked and counted separately in the closing message.
    //
    // WHAT IT DOES NOT SAY: the score is the change in splice-site probability, the quantity
    // SpliceAI reports. It is not delta-PSI and it is not a pathogenicity call -- the same
    // validation that separates splice from missense at AUC 0.99 only reaches 0.72 for
    // pathogenic-vs-benign among splice variants. The closing message says so every run.

    return new Promise((resolve) => {

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const resetModelsToolbar = () => {
            try { exec('baja/ml/predictive-models-toolbar.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        const axisOf = (t) => (t && (t.grid || t.tgraph)) || null;
        // description is 'gene_name;transcript_name' (track-flexi builds it that way).
        const geneOf = (t) => {
            const raw = '' + ((t && (t.description || t.name || t.geneID)) || '');
            return raw.split(';')[0].split('(')[0].trim();
        };

        // A RUN THAT FOUND NOTHING STILL HAS TO SAY WHAT IT LOOKED AT.
        //
        // Every no-result path used to end at graph.setMessage, which is one line on a status
        // bar that the next message replaces. So a gene with almost nothing in ClinVar -- SMN2
        // has SEVEN variants in the whole gene, and one of them clears Delta 0.1 -- was
        // indistinguishable from a tool that had silently failed. The numbers that explain the
        // zero (how many ClinVar variants were there at all, how many were set aside as too far
        // from a site or as indels, what threshold was applied) are exactly what turns "it
        // doesn't work" into "there is nothing there", so they go in the same window a
        // successful run opens.
        const showNothing = async (title, lead, rows, note) => {
            try {
                const esc = (t) => ('' + (t == null ? '' : t))
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const OV = await exec('baja/lib/canvas-overlay-panel.js');
                const K = OV.colors;
                const line = (k, v) => '<tr><td style="padding:5px 20px 5px 0;color:' + K.dim + ';white-space:nowrap;">'
                    + esc(k) + '</td><td style="padding:5px 0;font-weight:600;color:' + K.title + ';">' + esc(v) + '</td></tr>';
                OV.open({
                    id: 'baja-splice-clinvar-summary',
                    title: title,
                    body: '<div style="font:14px/1.7 ' + K.font + ';color:' + K.text + ';max-width:760px;">' + esc(lead) + '</div>'
                        + '<table style="border-collapse:collapse;font:13px ' + K.font + ';margin-top:14px;">'
                        + (rows || []).map((r) => line(r[0], r[1])).join('') + '</table>'
                        + (note ? ('<div style="margin-top:16px;padding:12px 14px;background:rgba(79,208,230,0.08);'
                            + 'border-left:3px solid ' + K.accent + ';border-radius:6px;font:13px/1.65 ' + K.font
                            + ';color:' + K.text + ';max-width:760px;">' + note + '</div>') : '')
                });
                return true;
            } catch (e) { return false; }
        };

        const runOnTrack = async (track, opts) => {
            const win = (opts && opts.win) || '300';
            const minDelta = (opts && opts.minDelta) || '0.2';
            const sig = (opts && opts.sig) || '';
            try {
                const gene = geneOf(track);
                const axis = axisOf(track);
                if (!gene) { graph.setMessage(' That track has no gene name to score. '); restoreHover(); return false; }
                if (!axis) { graph.setMessage(' That track has no coordinate axis to draw on. '); restoreHover(); return false; }

                const __where = gene + ' · ' + (track.name || 'track') + ' · Δ≥' + minDelta;
                const __say = (phase) => {
                    try { exec('baja/lib/work-status.js', 'BajaSplice · ClinVar splice variants → ' + __where + (phase ? ('  ·  ' + phase) : '')); } catch (e) { }
                };
                __say('scoring ClinVar variants');

                // A RUNNING SPINNER, because this is a slow tool and a still message reads as
                // a stalled one. Scoring is one model pass per variant: a few seconds for a
                // small gene, the better part of a minute for TP53's couple of thousand. The
                // plain status message also auto-clears after about five seconds, so without
                // re-posting it the canvas would go quiet halfway through and look finished.
                // Same braille frames the ClinVar loader uses, plus the elapsed seconds so
                // the user can see it is still moving rather than just animating.
                const spinFrames = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
                let spinN = 0;
                const t0 = Date.now();
                let lastPhase = 'reading ClinVar for ' + gene;
                const spinMsg = () => ' ' + spinFrames[spinN++ % spinFrames.length]
                    + ' BajaSplice \u00b7 ' + lastPhase
                    + ' \u00b7 ' + Math.round((Date.now() - t0) / 1000) + 's ';
                graph.setMessage(spinMsg());
                const spinner = setInterval(() => { try { graph.setMessage(spinMsg()); } catch (e) { } }, 350);

                const server = window['env']['apiUrl'];
                // The engine's own progress lines become the spinner's caption rather than
                // replacing it, so the frames keep turning while the phase text updates.
                const em = new EngineMonitor((m) => {
                    try { log(m); lastPhase = ('' + m).trim() || lastPhase; __say('' + m); } catch (e) { }
                });
                let data = null;
                try {
                    data = await exec(server + '/py/bio/splice/clinvar-splice-variants.py', em,
                        '' + gene, '' + win, '' + minDelta, '' + sig);
                } finally {
                    clearInterval(spinner);
                }

                if (!data || data.status === 'error') {
                    graph.setMessage(' ClinVar splice variants: ' + ((data && data.error) || 'failed') + ' ');
                    restoreHover(); return false;
                }
                let hits = [];
                try { hits = JSON.parse((data && data.variants) || '[]'); } catch (e) { hits = []; }

                // A RUN WHERE EVERY SCORE FAILED must not read as a run where nothing scored.
                // The script counts failures for exactly this reason; surface it rather than
                // reporting a confident zero.
                const failed = +(data.failed || 0);
                if (!hits.length && failed) {
                    const why = (JSON.parse(data.failures || '[]')[0] || {}).error || 'see the server log';
                    await showNothing('Splicing scan failed \u2014 ' + gene,
                        'Every variant the scan found failed to score, so this is a failure of the run, '
                        + 'not a finding about the gene.',
                        [['Gene', gene], ['Region', data.region || ''],
                         ['Variants found', data.scanned || 0], ['Failed to score', failed],
                         ['First error', why]],
                        'Nothing has been added to the track.');
                    graph.setError(' ' + gene + ': all ' + failed + ' variants failed to score \u2014 ' + why + ' ');
                    restoreHover(); return false;
                }
                if (!hits.length) {
                    // THE COUNTS ARE THE POINT HERE. "Nothing found" reads as a broken tool;
                    // "ClinVar has 7 variants in this whole gene and none of them move a splice
                    // site by 0.5" reads as an answer. SMN2 is exactly that case.
                    const scanned = +(data.scanned || 0);
                    await showNothing('No splice-changing variants \u2014 ' + gene,
                        scanned === 0
                            ? 'ClinVar has no variants at all in this region, so there was nothing to score.'
                            : ('Every ClinVar variant near a splice site here was scored, and none of them '
                                + 'changes a splice-site probability by \u0394 ' + minDelta + ' or more.'),
                        [['Gene', gene], ['Region', data.region || ''], ['Strand', data.strand || ''],
                         ['ClinVar variants scored', scanned],
                         ['Annotated splice sites', data.annotated_sites == null ? '\u2014' : data.annotated_sites],
                         ['Set aside \u2014 too far from a site', data.skipped_far == null ? '\u2014' : data.skipped_far],
                         ['Set aside \u2014 indels', data.skipped_indel == null ? '\u2014' : data.skipped_indel],
                         ['Threshold applied', '\u0394 \u2265 ' + minDelta],
                         ['Window', win + ' nt either side of a splice site']],
                        scanned > 0
                            ? ('A lower threshold may find something: this run used \u0394 \u2265 ' + minDelta
                                + ', and the tool offers \u0394 \u2265 0.5, 0.2 and 0.1. '
                                + 'Widening the window to \u00b12000 nt also brings in deep-intronic variants.')
                            : ('A gene can be almost absent from ClinVar even when it is well studied \u2014 '
                                + 'submissions are often made against a paralogue instead. '
                                + 'Nothing is wrong with the scan; there is no data here to score.'));
                    graph.setMessage(' ' + gene + ': none of ' + scanned
                        + ' ClinVar variants near a splice site move one by \u0394\u2265' + minDelta + '. ');
                    restoreHover(); return false;
                }

                // PLACED AS REAL VARIANT MARKERS, not as a layer of hairline blocks.
                // The first version drew intervals at raw GENOMIC coordinates against the
                // track's WORLD axis -- two different coordinate spaces -- so every variant
                // fell outside the range and the layer came up empty. track.variantWorldX()
                // is the conversion the ClinVar loader already uses, and SnpIndel is the
                // primitive built for variants: clickable, annotated, and drawn at a size
                // that is visible without zooming.
                // A SELECTED SEQUENCE narrows the result to that region, as the other
                // splicing layers do. These are WORLD coordinates, the same space
                // variantWorldX() returns -- which is the distinction the first version got
                // wrong by comparing genomic positions against them.
                let __lo = axis.xmin, __hi = axis.xmax, __sel = false;
                try {
                    const __r = (track.selectedRange && track.selectedRange()) || null;
                    if (__r) {
                        __lo = Math.max(axis.xmin, __r.start);
                        __hi = Math.min(axis.xmax, __r.end);
                        __sel = __hi > __lo;
                    }
                } catch (e) { }

                graph.setMessage(' ' + spinFrames[0] + ' Placing ' + hits.length + ' variant'
                    + (hits.length === 1 ? '' : 's') + ' on ' + (track.name || 'the track') + '\u2026 ');
                const SnpIndel = await exec('flexigraph/snpindel.js');
                if (!SnpIndel) { graph.setError(' Variant support unavailable. '); restoreHover(); return false; }

                // COLOUR BY HOW STRONGLY THE SITE MOVES, so the eye goes to the strong ones
                // first. Two ramps, because a loss and a gain are different findings:
                // losses run amber -> red, gains run blue -> violet. The ramp is on the
                // score, not on ClinVar's classification -- this is the model's opinion.
                const ramp = (d, gain) => {
                    const t = Math.max(0, Math.min(1, (d - 0.1) / 0.9));
                    const a = gain ? [90, 150, 210] : [240, 170, 60];      // weak end
                    const b = gain ? [124, 60, 200] : [200, 30, 40];       // strong end
                    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
                    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
                };

                let added = 0, skipped = 0, novel = 0, best = 0, unmapped = 0;
                const placed = [];
                for (let i = 0; i < hits.length; i++) {
                    const h = hits[i];
                    if (!h) continue;
                    const wx = track.variantWorldX ? track.variantWorldX(h.chrom, +h.pos) : null;
                    if (wx == null) { unmapped++; continue; }
                    if (wx < __lo || wx > __hi) { skipped++; continue; }
                    const sc = Math.max(0, Math.min(1, +h.delta || 0));
                    if (sc > best) best = sc;
                    const gain = ('' + h.direction) === 'gain';
                    const already = /splice_/.test('' + (h.consequence || ''));
                    if (!already) novel++;

                    const ref = /^[ACGTN]+$/i.test('' + h.ref) ? ('' + h.ref).toUpperCase() : 'N';
                    const alt = /^[ACGTN]+$/i.test('' + h.alt) ? ('' + h.alt).toUpperCase() : 'N';
                    const snp = new SnpIndel('snp', wx, ref, alt, 0, track.strand,
                        (h.id || (h.ref + '>' + h.alt)), null, ramp(sc, gain));
                    try {
                        snp.name = h.id || (h.ref + '>' + h.alt);
                        if (Array.isArray(h.conditions) && h.conditions.length) snp.clindn = h.conditions.join('; ');
                        if (h.clinsig) snp.clinsig = h.clinsig;
                        // The model's verdict, in the place a reader already looks for the
                        // reason a variant is marked.
                        snp.note = '\u0394' + sc.toFixed(2) + '  ' + (h.effect || '')
                            + '  [acceptor ' + (h.acceptor_gain || 0).toFixed(2) + '/-' + (h.acceptor_loss || 0).toFixed(2)
                            + '  donor ' + (h.donor_gain || 0).toFixed(2) + '/-' + (h.donor_loss || 0).toFixed(2) + ']'
                            + (already ? '' : '  \u2014 not annotated as a splice variant');
                        snp.__spliceDelta = sc;
                        snp.__spliceEffect = h.effect || '';
                    } catch (e) { }
                    try { track.addsnpindel(snp); placed.push({ snp: snp, sc: sc, h: h, wx: wx }); added++; } catch (e) { skipped++; }
                }

                if (!added) {
                    await showNothing('Nothing could be placed \u2014 ' + gene,
                        'Variants were found and scored, but none of them lands anywhere on '
                        + (__sel ? 'the selected sequence' : 'this track') + ', so there is nothing to draw.',
                        [['Gene', gene], ['Region', data.region || ''],
                         ['Variants scored', hits.length],
                         ['Outside the track\u2019s coordinates', unmapped || 0],
                         ['Target', __sel ? 'the selected sequence' : (track.name || 'this track')]],
                        'This usually means the track covers a different region, or a different '
                        + 'assembly, from the one the variants are reported against.');
                    graph.setMessage(' ' + gene + ': ' + hits.length + ' variant'
                        + (hits.length === 1 ? '' : 's') + ' scored, but none could be placed on '
                        + (__sel ? 'the selected sequence' : 'this track')
                        + (unmapped ? (' (' + unmapped + ' outside its coordinate range)') : '') + '. ');
                    restoreHover(); return false;
                }

                // PULSE THE STRONG ONES. A track can carry hundreds of variants and the
                // marker for a Δ0.95 looks much like the marker for a Δ0.2 until you read
                // it; the ones most likely to change splicing announce themselves instead.
                // Only those above 0.5, or the top three when nothing clears that, so the
                // pulse stays a signal rather than decoration.
                const strong = placed.filter((x) => x.sc >= 0.5);
                const toPulse = (strong.length ? strong : placed.slice(0, 3));
                let frame = 0;
                const pulse = setInterval(() => {
                    frame++;
                    for (const x of toPulse) { try { x.snp.highlight = (frame % 2 === 0); } catch (e) { } }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    if (frame > 11) {
                        clearInterval(pulse);
                        // Left SELECTED, not blinking forever: the strong ones keep a ring so
                        // they stay findable after the animation ends.
                        for (const x of toPulse) { try { x.snp.highlight = true; } catch (e) { } }
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                    }
                }, 260);

                if (graph.wake) graph.wake();

                // A SUMMARY WINDOW, because the finding is a list and a one-line status
                // message cannot carry it. What the run actually produced -- which variants,
                // how strongly, and crucially which of them nobody had called splice
                // variants -- is a table, and it is gone off the status line in seconds.
                // The marks on the track say WHERE; this says WHAT and HOW SURE.
                try {
                    const esc = (t) => ('' + (t == null ? '' : t))
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    // The editor's standard result window (baja/lib/canvas-overlay-panel.js):
                    // navy ground, pinned header with the title and Close, one scrolling body,
                    // fitted to the gene-graph canvas -- the same window the off-target mapper
                    // opens. It used to go through the host's showModal instead, which gave a
                    // white sheet with no header and no Close button, sized by its own CSS
                    // because showModal ignores the width/height arguments, and closed by
                    // reaching for `.cdk-overlay-backdrop`. It also meant every row handler had
                    // to be re-attached by polling the DOM, because the host's html-field
                    // scrub() strips on* attributes from injected HTML. Owning the node solves
                    // all of that: the handlers are attached to elements built here.
                    const OV = await exec('baja/lib/canvas-overlay-panel.js');
                    const C = { ink: OV.colors.text, ink2: OV.colors.title, dim: OV.colors.dim,
                                line: OV.colors.rule, edge: OV.colors.line,
                                bg: OV.colors.bg, card: 'rgba(255,255,255,0.05)',
                                accent: OV.colors.accent, warm: OV.colors.warm };
                    const inWindow = placed.slice().sort((a, b) => b.sc - a.sc);

                    const swatch = (sc, gain) => '<span style="display:inline-block;width:10px;height:10px;'
                        + 'border-radius:2px;margin-right:7px;vertical-align:-1px;background:' + ramp(sc, gain) + ';"></span>';
                    const row = (x) => {
                        const h = x.h, gain = ('' + h.direction) === 'gain';
                        const already = /splice_/.test('' + (h.consequence || ''));
                        return '<tr data-splice-wx="' + x.wx + '" data-splice-label="'
                            + esc(h.id || (h.ref + '>' + h.alt)) + '" class="spl-row" '
                            + 'style="cursor:pointer;border-bottom:1px solid ' + C.line + ';">'
                            + '<td style="padding:7px 10px 7px 8px;white-space:nowrap;">' + swatch(x.sc, gain)
                            + '<b style="color:' + C.ink2 + ';">' + x.sc.toFixed(2) + '</b></td>'
                            + '<td style="padding:7px 10px 7px 0;color:' + C.ink + ';white-space:nowrap;">'
                            + esc(h.id || (h.ref + '>' + h.alt)) + '</td>'
                            + '<td style="padding:7px 10px 7px 0;color:' + C.dim + ';white-space:nowrap;font-family:monospace;">'
                            + esc(h.chrom) + ':' + esc(h.pos) + ' ' + esc(h.ref) + '&gt;' + esc(h.alt) + '</td>'
                            + '<td style="padding:7px 10px 7px 0;color:' + C.ink + ';white-space:nowrap;">' + esc(h.effect || '') + '</td>'
                            + '<td style="padding:7px 10px 7px 0;color:' + (already ? C.dim : C.warm) + ';white-space:nowrap;">'
                            + esc(h.consequence || 'unannotated') + (already ? '' : ' \u2190 new') + '</td>'
                            + '<td style="padding:7px 10px 7px 0;color:' + C.dim + ';">' + esc(h.clinsig || '\u2014') + '</td>'
                            + '<td style="padding:7px 8px 7px 0;color:' + C.dim + ';white-space:nowrap;">'
                            + (h.dist_to_site == null ? '\u2014' : (esc(h.dist_to_site) + ' nt')) + '</td>'
                            // INCLUSION, which is the question the site-level delta cannot answer:
                            // that one is max() of four scores in a +/-50 nt window, so it cannot
                            // see that an exon was weakened at BOTH ends. dPSI runs the inclusion
                            // model on the reference and the alternate and reports the difference.
                            + '<td style="padding:7px 10px 7px 0;white-space:nowrap;">'
                            // THE BAND, NOT THE NUMBER. Against measured dPSI (MFASS) the raw
                            // magnitude is compressed about 100-fold, so printing it as a
                            // percentage invites reading -0.01 as "1% skipping" when it is the
                            // model's version of a strong effect. The bands are set at 99% and
                            // 95% specificity against variants MEASURED as neutral. The raw
                            // value is still shown, small, so nothing is hidden.
                            + (h.dpsi == null
                                ? ('<span style="color:' + C.dim + ';" title="' + esc(h.dpsi_note || 'not computed')
                                    + '">\u2014</span>')
                                : ('<b style="color:' + (h.dpsi_band === 'likely skipping' ? C.warm
                                        : (h.dpsi_band === 'possible skipping' ? '#e0a03b' : C.dim)) + ';">'
                                    + esc(h.dpsi_band || '\u2014') + '</b>'
                                    + '<span style="color:' + C.dim + ';" title="raw \u0394PSI, not calibrated as a percentage">'
                                    + ' e' + esc(h.psi_exon) + ' \u0394' + (+h.dpsi).toFixed(3) + '</span>')) + '</td>'
                            + '<td style="padding:7px 8px;color:' + C.accent + ';white-space:nowrap;">zoom \u2192</td>'
                            + '</tr>';
                    };
                    const th = (t) => '<th style="text-align:left;padding:0 10px 7px 0;position:sticky;top:0;'
                        + 'background:' + C.bg + ';border-bottom:2px solid ' + C.edge + ';font:600 11px ' + OV.colors.font + ';'
                        + 'letter-spacing:.06em;text-transform:uppercase;color:' + C.dim + ';">' + t + '</th>';
                    const card = (label, value, sub) => '<div style="flex:1 1 0;min-width:130px;background:' + C.card + ';'
                        + 'border:1px solid ' + C.edge + ';border-radius:10px;padding:12px 14px;">'
                        + '<div style="font:600 11px ' + OV.colors.font + ';letter-spacing:.07em;text-transform:uppercase;color:' + C.dim + ';">' + label + '</div>'
                        + '<div style="font:800 26px/1.2 ' + OV.colors.font + ';color:' + C.ink2 + ';margin-top:4px;">' + value + '</div>'
                        + (sub ? '<div style="font:12px ' + OV.colors.font + ';color:' + C.dim + ';margin-top:2px;">' + sub + '</div>' : '')
                        + '</div>';

                    // The shell owns the outer box, the title and the scrolling; this is only
                    // what goes inside it.
                    const html = ''
                        + '<div style="display:flex;flex-direction:column;height:100%;min-height:0;">'
                        + '<div style="font:13px ' + OV.colors.font + ';color:' + C.dim + ';flex:0 0 auto;">'
                        + esc(gene) + ' \u00b7 ' + esc(data.region || '') + ' \u00b7 strand ' + esc(data.strand || '')
                        + ' \u00b7 within ' + esc(win) + ' nt of a splice site \u00b7 \u0394 \u2265 ' + esc(minDelta)
                        + ' \u00b7 <b style="color:' + C.accent + ';">click any row to zoom to that site</b></div>'
                        + '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;flex:0 0 auto;">'
                        + card('Move a site', String(added), 'of ' + esc(data.scanned || 0) + ' scored')
                        + card('Not called splice', String(novel), 'by ClinVar \u2014 the finding')
                        + card('Strongest', best.toFixed(2), 'max \u0394')
                        + card('Pulsing', String(toPulse.length), '\u0394 \u2265 0.5')
                        + '</div>'
                        + '<div style="margin-top:16px;flex:1 1 auto;min-height:120px;overflow:auto;border:1px solid ' + C.edge + ';border-radius:10px;">'
                        + '<table style="width:100%;border-collapse:collapse;font:13px ' + OV.colors.font + ';">'
                        + '<tr>' + th('\u0394') + th('ID') + th('Position') + th('Predicted effect')
                        + th('ClinVar call') + th('Classification') + th('To site')
                        + th('Exon skipping (\u0394PSI)') + th('') + '</tr>'
                        + inWindow.map(row).join('') + '</table></div>'
                        + '<div style="margin-top:12px;padding-top:10px;border-top:1px solid ' + C.edge + ';'
                        + 'font:12px/1.55 ' + OV.colors.font + ';color:' + C.dim + ';flex:0 0 auto;">'
                        + '<b style="color:' + C.warm + ';">This is not a pathogenicity call.</b> '
                        + 'The \u0394 score is the change in splice-site probability \u2014 the quantity SpliceAI '
                        + 'reports. How far the isoform ratio actually shifts is a different question, answered '
                        + 'separately in the Exon skipping column below. '
                        + 'The same validation that separates ClinVar splice variants from missense at AUC 0.99 reaches '
                        + 'only 0.72 for pathogenic-versus-benign among splice variants. '
                        + 'Amber\u2192red weakens an existing site; blue\u2192violet creates a cryptic one. '
                        + '<b style="color:' + C.warm + ';">\u2190 new</b> marks the ones ClinVar has not annotated as '
                        + 'splice variants \u2014 those are the findings; the rest restate their own annotation. '
                        + 'Substitutions only. Model: ' + esc(data.model || 'BajaSplice') + '. '
                        + '<b style="color:' + C.warm + ';">Exon skipping: read the band, not a percentage.</b> '
                        + 'The \u0394 column is the largest of four splice-site scores in a \u00b150 nt window, so it '
                        + 'cannot see an exon weakened at BOTH ends; this column runs the inclusion model '
                        + '(' + esc(data.dpsi_model || 'PSINet') + ') on the reference and the alternate sequence instead. '
                        + 'Calibrated against 960 variants with <i>measured</i> \u0394PSI (MFASS, Cheung 2019): it ranks '
                        + 'measured effect better than the \u0394 column does (Spearman 0.50 vs 0.43; AUC 0.855 vs 0.825 '
                        + 'for measured splice-disrupting vs measured neutral). The bands are set at 99% and 95% '
                        + 'specificity against variants measured as neutral, giving 36% and 50% sensitivity \u2014 so a '
                        + 'band is worth believing and a blank means no information, NOT no effect. '
                        + '<b>The raw \u0394 shown beside it is not calibrated</b>: variants measured at \u0394PSI '
                        + '\u22120.85 are predicted around \u22120.01, because 70% of these exons are predicted at '
                        + 'PSI &gt; 0.99 and a saturated sigmoid cannot fall. Part of that gap is the assay \u2014 MFASS '
                        + 'measures a 170 nt minigene, an exon cut off from its real neighbours and kilobase introns \u2014 '
                        + 'which is why the rank agrees and the scale does not. Increases in inclusion are not '
                        + 'calibrated at all and are never reported as a finding. Terminal exons have no skip event. '
                        + 'Ranking is by \u0394. '
                        + (data.dpsi_note ? (' ' + esc(data.dpsi_note) + '.') : '')
                        + '</div></div>';

                    const __ov = OV.open({
                        id: 'baja-splice-clinvar-summary',
                        // Raw, not esc(): the shell sets the title with textContent.
                        title: 'ClinVar variants that change splicing \u2014 ' + gene,
                        body: html
                    });

                    // WIRE THE ROWS UP. The panel is ours and already in the document, so the
                    // handlers go straight on: no polling for rows the host might have
                    // rewritten, and no stripped on* attributes to work around.
                    const byWx = {};
                    for (const x of placed) byWx['' + x.wx] = x;
                    let rows = [];
                    try { rows = Array.prototype.slice.call(__ov.panel.querySelectorAll('tr.spl-row[data-splice-wx]')); } catch (e) { rows = []; }
                    for (const el of rows) {
                        try {
                            el.addEventListener('mouseenter', () => { try { el.style.background = 'rgba(79,208,230,0.10)'; } catch (e) { } });
                            el.addEventListener('mouseleave', () => { try { el.style.background = ''; } catch (e) { } });
                            el.addEventListener('click', () => {
                                const x = byWx['' + el.getAttribute('data-splice-wx')];
                                if (!x) return;
                                // Closed first: the panel covers the canvas, so zooming
                                // underneath it would be invisible.
                                __ov.close();
                                // THE SHARED VARIANT ZOOM, not a hand-rolled x-range. This used
                                // to be graph.zoom(wx - 80, wx + 80), which sets no vertical
                                // range at all -- so the variant arrived on screen with its
                                // lollipop (stem, head and label, ~30-150 px above the track)
                                // clipped off the top, and at a zoom that may not show the
                                // sequence. zoom-to-variant.js is the same code the Variants
                                // menu uses, and it also does the spotlight.
                                (async () => {
                                    try {
                                        const ZV = await exec('baja/manchester/menu/zoom-to-variant.js');
                                        await ZV(graph, track, x.snp, { select: true });
                                        graph.setResultMessage(' ' + (el.getAttribute('data-splice-label') || 'variant')
                                            + ' \u00b7 \u0394' + x.sc.toFixed(2) + ' \u00b7 ' + (x.h.effect || '') + ' ');
                                    } catch (e) {
                                        try { graph.setMessage(' Could not zoom to that variant: ' + e + ' '); } catch (e2) { }
                                    }
                                })();
                            });
                        } catch (e) { }
                    }
                } catch (e) { try { log('splice summary window: ' + e); } catch (e2) { } }

                // The closing line leads with the count that matters -- the ones nobody had
                // called splice variants -- and states what the score is, because a number
                // labelled only "splice" invites being read as a pathogenicity call.
                graph.setResultMessage(' ' + gene + ': ' + added + ' ClinVar variant'
                    + (added === 1 ? '' : 's') + ' move a splice site (\u0394\u2265' + minDelta + '), '
                    + novel + ' of them NOT annotated as splice variants'
                    + (skipped ? (', ' + skipped + ' outside the selection') : '')
                    + (unmapped ? (', ' + unmapped + ' off this track') : '')
                    + '. Strongest \u0394' + best.toFixed(2) + ', ' + toPulse.length + ' pulsing. '
                    + 'Red/amber = a site is weakened, violet/blue = a cryptic site appears. '
                    + 'This is change in splice-site probability \u2014 not \u0394PSI, not pathogenicity. ');
                return true;
            } catch (e) {
                graph.setMessage(' ClinVar splice variants failed: ' + (e && e.message ? e.message : e) + ' ');
                restoreHover(); return false;
            } finally {
                try { exec('baja/lib/work-status.js', ''); } catch (e) { }
            }
        };

        // ---- the menu: threshold, then a track ------------------------------------------
        const TIERS = [
            { label: 'strong  Δ ≥ 0.5', minDelta: '0.5' },
            { label: 'moderate  Δ ≥ 0.2', minDelta: '0.2' },
            { label: 'weak  Δ ≥ 0.1  (more, noisier)', minDelta: '0.1' },
        ];

        const pickTrack = (opts) => {
            const tracks = (graph.track || []).filter(Boolean);
            const run = async (t) => { await runOnTrack(t, opts); resolve(); };
            if (presetTrack) { run(presetTrack); return; }
            if (tracks.length === 1) { run(tracks[0]); return; }
            // openMenuAtPointer, not showSideMenu: this level must appear where the level
            // above it did, in the same style. Reached from the tier menu, which leaves a
            // floating session behind it, so it lands on the same point.
            const __pick = [{ label: 'Score which track?', header: true }].concat(
                tracks.map((t) => ({
                    label: '  ' + (t.name || geneOf(t) || 'track'),
                    move: () => { }, click: () => { try { graph.showSideMenu(null); } catch (e) { } run(t); },
                })));
            if (graph.openMenuAtPointer) graph.openMenuAtPointer(__pick, 'Splicing');
            else graph.showSideMenu(__pick);
        };

        // The tool's first question. Launched from the models shelf, which is HTML and carries
        // no canvas point, so there is no floating session to inherit -- openMenuAtPointer puts
        // it at the pointer (or the middle of the canvas) in the floating style rather than
        // sending it to the top-left side panel.
        const __tiers = [
            { label: 'ClinVar variants that change splicing', header: true },
            { label: '  within 300 nt of a splice site', header: true },
        ].concat(TIERS.map((t) => ({
            label: '  ' + t.label,
            move: () => { },
            click: () => { try { graph.showSideMenu(null); } catch (e) { } pickTrack({ minDelta: t.minDelta, win: '300' }); },
        })), [
            { label: '  deep intronic too (±2000 nt, Δ ≥ 0.5)', move: () => { },
              click: () => { try { graph.showSideMenu(null); } catch (e) { } pickTrack({ minDelta: '0.5', win: '2000' }); } },
            { label: '‹ Cancel', move: () => { }, click: () => { try { graph.showSideMenu(null); } catch (e) { } restoreHover(); resolve(); } },
        ]);
        if (graph.openMenuAtPointer) graph.openMenuAtPointer(__tiers, 'Splicing');
        else graph.showSideMenu(__tiers);
    });
}
