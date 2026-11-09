function (graph, oligo, hit, genegraph_panel_layout, track) {
    // PER-MONOMER CHEMISTRY EDITING. Zoomed in far enough that the polymer draws as real
    // molecules (sugar rings, phosphate groups, base letters), a click lands on ONE of them,
    // and this is the menu that then edits that one thing: the sugar at a position, the
    // linkage between two positions, the base, or a terminal conjugate.
    //
    // WHY A MENU AND NOT A DIALOG. The compound is already on screen at the zoom where its
    // chemistry is legible; the point of clicking a sugar is to change it and watch it
    // change. A modal would cover the thing being edited. Every choice here applies
    // immediately and repaints, so the drawing is the confirmation.
    //
    // WHAT IS THE SOURCE OF TRUTH. `oligo.structure` (the HELM string) is what the renderer
    // reads, so that is what gets written. The designers ALSO leave `oligo.chemistryLayout`,
    // `backbonePattern` and the wing/gap sizes on the oligo, and nothing reads those back --
    // but the design report and the IDT export do, so an edit that only touched the HELM
    // would make them disagree with the picture. They are kept in step below; where an edit
    // makes a summary field meaningless (a wing modification that is no longer uniform) the
    // field is cleared rather than left saying something that is no longer true.
    //
    // `hit` is { kind: 'monomer' | 'linkage', i } from pickChemPart() in
    // baja/chem/ui/pick-chem-part.js. `track` is the track the compound sits on, needed
    // only by Break, which has to put the second half somewhere.
    return new Promise(async (resolve) => {
        const say = (m) => { try { graph.setResultMessage(m); } catch (e) { try { graph.setMessage(m); } catch (e2) { } } };
        const fail = (m) => { try { graph.setError(m); } catch (e) { try { graph.setMessage(m); } catch (e2) { } } };
        const repaint = () => { try { if (graph.wake) graph.wake(); } catch (e) { } };

        if (!oligo || !hit) { resolve(); return; }

        // ── HELM round-trip ──────────────────────────────────────────────────────────────
        // Split the structure into the bit before the first chain body, the monomer units,
        // and everything after -- so a rebuild preserves the chain name, any second chain
        // (a CHEM conjugate) and the $$$$ trailer exactly as they were. Rebuilding the whole
        // string from scratch would quietly drop whatever this file does not model.
        const splitStructure = (structure) => {
            const s = '' + (structure || '');
            const open = s.indexOf('{');
            const close = open >= 0 ? s.indexOf('}', open) : -1;
            if (open < 0 || close < 0) return { head: 'RNA1{', body: s, tail: '}$$$$' };
            return { head: s.slice(0, open + 1), body: s.slice(open + 1, close), tail: s.slice(close) };
        };
        const parseUnits = (body) => {
            const out = [];
            for (const unit of ('' + (body || '')).split('.')) {
                const u = unit.trim();
                if (!u) continue;
                const m = u.match(/\[?([A-Za-z0-9\-]+)\]?\s*\(([^)]+)\)\s*(?:\[([^\]]+)\]|([A-Za-z0-9]+))?/);
                if (m) out.push({ sugar: ('' + (m[1] || '')).toLowerCase(), base: ('' + (m[2] || '')).toUpperCase(), linkage: ('' + (m[3] || m[4] || '')).toLowerCase() });
                else { const b = u.replace(/[^A-Za-z]/g, '').toUpperCase(); out.push({ sugar: '', base: b ? b[0] : '?', linkage: '' }); }
            }
            return out;
        };
        // A symbol is bracketed when it is longer than one character; that is the HELM rule,
        // and writing `[d](A)` or `moe(C)` instead would be re-emitting a string this app's
        // own parser only reads by luck.
        const tok = (sym) => (('' + sym).length > 1 ? '[' + sym + ']' : ('' + sym));
        const buildBody = (monos) => monos.map((m) => {
            const sug = m.sugar ? tok(m.sugar) : 'd';
            const bas = '(' + (m.base || 'N') + ')';
            return sug + bas + (m.linkage ? tok(m.linkage) : '');
        }).join('.');

        // The chemistry the renderer can actually colour and label. Offering a modification
        // the drawing cannot show would produce a bead that says nothing, which is worse than
        // not offering it.
        const SUGARS = [
            { sym: 'd', label: 'DNA (2′-H)' },
            { sym: 'r', label: 'RNA (2′-OH)' },
            { sym: 'moe', label: '2′-MOE' },
            { sym: 'm', label: '2′-OMe' },
            { sym: 'f', label: '2′-F' },
            { sym: 'lna', label: 'LNA (bridged)' },
            { sym: 'cet', label: 'cEt (bridged)' },
            { sym: 'ena', label: 'ENA (bridged)' },
        ];
        const LINKS = [
            { sym: 'sp', label: 'Phosphorothioate (PS)' },
            { sym: 'p', label: 'Phosphodiester (PO)' },
            { sym: 'rsp', label: 'PS, Rp (stereodefined)' },
            { sym: 'ssp', label: 'PS, Sp (stereodefined)' },
        ];
        const BASES = [
            { sym: 'A', label: 'A  adenine' },
            { sym: 'C', label: 'C  cytosine' },
            { sym: 'G', label: 'G  guanine' },
            { sym: 'T', label: 'T  thymine' },
            { sym: 'U', label: 'U  uracil' },
        ];

        const parts = splitStructure(oligo.structure);
        let monos = parseUnits(parts.body);
        // A gapmer whose designer never wrote linkages (py/ssaso emits sugars and bases only)
        // has a structure the renderer fills in from a default. Editing must start from what
        // is DRAWN, not from the emptier string behind it, or the first edit would silently
        // wipe the wings and backbone the user is looking at. __chemGeom.monos is exactly
        // what was drawn.
        const drawn = (oligo.__chemGeom && Array.isArray(oligo.__chemGeom.monos)) ? oligo.__chemGeom.monos : null;
        if (drawn && drawn.length && (!monos.length || monos.length !== drawn.length || monos.every((m) => !m.sugar))) {
            monos = drawn.map((m) => ({ sugar: m.sugar || 'd', base: m.base || 'N', linkage: m.linkage || '' }));
        }
        if (!monos.length) { fail(' This compound has no chemistry to edit. '); resolve(); return; }

        const N = monos.length;
        const i = Math.max(0, Math.min(N - 1, hit.i | 0));
        const isLinkage = (hit.kind === 'linkage');
        if (isLinkage && i >= N - 1) { fail(' The 3′ residue has no linkage after it. '); resolve(); return; }

        const labelOf = (list, sym) => { const f = list.find((x) => x.sym === ('' + sym).toLowerCase()); return f ? f.label : (sym || '—'); };
        const baseLabel = (b) => (b || '?');

        // Write the edited monomer array back to every field that claims to describe it.
        const commit = (note) => {
            try {
                // The CURRENT length, not the N captured when the menu opened. Break shortens
                // `monos` in place, and a stale N made the left half record a linkage after
                // its new 3' residue -- a backbone pattern one longer than the molecule.
                const n = monos.length;
                // 1) The HELM the renderer reads.
                oligo.structure = parts.head + buildBody(monos) + parts.tail;
                oligo.helm = oligo.structure;
                // 2) The per-position array the report and the exporter read. Rebuilt from
                //    the same monomer list so the two cannot drift.
                const PRETTY = { d: 'DNA', r: 'RNA', moe: "2'-MOE", m: "2'-OMe", ome: "2'-OMe", f: "2'-F", fana: "2'-F", fl2r: "2'-F", lna: 'LNA', cet: 'cEt', ena: 'ENA' };
                oligo.chemistryLayout = monos.map((m, k) => ({
                    position: k,
                    base: m.base,
                    region: (oligo.chemistryLayout && oligo.chemistryLayout[k] && oligo.chemistryLayout[k].region) || null,
                    sugar: PRETTY[m.sugar] || (m.sugar || '').toUpperCase(),
                    backbone_to_next: k < n - 1 ? ((m.linkage === 'p' || m.linkage === 'po') ? 'PO' : (m.linkage ? 'PS' : null)) : null,
                }));
                oligo.backbonePattern = monos.slice(0, n - 1).map((m) => ((m.linkage === 'p' || m.linkage === 'po') ? 'O' : 'S'));
                // 3) Summary fields that a hand edit can falsify. `wingModification` means
                //    "every wing residue is this"; once a wing is mixed it means nothing, and
                //    leaving it set would have the report state a chemistry the molecule does
                //    not have. Same for the gap bounds once the DNA run is no longer one run.
                const sugars = monos.map((m) => m.sugar);
                const dnaRun = [];
                for (let k = 0; k < n; k++) if (sugars[k] === 'd' || sugars[k] === 'dna') dnaRun.push(k);
                const contiguous = dnaRun.length > 0 && (dnaRun[dnaRun.length - 1] - dnaRun[0] + 1) === dnaRun.length;
                if (contiguous && dnaRun[0] > 0 && dnaRun[dnaRun.length - 1] < n - 1) {
                    oligo.gapStart = dnaRun[0];
                    oligo.gapEnd = dnaRun[dnaRun.length - 1];
                    oligo.gapSize = dnaRun.length;
                    oligo.leftWingSize = dnaRun[0];
                    oligo.rightWingSize = n - 1 - dnaRun[dnaRun.length - 1];
                    const wings = sugars.slice(0, dnaRun[0]).concat(sugars.slice(dnaRun[dnaRun.length - 1] + 1));
                    const uniform = wings.length && wings.every((w) => w === wings[0]);
                    oligo.wingModification = uniform ? (PRETTY[wings[0]] || wings[0]) : null;
                } else {
                    oligo.gapStart = null; oligo.gapEnd = null; oligo.gapSize = null;
                    oligo.leftWingSize = null; oligo.rightWingSize = null;
                    oligo.wingModification = null;
                }
                // 4) A hand-edited compound is no longer the thing the designer scored. The
                //    scores were computed for a chemistry that no longer exists, so keeping
                //    them next to the new one would be presenting a stale number as current.
                oligo.__chemistryEdited = true;
                if (oligo.score != null) { oligo.__scoreStale = true; }
                say(' ' + note + ' ');
            } catch (e) {
                fail(' Could not apply that change: ' + (e && e.message ? e.message : e) + ' ');
            }
            repaint();
        };

        // Cut the chain at linkage `i`: residues 0..i stay with this compound, i+1..N-1
        // become a new one on the same track. The linkage is not "removed" -- it IS the
        // bond between the two halves, so afterwards the left half simply has no linkage
        // after its last residue.
        const breakHere = async () => {
            try {
                if (i >= N - 1) { fail(' Nothing to break after the last residue. '); return; }
                const left = monos.slice(0, i + 1).map((x) => ({ sugar: x.sugar, base: x.base, linkage: x.linkage }));
                const right = monos.slice(i + 1).map((x) => ({ sugar: x.sugar, base: x.base, linkage: x.linkage }));
                left[left.length - 1].linkage = '';          // new 3' end of the left compound
                right[right.length - 1].linkage = '';        // unchanged, but say so explicitly

                const Oligo = await exec('flexigraph/oligo.js');
                const xi = +oligo.xi, xf = +oligo.xf;
                const w = (isFinite(xi) && isFinite(xf) && N > 0) ? (xf - xi) / N : 0;
                const cut = xi + (i + 1) * w;
                const seqOf = (arr) => arr.map((x) => x.base || 'N').join('');

                // The second half first, while `oligo` still describes the whole chain.
                let other = null;
                try { other = (Oligo && Oligo.copy) ? Oligo.copy(oligo) : Object.assign({}, oligo); } catch (e) { other = Object.assign({}, oligo); }
                try {
                    delete other.id;
                    other.name = ('' + (oligo.name || 'compound')) + ' (3\u2032 part)';
                    other.structure = parts.head + buildBody(right) + parts.tail;
                    other.helm = other.structure;
                    other.synthesisSequence = seqOf(right);
                    if (other.sequence != null) other.sequence = seqOf(right);
                    other.xi = cut; other.xf = xf;
                    other.selected = false; other.highlight__ = false;
                    other.__chemSel = null; other.__chemGeom = null; other.__screenBox = null;
                    // The score and the off-target result described the WHOLE chain; neither
                    // is true of a fragment, and leaving them would present a stale number
                    // as if it had been computed for this new compound.
                    other.offtarget = null; other.offtargetsRun = false;
                    other.__chemistryEdited = true;
                } catch (e) { }

                // Then shorten this one to the first half, through the usual commit so every
                // derived field is rebuilt from the monomers that are left.
                monos.length = 0;
                for (const x of left) monos.push(x);
                oligo.xf = cut;
                oligo.name = ('' + (oligo.name || 'compound')) + ' (5\u2032 part)';
                oligo.synthesisSequence = seqOf(left);
                if (oligo.sequence != null) oligo.sequence = seqOf(left);
                oligo.offtarget = null; oligo.offtargetsRun = false;
                oligo.__chemSel = null;

                const t = track || (graph && graph.selectedTrack) || null;
                let placed = false;
                try { if (t && t.addOligo) { t.addOligo(other); placed = true; } } catch (e) { }

                commit('Broke into ' + (i + 1) + ' + ' + (N - i - 1) + ' residues'
                    + (placed ? '' : ' \u2014 could not place the 3\u2032 part on a track'));
                close();
                resolve();
            } catch (e) {
                fail(' Could not break the compound: ' + (e && e.message ? e.message : e) + ' ');
            }
        };

        // ── rejoin ───────────────────────────────────────────────────────────────────────
        // Delegated to baja/chem/ui/rejoin-fragments.js so the compound menu and this menu
        // cannot drift: one implementation of what "join two fragments" means.
        let RJ = null;
        try { RJ = await exec('baja/chem/ui/rejoin-fragments.js'); } catch (e) { RJ = null; }
        const neighbours = () => {
            try { return (RJ && RJ.neighboursOf) ? RJ.neighboursOf(graph, oligo, track) : []; } catch (e) { return []; }
        };
        const rejoinWith = (other, side) => {
            if (!RJ || !RJ.rejoin) { fail(' Rejoin is unavailable. '); return; }
            const r = RJ.rejoin(graph, oligo, other, side, track);
            if (!r.ok) { fail(' Could not rejoin: ' + r.error + '. '); return; }
            // The local monomer list has to follow the molecule, or a later edit here would
            // write back the pre-join chemistry over the joined one.
            const re = parseUnits(splitStructure(oligo.structure).body);
            monos.length = 0;
            for (const x of re) monos.push(x);
            parts.head = splitStructure(oligo.structure).head;
            parts.tail = splitStructure(oligo.structure).tail;
            say(' Rejoined into ' + r.residues + ' residues (' + labelOf(LINKS, r.linkage) + ' at the join) ');
            repaint();
            close();
            resolve();
        };

        // ── menus ────────────────────────────────────────────────────────────────────────
        const show = (items) => { try { graph.showSideMenu(items); } catch (e) { } };
        const back = () => ({ label: '‹ Back', move: () => { }, click: () => openMain() });
        const close = () => { try { graph.showSideMenu(null); } catch (e) { } try { oligo.__chemSel = null; } catch (e) { } repaint(); };

        const pickFrom = (title, list, current, apply) => {
            const items = [{ label: title, move: () => { }, click: () => { } }];
            for (const o of list) {
                const on = (('' + current).toLowerCase() === o.sym.toLowerCase());
                items.push({
                    label: (on ? '✓ ' : '   ') + o.label,
                    move: () => { },
                    click: () => { apply(o); openMain(); },
                });
            }
            items.push(back());
            show(items);
        };

        // A conjugate is a second HELM chain plus a connection record, and the renderer
        // recognises it by which way round that record reads. Written the same way here so
        // the GalNAc label appears at the end the user chose.
        // ── conjugates ───────────────────────────────────────────────────────────────────
        // REAL MONOMERS FROM THE LIBRARY (baja/chem/monomers.js), not an invented symbol.
        // This used to write CHEM1{[GalNAc]}, and no monomer called "GalNAc" exists -- so
        // the structure referenced something the library could not resolve and no exporter
        // could turn it into an order. These are the GalNAc entries the library actually
        // has, with the end each is built for.
        const CONJUGATES = [
            { sym: 'TrisGN3', units: 3, site: '5', label: "GalNAc\u2083  Tris (5\u2032-glutaryl-aminohexyl)" },
            { sym: 'THAGN3', units: 3, site: '5', label: "GalNAc\u2083  THA-C6" },
            { sym: 'TAHbuGN3', units: 3, site: '5', label: "GalNAc\u2083  tris-diaminobutyl-hexyl" },
            { sym: '3GN3C10hp', units: 3, site: '3', label: "GalNAc\u2083  C10 hydroxyprolinol" },
            { sym: '3GN3C12hp', units: 3, site: '3', label: "GalNAc\u2083  C12 hydroxyprolinol (Alnylam)" },
            { sym: '3THAGNhp', units: 1, site: '3', label: "GalNAc  3\u2032-THA-C6 hydroxyprolinol" },
            { sym: 'hpC6GN3', units: 3, site: '3', label: "GalNAc\u2083  HP-C6" },
            { sym: 'hpC6GN', units: 1, site: '3', label: "GalNAc  HP-C6" },
        ];
        // How the conjugate is joined to the strand. A GalNAc cluster hangs off the
        // terminal phosphate, and whether that phosphate is thioated is a design decision
        // with real consequences for nuclease resistance -- so it is chosen, not assumed.
        const CONJ_LINKS = [
            { sym: 'sp', label: 'Phosphorothioate (PS)' },
            { sym: 'p', label: 'Phosphodiester (PO)' },
        ];

        const applyConjugate = (c, linkage) => {
            const bodyNow = buildBody(monos);
            if (!c) {
                oligo.structure = 'RNA1{' + bodyNow + '}$$$$';
                oligo.conjugate = null;
            } else {
                // The connection reads CHEM->RNA for a 5' attachment and RNA->CHEM for a 3'
                // one; that direction is what the renderer and the exporters read to know
                // which end it is on.
                const conn = (c.site === '5')
                    ? 'CHEM1,RNA1,1:R1-1:R1'
                    : 'RNA1,CHEM1,' + monos.length + ':R2-1:R1';
                oligo.structure = 'RNA1{' + bodyNow + '}|CHEM1{[' + c.sym + ']}$' + conn + '$$$';
                // Kept alongside the HELM because the attachment chemistry has nowhere to
                // live in a HELM connection record, and the drawing needs it.
                oligo.conjugate = { site: c.site, symbol: c.sym, units: c.units, linkage: linkage || 'sp', label: c.label };
            }
            oligo.helm = oligo.structure;
            // The tail now carries the connection record, so the next sugar edit must
            // rebuild around the NEW tail rather than the old $$$$.
            const re = splitStructure(oligo.structure);
            parts.head = re.head; parts.tail = re.tail;
            oligo.__chemistryEdited = true;
            say(c ? (c.label + ' at the ' + c.site + '\u2032 end, '
                + ((linkage === 'p') ? 'phosphodiester' : 'phosphorothioate') + ' linkage')
                : 'Conjugate removed.');
            repaint();
        };

        // The conjugate menu, named so a click on the GalNAc glyph itself can open it
        // directly instead of going through the part menu first.
        const openConjugate = () => {
                    const cur = oligo.conjugate || null;
                    const head = cur
                        ? (cur.label || cur.symbol) + '  \u2014 ' + cur.site + '\u2032, ' + (cur.linkage === 'p' ? 'PO' : 'PS')
                        : 'No conjugate';
                    const list = [{ label: head, move: () => { }, click: () => { } }];
                    // Changing just the attachment chemistry, without re-picking the cluster.
                    if (cur) {
                        for (const q of CONJ_LINKS) {
                            if (('' + cur.linkage) === q.sym) continue;
                            list.push({
                                label: '\u2192 ' + q.label + ' linkage', move: () => { },
                                click: () => {
                                    const c = CONJUGATES.find((x) => x.sym === cur.symbol)
                                        || { sym: cur.symbol, units: cur.units, site: cur.site, label: cur.label || cur.symbol };
                                    applyConjugate(c, q.sym); openMain();
                                },
                            });
                        }
                    }
                    for (const c of CONJUGATES) {
                        list.push({
                            label: (cur && cur.symbol === c.sym ? '\u2713 ' : '   ') + c.site + '\u2032  ' + c.label, move: () => { },
                            click: () => show([
                                { label: c.label, move: () => { }, click: () => { } },
                                { label: 'Attach at the ' + c.site + '\u2032 end with:', move: () => { }, click: () => { } },
                            ].concat(CONJ_LINKS.map((q) => ({
                                label: '  ' + q.label, move: () => { },
                                click: () => { applyConjugate(c, q.sym); openMain(); },
                            })), [back()])),
                        });
                    }
                    if (cur) list.push({ label: 'Remove conjugate', move: () => { }, click: () => { applyConjugate(null); openMain(); } });
                    list.push(back());
                    show(list);
        };

        const openMain = () => {
            const m = monos[i];
            const pos = (i + 1) + ' of ' + N;
            const items = [];
            if (isLinkage) {
                const nxt = monos[i + 1] || {};
                items.push({ label: 'Linkage ' + (i + 1) + '–' + (i + 2) + '  (' + (m.base || '?') + '→' + (nxt.base || '?') + ')', move: () => { }, click: () => { } });
                items.push({ label: '  ' + labelOf(LINKS, m.linkage), move: () => { }, click: () => { } });
                items.push({
                    label: 'Change linkage ▸', move: () => { },
                    click: () => pickFrom('Linkage ' + (i + 1) + '–' + (i + 2), LINKS, m.linkage, (o) => {
                        monos[i].linkage = o.sym; commit(o.label + ' at linkage ' + (i + 1) + '–' + (i + 2));
                    }),
                });
                // The two linkages anyone actually switches between, one click each rather
                // than through the list: a backbone edit is nearly always PS <-> PO.
                for (const q of [{ sym: 'sp', label: 'Phosphorothioate (PS)' }, { sym: 'p', label: 'Phosphodiester (PO)' }]) {
                    if (('' + m.linkage).toLowerCase() === q.sym) continue;
                    items.push({
                        label: '\u2192 ' + q.label, move: () => { },
                        click: () => { monos[i].linkage = q.sym; commit(q.label + ' at linkage ' + (i + 1) + '\u2013' + (i + 2)); openMain(); },
                    });
                }
                // BREAK THE COMPOUND AT THIS LINKAGE. A backbone bond is what holds the two
                // halves together, so "cut it" belongs on the bond's own menu. Behind a
                // confirm because it is the one action here that changes how many compounds
                // exist rather than what one of them is made of.
                items.push({
                    label: '\u2702 Break compound here \u25b8', move: () => { },
                    click: () => show([
                        { label: 'Break ' + (oligo.name || 'compound') + ' between ' + (i + 1) + ' and ' + (i + 2) + '?', move: () => { }, click: () => { } },
                        { label: '  ' + (i + 1) + ' + ' + (N - i - 1) + ' residues', move: () => { }, click: () => { } },
                        { label: 'Yes, break here', move: () => { }, click: () => { breakHere(); } },
                        back(),
                    ]),
                });
                items.push({
                    label: 'Set ALL linkages to this', move: () => { },
                    click: () => {
                        const lk = monos[i].linkage || 'sp';
                        for (let k = 0; k < N - 1; k++) monos[k].linkage = lk;
                        commit('Whole backbone set to ' + labelOf(LINKS, lk));
                    },
                });
            } else {
                items.push({ label: 'Residue ' + pos + '  —  ' + baseLabel(m.base), move: () => { }, click: () => { } });
                items.push({ label: '  sugar: ' + labelOf(SUGARS, m.sugar), move: () => { }, click: () => { } });
                items.push({
                    label: 'Change sugar ▸', move: () => { },
                    click: () => pickFrom('Sugar at residue ' + pos, SUGARS, m.sugar, (o) => {
                        monos[i].sugar = o.sym; commit(o.label + ' at residue ' + (i + 1));
                    }),
                });
                items.push({
                    label: 'Change base ▸', move: () => { },
                    click: () => pickFrom('Base at residue ' + pos, BASES, m.base, (o) => {
                        monos[i].base = o.sym;
                        // Changing a base changes what the compound binds. The sequence
                        // fields are what every downstream reader (off-target, report,
                        // synthesis) uses, so they move with it -- and the fact that it no
                        // longer matches the target is said out loud rather than left for
                        // someone to discover in a screen.
                        try {
                            const seq = monos.map((x) => x.base).join('');
                            oligo.synthesisSequence = seq;
                            if (oligo.sequence != null) oligo.sequence = seq;
                            oligo.__sequenceEdited = true;
                        } catch (e) { }
                        commit('Residue ' + (i + 1) + ' → ' + o.sym + '  — no longer complementary to the target');
                    }),
                });
            }
            // Offered whenever something abuts this compound — the inverse of Break, and
            // the only way back from it.
            const nb = neighbours();
            if (nb.length === 1) {
                const one = nb[0];
                items.push({
                    label: '⇄ Rejoin with ' + ('' + (one.other.name || 'the adjacent fragment')), move: () => { },
                    click: () => rejoinWith(one.other, one.side),
                });
            } else if (nb.length > 1) {
                items.push({
                    label: '⇄ Rejoin ▸', move: () => { },
                    click: () => show([{ label: 'Rejoin with', move: () => { }, click: () => { } }].concat(
                        nb.map((q) => ({
                            label: (q.side === '5' ? '5′  ' : '3′  ') + ('' + (q.other.name || 'fragment')),
                            move: () => { }, click: () => rejoinWith(q.other, q.side),
                        })), [back()])),
                });
            }
            items.push({
                label: 'Conjugate / termini ▸', move: () => { },
                click: () => openConjugate(),
            });
            items.push({
                label: 'Show HELM', move: () => { },
                click: () => { try { showModal({ wid: 'json', data: JSON.stringify({ structure: oligo.structure, chemistryLayout: oligo.chemistryLayout }, null, 2) }, 900, 520); } catch (e) { say(' ' + oligo.structure + ' '); } },
            });
            items.push({ label: 'Done', move: () => { }, click: () => { close(); resolve(); } });
            show(items);
        };

        // Clicking the conjugate glyph means the conjugate, so go straight there.
        if (hit.kind === 'conjugate') openConjugate(); else openMain();
    });
}
