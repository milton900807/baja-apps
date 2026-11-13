function (graph, scopeTrack) {

    // SELECT COMPOUNDS BY WHAT THEY ARE, not one click at a time.
    //   const n = await exec('baja/manchester/menu/select-compounds-by.js', graph, track);
    //
    // A finished design is read by its colour and then acted on by its numbers: the reds, the
    // ones under a score, the ones whose Tm will not work in the assay, the ones the scorer
    // called repetitive. Every one of those questions had the same answer before this -- pick
    // them out of the drawing by hand -- and at the zoom where a whole design fits, which is
    // where the questions get asked, the reasons are not even drawn.
    //
    // Every criterion reads a field the DESIGNER wrote on the compound (score, gc_percent,
    // tm_c, length, notes, designType) or the colour the renderer gave it. Nothing is
    // re-derived here: a second copy of "red means score under 10" in this file would be a
    // second answer to a question scoreToColor already answers, free to drift the next time
    // the scale moves.
    //
    // Resolves the number selected, or null if cancelled.
    return new Promise((resolve) => {
        try {
            const old = document.getElementById('baja-select-by');
            if (old && old.parentNode) old.parentNode.removeChild(old);

            // ---- the population ------------------------------------------------------
            const all = [];
            for (const t of (graph.track || [])) {
                for (const o of (t.oligos || [])) all.push({ o: o, t: t });
            }
            if (!all.length) {
                try { graph.setMessage(' There are no compounds to select. '); } catch (e) { }
                resolve(null); return;
            }
            const scopedName = (scopeTrack && (scopeTrack.name || 'this track')) || null;

            // What the set actually spans, so the ranges are offered as the numbers in front
            // of the user rather than as invented defaults they have to clear first.
            // MISSING IS NOT ZERO. `+null` is 0 and `+''` is 0, so a compound carrying no GC
            // at all read as GC 0% and matched every "GC below" filter ever typed -- a
            // compound nothing is known about turning up in a narrowed set, which is the
            // opposite of what narrowing is for. Absent values are null here and fail any
            // range the user constrained.
            const num = (v) => {
                if (v == null || v === '') return null;
                const n = +v;
                return Number.isFinite(n) ? n : null;
            };
            const spanOf = (get) => {
                let lo = Infinity, hi = -Infinity, seen = 0;
                for (const r of all) {
                    const v = num(get(r.o));
                    if (v == null) continue;
                    seen++; lo = Math.min(lo, v); hi = Math.max(hi, v);
                }
                return seen ? { lo: lo, hi: hi } : null;
            };
            const sc = spanOf((o) => o.score);
            const gc = spanOf((o) => o.gc_percent);
            const tm = spanOf((o) => (o.tm_c != null ? o.tm_c : o.tm));
            const ln = spanOf((o) => (o.length != null ? o.length : ((o.sequence || '').length || null)));

            // The scorer's own words. Matched the way the red label is built in
            // track-design-menu.js, so a tick here and the text on the canvas mean the
            // same thing.
            const FAULTS = [
                ['gc', 'GC out of range', /GC outside preferred range/i],
                ['tm', 'Tm out of range', /Tm outside preferred range/i],
                ['cpg', 'CpG motif', /Contains CpG motif/i],
                ['grun', 'Long G run', /Long G run detected/i],
                ['pal', 'Palindromic', /Palindrome/i],
                ['selfc', 'Self-complementary', /Self-complementary stretch detected/i],
                ['rep', 'Repetitive', /Repetitive sequence/i]
            ];

            const MODALITIES = [
                ['', 'Any modality'],
                ['gapmer', 'Gapmer'],
                ['steric', 'Steric-blocking'],
                ['sirna', 'siRNA']
            ];
            const modalityOf = (o) => {
                const d = ('' + (o.designType || o.type || '')).toLowerCase();
                if (d.indexOf('steric') >= 0) return 'steric';
                if (d.indexOf('sirna') >= 0) return 'sirna';
                if (d.indexOf('gapmer') >= 0) return 'gapmer';
                return '';
            };

            // ---- the form ------------------------------------------------------------
            const lbl = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:12px 0 4px;';
            const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:8px 10px;font:13px Arial;';
            const half = 'display:flex;gap:10px;';
            const pair = (id, span, unit) => '<div style="' + half + '">'
                + '<input id="' + id + '-lo" placeholder="min' + (span ? (' ' + (Math.round(span.lo * 10) / 10)) : '')
                + '" style="' + inp + '"/>'
                + '<input id="' + id + '-hi" placeholder="max' + (span ? (' ' + (Math.round(span.hi * 10) / 10)) : '')
                + '" style="' + inp + '"/></div>'
                + (unit ? ('<div style="font:11.5px Arial;color:#7f97a6;margin-top:3px;">' + unit + '</div>') : '');

            const panel = document.createElement('div');
            panel.id = 'baja-select-by';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            panel.innerHTML =
                '<div style="padding:18px 24px 10px;border-bottom:1px solid rgba(255,255,255,0.12);">'
                + '<div style="font:700 17px Arial;">Select compounds</div>'
                + '<div id="sb-count" style="font:12.5px Arial;color:#9fb3c8;margin-top:4px;"></div>'
                + '</div>'
                + '<div style="flex:1;overflow:auto;padding:4px 24px 24px;">'
                + '<div style="max-width:560px;">'

                + '<label style="' + lbl + '">Where</label>'
                + '<select id="sb-scope" style="' + inp + '">'
                + (scopedName ? '<option value="track">' + scopedName + ' only</option>' : '')
                + '<option value="all">Every track</option></select>'

                + '<label style="' + lbl + '">Score band</label>'
                + '<select id="sb-band" style="' + inp + '">'
                + '<option value="">Any colour</option>'
                + '<option value="red">Warnings only (red)</option>'
                + '<option value="amber">Red or orange</option>'
                + '<option value="notred">Everything except red</option>'
                + '<option value="green">Best only (green)</option>'
                + '</select>'

                + '<label style="' + lbl + '">Flagged for</label>'
                + '<div style="display:flex;flex-wrap:wrap;gap:12px;font:13px Arial;">'
                + FAULTS.map((f) => '<label style="white-space:nowrap;"><input type="checkbox" data-fault="'
                    + f[0] + '"/> ' + f[1] + '</label>').join('')
                + '</div>'
                + '<div style="font:11.5px Arial;color:#7f97a6;margin-top:5px;">'
                + 'Tick several to take a compound carrying <b>any</b> of them. The scorer only writes '
                + 'these when it has something to say, so an untouched list matches everything.</div>'

                + '<label style="' + lbl + '">Score</label>' + pair('sb-score', sc, '')
                + '<label style="' + lbl + '">GC %</label>' + pair('sb-gc', gc, '')
                + '<label style="' + lbl + '">Tm (°C)</label>' + pair('sb-tm', tm, '')
                + '<label style="' + lbl + '">Length (nt)</label>' + pair('sb-len', ln, '')

                + '<label style="' + lbl + '">Modality</label>'
                + '<select id="sb-mod" style="' + inp + '">'
                + MODALITIES.map((m) => '<option value="' + m[0] + '">' + m[1] + '</option>').join('')
                + '</select>'

                + '<label style="' + lbl + '">Name contains</label>'
                + '<input id="sb-name" style="' + inp + '" placeholder="any"/>'

                + '<div style="margin-top:14px;font:13px Arial;">'
                + '<label><input type="checkbox" id="sb-allele"/> Allele-selective only</label></div>'

                + '</div></div>'
                + '<div style="padding:14px 24px;border-top:1px solid rgba(255,255,255,0.12);display:flex;gap:10px;flex-wrap:wrap;">'
                + '<button id="sb-go" style="cursor:pointer;border-radius:9px;padding:11px 18px;font:700 13.5px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Select these</button>'
                + '<button id="sb-add" style="cursor:pointer;border-radius:9px;padding:11px 18px;font:700 13.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.28);background:transparent;color:#e8f0fb;">Add to selection</button>'
                + '<button id="sb-cancel" style="cursor:pointer;border-radius:9px;padding:11px 18px;font:700 13.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.28);background:transparent;color:#e8f0fb;">Cancel</button>'
                + '</div>';
            document.body.appendChild(panel);

            const q = (s) => panel.querySelector(s);
            const close = () => { try { panel.parentNode.removeChild(panel); } catch (e) { } };
            const val = (s) => { const el = q(s); return el ? ('' + el.value).trim() : ''; };
            const bound = (s) => { const v = parseFloat(val(s)); return Number.isFinite(v) ? v : null; };

            // ---- the predicate -------------------------------------------------------
            // One function, read by the live count and by the buttons, so what the header
            // promises and what the buttons do cannot come apart.
            const matches = () => {
                const scope = val('#sb-scope');
                const band = val('#sb-band');
                const mod = val('#sb-mod');
                const name = val('#sb-name').toLowerCase();
                const allele = !!(q('#sb-allele') && q('#sb-allele').checked);
                const wanted = FAULTS.filter((f) => {
                    const el = panel.querySelector('[data-fault="' + f[0] + '"]');
                    return el && el.checked;
                });
                const sLo = bound('#sb-score-lo'), sHi = bound('#sb-score-hi');
                const gLo = bound('#sb-gc-lo'), gHi = bound('#sb-gc-hi');
                const tLo = bound('#sb-tm-lo'), tHi = bound('#sb-tm-hi');
                const lLo = bound('#sb-len-lo'), lHi = bound('#sb-len-hi');
                const inRange = (v, lo, hi) => {
                    if (lo == null && hi == null) return true;
                    // A compound with no value for a field the user constrained is not a
                    // match: treating missing as passing would quietly include compounds
                    // nothing is known about, which is the opposite of narrowing.
                    if (v == null) return false;
                    if (lo != null && v < lo) return false;
                    if (hi != null && v > hi) return false;
                    return true;
                };
                const out = [];
                for (const r of all) {
                    const o = r.o;
                    if (scope === 'track' && scopeTrack && r.t !== scopeTrack) continue;
                    const red = (o.color === 'red' || !!o.flagReason);
                    const col = ('' + (o.color || '')).toLowerCase();
                    if (band === 'red' && !red) continue;
                    if (band === 'notred' && red) continue;
                    if (band === 'amber' && !(red || col === 'orange')) continue;
                    if (band === 'green' && col.indexOf('green') < 0) continue;
                    if (mod && modalityOf(o) !== mod) continue;
                    if (allele && !(o.alleleSelective || (o.alleleCols && o.alleleCols.length))) continue;
                    if (name && ('' + (o.name || '')).toLowerCase().indexOf(name) < 0) continue;
                    if (!inRange(num(o.score), sLo, sHi)) continue;
                    if (!inRange(num(o.gc_percent), gLo, gHi)) continue;
                    if (!inRange(num(o.tm_c != null ? o.tm_c : o.tm), tLo, tHi)) continue;
                    if (!inRange(num(o.length != null ? o.length : ((o.sequence || '').length || null)), lLo, lHi)) continue;
                    if (wanted.length) {
                        const notes = Array.isArray(o.notes) ? o.notes.join(' | ') : '';
                        const text = notes + ' | ' + (o.flagReason || '');
                        if (!wanted.some((f) => f[2].test(text))) continue;
                    }
                    out.push(r);
                }
                return out;
            };

            const refresh = () => {
                try {
                    const n = matches().length;
                    const scoped = (val('#sb-scope') === 'track' && scopedName)
                        ? all.filter((r) => r.t === scopeTrack).length : all.length;
                    q('#sb-count').textContent = n + ' of ' + scoped + ' compound'
                        + (scoped === 1 ? '' : 's') + ' match';
                    const go = q('#sb-go'), add = q('#sb-add');
                    for (const b of [go, add]) {
                        if (!b) continue;
                        b.disabled = !n;
                        b.style.opacity = n ? '' : '0.5';
                        b.style.cursor = n ? 'pointer' : 'default';
                    }
                } catch (e) { }
            };
            // Every control, one listener: the count is the thing that makes a form like this
            // usable, because it answers "did that do what I meant" before the button is
            // pressed rather than after the selection has changed.
            for (const el of panel.querySelectorAll('input,select')) {
                el.addEventListener('input', refresh);
                el.addEventListener('change', refresh);
            }
            refresh();

            const apply = (addTo) => {
                const hits = matches();
                if (!hits.length) return;
                try {
                    if (addTo && typeof graph.addOligoToSelection === 'function') {
                        for (const r of hits) { try { graph.addOligoToSelection(r.o, r.t); } catch (e) { } }
                    } else {
                        graph.setSelectedCompounds(hits.map((r) => ({ o: r.o, t: r.t })));
                    }
                    graph.currentShape = null;
                    if (graph.wake) graph.wake();
                    graph.setMessage(' ' + (addTo ? 'Added ' : 'Selected ') + hits.length
                        + ' compound' + (hits.length === 1 ? '' : 's') + ' — see the selection window. ');
                } catch (e) {
                    try { graph.setMessage(' Could not change the selection: ' + e + ' '); } catch (e2) { }
                }
                close();
                resolve(hits.length);
            };
            q('#sb-go').onclick = () => apply(false);
            q('#sb-add').onclick = () => apply(true);
            q('#sb-cancel').onclick = () => { close(); resolve(null); };
        } catch (e) {
            try { graph.setMessage(' Could not open the selector: ' + e + ' '); } catch (e2) { }
            resolve(null);
        }
    });
}
