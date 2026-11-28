function (graph, track, range, opts) {

    // WHAT EXON STRUCTURE THIS STRETCH OF SEQUENCE SUPPORTS.
    //   await exec('baja/bio/splicing/region-exon-structure.js', graph, track,
    //              { start: <world>, end: <world> }, {});
    //
    // Selecting a region and asking "where are the splice sites, and what exons do they
    // make" was two tools and a piece of arithmetic in between. The site model would draw
    // its donors and acceptors as a sashimi layer, which answers "how strong is this site"
    // -- but the question behind the selection is the STRUCTURE: given these sites, where
    // does an exon begin and end, which of its edges are the ones the transcript already
    // uses, and which are new.
    //
    // So this scores the sites once, pairs them in transcript order into exons, and lays the
    // result beside the annotation. Three answers come out of it and they are different:
    //
    //   KNOWN      a predicted edge within 2 nt of an annotated exon edge: the model agrees
    //              with the gene model, which is the control for everything else here
    //   NEW        a site the model supports where the annotation has none
    //   MISSED     an annotated edge the model does not support in this window, which is a
    //              statement about the model and not about the gene
    //
    // WHAT THE DINUCLEOTIDE ADDS. Every site is checked against the sequence itself: GT at a
    // donor, AG at an acceptor (AC and CT on a minus-strand track, read the way the
    // transcript reads them). A high score on a position with neither is the model
    // generalizing from context, and worth seeing as such rather than being folded into one
    // number that cannot be taken apart.
    //
    // NOTHING HERE IS A MEASUREMENT. The scores are a reading of sequence. No reads, no
    // coverage, nothing that says the spliceosome does any of it -- which is exactly why
    // the agreement with the annotation is reported: it is the only part of the output that
    // has been checked against something that happened.

    return (async () => {
        const o = opts || {};
        const t = track || {};
        const say = (m) => {
            try { graph.setResultMessage(' ' + m + ' '); }
            catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } }
        };
        const who = t.name || 'This track';
        const fmt = (n) => (Math.round(+n) || 0).toLocaleString();
        const refuse = (why) => { say(why); return { ok: false, why: why }; };

        const r = range || {};
        const lo = Math.min(Math.floor(+r.start), Math.floor(+r.end));
        const hi = Math.max(Math.floor(+r.start), Math.floor(+r.end));
        if (!isFinite(lo) || !isFinite(hi) || hi <= lo) {
            return refuse('Select a stretch of sequence first: an exon structure is predicted '
                + 'inside a region, not at a point.');
        }
        const span = hi - lo + 1;
        const MIN_LEN = (o.min_len != null) ? +o.min_len : 25;
        const MAX_LEN = (o.max_len != null) ? +o.max_len : 1000;
        const MIN_SITE = (o.min_site != null) ? +o.min_site : 0.10;
        if (span < MIN_LEN + 10) {
            return refuse('That selection is ' + fmt(span) + ' nt. An exon needs an acceptor and '
                + 'a donor with at least ' + MIN_LEN + ' nt between them, so there is no '
                + 'structure to predict in a window this short.');
        }

        const seq = '' + (t.sequence || '');
        if (!seq) {
            return refuse(who + ' has no sequence loaded, so there is nothing to find splice '
                + 'sites in. Load the transcript as pre-mRNA and select the region again.');
        }
        const xi = (t.xi != null) ? Math.floor(+t.xi) : 0;
        const plus = +(t.strand != null ? t.strand : 1) >= 0;

        // ---- THE SITES, SCORED ONCE PER TRACK ------------------------------------------
        //
        // The model scores the WHOLE track and takes seconds doing it, and the natural way
        // to use this tool is to run it on one region, look, move the selection and run it
        // again. Three runs of the same scoring over the same unchanged sequence is a
        // half-minute spent re-deriving an answer already in hand, so it is kept on the
        // track, keyed by the sequence it was computed from -- a reload, a different
        // transcript or an edited sequence all change the key and the model is asked again.
        // The key ends in _transient_ so the saver leaves it out of the file: it is derived
        // from the sequence and would be stale the moment the sequence was not.
        const key = seq.length + ':' + xi + ':' + (plus ? '+' : '-');
        let prof = o.profile || null;
        if (!prof) {
            try {
                const c = t.__sitesProfile_transient_;
                if (c && c.key === key) prof = c.profile;
            } catch (e) { prof = null; }
        }
        if (!prof) {
            say('Scoring the splice sites of ' + who + '…');
            const P = await exec('baja/bio/splicing/sites-profile.js', t, {});
            if (!P || !P.ok) return refuse(((P && P.reason) || 'The site model returned nothing.'));
            prof = { acceptor: P.acceptor || [], donor: P.donor || [] };
            try {
                Object.defineProperty(t, '__sitesProfile_transient_',
                    { value: { key: key, profile: prof }, writable: true, configurable: true });
            } catch (e) { try { t.__sitesProfile_transient_ = { key: key, profile: prof }; } catch (e2) { } }
        }

        // ---- WHAT THE SEQUENCE ITSELF SAYS AT EACH SITE ----------------------------------
        //
        // The model's position convention (the one cryptic-exon-candidates.js follows): an
        // acceptor sits on the last INTRONIC base before the exon, a donor on the first
        // intronic base after it. So on a plus-strand track the acceptor is the G of AG and
        // the donor is the G of GT; on a minus-strand track the transcript reads the other
        // way and the same two sites read AC and CT in genomic order.
        const baseAt = (x) => {
            const i = Math.floor(x) - xi;
            if (i < 0 || i >= seq.length) return 'N';
            return ('' + seq.charAt(i)).toUpperCase().replace(/U/g, 'T');
        };
        const pairAt = (x) => baseAt(x) + baseAt(x + 1);
        const DONOR_NT = plus ? 'GT' : 'AC';
        const ACCEPT_NT = plus ? 'AG' : 'CT';
        const donorNt = (x) => (plus ? pairAt(x) : pairAt(x - 1));
        const acceptNt = (x) => (plus ? pairAt(x - 1) : pairAt(x));

        // ---- THE ANNOTATION, TO LAY THE PREDICTION BESIDE --------------------------------
        const annotated = exonsOfTrack(t)
            .map((e) => ({ lo: Math.min(+e.xi, +e.xf), hi: Math.max(+e.xi, +e.xf) }))
            .filter((e) => isFinite(e.lo) && isFinite(e.hi))
            .sort((a, b) => a.lo - b.lo);
        // Every annotated edge inside the window, as a flat list of coordinates to measure
        // against. An edge just outside the window still counts: a selection cut through the
        // middle of an exon should not report that exon's far edge as missing.
        const edges = [];
        annotated.forEach((e, i) => {
            edges.push({ x: e.lo, which: plus ? 'acceptor' : 'donor', exon: i + 1 });
            edges.push({ x: e.hi, which: plus ? 'donor' : 'acceptor', exon: i + 1 });
        });
        const NEAR = (o.near != null) ? +o.near : 2;
        const nearestEdge = (x, which) => {
            let best = null;
            for (const e of edges) {
                if (e.which !== which) continue;
                const d = Math.abs(e.x - x);
                if (best === null || d < best.d) best = { d: d, e: e };
            }
            return best;
        };

        const inWindow = (p) => +p[0] >= lo && +p[0] <= hi;
        const mkSites = (list, which) => (list || [])
            .filter((p) => p && isFinite(+p[0]) && +p[1] >= MIN_SITE && inWindow(p))
            .map((p) => {
                const x = Math.floor(+p[0]);
                const nt = (which === 'donor') ? donorNt(x) : acceptNt(x);
                const want = (which === 'donor') ? DONOR_NT : ACCEPT_NT;
                const near = nearestEdge(x, which);
                return {
                    x: x, score: +p[1], which: which, nt: nt, canonical: nt === want,
                    known: !!(near && near.d <= NEAR),
                    offBy: near ? near.d : null,
                    exon: (near && near.d <= NEAR) ? near.e.exon : null
                };
            })
            .sort((a, b) => b.score - a.score);
        const donors = mkSites(prof.donor, 'donor');
        const acceptors = mkSites(prof.acceptor, 'acceptor');

        if (!donors.length && !acceptors.length) {
            return refuse(who + ': the site model scores nothing above ' + MIN_SITE.toFixed(2)
                + ' in ' + fmt(lo) + '–' + fmt(hi) + ' (' + fmt(span) + ' nt). That is a '
                + 'region with no splice site the model supports, which for a stretch of deep '
                + 'intron is the expected answer.');
        }

        // ---- PAIRING THEM INTO EXONS -----------------------------------------------------
        //
        // An exon is an acceptor and, downstream OF THE TRANSCRIPT, a donor. Transcript
        // order is where this goes wrong silently: on a minus-strand track the acceptor is
        // the larger coordinate, and pairing by ascending x there proposes every exon
        // backwards while scoring each one as though it were real.
        const pairs = [];
        for (const a of acceptors) {
            for (const d of donors) {
                const exLo = plus ? (a.x + 1) : (d.x + 1);
                const exHi = plus ? (d.x - 1) : (a.x - 1);
                const len = exHi - exLo + 1;
                if (len < MIN_LEN || len > MAX_LEN) continue;
                if (exLo < lo || exHi > hi) continue;
                pairs.push({
                    xi: exLo, xf: exHi, len: len,
                    acceptor: a, donor: d,
                    // THE WEAKER END DECIDES. A perfect donor with nothing in front of it
                    // splices nothing, so the pair is worth what its worse half is worth.
                    score: Math.min(a.score, d.score),
                    frame: len % 3,
                    bothKnown: a.known && d.known,
                    canonical: a.canonical && d.canonical
                });
            }
        }
        // The structure is a set of exons that do not overlap: two proposals sharing bases
        // are the same exon with one edge moved, not two exons, and drawing both would read
        // as a gene with twice the structure the sequence supports. Best first, and an
        // exon both of whose edges are annotated outranks a stronger one that is new --
        // the agreement is the firmer claim.
        pairs.sort((p, q) => (q.bothKnown - p.bothKnown) || (q.score - p.score) || (p.len - q.len));
        const chain = [];
        for (const p of pairs) {
            if (chain.some((x) => Math.min(x.xf, p.xf) - Math.max(x.xi, p.xi) >= 0)) continue;
            chain.push(p);
            if (chain.length >= ((o.max_exons != null) ? +o.max_exons : 12)) break;
        }
        chain.sort((p, q) => p.xi - q.xi);

        // ---- AND WHAT THE ANNOTATION HAS THAT THE MODEL DOES NOT -------------------------
        const missed = edges
            .filter((e) => e.x >= lo && e.x <= hi)
            .filter((e) => {
                const pool = (e.which === 'donor') ? donors : acceptors;
                return !pool.some((s) => Math.abs(s.x - e.x) <= NEAR);
            })
            .map((e) => ({ x: e.x, which: e.which, exon: e.exon }));

        const out = {
            ok: true, track: t, lo: lo, hi: hi, span: span, plus: plus,
            donors: donors, acceptors: acceptors, exons: chain, missed: missed,
            known: chain.filter((c) => c.bothKnown).length,
            novel: chain.filter((c) => !c.bothKnown).length
        };
        if (o.quiet) return out;

        await show(out);
        return out;

        // ---- THE WINDOW -------------------------------------------------------------------
        async function show(res) {
            const OV = await exec('baja/lib/canvas-overlay-panel.js');
            const K = OV.colors;
            const esc = (x) => ('' + (x == null ? '' : x)).replace(/&/g, '&amp;')
                .replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const pct = (s) => (+s).toFixed(2);
            const th = (s) => '<th style="text-align:left;padding:3px 14px 6px 0;color:' + K.dim
                + ';font-weight:600;white-space:nowrap;">' + esc(s) + '</th>';
            const td = (s, c) => '<td style="padding:3px 14px 3px 0;color:' + (c || K.text)
                + ';white-space:nowrap;">' + s + '</td>';
            const tag = (txt, c) => '<span style="color:' + c + ';font-weight:600;">'
                + esc(txt) + '</span>';
            const KNOWN = K.ok, NEW = K.accent, WARN = K.warm;

            const siteTable = (list, which) => {
                if (!list.length) {
                    return '<div style="color:' + K.dim + ';font:12.5px ' + K.font
                        + ';padding:4px 0 10px;">No ' + which + ' above ' + MIN_SITE.toFixed(2)
                        + ' in this window.</div>';
                }
                const rows = list.slice(0, 12).map((s) => '<tr>'
                    + td(fmt(s.x))
                    + td(pct(s.score), s.score >= 0.5 ? K.text : K.dim)
                    + td(esc(s.nt), s.canonical ? K.text : WARN)
                    + td(s.known ? tag('annotated edge of exon ' + s.exon, KNOWN)
                        : tag('not in the annotation', NEW)
                            + (s.offBy != null && s.offBy < 200
                                ? ('<span style="color:' + K.dim + ';"> · ' + fmt(s.offBy)
                                    + ' nt from one</span>') : ''))
                    + '</tr>').join('');
                return '<table style="border-collapse:collapse;font:12.5px ' + K.font + ';">'
                    + '<tr>' + th('position') + th('score') + th('seq')
                    + th('against the gene model') + '</tr>' + rows + '</table>'
                    + (list.length > 12 ? ('<div style="color:' + K.dim + ';font:12px ' + K.font
                        + ';padding:4px 0 0;">' + (list.length - 12) + ' more below these.</div>') : '');
            };

            const exonRows = res.exons.map((c, i) => '<tr>'
                + td('' + (i + 1))
                + td(fmt(c.xi) + '–' + fmt(c.xf))
                + td(fmt(c.len) + ' nt', c.frame === 0 ? K.text : K.dim)
                + td(c.frame === 0 ? 'in frame' : ('frame ' + c.frame),
                    c.frame === 0 ? KNOWN : WARN)
                + td(pct(c.score))
                + td(c.bothKnown ? tag('annotated', KNOWN)
                    : (c.acceptor.known || c.donor.known)
                        ? tag('one edge annotated, one new', WARN)
                        : tag('new', NEW))
                + '</tr>').join('');

            const head = '<div style="color:' + K.dim + ';font:12.5px/1.6 ' + K.font
                + ';margin-bottom:12px;">' + esc(who) + ' · ' + fmt(res.lo) + '–'
                + fmt(res.hi) + ' · ' + fmt(res.span) + ' nt · '
                + (res.plus ? 'plus' : 'minus') + ' strand · '
                + res.acceptors.length + ' acceptor and ' + res.donors.length
                + ' donor position' + (res.donors.length === 1 ? '' : 's') + ' above '
                + MIN_SITE.toFixed(2) + '</div>';

            const h = (s) => '<div style="margin:16px 0 6px;color:' + K.text + ';font:600 13px '
                + K.font + ';">' + esc(s) + '</div>';

            const body = head
                + h('The exon structure these sites make')
                + (res.exons.length
                    ? ('<table style="border-collapse:collapse;font:12.5px ' + K.font + ';">'
                        + '<tr>' + th('#') + th('exon') + th('length') + th('frame')
                        + th('score') + th('against the gene model') + '</tr>' + exonRows
                        + '</table>')
                    : ('<div style="color:' + K.dim + ';font:12.5px/1.6 ' + K.font + ';">'
                        + 'No acceptor in this window has a donor after it, in transcript '
                        + 'order, at a distance that would make an exon (' + MIN_LEN
                        + '–' + MAX_LEN + ' nt). The sites are below: this is a window '
                        + 'with splice sites in it but not a whole exon.</div>'))
                + h('Donor sites (5′, ' + DONOR_NT + ' here)')
                + siteTable(res.donors, 'donor')
                + h('Acceptor sites (3′, ' + ACCEPT_NT + ' here)')
                + siteTable(res.acceptors, 'acceptor')
                + (res.missed.length
                    ? (h('Annotated edges the model does not support')
                        + '<div style="color:' + K.dim + ';font:12.5px/1.7 ' + K.font + ';">'
                        + res.missed.slice(0, 8).map((m) => esc(m.which + ' of exon ' + m.exon
                            + ' at ' + fmt(m.x))).join('<br>')
                        + (res.missed.length > 8 ? ('<br>and ' + (res.missed.length - 8)
                            + ' more') : '')
                        + '<div style="margin-top:6px;">This is a statement about the model, '
                        + 'not about the gene: these junctions are in the annotation because '
                        + 'they were observed.</div></div>')
                    : '')
                + '<div style="margin-top:18px;color:' + K.dim + ';font:12px/1.65 ' + K.font
                + ';max-width:660px;">Every score is a reading of the sequence by the site '
                + 'model — no reads, no coverage, nothing here says the spliceosome uses '
                + 'any of these. The one part that has been checked against something that '
                + 'happened is the agreement column: ' + res.known + ' of these '
                + res.exons.length + ' exon' + (res.exons.length === 1 ? '' : 's')
                + ' had both edges already in the gene model. The sequence column is the '
                + 'dinucleotide actually at the position; a high score on a non-canonical '
                + 'one is the model reading context rather than the site itself.</div>';

            const p = OV.open({ id: 'baja-region-exon-structure',
                title: 'Exon structure this region supports', body: body });

            // DRAWING IT IS A SEPARATE ACT. A table can be read and dismissed; a layer stays
            // on the track and will be screenshotted, so it is drawn when asked for and not
            // as a side effect of looking.
            try {
                if (res.exons.length && p && p.body) {
                    const btn = document.createElement('button');
                    btn.textContent = 'Draw these ' + res.exons.length + ' exon'
                        + (res.exons.length === 1 ? '' : 's') + ' on the track';
                    btn.setAttribute('style', 'margin-top:16px;padding:7px 14px;border-radius:6px;'
                        + 'border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);'
                        + 'color:' + K.text + ';font:600 12.5px ' + K.font + ';cursor:pointer;');
                    btn.onclick = async () => {
                        btn.disabled = true;
                        btn.textContent = 'Drawing…';
                        try { await draw(res); btn.textContent = 'Drawn on ' + who; }
                        catch (e) { btn.textContent = 'Could not draw it: ' + e; }
                    };
                    p.body.appendChild(btn);
                }
            } catch (e) { }
        }

        // ---- AND ON THE TRACK --------------------------------------------------------------
        async function draw(res) {
            const TrackLayer = await exec('baja/bio/track-layer.js');
            const L = new TrackLayer((t.name || 'track') + '_PREDEX:' + res.exons.length,
                res.lo, 0, res.hi, 1);
            L.type = 'PredictedExons';
            L.color = 'rgba(159,196,212,0.5)';
            L.labelColor = '#eaf6f9';
            L.fixedIntervalDepth = 12;
            L.allowStackedIntervals = true;
            // A predicted exon in a 40 kb window is thinner than a pixel. Widened to stay
            // visible, and the note says so, because a band drawn wider than its exon is a
            // lie about coordinates unless it is declared.
            const MINDRAW = Math.max(1, Math.round(res.span / 400));
            const COLOR = {
                known: 'rgba(74,222,128,0.55)',     // both edges already annotated
                half: 'rgba(251,191,36,0.55)',      // one edge annotated, one new
                novel: 'rgba(125,211,252,0.50)'     // neither
            };
            const rows = [];
            res.exons.forEach((c, i) => {
                const kind = c.bothKnown ? 'known'
                    : (c.acceptor.known || c.donor.known) ? 'half' : 'novel';
                let dLo = c.xi, dHi = c.xf;
                if (c.len < MINDRAW) {
                    const pad = Math.floor((MINDRAW - c.len) / 2);
                    dLo = c.xi - pad; dHi = c.xf + pad;
                }
                L.addInterval(dLo, dHi, 0.55, '#' + (i + 1) + ' · ' + fmt(c.len) + ' nt · '
                    + (c.frame === 0 ? 'in frame' : 'frame ' + c.frame), COLOR[kind]);
                rows.push(['#' + (i + 1) + '  ' + fmt(c.xi) + '–' + fmt(c.xf),
                    fmt(c.len) + ' nt · ' + (c.frame === 0 ? 'in frame' : 'frame ' + c.frame)
                    + ' · acceptor ' + fmt(c.acceptor.x) + ' (' + c.acceptor.score.toFixed(2)
                    + ', ' + c.acceptor.nt + ') · donor ' + fmt(c.donor.x) + ' ('
                    + c.donor.score.toFixed(2) + ', ' + c.donor.nt + ') · '
                    + (kind === 'known' ? 'both edges annotated'
                        : kind === 'half' ? 'one edge annotated' : 'neither edge annotated')]);
            });
            L.decor = {
                help: {
                    title: 'Exon structure predicted over ' + fmt(res.lo) + '–' + fmt(res.hi),
                    rows: rows,
                    note: 'Each band is an acceptor paired with a donor after it in transcript '
                        + 'order, both scored by the site model, between ' + MIN_LEN + ' and '
                        + MAX_LEN + ' nt apart and not overlapping a better pair. Green means '
                        + 'both edges are already in the gene model, amber one of them, blue '
                        + 'neither. Nothing here is a measurement: no reads say any of these '
                        + 'exons is used. Bands narrower than ' + MINDRAW + ' bases at this '
                        + 'zoom are drawn at that width so they stay visible; the length in '
                        + 'every label and row is the real one.'
                }
            };
            L.predictedExons = res.exons;
            try { t.addLayer(L); } catch (e) { try { (t.track_layers || []).push(L); } catch (e2) { } }
            try { if (L.setTimedHighlight) L.setTimedHighlight(10000); } catch (e) { }
            try { if (graph.rescale) graph.rescale(); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            say(who + ': ' + res.exons.length + ' predicted exon'
                + (res.exons.length === 1 ? '' : 's') + ' drawn over ' + fmt(res.lo) + '–'
                + fmt(res.hi) + ' — ' + res.known + ' with both edges already annotated, '
                + res.novel + ' not. These are proposals from sequence, not measurements.');
            return true;
        }
    })();
}
