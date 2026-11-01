function () {

    // RESEARCH: the market research this team has already done, to read rather than re-run.
    //
    //   /app/baja/research          (Home > Tools > Research)
    //
    // Every run of Analytics > Build > Indication market is kept in a store on the server
    // (py/ion-lib/indication_store.py), so that asking the same question twice does not cost
    // another three minutes and another dollar. After a few months of use that store is also
    // a small library of market research on genetic CNS disease, and until now the only way
    // to see what was in it was to type a prompt and find out whether it was recognised.
    //
    // This browses and searches it: what has been researched, what it says, and the sources
    // behind every figure. It is READ ONLY. Nothing here runs research, edits it or deletes
    // it; the one thing it does to the store is read.
    //
    // The reading is done by py/analytics/indication-browse.py, which is where the SQL lives.
    // Two screens: a list, and one run opened.

    return (async () => {
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
        }[c]));
        const ID = 'baja-research';
        const phone = (typeof isMobile === 'function') ? !!isMobile() : (window.innerWidth < 760);

        // THE PAGE IS A SHEET OF ITS OWN, not something handed to showWidget.
        //
        // It was drawn with showWidget first, the way the home screen is, and a run of
        // research is far longer than a home screen: the card the shell puts it in is the
        // height of the window and does not scroll, so everything past the fold was simply
        // cut off with no way to reach it. The two other long pages here, fundraise/admin.js
        // and fundraise/super.js, do not use showWidget either; they own a fixed, scrolling
        // element on document.body, and this is that pattern.
        //
        // What comes with owning the element: clear() cannot remove it, so leaving has to
        // take it down by hand (see go(), below) or the next screen is drawn underneath a
        // sheet still covering the window. In exchange the markup is on the page the moment
        // it is written, rather than a tick or more later, so a screen can be drawn and then
        // touched in the same breath.
        const sheet = () => {
            let el = document.getElementById(ID);
            if (el) return el;
            el = document.createElement('div');
            el.id = ID;
            el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;'
                + '-webkit-overflow-scrolling:touch;overscroll-behavior:contain;'
                + 'background:#f2f6f8;color:#12242c;font-family:Arial,Helvetica,sans-serif;';
            document.body.appendChild(el);
            // The shell listens for keys on the document and would otherwise act on what is
            // typed into the search box, exactly as it would in the admin page.
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                el.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (x) { } });
            }
            return el;
        };
        const gone = () => {
            try {
                const el = document.getElementById(ID);
                if (el && el.parentNode) el.parentNode.removeChild(el);
            } catch (e) { }
        };
        const draw = (inner) => {
            const el = sheet();
            el.innerHTML = '<div style="max-width:1180px;margin:0 auto;padding:'
                + (phone ? '16px 14px 48px' : '26px 18px 56px') + ';">' + inner + '</div>';
            // A new screen starts at the top. Without this, opening a run from halfway down
            // the list begins halfway down the run.
            try { el.scrollTop = 0; } catch (e) { }
            return true;
        };
        // Kept so that drawing and then touching the markup reads the same either way; the
        // markup is already there, so this runs at once.
        const afterDraw = (fn) => {
            try {
                const el = document.getElementById(ID);
                if (el) fn(el);
            } catch (e) { }
        };

        // ---- the look, which is Home's ---------------------------------------------------
        const C = { ink: '#12242c', dim: '#6b8793', faint: '#8aa3ad', line: '#e1e8ed',
                    soft: '#f7fafc', edge: '#dbe4ea', accent: '#0f6e7a' };
        const btn = (attr, label, kind) => '<button ' + attr + ' style="cursor:pointer;border-radius:9px;'
            + 'padding:9px 15px;font:700 13px Arial;'
            + (kind === 'go' ? 'border:1px solid ' + C.accent + ';background:' + C.accent + ';color:#fff;'
                : 'border:1px solid ' + C.edge + ';background:#fff;color:' + C.ink + ';') + '">' + label + '</button>';
        const card = (inner, pad) => '<div style="border:1px solid ' + C.line + ';border-radius:12px;'
            + 'background:#fff;padding:' + (pad || '14px 16px') + ';">' + inner + '</div>';
        const chip = (text, attr) => '<button ' + (attr || '') + ' style="cursor:pointer;border:1px solid ' + C.edge + ';'
            + 'background:#fff;color:' + C.ink + ';border-radius:999px;padding:5px 11px;font:600 12px Arial;">'
            + esc(text) + '</button>';
        const tag = (text, tone) => '<span style="display:inline-block;border-radius:999px;padding:2px 9px;'
            + 'font:700 10.5px Arial;letter-spacing:.04em;text-transform:uppercase;'
            + (tone === 'warm' ? 'background:#fff4d6;border:1px solid #f5d27a;color:#8a6100;'
                : 'background:#eaf3f5;border:1px solid #cfe0e4;color:#2c5a63;') + '">' + esc(text) + '</span>';

        const ago = (iso) => {
            try {
                const t = new Date(iso);
                if (isNaN(+t)) return '';
                const mins = Math.round((Date.now() - +t) / 60000);
                if (mins < 60) return mins <= 1 ? 'just now' : (mins + ' minutes ago');
                const hrs = Math.round(mins / 60);
                if (hrs < 36) return hrs === 1 ? 'an hour ago' : (hrs + ' hours ago');
                const days = Math.round(hrs / 24);
                if (days < 45) return days === 1 ? 'yesterday' : (days + ' days ago');
                return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            } catch (e) { return ''; }
        };
        const num = (n) => { try { return (+n).toLocaleString(); } catch (e) { return '' + n; } };

        // ---- the server ------------------------------------------------------------------
        // One call, one place for what can go wrong with it. The tool answers
        // {status:'ok'|'error'}; anything else is the bridge failing, which is a different
        // sentence to the store being empty and should not be dressed up as one.
        const ask = async (req) => {
            let r = null;
            try {
                r = await exec('py/analytics/indication-browse.py', JSON.stringify(req));
            } catch (e) {
                throw new Error((e && e.message) ? e.message : ('' + e));
            }
            if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { } }
            if (!r || typeof r !== 'object') throw new Error('the server did not answer');
            if (r.status !== 'ok') throw new Error(r.error || 'the research store could not be read');
            return r;
        };

        // After a redraw the search box is a new element, so somebody who pressed Search and
        // then reached for the keyboard would find the caret gone. Put it back, at the end of
        // what they already typed.
        const keepTyping = () => afterDraw((root) => {
            const v = root.querySelector('#rp-q');
            if (!v || !q) return;
            v.focus({ preventScroll: true });
            v.setSelectionRange(v.value.length, v.value.length);
        });

        // ---- state -----------------------------------------------------------------------
        let q = '', sort = 'recent', rows = [], total = 0, offset = 0, shelf = null, trouble = '';
        const PAGE = 25;

        const header = (sub) => '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;">'
            + '<div style="flex:1 1 320px;min-width:0;">'
            + '<div style="font:800 ' + (phone ? '22px' : '26px') + ' Arial;color:' + C.ink + ';">Research</div>'
            + '<div style="font:14px/1.5 Arial;color:' + C.dim + ';margin-top:5px;max-width:62ch;">' + sub + '</div></div>'
            + '<div style="margin-left:auto;display:flex;gap:9px;">' + btn('data-go="home"', '← Home') + '</div></div>';

        // ---- the list --------------------------------------------------------------------
        const searchBar = () => '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:18px 0 0;">'
            + '<input id="rp-q" data-keep="1" value="' + esc(q) + '" placeholder="a disease, a gene, a modality" '
            + 'style="flex:1 1 280px;box-sizing:border-box;border:1px solid ' + C.edge + ';border-radius:9px;'
            + 'padding:10px 12px;font:16px Arial;color:' + C.ink + ';background:#fff;"/>'
            + btn('data-do="search" id="rp-search"', 'Search', 'go')
            + (q ? btn('data-do="clear"', 'Clear') : '')
            + '<span style="margin-left:auto;display:flex;gap:6px;align-items:center;font:12.5px Arial;color:' + C.dim + ';">'
            + 'Order' + '<select id="rp-sort" data-sort="1" style="border:1px solid ' + C.edge + ';border-radius:8px;padding:7px 9px;'
            + 'font:13px Arial;background:#fff;color:' + C.ink + ';">'
            + '<option value="recent"' + (sort === 'recent' ? ' selected' : '') + '>Most recent</option>'
            + '<option value="reused"' + (sort === 'reused' ? ' selected' : '') + '>Most reused</option>'
            + '</select></span></div>';

        // Something to press for somebody who does not know what is in there. Built from the
        // store itself rather than written here, so it is never out of date.
        const shelfBar = () => {
            if (!shelf || q) return '';
            const group = (title, list) => {
                const ok = (list || []).filter((x) => x && x.name).slice(0, phone ? 4 : 10);
                if (!ok.length) return '';
                return '<div style="margin-top:10px;display:flex;gap:7px;flex-wrap:wrap;align-items:center;">'
                    + '<span style="font:700 11px Arial;letter-spacing:.06em;text-transform:uppercase;color:' + C.faint + ';'
                    + 'margin-right:2px;">' + title + '</span>'
                    + ok.map((x) => chip(x.name + (x.runs > 1 ? ' · ' + x.runs : ''),
                        'data-q="' + esc(x.name) + '"')).join('') + '</div>';
            };
            const inner = group('Indications', shelf.indications) + group('Targets', shelf.targets)
                + group('Modalities', shelf.modalities);
            return inner ? '<div style="margin-top:14px;">' + inner + '</div>' : '';
        };

        const rowCard = (r) => {
            const s = r.structured || {};
            // The heading names what was asked about. The expansions the research went on to
            // find are counted below rather than promoted into the title, which would make a
            // run look like it was about a disease nobody asked after.
            const names = (s.indications && s.indications.length) ? s.indications : (r.names || []);
            const title = names.length ? names.slice(0, 3).join(', ') : (r.prompt || 'A run');
            const bits = [];
            if (s.target) bits.push(esc(s.target));
            if (s.modality) bits.push(esc(s.modality));
            if (r.region) bits.push(esc(r.region));
            const c = r.counts || {};
            const counted = [];
            if (c.expansions) counted.push(c.expansions + ' expansion' + (c.expansions === 1 ? '' : 's'));
            if (r.sources) counted.push(r.sources + ' source' + (r.sources === 1 ? '' : 's'));
            if (c.competitors) counted.push(c.competitors + ' competitor' + (c.competitors === 1 ? '' : 's'));
            return '<button data-open="' + r.id + '" style="display:block;width:100%;text-align:left;cursor:pointer;'
                + 'border:1px solid ' + C.line + ';border-radius:12px;background:#fff;padding:14px 16px;margin:0 0 10px;">'
                + '<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;">'
                + '<span style="font:700 15.5px Arial;color:' + C.ink + ';">' + esc(title) + '</span>'
                + (r.hits ? tag('reused ' + r.hits + '×') : '')
                + (r.age_days > 180 ? tag('over 6 months', 'warm') : '')
                + '<span style="margin-left:auto;font:12px Arial;color:' + C.faint + ';white-space:nowrap;">'
                + esc(ago(r.created_at)) + '</span></div>'
                + (bits.length ? '<div style="margin-top:3px;font:12.5px Arial;color:' + C.dim + ';">'
                    + bits.join(' · ') + '</div>' : '')
                + (r.summary_text ? '<div style="margin-top:7px;font:13.5px/1.5 Arial;color:#3d5a63;">'
                    + esc(('' + r.summary_text).slice(0, 220)) + (r.summary_text.length > 220 ? '…' : '') + '</div>' : '')
                + (counted.length ? '<div style="margin-top:7px;font:12px Arial;color:' + C.faint + ';">'
                    + counted.join(' · ') + '</div>' : '')
                + '</button>';
        };

        const listPage = () => {
            let body;
            if (trouble) {
                body = card('<div style="font:700 16px Arial;color:' + C.ink + ';">Could not read the research</div>'
                    + '<div style="margin-top:7px;font:13.5px/1.6 Arial;color:' + C.dim + ';">' + esc(trouble) + '</div>',
                    '22px 20px');
            } else if (!rows.length) {
                body = card('<div style="font:700 16px Arial;color:' + C.ink + ';">'
                    + (q ? 'Nothing matches that' : 'Nothing has been researched yet') + '</div>'
                    + '<div style="margin-top:7px;font:13.5px/1.6 Arial;color:' + C.dim + ';max-width:60ch;">'
                    + (q ? 'Try a gene, a disease or a modality on its own. The search looks at the prompt, '
                        + 'the indications and their aliases, the target and the modality.'
                        : 'Analytics > Build > Indication market keeps every run it does. '
                        + 'The first one will appear here.') + '</div>', '22px 20px');
            } else {
                const shown = rows.length;
                body = '<div style="margin:16px 0 10px;font:12.5px Arial;color:' + C.dim + ';">'
                    + num(total) + (total === 1 ? ' piece of research' : ' pieces of research')
                    + (q ? ' matching “' + esc(q) + '”' : '')
                    + (total > shown ? ', showing ' + num(offset + 1) + ' to ' + num(offset + shown) : '')
                    + '</div>' + rows.map(rowCard).join('')
                    + ((offset > 0 || offset + shown < total)
                        ? '<div style="display:flex;gap:9px;margin-top:6px;">'
                            + (offset > 0 ? btn('data-page="-1"', '← Newer') : '')
                            + (offset + shown < total ? btn('data-page="1"', 'Older →') : '') + '</div>'
                        : '');
            }
            draw(header('What this team has already looked into: the market research behind every '
                + 'Indication market run, with its sources. Nothing here is researched again.')
                + searchBar() + shelfBar() + '<div style="margin-top:4px;">' + body + '</div>');
            keepTyping();
        };

        const load = async () => {
            draw(header('Reading the store…')
                + '<div style="margin-top:24px;font:14px Arial;color:' + C.dim + ';">One moment.</div>');
            trouble = '';
            try {
                const r = await ask({ action: 'list', q: q, limit: PAGE, offset: offset, sort: sort });
                rows = Array.isArray(r.rows) ? r.rows : [];
                total = +r.total || 0;
            } catch (e) {
                rows = []; total = 0;
                trouble = (e && e.message) ? e.message : ('' + e);
            }
            if (shelf === null && !trouble) {
                try { shelf = (await ask({ action: 'shelves', limit: 10 })).shelves || {}; }
                catch (e) { shelf = {}; }
            }
            listPage();
        };

        // Leaving. baja/init.js clears the page and pushes its own URL, so nothing needs
        // undoing first; if the module will not run, the browser still goes there rather than
        // leaving somebody on an empty screen.
        const go = async () => {
            window.__bajaResearchHandlers = null;
            gone();
            try { clear(); } catch (e) { }
            try { window.history.pushState({}, '', '/app/baja/init'); } catch (e) { }
            try { await exec('baja/init'); }
            catch (e) { try { window.location.href = '/app/baja/init'; } catch (e2) { } }
        };

        // ---- the clicks -----------------------------------------------------------------
        // Handlers go on the document, not on the buttons, for the reason Home found the
        // hard way: the shell can redraw this markup at any moment, and a listener attached
        // to an element that has since been replaced is a button that does nothing. The
        // page is identified by its data- hooks instead, which survive any redraw. One set
        // of listeners for the life of the window, pointed at whichever panel is current;
        // a panel that has been left sets the handlers to null and its clicks stop being
        // acted on.
        const typed = () => {
            try {
                const root = document.getElementById(ID);
                const v = root ? root.querySelector('#rp-q') : null;
                if (v) return ('' + v.value).trim();
            } catch (e) { }
            return q;
        };
        const search = () => { q = typed(); offset = 0; load(); };

        if (!window.__bajaResearchWired) {
            window.__bajaResearchWired = true;
            let pressed = 0;
            const hit = (e) => {
                const h = window.__bajaResearchHandlers;
                const target = e && e.target;
                if (!h || !target || !target.closest) return;
                if (!target.closest('#' + ID)) return;
                // One press, one action. A pointerdown is always a new press; the mousedown
                // and click the browser sends after it are part of the same press and are
                // ignored. A browser with no pointer events never sets the stamp, so its
                // mousedown is the press.
                const now = Date.now();
                if (e.type !== 'pointerdown' && now - pressed < 700) return;
                const act = (fn) => {
                    pressed = now;
                    try { e.preventDefault(); } catch (x) { }
                    fn();
                };
                const op = target.closest('[data-open]');
                if (op) return act(() => h.open(+op.getAttribute('data-open')));
                const dq = target.closest('[data-q]');
                if (dq) return act(() => h.chip(dq.getAttribute('data-q')));
                const pg = target.closest('[data-page]');
                if (pg) return act(() => h.page(+pg.getAttribute('data-page')));
                const dd = target.closest('[data-do]');
                if (dd) return act(() => h.did(dd.getAttribute('data-do')));
                const bk = target.closest('[data-back]');
                if (bk) return act(() => h.back());
                const gh = target.closest('[data-go]');
                if (gh) return act(() => h.home());
            };
            document.addEventListener('pointerdown', hit, true);
            document.addEventListener('mousedown', hit, true);
            document.addEventListener('click', hit, true);
            // Enter in the search box searches, and the order menu reloads on a change.
            document.addEventListener('keydown', (e) => {
                const h = window.__bajaResearchHandlers;
                if (!h || !e || e.key !== 'Enter') return;
                const tg = e.target;
                if (tg && tg.id === 'rp-q') { try { e.preventDefault(); } catch (x) { } h.did('search'); }
            }, true);
            document.addEventListener('change', (e) => {
                const h = window.__bajaResearchHandlers;
                const tg = e && e.target;
                if (!h || !tg || !tg.closest || !tg.closest('[data-sort]')) return;
                h.sorted(tg.value);
            }, true);
        }
        window.__bajaResearchHandlers = {
            open: (id) => { openRun(id); },
            chip: (text) => { q = text; offset = 0; load(); },
            page: (n) => { offset = Math.max(0, offset + (n * PAGE)); load(); },
            did: (what) => {
                if (what === 'search') return search();
                if (what === 'clear') { q = ''; offset = 0; return load(); }
            },
            sorted: (v) => { sort = v; q = typed(); offset = 0; load(); },
            back: () => { load(); },
            home: () => { go(); },
        };

        // ---- one run ---------------------------------------------------------------------
        // The research as it was stored. The canvas builds its tables and its model from the
        // same `findings` and remains the place to work with the figures; this is for reading
        // them, and above all for the sources, since a figure nobody can trace is a figure
        // somebody has to research again.
        //
        // The field names here are the ones py/analytics/indication-market.py asks the model
        // for (its schema is the authority: `drug` not `name` for a competitor, `mutations`
        // under a gene, and so on). Everything is treated as possibly missing: the research
        // is a model's answer, and an older run may predate a field.
        const sect = (t) => '<div style="margin:24px 0 9px;font:700 12px Arial;letter-spacing:.07em;'
            + 'text-transform:uppercase;color:' + C.faint + ';">' + esc(t) + '</div>';
        const table = (headers, body) => '<div style="overflow:auto;border:1px solid ' + C.line + ';'
            + 'border-radius:10px;background:#fff;"><table style="width:100%;border-collapse:collapse;font:13px Arial;">'
            + '<thead><tr>' + headers.map((h) => '<th style="text-align:left;padding:8px 10px;font:700 11px Arial;'
                + 'letter-spacing:.05em;text-transform:uppercase;color:' + C.faint + ';'
                + 'border-bottom:1px solid ' + C.line + ';white-space:nowrap;">' + esc(h) + '</th>').join('')
            + '</tr></thead><tbody>' + body + '</tbody></table></div>';
        const cell = (v, extra) => '<td style="padding:9px 10px;border-bottom:1px solid #eef3f6;color:' + C.ink + ';'
            + 'vertical-align:top;' + (extra || '') + '">' + v + '</td>';
        const money = (n) => (n == null || n === '' || isNaN(+n)) ? '' : ('$' + num(Math.round(+n)));
        // A development cost is a round benchmark and reads better short; an annual price is
        // exact and stays exact, because the difference between $375,000 and $390,000 a year
        // is the whole argument.
        const big = (n) => {
            if (n == null || n === '' || isNaN(+n)) return '';
            const v = +n;
            if (v >= 1e9) return '$' + (Math.round(v / 1e8) / 10) + 'bn';
            if (v >= 1e6) return '$' + (Math.round(v / 1e5) / 10) + 'm';
            return money(v);
        };
        const yrs = (n) => (n == null || n === '' || isNaN(+n)) ? '' : (num(+n) + (+n === 1 ? ' year' : ' years'));
        const pct = (n) => (n == null || n === '' || isNaN(+n)) ? '' : (Math.round(+n * 100) + '%');
        const line = (label, value) => value ? '<div style="margin-top:5px;font:12.5px/1.55 Arial;color:' + C.dim + ';">'
            + '<span style="font-weight:700;color:#4a6872;">' + esc(label) + '</span> ' + esc(value) + '</div>' : '';
        const srcList = (list) => {
            const ok = (list || []).filter((s) => s && (s.url || s.title));
            if (!ok.length) return '';
            return '<div style="margin-top:7px;display:flex;flex-direction:column;gap:3px;">'
                + ok.map((s) => '<a href="' + esc(s.url || '#') + '" target="_blank" rel="noopener" '
                    + 'style="font:12px Arial;color:' + C.accent + ';text-decoration:none;word-break:break-word;">'
                    + (s.figure ? esc(s.figure) + ': ' : '') + esc(s.title || s.url)
                    + (s.year ? ' (' + esc(s.year) + ')' : '') + '</a>').join('') + '</div>';
        };
        const one = (s) => (s && typeof s === 'object') ? [s] : [];

        const openRun = async (id) => {
            draw(header('Opening the research...'));
            let run = null, bad = '';
            try { run = (await ask({ action: 'get', id: id })).run; }
            catch (e) { bad = (e && e.message) ? e.message : ('' + e); }
            if (!run) {
                draw(header('Research') + '<div style="margin-top:20px;">'
                    + card('<div style="font:700 16px Arial;">Could not open it</div>'
                        + '<div style="margin-top:7px;font:13.5px Arial;color:' + C.dim + ';">' + esc(bad) + '</div>')
                    + '</div><div style="margin-top:14px;">' + btn('data-back="1"', '&larr; All research') + '</div>');
                return;
            }
            const f = (run.findings && typeof run.findings === 'object') ? run.findings : {};
            const s = run.structured || {};
            const src = (run.found || []);

            const head = '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;">'
                + '<div style="flex:1 1 320px;min-width:0;">'
                + '<div style="font:800 ' + (phone ? '20px' : '24px') + ' Arial;color:' + C.ink + ';word-break:break-word;">'
                + esc((s.indications || []).join(', ') || run.prompt) + '</div>'
                + '<div style="margin-top:6px;font:13px Arial;color:' + C.dim + ';">'
                + [esc(f.approach || ''), esc(f.region || run.region || ''), esc(ago(run.created_at))]
                    .filter(Boolean).join(' · ')
                + '</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:9px;flex-wrap:wrap;">'
                + btn('data-back="1"', '&larr; All research') + btn('data-go="home"', 'Home') + '</div></div>'
                + '<div style="margin-top:8px;font:12px Arial;color:' + C.faint + ';">'
                + 'Asked as: &ldquo;' + esc(run.prompt) + '&rdquo;'
                + (run.age_days > 180 ? ' · researched over six months ago, so the figures are worth checking' : '')
                + '</div>';

            const summary = f.summary ? '<div style="margin-top:16px;">'
                + card('<div style="font:15px/1.6 Arial;color:' + C.ink + ';">' + esc(f.summary) + '</div>', '16px 18px')
                + '</div>' : '';

            // INDICATIONS as cards rather than one wide table: each one carries four figures
            // and four sentences explaining them, and the sentences are the part worth
            // reading. A row of eighteen columns on a phone is not.
            const inds = (f.indications || []).filter((i) => i && i.name);
            const fig = (label, value) => '<div style="min-width:120px;">'
                + '<div style="font:700 10.5px Arial;letter-spacing:.05em;text-transform:uppercase;color:' + C.faint + ';">'
                + esc(label) + '</div>'
                + '<div style="font:700 15px Arial;color:' + C.ink + ';margin-top:1px;">' + (value || '&mdash;') + '</div></div>';
            const indCard = (i) => card(
                '<div style="display:flex;gap:9px;align-items:baseline;flex-wrap:wrap;">'
                + '<span style="font:700 15.5px Arial;color:' + C.ink + ';">' + esc(i.name) + '</span>'
                + tag(i.type === 'expansion' ? 'expansion' : 'requested')
                + (i.plausibility ? '<span style="font:12px Arial;color:' + C.dim + ';">'
                    + esc(i.plausibility) + ' plausibility</span>' : '')
                + (i.confidence ? '<span style="margin-left:auto;font:12px Arial;color:' + C.faint + ';">'
                    + esc(i.confidence) + ' confidence in the figures</span>' : '')
                + '</div>'
                + (i.link ? '<div style="margin-top:6px;font:13px/1.55 Arial;color:#3d5a63;">' + esc(i.link) + '</div>' : '')
                + '<div style="margin-top:12px;display:flex;gap:18px;flex-wrap:wrap;">'
                + fig('Prevalence', i.prevalence_region == null ? '' : num(i.prevalence_region))
                + fig('New each year', i.incidence_region_per_year == null ? '' : num(i.incidence_region_per_year))
                + fig('Addressable', i.addressable_region == null ? '' : num(i.addressable_region))
                + fig('Annual price', money(i.annual_price_usd))
                + '</div>'
                + line('How the addressable figure was reached.', i.addressable_basis)
                + line('How the price was reached.', i.price_basis)
                + line('Standard of care.', i.standard_of_care)
                + line('Unmet need.', i.unmet_need)
                + srcList(i.sources), '15px 17px');
            const indications = inds.length ? sect(inds.length === 1 ? 'The indication'
                : inds.length + ' indications')
                + '<div style="display:flex;flex-direction:column;gap:10px;">'
                + inds.map(indCard).join('') + '</div>' : '';

            // GENES. `mutations` is a list under each gene, which reads better as one cell
            // than as a table of its own.
            const gen = (f.genetics || []).filter((g) => g && (g.gene || g.gene_name));
            const mut = (g) => (g.mutations || []).filter((m) => m && (m.name || m.hgvs))
                .map((m) => '<div style="margin-bottom:3px;"><b>' + esc(m.name || m.hgvs) + '</b>'
                    + (m.hgvs && m.name ? ' <span style="color:' + C.faint + ';">' + esc(m.hgvs) + '</span>' : '')
                    + (m.effect ? ' &middot; ' + esc(m.effect) : '')
                    + (m.frequency ? ' <span style="color:' + C.dim + ';">(' + esc(m.frequency) + ')</span>' : '')
                    + '</div>').join('');
            const genetics = gen.length ? sect('Genes and variants')
                + table(['Gene', 'Role', 'Bears on', 'Variants'], gen.map((g) => '<tr>'
                    + cell('<b>' + esc(g.gene || '') + '</b>'
                        + (g.gene_name ? '<div style="font:11.5px Arial;color:' + C.dim + ';margin-top:1px;">'
                            + esc(g.gene_name) + '</div>' : '')
                        + (g.transcript ? '<div style="font:11px Arial;color:' + C.faint + ';">'
                            + esc(g.transcript) + '</div>' : ''), 'white-space:nowrap;')
                    + cell(esc(g.role || ''), 'white-space:nowrap;')
                    + cell(esc(g.indication || ''))
                    + cell(mut(g) || '<span style="color:' + C.faint + ';">&mdash;</span>')
                    + '</tr>').join('')) : '';

            const hist = (f.history || []).filter((h) => h && (h.event || h.year));
            const history = hist.length ? sect('How it came to be understood')
                + table(['Year', 'Event'], hist.map((h) => '<tr>'
                    + cell(esc(h.year == null ? '' : h.year), 'white-space:nowrap;font:700 13px Arial;')
                    + cell('<div><b>' + esc(h.event || '') + '</b>'
                        + (h.kind ? ' <span style="font:11.5px Arial;color:' + C.faint + ';">'
                            + esc(h.kind) + '</span>' : '') + '</div>'
                        + (h.detail ? '<div style="margin-top:2px;font:12.5px/1.5 Arial;color:' + C.dim + ';">'
                            + esc(h.detail) + '</div>' : '')
                        + srcList(one(h.source)))
                    + '</tr>').join('')) : '';

            // DEVELOPMENT, the cost and time benchmarks the model found. One row a stage, in
            // the order the canvas shows them, and only the stages that came back with
            // anything in them.
            const dv = (f.development && typeof f.development === 'object') ? f.development : null;
            const STAGES = [['Preclinical', 'preclinical', false], ['Phase I', 'phase_i', true],
                ['Phase II', 'phase_ii', true], ['Phase III', 'phase_iii', true],
                ['Regulatory', 'regulatory', true], ['Launch', 'launch', false]];
            const devRows = !dv ? [] : STAGES.map(([label, key, rate]) => {
                const c = big(dv[key + '_cost_usd']), y = yrs(dv[key + '_years']);
                const r = rate ? pct(dv[key + '_success_rate']) : '';
                if (!c && !y && !r) return '';
                return '<tr>' + cell('<b>' + esc(label) + '</b>', 'white-space:nowrap;')
                    + cell(c || '&mdash;', 'white-space:nowrap;') + cell(y || '&mdash;', 'white-space:nowrap;')
                    + cell(r || '&mdash;', 'white-space:nowrap;') + '</tr>';
            }).filter(Boolean);
            const development = devRows.length ? sect('What it would take to develop')
                + table(['Stage', 'Cost', 'Time', 'Succeeds'], devRows.join(''))
                + (dv.basis ? '<div style="margin-top:7px;font:12.5px/1.55 Arial;color:' + C.dim + ';">'
                    + esc(dv.basis) + '</div>' : '')
                + srcList(dv.sources) : '';

            const comp = (f.competitors || []).filter((c) => c && (c.drug || c.company));
            const competitors = comp.length ? sect('Who else is in it')
                + table(['Programme', 'Company', 'Modality', 'Stage', 'How it bears'],
                    comp.map((c) => '<tr>'
                        + cell('<b>' + esc(c.drug || '') + '</b>'
                            + (c.indication ? '<div style="font:11.5px Arial;color:' + C.dim + ';">'
                                + esc(c.indication) + '</div>' : ''))
                        + cell(esc(c.company || ''))
                        + cell(esc(c.modality || ''), 'white-space:nowrap;')
                        + cell(esc(c.stage || ''), 'white-space:nowrap;')
                        + cell((c.competes ? tag(c.competes) + ' ' : '') + esc(c.note || '')
                            + srcList(one(c.source)))
                        + '</tr>').join('')) : '';

            const cos = (f.companies || []).filter((c) => c && c.company);
            const companies = cos.length ? sect('Who is working on it')
                + table(['Company', 'What they do here', 'Where they stand'], cos.map((c) => '<tr>'
                    + cell('<b>' + esc(c.company || '') + '</b>')
                    + cell(esc(c.focus || '')
                        + (c.assets ? '<div style="margin-top:2px;font:12.5px Arial;color:' + C.dim + ';">'
                            + esc(c.assets) + '</div>' : ''))
                    + cell(esc(c.position || '') + srcList(one(c.source)))
                    + '</tr>').join('')) : '';

            const notes = (f.notes || []).filter(Boolean);
            const noteBlock = notes.length ? sect('Caveats')
                + '<ul style="margin:0;padding-left:20px;font:13.5px/1.6 Arial;color:' + C.ink + ';">'
                + notes.map((n) => '<li style="margin-bottom:5px;">' + esc(n) + '</li>').join('') + '</ul>' : '';

            // EVERY SOURCE the research read, as opposed to the ones cited against a
            // particular figure above.
            const sources = src.length ? sect('Everything it read (' + src.length + ')')
                + '<div style="display:flex;flex-direction:column;gap:6px;">'
                + src.map((u) => '<a href="' + esc(u.url || '#') + '" target="_blank" rel="noopener" '
                    + 'style="font:13px Arial;color:' + C.accent + ';text-decoration:none;word-break:break-word;">'
                    + esc(u.title || u.url || '') + '</a>').join('') + '</div>' : '';

            const info = run.info || {};
            const how = '<div style="margin-top:28px;padding-top:14px;border-top:1px solid ' + C.line + ';'
                + 'font:12px/1.6 Arial;color:' + C.faint + ';">'
                + 'Researched ' + esc(ago(run.created_at))
                + (info.model || run.model ? ' with ' + esc(info.model || run.model) : '')
                + (info.searches || run.searches ? ', ' + esc(info.searches || run.searches) + ' web searches' : '')
                + (run.hits ? '. Reused ' + run.hits + (run.hits === 1 ? ' time' : ' times') : '')
                + '. To work with these figures as tables and a model, ask the same question in '
                + 'Analytics &gt; Build &gt; Indication market: it is answered from this research rather '
                + 'than researched again.</div>';

            draw(head + summary + indications + genetics + history + development + competitors
                + companies + noteBlock + sources + how);
        };

        await load();
        return true;
    })();
}
