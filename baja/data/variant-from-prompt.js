function (server, graph, genegraph_panel_layout, tracks, presetText) {
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
                if (pre.constrain === false) q('#vp-constrain').checked = false;
            } catch (e) { }
            q('#vp-constrain').onchange = note; note();

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
                close();
                resolve({ text: text, constrain: constrain });
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
            // graph.setMouseMode('msg: Click the track the variant belongs to.');
            // graph.addMouseDownListener((x, y) => {
            //     const ti = graph.getTrack(x, y);
            //     graph.clearMouseListeners(); graph.setMouseMode('navigate');
            //     resolve(ti < 0 ? null : graph.track[ti]);
            // });
        });

        // Re-enter with what was typed and why it failed. There is one case where that is the
        // wrong move: a run driven by a caller (the variant-track wizard) has no form behind
        // it and the same inputs would fail the same way, so it reports and stops instead of
        // looping.
        const again = (why, prev) => {
            if (('' + (presetText || '')).trim()) { say(why); restoreHover(); return false; }
            return run({ text: prev.text, constrain: prev.constrain, notice: why });
        };

        // CALLED WITH A DESCRIPTION AND THE TRACKS IT APPLIES TO, there is nothing to ask and
        // nothing to find: the transcripts are already chosen, and the description is a
        // constraint on what may land on them. The variant-track wizard uses this for its
        // second step, where "coronary heart disease" means the changes of THIS gene linked to
        // that condition -- not a reason to go and load the other genes that condition touches.
        const pinned = ('' + (presetText || '')).trim();
        const onTracks = (Array.isArray(tracks) ? tracks.filter(Boolean) : (tracks ? [tracks] : []));
        const form = pinned ? { text: pinned } : await showForm();
        if (!form) { restoreHover(); return false; }
        const text = form.text;

        // ---- which tracks the variant may land on -------------------------------------------
        // A DISEASE NAME IS A DIFFERENT QUESTION, ASKED IN A DIFFERENT ORDER.
        //
        // "DIPG" names no change and no gene, so searching for its transcripts first has
        // nothing to go on. The mutations are what is actually known about a context, and the
        // genes follow from them -- so ask for the mutations FIRST, take the genes out of that
        // answer, load a transcript for each, and check every change against the coding
        // sequence of the transcript it was said to belong to.
        //
        // A text that names a change ("K27M", "TP53 R175H") is not a context and is sent
        // straight down the ordinary path below.
        const em0 = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
        let byGene = null, contextName = '', isSample = false, contextNote = '';
        try {
            if (pinned && onTracks.length) throw new Error('pinned');
            const dv = await exec(server + '/py/bio/disease-variants.py', em0, text, '12');
            const isCtx = dv && (dv.is_context === true || dv.is_context === 'true');
            if (isCtx && !dv.error) {
                let vs = [];
                try { vs = JSON.parse(dv.variants || '[]'); } catch (e) { vs = []; }
                if (vs.length) {
                    contextName = dv.disease || text;
                    isSample = (dv.sample === true || dv.sample === 'true');
                    contextNote = '' + (dv.note || '');
                    byGene = new Map();
                    for (const v of vs) {
                        const g = ('' + (v.gene || '')).toUpperCase();
                        if (!byGene.has(g)) byGene.set(g, []);
                        byGene.get(g).push(v);
                    }
                }
            } else if (isCtx && dv.error) {
                return again('"' + text + '" is a disease, but its mutations could not be named — ' + dv.error, form);
            }
        } catch (e) { byGene = null; }

        // `plan` pairs each track with the changes to check on it. In the ordinary path there
        // are no pre-named changes and the description itself is read against every track.
        let plan = [];
        const before = new Set((graph.track || []).map((t) => t));
        if (pinned && onTracks.length) {
            plan = onTracks.map((t) => ({ track: t, given: null, gene: '' }));
            say('Finding the changes of ' + (plan.length === 1 ? 'this transcript' : 'these transcripts')
                + ' linked to "' + pinned + '"…');
        } else if (byGene) {
            const genes = Array.from(byGene.keys());
            const total = Array.from(byGene.values()).reduce((n, a) => n + a.length, 0);
            say(contextName + ' — ' + (isSample ? 'a sample of ' : '') + total + ' mutation'
                + (total === 1 ? '' : 's') + ' in ' + genes.length + ' gene' + (genes.length === 1 ? '' : 's')
                + ': ' + genes.join(', ') + '. Loading transcripts…');
            // ONE GENE CAN COME BACK UNDER TWO NAMES -- H3-3A and H3F3A are the same gene, and
            // loading each of them puts the same transcript on the board twice with the
            // mutations split between the copies. Resolve every gene to a transcript id FIRST,
            // and let the id, not the name, decide what gets loaded and what belongs on it.
            const byTx = new Map();   // transcript id -> { genes: [], given: [] }
            for (const g of genes) {
                let res = null;
                try { res = await exec('/py/sequence/prompt-to-transcript.py', em0, 'canonical ' + g + ' in human'); }
                catch (e) { res = null; }
                let hits = [];
                try { hits = JSON.parse((res && res.transcripts) || '[]'); } catch (e) { hits = []; }
                const hit = hits.find((x) => x && x.canonical) || hits[0];
                if (!hit || !hit.id) continue;
                const id = ('' + hit.id).toUpperCase();
                if (!byTx.has(id)) byTx.set(id, { genes: [], given: [] });
                const slot = byTx.get(id);
                if (slot.genes.indexOf(g) < 0) slot.genes.push(g);
                for (const v of (byGene.get(g) || [])) {
                    // Two names for one gene also means the same change listed twice.
                    if (!slot.given.some((w) => w.ref === v.ref && w.pos === v.pos && w.alt === v.alt)) {
                        slot.given.push(v);
                    }
                }
            }
            for (const [id, slot] of byTx) {
                const seen = new Set((graph.track || []).map((t) => t));
                say('Loading ' + slot.genes.join(' / ') + ' (' + id + ')…');
                try { await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout, id); }
                catch (e) { continue; }
                for (const t of (graph.track || [])) {
                    if (t && !seen.has(t)) plan.push({ track: t, given: slot.given, gene: slot.genes[0] });
                }
            }
            if (!plan.length) {
                return again('No transcript could be loaded for ' + contextName + ' (' + genes.join(', ') + '), so its mutations have nowhere to go.', form);
            }
            say('Loaded ' + plan.length + ' transcript' + (plan.length === 1 ? '' : 's') + '; placing the mutations…');
        } else {
            // Find and load the transcripts the description names, then use ONLY those. The
            // loader resolves free text ("H3F3A", "TP53 canonical", an ENST id) through the same
            // resolver the New-track form uses, so a description that names a gene is enough.
            say('Finding the transcripts for "' + text + '"…');
            try { await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout, text); }
            catch (e) { return again('Could not load transcripts for "' + text + '": ' + (e && e.message ? e.message : e), form); }
            const fresh = (graph.track || []).filter((t) => t && !before.has(t));
            if (!fresh.length) {
                return again('No transcript was loaded for "' + text + '", so there is nothing to place the variant on. Name the gene in the description.', form);
            }
            plan = fresh.map((t) => ({ track: t, given: null, gene: '' }));
            say('Loaded ' + plan.length + ' transcript' + (plan.length === 1 ? '' : 's') + '; placing the variant on ' + (plan.length === 1 ? 'it' : 'them') + '…');
        }
        const targets = plan.map((p) => p.track);

        // Place the described variant on ONE track. Returns a short outcome for the summary.
        const placeOn = async (track, given) => {
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
            try {
                // Changes that were named already (from a disease context) are only CHECKED
                // here -- same verification, nothing asked, nothing inferred.
                r = given && given.length
                    ? await exec(server + '/py/bio/variant-from-prompt.py', em, text, JSON.stringify(ctx), '', 'verify', JSON.stringify(given))
                    : await exec(server + '/py/bio/variant-from-prompt.py', em, text, JSON.stringify(ctx), '');
            } catch (e) { r = null; }
            // A DESCRIPTION WITH NO SINGLE CHANGE IN IT IS A DIFFERENT QUESTION, NOT A DEAD END.
            // "KRAS lung cancer" names a gene and a context, and the resolver is right to
            // refuse to normalise it to one edit -- but the variants it denotes are nameable,
            // so ask for those instead and place every one that the transcript itself confirms.
            if (r && r.vague && !(given && given.length)) {
                const firstWhy = '' + (r.error || '');
                say('"' + text + '" names no single change — asking which variants it means for ' + (gene || track.name) + '…');
                let c = null;
                try { c = await exec(server + '/py/bio/variant-from-prompt.py', em, text, JSON.stringify(ctx), '', 'cohort'); } catch (e) { c = null; }
                if (c && !c.error) r = c;
                else return { ok: false, why: firstWhy + (c && c.error ? ' Nor could its variants be enumerated: ' + c.error : '') };
            }
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
            // The LABELS, not just a count. A variant rejected by this transcript may be
            // sitting on the next one, and a count cannot tell the difference; the run-level
            // summary below needs names to work that out.
            let placed = 0, first = null;
            const placedLabels = [], refusedLabels = [];
            const labelOf = (e) => ('' + ((e && (e.label || e.hgvs_p || e.hgvs_c)) || '')).trim();
            for (const ed of edits) {
                const off = +ed.cds_offset;
                const ref = ('' + ed.ref).toUpperCase(), alt = ('' + ed.alt).toUpperCase();
                if (!(off >= 0 && off + ref.length <= entries.length)) { say('Edit falls outside the coding sequence.'); refusedLabels.push({ label: labelOf(ed), why: 'falls outside the coding sequence' }); continue; }
                // Re-check on the track itself: the coding bases at those CDS positions must be ref.
                const have = entries.slice(off, off + ref.length).map((e) => Strand.codingBaseAt(track, e.index, orient)).join('');
                if (have !== ref) { say('The track reads ' + have + ' where ' + ref + ' was expected; not placed.'); refusedLabels.push({ label: labelOf(ed), why: 'this transcript reads ' + have + ' where ' + ref + ' was expected' }); continue; }
                if ((ed.type === 'del' || ed.type === 'ins') && minus) {
                    say('Insertions and deletions are placed on plus-strand tracks only for now; ' + ed.label + ' was not placed.');
                    refusedLabels.push({ label: labelOf(ed), why: 'indels are placed on plus-strand tracks only for now' });
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
                // In a cohort every edit is a different variant, so the name has to come from
                // the edit; the single-variant path has only r.hgvs_p and falls back to it.
                const hp = ed.hgvs_p || r.hgvs_p, hc = ed.hgvs_c || r.hgvs_c;
                // One described change is named formally (p.Arg175His); a cohort is named the
                // short way (R175H), because a track carrying eight of them has to stay readable.
                const label = (gene ? gene + ' ' : '')
                    + (r.cohort ? (ed.label || hp || text) : (hp || ed.label || text));
                const snp = new SnpIndel(ed.type || 'snp', placeXi, refG, altG, 0, track.strand, label, null, '#d1342f');
                try {
                    snp.name = label;
                    snp.source = 'Described';
                    snp.structure = [hp, hc].filter(Boolean).join('  ');
                    snp.comment = ('' + text + (ed.why ? ' — ' + ed.why : (r.note ? ' — ' + r.note : ''))).trim();
                    // AN ANNOTATION RECORD, the same shape a loaded variant carries, so this
                    // one is not a second-class citizen on the track: the detail box, the
                    // ClinDN column, the variant finder and a saved-and-reopened file all read
                    // from it and would otherwise show nothing for a described change.
                    //
                    // Only what is actually known goes in. The disease is the context this
                    // change was named for, which is a real fact about why it is here. There is
                    // deliberately no CLNSIG: nobody has classified this variant's pathogenicity
                    // in this flow, and writing one would be inventing a clinical call.
                    const dn = ('' + (contextName || pinned || '')).trim();
                    const annots = [];
                    if (gene) annots.push('GENEINFO=' + gene);
                    if (dn) annots.push('CLNDN=' + dn);
                    if (hp) annots.push('HGVSP=' + hp);
                    if (hc) annots.push('HGVSC=' + hc);
                    if (ed.label) annots.push('LABEL=' + ed.label);
                    annots.push('CDSPOS=' + (off + 1));
                    if (track.transcriptID) annots.push('TRANSCRIPT=' + track.transcriptID);
                    if (ed.why) annots.push('WHY=' + ed.why);
                    // r.note is a per-run summary in a cohort ("2 variants named for this
                    // context"), which says nothing about THIS variant and reads as though it
                    // did. Keep it only where it is about the change itself.
                    if (r.note && !r.cohort) annots.push('NOTE=' + r.note);
                    if (r.numbering) annots.push('NUMBERING=' + r.numbering);
                    annots.push('SOURCE=Described from "' + text + '"');
                    snp.setAnnotation(annots);
                } catch (e) { }
                track.addsnpindel(snp);
                track.showSnpIndels = true;
                placed++; placedLabels.push(labelOf(ed)); if (!first) first = snp;
            }
            // What this transcript would not take: the ones the python could not verify against
            // its protein, plus the ones the track itself refused above. Worked out BEFORE the
            // bail-out below, because a transcript that took nothing is the one whose refusals
            // matter most -- and returning them only on the success path threw away the names
            // of every variant on a gene whose transcript rejected the lot.
            let refused = refusedLabels.slice();
            try {
                for (const rj of (JSON.parse(r.rejected || '[]') || [])) {
                    refused.push({ label: ('' + (rj.label || '')).trim(), why: ('' + (rj.why || '')).trim() });
                }
            } catch (e) { }
            if (!placed) {
                return {
                    ok: false, why: 'nothing could be placed on ' + (track.name || 'that track'),
                    placedLabels: [], refused: refused,
                };
            }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            // Show it: select the mutation and zoom to it, as the tours do.
            try { await exec('baja/manchester/menu/focus-mutation.js', graph, first, 10000); } catch (e) { }
            try {
                const tg = track.tgraph, w = 25;
                const cy = (tg.yi + (tg.yi + (tg.height || 0))) / 2, span = Math.abs(tg.height || 0) || 0.1;
                if (graph.zoomRect) graph.zoomRect(tg.X(first.xi - w), tg.X(first.xi + w), cy + span * 3.6, cy - span * 2.2, 400);
            } catch (e) { }
            return {
                ok: true, track: track.name || 'the track', snp: first, placed: placed,
                dropped: refused.length, placedLabels: placedLabels, refused: refused,
                cohort: !!r.cohort,
                label: r.cohort
                    ? (placed + ' variant' + (placed === 1 ? '' : 's') + ' of ' + (gene || track.name))
                    : ((r.hgvs_p || edits[0].label) + (r.hgvs_c ? ' (' + r.hgvs_c + ')' : '')),
                note: r.note || ''
            };
        };   // end placeOn

        // ---- run it over the chosen tracks --------------------------------------------------
        const results = [];
        for (const step of plan) {
            const t = step.track;
            let out = null;
            try { out = await placeOn(t, step.given); } catch (e) { out = { ok: false, why: (e && e.message) ? e.message : ('' + e) }; }
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
            // A SAMPLE MUST SAY THAT IT IS ONE. Nine mutations placed for "heart disease" read
            // as the nine that cause it unless the sentence says otherwise.
            + (isSample ? '. This is a SAMPLE across the major subtypes of ' + contextName
                + ', not the full set' + (contextNote ? ' — ' + contextNote : '') : '')
            // A VARIANT IS ONLY DROPPED IF IT LANDED NOWHERE.
            //
            // This used to sum the per-track rejections, which counts the same variant once per
            // transcript that refused it -- and the transcripts here were chosen FOR these
            // variants, several isoforms of one gene. A change that verifies against the
            // canonical transcript and not against a shorter isoform is not a dropped variant;
            // it is on the board, on the transcript it belongs to. The old count called it lost
            // and told the reader to trust the rest less.
            //
            // So: everything placed anywhere is subtracted first, and what remains is named
            // rather than counted. A change that was named for this condition and could not be
            // put anywhere is a thing the reader has to be able to look up -- a bare number
            // tells them something is missing without telling them what.
            + ((() => {
                const placedAnywhere = new Set();
                for (const g of results) for (const l of (g.placedLabels || [])) if (l) placedAnywhere.add(l);
                const lost = new Map();
                for (const g of results) {
                    for (const rj of (g.refused || [])) {
                        const l = ('' + (rj.label || '')).trim();
                        if (!l || placedAnywhere.has(l)) continue;   // it is on another transcript
                        if (!lost.has(l)) lost.set(l, ('' + (rj.why || '')).trim());
                    }
                }
                if (!lost.size) return '';
                const names = Array.from(lost.keys());
                const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ', and ' + (names.length - 4) + ' more' : '');
                const why = lost.get(names[0]);
                return '. ' + names.length + ' named change' + (names.length === 1 ? ' was' : 's were')
                    + ' not placed on any transcript loaded: ' + shown
                    + (why ? ' (' + why + ')' : '');
            })())
            + (failed.length ? ' (' + failed.length + ' track' + (failed.length === 1 ? '' : 's') + ' skipped: ' + failed.map((x) => x.why).filter(Boolean).join('; ') + ')' : '')
            + '. ';
        try { graph.setResultMessage(msg); } catch (e) { say(msg); }
        restoreHover();
        return true;
    };
    return run(null);
}
