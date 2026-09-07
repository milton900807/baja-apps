function (path, config) {
    // THE CHROMOSOME VIEW. A whole genome as a row of vertical ideograms, smallest on the
    // left, and the graph's own world coordinates underneath so a region can be picked off a
    // chromosome by dragging on it.
    //
    // It is built on the same graph as manchester/editor.js and draws through the same world
    // -> screen converter, which is the point: the zoom, the pan and the selection rectangle
    // are the ones the editor already has, so a region chosen here is in the same coordinate
    // space as everything else and can be handed straight to the transcript loader.
    //
    // WORLD SPACE.
    //   x   one unit per chromosome, in ascending size, centred at i + 0.5. Order is the
    //       whole idea: the eye reads a ramp, and a chromosome that is out of place in a ramp
    //       is visible in a way that one out of place in a numbered row is not.
    //   y   megabases, drawn DOWNWARD from 0, at true scale and shared across every
    //       chromosome. Sharing it is what makes the picture worth looking at -- chr1 really
    //       is eight times chr21, and an ideogram that normalises each chromosome to the same
    //       height throws that away.
    //
    // Nothing is scaled per chromosome and nothing is stretched to fit. A genome drawn to one
    // scale is a genome you can compare.
    if (Array.isArray(path)) path = path[0];

    return (async () => {
        if (!window.__bajaFreeTier) {
            let __sub = await exec('lib/subscription.js');
            if ((await __sub.enforce(true)) === false) return;
        }

        // EVERY STAGE SAYS SO. This view has now failed twice in ways that look identical
        // from the outside -- an empty screen with no exception -- once for a canvas that was
        // never mounted and once for a hook that threw only on mouse events. A blank screen
        // is not a diagnosis, and these lines are what turned both of those into one-step
        // fixes.
        const step = (m) => { try { console.log('[karyotype] ' + m); } catch (e) { } };
        step('start; path=' + JSON.stringify(path));

        const server = (window['env'] && window['env']['apiUrl']) || '';
        const MB = 1e6;                 // one world unit per megabase
        const BAR_W = 0.62;             // chromosome bar width, in world units (of the 1.0 slot)
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Giemsa stains as everyone draws them: the darker the band, the darker the grey.
        // acen is the centromere and is drawn as the pinch rather than as a band; stalk and
        // gvar are the satellite/variable regions and get their own tint so they do not read
        // as ordinary heterochromatin.
        const STAIN = {
            gneg: '#f7f9fc', gpos25: '#c7d0da', gpos50: '#9aa7b4',
            gpos75: '#6b7a89', gpos100: '#44515e', gvar: '#b9c9e6', stalk: '#8fb8d6',
        };

        // ---- which species -------------------------------------------------------------------
        const ask = () => new Promise((resolve) => {
            const panel = document.createElement('div');
            panel.id = 'baja-karyotype-ask';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);">'
                + '<div style="min-width:0;"><div style="font:700 20px Arial;">Chromosomes</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + 'Every chromosome of a genome, drawn to one scale.</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + '<button id="ky-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                + '<button id="ky-go" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Draw</button>'
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                + '<div style="width:100%;max-width:640px;margin:0 auto;">'
                + '<label style="display:block;font:600 12px Arial;color:#9fb3c8;margin:0 0 6px;">Species</label>'
                + '<input id="ky-q" value="human" style="width:100%;box-sizing:border-box;background:#0a1e3a;'
                + 'color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 11px;font:13px Arial;"/>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">'
                + '<b>human</b> &middot; <b>mouse</b> &middot; <b>rat</b> &middot; <b>dog</b></div>'
                + '</div></div>';
            document.body.appendChild(panel);
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            const q = (s) => panel.querySelector(s);
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            panel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { close(); resolve(null); }
                else if (e.key === 'Enter') q('#ky-go').click();
            });
            q('#ky-cancel').onclick = () => { close(); resolve(null); };
            q('#ky-go').onclick = () => { const v = ('' + q('#ky-q').value).trim(); if (!v) return; close(); resolve(v); };
            // focusUnlessMobile is a GLOBAL -- lib/core.js is the standard library and is
            // already in scope. exec('lib/core.js') fetches and compiles it a second time
            // into the same scope, which fails on its very first line:
            // "Identifier 'host' has already been declared". Every other caller in the
            // repository just calls it.
            try { focusUnlessMobile(q('#ky-q')); } catch (e) { }
        });

        // A PATH IS NOT A SPECIES. On a browser reload the engine binds `path` to the URL
        // argument map, which arrives as junk for an app that takes no file --
        // ["/<folder>/<file>.baja", "undefined"], or the literal string "undefined". Treating
        // that as the species skipped the dialog and asked the server about a filename, which
        // fails silently behind a modal. Only something that could actually BE a species name
        // -- a few letters and spaces -- is taken as one.
        const asSpecies = (v) => {
            const t = ('' + (v == null ? '' : v)).trim();
            if (!t || t.length > 40) return '';
            if (/^undefined$/i.test(t) || t.indexOf('/') >= 0 || t.indexOf('.') >= 0) return '';
            return /^[A-Za-z][A-Za-z .'-]*$/.test(t) ? t : '';
        };
        const preset = asSpecies(path);
        step(preset ? ('species from the path: ' + preset) : 'asking for a species');
        const wanted = preset || await ask();
        step('species: ' + JSON.stringify(wanted));
        if (!wanted) return false;

        // ---- the table -----------------------------------------------------------------------
        let r = null;
        try {
            const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
            r = await exec(server + '/py/bio/karyotype.py', em, wanted);
        } catch (e) { r = null; step('the karyotype call threw: ' + (e && e.message ? e.message : e)); }
        step('table: ' + (r ? ((r.error ? ('error ' + r.error) : (r.assembly || 'no assembly'))) : 'no result'));
        let chroms = [];
        try { chroms = JSON.parse((r && r.chromosomes) || '[]'); } catch (e) { chroms = []; }
        if (!r || r.error || !chroms.length) {
            step('stopping: ' + ((r && r.error) || 'no chromosomes came back'));
            try { showModal({ wid: 'html', data: '<div style="padding:18px;font:14px Arial;">' + esc((r && r.error) || 'No chromosomes could be loaded.') + '</div>' }); } catch (e) { }
            return false;
        }

        // SMALLEST FIRST. Not chr1..chrY: the size order is the thing being shown, and the
        // numbering is only approximately the size order anyway -- chr21 is smaller than
        // chr22, which is why the numbering has been known to be wrong since 1971.
        const drawn = chroms.filter((c) => c.name !== 'chrM' && +c.length > 0)
            .slice().sort((a, b) => a.length - b.length);
        const maxMb = drawn.reduce((m, c) => Math.max(m, c.length / MB), 0);

        // ---- the graph, AND ITS CANVAS ---------------------------------------------------------
        //
        // exec('flexigraph/gene.js') builds the graph object. It does not put anything on the
        // screen: the canvas is a component the graph makes on request, and until it is
        // mounted into a widget there is nothing to draw on. The first version of this file
        // skipped that and drew a whole karyotype onto a canvas that was never in the
        // document -- the status line reported 25 chromosomes and the screen stayed empty,
        // which is exactly what a correct program with no canvas looks like.
        step('building the graph');
        const graph = await exec('flexigraph/gene.js');
        step('graph ready: ' + (graph ? typeof graph.createComponent : 'NO GRAPH'));

        const geneGraph = await graph.createComponent();
        step('canvas component: ' + (geneGraph && geneGraph.wid));
        geneGraph.height = '100%';
        // The SAME nesting editor.js uses: a geneGraphPanel card holding the toolbar row and
        // the canvas row, wrapped in a mainPanel card. Flattening the two into one card is
        // the obvious simplification and it is not what the renderer is fed anywhere else, so
        // it is not the thing to be original about while the screen is blank.
        const genegraph_panel_layout = {
            wid: 'card',
            componentRef: 'geneGraphPanel',
            data: {
                cards: [[
                    {
                        'width': '100%',
                        'component': {
                            wid: 'button-menu',
                            data: {
                                buttons: [
                                    {
                                        label: 'Species', icon: 'travel_explore',
                                        tooltip: 'Draw a different genome',
                                        ionFunction: createIonFunction(async () => {
                                            const v = await ask();
                                            if (v) exec('manchester/karyotype', v);
                                        })
                                    },
                                    {
                                        label: 'Fit', icon: 'fit_screen',
                                        tooltip: 'Frame the whole genome again',
                                        ionFunction: createIonFunction(async () => { await fit(); arm(); })
                                    },
                                ]
                            }
                        }
                    }
                ], [
                    { 'width': '100%', 'height': '100%', 'component': geneGraph }
                ]]
            }
        };
        const main_layout = {
            wid: 'card',
            height: '100%',
            componentRef: 'mainPanel',
            data: {
                cards: [[
                    { 'width': '100%', 'height': '100%', 'component': genegraph_panel_layout }
                ]]
            }
        };
        graph.genegraph_panel_layout = genegraph_panel_layout;
        try { clear(); } catch (e) { }
        showWidget(main_layout);
        try { CurrentLayout.stash('mainPanel', main_layout); } catch (e) { }
        try { CurrentLayout.stash('graph', graph); } catch (e) { }
        step('canvas mounted');

        // TWO THRESHOLDS, because there are two useful answers to "where is this".
        //
        // Every chromosome is drawn at the SAME scale from the same top line -- that is the
        // whole design -- so one axis down the side gives the genomic coordinate for all of
        // them at once. That appears as soon as a chromosome is a hundredth of the canvas,
        // which is to say almost always.
        //
        // Per-chromosome rulers appear only when one chromosome fills a fifth of the screen.
        // Drawing twenty-four of them at the whole-genome fit is a picket fence: the bars are
        // 31 px apart and a "150 Mb" label is 40 px wide, so every label would sit on its
        // neighbour and none would be readable. The shared axis says the same thing and says
        // it once.
        const COORD_FRACTION = 0.01;        // the shared axis
        const COORD_PER_CHROM = 0.20;       // a ruler beside one chromosome
        // The nucleus is drawn while the whole genome still reads as one object -- when the
        // widest chromosome is a small fraction of the canvas. Zoomed into one chromosome it
        // would be a meaningless arc through the picture.
        const NUCLEUS_MAX_BAR = 0.09;

        // A TICK INTERVAL SOMEONE CAN READ. 1, 2 or 5 times a power of ten -- the intervals
        // people already read axes in. A step of 3,170,494 is arithmetically fine and nobody
        // has ever wanted it.
        const niceStep = (raw) => {
            if (!(raw > 0)) return 0;
            const mag = Math.pow(10, Math.floor(Math.log10(raw)));
            const n = raw / mag;
            return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
        };
        // Labelled in the unit the STEP is in, not the position: ticks 1 kb apart read as
        // 117,559.6 kb rather than as 0.1175596 Mb, and the decimals follow the step too, so
        // consecutive labels never print the same number twice.
        const fmtBp = (bp, step) => {
            if (step >= 1e6) return (bp / 1e6).toFixed(step >= 1e7 ? 0 : 1) + ' Mb';
            if (step >= 1e3) return (bp / 1e3).toFixed(step >= 1e4 ? 0 : 1) + ' kb';
            return Math.round(bp).toLocaleString() + ' bp';
        };
        const fmtSpan = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' Mb'
            : n >= 1e3 ? (n / 1e3).toFixed(1) + ' kb' : Math.round(n) + ' bp');

        // Base position -> world y. One place, because getting it wrong in one of the five
        // places that need it would put bands on a chromosome they do not belong to.
        const wy = (bp) => -bp / MB;

        // THE WORLD MUST BE AT LEAST TEN TIMES WIDER THAN IT IS TALL.
        //
        // animateTo() enforces a minimum aspect ratio of 10:1 on any frame it is given: below
        // that it widens x to yw * 10 and re-centres. That is right for the tracks this graph
        // was built for, which are long and shallow. A karyotype is the opposite shape, and
        // one chromosome per world unit put 24 units of content beside 294 units of height --
        // an aspect of 0.08, which the rule expanded 118-fold. The chromosomes were still
        // drawn, 0.41 px wide, and the sub-pixel cull in paint() dropped every one of them.
        // A canvas that reports 1920x823 and shows nothing looks like a broken renderer and
        // is a frame the graph quietly refused.
        //
        // So the world x unit is DERIVED from the y extent rather than chosen: one slot is
        // whatever makes the whole picture 10.5 times wider than tall, and the rule never
        // fires. 10.5 rather than 10 so floating point cannot land just under the threshold.
        const frameH = maxMb * 1.18;                       // world height of the fitted view
        const SLOT = (frameH * 10.5) / (drawn.length + 0.8);
        const slotOf = (i) => (i + 0.5) * SLOT;
        const barLeft = (i) => slotOf(i) - (BAR_W * SLOT) / 2;
        const barRight = (i) => slotOf(i) + (BAR_W * SLOT) / 2;

        // The ideogram, drawn in WORLD coordinates through g.X / g.Y so it pans and zooms
        // with everything else rather than being an overlay that has to be told what the
        // viewport is doing.
        //
        // NOT graph.plots. That list looks like the obvious hook -- the renderer walks it and
        // calls draw() on each entry -- but it is the MPlot family's list, and the mouse
        // handlers call .inside(grid, x, y) and read .grid on everything in it. An object
        // with only a draw() threw "pl.inside is not a function" on every mouse event, which
        // took the whole interaction down with it.
        //
        // highlightmethod(ctx, geneGraph) is the per-frame hook with no other contract --
        // measure-track.js and variant-tools.js both use it exactly this way. The one thing
        // to know is that clearMouseListeners() nulls it, so arm() re-installs it after
        // clearing, every time.
        const paint = (ctx, g) => {
            {
                if (!ctx || !g) return;
                ctx.save();
                ctx.textBaseline = 'top';
                ctx.textAlign = 'center';
                const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

                // ---- the nucleus -------------------------------------------------------------
                //
                // FIRST, so everything else sits inside it, and only while the whole genome still
                // reads as one object. Zoomed into a single chromosome an envelope arcing through
                // the picture is not context, it is a line across the middle of the thing being
                // looked at -- so it is tied to how wide a chromosome has become, and fades over
                // that range rather than snapping off, because a hard edge on a decorative
                // element reads as a rendering fault.
                //
                // Its extent comes from the CHROMOSOMES, not from the canvas: the envelope has to
                // enclose the karyotype at whatever zoom, and a fixed ellipse would drift off it
                // the moment anything moved.
                const barPx = g.X(barRight(0)) - g.X(barLeft(0));
                const nucAlpha = Math.max(0, Math.min(1,
                    (NUCLEUS_MAX_BAR * ctx.canvas.width - barPx) / (0.045 * ctx.canvas.width)));
                if (nucAlpha > 0.01 && drawn.length) {
                    const lx = g.X(barLeft(0)), rx = g.X(barRight(drawn.length - 1));
                    let ty = g.Y(wy(0)), by = -Infinity;
                    for (let k = 0; k < drawn.length; k++) by = Math.max(by, g.Y(wy(drawn[k].length)));
                    // AN ELLIPSE THROUGH THE CORNERS DOES NOT CONTAIN THEM.
                    //
                    // A box of half-extent (w, h) lies inside an ellipse of semi-axes (a, b)
                    // only where (w/a)^2 + (h/b)^2 <= 1. Padding each axis by a tenth gives
                    // 1.59 -- comfortably outside 1 -- so the end chromosomes and their labels
                    // sat outside the envelope that was supposed to enclose them. Scaling both
                    // axes by sqrt(2) inscribes the box exactly; the extra 6% is the margin
                    // that makes it look like a nucleus rather than a shrink-wrap.
                    //
                    // The box includes the room the names and lengths are drawn in, below the
                    // bars -- they are part of the karyotype and an envelope cutting through
                    // them is the same fault as one cutting through a chromosome.
                    const LABEL_ROOM = 34;
                    const bx = by + LABEL_ROOM;
                    const cx = (lx + rx) / 2, cy = (ty + bx) / 2;
                    const K = Math.SQRT2 * 1.06;
                    const erx = ((rx - lx) / 2) * K, ery = ((bx - ty) / 2) * K;
                    if (isFinite(cx) && isFinite(cy) && erx > 4 && ery > 4) {
                        ctx.save();
                        ctx.globalAlpha = nucAlpha;
                        // Nucleoplasm: enough to lift the chromosomes off the page without
                        // competing with the Giemsa greys they are drawn in.
                        const grad = ctx.createRadialGradient(cx, cy - ery * 0.25, ery * 0.15, cx, cy, Math.max(erx, ery));
                        grad.addColorStop(0, 'rgba(226,236,250,0.85)');
                        grad.addColorStop(1, 'rgba(198,214,238,0.45)');
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, erx, ery, 0, 0, Math.PI * 2);
                        ctx.fillStyle = grad;
                        ctx.fill();
                        // Two membranes with a perinuclear space between them, which is what makes
                        // it read as a nuclear envelope rather than as an oval.
                        ctx.strokeStyle = 'rgba(71,85,105,0.55)';
                        ctx.lineWidth = 1.25;
                        ctx.stroke();
                        const inset = Math.max(3, ery * 0.018);
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, erx - inset, ery - inset, 0, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(71,85,105,0.30)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        // Pores, spaced evenly FROM THE GEOMETRY. Scattering them randomly would
                        // move every one of them on every frame.
                        ctx.fillStyle = 'rgba(71,85,105,0.45)';
                        const pores = 34;
                        for (let k = 0; k < pores; k++) {
                            const a = (k / pores) * Math.PI * 2;
                            ctx.beginPath();
                            ctx.arc(cx + Math.cos(a) * (erx - inset / 2), cy + Math.sin(a) * (ery - inset / 2), 1.6, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        // A nucleolus, off centre and behind everything: the one organelle inside a
                        // nucleus that shows in a light micrograph, so leaving it out is what would
                        // look wrong.
                        ctx.beginPath();
                        ctx.ellipse(cx + erx * 0.30, cy + ery * 0.26, erx * 0.10, ery * 0.13, 0, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(148,163,184,0.34)';
                        ctx.fill();
                        ctx.restore();
                    }
                }

                for (let i = 0; i < drawn.length; i++) {
                    const c = drawn[i];
                    const x0 = g.X(barLeft(i)), x1 = g.X(barRight(i));
                    const w = x1 - x0;
                    if (w < 0.6) continue;                       // narrower than a hairline
                    if (x1 < -40 || x0 > ctx.canvas.width + 40) continue;
                    const yTop = g.Y(wy(0)), yBot = g.Y(wy(c.length));
                    const h = yBot - yTop;
                    if (!isFinite(h) || Math.abs(h) < 0.5) continue;

                    const cen = c.centromere;
                    const rr = Math.min(w * 0.45, Math.abs(h) * 0.02, 14);

                    // A rounded outline for the whole chromosome, used both to clip the bands
                    // and to stroke the edge, so the bands never spill past the arm tips.
                    const outline = () => {
                        ctx.beginPath();
                        ctx.moveTo(x0 + rr, yTop);
                        ctx.arcTo(x1, yTop, x1, yTop + rr, rr);
                        ctx.lineTo(x1, yBot - rr);
                        ctx.arcTo(x1, yBot, x1 - rr, yBot, rr);
                        ctx.lineTo(x0 + rr, yBot);
                        ctx.arcTo(x0, yBot, x0, yBot - rr, rr);
                        ctx.lineTo(x0, yTop + rr);
                        ctx.arcTo(x0, yTop, x0 + rr, yTop, rr);
                        ctx.closePath();
                    };

                    ctx.save();
                    outline();
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.clip();

                    const bands = c.bands || [];
                    if (bands.length) {
                        for (const b of bands) {
                            if (b.stain === 'acen') continue;    // drawn as the pinch below
                            const by0 = g.Y(wy(b.start)), by1 = g.Y(wy(b.end));
                            const bh = by1 - by0;
                            if (Math.abs(bh) < 0.35) continue;   // sub-pixel: would only alias
                            ctx.fillStyle = STAIN[b.stain] || '#dfe6ee';
                            ctx.fillRect(x0, by0, w, Math.max(0.35, bh));
                        }
                    } else {
                        // No banding for this assembly. A flat bar is the honest picture: a
                        // decorative pattern here would be an invented cytogenetic map.
                        ctx.fillStyle = '#e8eef5';
                        ctx.fillRect(x0, yTop, w, h);
                    }
                    ctx.restore();

                    // The centromere: a notch cut from both edges, which is how a karyotype
                    // reads at a glance, plus a hairline at the constriction itself.
                    if (cen && isFinite(+cen.start) && isFinite(+cen.end)) {
                        const cy0 = g.Y(wy(cen.start)), cy1 = g.Y(wy(cen.end));
                        const cw = Math.min(w * 0.32, Math.max(1, w * 0.32));
                        ctx.fillStyle = 'rgba(255,255,255,1)';
                        ctx.beginPath();
                        ctx.moveTo(x0, cy0); ctx.lineTo(x0 + cw, (cy0 + cy1) / 2); ctx.lineTo(x0, cy1);
                        ctx.closePath(); ctx.fill();
                        ctx.beginPath();
                        ctx.moveTo(x1, cy0); ctx.lineTo(x1 - cw, (cy0 + cy1) / 2); ctx.lineTo(x1, cy1);
                        ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = 'rgba(190,60,60,0.85)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(x0 + cw * 0.9, (cy0 + cy1) / 2);
                        ctx.lineTo(x1 - cw * 0.9, (cy0 + cy1) / 2);
                        ctx.stroke();
                    }

                    outline();
                    ctx.strokeStyle = 'rgba(15,23,42,0.55)';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // GENOMIC COORDINATES, once this chromosome is wide enough to carry them.
                    // A chromosome drawn at a fifth of the screen is being looked at rather
                    // than scanned past, and at that width a position is something to read off
                    // instead of infer. Below it the same labels are a picket fence beside a
                    // 48 px bar, so the threshold is the feature and not a guard on it.
                    if (w >= COORD_PER_CHROM * ctx.canvas.width) {
                        // The visible span of THIS chromosome in bases: the viewport's top and
                        // bottom back through the same mapping, clipped to the chromosome so
                        // no tick is drawn past an end that does not exist.
                        const vTop = Math.max(0, Math.min(c.length, -g.Ywc(0) * MB));
                        const vBot = Math.max(0, Math.min(c.length, -g.Ywc(ctx.canvas.height) * MB));
                        const lo = Math.min(vTop, vBot), hi = Math.max(vTop, vBot);
                        const stepBp = niceStep((hi - lo) / 9);
                        if (stepBp > 0 && hi > lo) {
                            // On the right, unless the bar sits close enough to the edge that
                            // the labels would run off the canvas.
                            const right = (x1 + 96 < ctx.canvas.width);
                            const ax = right ? x1 : x0;
                            const dir = right ? 1 : -1;
                            ctx.save();
                            ctx.textAlign = right ? 'left' : 'right';
                            ctx.textBaseline = 'middle';
                            ctx.strokeStyle = 'rgba(71,85,105,0.55)';
                            ctx.fillStyle = '#475569';
                            ctx.lineWidth = 1;
                            ctx.font = '10.5px ' + FONT;
                            ctx.beginPath();
                            ctx.moveTo(ax + dir * 4, g.Y(wy(lo)));
                            ctx.lineTo(ax + dir * 4, g.Y(wy(hi)));
                            ctx.stroke();
                            for (let bp = Math.ceil(lo / stepBp) * stepBp; bp <= hi + 1; bp += stepBp) {
                                const ty = g.Y(wy(bp));
                                ctx.beginPath();
                                ctx.moveTo(ax + dir * 4, ty);
                                ctx.lineTo(ax + dir * 11, ty);
                                ctx.stroke();
                                ctx.fillText(fmtBp(bp, stepBp), ax + dir * 15, ty);
                            }
                            ctx.restore();
                        }
                    }

                    // The name under the long arm, and its length beside it once there is
                    // room for both.
                    if (w > 8) {
                        const cx = (x0 + x1) / 2;
                        ctx.fillStyle = '#0f172a';
                        ctx.font = '600 ' + Math.max(9, Math.min(13, w * 0.42)) + 'px ' + FONT;
                        ctx.fillText(c.name.replace(/^chr/, ''), cx, yBot + 6);
                        if (w > 26) {
                            ctx.fillStyle = '#64748b';
                            ctx.font = '10px ' + FONT;
                            ctx.fillText(Math.round(c.length / MB) + ' Mb', cx, yBot + 22);
                        }
                    }
                }

                // VARIANTS.
                //
                // COST DOES NOT GROW WITH THE FILE. Two modes, chosen per chromosome from how
                // many variants are actually in view:
                //
                //   few    drawn one at a time, with the glow, the edge and the name -- the
                //          twenty someone pasted, or a zoomed-in window of a big file.
                //   many   drawn from the histogram built at load: one strip per bin, so a
                //          chromosome carrying two hundred thousand variants costs the same
                //          2048 bins as one carrying ten. Nothing iterates the variants.
                //
                // The threshold is a count, not a zoom level, because that is the thing that
                // actually decides whether individual marks are readable or a smear.
                if (vtotal) {
                    ctx.save();
                    for (let ci = 0; ci < drawn.length; ci++) {
                        const d = vdata[ci];
                        if (!d.n) continue;
                        const c = drawn[ci];
                        const bx0 = g.X(barLeft(ci)), bx1 = g.X(barRight(ci));
                        if (bx1 < -30 || bx0 > ctx.canvas.width + 120) continue;
                        const bw = bx1 - bx0;

                        // The visible window of THIS chromosome, in bases.
                        const vA = -g.Ywc(0) * MB, vB = -g.Ywc(ctx.canvas.height) * MB;
                        const lo = Math.max(0, Math.min(c.length, Math.min(vA, vB)));
                        const hi = Math.min(c.length, Math.max(0, Math.max(vA, vB)));
                        if (hi <= lo) continue;

                        // How many are in view, from the histogram -- 2048 additions at worst,
                        // whatever the file size.
                        const scale = HIST_BINS / c.length;
                        let b0 = Math.max(0, Math.floor(lo * scale));
                        let b1 = Math.min(HIST_BINS - 1, Math.ceil(hi * scale));
                        let inView = 0;
                        for (let b = b0; b <= b1; b++) inView += d.hist[b];
                        if (!inView) continue;

                        if (inView <= EXACT_MAX) {
                            // Binary search the sorted positions for the window, then draw
                            // only those.
                            let a = 0, z = d.n;
                            while (a < z) { const m = (a + z) >> 1; if (d.pos[m] < lo) a = m + 1; else z = m; }
                            const r = Math.max(3.4, Math.min(7, bw * 0.16));
                            for (let k = a; k < d.n && d.pos[k] <= hi; k++) {
                                const my = g.Y(wy(d.pos[k]));
                                if (my < -10 || my > ctx.canvas.height + 10) continue;
                                const col = CLS_COLOR[d.cls[k]] || CLS_COLOR[0];
                                if (bw > 60) {
                                    ctx.strokeStyle = col;
                                    ctx.globalAlpha = 0.9;
                                    ctx.lineWidth = 1.5;
                                    ctx.beginPath();
                                    ctx.moveTo(bx0, my); ctx.lineTo(bx1, my);
                                    ctx.stroke();
                                    ctx.globalAlpha = 1;
                                }
                                ctx.shadowColor = col;
                                ctx.shadowBlur = 8;
                                ctx.fillStyle = col;
                                ctx.beginPath();
                                ctx.moveTo(bx1 + 1, my);
                                ctx.lineTo(bx1 + 1 + r * 1.6, my - r);
                                ctx.lineTo(bx1 + 1 + r * 1.6, my + r);
                                ctx.closePath();
                                ctx.fill();
                                ctx.fill();                     // twice: the glow compounds
                                ctx.shadowBlur = 0;
                                // A DARK EDGE, not a white one. Brighter is lighter, so the
                                // saturated fills lose contrast against the pale grounds these
                                // mostly sit on -- amber on nucleoplasm measures 1.67:1, which
                                // is not an edge. Dark defines the shape on anything pale; on a
                                // dark band the outline disappears and the fill and its glow
                                // carry it. Between them every ground is covered.
                                ctx.strokeStyle = 'rgba(15,23,42,0.8)';
                                ctx.lineWidth = 1.2;
                                ctx.stroke();
                                if (bw >= COORD_PER_CHROM * ctx.canvas.width) {
                                    const o = snpAt(ci, k);
                                    const nm = (o && o.name) || (d.names[k] || (c.name + ':' + d.pos[k]));
                                    ctx.font = '700 10.5px ' + FONT;
                                    ctx.textAlign = 'left';
                                    ctx.textBaseline = 'middle';
                                    const tw3 = ctx.measureText(nm).width;
                                    ctx.fillStyle = 'rgba(255,255,255,0.88)';
                                    ctx.fillRect(bx1 + r * 1.6 + 4, my - 7.5, tw3 + 6, 15);
                                    ctx.fillStyle = col;
                                    ctx.fillText(nm, bx1 + r * 1.6 + 7, my);
                                }
                            }
                        } else {
                            // DENSITY. One strip per histogram bin that falls in view, its
                            // width scaled by count against the busiest bin on screen, so the
                            // picture reads as where the variants are rather than as a solid
                            // block. Log, because coverage across a genome spans orders of
                            // magnitude and a linear scale shows one peak and nothing else.
                            let peak = 1;
                            for (let b = b0; b <= b1; b++) if (d.hist[b] > peak) peak = d.hist[b];
                            const lp = Math.log(peak + 1);
                            const maxW = Math.max(6, Math.min(26, bw * 0.55));
                            ctx.globalAlpha = 1;
                            for (let b = b0; b <= b1; b++) {
                                const n = d.hist[b];
                                if (!n) continue;
                                const yA = g.Y(wy(b / scale));
                                const yB = g.Y(wy((b + 1) / scale));
                                const h2 = Math.max(1, yB - yA);
                                if (yB < -4 || yA > ctx.canvas.height + 4) continue;
                                const f = Math.log(n + 1) / lp;
                                ctx.fillStyle = 'rgba(255,45,120,' + (0.45 + 0.55 * f).toFixed(3) + ')';
                                ctx.fillRect(bx1 + 2, yA, 2 + maxW * f, h2);
                            }
                        }
                    }
                    ctx.restore();
                }

                // THE SHARED AXIS. One scale for the whole karyotype, because there is one
                // scale: position 0 is the same line on every chromosome and a megabase is the
                // same distance on all of them. Pinned to the left edge of the canvas rather
                // than to the drawing, so it stays readable while the view is panned.
                if (drawn.length && (g.X(barRight(0)) - g.X(barLeft(0))) >= COORD_FRACTION * ctx.canvas.width) {
                    const vTop = -g.Ywc(0) * MB;
                    const vBot = -g.Ywc(ctx.canvas.height) * MB;
                    const lo = Math.max(0, Math.min(vTop, vBot));
                    const hi = Math.min(maxMb * MB, Math.max(vTop, vBot));
                    const stepBp = niceStep((hi - lo) / 9);
                    if (stepBp > 0 && hi > lo) {
                        ctx.save();
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.font = '10.5px ' + FONT;
                        ctx.strokeStyle = 'rgba(71,85,105,0.45)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(9, g.Y(wy(lo)));
                        ctx.lineTo(9, g.Y(wy(hi)));
                        ctx.stroke();
                        for (let bp = Math.ceil(lo / stepBp) * stepBp; bp <= hi + 1; bp += stepBp) {
                            const ty2 = g.Y(wy(bp));
                            ctx.beginPath();
                            ctx.moveTo(9, ty2);
                            ctx.lineTo(15, ty2);
                            ctx.stroke();
                            // A backdrop, because this sits over the nucleus and over whatever
                            // the first chromosome has at that height.
                            const label = fmtBp(bp, stepBp);
                            const tw2 = ctx.measureText(label).width;
                            ctx.fillStyle = 'rgba(255,255,255,0.72)';
                            ctx.fillRect(17, ty2 - 7, tw2 + 4, 14);
                            ctx.fillStyle = '#475569';
                            ctx.fillText(label, 19, ty2);
                        }
                        ctx.restore();
                    }
                }

                // The drag, while it is happening.
                if (dragging && dragging.i >= 0 && dragging.i < drawn.length) {
                    const c = drawn[dragging.i];
                    const sx0 = g.X(barLeft(dragging.i)), sx1 = g.X(barRight(dragging.i));
                    const ya = g.Y(Math.max(dragging.y0, dragging.y1));
                    const yb = g.Y(Math.min(dragging.y0, dragging.y1));
                    if (Math.abs(yb - ya) > 1) {
                        ctx.save();
                        ctx.fillStyle = 'rgba(37,99,235,0.18)';
                        ctx.fillRect(sx0 - 3, ya, (sx1 - sx0) + 6, yb - ya);
                        ctx.strokeStyle = 'rgba(37,99,235,0.85)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(sx0 - 3, ya); ctx.lineTo(sx1 + 3, ya);
                        ctx.moveTo(sx0 - 3, yb); ctx.lineTo(sx1 + 3, yb);
                        ctx.stroke();
                        const lo = Math.max(0, Math.min(c.length, -Math.max(dragging.y0, dragging.y1) * MB));
                        const hi = Math.max(0, Math.min(c.length, -Math.min(dragging.y0, dragging.y1) * MB));
                        ctx.fillStyle = '#1e3a8a';
                        ctx.font = '600 11px ' + FONT;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(c.name + ':' + Math.round(lo).toLocaleString()
                            + '-' + Math.round(hi).toLocaleString()
                            + '  (' + fmtSpan(hi - lo) + ')', (sx0 + sx1) / 2, ya - 4);
                        ctx.restore();
                    }
                }
                ctx.restore();
            }
        };

        // ---- which chromosome and which base is under a point --------------------------------
        const at = (wx, wyWorld) => {
            const i = Math.floor(wx / SLOT);
            if (i < 0 || i >= drawn.length) return null;
            if (wx < barLeft(i) - 0.06 * SLOT || wx > barRight(i) + 0.06 * SLOT) return null;
            const c = drawn[i];
            const bp = Math.round(Math.max(0, Math.min(c.length, -wyWorld * MB)));
            return { i: i, chrom: c, bp: bp };
        };
        const human = (n) => (+n).toLocaleString();

        // What the drag covers right now, so a selection is something you SEE while making it
        // rather than a rectangle you find out about afterwards. Read by paint().
        let dragging = null;   // { i, y0, y1 } in world y

        // ---- variants, from a pasted VCF -----------------------------------------------
        //
        // BUILT TO TAKE A WHOLE GENOME. A germline VCF is four to five million rows, and the
        // obvious shape -- an object per variant, drawn in a loop every frame -- is fine for
        // the twenty someone pastes by hand and unusable at that size. Three things keep it
        // flat instead:
        //
        //   positions live in typed arrays, one per chromosome, not in objects;
        //   every chromosome carries a fixed histogram, so a frame costs the same whether it
        //     is showing twenty variants or five million;
        //   SnpIndel objects are made for the ones that can actually be looked at, and made
        //     on demand for the rest.
        //
        // The SnpIndels are the real class the tracks use, so a variant here carries its
        // annotations, its clinical significance and its name -- but five million of them is
        // three gigabytes of object headers to draw a heat strip nobody can click.
        const HIST_BINS = 2048;      // per chromosome: chr1 is ~122 kb a bin
        const EXACT_MAX = 400;       // visible variants drawn one at a time; above this, density
        const OBJECT_CAP = 20000;    // SnpIndels built eagerly; beyond this, on demand

        let SnpIndel = null;
        // Per chromosome: sorted positions, a significance class per position, the histogram,
        // and the SnpIndels for as far as the cap reached.
        const vdata = drawn.map((c) => ({
            n: 0,
            pos: null,               // Float64Array, sorted
            cls: null,               // Uint8Array: 0 none 1 pathogenic 2 benign 3 uncertain 4 conflicting
            hist: null,              // Uint32Array(HIST_BINS)
            snps: [],                // SnpIndel or null, parallel to pos while under the cap
            names: [],               // parallel; only kept while under the cap
        }));
        let vtotal = 0, vobjects = 0;

        const CLS_COLOR = ['#ff2d78', '#ff2020', '#12c95a', '#ffa400', '#94a3b8'];
        const clsOf = (info) => {
            const m = ('' + (info || '')).match(/(?:^|;)CLNSIG=([^;]*)/);
            if (!m) return 0;
            const t = m[1].toLowerCase();
            if (t.indexOf('conflict') >= 0) return 4;
            if (t.indexOf('pathogenic') >= 0) return 1;
            if (t.indexOf('benign') >= 0) return 2;
            if (t.indexOf('uncertain') >= 0 || t.indexOf('vus') >= 0) return 3;
            return 0;
        };

        const chromIndex = {};
        drawn.forEach((c, i) => {
            chromIndex[c.name] = i;
            chromIndex[c.name.replace(/^chr/, '')] = i;
        });

        const looksLikeVcf = (t) => {
            if (/^\s*##fileformat=VCF/im.test(t)) return true;
            if (/^#CHROM\s+POS\s+ID\s+REF\s+ALT/im.test(t)) return true;
            // ONE ROW IS ENOUGH WHEN IT IS UNMISTAKABLY ONE. A pasted VCF usually arrives
            // without its header -- a line out of a caller's output, or the one row of
            // interest. Two rows of the five-column shape count; one row counts when it
            // carries QUAL and FILTER as well, which a BED line does not (and a BED line's
            // fourth column is a name, so it fails the reference test first regardless).
            let rows = 0;
            for (const line of ('' + t).split(/\r?\n/)) {
                const str = line.trim();
                if (!str || str.charAt(0) === '#') continue;
                const f = str.split(/\t|\s+/);
                if (!/^(chr)?[0-9XYMT]{1,5}$/i.test(f[0] || '')) continue;
                if (!/^\d+$/.test(f[1] || '')) continue;
                if (!/^[ACGTNacgtn]+$/.test(f[3] || '')) continue;
                if (!f[4]) continue;
                if (f.length >= 6 && /^(\d+(\.\d+)?|\.)$/.test(f[5] || '')) return true;
                if (++rows >= 2) return true;
            }
            return false;
        };

        // A variant's SnpIndel, built the moment something needs one.
        const snpAt = (ci, k) => {
            const d = vdata[ci];
            if (d.snps[k]) return d.snps[k];
            if (!SnpIndel) return null;
            const c = drawn[ci];
            const nm = d.names[k] || (c.name + ':' + d.pos[k]);
            try {
                const o = new SnpIndel('snp', d.pos[k], 'N', 'N', 0, 1, nm, null, null);
                o.name = nm;
                o.source = 'VCF';
                d.snps[k] = o;
                return o;
            } catch (e) { return null; }
        };

        // Parsed in slices with a yield between them, so a five-million-line paste does not
        // hold the main thread for a minute with a frozen canvas and no way to tell whether
        // it is working. The status line counts up as it goes.
        const addVcf = async (text) => {
            if (!SnpIndel) { try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { } }
            const lines = ('' + text).split(/\r?\n/);
            // Growable typed arrays, doubled rather than pushed: this is the whole reason a
            // genome-sized paste stays inside the memory of the tab.
            const bufs = drawn.map(() => ({ pos: new Float64Array(1024), cls: new Uint8Array(1024), n: 0 }));
            const push = (ci, p, cl) => {
                const b = bufs[ci];
                if (b.n === b.pos.length) {
                    const np = new Float64Array(b.n * 2); np.set(b.pos); b.pos = np;
                    const nc = new Uint8Array(b.n * 2); nc.set(b.cls); b.cls = nc;
                }
                b.pos[b.n] = p; b.cls[b.n] = cl; b.n++;
            };
            const namesOf = drawn.map(() => []);
            let added = 0, offGenome = 0, skipped = 0;
            const SLICE = 20000;
            for (let start = 0; start < lines.length; start += SLICE) {
                const end = Math.min(lines.length, start + SLICE);
                for (let li = start; li < end; li++) {
                    const t = lines[li];
                    if (!t) continue;
                    const s0 = t.charCodeAt(0);
                    if (s0 === 35 /* # */) continue;
                    let f = t.split('\t');
                    if (f.length < 5) f = t.trim().split(/\s+/);
                    if (f.length < 5) continue;
                    const pos = +f[1];
                    if (!(pos > 0)) continue;
                    const ref = f[3];
                    if (!/^[ACGTNacgtn]+$/.test(ref)) { skipped++; continue; }
                    const key = f[0];
                    let ci = chromIndex[key];
                    if (ci == null) ci = chromIndex['chr' + key];
                    if (ci == null) { offGenome++; continue; }
                    if (pos > drawn[ci].length) { offGenome++; continue; }
                    const info = (f.length > 7 ? f[7] : '') || '';
                    const cl = clsOf(info);
                    const alts = f[4];
                    if (alts.indexOf(',') < 0) {
                        if (!/^[ACGTNacgtn]+$/.test(alts)) { skipped++; continue; }
                        if (vtotal + added < OBJECT_CAP) namesOf[ci].push((f[2] && f[2] !== '.') ? f[2] : '');
                        push(ci, pos, cl); added++;
                    } else {
                        for (const a of alts.split(',')) {
                            if (!/^[ACGTNacgtn]+$/.test(a)) { skipped++; continue; }
                            if (vtotal + added < OBJECT_CAP) namesOf[ci].push((f[2] && f[2] !== '.') ? f[2] : '');
                            push(ci, pos, cl); added++;
                        }
                    }
                }
                if (end < lines.length) {
                    graph.setMessage(' Reading ' + added.toLocaleString() + ' variants… ');
                    await new Promise((r) => setTimeout(r, 0));
                }
            }

            // Merge into what is already there, sort once per chromosome, rebuild the
            // histogram. Sorting matters: every draw does a binary search on it.
            for (let ci = 0; ci < drawn.length; ci++) {
                const b = bufs[ci];
                if (!b.n) continue;
                const d = vdata[ci];
                const total = d.n + b.n;
                const pos = new Float64Array(total);
                const cls = new Uint8Array(total);
                if (d.n) { pos.set(d.pos.subarray(0, d.n)); cls.set(d.cls.subarray(0, d.n)); }
                pos.set(b.pos.subarray(0, b.n), d.n);
                cls.set(b.cls.subarray(0, b.n), d.n);
                // Sort position and class together, by sorting an index once.
                const order = new Uint32Array(total);
                for (let k = 0; k < total; k++) order[k] = k;
                Array.prototype.sort.call(order, (x, y) => pos[x] - pos[y]);
                const sp = new Float64Array(total), sc = new Uint8Array(total);
                const oldNames = d.names, newNames = namesOf[ci];
                const sn = [];
                for (let k = 0; k < total; k++) {
                    const o = order[k];
                    sp[k] = pos[o]; sc[k] = cls[o];
                    if (total <= OBJECT_CAP) sn[k] = (o < d.n) ? (oldNames[o] || '') : (newNames[o - d.n] || '');
                }
                d.pos = sp; d.cls = sc; d.n = total; d.snps = []; d.names = sn;
                const c = drawn[ci];
                const hist = new Uint32Array(HIST_BINS);
                const scale = HIST_BINS / c.length;
                for (let k = 0; k < total; k++) {
                    let bin = (sp[k] * scale) | 0;
                    if (bin >= HIST_BINS) bin = HIST_BINS - 1;
                    hist[bin]++;
                }
                d.hist = hist;
            }
            vtotal += added;
            vobjects = Math.min(vtotal, OBJECT_CAP);
            if (graph.wake) graph.wake();
            const onChroms = vdata.filter((d) => d.n).length;
            graph.setMessage(' ' + added.toLocaleString() + ' variant' + (added === 1 ? '' : 's')
                + ' placed on ' + onChroms + ' chromosome' + (onChroms === 1 ? '' : 's')
                + (vtotal !== added ? ' (' + vtotal.toLocaleString() + ' in total)' : '')
                + (offGenome ? ' · ' + offGenome.toLocaleString() + ' on contigs this genome does not draw' : '')
                + (skipped ? ' · ' + skipped.toLocaleString() + ' symbolic or malformed' : '')
                + '. ');
            step('vcf: ' + added + ' placed, ' + offGenome + ' off-genome, ' + skipped + ' skipped, '
                + vtotal + ' total');
        };

        // The canvas has no text field of its own, so a paste is for the view. Anything that
        // is not a VCF is left to whatever else is listening -- but it says so, because a
        // paste meant as variants that produces neither variants nor a reason is the worst
        // way for this to fail.
        try {
            window.addEventListener('paste', (e) => {
                try {
                    if (e.target && ('' + e.target.localName).indexOf('text') >= 0) return;
                    const t = (e.clipboardData || window.clipboardData).getData('text');
                    if (!t) return;
                    if (!looksLikeVcf(t)) {
                        step('paste ignored: not read as VCF (' + t.trim().split(/\r?\n/).length + ' line(s))');
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    addVcf(t);
                } catch (e2) { }
            }, true);
        } catch (e) { }

        // ---- drag a region off a chromosome --------------------------------------------------
        // The selection is in WORLD coordinates, so the same drag means the same thing at
        // every zoom level, and the rectangle handed to zoomRect is the rectangle drawn.
        const arm = () => {
            graph.clearMouseListeners();
            // NOT setMouseMode. It calls
            //     clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js')
            // which nulls highlightmethod AND execs the hover tool over this view -- so the
            // karyotype drew once, and vanished the moment arm() ran a second later. The mode
            // string is the only part of setMouseMode this view wants, and it is one
            // assignment.
            try { graph.graph.mode = 'msg: Drag down a chromosome to choose a region.'; } catch (e) { }
            let from = null;
            graph.addMouseDownListener((x, y) => {
                from = { x: graph.Xwc(x), y: graph.Ywc(y) };
                dragging = null;
            });
            graph.addMouseMoveListener((x, y) => {
                if (!from) return;
                const h = at(from.x, from.y) || at(graph.Xwc(x), graph.Ywc(y));
                if (!h) return;
                dragging = { i: h.i, y0: from.y, y1: graph.Ywc(y) };
                if (graph.wake) graph.wake();
            });
            graph.addMouseUpListener(async (x, y) => {
                const to = { x: graph.Xwc(x), y: graph.Ywc(y) };
                const f = from; from = null;
                dragging = null;
                if (!f) return;
                const a = at(f.x, f.y), b = at(to.x, to.y);
                const hit = a || b;
                if (!hit) { graph.setMessage(' Nothing there — drag on a chromosome. '); return; }
                // World y runs negative down the chromosome, so the HIGHER world y is the
                // LOWER base. Clamped to the chromosome: a drag that runs off the end means
                // "to the end", not a coordinate past it.
                const clamp = (bp) => Math.max(0, Math.min(hit.chrom.length, Math.round(bp)));
                const lo = clamp(-Math.max(f.y, to.y) * MB);
                const hi = clamp(-Math.min(f.y, to.y) * MB);
                // A CLICK IS NOT A REGION. Under a few hundred kb of drag there is no way to
                // tell a deliberate span from a slipped mouse, so it is read as "show me this
                // chromosome" rather than as a region nobody meant to choose.
                if (hi - lo < 250000) {
                    await graph.zoomRect(barLeft(hit.i) - 0.35 * SLOT, barRight(hit.i) + 0.35 * SLOT,
                        2, wy(hit.chrom.length) - 2, 150);
                    graph.setMessage(' ' + hit.chrom.name + ' — ' + human(hit.chrom.length) + ' bp. '
                        + 'Drag down it to choose a region. ');
                    arm();
                    return;
                }
                const padMb = Math.max(0.5, (hi - lo) / MB * 0.08);
                await graph.zoomRect(barLeft(hit.i) - 0.5 * SLOT, barRight(hit.i) + 0.5 * SLOT,
                    wy(lo) + padMb, wy(hi) - padMb, 150);
                graph.setMessage(' ' + hit.chrom.name + ':' + human(lo) + '-' + human(hi)
                    + '  (' + (Math.round((hi - lo) / 1e4) / 100) + ' Mb) ');
                try {
                    graph.__karyotypeRegion = { chr: hit.chrom.name.replace(/^chr/, ''), start: lo, end: hi };
                } catch (e) { }
                arm();
            });
        };

        // ---- frame the whole genome ----------------------------------------------------------
        // WAIT FOR REAL PIXELS. A component mounts asynchronously, and a zoomRect computed
        // against a zero-size grid produces a scale of zero -- which draws nothing and looks
        // identical to a bug in the drawing. editor.js hits the same problem on reload and
        // solves it the same way: poll until a canvas has a size, then fit.
        const canvasSize = () => {
            let w = 0, h = 0;
            try {
                for (const c of document.querySelectorAll('canvas')) {
                    if (c.width * c.height > w * h) { w = c.width; h = c.height; }
                }
            } catch (e) { }
            return { w: w, h: h };
        };
        const whenSized = (then) => {
            let tries = 0;
            const step = () => {
                tries++;
                try { window.dispatchEvent(new Event('resize')); } catch (e) { }
                const sz = canvasSize();
                if (sz.w > 2 && sz.h > 2) { then(); return; }
                if (tries < 30) setTimeout(step, 200);
            };
            setTimeout(step, 120);
        };
        const fit = async () => {
            // Top of the frame a little above base 0, bottom a little below the longest
            // chromosome's tail -- the labels are drawn under the bars and need the room.
            // FRAME THE NUCLEUS, not just the chromosomes. The envelope has to be about
            // 1.5 times the content to contain it (sqrt(2) to inscribe the box, plus a
            // margin), so a frame drawn around the chromosomes alone cuts the top and bottom
            // off the very thing that is supposed to enclose them. Both axes are scaled by
            // the same factor, so the 10.5:1 aspect that keeps animateTo's hands off the
            // frame is unchanged.
            // incr 30, not 0: a step count of zero is not a shortcut for "immediately".
            const fx0 = -0.4 * SLOT, fx1 = (drawn.length + 0.4) * SLOT;
            const fy0 = maxMb * 0.06, fy1 = -maxMb * 1.12;
            const fk = Math.SQRT2 * 1.06 * 1.04;
            const fcx = (fx0 + fx1) / 2, fcy = (fy0 + fy1) / 2;
            const fhx = ((fx1 - fx0) / 2) * fk, fhy = ((fy0 - fy1) / 2) * fk;
            await graph.zoomRect(fcx - fhx, fcx + fhx, fcy + fhy, fcy - fhy, 30);
            if (graph.wake) graph.wake();
        };
        // THE OVERLAY IS NOT SOMETHING THIS VIEW CAN AFFORD TO LOSE.
        //
        // highlightmethod is the per-frame hook, and half a dozen things in gene.js null it:
        // clearMouseListeners does, and so does every setMouseMode, since that calls
        // clearMouseListeners. For a tool that draws an overlay ON TOP of tracks that is
        // correct -- the overlay belongs to a mode and the mode ended. Here the overlay IS the
        // view, and there is nothing else on the canvas, so losing it means a blank screen.
        //
        // So it is defined rather than assigned: the getter always returns paint and the
        // setter ignores whatever is written, which makes every one of those nulls a no-op
        // for the life of this app. Anything that genuinely wants the hook back can delete
        // the property.
        try {
            Object.defineProperty(graph, 'highlightmethod', {
                configurable: true,
                get: () => paint,
                set: () => { },
            });
        } catch (e) { graph.highlightmethod = paint; }
        step('painting ' + drawn.length + ' chromosomes; waiting for the canvas to size');
        whenSized(async () => {
            step('canvas sized ' + canvasSize().w + 'x' + canvasSize().h
                + '; slot=' + SLOT.toFixed(1) + ' world units, aspect='
                + (((drawn.length + 0.8) * SLOT) / frameH).toFixed(2));
            try { if (graph.graph && graph.graph.grid && graph.graph.grid.rescale) graph.graph.grid.rescale(); } catch (e) { }
            try { if (graph.rescale) graph.rescale(); } catch (e) { }
            await fit();
            arm();
            step('framed and armed');
        });
        graph.setMessage(' ' + (r.species || wanted) + ' ' + (r.assembly ? '(' + r.assembly + ') ' : '')
            + '— ' + drawn.length + ' chromosomes, smallest first, all at one scale. '
            + 'Drag down a chromosome to choose a region. ');
        return { graph: graph, chromosomes: drawn, species: r.species, assembly: r.assembly, fit: fit };
    })();
}
