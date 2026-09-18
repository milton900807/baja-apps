function (platetrack, opts) {

    // INSERT A DOCUMENT ON THE CANVAS.
    //
    //   await exec('baja/draw/draw-document.js', platetrack)
    //
    // A model's method, its caveats, the note that says why a number is what it is: prose,
    // which a table cannot hold. This asks for the text, then places a ModelDocument card
    // where the canvas is dragged. The text may be written as HTML, or as the shorthand
    // below -- whichever the author already has to hand:
    //
    //   # Heading          ## Subheading        ### Smaller heading
    //   - a bullet         > a quotation        ---  (a rule)
    //   | Input | Value |  (a table row)        **bold**  *italic*  `code`  [text](url)
    //
    // A blank line separates paragraphs, as in an email. Anything that already looks like
    // HTML is passed through untouched, so pasted HTML keeps its own markup.
    //
    // With a document selected the same entry EDITS it: the text comes back in the panel
    // and the card is re-laid out in place, keeping its position and size.
    return (async () => {
        const o = opts || {};
        const esc = (s) => ('' + (s == null ? '' : s))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // ---- shorthand -> HTML ----------------------------------------------------------
        // Only run when the text is not already markup. Inline marks are applied AFTER
        // escaping, so a stray < in prose stays a < and never becomes a tag.
        const looksLikeHtml = (t) => /<(h[1-6]|p|ul|ol|li|table|tr|td|th|blockquote|hr|div|b|i|em|strong|code|pre|a)\b[^>]*>/i.test(t);
        const inline = (s) => esc(s)
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
            .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
            .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
        const toHtml = (text) => {
            const raw = ('' + (text || '')).replace(/\r\n?/g, '\n');
            if (looksLikeHtml(raw)) return raw;
            const out = [];
            let list = null, table = null, para = [];
            const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
            const flushList = () => { if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; } };
            const flushTable = () => { if (table) { out.push('<table>' + table.join('') + '</table>'); table = null; } };
            const flushAll = () => { flushPara(); flushList(); flushTable(); };
            for (const line of raw.split('\n')) {
                const t = line.trim();
                if (!t) { flushAll(); continue; }
                let m;
                if ((m = /^(#{1,3})\s+(.*)$/.exec(t))) { flushAll(); const n = m[1].length; out.push('<h' + n + '>' + inline(m[2]) + '</h' + n + '>'); continue; }
                if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushAll(); out.push('<hr>'); continue; }
                if ((m = /^[-*•]\s+(.*)$/.exec(t))) { flushPara(); flushTable(); (list = list || []).push('<li>' + inline(m[1]) + '</li>'); continue; }
                if ((m = /^\d+[.)]\s+(.*)$/.exec(t))) { flushPara(); flushTable(); (list = list || []).push('<li>' + inline(m[1]) + '</li>'); continue; }
                if ((m = /^>\s?(.*)$/.exec(t))) { flushAll(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
                if (/^\|.*\|$/.test(t)) {
                    flushPara(); flushList();
                    const cells = t.slice(1, -1).split('|').map(c => c.trim());
                    // A markdown separator row (|---|---|) marks the row above as the header.
                    if (cells.every(c => /^:?-{2,}:?$/.test(c))) {
                        if (table && table.length) table[table.length - 1] = table[table.length - 1].replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
                        continue;
                    }
                    (table = table || []).push('<tr>' + cells.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>');
                    continue;
                }
                flushList(); flushTable();
                para.push(t);
            }
            flushAll();
            return out.join('');
        };

        // The card's name: its first heading, else its opening words. A document names
        // itself, so the author is not asked a second question for something already written.
        const nameFrom = (text, html) => {
            let m = /^#{1,3}\s+(.+)$/m.exec('' + (text || ''));
            if (!m) m = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec('' + (html || ''));
            let s = m ? m[1] : ('' + (text || '')).replace(/<[^>]*>/g, ' ');
            s = s.replace(/<[^>]*>/g, '').replace(/[#*`_>|]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!s) return 'Document';
            if (s.length > 44) s = s.slice(0, 44).replace(/\s+\S*$/, '') + '…';
            return s;
        };

        // ---- the text -------------------------------------------------------------------
        const selected = (platetrack.root || []).find(p => p && p.plateType === 'document' && p.selected);
        const editing = o.edit || selected || null;
        const answer = await exec('baja/lib/prompt-text.js', {
            title: editing ? ('Edit “' + editing.name + '”') : 'A document on the canvas',
            message: 'Write it as you would an email -- "# " for a heading, "- " for a bullet, "> " for a quotation, '
                + '"---" for a rule, "| a | b |" for a table row, **bold**, *italic*, `code`. HTML is kept as it is.',
            placeholder: '# Method\n\nSamples were prepared in triplicate and read on the QuantStudio.\n\n'
                + '- Reference gene: GAPDH\n- Calibrator: untreated\n\n> Every number below assumes the calibrator is untreated.',
            value: editing ? (editing.source || editing.html || '') : '',
            action: editing ? 'Save' : 'Place on the canvas',
            historyKey: 'canvas-document',
        });
        const text = (answer && answer.text != null) ? answer.text : answer;
        if (text == null || !('' + text).trim()) { try { platetrack.wb(null); } catch (e) { } return null; }
        const html = toHtml('' + text);

        // An existing document keeps its place and size: only its text changes.
        if (editing) {
            editing.html = html;
            editing.source = '' + text;
            editing.__blocks = null;
            editing.__layoutKey = '';
            editing.scroll = 0;
            editing.name = nameFrom(text, html);
            try { editing.setLastTouched(); } catch (e) { }
            try { platetrack.wb(null); } catch (e) { }
            try { platetrack.setMessage('Saved “' + editing.name + '”', 1); } catch (e) { }
            try { pushHistory && pushHistory(); } catch (e) { }
            return editing;
        }

        // ---- placing it -----------------------------------------------------------------
        // Drag a rectangle for a document of that shape, or click once for a readable
        // column. The preview is drawn while the mouse is down so the size is chosen with
        // the canvas in view, not guessed in a dialog.
        const name = nameFrom(text, html);
        const DEF_W = 460, DEF_H = 360, MIN = 40;
        return await new Promise((resolve) => {
            let down = false, sx = 0, sy = 0, cx = 0, cy = 0;
            const box = () => ({
                x: Math.min(sx, cx), y: Math.min(sy, cy),
                w: Math.abs(cx - sx), h: Math.abs(cy - sy),
            });
            const hd = {
                id: 'document-place',
                draw: (grid, ctx) => {
                    const b = box();
                    const w = down && b.w > MIN ? b.w : DEF_W;
                    const h = down && b.h > MIN ? b.h : DEF_H;
                    const x = down ? b.x : cx, y = down ? b.y : cy;
                    if (!down && !cx && !cy) return;
                    ctx.save();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = '#1aa3bd'; ctx.lineWidth = 1.5;
                    ctx.fillStyle = 'rgba(26,163,189,0.07)';
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeRect(x, y, w, h);
                    ctx.setLineDash([]);
                    ctx.fillStyle = '#0f7f93';
                    ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
                    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
                    ctx.fillText(name, x + 2, y - 4);
                    ctx.restore();
                },
                mouseDownListener: (x, y) => { down = true; sx = x; sy = y; cx = x; cy = y; },
                mouseMoveListener: (x, y) => { cx = x; cy = y; },
                mouseUpListener: async (x, y) => {
                    cx = x; cy = y;
                    const b = box();
                    const wpx = b.w > MIN ? b.w : DEF_W;
                    const hpx = b.h > MIN ? b.h : DEF_H;
                    const g = platetrack.grid;
                    // The card's grid origin is its BOTTOM left in world units, while the
                    // rectangle was dragged from its top left on the screen.
                    const at = {
                        x: g.Xwc(b.w > MIN ? b.x : x),
                        y: g.Ywc((b.h > MIN ? b.y : y) + hpx),
                        w: g.worldWidth(wpx),
                        h: g.worldHeight(hpx),
                    };
                    let doc = null;
                    try {
                        doc = await platetrack.addDocument(name, html, { at: at, width: wpx, height: hpx, source: '' + text });
                    } catch (e) { console.warn('[document] insert', e); }
                    try { platetrack.wb(null); } catch (e) { }
                    try { platetrack.setMessage(doc ? ('Added “' + name + '” -- select it and choose Document again to edit the text') : 'Could not add the document', 1.1); } catch (e) { }
                    try { pushHistory && pushHistory(); } catch (e) { }
                    resolve(doc);
                },
                close: () => { resolve(null); },
            };
            // setMessage's second argument is a message TYPE, not a duration: 1 is a
            // notice for five seconds and 1.1 for ten. Type 5 arms the model-building
            // sprite, which spent two minutes spinning over the first card placed here.
            try { platetrack.wb(hd); } catch (e) { resolve(null); }
            try { platetrack.setMessage('Drag a rectangle for “' + name + '”, or click once for a readable column', 1.1); } catch (e) { }
        });
    })();
}
