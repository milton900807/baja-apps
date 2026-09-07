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

        // Base position -> world y. One place, because getting it wrong in one of the five
        // places that need it would put bands on a chromosome they do not belong to.
        const wy = (bp) => -bp / MB;
        const slotOf = (i) => i + 0.5;
        const barLeft = (i) => slotOf(i) - BAR_W / 2;
        const barRight = (i) => slotOf(i) + BAR_W / 2;

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
                ctx.restore();
            }
        };

        // ---- which chromosome and which base is under a point --------------------------------
        const at = (wx, wyWorld) => {
            const i = Math.floor(wx);
            if (i < 0 || i >= drawn.length) return null;
            if (wx < barLeft(i) - 0.06 || wx > barRight(i) + 0.06) return null;
            const c = drawn[i];
            const bp = Math.round(Math.max(0, Math.min(c.length, -wyWorld * MB)));
            return { i: i, chrom: c, bp: bp };
        };
        const human = (n) => (+n).toLocaleString();

        // ---- drag a region off a chromosome --------------------------------------------------
        // The selection is in WORLD coordinates, so the same drag means the same thing at
        // every zoom level, and the rectangle handed to zoomRect is the rectangle drawn.
        const arm = () => {
            graph.clearMouseListeners();
            // AFTER the clear, which nulls it (gene.js clearMouseListeners). Re-installing it
            // here rather than once at startup is why the chromosomes survive every re-arm.
            graph.highlightmethod = paint;
            graph.setMouseMode('msg: Drag down a chromosome to choose a region.');
            let from = null;
            graph.addMouseDownListener((x, y) => { from = { x: graph.Xwc(x), y: graph.Ywc(y) }; });
            graph.addMouseUpListener(async (x, y) => {
                const to = { x: graph.Xwc(x), y: graph.Ywc(y) };
                const f = from; from = null;
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
                    await graph.zoomRect(barLeft(hit.i) - 0.35, barRight(hit.i) + 0.35,
                        2, wy(hit.chrom.length) - 2, 150);
                    graph.setMessage(' ' + hit.chrom.name + ' — ' + human(hit.chrom.length) + ' bp. '
                        + 'Drag down it to choose a region. ');
                    arm();
                    return;
                }
                const padMb = Math.max(0.5, (hi - lo) / MB * 0.08);
                await graph.zoomRect(barLeft(hit.i) - 0.5, barRight(hit.i) + 0.5,
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
            await graph.zoomRect(-0.4, drawn.length + 0.4, maxMb * 0.06, -maxMb * 1.12, 0);
            if (graph.wake) graph.wake();
        };
        graph.highlightmethod = paint;
        step('painting ' + drawn.length + ' chromosomes; waiting for the canvas to size');
        whenSized(async () => {
            step('canvas sized ' + canvasSize().w + 'x' + canvasSize().h);
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
