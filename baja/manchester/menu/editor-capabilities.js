function (graph, genegraph_panel_layout) {

    // WHAT THE EDITOR CAN BE ASKED TO DO, DECLARED.
    //   const CAP = await exec('baja/manchester/menu/editor-capabilities.js', graph, layout);
    //   CAP.list        -> the catalogue, as plain JSON, for a model to choose from
    //   CAP.byName(n)   -> one entry, or null
    //   CAP.validate(step) -> { ok, capability, args, problem }
    //   CAP.preview(step)  -> one line saying what that step would actually do here
    //
    // This is the vocabulary the Ask box translates into, and the reason it is a HAND-WRITTEN
    // CATALOGUE rather than a reflection over the modules on disk. Every file under baja/ is
    // exec-able by path with arbitrary arguments; a model that could name a path and its
    // arguments would be a remote shell on someone's unsaved work, and no amount of checking
    // the sentence that produced it would change that. So the set of reachable operations is
    // enumerated here, each with the arguments it takes and the values those arguments may
    // hold, and anything outside this file is not reachable from the box at all.
    //
    // Each entry carries:
    //   name        the identifier a model returns
    //   summary     what it does, in the words someone would use asking for it
    //   params      { <arg>: { type, values?, required?, default?, about } }
    //               type is one of: enum, enum[], string, string[], number, boolean
    //   needs       what must be on the canvas: 'track' | 'selection' | 'variants' | 'compounds'
    //   destructive true when it deletes work. These never run without their own click.
    //   opens       true when it opens a dialog rather than finishing by itself, so the
    //               preview can say so instead of implying the work is done
    //   run         (args) => the actual call. Arguments arrive already validated.
    //
    // ARGUMENTS ARE VALIDATED AGAINST params, NOT TRUSTED. validate() drops unknown keys,
    // checks every enum against its own list, coerces numbers, and refuses a step whose
    // required argument is missing rather than substituting a plausible one. The same specs
    // are sent to the model, so the thing it is told it may say and the thing that is
    // enforced here cannot drift apart.

    return (async () => {
        const server = () => { try { return window['env']['apiUrl']; } catch (e) { return ''; } };
        // ONE DESCRIPTION OF WHICH LAYERS A REQUEST MEANS, loaded once so the card that
        // previews a removal and the removal itself cannot answer differently. Previews are
        // synchronous, which is why it is awaited here rather than where it is used.
        let LM = null;
        try { LM = await exec('baja/bio/layer-match.js'); } catch (e) { LM = null; }

        // THE GENE A TRACK IS OF. A track is named for its gene and then for what was made
        // from it -- SPAG9, SPAG9_mRNA, SPAG9_mRNA_copy, MAPK8IP3** -- and Ensembl wants the
        // symbol alone. The suffixes this strips are the ones the editor itself adds; a name
        // it does not recognise is passed through untouched rather than guessed at, since a
        // wrong symbol looks up somebody else's gene and says nothing about this track.
        const geneOfTrack = (t) => {
            let n = ('' + ((t && t.name) || '')).trim();
            if (!n) return '';
            n = n.replace(/\*+$/, '');
            n = n.replace(/[_\-\s]*(copy|pathogenic)\d*$/i, '');
            n = n.replace(/[_\-\s]*(mrna|pre_?mrna|cds|exons?|transcript|protein|gene)$/i, '');
            // NOT a trailing number: the digits in SPAG9, MAPK8IP3 and NDUFA4 are part of
            // the symbol, and stripping them asked Ensembl about a gene called SPAG.
            // A copy's number is already gone with the word "copy" above it.
            return n.trim();
        };
        // THE TRACK THE MAP STARTS FROM, and where its exons fall in PROTEIN residues.
        //
        // The map is a protein map: Ensembl's homology alignments are protein alignments,
        // so a column is a residue and not a base. That is worth saying on the picture
        // rather than leaving someone to work out why a 6 kb transcript is 1,321 columns
        // wide. The exon boundaries still belong on it, because the question that follows
        // "where is this conserved" is almost always "which exon is that".
        //
        // RESIDUE k IS CODON k, so an exon that covers a run of codons covers a run of
        // residues. The walk is the one the editor draws the ORF from, so a boundary lands
        // where the user can see it rather than on an index into a string.
        const sourceOf = (t) => {
            if (!t) return null;
            const out = { track: '' + (t.name || 'the track') };
            try { if (t.transcriptID) out.transcript = '' + t.transcriptID; } catch (e) { }
            const pos = [], seen = {};
            try {
                const cdsi = (t.orf && Array.isArray(t.orf.cdsi)) ? t.orf.cdsi : [];
                for (const c of cdsi) {
                    if (!c || c.ci !== 0 || seen[c.codon_index]) continue;
                    const aa = '' + (c.aa || '');
                    if (!aa || /^stop$/i.test(aa)) break;
                    seen[c.codon_index] = 1;
                    pos.push(+c.index);
                }
            } catch (e) { }
            out.residues = pos.length || undefined;
            if (!pos.length) return out;

            let exons = [];
            try {
                const R = regionsNow(t);
                exons = (R && R.exons) ? (R.exons() || []) : [];
            } catch (e) { exons = []; }
            if (!exons.length) return out;

            // Which exon each codon sits in, then the runs of residues per exon. A codon
            // that straddles a junction belongs to the exon its FIRST base is in, which is
            // the one a reader would point at.
            const spans = exons.map((e, i) => ({
                n: i + 1, lo: Math.min(+e.xi, +e.xf), hi: Math.max(+e.xi, +e.xf)
            }));
            const runs = [];
            for (let r = 0; r < pos.length; r++) {
                const x = pos[r];
                let which = 0;
                for (const sp of spans) { if (x >= sp.lo && x <= sp.hi) { which = sp.n; break; } }
                if (!which) continue;
                const last = runs[runs.length - 1];
                if (last && last.n === which && last.end === r) last.end = r + 1;
                else runs.push({ n: which, start: r, end: r + 1 });
            }
            // 1-based and inclusive, to match everything else the map prints.
            out.exons = runs.map((x) => ({ n: x.n, start: x.start + 1, end: x.end }));

            // THE VARIANTS ON THE TRACK, CARRIED ONTO THE PROTEIN. A missense variant is a
            // statement about a residue, and the conservation map is drawn in residues, so
            // the two belong on the same picture: a variant that lands in a column where
            // every species agrees is a different proposition from one in a column where
            // none of them do, and that comparison is the whole reason to look.
            //
            // Only missense. A synonymous change alters no residue, a nonsense one ends
            // the protein rather than changing a residue in it, and an indel shifts
            // everything after it; drawing any of those as a point on a residue would say
            // something untrue about that residue. They are counted and named in the note
            // rather than dropped in silence.
            const AA = {
                TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L', CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
                ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M', GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
                TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S', CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
                ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T', GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
                TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*', CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
                AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K', GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
                TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W', CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
                AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R', GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G'
            };
            try {
                const vs = (t.snpindels || []).filter(Boolean);
                const cdsi = (t.orf && Array.isArray(t.orf.cdsi)) ? t.orf.cdsi : [];
                const byIndex = {};
                for (const c of cdsi) { if (c) byIndex[Math.round(+c.index)] = c; }
                const hits = [], skipped = { synonymous: 0, nonsense: 0, outside: 0, indel: 0 };
                for (const v of vs) {
                    const ref = ('' + (v.reference || v.ref || '')).toUpperCase();
                    const alt = ('' + (v.alternate || v.alt || '')).toUpperCase();
                    if (ref.length !== 1 || alt.length !== 1) { skipped.indel++; continue; }
                    const c = byIndex[Math.round(+v.xi)];
                    if (!c) { skipped.outside++; continue; }
                    const ci = +c.ci, codon = ('' + (c.codon || '')).toUpperCase();
                    if (codon.length !== 3 || !(ci >= 0 && ci <= 2)) { skipped.outside++; continue; }
                    const wt = AA[codon], mu = AA[codon.slice(0, ci) + alt + codon.slice(ci + 1)];
                    if (!wt || !mu) { skipped.outside++; continue; }
                    if (wt === mu) { skipped.synonymous++; continue; }
                    if (mu === '*') { skipped.nonsense++; continue; }
                    hits.push({ residue: (+c.codon_index || 0) + 1, from: wt, to: mu,
                        label: wt + ((+c.codon_index || 0) + 1) + mu,
                        id: '' + (v.id || '') });
                }
                hits.sort((x, y) => x.residue - y.residue);
                if (hits.length) out.variants = hits;
                out.variants_skipped = skipped;
            } catch (e) { }
            return out;
        };

        // LOOKED UP ONCE PER GENE. The homology call takes the better part of a minute
        // because Ensembl aligns each species when it is asked, and the map and the track
        // trace want the same answer. Asking twice for the same gene is a minute of
        // someone's time for nothing, so the last answer is kept and handed back.
        const conservationFor = async (sym, species, kind, w) => {
            try {
                const c = window.__bajaConservationCache;
                if (c && c.gene === sym && c.species === species && c.kind === kind && c.data) {
                    try { if (w) w.step('Using the alignments already fetched for ' + sym + ' \u2026'); } catch (e) { }
                    return c.data;
                }
            } catch (e) { }
            let r = null;
            try {
                r = await exec('py/bio/homolog-conservation.py', sym, species, kind,
                    JSON.stringify({ max_species: 12 }));
            } catch (e) { r = { status: 'ERROR', error: ('' + (e && e.message ? e.message : e)) }; }
            if (r && r.status === 'OK' && (r.species_rows || []).length) {
                try {
                    window.__bajaConservationCache = { gene: sym, species: species, kind: kind, data: r };
                } catch (e) { }
            }
            return r;
        };

        const paralogGene = (a) => {
            const said = ('' + ((a && a.gene) || '')).trim();
            // A PARAMETER'S DEFAULT ARRIVES AS ITS OWN PROSE. An optional param left unset
            // comes through as the sentence describing the default -- "taken from the
            // track's own name" -- and taking that as a symbol asked Ensembl for a gene by
            // that name. A symbol has no spaces, which is the cheap and reliable test.
            if (said && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(said)) return said;
            const t = (a && a.track) ? matchTrack(a.track) : (oneSelTrack() || oneTrack());
            return t ? geneOfTrack(t) : '';
        };

        // WHICH TRACKS A REMOVAL ACTS ON: the one named, else the one that is selected or
        // the only one open, else EVERY open track that actually carries a matching layer.
        // Refusing with "say which track" when the editor can see exactly which tracks have
        // one is work handed back to the user for nothing.
        const removalTracks = (a) => {
            const m = '' + ((a && a.match) || '');
            if (a && a.track) { const t = matchTrack(a.track); return t ? [t] : []; }
            const one = oneTrack();
            if (one) return [one];
            if (!LM) return [];
            return tracks().filter((t) => Array.isArray(t.track_layers)
                && t.track_layers.length && LM.match(t.track_layers, m).length);
        };
        const tracks = () => (graph.track || []).filter(Boolean);
        const hasSel = (t) => {
            try { return t && t.markstart != null && t.markend != null && t.markend > t.markstart && t.markstart >= 0; }
            catch (e) { return false; }
        };
        const selTracks = () => tracks().filter(hasSel);
        const rangeOf = (t) => ({ start: Math.floor(t.markstart), end: Math.ceil(t.markend) });
        // The track a single-track operation runs on: the one carrying a selection, else the
        // one the user last selected, else the only one there is. Null when that is genuinely
        // ambiguous, which the preview then says rather than picking for them.
        const oneTrack = () => {
            const s = selTracks();
            if (s.length === 1) return s[0];
            if (s.length > 1) return null;
            if (graph.selectedTrack && tracks().indexOf(graph.selectedTrack) >= 0) return graph.selectedTrack;
            const all = tracks();
            return (all.length === 1) ? all[0] : null;
        };
        // THE TRACKS AN OPERATION ACROSS TRACKS ACTS ON. Named in the request, else the
        // selected ones, else every open track when there are exactly two -- which is the
        // case where "both tracks" can only mean one thing.
        // THE mRNA TRACKS, WITHOUT BEING NAMED ONE BY ONE. "the mRNA tracks" is how someone
        // refers to a group they can see, and naming five of them in a request is work the
        // editor should be doing. A track counts when it SAYS it is one -- a name ending in
        // _mRNA, or mRNA in the name -- or when it HAS NO INTRONS, which is what an mRNA is:
        // a spliced transcript. Either alone is enough, because a built transcript may carry
        // neither a tidy name nor annotations, and a name is evidence the user supplied
        // themselves.
        const mrnaTracks = () => {
            const out = [];
            for (const t of tracks()) {
                if (!t) continue;
                const nm = '' + (t.name || '');
                if (/(^|[_\-\s])m[\-_]?rna\b/i.test(nm) || /_mrna$/i.test(nm)) { out.push(t); continue; }
                const R = regionsNow(t);
                // Only when the regions are known: a track whose introns have not been
                // worked out is left out rather than guessed in, since including the wrong
                // track silently changes the answer.
                if (R && typeof R.introns === 'number' && R.introns === 0 && R.exons > 0) out.push(t);
            }
            return out;
        };
        const comparands = (a) => {
            const which = ('' + ((a && a.which) || '')).trim().toLowerCase();
            // "on all tracks" said outright, which is worth having as a value rather than
            // leaving to the fallback: it makes the request's own words visible on the card.
            if (which === 'all' || which === 'all_tracks') return tracks().slice();
            if (which === 'mrna' || which === 'mrna_tracks') {
                const m = mrnaTracks();
                if (m.length >= 2) return m;
                return m;        // one or none: the blocker says so rather than silently widening
            }
            const named = ('' + ((a && a.tracks) || '')).split(',').map((x) => x.trim()).filter(Boolean);
            if (named.length) {
                const out = [];
                for (const n of named) { const t = matchTrack(n); if (t && out.indexOf(t) < 0) out.push(t); }
                if (out.length >= 2) return out;
            }
            const sel = selTracks();
            if (sel.length >= 2) return sel;
            const all = tracks();
            if (all.length === 2) return all.slice();
            try { if (graph.selectedTracks && graph.selectedTracks.length >= 2) return graph.selectedTracks.slice(); } catch (e) { }
            // THREE OPEN TRACKS ARE NOT FEWER THAN TWO. This ended here, so "compare exon 6
            // on all tracks" with three open was refused for having no tracks to compare --
            // every one of them was sitting on screen. Two open was handled and more than
            // two was not, which is a rule nobody could have guessed from the outside.
            //
            // Widening is only silent if nobody is told: the card previews the comparison by
            // name ("compare exon 6 of DNM1, DNM3 and DNM3-208") before there is anything to
            // press, so what it will do is on screen, and a request that meant two of them
            // can say which two.
            if (all.length >= 2) return all.slice();
            return all.length === 1 ? all.slice() : [];
        };
        const oneSelTrack = () => {
            const s = selTracks();
            return (s.length === 1) ? s[0] : null;
        };

        // One track from a name the user typed. Exact first, then a unique prefix, then a
        // unique substring: "DNM3" should find DNM3-201 without also claiming DNM3OS-201,
        // and two matches is not a match, because framing the wrong track looks like the
        // editor ignoring the request.
        const matchTrack = (name) => {
            const want = ('' + (name || '')).trim().toLowerCase();
            if (!want) return null;
            const all = tracks();
            const nm = (t) => ('' + (t.name || '')).toLowerCase();
            const exact = all.filter((t) => nm(t) === want);
            if (exact.length === 1) return exact[0];
            const pre = all.filter((t) => nm(t).indexOf(want) === 0);
            if (pre.length === 1) return pre[0];
            const sub = all.filter((t) => nm(t).indexOf(want) >= 0);
            return (sub.length === 1) ? sub[0] : null;
        };

        // The named regions of a transcript (UTRs, CDS, exons, introns), cached per track
        // because resolving them walks the annotation list.
        const __regions = new Map();
        const regionsOf = async (t) => {
            if (!t) return null;
            if (__regions.has(t)) return __regions.get(t);
            let R = null;
            try { R = await exec('baja/bio/track-regions.js', t); } catch (e) { R = null; }
            __regions.set(t, R);
            return R;
        };
        // Resolved synchronously once the module has been loaded for that track, so preview()
        // and argBlocker() can use it without becoming async.
        const regionsNow = (t) => (t ? (__regions.get(t) || null) : null);

        // ONE GO PER TRACK, NOT A REFUSAL. An operation that runs on one track and was given
        // no track name used to stop at "more than one track is open: name the one you mean".
        // Now it can offer the tracks it actually fits instead: choices(a) returns one entry per
        // such track, each carrying the track OBJECT in __track (two tracks can share a name),
        // and the Ask card shows a Go button for each. __track never comes from the model --
        // validate() drops any key that is not a declared parameter -- only from a choice.
        const pickTrack = (a) => (a && a.__track) || (a && a.track ? matchTrack(a.track) : oneTrack());
        // The track a MODEL runs on: the one chosen or named, else the selected one, else the
        // only one open. Same rule as pickTrack with the selection preferred, which is what a
        // model wants -- you select a transcript and run a model on it.
        const pickModelTrack = (a) => (a && a.__track)
            || (a && a.track ? matchTrack(a.track) : (oneSelTrack() || oneTrack()));
        // THE SHELF OF MODELS, as the answer when one of them cannot be placed. A request
        // that named a model and could not be run is still a request for that model: the
        // shelf lists every model with the track to run it on, which is a way forward where
        // "say which track" is a dead end with a Cancel button.
        const openModelShelf = () => {
            try { graph.showSideMenu(null); } catch (e) { }
            return exec('baja/ml/models-library.js', graph, genegraph_panel_layout, scopeTracks());
        };
        const MODEL_SHELF = { label: 'Open the models', run: () => openModelShelf() };

        // AN UNSET OPTIONAL PARAM ARRIVES AS THE PROSE OF ITS DEFAULT, not as the value: a
        // tour with no time given hands this the whole sentence the default was written in.
        // So both of these read what they need out of whatever they are given and fall back
        // to the sensible thing, rather than trusting the argument to be a number or a word.
        // A plain "intron" wins; anything naming BOTH is the default's own prose describing
        // the choice ('what to step through: "exons" or "introns"'), which is not a choice.
        const tourKind = (a) => {
            const v = ('' + ((a && a.region) || '')).toLowerCase();
            return (/intron/.test(v) && !/exon/.test(v)) ? 'intron' : 'exon';
        };
        const tourSeconds = (a) => {
            const m = ('' + ((a && a.seconds) != null ? a.seconds : '')).match(/\d+(?:\.\d+)?/);
            const n = m ? parseFloat(m[0]) : NaN;
            // A tour that flickers past is not a tour, and one that holds for a minute an
            // exon is a hang with a progress bar.
            return (isFinite(n) && n > 0) ? Math.min(60, Math.max(0.2, n)) : 3;
        };
        // The track a compound operation runs on: the one named or chosen, else the selected
        // one IF it carries compounds, else the first that does. A report on -- or a screen of
        // -- an empty track is not what was asked for, even when that track is the selected one.
        // ALREADY SCREENED -- AND THAT DEPENDS ON WHICH SCREEN. A full-strand run records
        // offtarget / _offtarget; a SEED run records mi_targets_transient_. Counting the
        // full-strand field for a seed screen calls every compound unscreened and offers to
        // rerun all of them, so the predicate follows the method. The two run tools apply the
        // same split when they filter, so the count here and the work there agree.
        const otScreened = (o, method) => (method === 'seed')
            ? !!(o && o.mi_targets_transient_ != null)
            : !!(o && (o.offtargetsRun || o.offtarget != null || o._offtarget != null));
        // WHICH COMPOUNDS THE REPORT COVERS. The selection when there is one, across the
        // canvas, because a selection is rarely confined to one track; otherwise the track's
        // own compounds. compound-editor.js offers the same two, so the box and the menu
        // report on the same sets.
        const reportSet = (a) => {
            const want = (a && a.scope) || '';
            const sel = Array.from(selectedCompoundSet());
            if (want === 'selected' || (!want && sel.length)) {
                return { list: sel, where: ' (the selection)' };
            }
            const t = compoundTrack(a);
            const list = t ? (t.oligos || []).filter(Boolean) : [];
            return { list: list, where: t ? (' on ' + (t.name || 'the track')) : '' };
        };

        const screenPool = (a) => {
            const t = compoundTrack(a);
            if (!t) return { t: null, list: [] };
            let list = (t.oligos || []).filter(Boolean);
            const sc = (a && a.scope) || 'all';
            const method = (a && a.method) || 'full';
            if (sc === 'selected') list = list.filter((o) => o.selected || o.highlight__);
            else if (sc === 'unscreened') list = list.filter((o) => !otScreened(o, method));
            return { t: t, list: list };
        };

        const compoundTrack = (a) => (a && a.__track)
            || (a && a.track ? matchTrack(a.track) : null)
            || ((oneTrack() && (oneTrack().oligos || []).length) ? oneTrack() : null)
            || tracks().find((x) => (x.oligos || []).length) || null;
        const choicesOver = (a, fits) => {
            if (!a || a.__track || a.track) return [];
            return tracks().map((t) => {
                let r = null;
                try { r = fits(t); } catch (e) { r = null; }
                return (r && !r.error) ? { track: t, label: (t.name || '(unnamed track)'), detail: r.detail || '',
                    args: Object.assign({}, a, { __track: t }) } : null;
            }).filter(Boolean);
        };

        // FRAME ONE BASE CLOSE ENOUGH TO READ THE SEQUENCE. The track draws its letters only
        // above ~30 screen px per base (screencell in track-flexi.js), so the window is sized
        // from the canvas width to land well above that, centred on the base, with the track
        // about 100 px tall. Same arithmetic as load-clinical-compound.js, which was tuned on
        // the real canvas. zoomRect() returns immediately while another animation runs, so wait
        // for the graph to go idle first.
        const frameBase = (t, pos) => frameRange(t, pos, pos + 1);
        // A stretch [lo, hi): shown whole, but never wider than it has to be -- anything shorter
        // than a screenful of readable bases is framed at letter resolution, centred.
        const frameRange = async (t, lo, hi) => {
            const g = t && t.tgraph;
            if (!g || typeof g.X !== 'function' || !graph.zoomRect) return;
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            for (let i = 0; graph.animating && i < 60; i++) await sleep(60);
            let cw = 1200, ch = 800;
            try { cw = (graph.canvas && graph.canvas.width) || cw; ch = (graph.canvas && graph.canvas.height) || ch; } catch (e) { }
            const PX_PER_BASE = 44;
            const L = Math.max(1, Math.abs(hi - lo));
            const half = Math.max(Math.max(6, Math.floor(cw / PX_PER_BASE)), L * 1.15) / 2;
            const mid = (Math.min(lo, hi) + Math.max(lo, hi)) / 2;
            const x0 = g.X(mid - half), x1 = g.X(mid + half);
            let ymin, ymax;
            try {
                const top = g.Y(typeof g.getymax === 'function' ? g.getymax() : (g.yi + (g.height || 0)));
                const bot = g.Y(typeof g.getymin === 'function' ? g.getymin() : g.yi);
                if (isFinite(top) && isFinite(bot) && Math.abs(top - bot) > 0) {
                    const cy = (top + bot) / 2;
                    const ySpan = Math.max(1.0001, Math.abs(top - bot) * (ch / 100));
                    ymin = cy - ySpan / 2; ymax = cy + ySpan / 2;
                }
            } catch (e) { }
            if (ymin == null) { const yb = g.yi + (g.height || 0); ymin = yb - 0.51; ymax = yb + 0.51; }
            if (isFinite(x0) && isFinite(x1)) await graph.zoomRect(Math.min(x0, x1), Math.max(x0, x1), ymin, ymax, 400);
        };

        // Resolved up front for every open track. preview() and argBlocker() are synchronous
        // -- they run while a plan is being drawn -- so a cache filled only by run() would
        // mean the first plan never checks the region and "exon 14 of 11" is discovered after
        // the button rather than before it.
        for (const t of tracks()) { try { await regionsOf(t); } catch (e) { } }

        // The tracks a shelf should load onto: the ones carrying a selection when any do,
        // otherwise every open track. A shelf opened with no tracks asks the user to click
        // one, which is the right behaviour and not worth pre-empting.
        const scopeTracks = () => (selTracks().length ? selTracks() : tracks());

        // WHAT THE USER MEANS BY "SELECTED" -- and there are two stores, which is why this
        // exists rather than reading one of them.
        //
        //   graph.__lassoSelection   what the selection window holds, and what the toolbar's
        //                            Selection badge counts: a lasso, a shift-click, a pick
        //                            off a track. Entries are {kind, ref, track}.
        //   graph.selectedCompounds  what setSelectedCompounds holds, which is what the
        //                            compound filters here write to.
        //
        // The two are separate in the editor and neither is wrong, so a request to act on
        // "the selected compounds" takes the union: whatever the person is looking at as
        // selected, by either route, is what they mean.
        const lassoOf = (kind) => (graph.__lassoSelection || []).filter((s) => s && s.kind === kind && s.ref);
        const selectedCompoundSet = () => {
            const out = new Set();
            for (const s of lassoOf('oligo')) out.add(s.ref);
            for (const s of (graph.selectedCompounds || [])) { if (s && s.o) out.add(s.o); }
            return out;
        };
        const SEL_KINDS = {
            compounds: { kind: 'oligo', noun: 'compound', arr: 'oligos' },
            variants: { kind: 'snp', noun: 'variant', arr: 'snpindels' },
            annotations: { kind: 'ann', noun: 'annotation', arr: 'annotations' },
            primers: { kind: 'amplicon', noun: 'primer or probe', arr: null }
        };
        const selCountOf = (what) => {
            if (what === 'compounds') return selectedCompoundSet().size;
            const k = SEL_KINDS[what];
            return k ? lassoOf(k.kind).length : 0;
        };

        const LAYER_SETS = await (async () => { try { return await exec('baja/data/layer-sets.js'); } catch (e) { return {}; } })();
        const LAYER_KEYS = Object.keys(LAYER_SETS || {});

        // The two engines the selection verbs are built on, loaded once.
        const VS = await exec('baja/data/variant-search.js', graph, { engineOnly: true });
        const F = await exec('baja/bio/compound-filter.js');
        // Named places on the canvas, saved in localStorage. Created once; list() re-reads the
        // store on every call, so preview() and choices() see bookmarks made since.
        const BM = await exec('baja/lib/bookmarks.js', graph, genegraph_panel_layout);

        const vrows = () => {
            const out = [];
            for (const t of tracks()) for (const v of (t.snpindels || [])) out.push({ t: t, v: v, rec: VS.recordOf(v) });
            return out;
        };
        const crows = () => {
            const out = [];
            for (const t of tracks()) for (const o of (t.oligos || [])) out.push({ t: t, o: o });
            return out;
        };
        // EVERY OBJECT ON THE CANVAS AS ONE LIST of { kind, track, lo, hi, label, detail, hay, ref }
        // for zoom_to_objects. Variants are searched through VS.recordOf, the same record the
        // variant search reads, so "pathogenic" finds them by clinical significance rather
        // than only by name. Every word of the query must appear somewhere in hay.
        const objectHits = (a) => {
            const words = ('' + ((a && a.query) || '')).toLowerCase().split(/\s+/).filter(Boolean);
            if (!words.length) return [];
            const kind = (a && a.kind) || 'any';
            const want = (k) => kind === 'any' || kind === k;
            const num = (x) => (Number.isFinite(+x) ? +x : null);
            // Collected first, matched after: WHOLE WORDS when that finds anything, so
            // "pathogenic" is not also "conflicting interpretations of pathogenicity";
            // substrings only when whole words find nothing, so "patho" still works.
            const all = [];
            const add = (o) => { if (o.lo != null && o.hi != null) all.push(o); };
            for (const t of tracks()) {
                const tn = t.name || 'track';
                if (want('tracks')) add({ kind: 'track', track: t, lo: num(t.xi), hi: num(t.xf), label: tn,
                    detail: 'the whole track', hay: [tn, t.geneID, t.description, t.track_type].filter(Boolean).join(' ') });
                if (want('variants')) for (const v of (t.snpindels || [])) {
                    if (!v) continue;
                    let rec = null; try { rec = VS.recordOf(v); } catch (e) { rec = null; }
                    const x = num(v.xi); if (x == null) continue;
                    const len = Math.max(1, ('' + (v.reference || '')).length);
                    const sig = rec && rec.clinsig ? rec.clinsig.replace(/_/g, ' ') : '';
                    add({ kind: 'variant', ref: v, track: t, lo: x, hi: x + len,
                        label: 'Variant ' + ((rec && rec.name) || v.name || v.id || ((v.reference || '') + '>' + (v.alternate || ''))),
                        detail: [tn, rec && rec.change, sig, rec && rec.condition].filter(Boolean).join(' \u00b7 '),
                        hay: ['variant snp', rec ? rec.all : (v.name || ''), tn].join(' ') });
                }
                if (want('compounds')) for (const o of (t.oligos || [])) {
                    if (!o) continue;
                    add({ kind: 'compound', ref: o, track: t, lo: num(o.xi), hi: num(o.xf != null ? o.xf : o.xi),
                        label: (o.type ? ('' + o.type).toUpperCase() + ' ' : 'Compound ') + (o.name || o.id || ''),
                        detail: tn + (o.synthesisSequence ? ' \u00b7 ' + o.synthesisSequence : ''),
                        hay: ['compound oligo', o.name, o.id, o.type, o.synthesisSequence, tn].filter(Boolean).join(' ') });
                }
                if (want('annotations')) for (const n of (t.annotations || [])) {
                    if (!n) continue;
                    const lo = num(Math.min(n.xi, n.xf != null ? n.xf : n.xi)), hi = num(Math.max(n.xi, n.xf != null ? n.xf : n.xi));
                    add({ kind: 'annotation', ref: n, track: t, lo: lo, hi: hi,
                        label: (n.type ? n.type + ' ' : '') + (n.name || ''),
                        detail: tn + (n.description ? ' \u00b7 ' + n.description : ''),
                        hay: ['annotation', n.name, n.type, n.description, tn].filter(Boolean).join(' ') });
                }
            }
            const toks = (o) => o.__toks || (o.__toks = new Set(o.hay.toLowerCase().split(/[^a-z0-9.*>+-]+/).filter(Boolean)));
            let out = all.filter((o) => words.every((w) => toks(o).has(w)));
            if (!out.length) out = all.filter((o) => { const h = o.hay.toLowerCase(); return words.every((w) => h.indexOf(w) >= 0); });
            return out;
        };
        const selectVariants = (rows) => {
            const all = vrows();
            for (const r of all) { try { r.v.deselect(); } catch (e) { } }
            for (const r of (rows || [])) { try { r.v.select(); } catch (e) { } }
            try { if (graph.wake) graph.wake(); } catch (e) { }
        };
        const vhits = (query) => {
            const all = vrows();
            const q = VS.compileQuery(query);
            return q ? all.filter((r) => q(r.rec)) : all;     // no terms means all of them
        };
        const chits = (spec) => F.match(crows(), spec || {});
        // An off-target filter cannot judge a compound the screen was never run on, so it
        // leaves those out of BOTH sides of the answer. Said here, because "0 matches" and
        // "0 matches, and 38 of the 52 have never been screened" look identical on screen
        // and mean completely different things.
        const USES_OFFTARGET = ['offtarget_min', 'offtarget_max', 'offtarget_genes_min', 'offtarget_genes_max'];
        const offtargetNote = (a) => {
            if (!USES_OFFTARGET.some((k) => a && a[k] != null)) return '';
            const n = F.unscreened(crows());
            return n ? (' (' + n + ' never screened, so not counted either way)') : '';
        };
        const result = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };

        // Significance words as ClinVar writes them, which is what load-variants.js matches
        // against. "likely_pathogenic" is deliberately absent: ClinVar's own string for it
        // CONTAINS "pathogenic", so `any: ['pathogenic']` already covers both, and offering
        // the narrower word would imply a distinction this filter cannot make.
        const CLINSIG = ['pathogenic', 'benign', 'uncertain', 'conflicting'];

        const LIST = [
            // ---------------------------------------------------------------- loading ------
            {
                name: 'load_variants',
                summary: 'Fetch variants from a variant database (ClinVar, dbSNP, gnomAD or COSMIC) '
                    + 'and put them on the track. Runs over the selected sequence on each track '
                    + 'that has one, and over the whole track where there is no selection. '
                    + 'Filters narrow what actually lands: variant class, ClinVar significance, '
                    + 'and disease name.',
                needs: 'track',
                params: {
                    db: {
                        type: 'enum', values: ['clinvar', 'dbsnp', 'gnomad', 'cosmic'], required: true,
                        about: 'which database. clinvar for clinical significance, dbsnp for reference '
                            + 'rsIDs, gnomad for population frequency, cosmic for somatic cancer mutations'
                    },
                    types: {
                        type: 'enum[]', values: ['snp', 'ins', 'del'],
                        about: 'variant classes to keep. snp is a single-base substitution; ins and del '
                            + 'are the indels. Omit for every class. "snps and indels" is all three'
                    },
                    clinsig_any: {
                        type: 'enum[]', values: CLINSIG,
                        about: 'keep only variants whose ClinVar significance contains one of these. '
                            + 'ClinVar only; the other databases carry no clinical assertion'
                    },
                    clinsig_not: {
                        type: 'enum[]', values: CLINSIG,
                        about: 'and exclude any containing one of these. For "pathogenic" use '
                            + 'clinsig_any ["pathogenic"] with clinsig_not ["conflicting"], because '
                            + "ClinVar's conflicting-interpretation string contains the word pathogenic"
                    },
                    conditions: {
                        type: 'string[]',
                        about: 'keep only variants filed against a disease whose name matches one of '
                            + 'these, e.g. ["Rett syndrome"]. ClinVar only'
                    }
                },
                run: (a) => {
                    const f = {};
                    if (a.types && a.types.length) f.types = a.types;
                    if ((a.clinsig_any && a.clinsig_any.length) || (a.clinsig_not && a.clinsig_not.length)) {
                        f.clinsig = {};
                        if (a.clinsig_any && a.clinsig_any.length) f.clinsig.any = a.clinsig_any;
                        if (a.clinsig_not && a.clinsig_not.length) f.clinsig.not = a.clinsig_not;
                    }
                    if (a.conditions && a.conditions.length) f.conditions = a.conditions;
                    const bits = [];
                    if (f.types) bits.push(f.types.join('/'));
                    if (f.clinsig && f.clinsig.any) bits.push(f.clinsig.any.join('/'));
                    if (f.conditions) bits.push(f.conditions.join(', '));
                    if (bits.length) f.label = bits.join(' ');
                    const DBL = { clinvar: 'ClinVar', dbsnp: 'dbSNP', gnomad: 'gnomAD', cosmic: 'COSMIC' };
                    // The tracks with a selection when there are any, else every track: the
                    // same scope the Data menu uses, and load-variants honors each track's own
                    // selected range within it.
                    const list = selTracks().length ? selTracks() : tracks();
                    return exec('baja/data/load-variants.js', server(), graph, genegraph_panel_layout,
                        a.db, DBL[a.db] || a.db, true, list, Object.keys(f).length ? f : null);
                },
                preview: (a) => {
                    const list = selTracks().length ? selTracks() : tracks();
                    const where = selTracks().length
                        ? ('the selected sequence on ' + list.map((t) => t.name || 'a track').join(', '))
                        : ('the whole of ' + list.map((t) => t.name || 'a track').join(', '));
                    return 'load ' + (a.db || '?') + ' variants over ' + where;
                }
            },
            {
                name: 'load_layer_set',
                summary: 'Put a prepared interval layer on the track: published miRNA target sites, '
                    + 'known ASO and siRNA sequences, or oligo patent claim sets. Covers the whole '
                    + 'transcript, not just the selection.',
                needs: 'track',
                params: {
                    set: {
                        type: 'enum', values: LAYER_KEYS, required: true,
                        about: 'which prepared set: ' + LAYER_KEYS.join(', ')
                    }
                },
                run: async (a) => {
                    const t = oneTrack();
                    if (!t) { result('Which track? Click one first.'); return; }
                    const cfg = (LAYER_SETS || {})[a.set];
                    if (!cfg) { result('No such layer set: ' + a.set); return; }
                    return exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, cfg, t);
                },
                preview: (a) => {
                    const t = oneTrack();
                    return 'put the ' + a.set + ' layer on ' + (t ? (t.name || 'the track') : 'a track you pick');
                }
            },

            {
                name: 'load_by_name',
                summary: 'Put a GENE or a SAVED FILE on the canvas by name. Use this whenever the '
                    + 'request is "load X", "open X", "pull up X" or "bring in X" and X is a gene '
                    + 'symbol, an Ensembl id, or a file the person has saved. A bare name is '
                    + 'ambiguous, and the editor asks which it is rather than guessing, so passing '
                    + 'the name alone is the normal thing to do.',
                opens: true,
                params: {
                    name: {
                        type: 'string', required: true,
                        about: 'the gene symbol, Ensembl id or file name, exactly as the person '
                            + 'wrote it. Do not expand it, correct its spelling or add a species'
                    },
                    kind: {
                        type: 'enum', values: ['gene', 'file'],
                        about: 'only when the request SAYS which it is ("load the gene DNM1", '
                            + '"open my file DNM3-design"). Omit it otherwise and the editor asks'
                    }
                },
                run: (a) => exec('baja/manchester/menu/load-by-name.js', graph, genegraph_panel_layout, a),
                preview: (a) => {
                    if (a.kind === 'gene') return 'look up the gene ' + a.name + ' and pick a transcript';
                    if (a.kind === 'file') return 'find a saved file called “' + a.name + '”';
                    return 'load “' + a.name + '” — asks whether that is a gene or a file';
                }
            },

            {
                // THE ANSWER FOR THIS REGION, WHERE THE REGION IS. The full-screen map
                // answers "where is this gene conserved" for the whole protein; with a
                // stretch selected the question is narrower, and so is the useful answer:
                // how conserved is THIS, against the rest of the same protein, drawn on the
                // bases rather than in a window with its own axis to line up by eye.
                name: 'draw_conservation',
                summary: 'DRAW CONSERVATION ON THE TRACK ITSELF, as a trace along the coding '
                    + 'sequence: one bar per codon, full height where every species has the '
                    + 'same residue. WHEN A STRETCH OF SEQUENCE IS SELECTED it also reports '
                    + 'how conserved that stretch is against the rest of the same protein, '
                    + 'which is the only way a percentage means anything. This is the answer '
                    + 'to "show the conservation of this region", "how conserved is this '
                    + 'bit", "draw conservation on the track", "is this stretch conserved". '
                    + 'Use conservation_map instead for the full-screen picture of every '
                    + 'species side by side; this one puts the numbers on the canvas.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string',
                        about: 'the track to draw on, by name as canvas_now gives it. Omit it '
                            + 'when there is only one track or one is selected'
                    },
                    gene: {
                        type: 'string', default: 'taken from the track\u2019s own name',
                        about: 'the gene symbol, only when the track is named for something else'
                    },
                    across: {
                        type: 'enum', values: ['species', 'paralogs'], default: 'species',
                        about: 'species for orthologs, which is what conservation nearly always '
                            + 'means; paralogs to compare the gene against its own family'
                    },
                    species: {
                        type: 'string', default: 'human',
                        about: 'the species the TRACK is in, only if the request says one'
                    }
                },
                run: async (a) => {
                    const t = (a && a.track) ? matchTrack(a.track) : (oneSelTrack() || oneTrack());
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    const sym = paralogGene(a) || ('' + (t.name || ''));
                    if (!sym) { result('Which gene? Name it, or select a track.'); return; }
                    const species = ('' + ((a && a.species) || 'human')).trim() || 'human';
                    const kind = (('' + ((a && a.across) || 'species')).indexOf('paralog') >= 0)
                        ? 'paralogues' : 'orthologues';
                    let w = null;
                    try {
                        w = await exec('baja/lib/working.js', 'Conservation of ' + sym,
                            'Asking Ensembl for the ' + (kind === 'paralogues' ? 'paralogs' : 'orthologs')
                            + ' and their alignments.');
                    } catch (e) { w = null; }
                    const r = await conservationFor(sym, species, kind, w);
                    if (!r || r.status !== 'OK' || !(r.species_rows || []).length) {
                        const why = (r && r.error) || (r && r.note)
                            || 'the conservation could not be worked out';
                        try { if (w) w.fail(why); } catch (e) { }
                        result(why);
                        return r;
                    }
                    try { if (w) w.step('Drawing it on ' + (t.name || 'the track') + ' \u2026'); } catch (e) { }
                    // The selection if there is one, else the whole coding sequence.
                    const rg = hasSel(t) ? rangeOf(t) : null;
                    const out = await exec('baja/bio/conservation-layer.js', graph, t, r, rg);
                    try { if (w) w.done(); } catch (e) { }
                    if (out && out.error) result(out.error);
                    else if (out) result(out.answer);
                    return out;
                },
                preview: (a) => {
                    const t = (a && a.track) ? matchTrack(a.track) : (oneSelTrack() || oneTrack());
                    const sym = paralogGene(a) || (t ? ('' + (t.name || '')) : '');
                    const where = t ? (t.name || 'the track') : 'the track';
                    return (t && hasSel(t))
                        ? ('draw conservation of ' + sym + ' on ' + where + ' and measure the '
                            + 'selected stretch against the rest of the protein')
                        : ('draw conservation of ' + sym + ' along ' + where
                            + ' \u00b7 select a stretch first to have it measured on its own');
                },
                argBlocker: (a) => {
                    const t = (a && a.track) ? matchTrack(a.track) : (oneSelTrack() || oneTrack());
                    if (!t) {
                        return (a && a.track)
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to draw on: there is more than one open';
                    }
                    // Said before the button: a gene track with no ORF has no residues, and
                    // the request can be pointed at the mRNA instead.
                    try {
                        const has = t.orf && Array.isArray(t.orf.cdsi) && t.orf.cdsi.length;
                        if (!has) {
                            return (t.name || 'that track') + ' has no reading frame on it, so '
                                + 'there is no codon to put a residue on';
                        }
                    } catch (e) { }
                    return '';
                }
            },

            {
                // ONE TRACK, MANY SPECIES. "show spag9 conservation map" was read as
                // draw_similarity_map and refused for naming only one track: that operation
                // compares two tracks that are both open, and this question names one track
                // and no second because the others are not on the canvas at all -- they are
                // in Ensembl. The map was reachable only from the homolog list, which is a
                // long way round from a sentence that says exactly what it wants.
                name: 'conservation_map',
                summary: 'SHOW WHERE A GENE IS CONSERVED ACROSS SPECIES, as a full-screen map: '
                    + 'one row per species, one column per residue of this gene, coloured by '
                    + 'whether each species has the same residue, a conservative substitution, '
                    + 'a different one or nothing aligned there, with a band counting how many '
                    + 'agree and a list of the runs where they all do. This is the answer to '
                    + '"show the conservation map", "plot the conserved regions across '
                    + 'species", "where is this conserved", "which parts are conserved in '
                    + 'mouse and fly", "show sequence identity across species". It needs ONE '
                    + 'track and finds the species itself: do NOT use draw_similarity_map, '
                    + 'which needs two tracks already on the canvas, and do NOT ask for '
                    + 'list_homologs first.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string',
                        about: 'the track whose gene to map, by name as canvas_now gives it. '
                            + 'Omit it when there is only one track or one is selected'
                    },
                    gene: {
                        type: 'string', default: 'taken from the track\u2019s own name',
                        about: 'the gene symbol, only when the request names a gene rather '
                            + 'than pointing at a track'
                    },
                    across: {
                        type: 'enum', values: ['species', 'paralogs'], default: 'species',
                        about: 'species for orthologs, which is what conservation nearly always '
                            + 'means; paralogs to compare the gene against its own family'
                    },
                    species: {
                        type: 'string', default: 'human',
                        about: 'the species the TRACK is in, only if the request says one'
                    }
                },
                opens: true,
                run: async (a) => {
                    const sym = paralogGene(a);
                    if (!sym) { result('Which gene? Name it, or select a track.'); return; }
                    const species = ('' + ((a && a.species) || 'human')).trim() || 'human';
                    const kind = (('' + ((a && a.across) || 'species')).indexOf('paralog') >= 0)
                        ? 'paralogues' : 'orthologues';
                    // A FORTY-SECOND WAIT NEEDS A PANEL, NOT A CORNER MESSAGE. setMessage
                    // puts one line at the edge of the screen, on a timer, and says nothing
                    // more while the wait goes on -- which reads as nothing having happened,
                    // and invites a second press that starts the whole thing again.
                    let w = null;
                    try {
                        w = await exec('baja/lib/working.js', 'Conservation map for ' + sym,
                            'Asking Ensembl for the ' + (kind === 'paralogues' ? 'paralogs' : 'orthologs')
                            + ' and their alignments. Ensembl aligns each species when it is '
                            + 'asked, so this usually takes half a minute.');
                    } catch (e) { w = null; }
                    const r = await conservationFor(sym, species, kind, w);
                    if (!r || r.status !== 'OK') {
                        const why = (r && r.error) || 'the conservation map could not be built';
                        try { if (w) w.fail(why); } catch (e) { }
                        result(why);
                        return r;
                    }
                    if (!(r.species_rows || []).length) {
                        // Nothing to stack is an answer about the gene, not a failure.
                        const why = r.note || ('Ensembl has no aligned '
                            + (kind === 'paralogues' ? 'paralog' : 'ortholog') + ' of ' + sym
                            + ' to build a map from.');
                        try { if (w) w.fail(why); } catch (e) { }
                        result(why);
                        return r;
                    }
                    try { if (w) w.step('Stacking ' + (r.species_rows || []).length
                        + ' species across ' + r.length + ' residues \u2026'); } catch (e) { }
                    // The track this started from, named on the picture, with its exons: a
                    // map with no starting point on it is a map of nothing in particular.
                    try {
                        const st = (a && a.track) ? matchTrack(a.track) : (oneSelTrack() || oneTrack());
                        r.source = sourceOf(st);
                    } catch (e) { }
                    await exec('baja/bio/conservation-map.js', graph, r);
                    try { if (w) w.done(); } catch (e) { }
                    result(r.note || ((r.species_rows || []).length + ' species mapped across '
                        + r.length + ' residues of ' + sym + '.'));
                    return r;
                },
                preview: (a) => {
                    const sym = paralogGene(a);
                    const across = (('' + ((a && a.across) || 'species')).indexOf('paralog') >= 0)
                        ? 'its paralogs' : 'the species Ensembl has it in';
                    return sym
                        ? ('map where ' + sym + ' is conserved across ' + across
                            + ', residue by residue \u00b7 takes a few seconds')
                        : 'show the conservation map \u2014 say which track or gene';
                },
                argBlocker: (a) => {
                    if (paralogGene(a)) return '';
                    if (a && a.track) {
                        return 'no single track matches \u201c' + a.track + '\u201d: open tracks are '
                            + tracks().map((x) => x.name || '(unnamed)').join(', ');
                    }
                    return 'say which track or gene: open tracks are '
                        + tracks().map((x) => x.name || '(unnamed)').join(', ');
                }
            },

            {
                // PARALOGS AND ORTHOLOGS ARE ONE OPERATION. Both are Ensembl homology with
                // one parameter changed, both are ranked the same way and both want the same
                // screen; splitting them would have been two of everything for the sake of a
                // word, and a user who says "homolog" would have had to be routed to one of
                // them anyway.
                //
                // NOTHING IN THE EDITOR KNEW WHAT A PARALOG WAS. "list the closest paralog to
                // this track" came back as "not something the editor can do: this requires
                // external database queries for homology relationships" -- a true sentence
                // about the catalogue and a useless one to the user, since the editor already
                // talks to Ensembl for every gene it loads and homology is one more endpoint.
                //
                // AND LISTING IS HALF THE JOB. What a paralog is asked for is the next thing:
                // put it beside this one and compare them. So the answer is a screen whose
                // every row loads, through the same path as any other gene, which makes a
                // paralog loaded here a track the comparison and the exon matching work on
                // straight away.
                name: 'list_homologs',
                summary: 'FIND THE HOMOLOGS OF A TRACK\u2019S GENE AND OFFER THEM AS TRACKS TO '
                    + 'LOAD: its PARALOGS (duplicated genes in the same species) or its '
                    + 'ORTHOLOGS (the same gene in mouse, rat, dog, fly and the rest). Ensembl '
                    + 'is asked, they are ranked by percent identity over the aligned protein '
                    + '(closest first, shown both ways round since a short one inside a long '
                    + 'one scores high one way only), and a full screen lists them with what '
                    + 'each is, which species it is in and where it sits, each row loading that '
                    + 'gene as a track. This is the answer to "list the closest paralog to this '
                    + 'track", "what are the paralogs of X", "find the mouse ortholog", "load '
                    + 'the homologs of this gene", "is this conserved in rat", "what is the fly '
                    + 'version of this". Set `kind` from the request\u2019s own word. For how two '
                    + 'tracks ALREADY on the canvas compare, use compare_sequences or '
                    + 'match_regions_across_tracks instead.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string',
                        about: 'the track whose gene to look up, by name as canvas_now gives it. '
                            + 'Omit it when there is only one track or one is selected'
                    },
                    gene: {
                        type: 'string', default: 'taken from the track\u2019s own name',
                        about: 'the gene symbol, only when the request names a gene rather than '
                            + 'pointing at a track ("paralogs of SPAG9")'
                    },
                    kind: {
                        type: 'enum', values: ['paralogs', 'orthologs', 'both'],
                        default: 'paralogs',
                        about: 'paralogs for duplicated genes in the SAME species, which is '
                            + 'what "paralog", "closest relative" and "family member" ask for; '
                            + 'orthologs for the same gene in ANOTHER species, which is what '
                            + '"ortholog", "the mouse version", "conserved in rat" and a named '
                            + 'species ask for; both when the request says "homolog" without '
                            + 'saying which'
                    },
                    species: {
                        type: 'string', default: 'human',
                        about: 'the species the TRACK is in, only if the request says one. Not '
                            + 'the species being looked for: that is what kind=orthologs does'
                    },
                    top: {
                        type: 'number', default: 25,
                        about: 'how many to list, closest first'
                    }
                },
                opens: true,
                run: async (a) => {
                    const sym = paralogGene(a);
                    if (!sym) { result('Which gene? Name it, or select a track.'); return; }
                    const species = ('' + ((a && a.species) || 'human')).trim() || 'human';
                    const kind = ('' + ((a && a.kind) || 'paralogs')).trim().toLowerCase();
                    const word = (kind.indexOf('ortholog') === 0) ? 'orthologs'
                        : (kind === 'both' ? 'homologs' : 'paralogs');
                    // ORTHOLOGS TAKE A MOMENT. Ensembl aligns each pair when it is asked, so
                    // the wait is real; saying what is being waited for beats a still canvas.
                    let w = null;
                    try {
                        w = await exec('baja/lib/working.js', 'Homologs of ' + sym,
                            'Asking Ensembl for the ' + word + '.'
                            + (kind.indexOf('ortholog') === 0
                                ? ' Each species is aligned when it is asked for, so this takes '
                                  + 'a few seconds.' : ''));
                    } catch (e) { w = null; }
                    let r = null;
                    try {
                        r = await exec('py/bio/homologs.py', sym, species, (a && a.top) || 25, kind);
                    } catch (e) { r = { status: 'ERROR', error: ('' + (e && e.message ? e.message : e)) }; }
                    if (!r || r.status !== 'OK') {
                        const why = (r && r.error) || ('the ' + word + ' could not be looked up');
                        try { if (w) w.fail(why); } catch (e) { }
                        result(why);
                        return r;
                    }
                    const got = (r.homologs || r.paralogs || []);
                    try { if (w) w.done(); } catch (e) { }
                    await exec('baja/bio/homologs-screen.js', graph, genegraph_panel_layout, r);
                    const openable = got.filter((x) => x && x.loadable !== false).length;
                    result(got.length
                        ? (got.length + ' ' + (got.length === 1 ? word.replace(/s$/, '') : word)
                            + ' of ' + sym + ', closest first. '
                            + (openable === got.length
                                ? 'Load any of them as a track from the list.'
                                : (openable + ' of them can be opened here; load those from the list.')))
                        : ('Ensembl lists no ' + word + ' for ' + sym + ' in ' + species + '.'));
                    return r;
                },
                preview: (a) => {
                    const sym = paralogGene(a);
                    const kind = ('' + ((a && a.kind) || 'paralogs')).trim().toLowerCase();
                    const word = (kind.indexOf('ortholog') === 0)
                        ? 'orthologs (the same gene in mouse, rat, dog and the rest)'
                        : (kind === 'both' ? 'paralogs and orthologs' : 'paralogs');
                    return sym
                        ? ('ask Ensembl for the ' + word + ' of ' + sym + ', closest first, and '
                            + 'list them to load as tracks')
                        : 'list the homologs \u2014 say which track or gene';
                },
                argBlocker: (a) => {
                    if (paralogGene(a)) return '';
                    if (a && a.track) {
                        return 'no single track matches \u201c' + a.track + '\u201d: open tracks are '
                            + tracks().map((x) => x.name || '(unnamed)').join(', ');
                    }
                    return 'say which track or gene: open tracks are '
                        + tracks().map((x) => x.name || '(unnamed)').join(', ');
                }
            },

            // ---------------------------------------------------------------- models -------
            {
                name: 'rbp_competition',
                summary: 'Run BajaCLIP over the selected sequence and say which RNA binding protein '
                    + 'wins it, ranked by how specifically each one calls it against the others.',
                needs: 'selection', params: {},
                run: () => { const t = oneSelTrack(); return exec('baja/bio/rbp/rbp-competition.js', graph, genegraph_panel_layout, t, rangeOf(t)); }
            },
            {
                // A SELECTION IS A SCOPE, NOT A PRECONDITION. "add rna binding proteins to the
                // spag9_mrna" names the track it wants and selects nothing, and this refused
                // it for want of a selection -- while the module behind it has run on a whole
                // track all along. The same shape as load_protein_motifs: a selection narrows
                // it, and without one it does the whole track.
                name: 'rbp_profile',
                summary: 'ADD THE RNA BINDING PROTEIN PROFILE TO A TRACK: BajaCLIP is run over '
                    + 'the track\u2019s sequence and the per-position binding score is drawn as '
                    + 'a layer, for every RNA binding protein rather than picking a winner. '
                    + 'This is the answer to "add rna binding proteins to X", "show the RBP '
                    + 'binding on this track", "where do RNA binding proteins bind", "add '
                    + 'bajaclip", "draw the binding profile". WHEN A STRETCH OF SEQUENCE IS '
                    + 'SELECTED it runs on the selection, because that is what someone who '
                    + 'made a selection first is asking about; with nothing selected it does '
                    + 'the whole track. For which single protein wins a site, use '
                    + 'rbp_competition instead.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string',
                        about: 'which track, by name. Omit for the selected one, or when only '
                            + 'one is open'
                    }
                },
                run: (a) => {
                    const t = (a && a.track) ? matchTrack(a.track) : (oneSelTrack() || oneTrack());
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    // The selection if there is one on THAT track, else the whole of it: the
                    // module takes null for the whole track.
                    const r = hasSel(t) ? rangeOf(t) : null;
                    return exec('baja/bio/rbp/rbp-profile.js', graph, genegraph_panel_layout, t, r, null);
                },
                preview: (a) => {
                    const t = (a && a.track) ? matchTrack(a.track) : (oneSelTrack() || oneTrack());
                    const where = t ? (t.name || 'the track') : 'the track';
                    return 'run BajaCLIP over ' + (t && hasSel(t) ? ('the selected stretch of ' + where)
                        : ('the whole of ' + where)) + ' and draw the RNA binding protein profile on it';
                },
                argBlocker: (a) => {
                    const t = (a && a.track) ? matchTrack(a.track) : (oneSelTrack() || oneTrack());
                    if (!t) {
                        return (a && a.track)
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to run it on: there is more than one open';
                    }
                    return '';
                }
            },
            {
                // SAME FAULT AS rbp_profile HAD, and the same fix. These asked for a
                // selection and refused without one -- "run bajasplice on dnm3" came back
                // "cannot run: no sequence is selected: drag across a track first" -- while
                // splicing-profile.js has run on a whole track all along. Worse for PSI,
                // which ignores the range outright: it needs the track's exon structure,
                // not a stretch of sequence, so demanding a drag asked for something the
                // model never used. A selection narrows the sites mode; without one, both
                // do the whole track.
                name: 'splice_site_strength',
                summary: 'RUN SPLICENET (BajaSplice) ON A TRACK: donor and acceptor site '
                    + 'strength is predicted along the sequence and drawn as a sashimi layer. '
                    + 'This is the answer to "run bajasplice on X", "splice site strength", '
                    + '"how strong are the splice sites", "score the donors and acceptors", '
                    + '"run splicenet". WHEN A STRETCH IS SELECTED it runs on the selection; '
                    + 'with nothing selected it does the whole track. For predicted exon '
                    + 'inclusion rather than site strength, use exon_inclusion_psi.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string',
                        about: 'which track, by name. Omit for the selected one, or when only '
                            + 'one is open'
                    }
                },
                run: (a) => {
                    const t = pickModelTrack(a);
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    const r = hasSel(t) ? rangeOf(t) : null;
                    return exec('baja/bio/splicing/splicing-profile.js', graph, genegraph_panel_layout, t, r, 'sites');
                },
                preview: (a) => {
                    const t = pickModelTrack(a);
                    const where = t ? (t.name || 'the track') : 'the track';
                    return 'run SpliceNet over ' + (t && hasSel(t) ? ('the selected stretch of ' + where)
                        : ('the whole of ' + where)) + ' and draw donor and acceptor site strength';
                },
                // A MODEL WITH SEVERAL TRACKS OPEN IS A CHOICE, NOT A REFUSAL. "run bajasplice"
                // with two transcripts open stopped at "say which track to run it on", which
                // is a dead end with a Cancel button under it. Every open track gets its own
                // Go instead, which is what the operation already does for going somewhere.
                choices: (a) => choicesOver(a, (x) => ({
                    detail: (hasSel(x) ? 'the selected stretch' : 'the whole track')
                        + ' \u00b7 ' + (x.sequence ? x.sequence.length.toLocaleString() + ' nt' : 'no sequence')
                })),
                choiceTitle: () => 'Run SpliceNet on which track?',
                whenStuck: MODEL_SHELF,
                argBlocker: (a) => {
                    const t = pickModelTrack(a);
                    if (!t) {
                        if (!a.track && choicesOver(a, () => ({})).length) return '';
                        return (a && a.track)
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to run it on: there is more than one open';
                    }
                    return '';
                }
            },
            {
                // THE REPORT ACROSS THE WHOLE CANVAS. exon_inclusion_psi answers "which
                // exon on THIS transcript"; the question in front of someone choosing an
                // ASO target is "which exon anywhere on the canvas", and until now that
                // meant running PSI on each track and reading five panels side by side.
                //
                // It runs PSI where it is missing, unlike the ranking panel, which
                // deliberately refuses to: ranking is a second look at a run you asked
                // for, while a report over the canvas IS the request, and an empty table
                // noting that nothing was scored would answer a different one.
                name: 'exon_stability_report',
                summary: 'THE EXON STABILITY REPORT: every exon on every track, ranked by '
                    + 'how unreliably it splices, in one table. Folds in conservation and '
                    + 'annotated functional sites, exons whose PSI cannot be trusted '
                    + 'because they sit in duplicated sequence, published measurements '
                    + 'where they exist, and what each variant on the track does to '
                    + 'inclusion. This is the answer to "exon stability report", "which '
                    + 'exons are unstable across the canvas", "rank every exon", "report '
                    + 'on exon stability". Runs PSINet on any track that has not been '
                    + 'scored yet, so it works on a canvas where nothing has been run.',
                needs: 'track',
                params: {},
                // frameRange is this module's, tuned on the real canvas, so it is handed
                // over rather than reimplemented: a second copy of that arithmetic would
                // drift and the report would frame exons differently from everything else.
                run: () => exec('baja/bio/splicing/exon-stability-report.js',
                                graph, genegraph_panel_layout, null,
                                (t, lo, hi) => frameRange(t, lo, hi)),
                preview: () => {
                    const ts = tracks().filter((t) => {
                        try {
                            return (t.annotations || []).some(
                                (a) => a && ('' + a.type).toLowerCase() === 'exon');
                        } catch (e) { return false; }
                    });
                    const done = ts.filter((t) => {
                        try {
                            return (t.track_layers || []).some((x) => x && x.magnitudeMode === 'psi'
                                && Array.isArray(x.exonStability) && x.exonStability.length);
                        } catch (e) { return false; }
                    }).length;
                    const todo = ts.length - done;
                    return 'rank every exon on ' + ts.length + ' track'
                        + (ts.length === 1 ? '' : 's') + ' by how unreliably it splices'
                        + (todo > 0 ? (', running PSINet first on ' + todo + ' not yet scored') : '');
                },
                argBlocker: () => {
                    const ts = tracks().filter((t) => {
                        try {
                            return (t.annotations || []).some(
                                (a) => a && ('' + a.type).toLowerCase() === 'exon');
                        } catch (e) { return false; }
                    });
                    return ts.length ? ''
                        : 'no track on the canvas has annotated exons: the report is per exon, '
                          + 'so a track without them has nothing to report';
                },
                whenStuck: MODEL_SHELF
            },
            {
                name: 'exon_inclusion_psi',
                summary: 'RUN PSINET (BajaSplice) ON A TRACK: predicted exon inclusion (PSI) '
                    + 'is drawn as a sashimi layer, with each exon tagged by how reliably it '
                    + 'is spliced in. This is the answer to "run psinet on X", "exon '
                    + 'inclusion", "what is the PSI", "which exons are skipped", "how '
                    + 'reliably does this exon splice". It uses the track\u2019s ANNOTATED '
                    + 'EXON STRUCTURE, not a stretch of sequence, so it always does the whole '
                    + 'track and a selection does not narrow it.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string',
                        about: 'which track, by name. Omit for the selected one, or when only '
                            + 'one is open'
                    }
                },
                run: (a) => {
                    const t = pickModelTrack(a);
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    // null, not rangeOf(t): PSI mode ignores the range, and passing one
                    // would only suggest in the preview that it had narrowed the run.
                    return exec('baja/bio/splicing/splicing-profile.js', graph, genegraph_panel_layout, t, null, 'psi');
                },
                preview: (a) => {
                    const t = pickModelTrack(a);
                    return 'run PSINet over the whole of ' + (t ? (t.name || 'the track') : 'the track')
                        + ' and draw predicted exon inclusion, each exon tagged by how reliably it splices';
                },
                // One Go per open track, as above. PSI reads the ANNOTATED EXONS, so the
                // count of them is what tells the two tracks apart here.
                choices: (a) => choicesOver(a, (x) => {
                    const n = (x.annotations || []).filter((an) => ('' + (an && an.type)).toLowerCase() === 'exon').length;
                    return { detail: n ? (n + ' annotated exon' + (n === 1 ? '' : 's')) : 'no annotated exons' };
                }),
                choiceTitle: () => 'Run PSINet on which track?',
                whenStuck: MODEL_SHELF,
                argBlocker: (a) => {
                    const t = pickModelTrack(a);
                    if (!t) {
                        if (!a.track && choicesOver(a, () => ({})).length) return '';
                        return (a && a.track)
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to run it on: there is more than one open';
                    }
                    return '';
                }
            },
            {
                // UNLOADING HAD NO OPERATION WHILE LOADING HAD ONE. "remove the rna seq
                // layers from mapk8ip3_mrna" was answered by opening the shelf of data that
                // can be loaded onto a track, which is the opposite of what was asked.
                name: 'remove_layers',
                summary: 'TAKE DATA LAYERS OFF A TRACK: the layers matching what the request '
                    + 'names are removed from it. This is the answer to "remove the rna seq '
                    + 'layers from X", "take the motifs off this track", "delete the '
                    + 'similarity map", "clear the layers", "get rid of the conservation '
                    + 'track". It removes LAYERS, not tracks and not sequence, and it names '
                    + 'every layer it takes so the user can see what went. Nothing else is '
                    + 'touched. Prefer naming what to remove; removing everything is only for '
                    + 'a request that says so.',
                needs: 'track',
                params: {
                    match: {
                        type: 'string',
                        about: 'what to remove. PREFER THE LAYER\u2019S OWN NAME as canvas_now '
                            + 'lists it under the track\u2019s layers, or its kind (RNASeq, '
                            + 'SLIM, CDD, SEQSIM): the layer a user calls "the rna seq layer" '
                            + 'is often named something else entirely, and canvas_now is where '
                            + 'to find out what. A kind matches every layer of that kind. '
                            + 'Failing both, the request\u2019s own words. A request for RNA-seq, '
                            + 'coverage, expression or peaks ALSO takes unlabelled layers that are '
                            + 'drawn as a filled trace with peaks, which is what a bigwig loads as, '
                            + 'and the user is asked before those go. Use "all" ONLY when the '
                            + 'request asks for every layer to go; "layers" or "tracklayers" on '
                            + 'their own mean the same thing'
                    },
                    track: {
                        type: 'string',
                        about: 'which track to take them off, by name. Omit for the selected '
                            + 'one, or when only one is open'
                    }
                },
                run: async (a) => {
                    // ACROSS EVERY TRACK THAT HAS ONE when none is named. "remove rnaseq
                    // layers" with three tracks open used to refuse, saying to name a track,
                    // which is work the editor can do: it can see which tracks carry a layer
                    // that matches and take it off those. A named track still wins.
                    const ts = removalTracks(a);
                    if (!ts.length) { result('Which track? Name it, or click one first.'); return; }
                    const t = ts[0];
                    const r = await exec('baja/bio/remove-layers.js', graph, ts, { match: a.match || '' });
                    if (r && r.error) result(r.error);
                    else if (r && r.pending) {
                        // The question is on the canvas; the removal happens when it is
                        // answered. Saying "removed" here would be a report of something
                        // that has not happened yet.
                        result('Asked before removing ' + r.asked + ' layer' + (r.asked === 1 ? '' : 's')
                            + ' from ' + ts.map((x) => x.name || 'a track').join(' and ') + ': '
                            + r.candidates.map((x) => x.name).join(', ')
                            + (r.guessed ? ('. ' + r.guessed + ' of them matched by being drawn as a '
                                + 'trace with peaks rather than by name.') : '.'));
                    }
                    else if (r && r.removed) {
                        result('Removed ' + r.count + ' layer' + (r.count === 1 ? '' : 's')
                            + ' from ' + ts.map((x) => x.name || 'a track').join(' and ') + ': '
                            + r.removed.map((x) => x.name).join(', ') + '.');
                    }
                    return r;
                },
                preview: (a) => {
                    const ts = removalTracks(a);
                    const where = ' from ' + (ts.length
                        ? ts.map((x) => x.name || 'a track').join(' and ') : 'the track');
                    const m = ('' + (a.match || '')).trim();
                    // WHICH LAYERS, BY NAME, BEFORE THE BUTTON. A card that says "remove the
                    // rna seq layers" and takes four of them is a card that was not read.
                    let names = [];
                    let guessed = 0;
                    // Said rather than shown as "nothing matches", which is the symptom this
                    // matcher exists to remove and would hide its own absence.
                    if (!LM) return 'cannot work out which layers you mean: '
                        + 'baja/bio/layer-match.js did not load';
                    try {
                        for (const t of ts) {
                            if (!Array.isArray(t.track_layers)) continue;
                            const hits = LM.match(t.track_layers, m);
                            guessed += hits.filter((h) => h.why === 'shape' || h.why === 'polygon').length;
                            for (const h of hits) {
                                names.push(LM.nameOf(h.layer)
                                    // The three strongest reasons: the full list belongs on
                                    // the chooser, where there is room to read it.
                                    + ((h.why === 'shape' || h.why === 'polygon')
                                        ? (' (' + LM.evidence(h.layer).slice(0, 3).join(', ') + ')') : '')
                                    + (ts.length > 1 ? (' on ' + (t.name || 'a track')) : ''));
                            }
                        }
                    } catch (e) { names = []; }
                    if (!names.length) return 'remove ' + (m ? ('the ' + m + ' layers') : 'the layers') + where
                        + ': nothing there matches';
                    return 'remove ' + names.length + ' layer' + (names.length === 1 ? '' : 's')
                        + where + ': ' + names.join(', ')
                        // SAID ON THE CARD, not only in the confirmation: a layer matched by
                        // how it is drawn is a guess, and the user should see that before
                        // pressing GO, not only after.
                        + (guessed ? ('. ' + guessed + ' matched by being drawn as a trace with '
                            + 'peaks rather than by name, so you will be asked which of them to '
                            + 'take, one at a time') : '');
                },
                argBlocker: (a) => {
                    const ts = removalTracks(a);
                    if (!ts.length) {
                        if (a.track) {
                            return 'no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', ');
                        }
                        // Not "which track?": with nothing matching anywhere, naming one
                        // would not help, and saying what IS there is what a retry needs.
                        const any = tracks().filter((x) => Array.isArray(x.track_layers) && x.track_layers.length);
                        if (!any.length) return 'none of the open tracks has any layers on it';
                        return 'nothing matching \u201c' + (a.match || 'that') + '\u201d is on any open track. '
                            + any.map((x) => (x.name || 'a track') + ': '
                                + x.track_layers.map((l) => (LM ? LM.describe(l) : (l && l.name) || '?')).join(', ')).join(' \u00b7 ');
                    }
                    // Resolved to a track that carries nothing at all: said before the button
                    // rather than after it.
                    if (!ts.some((x) => Array.isArray(x.track_layers) && x.track_layers.length)) {
                        return ts.map((x) => x.name || 'that track').join(' and ')
                            + ' has no layers on it';
                    }
                    return '';
                }
            },

            {
                // A MAP IS DRAWN, NOT REPORTED. "draw a map that compares the regions of high
                // sequence similarity between two tracks" asks for something on the canvas:
                // a layer on each track, one bar per block, matching colours, so the pairs
                // line up by eye when the tracks are laid one above the other.
                name: 'draw_similarity_map',
                summary: 'DRAW A MAP OF WHERE TWO TRACKS ON THE CANVAS ARE SIMILAR: the blocks '
                    + 'of sequence similarity between them are found and DRAWN as a layer on '
                    + 'each track, one coloured bar per block, the same colour and number on '
                    + 'both so the pairs can be read off. It needs TWO tracks that are both '
                    + 'open; for conservation ACROSS SPECIES from one track, which names no '
                    + 'second track, use conservation_map instead. This is the answer to "draw '
                    + 'a map comparing the regions of similarity between X and Y", '
                    + '"show me where these two are the same", "dot plot these", "where do '
                    + 'these two line up". Unlike compare_sequences, which reports one '
                    + 'identity in a panel, this puts the regions on the canvas. Blocks that '
                    + 'are inverted between the two are marked as such. Pair it with '
                    + 'put_tracks_together when the tracks are not already side by side.',
                needs: 'track',
                params: {
                    tracks: {
                        type: 'string',
                        about: 'the two tracks to map, by name, comma separated. Omit for the '
                            + 'selected tracks or when exactly two are open'
                    },
                    which: {
                        type: 'enum', values: ['mrna'],
                        about: 'set to mrna for a request about the mRNA tracks as a group'
                    },
                    max_blocks: {
                        type: 'number', default: 10,
                        about: 'how many blocks to draw, best first. Raise it only if the '
                            + 'request asks for more detail'
                    }
                },
                run: async (a) => {
                    const ts = comparands(a);
                    if (ts.length < 2) { result('Two tracks are needed to map. Name them, or open two.'); return; }
                    const r = await exec('baja/bio/similarity-map.js', graph, ts[0], ts[1],
                        { max_blocks: a.max_blocks || 10 });
                    if (r && r.error) result(r.error);
                    return r;
                },
                preview: (a) => {
                    const ts = comparands(a);
                    const names = ts.map((t) => t.name || 'a track');
                    return 'draw a map of the similar regions between '
                        + (names.length ? names.slice(0, 2).join(' and ') : 'the tracks')
                        + ', on both tracks';
                },
                argBlocker: (a) => {
                    const ts = comparands(a);
                    if (ts.length < 2) {
                        return ts.length
                            ? 'two tracks are needed to map: only ' + (ts[0].name || 'one') + ' could be identified'
                            : 'name the two tracks to map';
                    }
                    return '';
                }
            },

            {
                // ITERATING IS AN OPERATION, NOT A REASON TO REFUSE. "iterate over all exons
                // in A and find the closest sequence block that matches it on B" was answered
                // with "the editor cannot loop through exons automatically; you would need to
                // search each exon individually" -- which is to say, do the editor's work by
                // hand thirty times. The loop is the easy part.
                name: 'match_regions_across_tracks',
                summary: 'EVERY REGION OF ONE KIND ON ONE TRACK, MATCHED TO ITS CLOSEST BLOCK '
                    + 'ON ANOTHER, AND DRAWN. Each exon -- or intron, or either UTR, or the '
                    + 'CDS -- of the first track is searched against the whole of the second, '
                    + 'on both strands, and the best hit for each is kept, reported with its '
                    + 'identity, position, score and how much of the region it covers, and '
                    + 'drawn as a picture of the two tracks side by side with every pair '
                    + 'joined, as well as on the tracks themselves. This is the answer to '
                    + '"iterate over all exons in A and find the closest sequence block that '
                    + 'matches it on B", "compare the introns of A and B", "match the exons of '
                    + 'A against B", "does the 3\u2032 UTR of A match anything on B", "where '
                    + 'does each exon of A land on B". Use it, NOT search_region_in_track, '
                    + 'when the request is about ALL the regions of a kind rather than one '
                    + 'named one; and NOT compare_sequences, which aligns the two transcripts '
                    + 'as wholes and so cannot say where an individual exon or intron went.',
                needs: 'track',
                params: {
                    features: {
                        type: 'enum',
                        values: ['exons', 'introns', 'five_prime_utr', 'three_prime_utr', 'cds', 'transcript'],
                        default: 'exons',
                        about: 'which regions of the first track to iterate over. Take it from '
                            + 'the request\u2019s own word: "exons", "introns", "3\u2032 UTR", '
                            + '"5\u2032 UTR", "coding sequence". The UTRs, the CDS and the '
                            + 'whole transcript are single regions, so the run is one search'
                    },
                    query_track: {
                        type: 'string',
                        about: 'the track whose EXONS are iterated over: the one named first, '
                            + 'as in "all exons in spag9_mrna"'
                    },
                    target_track: {
                        type: 'string',
                        about: 'the track each exon is searched against: the one named second, '
                            + 'as in "matches it on mapk8ip3_mrna"'
                    },
                    max_regions: {
                        type: 'number', default: 60,
                        about: 'how many regions to do, from the first. Raise it only if the '
                            + 'request asks for more than 60'
                    },
                    strands: {
                        type: 'enum', values: ['both', 'plus'], default: 'both',
                        about: 'both strands unless the request says otherwise: two transcripts '
                            + 'can carry the same element reversed'
                    }
                },
                run: async (a) => {
                    const qt = a.query_track ? matchTrack(a.query_track) : null;
                    const tt = a.target_track ? matchTrack(a.target_track) : null;
                    if (!qt) { result('Which track\u2019s regions? Name it.'); return; }
                    if (!tt) { result('Which track should each one be searched against? Name it.'); return; }
                    const out = await exec('baja/bio/match-regions.js', graph, qt, tt,
                        { features: a.features || 'exons', max_regions: a.max_regions || 60,
                          strands: a.strands || 'both' });
                    if (out && out.error) result(out.error);
                    else if (out && out.count != null) {
                        result(out.count + ' of ' + out.of + ' ' + (out.plural || 'regions') + ' of '
                            + (qt.name || 'the first track') + ' matched a block on '
                            + (tt.name || 'the other track') + ', drawn and linked.');
                    }
                    return out;
                },
                preview: (a) => {
                    const qt = a.query_track ? matchTrack(a.query_track) : null;
                    const tt = a.target_track ? matchTrack(a.target_track) : null;
                    const q = qt ? (qt.name || 'a track') : 'a track';
                    const t = tt ? (tt.name || 'the other track') : 'the other track';
                    const WORD = { exons: ['exon', 'exons'], introns: ['intron', 'introns'],
                        five_prime_utr: ['5\u2032 UTR', '5\u2032 UTR'],
                        three_prime_utr: ['3\u2032 UTR', '3\u2032 UTR'],
                        cds: ['coding sequence', 'coding sequence'],
                        transcript: ['transcript', 'transcript'] };
                    const kind = WORD[a.features || 'exons'] ? (a.features || 'exons') : 'exons';
                    let n = null;
                    try {
                        const R = regionsNow(qt);
                        if (R) {
                            if (kind === 'exons') n = R.exons().length;
                            else if (kind === 'introns') n = R.introns().length;
                            else n = 1;
                        }
                    } catch (e) { n = null; }
                    // HOW MANY SEARCHES, BEFORE THE BUTTON. This is one backend search per
                    // region, so a thirty-exon transcript is thirty of them: worth knowing
                    // before pressing GO rather than while waiting.
                    const what = (n != null && n !== 1)
                        ? (n + ' ' + WORD[kind][1])
                        : (n === 1 ? ('the ' + WORD[kind][0]) : ('every ' + WORD[kind][0]));
                    return 'match ' + what + ' of ' + q + ' against ' + t
                        + ', keep the closest block for each, and draw them joined'
                        + (n != null ? (' \u00b7 ' + n + ' search' + (n === 1 ? '' : 'es')) : '');
                },
                argBlocker: (a) => {
                    const qt = a.query_track ? matchTrack(a.query_track) : null;
                    const tt = a.target_track ? matchTrack(a.target_track) : null;
                    if (!qt) {
                        return 'say which track\u2019s regions to iterate over: open tracks are '
                            + tracks().map((x) => x.name || '(unnamed)').join(', ');
                    }
                    if (!tt) {
                        return 'say which track to search each one against: open tracks are '
                            + tracks().map((x) => x.name || '(unnamed)').join(', ');
                    }
                    if (qt === tt) return 'those are the same track';
                    // The track not having the region asked for is known here, and is worth
                    // saying before the button: a non-coding transcript has no UTRs, and a
                    // single-exon one has no introns.
                    try {
                        const R = regionsNow(qt);
                        const kind = a.features || 'exons';
                        const nm = qt.name || 'that track';
                        if (R) {
                            if (kind === 'exons' && !R.exons().length) return nm + ' has no annotated exons';
                            if (kind === 'introns' && !R.introns().length) {
                                return nm + ' has no introns: it is a single-exon transcript';
                            }
                            if (kind === 'five_prime_utr' && !R.utr5()) return nm + ' has no 5\u2032 UTR';
                            if (kind === 'three_prime_utr' && !R.utr3()) return nm + ' has no 3\u2032 UTR';
                            if (kind === 'cds' && !R.cds()) return nm + ' has no annotated coding region';
                        }
                    } catch (e) { }
                    return '';
                }
            },

            {
                // SEARCHING IS NOT COMPARING, AND THE REFUSAL WAS RIGHT ABOUT THAT. "compare
                // exon 16 of one transcript with any other part of another and rank the
                // results" was turned down because compare_sequences aligns two things and
                // says how similar they are; this asks where in one track a region turns up,
                // and how good each place is. Different question, so a different operation
                // rather than a looser version of that one.
                name: 'search_region_in_track',
                summary: 'TAKE ONE REGION AND FIND WHERE ELSE IT TURNS UP, ranked best first '
                    + 'AND DRAWN: a named region of one track is searched against the whole of '
                    + 'another track; every place it matches is reported with its score, its '
                    + 'identity, where it sits and how much of the region it accounts for, and '
                    + 'the matches are drawn on the track that was searched with the region '
                    + 'itself marked on its own track. It also ANSWERS a yes-or-no question '
                    + 'outright before listing the evidence. This is the answer to "compare '
                    + 'exon 16 of A with any other part of B and rank the results", "does exon '
                    + '16 of A match sequence space on B", "where else does this exon appear", '
                    + '"find this region in that track", "search this sequence against that '
                    + 'one", "is there anything like this elsewhere". Use it, NOT '
                    + 'compare_sequences, whenever the request is about finding, ranking or '
                    + 'asking WHETHER something matches, rather than about how similar two '
                    + 'whole things are. Both strands are searched.',
                needs: 'track',
                params: {
                    region: {
                        type: 'enum',
                        values: ['five_prime_utr', 'three_prime_utr', 'cds', 'transcript', 'exon', 'intron', 'coordinates'],
                        about: 'the region to search WITH, on the query track ("exon 16 of X")'
                    },
                    index: { type: 'number', about: 'which exon or intron, counting from 1 along the transcript' },
                    start: { type: 'number', about: 'with region=coordinates: the first base' },
                    end: { type: 'number', about: 'with region=coordinates: the last base' },
                    query_track: {
                        type: 'string',
                        about: 'the track the REGION belongs to: the one named first, as in '
                            + '"exon 16 of mapk8ip3_mrna". Omit when only one track is open'
                    },
                    target_track: {
                        type: 'string',
                        about: 'the track to SEARCH: the one named second, as in "any other '
                            + 'part of spag9_mrna"'
                    },
                    max_hits: {
                        type: 'number', default: 8,
                        about: 'how many places to report, best first. Raise it only if the '
                            + 'request asks for more'
                    }
                },
                run: async (a) => {
                    const qt = a.query_track ? matchTrack(a.query_track) : oneTrack();
                    const tt = a.target_track ? matchTrack(a.target_track) : null;
                    if (!qt) { result('Which track is the region on? Name it.'); return; }
                    if (!tt) { result('Which track should be searched? Name it.'); return; }
                    const R = await regionsOf(qt);
                    const r = R ? R.resolve(a) : { error: 'the regions of that track could not be read' };
                    if (r.error) { result(r.error); return; }
                    const out = await exec('baja/bio/search-region.js', graph,
                        { track: qt, start: r.start, end: r.end, label: r.label }, tt,
                        { max_hits: a.max_hits || 8 });
                    if (out && out.error) result(out.error);
                    return out;
                },
                preview: (a) => {
                    const qt = a.query_track ? matchTrack(a.query_track) : oneTrack();
                    const tt = a.target_track ? matchTrack(a.target_track) : null;
                    const what = a.region
                        ? (('' + a.region).replace(/_/g, ' ') + ((a.index != null) ? (' ' + a.index) : ''))
                        : 'that region';
                    return 'search ' + what + ' of ' + (qt ? (qt.name || 'the track') : 'the track')
                        + ' against all of ' + (tt ? (tt.name || 'the other track') : 'the other track')
                        + ' and rank what it finds';
                },
                argBlocker: (a) => {
                    const qt = a.query_track ? matchTrack(a.query_track) : oneTrack();
                    const tt = a.target_track ? matchTrack(a.target_track) : null;
                    const open = () => tracks().map((x) => x.name || '(unnamed)').join(', ');
                    if (!qt) return 'no single track matches \u201c' + (a.query_track || '') + '\u201d: open tracks are ' + open();
                    if (!tt) return a.target_track
                        ? ('no single track matches \u201c' + a.target_track + '\u201d: open tracks are ' + open())
                        : 'name the track to search against';
                    if (qt === tt) return 'the region and the track to search are the same track: name a different one';
                    return '';
                }
            },

            {
                // MOVING TRACKS IS NOT MERGING THEM. "put spag9_mRNA and MAPK8IP3_mRNA
                // together" was answered with the across-tracks library and a note that
                // combining tracks into one is not something the editor does. Nobody asked
                // to combine them.
                name: 'put_tracks_together',
                summary: 'MOVE TRACKS NEXT TO EACH OTHER AND LINE THEM UP: the named tracks are '
                    + 'placed one under the other with nothing in between, and given the same '
                    + 'left edge and the same scale, so the same base offset in each sits at '
                    + 'the same place across and the eye can run straight down. This is the '
                    + 'answer to "put X and Y together", "move these next to each other", '
                    + '"stack these two", "line these up", "show these side by side", '
                    + '"arrange the tracks so I can compare them". It MOVES tracks and nothing '
                    + 'else: it does not merge or combine them into one track, it does not '
                    + 'change any sequence, and nothing is deleted. The other tracks keep '
                    + 'their order and are moved down to make room.',
                needs: 'track',
                params: {
                    tracks: {
                        type: 'string',
                        about: 'the tracks to put together, by name, comma separated, in the '
                            + 'order the request names them ("spag9_mRNA, MAPK8IP3_mRNA"). Omit '
                            + 'for the selected tracks'
                    },
                    which: {
                        type: 'enum', values: ['mrna'],
                        about: 'set to mrna for a request about THE mRNA TRACKS as a group '
                            + '("compare the proteins between the mRNA tracks", "the mRNA '
                            + 'tracks"), instead of naming them one by one. A track counts as '
                            + 'mRNA when its name says so or when it has no introns'
                    }
                },
                run: async (a) => {
                    const ts = comparands(a);
                    if (ts.length < 2) {
                        result('Name two or more tracks to put together.');
                        return;
                    }
                    const r = await exec('baja/bio/put-tracks-together.js', graph, ts, {});
                    if (r && r.error) result(r.error);
                    return r;
                },
                preview: (a) => {
                    const ts = comparands(a);
                    const names = ts.map((t) => t.name || 'a track');
                    return 'put ' + (names.length ? names.join(' and ') : 'the tracks')
                        + ' next to each other, lined up from the same origin';
                },
                argBlocker: (a) => {
                    const ts = comparands(a);
                    if (ts.length < 2) {
                        return ts.length
                            ? 'two tracks are needed: only ' + (ts[0].name || 'one') + ' could be identified'
                            : 'name the tracks to put together: none could be identified';
                    }
                    return '';
                }
            },

            {
                // COMPARING IS NOT SELECTING. "compare the sequences between exon 16 on both
                // tracks" was read as two selections, because selecting was the only thing in
                // the catalogue that mentioned a region on a track. The comparison existed all
                // along, on the Selection > Tracks > Compare menu, and could not be asked for.
                name: 'compare_sequences',
                summary: 'ALIGN THE SEQUENCES OR PROTEINS OF TWO OR MORE TRACKS AND REPORT THEIR IDENTITY: '
                    + 'a local alignment per pair, the percent identical, how much of each '
                    + 'sequence the alignment covers, and the alignment itself to read. This is '
                    + 'the answer to "compare these tracks", "compare the sequences", "how '
                    + 'similar are these two", "align these", "what is the identity between '
                    + 'them", "what is different between them", "compare the proteins between '
                    + 'the mRNA tracks". It does NOT select anything: a '
                    + 'request to COMPARE is this operation, not a pair of selections. Name a '
                    + 'region (exon 16, the 3\u2019 UTR) to compare just that stretch of each '
                    + 'track, which is what a request mentioning one means.',
                needs: 'track',
                // NOT marked `answers`: that flag routes the card into the variant-question
                // path, which is a different thing entirely. This runs and opens its report.
                params: {
                    region: {
                        type: 'enum',
                        values: ['five_prime_utr', 'three_prime_utr', 'cds', 'transcript', 'exon', 'intron', 'coordinates'],
                        about: 'the stretch of each track to compare, when the request names '
                            + 'one ("exon 16 on both tracks"). Omit to compare whole sequences'
                    },
                    index: { type: 'number', about: 'which exon or intron, counting from 1 along the transcript' },
                    start: { type: 'number', about: 'with region=coordinates: the first base' },
                    end: { type: 'number', about: 'with region=coordinates: the last base' },
                    mode: {
                        type: 'enum', values: ['protein', 'nucleotide', 'coding'], default: 'protein',
                        about: 'protein compares the translated ORFs, which is the right default '
                            + 'for two genes. nucleotide compares the coding sequence, or the '
                            + 'track\u2019s own bases when it has no ORF. coding compares both '
                            + 'over the same residues and counts silent against replacing '
                            + 'changes. A named region is always compared as nucleotides'
                    },
                    tracks: {
                        type: 'string',
                        about: 'the tracks to compare, by name, comma separated. Omit for the '
                            + 'selected tracks, or when exactly two are open'
                    },
                    which: {
                        type: 'enum', values: ['mrna', 'all'],
                        about: 'set to mrna for a request about THE mRNA TRACKS as a group '
                            + '("compare the proteins between the mRNA tracks", "the mRNA '
                            + 'tracks"), instead of naming them one by one. A track counts as '
                            + 'mRNA when its name says so or when it has no introns. Set to '
                            + 'all for "on all tracks", "across all the tracks", "on every '
                            + 'track", which compares every track that is open'
                    }
                },
                run: async (a) => {
                    const ts = comparands(a);
                    if (ts.length < 2) {
                        result('Two tracks are needed to compare. Name them, or open two.');
                        return;
                    }
                    // SAYS THAT IT IS RUNNING. Comparing three tracks is three alignments on
                    // the server, each of a whole protein, and this said nothing at all until
                    // the report opened: a long silence is indistinguishable from a dead
                    // click, and the honest answer to "is it working" was only available once
                    // it had finished working. Every other long operation in the catalogue
                    // puts the panel up; this one did not.
                    let W = null;
                    try {
                        W = await exec('baja/lib/working.js',
                            'Comparing ' + ts.map((x) => x.name || 'a track').join(', '),
                            a.region
                                ? ('Over ' + ('' + a.region).replace(/_/g, ' ')
                                    + ((a.index != null) ? (' ' + a.index) : '') + ' of each.')
                                : 'One alignment per pair.');
                    } catch (e) { W = null; }
                    const step = (m) => { try { if (W) W.step(m); } catch (e) { } };
                    const stop = () => { try { if (W) W.done(); } catch (e) { } };
                    const giveUp = (m) => { try { if (W) W.fail(m); } catch (e) { } };
                    // One region per track, resolved on each track's own coordinates: exon 16
                    // of one transcript is not at the same place as exon 16 of another, and
                    // comparing one track's exon against the other's whole sequence would
                    // report a believable number for the wrong question.
                    let ranges = [];
                    const missing = [];
                    if (a.region) {
                        for (const t of ts) {
                            step('Reading ' + ('' + a.region).replace(/_/g, ' ')
                                + ((a.index != null) ? (' ' + a.index) : '')
                                + ' on ' + (t.name || 'a track'));
                            const R = await regionsOf(t);
                            const r = R ? R.resolve(a) : { error: 'no regions' };
                            if (r.error) { missing.push((t.name || 'a track') + ': ' + r.error); ranges.push(null); }
                            else ranges.push({ start: r.start, end: r.end, label: r.label });
                        }
                        if (missing.length) {
                            giveUp('Cannot compare that region: ' + missing.join('; '));
                            result('Cannot compare that region: ' + missing.join('; '));
                            return;
                        }
                    }
                    // PROTEINS GO TO THE BACKEND ALIGNER. The in-browser one is a plain
                    // Smith-Waterman; the Python one is Biopython with BLOSUM62 and the
                    // blastp gap costs, so its numbers are comparable with what the user
                    // reads anywhere else. Whole proteins only: a named region is a stretch
                    // of DNA and has no peptide of its own.
                    const wantsProtein = ((a.mode || 'protein') === 'protein') && !a.region;
                    if (wantsProtein) {
                        const r = await exec('baja/bio/protein/compare-proteins.js', graph, ts,
                            { onStep: step });
                        // A backend that cannot be reached is a reason to fall back, not to
                        // fail: the browser can still answer the question, and the panel says
                        // which aligner ran.
                        if (r && !r.unavailable) {
                            stop();
                            if (r.error) result(r.error);
                            return r;
                        }
                        // The fallback is a different wait, and a panel that still reads
                        // "aligning on the server" while the browser does it is lying.
                        step('The server did not answer \u00b7 aligning here instead');
                    }
                    step('Aligning ' + ts.length + ' track' + (ts.length === 1 ? '' : 's') + ' here');
                    try {
                        const out = await exec('baja/manchester/menu/compare-track-sequences.js', graph, ts,
                            { mode: (a.mode || 'protein'), ranges: ranges });
                        stop();
                        return out;
                    } catch (e) {
                        giveUp('The comparison failed: ' + (e && e.message ? e.message : e));
                        throw e;
                    }
                },
                preview: (a) => {
                    const ts = comparands(a);
                    const names = ts.map((t) => t.name || 'a track');
                    const what = a.region
                        ? (('' + a.region).replace(/_/g, ' ') + ((a.index != null) ? (' ' + a.index) : ''))
                        : ({ protein: 'the translated ORFs', coding: 'the coding sequences' }[a.mode] || 'the sequences');
                    // "DNM1, DNM3 and DNM3-208", not "DNM1 and DNM3 and DNM3-208": this card
                    // is the only place the user sees which tracks are about to be compared,
                    // so it has to read like a list of them.
                    const listed = names.length < 2 ? (names[0] || 'the tracks')
                        : (names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
                    return 'compare ' + what + ' of ' + (names.length ? listed : 'the tracks')
                        + ' and report the identity between them';
                },
                argBlocker: (a) => {
                    const ts = comparands(a);
                    if (ts.length < 2) {
                        // Say what IS open: "none could be identified" with three tracks on
                        // screen reads as the editor having lost them.
                        const open = tracks();
                        return ts.length
                            ? 'two tracks are needed to compare: only ' + (ts[0].name || 'one') + ' is here'
                            : (open.length
                                ? ('two tracks are needed to compare, and none of these matched: '
                                    + open.map((x) => x.name || '(unnamed)').join(', '))
                                : 'two tracks are needed to compare, and none are open');
                    }
                    return '';
                }
            },

            {
                // PROTEIN MOTIFS ARE A LAYER THE EDITOR ALREADY DRAWS, and "load protein
                // motifs" was answered with "nothing in the editor does that" because the
                // catalogue is the only thing a typed request can reach.
                name: 'load_protein_motifs',
                summary: 'LOAD SHORT LINEAR MOTIFS (SLiMs) onto a track as a layer: the ELM '
                    + 'catalogue of recognition tags matched against the track\u2019s own '
                    + 'translation and placed on the codons that encode them. This is the '
                    + 'answer to "load protein motifs", "show the motifs", "find linear '
                    + 'motifs", "ELM motifs", "SLiMs", "what motifs are in this protein". '
                    + 'WHEN A STRETCH OF SEQUENCE IS SELECTED it loads only the motifs '
                    + 'touching the selection, because that is what someone who made a '
                    + 'selection first is asking about; with nothing selected it does the '
                    + 'whole protein. A motif is a regex match and most matches in any '
                    + 'protein are not real, which is why the score is a ranking and the '
                    + 'layer says so.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string',
                        about: 'which track, by name. Omit for the selected one, or when only '
                            + 'one is open'
                    },
                    whole_track: {
                        type: 'boolean', default: false,
                        about: 'true to scan the WHOLE protein even though a stretch is '
                            + 'selected. Only for a request that says so ("over the whole '
                            + 'track", "everywhere", "ignore the selection"); a plain request '
                            + 'with a selection on screen means the selection'
                    },
                    min_score: {
                        type: 'number', default: 30,
                        about: 'the lowest motif score to draw, 0 to 100. Raise it for a '
                            + 'request that asks for the strongest or best-scoring motifs only'
                    },
                    variants: {
                        type: 'string',
                        about: 'protein-space variants to test for motifs gained or lost, comma '
                            + 'separated, as the request writes them ("R578C"). Only when the '
                            + 'request names one; genomic coordinates are not translated here'
                    }
                },
                run: async (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    // The selection decides the scope unless the request overrode it. Every
                    // selected region counts, not just the first: a track can hold several
                    // now, and a user who selected two exons means both.
                    let within = [];
                    if (!a.whole_track) {
                        try {
                            within = (typeof t.getSelectedRanges === 'function')
                                ? t.getSelectedRanges()
                                : (hasSel(t) ? [rangeOf(t)] : []);
                        } catch (e) { within = []; }
                    }
                    const vars = ('' + (a.variants || '')).split(',')
                        .map((x) => x.trim()).filter(Boolean);
                    const r = await exec('baja/bio/protein/slim-motif-layer.js', graph,
                        genegraph_panel_layout, [t], {
                            within: within,
                            minScore: (a.min_score == null ? 30 : a.min_score),
                            variants: vars,
                            // Re-run rather than skip: the layer is idempotent by track, so
                            // asking again over a selection would otherwise report "already
                            // mapped" and leave the whole-protein layer in place, which is
                            // the opposite of what was asked for.
                            redo: true
                        });
                    if (r && r.skipped && !r.done) {
                        result((t.name || 'That track') + ' has no protein translation, so there '
                            + 'is nothing to find motifs in.');
                    }
                    return r;
                },
                preview: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    let n = 0;
                    try {
                        n = (!a.whole_track && t && typeof t.getSelectedRanges === 'function')
                            ? t.getSelectedRanges().length : 0;
                    } catch (e) { n = 0; }
                    return 'load the protein motifs on ' + (t ? (t.name || 'the track') : 'the track')
                        + (n ? (n === 1 ? ', within the selected region' : (', within the '
                            + n + ' selected regions')) : ', over the whole protein')
                        + ((a.min_score != null && a.min_score !== 30) ? (', scoring at least ' + a.min_score) : '');
                },
                argBlocker: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) {
                        return a.track
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track: there is more than one open';
                    }
                    // Said before the button rather than after a run that draws nothing.
                    const hasOrf = (() => {
                        try { return !!(t.orf && t.orf.cdsi && t.orf.cdsi.length); } catch (e) { return false; }
                    })();
                    if (!hasOrf) {
                        return (t.name || 'that track') + ' has no protein translation on it, so '
                            + 'there are no protein motifs to find';
                    }
                    return '';
                }
            },

            {
                name: 'mirna_sites',
                summary: 'Scan the selected sequence for canonical microRNA seed sites (6mer, 7mer-A1, '
                    + '7mer-m8, 8mer-1a) from the de-targeting miRNA set, and annotate the hits. '
                    + 'Sequence only, no model.',
                needs: 'selection', params: {},
                run: () => { const t = oneSelTrack(); return exec('baja/bio/mirna/mirna-sites.js', graph, t, rangeOf(t)); }
            },

            // ---------------------------------------------------------------- design -------
            // ---------------------------------------------------------------- building ----
            {
                // THE SPLICED TRANSCRIPT, AS A TRACK. Both right-click menus have carried a
                // Create mRNA item all along; the catalogue is what a typed request can
                // reach, so "create mRNA from DNM1" found nothing.
                name: 'create_mrna',
                summary: 'BUILD THE mRNA (the spliced transcript) from a gene track and put it on '
                    + 'the canvas as a new track: the exons joined in transcription order, no '
                    + 'introns. This is the answer to "create mRNA from X", "make the mRNA", '
                    + '"splice this", "give me the transcript sequence". The new track is '
                    + 'selected, so the models and the designer can be run on it next.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string',
                        about: 'the gene track to build from, by name, as given in canvas_now. '
                            + 'Omit it when there is only one track or one is selected'
                    },
                    part: {
                        type: 'enum', values: ['mRNA', 'CDS', 'Exon'], default: 'mRNA',
                        about: 'mRNA for the whole spliced transcript, which is what is nearly '
                            + 'always meant. CDS builds the coding sequence alone; Exon builds '
                            + 'the exons as annotated'
                    }
                },
                run: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) { result('No single track matches that, so there is nothing to splice.'); return; }
                    const part = /^cds$/i.test(a.part || '') ? 'CDS'
                        : (/^exon$/i.test(a.part || '') ? 'Exon' : 'CDNA');
                    return exec('baja/bio/orfs/make-mrna.js', graph, t, part, genegraph_panel_layout)
                        .then((r) => { if (r && r.error) result(r.error); return r; });
                },
                preview: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    const what = /^cds$/i.test(a.part || '') ? 'the coding sequence'
                        : (/^exon$/i.test(a.part || '') ? 'the exons' : 'the mRNA');
                    return 'build ' + what + ' from ' + (t ? (t.name || 'that track') : ('\u201c' + (a.track || '') + '\u201d'))
                        + ' as a new track';
                },
                argBlocker: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) {
                        return a.track
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to build from: there is more than one open';
                    }
                    // Said before the button is pressed, not after a track appears that is the
                    // whole genomic span under another name.
                    if (!('' + (t.sequence || ''))) return (t.name || 'that track') + ' has no sequence loaded';
                    const ex = (typeof t.getExons === 'function') ? (t.getExons() || [])
                        : ((t.annotations || []).filter((x) => x && x.type === 'Exon'));
                    if (!ex.length) return (t.name || 'that track') + ' has no exons annotated, so there is nothing to splice';
                    return '';
                }
            },

            {
                // COPYING A TRACK IS AN ORDINARY THING TO WANT. Keep the original whole and
                // cut the copy down to the part being worked on, which is why the name
                // usually says what the copy is for ("pathogenic").
                name: 'copy_track',
                summary: 'COPY OR DUPLICATE A TRACK to a new track with a name of its own, '
                    + 'holding the same sequence, annotations, variants, compounds and data '
                    + 'layers. COPY and DUPLICATE mean the same thing here, and this is the '
                    + 'answer to every way of asking for one: "copy this track", "duplicate '
                    + 'this track", "duplicate this track and call the new one pathogenic", '
                    + '"make a copy called X", "clone this track", "save this as a new track", '
                    + '"make another track from this one". The copy is separate: editing it, or '
                    + 'deleting things from it, leaves the original untouched, which is the '
                    + 'whole reason to make one. It appears beside the original and is selected.',
                needs: 'track',
                params: {
                    name: {
                        type: 'string',
                        about: 'what to call the copy, however the request words it: "called '
                            + 'pathogenic", "call the new one pathogenic", "name it pathogenic", '
                            + '"as pathogenic", "to a new track called pathogenic" all give '
                            + 'name="pathogenic". Take the name only, without the words around '
                            + 'it. Omit it and the copy is named after the original with _copy '
                            + 'on the end'
                    },
                    track: {
                        type: 'string',
                        about: 'the track to copy, by name, as given in canvas_now. Omit it for '
                            + '"this track", "the selected track", or when only one is open'
                    }
                },
                run: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) { result('No single track matches that, so there is nothing to copy.'); return; }
                    return exec('baja/bio/copy-track.js', graph, t, a.name || '', genegraph_panel_layout)
                        .then((r) => { if (r && r.error) result(r.error); return r; });
                },
                preview: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    return 'copy ' + (t ? (t.name || 'that track') : ('\u201c' + (a.track || '') + '\u201d'))
                        + ' to a new track'
                        + (a.name ? (' called \u201c' + a.name + '\u201d') : '');
                },
                argBlocker: (a) => {
                    const t = a.track ? matchTrack(a.track) : oneTrack();
                    if (!t) {
                        return a.track
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to copy: there is more than one open';
                    }
                    if (typeof t.copyTrack !== 'function') {
                        return (t.name || 'that track') + ' is not a kind of track that can be copied';
                    }
                    return '';
                }
            },

            {
                // "DESIGN ASOS" OPENS THE ASO DESIGNER. This used to go through
                // tile-oligos-design.js, which refuses outright unless a sequence is already
                // selected -- so with nothing selected, "design asos" put a hint in the status
                // line and opened nothing. It now opens track-design-menu.js, the same path as the
                // track's own Design menu: with a modality it goes straight to that designer's
                // Default / Advanced dialog (aso-design-dialog.js for the ASOs), designing over the
                // selection when there is one and the whole track when there is not. "ASOs" without
                // a kind offers Gapmer and Steric-blocking as a GO each, per track when several
                // are open; no modality at all opens the track's Design library.
                name: 'design_oligos',
                summary: 'DESIGN ASOs, gapmers, steric-blocking / splice-switching ASOs or siRNAs on a '
                    + 'track: "design asos", "design gapmers", "make siRNAs", "design splice-switching '
                    + 'oligos". Opens the design dialog (Default / Advanced) for that modality; the design '
                    + 'runs over the selected sequence, or the whole track when nothing is selected. It '
                    + 'does not design anything until the user presses Run.',
                needs: 'track', opens: true,
                params: {
                    modality: {
                        type: 'enum', values: ['aso', 'gapmer', 'steric', 'sirna'],
                        about: 'gapmer for a gapmer / RNase H ASO, steric for a steric-blocking or '
                            + 'splice-switching ASO, sirna for siRNA, aso when the request says ASOs '
                            + 'without saying which kind (the user is then offered both). Omit only '
                            + 'when no modality is named at all, to open the Design library'
                    },
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one' }
                },
                run: async (a) => {
                    const t = pickTrack(a);
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    const m = a.__modality !== undefined ? a.__modality : (a.modality === 'aso' ? 'gapmer' : (a.modality || null));
                    try { graph.selectedTrack = t; } catch (e) { }
                    return exec('baja/manchester/menu/track-design-menu.js', graph, t, genegraph_panel_layout, m);
                },
                preview: (a) => {
                    const t = pickTrack(a);
                    const m = a.__modality !== undefined ? a.__modality : a.modality;
                    const what = { aso: 'the ASO designer', gapmer: 'the gapmer ASO designer', steric: 'the steric-blocking ASO designer',
                        sirna: 'the siRNA designer' }[m] || 'the Design library';
                    return 'open ' + what + (t ? (' on ' + (t.name || 'the track')) : '')
                        + (t ? (hasSel(t) ? ', over the selected sequence' : ', over the whole track') : '');
                },
                // One GO per (kind, track): "ASOs" is two kinds, and several open tracks with none
                // selected is several targets.
                choices: (a) => {
                    if (a.__track && a.__modality !== undefined) return [];
                    const KIND = { gapmer: 'Gapmer ASO (RNase H)', steric: 'Steric-blocking / splice-switching ASO', sirna: 'siRNA' };
                    const kinds = a.modality === 'aso' ? ['gapmer', 'steric'] : [a.modality || null];
                    const one = a.__track || (a.track ? matchTrack(a.track) : oneTrack());
                    const ts = one ? [one] : tracks();
                    const out = [];
                    for (const t of ts) for (const k of kinds) {
                        out.push({
                            label: (k ? KIND[k] : 'Design library') + (ts.length > 1 ? (' · ' + (t.name || 'track')) : ''),
                            detail: (t.name || 'track') + ' · ' + (hasSel(t) ? 'over the selected sequence' : 'over the whole track'),
                            args: Object.assign({}, a, { __track: t, __modality: k })
                        });
                    }
                    return out;
                },
                choiceTitle: (a, ch) => (a.modality === 'aso' ? 'Design ASOs — which kind?' : 'Design — on which track?'),
                argBlocker: (a) => (a.track && !matchTrack(a.track))
                    ? ('no single track matches “' + a.track + '”: open tracks are ' + tracks().map((x) => x.name || '(unnamed)').join(', '))
                    : ''
            },

            {
                name: 'open_library',
                summary: 'OPEN A LIBRARY and let the user pick from it. This is the answer when the '
                    + 'request names a KIND of thing rather than one operation -- "show me the ML '
                    + 'options", "what data can I load", "what modalities are there" -- and when the '
                    + 'exact thing asked for is not an operation here but lives inside one of these '
                    + 'shelves. A shelf that lists the real choices beats refusing.',
                opens: true,
                params: {
                    library: {
                        type: 'enum',
                        values: ['ml_models', 'ml_models_reference', 'data', 'data_reference',
                            'design_modalities', 'chemistry', 'clinical_compounds', 'drawing',
                            'across_tracks', 'everything'],
                        required: true,
                        about: 'ml_models: the models as things to RUN on a track (BajaCLIP, BajaSplice, '
                            + 'BajaIR, djPrimer). ml_models_reference: what each model is, its evidence '
                            + 'and its limits, changing nothing. data: every dataset that can be loaded '
                            + 'as a layer. data_reference: what each data source is and what it does not '
                            + 'support. design_modalities: the design space as a map, every modality with '
                            + 'its precedent. chemistry: reference reading on oligonucleotide chemistry. '
                            + 'clinical_compounds: clinical RNA compounds with their trial records. '
                            + 'drawing: the drawing and annotation tools. across_tracks: operations '
                            + 'spanning several tracks. everything: the library of all the libraries, '
                            + 'for a request too broad to place'
                    }
                },
                run: (a) => {
                    const PATHS = {
                        ml_models: ['baja/ml/models-library.js', true],
                        ml_models_reference: ['baja/ml/institute-of-models-library.js', false],
                        data: ['baja/data/data-resources-library.js', true],
                        data_reference: ['baja/data/data-loading-library.js', false],
                        design_modalities: ['baja/lib/institute-rna-design.js', false],
                        chemistry: ['baja/lib/rna-chemistry-library.js', false],
                        clinical_compounds: ['manchester/clinical-library.js', false],
                        drawing: ['baja/manchester/menu/draw-tools-library.js', false],
                        across_tracks: ['baja/manchester/menu/across-tracks.js', false],
                        everything: ['baja/lib/library-of-libraries.js', false]
                    };
                    const e = PATHS[a.library];
                    if (!e) { result('No such library: ' + a.library); return; }
                    try { graph.showSideMenu(null); } catch (e2) { }
                    // The shelves that load onto a track take the set to load onto; the
                    // reading rooms take none and would ignore a third argument anyway.
                    // Passed explicitly rather than always, so a reading room cannot end up
                    // with a track list it was never written to read.
                    return e[1]
                        ? exec(e[0], graph, genegraph_panel_layout, scopeTracks())
                        : exec(e[0], graph, genegraph_panel_layout);
                },
                preview: (a) => {
                    const NAMES = {
                        ml_models: 'the machine learning models, to run one',
                        ml_models_reference: 'what each model is and what it is worth',
                        data: 'the data that can be loaded onto a track',
                        data_reference: 'what each data source is',
                        design_modalities: 'the design space, modality by modality',
                        chemistry: 'the RNA chemistry reading shelf',
                        clinical_compounds: 'the clinical compounds and their trials',
                        drawing: 'the drawing and annotation tools',
                        across_tracks: 'what can be done across several tracks',
                        everything: 'every library there is'
                    };
                    return 'open ' + (NAMES[a.library] || a.library);
                }
            },

            // ---------------------------------------------------------------- selecting ----
            {
                name: 'select_variants',
                summary: 'Select the variants matching a search query, anywhere on the canvas.',
                needs: 'variants',
                params: {
                    query: {
                        type: 'string',
                        about: "the editor's variant search language: words matched anywhere in the "
                            + "record, * and ? as wildcards against a whole field, -word to exclude, "
                            + "field:word to restrict. Empty means every variant. Fields: name, gene, "
                            + "clinsig, condition, consequence, source, type, ref, alt, change, pos, "
                            + "annotations, batch, phase, side. phase is the variant's phase number (0, 1, 2, ...) "
                            + "and matches exactly: \"phase 1\" is phase:1. side is where its lollipop is drawn: "
                            + "side:top stands up above the track line, side:bottom hangs down below it. "
                            + "\"the top phase\", \"the upper ones\", \"the ones above the track\" are side:top; "
                            + "\"the bottom phase\", \"the lower ones\", \"below the track\" are side:bottom"
                    }
                },
                count: (a) => vhits(a.query).length,
                run: (a) => {
                    const hits = vhits(a.query);
                    selectVariants(hits);
                    result('Selected ' + hits.length + ' of ' + vrows().length + ' variants.');
                },
                preview: (a) => 'select the variants ' + (('' + (a.query || '')).trim()
                    ? ('matching “' + a.query + '”') : '(all of them)')
            },
            {
                // THE OFF-TARGET REPORT, from results already on the compounds. "show me the
                // off-target report" was refused as not something the editor does, though the
                // report itself has been in Compounds all along -- the catalogue could run a
                // screen and could fold off-targets into a design report, but had no way to
                // just show what the last screen found.
                name: 'show_offtarget_report',
                summary: 'SHOW THE OFF-TARGET REPORT for the compounds: which genes they hit, as two '
                    + 'tables -- by gene (which genes this set keeps running into) and by compound '
                    + '(what each one hits) -- with downloads. "show me the off-target report", "what '
                    + 'did the off-target screen find", "which genes do these hit", "off-target '
                    + 'results". It reads the results already stored on the compounds and runs '
                    + 'nothing; use run_offtarget_screen to actually screen them.',
                needs: 'compounds', opens: true,
                params: {
                    scope: {
                        type: 'enum', values: ['all', 'selected'],
                        about: 'selected for "these" or "the selected ones". Omit to report on the '
                            + 'selection when there is one and on every compound otherwise'
                    },
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one' }
                },
                count: (a) => reportSet(a).list.length,
                run: (a) => {
                    const { list } = reportSet(a);
                    if (!list.length) { result('No compounds to report on.'); return; }
                    return exec('baja/manchester/menu/selected-off-target-genes.js', graph, list);
                },
                preview: (a) => {
                    if (a.track && !matchTrack(a.track)) return 'show the off-target report for \u201c' + a.track + '\u201d';
                    const { list, where } = reportSet(a);
                    const n = list.filter((o) => o && o.offtargetsRun).length;
                    // How many have actually been screened is the thing worth knowing before
                    // opening it: a table of "not screened" is a different answer from a clean one.
                    return 'show the off-target report for ' + list.length + ' compound'
                        + (list.length === 1 ? '' : 's') + where
                        + ' \u00b7 ' + (n ? (n + ' screened') : 'none screened yet');
                },
                argBlocker: (a) => {
                    if (a.track && !matchTrack(a.track)) return 'no single track matches \u201c' + a.track + '\u201d';
                    const { list } = reportSet(a);
                    if (!list.length) {
                        return (a.scope === 'selected') ? 'no compounds are selected' : 'no compounds to report on';
                    }
                    return '';
                }
            },
            {
                // OFF-TARGET SCREENING FROM THE BOX. The screens have always been in Design >
                // Off-targets; nothing in the catalogue reached them, so "run off-targets on
                // compounds with no off-target values" came back as not something the editor
                // does. The "no off-target values" part is a scope the screens did not have
                // either: `unscreened` was added to them for this, so the compounds that have
                // never been screened can be screened without first selecting them by hand.
                name: 'run_offtarget_screen',
                summary: 'RUN AN OFF-TARGET SCREEN on the compounds of a track: "run off-targets", '
                    + '"screen these ASOs for off-targets", "run off-targets on compounds with no '
                    + 'off-target values", "screen the selected compounds". Results attach to the '
                    + 'compounds, so the design report and the off-target filters read them afterwards.',
                needs: 'compounds', opens: true,
                params: {
                    scope: {
                        type: 'enum', values: ['all', 'unscreened', 'selected'], default: 'all',
                        about: 'which compounds. unscreened is the ones that have NO off-target value '
                            + 'yet -- "compounds with no off-target values", "the ones that have not '
                            + 'been screened", "whatever is missing". selected is the ones currently '
                            + 'selected. all is every compound on the track'
                    },
                    method: {
                        type: 'enum', values: ['full', 'seed', 'fuzzy'], default: 'full',
                        about: 'full screens the whole antisense strand and is the default for an ASO. '
                            + 'seed screens positions 2-8 of the guide, which is what drives siRNA '
                            + 'off-target silencing. fuzzy is a tolerant edit-distance search that also '
                            + 'finds near-matches, and it always covers every compound on the track'
                    },
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one' }
                },
                count: (a) => screenPool(a).list.length,
                run: (a) => {
                    const { t, list } = screenPool(a);
                    if (!t) { result('No compounds on any open track to screen.'); return; }
                    const m = a.method || 'full';
                    if (m === 'fuzzy') {
                        return exec('baja/data/aso-offtarget.js', '', window['env']['apiUrl'],
                            graph, genegraph_panel_layout, t);
                    }
                    if (!list.length) { result('No compounds in that scope to screen.'); return; }
                    // true keeps the tools' original meaning of 'selected'; the word is the new scope.
                    const scope = (a.scope === 'selected') ? true
                        : (a.scope === 'unscreened' ? 'unscreened' : false);
                    return exec(m === 'seed'
                        ? 'baja/manchester/menu/run-off-target-tool-seed-seq.js'
                        : 'baja/manchester/menu/run-off-target-tool.js',
                        graph, genegraph_panel_layout, scope, t);
                },
                preview: (a) => {
                    if (a.track && !matchTrack(a.track)) return 'screen \u201c' + a.track + '\u201d for off-targets';
                    const { t, list } = screenPool(a);
                    const m = a.method || 'full';
                    const how = { full: 'the full antisense strand', seed: 'the seed region (positions 2-8)',
                        fuzzy: 'a fuzzy edit-distance search' }[m];
                    const what = (m === 'fuzzy') ? 'every compound'
                        : (list.length + ' ' + ({ unscreened: 'never-screened ', selected: 'selected ' }[a.scope] || '')
                            + 'compound' + (list.length === 1 ? '' : 's'));
                    return 'screen ' + what + (t ? (' on ' + (t.name || 'the track')) : '') + ' for off-targets, using ' + how;
                },
                argBlocker: (a) => {
                    if (a.track && !matchTrack(a.track)) {
                        return 'no single track matches \u201c' + a.track + '\u201d';
                    }
                    const { t, list } = screenPool(a);
                    if (!t) return 'no open track carries compounds';
                    // The fuzzy search takes no scope, so asking for one would run something
                    // other than what was asked for. Said before the button, not after it.
                    if ((a.method === 'fuzzy') && a.scope && a.scope !== 'all') {
                        return 'the fuzzy search screens every compound on the track; it cannot be limited to the '
                            + a.scope + ' ones. Use the full or seed screen for that';
                    }
                    if (!list.length) {
                        if (a.scope === 'unscreened') {
                            return 'every compound on ' + (t.name || 'that track') + ' has already been screened';
                        }
                        if (a.scope === 'selected') return 'no compounds are selected on ' + (t.name || 'that track');
                        return 'no compounds on ' + (t.name || 'that track');
                    }
                    return '';
                }
            },
            {
                // "generate aso report" came back as "not something the editor can do", though
                // Design > Therapeutics has written this report all along. The report itself is
                // unchanged; it is reachable from the box now.
                name: 'generate_design_report',
                summary: 'GENERATE THE DESIGN REPORT for the compounds on a track: "generate aso '
                    + 'report", "generate oligo report", "write the design report", "report on these '
                    + 'ASOs". It gathers the target, the layers, the compounds, their chemistry and '
                    + 'their off-targets and writes them up, and where the compounds are '
                    + 'allele-selective it adds a section ordering them by how far they diverge from '
                    + 'the reference. The report opens in a reader that can save it as PDF or markdown.',
                needs: 'compounds', opens: true,
                params: {
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one' }
                },
                run: (a) => {
                    const t = compoundTrack(a);
                    if (!t) { result('No compounds on any open track to report on.'); return; }
                    return exec('baja/manchester/menu/design-report.js', graph, genegraph_panel_layout, t);
                },
                preview: (a) => {
                    // A name that matches nothing must not read as a report on some other
                    // track: the blocker stops the run either way, but the line above it is
                    // what the user actually reads.
                    if (a.track && !matchTrack(a.track)) return 'write the design report for \u201c' + a.track + '\u201d';
                    const t = compoundTrack(a);
                    const n = t ? (t.oligos || []).length : 0;
                    return 'write the design report' + (t ? (' for ' + n + ' compound' + (n === 1 ? '' : 's')
                        + ' on ' + (t.name || 'the track')) : '');
                },
                // Several tracks carry compounds: the report covers ONE track, so which one is the
                // user's call rather than whichever comes first.
                choices: (a) => {
                    if (a.__track || a.track) return [];
                    const withC = tracks().filter((x) => (x.oligos || []).length);
                    if (withC.length < 2) return [];
                    return withC.map((t) => ({
                        label: t.name || '(unnamed track)',
                        detail: (t.oligos || []).length + ' compound' + ((t.oligos || []).length === 1 ? '' : 's')
                            + ((t.oligos || []).some((o) => o && o.alleleSelective) ? ' \u00b7 allele-selective' : ''),
                        args: Object.assign({}, a, { __track: t })
                    }));
                },
                choiceTitle: () => 'Design report \u2014 for which track?',
                argBlocker: (a) => (a.track && !matchTrack(a.track))
                    ? ('no single track matches \u201c' + a.track + '\u201d')
                    : ''
            },
            {
                // PLACE A NAMED VARIANT ON THE TRACK. "add this mutation R237W to the DNM1
                // track" had nowhere to go: the facility exists -- it is "Describe a variant"
                // in the data library -- and the ask box could not reach it, so the planner
                // reported that the editor does not do this at all.
                //
                // It is annotation, not editing. The resolver normalises the description, the
                // CHECK is done against the track's own coding sequence base by base
                // (py/bio/variant-from-prompt.py), and what lands is a marker on the view. No
                // sequence record is altered by it.
                name: 'add_variant_from_description',
                summary: 'PUT A VARIANT NAMED IN WORDS ONTO A TRACK, as a marker: a protein '
                    + 'change ("R237W", "p.Arg175His", "K27M"), a cDNA change ("c.83A>T"), an '
                    + 'rsID, or a codon-level edit. "add this mutation R237W to the DNM1 track", '
                    + '"put p.Arg175His on TP53", "mark c.83A>T", "annotate R237W here". The '
                    + 'description is checked against the track\'s own coding sequence before '
                    + 'anything is placed, and the user confirms it. For KNOWN variants from a '
                    + 'database use load_variants instead; this one is for a change named '
                    + 'directly in the request.',
                needs: 'track', opens: true,
                params: {
                    description: {
                        type: 'string', required: true,
                        about: 'the change exactly as the request names it: "R237W", '
                            + '"p.Arg175His", "c.83A>T", "rs113994095". Pass the variant alone, '
                            + 'without the track name or the surrounding sentence'
                    },
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one' }
                },
                run: (a) => {
                    const t = pickTrack(a);
                    const list = t ? [t] : (selTracks().length ? selTracks() : tracks());
                    if (!list.length) { result('No track to put it on.'); return; }
                    return exec('baja/data/variant-from-prompt.js', server(), graph,
                        genegraph_panel_layout, list, ('' + (a.description || '')).trim());
                },
                preview: (a) => {
                    const t = pickTrack(a);
                    return 'place ' + (a.description ? ('\u201c' + a.description + '\u201d') : 'the variant')
                        + ' on ' + (t ? (t.name || 'the track') : 'the track')
                        + ', checked against its coding sequence first';
                },
                choices: (a) => choicesOver(a, (x) => (x && x.sequence) ? { detail: x.name || 'track' } : null),
                choiceTitle: () => 'Put it on which track?',
                argBlocker: (a) => {
                    if (!('' + (a.description || '')).trim()) return 'say which change to add, e.g. R237W';
                    const t = pickTrack(a);
                    if (!t) {
                        if (!a.track && choicesOver(a, (x) => (x && x.sequence) ? {} : null).length) return '';
                        return (a && a.track)
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to put it on: there is more than one open';
                    }
                    return '';
                }
            },
            {
                // The Variant designer: every variant ranked by how far its window has diverged
                // from the reference, with the compounds tiled on each and a GO to it.
                name: 'open_variant_designer',
                summary: 'OPEN THE VARIANT DESIGNER: a ranked list of every variant by its divergence '
                    + 'from the reference over a window of bases around it, with the number of compounds '
                    + 'tiled on each and a GO to its location. "open the variant designer", "rank the '
                    + 'variants by divergence", "which variants diverge most from the reference", "which '
                    + 'variants have compounds on them".',
                needs: 'variants', opens: true,
                params: {
                    window: { type: 'number', about: 'the window size in nt when the request gives one ("over 100 bases"). Omit to keep the last one used (50 the first time)' },
                    track: { type: 'string', about: 'one track, by name, when the request names one. Omit for every track' }
                },
                run: (a) => {
                    try {
                        const S = graph.__variantDesigner || (graph.__variantDesigner = { W: 50, samePhase: false, track: null, sort: 'divergence', scroll: 0 });
                        if (a.window != null && +a.window >= 1) S.W = Math.round(+a.window);
                    } catch (e) { }
                    return exec('baja/manchester/menu/variant-designer.js', graph, genegraph_panel_layout, a.track ? (matchTrack(a.track) || null) : null);
                },
                preview: (a) => 'open the Variant designer' + (a.track ? (' on ' + a.track) : '')
                    + (a.window != null ? (', window ' + a.window + ' nt') : ''),
                argBlocker: (a) => (a.track && !matchTrack(a.track)) ? ('no single track matches \u201c' + a.track + '\u201d') : ''
            },
            {
                name: 'remove_variants',
                summary: 'DELETE the variants matching a search query from the tracks.',
                needs: 'variants', destructive: true,
                params: { query: { type: 'string', about: 'same search language as select_variants, fields included (phase:1 for phase 1, side:top / side:bottom for the top or bottom phase). Empty means every variant' } },
                count: (a) => vhits(a.query).length,
                run: (a) => {
                    const hits = vhits(a.query);
                    try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                    const doomed = new Set(hits.map((r) => r.v));
                    let n = 0;
                    for (const t of tracks()) {
                        if (!t.snpindels) continue;
                        const before = t.snpindels.length;
                        t.snpindels = t.snpindels.filter((v) => !doomed.has(v));
                        n += before - t.snpindels.length;
                    }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    try { if (graph.rescale) graph.rescale(); } catch (e) { }
                    result('Removed ' + n + ' variant' + (n === 1 ? '' : 's') + '. Undo restores them.');
                },
                preview: (a) => 'delete the variants ' + (('' + (a.query || '')).trim()
                    ? ('matching “' + a.query + '”') : '(all of them)')
            },
            {
                name: 'clear_variant_selection',
                summary: 'Deselect every variant: the highlighted SNPs and indels. Does not touch '
                    + 'a selected sequence range.',
                needs: 'variants', params: {},
                run: () => { selectVariants([]); result('Variant selection cleared.'); }
            },
            {
                name: 'select_compounds',
                summary: 'Select the compounds (ASOs, siRNAs) matching a FILTER on score band, the '
                    + "scorer's own flags, score, GC, Tm, length, off-target count, modality or name. "
                    + 'This describes compounds by their properties; it does not act on what is '
                    + 'already selected.',
                needs: 'compounds',
                params: {
                    band: { type: 'enum', values: ['red', 'amber', 'notred', 'green'], about: 'red is flagged, amber is red or orange, green is best' },
                    faults: { type: 'enum[]', values: F.FAULTS.map((f) => f.key), about: 'flagged for any of these: ' + F.FAULTS.map((f) => f.key + ' (' + f.label + ')').join(', ') },
                    score_min: { type: 'number' }, score_max: { type: 'number' },
                    gc_min: { type: 'number', about: 'percent' }, gc_max: { type: 'number', about: 'percent' },
                    tm_min: { type: 'number', about: 'degrees C' }, tm_max: { type: 'number', about: 'degrees C' },
                    len_min: { type: 'number', about: 'nt' }, len_max: { type: 'number', about: 'nt' },
                    offtarget_min: {
                        type: 'number',
                        about: 'fewest off-target SITES, counting places in the genome the oligo hits. '
                            + '"more than 10 off-targets" is offtarget_min 11'
                    },
                    offtarget_max: { type: 'number', about: 'most off-target sites. "under 5 off-targets" is 4' },
                    offtarget_genes_min: {
                        type: 'number',
                        about: 'fewest distinct off-target GENES, which is the smaller number. Use this '
                            + 'only when the request says genes; plain "off-targets" means sites'
                    },
                    offtarget_genes_max: { type: 'number', about: 'most distinct off-target genes' },
                    screened: {
                        type: 'boolean',
                        about: 'true keeps only compounds the off-target screen has been RUN on, false '
                            + 'only the ones it has not. A compound that was never screened has an '
                            + 'unknown count and matches no off-target range either way, so it is '
                            + 'never swept up by one'
                    },
                    modality: { type: 'enum', values: ['gapmer', 'steric', 'sirna'] },
                    allele_only: { type: 'boolean', about: 'only allele-selective compounds' },
                    name_contains: { type: 'string' }
                },
                count: (a) => chits(a).length,
                run: (a) => {
                    const hits = chits(a);
                    try {
                        graph.setSelectedCompounds(hits.map((r) => ({ o: r.o, t: r.t })));
                        graph.currentShape = null;
                    } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result('Selected ' + hits.length + ' of ' + crows().length + ' compounds.');
                },
                preview: (a) => 'select the compounds: ' + F.describe(a) + offtargetNote(a)
            },
            {
                name: 'remove_compounds',
                summary: 'DELETE the compounds matching that same FILTER from the tracks. For "delete '
                    + 'the selected compounds", which names no filter, use remove_selected instead.',
                needs: 'compounds', destructive: true,
                params: null,     // filled below: the same params as select_compounds
                count: (a) => chits(a).length,
                run: (a) => {
                    const hits = chits(a);
                    try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                    const doomed = new Set(hits.map((r) => r.o));
                    let n = 0;
                    for (const t of tracks()) {
                        if (!t.oligos) continue;
                        const before = t.oligos.length;
                        t.oligos = t.oligos.filter((o) => !doomed.has(o));
                        n += before - t.oligos.length;
                    }
                    try {
                        graph.setSelectedCompounds((graph.selectedCompounds || [])
                            .filter((s) => s && s.o && !doomed.has(s.o)));
                    } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result('Removed ' + n + ' compound' + (n === 1 ? '' : 's') + '. Undo restores them.');
                },
                preview: (a) => 'delete the compounds: ' + F.describe(a) + offtargetNote(a)
            },
            {
                // BOOKMARK THIS SITE. "bookmark this site dua" used to come back as "not something
                // the editor can do ... likely a browser or application-level feature", because
                // nothing in the catalogue saved a place. The name is whatever the user put after
                // the verb, which is the part the planner has to be told to keep.
                name: 'bookmark_site',
                summary: 'SAVE THE CURRENT VIEW as a named bookmark, to come back to later: "bookmark '
                    + 'this site dua", "bookmark this as the hotspot", "save this view as exon 7", '
                    + '"remember this place". It records where the camera is now and changes nothing '
                    + 'on the canvas.',
                needs: 'track',
                params: {
                    name: {
                        type: 'string', required: true,
                        about: "what to call it, taken from the request itself: in \"bookmark this site "
                            + "dua\" the name is \"dua\", in \"bookmark this as the hotspot\" it is \"the "
                            + "hotspot\". Use the user's own words, without the words bookmark / save / "
                            + "this site"
                    }
                },
                run: (a) => {
                    const r = BM.save(a.name);
                    if (r.error) { result(r.error); return; }
                    result('Bookmarked \u201c' + r.bm.name + '\u201d at ' + BM.where(r.bm)
                        + (r.replaced ? ' \u2014 replaced the earlier one of that name.'
                            : '. Say \u201cgo to ' + r.bm.name + '\u201d to come back.'));
                },
                preview: (a) => 'bookmark this view as \u201c' + a.name + '\u201d'
            },
            {
                name: 'go_to_bookmark',
                summary: 'GO BACK TO A SAVED BOOKMARK: "go to dua", "take me back to the hotspot", "go '
                    + 'to my bookmark". Puts the camera back where it was when the bookmark was saved. '
                    + 'With no name, or when several match, the bookmarks are offered to pick from. Use '
                    + 'this only for a name that was bookmarked; a position such as c.778 is '
                    + 'go_to_position, and a thing on the canvas is zoom_to_objects.',
                needs: 'track',
                params: {
                    name: { type: 'string', about: "the bookmark's name when the request names one. Omit to be offered every bookmark" }
                },
                run: async (a) => {
                    const b = a.__bm || (a.name ? (BM.find(a.name)[0] || null) : null);
                    if (!b) { result(a.name ? ('No bookmark called \u201c' + a.name + '\u201d.') : 'No bookmarks saved yet.'); return; }
                    await BM.go(b);
                    result('Bookmark \u00b7 ' + b.name + ' (' + BM.where(b) + ').');
                },
                preview: (a) => 'go to the bookmark' + (a.name ? (' \u201c' + a.name + '\u201d') : ''),
                choices: (a) => {
                    if (a.__bm) return [];
                    return (a.name ? BM.find(a.name) : BM.list()).map((b) => ({
                        label: b.name, detail: BM.where(b) + ' \u00b7 ' + BM.when(b),
                        args: Object.assign({}, a, { __bm: b })
                    }));
                },
                choiceTitle: () => 'Go to which bookmark?',
                argBlocker: (a) => {
                    if (a.__bm) return '';
                    const hits = a.name ? BM.find(a.name) : BM.list();
                    if (!hits.length) {
                        return a.name ? ('no bookmark called \u201c' + a.name + '\u201d')
                            : 'no bookmarks saved yet: say \u201cbookmark this site <name>\u201d first';
                    }
                    return '';
                }
            },
            {
                name: 'open_bookmarks',
                summary: 'OPEN THE BOOKMARKS PANEL: every saved bookmark, each with a GO and a Delete. '
                    + '"show my bookmarks", "list my bookmarks", "manage bookmarks".',
                opens: true, params: {},
                run: () => { BM.open(); },
                preview: () => 'open the bookmarks panel (' + BM.list().length + ' saved)'
            },
            {
                // WHAT EACH EXON IS WORTH TO THE PROTEIN. The coupling readout on a track is
                // one number for the whole gene -- how far the protein follows its mRNA,
                // measured or predicted -- and it has no exon in it, so it cannot say what
                // losing exon 15 does. This asks the same question per exon, from the skip
                // isoform: drop the exon, translate what is left, and see what comes out.
                name: 'exon_protein_consequence',
                summary: 'FOR EVERY EXON, WHAT SKIPPING IT WOULD DO TO THE PROTEIN: '
                    + 'in-frame loss, a frameshift to a premature stop and whether that is '
                    + 'degraded by NMD or leaves a truncated protein. "what does skipping '
                    + 'each exon do to the protein", "which exons matter", "per-exon protein '
                    + 'consequence", "which exon must not be lost", "map the exon '
                    + 'consequences". Opens a sorted screen, worst first, and each row goes '
                    + 'to its exon. For ONE exon, the exon menu already answers it.',
                needs: 'track',
                params: {
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one: with several open, the user is offered each' }
                },
                run: async (a) => {
                    const t = pickTrack(a);
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    let w = null;
                    try {
                        w = await exec('baja/lib/working.js', 'Exon consequences for ' + (t.name || 'the track'),
                            'Each exon is dropped in turn and what is left is translated.');
                    } catch (e) { w = null; }
                    let rows = [];
                    try {
                        rows = await exec('baja/bio/orfs/exon-consequence-map.js', t, {
                            onStep: (i, n) => { try { if (w) w.step('exon ' + i + ' of ' + n); } catch (e) { } }
                        });
                    } catch (e) {
                        try { if (w) w.fail('Could not read the exons: ' + (e && e.message ? e.message : e)); } catch (e2) { }
                        result('Could not work out the exon consequences for ' + (t.name || 'that track') + '.');
                        return;
                    }
                    try { if (w) w.done(); } catch (e) { }
                    if (!rows.length) {
                        result((t.name || 'That track') + ' has no annotated exons to assess.');
                        return;
                    }
                    const bad = rows.filter((r) => r.ok && r.severity <= 1).length;
                    await exec('baja/bio/orfs/exon-consequence-screen.js', graph, genegraph_panel_layout, {
                        track: t, gene: (t.name || 'this track'), rows: rows,
                        // Closing the screen on a row and landing on that exon is the same
                        // move going to an exon makes, so it is the same code.
                        onGo: async (r) => {
                            try { if (typeof graph.clearSequenceSelections === 'function') graph.clearSequenceSelections(); } catch (e) { }
                            t.markstart = r.start; t.markend = r.end; t.showResizeBar = true;
                            try { graph.startX = t.tgraph.X(r.start); graph.endX = t.tgraph.X(r.end); } catch (e) { }
                            try { graph.selectedTrack = t; } catch (e) { }
                            try { await frameRange(t, r.start, r.end); } catch (e) { }
                            try { if (graph.wake) graph.wake(); } catch (e) { }
                            result('exon ' + r.index + ' \u00b7 ' + (r.ok ? r.verdict : 'not assessed'));
                        }
                    });
                    result(rows.length + ' exons assessed on ' + (t.name || 'the track') + ': '
                        + bad + ' whose loss destroys the message.');
                },
                preview: (a) => {
                    const t = pickTrack(a);
                    const R = t ? regionsNow(t) : null;
                    const n = R ? R.exons().length : 0;
                    return 'work out, for ' + (n ? ('each of the ' + n + ' exons of ') : 'each exon of ')
                        + (t ? (t.name || 'the track') : 'the track')
                        + ', what skipping it would do to the protein \u00b7 in-frame loss, '
                        + 'frameshift to a premature stop, NMD or a truncated protein';
                },
                choices: (a) => choicesOver(a, (x) => {
                    const Rx = regionsNow(x);
                    const l = Rx && Rx.exons();
                    return (l && l.length) ? { detail: l.length + ' exon' + (l.length === 1 ? '' : 's') } : null;
                }),
                choiceTitle: () => 'Assess the exons of which track?',
                argBlocker: (a) => {
                    const t = pickTrack(a);
                    if (!t) {
                        if (!a.track && choicesOver(a, (x) => {
                            const Rx = regionsNow(x);
                            const l = Rx && Rx.exons();
                            return (l && l.length) ? {} : null;
                        }).length) return '';
                        return (a && a.track)
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to assess: there is more than one open';
                    }
                    const R = regionsNow(t);
                    if (R && !R.exons().length) return (t.name || 'That track') + ' has no annotated exons';
                    return '';
                }
            },
            {
                // SHOW ME EACH EXON. Going to one region is an operation; going to all of
                // them in turn was not, so "show me each exon and spend 3 seconds on each"
                // came back as "nothing in the editor does that" -- while the editor could
                // already frame any one of them and had nothing to do but repeat itself.
                name: 'tour_regions',
                summary: 'WALK THROUGH EVERY EXON (or every intron) ON A TRACK IN TURN, '
                    + 'framing each one and holding it before moving to the next: "show me '
                    + 'each exon and spend 3 seconds on each", "step through the exons", '
                    + '"tour the introns", "play through every exon one at a time". It runs '
                    + 'on screen and can be paused, stepped back and forward, and stopped. '
                    + 'For ONE region, use go_to_position instead.',
                needs: 'track',
                params: {
                    region: {
                        type: 'string',
                        about: 'what to step through: "exons" or "introns"',
                        default: 'exons'
                    },
                    seconds: {
                        type: 'string',
                        about: 'how long to hold each one, in seconds, exactly as the request '
                            + 'says it ("3", "1.5"). Omit unless the request gives a time',
                        default: '3'
                    },
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one: with several open, the user is offered each' }
                },
                run: async (a) => {
                    const t = pickTrack(a);
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    const R = await regionsOf(t);
                    if (!R) { result('Could not read the exons of ' + (t.name || 'that track') + '.'); return; }
                    const kind = tourKind(a);
                    const list = (kind === 'intron') ? R.introns() : R.exons();
                    if (!list || !list.length) {
                        result((t.name || 'That track') + ' has no annotated ' + kind + 's to step through.');
                        return;
                    }
                    const items = [];
                    for (let i = 1; i <= list.length; i++) {
                        const got = R.resolve({ region: kind, index: i });
                        if (got && !got.error) {
                            items.push({ label: (t.name || 'Track') + ' \u00b7 ' + got.label,
                                start: got.start, end: got.end });
                        }
                    }
                    if (!items.length) { result('Could not place the ' + kind + 's of ' + (t.name || 'that track') + '.'); return; }
                    const secs = tourSeconds(a);
                    // Selecting and framing are the editor's own, handed to the tour rather
                    // than written again inside it: a stop on exon 7 leaves the editor in
                    // exactly the state that going to exon 7 leaves it in.
                    const r = await exec('baja/bio/region-tour.js', graph, t, items, {
                        seconds: secs,
                        select: (it) => {
                            try { if (typeof graph.clearSequenceSelections === 'function') graph.clearSequenceSelections(); } catch (e) { }
                            t.markstart = it.start;
                            t.markend = it.end;
                            t.showResizeBar = true;
                            try { graph.startX = t.tgraph.X(it.start); graph.endX = t.tgraph.X(it.end); } catch (e) { }
                            try { graph.selectedTrack = t; } catch (e) { }
                            try { if (graph.wake) graph.wake(); } catch (e) { }
                        },
                        frame: (it) => frameRange(t, it.start, it.end)
                    });
                    const n = (r && r.shown) || 0;
                    result((r && r.stopped)
                        ? ('Stopped after ' + n + ' of ' + items.length + ' ' + kind + 's.')
                        : ('Showed all ' + items.length + ' ' + kind + 's of ' + (t.name || 'the track') + '.'));
                },
                preview: (a) => {
                    const t = pickTrack(a);
                    const kind = tourKind(a);
                    const secs = tourSeconds(a);
                    const R = t ? regionsNow(t) : null;
                    const list = R ? ((kind === 'intron') ? R.introns() : R.exons()) : null;
                    const n = list ? list.length : 0;
                    return 'step through ' + (n ? ('all ' + n + ' ' + kind + 's of ') : ('every ' + kind + ' of '))
                        + (t ? (t.name || 'the track') : 'the track')
                        + ', framing each and holding it ' + secs + ' second' + (secs === 1 ? '' : 's')
                        + (n ? (' \u00b7 about ' + Math.round(n * (secs + 0.6)) + ' s, stoppable') : ' \u00b7 stoppable');
                },
                // One Go per track, as everywhere else: each transcript has its own exons.
                choices: (a) => choicesOver(a, (x) => {
                    const Rx = regionsNow(x);
                    if (!Rx) return null;
                    const kind = tourKind(a);
                    const l = (kind === 'intron') ? Rx.introns() : Rx.exons();
                    return l && l.length ? { detail: l.length + ' ' + kind + (l.length === 1 ? '' : 's') } : null;
                }),
                choiceTitle: (a) => 'Step through the ' + tourKind(a) + 's of which track?',
                argBlocker: (a) => {
                    const t = pickTrack(a);
                    const kind = tourKind(a);
                    if (!t) {
                        if (!a.track && choicesOver(a, (x) => {
                            const Rx = regionsNow(x);
                            const l = Rx && ((kind === 'intron') ? Rx.introns() : Rx.exons());
                            return (l && l.length) ? {} : null;
                        }).length) return '';
                        return (a && a.track)
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'say which track to step through: there is more than one open';
                    }
                    const R = regionsNow(t);
                    const l = R && ((kind === 'intron') ? R.introns() : R.exons());
                    if (R && (!l || !l.length)) return (t.name || 'That track') + ' has no annotated ' + kind + 's';
                    return '';
                }
            },
            {
                // GOTO ONE POSITION, zoomed in far enough to read the bases. "goto c.778" was
                // read as select_sequence_region with start=end=778, which counted from the start
                // of the TRACK rather than the A of the ATG, refused outright whenever more than
                // one track was open, and framed a 1-nt selection with a margin of 8 -- nowhere
                // near letter resolution. With several tracks open and none named, this offers a
                // Go per track the position exists on: c.778 is a different place on each
                // transcript, and which one was meant is the user's call.
                name: 'go_to_position',
                summary: 'GO TO A POSITION OR A NAMED REGION on a track and zoom in until it '
                    + 'can be read: "goto c.778", "go to c.-12", "jump to c.*30", "show me '
                    + 'c.1234+5", "take me to position 1520", AND "go to exon 15", "jump to '
                    + 'intron 3", "show me the 3\u2032 UTR". A single position is marked as the '
                    + 'selection; a named region is framed and selected whole, since an exon '
                    + 'is a stretch and showing one base of it would be showing the wrong '
                    + 'thing. Use this, not select_sequence_region, whenever the request is '
                    + 'about GOING somewhere or LOOKING at it.',
                needs: 'track',
                params: {
                    position: {
                        type: 'string', required: true,
                        about: 'the place exactly as written: HGVS coding notation (c.778, c.-12 in '
                            + "the 5' UTR, c.*30 after the stop, c.778+5 in an intron), a plain number, "
                            + 'which is a coordinate counted from the start of the track, or a named '
                            + 'region ("exon 15", "intron 3", "the 3\u2032 UTR", "the CDS")'
                    },
                    track: { type: 'string', about: 'which track, by name. Omit unless the request names one: with several open, the user is offered each' }
                },
                run: async (a) => {
                    const t = pickTrack(a);
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    const R = await regionsOf(t);
                    if (!R) { result('Could not read the exons of ' + (t.name || 'that track') + '.'); return; }
                    const r = R.position(a.position);
                    // A NAMED REGION IS A STRETCH, SO IT IS FRAMED, NOT POINTED AT. Going to
                    // exon 15 and marking one base of it would be showing the wrong thing:
                    // the same framing the selection operations use is what was wanted.
                    if (r.error && r.named) {
                        const got = R.resolve(r.named);
                        if (got.error) { result(got.error); return; }
                        try { if (typeof graph.clearSequenceSelections === 'function') graph.clearSequenceSelections(); } catch (e) { }
                        t.markstart = got.start;
                        t.markend = got.end;
                        t.showResizeBar = true;
                        try { graph.startX = t.tgraph.X(got.start); graph.endX = t.tgraph.X(got.end); } catch (e) { }
                        try { graph.selectedTrack = t; } catch (e) { }
                        try { await frameRange(t, got.start, got.end); } catch (e) { }
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                        result((t.name || 'Track') + ' \u00b7 ' + (got.label || a.position)
                            + ' \u00b7 ' + (got.end - got.start).toLocaleString() + ' bases ('
                            + got.start.toLocaleString() + '\u2013' + got.end.toLocaleString() + ').');
                        return;
                    }
                    if (r.error) { result(r.error); return; }
                    try { if (typeof graph.clearSequenceSelections === 'function') graph.clearSequenceSelections(); } catch (e) { }
                    t.markstart = r.pos;
                    t.markend = r.pos + 1;
                    t.showResizeBar = true;
                    try { graph.startX = t.tgraph.X(r.pos); graph.endX = t.tgraph.X(r.pos + 1); } catch (e) { }
                    try { graph.selectedTrack = t; } catch (e) { }
                    try { await frameBase(t, r.pos); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result((t.name || 'Track') + ' · ' + r.label
                        + (r.label.indexOf('position') === 0 ? '' : (' (track position ' + r.pos.toLocaleString() + ')')) + '.');
                },
                preview: (a) => {
                    const t = pickTrack(a);
                    // With no track settled yet the card still says what KIND of place this is:
                    // reading the region off the first track that has one beats describing
                    // "exon 12" as a base to zoom in to.
                    const t2 = t || tracks().find((x) => {
                        const Rx = regionsNow(x); if (!Rx) return false;
                        const rr = Rx.position(a.position);
                        return rr.error ? !!(rr.named && !Rx.resolve(rr.named).error) : true;
                    }) || null;
                    const R = regionsNow(t2);
                    const r = R ? R.position(a.position) : null;
                    if (r && r.error && r.named && R) {
                        const got = R.resolve(r.named);
                        if (!got.error) {
                            // The size belongs to the track it was measured on: with no track
                            // settled it is a different number on each, so it is left to the
                            // per-track choices rather than quoted here as if it were one.
                            return 'go to ' + (got.label || a.position)
                                + (t ? (' on ' + (t.name || 'the track') + ' and frame it \u00b7 '
                                    + (got.end - got.start).toLocaleString() + ' bases')
                                    : ' and frame it, whole');
                        }
                    }
                    return 'go to ' + a.position + (t ? (' on ' + (t.name || 'the track')) : '')
                        + ((r && !r.error) ? (' (track position ' + r.pos.toLocaleString() + ')') : '')
                        + ', zoomed in to the bases';
                },
                // A NAMED REGION GETS ONE GO PER TRACK, LIKE EVERY OTHER PLACE. This asked
                // position() and handed back whatever it returned, so a named region -- which
                // position() reports as an error because it is a stretch -- produced no choices
                // at all: "goto exon 12" with four transcripts open went straight to a single
                // GO and landed on whichever track happened to be selected. Exon 12 is a
                // different stretch on every transcript, and which one was meant is the user's
                // call, so each track that has one is offered with its own size and place.
                choices: (a) => choicesOver(a, (x) => {
                    const R = regionsNow(x); if (!R) return null;
                    const r = R.position(a.position);
                    if (r.error && r.named) {
                        const got = R.resolve(r.named);
                        if (got.error) return got;
                        return { detail: (got.label || a.position) + ' \u00b7 '
                            + (got.end - got.start).toLocaleString() + ' bases \u00b7 '
                            + got.start.toLocaleString() + '\u2013' + got.end.toLocaleString() };
                    }
                    if (r.error) return r;
                    return { detail: r.label + ' is track position ' + r.pos.toLocaleString() };
                }),
                choiceTitle: () => 'Go there on which track?',
                argBlocker: (a) => {
                    const t = pickTrack(a);
                    if (!t || (!a.track && !a.__track)) {
                        // No track named: fine when the position exists on at least one track.
                        const placeOn = (x) => {
                            const Rx = regionsNow(x);
                            if (!Rx) return null;
                            const rr = Rx.position(a.position);
                            if (rr.error && rr.named) { const g = Rx.resolve(rr.named); return g.error ? null : g; }
                            return rr.error ? null : rr;
                        };
                        const n = choicesOver(a, placeOn).length;
                        if (n) return '';
                        if (!a.track && tracks().length > 1) {
                            const why = tracks().map((x) => {
                                const R = regionsNow(x);
                                const r = R && R.position(a.position);
                                if (r && r.error && r.named) return R.resolve(r.named).error;
                                return r && r.error;
                            }).find(Boolean);
                            return why || ('no open track has ' + a.position);
                        }
                    }
                    if (!t) {
                        return a.track
                            ? ('no single track matches “' + a.track + '”: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'which track? click one first';
                    }
                    const R = regionsNow(t);
                    if (!R) return '';
                    // A NAMED REGION IS NOT A FAILED POSITION. position() reports one as an
                    // error because it cannot return a point for a stretch, and passing that
                    // error straight through here refused the whole card: the operation
                    // frames the stretch instead, so the only thing that blocks is a region
                    // the track does not have.
                    const r = R.position(a.position);
                    if (r.error && r.named) return R.resolve(r.named).error || '';
                    return r.error || '';
                }
            },
            {
                // ZOOM TO WHATEVER ON THE CANVAS MATCHES SOME WORDS. "zoom into the pathogenic
                // variant" names a thing by what it IS, not where it is, so this searches every
                // object the canvas holds -- variants by their whole record (clinical
                // significance, condition, consequence, gene, change), compounds, annotations
                // such as exons, and the tracks themselves -- and offers a GO per hit, each
                // zooming to letter resolution. One hit just goes there.
                name: 'zoom_to_objects',
                summary: 'FIND AND ZOOM TO objects on the canvas by keywords: "zoom into the pathogenic '
                    + 'variant", "take me to the ASO", "show me exon 7", "go to the frameshift", "where is '
                    + 'rs6025". Searches variants, compounds, annotations and tracks, and offers one GO per '
                    + 'match, each zooming in until the bases can be read. Use this when the request names '
                    + 'WHAT to look at; use go_to_position when it names a position such as c.778.',
                params: {
                    query: {
                        type: 'string', required: true,
                        about: 'the words that identify the object, as they would appear on it: '
                            + '"pathogenic", "frameshift", "rs6025", "exon 7", an oligo name. Spell them '
                            + 'correctly ("pathologic" means pathogenic). Every word must match. Leave out '
                            + 'the kind of object; that goes in kind'
                    },
                    kind: {
                        type: 'enum', values: ['any', 'variants', 'compounds', 'annotations', 'tracks'],
                        default: 'any',
                        about: 'what sort of object, when the request says ("the pathogenic VARIANT" is variants)'
                    }
                },
                run: async (a) => {
                    let h = a.__hit;
                    if (!h) {
                        const hits = objectHits(a);
                        if (!hits.length) { result('Nothing on the canvas matches \u201c' + a.query + '\u201d.'); return; }
                        if (hits.length > 1) { result(hits.length + ' objects match \u201c' + a.query + '\u201d: ask again and pick one.'); return; }
                        h = hits[0];
                    }
                    if (h.kind === 'variant') {
                        try { selectVariants([{ v: h.ref }]); } catch (e) { }
                    }
                    try { graph.selectedTrack = h.track; } catch (e) { }
                    try { await frameRange(h.track, h.lo, h.hi); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result(h.label + ' \u00b7 ' + (h.track.name || 'track') + '.');
                },
                count: (a) => objectHits(a).length,
                preview: (a) => {
                    const n = objectHits(a).length;
                    const what = (a.kind && a.kind !== 'any') ? a.kind : 'objects';
                    return n === 1 ? ('zoom to the one ' + what.replace(/s$/, '') + ' matching \u201c' + a.query + '\u201d')
                        : ('zoom to ' + what + ' matching \u201c' + a.query + '\u201d');
                },
                choices: (a) => {
                    if (a.__hit) return [];
                    return objectHits(a).map((h) => ({ label: h.label, detail: h.detail, args: Object.assign({}, a, { __hit: h }) }));
                },
                choiceTitle: (a, ch) => ch.length + ' match \u201c' + a.query + '\u201d \u2014 zoom to which?',
                argBlocker: (a) => objectHits(a).length ? '' : ('nothing on the canvas matches \u201c' + a.query + '\u201d')
            },
            {
                name: 'select_sequence_region',
                summary: 'Select a named part of the transcript as the sequence selection: the '
                    + "5' UTR, the 3' UTR, the coding region, a numbered exon or intron, the whole "
                    + 'transcript, or an explicit coordinate range. This is the selection every '
                    + 'model and design runs on, so it is the step that comes before "which RBP '
                    + 'binds this" or "load variants over the selection" when the user names a '
                    + 'region instead of dragging one. To GO TO a single position ("goto c.778") '
                    + 'use go_to_position instead.',
                needs: 'track',
                params: {
                    region: {
                        type: 'enum',
                        values: ['five_prime_utr', 'three_prime_utr', 'cds', 'transcript', 'exon', 'intron', 'coordinates'],
                        required: true,
                        about: "which part. cds is the coding sequence (also called the ORF or the "
                            + "translated region). Use exon or intron with index, and coordinates "
                            + "with start and end"
                    },
                    index: { type: 'number', about: 'which exon or intron, counting from 1 along the transcript' },
                    start: { type: 'number', about: 'with region=coordinates: the first base, counting from the start of the track' },
                    end: { type: 'number', about: 'with region=coordinates: the last base' },
                    track: { type: 'string', about: 'which track, by name. Omit when there is only one, or to use the selected one' },
                    // "SELECT EXON 15 AND EXON 16" IS TWO STEPS, the second one adding.
                    add: {
                        type: 'boolean', default: false,
                        about: 'true to ADD this region to what is already selected rather than '
                            + 'replacing it. A request naming several regions at once -- "select '
                            + 'exon 15 and exon 16", "select the 5\u2019 and 3\u2019 UTRs" -- is one '
                            + 'step per region, the FIRST with add omitted and every one after it '
                            + 'with add true. Regions that touch or overlap are merged into one'
                    }
                },
                run: async (a) => {
                    const t = pickTrack(a);
                    if (!t) { result('Which track? Name it, or click one first.'); return; }
                    const R = await regionsOf(t);
                    if (!R) { result('Could not read the regions of ' + (t.name || 'that track') + '.'); return; }
                    const r = R.resolve(a);
                    if (r.error) { result(r.error); return; }
                    const adding = !!a.add && typeof t.addMark === 'function'
                        && t.markstart != null && t.markend != null && t.markend > t.markstart;
                    if (!adding) {
                        // Clear first: a second region selection should REPLACE the first, not leave
                        // a stale mark on another track that every later "over the selection" step
                        // would then silently include.
                        try {
                            if (typeof graph.clearSequenceSelections === 'function') graph.clearSequenceSelections();
                        } catch (e) { }
                        try { if (typeof t.keepOneMark === 'function') t.keepOneMark(); } catch (e) { }
                        t.markstart = r.start;
                        t.markend = r.end;
                    } else {
                        // Added to this track, and nothing is cleared: clearing is what makes a
                        // plain selection a replacement, and this is the opposite of that.
                        t.addMark(r.start, r.end);
                    }
                    t.showResizeBar = true;
                    // startX/endX are world coordinates and are what zoomToSelection reads; a
                    // selection made here should behave like one made by dragging. select_ is
                    // deliberately left alone: it marks a drag IN PROGRESS, and setting it would
                    // let the next mouse-up overwrite this.
                    try {
                        graph.startX = t.tgraph.X(r.start);
                        graph.endX = t.tgraph.X(r.end);
                    } catch (e) { }
                    // Frame it, with a margin. A selection off screen is not visibly a selection,
                    // and the next thing anyone does with a region is look at it.
                    try {
                        const tg = t.tgraph;
                        const pad = Math.max(8, (r.end - r.start) * 0.06);
                        const cy = tg.yi + (tg.height || 0) / 2, h = Math.abs(tg.height || 0) || 0.1;
                        if (graph.zoomRect) await graph.zoomRect(tg.X(r.start - pad), tg.X(r.end + pad),
                            cy + h * 3.6, cy - h * 2.2, 400);
                    } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    // WHICH ONE THE NEXT STEP WILL USE, said while the user can still change
                    // it. An operation that takes a single region takes the FIRST, because
                    // that is where markstart/markend still points and because a fixed rule is
                    // one someone can hold in their head.
                    let extra = '';
                    try {
                        const all = (typeof t.getSelectedRanges === 'function') ? t.getSelectedRanges() : [];
                        if (all.length > 1) {
                            extra = ' ' + all.length + ' regions are now selected on this track, '
                                + (typeof t.selectedLength === 'function' ? t.selectedLength().toLocaleString() : '?')
                                + ' nt in all. An operation that takes one region takes the first.';
                        }
                    } catch (e) { }
                    result((adding ? 'Added the ' : 'Selected the ') + r.label + ' of '
                        + (t.name || 'the track') + ': '
                        + (r.end - r.start).toLocaleString() + ' nt, ' + r.start.toLocaleString()
                        + ' to ' + r.end.toLocaleString() + '.' + extra);
                },
                preview: (a) => {
                    const t = pickTrack(a);
                    const R = regionsNow(t);
                    const where = t ? (' of ' + (t.name || 'the track')) : '';
                    if (R) {
                        const r = R.resolve(a);
                        if (!r.error) return (a.add ? 'add the ' : 'select the ') + r.label + where + ': '
                            + (r.end - r.start).toLocaleString() + ' nt'
                            + (a.add ? ', keeping what is already selected' : '');
                    }
                    const what = ('' + (a.region || '')).replace(/_/g, ' ')
                        + ((a.index != null) ? (' ' + a.index) : '');
                    return 'select the ' + what + where;
                },
                // Only when no single track is implied: a selection or a clicked track still
                // decides it, as before.
                choices: (a) => oneTrack() ? [] : choicesOver(a, (x) => {
                    const R = regionsNow(x); if (!R) return null;
                    const r = R.resolve(a); if (r.error) return r;
                    return { detail: r.label + ': ' + (r.end - r.start).toLocaleString() + ' nt, '
                        + r.start.toLocaleString() + ' to ' + r.end.toLocaleString() };
                }),
                // Resolved before the button so "this transcript has 11 exons, so there is no
                // exon 14" is something the user reads instead of a run that does nothing.
                argBlocker: (a) => {
                    const t = pickTrack(a);
                    if (!t) {
                        if (!a.track && choicesOver(a, (x) => regionsNow(x) && regionsNow(x).resolve(a)).length > 1) return '';
                        return a.track
                            ? ('no single track matches \u201c' + a.track + '\u201d: open tracks are '
                                + tracks().map((x) => x.name || '(unnamed)').join(', '))
                            : 'more than one track is open: name the one you mean';
                    }
                    const R = regionsNow(t);
                    if (!R) return '';          // not loaded yet; run() resolves and reports
                    const r = R.resolve(a);
                    return r.error || '';
                }
            },
            {
                name: 'clear_sequence_selection',
                summary: 'Drop the selected sequence: the marked stretch on a track, made by '
                    + 'dragging across it. This is what "deselect", "deselect sequence", "clear '
                    + 'the selection" and "unselect the region" mean when a stretch of sequence '
                    + 'is marked. It does not touch selected variants or compounds.',
                needs: 'any_selection', params: {},
                count: () => selTracks().length,
                run: () => {
                    // gene.js owns this because clearing a range also has to reset the drag
                    // state that created it, or the next mouse-up re-applies the range just
                    // cleared. Falling back to clearing the marks here keeps the operation
                    // working against a gene.js that predates the method -- and the count is
                    // taken BEFORE, so a failure cannot report itself as "nothing was
                    // selected", which is the one wrong answer available here.
                    const before = selTracks().length;
                    let done = false;
                    if (typeof graph.clearSequenceSelections === 'function') {
                        try { graph.clearSequenceSelections(); done = true; } catch (e) { done = false; }
                    }
                    if (!done) {
                        for (const t of selTracks()) {
                            try { t.markstart = null; t.markend = null; t.showResizeBar = false; } catch (e) { }
                        }
                        try { graph.select_ = false; graph.startX = null; graph.endX = null; graph.__dragMark = null; } catch (e) { }
                    }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    const left = selTracks().length;
                    if (left) { result('Could not clear the selection on ' + left + ' track' + (left === 1 ? '' : 's') + '.'); return; }
                    result(before ? ('Cleared the selected sequence on ' + before + ' track' + (before === 1 ? '' : 's') + '.')
                        : 'No sequence was selected.');
                },
                preview: () => {
                    const s = selTracks();
                    return 'drop the selected sequence on ' + (s.length
                        ? s.map((t) => t.name || 'a track').join(', ') : 'any track that has one');
                }
            },
            {
                name: 'remove_selected',
                summary: 'DELETE whatever is currently selected, of one kind: the compounds, the '
                    + 'variants, the annotations or the primers. This is the one to use when the '
                    + 'request says "the selected ones" or "these", rather than describing them by '
                    + 'a filter.',
                destructive: true,
                params: {
                    kind: {
                        type: 'enum', values: ['compounds', 'variants', 'annotations', 'primers'],
                        required: true,
                        about: 'which kind of selected object to delete. compounds covers ASOs and '
                            + 'siRNAs; primers covers primer-probe sets'
                    }
                },
                count: (a) => selCountOf(a.kind),
                run: (a) => {
                    const k = SEL_KINDS[a.kind];
                    if (!k) { result('No such kind: ' + a.kind); return; }
                    const before = selCountOf(a.kind);
                    if (!before) { result('Nothing of that kind is selected.'); return; }
                    // The editor's own path first: it pushes history, keeps the rest of the
                    // selection intact, tidies the selection panel and rescales. Duplicating
                    // any of that here would be a second version of it to keep right.
                    const hadLasso = lassoOf(k.kind).length > 0;
                    if (hadLasso && typeof graph.removeSelectedByKind === 'function') {
                        try { graph.removeSelectedByKind(k.kind); } catch (e) { }
                    }
                    // Compounds can also be held in the OTHER store, which that method does not
                    // know about, so anything still on a track is removed here.
                    if (a.kind === 'compounds') {
                        const left = new Set();
                        for (const s of (graph.selectedCompounds || [])) { if (s && s.o) left.add(s.o); }
                        if (left.size) {
                            if (!hadLasso) { try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { } }
                            for (const t of tracks()) {
                                if (!t.oligos) continue;
                                t.oligos = t.oligos.filter((o) => !left.has(o));
                            }
                            try { graph.setSelectedCompounds([]); } catch (e) { }
                            try { if (graph.rescale) graph.rescale(); } catch (e) { }
                        }
                    }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    const after = selCountOf(a.kind);
                    const n = before - after;
                    result('Removed ' + n + ' selected ' + k.noun + (n === 1 ? '' : 's')
                        + '. Undo restores ' + (n === 1 ? 'it' : 'them') + '.');
                },
                preview: (a) => {
                    const k = SEL_KINDS[a.kind];
                    const n = selCountOf(a.kind);
                    return 'delete the ' + n + ' selected ' + (k ? (k.noun + (n === 1 ? '' : 's')) : a.kind);
                },
                argBlocker: (a) => (selCountOf(a.kind)
                    ? ''
                    : ('nothing of that kind is selected: pick some on the canvas first, or describe '
                        + 'them instead and they can be removed by filter'))
            },
            {
                name: 'clear_compound_selection',
                summary: 'Deselect every compound. Does not touch a selected sequence range.',
                needs: 'compounds', params: {},
                run: () => {
                    try { graph.deselectAllCompounds(); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result('Compound selection cleared.');
                }
            },

            {
                name: 'export_compounds',
                summary: 'Write the compounds to a file and download it: IDT order codes, the design '
                    + 'table as CSV, or plain FASTA sequences. Exports the SELECTED compounds when any '
                    + 'are selected, otherwise all of them.',
                needs: 'compounds',
                params: {
                    format: {
                        type: 'enum', values: ['idt', 'csv', 'fasta'], required: true,
                        about: 'idt: IDT order codes, one row per compound with its plate well, for '
                            + 'ordering synthesis. csv: the design table -- sequence, chemistry, score, '
                            + 'GC, Tm, off-target counts, flags. fasta: sequences only'
                    },
                    scope: {
                        type: 'enum', values: ['selected', 'all'],
                        about: 'omit to export the selection when there is one and everything when '
                            + 'there is not, which is what a bare "export the compounds" means'
                    }
                },
                count: (a) => {
                    const sel = selectedCompoundSet();
                    const useSel = (a.scope === 'selected') || (a.scope !== 'all' && sel.size > 0);
                    return useSel ? sel.size : crows().length;
                },
                run: async (a) => {
                    let r = null;
                    try { r = await exec('baja/manchester/menu/export-compounds.js', graph, a); }
                    catch (e) { result('Could not export: ' + (e && e.message ? e.message : e)); return; }
                    // THE SKIPPED ONES ARE NAMED. An order file short by sixteen rows and
                    // saying nothing is the failure this exists to prevent -- and so is
                    // "Nothing was exported." with no reason, which is what came back when
                    // EVERY compound failed, because the reasons were only read on the path
                    // where something had been written. The reasons are read first now, and
                    // the all-failed case is the one that most needs them.
                    const why = Object.keys(r && r.reasons || {})
                        .map((k) => r.reasons[k] + ' ' + k).join('; ');
                    if (!r || !r.wrote) {
                        result('Nothing was exported'
                            + (why ? (': ' + why + '.') : (r && r.note ? (': ' + r.note) : '.')));
                        return;
                    }
                    result('Wrote ' + r.wrote + ' compound' + (r.wrote === 1 ? '' : 's') + ' to ' + r.file
                        + (r.skipped ? ('. ' + r.skipped + ' left out: ' + why + '.') : '.'));
                },
                preview: (a) => {
                    const sel = selectedCompoundSet();
                    const useSel = (a.scope === 'selected') || (a.scope !== 'all' && sel.size > 0);
                    const n = useSel ? sel.size : crows().length;
                    const F2 = { idt: 'IDT order codes', csv: 'the design table as CSV', fasta: 'FASTA sequences' };
                    return 'export ' + n + ' ' + (useSel ? 'selected ' : '') + 'compound'
                        + (n === 1 ? '' : 's') + ' as ' + (F2[a.format] || a.format);
                },
                argBlocker: (a) => {
                    const sel = selectedCompoundSet();
                    if ((a.scope === 'selected') && !sel.size) return 'no compounds are selected';
                    return '';
                }
            },

            {
                name: 'show_compound_locations',
                summary: 'HIGHLIGHT THE COMPOUNDS / show where they are: marks each one with a down '
                    + 'arrow over the track, so they can be seen at a view too wide to show the '
                    + 'compounds themselves. This is what "highlight compounds", "highlight all '
                    + 'compounds", "where are the compounds", "show me where the compounds are on the '
                    + 'transcript", "show me the locations" and "where do these sit" all mean. Marks '
                    + 'the selected ones when any are selected, unless the request asks for all.',
                needs: 'compounds',
                params: {
                    scope: {
                        type: 'enum', values: ['selected', 'all'],
                        about: 'use all when the request says all, every, the whole track or the whole '
                            + 'transcript -- "highlight all compounds", "where are all the compounds on '
                            + 'the transcript" -- which means every compound even when some are '
                            + 'selected. Use selected for "these" or "the selected ones". Omit to mark '
                            + 'the selection when there is one and everything otherwise'
                    },
                    clear: { type: 'boolean', about: 'true to take the arrows off again' }
                },
                count: (a) => {
                    if (a.clear) return null;
                    const sel = selectedCompoundSet();
                    const useSel = (a.scope === 'selected') || (a.scope !== 'all' && sel.size > 0);
                    return useSel ? sel.size : crows().length;
                },
                run: async (a) => {
                    let r = null;
                    try { r = await exec('baja/manchester/menu/mark-compound-locations.js', graph, a); }
                    catch (e) { result('Could not mark them: ' + (e && e.message ? e.message : e)); return; }
                    if (a.clear) { result('Took off ' + ((r && r.cleared) || 0) + ' marker' + (((r && r.cleared) || 0) === 1 ? '' : 's') + '.'); return; }
                    if (!r || !r.marked) {
                        result('Nothing was marked'
                            + (r && r.noPosition ? (': ' + r.noPosition + ' compounds have no position on the track.') : '.'));
                        return;
                    }
                    // WHEN IT MARKED ONLY THE SELECTION, SAY SO. With 85 of 210 compounds
                    // selected, "highlight compounds" marks 85 and a bare count reads as though
                    // that were all of them. The line now says which it did and how to get the rest.
                    const sel = selectedCompoundSet();
                    const usedSel = (a.scope === 'selected') || (a.scope !== 'all' && sel.size > 0);
                    const total = crows().length;
                    result('Marked ' + r.marked + (usedSel ? ' selected' : '') + ' compound'
                        + (r.marked === 1 ? '' : 's') + ' on '
                        + r.tracks + ' track' + (r.tracks === 1 ? '' : 's')
                        + (r.noPosition ? ('. ' + r.noPosition + ' have no position and could not be placed.') : '.')
                        + ((usedSel && total > r.marked)
                            ? (' ' + total + ' compounds in all \u2014 say \u201chighlight all compounds\u201d for every one.')
                            : ''));
                },
                preview: (a) => {
                    if (a.clear) return 'take the compound location arrows off';
                    const sel = selectedCompoundSet();
                    const useSel = (a.scope === 'selected') || (a.scope !== 'all' && sel.size > 0);
                    const n = useSel ? sel.size : crows().length;
                    return 'mark where ' + n + ' ' + (useSel ? 'selected ' : '') + 'compound'
                        + (n === 1 ? '' : 's') + ' sit, with an arrow over the track';
                }
            },

            // ---------------------------------------------------------------- the view -----
            {
                name: 'zoom_selection',
                summary: 'Frame whatever is currently selected.',
                needs: 'selection', params: {},
                run: async () => { try { await graph.zoomToSelection(); } catch (e) { } result('Framed the selection.'); }
            },
            {
                name: 'zoom_to_track',
                summary: 'Frame one track by name, filling the view with it.',
                needs: 'track',
                params: {
                    track: {
                        type: 'string', required: true,
                        about: 'the track name, or enough of it to pick it out. Use the names given '
                            + 'in canvas_now'
                    }
                },
                // Resolved here rather than in the prompt: a name that matches nothing, or
                // matches two tracks, is a thing to say before the button is pressed.
                run: (a) => {
                    const t = matchTrack(a.track);
                    if (!t) { result('No single track matches “' + a.track + '”.'); return; }
                    return graph.zoomToTrack(t, 0.05);
                },
                preview: (a) => {
                    const t = matchTrack(a.track);
                    return t ? ('frame ' + (t.name || 'that track')) : ('frame the track “' + a.track + '”');
                },
                argBlocker: (a) => matchTrack(a.track) ? ''
                    : ('no single track matches “' + a.track + '”: open tracks are '
                        + tracks().map((t) => t.name || '(unnamed)').join(', '))
            },
            {
                name: 'fit',
                summary: 'Zoom out until EVERY track is in view. Use this for "fit", "show '
                    + 'everything", "see all the tracks". For a step of zoom from where the '
                    + 'view is now, use zoom.',
                params: {},
                run: async () => { try { await graph.viewAllTracks(); } catch (e) { } result('Zoomed out to every track.'); }
            },

            {
                // "ZOOM OUT" IS NOT "FIT". The editor had fit, zoom to a track, zoom to the
                // selection and zoom to the variants, and no way to simply pull back a bit
                // from where you are -- so "zoom out" was answered with "the editor has fit
                // to show all tracks, but no general zoom out control", which is an accurate
                // description of a gap rather than an answer. Fit jumps to everything; a
                // step keeps your place and changes how much of it you see, and those are
                // different things to want.
                name: 'zoom',
                summary: 'ZOOM IN OR OUT A STEP FROM WHERE THE VIEW IS NOW, keeping the middle '
                    + 'of the screen where it is. This is the answer to "zoom out", "zoom in", '
                    + '"zoom out a bit", "pull back", "zoom in more", "closer". For showing '
                    + 'every track at once use fit; for a particular track, selection or '
                    + 'position use zoom_to_track, zoom_selection or go_to_position.',
                params: {
                    direction: {
                        type: 'enum', values: ['out', 'in'], default: 'out',
                        about: 'out to see more, in to see less and larger'
                    },
                    amount: {
                        type: 'number', default: 2,
                        about: 'how many times more or less to show. 2 is a normal step; use 4 '
                            + 'or 8 only when the request says "a lot" or "way out"'
                    }
                },
                run: async (a) => {
                    const g = graph.grid;
                    if (!g || typeof g.getxmin !== 'function' || !graph.zoomRect) {
                        result('This view cannot be zoomed.');
                        return;
                    }
                    const out = (('' + ((a && a.direction) || 'out')).toLowerCase() !== 'in');
                    let k = Number((a && a.amount) || 2);
                    if (!isFinite(k) || k <= 0) k = 2;
                    k = Math.min(Math.max(k, 1.1), 50);
                    const f = out ? k : (1 / k);
                    const x0 = g.getxmin(), x1 = g.getxmax();
                    const y0 = g.getymin(), y1 = g.getymax();
                    if (![x0, x1, y0, y1].every((v) => isFinite(v))) {
                        result('This view cannot be zoomed.');
                        return;
                    }
                    // ABOUT THE MIDDLE OF THE SCREEN. Zooming from a corner walks the view
                    // sideways with every step, which is how a few zoom-outs end up looking
                    // at nothing.
                    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
                    const hw = Math.abs(x1 - x0) / 2 * f, hh = Math.abs(y1 - y0) / 2 * f;
                    try {
                        await graph.zoomRect(cx - hw, cx + hw, cy - hh, cy + hh, 20);
                    } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    result('Zoomed ' + (out ? 'out' : 'in') + ' \u00d7' + k + '.');
                },
                preview: (a) => {
                    const out = (('' + ((a && a.direction) || 'out')).toLowerCase() !== 'in');
                    let k = Number((a && a.amount) || 2);
                    if (!isFinite(k) || k <= 0) k = 2;
                    return 'zoom ' + (out ? 'out' : 'in') + ' \u00d7' + k
                        + ', keeping the middle of the view where it is';
                }
            },

            // SPLICE A TRACK INTO AN mRNA. The track menu has offered this for a while
            // ("Convert to mRNA", in baja/manchester/menu/mouse-over-highlight.js); the box
            // could not, so "create mRNA track from DNM3" came back as not something the
            // editor can do. That was true as written: the planner is handed this file as its
            // whole vocabulary, so an operation absent from here is unreachable however
            // plainly it is asked for.
            //
            // THE PRECONDITIONS ARE THE MENU'S, not new ones. The menu answers them by not
            // drawing the item at all; argBlocker has to say them out loud instead, because
            // by then someone has already asked.
            //
            // The menu keeps its own copy of this logic rather than both calling one
            // function. Copied here deliberately rather than refactoring the menu from the
            // Ask box: these two will drift, and the right fix is one function both call.
            {
                name: 'convert_to_mrna',
                summary: 'Build a spliced mRNA track from a gene track that has introns, '
                    + 'carrying its variants, compounds and plots across. Use this for '
                    + '"make an mRNA from X", "splice X", "create an mRNA track from X".',
                needs: 'track',
                params: {
                    track: {
                        type: 'string', required: false,
                        about: 'the track name, or enough of it to pick it out. Use the names '
                            + 'given in canvas_now. Leave it out to use the selected track.'
                    }
                },
                run: (a) => {
                    const st = a.track ? matchTrack(a.track) : oneTrack();
                    if (!st) { result('No single track matches “' + (a.track || '') + '”.'); return; }
                    if (!st.sequence) { result('No sequence on ' + (st.name || 'that track') + ' to splice into mRNA.'); return; }
                    let track;
                    try { track = st.createTrackFromAnnotation('CDNA'); }
                    catch (e) { result('Could not build mRNA: ' + (e && e.message ? e.message : e)); return; }
                    if (!track) { result('Could not build the mRNA track.'); return; }
                    // Carried across exactly as the menu does it, each guarded on its own so a
                    // track with no compounds still gets its variants.
                    try { if (st.snpindels && st.snpindels.length > 0) { track.liftSnpindels(); track.targetPhase = st.targetPhase; } } catch (e) { }
                    try { if (st.oligos && st.oligos.length > 0) track.liftCompounds(); } catch (e) { }
                    try { if (st.plots && st.plots.length > 0) track.liftPlots(); } catch (e) { }
                    graph.track.push(graph.ensureUniqueTrackName ? graph.ensureUniqueTrackName(track) : track);
                    try { graph.deselectAllTracks(); } catch (e) { }
                    try { track.select(); } catch (e) { }
                    // grid || tgraph. createTrackFromAnnotation builds a track carrying a GRID
                    // (baja/bio/track-flexi.js), so reading .tgraph alone threw straight into
                    // the catch and the new track was created off screen with nothing said.
                    // The menu learned that the hard way; the same rule holds here.
                    try {
                        const ax = track.grid || track.tgraph;
                        if (ax) graph.animateTo(ax.xi - 100, ax.xi + ax.width + 100, ax.Y(-3), ax.Y(3));
                    } catch (e) { }
                    result('Created ' + (track.name || 'an mRNA track') + ' from ' + (st.name || 'track') + '.');
                },
                preview: (a) => {
                    const st = a.track ? matchTrack(a.track) : oneTrack();
                    return st ? ('splice ' + (st.name || 'that track') + ' into an mRNA track')
                              : ('splice the track “' + (a.track || '') + '” into an mRNA track');
                },
                argBlocker: (a) => {
                    const st = a.track ? matchTrack(a.track) : oneTrack();
                    if (!st) {
                        return a.track
                            ? ('no single track matches “' + a.track + '”: open tracks are '
                                + tracks().map((t) => t.name || '(unnamed)').join(', '))
                            : 'no single track is selected, so there is nothing to splice';
                    }
                    if (st.track_type === 'CDNA') return (st.name || 'that track') + ' is already an mRNA';
                    try {
                        if (!(st.containsIntrons && st.containsIntrons())) {
                            return (st.name || 'that track') + ' has no introns, so an mRNA of it would be a copy of it';
                        }
                    } catch (e) { }
                    if (!st.sequence) return (st.name || 'that track') + ' has no sequence to splice';
                    return '';
                }
            },

            // ---------------------------------------------------------------- answering ----
            {
                name: 'ask_variants',
                summary: 'ANSWER A QUESTION about the variants currently on screen, rather than '
                    + 'changing anything: whether any are pathogenic, which hit a splice site, what '
                    + 'they are. Use this whenever the request asks to be TOLD something.',
                needs: 'variants', answers: true,
                params: {
                    query: {
                        type: 'string',
                        about: 'optional terms narrowing which visible variants the question covers. '
                            + 'Empty, the usual case, means every variant on screen'
                    }
                }
            }
        ];

        // remove_compounds takes exactly the filter select_compounds takes. Shared rather
        // than copied: two filter vocabularies that drift apart would mean a request the
        // editor can select by and cannot remove by, for no reason a user could see.
        LIST.find((c) => c.name === 'remove_compounds').params =
            LIST.find((c) => c.name === 'select_compounds').params;

        const byName = (n) => LIST.find((c) => c.name === n) || null;

        // --------------------------------------------------------------------- validate ----
        const coerce = (spec, v) => {
            const T = spec.type;
            if (T === 'number') {
                if (v === '' || v == null) return { skip: true };
                const n = +v;
                return Number.isFinite(n) ? { value: n } : { bad: 'not a number' };
            }
            if (T === 'boolean') return { value: v === true || v === 'true' };
            if (T === 'string') {
                if (v == null) return { skip: true };
                return { value: ('' + v).slice(0, 300) };
            }
            if (T === 'string[]') {
                const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
                const out = arr.map((x) => ('' + x).trim()).filter(Boolean).slice(0, 20);
                return out.length ? { value: out } : { skip: true };
            }
            if (T === 'enum') {
                const s = ('' + (v == null ? '' : v)).trim().toLowerCase();
                if (!s) return { skip: true };
                const hit = (spec.values || []).find((x) => ('' + x).toLowerCase() === s);
                return hit ? { value: hit } : { bad: '“' + v + '” is not one of ' + (spec.values || []).join(', ') };
            }
            if (T === 'enum[]') {
                const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
                const out = [], bad = [];
                for (const x of arr) {
                    const s = ('' + x).trim().toLowerCase();
                    if (!s) continue;
                    const hit = (spec.values || []).find((y) => ('' + y).toLowerCase() === s);
                    if (hit) { if (out.indexOf(hit) < 0) out.push(hit); } else bad.push(x);
                }
                if (bad.length) return { bad: bad.join(', ') + ' not among ' + (spec.values || []).join(', ') };
                return out.length ? { value: out } : { skip: true };
            }
            return { bad: 'unknown parameter type' };
        };

        // A step is { capability, args }. Returns the capability and the arguments that will
        // actually be used, or a problem saying why not. A BAD ARGUMENT IS A REFUSAL, NOT A
        // SUBSTITUTION: silently dropping an unrecognised db and loading ClinVar instead
        // would do something the user did not ask for and tell them it was what they asked.
        const validate = (step) => {
            const name = ('' + ((step && step.capability) || '')).trim();
            const c = byName(name);
            if (!c) return { ok: false, problem: 'no such operation: ' + (name || '(none)') };
            const specs = c.params || {};
            const raw = (step && step.args && typeof step.args === 'object') ? step.args : {};
            const args = {};
            const dropped = [];
            for (const k of Object.keys(raw)) {
                if (!specs[k]) { dropped.push(k); continue; }
                const r = coerce(specs[k], raw[k]);
                if (r.bad) return { ok: false, capability: c, problem: k + ': ' + r.bad };
                if (!r.skip) args[k] = r.value;
            }
            for (const k of Object.keys(specs)) {
                if (specs[k].required && args[k] == null) {
                    // A MISSING ARGUMENT IS A QUESTION, NOT A DEAD END. Refusing is right --
                    // nothing above may substitute a value the user did not give -- but the
                    // refusal knows precisely what it needs and, for an enum, every answer
                    // that would be accepted. "add pathologic mutations to selected sequence"
                    // is load_variants without a db: one word short of runnable, and the four
                    // words that would complete it are right here. They travel with the
                    // refusal so the card can offer them; offering is not substituting, and
                    // the value is still the user's to pick.
                    return {
                        ok: false, capability: c,
                        problem: 'needs ' + k + ' and none was given',
                        missing: k,
                        missingValues: (specs[k].type === 'enum' && Array.isArray(specs[k].values))
                            ? specs[k].values.slice() : null,
                        missingAbout: specs[k].about || ''
                    };
                }
                if (args[k] == null && specs[k].default != null) args[k] = specs[k].default;
            }
            return { ok: true, capability: c, args: args, dropped: dropped };
        };

        // What is missing on this canvas for a capability to mean anything, or '' when it can
        // run. Checked at preview time rather than at run time so the user is told before
        // they press the button, not after.
        const blocker = (c) => {
            if (!c) return '';
            if (c.needs === 'track' && !tracks().length) return 'no track is loaded';
            // 'selection' is a model or a scan, which runs on ONE marked stretch. 'any_selection'
            // only needs a mark to exist: clearing every selection across three tracks is not
            // ambiguous the way running SpliceNet on three of them would be.
            if (c.needs === 'selection') {
                if (!selTracks().length) return 'no sequence is selected: drag across a track first';
                if (!oneSelTrack()) return 'more than one track has a selection: this runs on one';
            }
            if (c.needs === 'any_selection' && !selTracks().length) return 'no sequence is selected';
            if (c.needs === 'variants' && !vrows().length) return 'there are no variants on the tracks';
            if (c.needs === 'compounds' && !crows().length) return 'there are no compounds on the tracks';
            return '';
        };

        const preview = (step) => {
            const v = validate(step);
            if (!v.ok) {
                return {
                    ok: false, text: v.problem, capability: v.capability || null,
                    missing: v.missing || null, missingValues: v.missingValues || null,
                    missingAbout: v.missingAbout || ''
                };
            }
            const c = v.capability;
            // Which tracks this step could run on, when it names none. One: it simply runs
            // there. Several: the card offers a Go for each rather than guessing.
            let choices = [];
            try { choices = c.choices ? (c.choices(v.args) || []) : []; } catch (e) { choices = []; }
            if (choices.length === 1) { v.args = choices[0].args; choices = []; }
            let text;
            try { text = c.preview ? c.preview(v.args) : c.summary.split('.')[0].toLowerCase(); }
            catch (e) { text = c.summary.split('.')[0].toLowerCase(); }
            let n = null;
            try { n = c.count ? c.count(v.args) : null; } catch (e) { n = null; }
            // A capability may also refuse on its arguments rather than on the canvas: a
            // track name matching nothing, or matching two tracks, is known here and is
            // worth saying before the button rather than after it.
            let b = blocker(c);
            if (!b && c.argBlocker) { try { b = c.argBlocker(v.args) || ''; } catch (e) { b = ''; } }
            return {
                ok: true, capability: c, args: v.args, text: text, count: n,
                blocker: b, destructive: !!c.destructive,
                opens: !!c.opens, answers: !!c.answers,
                choices: choices.length > 1 ? choices : null,
                choiceTitle: (choices.length > 1 && c.choiceTitle) ? c.choiceTitle(v.args, choices) : null,
                // WHAT TO OFFER WHEN IT CANNOT RUN. A capability that has somewhere for the
                // user to go when it is stuck says so here, and the card puts it beside
                // Cancel rather than leaving a refusal as the whole answer.
                whenStuck: c.whenStuck || null
            };
        };

        // The catalogue as it goes to the model: the declarations only, never the functions.
        const catalogue = () => LIST.map((c) => {
            const o = { name: c.name, summary: c.summary };
            if (c.needs) o.needs = c.needs;
            if (c.destructive) o.destructive = true;
            if (c.answers) o.answers_a_question = true;
            const specs = c.params || {};
            const ks = Object.keys(specs);
            if (ks.length) {
                o.params = {};
                for (const k of ks) {
                    const s = specs[k], d = { type: s.type };
                    if (s.values) d.values = s.values;
                    if (s.required) d.required = true;
                    if (s.about) d.about = s.about;
                    o.params[k] = d;
                }
            }
            return o;
        });

        // What regions each track actually has, for the request context: a model asked to
        // select exon 5 should know whether there are five, and that a non-coding track has
        // no UTRs to name.
        const regionInfo = (t) => {
            const R = regionsNow(t);
            if (!R) return null;
            try { return R.available(); } catch (e) { return null; }
        };

        // WHAT THE EDITOR ITSELF THINKS A REQUEST IS ABOUT, without asking anything.
        //
        // The planner is a server call and it can fail: the service can be down, the request
        // can time out, or the model can decline it -- "add pathological mutations in the
        // selected sequence" was read as a request to create something harmful, when in this
        // editor it is load_variants over a selection, which is what a genome browser does.
        // A failure there left the ask box with nothing but the error.
        //
        // This is deliberately dumb: words shared with an operation's own name and summary,
        // with the handful of synonyms that differ between how people say a thing and how
        // the catalogue spells it. It does not run anything and it does not guess arguments.
        // It offers the operation, and the user picks -- which is the honest thing to do
        // with a guess, and leaves them somewhere rather than nowhere.
        // SINGULAR AND PLURAL ARE THE SAME WORD. "snps" means variant, the operation is
        // called load_variants, and matching the two strings as written scored the word
        // against clear_variant_selection -- whose name happens to use the singular -- three
        // times higher than against the operation that loads them. Both sides are stemmed,
        // so the catalogue's spelling and the user's cannot disagree about a plural.
        const stem = (w) => (w.length > 3 && w.charAt(w.length - 1) === 's'
            && w.charAt(w.length - 2) !== 's') ? w.slice(0, -1) : w;
        const SUGGEST_ALSO = {
            mutation: 'variant', snp: 'variant', polymorphism: 'variant',
            pathology: 'pathogenic', pathological: 'pathogenic', pathogenic: 'clinvar',
            deleterious: 'pathogenic', damaging: 'pathogenic', disease: 'clinvar',
            clinical: 'clinvar', exon: 'exons', protein: 'translation',
            domain: 'domains', skipping: 'skip', conserved: 'conservation'
        };
        // THE ONE REQUEST THE EDITOR ADVERTISES, PLANNED WITHOUT ASKING ANYTHING.
        //
        // The bar above the ask box offers "load clinvar pathogenic snps" in those words. An
        // editor that cannot carry out its own advertised phrase when the planner is down --
        // or declines it, which is what happened to "add pathology snps to selected
        // sequence" -- is advertising something it will not do.
        //
        // Deliberately narrow, and built out of the catalogue's own declared values rather
        // than a second table that could drift from them: a database named in the request,
        // the clinical words beside it, the variant classes. It fires only when the request
        // names a variant DATABASE or a clinical SIGNIFICANCE, so an unrelated sentence that
        // happens to share a word gets the suggestion list instead of a plan. Everything
        // else stays the planner's job, where a model reading a whole sentence belongs.
        const localPlan = (text) => {
            const raw = ('' + (text || '')).toLowerCase();
            if (!raw) return null;
            const spec = (LIST.find((c) => c.name === 'load_variants') || {}).params || {};
            const has = (w) => new RegExp('(^|[^a-z])' + w + '[a-z]*([^a-z]|$)').test(raw);
            const db = (spec.db && spec.db.values || []).find((v) => has(v));
            // The words people use for the ClinVar classes, mapped onto the enum the
            // operation declares. Only the ones the operation will accept are kept.
            const SIG = { pathogenic: 'pathogenic', pathology: 'pathogenic', pathological: 'pathogenic',
                deleterious: 'pathogenic', damaging: 'pathogenic', benign: 'benign',
                uncertain: 'uncertain', vus: 'uncertain', conflicting: 'conflicting' };
            const allowed = (spec.clinsig_any && spec.clinsig_any.values) || [];
            const sig = [];
            for (const w of Object.keys(SIG)) {
                if (has(w) && allowed.indexOf(SIG[w]) >= 0 && sig.indexOf(SIG[w]) < 0) sig.push(SIG[w]);
            }
            if (!db && !sig.length) return null;
            // Asking to PUT them on the track, not to clear, remove or count them. Without a
            // verb of that kind this is a sentence about variants, not a request to load any.
            if (!/\b(add|load|put|show|draw|fetch|get|bring|import|annotate|mark)\b/.test(raw)) return null;
            if (/\b(remove|clear|delete|drop|hide|unload)\b/.test(raw)) return null;
            const args = { db: db || 'clinvar' };
            if (sig.length) {
                args.clinsig_any = sig;
                // ClinVar's conflicting-interpretation string contains the word "pathogenic",
                // so asking for pathogenic without this gets the conflicting ones too. The
                // operation's own params say exactly this; it is applied here rather than
                // left for the user to discover from the card.
                if (sig.indexOf('pathogenic') >= 0 && sig.indexOf('conflicting') < 0) args.clinsig_not = ['conflicting'];
            }
            const types = [];
            if (/\bsnp|\bsnv|substitution/.test(raw)) types.push('snp');
            if (/\bindel|insertion/.test(raw)) types.push('ins');
            if (/\bindel|deletion/.test(raw)) types.push('del');
            if (types.length && !/\ball\b/.test(raw)) args.types = types;
            return { capability: 'load_variants', args: args };
        };

        const suggest = (text, limit) => {
            const words = ('' + (text || '')).toLowerCase().match(/[a-z0-9']+/g) || [];
            if (!words.length) return [];
            // THE LEADING VERB STEERS, IT DOES NOT IDENTIFY. It is used below to rank
            // loaders above removers and questions above both; counting it as a word as well
            // put add_variant_from_description, whose name begins with the verb, above
            // load_variants for "add pathology snps to selected sequence" -- a request that
            // names no change to add. Which operation it is comes from the nouns.
            const VERB = /^(add|load|put|get|fetch|show|draw|bring|import|remove|clear|delete|hide|find|make|create|open|run)$/;
            const want = new Set();
            for (const raw of words) {
                if (raw.length < 3) continue;
                if (raw === words[0] && VERB.test(raw)) continue;
                const w = stem(raw);
                want.add(w);
                // The synonym table is keyed on the stem, and what it gives back is stemmed
                // too: one more place a plural could divide a word from itself.
                const also = SUGGEST_ALSO[w] || SUGGEST_ALSO[raw];
                if (also) want.add(stem(also));
            }
            // A RARE WORD IS WORTH MORE THAN A COMMON ONE. Counting shared words alone put
            // clear_sequence_selection level with load_variants for "add pathological
            // mutations in selected sequence", because "sequence" and "selected" are in half
            // the catalogue while "pathogenic" is in one operation. Each word is worth how
            // few operations use it, which is what makes it a clue at all.
            const bag = [];
            for (const c of LIST) {
                bag.push({
                    c: c,
                    name: new Set((('' + (c.name || '')).toLowerCase().match(/[a-z0-9']+/g) || []).map(stem)),
                    all: new Set(((((c.name || '') + ' ' + (c.summary || '')).toLowerCase().match(/[a-z0-9']+/g) || []).map(stem)))
                });
            }
            const weight = (w) => {
                let k = 0;
                for (const b of bag) if (b.all.has(w)) k++;
                return k ? Math.log(1 + (bag.length / k)) : 0;
            };
            const scored = [];
            for (const b of bag) {
                let n = 0;
                for (const w of want) {
                    if (!b.all.has(w)) continue;
                    // A name hit counts twice: a word in the operation's own name is what it
                    // is called, not something its description happens to mention.
                    n += weight(w) * (b.name.has(w) ? 3 : 1);
                }
                // THE VERB SAYS WHAT KIND OF OPERATION IT IS. "add pathological mutations"
                // and "are any of these pathogenic" share almost every noun and want
                // different operations: one puts something on the track, the other reads
                // what is already there. Asking for a thing to appear favours the loaders;
                // asking a question favours the ones that answer one.
                if (/^(add|load|put|get|fetch|show|draw|bring|import)$/.test(words[0] || '')) {
                    if (/^(load|add|create|draw)_/.test('' + b.c.name)) n *= 1.25;
                    // AND THE OPPOSITE OPERATION IS NOT THE ANSWER. "add pathology snps to
                    // selected sequence" scored clear_variant_selection above load_variants
                    // on shared nouns alone: both are about variants and selections, and only
                    // the verb says which way round. Asking for something to appear is a
                    // reason to rank taking it away BELOW, not merely not above.
                    if (/^(clear|remove|delete|hide|unload|drop)_/.test('' + b.c.name)) n *= 0.4;
                }
                if (/^(are|is|which|what|how|do|does|why)$/.test(words[0] || '')
                    && /^(ask|find|check|list)/.test('' + b.c.name)) n *= 1.25;
                if (n > 0) scored.push({ name: b.c.name, summary: b.c.summary, score: Math.round(n * 100) / 100 });
            }
            scored.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));
            // A single shared word is a coincidence, not a suggestion, once anything scores
            // better: keep what is within reach of the best and drop the long tail.
            const best = scored.length ? scored[0].score : 0;
            return scored.filter((x) => x.score >= Math.max(1.2, best * 0.45)).slice(0, Math.max(1, limit || 3));
        };

        return {
            list: LIST, byName: byName, validate: validate, preview: preview,
            regionInfo: regionInfo, regionsOf: regionsOf, selCountOf: selCountOf,
            blocker: blocker, catalogue: catalogue, suggest: suggest, localPlan: localPlan,
            vhits: vhits, vrows: vrows, crows: crows, selectVariants: selectVariants,
            selTracks: selTracks, oneSelTrack: oneSelTrack, tracks: tracks, rangeOf: rangeOf,
            VS: VS, F: F
        };
    })();
}
