function (model) {

    // A PICTURE OF HOW TWO TRACKS LINE UP.
    //   exec('baja/bio/compare-view.js', { title, a, b, blocks, unmatched, summary, legend })
    //
    // The numbers were right and unreadable: thirty rows of "148 nt at 4,827-4,975 matches
    // MAPK8IP3_mRNA 1,100-1,280" in a scrolling list, with the twenty-two exons that matched
    // nothing taking more room than the eight that did. A table is the wrong shape for this
    // question. What the eye wants to know is WHERE each block went, whether the order held,
    // and which ones crossed or flipped, and all three of those are shapes rather than
    // numbers.
    //
    // So: the two tracks as lanes, to their own scales, each matched pair joined by a ribbon
    // whose ends are the two blocks. Order shows as ribbons that stay parallel; rearrangement
    // shows as ribbons that cross; a flip shows as a ribbon that twists, drawn hatched so it
    // reads at a glance rather than from a symbol. An exon that matched nothing is a hollow
    // notch on its lane, present but plainly empty, which is the one thing a list of
    // twenty-two "nothing above the noise floor" lines cannot do.
    //
    // THE HUES ARE THE CANVAS HUES. A block is drawn here in the colour match-layer.js gives
    // it on the track, so a bar the user is looking at on the canvas can be found in this
    // picture and the other way round. Identity is carried by the number on the ribbon and
    // by how solid it is, not by its colour, which is already saying something else.
    //
    // The numbers are not thrown away: "Numbers" opens the same rows underneath.
    //
    // A FULL WINDOW, NOT A POPUP. A comparison is read across its whole width -- the point
    // is where things sit relative to each other -- and a panel floating over the canvas
    // gives it a third of the screen and puts the thing being explained behind it. It fills
    // the window, redraws to fit when the window changes, and closes on Escape or Close.
    //
    // IT LEAVES AS A FILE. A figure like this ends up in a document or a talk, so it
    // downloads: PDF through the jsPDF the shell already loads, and SVG, which is the same
    // drawing as vector line work for anyone who wants to edit it. One drawing, written
    // once: the PDF is the SVG rasterised at print resolution rather than a second renderer
    // that would quietly drift away from what is on screen.

    return (async () => {
        const m = model || {};
        const A = m.a || {}, B = m.b || {};
        const blocks = (m.blocks || []).filter((b) => b && b.a && b.b);
        if (!blocks.length && !(m.unmatched || []).length) return null;

        // One of these at a time.
        try { if (window.__bajaCompareView && window.__bajaCompareView.destroy) window.__bajaCompareView.destroy(); } catch (e) { }

        const PAD = 30;                       // left and right margin inside the picture
        const LANE = 30;                      // lane height
        const TOP = 48;                       // room for the top lane's label
        // The picture fills the window and grows with it: the ribbons are the content, and
        // on a wide screen the extra room goes to them rather than to margins.
        let W = 0, H = 0, GAP = 0, innerW = 0;
        const measure = () => {
            W = Math.max(640, Math.floor(window.innerWidth - 56));
            GAP = Math.max(150, Math.min(640, Math.floor(window.innerHeight - 282)));
            H = TOP + LANE + GAP + LANE + 58;
            innerW = W - PAD * 2;
        };
        measure();

        // Each track to its OWN scale: the two are different lengths and a shared scale
        // would squeeze the shorter one to a stub and say something untrue about where a
        // block sits within it.
        const scale = (t) => {
            const lo = Math.min(+t.x1, +t.x2), hi = Math.max(+t.x1, +t.x2);
            const span = (hi - lo) || 1;
            return (x) => PAD + ((Math.max(lo, Math.min(hi, +x)) - lo) / span) * innerW;
        };
        let sa = scale(A), sb = scale(B);
        let yA = TOP, yB = TOP + LANE + GAP;

        const hue = (i) => (i * 47) % 360;
        const pct = (x) => (Math.round((+x || 0) * 1000) / 10).toFixed(1) + '%';
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const num = (x) => (Math.round(+x) || 0).toLocaleString();

        const BTN = (id, label) =>
            '<button type="button" data-id="' + id + '" style="background:transparent;'
            + 'border:1px solid rgba(159,196,212,0.5);color:#eaf6f9;border-radius:7px;'
            + 'padding:6px 13px;cursor:pointer;font:inherit;white-space:nowrap;">' + label + '</button>';

        const el = document.createElement('div');
        el.id = 'baja-compare-view';
        el.setAttribute('role', 'dialog');
        el.style.cssText = 'position:fixed;inset:0;z-index:2147482400;display:flex;flex-direction:column;'
            + 'background:#0a2540;padding:16px 20px 12px 20px;overflow:auto;'
            + 'color:#eaf6f9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;';

        // ---- the ribbons ---------------------------------------------------------------
        // WHERE EACH PERCENTAGE SITS, worked out before any of them is drawn. Ribbons bunch
        // up wherever a run of blocks matched close together, and three labels at the same
        // height in the same place overprint into "79.3%73.6%", which is unreadable and
        // worse than no number at all. Sorted by where the label would land and dealt three
        // heights in turn, neighbours never share one.
        const midX = (b) => (sa(Math.min(b.a.x1, b.a.x2)) + sa(Math.max(b.a.x1, b.a.x2))
            + sb(Math.min(b.b.x1, b.b.x2)) + sb(Math.max(b.b.x1, b.b.x2))) / 4;
        const computeLabelDy = () => {
            const order = blocks.map((b, i) => ({ i: i, x: midX(b) })).sort((p, q) => p.x - q.x);
            const dy = new Array(blocks.length).fill(0);
            let lastX = -1e9, step = 0;
            for (const o of order) {
                // Only stagger what would actually collide: an isolated ribbon keeps its
                // label on the line through the middle, where it reads best.
                if (o.x - lastX < 72) step = (step + 1) % 3; else step = 0;
                dy[o.i] = [0, -15, 15][step];
                lastX = o.x;
            }
            return dy;
        };
        let labelDy = [];

        const ribbon = (b, i) => {
            const n = (b.n != null) ? (b.n - 1) : i;
            const h = hue(n);
            const ax0 = sa(Math.min(b.a.x1, b.a.x2)), ax1 = sa(Math.max(b.a.x1, b.a.x2));
            const bx0 = sb(Math.min(b.b.x1, b.b.x2)), bx1 = sb(Math.max(b.b.x1, b.b.x2));
            // A block narrower than a hair is still a block: it gets a minimum width so it
            // can be seen and pointed at.
            const wa = Math.max(2.5, ax1 - ax0), wb = Math.max(2.5, bx1 - bx0);
            const a0 = ax0, a1 = ax0 + wa, b0 = bx0, b1 = bx0 + wb;
            const y0 = yA + LANE, y1 = yB;
            const mid = (y0 + y1) / 2;
            // An inverted pair is drawn CROSSED: its left end joins the other's right. That
            // is what a flip is, and it needs no key.
            const [p0, p1] = b.inverted ? [b1, b0] : [b0, b1];
            const op = 0.18 + 0.42 * Math.max(0, Math.min(1, (+b.identity || 0)));
            const d = 'M' + a0 + ',' + y0
                + ' C' + a0 + ',' + mid + ' ' + p0 + ',' + mid + ' ' + p0 + ',' + y1
                + ' L' + p1 + ',' + y1
                + ' C' + p1 + ',' + mid + ' ' + a1 + ',' + mid + ' ' + a1 + ',' + y0 + ' Z';
            const label = (b.label != null) ? b.label : ('' + ((b.n != null) ? b.n : (i + 1)));
            const title = label + (b.inverted ? ' (reversed)' : '') + ' · ' + pct(b.identity)
                + '\n' + (A.name || 'A') + ' ' + num(b.a.x1) + '-' + num(b.a.x2)
                + '\n' + (B.name || 'B') + ' ' + num(b.b.x1) + '-' + num(b.b.x2)
                + (b.note ? ('\n' + b.note) : '');
            return ''
                + '<g class="rb" data-i="' + i + '">'
                + '<title>' + esc(title) + '</title>'
                + '<path d="' + d + '" fill="hsla(' + h + ',70%,55%,' + op.toFixed(2) + ')" '
                + 'stroke="hsla(' + h + ',70%,62%,0.9)" stroke-width="0.8"'
                + (b.inverted ? ' stroke-dasharray="4 3"' : '') + '></path>'
                + '<rect x="' + a0 + '" y="' + yA + '" width="' + wa + '" height="' + LANE + '" '
                + 'fill="hsla(' + h + ',70%,58%,0.92)"></rect>'
                + '<rect x="' + b0 + '" y="' + yB + '" width="' + wb + '" height="' + LANE + '" '
                + 'fill="hsla(' + h + ',70%,58%,0.92)"></rect>'
                + '<text x="' + ((a0 + a1) / 2) + '" y="' + (yA + LANE - 8) + '" text-anchor="middle" '
                + 'font-size="10" fill="#07202f" font-weight="700" pointer-events="none">' + esc(label) + '</text>'
                + '<text x="' + ((p0 + p1) / 2) + '" y="' + (yB + LANE - 8) + '" text-anchor="middle" '
                + 'font-size="10" fill="#07202f" font-weight="700" pointer-events="none">' + esc(label) + '</text>'
                + '<text x="' + ((a0 + a1 + p0 + p1) / 4) + '" y="' + (mid + 3 + labelDy[i]) + '" '
                + 'text-anchor="middle" font-size="10" fill="#eaf6f9" pointer-events="none" '
                + 'stroke="rgba(4,16,30,0.85)" stroke-width="2.6" paint-order="stroke" '
                + 'stroke-linejoin="round">' + pct(b.identity) + '</text>'
                + '</g>';
        };

        // An exon that matched nothing: a hollow notch where it sits, so the gaps in the
        // picture are the gaps in the answer.
        const notch = (u) => {
            if (!u || !u.a) return '';
            const x0 = sa(Math.min(u.a.x1, u.a.x2)), x1 = sa(Math.max(u.a.x1, u.a.x2));
            const w = Math.max(2, x1 - x0);
            return '<g><title>' + esc((u.label || 'unmatched') + (u.why ? (' — ' + u.why) : '')) + '</title>'
                + '<rect x="' + x0 + '" y="' + yA + '" width="' + w + '" height="' + LANE + '" '
                + 'fill="rgba(159,196,212,0.10)" stroke="rgba(159,196,212,0.45)" stroke-width="0.7" '
                + 'stroke-dasharray="3 2"></rect></g>';
        };

        const lane = (y, name, t, align) =>
            '<rect x="' + PAD + '" y="' + y + '" width="' + innerW + '" height="' + LANE + '" rx="4" '
            + 'fill="rgba(159,196,212,0.13)" stroke="rgba(159,196,212,0.22)"></rect>'
            + '<text x="' + PAD + '" y="' + (align === 'above' ? (y - 10) : (y + LANE + 18)) + '" '
            + 'font-size="12" fill="#eaf6f9" font-weight="700">' + esc(name || '') + '</text>'
            + '<text x="' + (PAD + innerW) + '" y="' + (align === 'above' ? (y - 10) : (y + LANE + 18)) + '" '
            + 'text-anchor="end" font-size="10" fill="#9fc4d4">'
            + num(Math.min(+t.x1, +t.x2)) + ' – ' + num(Math.max(+t.x1, +t.x2)) + '</text>';

        // Rebuilt rather than scaled, so text stays the same size whatever the window is.
        const buildSvg = () => {
            measure();
            sa = scale(A); sb = scale(B);
            yA = TOP; yB = TOP + LANE + GAP;
            labelDy = computeLabelDy();
            return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" '
                + 'viewBox="0 0 ' + W + ' ' + H + '" style="display:block;max-width:100%;height:auto;">'
                + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#07202f"></rect>'
                + lane(yA, A.name, A, 'above')
                + lane(yB, B.name, B, 'below')
                + (m.unmatched || []).map(notch).join('')
                + blocks.map(ribbon).join('')
                + '</svg>';
        };
        const svg = buildSvg();

        const rows = (m.rows || []).map((r) =>
            '<tr><td style="padding:4px 10px 4px 0;color:#9fc4d4;white-space:nowrap;vertical-align:top;">'
            + esc(r[0]) + '</td><td style="padding:4px 0;">' + esc(r[1]) + '</td></tr>').join('');

        el.innerHTML =
            '<div style="display:flex;align-items:flex-start;gap:12px;padding:2px 4px 10px 4px;">'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="font-weight:700;font-size:15px;">' + esc(m.title || 'Tracks compared') + '</div>'
            + (m.summary ? ('<div style="font-size:12px;color:#cfe9f3;margin-top:3px;">' + esc(m.summary) + '</div>') : '')
            + '</div>'
            + BTN('numbers', 'Numbers') + BTN('pdf', 'PDF') + BTN('svg', 'SVG') + BTN('close', 'Close')
            + '</div>'
            + '<div data-id="picture" style="background:#07202f;border-radius:9px;padding:8px 0 2px 0;">' + svg + '</div>'
            + '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#9fc4d4;padding:9px 4px 0 4px;">'
            + '<span>a solid ribbon is a match, and the darker it is the more identical</span>'
            + '<span>a dashed, crossed ribbon is reversed</span>'
            + '<span>a hollow notch matched nothing</span>'
            + '<span>crossing ribbons mean the blocks are in a different order on the two tracks</span>'
            + '</div>'
            + '<div data-id="said" style="font-size:12px;color:#ffd9a0;padding:6px 4px 0 4px;min-height:16px;"></div>'
            + (rows ? ('<div data-id="numbers-panel" style="display:none;margin-top:10px;border-top:1px solid '
                + 'rgba(159,196,212,0.22);padding-top:9px;max-height:40vh;overflow:auto;">'
                + '<table style="width:100%;border-collapse:collapse;font-size:12px;">' + rows + '</table></div>') : '');

        document.body.appendChild(el);

        const pop = { el: el, destroy: null };
        function close() {
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { window.removeEventListener('resize', onResize); } catch (e) { }
            try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
            if (window.__bajaCompareView === pop) window.__bajaCompareView = null;
        }
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        document.addEventListener('keydown', onKey, true);

        // ---- redraw to fit the window ---------------------------------------------------
        // Rebuilt rather than stretched: a scaled-up drawing takes its text with it, and
        // the labels are the half of this that carries the numbers.
        let rt = null;
        const onResize = () => {
            if (rt) { try { clearTimeout(rt); } catch (e) { } }
            rt = setTimeout(() => {
                rt = null;
                try {
                    const host = el.querySelector('[data-id="picture"]');
                    if (host) host.innerHTML = buildSvg();
                } catch (e) { }
            }, 120);
        };
        window.addEventListener('resize', onResize);

        // ---- it leaves as a file ---------------------------------------------------------
        const fileStem = ('' + (m.title || 'track-comparison'))
            .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'track-comparison';

        const svgText = () => {
            const node = el.querySelector('[data-id="picture"] svg');
            if (!node) return '';
            // Standalone: the page's styles are not coming with it, and the drawing carries
            // its own colours as attributes rather than relying on any of them.
            return '<?xml version="1.0" encoding="UTF-8"?>\n' + node.outerHTML;
        };

        const saveBlob = (text, type, name) => {
            try {
                const blob = new Blob([text], { type: type });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = name;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    try { document.body.removeChild(a); } catch (e) { }
                    try { URL.revokeObjectURL(url); } catch (e) { }
                }, 400);
                return true;
            } catch (e) { return false; }
        };

        const say = (t) => { try { const n = el.querySelector('[data-id="said"]'); if (n) n.textContent = t || ''; } catch (e) { } };

        // THE SAME DRAWING, rasterised at print resolution. jsPDF cannot place an SVG
        // without a plugin the shell does not load, and writing the picture a second time
        // in jsPDF's own primitives would be a second renderer to keep in step with this
        // one. At 3x a 1,200 point figure is 3,600 pixels across, which prints cleanly.
        const PDF_SCALE = 3;
        const savePdf = async () => {
            const node = el.querySelector('[data-id="picture"] svg');
            if (!node) return;
            const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
            if (!jsPDF) {
                // Said, with the way out: the SVG is the same drawing and every browser
                // prints one to PDF.
                say('PDF needs jsPDF, which is not loaded on this page. Use SVG instead \u2014 it is the same drawing.');
                return;
            }
            say('Making the PDF \u2026');
            try {
                const w = +node.getAttribute('width'), h = +node.getAttribute('height');
                const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText());
                const img = new Image();
                const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
                img.src = url;
                await loaded;
                const cv = document.createElement('canvas');
                cv.width = Math.round(w * PDF_SCALE);
                cv.height = Math.round(h * PDF_SCALE);
                const cx = cv.getContext('2d');
                cx.fillStyle = '#07202f';
                cx.fillRect(0, 0, cv.width, cv.height);
                cx.drawImage(img, 0, 0, cv.width, cv.height);
                const pdf = new jsPDF({ orientation: (w >= h) ? 'landscape' : 'portrait',
                    unit: 'pt', format: [w, h] });
                pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, w, h);
                pdf.save(fileStem + '.pdf');
                say('');
            } catch (e) {
                say('The PDF could not be made here (' + (e && e.message ? e.message : e)
                    + '). SVG gives you the same drawing.');
            }
        };
        pop.destroy = close;
        window.__bajaCompareView = pop;

        el.addEventListener('click', (e) => {
            const b = e.target && e.target.closest ? e.target.closest('button[data-id]') : null;
            if (!b) return;
            const id = b.getAttribute('data-id');
            if (id === 'close') { close(); return; }
            if (id === 'pdf') { savePdf(); return; }
            if (id === 'svg') {
                const t = svgText();
                if (!t || !saveBlob(t, 'image/svg+xml', fileStem + '.svg')) {
                    say('The SVG could not be saved here.');
                } else say('');
                return;
            }
            if (id === 'numbers') {
                const panel = el.querySelector('[data-id="numbers-panel"]');
                if (panel) panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
            }
        });
        // Pointing at a ribbon lifts it clear of the ones it crosses, which is the only way
        // to follow a single pair through a bundle of them.
        el.addEventListener('mouseover', (e) => {
            const g = e.target && e.target.closest ? e.target.closest('g.rb') : null;
            for (const x of el.querySelectorAll('g.rb')) x.style.opacity = (!g || x === g) ? '1' : '0.22';
        });
        el.addEventListener('mouseleave', () => {
            for (const x of el.querySelectorAll('g.rb')) x.style.opacity = '1';
        });
        // The canvas must not see presses on the panel.
        for (const ev of ['mousedown', 'mouseup', 'wheel', 'dblclick']) {
            el.addEventListener(ev, (e) => { e.stopPropagation(); });
        }
        return pop;
    })();
}
