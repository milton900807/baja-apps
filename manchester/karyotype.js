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
        // THE MITOCHONDRIAL GENOME IS HERE, AND IT IS NOT A BAR.
        //
        // chrM is 16,569 bases: fifteen thousand times shorter than chr1. Drawn to the shared
        // scale it is a sixtieth of a pixel, which is why it was left out to begin with -- and
        // leaving out the genome that carries its own diseases because it does not fit a
        // linear scale is the wrong answer to the wrong problem.
        //
        // So it is drawn as what it is: a circle. Mitochondrial DNA is genuinely circular, the
        // ring is the way it is always shown, and a ring has no length to be crushed by the
        // scale beside it. It is marked as not-to-scale where it is drawn, because it is the
        // one thing on this picture that is not.
        const isCircular = (c) => /^(chrM|chrMT|MT|M)$/i.test('' + c.name);
        const drawn = chroms.filter((c) => +c.length > 0)
            .slice().sort((a, b) => a.length - b.length);
        for (const c of drawn) c.circular = isCircular(c);
        // The linear scale comes from the linear chromosomes: one 16 kb ring must not decide
        // how tall 249 Mb is drawn.
        const maxMb = drawn.reduce((m, c) => (c.circular ? m : Math.max(m, c.length / MB)), 0);

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
                                        label: 'Open', icon: 'folder_open',
                                        tooltip: 'Open a saved karyotype from My Files',
                                        ionFunction: createIonFunction(() => { openJson(); })
                                    },
                                    {
                                        label: 'Save', icon: 'save',
                                        tooltip: 'Save this karyotype to My Files as JSON',
                                        ionFunction: createIonFunction(() => { saveJson(); })
                                    },
                                    {
                                        label: 'Select sequence', icon: 'highlight_alt',
                                        tooltip: 'Drag down a chromosome to choose a range',
                                        ionFunction: createIonFunction(() => {
                                            arm();
                                            graph.setMessage(' Drag down a chromosome to choose a region. ');
                                        })
                                    },
                                    {
                                        label: 'Upload VCF', icon: 'upload_file',
                                        tooltip: 'Read a VCF onto the karyotype and keep it in My Files',
                                        ionFunction: createIonFunction(() => { pickVcf(); })
                                    },
                                    {
                                        label: 'Fit', icon: 'fit_screen',
                                        tooltip: 'Frame the whole genome again',
                                        ionFunction: createIonFunction(async () => { await fit(); pan(); })
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
        // The cell body appears further out still: absent at the default fit, where the bars
        // are about 1.6% of the canvas.
        const NEURON_MAX_BAR = 0.012;
        // THE SEQUENCE ITSELF, once a base is tall enough to carry a letter.
        //
        // y is the genomic axis here, so bases stack DOWNWARD and consecutive letters
        // collide unless a base is at least a line-height tall. That is the whole rule --
        // the threshold IS "close enough to show the characters without overrunning" -- and
        // it is a property of the font, not a taste. Below it nothing is drawn; there is no
        // halfway rendering of a sequence.
        const SEQ_MIN_PX = 9;        // px per base before any letter is drawn
        const SEQ_FONT_MAX = 13;     // past this a taller base does not need a bigger letter
        const SEQ_CHUNK = 2048;      // bases per request
        const SEQ_MAX_CHUNKS = 8;    // at ~9 px a base, a screen is one or two of these
        // The four bases in the colours sequence viewers have used for decades. Someone
        // arriving from IGV or a chromatogram should not have to learn a second key.
        const BASE_COLOR = { A: '#15803d', C: '#1d4ed8', G: '#b45309', T: '#be123c', N: '#94a3b8' };

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

        // THE BASES ARE FETCHED ON A FIXED CHUNK GRID, not per viewport. Panning by one
        // pixel changes the visible window by a base or two, and a viewport-keyed cache
        // would miss on every frame and ask the server again for almost exactly what it
        // already had. Aligned chunks mean a pan reuses everything except the chunk it
        // moved onto.
        const seqCache = new Map();            // 'chr|chunk' -> string | PENDING | MISS
        const SEQ_PENDING = '\u0000pending';   // sentinels, not sequence: no base is ever a
        const SEQ_MISS = '\u0000miss';         // NUL, so neither can be mistaken for data
        // A species this server holds no genome for must be asked ONCE. paint() runs every
        // frame, so a failure that clears its own cache entry turns into a request per frame
        // for as long as the view is held -- the whole reason a miss is remembered.
        let seqOff = false;
        const seqKey = (chrom, k) => chrom + '|' + k;
        const seqAsk = async (chrom, k) => {
            const key = seqKey(chrom, k);
            if (seqOff || seqCache.has(key)) return;
            seqCache.set(key, SEQ_PENDING);
            const lo = k * SEQ_CHUNK + 1;
            try {
                const em2 = new EngineMonitor(() => { });
                const rs = await exec(server + '/py/bio/genome-sequence.py', em2,
                    chrom, String(lo), String(lo + SEQ_CHUNK - 1), (r.species || 'human'));
                if (rs && rs.ok && rs.sequence) {
                    seqCache.set(key, String(rs.sequence));
                } else {
                    seqCache.set(key, SEQ_MISS);
                    // No genome for this species at all: stop asking for every chunk of
                    // every chromosome one at a time.
                    const msg = ('' + ((rs && rs.error) || '')).toLowerCase();
                    if (msg.indexOf('no genome') >= 0 || msg.indexOf('not on this server') >= 0) {
                        seqOff = true;
                        step('sequence unavailable: ' + (rs && rs.error));
                    }
                }
            } catch (e) { seqCache.set(key, SEQ_MISS); }
            // Bounded: panning along a chromosome at base resolution would otherwise keep
            // every window it has ever crossed.
            if (seqCache.size > SEQ_MAX_CHUNKS * 3) {
                const drop = seqCache.size - SEQ_MAX_CHUNKS;
                let n = 0;
                for (const kk of Array.from(seqCache.keys())) {
                    if (n++ >= drop) break;
                    if (seqCache.get(kk) !== SEQ_PENDING) seqCache.delete(kk);
                }
            }
            if (graph.wake) graph.wake();
        };
        // The base at a position, or '' when its chunk has not arrived. Never blocks and
        // never asks -- asking is the caller's decision, so paint() stays synchronous.
        const seqBaseAt = (chrom, bp) => {
            const k = Math.floor((bp - 1) / SEQ_CHUNK);
            const str = seqCache.get(seqKey(chrom, k));
            if (!str || str === SEQ_PENDING || str === SEQ_MISS) return '';
            const off = (bp - 1) - k * SEQ_CHUNK;
            return (off >= 0 && off < str.length) ? str.charAt(off) : '';
        };

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
                // THE CELL, one step further out than the nucleus. The nucleus arrives as the
                // genome stops being individual chromosomes; the cell arrives as the nucleus
                // stops being the whole picture. Absent at the default fit -- where the bars
                // are 1.6% of the canvas -- and fading in below 1.2%, so it is something you
                // find by pulling back rather than something you have to dismiss.
                const cellAlpha = Math.max(0, Math.min(1,
                    (NEURON_MAX_BAR * ctx.canvas.width - barPx) / (0.006 * ctx.canvas.width)));
                if ((nucAlpha > 0.01 || cellAlpha > 0.01) && drawn.length) {
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
                    // ---- the neuron, drawn FIRST so the nucleus sits inside it ----------
                    //
                    // Three things separate a neuron from lines poking out of an oval, and the
                    // first version had none of them.
                    //
                    //   TAPER.    A process is thick where it leaves the soma and vanishingly
                    //             thin at its tip. Stroking one curve at a constant width is
                    //             what makes a drawing look like a diagram of a spider.
                    //   BRANCHING that keeps going. Real arbors divide three or four times,
                    //             each generation shorter and thinner. Two children once is a
                    //             fork, not a tree.
                    //   A SOMA that the processes grow OUT of. An ellipse with lines meeting
                    //             its edge always reads as stuck-on; a cell body bulges
                    //             towards each root.
                    //
                    // Every angle, length and wobble comes from a hash of the branch's index,
                    // not from Math.random -- so the cell is elaborate and completely still.
                    // An arbor that regrew each frame would shimmer, and background context
                    // must not move.
                    if (cellAlpha > 0.01 && isFinite(cx) && isFinite(cy) && erx > 4 && ery > 4) {
                        const sx = erx * 1.5, sy = ery * 1.5;      // the soma, around the nucleus
                        const unit = Math.min(sx, sy);
                        ctx.save();
                        ctx.globalAlpha = cellAlpha;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        const edge = 'rgba(100,116,139,0.55)';
                        ctx.strokeStyle = edge;

                        // Stable pseudo-randomness: the same index always gives the same
                        // number, so the arbor is identical on every frame and every zoom.
                        const rnd = (n) => {
                            const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
                            return x - Math.floor(x);
                        };

                        // A tapering, curving branch, walked in steps. Each step is stroked at
                        // its own width, which is what produces the taper -- canvas has no
                        // variable-width stroke, and a filled outline for something this thin
                        // costs more than it shows.
                        const STEPS = 9;
                        const branch = (x0, y0, ang, len, w0, depth, seed) => {
                            if (len < 2 || w0 < 0.35) return;
                            const curve = (rnd(seed) - 0.5) * 0.9;      // how much it bends, and which way
                            let px = x0, py = y0, a = ang;
                            for (let st = 0; st < STEPS; st++) {
                                const t0 = st / STEPS, t1 = (st + 1) / STEPS;
                                a = ang + curve * t1;
                                const nx = x0 + Math.cos(a) * len * t1;
                                const ny = y0 + Math.sin(a) * len * t1;
                                // Width falls off towards the tip, faster at the end than at
                                // the start, which is how a process actually thins.
                                ctx.lineWidth = Math.max(0.35, w0 * (1 - t0 * 0.82));
                                ctx.beginPath();
                                ctx.moveTo(px, py);
                                ctx.lineTo(nx, ny);
                                ctx.stroke();
                                px = nx; py = ny;
                            }
                            if (depth <= 0) return;
                            // Two children, at angles that vary by branch so no two forks in
                            // the tree are the same shape.
                            const spread = 0.34 + rnd(seed + 11) * 0.30;
                            for (let c2 = 0; c2 < 2; c2++) {
                                const sign = c2 ? 1 : -1;
                                branch(px, py, a + sign * spread,
                                    len * (0.56 + rnd(seed + c2 * 7 + 3) * 0.16),
                                    w0 * 0.62, depth - 1, seed * 3 + c2 * 17 + 5);
                            }
                        };

                        // Where the dendrites leave the soma. Spread over the whole circle
                        // except the sector the axon takes, so the two never grow into each
                        // other.
                        const AXON_ANG = Math.PI;
                        const DEND_N = 7;
                        const roots = [];
                        for (let k = 0; k < DEND_N; k++) {
                            // -0.78..+0.78 of a turn, centred away from the axon.
                            const frac = (k + 0.5) / DEND_N;
                            const a0 = (frac * 1.56 - 0.78) * Math.PI + (rnd(k + 91) - 0.5) * 0.14;
                            roots.push(a0);
                        }

                        // The soma: a closed blob that bulges towards every root, so the
                        // processes leave a cell body instead of touching an ellipse.
                        const somaR = (a) => {
                            let bulge = 0;
                            for (const ra of roots.concat([AXON_ANG])) {
                                let d2 = Math.abs(((a - ra + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
                                bulge = Math.max(bulge, Math.max(0, 1 - d2 / 0.55));
                            }
                            return 1 + bulge * 0.16;
                        };
                        const somaPath = () => {
                            ctx.beginPath();
                            const N = 96;
                            for (let k = 0; k <= N; k++) {
                                const a = (k / N) * Math.PI * 2;
                                const rr = somaR(a);
                                const x2 = cx + Math.cos(a) * sx * rr;
                                const y2 = cy + Math.sin(a) * sy * rr;
                                if (k === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
                            }
                            ctx.closePath();
                        };

                        // Dendrites first, from just inside the soma so their roots are
                        // covered by it.
                        for (let k = 0; k < roots.length; k++) {
                            const a0 = roots[k];
                            const rr = somaR(a0) * 0.82;
                            branch(cx + Math.cos(a0) * sx * rr, cy + Math.sin(a0) * sy * rr,
                                a0, unit * (0.9 + rnd(k + 41) * 0.7),
                                Math.max(1.1, unit * 0.055), 3, k * 13 + 1);
                        }

                        // The axon: one, long, thin, and barely branching until it ends -- the
                        // thing that tells it apart from the dendrites around it. Drawn with
                        // the same taper but a much slower one.
                        {
                            const rr = somaR(AXON_ANG) * 0.82;
                            let ax = cx + Math.cos(AXON_ANG) * sx * rr;
                            let ay = cy + Math.sin(AXON_ANG) * sy * rr;
                            const alen = unit * 4.2;
                            const AST = 26;
                            const w0 = Math.max(1.1, unit * 0.045);
                            let pxA = ax, pyA = ay;
                            for (let st = 1; st <= AST; st++) {
                                const t = st / AST;
                                // A long, shallow wave: an axon is not a ruled line.
                                const nx = ax - alen * t;
                                const ny = ay + Math.sin(t * Math.PI * 1.7) * unit * 0.22;
                                ctx.lineWidth = Math.max(0.4, w0 * (1 - t * 0.45));
                                ctx.beginPath();
                                ctx.moveTo(pxA, pyA);
                                ctx.lineTo(nx, ny);
                                ctx.stroke();
                                pxA = nx; pyA = ny;
                            }
                            // A terminal arbor rather than three spokes.
                            for (let k = 0; k < 4; k++) {
                                branch(pxA, pyA, Math.PI + (k - 1.5) * 0.34, unit * 0.42,
                                    Math.max(0.6, w0 * 0.5), 1, 300 + k * 9);
                            }
                        }

                        // The soma last, over the roots, so they join it rather than sit on it.
                        somaPath();
                        ctx.fillStyle = 'rgba(214,225,240,0.55)';
                        ctx.fill();
                        ctx.strokeStyle = edge;
                        ctx.lineWidth = 1.25;
                        ctx.stroke();
                        ctx.restore();
                    }

                    if (nucAlpha > 0.01 && isFinite(cx) && isFinite(cy) && erx > 4 && ery > 4) {
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
                    if (c.circular) {
                        // A ring, sized to the slot and hung from the same top line the
                        // linear chromosomes start at, so it sits in the row rather than
                        // floating beside it.
                        const cxr = g.X(slotOf(i));
                        const wSlot = g.X(barRight(i)) - g.X(barLeft(i));
                        const rad = Math.max(3, wSlot * 0.62);
                        const cyr = g.Y(wy(0)) + rad + 6;
                        if (cxr < -60 || cxr > ctx.canvas.width + 60) continue;
                        if (rad < 1.5) continue;
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(cxr, cyr, rad, 0, Math.PI * 2);
                        ctx.fillStyle = '#f2f6fb';
                        ctx.fill();
                        ctx.lineWidth = Math.max(2, rad * 0.22);
                        ctx.strokeStyle = '#8aa0b8';
                        ctx.stroke();
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(15,23,42,0.55)';
                        ctx.stroke();
                        // Its variants, as dots around the ring: position maps to angle from
                        // twelve o'clock, which is how a circular genome is always drawn.
                        const dm = vdata[i];
                        if (dm && dm.n) {
                            for (let k = 0; k < dm.n; k++) {
                                const a2 = (dm.pos[k] / c.length) * Math.PI * 2 - Math.PI / 2;
                                const col = CLS_COLOR[dm.cls[k]] || CLS_COLOR[0];
                                ctx.beginPath();
                                ctx.arc(cxr + Math.cos(a2) * rad, cyr + Math.sin(a2) * rad,
                                    Math.max(1.6, rad * 0.09), 0, Math.PI * 2);
                                ctx.fillStyle = col;
                                ctx.fill();
                                ctx.lineWidth = 0.8;
                                ctx.strokeStyle = 'rgba(15,23,42,0.7)';
                                ctx.stroke();
                            }
                        }
                        if (wSlot > 8) {
                            ctx.fillStyle = '#0f172a';
                            ctx.font = '600 ' + Math.max(9, Math.min(13, wSlot * 0.42)) + 'px ' + FONT;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'top';
                            ctx.fillText('MT', cxr, cyr + rad + 6);
                            if (wSlot > 26) {
                                ctx.fillStyle = '#64748b';
                                ctx.font = '10px ' + FONT;
                                ctx.fillText('16.6 kb · not to scale', cxr, cyr + rad + 22);
                            }
                        }
                        ctx.restore();
                        continue;
                    }
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

                    // THE SEQUENCE, once a base is tall enough to letter.
                    //
                    // At this zoom the banding is meaningless -- the whole visible strip is
                    // one band -- so the bar is backed in white and the bases are drawn over
                    // it. That backing is also the signal that the view has changed register:
                    // an ideogram above, a sequence here.
                    const pxPerBase = Math.abs(g.Y(wy(1)) - g.Y(wy(0)));
                    if (pxPerBase >= SEQ_MIN_PX && w >= 12) {
                        const sTop = Math.max(1, Math.min(c.length, -g.Ywc(0) * MB));
                        const sBot = Math.max(1, Math.min(c.length, -g.Ywc(ctx.canvas.height) * MB));
                        const bLo = Math.max(1, Math.floor(Math.min(sTop, sBot)));
                        const bHi = Math.min(c.length, Math.ceil(Math.max(sTop, sBot)));
                        if (bHi >= bLo) {
                            // Ask for the chunks this window needs. Whatever has not arrived
                            // simply is not drawn -- no placeholder, so nothing shifts when
                            // it lands.
                            const kLo = Math.floor((bLo - 1) / SEQ_CHUNK);
                            const kHi = Math.floor((bHi - 1) / SEQ_CHUNK);
                            for (let k = kLo; k <= kHi && (k - kLo) < SEQ_MAX_CHUNKS; k++) {
                                if (!seqCache.has(seqKey(c.name, k))) seqAsk(c.name, k);
                            }
                            // The bar is far wider than the screen at this zoom, so the
                            // letters follow the VISIBLE middle of it rather than the middle
                            // of the bar, which would be off-canvas.
                            const vx0 = Math.max(x0, 0), vx1 = Math.min(x1, ctx.canvas.width);
                            const cxm = (vx0 + vx1) / 2;
                            const fpx = Math.min(SEQ_FONT_MAX, pxPerBase * 0.82);
                            ctx.save();
                            ctx.fillStyle = 'rgba(255,255,255,0.93)';
                            ctx.fillRect(vx0, Math.max(0, g.Y(wy(bLo - 1))),
                                Math.max(0, vx1 - vx0),
                                Math.min(ctx.canvas.height, g.Y(wy(bHi))) - Math.max(0, g.Y(wy(bLo - 1))));
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.font = '600 ' + fpx.toFixed(1) + 'px ui-monospace, SFMono-Regular, '
                                + 'Menlo, Consolas, monospace';
                            let drew = 0;
                            for (let bp = bLo; bp <= bHi; bp++) {
                                const ch = seqBaseAt(c.name, bp);
                                if (!ch) continue;
                                // Centred on the base's OWN span. A base occupies [bp-1, bp)
                                // in this mapping, so lettering its edge would put every
                                // character half a base out of register with the ruler.
                                const ty = g.Y(wy(bp - 0.5));
                                if (ty < -fpx || ty > ctx.canvas.height + fpx) continue;
                                ctx.fillStyle = BASE_COLOR[ch] || '#475569';
                                ctx.fillText(ch, cxm, ty);
                                drew++;
                            }
                            if (!drew && !seqOff) {
                                ctx.fillStyle = '#94a3b8';
                                ctx.font = '11px ' + FONT;
                                ctx.fillText('reading the sequence…', cxm, ctx.canvas.height / 2);
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
                        if (c.circular) continue;   // drawn on the ring, with the ring
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
            // The ring has no vertical axis to read a position off, so anywhere on its slot
            // means the whole of it -- which for 16.6 kb is the only useful answer anyway.
            if (drawn[i].circular) return { i: i, chrom: drawn[i], bp: 0, circular: true };
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
            // ALLELES AS CODES, not as strings. A variant handed to the editor has to be a
            // real one -- A>G, not N>N -- and two Uint8Arrays cost 2 bytes a variant where
            // two string arrays cost a hundred. 0-3 are ACGT, 4 is N, 5 says "look in cplx",
            // which is where indels and multi-base alleles go. Those are the minority in every
            // VCF, so the rare case pays for itself and the common one is free.
            ref: null,               // Uint8Array
            alt: null,               // Uint8Array
            cplx: null,              // Map(index -> [refString, altString])
            hist: null,              // Uint32Array(HIST_BINS)
            snps: [],                // SnpIndel or null, parallel to pos while under the cap
            names: [],               // parallel; only kept while under the cap
        }));
        const BCODE = { A: 0, C: 1, G: 2, T: 3, N: 4 };
        const BCHAR = ['A', 'C', 'G', 'T', 'N'];
        const codeOf = (b) => (b.length === 1 && BCODE[b] != null) ? BCODE[b] : 5;
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

        // The alleles at a stored index, back as strings.
        const allelesAt = (ci, k) => {
            const d = vdata[ci];
            if (d.cplx && d.cplx.has(k)) return d.cplx.get(k);
            return [BCHAR[d.ref[k]] || 'N', BCHAR[d.alt[k]] || 'N'];
        };

        // A variant's SnpIndel, built the moment something needs one.
        const snpAt = (ci, k) => {
            const d = vdata[ci];
            if (d.snps[k]) return d.snps[k];
            if (!SnpIndel) return null;
            const c = drawn[ci];
            const nm = d.names[k] || (c.name + ':' + d.pos[k]);
            try {
                const ab = allelesAt(ci, k);
                const ty = ab[1].length > ab[0].length ? 'ins' : (ab[0].length > ab[1].length ? 'del' : 'snp');
                const o = new SnpIndel(ty, d.pos[k], ab[0], ab[1], 0, 1, nm, null, null);
                o.name = nm;
                o.source = 'VCF';
                d.snps[k] = o;
                return o;
            } catch (e) { return null; }
        };

        // ---- parsing, shared by a paste and by a file --------------------------------
        //
        // Split apart because a pasted string and a two-gigabyte file want the same parser
        // and different feeding. The expensive half -- merge, sort, histogram -- runs ONCE at
        // the end either way: doing it per chunk would sort the same array a hundred times.
        const newBufs = () => drawn.map(() => ({
            pos: new Float64Array(1024), cls: new Uint8Array(1024),
            ref: new Uint8Array(1024), alt: new Uint8Array(1024),
            cplx: new Map(), n: 0,
        }));
        const pushInto = (bufs, ci, p2, cl, rs, as) => {
            const b = bufs[ci];
            if (b.n === b.pos.length) {
                // Doubled rather than pushed: this is the whole reason a genome-sized file
                // stays inside the memory of the tab.
                const np = new Float64Array(b.n * 2); np.set(b.pos); b.pos = np;
                const nc = new Uint8Array(b.n * 2); nc.set(b.cls); b.cls = nc;
                const nr = new Uint8Array(b.n * 2); nr.set(b.ref); b.ref = nr;
                const na = new Uint8Array(b.n * 2); na.set(b.alt); b.alt = na;
            }
            const rc = codeOf(rs), ac = codeOf(as);
            b.pos[b.n] = p2; b.cls[b.n] = cl; b.ref[b.n] = rc; b.alt[b.n] = ac;
            if (rc === 5 || ac === 5) b.cplx.set(b.n, [rs, as]);
            b.n++;
        };
        const parseLines = (lines, bufs, namesOf, count) => {
            for (let li = 0; li < lines.length; li++) {
                const t = lines[li];
                if (!t || t.charCodeAt(0) === 35 /* # */) continue;
                let f = t.split('\t');
                if (f.length < 5) f = t.trim().split(/\s+/);
                if (f.length < 5) continue;
                const pos = +f[1];
                if (!(pos > 0)) continue;
                if (!/^[ACGTNacgtn]+$/.test(f[3])) { count.skipped++; continue; }
                let ci = chromIndex[f[0]];
                if (ci == null) ci = chromIndex['chr' + f[0]];
                if (ci == null) { count.offGenome++; continue; }
                if (pos > drawn[ci].length) { count.offGenome++; continue; }
                const cl = clsOf((f.length > 7 ? f[7] : '') || '');
                const nm = (f[2] && f[2] !== '.') ? f[2] : '';
                const alts = f[4];
                const refU = f[3].toUpperCase();
                if (alts.indexOf(',') < 0) {
                    if (!/^[ACGTNacgtn]+$/.test(alts)) { count.skipped++; continue; }
                    if (vtotal + count.added < OBJECT_CAP) namesOf[ci].push(nm);
                    pushInto(bufs, ci, pos, cl, refU, alts.toUpperCase()); count.added++;
                } else {
                    for (const a of alts.split(',')) {
                        if (!/^[ACGTNacgtn]+$/.test(a)) { count.skipped++; continue; }
                        if (vtotal + count.added < OBJECT_CAP) namesOf[ci].push(nm);
                        pushInto(bufs, ci, pos, cl, refU, a.toUpperCase()); count.added++;
                    }
                }
            }
        };
        const finalise = (bufs, namesOf, count, what) => {
            for (let ci = 0; ci < drawn.length; ci++) {
                const b = bufs[ci];
                if (!b.n) continue;
                const d = vdata[ci];
                const total = d.n + b.n;
                const pos = new Float64Array(total), cls = new Uint8Array(total);
                const rf = new Uint8Array(total), al = new Uint8Array(total);
                const cx = new Map();
                if (d.n) {
                    pos.set(d.pos.subarray(0, d.n)); cls.set(d.cls.subarray(0, d.n));
                    rf.set(d.ref.subarray(0, d.n)); al.set(d.alt.subarray(0, d.n));
                    if (d.cplx) for (const [k, v] of d.cplx) cx.set(k, v);
                }
                pos.set(b.pos.subarray(0, b.n), d.n);
                cls.set(b.cls.subarray(0, b.n), d.n);
                rf.set(b.ref.subarray(0, b.n), d.n);
                al.set(b.alt.subarray(0, b.n), d.n);
                for (const [k, v] of b.cplx) cx.set(k + d.n, v);
                // Sorted once, by ordering an index: every draw binary-searches this.
                const order = new Uint32Array(total);
                for (let k = 0; k < total; k++) order[k] = k;
                Array.prototype.sort.call(order, (x, y) => pos[x] - pos[y]);
                const sp = new Float64Array(total), sc = new Uint8Array(total);
                const sr = new Uint8Array(total), sa = new Uint8Array(total);
                const scx = new Map();
                const sn = [];
                const oldNames = d.names, newNames = namesOf[ci];
                for (let k = 0; k < total; k++) {
                    const o = order[k];
                    sp[k] = pos[o]; sc[k] = cls[o]; sr[k] = rf[o]; sa[k] = al[o];
                    if (cx.has(o)) scx.set(k, cx.get(o));
                    if (total <= OBJECT_CAP) sn[k] = (o < d.n) ? (oldNames[o] || '') : (newNames[o - d.n] || '');
                }
                d.pos = sp; d.cls = sc; d.ref = sr; d.alt = sa; d.cplx = scx;
                d.n = total; d.snps = []; d.names = sn;
                const hist = new Uint32Array(HIST_BINS);
                const scale = HIST_BINS / drawn[ci].length;
                for (let k = 0; k < total; k++) {
                    let bin = (sp[k] * scale) | 0;
                    if (bin >= HIST_BINS) bin = HIST_BINS - 1;
                    hist[bin]++;
                }
                d.hist = hist;
            }
            vtotal += count.added;
            vobjects = Math.min(vtotal, OBJECT_CAP);
            if (graph.wake) graph.wake();
            const onChroms = vdata.filter((d) => d.n).length;
            graph.setMessage(' ' + count.added.toLocaleString() + ' variant'
                + (count.added === 1 ? '' : 's') + (what ? ' from ' + what : '')
                + ' placed on ' + onChroms + ' chromosome' + (onChroms === 1 ? '' : 's')
                + (vtotal !== count.added ? ' (' + vtotal.toLocaleString() + ' in total)' : '')
                + (count.offGenome ? ' · ' + count.offGenome.toLocaleString() + ' on contigs this genome does not draw' : '')
                + (count.skipped ? ' · ' + count.skipped.toLocaleString() + ' symbolic or malformed' : '')
                + '. ');
            step('vcf: ' + count.added + ' placed, ' + count.offGenome + ' off-genome, '
                + count.skipped + ' skipped, ' + vtotal + ' total');
        };

        // A pasted string: sliced with a yield between, so a large paste shows progress
        // instead of a frozen canvas.
        const addVcf = async (text) => {
            if (!SnpIndel) { try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { } }
            const lines = ('' + text).split(/\r?\n/);
            const bufs = newBufs(), namesOf = drawn.map(() => []);
            const count = { added: 0, offGenome: 0, skipped: 0 };
            const SLICE = 20000;
            for (let start = 0; start < lines.length; start += SLICE) {
                parseLines(lines.slice(start, start + SLICE), bufs, namesOf, count);
                if (start + SLICE < lines.length) {
                    graph.setMessage(' Reading ' + count.added.toLocaleString() + ' variants… ');
                    await new Promise((r) => setTimeout(r, 0));
                }
            }
            finalise(bufs, namesOf, count, '');
        };

        // A FILE, READ IN SLICES RATHER THAN SWALLOWED. A whole-genome VCF is gigabytes;
        // file.text() on one asks the browser for a single string that large and it either
        // fails or takes the tab down with it. This reads 8 MB at a time, keeps the partial
        // last line between slices, and never holds more than one slice plus the typed
        // arrays.
        const addVcfFile = async (file) => {
            if (!SnpIndel) { try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { } }
            const bufs = newBufs(), namesOf = drawn.map(() => []);
            const count = { added: 0, offGenome: 0, skipped: 0 };
            const CHUNK = 8 * 1024 * 1024;
            let offset = 0, tail = '';
            while (offset < file.size) {
                const slice = file.slice(offset, Math.min(file.size, offset + CHUNK));
                let txt = '';
                try { txt = await slice.text(); } catch (e) { break; }
                offset += CHUNK;
                const lines = (tail + txt).split(/\r?\n/);
                // The last line of a slice is almost never a whole line.
                tail = (offset < file.size) ? lines.pop() : '';
                parseLines(lines, bufs, namesOf, count);
                graph.setMessage(' Reading ' + file.name + ' — '
                    + Math.min(100, Math.round(offset * 100 / file.size)) + '%, '
                    + count.added.toLocaleString() + ' variants… ');
                await new Promise((r) => setTimeout(r, 0));
            }
            if (tail) parseLines([tail], bufs, namesOf, count);
            finalise(bufs, namesOf, count, file.name);
            return count;
        };

        // ---- keeping the file ----------------------------------------------------------
        // Straight into the signed-in user's own drive -- no path, which is the root of My
        // Files -- through the same chunked /upload endpoint
        // baja/manchester/menu/upload-data.js uses. Chunked because the whole point of this
        // is files too big to hand over in one request.
        const uploadToMyFiles = async (file, onPct) => {
            const host_ = window['env']['apiUrl'];
            const chunkSize = 5 * 1024 * 1024;
            const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
            const uploadId = Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + file.name;
            for (let ci = 0; ci < totalChunks; ci++) {
                const start = ci * chunkSize;
                const fd = new FormData();
                fd.append('user', getUser());
                fd.append('type', 'data');
                fd.append('file', file.slice(start, Math.min(start + chunkSize, file.size)), file.name);
                fd.append('uploadId', uploadId);
                fd.append('filename', file.name);
                fd.append('chunkIndex', String(ci));
                fd.append('totalChunks', String(totalChunks));
                fd.append('fileSize', String(file.size));
                let r = null;
                try {
                    const res = await fetch(host_ + '/upload', { method: 'POST', body: fd });
                    r = await res.json();
                    if (!res.ok || (r && r.failed)) return { error: 'upload failed at chunk ' + ci };
                } catch (e) { return { error: 'network error during upload' }; }
                if (onPct) onPct(((ci + 1) / totalChunks) * 100);
            }
            return { ok: true };
        };

        // The picker. Reading and uploading are separate jobs on the same file and both are
        // worth doing: the points appear from the local read without waiting for the network,
        // and the file is kept whether or not the drawing found anything in it.
        const pickVcf = () => {
            try {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.vcf,.txt,text/plain';
                input.style.cssText = 'position:fixed;left:-9999px;';
                document.body.appendChild(input);
                input.onchange = async () => {
                    const file = input.files && input.files[0];
                    try { document.body.removeChild(input); } catch (e) { }
                    if (!file) return;
                    if (/\.gz$/i.test(file.name)) {
                        graph.setMessage(' ' + file.name + ' is compressed. Decompress it first — '
                            + 'this reads plain VCF text. ');
                        return;
                    }
                    step('file: ' + file.name + ' ' + file.size + ' bytes');
                    let count = null;
                    try { count = await addVcfFile(file); }
                    catch (e) { graph.setMessage(' ' + file.name + ' could not be read: ' + (e && e.message ? e.message : e) + ' '); }
                    graph.setMessage(' Saving ' + file.name + ' to My Files… ');
                    const up = await uploadToMyFiles(file, (pct) => {
                        graph.setMessage(' Saving ' + file.name + ' to My Files — ' + Math.round(pct) + '%… ');
                    });
                    if (up && up.error) {
                        graph.setMessage(' ' + (count ? count.added.toLocaleString() + ' variants drawn, but ' : '')
                            + file.name + ' was not saved: ' + up.error + '. ');
                        step('upload failed: ' + up.error);
                    } else {
                        graph.setMessage(' ' + (count ? count.added.toLocaleString() + ' variants drawn. ' : '')
                            + file.name + ' saved to My Files. ');
                        step('upload ok: ' + file.name);
                    }
                };
                input.click();
            } catch (e) { graph.setMessage(' The file picker could not be opened: ' + e + ' '); }
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
        // PANNING IS THE DEFAULT STATE. A karyotype is a thing to move around and look at
        // before it is a thing to select from, and a canvas that only drags out regions makes
        // the ordinary gesture -- push the picture sideways -- do something else.
        //
        // With no listeners installed the graph pans and zooms on its own. The one thing to
        // stop is its habit of filling that vacuum: a click on a bare canvas re-arms
        // mouse-over-highlight, which is the hover tool for TRACKS and has nothing to hover
        // here. __hoverRearm is the graph's own override for exactly that, so it is pointed
        // at a function that does nothing rather than left to exec a tool into this view.
        const pan = () => {
            graph.clearMouseListeners();
            try { graph.__hoverRearm = () => { }; } catch (e) { }
            try { graph.graph.mode = 'navigate'; } catch (e) { }
            dragging = null;
        };

        const arm = () => {
            graph.clearMouseListeners();
            try { graph.__hoverRearm = () => { }; } catch (e) { }
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
                if (!hit) { graph.setMessage(' Nothing there — drag on a chromosome. '); pan(); return; }
                // World y runs negative down the chromosome, so the HIGHER world y is the
                // LOWER base. Clamped to the chromosome: a drag that runs off the end means
                // "to the end", not a coordinate past it.
                if (hit.circular) {
                    graph.setMessage(' ' + hit.chrom.name + ' — the mitochondrial genome, '
                        + human(hit.chrom.length) + ' bp, circular. Drawn as a ring and not to '
                        + 'the scale of the others. ');
                    pan();
                    return;
                }
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
                        + 'Drag to move; Select sequence to choose a range. ');
                    pan();
                    return;
                }
                const padMb = Math.max(0.5, (hi - lo) / MB * 0.08);
                await graph.zoomRect(barLeft(hit.i) - 0.5 * SLOT, barRight(hit.i) + 0.5 * SLOT,
                    wy(lo) + padMb, wy(hi) - padMb, 150);
                try { await openRange(hit.i, lo, hi); } catch (e) { step('range failed: ' + e); }
                graph.setMessage(' ' + hit.chrom.name + ':' + human(lo) + '-' + human(hi)
                    + '  (' + (Math.round((hi - lo) / 1e4) / 100) + ' Mb) ');
                try {
                    graph.__karyotypeRegion = { chr: hit.chrom.name.replace(/^chr/, ''), start: lo, end: hi };
                } catch (e) { }
                // One region per arming: the next drag is a pan again, which is the gesture
                // someone reaches for straight after choosing a place to look at.
                pan();
            });
        };

        // ---- save and open, as JSON ------------------------------------------------------
        //
        // The same shape the editor uses -- a JSON document in the user's own drive, written
        // through /save-user-data and read back through /load-file -- so a karyotype sits
        // beside the .baja screens in the same file browser rather than in a store of its own.
        //
        // WHAT IS WORTH SAVING is the variants and where you were looking, not the
        // chromosomes: those come from the karyotype table on the server and are the same for
        // everyone. A file that carried its own copy of hg38's bands would be forty times
        // larger and would go stale the day the table is rebuilt.
        const SAVE_CAP = 250000;      // variants written to a file
        const SAVE_EXT = '.karyotype.json';

        const stateDoc = () => {
            const out = {
                type: 'baja-karyotype', version: 1,
                species: r.species || wanted, assembly: r.assembly || '',
                saved: new Date().toISOString(),
                view: null, variants: [], truncated: false, total: vtotal,
            };
            try {
                const gr = graph.graph && graph.graph.grid;
                if (gr) out.view = { x0: gr.xmin, x1: gr.xmax, y0: gr.ymin, y1: gr.ymax };
            } catch (e) { }
            // Short keys: at a quarter of a million variants the difference between "position"
            // and "p" is several megabytes of the same information.
            let n = 0;
            for (let ci = 0; ci < drawn.length && n < SAVE_CAP; ci++) {
                const d = vdata[ci];
                if (!d.n) continue;
                const bare = drawn[ci].name.replace(/^chr/, '');
                for (let k = 0; k < d.n && n < SAVE_CAP; k++) {
                    const ab = allelesAt(ci, k);
                    const e = { c: bare, p: d.pos[k], r: ab[0], a: ab[1] };
                    if (d.cls[k]) e.s = d.cls[k];
                    const nm = d.names[k];
                    if (nm) e.n = nm;
                    out.variants.push(e);
                    n++;
                }
            }
            out.truncated = vtotal > n;
            return out;
        };

        const applyDoc = async (doc) => {
            if (!doc || doc.type !== 'baja-karyotype') {
                graph.setMessage(' That file is not a saved karyotype. ');
                return false;
            }
            if (doc.species && r.species && ('' + doc.species).toLowerCase() !== ('' + r.species).toLowerCase()) {
                // Not refused -- positions are positions -- but said, because a mouse file on
                // a human karyotype puts variants at coordinates that mean nothing.
                graph.setMessage(' That file was saved for ' + doc.species + ' and this is '
                    + r.species + '. Positions may not mean what they did. ');
            }
            if (!SnpIndel) { try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { } }
            const bufs = newBufs(), namesOf = drawn.map(() => []);
            const count = { added: 0, offGenome: 0, skipped: 0 };
            for (const v of (doc.variants || [])) {
                let ci = chromIndex[v.c];
                if (ci == null) ci = chromIndex['chr' + v.c];
                if (ci == null) { count.offGenome++; continue; }
                if (!(v.p > 0) || v.p > drawn[ci].length) { count.offGenome++; continue; }
                if (vtotal + count.added < OBJECT_CAP) namesOf[ci].push(v.n || '');
                pushInto(bufs, ci, +v.p, +(v.s || 0), ('' + (v.r || 'N')).toUpperCase(),
                    ('' + (v.a || 'N')).toUpperCase());
                count.added++;
            }
            finalise(bufs, namesOf, count, doc.name || 'the saved file');
            if (doc.view && isFinite(doc.view.x0)) {
                try { await graph.zoomRect(doc.view.x0, doc.view.x1, doc.view.y1, doc.view.y0, 30); } catch (e) { }
            }
            pan();
            return true;
        };

        const saveJson = () => {
            // THE SAME SHAPE AS THE SPECIES PROMPT, which is the one dialog in this app known
            // to draw. That one is a full-screen column -- header row, scrolling body -- and
            // this was a centred card floating inside a translucent sheet. Whatever the card
            // was doing, the fix is not to debug a second layout when a working one is already
            // here: full screen, header with the buttons in it, one field below.
            try { const old3 = document.getElementById('baja-karyo-save'); if (old3 && old3.parentNode) old3.parentNode.removeChild(old3); } catch (e) { }
            const panel = document.createElement('div');
            panel.id = 'baja-karyo-save';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            const suggested = (('' + (r.species || 'karyotype')).toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
                + (vtotal ? '-' + vtotal + 'variants' : '');
            const note = (vtotal > SAVE_CAP)
                ? ('Holding ' + vtotal.toLocaleString() + ' variants; the first '
                    + SAVE_CAP.toLocaleString() + ' are written. If the file came in through '
                    + 'Upload VCF, all of it is already in My Files.')
                : (vtotal.toLocaleString() + ' variant' + (vtotal === 1 ? '' : 's') + ' will be written.');
            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);'
                + 'box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
                + '<div style="min-width:0;"><div style="font:700 20px Arial;">Save karyotype</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + 'Into My Files, as JSON. The variants and the view are saved; the chromosomes '
                + 'come from the server.</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + '<button id="ks-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;'
                + 'font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;'
                + 'color:#fff;">Cancel</button>'
                + '<button id="ks-go" style="cursor:pointer;border-radius:8px;padding:9px 18px;'
                + 'font:700 12.5px Arial;border:1px solid #22c55e;background:#22c55e;'
                + 'color:#04210f;">Save</button>'
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                + '<div style="width:100%;max-width:640px;margin:0 auto;">'
                + '<label style="display:block;font:600 12px Arial;color:#9fb3c8;margin:0 0 6px;">File name</label>'
                + '<textarea id="ks-name" rows="1" style="width:100%;box-sizing:border-box;background:#0a1e3a;'
                + 'color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 11px;'
                + 'font:13px Arial;resize:none;"></textarea>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">' + note + '</div>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:10px;">'
                + 'Saved as <b>' + SAVE_EXT + '</b> unless the name already ends in .json.</div>'
                + '</div></div>';
            document.body.appendChild(panel);
            // The VALUE is set as a property rather than written into the markup: a filename
            // with a quote in it would otherwise close the attribute and take the rest of the
            // dialog with it, which is exactly the class of failure that leaves a screen with
            // no field and no buttons on it.
            const nameEl = panel.querySelector('#ks-name');
            try { nameEl.value = suggested; } catch (e) { }
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            const close3 = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            panel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { close3(); }
                else if (e.key === 'Enter') { e.preventDefault(); panel.querySelector('#ks-go').click(); }
            });
            panel.querySelector('#ks-cancel').onclick = () => close3();
            try { focusUnlessMobile(nameEl); } catch (e) { }
            panel.querySelector('#ks-go').onclick = async () => {
                let name = ('' + nameEl.value).trim().replace(/[\r\n]+/g, ' ');
                if (!name) { try { nameEl.focus(); } catch (e) { } return; }
                if (!/\.json$/i.test(name)) name += SAVE_EXT;
                close3();
                graph.setMessage(' Saving ' + name + '… ');
                try {
                    const doc = stateDoc();
                    doc.name = name;
                    const rs = await POSTJSON({
                        name: name, key: 'user', user: getUser(), spath: '',
                        value: JSON.stringify(doc),
                    }, window['env']['apiUrl'] + '/save-user-data');
                    if (rs && (rs.status === 'saved' || rs.path)) {
                        graph.setMessage(' Saved ' + name + ' to My Files — '
                            + doc.variants.length.toLocaleString() + ' variant'
                            + (doc.variants.length === 1 ? '' : 's')
                            + (doc.truncated ? ' (of ' + vtotal.toLocaleString() + ')' : '') + '. ');
                        step('saved ' + name);
                    } else {
                        graph.setMessage(' ' + name + ' was not saved. ');
                        step('save failed: ' + JSON.stringify(rs).slice(0, 160));
                    }
                } catch (e) {
                    graph.setMessage(' ' + name + ' was not saved: ' + (e && e.message ? e.message : e) + ' ');
                    step('save threw: ' + e);
                }
            };
            step('save dialog open');
        };

        // Open uses the SAME file browser the editor's Open does -- simple-file-browser rooted
        // at the user's drive -- so there is one way to find a file in this application rather
        // than a second one that only this view knows about.
        let openRestore = null;
        const openJson = async () => {
            const host_ = window['env']['apiUrl'];
            const browser = {
                wid: 'simple-file-browser',
                width: '100%',
                height: '100%',
                data: {
                    showSearch: true, width: '100%', drive: 'user', user: getUser(),
                    root: getUser(), columns: 3,
                    'ionfunction.cmd': createIonFunction(() => { }),
                    'ionfunction.path': createIonFunction(() => { }),
                    'ionfunction.openfile': createIonFunction(() => { }),
                    'ionfunction.fileClick': createIonFunction(async (element) => {
                        try { if (openRestore) openRestore(); } catch (e) { }
                        graph.setMessage(' Opening ' + (element && element.name) + '… ');
                        try {
                            // element.path as-is: the browser roots at the user's folder id and
                            // /load-file grants access on that id, not on the raw email.
                            const doc = await GETJSON(host_ + '/load-file?path=' + element.path
                                + '&key=user&user=' + getUser());
                            const parsed = (typeof doc === 'string') ? JSON.parse(doc) : doc;
                            await applyDoc(parsed);
                        } catch (e) {
                            graph.setMessage(' ' + (element && element.name) + ' could not be opened: '
                                + (e && e.message ? e.message : e) + ' ');
                            step('open failed: ' + e);
                        }
                    }),
                }
            };
            // THE WHOLE PANEL, not a modal. showModal renders into a dialog the host sizes,
            // and a file browser in a small box is a file browser you scroll instead of read.
            // Taking over mainPanel -- the way upload-data.js does -- gives it the screen, and
            // Close puts the karyotype back by setting the layout this app already built.
            const restore = () => {
                try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
                try { CurrentLayout.setComponent('mainPanel', main_layout); } catch (e) { }
                // The canvas comes back into a panel that has just been resized, so it needs
                // the same nudge the first mount did or it draws against stale dimensions.
                whenSized(() => {
                    try { if (graph.graph && graph.graph.grid && graph.graph.grid.rescale) graph.graph.grid.rescale(); } catch (e) { }
                    try { if (graph.rescale) graph.rescale(); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                });
            };
            const browser_layout = {
                wid: 'card',
                height: '100%',
                componentRef: 'mainPanel',
                data: {
                    cards: [[
                        {
                            'width': '100%',
                            'component': {
                                wid: 'button-menu',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Close', icon: 'close',
                                            tooltip: 'Back to the chromosomes',
                                            ionFunction: createIonFunction(() => { restore(); })
                                        },
                                    ]
                                }
                            }
                        }
                    ], [
                        { 'width': '100%', 'height': '100%', 'component': browser }
                    ]]
                }
            };
            // fileClick restores the panel itself, so the karyotype is back before the file
            // has finished loading onto it.
            openRestore = restore;
            try {
                CurrentLayout.clearComponent('mainPanel');
                CurrentLayout.setComponent('mainPanel', browser_layout);
            } catch (e) { graph.setMessage(' The file browser could not be opened: ' + e + ' '); }
        };

        // ---- what is in the range that was just dragged out -------------------------------
        //
        // A selection is only worth making if something comes of it. The range goes to the
        // annotation, comes back as the genes and transcripts inside it, and the list is the
        // handover: tick what is wanted and it opens in the editor with the variants that fall
        // inside those transcripts already on them.
        const openRange = async (ci, lo, hi) => {
            const c = drawn[ci];
            const bare = c.name.replace(/^chr/, '');
            let r2 = null;
            try {
                const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
                graph.setMessage(' Reading ' + c.name + ':' + human(lo) + '-' + human(hi) + '… ');
                r2 = await exec(server + '/py/bio/genes-in-range.py', em, bare, '' + lo, '' + hi,
                    (r.species || 'human'), '200');
            } catch (e) { r2 = null; }
            let genes = [];
            try { genes = JSON.parse((r2 && r2.genes) || '[]'); } catch (e) { genes = []; }
            if (!r2 || r2.error || !genes.length) {
                graph.setMessage(' ' + c.name + ':' + human(lo) + '-' + human(hi) + ' — '
                    + ((r2 && r2.error) || 'no genes annotated in that range') + '. ');
                return;
            }

            // The variants of this chromosome inside the range, as real records. Read out of
            // the typed arrays by binary search, so a whole-genome file costs the window and
            // not the file.
            const d = vdata[ci];
            const inRange = [];
            if (d.n) {
                let a2 = 0, z2 = d.n;
                while (a2 < z2) { const m2 = (a2 + z2) >> 1; if (d.pos[m2] < lo) a2 = m2 + 1; else z2 = m2; }
                for (let k = a2; k < d.n && d.pos[k] <= hi; k++) {
                    const ab = allelesAt(ci, k);
                    inRange.push({
                        chr: bare, pos: d.pos[k], ref: ab[0], alt: ab[1],
                        name: (d.names[k] || (c.name + ':' + d.pos[k])),
                        sig: ['', 'Pathogenic', 'Benign', 'Uncertain significance',
                            'Conflicting classifications of pathogenicity'][d.cls[k]] || '',
                        source: 'VCF',
                    });
                }
            }

            const panel = document.createElement('div');
            try { const old2 = document.getElementById('baja-karyo-range'); if (old2 && old2.parentNode) old2.parentNode.removeChild(old2); } catch (e) { }
            panel.id = 'baja-karyo-range';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            const esc2 = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const row2 = (gn, i2) =>
                '<label style="display:flex;align-items:flex-start;gap:10px;padding:11px 12px;margin-bottom:8px;'
                + 'border-radius:8px;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);cursor:pointer;">'
                + '<input type="checkbox" class="kr-g" data-i="' + i2 + '" style="margin-top:3px;"'
                + (gn.transcript && gn.coding ? ' checked' : '') + (gn.transcript ? '' : ' disabled') + '/>'
                + '<span style="min-width:0;">'
                + '<span style="font:700 13.5px Arial;color:#e8f0fb;">' + esc2(gn.gene) + '</span>'
                + (gn.coding ? '<span style="margin-left:8px;border-radius:20px;padding:2px 8px;font:700 10.5px Arial;'
                    + 'background:rgba(34,197,94,0.16);border:1px solid rgba(34,197,94,0.5);color:#8ff0b0;">coding</span>' : '')
                + '<br/><span style="font:12px Arial;color:#9fb3c8;">'
                + esc2(gn.transcript || 'no transcript in the annotation') + ' · ' + esc2(gn.biotype)
                + ' · ' + (gn.strand === '-' ? 'minus' : 'plus') + ' · '
                + human(gn.start) + '-' + human(gn.end) + '</span>'
                + '</span></label>';
            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
                + '<div style="min-width:0;"><div style="font:700 20px Arial;">'
                + esc2(c.name + ':' + human(lo) + '-' + human(hi)) + '</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + fmtSpan(hi - lo) + ' · ' + genes.length + ' gene' + (genes.length === 1 ? '' : 's')
                + (r2.truncated ? ' (the closest 200)' : '')
                + (inRange.length ? ' · ' + inRange.length.toLocaleString() + ' variant'
                    + (inRange.length === 1 ? '' : 's') + ' in range' : ' · no variants loaded here')
                + '</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + '<button id="kr-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Close</button>'
                + '<button id="kr-go" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Open in editor</button>'
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                + '<div style="width:100%;max-width:760px;margin:0 auto;">'
                + '<div style="display:flex;gap:14px;margin-bottom:10px;font:12px Arial;">'
                + '<a id="kr-all" href="#" style="color:#8ab4ff;">Select all</a>'
                + '<a id="kr-none" href="#" style="color:#8ab4ff;">Select none</a>'
                + '<a id="kr-coding" href="#" style="color:#8ab4ff;">Coding only</a></div>'
                + genes.map(row2).join('')
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:16px;">'
                + 'The ticked transcripts open in the editor. Variants inside them come across '
                + 'and land on the track they belong to.</div>'
                + '</div></div>';
            document.body.appendChild(panel);
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            const q2 = (sel) => panel.querySelector(sel);
            const qa2 = (sel) => Array.prototype.slice.call(panel.querySelectorAll(sel));
            const close2 = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close2(); });
            q2('#kr-cancel').onclick = () => close2();
            q2('#kr-all').onclick = (e) => { e.preventDefault(); qa2('.kr-g').forEach((cb) => { if (!cb.disabled) cb.checked = true; }); };
            q2('#kr-none').onclick = (e) => { e.preventDefault(); qa2('.kr-g').forEach((cb) => { cb.checked = false; }); };
            q2('#kr-coding').onclick = (e) => {
                e.preventDefault();
                qa2('.kr-g').forEach((cb) => { cb.checked = !cb.disabled && !!genes[+cb.getAttribute('data-i')].coding; });
            };
            q2('#kr-go').onclick = async () => {
                const ids = qa2('.kr-g').filter((cb) => cb.checked)
                    .map((cb) => genes[+cb.getAttribute('data-i')].transcript).filter(Boolean);
                if (!ids.length) { graph.setMessage(' Tick a transcript to open. '); return; }
                close2();
                step('opening ' + ids.length + ' transcript(s) with ' + inRange.length + ' variant(s)');
                graph.setMessage(' Opening the editor… ');
                // THE HANDOVER. The editor is a different app with a different graph, and it
                // stashes that graph as it boots -- so the wait is for the stash to CHANGE,
                // not merely to exist: this graph is already in there under the same key.
                const mine = graph;
                try { exec('manchester/editor', '', { mode: 'editor' }); } catch (e) { }
                let g2 = null;
                for (let t2 = 0; t2 < 100 && !g2; t2++) {
                    await new Promise((res) => setTimeout(res, 200));
                    try {
                        const st = CurrentLayout.getStashed('graph');
                        if (st && st !== mine) g2 = st;
                    } catch (e) { }
                }
                if (!g2) { step('the editor did not report a graph'); return; }
                try {
                    await exec('baja/data/load-transcripts-with-variants.js', server, g2,
                        g2.genegraph_panel_layout, ids, inRange);
                } catch (e) { step('load failed: ' + (e && e.message ? e.message : e)); }
            };
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
            pan();
            step('framed; panning');
        });
        graph.setMessage(' ' + (r.species || wanted) + ' ' + (r.assembly ? '(' + r.assembly + ') ' : '')
            + '— ' + drawn.length + ' chromosomes, smallest first, all at one scale. '
            + 'Drag to move, scroll to zoom; Select sequence to choose a range. ');
        return { graph: graph, chromosomes: drawn, species: r.species, assembly: r.assembly, fit: fit };
    })();
}
