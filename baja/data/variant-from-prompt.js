function (server, graph, genegraph_panel_layout, tracks) {
    // Describe a variant in words -- "K27M", "p.Arg175His", "c.83A>T", "delete codon 27" -- and
    // get it placed on the track that is already loaded, as a SnpIndel. Nothing is loaded.
    //
    // Division of labour, because a language model must not be the thing that picks a base:
    //   1. the track supplies its own coding sequence (from the ORF the track already computed),
    //   2. py/bio/variant-from-prompt.py asks Claude only to NORMALISE the description --
    //      which level, which residue, which position -- then checks the residue against that
    //      coding sequence and derives the smallest nucleotide change that produces the
    //      requested residue (K27M on H3F3A: histone numbering omits Met1, so it is Lys28 in
    //      HGVS, codon AAG, and the edit is c.83A>T),
    //   3. the edit comes back as an offset INTO the CDS, which the ORF's codon map turns into a
    //      track coordinate here, the base is re-checked on the track itself, and only then is
    //      the SnpIndel created.
    // An rsID or a genomic coordinate is not a change on this transcript's CDS: those are handed
    // to the existing "variant from text" flow, which resolves them through Ensembl.
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

    // A failed attempt puts the FORM BACK, with what was typed still in it and the reason
    // above it. The resolver's usual failure is a request for clarification -- "a protein
    // change or a nucleotide position must be given" -- which is a question, and a question
    // asked of someone whose form has just closed is a question nobody can answer. Re-entering
    // with the previous values turns it into an edit. Cancel still ends it.
    const run = async (prefill) => {
        const Strand = await exec('baja/bio/track-strand.js');
        const preset = (Array.isArray(tracks) ? tracks.filter(Boolean) : (tracks ? [tracks] : []));

        // ---- the form -----------------------------------------------------------------------
        // A modal form first, in the same shape as the design dialogs: a navy full-screen panel
        // with a header carrying the title and the two buttons, and a single column of fields.
        // It asks two things, because they are two different jobs:
        //
        //   constrained   the variant belongs on a track that is already open. Pick it, place it.
        //   unconstrained the description names a gene the board does not have yet. Find and load
        //                 the transcripts first, then place the variant on THOSE -- the search is
        //                 constrained to what was just loaded, so a K27M meant for H3F3A cannot
        //                 land on some other track that happens to be open.
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const showForm = () => new Promise((resolve) => {
            const pre = prefill || {};
            try { const old = document.getElementById('baja-variant-prompt'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
            const lbl = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:14px 0 4px;';
            const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 11px;font:13px Arial;';
            const panel = document.createElement('div');
            panel.id = 'baja-variant-prompt';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
                + '<div style="min-width:0;"><div style="font:700 20px Arial;">Describe a variant</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">Say the change in words. It is placed on the track at the position the coding sequence says it belongs.</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + '<button id="vp-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                + '<button id="vp-go" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Continue</button>'
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                + '<div style="width:100%;max-width:640px;margin:0 auto;">'
                + (pre.notice ? ('<div style="margin-bottom:16px;padding:12px 14px;border-radius:8px;'
                    + 'background:rgba(224,112,59,0.12);border:1px solid rgba(224,112,59,0.55);'
                    + 'color:#ffd9c7;font:13px Arial;">' + esc(pre.notice) + '</div>') : '')
                + '<label style="' + lbl + '">The variant</label>'
                + '<textarea id="vp-text" rows="3" placeholder="K27M" style="' + inp + 'resize:vertical;"></textarea>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">'
                + 'e.g. <b>K27M</b> &middot; <b>p.Arg175His</b> &middot; <b>c.83A&gt;T</b> &middot; <b>TP53 R175H</b></div>'
                + '<label style="' + lbl + '">Scope</label>'
                + '<label style="display:flex;align-items:flex-start;gap:9px;font:13px Arial;cursor:pointer;">'
                + '<input type="checkbox" id="vp-constrain" checked style="margin-top:2px;"/>'
                + '<span>Constrain to tracks already loaded</span></label>'
                + '<div id="vp-note" style="font:12px Arial;color:#9fb3c8;margin:8px 0 0 27px;"></div>'
                // The prompt itself, before it runs. The field above says WHICH change; this one
                // says how to read it -- a numbering convention, a transcript to prefer, a
                // disambiguation the description alone cannot carry. It is added to what the
                // model is asked, and nothing more: the answer is still checked base by base
                // against the track's own coding sequence afterwards, so an instruction can
                // steer the reading but cannot talk the tool into a change that is not there.
                + '<label style="' + lbl + '">Instructions for the model <span style="font-weight:400;">(optional)</span></label>'
                + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">'
                + '<select id="vp-preset" style="' + inp + 'flex:1 1 auto;"></select>'
                + '<button id="vp-save" style="cursor:pointer;flex:0 0 auto;border-radius:8px;padding:8px 14px;font:700 12px Arial;'
                + 'border:1px solid rgba(255,255,255,0.28);background:transparent;color:#e8f0fb;">Save\u2026</button>'
                + '</div>'
                + '<textarea id="vp-extra" rows="3" placeholder="e.g. this is histone numbering, which omits the initiator Met" style="' + inp + 'resize:vertical;"></textarea>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">'
                + 'Added to the prompt. The result is still verified against the track&rsquo;s coding sequence.</div>'
                + '<div id="vp-git" style="display:none;margin-top:12px;padding:12px;border-radius:8px;'
                + 'background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);">'
                + '<div style="font:600 12px Arial;color:#9fb3c8;margin-bottom:6px;">Saved in this browser. '
                + 'To make it everyone&rsquo;s, paste this into baja/data/variant-prompt-presets.js and commit it.</div>'
                + '<textarea id="vp-git-text" rows="5" readonly style="' + inp + 'font:12px monospace;resize:vertical;"></textarea>'
                + '<button id="vp-git-copy" style="cursor:pointer;margin-top:8px;border-radius:8px;padding:7px 13px;font:700 12px Arial;'
                + 'border:1px solid rgba(255,255,255,0.28);background:transparent;color:#e8f0fb;">Copy</button>'
                + '</div>'
                + '</div></div>';
            document.body.appendChild(panel);
            const q = (sel) => panel.querySelector(sel);
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            const note = () => {
                q('#vp-note').innerHTML = q('#vp-constrain').checked
                    ? 'The variant is placed on a track that is already open. Nothing is loaded.'
                    : 'The transcripts named in the description are found and loaded FIRST, and the variant is then placed on those — not on anything already open.';
            };
            // Put back what was typed, so a second attempt is an edit rather than a retype.
            try {
                if (pre.text) q('#vp-text').value = pre.text;
                if (pre.extra) q('#vp-extra').value = pre.extra;
                if (pre.constrain === false) q('#vp-constrain').checked = false;
            } catch (e) { }
            q('#vp-constrain').onchange = note; note();

            // PRESETS. The ones in baja/data/variant-prompt-presets.js are in the repo, so a
            // prompt that works is version-controlled; anything saved here is kept in this
            // browser until someone pastes it into that file and commits it. Both are listed,
            // with the local ones marked, so it is always clear which is which.
            const LOCAL_KEY = 'baja.variantPromptPresets';
            const readLocal = () => {
                try { const raw = localStorage.getItem(LOCAL_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; }
                catch (e) { return []; }
            };
            const writeLocal = (list) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch (e) { } };
            let shipped = [];
            const fillPresets = (selectName) => {
                const local = readLocal();
                const sel = q('#vp-preset');
                sel.innerHTML = '<option value="">Instruction presets\u2026</option>'
                    + shipped.map((p, i) => '<option value="s' + i + '">' + esc(p.name) + '</option>').join('')
                    + local.map((p, i) => '<option value="l' + i + '">' + esc(p.name) + ' (yours)</option>').join('');
                if (selectName) {
                    const li = local.findIndex((p) => p.name === selectName);
                    if (li >= 0) sel.value = 'l' + li;
                }
                sel.onchange = () => {
                    const v = '' + (sel.value || '');
                    if (!v) return;
                    const src = v[0] === 's' ? shipped : readLocal();
                    const item = src[parseInt(v.slice(1), 10)];
                    if (item) q('#vp-extra').value = item.text || '';
                };
            };
            (async () => {
                try { const m = await exec('baja/data/variant-prompt-presets.js'); shipped = (m && m.presets) || []; }
                catch (e) { shipped = []; }
                fillPresets();
            })();
            q('#vp-save').onclick = async () => {
                const text = ('' + (q('#vp-extra').value || '')).trim();
                if (!text) { try { q('#vp-extra').focus(); } catch (e) { } return; }
                let name = '';
                try { name = window.prompt('Name for this instruction set', ''); } catch (e) { name = ''; }
                name = ('' + (name || '')).trim();
                if (!name) return;
                const local = readLocal().filter((p) => p.name !== name);
                local.push({ name: name, text: text });
                writeLocal(local);
                fillPresets(name);
                // The entry to commit, formatted exactly as the presets file wants it.
                const wrap = (t) => {
                    const words = ('' + t).split(/\s+/); const lines = []; let cur = '';
                    for (const w of words) { if ((cur + ' ' + w).trim().length > 74) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
                    if (cur.trim()) lines.push(cur.trim());
                    return lines.map((l, i) => '                ' + (i === 0 ? "text: '" : "    + '") + l.replace(/'/g, "\\'") + (i === lines.length - 1 ? "'" : " '")).join('\n');
                };
                q('#vp-git-text').value = '            {\n'
                    + "                name: '" + name.replace(/'/g, "\\'") + "',\n"
                    + wrap(text) + '\n            },';
                q('#vp-git').style.display = '';
            };
            q('#vp-git-copy').onclick = async () => {
                try { await navigator.clipboard.writeText(q('#vp-git-text').value || ''); q('#vp-git-copy').textContent = 'Copied'; }
                catch (e) { try { q('#vp-git-text').focus(); q('#vp-git-text').select(); } catch (e2) { } }
            };
            // Keep the panel's own keys and pastes to itself: the editor listens on the window
            // for a paste and would otherwise read a pasted description as something to put on
            // the canvas.
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            panel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { close(); resolve(null); }
                else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) q('#vp-go').click();
            });
            q('#vp-cancel').onclick = () => { close(); resolve(null); };
            q('#vp-go').onclick = () => {
                const text = ('' + (q('#vp-text').value || '')).trim();
                if (!text) { try { q('#vp-text').focus(); } catch (e) { } return; }
                const constrain = !!q('#vp-constrain').checked;
                const extra = ('' + ((q('#vp-extra') && q('#vp-extra').value) || '')).trim();
                close();
                resolve({ text: text, constrain: constrain, extra: extra });
            };
            try { q('#vp-text').focus(); } catch (e) { }
        });

        // ---- which track --------------------------------------------------------------------
        const pickTrack = () => new Promise((resolve) => {
            if (preset.length === 1) return resolve(preset[0]);
            let sel = [];
            try { sel = (graph.track || []).filter((t) => t && t.showResizeBar); } catch (e) { }
            if (sel.length === 1) return resolve(sel[0]);
            if ((graph.track || []).length === 1) return resolve(graph.track[0]);
            graph.setMouseMode('msg: Click the track the variant belongs to.');
            graph.addMouseDownListener((x, y) => {
                const ti = graph.getTrack(x, y);
                graph.clearMouseListeners(); graph.setMouseMode('navigate');
                resolve(ti < 0 ? null : graph.track[ti]);
            });
        });

        // Re-enter with what was typed and why it failed.
        const again = (why, prev) => run({ text: prev.text, constrain: prev.constrain, extra: prev.extra, notice: why });

        const form = await showForm();
        if (!form) { restoreHover(); return false; }
        const text = form.text;
        const extra = form.extra || '';

        // ---- which tracks the variant may land on -------------------------------------------
        let targets = [];
        if (form.constrain) {
            const t = await pickTrack();
            if (!t) { say('No track chosen.'); restoreHover(); return false; }
            targets = [t];
        } else {
            // Find and load the transcripts the description names, then use ONLY those. The
            // loader resolves free text ("H3F3A", "TP53 canonical", an ENST id) through the same
            // resolver the New-track form uses, so a description that names a gene is enough.
            const before = new Set((graph.track || []).map((t) => t));
            say('Finding the transcripts for "' + text + '"…');
            try { await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout, text); }
            catch (e) { return again('Could not load transcripts for "' + text + '": ' + (e && e.message ? e.message : e), form); }
            targets = (graph.track || []).filter((t) => t && !before.has(t));
            if (!targets.length) {
                return again('No transcript was loaded for "' + text + '", so there is nothing to place the variant on. Name the gene in the description, or tick "Constrain to tracks already loaded" and pick a track.', form);
            }
            say('Loaded ' + targets.length + ' transcript' + (targets.length === 1 ? '' : 's') + '; placing the variant on ' + (targets.length === 1 ? 'it' : 'them') + '…');
        }

        // Place the described variant on ONE track. Returns a short outcome for the summary.
        const placeOn = async (track) => {
        // ---- the coding sequence, from the ORF the track already has ------------------------
        try { if (!track.orf && track.generateORF) track.generateORF(); } catch (e) { }
        const cdsi = (track.orf && Array.isArray(track.orf.cdsi)) ? track.orf.cdsi : [];
        if (!cdsi.length || typeof track.sequence !== 'string') {
            return { ok: false, why: (track.name || 'that track') + ' has no coding sequence' };
        }
        const orient = Strand.orientation(track);
        // cdsi is in CDS order (codon_index, then base within the codon), each entry carrying
        // the track x of that base. The coding-strand base at that x, read in CDS order, IS
        // the CDS in transcript orientation, whatever the track's storage orientation.
        const entries = cdsi.slice().sort((a, b) => (a.codon_index - b.codon_index) || (a.ci - b.ci));
        const cds = entries.map((e) => Strand.codingBaseAt(track, e.index, orient)).join('');

        const gene = (() => { try { const d = '' + (track.description || ''); return d.split(';')[0].trim() || track.geneID || track.name || ''; } catch (e) { return track.name || ''; } })();

        // ---- ask ----------------------------------------------------------------------------
        const ctx = {
            gene: gene, transcript: track.transcriptID || '', description: track.description || '',
            strand: track.strand, chr: track.contig || track.chr, cds: cds,
        };
        say('Reading "' + text + '" for ' + (gene || track.name) + '…');
        let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
        let r = null;
        try { r = await exec(server + '/py/bio/variant-from-prompt.py', em, text, JSON.stringify(ctx), extra); } catch (e) { r = null; }
        if (!r || r.error) {
            return { ok: false, why: ((r && r.error) || 'no answer from the server') };
        }
        if (r.level === 'genomic' || r.level === 'rsid') {
            return { ok: false, genomic: true, why: 'a genomic coordinate or rsID rather than a change on this transcript' };
        }
        let edits = [];
        try { edits = JSON.parse(r.edits || '[]'); } catch (e) { edits = []; }
        if (!edits.length) return { ok: false, why: 'no change could be derived for ' + (gene || track.name) };

        // ---- map onto the track and check the base there ------------------------------------
        const SnpIndel = await exec('flexigraph/snpindel.js');
        const minus = +track.strand < 0;
        try { graph.pushOntoHistory(); } catch (e) { }
        let placed = 0, first = null;
        for (const ed of edits) {
            const off = +ed.cds_offset;
            const ref = ('' + ed.ref).toUpperCase(), alt = ('' + ed.alt).toUpperCase();
            if (!(off >= 0 && off + ref.length <= entries.length)) { say('Edit falls outside the coding sequence.'); continue; }
            // Re-check on the track itself: the coding bases at those CDS positions must be ref.
            const have = entries.slice(off, off + ref.length).map((e) => Strand.codingBaseAt(track, e.index, orient)).join('');
            if (have !== ref) { say('The track reads ' + have + ' where ' + ref + ' was expected; not placed.'); continue; }
            if ((ed.type === 'del' || ed.type === 'ins') && minus) {
                say('Insertions and deletions are placed on plus-strand tracks only for now; ' + ed.label + ' was not placed.');
                continue;
            }
            // SnpIndel takes PLUS-strand alleles and complements them itself for a minus-strand
            // track; a multi-base allele on the minus strand also runs the other way in x.
            const xs = entries.slice(off, off + ref.length).map((e) => e.index);
            const x = Math.min.apply(null, xs);
            const refG = minus ? Strand.reverseComplement(ref) : ref;
            const altG = minus ? Strand.reverseComplement(alt) : alt;
            let placeXi = x;
            if (ed.type === 'del' && !minus) placeXi = x + 1;   // same anchoring as load-variants.js
            const label = (gene ? gene + ' ' : '') + (r.hgvs_p || ed.label || text);
            const snp = new SnpIndel(ed.type || 'snp', placeXi, refG, altG, 0, track.strand, label, null, '#d1342f');
            try {
                snp.name = label;
                snp.source = 'Described';
                snp.structure = [r.hgvs_p, r.hgvs_c].filter(Boolean).join('  ');
                snp.comment = ('' + text + (r.note ? ' — ' + r.note : '')).trim();
            } catch (e) { }
            track.addsnpindel(snp);
            track.showSnpIndels = true;
            placed++; if (!first) first = snp;
        }
        if (!placed) return { ok: false, why: 'nothing could be placed on ' + (track.name || 'that track') };
        try { if (graph.wake) graph.wake(); } catch (e) { }
        // Show it: select the mutation and zoom to it, as the tours do.
        try { await exec('baja/manchester/menu/focus-mutation.js', graph, first, 10000); } catch (e) { }
        try {
            const tg = track.tgraph, w = 25;
            const cy = (tg.yi + (tg.yi + (tg.height || 0))) / 2, span = Math.abs(tg.height || 0) || 0.1;
            if (graph.zoomRect) graph.zoomRect(tg.X(first.xi - w), tg.X(first.xi + w), cy + span * 3.6, cy - span * 2.2, 400);
        } catch (e) { }
        return {
            ok: true, track: track.name || 'the track', snp: first,
            label: (r.hgvs_p || edits[0].label) + (r.hgvs_c ? ' (' + r.hgvs_c + ')' : ''),
            note: r.note || ''
        };
        };   // end placeOn

        // ---- run it over the chosen tracks --------------------------------------------------
        const results = [];
        for (const t of targets) {
            let out = null;
            try { out = await placeOn(t); } catch (e) { out = { ok: false, why: (e && e.message) ? e.message : ('' + e) }; }
            results.push(Object.assign({ name: (t && t.name) || 'track' }, out || { ok: false, why: 'no result' }));
        }
        const good = results.filter((x) => x.ok);
        try { if (graph.wake) graph.wake(); } catch (e) { }

        if (!good.length) {
            // An rsID or a genomic coordinate is not a change on a transcript's coding sequence;
            // hand those to the loader that resolves them through Ensembl, as before.
            if (results.some((x) => x.genomic)) {
                say('"' + text + '" is a genomic coordinate or rsID rather than a change on a transcript; opening the variant-from-text loader, which resolves those through Ensembl.');
                try { exec('baja/data/prompt-variant.js', server, graph, genegraph_panel_layout); } catch (e) { }
                return false;
            }
            // The resolver's reason IS the thing to act on -- usually a question about the
            // description -- so it goes above the form rather than into a toast that outlives it.
            return again('Could not place "' + text + '" — ' + (results.map((x) => x.why).filter(Boolean).join('; ') || 'no result'), form);
        }

        // Show the first one placed: select it and zoom to it, as the tours do.
        const lead = good[0];
        try { await exec('baja/manchester/menu/focus-mutation.js', graph, lead.snp, 10000); } catch (e) { }
        try {
            const lt = targets.find((t) => (t.name || 'the track') === lead.track) || targets[0];
            const tg = lt.tgraph, w = 25;
            const cy = (tg.yi + (tg.yi + (tg.height || 0))) / 2, span = Math.abs(tg.height || 0) || 0.1;
            if (graph.zoomRect) graph.zoomRect(tg.X(lead.snp.xi - w), tg.X(lead.snp.xi + w), cy + span * 3.6, cy - span * 2.2, 400);
        } catch (e) { }
        const failed = results.filter((x) => !x.ok);
        const msg = ' Placed ' + lead.label + ' on ' + good.map((g) => g.track).join(', ')
            + (lead.note ? ' — ' + lead.note : '')
            + (failed.length ? ' (' + failed.length + ' track' + (failed.length === 1 ? '' : 's') + ' skipped: ' + failed.map((x) => x.why).filter(Boolean).join('; ') + ')' : '')
            + '. ';
        try { graph.setResultMessage(msg); } catch (e) { say(msg); }
        restoreHover();
        return true;
    };
    return run(null);
}
