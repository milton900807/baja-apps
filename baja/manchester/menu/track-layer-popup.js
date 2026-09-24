function (track, layer, graph, genegraph_panel_layout, screenX, screenY) {
    // A FLOATING MENU FOR ONE LAYER, spawned at the mouse when the label row under a track's name is
    // pressed:  draw order (front / forward / backward / back), hide or show, rename, more options,
    // and delete.
    //   await exec('baja/manchester/menu/track-layer-popup.js', track, layer, graph, layout, sx, sy)
    //
    // sx, sy are CANVAS pixels, the same units the label rows are hit-tested in (graph.__downScreen).
    //
    // WHY NOT THE SIDE MENU. Pressing a label used to open the side menu, and that goes through a lot
    // of machinery -- it collapses to a chip, it turns into a library page in library mode, it is
    // dismissed by the very next canvas press -- so the menu could arrive somewhere the user was not
    // looking, or not at all. This is a plain overlay next to the pointer: it is where you pressed,
    // it stays until you choose, click elsewhere, press Escape or scroll, and it does not depend on
    // any of that. "More options" hands over to the side menu for the rest (background, interaction,
    // every layer at once).
    //
    // ORDER. track.track_layers is drawn in array order, so the LAST layer is in FRONT; the rows under
    // the track name list the front layer first (see baja/bio/track.js).
    return (async () => {
        // One of these at a time.
        try { if (window.__bajaLayerPopup && window.__bajaLayerPopup.destroy) window.__bajaLayerPopup.destroy(); } catch (e) { }

        const list = () => (track.track_layers = track.track_layers || []);
        if (!layer || list().indexOf(layer) < 0) return null;
        const nameOf = (l) => ('' + ((l && (l.name || l.data_type || l.attribution_type)) || 'layer'));
        const wake = () => { try { if (graph.wake) graph.wake(); } catch (e) { } };
        const pushHistory = () => { try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { } };

        // how: 'front' | 'back' | 'forward' (one step toward the front) | 'backward'. In place: other
        // code may hold the array.
        const move = (how) => {
            const a = list();
            const i = a.indexOf(layer);
            if (i < 0) return false;
            let j = i;
            if (how === 'front') j = a.length - 1;
            else if (how === 'back') j = 0;
            else if (how === 'forward') j = Math.min(a.length - 1, i + 1);
            else if (how === 'backward') j = Math.max(0, i - 1);
            if (j === i) return false;
            pushHistory();
            a.splice(i, 1);
            a.splice(j, 0, layer);
            return true;
        };

        const pop = { el: null, destroy: null };
        const el = document.createElement('div');
        el.id = 'baja-layer-popup';
        el.setAttribute('role', 'menu');
        el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;z-index:2147482500;min-width:232px;max-width:320px;'
            + 'background:rgba(10,37,64,0.985);border:1px solid #1aa3bd;border-radius:10px;padding:6px;color:#eaf6f9;'
            + 'box-shadow:0 14px 38px rgba(10,37,64,0.45);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;'
            + 'font-size:13px;user-select:none;';
        const esc = (t) => ('' + t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const all = list();
        const z = all.indexOf(layer);
        const isFront = z === all.length - 1, isBack = z === 0;
        const vis = layer.visible !== false;
        const dot = layer.fillstyle || layer.color || '#1aa3bd';
        const where = all.length < 2 ? 'only layer' : (isFront ? 'front layer' : isBack ? 'back layer' : 'layer ' + (all.length - z) + ' of ' + all.length + ' from the front');

        const ROW = 'display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;height:31px;padding:0 10px;border:0;'
            + 'border-radius:7px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;white-space:nowrap;';
        const rowHtml = (id, icon, label, opts = {}) =>
            '<button type="button" role="menuitem" data-id="' + id + '"' + (opts.off ? ' disabled' : '') + ' style="' + ROW
            + (opts.off ? 'opacity:0.38;cursor:default;' : '') + (opts.danger ? 'color:#ff9d92;' : '') + '">'
            + '<span style="width:16px;text-align:center;opacity:0.85;">' + icon + '</span><span style="flex:1;">' + esc(label) + '</span></button>';
        const rule = '<div style="height:1px;margin:5px 6px;background:rgba(159,196,212,0.22);"></div>';

        el.innerHTML =
            '<div style="display:flex;align-items:center;gap:9px;padding:6px 10px 8px 10px;">'
            + '<span style="width:11px;height:11px;border-radius:50%;background:' + esc(dot) + ';border:2px solid rgba(255,255,255,0.85);flex:none;opacity:' + (vis ? 1 : 0.4) + ';"></span>'
            + '<div style="min-width:0;"><div style="font-weight:700;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;">' + esc(nameOf(layer)) + '</div>'
            + '<div style="font-size:11px;color:#9fc4d4;overflow:hidden;text-overflow:ellipsis;">' + esc(track.name || 'track') + ' · ' + esc(where) + (vis ? '' : ' · hidden') + '</div></div></div>'
            + rule
            + rowHtml('front', '⤒', 'Bring to front', { off: isFront })
            + rowHtml('forward', '↑', 'Bring forward', { off: isFront })
            + rowHtml('backward', '↓', 'Send backward', { off: isBack })
            + rowHtml('back', '⤓', 'Send to back', { off: isBack })
            + rule
            + rowHtml('vis', vis ? '◌' : '●', vis ? 'Hide layer' : 'Show layer')
            + rowHtml('rename', '✎', 'Rename…')
            + rowHtml('more', '⋯', 'More options…')
            + rule
            + rowHtml('delete', '✕', 'Delete layer…', { danger: true });
        document.body.appendChild(el);

        // ---- placement: at the pointer, kept inside the window ------------------------------------
        const place = () => {
            // The graph handed in may be the wrapper (which has no canvas of its own) or the drawing
            // graph under it: look in both.
            let cv = null;
            try { const fg = graph.graph || graph; cv = fg.canvas.canvas.nativeElement; } catch (e) { cv = null; }
            if (!cv) { try { cv = graph.canvas.getCTX().canvas; } catch (e) { cv = null; } }
            if (!cv) { try { cv = (graph.graph || graph).canvas.getCTX().canvas; } catch (e) { cv = null; } }
            const r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            const kx = (cv && cv.width) ? r.width / cv.width : 1, ky = (cv && cv.height) ? r.height / cv.height : 1;
            const w = el.offsetWidth, h = el.offsetHeight;
            let x = r.left + (+screenX || 0) * kx + 6, y = r.top + (+screenY || 0) * ky + 6;
            if (x + w > window.innerWidth - 8) x = Math.max(8, r.left + (+screenX || 0) * kx - w - 6);   // flip to the left of the pointer
            if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
            el.style.left = Math.max(8, x) + 'px';
            el.style.top = Math.max(8, y) + 'px';
        };
        place();

        // ---- closing -------------------------------------------------------------------------------
        const onDocDown = (e) => { if (!el.contains(e.target)) close(); };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const bs = Array.from(el.querySelectorAll('button:not([disabled])'));
                if (!bs.length) return;
                let i = bs.indexOf(document.activeElement);
                i = e.key === 'ArrowDown' ? (i + 1) % bs.length : (i <= 0 ? bs.length - 1 : i - 1);
                bs[i].focus();
            }
        };
        const onWheel = (e) => { if (!el.contains(e.target)) close(); };
        function close() {
            try { document.removeEventListener('mousedown', onDocDown, true); } catch (e) { }
            try { document.removeEventListener('touchstart', onDocDown, true); } catch (e) { }
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { document.removeEventListener('wheel', onWheel, true); } catch (e) { }
            try { window.removeEventListener('blur', close); window.removeEventListener('resize', close); } catch (e) { }
            try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
            if (window.__bajaLayerPopup === pop) window.__bajaLayerPopup = null;
        }
        pop.el = el; pop.destroy = close;
        window.__bajaLayerPopup = pop;
        // Attached a tick late: the press that opened this menu is still being delivered.
        setTimeout(() => {
            if (window.__bajaLayerPopup !== pop) return;
            document.addEventListener('mousedown', onDocDown, true);
            document.addEventListener('touchstart', onDocDown, true);
            document.addEventListener('keydown', onKey, true);
            document.addEventListener('wheel', onWheel, { capture: true, passive: true });
            window.addEventListener('blur', close);
            window.addEventListener('resize', close);
        }, 0);

        // ---- actions ---------------------------------------------------------------------------------
        const act = {
            front: () => { if (move('front')) wake(); },
            forward: () => { if (move('forward')) wake(); },
            backward: () => { if (move('backward')) wake(); },
            back: () => { if (move('back')) wake(); },
            vis: () => { pushHistory(); layer.visible = !(layer.visible !== false); wake(); },
            rename: async () => {
                let va = null;
                try { va = await prompt('Rename layer', ['Name'], { 'Name': nameOf(layer) }, 380, 200); } catch (e) { va = null; }
                const nm = va ? ('' + (va['Name'] || '')).trim() : '';
                if (nm && nm !== layer.name) { pushHistory(); layer.name = nm; wake(); }
            },
            more: async () => {
                try { await exec('baja/manchester/menu/track-layers-side-menu.js', track, genegraph_panel_layout, graph, layer); }
                catch (e) { try { graph.setMessage(' Could not open the layer options: ' + e); } catch (e2) { } }
            },
            // Asks first: a layer can hold a computed curve or a whole paste's worth of notes.
            // confirm.js snapshots for Undo before it runs the action.
            delete: async () => {
                try {
                    await exec('baja/lib/confirm.js', 'Delete the layer "' + nameOf(layer) + '" from ' + (track.name || 'this track') + '?', () => {
                        const a = list();
                        const i = a.indexOf(layer);
                        if (i >= 0) a.splice(i, 1);
                        wake();
                    }, 'Delete');
                } catch (e) { try { graph.setMessage(' Could not delete the layer: ' + e); } catch (e2) { } }
            }
        };
        el.addEventListener('click', (e) => {
            const b = e.target && e.target.closest ? e.target.closest('button[data-id]') : null;
            if (!b || b.disabled) return;
            e.stopPropagation();
            const id = b.getAttribute('data-id');
            close();
            try { const r = act[id] && act[id](); if (r && r.catch) r.catch(() => { }); } catch (err) { console.warn('[layer popup]', err); }
        });
        // Hover: the row under the pointer takes the cyan fill the app's other menus use.
        el.addEventListener('mouseover', (e) => {
            const b = e.target && e.target.closest ? e.target.closest('button[data-id]') : null;
            for (const x of el.querySelectorAll('button[data-id]')) {
                x.style.background = (x === b && !x.disabled) ? (x.getAttribute('data-id') === 'delete' ? 'rgba(217,58,43,0.38)' : 'rgba(26,163,189,0.38)') : 'transparent';
            }
        });
        el.addEventListener('mouseleave', () => { for (const x of el.querySelectorAll('button[data-id]')) x.style.background = 'transparent'; });
        // The canvas must not see presses on the menu, or a click on "Delete" would also pan it.
        for (const ev of ['mousedown', 'mouseup', 'contextmenu', 'dblclick']) el.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'contextmenu') e.preventDefault(); });
        return pop;
    })();
}
