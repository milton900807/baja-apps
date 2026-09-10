function (graph, opts) {

    // A QUICK TOUR OF THE EDITOR, pointed at the real controls.
    //
    //   await exec('baja/manchester/menu/ui-tour.js', graph, { onClose });
    //   await exec('baja/manchester/menu/ui-tour.js', graph, { steps: [...], onClose });
    //
    // Without `steps` it walks the oligo editor's toolbar, the steps below. With them it
    // walks whatever it was given, so the chromosome view (manchester/karyotype.js) and any
    // other screen built on the same button-menu row can offer the same tour of its own
    // controls without a second copy of the scrim, the card and the keyboard handling.
    // A step is { title, text, sel? | byTitle? | byIcon?, link?: { label, href } }; a link is
    // a button on the card that opens its page in a new tab, for the one stop that has more
    // to offer than a paragraph. '{stops}' in a text is replaced
    // by the number of stops after the introduction, so the count stays right when a
    // screen's toolbar is missing a button and the step for it drops out.
    //
    // A scrim over the app with a hole cut where the thing being described is, and a card
    // beside it. It DESCRIBES rather than drives: nothing here clicks a button, loads a
    // track or changes the document, so a tour can be taken with work open and left at any
    // point with nothing to undo.
    //
    // Every step is ANCHORED BY TOOLTIP, not by position in the row. The toolbar buttons
    // are icon-only and their tooltip is what the template puts in the title attribute
    // (button-menu.component.html), so the text a person hovers to learn the name is the
    // same string this matches on -- one thing to keep in step instead of two. A step whose
    // anchor is not on screen still shows, centred and without a spotlight, so a toolbar
    // that gains or loses a button shortens the tour rather than breaking it.

    return (async () => {
        const o = opts || {};
        const ID = 'baja-ui-tour';

        // byTitle is the tooltip; byIcon is the material ligature, used only when a button
        // has no tooltip to match on.
        const EDITOR_STEPS = [
            {
                title: 'A quick tour',
                text: '{stops} stops around the editor, describing what each control is for. '
                    + 'Nothing here changes your design — use Next and Back, or press Escape '
                    + 'to leave at any point.',
            },
            {
                title: 'The toolbar',
                sel: '.button-menu__grid',
                text: 'Everything you can do to a design is in this row. The buttons are '
                    + 'icons only; hover one to see its name. Most of them need a track on '
                    + 'the canvas first, which is the next stop.',
            },
            {
                title: 'Track — start here',
                byTitle: 'Add and manage tracks',
                byIcon: 'timeline',
                text: 'Opens the track library: build a track from a gene, from its variants, '
                    + 'or from a clinical compound. Until something is on the canvas, Layers, '
                    + 'Draw and Navigate will just tell you to load a track first.',
            },
            {
                title: 'Layers — what to show on it',
                byTitle: 'Data layers and models on a track',
                byIcon: 'local_library',
                text: 'The Institute: the library of data layers and models you can lay over '
                    + 'a track — expression, splicing, structure, off-targets and the rest.',
            },
            {
                title: 'Draw — annotate',
                byTitle: 'Annotate and draw on the canvas',
                byIcon: 'edit',
                text: 'Mark up the canvas: draw regions, add annotations and design oligos '
                    + 'against what you have marked.',
            },
            {
                title: 'Selection — what you have picked',
                byTitle: 'Selected objects, and everything the selection window can do with them',
                byIcon: 'checklist',
                text: 'Whatever you have lassoed or clicked on the canvas is listed here, with '
                    + 'a count on the button, and everything that can be done to the selection '
                    + 'as a whole is in this window.',
            },
            {
                title: 'Navigate — move around',
                byTitle: 'Move to a gene, a region or a feature',
                byIcon: 'explore',
                text: 'Jump to a gene, a region or a feature, zoom to fit, and step back and '
                    + 'forward through views you have already looked at.',
            },
            {
                title: 'File — open, save, share',
                byTitle: 'Open, save, upload and share',
                byIcon: 'folder_open',
                text: 'Open and save designs in My Files, upload your own sequences, and '
                    + 'share a public view-only link. Saved designs reopen exactly as you '
                    + 'left them.',
            },
            {
                title: 'The canvas',
                sel: 'canvas',
                text: 'Your tracks are drawn here. Drag to pan, wheel to zoom, and hold ctrl '
                    + 'while you wheel to zoom both axes at once. Right-click something on a '
                    + 'track to see what you can do with it.',
            },
            {
                title: 'Leaving',
                sel: '#baja-editor-close',
                text: 'The cross in the corner closes the editor. Save first from File if you '
                    + 'want the design back the way it is now.',
            },
            {
                title: 'That is the tour',
                byTitle: 'A quick tour of the editor',
                byIcon: 'help_outline',
                text: 'Help lives here whenever you want to see this again. The video '
                    + 'tutorials cover individual jobs end to end — designing allele selective '
                    + 'ASOs, running off-targets, and more.',
                link: { label: 'Video tutorials', href: '/assets/tutorials.html' },
            },
        ];

        const STEPS = (Array.isArray(o.steps) && o.steps.length) ? o.steps : EDITOR_STEPS;

        const esc = (s) => ('' + (s == null ? '' : s))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // The element a step points at, or null. Visible-only: a button in a collapsed or
        // hidden panel has a zero box, and spotlighting a rectangle of no size reads as the
        // scrim having gone wrong.
        const seen = (el) => {
            if (!el) return null;
            try {
                const r = el.getBoundingClientRect();
                if (!r || r.width < 2 || r.height < 2) return null;
                if (r.bottom < 0 || r.right < 0) return null;
                if (r.top > window.innerHeight || r.left > window.innerWidth) return null;
                return el;
            } catch (e) { return null; }
        };
        const anchorOf = (s) => {
            try {
                if (s.byTitle) {
                    const el = seen(document.querySelector('[title="' + s.byTitle.replace(/"/g, '\\"') + '"]'));
                    if (el) return el;
                }
                if (s.byIcon) {
                    // The ligature is the icon span's text; the button is what we want to ring.
                    for (const g of document.querySelectorAll('.circle-btn .material-icons, .circle-btn .material-symbols-outlined')) {
                        if (('' + g.textContent).trim() === s.byIcon) {
                            const el = seen(g.closest('.circle-btn'));
                            if (el) return el;
                        }
                    }
                }
                if (s.sel === 'canvas') {
                    // The biggest one on screen: the editor draws into a canvas, but so do
                    // the small widgets around it, and the tour means the drawing surface.
                    let best = null, area = 0;
                    for (const c of document.querySelectorAll('canvas')) {
                        const el = seen(c);
                        if (!el) continue;
                        const r = el.getBoundingClientRect();
                        if (r.width * r.height > area) { area = r.width * r.height; best = el; }
                    }
                    return best;
                }
                if (s.sel) return seen(document.querySelector(s.sel));
            } catch (e) { }
            return null;
        };

        // Only the steps whose anchor is actually on screen, plus the unanchored ones.
        const steps = STEPS.filter((s) => (!s.sel && !s.byTitle && !s.byIcon) || anchorOf(s));
        if (!steps.length) {
            try { graph.setMessage(' There is nothing to tour yet. '); } catch (e) { }
            return false;
        }

        try {
            const old = document.getElementById(ID);
            if (old && old.parentNode) old.parentNode.removeChild(old);
        } catch (e) { }

        const root = document.createElement('div');
        root.id = ID;
        root.style.cssText = 'position:fixed;inset:0;z-index:2147483200;font:13px Arial,Helvetica,sans-serif;';
        root.innerHTML = ''
            // The scrim catches clicks so the app underneath cannot be operated mid-step.
            + '<div id="tour-scrim" style="position:absolute;inset:0;cursor:pointer;"></div>'
            // The hole. One box-shadow of 9999px paints everything OUTSIDE this rectangle,
            // which is why the scrim above is transparent and does no dimming of its own.
            + '<div id="tour-hole" style="position:absolute;border-radius:12px;pointer-events:none;'
            + 'box-shadow:0 0 0 9999px rgba(4,12,24,0.66);border:2px solid #4fd0e6;'
            + 'transition:top .18s,left .18s,width .18s,height .18s;"></div>'
            + '<div id="tour-card" style="position:absolute;width:min(360px,88vw);background:#0b2545;'
            + 'color:#eaf6f9;border:1px solid rgba(255,255,255,0.16);border-radius:12px;'
            + 'box-shadow:0 14px 44px rgba(0,0,0,0.5);padding:16px 18px 14px;">'
            + '<div id="tour-count" style="font:700 10.5px Arial;letter-spacing:.09em;'
            + 'text-transform:uppercase;color:#7fb0e8;"></div>'
            + '<div id="tour-title" style="font:700 16px Arial;margin-top:6px;"></div>'
            + '<div id="tour-text" style="font:13px/1.55 Arial;color:#cfe6ee;margin-top:8px;"></div>'
            + '<div style="display:flex;align-items:center;gap:8px;margin-top:14px;">'
            + '<button id="tour-link" style="display:none;background:transparent;color:#4fd0e6;'
            + 'border:1px solid rgba(79,208,230,0.45);border-radius:8px;padding:7px 12px;'
            + 'font:700 12.5px Arial;cursor:pointer;white-space:nowrap;"></button>'
            + '<button id="tour-skip" style="background:transparent;color:#9fb3c8;border:none;'
            + 'font:12.5px Arial;cursor:pointer;padding:6px 2px;">Skip</button>'
            + '<span style="flex:1 1 auto;"></span>'
            + '<button id="tour-back" style="background:transparent;color:#eaf6f9;'
            + 'border:1px solid rgba(255,255,255,0.24);border-radius:8px;padding:7px 14px;'
            + 'font:700 12.5px Arial;cursor:pointer;">Back</button>'
            + '<button id="tour-next" style="background:#22c55e;color:#04210f;border:none;'
            + 'border-radius:8px;padding:7px 18px;font:700 12.5px Arial;cursor:pointer;">Next</button>'
            + '</div></div>';
        document.body.appendChild(root);

        const hole = root.querySelector('#tour-hole');
        const cardEl = root.querySelector('#tour-card');
        let i = 0;
        let done = false;

        const close = () => {
            if (done) return;
            done = true;
            try { if (root.parentNode) root.parentNode.removeChild(root); } catch (e) { }
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { window.removeEventListener('resize', place); } catch (e) { }
            try { if (typeof o.onClose === 'function') o.onClose(); } catch (e) { }
        };

        const place = () => {
            const s = steps[i];
            const el = anchorOf(s);
            const pad = 8;
            let r = null;
            if (el) {
                try { r = el.getBoundingClientRect(); } catch (e) { r = null; }
            }
            if (r) {
                hole.style.display = 'block';
                hole.style.top = Math.max(0, r.top - pad) + 'px';
                hole.style.left = Math.max(0, r.left - pad) + 'px';
                hole.style.width = (r.width + pad * 2) + 'px';
                hole.style.height = (r.height + pad * 2) + 'px';
            } else {
                // No anchor: dim the whole screen and centre the card. Achieved by a hole of
                // no size parked off-screen, so the same 9999px shadow covers everything.
                hole.style.display = 'block';
                hole.style.top = '-20px';
                hole.style.left = '-20px';
                hole.style.width = '0px';
                hole.style.height = '0px';
            }

            // The card goes below the anchor, or above it when there is no room below --
            // and centred when there is no anchor at all.
            const cw = cardEl.offsetWidth || 360;
            const ch = cardEl.offsetHeight || 180;
            const vw = window.innerWidth, vh = window.innerHeight;
            let top, left;
            if (r) {
                top = r.bottom + pad + 10;
                if (top + ch > vh - 8) { top = r.top - ch - pad - 10; }
                if (top < 8) { top = Math.min(vh - ch - 8, r.bottom + pad + 10); }
                left = r.left + r.width / 2 - cw / 2;
            } else {
                top = Math.max(8, vh / 2 - ch / 2);
                left = vw / 2 - cw / 2;
            }
            cardEl.style.top = Math.max(8, Math.min(vh - ch - 8, top)) + 'px';
            cardEl.style.left = Math.max(8, Math.min(vw - cw - 8, left)) + 'px';
        };

        const render = () => {
            const s = steps[i];
            root.querySelector('#tour-count').textContent = 'Step ' + (i + 1) + ' of ' + steps.length;
            root.querySelector('#tour-title').textContent = s.title || '';
            root.querySelector('#tour-text').textContent = ('' + (s.text || ''))
                .replace(/\{stops\}/g, String(Math.max(1, steps.length - 1)));
            const link = root.querySelector('#tour-link');
            if (s.link && s.link.href) {
                link.textContent = (s.link.label || 'Open') + ' \u2197';
                link.style.display = 'inline-block';
            } else {
                link.style.display = 'none';
            }
            const back = root.querySelector('#tour-back');
            back.style.visibility = i === 0 ? 'hidden' : 'visible';
            root.querySelector('#tour-next').textContent = (i === steps.length - 1) ? 'Done' : 'Next';
            // Laid out after the text is in, or the card is measured at the previous
            // step's height and lands a little off.
            place();
        };

        const go = (d) => {
            const n = i + d;
            if (n < 0) return;
            if (n >= steps.length) { close(); return; }
            i = n;
            render();
        };

        const onKey = (e) => {
            if (!e) return;
            if (e.key === 'Escape') { e.stopPropagation(); close(); }
            else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.stopPropagation(); go(1); }
            else if (e.key === 'ArrowLeft') { e.stopPropagation(); go(-1); }
        };

        root.querySelector('#tour-next').onclick = () => go(1);
        root.querySelector('#tour-back').onclick = () => go(-1);
        root.querySelector('#tour-skip').onclick = close;
        // The tour stays up behind the new tab, so a person coming back is where they were.
        root.querySelector('#tour-link').onclick = () => {
            const s = steps[i];
            try { if (s.link && s.link.href) window.open(s.link.href, '_blank'); } catch (e) { }
        };
        root.querySelector('#tour-scrim').onclick = () => go(1);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', place);

        render();
        return true;
    })();
}
