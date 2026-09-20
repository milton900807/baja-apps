function (pt, doc, opts) {
    // EDIT A DOCUMENT WHERE IT STANDS.
    //
    //   await exec('baja/plate/views/document-editor.js', platetrack, doc, { clientX, clientY })
    //
    // A document on the canvas (baja/plate/model-document.js) is a drawing, and its text was
    // changed in a dialog: select it, Draw > Document, rewrite it in a panel, save. This puts
    // a real editor exactly over the card instead -- the same column, the same type, the same
    // scroll position -- so the text is edited where it is read. The card stops drawing its
    // own text while the editor is up, so there is one copy of the words on screen, not two.
    //
    // The editor is a contenteditable element, and what comes out of one is whatever the
    // browser felt like writing (divs, spans, inline styles). The document understands a small,
    // deliberate subset (headings, paragraphs, lists, quotes, rules, code, tables, and bold /
    // italic / code / links), so the text is CLEANED on the way in and on the way out: built
    // again, node by node, from that subset and nothing else. That is also what makes it safe
    // to put a document's HTML into the live page at all -- it may have been written by a model
    // or pasted from anywhere, and nothing but those tags, and no attribute but an http(s)
    // href, survives the rebuild.
    //
    // Saving: Escape, Ctrl/Cmd+Enter, or a click anywhere else. Nothing is lost by leaving.
    // One undo step on the canvas brings the old text back. The author's shorthand (`source`,
    // what Draw > Document shows) is regenerated from the result, so the dialog still opens on
    // readable text and not on markup.
    return (async () => {
        const o = opts || {};
        if (!pt || !doc || doc.plateType !== 'document') return null;
        try { if (window.__bajaDocEditor && window.__bajaDocEditor.close) await window.__bajaDocEditor.close(true); } catch (e) { }

        let HM_ = null;
        try { HM_ = await exec('baja/history/HM'); } catch (e) { HM_ = null; }

        const FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
        const MONO = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';

        // ---- the subset, rebuilt ---------------------------------------------------------
        const INLINE = { b: 'b', strong: 'b', i: 'i', em: 'i', code: 'code', kbd: 'code', tt: 'code', a: 'a' };
        const safeHref = (h) => { const s = ('' + (h || '')).trim(); return /^https?:\/\//i.test(s) ? s : ''; };
        const cleanInline = (node, into) => {
            node.childNodes.forEach((n) => {
                if (n.nodeType === 3) { if (n.nodeValue) into.appendChild(document.createTextNode(n.nodeValue.replace(/ /g, ' '))); return; }
                if (n.nodeType !== 1) return;
                const tag = n.tagName.toLowerCase();
                if (tag === 'br') { into.appendChild(document.createElement('br')); return; }
                const as = INLINE[tag];
                if (as) {
                    const el = document.createElement(as);
                    if (as === 'a') { const h = safeHref(n.getAttribute('href')); if (h) el.setAttribute('href', h); }
                    cleanInline(n, el);
                    if (el.childNodes.length) into.appendChild(el);
                    return;
                }
                // a span the browser made for bold / italic
                const st = (n.getAttribute && n.getAttribute('style')) || '';
                let target = into;
                if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(st)) { const b = document.createElement('b'); target.appendChild(b); target = b; }
                if (/font-style\s*:\s*italic/i.test(st)) { const i = document.createElement('i'); target.appendChild(i); target = i; }
                cleanInline(n, target);
            });
        };
        const hasText = (el) => !!(el.textContent || '').replace(/\s+/g, '') || !!el.querySelector('br');
        const cleanBlocks = (root, into) => {
            let para = null;
            const flush = () => { if (para && hasText(para)) into.appendChild(para); para = null; };
            root.childNodes.forEach((n) => {
                if (n.nodeType === 3) {
                    if (!n.nodeValue.trim()) return;
                    if (!para) para = document.createElement('p');
                    para.appendChild(document.createTextNode(n.nodeValue.replace(/ /g, ' ')));
                    return;
                }
                if (n.nodeType !== 1) return;
                const tag = n.tagName.toLowerCase();
                if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'link' || tag === 'meta') return;
                if (INLINE[tag] || tag === 'span' || tag === 'br' || tag === 'font' || tag === 'u') {
                    if (!para) para = document.createElement('p');
                    if (tag === 'br') para.appendChild(document.createElement('br'));
                    else { const holder = document.createElement('div'); holder.appendChild(n.cloneNode(true)); cleanInline(holder, para); }
                    return;
                }
                flush();
                if (/^h[1-6]$/.test(tag)) { const h = document.createElement('h' + Math.min(3, +tag[1])); cleanInline(n, h); if (hasText(h)) into.appendChild(h); return; }
                if (tag === 'hr') { into.appendChild(document.createElement('hr')); return; }
                if (tag === 'blockquote') { const q = document.createElement('blockquote'); cleanInline(n, q); if (hasText(q)) into.appendChild(q); return; }
                if (tag === 'pre') { const pre = document.createElement('pre'); pre.textContent = n.textContent; if (pre.textContent.trim()) into.appendChild(pre); return; }
                if (tag === 'ul' || tag === 'ol') {
                    const list = document.createElement(tag);
                    n.childNodes.forEach((c) => {
                        if (c.nodeType !== 1 || c.tagName.toLowerCase() !== 'li') return;
                        const li = document.createElement('li');
                        const own = document.createElement('div');
                        c.childNodes.forEach((k) => { if (!(k.nodeType === 1 && /^(ul|ol)$/i.test(k.tagName))) own.appendChild(k.cloneNode(true)); });
                        cleanInline(own, li);
                        c.childNodes.forEach((k) => { if (k.nodeType === 1 && /^(ul|ol)$/i.test(k.tagName)) { const holder = document.createElement('div'); holder.appendChild(k.cloneNode(true)); cleanBlocks(holder, li); } });
                        if (hasText(li)) list.appendChild(li);
                    });
                    if (list.childNodes.length) into.appendChild(list);
                    return;
                }
                if (tag === 'table') {
                    const t = document.createElement('table');
                    n.querySelectorAll('tr').forEach((tr) => {
                        const row = document.createElement('tr');
                        [...tr.children].forEach((td) => { const cell = document.createElement(td.tagName.toLowerCase() === 'th' ? 'th' : 'td'); cleanInline(td, cell); row.appendChild(cell); });
                        if (row.childNodes.length) t.appendChild(row);
                    });
                    if (t.childNodes.length) into.appendChild(t);
                    return;
                }
                if (tag === 'p') { const p = document.createElement('p'); cleanInline(n, p); if (hasText(p)) into.appendChild(p); return; }
                // a div (what Enter makes), a section, anything else: its contents, as blocks
                const inner = document.createElement('div');
                cleanBlocks(n, inner);
                if (inner.childNodes.length) inner.childNodes.forEach((k) => into.appendChild(k.cloneNode(true)));
                else { const p = document.createElement('p'); cleanInline(n, p); if (hasText(p)) into.appendChild(p); }
            });
            flush();
        };
        const cleanHtml = (html) => {
            let root = null;
            try { root = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html').body.firstChild; } catch (e) { root = null; }
            const out = document.createElement('div');
            if (root) cleanBlocks(root, out);
            return out;
        };

        // ---- the result, as the author's shorthand ----------------------------------------
        const inlineText = (node) => {
            let s = '';
            node.childNodes.forEach((n) => {
                if (n.nodeType === 3) { s += n.nodeValue; return; }
                if (n.nodeType !== 1) return;
                const tag = n.tagName.toLowerCase(), inner = inlineText(n);
                if (tag === 'br') s += ' ';
                else if (tag === 'b') s += inner.trim() ? '**' + inner + '**' : inner;
                else if (tag === 'i') s += inner.trim() ? '*' + inner + '*' : inner;
                else if (tag === 'code') s += '`' + inner + '`';
                else if (tag === 'a') { const h = n.getAttribute('href'); s += h ? '[' + inner + '](' + h + ')' : inner; }
                else s += inner;
            });
            return s.replace(/\s+/g, ' ');
        };
        const toShorthand = (root) => {
            const out = [];
            root.childNodes.forEach((n) => {
                if (n.nodeType !== 1) return;
                const tag = n.tagName.toLowerCase();
                if (/^h[1-3]$/.test(tag)) out.push('#'.repeat(+tag[1]) + ' ' + inlineText(n).trim());
                else if (tag === 'p') out.push(inlineText(n).trim());
                else if (tag === 'hr') out.push('---');
                else if (tag === 'blockquote') out.push('> ' + inlineText(n).trim());
                else if (tag === 'pre') out.push('`' + n.textContent.replace(/\s+/g, ' ').trim() + '`');
                else if (tag === 'ul' || tag === 'ol') { const items = []; n.querySelectorAll(':scope > li').forEach((li, i) => items.push((tag === 'ol' ? (i + 1) + '. ' : '- ') + inlineText(li).trim())); out.push(items.join('\n')); }
                else if (tag === 'table') { const rows = []; n.querySelectorAll('tr').forEach((tr, i) => { const cells = [...tr.children].map((c) => inlineText(c).trim()); rows.push('| ' + cells.join(' | ') + ' |'); if (i === 0 && tr.querySelector('th')) rows.push('|' + cells.map(() => '---').join('|') + '|'); }); out.push(rows.join('\n')); }
            });
            return out.filter(Boolean).join('\n\n');
        };
        const nameFrom = (root) => {
            const h = root.querySelector('h1, h2, h3');
            let s = (h ? h.textContent : root.textContent || '').replace(/\s+/g, ' ').trim();
            if (!s) return 'Document';
            if (s.length > 44) s = s.slice(0, 44).replace(/\s+\S*$/, '') + '…';
            return s;
        };

        // ---- the editor -------------------------------------------------------------------
        const before = cleanHtml(doc.html);
        const beforeHtml = before.innerHTML;
        const autoNamed = doc.name === nameFrom(before);      // a name taken from the text follows the text

        const ed = document.createElement('div');
        ed.id = 'baja-doc-editor';
        ed.contentEditable = 'true';
        ed.spellcheck = true;
        ed.setAttribute('role', 'textbox');
        ed.setAttribute('aria-multiline', 'true');
        ed.setAttribute('aria-label', 'Edit ' + (doc.name || 'document'));
        ed.style.cssText = 'position:fixed;left:-9999px;top:-9999px;z-index:2147481500;box-sizing:border-box;overflow-y:auto;overflow-x:hidden;'
            + 'outline:none;background:#ffffff;color:#22384f;cursor:text;white-space:normal;word-wrap:break-word;'
            + 'box-shadow:inset 0 0 0 2px #1aa3bd;border-radius:0 0 9px 9px;font-family:' + FAMILY + ';line-height:1.45;';
        const css = document.createElement('style');
        css.textContent = '#baja-doc-editor h1{font-size:1.55em;font-weight:700;color:#0a2540;margin:1em 0 .45em}'
            + '#baja-doc-editor h2{font-size:1.3em;font-weight:700;color:#0a2540;margin:.9em 0 .35em}'
            + '#baja-doc-editor h3{font-size:1.1em;font-weight:700;color:#0a2540;margin:.7em 0 .3em}'
            + '#baja-doc-editor p{margin:0 0 .5em}#baja-doc-editor ul,#baja-doc-editor ol{margin:0 0 .25em;padding-left:1.2em}'
            + '#baja-doc-editor li{margin:0 0 .25em}#baja-doc-editor li::marker{color:#1aa3bd}'
            + '#baja-doc-editor blockquote{margin:.4em 0 .5em;padding:2px .9em;background:rgba(26,163,189,0.10);border-left:2.5px solid #1aa3bd;color:#0a2540}'
            + '#baja-doc-editor pre,#baja-doc-editor code{font-family:' + MONO + ';font-size:.92em;background:rgba(10,37,64,0.05)}'
            + '#baja-doc-editor pre{margin:.4em 0 .5em;padding:2px 4px;white-space:pre-wrap}'
            + '#baja-doc-editor a{color:#0f7f93}#baja-doc-editor hr{border:0;border-top:1px solid rgba(10,37,64,0.12);margin:.6em 0}'
            + '#baja-doc-editor table{border-collapse:collapse;font-size:.95em;margin:0 0 .4em}#baja-doc-editor td,#baja-doc-editor th{padding:1px 10px 1px 0;text-align:left;vertical-align:top}'
            + '#baja-doc-editor th{font-weight:700;color:#0a2540}#baja-doc-editor > :first-child{margin-top:0}'
            + '#baja-doc-editor::selection,#baja-doc-editor *::selection{background:rgba(26,163,189,0.28)}';
        before.childNodes.forEach((k) => ed.appendChild(k.cloneNode(true)));
        if (!ed.childNodes.length) { const p = document.createElement('p'); p.appendChild(document.createElement('br')); ed.appendChild(p); }
        document.head.appendChild(css);
        document.body.appendChild(ed);

        const api = { doc, el: ed, close: null };
        let closed = false, raf = 0, placedOnce = false;

        // Exactly over the card's body, every frame: the canvas can still be zoomed or panned
        // from outside the editor, and the editor goes with the card.
        const place = () => {
            const g = doc.__geom, canvas = pt.__canvas__;
            if (!g || !canvas || !canvas.isConnected) return false;
            const r = canvas.getBoundingClientRect();
            const kx = r.width / Math.max(1, canvas.width), ky = r.height / Math.max(1, canvas.height);   // CSS px per canvas px
            const left = r.left + (g.x + 1) * kx, top = r.top + g.top * ky;
            const width = Math.max(40, (g.w - 2) * kx), height = Math.max(24, (g.yTop + g.h - 2 - g.top) * ky);
            const padL = Math.max(6, ((g.tx != null ? g.tx : g.x + 12) - g.x - 1) * kx);
            const padR = Math.max(6, (g.w - (g.innerW != null ? g.innerW : g.w - 24)) * kx - padL);
            ed.style.left = left + 'px'; ed.style.top = top + 'px';
            ed.style.width = width + 'px'; ed.style.height = height + 'px';
            ed.style.padding = '2px ' + padR + 'px 10px ' + padL + 'px';
            ed.style.fontSize = Math.max(8, (doc.__base || 14) * ky) + 'px';
            if (!placedOnce) { placedOnce = true; ed.scrollTop = Math.max(0, (doc.scroll || 0) * ky); }
            return true;
        };
        const tick = () => {
            if (closed) return;
            const gone = (pt.root || []).indexOf(doc) < 0 || doc.hidden || doc.visible === false
                || (typeof doc.isTooSmallToRead === 'function' && doc.isTooSmallToRead(pt));
            if (gone || !place()) { api.close(true); return; }
            raf = requestAnimationFrame(tick);
        };

        api.close = async (save) => {
            if (closed) return doc;
            closed = true;
            try { cancelAnimationFrame(raf); } catch (e) { }
            let result = null;
            try { const holder = document.createElement('div'); ed.childNodes.forEach((k) => holder.appendChild(k.cloneNode(true))); result = document.createElement('div'); cleanBlocks(holder, result); } catch (e) { result = null; }
            const scrollPx = ed.scrollTop;
            try { if (ed.parentNode) ed.parentNode.removeChild(ed); } catch (e) { }
            try { if (css.parentNode) css.parentNode.removeChild(css); } catch (e) { }
            doc.__editing = false;
            if (window.__bajaDocEditor === api) window.__bajaDocEditor = null;
            try { if (pt.__canvas__ && pt.__canvas__.focus) pt.__canvas__.focus(); } catch (e) { }
            if (save !== false && result && result.innerHTML !== beforeHtml) {
                try { if (HM_) pushHistory(HM_(pt)); } catch (e) { console.warn('[document] history', e); }
                doc.html = result.innerHTML;
                doc.source = toShorthand(result);
                doc.__blocks = null; doc.__layoutKey = ''; doc.__sel = null;
                if (autoNamed) doc.name = nameFrom(result);
                try { const r = pt.__canvas__.getBoundingClientRect(); doc.scroll = scrollPx / Math.max(1e-6, r.height / Math.max(1, pt.__canvas__.height)); } catch (e) { doc.scroll = scrollPx; }
                try { doc.setLastTouched(); } catch (e) { }
                try { pt.setMessage('Saved “' + doc.name + '” (Ctrl+Z brings the old text back).', 1); } catch (e) { }
            }
            return doc;
        };

        // The canvas must not hear what is typed here: its key handler deletes objects, types
        // into cells and runs shortcuts. Same for the clipboard events it listens for.
        const own = (e) => { e.stopPropagation(); };
        ed.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); api.close(true); return; }
            if (e.key === 'Tab') { e.preventDefault(); try { document.execCommand('insertText', false, '    '); } catch (x) { } }
        });
        ['keyup', 'keypress', 'copy', 'cut', 'wheel', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchend'].forEach((t) => ed.addEventListener(t, own));
        // Pasted text comes in as TEXT: whatever markup it carried is somebody else's styling.
        ed.addEventListener('paste', (e) => {
            e.stopPropagation(); e.preventDefault();
            let text = '';
            try { text = (e.clipboardData || window.clipboardData).getData('text/plain') || ''; } catch (x) { text = ''; }
            try { document.execCommand('insertText', false, text); } catch (x) { }
        });
        ed.addEventListener('blur', () => { setTimeout(() => { if (!closed && document.activeElement !== ed) api.close(true); }, 120); });

        doc.__editing = true;
        doc.__sel = null;
        window.__bajaDocEditor = api;
        try { if (pt.__collab && pt.__collab.holds && !pt.__collab.holds(doc)) pt.__collab.acquire(doc); } catch (e) { }
        place();
        ed.focus({ preventScroll: true });
        // The caret goes where the double click was, when the browser can say where that is.
        try {
            let range = null;
            if (Number.isFinite(o.clientX) && Number.isFinite(o.clientY)) {
                if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(o.clientX, o.clientY);
                else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(o.clientX, o.clientY); if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset); range.collapse(true); } }
            }
            if (!range || !ed.contains(range.startContainer)) { range = document.createRange(); range.selectNodeContents(ed); range.collapse(false); }
            const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        } catch (e) { }
        raf = requestAnimationFrame(tick);
        try { pt.setMessage('Editing “' + doc.name + '”. Esc or a click elsewhere saves.', 1); } catch (e) { }
        return api;
    })();
}
